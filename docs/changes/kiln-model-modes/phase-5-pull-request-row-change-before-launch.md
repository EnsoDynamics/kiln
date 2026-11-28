# Phase 5: Complete the pull request row's Change before the pull request session starts

**Added by delivery audit:** 2026-11-27, after every planned phase closed. It builds what earlier phases left out of the criterion below.
**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md) — relevant sections: "Snapshot", "HTTP"
**Phase plan:** [Execution order](kiln-model-modes-phase-plan.md)
**Model tier:** standard

## Summary
Make Change on the pull request row work while that row waits to start: once every phase and audit has closed and the pull request session is next, but before Kiln has launched it.

## Acceptance criteria covered
AC-ROW-01 (completes it; owned by phase 1)

## What the audit found missing
- **AC-ROW-01:** Change on the pull request row is refused while the pull request session is next but hasn't been launched. Kiln saves `nextActivityKey = "pr"` (`src/engine/engine.ts`, the routing around line 6474) before `launchSession` records the activity (`observeActivity`, around line 7051). A pause in between, or a `selection` stop recorded by `launchReadinessNow` before the launch, leaves the PR out of the activity history. In that state `phaseViews` in `src/engine/snapshot.ts` (the PR row literal, around line 1431) builds the row with no `kind`. `activityViews` passes it through unchanged as a pending row, and `plannedRows` adds no planned pull request row because a row with id `pr` already exists. `preflightPrControls` still offers Change. But `rowModelTarget` in `view/src/lib/models.ts`, called from `PhasePlan.svelte` and `ModelChanges.svelte`, turns a row with no kind into `{ phase: "pr" }`, and `checkModelChange` in `src/engine/engine.ts` refuses that with 422 ("pr isn't a phase Kiln builds in this plan"). Meanwhile Needs you tells the person to change the choice on "the Preflight row or the pull request row in the phase plan". The Preflight row (`preflightRow`, kind `preflight`) and the merge row (`mergeRow`, kind `merge`, no Change) already set their kind. The push row offers no Change.

## Phase dependencies
1 (the Preflight and pull request choice, `preflightPrControls`, and `POST /api/model`'s `"preflight_pr"` target)
