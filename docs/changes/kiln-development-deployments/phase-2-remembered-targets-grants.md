# Phase 2: Remembered targets and execution grants

**Parent PRD:** [Kiln development deployments](kiln-development-deployments-prd.md)
**Technical design:** [Kiln development deployments](kiln-development-deployments-technical-design.md) — Authorization and Persistence; Session Contract and Delivery Interface; Evidence and Completion → One evaluator at every transition; Display Contract; Verification and Criteria Coverage; Supersession Boundary.
**Assumptions:** [AUTH-001 provisional grouping; AUTH-002 validated](kiln-development-deployments-assumptions.md).
**Phase plan:** [Implementation order, baseline and proof allocation](kiln-development-deployments-phase-plan.md).

## Summary
Let a person explicitly reuse saved development targets for a new PRD or approve a missing target while an execution is stopped. When that first grant activates a restricted execution, recover earlier work with the same evidence checks and preserve its history.

## Acceptance criteria covered
AC-PERMIT-03, AC-PERMIT-05.

AC-PERMIT-01, AC-PERMIT-02, AC-PERMIT-04, AC-DEV-01, AC-DEV-02, AC-DEV-03, AC-DEV-04, AC-DELIVER-01, AC-DELIVER-02, AC-DELIVER-03, AC-DELIVER-04, AC-RECOVERY-01, AC-RECOVERY-02, AC-RECOVERY-03, AC-DISPLAY-01, AC-DISPLAY-02, AC-DISPLAY-03 (each also applies to this phase's work; owned by Phase 1).

## Out of scope for this phase
No remaining planned PRD scope is deferred. Production authority, automatic permission inferred from PRD storage and changes to published engineering skills remain outside the PRD.

## Phase dependencies
1 (execution authorization, checkpoint interface/recovery, current completion evaluator and repository delivery results).

## Phase-specific notes
Use the phase plan's Phase 2 proof rows. First-grant activation must exercise earlier completed leaves and the stopped leaf through real provider recovery, beyond merely saving a target. AUTH-001 proceeds at its recorded confidence without treating the requirements repository as project identity; do not reopen validated AUTH-002.
