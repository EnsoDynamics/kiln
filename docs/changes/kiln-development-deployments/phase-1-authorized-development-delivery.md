# Phase 1: Authorized development delivery

**Closed:** 2026-10-24

**Parent PRD:** [Kiln development deployments](kiln-development-deployments-prd.md)
**Technical design:** [Kiln development deployments](kiln-development-deployments-technical-design.md) — Authorization and Persistence; Session Contract and Delivery Interface; Evidence and Completion; Continuing the Assigned Branch; Display Contract; Verification and Criteria Coverage; Supersession Boundary.
**Phase plan:** [Implementation order, baseline and proof allocation](kiln-development-deployments-phase-plan.md).

## Summary
Let a person approve exact development targets before Start and let Kiln deliver, verify, recover and continue the work through a complete execution. Finish with accurate delivered and remaining-review results for every repository.

## Acceptance criteria covered
AC-PERMIT-01, AC-PERMIT-02, AC-PERMIT-04, AC-DEV-01, AC-DEV-02, AC-DEV-03, AC-DEV-04, AC-DELIVER-01, AC-DELIVER-02, AC-DELIVER-03, AC-DELIVER-04, AC-RECOVERY-01, AC-RECOVERY-02, AC-RECOVERY-03, AC-DISPLAY-01, AC-DISPLAY-02, AC-DISPLAY-03.

## Out of scope for this phase
Remembered choices and Needs you grants/activation recovery (Phase 2). The constraints owned here also apply to that phase; an uncovered target remains unauthorized and Needs you names the missing approval.

## Phase dependencies
None.

## Phase-specific notes
Deliver the browser-to-session-to-CLI workflow, including schema migration, both providers' authoritative evidence, checkpoint/re-split recovery, branch continuation, repository dependency order and finalization. Use the phase plan's Phase 1 proof rows and **Implementation boundaries**. The shared evaluator must govern finalization, Check again, resume and reopen before this phase closes; final browser/terminal results ship with it. Establish disposable non-production proof resources first; do not postpone real boundary proof to Phase 2.

## Implementation evidence

[Phase 1 proof results](kiln-development-delivery-proof-results.md) record the real provider/GitHub/browser executions, acceptance coverage and complete verification gates. This phase implements initially authorized executions; preference reuse and Needs you grants/activation remain Phase 2.
