# Phase 3: Continue a completed feature safely

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — relevant sections: Readiness and Planned Preparation; Continuation Acceptance and Recovery; Interfaces; Data Models and Migration; Integration Points; Validation and Criteria Coverage.

## Summary
Accepting the displayed additional plan starts a fresh execution from current delivery bases while preserving earlier delivery history. Kiln performs authorized prerequisite preparation and its independent checks before implementation, then completes the revised plan through normal audits and delivery.

## Acceptance criteria covered
AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-02, AC-CONTINUE-04, AC-CONTINUE-05.

## Out of scope for this phase
Everything outside the parent PRD; no later implementation phase is reserved for unfinished acceptance, permission, recovery or verification behavior.

## Phase dependencies
1 (active-run revised-plan scheduling and completion invalidation); 2 (completed-feature discovery, bound proposals, readiness and earlier-work reconciliation).

## Phase-specific notes
Own the remaining continuation/grant/preparation/replay/history proof rows and complete the seven-state browser coverage, both actual providers' preparation-to-implementation proofs and revised-scope delivery proof. Read-only extraction from Phase 2 is reused; all mutation, engine-owned verification and crash recovery needed to admit implementation land together here. Complete reverse supersession pointers as the changed behaviors land.
