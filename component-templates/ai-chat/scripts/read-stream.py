#!/usr/bin/env python3
"""
Incremental stream reader for ai-chat.py output.
Frontend polls this with a byte offset to get new content.

Returns JSON: { content, status, offset }
  status: "idle" | "streaming" | "done" | "error"
  content: new text since the given offset (markers stripped)
  offset: byte position to pass on next poll

Usage:
  noteScripts.run('read-stream.py', [String(offset)])
  noteScripts.run('read-stream.py', [String(offset), requestId])
"""

import json
import os
import sys

WORKSPACE = os.environ.get("WORKSPACE_PATH", ".")
NOTE_ID = os.environ.get("NOTE_ID", "")
LOGS_DIR = os.path.join(WORKSPACE, NOTE_ID, "scripts", "logs")

offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0

# Per-request log file: if requestId is provided, use ai-stream-{requestId}.log
request_id = sys.argv[2] if len(sys.argv) > 2 else ""
if request_id:
    STREAM_LOG = os.path.join(LOGS_DIR, f"ai-stream-{request_id}.log")
else:
    STREAM_LOG = os.path.join(LOGS_DIR, "ai-stream.log")

try:
    if not os.path.exists(STREAM_LOG):
        print(json.dumps({"content": "", "status": "idle", "offset": 0}))
        sys.exit(0)

    with open(STREAM_LOG, "rb") as f:
        f.seek(0, 2)  # seek to end
        file_size = f.tell()

        if file_size == 0:
            print(json.dumps({"content": "", "status": "idle", "offset": 0}))
            sys.exit(0)

        # Read from offset (or beginning)
        read_from = max(0, offset)
        f.seek(read_from)
        new_bytes = f.read()

    new_text = new_bytes.decode("utf-8", errors="replace")
    new_offset = read_from + len(new_bytes)

    # Also read full file to determine status
    with open(STREAM_LOG, "r", errors="replace") as f:
        full = f.read()

    if full.startswith("__ERROR__"):
        error_msg = full.replace("__ERROR__\n", "", 1).strip()
        print(json.dumps({"content": error_msg, "status": "error", "offset": new_offset}))
    elif "__DONE__" in full:
        # Strip markers from new content
        clean = new_text.replace("__STREAMING__\n", "").replace("\n__DONE__\n", "").replace("__DONE__\n", "")
        print(json.dumps({"content": clean, "status": "done", "offset": new_offset}))
    elif full.startswith("__STREAMING__"):
        clean = new_text.replace("__STREAMING__\n", "")
        print(json.dumps({"content": clean, "status": "streaming", "offset": new_offset}))
    else:
        print(json.dumps({"content": new_text, "status": "streaming", "offset": new_offset}))

except Exception as e:
    print(json.dumps({"content": str(e), "status": "error", "offset": 0}))
    sys.exit(1)
