# Phase 3: Continue a completed feature safely — split into 3a–3b

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — relevant sections: Readiness and Planned Preparation; Continuation Acceptance and Recovery; Interfaces; Data Models and Migration; Integration Points; Validation and Criteria Coverage.

## Summary
Accepting the displayed additional plan starts a fresh execution from current delivery bases while preserving earlier delivery history. Kiln performs authorized prerequisite preparation and its independent checks before implementation, then completes the revised plan through normal audits and delivery.

## Split into

| Phase | What it does | Depends on |
|---|---|---|
| [3a: Continue with integrated prerequisites](phase-3a-integrated-feature-continuation.md) | Continue a ready plan whose prerequisites are integrated, preserving earlier executions and completing the new work through normal audits and delivery. | 1 (revised-plan scheduling and completion invalidation); 2 (bound discovery proposals, readiness and earlier-work reconciliation). |
| [3b: Continue through planned preparation](phase-3b-planned-preparation-continuation.md) | Continue a plan that needs prerequisite preparation, with exact target grants when required and independent verification before dependent implementation. | 3a (recoverable acceptance, fresh execution, history and delivery); 2b2 (preparation bindings and readiness). |

Split 2026-10-30 at implementation sizing: the integrated-prerequisite workflow can be delivered and proved independently before the preparation-only provider turn and engine-owned verifier extend it.

## Acceptance criteria covered
AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-05, AC-CONTINUE-06, AC-CONTINUE-07, AC-CONTINUE-08, AC-CONTINUE-09. Compound AC-CONTINUE-02 and AC-CONTINUE-04 were retired into the new labels without changing their combined intent.

## Out of scope for this phase
Everything outside the parent PRD; no later implementation phase outside these children is reserved for unfinished acceptance, permission, recovery or verification behavior.

## Phase dependencies
1 (active-run revised-plan scheduling and completion invalidation); 2 (completed-feature discovery, bound proposals, readiness and earlier-work reconciliation).
