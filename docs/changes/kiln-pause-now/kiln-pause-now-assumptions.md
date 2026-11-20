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

**Last Updated**: 2026-11-20
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Pause Now. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** are documented in the [Technical Design](kiln-pause-now-technical-design.md).

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or is easy to change later.

### PAUSE-002. Offer Cancel pause in the browser only, with no command-line form?

**Assumption**: **Yes.** **Cancel pause and keep going** is a browser button while Kiln is pausing (AC-PAUSE-04). `kiln take-over` stays as it is, and no command cancels it. A bot that pauses by mistake waits for the pause and then resumes with the existing resume command.

**If they choose otherwise**: The command line gains a cancel command for a pending Pause now, with bot control's usual targeting and retry safeguards.

**Evidence**: The mockup the stakeholder approved shows the button and nothing else. A pause usually lands within seconds, so a bot rarely has time to cancel one, and resuming afterwards reaches the same place. Easy to add later. Against it: Control a live Kiln session gave the bot interface every live action the browser has, and the end-of-activity pause already has a command-line cancel, `kiln cancel-pause`.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — add a command-line cancel as well

**Confidence**: 80% | **Impact**: 🟢 LOW

### PAUSE-007. Fold today's "reply and resume" into an optional note on Resume?

**Assumption**: **Yes.** The paused page has no separate reply card. The **Let Kiln carry on** column has an optional **Note for Claude** box above **Resume**; with text, Resume sends it as today's **Send reply & resume** does, and keeps it unsent where today's reply is kept (AC-PAUSE-06).

**If they choose otherwise**: The paused page also shows today's "Reply here and let Kiln finish" card, or drops replying altogether.

**Evidence**: The approved mockup shows two columns and no reply card, but replying is an existing capability (AC-BACK-01 in Control a live Kiln session) the stakeholder did not ask to remove. A note on Resume keeps it in the column it belongs to.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep the separate reply card
- [ ] Wrong — drop replying from this page

**Confidence**: 80% | **Impact**: 🟢 LOW

### PAUSE-008. Keep the terminal card's tip to record changed decisions, and that no handoff phrase is needed?

**Assumption**: **Yes.** The **Or take it over yourself** column keeps both of today's sentences below its Resume hint: "Changed the plan? Ask Claude to record those decisions in the requirements before you exit. No special handoff phrase is needed." (AC-PAUSE-06).

**If they choose otherwise**: The column shows only the approved mockup's words, and the tip disappears from this page.

**Evidence**: The approved mockup had neither sentence, but both are existing requirements the stakeholder did not ask to remove (AC-BACK-01 in Control a live Kiln session, AC-TERMINAL-02 in Kiln Needs you handoff). Same reasoning as PAUSE-007.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — drop both sentences from this page

**Confidence**: 80% | **Impact**: 🟢 LOW

### PAUSE-009. Print the terminal's phase line as paused at the release, not as stopped and waiting when the session exits?

**Assumption**: **Yes.** In `kiln run`'s terminal output, the activity's line is printed **when the pause completes**, and reads **"paused · at {address}"** in the normal colour, without "waiting for you" (AC-PAUSE-05). A pause for an uncertain message keeps today's line.

**If they choose otherwise**: The phase line keeps today's amber **"stopped · waiting for you at {address}"**, printed when Claude's session exits.

**Evidence**: AC-PAUSE-05's intent is that an immediate pause reads as Paused, not Needs you, and the paused page says nothing is waiting on the person. Without this, the phase line printed during the run would still say "waiting for you".

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep today's "stopped · waiting for you" line

**Confidence**: 85% | **Impact**: 🟢 LOW

### PAUSE-010. Name a process Claude started that is keeping the pause from completing, and say Kiln won't stop it?

**Assumption**: **Yes.** When Claude has stopped, or is waiting only on a process it started, and that process is still running, such as a dev server, the pause panel names it (by its command, its process number, or both) and says **"Kiln won't stop it for you; if it's a server that keeps running, stop it and the pause completes."** (AC-PAUSE-03).

**If they choose otherwise**: The panel shows today's generic "The old process still owns this conversation.", and the person has to work out why the pause doesn't complete.

**Evidence**: Kiln never stops a running command (AC-TAKE-02 in Control a live Kiln session), and once Claude's tools are refused it can't stop a server it started, so without the person the pause never completes.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep today's generic line

**Confidence**: 75% | **Impact**: 🟢 LOW

---

## Technical Assumptions

> Facts the build relies on that research could not reach. Answered by the build team, not business stakeholders.

### PAUSE-003. Does a pause that is waiting still land safely if the computer sleeps first?

**Assumption**: Yes. When the lid closes while Kiln is pausing, the running command and Kiln freeze together. On wake, the command finishes, the session stops at the same safe point, and no new work starts in between. AC-PAUSE-03 tells the person they can close the lid on that basis.

**Evidence**: Kiln's hold is saved on disk before the pause is acknowledged (AC-TAKE-01 in Control a live Kiln session) and is honored after a Kiln restart. The safe stop happens when the agent next tries to start work, which cannot happen while the computer is asleep. The gate's hooks fail closed, so a hook that times out across a sleep blocks the new operation rather than allowing it, and nothing in the hold runs on a wall-clock deadline. A run that ends across a sleep is not resumed while a hold lasts, because the session's settlement reads the hold before its sleep recovery. Kiln's keep-awake holds idle sleep only, so closing the lid does sleep the machine. The design adds nothing for sleep (Technical Design §The Stop and Cancel).

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
| PAUSE-004 | The page an immediate pause lands on shows no completion checks, Check again or Mark complete; Resume's own recheck notices work finished in the terminal. Per the stakeholder (2026-11-19): "if you just paused it here, there's nothing to check. ... It came to a stop because you explicitly hit pause." | ✅ 2026-11-19 | PRD AC-PAUSE-06 |
| PAUSE-005 | A pending pause can be withdrawn before the stop without disturbing the running session. | Written up 2026-11-19 | Settled by reading the code: a hold reaches the session only through the gate's deny, yield and seal, and the design records the first of them as the stop and admits Cancel only before it. Technical Design §Existing Code and §The Stop and Cancel; the Cancel spike under §Verification proves it. |
| PAUSE-006 | A pending or completed Pause now keeps `kiln status`'s status values; only the readable text changes. | Moved to design 2026-11-19 | A build choice: keeping a machine contract compatible. Technical Design §Design Decisions, "What Pause now is". |
