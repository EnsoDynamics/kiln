# Test audit: Kiln Pause Now

**Status:** 4 to fix (AC-PAUSE-02, AC-PAUSE-06, AC-PAUSE-05, AC-PAUSE-03); 1 red check to run (AC-PAUSE-04)
**Last audit:** 2026-11-20, whole PRD, at `5d5608d`; fixing chat re-graded AC-PAUSE-02 to 06 at `d06fdb1`
**PRD:** [kiln-pause-now-prd.md](./kiln-pause-now-prd.md)

Evidence counted: `npm test` and `npm run test:integration`, both run in CI. Tests guarded `skipIf(process.platform !== "darwin")` count, because CI runs the integration suite on macOS. `npm run test:live-proof` is not in CI or `verify`, so it is not evidence.

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-PAUSE-01 — The pause panel offers Now and After | Adequate | 8 of 8 | `view/src/screens/pause-now-screens.test.ts` (AC-PAUSE-01 block), `src/server/live-control-browser.integration.test.ts::shows the Now and After choices…`, `src/server/live-control-audit-browser.integration.test.ts::pins output/composer/facts order…` | `view/src/components/PausePanel.svelte` | 2026-11-20 `5d5608d` |
| AC-PAUSE-02 — Pause now is the existing safe takeover under a new name (high risk) | Weak | 15 of 18 | `src/live/pause-now.integration.test.ts`, `src/live/takeover.integration.test.ts`, `src/live/live-compatibility.integration.test.ts`, `src/engine/reset.integration.test.ts`, `src/live/messages.integration.test.ts`, `src/control/live-commands.integration.test.ts` | `src/engine/engine.ts`, `src/engine/compatibility-notices.ts`, `src/live/checkpoint-hook.ts` | 2026-11-20 `d06fdb1` |
| AC-PAUSE-03 — The pausing state says what it is waiting for | Weak | 14 of 16 | `src/live/pause-now.test.ts`, `view/src/screens/pause-now-screens.test.ts`, `src/live/pause-now.integration.test.ts`, `src/server/takeover-activity-browser.integration.test.ts` | `src/live/pause-now.ts`, `src/engine/engine.ts` (`pauseNowView`), `view/src/lib/progress.ts`, `src/underway-output.ts` | 2026-11-20 `d06fdb1` |
| AC-PAUSE-04 — A pause can be cancelled until the stop | Adequate | 9 of 9 | `src/live/pause-now.integration.test.ts` (cancel, race and late-cancel tests), `view/src/screens/pause-now-screens.test.ts` | `src/engine/engine.ts` (`cancelTakeover`), `src/live/pause-now.ts` | 2026-11-20 `d06fdb1` |
| AC-PAUSE-05 — An immediate pause reads as Paused, not Needs you | Weak | 12 of 14 | `view/src/screens/pause-now-screens.test.ts`, `src/live/pause-now.test.ts`, `src/live/pause-now.integration.test.ts`, `src/server/live-control-audit-browser.integration.test.ts`, `src/server/live-control-browser.integration.test.ts` | `view/src/lib/progress.ts`, `view/src/screens/PausedHold.svelte`, `src/engine/engine.ts` | 2026-11-20 `d06fdb1` |
| AC-PAUSE-06 — Resume and the terminal sit side by side | Weak | 17 of 19 | `view/src/screens/pause-now-screens.test.ts`, `src/server/live-control-audit-browser.integration.test.ts` (incl. `::lays the paused page's columns out…`), `src/server/live-control-browser.integration.test.ts`, `src/server/run-restart-browser.integration.test.ts` | `view/src/screens/PausedHold.svelte`, `view/src/App.svelte` | 2026-11-20 `d06fdb1` |

AC-PAUSE-02 is high risk: a broken hold or release would let Kiln and a terminal both own the conversation and worktree. The rest are presentation or recoverable control state.

