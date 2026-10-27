# Phase 1: Continue added work after handback

**Closed:** 2026-10-27

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — relevant sections: Plan Identity and Comparison; Source Reconciliation → Active execution handback; Continuation Acceptance and Recovery → Start, interruption and completion (active-run additions); Data Models and Migration; Validation and Criteria Coverage.

## Summary
When control returns from a manual session, Kiln reconciles the revised plan and automatically runs the remaining eligible work after existing completion checks pass. The page shows additions or the source discrepancy preventing advancement.

## Acceptance criteria covered
AC-HANDBACK-01, AC-HANDBACK-02, AC-HANDBACK-03, AC-HANDBACK-04.

## Out of scope for this phase
Discovery and readiness on completed features (Phase 2); accepting a completed-feature continuation, fresh execution history and planned preparation (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
Establish the shared baseline/comparison and coherent-source contracts through this active-run behavior; completed-feature consumers follow in Phase 2. Own the design's handback proof rows, including both actual providers and audit/finalization races, and add reverse supersession pointers only for behavior this phase changes.

## Implementation evidence

[Active-plan handback validation](kiln-active-plan-handback-validation.md) records the scoped boundaries and actual-provider proof. Private schema 12 retains immutable plan sidecars; completed-feature consumers must reuse these contracts without treating a failed observation as an empty plan.

Repository validation covered the dependency audit (0 blocking findings), lint, type checks, 626 unit tests, 17 Codex proof checks and all 827 applicable integration tests (2 existing skips). The full integration run passed 826 tests and timed out one multi-stage recovery fixture; after tracing its complete assertions at 82 seconds and budgeting that workflow at 120 seconds, its original two-test file passed. Six package tests, both actual-provider handbacks and Chrome at 390/1200 pixels also passed. Independent conflict, deliverable and hardening reviews completed. The validation note retains the separate full-run/rerun results and the isolated qualified-CLI/two-worker environment.
