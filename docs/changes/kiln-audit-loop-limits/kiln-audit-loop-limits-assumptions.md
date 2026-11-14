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

**Technical details** are documented in the [Technical Design Document](kiln-audit-loop-limits-technical-design.md).

---

## Run Assumptions

### RUN-001. When the person marks a failing audit complete after its loops are used up, does Kiln wait for them to allow more loops before doing the work the audit asked for?

**Assumption**: **Yes.** This happens in one case only: Kiln stops on an audit because one of its checks failed (unpushed work, say), the audit's report **added phases** or **saved test work** (or it left no report after adding phases), **no loop of that kind is left**, and the person presses **Mark complete**. Kiln settles the failing check and does **not rerun** the audit, then stops again for loops: it builds those phases or starts that session only once a loop of that kind is left, after **Allow N more loops** or a raised limit. At a test audit stop, **Accept what is left and deliver** goes on instead. Mark complete **never counts as allowing a loop**.

Nowhere else do the two answers differ. At a stop because the loops are used up, Mark complete is **not offered**. At a stop where the audit needs the person, marking complete counts as passed, which asks for no further loop.

Doug, 2026-11-14, replacing a "fix these, one more loop" button: "instead of just saying one more, which would then potentially stop you again, maybe you could have the ability to authorize like. Two or three more … that you fill that out." A Mark complete that started a loop would bring back the unstated one more, in place of a number the person fills in.

Kiln Completion Waivers (2026-11-01) made Mark complete for "When Kiln refuses to continue but the work is done", because "A mechanical check will always meet a case it gets wrong." The check it settles here is the failing one, not the loop limit, which is the point the person chose to be asked.

Against: the **2026-11-02 ruling** (Kiln Completion Waivers WAIVE-006, now AC-WAIVE-12): an audit marked complete counts as passed, and "Kiln follows its report if it left one"; with no report, "Completion phases it already appended still run first", so as to avoid "sending the person back to the same audit." Read as written, that starts the work. The audit is still not rerun here, but the ruling came **before loop limits existed**.

**If they choose otherwise**: Marking the audit complete in that case counts as allowing **one more loop** of that kind: Kiln builds the added phases or starts the saved session, and the stop page says so beside the button.

**Researched**: 2026-11-14; still theirs. Tried: the Kiln Completion Waivers PRD, assumptions and design, including the 2026-11-02 ruling's wording (WAIVE-006 and AC-WAIVE-12); this PRD and its design; the Kiln architecture Principles; Kiln's source; Doug's 2026-11-01 to 2026-11-03 and 2026-11-14 chats.

**Confirm or Correct**:
- [ ] Correct — marking complete there starts no loop; the run waits until a loop of that kind is left (Allow N more loops, or a raised limit) or the person accepts
- [ ] Wrong — keep the 2026-11-02 ruling: marking complete starts the work the report asks for, counted as one more loop
- [ ] Wrong — different approach: _______________

**Confidence**: 90% | **Impact**: 🟢 LOW

---

### RUN-003. When a finished run is continued with Continue with N phases, do both loop counts start again from zero?

**Assumption**: **Yes.** Continuing a finished run counts as a **Start**: the delivery and test audit loop counts both start at **zero**, and the three loop settings **carry over unchanged**. The loops the earlier run made stay in its history and are **not counted again**.

Kiln already treats a continuation as a new run: it starts with no audits behind it, "Earlier successful audits or merged PRs cannot satisfy completion for the new work" (Kiln Continue Added Phases, AC-CONTINUE-05), and the run's existing settings still govern it (AC-CONTINUE-08).

Doug, 2026-11-14, on why limits exist: "the whole point of Kiln is so that it doesn't just stop you... left and right"; the worry is coming back "two days later" to "a dozen iterations of the audit". That is **one closing pass running away**. Phases the person deliberately added and continued are a new pass.

Against: Doug, 2026-11-13, overruling a fresh start for the PRD time totals (TOTAL-001): "it should just continue accumulating the time. Like anything that it does in Kiln that where we have it measured, I would have it just continue to accumulate." That ruling was about a **time readout**, not a limit that stops the run, but read broadly it covers loop counts too.

**If they choose otherwise**: The counts carry into the continued run. A run that had used its loops **stops at Needs you the first time** an audit in the continuation adds phases or saves test work, and the person chooses **Allow N more loops** to go on.

**Researched**: 2026-11-14; still theirs. Tried: the Kiln Continue Added Phases PRD and design; Kiln's continuation code and how it rebuilds a run's activity history; this PRD and its design; Doug's 2026-11-07 to 2026-11-14 chats; the Kiln PRD Time Totals assumptions. Not tried: email and meeting archives.

**Confirm or Correct**:
- [ ] Correct — continuing starts both counts at zero and keeps the three settings
- [ ] Wrong — keep counting: the continued run carries the earlier run's loop counts
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. The stakeholder review shows them in an optional closing section.

### RUN-002. Does a run that was already going when Kiln is upgraded count the loops it has already made?

**Assumption**: **Yes.** A run started under an earlier Kiln **counts the loops it has already made**, as its saved audit history shows them (AC-LOOP-02, AC-LOOP-03), against limits of **3 and 3**. A run that has already looped three times stops at its **next decision** whether to loop.

Doug, 2026-11-14: "if you don't look at it and you come back like two days later and then you just see that it went through a dozen iterations of the audit… you may have just kind of wasted a lot of time and tokens for very little value." Counting from zero would give a run that is already looping **up to three more sessions** of two and a half to four hours each before any stop.

Doug, 2026-11-14, on a limit of three: "three full rounds… then when it starts up the fourth audit, if it finds any fixes after that, that's where it would have to stop." That reads as a count from the run's start.

Against: Doug, 2026-11-14: "it could be the middle of the night. The user could be sleeping, and that could be more time that we could have done test audits that we're losing because we're now waiting." The cost is small here: a run already going moves to the new Kiln only when someone restarts it, so a run past its limit stops **right after that restart**, while that person is likely there to choose **Allow N more loops**.

**If they choose otherwise**: Kiln counts from zero at the upgrade and no longer rebuilds the count from the run's saved audit history, so an upgraded run gets up to **three more loops of each kind** before it stops.

**Researched**: 2026-11-14; Doug's 2026-11-14 chat, this PRD, the Kiln Upgrade While Running PRD, how earlier upgrades carried unfinished runs over (Kiln Completion Audits, Kiln Method-Neutral Audits), Kiln's saved audit records and what `kiln run` does with a run already started.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| RUN-002 (part) | A run begun under an earlier Kiln runs under **Always stop and ask me**, with limits 3 and 3, until the person chooses | Written up 2026-11-14 | The team's call, one sensible answer: the test audit accepts Weak rows only on the person's own words, quoted with where they said them, and a run that never showed the setting has none. PRD AC-LOOP-07; Technical Design §Settings and §Upgrade |
