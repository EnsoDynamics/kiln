# Phase 7: Preserve uncertain-message review through restart

**Added by delivery audit:** 2026-10-28, after all six implementation/completion leaves closed. Completes the AC-MSG-05 and AC-BOT-02 gaps confirmed against `b774f87`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Durable records and ordering; Receipts and correlation; Uncertainty recovery; Activity-specific evaluate, then act; Bot Extension; Evidence and Verification Gates.

## Summary

Keep uncertain live messages requiring review after Kiln restarts, even when later provider evidence arrives.

## Acceptance criteria covered

AC-MSG-05 (completes it; owned by phase 2), AC-BOT-02 (completes it; owned by phase 3).

## What the audit found missing

- **AC-MSG-05:** `Engine.reconcileControl` (`src/engine/engine.ts:488–491`), reached during `CommandJournal` construction on controller restart, changes any pending message with `message.resultAt` to `received/completed`. An uncertain receipt remains `indeterminate`, so it enters that reconciliation even after `Engine.projectMessage` has deliberately retained uncertainty while saving a late correlated result. `recoverLiveMessages` then sees the upgraded receipt; `liveView.reviewRequired`, `LiveMessages` and `requireTakeoverReturn` no longer require its acknowledgement. The execution hold survives, but explicit Resume/Verify can proceed without the person's review. Preserve the existing uncertainty/review contract through restart; provider evidence alone must not remove that obligation or relabel its uncertainty.
- **AC-BOT-02:** Bot `resume` and `verify-and-advance` share that engine/journal path. After the same restart sequence, their required per-message `--message-reviewed` safeguard can disappear. The versioned command route must retain the same uncertain receipt and review requirement as the browser, including durable retries and explicit successful hand-back.

## Conflict check

The audit shortlisted all 11 PRD/change titles and summaries, then read applicable bot-control, Continue Added Phases, Needs you handoff, usage-recovery, completion-audit and Kiln v1 criteria. None supersedes the requirement to review each uncertain message before hand-back or permits restart to upgrade uncertainty automatically. Existing v1/usage supersession pointers lead to this PRD's review and explicit-hand-back rules. Both the unconditional restart upgrade and the deliberate late-evidence uncertainty retention originated in `f82374c`, whose commit body promises uncertainty held through restart and review until safe Resume/Verify succeeds. This is a recovery malfunction, not a later product choice. No replacement pointer or new business assumption is needed.

## Phase dependencies

2 (message evidence, durable uncertainty and browser review/return); 3 (shared bot journal, reviewed-message flags and retries).

## Phase-specific notes

One bounded shared recovery slice fits one implementation session. Prove both whole criteria through the existing browser and bot boundaries, including uncertainty followed by late correlated evidence, controller restart, retained exact receipt/review state, refusal before acknowledgement and explicit successful hand-back afterward. Preserve already-recorded acknowledgements, failed hand-back holds, no automatic resend/advancement, original target/attempt identity and separate pause/ownership/completion obligations. Use the design's existing durable-engine, HTTP/bot, browser and compatibility gates. This phase adds no provider capability, permission, receipt store or changed receipt meaning.

After closure and publication, obtain a fresh whole-PRD delivery audit, then test audit only when delivery is clean. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run, Phase 5's full-run/focused-retest qualification and Phase 6's green complete gate remain distinct historical records.

## Publication and successor

This audit uses delivery-audit's scoped commit default and holds publication for Doug under the phase plan's Phase 6 publication and fresh audit launch section. Doug's source authorization in chat `01a17fc8-27a6-7802-ac03-9a0ac8c2f1ea` was: “Go ahead and push Phase 6, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” It authorized that publication and audit launch, not publication of this audit or this phase's later work. The successor uses implement-from-requirements' scoped commit default and holds publication for Doug. Production changes and messages to other chats remain unauthorized. Bot-control and plan-continuation remain separate tracks.
