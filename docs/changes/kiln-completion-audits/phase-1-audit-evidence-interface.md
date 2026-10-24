# Phase 1: Audit evidence interface

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: Audit Report and Local Interface; Current Work and Invalidation; Provider Sessions and Development Delivery; Recovery and Upgrade; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Accept or refuse whole-PRD audit reports through Kiln's packaged CLI and authenticated local server, using actual provider evidence and current repository content. Retain the checked work and accepted results so later execution steps can rely on them.

## Acceptance criteria covered
AC-AUDIT-02, AC-AUDIT-03, AC-RUN-03.

## Out of scope for this phase
Automatic audit/repair dispatch, activity progress screens, execution-wide upgrade adoption and audit-owned development obligations (Phase 2); automatic test-remediation continuations and test-discovered repair routing (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
Include both audit kinds' typed report/evidence contracts, snapshot classification, provider provenance, sidecars and the additive storage/migration mechanics needed for real CLI/server admission. Prove the interface with fixture-assigned activities and actual provider report producers as described in the plan; do not add a user-facing manual audit-launch mode. Scheduling integration re-proves these constraints in subsequent phases.
