# Phase 2a: Check current plans on completed features

**Closed:** 2026-10-29

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md)
**Parent phase:** [Phase 2](phase-2-completed-feature-discovery.md)

## Summary
Reopening a completed feature and checking again read the current shared and delivery-base plans, preserving delivery history and showing changes, conflicts or failed checks without starting implementation.

## Acceptance criteria covered
AC-FIND-01, AC-FIND-02, AC-FIND-04, AC-CONTINUE-03.

## Out of scope for this phase
External-completion classification, preparation extraction/authority and executable-offer readiness (2b); acceptance and execution (3).

## Phase dependencies
1 (retained baselines, comparison and coherent-source contracts).

## Phase-specific notes
Own legacy completed-baseline recovery and CLI/server/browser check triggers. A current-source observation is not an executable proposal; Phase 2b owns proposal readiness. Prove failed checks retain explicitly earlier results and never publish a fresh zero.

## Phase 1 handoff

Phase 1 establishes private schema 13, after integrating the current live-session-control schema 12 change. Reuse the immutable retained-plan and coherent-source contracts in `src/engine/plan-reconciliation.ts`; do not replace the accepted pointer before comparing candidates. Historical completed-feature recovery remains this phase's responsibility. Active legacy recovery verifies earlier Kiln phase documents against their recorded published revisions; an initial active observation is not historical scope proof.

[Active-plan validation](kiln-active-plan-handback-validation.md) records the actual Claude/Codex, Git, browser and workflow evidence. Keep the existing terminal-ownership admission ahead of handback checks and dispatch. Split-parent repository additions retain Multi-Repo Delivery AC-ADD-04 behavior for remaining children.

## Current-code recovery handoff

The 2026-10-29 Phase 1 recovery reconciles current develop and uses schema 13. Reuse the current provenance-link contract, repository-completeness checks and audit-failure retention; the validation record distinguishes historical evidence from the recovery gates. Continue from the recovered committed baseline when integration publication is held. Current-code source and command-owner contracts govern subsequent schema changes.

## Completion evidence

[Completed-plan checks validation](kiln-completed-plan-checks-validation.md) records the real Git, CLI, HTTP and desktop/narrow browser evidence, independent review and test hardening, and exact full-run/recheck accounting. Schema 14 adds observations without executable continuation authority. Phase 2b owns the next planned capability.
