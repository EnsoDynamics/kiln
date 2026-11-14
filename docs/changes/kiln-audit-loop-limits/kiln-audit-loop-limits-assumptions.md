# Kiln Audit Loop Limits - Assumptions

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

**Last Updated**: 2026-11-14
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Audit Loop Limits. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

---

## Run Assumptions

### RUN-001. At a loop stop, does marking the audit complete leave Kiln waiting for the person to allow more loops, rather than starting the loop the audit's report asks for?

**Assumption**: **Yes.** At a stop because the loops are used up, **Mark complete** settles a failing check as at any stop and the audit is **not rerun**, but an audit whose report **added phases** or **saved test work** stays at the stop. Kiln builds those phases or starts that session only once a loop of that kind is left: after **Allow N more loops** or a raised limit. At a test audit stop, **Accept what is left and deliver** goes on instead. Mark complete **never counts as allowing a loop**.

Doug, 2026-11-14, replacing a "fix these, one more loop" button: "instead of just saying one more, which would then potentially stop you again, maybe you could have the ability to authorize like. Two or three more … that you fill that out." A Mark complete that started a loop would bring back the unstated one more, in place of a number the person fills in.

Kiln Completion Waivers (2026-11-01) made Mark complete for "When Kiln refuses to continue but the work is done", because "A mechanical check will always meet a case it gets wrong." A loop stop is not a check gone wrong: it is the point the person chose to be asked.

Against: the **2026-11-02 ruling**, now AC-WAIVE-12, "A waived audit counts as its report allows", so as to avoid "sending the person back to the same audit." That still holds, since the audit is not rerun, but the ruling came **before loop limits existed**.

**If they choose otherwise**: Marking the audit complete at a loop stop counts as allowing **one more loop**: Kiln builds the added phases or starts the saved session, and the stop page says so beside the button.

**Researched**: 2026-11-14; still theirs. Tried: the Kiln Completion Waivers PRD, assumptions and design, this PRD, the Kiln architecture Principles, Kiln's source, Doug's 2026-11-01 to 2026-11-03 and 2026-11-14 chats. Not tried: Doug's own words in the 2026-11-02 ruling.

**Confirm or Correct**:
- [ ] Correct — marking complete starts no loop; the run waits until a loop of that kind is left (Allow N more loops, or a raised limit) or the person accepts
- [ ] Wrong — keep the 2026-11-02 ruling: marking complete starts the loop the report asks for, counted as one more loop
- [ ] Wrong — different approach: _______________

**Confidence**: 90% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

### RUN-002. Does a run that was already going when Kiln is upgraded count the loops it has already made?

**Assumption**: **Yes.** A run started under an earlier Kiln takes limits of **3 and 3** and **counts the loops it has already made**, as its saved audit history shows them (AC-LOOP-02, AC-LOOP-03). A run that has already looped three times stops at its **next decision** whether to loop. It runs under **Always stop and ask me** until the person chooses, because it never showed them the setting (AC-LOOP-07).

Doug, 2026-11-14: "if you don't look at it and you come back like two days later and then you just see that it went through a dozen iterations of the audit… you may have just kind of wasted a lot of time and tokens for very little value." Counting from zero would give a run that is already looping **up to three more sessions** of two and a half to four hours each before any stop.

Doug, 2026-11-14, on a limit of three: "three full rounds… then when it starts up the fourth audit, if it finds any fixes after that, that's where it would have to stop." That reads as a count from the run's start.

Against: Doug, 2026-11-14: "it could be the middle of the night. The user could be sleeping, and that could be more time that we could have done test audits that we're losing because we're now waiting." The cost is small here: a run already going moves to the new Kiln only when someone restarts it, so a run past its limit stops **right after that restart**, while that person is likely there to choose **Allow N more loops**.

**If they choose otherwise**: Kiln counts from zero at the upgrade, so an upgraded run gets up to three more loops of each kind before it stops.

**Researched**: 2026-11-14; Doug's 2026-11-14 chat, this PRD, the Kiln Upgrade While Running PRD, how earlier upgrades carried unfinished runs over (Kiln Completion Audits, Kiln Method-Neutral Audits), Kiln's saved audit records and what `kiln run` does with a run already started.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW
