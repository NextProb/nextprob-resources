# AI Chat Component Template

Drop-in AI chat panel for workspace items. Supports multiple providers, poll-based streaming, conversation history, and lightweight markdown rendering.

## Quick Start

### 1. Copy scripts into the item

Copy these files into `{item}/scripts/`:
- `.component-templates/ai-chat/scripts/ai-chat.py`
- `.component-templates/ai-chat/scripts/read-stream.py`

### 2. Add CSS to the item's `<style>`

Copy the contents of `.component-templates/ai-chat/chat.css` into the item's `<style>` block. You may adjust colors by redefining the CSS custom properties (see Theming below).

### 3. Add HTML structure to the item

Paste this HTML where you want the chat panel:

```html
<div class="note-chat" id="chatPanel" style="position: relative;">
  <!-- Header -->
  <div class="note-chat-header">
    <h3>AI Assistant</h3>
    <div class="note-chat-header-actions">
      <button class="note-chat-header-btn" data-chat-action="new" title="New conversation">+</button>
      <button class="note-chat-header-btn" data-chat-action="history" title="History">&#9776;</button>
      <button class="note-chat-header-btn" data-chat-action="clear" title="Clear">&#128465;</button>
    </div>
  </div>

  <!-- Messages -->
  <div class="note-chat-messages"></div>

  <!-- Input -->
  <div class="note-chat-input-area">
    <textarea class="note-chat-input" rows="1" data-no-persist></textarea>
    <button class="note-chat-send-btn" title="Send">&#9654;</button>
    <button class="note-chat-header-btn" data-chat-action="cancel" title="Cancel" style="display:none">&#9632;</button>
  </div>

  <!-- Conversation history overlay -->
  <div class="note-chat-history">
    <div class="note-chat-history-header">
      <h4>Conversations</h4>
      <button class="note-chat-header-btn" data-chat-action="history-close">&times;</button>
    </div>
    <div class="note-chat-history-list"></div>
  </div>
</div>
```

Elements you can remove if not needed:
- `data-chat-action="history"` button + `.note-chat-history` div — removes conversation history
- `data-chat-action="new"` button — removes new conversation button
- `data-chat-action="clear"` button — removes clear button
- `data-chat-action="cancel"` button — removes cancel button (auto-shown during streaming)

Elements you must keep:
- `.note-chat-messages` — message display area
- `.note-chat-input` — text input
- `.note-chat-send-btn` — send button

### 4. Add JS to the item

Copy the contents of `.component-templates/ai-chat/chat.js` into a `<script>` block, then initialize:

```html
<script>
  // ... (paste chat.js contents here) ...

  const chat = new NoteChat('#chatPanel', {
    systemPrompt: 'You are a helpful assistant.',
  });
</script>
```

### 5. Approve scripts

The user must approve `ai-chat.py` and `read-stream.py` in the app's Scripts sidebar panel before the chat will work.

## Configuration

All options passed to `new NoteChat(selector, options)`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `systemPrompt` | string | `''` | System prompt sent with every request |
| `storageKey` | string | `'note-chat-history'` | noteDB key for persisting conversations |
| `placeholder` | string | `'Type a message...'` | Input placeholder text |
| `pollInterval` | number | `500` | Milliseconds between stream polls |
| `scriptName` | string | `'ai-chat.py'` | Backend script filename |
| `streamScript` | string | `'read-stream.py'` | Stream reader script filename |
| `context` | function/object | `null` | Context sent with each message. If a function, called per-message: `() => ({ key: value })` |
| `onResponse` | function | `null` | Callback after AI responds: `(reply) => {}`. Use this to trigger side effects (e.g., reload data). |
| `provider` | string | `null` | Override provider (see Providers below). If null, uses `AI_PROVIDER` env var. |
| `allowedTools` | string | `null` | Claude CLI only. Restrict tools, e.g. `'Bash(sqlite3*)'` |
| `maxMessagesPerConv` | number | `200` | Trim oldest messages beyond this limit per conversation (prevents unbounded noteDB growth) |

## Providers

The backend script (`ai-chat.py`) supports three providers. Set via the `AI_PROVIDER` environment variable or the `provider` option.

### claude-cli (default)

Shells out to `claude -p`. No API key needed — uses the user's existing Claude CLI session.

```
AI_PROVIDER=claude-cli
AI_MODEL=sonnet          # optional: sonnet, opus, haiku
```

Supports `allowedTools` option to restrict what tools Claude can use.

### anthropic-api

Calls the Anthropic Messages API directly. Requires `ANTHROPIC_API_KEY`.

```
AI_PROVIDER=anthropic-api
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-20250514   # optional, defaults to claude-sonnet-4-20250514
```

### openai-compat

