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

### PAUSE-006. Keep `kiln status`'s status values and change only its wording?

**Assumption**: **Yes.** A pending or completed Pause now keeps the status values bots read today; only the human-readable text changes, to "Pausing" and "Paused" (AC-PAUSE-05). The browser header and the terminal summary line change as the mockup shows.

**If they choose otherwise**: `kiln status` gains a distinct paused-partway value, and bots that read the current values must be updated.

**Evidence**: Bot control's status contract is consumed by scripts; new values would break them for a wording change. The mockup the stakeholder approved covers the browser only.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — add a distinct status value for a mid-activity pause

**Confidence**: 85% | **Impact**: 🟢 LOW

### PAUSE-007. Fold today's "reply and resume" into an optional note on Resume?

**Assumption**: **Yes.** The paused page has no separate reply card. The **Let Kiln carry on** column has an optional **Note for Claude** box above **Resume**; with text, Resume sends it as today's **Send reply & resume** does, and keeps it unsent where today's reply is kept (AC-PAUSE-06).

**If they choose otherwise**: The paused page also shows today's "Reply here and let Kiln finish" card, or drops replying altogether.

**Evidence**: The approved mockup shows two columns and no reply card, but replying is an existing capability (AC-BACK-01 in Control a live Kiln session) the stakeholder did not ask to remove. A note on Resume keeps it in the column it belongs to.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep the separate reply card
- [ ] Wrong — drop replying from this page

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

### PAUSE-005. Can a pending pause be withdrawn before the stop without disturbing the running session?

**Assumption**: Yes. Withdrawing the hold before the agent reaches its next safe point lets the running attempt carry on unchanged, as if Pause now had never been pressed (AC-PAUSE-04).

**Evidence**: The safe point is enforced when the agent next tries to start work, by reading the hold Kiln saved. Until then nothing has been sent to the session, so removing the hold should leave it untouched.

**Blocked by**: Kiln has no cancel path today, so there is nothing to run against.

**Would settle it**: A spike against the safe-point gate: request Pause now during a long command, withdraw it, and confirm the next command starts with no interruption or extra turn.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — the fact is: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| PAUSE-001 | One immediate pause, **Pause now**, replaces Pause & take over. Whether to resume in Kiln or take over in a terminal is chosen on the paused page, which offers both side by side. Per the stakeholder (2026-11-19): "it's like three different kinds of pauses ... maybe it should just be pause now. And once you do that, yes, it just pauses, but it also gives you the resume command"; on the resulting mockup: "it looks good now." Earlier the same day: "I also do want the ability to pause and take over the session ... we don't want to lose that." | ✅ 2026-11-19 | PRD AC-PAUSE-01, AC-PAUSE-06 |
| PAUSE-004 | The page an immediate pause lands on shows no completion checks, Check again or Mark complete; Resume's own recheck notices work finished in the terminal. Per the stakeholder (2026-11-19): "if you just paused it here, there's nothing to check. ... It came to a stop because you explicitly hit pause." | ✅ 2026-11-19 | PRD AC-PAUSE-06 |
