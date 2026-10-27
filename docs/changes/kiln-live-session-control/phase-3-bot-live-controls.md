# Phase 3: Bot commands for live session control

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Bot Extension; Identity and serialization; Durable records and ordering; Local Interfaces; Evidence and Verification Gates.

## Summary
Let a bot message or request safe takeover of the current Claude activity using Kiln's command interface. Expose the same receipts, readiness facts and explicit message-review hand-back as the browser.

## Acceptance criteria covered
AC-BOT-01, AC-BOT-02.
AC-LIVE-02, AC-LIVE-04, AC-TAKE-04, AC-BACK-04 (also apply to this phase's work).

## Out of scope for this phase
Building the bot discovery, authentication, general command or receipt framework; those belong to the bot-control PRD.

## Phase dependencies
1 (safe takeover/return and shared instruction authority); 2 (live message settlement and uncertain-message review). External prerequisite: both [bot-control phases](../../prds/kiln-bot-control/kiln-bot-control-phase-plan.md), including its durable mutation/retry framework, must be implemented and integrated before this phase starts.

## Phase-specific notes
Prove the design's HTTP/bot gate with the built CLI and real authenticated controller, covering browser/bot contention through one journal and final serialization. Extend the existing framework; an absent external prerequisite blocks this phase rather than expanding its scope or blocking Phases 1–2.

## Integration notes from Phase 2

Use schema 12's existing journal `message` effect/evidence and exact-target authority, not a second send or receipt framework. Browser `POST /api/live/message` and `/api/live/message-review` already use that journal. `reviewed_receipt_ids` is accepted internally for hand-back, and uncertain receipts retain `reviewedAt` plus the successful explicit hand-back's `resolvedBy`. A reviewed receipt stays `Delivery uncertain`; review never resumes or advances by itself. Review-operation restart reconciles fully saved acknowledgement sets and conclusively fails partial sets so remaining reviews can be submitted without a permanent journal block. History is sorted by durable sequence before paging.

The versioned bot route/status deliberately exclude the newly introduced `message` and internal `message-review` actions until this phase implements the public command, capability/help and retry/status contract. Remove that message-only exclusion as part of delivering the bot commands. Enforce the bot's material status-token match at its route before using the browser's exact-target journal admission, including settings/ownership revisions; exact target equality alone does not implement the bot token contract. Preserve current `reply` normalization and live text's separate literal policy.

`SessionControl.sendMessage` supplies `text_not_typed: true` only on validated newly launched Claude attempts, bounds write settlement to five seconds and never resends. The gate seals input only under its shared admission lock after correlated terminal-result accounting or safe takeover drain. Retain every existing takeover and final hand-back guard when adding cross-interface calls. The Phase 2 leaf and investigation name portable real-provider and crash/HTTP/browser evidence to rerun for affected contracts.
