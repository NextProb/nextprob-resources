# Workspace extensions

Use this guide to explain NextProb extensions or create, customize, reuse, and
troubleshoot a user's workspace automation. Extensions require **NextProb 0.4.0+**
and extension API v1. Check the app's version or availability of **Settings →
Extensions** when compatibility is uncertain. Installing this skill does not add
the runtime to an older app. Its other settings guidance remains applicable.

## Choose the mechanism

| Mechanism | Use when | Example |
| --- | --- | --- |
| Hook | A short action should follow an app event | Export after local files change |
| Command | The user should invoke an action | Publish a note on demand |
| Background service | Ongoing work or work longer than ten seconds is needed | Watch a server or run an existing sync tool periodically |
| Plugin | Behavior should be packaged and reused | A folder containing hooks, commands, a service, and settings |
| UI contribution | Show controls, contextual commands, or an interactive view | A publish action in a note’s right-click menu |

These mechanisms share the same process protocol. Scripts can use Python, Node,
an explicit shell interpreter, or another executable. They do not depend on the
agent editing the workspace. A hook is an event subscription, not necessarily
an agent's own hook feature. Plugins from other applications need an adapter;
they are not automatically compatible with this format.

Preserve the user's existing automation and manifest entries. For a requested
change, inspect the workspace before editing and add only the needed behavior.
Prefer wrapping an existing suitable tool over rebuilding its synchronization,
deployment, or backup logic. Explanation requests do not justify creating files.

## Create or customize a plugin

