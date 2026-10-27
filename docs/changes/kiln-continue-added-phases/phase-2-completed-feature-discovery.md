# Phase 2: Find added work on completed features

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

## Phase-specific notes
Ship a read-only discovery panel and CLI result through the real foreground engine/server/browser. Preparation/authority evaluation belongs here so readiness is independently verifiable; grant and continuation mutations follow in Phase 3. Own the corresponding discovery/classification proof rows and synthetic fixture inputs in the design, including legacy-baseline recovery; add only the supersession pointers made true here.
