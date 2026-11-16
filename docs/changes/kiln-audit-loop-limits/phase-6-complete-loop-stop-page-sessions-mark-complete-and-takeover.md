# Phase 6: Show an Accept session on its own line, keep Mark complete's waiting button, and show the loop page after a takeover

**Closed:** 2026-11-15

**Added by delivery audit:** 2026-11-15, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md)
**Technical design:** [Kiln Audit Loop Limits technical design](kiln-audit-loop-limits-technical-design.md) — relevant sections: "The Loop Ledger" ("Which loop a session belongs to"), "`needs_you` loop stops", "Reply and Take over", "Snapshot"
**Repositories:** kiln

## Summary
At a test loop stop, the page lists the session that **Accept what is left and deliver** started as a session of its own, separate from the loop before it. At a test loop stop where the audit asked the person something, the page shows the unusable **Mark test audit complete** button with "Check again first" before a recheck, as every Needs you stop does. When the person took over that test audit's session, the browser shows the loop page and its controls instead of the takeover hand-back page.

## Acceptance criteria covered
AC-STOP-01 (completes it; owned by phase 1), AC-STOP-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-STOP-01 (an Accept session's line):** at a `needs_you` test loop stop, Accept starts a new session on the stopped activity (`Engine.loopControl` → `launchAuditAtStop` in `src/engine/engine.ts`). `applyLoopControl` saves that session's `sessionId` and `firstAttempt` on the `Acceptance`. But `loopSessions` and `loopDid` in `src/engine/loop-view.ts` take session boundaries only from `ledger.loops`. So when that session reports again and the run reaches the next loop stop, the loop line before it shows the Accept session's outcome and summary as its own, and adds the Accept session's run time to its own. The loop's own report then appears nowhere, and the Accept session gets no line of its own. On an uncounted activity, `auditLoopsView` and `optionalDid` merge both sessions into one "audit since" line the same way. The design's "Which loop a session belongs to" rule makes an `Acceptance` that starts a session a boundary marker too. This shows on the page and in `kiln status`, which both read `auditLoopsView`.
- **AC-STOP-02 (Mark complete before a recheck):** at a `needs_you` test loop stop, the **Audit work resolved** check fails, and before any recheck `markCompleteOffer` returns `awaitingRecheck`. The loop-stop branch of `view/src/screens/NeedsYou.svelte` (line 190) renders only `{#if offer}…{:else if loopStop.holds …}`. It never renders the `{:else if waiting}<MarkComplete {waiting} />` that the ordinary branches have (lines 225 and 382). So the page shows no Mark complete at all until a recheck. Every other Needs you stop shows the unusable button with "Check again first" (completion waivers AC-WAIVE-02), and mockup screen 3 shows it too.
- **AC-STOP-01 and AC-STOP-02 (after a takeover):**
  - **The case:** a test audit's session was taken over. Its `needs_you` report then arrives while no test loop is left.
  - **Why the browser shows the hand-back page:** Verify cannot pass, so `record.liveControl` stays set. `Engine.phaseRecoveryTarget` returns a target for the audit, and `view/src/App.svelte` (line 115) renders `PhaseHandoff.svelte` instead of `NeedsYou` → `LoopStop`. `PhaseHandoff.svelte` has no loop page: no heading, no loops, no findings, no **After the last test audit loop** choice, and no **Allow _N_ more loops** or **Accept what is left and deliver**.
  - **What still sees the loop stop:** `needsYouLoopStop` still derives it, so `kiln status` prints the loop page and `controlView` offers both controls.
  - **Cases that are already right:** the holding stops (added phases, saved test work) reach the loop page after a takeover, because Verify accepts their reports and clears `liveControl`.
  - **What the build must also confirm:** Allow or Accept started from this state (`launchAuditAtStop`) runs as Kiln's own session, not under the takeover.

## Phase dependencies
1 (the loop stop page, its controls and the `needs_you` loop stop), 5 (`needsYouLoopStop` keyed on the report's own `needs_you` outcome)
