# Test audit: Kiln Pause Now

**Status:** Done 2026-11-21
**Last audit:** 2026-11-20, whole PRD, at `5d5608d`; fixing chats re-graded AC-PAUSE-02 to 06 at `d06fdb1`, then AC-PAUSE-02, 03, 05 and 06 at `a98a56b`
**PRD:** [kiln-pause-now-prd.md](./kiln-pause-now-prd.md)

Evidence counted: `npm test` and `npm run test:integration`, both run in CI. Tests guarded `skipIf(process.platform !== "darwin")` count, because CI runs the integration suite on macOS. `npm run test:live-proof` is not in CI or `verify`, so it is not evidence.

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-PAUSE-01 — The pause panel offers Now and After | Adequate | 8 of 8 | `view/src/screens/pause-now-screens.test.ts` (AC-PAUSE-01 block), `src/server/live-control-browser.integration.test.ts::shows the Now and After choices…`, `src/server/live-control-audit-browser.integration.test.ts::pins output/composer/facts order…` | `view/src/components/PausePanel.svelte` | 2026-11-20 `5d5608d` |
| AC-PAUSE-02 — Pause now is the existing safe takeover under a new name (high risk) | Adequate | 23 of 23 | `src/live/pause-now.integration.test.ts`, `src/live/pause-now-withheld.integration.test.ts`, `src/live/takeover.integration.test.ts`, `src/live/live-compatibility.integration.test.ts`, `src/engine/reset.integration.test.ts`, `src/live/messages.integration.test.ts`, `src/control/live-commands.integration.test.ts` | `src/engine/engine.ts`, `src/engine/compatibility-notices.ts`, `src/live/checkpoint-hook.ts` | 2026-11-21 `a98a56b` |
| AC-PAUSE-03 — The pausing state says what it is waiting for | Adequate | 21 of 21 | `src/live/pause-now.test.ts`, `view/src/screens/pause-now-screens.test.ts`, `src/live/pause-now.integration.test.ts`, `src/live/live-compatibility.integration.test.ts`, `src/server/takeover-activity-browser.integration.test.ts` | `src/live/pause-now.ts`, `src/engine/engine.ts` (`pauseNowView`), `view/src/lib/progress.ts`, `src/underway-output.ts` | 2026-11-21 `a98a56b` |
| AC-PAUSE-04 — A pause can be cancelled until the stop | Adequate | 9 of 9 | `src/live/pause-now.integration.test.ts` (cancel, race and late-cancel tests), `view/src/screens/pause-now-screens.test.ts` | `src/engine/engine.ts` (`cancelTakeover`), `src/live/pause-now.ts` | 2026-11-21 `a98a56b` |
| AC-PAUSE-05 — An immediate pause reads as Paused, not Needs you | Adequate | 19 of 19 | `view/src/screens/pause-now-screens.test.ts`, `src/live/pause-now.test.ts`, `src/live/pause-now.integration.test.ts`, `src/live/messages.integration.test.ts`, `src/server/live-control-audit-browser.integration.test.ts`, `src/server/live-control-browser.integration.test.ts` | `view/src/lib/progress.ts`, `view/src/screens/PausedHold.svelte`, `src/engine/engine.ts` | 2026-11-21 `a98a56b` |
| AC-PAUSE-06 — Resume and the terminal sit side by side | Adequate | 18 of 18 | `view/src/screens/pause-now-screens.test.ts`, `src/server/live-control-audit-browser.integration.test.ts` (incl. `::takes Resume's already-complete advance…`, `::shows a refused Resume's reason…`), `src/server/live-control-browser.integration.test.ts`, `src/server/run-restart-browser.integration.test.ts` | `view/src/screens/PausedHold.svelte`, `view/src/App.svelte` | 2026-11-21 `a98a56b` |

AC-PAUSE-02 is high risk: a broken hold or release would let Kiln and a terminal both own the conversation and worktree. The rest are presentation or recoverable control state. Parts counts for AC-PAUSE-02, 03, 05 and 06 are the latest re-grader's, which split the parts more finely than the earlier grades.

Red checks: on AC-PAUSE-01, both red (making the launched key win over the leaf in `PausePanel.svelte`'s `id`; swapping the Now and After sections). On AC-PAUSE-02, red: dropping the held deny from the checkpoint hook's PreToolUse branch fails `pause-now.integration.test.ts::records the real deny and seal stops…`. On AC-PAUSE-04, red: admitting a cancel after the gate's stop in `cancelTakeover` fails `::refuses Cancel once the stop is recorded…` and `::records the real deny and seal stops…`. Every new assertion of both fixing chats was seen to fail with its behavior broken; this chat's: Pause now offered to a Codex phase and to final delivery in `liveTarget`, the takeover feature renamed in the notice text, the advance route back to the paused page in `App.svelte`, Resume's refusal reason dropped in `PausedHold.svelte`, the Pause now state projected while a relaunch is starting, a delivery-recovery hold read as Pause now and a paused event emitted for it, the obstacle not recorded under the hold and the obstacle row given the lid sentence, and the audit cancel label. Not yet seen to fail with every stated part broken.

## To fix, in order

None.

**Strong, if asked** (high-risk criteria)
- **AC-PAUSE-02:** red-check each remaining stated part (the release requirement, restart survival, stale targets, each withheld state).

Implied parts left open on Adequate rows (not required for the target):
- AC-PAUSE-01: the session page's `#pause-h` text is located but never read; a Codex audit with no live target is named with its round only on the overview.
- AC-PAUSE-02: a hold taken and then the browser dropped; the reset reason's offered branch is reached through a `liveView` spy.
- AC-PAUSE-03: audit header parity with the running header is pinned only as a fixed value; the audit's ● line and summary while pausing; an obstacle from a failed release reading at the engine.
- AC-PAUSE-04: cancelling on a gate-less attempt (the `else` branch of `cancelTakeover`); the browser showing the `already_paused` refusal.
- AC-PAUSE-05: an audit's terminal lines under Pause now; the `kiln run` printer's paused line with the view address; the uncertain-message pause's "stopped · waiting for you" line.
- AC-PAUSE-06: pressing Copy and opening the fresh-session disclosure on the paused page; launch restrictions other than billing; Resume with a note at the engine under a Pause now hold.

## Waiting

None.
