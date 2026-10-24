---
name: nextprob
description: Explain or customize NextProb project settings and workspace extensions, including HTML settings interfaces, sidebar configuration, ignore rules, agent instructions, and user-defined plugins, hooks, commands, and background services.
---

# NextProb

NextProb reads settings directly from project files. Change those files for user requests; the UI is another editor over the same source of truth.

For workspace automation, custom plugins, hooks, commands, background services, or connecting existing sync/publishing tools, read [workspace extensions](references/extensions.md). This feature requires NextProb 0.4.0 or later; older versions can still use this skill's settings guidance. Choose the simplest mechanism that fits the user's workflow and reuse existing tools when appropriate. Explanation-only requests do not require file changes.

When users ask how Project Settings works or how to make a settings interface for their project, read [HTML settings interfaces](references/settings-html.md). Distinguish changes to actual values, catalog metadata, and HTML presentation. Custom HTML uses the application’s versioned settings bridge; ordinary notes do not receive settings access.

For catalog pages, read [task-based settings pages](references/settings-pages.md) for the default resource policy, page composition, package browsing, and exclusions. For individual forms, read [settings form layouts](references/settings-forms.md) for the declarative contract and sidebar demo. Metadata edits suit labels, groups, and form layouts; user-owned HTML suits custom navigation, styling, and interactions. Preserve the user’s chosen approach.

For ignore rules, agent instructions, or other project settings, read [file-backed settings](references/project-settings.md). It also explains how to register additional settings files or change their presentation in the user’s own project. For sidebar customization, use `nextprob.config.json` and the guidance below.

Read [project configuration](references/project-config.md) before changing sidebar configuration. It documents supported fields, filtering rules, defaults, and examples.

Inspect and preserve an existing config. When the user requests customization and the config is missing, start with `{"version": 1}` and add the requested overrides. Consult [the default configuration](assets/project-config.default.json) to understand omitted values without persisting every default. Do not create a config merely because this skill is installed or read.

Use [the version 1 schema](assets/project-config.schema.json) for structural validation. Runtime validation also restricts rule operators, metadata variables, section IDs, and collection references. Use the documented subset rather than adding arbitrary JavaScript or unsupported fields.

NextProb manages this installed skill folder. Put requested configuration changes in project files, custom interfaces in project HTML notes, and custom plugins in user-owned workspace folders. Copy starter assets out of this package before customizing them; keep personal instructions and custom skills separate from it.
