# Phase 1: Safe terminal takeover and return

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Architecture and Durable Authority; Safe Checkpoint and Release; Terminal Ownership and Hand-back; Local Interfaces; Evolution, Limits and Delivery; Evidence and Verification Gates.

## Summary
Let a person pause a running Claude phase or audit after its current operation, continue the same conversation in a terminal, then resume or verify that activity in Kiln. Deliver both pause choices and their distinct pending and completed states through the browser.

## Acceptance criteria covered
AC-LIVE-03, AC-LIVE-04, AC-TAKE-01, AC-TAKE-02, AC-TAKE-03, AC-TAKE-04, AC-TAKE-05, AC-BACK-01, AC-BACK-02, AC-BACK-03, AC-BACK-04.

## Out of scope for this phase
Live message submission, message receipts/review and the complete composer/availability arrangement (Phase 2); bot command/status/help additions (Phase 3). The interface-wide constraints above apply to each later interface when it is introduced.

## Phase dependencies
None. Reuse the implemented Needs you handoff and completion-audit workflows named by the PRD.

## Phase-specific notes
Introduce the shared journal/admission/attempt primitive through this working takeover slice, adopting the bot design's contract without waiting for bot discovery or CLI delivery. If concurrent bot work has landed, extend its implementation instead of creating a second authority.
Prove this slice with the assembled provider/controller, authenticated server, built browser and disposable real Git origins for phases and both audit kinds; use the design's safe-yield, exclusive-terminal, durable-engine and browser gates. Keep future message effects absent until Phase 2; no later phase may be needed to prove safe release or hand-back.
