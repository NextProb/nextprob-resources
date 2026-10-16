# Agent profile path research

Verified against official documentation and upstream source on 2026-10-15.
Paths below are relative to the opened project unless explicitly prefixed by `~`.
Profiles describe editable resources, not a replacement for each CLI's discovery,
trust, or precedence rules. Missing resources should not be created on discovery.

## Claude Code

- Primary instructions: `CLAUDE.md`; supported alternative `.claude/CLAUDE.md`.
- Personal project instructions: `CLAUDE.local.md`.
- Modular rules: `.claude/rules/**/*.md`.
- Primary configuration: `.claude/settings.json` (shared),
  `.claude/settings.local.json` (personal overrides). Both are strict JSON.
- Skills: `.claude/skills/<name>/SKILL.md` with supporting package files.
- Additional configuration: root `.mcp.json` for shared project MCP servers.
- Other customization resources include `.claude/commands/` and `.claude/agents/`.

`AGENTS.md` is a version-dependent fallback: since v2.1.277, Claude can load it
when no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists in the working
directory or its ancestors. Imports and the project-instructions setting can
change that behavior. Do not advertise unconditional `AGENTS.md` compatibility
or `.agents/skills` discovery. User configuration is under `~/.claude/`, not the
project directory; user/local MCP state is also stored in `~/.claude.json`.

