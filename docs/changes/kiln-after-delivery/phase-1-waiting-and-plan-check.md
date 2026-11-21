# Phase 1: Waiting to merge, and the finished-run check for new phases

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "The Delivery Reading", "The Plan Check on a Finished Run", "Interfaces" (`check-for-new-phases`, the check result's new fields), "Display Contract" (the waiting line and the two answers), "Data Models and Upgrade", "Open Questions" (PLAN-001)

## Summary
Kiln reads each of the delivery's pull requests from GitHub and, while the one in this PRD's repository has not merged, says once in the pull request card that the delivery is waiting to merge instead of reporting a changed plan. Once it has merged, the check for new phases reads one copy of the plan and answers either that nothing was added or which unfinished phases were added and where they came from; finished phases stay finished and nothing asks for reconciliation.

## Acceptance criteria covered
AC-WAIT-01, AC-WAIT-02, AC-BACK-01, AC-BACK-03, AC-BACK-04, AC-BOT-01, AC-BOT-02

## Out of scope for this phase
The merge button, the merge session, the Merged header and card, and the check that runs unasked after a confirmed merge (Phase 2); Continue pushing the plan first (Phase 3); Exit Kiln and the closing-audit names (Phase 4). Of AC-BOT-01 this phase builds `kiln check-for-new-phases`; of AC-BOT-02, waiting to merge and the two answers with where the phases came from.

## Phase dependencies
None.

## Phase-specific notes
- Before the build, merge `origin/develop` into this branch: Pause Now changed `engine.ts`, `projection.ts` and the Paused page since the design was refined.
- The page-load check request lives in `CompletedPlanCheck.svelte`'s `onMount`. AC-WAIT-02 hides that panel while the delivery waits, so the request moves to the finished page.
- Until Phase 3 builds the push session, accepting an offer read from the main checkout is refused, since its documents are not in the base branch yet. Phase 3 replaces the refusal with the push.
- Schema 25 starts here with `afterDelivery.pullRequests`, `readError`, `checkedWhileClosedAt`, `continuationBaselineId` and the proposal's `source`; Phases 2 and 3 add the `merge` and `planPushes` fields to the same unreleased schema.
