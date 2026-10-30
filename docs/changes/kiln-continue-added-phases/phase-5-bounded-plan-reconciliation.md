# Phase 5: Complete bounded plan reconciliation

**Closed:** 2026-10-30

**Added by delivery audit:** 2026-10-30, after every previously planned implementation leaf closed. It completes the missing reconciliation boundaries below.
**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Source Reconciliation: Completed feature discovery and Active execution handback; Readiness and Planned Preparation: Preparation execution and Verification of the prepared work.

## Summary
Reconcile revised and historical plan scope before continuing, with correct source comparison, bounded evidence reads and explicit capacity failures.

## Acceptance criteria covered
AC-HANDBACK-01 (completes it; owned by phase 1), AC-HANDBACK-03 (completes it; owned by phase 1), AC-FIND-04 (completes it; owned by phase 2a), AC-FIND-02 (completes it; owned by phase 2a), AC-FIND-03 (completes it; owned by phase 2b1), AC-CONTINUE-03 (completes it; owned by phase 2a).

## What the audit found missing
- **AC-HANDBACK-01:** `src/engine/engine.ts::judgeEndedSession` and `drive` enter `advancePreparation` before `readPlan`; that method dispatches dependent implementation without accepting appended/split plan changes made during the returned preparation turn.
- **AC-HANDBACK-03:** The same preparation-return path checks assigned-worktree bytes through `preparationCheckpoint`, but never compares known shared plan sources. A discrepancy introduced after Resume's preliminary reconciliation can therefore escape the required stop before dependent implementation.
- **AC-FIND-04:** `Engine.checkCompletedPlanOwned` gives the discovery deadline to Git reads but drops it from `readRetainedCompletionProvenance`; sequential retained Codex session scans each receive a fresh 120-second timeout, so the overall check can stay checking beyond its required 120-second deadline.

- **AC-FIND-04:** Saved/Git candidate and retained-sidecar capacity failures are flattened into generic failed checks or write faults; `POST /api/continuation/check` returns 503 for every failed check instead of the design's 413 `plan_too_large` with its actual limit.
- **AC-FIND-03 / AC-CONTINUE-03:** `phaseScopeDigest`, `completedScopeProblems` and accounting compare direct leaf scope only. Removing or replacing a split parent's inherited repository leaves its closed child classified `carried_completed`, without identifying the historical scope change.
- **AC-FIND-02 / AC-CONTINUE-03:** `planSourceFromDocuments` normalizes non-phase governing requirements without the containing path/phase-link identity map. Shared and base candidates with identical logical additions can therefore conflict solely because a harmless phase rename changed a PRD/design/plan link.

- **AC-FIND-02 / AC-FIND-04:** `observePlan` and `observeGitPlan` test a raw href for `.md` before URL decoding. A required governing reference with an encoded extension such as `shared-requirements%2Emd` is silently omitted, so a missing required document can be accepted as a coherent plan.
- **AC-FIND-04:** A failed required `originBranches` read for a newly named repository becomes an ordinary readiness blocker. Discovery publishes a current result and new last-success time instead of an incomplete check with retained earlier evidence.

## Phase dependencies
1 (active-plan reconciliation and known-source observations); 2a (completed-plan discovery and unknown-result handling); 2b1 (retained external-completion provenance); 3b (preparation settlement and dependent implementation admission); 4 (versioned rename normalization and retained/legacy comparison).

## Phase-specific notes
The [fresh whole-PRD delivery audit](kiln-continue-added-phases-delivery-audit.md) records exact call paths, sibling checks and the requirements conflict check. Complete these existing contracts without adding a second command owner, importing shared documents or weakening preparation checkpoints, provider controls or history evidence. Preserve standalone evidence readers' own bounds while sharing the enclosing discovery deadline. Preserve the existing exception for new split-parent repository additions applying only to remaining children; do not retroactively assign them to earlier receipts. Apply the design's immutable, versioned comparison/migration rules to changed scope semantics.

Prove the whole affected criteria at their user-facing boundaries, including both provider preparation returns and recovery/admission, revised active-plan append/split and known-source disagreement/reconciliation, and several slow retained history reads under one discovery deadline. Preserve prior results/time as explicitly earlier on failure, disable stale offers, and show a concrete retry. Also prove inherited repository removal/replacement versus permitted additions, unchanged completed accounting, harmless governing-link renames across disagreeing saved/Git filenames, substantive differences still blocked, and typed capacity and required-repository read failures through HTTP with earlier history retained, plus decoded local-document references with present/missing/unsafe targets. Use the design's applicable provider/Git/browser proof standards and fictional disposable resources. Required full gates remain `npm run verify` and `npm run test:package`; freeze sources/build output during integration.

## Implementation and validation

All scoped reconciliation boundaries are implemented. [Bounded plan reconciliation validation](kiln-bounded-plan-reconciliation-validation.md) records immutable normalizer-3 scope recovery, preparation-return/admission, deadline/capacity and required-source proofs, both actual providers, independent review/hardening and the verification/package gate state. Combined development-base integration remains part of this session's delivery tail.

## Successor
After this leaf closes and authorized development-base delivery completes, launch implement-from-requirements for Phase 6 in a fresh chat. Once all completion leaves close, launch a fresh whole-PRD delivery audit, then whole-PRD test audit when delivery is clean. Continue any completion/re-audit chain; one implementation leaf per chat.
