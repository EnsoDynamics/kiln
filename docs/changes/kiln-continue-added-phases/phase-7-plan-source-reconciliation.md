# Phase 7: Complete plan source reconciliation and discovery feedback

**Closed:** 2026-10-30
**Validation:** [Plan source reconciliation and discovery feedback](kiln-plan-source-feedback-validation.md) — required full verify/package gates, independent review/hardening and both authenticated provider proofs pass.

**Added by delivery audit:** 2026-10-30, after every previously planned implementation leaf closed. It completes the missing source, comparison and observation boundaries below.
**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Plan Identity and Comparison; Source Reconciliation; Target grants before acceptance; Interfaces and Snapshot and screen contract.

## Summary
Use every explicitly known plan source, preserve historical completion safely, and report discovery results and failures truthfully in the browser and terminal. Equivalent unchanged sources must not invalidate a separately approved target grant.

## Acceptance criteria covered
AC-HANDBACK-03 (completes it; owned by phase 1), AC-FIND-02 (completes it; owned by phase 2a), AC-FIND-03 (completes it; owned by phase 2b1), AC-FIND-04 (completes it; owned by phase 2a), AC-OFFER-01 (completes it; owned by phase 2b2), AC-OFFER-02 (completes it; owned by phase 3a), AC-CONTINUE-03 (completes it; owned by phase 2a), AC-CONTINUE-09 (completes it; owned by phase 3b). AC-HANDBACK-01/02/04, AC-OFFER-03 and AC-CONTINUE-08 also apply to this work.

## What the audit found missing
- **AC-HANDBACK-03:** `plan-reconciliation.ts::sourceDiscrepancies` ignores a known source newly changing an existing leaf from open to Closed while the active leaf stays open. `Engine.readPlan` accepts that observation and can schedule the active leaf again. Both detecting the forward closure transition and comparing it with active closure are missing.
- **AC-HANDBACK-03:** `prd-location.ts::resolvePrdPath` returns an explicitly supplied registered worktree's `checkoutRoot`, but `kiln-command.ts::makeEngine` drops it. Restart reconciliation reads only active/main/prior source paths and ignores additions in that supplied workspace.
- **AC-FIND-02:** For completed executions with development delivery enabled, `Engine.decideQuietly` still rechecks the historical workspace and published feature ref through `unresolvedDeliveryLeaf`/`pullRequestCheck`/`evaluateRepositories`. Deleting the old feature branch or workspace can clear `currentComplete`, hide the completed offer and prevent subsequent discovery/acceptance despite available authoritative sources.
- **AC-FIND-03 / AC-CONTINUE-03:** `completedScopeProblems` and `completedPhaseScopeUnchanged` compare completed leaves without their enclosing split order. Reordering completed siblings `2a,2b` to `2b,2a` produces no earlier-work problem, although `judgedPhase(parent 2)` now assigns its historical session to a different first leaf. Accounting carries the children rather than showing unresolved earlier work.
- **AC-FIND-04:** `CompletedPlanCheck.svelte::refresh` stores transport, invalid-JSON and non-success responses without `answer.check` only in local `error`. Its earlier-result predicate and button gating still use the prior successful engine check, so an unsuccessful refresh can display current “No new phases found” or reenable an old ready offer.
- **AC-FIND-04:** `repositories.ts::findRepository` flattens parent-listing and Git helper/read failures into ordinary missing-checkout/origin problems. Both readiness and external accounting convert these into successful blocked observations, advancing last-success time rather than retaining an incomplete check. Known absence must stay distinct from an unsuccessful required read.
- **AC-FIND-04:** `Engine.checkCompletedPlanOwned` assigns a successful in-memory check before saving it. A failed save faults mutations, but its `finally` publishes the successful result/new time through `changed()` and snapshots. The uncertain publication needs a failed/earlier projection and recovery; faulting dispatch alone is insufficient.
- **AC-OFFER-01:** Browser-triggered completed checks update snapshots without a terminal discovery event. `formatDecisionLine` reports completed discovery only at CLI startup, leaving later page/reload/button counts, phase order, first phase/readiness and page direction absent from foreground terminal output.
- **AC-CONTINUE-09 / AC-OFFER-02:** `discoverCompletedPlan` emits an unselected shared candidate's digest whenever its semantics differ from the historical baseline, even when equivalent revised shared/base scope correctly selects the remote candidate. If exact shared/base bytes differ harmlessly, the newly persisted grant's immediate recheck compares the unchanged shared digest against the approved remote digest and irreversibly supersedes its own grant. Stable equivalent inputs cannot reach Continue.

## Phase dependencies
1 (active known-source reconciliation); 2a (completed observations and legacy recovery); 2b1 (completion accounting); 3a (historical executions and fresh acceptance); 5 (versioned scope and required-read failures); 6 (partial observations and irreversible grant supersession).

## Phase-specific notes
The [fresh whole-PRD audit](kiln-preparation-closeout-delivery-audit.md) records the call paths, independent confirmations, probes and conflict checks. Complete these existing criteria in one coherent source-observation capability; do not implement Phase 8's verifier recovery here. Original phase Closed lines and every prior merge/recovery commit remain intact.

Preserve historical delivery evidence and current prerequisite checks while removing dependency on deleted historical execution artifacts. Preserve genuine incompatible scope/closure changes, actual observed grant-scope movement, source failures and uncertain-write holds. Keep compatible additions, ordinary unfinished splits, harmless formatting/renames and unchanged stale shared copies working. Do not reinterpret all ancestor prose as completed leaf scope or add arbitrary branch discovery. Follow the design's immutable/versioned comparison rules for any changed retained comparison semantics.

Prove whole affected criteria at real Git, packaged CLI/HTTP and desktop/narrow browser boundaries. Cover both directions of closure mismatch, unchanged stale observations, an explicitly supplied registered worktree and safe reconciliation; enabled and restricted historical delivery with deleted old refs/workspaces; completed split reorder and original first-leaf ownership versus compatible additions; browser-local and engine-publication failure projections in browser/inspection/terminal; new-repository I/O/helper failures versus positive known absence; terminal updates after page/reload/button checks; and stable equivalent saved/base inputs through grant/recheck/restart/Continue while real movement still irreversibly supersedes authority. Preserve ordinary both-provider handback and currentness/control coverage. Use fictional disposable resources. Required gates remain `npm run verify` and `npm run test:package`, with source/build output frozen during integration.

## Successor
After this leaf closes and its authorized development-base delivery completes, directly launch implement-from-requirements for Phase 8 in a fresh GPT 6.1 Sol/high chat. After all completion leaves close, repeat fresh whole-PRD delivery audit before whole-PRD test audit and any further completion work. One implementation leaf per chat.
