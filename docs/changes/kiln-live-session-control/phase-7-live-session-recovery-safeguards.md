# Phase 7: Preserve live session recovery safeguards

**Added by delivery audit:** 2026-10-28, after all six implementation/completion leaves closed. Completes the AC-MSG-05 and AC-BOT-02 gaps confirmed against `b774f87`, plus the AC-MSG-03 and AC-TAKE-02/04 gaps confirmed by the repeat audit at `eb363a9`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Durable records and ordering; Receipts and correlation; Uncertainty recovery; Safe Checkpoint and Release; Activity-specific evaluate, then act; Bot Extension; Evidence and Verification Gates.

## Summary

Retain message uncertainty, required review and observed process ownership through recovery, so Kiln releases or resumes a conversation only after its existing safeguards pass.

## Acceptance criteria covered

AC-MSG-03 and AC-MSG-05 (complete them; owned by phase 2), AC-TAKE-02 and AC-TAKE-04 (complete them; owned by phase 1), AC-BOT-02 (completes it; owned by phase 3).

## What the audit found missing

- **AC-MSG-03:** `runSessionProcess` saves each provider event before queuing `onLiveEvent` (`src/session/claude-session.ts:293–294`). A crash in that boundary leaves saved evidence that never reached `Engine.observeLiveMessage`'s conflicting identity/order guard. On restart, `recoverLiveMessages` (`src/engine/engine.ts:590–599`) calls `projectMessage` separately per receipt, bypassing that guard. For accepted A then B, a saved same-session result naming `[B, A]` can therefore mark both received/accounted and create no uncertainty hold. A later wrong-session event naming an already-accounted message is silently ignored instead of preserving the live path's uncertainty. Recovery must validate saved correlation with the same identity/order contract before authorizing progression.
- **AC-MSG-05:** `Engine.reconcileControl` (`src/engine/engine.ts:488–491`), reached during `CommandJournal` construction on controller restart, changes any pending message with `message.resultAt` to `received/completed`. An uncertain receipt remains `indeterminate`, so it enters that reconciliation even after `Engine.projectMessage` has deliberately retained uncertainty while saving a late correlated result. `recoverLiveMessages` then sees the upgraded receipt; `liveView.reviewRequired`, `LiveMessages` and `requireTakeoverReturn` no longer require its acknowledgement. The execution hold survives, but explicit Resume/Verify can proceed without the person's review. Preserve the existing uncertainty/review contract through restart; provider evidence alone must not remove that obligation or relabel its uncertainty.
- **AC-TAKE-02:** `LiveOwnedProcesses.capture` (`src/live/owned-processes.ts:24–40`) keeps newly resolved descendant identities only in local `added` until the complete scan finishes. If it resolves child A and then child B's identity read throws, A is discarded and only obstacle text is saved. After attempt exit and scanner close, `Engine.reconcileTakeoverOnce` (`src/engine/engine.ts:780–783`) clears that obstacle after a successful plain PID/PPID inventory without examining its rows or resolving the lost identities. Its subsequent checks see only persisted `gate.tracked`, allowing terminal readiness while observed A may still be alive/reparented. The separate missing-start-time `continue` also drops an observed PID without proving disappearance. Retain partial observations and unresolved identity evidence; a generic successful inventory is not release proof.
- **AC-TAKE-04:** The same lost descendant observations can pass `requireTakeoverReturn` and its final hand-back checks, because they rely on the incomplete released gate. Hand-back must remain stopped while previously observed work or identity remains unresolved. This concerns already observed descendants, not universal discovery of arbitrary downstream effects.
- **AC-BOT-02:** Bot `resume` and `verify-and-advance` share that engine/journal path. After the same restart sequence, their required per-message `--message-reviewed` safeguard can disappear. The versioned command route must retain the same uncertain receipt and review requirement as the browser, including durable retries and explicit successful hand-back. Its shared uncertainty and ownership safeguards also inherit the replay and descendant-accounting repairs above.

