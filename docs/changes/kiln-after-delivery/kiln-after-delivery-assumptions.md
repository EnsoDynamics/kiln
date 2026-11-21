# Kiln After Delivery - Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE RIGHT SKILL FIRST ⚠️
     Recording a stakeholder's answer to an assumption below, however it
     arrives (a reply, an email, a decision given in chat):
     `assumptions-document-feedback`.
     Any other edit (a new entry, a rewrite, the header):
     `assumptions-document-writing`, which owns this document's format.
     Most edits here are made by sessions doing something else, which is
     exactly how the format drifts.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-11-21
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln After Delivery. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

---

## Scope Assumptions

### SCOPE-001. Offer the merge only when the delivery has a single open pull request?

**Assumption**: **Yes: Merge with {agent} appears only when a finished run has exactly one open pull request.** A delivery spread over several repositories, with one pull request in each, keeps today's page and the person merges those by hand.

**Evidence**: The request was about one pull request with conflicts. A delivery with several pull requests has an order to merge them in, which each pull request states, and merging them is a larger and riskier job than the one asked for.

**If they choose otherwise**: The page with several pull requests also shows the merge button. One session merges each pull request in the order they state, and Kiln confirms each merge on GitHub before showing Merged.

**Confirm or Correct**:
- [ ] Correct — one open pull request only
- [ ] Wrong — also merge a delivery with several pull requests, in their stated order
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

---

## Merge Session Assumptions

### MERGE-001. Run the merge session with no message box, Pause now or takeover, as the pull request session runs today?

**Assumption**: **Yes: while the merge session runs, its output can be watched but it cannot be messaged, paused or taken over.** If it stops before merging, the Needs you page offers a reply, Resume and the terminal command as usual.

**Evidence**: The mockup reviewed on 2026-11-21 first showed Pause now on the running merge session. Kiln's pull request session and its preflight offer none of the three today, and Kiln Pause Now left final delivery out of its scope. Adding them to the merge session would be new live-control work on top of this change.

**If they choose otherwise**: The page of a running merge session shows the pause panel and the message box that a running phase shows, and a paused merge session gets the Paused page.

**Confirm or Correct**:
- [ ] Correct — watch only while it runs
- [ ] Wrong — offer Pause now and messages on the running merge session too
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later.

### PLAN-001. Say in one line when a finished phase's document was edited later?

**Assumption**: **Yes: the answer carries one quiet line** naming the phase and saying Kiln does not rebuild finished phases and that changing that work takes a new phase. It never blocks anything.

**Evidence**: The review on 2026-11-21 dropped the "Plan needs reconciliation" block. Without any line, a person who edited a finished phase expecting Kiln to redo it would get no sign that it will not.

**If they choose otherwise**: The page says nothing about edits to finished phases.

**Confirm or Correct**:
- [ ] Correct — one line
- [ ] Wrong — say nothing
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW

### PLAN-002. Offer an unfinished phase that descends from a finished phase like any other new phase?

**Assumption**: **Yes: it is listed with the other added phases and built on Continue.** Kiln does not treat it as done because its parent was finished.

**Example**: In the fictional Customer returns plan, Phase 2 was finished. A later session adds `phase-2c-gift-card-refunds.md` beneath it. The offer lists Phase 2c as planned and not built.

**Evidence**: The offer lists the exact phases Continue would run and waits for a press, so the person sees the phase before anything is built. Treating it as done would hide planned work.

**If they choose otherwise**: Unfinished phases beneath a finished phase are counted as finished and never offered.

**Confirm or Correct**:
- [ ] Correct — offer it like any other added phase
- [ ] Wrong — treat it as finished, because its parent was
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

### AUDIT-001. Title the fixing sessions "Test fixes" and number only the audits as loops?

**Assumption**: **Yes: an audit's row reads "Loop 1 of 4", and each session that fixes what it saved reads "Test fixes · From test audit loop 1 · session 2".** Sessions of test fixes are not numbered as loops and do not count against the limit.

**Evidence**: The mockup reviewed on 2026-11-21 first numbered the fixing sessions as loops. That contradicted the rule Kiln already follows, that a loop is one run of an audit (AC-LAST-02 in Kiln Deliver When Audit Loops Run Out), so the rows were corrected to follow it.

**If they choose otherwise**: Each fixing session is numbered as a loop and counts against the test audit limit, which changes what the limit means and replaces AC-LAST-02.

**Confirm or Correct**:
- [ ] Correct — only audits are loops; fixing sessions are titled Test fixes
- [ ] Wrong — count each fixing session as a loop
- [ ] Wrong — different wording: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
