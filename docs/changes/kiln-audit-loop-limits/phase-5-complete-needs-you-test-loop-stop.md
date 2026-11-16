# Phase 5: Make only a test audit's own `needs_you` report a test loop stop, and keep Reply there

**Closed:** 2026-11-15

**Added by delivery audit:** 2026-11-15, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md)
**Technical design:** [Kiln Audit Loop Limits technical design](kiln-audit-loop-limits-technical-design.md) — relevant sections: "`needs_you` loop stops", "Reply and Take over", "Which session a stop control starts"
**Repositories:** kiln

## Summary
Once no test loop is left, only a test audit whose admitted report asks a person to decide something becomes a test loop stop. A refused or missing report, or a report that stopped only because a repository or development check failed, stays the ordinary failing-check stop. At a test loop stop where the audit has asked the person something, the run's page offers Reply as at any Needs you stop.

## Acceptance criteria covered
AC-TEST-02 (completes it; owned by phase 1), AC-STOP-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-TEST-02:** `needsYouLoopStop` in `src/engine/loop-gate.ts` derives a test loop stop (`{ kind: "test", reason: "items_listed" }`) from `attempt.nextAction === "needs_you"`. But `submitAudit` in `src/audit/admission.ts` sets `nextAction: "needs_you"` on every unresolved attempt (lines 122 and 157). That covers a refused report, a missing one, and an admitted `passed` or `continue_test` report whose repository or development checks failed (unpushed work, say). With no test loop left, a `passed` report that lists nothing, stopped by unpushed work, therefore gets the test loop page in the page, `kiln status` and the stop commands. That page shows "Test audit loops used: N of N", lists nothing, and offers **Allow _N_ more loops** and **Accept what is left and deliver**. That is row 3 of the criterion's table applied to a row-2 report, where the run should carry on as today: the ordinary failing-check stop that RUN-001 describes. A refused report that appended phases reaches the same stop, because `attemptPhases` returns no phases for a refused attempt. The stop should be derived only from an admitted, unrefused report whose own outcome is `needs_you`.
- **AC-STOP-02:** Reply is not offered on the run's page at a `needs_you` test loop stop. In `view/src/components/LoopStop.svelte`, `reply` is `loop.reason !== "items_listed" && stop.resumeOffered`. A derived `needs_you` loop stop also has reason `items_listed`, so Reply is hidden there. `NeedsYou.svelte` renders only `LoopStop` at a loop stop, so no other Reply appears. The criterion keeps Reply "as at any Needs you stop" and leaves it out only "at a stop for listed items, because that audit has finished". A `needs_you` audit has not finished, and the technical design says Reply at that stop resumes the same conversation. The command line already offers `reply` there through `controlView`. Reply should be hidden only at a stored `loop_limit` stop for listed items.

## Phase dependencies
1 (the `needs_you` loop stop, the stop page and its controls), 4 (`needsYouLoopStop`'s handling of a report that adds phases)
