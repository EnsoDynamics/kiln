# Phase 2: Automatic delivery-audit cycles — split into 2a and 2b

**Parent PRD:** [Kiln automatic completion audits](kiln-completion-audits-prd.md)
**Technical design:** [Single governing design](kiln-completion-audits-technical-design.md)
**Plan:** [Implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically audit completed plans, implement completion phases and audit repairs again, preserving progress and development authority through interruptions and upgrades.

## Acceptance criteria covered
AC-AUDIT-01, AC-LOOP-01, AC-LOOP-02, AC-LOOP-03, AC-LOOP-04, AC-RUN-01, AC-RUN-02, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07.

AC-AUDIT-02, AC-AUDIT-03, AC-RUN-03 also apply to this work.

## Out of scope
Test-remediation batching/continuations, retained-grade reassessment and test-discovered repair routing remain Phase 3.

## Phase dependencies
1 (report admission, snapshots, evidence catalog and durable audit records).

## Split into

| Phase | What it does | Depends on |
|---|---|---|
| [2a Audit-owned development delivery](phase-2a-audit-development-delivery.md) | Accept audit-scoped development assessments and operations, retaining their obligations through recovery and repair assignment. | 1 (assigned audit identity, requirement snapshots and evidence admission) |
| [2b Automatic audit cycles and progress](phase-2b-automatic-audit-cycles.md) | Run and recover delivery audits, completion phases and the clean test-audit path, with activity progress and upgrade adoption. | 1 (report admission and currentness); 2a (audit development ownership and retained obligations) |

Split 2026-10-24 during implementation sizing: audit development ownership is independently exercised through the existing CLI/HTTP admission boundary before automatic scheduling uses it.
