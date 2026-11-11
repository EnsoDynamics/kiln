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

### RERUN-001. Offer "Run Phase N again" at every hand-back, not only when the old conversation is unusable?

**Assumption**: Yes: every phase hand-back offers **Run Phase N again**, including when the saved conversation could be resumed. The new session starts from the worktree as it stands, uncommitted changes included, and is told what is there.

The 2026-11-11 run is the case for offering it widely: the conversation was resumable in fact, but the person still wanted a clean start, because the old session had stopped on a blocker that no longer applied.

**If they choose otherwise**: The choice appears only when Kiln cannot reopen the conversation, or only when the phase has no commits since it started; otherwise the person replies to or resumes the old conversation.

**Confirm or Correct**:
- [ ] Correct — offer it at every hand-back
- [ ] Wrong — offer it only when the conversation can't be reopened
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

### CTRL-001. Are "Run again" and "Start over" browser-only in this change?

**Assumption**: **Run Phase N again** is also a command for phone-driven control, alongside reply and resume, with the same eligibility. **Start over** is browser-only in this change, because it needs the setup panel's choices; the command-line status of a stopped run lists it as a choice the browser offers.

**If they choose otherwise**: Start over gets a command too, taking the starting point and branch as options, or neither action gets a command.

**Confirm or Correct**:
- [ ] Correct — a command for Run again; Start over in the browser only
- [ ] Wrong — commands for both
- [ ] Wrong — different approach: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
