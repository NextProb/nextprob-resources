# Workspace

This is an HTML workspace. Each item is a self-contained folder containing an `index.html` file — ranging from simple notes to interactive micro-applications. Beyond the HTML itself, each item can have per-note memory, data storage layers, scripts, and logs — some items may already have data in these stores. See sections below for details.

```
./
├── my-item/
│   ├── index.html                  ← the item itself
│   ├── memory.md                   ← per-item context for AI
│   ├── scripts/                    ← executable scripts (Python, Bash, etc.)
│   │   ├── my-script.py
│   │   └── logs/                   ← script & frontend logs (auto-generated)
│   │       ├── my-script.py.log    ← auto-captured script output
│   │       └── frontend.log        ← frontend logging via noteLog.write()
│   └── storage/
│       ├── kv.json                 ← key-value store (auto-saved form state in `__autosave` key)
│       ├── db.sqlite               ← SQLite database
│       └── files/                  ← arbitrary file storage
│           └── ...
├── other-item/
│   ├── index.html
│   └── ...
```

## When you receive a request

1. If asked to create something, create a new folder with an `index.html` file inside it
2. If asked to edit an existing item, read its `index.html` first then edit it. Note that dynamic content (e.g., user input, runtime state) may live in the item's KV store (`kv.json` under `__autosave`) rather than in the HTML — check both the HTML and the relevant storage files to understand the item's full state before making changes.
3. If asked about existing items, read the relevant files first

## Notes

