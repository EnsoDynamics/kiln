# Phase 4: Home screen and PRDs started by hand

**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "What `kiln run` accepts" (a PRD directory with no phase documents, a branch that holds a PRD directory, a method run part-way through); "Rows" (the plan before Start while the standing will be unknown); "The Home Screen"; the "How the home screen opens a PRD", "Keeping the home list current" and "What source material counts as written from" decisions; "Interfaces" (the home server's routes and the home list, `kiln`, `kiln new`); "Data Models" (home state); "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
`kiln` with nothing named, or `kiln new`, opens a home screen for the repository or folder of repositories it was run in, listing source material ready to start, material one step from ready, every PRD under way with the stage it reached, and quieter PRDs folded away, and opens each in its own Kiln. A PRD started by hand, on the shared branch or a branch of its own, continues from where it stands. The README and this repository's agent instructions describe the requirements stages.

## Acceptance criteria covered
AC-BEGIN-04, AC-BEGIN-08, AC-HOME-01, AC-HOME-02, AC-HOME-03, AC-HOME-04, AC-HOME-05, AC-HOME-06, AC-HOME-07, AC-HOME-08, AC-HOME-09, AC-HOME-10, AC-HOME-11, AC-HOME-12, AC-HOME-13, AC-GUIDE-01, AC-BEGIN-01 (also applies to this phase's work)

## Out of scope for this phase
Nothing later in the plan. The changelog entry and the release wait for the PRD's audits and pull request (design, Delivery, "After the build").

## Phase dependencies
1 (run identity, the source material start paths and requirements start checks); 2 (feedback, which the guide describes); 3 (the plan before Start and the plan read the home screen starts).

## Phase-specific notes
- The branch-holding test is shared by AC-BEGIN-08 and the home screen's choice of which copy of a PRD to read.
- HOME-004 is open with the stakeholder; build its proposed answer.
- Real-session proof from Delivery owned here: a stage session continuing a PRD started by hand.

## What Phase 3 hands Phase 4
- The plan read lives in the PRD's Kiln: `Engine.refreshRequirementsPlan` decides when to read (fingerprint, saved failure, billing wait) and `startPlanRead` runs it. The parts with no engine in them are `src/requirements/plan.ts` (plan file, `methodOf`, `takePlanLock`) and `src/requirements/plan-read.ts` (`runPlanRead`). The home process has no engine, so it starts its read from those two modules. It never starts the read on a metered route.
- `plannedRows(plan, state, { fromStart: true })` in `src/requirements/rows.ts` lists every entry from the first, for the plan before Start headed by `standsAt`. It is not yet called anywhere. An unknown standing already shows the `kiln:next` row first (`requirementsView` in `src/engine/snapshot.ts`).
