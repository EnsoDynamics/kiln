# Phase 8: Complete the row marks and the fallback facts

**Added by delivery audit:** 2026-11-25, after every planned phase and Phases 5 and 6 closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "When an Activity Starts" (the row table, "A phase finished in an earlier execution", "The planned Preflight row"), "Snapshot", "Data Models and Migration" (the `kept` test)
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
Finish four criteria whose rows or details lose a mark or a fact in some states. A changed or kept choice should stay marked **Changed by you**: while it launches, after it starts, and on the Preflight and pull request rows. The note that Claude Code isn't installed should stay while a launch is under way. The Continue offer's Preflight row should show the choice the continuation will use. A pull request session that started on the fallback should keep that in its detail. A phase finished in an earlier execution should keep its **Fallback** tag.

## Acceptance criteria covered
AC-PICK-03 (completes it; owned by phase 3), AC-KEEP-02 (completes it; owned by phase 3), AC-DEFAULT-04 (completes it; owned by phase 1), AC-FALLBACK-03 (completes it; owned by phase 4)

## What the audit found missing
- **AC-PICK-03, AC-DEFAULT-04:** While a launch of a not-started activity is under way, its Will run on row drops **Changed by you** and the note that Claude Code isn't installed. That runs from the saved decision to the first response.
  - Where: `src/engine/engine.ts` `Engine.activityModel` (the `decided` branch) and `src/engine/activity-models.ts` `modelView` (the `state.liveSession` branch).
  - Both return the choice without `from` or `claudeCodeMissing`. The values are saved in `decided.launch` and the session's `launch`.
- **AC-PICK-03:** A phase the person changed loses **Changed by you** once it starts. Mockup 3 draws "Running on … · Fallback · Changed by you".
  - Where: `modelView`'s `running_on` and `ran_on` branches give no `from`. Take it from the starting session's `launch.from`.
  - `view/src/components/RowModel.svelte` draws the mark only when `offered`, so a row without Change never shows it.
- **AC-KEEP-02:** The Preflight row and the pull request row (planned and allocated) run on a kept choice but never show **Changed by you**.
  - Same `offered` gate in `RowModel.svelte`. These rows have no target or `change`: `PhasePlan.svelte` `modelTarget`, `ModelChanges` `targetOf`, the Documents found `preflight` snippet, and `snapshot.ts` `plannedRows`, `preflightRow` and `preflightPlanned`.
- **AC-KEEP-02:** On a finished run's Continue offer, the planned Preflight row shows the record's `kept` choice even when the continuation will drop it as Kiln's current default.
  - Where: `src/engine/snapshot.ts` `preflightPlanned` → `engine.activityModel(PLANNED_PREFLIGHT_KEY)`. It never applies the `continuedModelChoices` test (`src/models/keep.ts`).
- **AC-FALLBACK-03:** A pull request session that started on the fallback has no fallback facts in its detail once it stops, waits or finishes.
  - Where: the pull request row built in `src/engine/snapshot.ts` `phaseViews` is never given `details`, so `addFallbackDetails` skips it (`if (!row.details) continue`).
  - `view/src/screens/PhaseDetail.svelte` then has neither `row.details.fallback` nor `current`.
- **AC-FALLBACK-03:** In a continued run, a phase that started on the fallback and finished in an earlier execution shows **Ran on** with no **Fallback** tag.
  - Where: `src/engine/engine.ts` `earlierExecutionModel` builds `{ state: "ran_on", choice: sessionChoice(ran) }`. It never reads the `launch.fallback` of that execution's starting session.

## Phase dependencies
1 (the resolver and the not-installed note); 3 (Change, Use the default and the kept choice); 4 (the saved launch decision and the fallback facts); 5 and 6 (`detailsFallback`, `factsKeyOf`)
