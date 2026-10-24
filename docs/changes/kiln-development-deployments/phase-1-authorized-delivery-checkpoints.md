# Phase 1: Authorized delivery checkpoints

**Parent PRD:** [Kiln development deployments](kiln-development-deployments-prd.md)
**Technical design:** [Kiln development deployments](kiln-development-deployments-technical-design.md) — Authorization and Persistence; Session Contract and Delivery Interface; Evidence and Completion; Continuing the Assigned Branch; Display Contract; Verification and Criteria Coverage; Supersession Boundary.
**Phase plan:** [Implementation order, baseline and proof allocation](kiln-development-deployments-phase-plan.md).

## Summary
Let a person approve exact development targets before Start and let Kiln sessions deliver required checkpoints, distinguish deployment from verification, recover interruptions and continue building safely in the assigned workspace.

## Acceptance criteria covered
AC-PERMIT-01, AC-PERMIT-02, AC-PERMIT-04, AC-DEV-01, AC-DEV-02, AC-DEV-03, AC-DEV-04, AC-DELIVER-01, AC-DELIVER-02, AC-RECOVERY-01, AC-RECOVERY-02, AC-RECOVERY-03, AC-DISPLAY-01, AC-DISPLAY-02.

## Out of scope for this phase
Cross-repository delivery order, complete remaining-work finalization and final summaries (Phase 2); remembered choices and Needs you grants/activation recovery (Phase 3). The constraints owned here apply to both later phases.

## Phase dependencies
None.

## Phase-specific notes
Deliver the browser-to-session-to-CLI checkpoint loop, including schema migration, authoritative evidence from both providers, all checkpoint/re-split recovery guards and branch continuation. Use the phase plan's Phase 1 proof rows and **Implementation boundaries**; final-result cases not yet supported remain unresolved. Start by establishing disposable non-production proof resources, not by postponing provider/GitHub proof until a later phase.
