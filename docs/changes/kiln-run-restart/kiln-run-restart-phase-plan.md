# Kiln Run Restart — implementation phase plan

**Parent PRD:** [Kiln Run Restart](kiln-run-restart-prd.md)
**Technical design:** [Kiln Run Restart technical design](kiln-run-restart-technical-design.md)

## Sizing decision

Three phases, executed in order. The PRD holds four capabilities, each with its own engine change: a stopped phase's cases with carry on and start again (including the held-phase ownership check), starting from an existing branch, catching an untouched branch up, and reset with its replaceable engine and journal recovery. Together they exceed one dependable session. Catch-up rides with starting from an existing branch because its criterion spans Documents found and the stopped-phase page and shares that phase's branch reads, and it comes after Phase 1 so its stopped-page offer and command option land on actions that already exist. Reset comes last because after a reset the page returns to Documents found with Start from. The Delivery section names no early merge or planned stop.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 stopped phase recovery](phase-1-stopped-phase-recovery.md) | A stopped phase's page says which kind of stop it is and offers start again or carry on in a new session, from the browser or a bot, including for a takeover hold whose conversation can't be reopened. | None |
| [2 start from existing branch](phase-2-start-from-existing-branch.md) | Documents found can start on a branch that already exists, and Kiln can move an untouched branch forward to its base before a session starts. | 1 (the stopped-phase Work read and the carry-on and start-again actions) |
| [3 reset](phase-3-reset.md) | A reset button and `kiln reset` make Kiln forget its progress on the PRD and return to Documents found, leaving git untouched. | 2 (Documents found's Start from) |
| [4 complete stopped-phase recovery](phase-4-complete-stopped-phase-recovery.md) | Added by delivery audit: finish the stopped-phase pages and commands, from naming a failed work read to advancing a held phase from the browser and `kiln handoff`'s fresh-session instructions. | 1 (stopped-phase facts, carry-on and start-again actions, held carry-on) |
| [5 complete start from existing branch](phase-5-complete-start-from-branch.md) | Added by delivery audit: finish Documents found's labels, branch list and pull request line, and name each repository's own base in the catch-up offer. | 2 (Start from, branch list, catch-up offer) |
| [6 complete first card, held command and layout](phase-6-complete-first-card-held-command-and-layout.md) | Added by delivery audit: show the last message on a stopped phase that can't be resumed, let `kiln carry-on --message-reviewed` work on a held phase, keep **PR into** on a multi-repository row whose branch is unavailable, and lay out Documents found's plan-source box and Start from choices as drawn. | 4, 5 |

## Acceptance-criterion ownership

| Owning phase | Criteria |
|---|---|
| 1 | AC-CASE-01, AC-CASE-02, AC-CASE-03, AC-CASE-04; AC-CARRY-01, AC-CARRY-02, AC-CARRY-03, AC-CARRY-04, AC-CARRY-05, AC-CARRY-06; AC-LOOK-01 (also applies to Phases 2 and 3) |
| 2 | AC-FROM-01, AC-FROM-02, AC-FROM-03, AC-FROM-04, AC-FROM-05; AC-CURRENT-01 |
| 3 | AC-RESET-01, AC-RESET-02, AC-RESET-03, AC-RESET-04, AC-RESET-05, AC-RESET-06 |
