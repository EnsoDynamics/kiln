# Phase 3: The plan and stage models

**Closed:** 2026-11-27

**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "The Requirements Plan" ("Reading it", "Rows"); "Models"; "Interfaces" (the `kiln-plan` block, `POST /api/requirements-plan/read`, `POST /api/model`, `/api/model-defaults`, the snapshot's `plan`, `rows[]` and `notice`, PRD totals, `kiln model`, `kiln model-defaults`); "Data Models" (the requirements plan file, stage keys, the Model defaults file's `skills`); "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Kiln reads the installed method's requirements stages once per computer, in one short session, and keeps that plan until the method changes. Before Start and while running, every stage shows in order with its model, time and commit, followed by the build, and a method updated mid-run changes the stages still to come, not the work done. The person can change any stage that hasn't started, remember that choice for every PRD, and do both from a terminal.

## Acceptance criteria covered
AC-PLAN-01, AC-PLAN-02, AC-PLAN-03, AC-PLAN-04, AC-PLAN-05, AC-PLAN-07, AC-STAGE-03, AC-MODEL-01, AC-MODEL-03, AC-MODEL-04, AC-MODEL-05, AC-STAGE-04 (also applies to this phase's work)

## Out of scope for this phase
The home screen, including the plan read it starts when it opens, and PRDs started by hand, including the plan headed by where the PRD stands before Start (Phase 4).

## Phase dependencies
1 (the driver, the report, the standing and cursor fields, and the two Model defaults rows); 2 (feedback listed on the rows).

## Phase-specific notes
- The rows from "Rows" replace Phase 1's no-plan form wherever a plan exists; that form stays for a plan being read or failed.
- The plan read's Codex launch profile and readiness change are in "Changes to Earlier Designs" (Kiln Codex Support). This phase's share of AC-STAGE-04 is the plan read's billing check.
- Real-session proof from Delivery owned here: a plan read on each agent.
