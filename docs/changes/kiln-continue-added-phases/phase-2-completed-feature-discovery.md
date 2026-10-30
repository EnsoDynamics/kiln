# Phase 2: Find added work on completed features — split into 2a–2b

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — relevant sections: Plan Identity and Comparison; Source Reconciliation → Completed feature discovery; Readiness and Planned Preparation (observation, extraction and authority evaluation); Interfaces; Data Models and Migration; Validation and Criteria Coverage.

## Summary
Reopening or checking a completed feature shows the additional work, its readiness and the source checked above earlier delivery history. Kiln distinguishes an unchanged plan from a failed check or changes to previously completed work, without starting implementation.

## Acceptance criteria covered
AC-FIND-01, AC-FIND-02, AC-FIND-03, AC-FIND-04, AC-OFFER-01, AC-CONTINUE-03.

## Out of scope for this phase
Continue and Not now interactions, pre-acceptance target grants, durable acceptance, fresh workspace activation, preparation execution and additional delivery (Phase 3).

## Phase dependencies
1 (retained plan baselines, comparison rules, coherent-source reading and engine reconciliation).

## Split into

| Phase | What it does | Depends on |
|---|---|---|
| [2a: Check current plans on completed features](phase-2a-completed-plan-checks.md) | Reopening and manual checks compare current sources with retained delivery scope and expose changes or failures without starting work. | 1 (retained scope and coherent document reader). |
| [2b: Show added work and preparation readiness](phase-2b-added-work-readiness.md) | Classify external completion and evaluate documented preparation and existing authorization controls, then show the ordered offer above history. | 2a (current-source observations and historical comparison). |

Split 2026-10-29 at implementation sizing: original-conversation authority and multi-repository prerequisite proof form a separate read-only capability from checking current plan sources.
