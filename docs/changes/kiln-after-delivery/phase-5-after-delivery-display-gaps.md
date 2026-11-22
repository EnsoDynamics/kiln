# Phase 5: Complete the after-delivery card, header, phase count and status text

**Added by delivery audit:** 2026-11-22, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "The Delivery Reading", "Display Contract", "Interfaces", "After-Delivery Activities"

## Summary
Show the check's answer beside Exit Kiln on the Merged card. Keep the header at PR ready for review while a pull request is closed. Say GitHub could not be read when a closed pull request and an unreadable one occur together. Stop counting the Merge and Push the plan rows as phases done on an early-merge run. Give `kiln status` the right row names and the commit message of the added phases.

## Acceptance criteria covered
AC-WAIT-03 (completes it; owned by phase 2a), AC-MERGE-07 (completes it; owned by phase 2a), AC-MERGE-05 (completes it; owned by phase 2b), AC-BOT-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-WAIT-03:** Once every pull request has merged, the check's answer still renders in the separate `CompletedPlanCheck` panel at the top of the page (`view/src/screens/Complete.svelte`, the `panelShown` line). It belongs beside Exit Kiln, in the Merged card's `mergePart` `allMerged` branch, where mockup state 3 puts it.
- **AC-MERGE-07:** `mergeOffer` (`src/engine/delivery-reading.ts`) returns `closed` before it checks for `unreadable`. When one pull request reads closed and another could not be read, the card shows only `closedLine` (`afterDeliveryView` in `src/engine/snapshot.ts`). It never says GitHub could not be read, or why.
- **AC-MERGE-07:** After Check now on a closed pull request, `checkedWhileClosedAt` ends the wait. `planCheckLabel` (`view/src/components/StateHeader.svelte`) then puts "Checking for new phases" or "Could not check for new phases" in the header. The criterion keeps **PR ready for review** while a pull request is closed, except while a merge session is under way or stopped, or when a check finds new phases. The design's Display Contract row "A check that is not waiting is running or failed — As today" has no exception for a closed pull request. The criterion governs.
- **AC-MERGE-05:** On a run with early merges allowed, `buildSnapshot` (`src/engine/snapshot.ts`) counts `phasesDone` from `views` and excludes only `PR_PHASE_KEY`. A finished Merge row (`merge`) or Push the plan row (`plan-push-…`) therefore adds one to "N of M phases done" in the header, the phase plan and `kiln status` (`src/control/projection.ts`).
- **AC-BOT-02:** `rowLabel` (`src/control/waiver-facts.ts`) has no case for the `merge` or `plan_push` keys. `kiln status` progress rows, in text and in the JSON `label`, read "Phase merge" and "Phase plan-push-<id>" with an empty title, where the screens show **Merge** and **Push the plan**.
- **AC-BOT-02:** `addedSentence` (`src/engine/new-phases-wording.ts`) supplies `kiln status`'s text answer through `formatCompletedPlanCheck`. It names the commit that added the phases and its date, but not its message, which the page shows (`originLine`).

## Phase dependencies
1 (the check's answers and `kiln status` text); 2a (the Merged card and the offer reading); 2b (early-merge runs with a Merge row); 3 (the Push the plan row); 4 (Exit Kiln on the Merged card)