Calls any OpenAI-compatible `/chat/completions` endpoint. Works with Ollama, vLLM, OpenRouter, LM Studio, etc.

```
AI_PROVIDER=openai-compat
OPENAI_BASE_URL=http://localhost:11434/v1    # required
OPENAI_API_KEY=...                           # optional, depends on endpoint
AI_MODEL=llama3                              # required
```

## Theming

The CSS uses custom properties with dark-theme fallback defaults. To match your item's theme, define these on `:root`:

```css
:root {
  --bg: #1c1c1e;
  --bg-secondary: #2c2c2e;
  --bg-tertiary: #3a3a3c;
  --text: #e5e5e7;
  --text-secondary: #8e8e93;
  --text-tertiary: #636366;
  --accent: #ffd60a;
  --accent-soft: rgba(255, 214, 10, 0.15);
  --border: #38383a;
  --danger: #ff453a;
}
:root[data-theme="light"] {
  --bg: #ffffff;
  --bg-secondary: #f2f2f7;
  --bg-tertiary: #e5e5ea;
  --text: #1c1c1e;
  --text-secondary: #6e6e73;
  --text-tertiary: #aeaeb2;
  --accent: #ff9500;
  --accent-soft: rgba(255, 149, 0, 0.12);
  --border: #d1d1d6;
  --danger: #ff3b30;
}
```

## Customization Examples

### Chat with context from the current item state

```js
const chat = new NoteChat('#chatPanel', {
  systemPrompt: 'You are a recipe assistant.',
  context: () => ({
    currentRecipe: document.getElementById('recipeName').textContent,
    ingredients: getIngredientsList(),
  }),
});
```

### Reload data after AI modifies the database

```js
const chat = new NoteChat('#chatPanel', {
  systemPrompt: 'You are a notes assistant. You can modify the SQLite database.',
  allowedTools: 'Bash(sqlite3*)',
  onResponse: async (reply) => {
    await loadNotesFromDB();  // your function to refresh UI from SQLite
  },
});
```

### Use a different provider per-item

```js
const chat = new NoteChat('#chatPanel', {
  systemPrompt: 'You are a local AI assistant.',
  provider: 'openai-compat',  // uses OPENAI_BASE_URL from env
});
```

## One-Shot Usage (No Chat UI)

If the item only needs AI-powered buttons (e.g., "Summarize", "Translate", "Fix grammar") without a full chat panel, skip `chat.css`, `chat.js`, and the chat HTML. Only copy the two scripts, then use this pattern:

### Setup

1. Copy `ai-chat.py` and `read-stream.py` into `{item}/scripts/`
2. Add the `aiAsk` helper function and wire buttons to it:

```js
// ---- AI one-shot helper (copy once per item) ----
async function aiAsk(prompt, opts = {}) {
  const payload = JSON.stringify({
    message: prompt,
    systemPrompt: opts.systemPrompt || '',
    history: opts.history || [],
    context: opts.context || null,
    provider: opts.provider || null,
    allowedTools: opts.allowedTools || null,
    sessionId: opts.sessionId || null,
    isResume: opts.isResume || false,
  });

  const scriptPromise = noteScripts.run('ai-chat.py', [payload]);

  // Poll for streaming updates
  let offset = 0;
  let pollTimer = null;
  if (opts.onStream) {
    pollTimer = setInterval(async () => {
      try {
        const r = await noteScripts.run('read-stream.py', [String(offset)]);
        if (r.exitCode === 0) {
          const data = JSON.parse(r.stdout);
          if (data.content && data.content.trim()) {
            opts.onStream(data.content, data.status);
          }
          offset = data.offset;
          if (data.status === 'done' || data.status === 'error') {
            clearInterval(pollTimer);
          }
        }
      } catch {}
    }, opts.pollInterval || 500);
  }

  const result = await scriptPromise;
  if (pollTimer) clearInterval(pollTimer);

  if (result.error === 'not_approved') throw new Error('Script not approved');
  if (result.exitCode !== 0) throw new Error(result.stderr || 'Script failed');

  const data = JSON.parse(result.stdout);
  if (data.error) throw new Error(data.error);
  return { reply: data.reply, sessionId: data.sessionId || null };
}

// ---- Wire buttons ----
document.getElementById('translateBtn').addEventListener('click', async () => {
  const output = document.getElementById('result');
  output.textContent = 'Translating...';
  try {
    const { reply } = await aiAsk('Translate this to French: ' + getSelectedText(), {
      systemPrompt: 'You are a translator. Return only the translation.',
      onStream: (partial) => { output.textContent = partial; },
    });
    output.textContent = reply;
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
  }
});
```

The `aiAsk` helper handles the script call, streaming poll, and error handling. Each button only needs to call `aiAsk(prompt, options)` and handle the result.

