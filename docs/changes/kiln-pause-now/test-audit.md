# Test audit: Kiln Pause Now

**Status:** 5 to fix (AC-PAUSE-06, AC-PAUSE-02, AC-PAUSE-05, AC-PAUSE-03, AC-PAUSE-04)
**Last audit:** 2026-11-20, whole PRD, at `5d5608d`
**PRD:** [kiln-pause-now-prd.md](./kiln-pause-now-prd.md)

Evidence counted: `npm test` and `npm run test:integration`, both run in CI. Tests guarded `skipIf(process.platform !== "darwin")` count, because CI runs the integration suite on macOS. `npm run test:live-proof` is not in CI or `verify`, so it is not evidence.

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-PAUSE-01 — The pause panel offers Now and After | Adequate | 8 of 8 | `view/src/screens/pause-now-screens.test.ts` (AC-PAUSE-01 block), `src/server/live-control-browser.integration.test.ts::shows the Now and After choices…`, `src/server/live-control-audit-browser.integration.test.ts::pins output/composer/facts order…` | `view/src/components/PausePanel.svelte` | 2026-11-20 `5d5608d` |
| AC-PAUSE-02 — Pause now is the existing safe takeover under a new name | Weak | 13 of 16 | `src/live/pause-now.integration.test.ts`, `src/live/takeover.integration.test.ts`, `src/live/live-compatibility.integration.test.ts`, `src/engine/reset.integration.test.ts`, `src/live/messages.integration.test.ts`, `src/control/live-commands.integration.test.ts` | `src/engine/engine.ts`, `src/engine/compatibility-notices.ts`, `src/live/checkpoint-hook.ts` | 2026-11-20 `5d5608d` |
| AC-PAUSE-03 — The pausing state says what it is waiting for | Weak | 13 of 15 | `src/live/pause-now.test.ts`, `view/src/screens/pause-now-screens.test.ts`, `src/live/pause-now.integration.test.ts`, `src/server/takeover-activity-browser.integration.test.ts` | `src/live/pause-now.ts`, `src/engine/engine.ts` (`pauseNowView`), `view/src/lib/progress.ts`, `src/underway-output.ts` | 2026-11-20 `5d5608d` |
| AC-PAUSE-04 — A pause can be cancelled until the stop | Weak | 8 of 9 | `src/live/pause-now.integration.test.ts` (cancel, race and late-cancel tests), `view/src/screens/pause-now-screens.test.ts` | `src/engine/engine.ts` (`cancelTakeover`), `src/live/pause-now.ts` | 2026-11-20 `5d5608d` |
| AC-PAUSE-05 — An immediate pause reads as Paused, not Needs you | Weak | 16 of 18 | `view/src/screens/pause-now-screens.test.ts`, `src/live/pause-now.test.ts`, `src/live/pause-now.integration.test.ts`, `src/server/live-control-audit-browser.integration.test.ts`, `src/server/live-control-browser.integration.test.ts` | `view/src/lib/progress.ts`, `view/src/screens/PausedHold.svelte`, `src/engine/engine.ts` | 2026-11-20 `5d5608d` |
| AC-PAUSE-06 — Resume and the terminal sit side by side | Weak | 13 of 17 | `view/src/screens/pause-now-screens.test.ts`, `src/server/live-control-audit-browser.integration.test.ts`, `src/server/live-control-browser.integration.test.ts`, `src/server/run-restart-browser.integration.test.ts` | `view/src/screens/PausedHold.svelte` | 2026-11-20 `5d5608d` |

No criterion is high risk: all six are presentation or recoverable control state, and the safety behavior under AC-PAUSE-02 (the hold never interrupts a command) is covered at the real gate.

Red checks run on AC-PAUSE-01, both red: making the launched key win over the leaf in `PausePanel.svelte`'s `id` failed `pause-now-screens.test.ts::names the leaf a split phase is working on, not the launched phase`; swapping the Now and After sections failed `::heads it Pause, Now first, naming the next leaf for a phase with a leaf after it`. Not yet seen to fail with every stated part broken.

## To fix, in order

**Weak**
- **AC-PAUSE-06:** 13 of 17 parts. (a) Resume's `already_complete` answer on the paused page (advance choice shown, note kept unsent) is driven by no test. Fix: in `live-control-audit-browser.integration.test.ts`, answer POST /api/resume with `{ok:true, outcome:"already_complete", target}`, type a note, press Resume, and assert the advance choice and "Your note has not been sent." with the note retained. (b) Launch restrictions: no test sets billing `canLaunch: false` on the paused page. Fix: in `pause-now-screens.test.ts`, assert **Resume phase 2b** is disabled. (c) The billing, development delivery and reset panels that stay on the page are never rendered there. Fix: give `pausedHoldSnapshot()` those views and assert their text after "Full session output". (d) "Neither column behind a disclosure" and "carry-on first on narrow screens" are checked by DOM order and SSR text only. Fix: in the audit browser test, assert the carry-on column's words in `main.innerText` and compare the two column rects (side by side at 1200, carry-on above at 390).
- **AC-PAUSE-02:** 13 of 16 parts; the reworded engine reasons are pinned by no test, so reverting any to its old takeover wording stays green. Fix, one assertion each: the `take-over` control's reason with no live Claude target ("Pause now needs an active supported Claude phase or audit."); the unsupported reason without a version notice ("Pause now needs a supported Claude Code on macOS. Pause after the current activity remains available."); `GATELESS_PAUSE_REASON` in `liveView().reason` on a recovered gate-less attempt; the full input reason "…use Pause now to recover." in `messages.integration.test.ts`'s `write_completed` case (today `toContain("Input connection lost")`); and "Pause now is pausing or has paused this activity." as `liveView().input.reason` while held.
- **AC-PAUSE-05:** 16 of 18 parts. (a) The gate-less card sentence ("The session ended on its own…") is pinned only from a hand-set `gateless: true` fixture; nothing exercises the engine's derivation (`engine.ts`, `run && !run.live`). Fix: in `pause-now.integration.test.ts`, release a Pause now hold on an attempt with no `live` gate and assert `liveView().pauseNow.gateless` and the sentence. (b) The `kiln run` paused line is never asserted absent before the release, so printing it at Claude's exit would pass. Fix: in the release test, after `settled()` and before the release, assert no `paused` event.
- **AC-PAUSE-03:** 13 of 15 parts. (a) The lid sentence is asserted only through the imported `LID_SENTENCE` constant; no test pins the PRD's words. Fix: pin the literal in `pause-now.test.ts`. (b) The waiting line's 30-second limit is tested at 29 and 40/45 but never at exactly 30, so `>= 30` → `> 30` in `pausingRow` or `pauseNowView` stays green. Fix: add a 30-second case to the unit test and beside the 29 s check in `takeover-activity-browser.integration.test.ts`.
- **AC-PAUSE-04:** 8 of 9 parts. The late-cancel refusal message is asserted only through the imported `ALREADY_PAUSED` constant. Fix: pin "Kiln had already paused. Press Resume once it’s paused to carry on." as a literal in `pause-now.integration.test.ts::refuses Cancel once the stop is recorded…`.

Implied parts left open on Adequate AC-PAUSE-01 (not required for the target): the session page's `#pause-h` text is located but never read; a Codex audit with no live target is named with its round only on the overview, not the session page.

## Waiting

None.
