# Phase 3: Complete the reading at a wait's start, and the amber line's end

**Closed:** 2026-10-22

**Added by delivery audit:** 2026-10-22, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md
**Technical design:** docs/changes/kiln-usage-limit-recovery/technical-design.md — relevant sections: "The Wait" (While it lasts), "Interfaces" (Snapshot: `atLimitUntil`), "Screens"

## Summary
Kiln takes a fresh reading of the account as soon as a wait starts, even when an older reading was still running at that moment, so a wait never sits up to 5 minutes before its first judgment. The amber "at 100% until 3:40 PM" line on the waiting screen and on Needs you disappears when that time passes, instead of lingering until the next reading.

## Acceptance criteria covered
AC-AUTO-02 (completes it; owned by phase 2), AC-LIMIT-03 (completes it; owned by phase 2)

## What the audit found missing
- **AC-AUTO-02:** when a wait starts while a reading that began before the refusal is still in flight, no fresh reading is taken. `Engine.watchWait`'s `askReading` joins the in-flight call. `Engine.readingArrived` (src/engine/engine.ts) then ignores that reading as older than the refusal and calls `askReading()` again. That second call runs inside `ClaudeInfo.refreshAccount`'s `.then` (src/account/claude-info.ts), before `.finally` clears `accountReading`, so it gets back the finished promise and starts nothing. The wait's first reading then comes from the 5-minute refresh. The test stand-in `src/test-support/scripted-claude.ts` `refreshAccount` clears its reading before calling listeners, which hides this.
- **AC-LIMIT-03:** the amber line outlasts the account's reset time on an open screen. `limitView` (src/engine/snapshot.ts) sets `atLimitUntil` only when the snapshot is built, and `atLimitLine` (view/src/lib/usage-limit.ts) never compares it with the view's clock. After the reset time the line still reads "at 100% until 3:40 PM" until the next snapshot, up to 5 minutes later on Needs you.

## Phase dependencies
2 (the wait, its readings and the usage-limit screens)
