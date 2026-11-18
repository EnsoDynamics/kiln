# Kiln Deliver When Audit Loops Run Out - Assumptions

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

**Last Updated**: 2026-11-18
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Deliver When Audit Loops Run Out. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. The stakeholder review shows them in an optional closing section.

### ITEM-001. Does a run still stop before delivery when an audit only names something for the person to record or do later?

**Assumption**: **No.** Two kinds of item stop holding the run: **behavior changed outside the requirements**, which the person records in the PRD, and **a human action still waiting** that the requirements do not place before delivery. Kiln delivers and lists each one under **For you** at the top of the pull request and on the finished page.

A run is still held for a **critical finding**, a **blocker**, an action the requirements place **before delivery**, a business question with **no workable answer**, and a test only the person can accept.

Doug, 2026-11-18: a stop for a person is fine "as long as it's a good reason", clearly stated and "in line with the whole Enso Method"; a declared assumption is "never a reason to kind of stop a user." The method names an action only a person can take in the wrap-up, and "it stops the session only when it is also a blocker."

Against: Kiln Method-Neutral Audits (AC-NEUTRAL-03) stops today for "an audit that ended normally but lists behavior changed outside the requirements or a person action due before delivery". Doug's words above settle the declared assumption. That these two kinds also stop holding the run is **our reading** of them.

**If they choose otherwise**: Those two kinds **keep holding the run before delivery**, as today. Only a declared assumption, a request to confirm or review, and something the audit can settle itself stop being items.

**Researched**: 2026-11-18; still theirs. Tried: Doug's 2026-11-18 chat; the Enso Method's rule on what stops a session; the delivery audit and test audit skills' lists of what they name for the person; the Kiln Method-Neutral Audits PRD, assumptions and direction document.

**Confirm or Correct**:
- [ ] Correct — those two kinds are reported with the delivery and no longer hold the run
- [ ] Wrong — they keep holding the run before delivery
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

---

### SET-001. Does a run that was already going when Kiln is upgraded keep its choice, now covering the delivery audit too?

**Assumption**: **Yes.** A run started under an earlier Kiln keeps the choice it had, and that choice now covers **both audits**. A run on **Deliver** stops no longer at its delivery audit limit: it leaves the added phases open, delivers, and lists them at the top of the pull request. A run on **Always stop and ask me** keeps stopping at either limit.

The person who chose Deliver saw it described for the **test audit only**. Under the new meaning their run can open a pull request with criteria partly built, which they did not agree to in those words. The cost of being wrong is small: nothing is marked built that isn't, the pull request **says what was left at the top**, and the phases are still there to continue with.

Doug, 2026-11-18, on a run that began before loop limits existed: "I don't want to get overly hung up over the ephemeral edge case", and not "make a bunch of complexity to address a situation that we'll normally never have to deal with." A run moves to the new Kiln only when someone restarts it, so that person is there to see the setting.

Against: Kiln Audit Loop Limits took the careful answer for the same kind of case. A run that had never shown the setting runs under **Always stop and ask me** (AC-LOOP-07), because the test audit accepts weak tests only on the person's own words. Leaving phases open needs no such words, so that reason does not carry over.

**If they choose otherwise**: A run started under an earlier Kiln **keeps stopping at its delivery audit limit** until the person chooses **When the loops run out** again on the new screen, and the settings say why.

**Researched**: 2026-11-18; still theirs. Tried: Doug's 2026-11-18 chat; the Kiln Audit Loop Limits PRD and assumptions (AC-LOOP-07, RUN-002); both audit skills' rules for criteria an open completion phase covers.

**Confirm or Correct**:
- [ ] Correct — a run already going keeps its choice, and it covers both audits from the upgrade
- [ ] Wrong — such a run keeps stopping at the delivery audit limit until the person chooses again
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
