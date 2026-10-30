# Phase 8: Complete split prerequisites and native verifier recovery

**Added by delivery audit:** 2026-10-30, after every previously planned implementation leaf closed. It completes the missing preparation boundaries below.
**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Preparation document contract; Preparation execution; Verification of the prepared work; Continuation Acceptance and Recovery.

## Summary
Prepare valid prerequisites identified by a split parent, and recover native verification failures without losing known process ownership or repeating uncertain work.

## Acceptance criteria covered
AC-CONTINUE-07 (completes it; owned by phase 3b). AC-HANDBACK-01/03, AC-OFFER-03 and AC-CONTINUE-08 also apply to this work.

## What the audit found missing
- **AC-CONTINUE-07:** `extractPreparation` accepts a parsed dependency on split parent `8`, but `evaluateContinuationReadiness` requires the source parent itself Closed and matches bindings/dependencies only against exact accounting leaf IDs `8a`/`8b`. Valid preparation cannot become available. Runtime pending-prerequisite exemptions and completion recording in `Engine.readPlan`, `unresolvedDeliveryLeaf` and `advancePreparation` also use exact prerequisite IDs and need coherent parent-to-leaf handling.
- **AC-CONTINUE-07:** `verifyPreparation` persists a running attempt before `executeCheck` repeats environment projection, creates output and reads hooks/sandbox. A known prelaunch failure can leave no PID/start identity; both Verify/restart and explicit Resume then call `reconcilePreparationAttempt`, which always refuses missing identity. Correcting the original no-launch failure cannot recover through normal controls.
- **AC-CONTINUE-07:** Native `reconcilePreparationAttempt` rejects retained scanner obstacles/pending observations without refreshing the inventory. After its scanner has closed, a recoverable inventory/identity failure becomes a permanent stop. The provider-release sibling already retries supported retained inventory through `captureOwnedProcesses`.
- **AC-CONTINUE-07:** After `executeCheck` records unresolved native process ownership, `verifyPreparation` unconditionally changes its outcome to failed if the post-check checkpoint read fails or changes. Later Verify and Resume reconcile only running/unresolved attempts, allowing the known unsettled attempt to be skipped after source/configuration movement.

## Phase dependencies
3b (preparation binding, native attempts and same-conversation admission); 6 (retained tracked ownership release); 7 (the shared readiness/source reconciliation boundaries this work must preserve).

## Phase-specific notes
The [fresh whole-PRD audit](kiln-preparation-closeout-delivery-audit.md) owns the confirmed findings and sibling/conflict checks. Keep original owners closed; do not broaden preparation authority, introduce private-state surgery or another dispatch owner.

Use existing split/dependency semantics throughout readiness, source scope, all-repository bindings, pending prerequisite exclusions and final completion references. A Closed marker on a split parent is not a substitute for its applicable completed leaves. Preserve the distinct source/integration/provenance and repository requirements for every descendant.

Separate positively known no-launch failures from genuinely ambiguous launch/process outcomes. Preserve uncertain-write faults, unknown identity, legacy unreconstructible ownership and known surviving processes until evidence resolves them. A source/checkpoint error must never erase an unresolved ownership hold. Retry supported inventory observations without pretending all detached or remote effects can be contained; retain the existing qualified provider/profile boundaries.

Prove the whole criterion through real saved/Git and HTTP readiness, native subprocess/ownership/checkpoint and restart/Resume boundaries. Include external and carried split prerequisites in both provider modes and multiple repositories; first-descendant implementation after an owning phase split; known no-launch environment/output/hook/spawn failures; transient inventory/identity failures followed by safe recovery; unresolved native descendants combined with source/configuration movement; and genuinely unknown launches that remain held. Checks cannot repeat before reconciliation or start implementation from forged/provider-only success. Preserve source/settings/authority movement, failed/timeout checks, same-conversation one-turn admission and whole-PRD completion behavior. Repeat the applicable actual-provider preparation proofs with fictional disposable repositories and qualified tools. Required gates remain `npm run verify` and `npm run test:package`, freezing sources/build output during integration.

## Successor
After this leaf closes and authorized development-base delivery completes, directly launch a fresh whole-PRD delivery audit in a GPT 6.1 Sol/high chat. A clean delivery audit then launches whole-PRD test audit; continue any required completion/re-audit chain. One implementation leaf per chat.
