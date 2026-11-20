# Phase 1: Move on at the loop limits

**Closed:** 2026-11-19

**Parent PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md)
**Technical design:** [Kiln Deliver When Audit Loops Run Out technical design](kiln-deliver-when-audit-loops-run-out-technical-design.md) — relevant sections: "Existing Code" (the loop stop machinery removed), "Settings", "Loops and the Ledger", "Routing After the Last Loop", "The Status Line", "Removed Controls", "Interfaces" (the two new commands, `kiln settings` flags, controls list, Compatibility), "Prompts" (`{{nextSteps}}`; deleted loop and acceptance prompts), "Upgrade" (settings, ledger, `atPullRequest`, a stored `loop_limit` stop)

## Summary
Count each run of a delivery or test audit as one loop against two limits that default to 4, build whatever every audit finds, and once a kind's limit is used stop running audits of that kind and go on to the next step instead of stopping to ask. The loop stop page, Allow, Accept and the third setting go away, the status line names the loop, and a bot can check a finished run for new phases and continue it from the command line.

## Acceptance criteria covered
AC-CHOICE-01, AC-CHOICE-02, AC-LAST-02, AC-LAST-03, AC-STOP-04, AC-STOP-05, AC-BOT-01

## Out of scope for this phase
Item kinds, the hold stop, **For you**, the `raised` rule for sessions of test fixes and AC-LAST-01/AC-LAST-05 (Phase 2); the pull request description's loop counts, the **Pull request description** check row, the finished page and `kiln status` reporting (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
- Items keep their Kiln 1.3.0 behavior in this phase: any item an audit lists still keeps the run from delivering. Phase 2 replaces that rule.
- `{{nextSteps}}` names the next step from routing only; the hold-stop and test-row sentences it gains are Phase 2's.
- Upgrade: an `itemsUnread` marker and kind-less items are Phase 2's; a 1.3.0 pull request session with no saved block is Phase 3's.