Red checks: on AC-PAUSE-01, both red (making the launched key win over the leaf in `PausePanel.svelte`'s `id`; swapping the Now and After sections). The fixing chat saw each new assertion fail with its behavior broken: the reworded reasons (no target, off macOS, recovered attempt, input lost, input while held), the lid sentence, `>= 30` to `> 30` in `pausingRow` and in `pauseNowView`, the late-cancel message, the gate-less derivation, the paused line printed at Claude's exit instead of at the release, Resume's billing restriction, the already-complete branch, the billing panel, the two-column grid, and the narrow-screen order. Not yet seen to fail with every stated part broken.

## To fix, in order

**Red checks still to run**
- **AC-PAUSE-04:** check the riskiest part. In `src/engine/engine.ts` `cancelTakeover`, drop `state.stop?.operationId === hold.operationId ||` from the `withGate` callback so a cancel after the stop is admitted, then run `pause-now.integration.test.ts::refuses Cancel once the stop is recorded…` and `::records the real deny and seal stops…`.

**Weak**
- **AC-PAUSE-02** (high risk): 15 of 18 parts. (a) Codex: only the view's wording is pinned, from a fixture. Fix: run an engine integration test on a scripted running Codex phase and assert that `liveTarget()` and `liveView()` are undefined, that the `take-over` control reads "Pause now needs an active supported Claude phase or audit.", and that `POST /api/live/take-over` is refused. (b) Final delivery: the same assertions for a running `pull_request` session. (c) `kiln status`'s incompatibility report: no test runs `kiln status` with a `takeover` notice. Its JSON `compatibility` entry carries the feature id `takeover`, and the notice reaches the text through the take-over control's reason. Fix: run `kiln status` (text and JSON) against a record holding a `takeover` notice and assert it names "Pause now".
- **AC-PAUSE-06:** 17 of 19 parts. (a) From the already-complete advance choice, the existing Check again and Mark complete rules are untested (the `recoveryPage.rechecked` route in `App.svelte`). Fix: in `live-control-audit-browser.integration.test.ts`, stub Resume as `already_complete` and the advance as still stopped with checks. Press Resume, then Advance, and assert the checks section, Check again and Mark complete appear. (b) The paused page's handling of Resume's refusal (`state.feedback = answer.reason`) is untested in a browser. Fix: stub `POST /api/resume` as 409 `{ok:false, reason:"Exit Claude in your terminal before handing this conversation back to Kiln."}` after typing a note, and assert the reason beside Resume and "Your note has not been sent."
- **AC-PAUSE-05:** 12 of 14 parts. (a) The end of the Paused period at a relaunch: no test shows that the Paused state clears while Resume's launch is `starting`. Fix: in `pause-now.integration.test.ts`, after the release, Resume with the stand-in's launch held, and assert that `liveView().pauseNow` is undefined and the header isn't paused. (b) A pause for an uncertain message keeps today's terminal lines: only its `stopped` line is tested. Fix: with a released `delivery_recovery` hold, assert that `formatSummaryLine` contains "needs you" and not "paused in", that `formatDecisionLine` contains "still needs you", and that no `paused` event is emitted.
- **AC-PAUSE-03:** 14 of 16 parts. (a) An obstacle while pausing is only tested from fixtures. Fix: under a pending hold whose hook contract becomes unrecognised, or after a failed reading, assert that `pauseNow()` is `{ phase: "pausing", obstacle: { code, reason } }` and that `pausingRow` gives `kind: "obstacle"` with no lid sentence. (b) The audit variant **Cancel end-of-audit pause** under the pausing panel is untested. Fix: in `pause-now-screens.test.ts`, render a pausing audit snapshot with `pause.pending` and assert its words.

**Strong, if asked** (high-risk criteria)
- **AC-PAUSE-02:** once Adequate, red-check each stated part.

Implied parts left open on Adequate rows (not required for the target):
- AC-PAUSE-01: the session page's `#pause-h` text is located but never read; a Codex audit with no live target is named with its round only on the overview.
- AC-PAUSE-04: cancelling on a gate-less attempt (the `else` branch of `cancelTakeover`); the browser showing the `already_paused` refusal.

## Waiting

None.
