# Phase 2: Count every delivery loop it starts, and say what each audit session did

**Closed:** 2026-11-15

**Added by delivery audit:** 2026-11-15, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md)
**Technical design:** [Kiln Audit Loop Limits technical design](kiln-audit-loop-limits-technical-design.md) — relevant sections: "The Loop Ledger", "The Loop Gate", "Loop Stops", "Display Contract"
**Repositories:** kiln

## Summary
Make sure a delivery loop Kiln has decided to start is always counted, even when the person lowers the limit just before it launches, and make the loop stop page say what every audit session listed there did, including one whose report is waiting on the person.

## Acceptance criteria covered
AC-LOOP-05 (completes it; owned by phase 1), AC-STOP-01 (completes it; owned by phase 1)

## What the audit found missing
- **AC-LOOP-05:** `Engine.countDeliveryLoop` (`src/engine/engine.ts`) decides again with `deliveryDecision` after `nextActivity` already chose to start the leaf; when the delivery limit was lowered during the awaits between them (agent refresh, Codex launch preparation), it gets `stop`, returns without counting, and the drive loop still calls `runPhaseSession`, so a loop runs past the current limit uncounted and unlabelled.
- **AC-STOP-01:** on the loop stop page, an audit session listed under "The loops" that has no accepted or waived result (the held `needs_you` test audit when it was not a counted loop, or any other unresolved audit) shows no "what it did", because `optionalDid` in `src/engine/loop-view.ts` returns nothing unless `hasEffectiveResult`; `loopDid` already reads the latest attempt's report for counted loops.

## Phase dependencies
1 (the loop ledger, the gate and the loop stop page)
