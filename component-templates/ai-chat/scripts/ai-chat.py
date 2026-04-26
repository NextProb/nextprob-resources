#!/usr/bin/env python3
"""
AI Chat backend — multi-provider support.
Streams output to ai-stream.log for frontend polling.

Providers (set via AI_PROVIDER env var):
  claude-cli     — shells out to `claude -p` with session support (default)
  anthropic-api  — calls api.anthropic.com directly (needs ANTHROPIC_API_KEY)
  openai-compat  — calls any OpenAI-compatible endpoint (needs OPENAI_BASE_URL, OPENAI_API_KEY)

Usage:
  noteScripts.run('ai-chat.py', [JSON.stringify({ message, history, systemPrompt, context, sessionId })])

Multi-turn:
  claude-cli uses --session-id/--resume for real conversation sessions.
  anthropic-api and openai-compat use the history array (messages sent each call).
  The response includes sessionId — pass it back on subsequent calls.
"""

import json
import os
import signal
import subprocess
import sys
import uuid
import urllib.request
import urllib.error

WORKSPACE = os.environ.get("WORKSPACE_PATH", ".")
NOTE_ID = os.environ.get("NOTE_ID", "")
ITEM_PATH = os.path.join(WORKSPACE, NOTE_ID)
LOGS_DIR = os.path.join(ITEM_PATH, "scripts", "logs")
STREAM_LOG = os.path.join(LOGS_DIR, "ai-stream.log")  # default, overridden by requestId

# Provider config from env
AI_PROVIDER = os.environ.get("AI_PROVIDER", "claude-cli")
AI_MODEL = os.environ.get("AI_MODEL", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def write_stream(text, mode="a"):
    os.makedirs(os.path.dirname(STREAM_LOG), exist_ok=True)
    with open(STREAM_LOG, mode) as f:
        f.write(text)


def build_messages(payload):
    """Build a messages array from the payload."""
    messages = []
    system_prompt = payload.get("systemPrompt", "")
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    for msg in payload.get("history", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    user_message = payload.get("message", "")
    context = payload.get("context")
    if context:
        user_message = f"[Context: {json.dumps(context)}]\n\n{user_message}"
    messages.append({"role": "user", "content": user_message})
    return messages, system_prompt


def run_claude_cli(messages, system_prompt, allowed_tools=None, session_id=None, is_resume=False):
    """Run via claude CLI with stream-json output for structured events.

    Returns (reply_text, tool_calls) where tool_calls is a list of
    {name, input, output} dicts (empty when no tools were used).
    """
    # Build the prompt: on first call include system prompt + user message,
    # on resume just send the new user message (history is in the session)
    if is_resume and session_id:
        # Resuming — only send the latest user message
        prompt = messages[-1]["content"]
    else:
        # First call — include system prompt if any
        parts = []
        if system_prompt:
            parts.append(system_prompt)
        parts.append(messages[-1]["content"])
        prompt = "\n\n".join(parts)

    cmd = ["claude", "-p", "--output-format", "stream-json", "--verbose"]

    if is_resume and session_id:
        cmd += ["--resume", session_id]
    elif session_id:
        cmd += ["--session-id", session_id]

    if AI_MODEL:
        cmd += ["--model", AI_MODEL]
    if allowed_tools:
        cmd += ["--allowedTools", allowed_tools]

    # Remove CLAUDECODE env var to prevent "nested session" rejection
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)

    # Start claude in its own process group so we can kill it cleanly if
    # ai-chat.py is terminated (e.g., via noteScripts.stopByName).
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
        preexec_fn=os.setsid,
    )

    def _kill_child(signum, frame):
        """On SIGTERM, kill the entire process group (claude + any children)."""
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            pass
        sys.exit(1)

    prev_handler = signal.signal(signal.SIGTERM, _kill_child)

    try:
        proc.stdin.write(prompt)
        proc.stdin.close()

        full_text = []
        tool_calls = []

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # Plain text fallback (shouldn't happen with stream-json)
                full_text.append(line + "\n")
                write_stream(line + "\n")
                continue

            etype = event.get("type", "")

            if etype == "content_block_delta":
                text = (event.get("delta") or {}).get("text", "")
                if text:
                    full_text.append(text)
                    write_stream(text)

            elif etype == "assistant":
                blocks = (event.get("message") or {}).get("content") or []
                for block in blocks:
                    if block.get("type") == "tool_use":
                        tool_info = {
                            "name": block.get("name", ""),
                            "input": block.get("input", {}),
                        }
                        tool_calls.append(tool_info)
                        write_stream(
                            "\n__TOOL_USE__"
                            + json.dumps(tool_info, ensure_ascii=False)
                            + "\n"
                        )

            elif etype in ("tool", "tool_result"):
                content = ""
                if event.get("tool") and event["tool"].get("content"):
                    content = event["tool"]["content"]
                elif event.get("content"):
                    content = event["content"]
                output = str(content)
                if tool_calls and "output" not in tool_calls[-1]:
                    tool_calls[-1]["output"] = output
                write_stream(
                    "\n__TOOL_RESULT__"
                    + json.dumps({"output": output}, ensure_ascii=False)
                    + "\n"
                )

        proc.wait()
    finally:
        signal.signal(signal.SIGTERM, prev_handler)

    if proc.returncode != 0:
        stderr = proc.stderr.read() if proc.stderr else ""
        raise RuntimeError(f"Claude CLI failed (exit {proc.returncode}): {stderr}")

    return "".join(full_text).strip(), tool_calls