When asked to create a note, create a folder (lowercase, kebab-case, e.g., `cooking-pasta/`) with an `index.html` inside. Use this structure for the HTML: an `<article class="note">` with `data-title` and `data-created` (today's date, YYYY-MM-DD) attributes, an `<h1>` matching the title, and semantic HTML for content (h2, h3, p, ul, ol, blockquote, code, pre, table, etc.). Optionally add a `<head>` with `<meta name="tags" content="tag1, tag2">` for tagging. Tags: letters, digits, hyphens, underscores only; must start with a letter or digit; use hyphens for multi-word tags. Write substantive, well-structured, readable content.

- NO full HTML document wrappers — no doctype, html, or body tags
- An optional `<head>` section is allowed for metadata (e.g., `<meta name="tags">`)
- It is better to support both light and dark themes. Use CSS custom properties for all colors. Define dark-theme defaults on `:root` and light-theme overrides on `:root[data-theme="light"]`. The app toggles this attribute at runtime.
  The recommended palette below matches the host app's Veridian Lumina theme so notes feel visually integrated. Use these as defaults, but always follow the user's guidance if they specify different colors.
  ```css
  :root {
    /* Dark theme (default) */
    --bg:         #101414;     /* main background */
    --surface:    #1c2020;     /* cards, containers */
    --surface2:   #272b2a;     /* elevated surfaces */
    --border:     #3e4948;     /* borders, dividers */
    --text:       #e0e0e0;     /* primary text */
    --text-dim:   #bec9c7;     /* secondary/muted text */
    --accent:     #4fdad5;     /* primary accent */
    --accent-hover:#006663;    /* accent hover/containers */
    --accent-text:#101414;     /* text on accent backgrounds */
    --shadow:     rgba(0,0,0,0.3);
  }
  :root[data-theme="light"] {
    --bg:         #effcfb;     /* main background */
    --surface:    #ffffff;     /* cards, containers */
    --surface2:   #e9f6f5;     /* elevated surfaces */
    --border:     #bec9c7;     /* borders, dividers */
    --text:       #121e1d;     /* primary text */
    --text-dim:   #3e4948;     /* secondary/muted text */
    --accent:     #004c4b;     /* primary accent */
    --accent-hover:#006664;    /* accent hover/containers */
    --accent-text:#ffffff;     /* text on accent backgrounds */
    --shadow:     rgba(18,30,29,0.1);
  }
  body { background: var(--bg); color: var(--text); }
  ```

## Rules

- Create items as folders containing `index.html` — at the root or inside organizational subfolders (plain folders that group notes, without their own `index.html`)
- Folder names: lowercase, kebab-case (e.g., `cooking-pasta/`)
- Do NOT name a note folder `storage` or `scripts` — these are reserved names
- Inter-note links use relative paths: `<a href="../other-note/index.html">link text</a>`

## Per-Item Storage

Each item can store data in up to three storage layers. Data storage lives under `{item-folder}/storage/`, while scripts and logs live under `{item-folder}/scripts/`.

| Storage | Path | Format | How to access |
|---------|------|--------|---------------|
| KV Store | `storage/kv.json` | Plain JSON object | Read the file directly |
| Files | `storage/files/{name}` | Any binary/text file | Read/list files in the directory |
| SQL Database | `storage/db.sqlite` | SQLite 3 | Use `sqlite3 {item}/storage/db.sqlite` |
| Scripts | `scripts/{name}` | `.py`, `.sh`, `.js`, etc. | Write script files directly |
| Logs | `scripts/logs/{name}.log` | Text log files | Read the file directly |

- **KV Store**: a flat JSON object (`{ "key": value }`). Read it with the Read tool. At runtime, the item's HTML can use the `noteDB` API (see Runtime APIs below).
- **Files**: arbitrary files stored by the item. List with Glob, read with Read. At runtime, the item's HTML can use the `noteFiles` API (see Runtime APIs below).
- **SQL Database**: a standard SQLite database. Query with `sqlite3` in the Bash tool (e.g., `sqlite3 cooking-pasta/storage/db.sqlite "SELECT * FROM tablename"`). To discover tables: `sqlite3 ... ".tables"`. At runtime, the item's HTML can use the `noteSQL` API (see Runtime APIs below).
- **Scripts**: executable scripts that the item's HTML can trigger at runtime via `noteScripts.run(name, args)`. See the Scripts section below.
- **Logs**: log files are stored at `{item-folder}/scripts/logs/`. Script output is automatically captured to `{scriptName}.log`. Frontend logging goes to `frontend.log`. See the Logging section below.

### Runtime JavaScript APIs

These globals are available to the item's HTML at runtime. Use **exactly** these method names — no aliases exist.

#### `noteDB` — Key-Value Store

| Method | Returns | Description |
|--------|---------|-------------|
| `noteDB.get(key)` | `any \| null` | Get a value by key. Returns `null` if not found. |
| `noteDB.set(key, value)` | `void` | Set a key to any JSON-serializable value. |
| `noteDB.delete(key)` | `void` | Delete a key. |
| `noteDB.list()` | `string[]` | List all keys. |

#### `noteFiles` — File Storage

| Method | Returns | Description |
|--------|---------|-------------|
| `noteFiles.load(name)` | `ArrayBuffer \| null` | Load a file's contents as raw bytes. Returns `null` if not found. For text files, decode with `new TextDecoder().decode(buf)`. |
| `noteFiles.save(name, data)` | `void` | Save a file. `data` can be a `string`, `ArrayBuffer`, or `Uint8Array`. |
| `noteFiles.delete(name)` | `void` | Delete a file. |
| `noteFiles.list()` | `string[]` | List all filenames in storage. |
| `noteFiles.import(options?)` | `string \| null` | Open a native file picker and copy the selected file into storage. Pass `{ filters: [{ name: 'CSV', extensions: ['csv'] }] }` to restrict file types, or call with no arguments to allow any file. Returns the filename on success, or `null` if canceled. |

#### `noteSQL` — SQLite Database

| Method | Returns | Description |
|--------|---------|-------------|
| `noteSQL.exec(sql, params?)` | `{ changes }` | Execute a write statement (INSERT, UPDATE, DELETE, CREATE TABLE, etc.). `params` is an optional array of bind values. Returns the number of rows changed. |
| `noteSQL.query(sql, params?)` | `object[]` | Execute a read query (SELECT). Returns an array of row objects. |

#### `noteScripts` — Script Execution

| Method | Returns | Description |
|--------|---------|-------------|
| `noteScripts.run(name, args?)` | `{ stdout, stderr, exitCode }` | Run an approved script. `args` is an optional string array. Returns `{ error: 'not_approved' }` if the user hasn't approved the script yet. |
| `noteScripts.stopByName(name)` | `void` | Stop a running script. |

#### `noteLog` — Frontend Logging

| Method | Returns | Description |
|--------|---------|-------------|
| `noteLog.write(message)` | `void` | Write a timestamped log entry to `scripts/logs/frontend.log`. Max 10,000 characters per message. |

#### `noteAPI` — Item Identity

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `noteAPI.noteId` | `string` | The current item's folder name (e.g., `"app-store-explorer"`). |
| `noteAPI.ready` | `boolean` | Always `true` — can be used to detect the runtime environment. |

### Scripts

Items can have server-side scripts stored at `{item-folder}/scripts/`. These scripts run on the host machine (not in the browser) and can do things that browser JavaScript cannot — call APIs with secrets, read/write local files, run data processing pipelines, etc.

**How it works:** The item's HTML calls `noteScripts.run('script-name.py', ['arg1', 'arg2'])` which returns a promise resolving to `{ stdout, stderr, exitCode }`. Environment variables `NOTE_ID` and `WORKSPACE_PATH` are available to the script. The working directory is the item's `scripts/` folder.

**Security model:** Scripts are not executable by default. The user must explicitly approve each script via the app's Scripts sidebar panel before the item can trigger it. The item's HTML can only call `run` — it cannot list, add, modify, or delete scripts.

**To add a script to an item:** Write the script file directly to `{item-folder}/scripts/`. Use flat filenames (no subdirectories). Supported extensions: `.py` (runs with `python3`), `.sh` (runs with `bash`), `.js` (runs with `node`), `.rb` (runs with `ruby`). The user will then approve it in the app before it can be triggered.

**When creating an item that needs scripts:**
1. Write the script(s) to `{item-folder}/scripts/`
2. In the item's HTML, use `noteScripts.run('script-name.py')` to trigger them (handle the case where the script is not yet approved — `result.error === 'not_approved'`)
3. Document the scripts and their purpose in the item's `memory.md`

**Supply chain safety:** Scripts run on the user's machine, so dependencies must be treated with care. When a script needs external packages, pin exact versions (`==`, not `>=`) and only add packages that are truly necessary — every dependency is a potential attack surface.

### Logging

Each item has a logging system at `{item-folder}/scripts/logs/`. Logs are viewable in the app's Logs sidebar panel.

**Script output logs:** When a script runs via `noteScripts.run()`, its stdout/stderr is automatically captured to `{item-folder}/scripts/logs/{script-name}.log` with a timestamp header. No extra code needed in the script — output is captured automatically.

**Frontend logging:** The item's HTML can write log messages via `noteLog.write(message)`. These are written to `{item-folder}/scripts/logs/frontend.log` with ISO timestamps. Use this for debugging, status tracking, or any runtime information the item wants to persist.

**Writing logs from scripts:** Scripts can also write directly to their log file at `{item-folder}/scripts/logs/`. Use the `NOTE_ID` and `WORKSPACE_PATH` environment variables to construct the path. Example in Python:
```python
import os
from datetime import datetime
log_path = os.path.join(os.environ['WORKSPACE_PATH'], os.environ['NOTE_ID'], 'scripts', 'logs', 'my-script.py.log')
with open(log_path, 'a') as f:
    f.write(f'[{datetime.now().isoformat()}] Custom log message\n')
```

**Log rotation:** Log files are automatically rotated at 500KB — older content is trimmed to keep the file manageable.

### Auto-Persisted Form State

Interactive elements — `<input>` (except password/hidden), `<textarea>`, `<select>`, and `[contenteditable]` — are automatically saved to the item's KV store (under the `__autosave` key) and restored on reload. No extra code is needed. To opt an element out, add the `data-no-persist` attribute. Because dynamic content (e.g., text typed into a textarea) exists only at runtime, it won't appear in the HTML file — read the `__autosave` key in `kv.json` to see current form values.

### Per-Item Memory

Each item can have a `memory.md` file at `{item-folder}/memory.md` (directly in the note folder root).

**You should write to `memory.md` when:**
- An item is first created — record its purpose (why it exists), requirements (what it should do), and key design decisions (how it works). Revise these if they change over time.
- You read or modify an item's KV store, SQL database, or files — summarize what's stored and its structure
- You learn important context about the item's purpose or state that wouldn't be obvious from the HTML alone
- The user tells you something about the item's data or usage that future conversations should know

**Keep `memory.md` concise** — it's included in every prompt when the item is active. Focus on what an AI assistant needs to know to work with the item effectively. Update rather than append when information changes.

Not every item uses storage — these paths only exist for items that have created data.

## Cloud Storage

A general-purpose cloud storage API is available for uploading files to S3 and getting URLs that external services can access (e.g. image generation APIs, AI services, sharing). Scripts can call this API to upload, download, or delete files.

**Endpoint:** `POST /storage/presign` (on the sync API: `https://api-hn-dev.helicase.space` / `https://api-hn.helicase.space`)

**Authentication:** Bearer token from the app's Cognito auth. Files are scoped per-user — each user can only access their own files.

**Actions:**

| Action | Request body | Response |
|--------|-------------|----------|
| Upload | `{ "action": "upload", "key": "photo.png", "contentType": "image/png", "expiresIn": 3600, "persist": true }` | `{ "presignedUrl": "...", "objectKey": "u/{userId}/photo.png", "expiresIn": 3600 }` |
| Download | `{ "action": "download", "key": "photo.png", "expiresIn": 3600 }` | `{ "presignedUrl": "...", "objectKey": "u/{userId}/photo.png", "expiresIn": 3600 }` |
| Delete | `{ "action": "delete", "key": "photo.png" }` | `{ "deleted": "photo.png" }` |

**Parameters:**
- `key` — filename or path (alphanumeric, dots, hyphens, underscores, slashes). No `..` or leading `/`.
- `expiresIn` — presigned URL TTL in seconds. Client-controlled, max 7 days (604800s). Default 1 hour.
- `persist` — if `true` (default), file stays until explicitly deleted. If `false`, auto-deleted after 7 days.
- `contentType` — MIME type, required for upload.

**Workflow:** Call the endpoint to get a presigned URL, then PUT the file directly to S3 using that URL. The presigned URL or the object key can then be passed to any external service that needs to fetch the file.

## Component Templates

Reusable component templates are available at `.component-templates/` in the workspace. Each template has an `INSTRUCTIONS.md` with full usage details — read it before using the template.

| Template | Path | Purpose |
|----------|------|---------|
| AI Chat | `.component-templates/ai-chat/` | Drop-in AI chat panel with streaming, multi-provider support, conversation history |

## Live Context (`.context/`)

A read-only folder at the workspace root containing JSON files that reflect the app's live UI state. You can read these to understand the context. **Do not write to this folder** — it is managed by the app.

Files are written atomically (tmp + rename) so partial reads won't occur. The folder is created when a workspace opens and cleaned up on quit.

| File | Contents |
|------|----------|
| `meta.json` | `{ updatedAt, app, pid, workspacePath }` — app identity; check `pid` to confirm the app is running |
| `current-note.json` | `{ updatedAt, active, path, noteTitle, noteId }` — the note currently focused in the UI (`active: false` when none) |
| `quotes.json` | `{ updatedAt, items: [{ text, path, noteTitle }] }` — user-selected text snippets added as context |
