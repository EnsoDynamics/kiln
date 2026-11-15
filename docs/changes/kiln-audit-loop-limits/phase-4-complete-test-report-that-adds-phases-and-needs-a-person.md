# Phase 4: Handle a test audit report that adds phases and needs a person as a delivery audit's

**Added by delivery audit:** 2026-11-15, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md)
**Technical design:** [Kiln Audit Loop Limits technical design](kiln-audit-loop-limits-technical-design.md) — relevant sections: "`needs_you` loop stops", "Which session a stop control starts"
**Repositories:** kiln

## Summary
Once no test loop is left, a test audit report that adds phases is handled as a delivery audit's report that added them, even when it also asks a person to decide something, instead of becoming a test loop stop for the items it lists.

## Acceptance criteria covered
AC-TEST-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-TEST-02:** a test audit's `needs_you` report that also appends phases (admission records it as unresolved with the failing "Audit work resolved" check, `src/audit/admission.ts`) fits the table's first row, "Adds phases, whatever else it lists". It should get the stop a delivery audit's `needs_you` report with phases gets, and its phases should then go through the delivery loop gate. Instead `needsYouLoopStop` in `src/engine/loop-gate.ts` never reads the report's `completionPhases`. While no test loop is left, it turns that `done_check` stop into a test loop stop (`{ kind: "test", reason: "items_listed" }`). Through `Engine.loopStopOf` (`src/engine/engine.ts`) that gives it the test loop page, and through `loopControl` the **Allow _N_ more loops** (test) and **Accept what is left and deliver** controls, in the page, `kiln status` and the stop commands. That is the third row applied in place of the first.

## Phase dependencies
1 (the loop gate, the `needs_you` loop stop and the stop controls)
