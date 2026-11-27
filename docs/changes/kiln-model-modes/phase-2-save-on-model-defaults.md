# Phase 2: Save on Model defaults

**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md) — relevant sections: the decisions on what a PRD's own settings hold, the shape of a save, browser Back and Forward with a draft, a save for every PRD from a PRD with its own settings, Restore Kiln's defaults, `kiln model-defaults` for one PRD, and the fallback in command and status output; "Settings in Force" (unreadable own settings); "Saving" except "A choice in the Models block"; `GET` and `POST /api/model-defaults` in "HTTP" (the `save` and `useDefaults` bodies); "Command line"; "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-model-modes-phase-plan.md)
**Model tier:** demanding — AC-SAVE-03 requires a save from a PRD with its own settings to write only what changed into two files, checked before either is written and safe to repeat (repeated work, rules that interact; a wrong save overwrites the person's saved settings, which saving again doesn't restore)

## Summary
Model defaults offers Recommended model for each phase and One model for everything, and Never, a threshold, or For everything for the fallback. Every change, Restore included, waits in a draft until the person saves it for every PRD on this computer or for this PRD only; a PRD with its own settings says so and offers Use my defaults here; a button back to the PRD never drops unsaved changes silently. The `kiln model-defaults` commands save the same things, for every PRD or with `--prd` for one.

## Acceptance criteria covered
AC-MODE-01, AC-WHEN-01, AC-SAVE-01, AC-SAVE-02, AC-SAVE-03, AC-SAVE-04, AC-SAVE-05, AC-CLI-01

## Out of scope for this phase
The two choices in the Models block on Documents found and the run's settings, its `choose` body and the comparison that returns a PRD to the defaults (Phase 3). The public guide (Phase 3).

## Phase dependencies
1 (the schema 2 settings files and their reader over Model defaults and a PRD's own settings, the fifth row, `fallback.use`, and the snapshot's `source`).

## Phase-specific notes
- The change module that applies a `SettingsChange` to one file, with its checks and `restore`, is the one Phase 3's `choose` sends through.
- Mockups 1 to 4 and mockup 7 state A are this phase's.
