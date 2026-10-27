# Phase 2: Live messages and delivery recovery

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Architecture and Durable Authority; Message Delivery and Attempt Settlement; Terminal Ownership and Hand-back; Local Interfaces; Evidence and Verification Gates.

## Summary
Send exact instructions into the running Claude conversation, show evidence-based receipts and hold uncertain delivery for explicit review and return. Complete the active-session controls and availability states around the existing takeover flow.

## Acceptance criteria covered
AC-LIVE-01, AC-LIVE-02, AC-MSG-01, AC-MSG-02, AC-MSG-03, AC-MSG-04, AC-MSG-05.
AC-LIVE-03, AC-LIVE-04, AC-TAKE-04, AC-BACK-04 (also apply to this phase's work).

## Out of scope for this phase
Bot live commands, bot status/help additions and bot review flags (Phase 3).

## Phase dependencies
1 (the durable instruction/admission authority, safe takeover, ownership checks, phase/audit hand-back and paired pause controls).

## Phase-specific notes
Extend Phase 1's authority with message accounting and recovery, through provider, engine, HTTP and browser together. Apply the design's literal-message/lifecycle, durable-engine, HTTP and browser gates, including all uncertainty/acknowledgement states and message-versus-takeover races; rerun the takeover invariants affected by multi-turn settlement.

## Integration notes from Phase 1

Extend `src/live/target.ts`, the existing control journal and per-attempt gate; do not add a second receipt store. Browser takeover uses `POST /api/live/take-over`, receipt lookup and release reconciliation. Live hand-back accepts `instructionId` and exact `LiveTarget` through the existing resume/check-again routes, preserving legacy phase recovery. A failed or uncertain launch retains the hold; already-complete late Resume sends no prompt and requires explicit advance. New takeover capability is profile-gated separately from the future literal-message capability.

The adapter currently closes stdin after the ordinary result only when held tracked work is settled. Phase 2 replaces that settlement predicate with its accepted-input/result accounting while retaining background task drain and non-cancelling yield. Its changes must retain gate contention/death, durable evidence replay, ordinary-terminal exclusion, tracked-child release and final completion/first-prompt guards. The Phase 1 leaf records the portable real-provider proof command and test ownership.