**Return value:** `aiAsk` returns `{ reply, sessionId }`. For one-shot calls you only need `reply`. For multi-turn, pass `sessionId` back on the next call (see Backend Workflows below).

### `aiAsk` options

| Option | Type | Description |
|--------|------|-------------|
| `systemPrompt` | string | System prompt for the AI |
| `context` | object | Additional context sent with the message |
| `history` | array | Previous `[{ role, content }]` messages (for multi-turn with anthropic-api/openai-compat) |
| `sessionId` | string | Claude CLI session ID (returned from previous call, for multi-turn) |
| `isResume` | boolean | Set to `true` when passing a `sessionId` to resume a session |
| `onStream` | function | Called with `(partialText, status)` during streaming. If omitted, no polling — just waits for final result. |
| `pollInterval` | number | Milliseconds between polls (default 500) |
| `provider` | string | Override provider (`'claude-cli'`, `'anthropic-api'`, `'openai-compat'`) |
| `allowedTools` | string | Claude CLI only: restrict tools |

## Multi-Turn: How It Differs by Provider

| Provider | How history works | What to pass |
|----------|---|---|
| `claude-cli` | Real sessions via `--session-id` / `--resume` — Claude manages history server-side | Pass `sessionId` + `isResume: true` on subsequent calls. No `history` needed. |
| `anthropic-api` | Stateless — full message history sent each call | Pass `history` array with all previous `[{ role, content }]` messages. No sessionId. |
| `openai-compat` | Stateless — full message history sent each call | Same as anthropic-api. |

## Backend Workflows (Multi-Step AI Pipelines)

For items that need a multi-step AI pipeline in the backend (e.g., "extract → categorize → summarize"), write a workflow script that calls `ai-chat.py` multiple times.

### How it works

1. Item's frontend calls `noteScripts.run('my-workflow.py', [input])`
2. `my-workflow.py` calls `ai-chat.py` as a subprocess for each step
3. For claude-cli: captures `sessionId` from step 1, passes it with `isResume` to step 2+
4. For API providers: builds up the `history` array across steps
5. Returns the final result as JSON to stdout

### Example workflow script

```python
#!/usr/bin/env python3
import json, subprocess, sys, os

def ai_step(message, session_id=None, is_resume=False, system_prompt="", history=None):
    """Call ai-chat.py and return { reply, sessionId }."""
    payload = {
        "message": message,
        "systemPrompt": system_prompt,
        "history": history or [],
        "sessionId": session_id,
        "isResume": is_resume,
    }
    result = subprocess.run(
        [sys.executable, "ai-chat.py", json.dumps(payload)],
        capture_output=True, text=True,
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)

input_text = sys.argv[1] if len(sys.argv) > 1 else ""

# Step 1: Extract key points
r1 = ai_step(f"Extract key points from: {input_text}",
             system_prompt="You extract key points as a bullet list.")
session_id = r1.get("sessionId")

# Step 2: Categorize (resumes the same session for claude-cli)
r2 = ai_step("Now categorize each point by topic.",
             session_id=session_id, is_resume=True)

# Step 3: Summarize
r3 = ai_step("Create a summary table from the categorized points.",
             session_id=session_id, is_resume=True)

print(json.dumps({"result": r3["reply"]}))
```

### Progress tracking

The workflow script can write progress to the stream log between steps so the frontend can show which step is running:

```python
# In the workflow script, between steps:
stream_log = os.path.join(os.environ["WORKSPACE_PATH"], os.environ["NOTE_ID"],
                          "scripts", "logs", "ai-stream.log")
with open(stream_log, "w") as f:
    f.write("__STREAMING__\nStep 2/3: Categorizing...\n")
```

The frontend polls `read-stream.py` as usual and sees the step label.

## How Streaming Works

1. Frontend calls `noteScripts.run('ai-chat.py', [payload])`
2. `ai-chat.py` writes `__STREAMING__` to `scripts/logs/ai-stream.log`, then appends output line-by-line
3. Frontend polls `noteScripts.run('read-stream.py', [offset])` every 500ms
4. `read-stream.py` returns new content since the byte offset, plus status (`streaming` | `done` | `error`)
5. When `ai-chat.py` finishes, it writes `__DONE__` marker and prints final JSON to stdout
6. Frontend gets the final result from the script's stdout, finalizes the message bubble

## File Structure After Setup

```
my-item/
├── index.html          ← contains chat HTML + inlined CSS/JS
├── scripts/
│   ├── ai-chat.py      ← copied from template
│   ├── read-stream.py  ← copied from template
│   └── logs/
│       └── ai-stream.log  ← auto-created at runtime
└── storage/
    └── kv.json         ← conversations persisted here under storageKey
```
