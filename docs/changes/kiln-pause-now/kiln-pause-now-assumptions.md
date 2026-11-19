# Kiln Pause Now - Assumptions

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

**Last Updated**: 2026-11-19
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Pause Now. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or is easy to change later.

### PAUSE-002. Offer Cancel pause in the browser only, with no command-line form?

**Assumption**: **Yes.** **Cancel pause and keep going** is a browser button while Kiln is pausing (AC-PAUSE-04). `kiln take-over` stays as it is, and no command cancels it. A bot that pauses by mistake waits for the pause and then resumes with the existing resume command.

**If they choose otherwise**: The command line gains a cancel command for a pending Pause now, with bot control's usual targeting and retry safeguards.

**Evidence**: The mockup the stakeholder approved shows the button and nothing else. A pause usually lands within seconds, so a bot rarely has time to cancel one, and resuming afterwards reaches the same place. Easy to add later.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — add a command-line cancel as well

**Confidence**: 80% | **Impact**: 🟢 LOW

---

## Technical Assumptions

> Facts the build relies on that research could not reach. Answered by the build team, not business stakeholders.

### PAUSE-003. Does a pause that is waiting still land safely if the computer sleeps first?

**Assumption**: Yes. When the lid closes while Kiln is pausing, the running command and Kiln freeze together. On wake, the command finishes, the session stops at the same safe point, and no new work starts in between. AC-PAUSE-03 tells the person they can close the lid on that basis.

**Evidence**: Kiln's hold is saved on disk before the pause is acknowledged (AC-TAKE-01 in Control a live Kiln session) and is honored after a Kiln restart. The safe stop happens when the agent next tries to start work, which cannot happen while the computer is asleep.

**Blocked by**: Observable only by sleeping a real machine mid-command, which the investigation for this PRD did not do.

**Would settle it**: One manual run: press Pause now during a long command, close the lid, wake the machine, and confirm the session stops after that command with nothing new started.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — the fact is: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| PAUSE-001 | One immediate pause, **Pause now**, replaces Pause & take over. Whether to resume in Kiln or take over in a terminal is chosen on the paused page, which offers both side by side. Per the stakeholder (2026-11-19): "it's like three different kinds of pauses ... maybe it should just be pause now. And once you do that, yes, it just pauses, but it also gives you the resume command"; on the resulting mockup: "it looks good now." Earlier the same day: "I also do want the ability to pause and take over the session ... we don't want to lose that." | ✅ 2026-11-19 | PRD AC-PAUSE-01, AC-PAUSE-06 |
