# Phase 3: Report the delivered run

**Closed:** 2026-11-20

**Parent PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md)
**Technical design:** [Kiln Deliver When Audit Loops Run Out technical design](kiln-deliver-when-audit-loops-run-out-technical-design.md) — relevant sections: "What a Delivered Run Says", "Interfaces" (Status and snapshot), "Prompts" (`pull-request-person-items.txt` **Closing audits**; the resume carry-on lines), "Upgrade" (a 1.3.0 pull request session with no saved block), "Delivery"

## Summary
Open each pull request's description with **For you** and how many loops of each kind the run used, make sure a pull request already open, even one opened outside Kiln, gets this run's block before the run completes, and show the same loop counts and **For you** on the finished page and in `kiln status`, which reports everything these screens show in text and JSON.

## Acceptance criteria covered
AC-LEFT-01, AC-LEFT-02, AC-BOT-02

## Out of scope for this phase
The parent PRD's Out of Scope.

## Phase dependencies
1 (the ledger, `atPullRequest` and the limits in force); 2 (item kinds, the hold stop and the **For you** block).

## Phase-specific notes
- Proves AC-ITEM-01's scenarios with a pull request already open or opened outside Kiln (see Phase 2's notes).
- Adds the design's Delivery `CHANGELOG.md` entries under Unreleased; the release is a major version.

## Carried forward from Phase 1
- `kiln status` text prints the loop lines (`auditLoopsText` in `src/control/loop-text.ts`) whatever the controller's version; the design's Compatibility section renders them only when the controller advertises `loop_limits_move_on`. Gate them as part of this phase's `kiln status` work.
- `kiln check-for-new-phases` already returns the check and offer as `data.check` and `data.proposal` (`continuationFacts` in `src/control/server.ts`); `kiln status`'s own `continuation` object (AC-BOT-02) reuses that projection, and the `continue-with-phases` help in `prompts/kiln-command-contracts.json` then points at `status.continuation.proposal.id` too.

## Carried forward from Phase 2
- A hold stop reached after a pull request session already ran (its check sent the run back to the audits, whose second round listed a holding item) offers **Continue anyway**, never Mark final delivery complete, and neither waiving it nor the earlier pull request completes the run. `offerWording` in `src/engine/engine.ts` already picks the offer by the **Nothing holds the run** row; prove it here, beside the **Pull request description** row, since the setup always has a pull request open.
- In Phase 2 the hold stop's Continue anyway reads "completes the run" whenever the pull request precheck would pass at its latest Check again (`holdLeadsTo` on the stop), which still includes a pull request already open. Once the **Pull request description** row makes an open pull request start a session, that case reads "starts the pull request session"; check the sentence and the `kiln status` preview line for it.
- **For you** is in the snapshot as `delivered.forYou` (`src/audit/for-you.ts`); `kiln status` does not print it yet. Add it to the status JSON and text with the loop counts, and render the pull request description block (`deliveryBlock`) with **Closing audits** between **For you** and **Settled during the build**.

