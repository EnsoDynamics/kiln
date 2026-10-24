# Phase 2: Automatic delivery-audit cycles

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: Architecture and Scheduling; Acceptance checks; Provider Sessions and Development Delivery; Recovery and Upgrade; Progress and Detail Contract; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically audit completed plans, implement delivery-audit completion phases and audit the repaired work again. Show the activity sequence and preserve its progress, permissions and required development evidence through interruptions and upgrades.

## Acceptance criteria covered
AC-AUDIT-01, AC-LOOP-01, AC-LOOP-02, AC-LOOP-03, AC-LOOP-04, AC-RUN-01, AC-RUN-02, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07.

AC-AUDIT-02 (also applies to this phase's work); AC-AUDIT-03 (also applies to this phase's work); AC-RUN-03 (also applies to this phase's work).

## Out of scope for this phase
Test-remediation batching/continuations, retained-grade reassessment after remediation and test-discovered implementation repair routing (Phase 3).

## Phase dependencies
1 (report admission, snapshots, evidence catalog and durable audit records).

## Phase-specific notes
Include generic dispatch and prompts for both audit kinds and exercise the clean, already-adequate test-audit path before final delivery. Phase 3 owns the full test-remediation criteria. Introduce activity-aware UI, recovery, upgrade adoption and development ownership here with the first automatic audit workflow; do not postpone those safety boundaries to a later phase. Use the plan's sequential verification boundary and retain the existing recovery-authority behavior identified in the investigation.