## Conflict check

The audit shortlisted all 11 PRD/change titles and summaries, then read applicable bot-control, Continue Added Phases, Needs you handoff, usage-recovery, completion-audit and Kiln v1 criteria. None supersedes the requirement to review each uncertain message before hand-back or permits restart to upgrade uncertainty automatically. Existing v1/usage supersession pointers lead to this PRD's review and explicit-hand-back rules. Both the unconditional restart upgrade and the deliberate late-evidence uncertainty retention originated in `f82374c`, whose commit body promises uncertainty held through restart and review until safe Resume/Verify succeeds. This is a recovery malfunction, not a later product choice. The repeat audit checked the additional replay and release gaps against the same applicable criteria: none permits bypassing correlation validation or losing already observed descendant ownership. The direct replay and live validation paths both originated in `f82374c`; descendant capture originated in `ae33be4` under the same reconciled-ownership contract. No replacement pointer or new business assumption is needed.

## Phase dependencies

1 (takeover gate, observed process accounting, release and final return guards); 2 (message evidence, durable uncertainty and browser review/return); 3 (shared bot journal, reviewed-message flags and retries).

## Phase-specific notes

One bounded live-session recovery slice fits one implementation session: journal replay and release reconciliation retain the evidence required by the same safe return flow. Prove all five whole criteria through the existing engine, browser and bot boundaries, rather than only changing the reported branches. Include:

- Uncertainty followed by late correlated evidence and restart, with exact receipt text/state, acknowledgement requirements and explicit successful hand-back. Cover unreviewed, acknowledged-but-failed return, successfully resolved and prior-execution receipts. Retain `reviewedAt`/`resolvedBy` semantics and correctly reconcile fully saved versus partial review operations.
- Crash after saved provider evidence but before its live callback, for contradictory acceptance order and conflicting conversation identity, including an already-accounted receipt. Such evidence must retain uncertainty and a progression hold through further restart without resend.
- A partial descendant capture that resolves A before B's lookup fails, attempt exit, scanner close and repeated release reconciliation. Retain known A through reparenting and retain B's unresolved identity; neither generic inventory success nor restart may silently clear the obstacle. Only fresh conclusive ownership/release evidence can enable terminal instructions or hand-back.

Preserve failed-hand-back holds, exact target/attempt identity, no automatic resend/advancement, independent pauses, audit/completion obligations and existing ownership limits. Use the design's durable-engine, HTTP/bot, browser and compatibility gates. This phase adds no provider capability, permission, receipt store, changed receipt meaning or universal descendant-containment guarantee.

After closure and publication, obtain a fresh whole-PRD delivery audit, then test audit only when delivery is clean. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run, Phase 5's full-run/focused-retest qualification and Phase 6's green complete gate remain distinct historical records.

## Publication and successor

This audit uses delivery-audit's scoped commit default and holds publication for Doug under the phase plan's Phase 6 publication and fresh audit launch section. Doug's source authorization in chat `01a17fc8-27a6-7802-ac03-9a0ac8c2f1ea` was: “Go ahead and push Phase 6, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” It authorized that publication and audit launch, not publication of this audit or this phase's later work. The successor uses implement-from-requirements' scoped commit default and holds publication for Doug. Production changes and messages to other chats remain unauthorized. Bot-control and plan-continuation remain separate tracks.


Doug subsequently authorized this audit's repeat, publication and Phase 7 implementation-chat launch in source chat `01a17ff9-e25a-7a90-84d2-b5a2d823456d`: “So, do it one more time, then go ahead and commit and push the changes, and then just launch a new chat on your own to address phase seven, do the implementation for it.” This lifts the audit publication hold above and covers the expanded Phase 7 scope from that repeat pass. Phase 7 implementation uses the scoped commit default; publication of its later implementation remains held for Doug. No production changes or messages to other chats are authorized.
