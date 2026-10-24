# NextProb official content

This repository distributes model lists, presets, workspace instructions, templates, component templates, and official agent skills to NextProb projects. NextProb downloads templates and skills together from the repository archive; each family has its own version manifest and installation policy.

## Official skills

`skills/manifest.json` lists official skill versions, minimum compatible app versions, and supported project-config versions. `skills/nextprob/` is the portable Agent Skills package for NextProb project settings and workspace extensions. Its entry point is `SKILL.md`; detailed documentation, starter assets, the default config, and its schema are included as relative resources.

Extension guidance lives in `skills/nextprob/references/extensions.md`, with a reusable tool-wrapper plugin in `skills/nextprob/assets/extension-demo/`. Agents copy the example into user-owned workspace folders before customizing it. Extension support requires NextProb 0.4.0 or later; the skill retains its existing settings compatibility for older apps. Update this maintained package first, then refresh the app's bundled snapshot with the command below.

NextProb installs the package automatically into a project's `.agents/skills/nextprob/` and `.claude/skills/nextprob/`. Codex discovers the first location, Claude Code discovers the second, and OpenCode recognizes both. No manual skill installation is required. The app preserves user-owned folders and edits; installing guidance does not create or change the user's `nextprob.config.json`.

When changing the skill, increment its manifest version. If instructions require a newer app or config format, update the compatibility fields too. Keep examples within the runtime's supported fields and rule operators.

Display defaults are maintained in `settings/project-config.default.json`. Shared official file and folder exclusions are maintained separately in `settings/note-exclusions.json`. Configuration schemas are generated from NextProb's implementation. From a sibling `html-notes-app` checkout, run:

```sh
npm run sync:official-skills -- ../hs-update-model-list/skills
npm run check:official-skills
```

This imports the resource-owned defaults, mirrors the Sidebar form's default sections, and refreshes the generated assets here and the app's bundled offline snapshot. Built-in layout defaults use this snapshot. Official exclusions also travel through the existing versioned settings cache: they update the active sidebar when downloaded and persist for offline startup, including projects with saved section arrays. Commit the content changes and the matching app snapshot together in their respective repositories. Publishing the content repository makes compatible remote updates available; the bundled copy lets the app install skills without a network connection.


## Official note exclusions

To add an official filename or folder, edit `settings/note-exclusions.json` (`version: 1`, `hiddenFiles`, `hiddenFolders`) and increment `settings/catalog.json`'s publication `revision`. Publish these resources together. The existing content archive download, compatibility selection, immutable cache, and settings-change notifications deliver the rules; there is no separate updater. No app rebuild or project-file rewrite is needed for future list edits after this runtime support is installed. Keep `minAppVersion` compatible with the runtime capabilities used by the publication.

Filenames match files at every depth; file paths and folder paths match exact project-relative locations. The Sidebar editor shows the complete effective lists in two editable fields: **Excluded folders** and **Excluded files**. Default and user entries are combined, and users can remove any default. Project files store additions in `hiddenFiles` / `hiddenFolders` and explicit removals in `shownFiles` / `shownFolders`. Existing saved lists stay compatible. Resource updates add new defaults without restoring entries the user explicitly removed; removals survive an entry disappearing and later returning in the default list. Do not copy a merged default list into project additions on unrelated settings saves. Favorites and other list collections are unaffected. Invalid, incompatible, or stale packages leave the last working package available; older packages without the resource use bundled rules.

The app sync command mirrors this file into the app fallback and portable skills for releases. It does not generate the maintained list from app code, and running it is not required to publish a later exclusion-only update. Bump the skill manifest version if you also change portable skill content.

## Project settings definitions

`settings/catalog.json` contains the maintained, versioned built-in definitions for file-backed project settings shown by NextProb. Users customize their own project through its root `nextprob.settings.json`; local definitions extend these defaults or replace matching IDs. Local schema paths are relative to the project root. Valid local edits hot reload, invalid edits retain the last valid local definitions for that session, and deletion removes local customizations. The installed NextProb skill teaches this user workflow without requiring a content repository checkout. The target files own their values; definitions supply discovery paths, labels, descriptions, reusable editor formats, creation templates, schemas, and managed-section markers. Maintainers can add a shipped resource supported by an existing editor by adding a definition and any referenced schema here. User-specific additions belong in the user's project, with no application changes or snapshot commands. `settings/catalog.schema.json` documents the contract. New runtime behavior or parser capabilities can still require application changes.

From the NextProb application repository run `npm run sync:official-skills -- ../hs-update-model-list/skills` to refresh generated schemas, app offline definitions, and the agent-reference assets inside the NextProb skill. Do not edit the generated `skills/nextprob/assets/project-settings/` copies. Increment the NextProb skill manifest version when its content changes and run `npm run check:official-skills` before packaging.

The default Sidebar settings page uses a reusable declarative form (`ui.layout`): common controls first, per-section disclosures, and collapsed advanced options. Other settings can use the same controls without app changes. See `skills/nextprob/references/settings-forms.md` for the contract and `skills/nextprob/assets/settings-demo/` for the portable demo. This layout and section visibility require NextProb 0.3.2 or later; the skill manifest enforces that compatibility.

NextProb 0.3.3 adds task-based pages for exclusions, instructions, skills, tool settings, editor conventions, and settings registration. `skills/nextprob/references/settings-pages.md` defines the complete resource policy, including exclusions. The portable settings demo now covers all pages. Folder contents load on demand; supporting package files stay inside skill details.

Settings catalogs declare a positive `revision` (publication order) separately from their `version` (file format), plus `minAppVersion`. Increment the revision for every published catalog or referenced-schema change. NextProb 0.3.4+ selects the newest compatible bundled/cached catalog, prefers bundled content at equal revisions, and ignores older or incompatible downloads. Catalogs without revision metadata count as revision zero. Project overrides remain independent of publication selection.

## Settings HTML interface

NextProb 0.3.5 adds declarative `agents` profiles and `agentCategory` pages. Built-in profiles for Claude, Codex, Gemini CLI, OpenCode, and Pi belong in `settings/catalog.json`; the app provides the generic engine and ships synchronized offline copies. Users can add, edit, and remove custom registrations through AI assistance, stored in their project's `nextprob.settings.json`, without deleting their agent files. Shared paths appear once. See [verified native paths and sources](settings/AGENT-PATHS.md) and the [profile contract](skills/nextprob/references/settings-pages.md#agent-profiles-035).


`settings/ui/` is the maintained source of the default settings HTML note, stylesheet, bootstrap, and reusable renderer. `ui/manifest.json` declares the settings bridge API version, minimum compatible application version, and every asset in the publication. The application owns its bridge, authorization, validation, persistence, and conflict handling; this repository owns how the default interface presents those capabilities.

Edit these resources here, increment `settings/catalog.json`'s publication `revision` for a UI change, and run the sibling app's `npm run sync:official-skills -- ../hs-update-model-list/skills`. This generates the app's offline `project-settings/ui/` snapshot and portable skill reference assets. Do not edit those generated copies. Run `npm run check:official-skills` in the app before packaging. A publication includes its catalog, schemas, manifest, and complete UI together; compatible downloaded publications remain cached for offline use.

Projects can choose their own HTML note through Project Settings, create an editable copy, reload their interface, or restore the maintained default. The public `window.settings` API is the compatibility boundary. Custom HTML remains user-owned and is not replaced by content updates. Shared default assets used by an editable copy follow the active compatible publication.
