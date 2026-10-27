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
