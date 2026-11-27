# Phase 3: Models block and guide

**Closed:** 2026-11-27

**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md) — relevant sections: "Saving", "A choice in the Models block" and "Use my defaults here"; the `choose` body and the Models block paragraph in "HTTP"; `settings.models` in "Snapshot"; the AC-GUIDE-01 row of "Criteria Coverage"
**Phase plan:** [Execution order](kiln-model-modes-phase-plan.md)
**Model tier:** standard

## Summary
On Documents found and in a running or paused run's settings, the Models block offers Recommended model for each phase, with a line saying when the fallback is used, and One model for this PRD, with its agent, model and effort. A choice there applies to this PRD alone at once, and the PRD goes back to following the defaults when its settings match them again. The Models card and the Folder missing panel show the choice in force without the controls. Kiln's public guide explains the two modes, the three fallback settings, the new row and saving for one PRD.

## Acceptance criteria covered
AC-PRD-01, AC-PRD-02, AC-GUIDE-01

## Out of scope for this phase
Nothing later; this is the last planned phase.

## Phase dependencies
1 (the snapshot's mode, one model, fallback setting and source, and the Audits line's `changedByYou`); 2 (the change module, creating a PRD's own settings, and `useDefaults`).

## Carried forward from Phase 2
- **The change module `choose` sends through.** `saveSettings(paths, "this_prd", change, lists)` in `src/models/model-defaults-edit.ts` applies a `SettingsChange` to this PRD's own settings and creates them from what Model defaults holds when there are none, with every check and refusal the page's save has; `useDefaults(paths)` removes them. `engine.settingsPaths` gives `paths`. Neither compares the PRD's settings with Model defaults afterwards: the comparison that returns a PRD to the defaults (SAVE-005) is this phase's, and belongs after a `choose` only, never after a save from the page or a `--prd` command.
- **The route.** `POST /api/model-defaults` takes `save` and `useDefaults` and answers 400 for `choose` (`settingsRequest` in `src/server/local-server.ts`). The view's calls are `saveModelDefaults` and `useModelDefaults` in `view/src/lib/api.ts`, which answer a `ModelDefaultsAnswer`; a 409 carries `source` and `canRestore`.
- **A mode goes with its one model.** `carried` in `src/models/settings-change.ts` adds the one model shown to a change of mode to `one_model`; the page and the commands both use it, and `choose` needs the same.
- **The editor's second callback exists.** `ModelEditor` takes `onpick`, called only from its control handlers; `onchange` still hears the editor's own adjustments. The one model's editor on Model defaults passes `onpick` into the page's draft.
- **A draft can be pending while the PRD's page shows.** Model defaults keeps its unsaved changes in page memory (`view/src/lib/model-defaults-draft.svelte.ts`) across the browser's Back. The Models block writes straight to the settings files; when Model defaults reopens it reads them again and keeps the pending changes over them.
- **The guide still describes the page before this PRD.** `README.md`, "Model defaults" and "The usage fallback", says the fallback is a switch, lists four rows and has changes take effect as they are made; `docs/kiln-command-line-and-bot-control.md` shows `fallback --on` and no `mode`, `use-defaults` or `--prd`. The commands' own help (`kiln model-defaults <subcommand> --help`) is current and is the source for the guide's command lines.
- **Tests.** `src/server/model-defaults-save-browser.integration.test.ts` has the helpers for driving the page in real Chrome and already follows a link named "Models for this PRD" or "Model defaults" back to the page; `src/server/model-settings-one-prd.integration.test.ts` drives the route with real files and a second PRD's engine. Each run of the built command line in `src/control/model-commands.integration.test.ts` costs about two seconds, because it reads both agents' model lists.

## Phase-specific notes
- Mockups 5 and 6 and mockup 7 states C and D are this phase's.
