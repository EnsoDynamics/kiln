# Phase 3: Automatic test remediation

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: One completion decision; Audit Report and Local Interface; Current Work and Invalidation; Provider Sessions and Development Delivery; Recovery and Upgrade; Progress and Detail Contract; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically strengthen inadequate test evidence and continue unfinished test-audit work in fresh sessions. Return test-discovered implementation gaps and direct fixes through delivery audits, then reassess test evidence before final completion.

## Acceptance criteria covered
AC-AUDIT-04, AC-TEST-01, AC-TEST-02, AC-TEST-03, AC-TEST-04.

AC-AUDIT-02 (also applies to this phase's work); AC-AUDIT-03 (also applies to this phase's work); AC-RUN-03 (also applies to this phase's work); AC-LOOP-04 (also applies to this phase's work); AC-RUN-01 (also applies to this phase's work); AC-RUN-02 (also applies to this phase's work); AC-RUN-04 (also applies to this phase's work); AC-RUN-05 (also applies to this phase's work); AC-RUN-06 (also applies to this phase's work); AC-RUN-07 (also applies to this phase's work).

## Out of scope for this phase
New product scope, changes to installed method skills, unplanned infrastructure changes and production release authority remain outside this PRD.

## Phase dependencies
1 (typed test reports and evidence/currentness checks); 2 (activity dispatch, repair loop, recovery, progress and development obligations).

## Phase-specific notes
Reuse Phase 2's delivery repair path for test-created completion phases and direct implementation fixes. Re-prove recovery, currentness, progress and retained development obligations for continuations and reassessment; the plan's closeout requires whole-PRD audits after all planned phases close.
