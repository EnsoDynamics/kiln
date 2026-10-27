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
