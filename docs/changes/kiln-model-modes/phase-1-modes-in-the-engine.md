# Phase 1: Modes in the engine

**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md) — relevant sections: "Existing Code"; "Storage"; the decisions on where a PRD's own settings live, Model defaults' schema, the fifth row for someone who changed Audits, the per-PRD entry for the fifth row, the one model until the person picks, where For everything is applied, and what one model does to the fallback; "Settings in Force"; "Resolving a Choice"; "Launching"; "Settings files"; `POST /api/model` in "HTTP"; "Snapshot"; `kiln model --preflight-pr` in "Command line"; "Data Models"; "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-model-modes-phase-plan.md)
**Model tier:** demanding — AC-WHEN-02 requires the fallback for everything to win over a changed or kept choice while one model, a no-fallback row and a started activity each keep their own rule (rules that interact; a wrong result launches and bills on the account the person is sparing)

## Summary
With the settings saved in a file, Kiln runs every activity that hasn't started on one model, or on its fallback whatever usage reads, and shows that on every row, card and stop. The preflight, the pull request session and the merge and push sessions get a Preflight and pull request row and per-PRD entry of their own, changeable on their rows. Kiln reads a PRD's own settings in place of Model defaults when the PRD has them, and settings and records saved before the upgrade keep their meaning.

## Acceptance criteria covered
AC-MODE-02, AC-MODE-03, AC-WHEN-02, AC-WHEN-03, AC-ROW-01, AC-CARRY-01

## Out of scope for this phase
The two choices and three fallback settings on Model defaults, saving on Save, saving for one PRD, and the `kiln model-defaults` commands for them (Phase 2). The two choices in the Models block, and the public guide (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
- Settings come from written files in this phase: tests and the paid proofs write schema 2 `model-defaults.json` and `model-settings.json` directly. The settings-in-force reader over both files, its watch, `revision` and `launch.ownSettings` are built here so the resolver, launch, stops and snapshot read one function; Phase 2 writes the PRD's file and proves AC-SAVE-04 whole.
- Today's Model defaults page and `kiln model-defaults set` gain the fifth row (`preflight-pr`) and write schema 2, still saving as they change. Today's switch writes `threshold` or `never`. The page marks the First choice column skipped and the Fallback column in use from the saved setting; Phase 2 makes those marks follow the draft.
- `kiln model --preflight-pr` rides with `POST /api/model`'s `"preflight_pr"` target, which it shares; AC-CLI-01 is Phase 2's and proves it.
- Mockup 7 states B and E are this phase's.
- Both paid proofs in the technical design's Delivery section run in this phase.
