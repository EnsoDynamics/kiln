# Phase 1: Stopped phase says what happened and can carry on

**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "Architecture" (item 3), "A Stopped Phase's Facts", "Starting a Session at a Stop", "A Held Phase That Can't Be Reopened", "Interfaces" (the carry-on, start-again and reopen-check routes; the snapshot's `needsYou` additions; the `carry-on` and `start-again` commands), "Data Models", "Changes to Earlier Designs" (the Needs You Handoff, Completion Waivers, Live Session Control and Bot Control pointers)

## Summary
A stopped phase's page says whether Kiln couldn't start the agent, the agent stopped before building anything, or it needs the person's input, and always offers a way for Kiln to go on: start the phase again, or carry on in a new session when the earlier conversation can't be reopened, from the browser or a bot command, including for a phase paused for takeover.

## Acceptance criteria covered
AC-CASE-01, AC-CASE-04, AC-CASE-02, AC-CASE-03, AC-CARRY-01, AC-CARRY-05, AC-CARRY-02, AC-CARRY-03, AC-CARRY-04, AC-CARRY-06, AC-LOOK-01

## Out of scope for this phase
Start from on Documents found and the catch-up offer, including `bringUpToDate` and `--leave-branch-as-is` on these actions (Phase 2); the reset line and reset (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
- Owns AC-LOOK-01 for the three stopped-phase pages and the held page AC-CARRY-06 changes; Phases 2 and 3 prove it for their own screens.
- Moves the record to schema 21 (the `reason` marking of saved stop rows is this phase's). Phases 2 and 3 add their optional fields within schema 21, since nothing is released between phases.
- `kiln --help`: `carry-on` and `start-again` join **Answer a stopped phase**, with the rule that a group's names wrap past 80 characters. The **Start over** group is Phase 3's.
- `docs/kiln-command-line-and-bot-control.md` gains the two commands here.
- Most of the Delivery section's ~$10 real-agent spend falls in this phase (carry-on, start again, a hold ended on `init`, a Codex carry-on reading `started`).
