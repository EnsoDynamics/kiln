# Phase 4: Complete stopped-phase recovery

**Added by delivery audit:** 2026-11-12, after every planned phase closed. It builds what earlier phases left out of the criteria below, confirmed in the whole-PRD audit at `522e983`.
**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "A Stopped Phase's Facts" (Work, Case), "Starting a Session at a Stop" (Start again, Carry on, Command line), "A Held Phase That Can't Be Reopened" (Advance from a hold, Bots), "Interfaces" (`kiln carry-on`)
**Phase plan:** [Kiln Run Restart phase plan](kiln-run-restart-phase-plan.md)
**Repositories:** kiln

## Summary
Finish the stopped-phase pages and commands: name a failed work read on every stopped page, start the preparation phase again with its own task, show the latest launch's last real message, keep a carry-on reply unsent when the phase turns out complete, accept one reply source for `kiln carry-on`, and let a held phase whose conversation can't be reopened advance from the browser and get fresh-session instructions from `kiln handoff`.

## Acceptance criteria covered
AC-CASE-01 (completes it; owned by phase 1), AC-CASE-02 (completes it; owned by phase 1), AC-CASE-04 (completes it; owned by phase 1), AC-CARRY-04 (completes it; owned by phase 1), AC-CARRY-05 (completes it; owned by phase 1), AC-CARRY-06 (completes it; owned by phase 1)

## What the audit found missing
- **AC-CASE-01:** when the work read fails, today's-page branch of `view/src/screens/PhaseHandoff.svelte` (the final `{:else}`, with the reply/resume or Conversation recovery unavailable cards) never shows `stop.work.unknown`; only `CarryOnCard` and `StartAgainCard` name the failed read (through `view/src/lib/restart.ts:workLine`), so the design's "the page names the read" is missing there.
- **AC-CASE-02:** `src/engine/engine.ts:launchAtStop` always sends `phaseSessionPrompt` for Start again, so on the prerequisite-preparation phase (`record.preparation?.phaseId === key`) it skips `preparePolicyForTurn` and `preparationTask()`, which the phase's first launch (`runPhaseSession`) and a resume (`resumeSession`) use. The carry-on branch of the same function builds on `freshSessionPrompt` and has the same omission for that phase (AC-CARRY-05).
- **AC-CASE-04:** `src/engine/snapshot.ts:needsYouView` takes the first card's `finalMessage` from the latest launch's last run only (`run.result.text`), so after a resume that couldn't spawn the card falls back to last lines instead of the latest launch's last recorded final message (`runs.findLast(run => run.result?.text?.trim())`, the one `launchAtStop` gives the carry-on prompt).
- **AC-CARRY-04:** `kiln carry-on` accepts `--message-file` and `--message-from-stdin` together and silently reads the file; `kiln reply` refuses that, and the design's command table allows at most one. The rule belongs on the `carry-on` contract in `prompts/kiln-command-contracts.json` (enforced by `src/control/help.ts:parseCommand`) or in `src/control/client.ts:runInspectionCommand`.
- **AC-CARRY-05:** a carry-on that returns `phase_already_complete` doesn't keep its reply unsent: `src/control/commands.ts` sets `reply_text` only for `reply` receipts (receipt creation, `validReceipt`, `unsent`), so `kiln carry-on --message-file` loses the reply, the snapshot's `unsentReplies` and `kiln status`'s `unsent_replies` omit it, and verify-and-advance doesn't ask for `without_sending_reply`, unlike today's already-complete choice.
- **AC-CARRY-06:** on a held page whose conversation can't be reopened, the already-complete choice never shows in the browser: in `view/src/screens/PhaseHandoff.svelte` the `{:else if pendingTakeover}` "Wait before opening Claude" branch matches before `{:else if page.choice}` (the hold stays `pending` with `history`), and `busy` includes `pendingTakeover`, so `act("advance")` returns early.
- **AC-CARRY-06:** `src/control/projection.ts:handoffProjection` returns `fresh_session_instructions: null` for a held session whose hold isn't `released`; it has no branch for a hold with `history` set and no `carryOnObstacle`, where the design has `kiln handoff` return the fresh-session instructions and no resume command.

## Phase dependencies
1 (stopped-phase facts, the carry-on and start-again actions, the held carry-on)
