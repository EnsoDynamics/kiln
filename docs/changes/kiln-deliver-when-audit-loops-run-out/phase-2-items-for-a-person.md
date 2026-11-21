# Phase 2: Items for a person

**Closed:** 2026-11-19

**Parent PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md)
**Technical design:** [Kiln Deliver When Audit Loops Run Out technical design](kiln-deliver-when-audit-loops-run-out-technical-design.md) — relevant sections: "Items for a Person" (Report contract, What each kind does, For you), "Loops and the Ledger" (findings always built; nothing recorded as done that isn't), "Prompts" (`audit-session.txt` kinds and `{{nextSteps}}` lines; `pull-request-person-items.txt` **For you**), "Upgrade" (`itemsUnread`, items with no kind), "Open Questions"

## Summary
Make every item an audit lists for a person say its kind, the problem, the action and what waits on it, and stop the run only for an item the work cannot go on without: a critical finding the next step would worsen stops at once, a blocker or unanswerable business question holds the run short of the pull request until a person provides it and presses **Continue anyway**, and everything else goes on and is listed under **For you** in each pull request's description and on the finished page. A session of test fixes that raises none of its rows ends the test work, with the rows left listed as test gaps.

## Acceptance criteria covered
AC-ITEM-01, AC-ITEM-02, AC-ITEM-03, AC-LAST-01, AC-LAST-05

## Out of scope for this phase
The **Closing audits** loop counts in the pull request description and on the finished page, the **Pull request description** check row that makes an already open pull request get this run's block, resumes carrying the current block, and the full `kiln status` projection (Phase 3).

## Phase dependencies
1 (the loop ledger, closure in `auditNext`, the limits in force and the `{{nextSteps}}` slot; the loop gate's item stops already removed).

## Phase-specific notes
- Settle the design's one Open Question (which Kiln 1.3.0 waived audits are `itemsUnread`) by checking 1.3.0 record shapes, then record the answer in the technical design.
- AC-ITEM-01's scenarios with a pull request already open, or opened outside Kiln, rest on Phase 3's **Pull request description** row; prove them there. This phase proves the hold stop and **For you** on a pull request Kiln's own session opens.
- AC-LAST-01's routing half (findings built whatever the counts) arrives in Phase 1 with AC-LAST-03; this phase adds the `raised` refusal and proves the whole criterion.