The project root owns `nextprob.extensions.json`. It supports inline definitions
and references to package directories:

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "my-export",
      "name": "Export notes",
      "commands": [
        { "id": "export", "title": "Export", "command": "python3", "args": ["automation/export.py"] }
      ]
    },
    { "path": ".extensions/my-tool" }
  ]
}
```

The package reference points to `.extensions/my-tool/extension.json`, containing
one definition in the same format as the inline object. Paths must remain inside
the workspace, including through symlinks. IDs must be unique. An extension ID or
command ID uses 1–80 letters, digits, `.`, `_`, or `-`, starting with a letter or
digit. Each definition has `id` and `name`, with optional `description`,
`hooks: [{event, command, args?}]`, `commands: [{id, title, command, args?}]`,
`service: {command, args?}`, `settings: {}` defaults, and `contributes: []` UI declarations.

Use executable names/paths and separate string arguments. The host does not run
a shell or expand `$VARIABLE`, `~`, redirections, or pipelines. Use an explicit
interpreter when shell semantics are necessary. `command: "node"` uses the app's
Node runtime even in packaged installations; other tools must be installed and
available through the app's inherited PATH or an explicit executable path.

Inline executables run with the workspace as cwd; packaged executables run with
their package directory as cwd. Use the supplied `workspace.path` when working
on user files. Do not assume that a package's relative arguments resolve at the
workspace root.

Defaults in `extension.json` are portable. Overrides edited in **Settings →
Extensions** are local to this device/workspace. Saving the entire settings
object replaces overrides against defaults and restarts an enabled service.
Removing a custom key removes it; omitting a defaulted key restores its default.
Local settings are not encrypted credential storage. Reuse the underlying tool's
credential mechanism rather than committing secrets into manifests or assets.

## Use the portable starter

Copy [the extension demo](../assets/extension-demo/) into a user-owned directory
such as `.extensions/my-tool/`. The four files are `extension.json`, `service.cjs`,
`request.cjs`, and `log-event.cjs`. Customize that copy, not the managed skill.
Reference its directory from the workspace manifest. Rename IDs/names if another
copy of the same plugin is already registered.

The demo wraps an existing executable. Set its `settings.command`, `args`,
`intervalSeconds`, `runOnChange`, and `refreshPaths` for the requested workflow.
The external tool runs at the workspace root. Its default command is empty, so
copying the starter does not start transfers or other external work.

For a local smoke check, these settings only write a message to extension logs:

```json
{
  "command": "node",
  "args": ["-e", "console.log('Workspace tool connected')"],
  "intervalSeconds": 0,
  "runOnChange": false,
  "refreshPaths": []
}
```

Once enabled, the service runs immediately and optionally every 1–86,400 seconds;
0 disables periodic repeats. **Run now** queues a request to that service; command
completion means queued, not tool completion. Invocations serialize, and repeated
pending requests coalesce. The `note.opened` hook only logs that event. Successful
tool exits invalidate configured `refreshPaths` in the viewer. No app source
checkout or rebuild is needed to use or customize the copied plugin.

For a sync request, establish direction and ownership first: follow the server,
publish local changes, or use a tool that implements two-way reconciliation.
Configure that tool's actual policy; an event hook alone cannot detect remote
changes. Remote observation needs polling, notifications, or an existing daemon.
The host does not provide sync conflict resolution or consistent copying of live
SQLite databases. `runOnChange` should account for files written by the tool
itself to avoid a feedback loop. Do not also assign another sync engine to the
same files without understanding their interaction.

## Process protocol (API v1)

Input is UTF-8 JSON Lines on stdin. Every message includes:

```json
{
  "apiVersion": 1,
  "type": "event",
  "workspace": { "id": "opaque-local-id", "path": "/absolute/workspace" },
  "extension": {
    "id": "my-tool",
    "settings": {},
    "statePath": "/absolute/private-extension-state"
  },
  "event": { "name": "workspace.filesChanged", "data": { "paths": ["notes/index.html"], "rescan": false } }
}
```

Hooks receive one `type: "event"` message followed by stdin EOF. Commands receive
one `type: "command"` message with `command: {id, args}` instead of `event`.
UI contribution commands receive context in `command.args`, including a workspace-relative `path` when a note is available. Settings command buttons supply no custom arguments. A service first receives
`type: "initialize"` with the common context and then receives event messages
on the same stream. Parse lines across arbitrary chunks; keep reading for the
lifetime of a service. An ordinary CLI that ignores stdin can still be used as
a hook or command; wrap it when it needs context or reports app status.

| Event | `event.data` |
| --- | --- |
| `workspace.opened` | `{}` on workspace open or enablement |
| `workspace.closing` | `{}` on close, switch, reload, or quit |
| `workspace.filesChanged` | `{paths: [...], rescan: boolean}` |
| `note.opened` | `{path: "relative/path"}` when a note/file is displayed |

Paths use `/` relative to the workspace; directory notes may report the directory.
Repeated display of the same path in one panel is deduplicated. Watching includes
dotfiles and storage, excludes `.git`, `node_modules`, `.notes-app`, extension
state and symlink targets, and does not emit an initial file inventory. Events
coalesce under load; they are not a durable journal or an agent-completion signal.
File events carry up to 5,000 paths; `rescan: true` requests full reconciliation.
Write operational logs, caches and queues under `extension.statePath`, not into
watched files. Workspace mutations can produce further file events.

Optional stdout replies are also newline-terminated JSON, with `apiVersion: 1`:

```json
{"apiVersion":1,"type":"log","level":"info","message":"Connected"}
{"apiVersion":1,"type":"status","state":"ready","text":"Up to date"}
{"apiVersion":1,"type":"refresh","paths":["notes/index.html"]}
```

Status states are `ready`, `running`, and `error`. Log levels are `debug`, `info`,
`warn`, and `error`. Refresh invalidates views; it does not write files. Its paths
must stay within the workspace. Use protocol messages for stdout; plain stdout
is logged as malformed. Stderr is captured as log output. The host keeps the last
100 log entries, limits protocol lines to 64 KiB, and limits output volume/rate.
The service wrapper in the demo converts ordinary tool output to protocol logs.

Hooks and commands time out after ten seconds. Use a service for longer work.
Commands run independently of hooks/services; coordinate shared resources when
necessary. Services receive closing events with only a short flush opportunity;
persist state during normal operation. On disable/switch/shutdown, tracked
processes stop and descendant cleanup is best effort. Reap your own subprocesses
before natural exit and do not detach them; Windows orphan cleanup is limited.
Crashes are shown in status/logs, without automatic restart. Reload or toggle
the extension to retry. Services run only while that workspace is open in the
app; unattended work needs an independently managed daemon.

## Validate and hand off

Check the final manifest JSON and referenced files. For custom code, exercise
its actual JSONL input/output using a disposable fixture where possible; use the
inert starter settings above to test integration without external writes. Check
the user's chosen command/interpreter, cwd, settings, and output handling.

Tell the user which workspace files changed and how to use **Settings →
Extensions → Reload extensions**, configure settings, and enable the plugin.
Contributed command buttons appear on that plugin's card; its **Recent logs**
disclosure shows execution output and service status messages.
New definitions are disabled. Approval is local to the device, canonical
workspace, and manifest fingerprint; copied workspaces do not auto-run plugins.
Reloading a changed manifest requires fresh enablement. Implementation scripts
are trusted code, not hashed or sandboxed, and run with the user's privileges.
Do not edit application approval records to enable code or claim a created
plugin is already running. If the user has authorized an actual run and a
supported interface is available, use it within that scope; otherwise hand off
the local enablement step without making an unrelated permission request.

For errors, inspect Extensions diagnostics and Recent logs first. Typical causes
are invalid JSON, duplicate IDs, package path escapes, missing executables or
interpreters, wrong cwd, plain stdout, a ten-second hook timeout, or an exited
service. Fix the cause and reload; do not repeatedly retry external operations
or change the workflow's sync direction to make a failure disappear.

## Contribute interface elements

UI contributions use extension API v1 in NextProb versions shipping the UI-zone
runtime. Older apps with only Settings command buttons do not render these zones.
Each extension may declare up to 100 contributions in `contributes`:

```json
{
  "id": "publish",
  "zone": "noteMenu",
  "title": "Publish this note",
  "icon": "↗",
  "command": "publish-note",
  "when": "note",
  "order": 20
}
```

The contribution `id` follows command ID rules and is unique within the extension.
The extension ID `builtin` is reserved when declaring UI contributions, because
`builtin:*` configuration keys identify NextProb's own controls. Existing automation
extensions named `builtin` remain valid without UI contributions.
`title` is required (1–200 characters). `icon` is optional text, up to 100 characters;
use a short symbol rather than SVG or HTML. `order` is an optional finite number
between -100000 and 100000. `when` is optional: `workspace` is always eligible in
an open workspace; `note` requires a note context. A contribution needs an existing
`command` ID, a `view`, or both.

| `zone` | Content |
| --- | --- |
| `rightPanel` | An icon opening an interactive view, or a command |
| `sidebarFooter` | Compact workspace status or a command |
| `bottomBar` | Compact status or a quick command |
| `sidebar` | An interactive sidebar section, or a command |
| `noteMenu` | A command acting on the right-clicked note |
| `mainTab` | A full-size interactive view, or a command |

`view` is an HTML file path relative to the extension package (or workspace for an
inline extension), supported in `rightPanel`, `sidebar`, and `mainTab`. Absolute
paths, `..`, symlink escapes, and non-HTML files are rejected. Views are bounded
to 512 KiB. Package self-contained HTML with inline styles/scripts; loading
relative package assets is not supported by the current view bridge. Views run
in sandboxed iframes without Node or NextProb's preload API. Processes still use
the existing local extension approval mechanism. Disabled extensions contribute
no active controls.

NextProb supplies the current note context for normal controls and the actual
clicked note for note-menu commands, even if another note is open. A command
receives `command.args.path` relative to `workspace.path`. Omit assumptions about
an absolute path or the currently active tab. Menu contributions operate on one
clicked note; multi-selection is not a separate API yet.

Processes can update contribution presentation through stdout:

```json
{"apiVersion":1,"type":"ui","id":"status","patch":{"text":"Ready","badge":"2","disabled":false,"hidden":false}}
```

`id` is local to that extension. Patches merge with existing presentation state;
`text` changes the displayed label, `badge` supplies a small label, and the two
booleans control availability and visibility. The declaration's command/view
cannot be replaced by a runtime patch. State resets when the extension stops.
Project layout in `nextprob.config.json` uses qualified IDs such as
`ui-demo:inspector`; see [UI zone layout](project-config.md#ui-zone-layout).

A view can request its declaration's command without selecting arbitrary app
commands:

```js
parent.postMessage({ type: 'nextprob.command' }, '*');
```

A view can also send JSON data to its extension's running service:

```js
parent.postMessage({ type: 'nextprob.message', data: { action: 'refresh' } }, '*');
```

The service receives a JSONL message with `type: "ui.message"`, `contributionId`,
`data`, and `context` (including `path` when available), along with the common
workspace/extension fields. Messages require a running service and are limited
to 32 KiB. App command execution and message routing remain scoped to the
originating contribution; arbitrary commands and workspace identity supplied by
iframe content are not accepted.

For a runnable six-zone example, copy `examples/extensions/ui-demo` from the app
source into `.extensions/ui-demo` and reference that package in
`nextprob.extensions.json`. Reload extensions and enable **UI contribution demo**
in Settings → Extensions. The example only logs actions and updates demo status;
its publish action demonstrates context without publishing anything externally.

The iframe should send `{type: 'nextprob.ready'}` after installing its message
listener. NextProb sends `{type: 'nextprob.context', context, state}` on readiness,
load, and context/state changes. `context` includes `workspacePath` and the current
workspace-relative `path` when available. Sidebar and right-panel views follow the
active note; a main-tab view retains the note context from when it was opened.
`state` contains the contribution's
presentation patch. Always render values as text rather than HTML.

Include an optional `requestId` on `nextprob.command` or `nextprob.message` calls
to correlate `{type: 'nextprob.result', requestId, result}` or
`{type: 'nextprob.result', requestId, error}` replies. A service can send data back
with stdout `{"apiVersion":1,"type":"ui.message","id":"inspector","data":{"ready":true}}`;
the view receives `{type: 'nextprob.message', data}`. This channel carries JSON
messages, not DOM access. Views should verify `event.source === parent` before
handling messages.