Sources: [memory](https://code.claude.com/docs/en/memory),
[settings](https://code.claude.com/docs/en/settings),
[skills](https://code.claude.com/docs/en/skills),
[MCP scopes](https://code.claude.com/docs/en/mcp#project-scope).

## Codex

- Primary project instructions: `AGENTS.md`; `AGENTS.override.md` takes precedence
  in the same directory. Codex loads at most one nonempty context file per
  directory, from the repository root down to its current working directory.
- Project configuration: `.codex/config.toml`. Project layers load only when the
  project is trusted; closer project layers override broader layers.
- Current project skills: `.agents/skills/<name>/SKILL.md`. Codex searches each
  directory from its working directory up to the repository root. `.codex/skills`
  is not the currently documented repository skill discovery directory.
- Global instructions/configuration use `~/.codex/AGENTS.md` (or
  `AGENTS.override.md`) and `~/.codex/config.toml`; `CODEX_HOME` changes that home.
  User skills are documented at `~/.agents/skills`, separately from Codex home.

Fallback instruction filenames can be configured through
`project_doc_fallback_filenames`; they are not universally recognized defaults.
Codex supports symlinked skill folders, but this application's existing Settings
path safety policy deliberately rejects symlinks. A profile describes recognized
paths without claiming identical traversal behavior to the CLI.

Sources: [instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[local skill discovery](https://learn.chatgpt.com/docs/build-skills),
[configuration layers](https://learn.chatgpt.com/docs/config-file/config-basic).

## Gemini CLI

- Primary instructions: root `GEMINI.md` and hierarchical files of the same name.
  The filename is configurable through `context.fileName`.
- Primary configuration: `.gemini/settings.json`. There is no documented
  `.gemini/settings.local.json` project override.
- Skills: `.gemini/skills/<name>/SKILL.md` and shared `.agents/skills/` alias.
- Additional resources: `.gemini/commands/**/*.toml` for custom commands.

The settings parser strips JSON comments before JSON parsing; the `.json`
extension must not cause an editor to discard comments. This does not establish
trailing-comma support. Global instructions/configuration are
`~/.gemini/GEMINI.md` and `~/.gemini/settings.json`.

Project `.gemini/GEMINI.md` is not the canonical project context file. Upward
discovery checks the configured filename directly in each directory, rather
than checking a `.gemini` child. Such a file could be imported or discovered
while working inside that directory, but should not be presented as automatically
loaded root instructions. Preserve existing app-created files as legacy resources;
new project bootstrap should target root `GEMINI.md` without silently moving data.

Sources: [context hierarchy](https://geminicli.com/docs/cli/gemini-md/),
[configuration](https://geminicli.com/docs/reference/configuration/),
[skills](https://geminicli.com/docs/cli/using-agent-skills/),
[commands](https://geminicli.com/docs/cli/custom-commands/),
[settings parser](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/settings.ts),
[context discovery](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/memoryDiscovery.ts).

## OpenCode

- Primary instructions: `AGENTS.md`; `CLAUDE.md` is a compatibility fallback.
- Primary configuration: root `opencode.json` or `opencode.jsonc`. JSONC comments
  and trailing commas are supported. Configuration sources merge.
- Skills: `.opencode/skills/<name>/SKILL.md`, shared `.agents/skills/`, and
  Claude-compatible `.claude/skills/` (compatibility can be disabled).
- Additional configuration: root `tui.json` / `tui.jsonc` for terminal UI settings.
- Additional resource directories: `.opencode/agents/`, `commands/`, `plugins/`,
  `tools/`, and `themes/`. Current docs prefer plural directory names; singular
  forms remain backward compatible.

Project discovery walks upward toward the Git worktree. Global configuration
lives under `~/.config/opencode/`; global instructions are
`~/.config/opencode/AGENTS.md`. Do not claim native `AGENTS.override.md` support.

Sources: [configuration](https://opencode.ai/docs/config/),
[rules and precedence](https://opencode.ai/docs/rules/),
[skill discovery](https://opencode.ai/docs/skills/).

## Pi

- Context filenames, first matching per directory: `AGENTS.override.md`,
  `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD`.
- Primary configuration: `.pi/settings.json`.
- Skills: `.pi/skills/` and shared `.agents/skills/`; portable packages contain
  `<name>/SKILL.md` with supporting files.
- Additional configuration: `.pi/mcp.json`.
- Special instruction resources: `.pi/SYSTEM.md` replaces the default system
  prompt; `.pi/APPEND_SYSTEM.md` appends to it.
- Additional resource directories: `.pi/prompts/`, `.pi/extensions/`,
  `.pi/themes/`.

Context files belong in the working directory and ancestors, separately from
`.pi` configuration. Do not invent `.pi/AGENTS.md` as the primary instruction
path. `AGENTS.override.md` replaces only the context file in its own directory.
Trusted project SYSTEM/APPEND_SYSTEM files override corresponding user files.
User settings, models, credentials, and keybindings belong in the agent directory
(default `~/.pi/agent`, configurable through `PI_CODING_AGENT_DIR`); do not invent
project `.pi/models.json` or `.pi/keybindings.json` support. Project resource paths
in `.pi/settings.json` resolve relative to `.pi`.

Sources: [configuration layout](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md),
[skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md),
[settings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md),
[context candidate order](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts).

## Shared-resource labeling

Use one editable resource for a shared path and label only verified consumers.
`.agents/skills` is documented for Codex, Gemini CLI, OpenCode, and Pi. `AGENTS.md` is
native context for Codex, OpenCode, and Pi, with Claude's conditional behavior described
above. `AGENTS.override.md` must not inherit every `AGENTS.md` consumer label.
Codex compatibility is documented separately by its maintained profile sources.

## Source editing formats

TOML and JSONC resources use source-only editors. Their contents are preserved
without parsing, normalizing, or syntax validation. This protects comments,
formatting, and options unknown to the application. A successful save confirms
that the file was written, not that its agent accepts the configuration. Gemini
settings use JSONC editing despite their `.json` extension because their parser
supports comments; this editor does not promise trailing-comma support.

Pi parser verification: current `settings-manager.ts` uses `JSON.parse(stripBom(content))`; MCP `src/extensions/mcp/config.ts` also uses `JSON.parse`. Both Pi settings definitions therefore use strict `json`, not `jsonc`. Source: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/settings-manager.ts and https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/extensions/mcp/config.ts .
