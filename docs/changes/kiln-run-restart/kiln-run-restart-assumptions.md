# Kiln Run Restart - Assumptions

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

**Last Updated**: 2026-11-11
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Run Restart](kiln-run-restart-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

---

## Decided by the Project Team

> Business decisions the team made because each is easy to change after release. A stakeholder can still correct them.

### RERUN-001. Offer a Kiln-run new session at every stopped phase, or only when the old conversation can't be reopened?

**Assumption**: Only when the conversation can't be reopened. While it can, the page offers today's two choices, reply or resume in the same conversation, and no third.

A stopped phase with a usable conversation already has a button that gets Kiln going. A second button that does nearly the same thing in a fresh session is one more choice to puzzle over on a page that should be obvious. The 2026-11-11 run, which looked like a case for a fresh session, needed its branch brought up to date instead (AC-CURRENT-01).

**If they choose otherwise**: Every stopped-phase page also offers "Start a new session for Phase N", for a person who would rather not continue a conversation that has gone off track.

**Confirm or Correct**:
- [ ] Correct — a new session only when the conversation can't be reopened
- [ ] Wrong — offer a new session at every stopped phase as well
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

### UI-001. Hide the completion checks and Mark complete for a phase that built nothing?

**Assumption**: Yes: when a stopped phase has no commits and no uncommitted changes, the page shows **Nothing to check yet** in place of the completion checks and **Mark complete**, with **Check Phase N anyway** for a person who built the phase somewhere else.

On 2026-11-11 the page showed failing checks and **Mark phase 1 complete** for a phase that had never started; marking it complete would have skipped the phase.

**If they choose otherwise**: The checks and **Mark complete** stay on the page as today, under a line saying the phase has built nothing yet.

**Confirm or Correct**:
- [ ] Correct — replace them with "Nothing to check yet"
- [ ] Wrong — keep the checks visible, with a line saying nothing is built
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

### CTRL-001. Which of the new actions can be given from phone-driven control, and which are browser-only?

**Assumption**: The two actions that start a session, **Send reply & continue Phase N** and **Start Phase N again**, are also commands for phone-driven control, alongside reply and resume, with the same limits. **Reset Kiln for this PRD** is browser-only in this change, because it needs its confirmation read; the command-line status of a stopped phase says the browser offers it.

**If they choose otherwise**: Reset gets a command too, with a confirming second step, or none of the three gets a command.

**Confirm or Correct**:
- [ ] Correct — commands for the two that start a session; reset in the browser only
- [ ] Wrong — a command for reset as well
- [ ] Wrong — different approach: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
