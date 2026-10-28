# Phase 9: Preserve live-message order and explain paused controls

**Added by delivery audit:** 2026-10-28, after all eight implementation leaves closed. Completes the remaining cross-event correlation and disabled-control explanation gaps confirmed against `8110b2c`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Receipts and correlation; Uncertainty recovery; Snapshot and browser; Bot Extension; Evidence and Verification Gates.

## Summary

Retain accepted live-message order across provider events and recovery, and explain the unavailable deferred-pause choice after terminal takeover is ready.

## Acceptance criteria covered

AC-LIVE-02, AC-MSG-01, AC-MSG-02 and AC-MSG-03 (complete them; owned by phase 2).
AC-BOT-02 (completes it; owned by phase 3).
AC-MSG-05, AC-TAKE-02/04 and AC-BACK-04 also apply to this phase's work.

## What the audit found missing

- **AC-LIVE-02:** `PhaseHandoff.svelte:123` renders `PausePanel` after release. `view/src/components/PausePanel.svelte:42` disables the deferred-pause button when `held.state === "released" && !snapshot.pause.pending`, but supplies no adjacent reason. The existing timing paragraph describes an available action; the takeover status and generic disconnected explanation do not explain this disable. The phase and both audit kinds share it. Explain the existing unavailable state; the audit does not require enabling a new pause or changing deferred-pause semantics.
- **AC-MSG-01:** `Engine.observeLiveMessage` (`src/engine/engine.ts:625–635`), reached from the shared browser/bot input observer and startup replay, compares acceptance order only among UUIDs named in one event. Accepted A then B can first receive consumption evidence for B alone, before any evidence that A was consumed, then A alone. Each event passes, so cross-event reversal is silently accepted despite the existing order contract.
- **AC-MSG-02:** The same cross-event contradiction reaches `projectMessage` (`engine.ts:587–596`) and labels both inputs Received by Claude, rather than retaining uncertainty as the correlation design requires. Preserve exact text, original provider evidence and honest receipts; later evidence alone must not clear an uncertainty/review obligation.
- **AC-MSG-03:** For separate B-then-A result events, `gate.ts::observeGate` marks both inputs terminal, `claude-session.ts::maybeDrain` can seal input, and `endLiveMessages` sees both `resultAt` fields and adds no hold. `recoverLiveMessages` (`engine.ts:608–622`) replays through the same per-event validator, including when both result fields were already saved. Detect the chronology contradiction and preserve explicit recovery without resend or automatic advancement.
- **AC-BOT-02:** Bot `message` reaches the same observer through the versioned command route; its retries, saved-event recovery and explicit reviewed-message return therefore inherit the missing cross-event uncertainty safeguard. Retain the shared browser/bot authority and original exact target, not a second receipt or send path.

## Conflict check

All other PRD/change directories were shortlisted by title/summary and applicable active criteria read. No later-built requirement supersedes accepted message order, the design's inconsistent-order uncertainty rule or the disabled-reason requirement. Existing replacement chains lead to this PRD. The per-event-only validator originated in `f82374c`; the released deferred-button condition originated in `ae33be4`. These are omissions under their original contracts, not later product decisions. No new assumption, supersession pointer, provider capability or ownership guarantee is needed.

## Phase dependencies

1 (paired pause controls and safe takeover/return); 2 (literal messages, correlation and uncertainty); 3 (shared bot authority and reviewed-message return); 7 (saved-event validation/recovery); 8 (pending/exit/restart recovery repairs that must remain intact).

## Phase-specific notes

One bounded live-control completion slice fits one implementation session. Prove the five whole criteria, not only the cited branches. Exercise separate out-of-order consumption events before earlier-input consumption through live callbacks and saved-event recovery, including a restart after both result fields were saved, both input channels and implementation/delivery-audit/test-audit identities. Distinguish that contradiction from legitimate overlapping terminal completion after the earlier input already has consumption evidence; preserve valid ordered/coalesced and multi-result flows. Retain exact receipts, uncertainty, per-message review, explicit hand-back, no resend, no successor delivery and independent pause/release safeguards.

At desktop and narrow widths, show why the existing deferred-pause action is disabled after release without a pending request. Preserve cancellation of a separately requested deferred pause and all pending/disconnected availability rules. Use the design's existing provider, durable-engine, browser/bot and compatibility gates; this audit adds no new runtime qualification or universal containment promise.

After closure/publication, obtain a fresh whole-PRD delivery audit; test audit follows only when delivery is clean. All eight earlier Closed lines and historical validation qualifications remain unchanged, including Phase 8's confirmed unrelated baseline clock-test failure.

## Publication and successor

The source authorization in implementation chat `01a1804a-ad27-7fc0-9317-60119e6ac0c8` was: “Go ahead and push Phase 8, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” It covers that publication and this audit launch only. This audit uses delivery-audit's scoped commit default and holds publication for Doug. The successor uses implement-from-requirements' scoped commit default and holds publication of its later work for Doug. No production changes or messages to other chats are authorized; bot-control and plan-continuation remain separate tracks.


Doug subsequently lifted this audit's publication hold in audit chat `01a18088-e7b9-72c1-99d9-cfeabc3deedb`: “Go ahead and push the audit, then launch a new chat for Phase 9 using GPT 6.1 Sol High Effort.” This authorizes publishing audit `8d2428f` and its authorization/handoff record, then launching this Phase 9 implementation. The successor uses the scoped implementation commit default and holds publication of its later work for Doug. Production changes and messages to other chats remain unauthorized; the fresh delivery-audit-then-test-audit closeout remains required.