def run_anthropic_api(messages, system_prompt):
    """Call Anthropic Messages API directly."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    model = AI_MODEL or "claude-sonnet-4-20250514"

    # Anthropic API uses separate system param, not in messages
    api_messages = [m for m in messages if m["role"] != "system"]

    body = {
        "model": model,
        "max_tokens": 4096,
        "messages": api_messages,
        "stream": True,
    }
    if system_prompt:
        body["system"] = system_prompt

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )

    full_output = []
    with urllib.request.urlopen(req, timeout=120) as resp:
        buffer = ""
        for chunk in iter(lambda: resp.read(1024).decode("utf-8", errors="replace"), ""):
            buffer += chunk
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                payload_str = line[6:]
                if payload_str == "[DONE]":
                    break
                try:
                    event = json.loads(payload_str)
                    if event.get("type") == "content_block_delta":
                        text = event.get("delta", {}).get("text", "")
                        if text:
                            full_output.append(text)
                            write_stream(text)
                except json.JSONDecodeError:
                    pass

    return "".join(full_output).strip()


def run_openai_compat(messages, system_prompt):
    """Call any OpenAI-compatible /chat/completions endpoint."""
    base_url = OPENAI_BASE_URL
    if not base_url:
        raise RuntimeError("OPENAI_BASE_URL not set")

    model = AI_MODEL or "gpt-4"
    url = f"{base_url.rstrip('/')}/chat/completions"

    body = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if OPENAI_API_KEY:
        headers["Authorization"] = f"Bearer {OPENAI_API_KEY}"

    req = urllib.request.Request(url, data=data, headers=headers)

    full_output = []
    with urllib.request.urlopen(req, timeout=120) as resp:
        buffer = ""
        for chunk in iter(lambda: resp.read(1024).decode("utf-8", errors="replace"), ""):
            buffer += chunk
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                payload_str = line[6:]
                if payload_str == "[DONE]":
                    break
                try:
                    event = json.loads(payload_str)
                    delta = event.get("choices", [{}])[0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        full_output.append(text)
                        write_stream(text)
                except (json.JSONDecodeError, IndexError):
                    pass

    return "".join(full_output).strip()


PROVIDERS = {
    "claude-cli": run_claude_cli,
    "anthropic-api": run_anthropic_api,
    "openai-compat": run_openai_compat,
}


def cleanup_old_stream_logs():
    """Remove stale ai-stream-*.log files older than 5 minutes."""
    import glob as _glob
    import time
    try:
        cutoff = time.time() - 300
        for f in _glob.glob(os.path.join(LOGS_DIR, "ai-stream-*.log")):
            try:
                if os.path.getmtime(f) < cutoff:
                    os.remove(f)
            except OSError:
                pass
    except Exception:
        pass


def main():
    global STREAM_LOG

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided"}))
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        payload = {"message": sys.argv[1]}

    # Use per-request stream log to avoid conflicts between concurrent requests
    request_id = payload.get("requestId", "")
    if request_id:
        STREAM_LOG = os.path.join(LOGS_DIR, f"ai-stream-{request_id}.log")

    cleanup_old_stream_logs()

    messages, system_prompt = build_messages(payload)

    # Clear stream log and write start marker
    write_stream("__STREAMING__\n", mode="w")

    provider = payload.get("provider", AI_PROVIDER)
    run_fn = PROVIDERS.get(provider)
    if not run_fn:
        error = f"Unknown provider: {provider}. Available: {', '.join(PROVIDERS.keys())}"
        write_stream(f"__ERROR__\n{error}\n", mode="w")
        print(json.dumps({"error": error}))
        sys.exit(1)

    try:
        if provider == "claude-cli":
            allowed_tools = payload.get("allowedTools")
            session_id = payload.get("sessionId")
            is_resume = payload.get("isResume", False)

            # Generate a session ID if not provided (enables multi-turn)
            if not session_id:
                session_id = str(uuid.uuid4())

            reply, tool_calls = run_fn(
                messages, system_prompt,
                allowed_tools=allowed_tools,
                session_id=session_id,
                is_resume=is_resume,
            )

            write_stream("\n__DONE__\n")
            result = {"reply": reply, "sessionId": session_id}
            if tool_calls:
                result["toolCalls"] = tool_calls
            print(json.dumps(result))
        else:
            reply = run_fn(messages, system_prompt)
            write_stream("\n__DONE__\n")
            print(json.dumps({"reply": reply}))

    except FileNotFoundError:
        msg = "claude CLI not found. Make sure it's installed and in PATH."
        write_stream(f"__ERROR__\n{msg}\n", mode="w")
        print(json.dumps({"error": msg}))
        sys.exit(1)
    except Exception as e:
        write_stream(f"__ERROR__\n{str(e)}\n", mode="w")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
