# Phase 3a: Continue with integrated prerequisites

**Closed:** 2026-10-30

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Continuation Acceptance and Recovery; Interfaces; Data Models and Migration; Validation and Criteria Coverage.
**Parent phase:** [Phase 3](phase-3-accepted-feature-continuation.md)

## Summary
A person can continue a ready plan whose prerequisites are already integrated and verified. Kiln starts a fresh execution, preserves earlier history and finishes the added work through its normal audits and delivery.

## Acceptance criteria covered
AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-05, AC-CONTINUE-06, AC-CONTINUE-08. The offer/replay/history/delivery/control constraints also apply to Phase 3b's additional preparation workflow.

## Out of scope for this phase
Pending early-merge target grants and planned prerequisite preparation, including the engine-owned verifier and its actual-provider proof (3b). A proposal needing preparation must remain blocked from acceptance and implementation until that workflow exists; a read-time valid binding never authorizes dependent execution.

## Phase dependencies
1 (revised-plan scheduling and completion invalidation); 2 (bound discovery proposals, readiness and earlier-work reconciliation).

## Phase-specific notes
Own the complete integrated-prerequisite workflow through browser choice, stale-proposal refresh, durable acceptance, multi-repository setup/retry, fresh activation, historical reads, both providers' fresh-session admission and revised-scope audits/delivery. Prove duplicate/restart behavior at every introduced durable boundary, including activation before old-receipt settlement and uncertain writes. Prove two continuations preserve history, audit-added completion work needs no second Continue, and old audit/PR success cannot finish the new scope. Complete reverse supersession pointers only as their behavior lands.

## Inherited from Phase 2b2
Read [preparation-readiness validation](kiln-preparation-readiness-validation.md) and the design's implemented readiness boundary. Schema 16 retains `completedPlanCheck.result.proposal`, with immutable sidecar reads in `continuation-readiness.ts`; its ID excludes check times and binds candidate bytes, base vector, preparation source/check spans and settings. A ready read-only offer starts no work. `PreparationBinding.valid` means only its read-time checks passed. Revalidate all accepted inputs; preserve distinct external accounting while preparation remains pending.

The approved permission model is existing controls, with no original-conversation permission source or human-authorship proof (Doug's explicit approval in chat `01a18a26-f6dd-7ab2-88de-6523bc42f0fa`; exact quotation is retained in Phase 3b). A fresh execution starts restricted and cannot inherit old target grants or one-use paid approval. Continue supplies no broader merge, production, spending or destructive-operation authority.
## Finished-prefix integration

The retained Phase 1–2b2 prefix was integrated with current develop and published at `1e4accd` before this leaf began. The integration retains both merge parents and the original recovery history. Full `npm run verify` passed: 665 unit tests, 14 release checks, 18 Codex proof checks and 105 integration files (1,156 passing cases, two existing skips; 1,370.83 seconds). The package gate passed eight cases. Independent deliverable review, delta review and test hardening found no remaining material issue; no refactor was warranted.

The upstream orphan cleanup exposed intentional controller-crash fixtures that require a surviving provider. Those two fixtures now give the synthetic provider their test worker as its lifetime owner after controller loss; default orphan cleanup remains covered separately. Both complete recovery files plus orphan cleanup passed 63 cases before the complete gate. Earlier interrupted diagnostic runs are not represented as complete coverage.

## Validation and successor

[Integrated continuation validation](kiln-integrated-continuation-validation.md) records this leaf's runtime proof and final gate state. Once this leaf closes, Phase 3b is the next planned implementation leaf; whole-PRD delivery/test audits follow all implementation leaves.
