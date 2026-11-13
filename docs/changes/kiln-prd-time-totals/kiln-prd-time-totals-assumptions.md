# Kiln PRD Time Totals — Assumptions

<!-- Before editing, load assumptions-document-writing; for stakeholder answers,
     also load assumptions-document-feedback. IDs are permanent. Keep one Last
     Updated line; remove superseded entry text rather than layering history. -->

**Last Updated:** 2026-11-13

This proposed product choice accompanies the [change PRD](kiln-prd-time-totals-prd.md). Work proceeds on it unless corrected.

### TOTAL-001. After added phases are continued, the PRD total counts from the continuation? ⏳ PENDING (75% confidence)

**Assumption:** When a completed PRD continues with phases added later, or a run starts again after a missing folder, Kiln starts a new execution of the PRD. The PRD total line then counts that execution only, "since" the time it started, and the earlier execution stays in the run's history with when it started and finished.

**Evidence:** Kiln keeps each earlier execution as a history row with its start, finish and deliveries, but not its sessions' running time, so totalling across executions would need new saved data. The request was for the cost of "the entire PRD so far", which reads as including earlier executions; continuing a completed PRD is uncommon next to a PRD's own run.

**Impact if wrong:** Medium — after a continuation the line understates the PRD's whole cost, and Kiln would need to keep each execution's totals to add them in.

**Confirm or Correct:**

- [ ] Correct as stated
- [ ] Wrong — the total should include every earlier execution, and say so
- [ ] Wrong — correct answer: _______________
