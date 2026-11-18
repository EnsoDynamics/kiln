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

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Deliver When Audit Loops Run Out. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Validated Assumptions table is a business assumption.

**Technical details** are documented in the [Technical Design Document](kiln-deliver-when-audit-loops-run-out-technical-design.md).

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. The stakeholder review shows them in an optional closing section.

### LOOP-001. When a run that was allowed more loops is continued with new phases, does it keep the raised limit?

**Assumption**: **Yes: the continued run keeps the limit Allow raised**, rather than going back to the limit the person first chose. Its loop counts still start at **zero**.

**Example**: The person chose **3** delivery audit loops. The run used all 3, stopped, and the person allowed **2** more, so the limit became **5**. After delivery they choose **Continue with N phases**: the continued run starts at loop 0 of **5**, not 0 of 3.

That is what "the three settings **carry over unchanged**" means today (RUN-003 in Kiln Audit Loop Limits): Allow raises the limit in the run's own settings, and nothing records the number it replaced. The person also sees **both limits** on the finished run's page and can **lower one before pressing Continue**.

Against: the reason limits exist is a closing pass that runs away (Doug, 2026-11-14, coming back "two days later" to "a dozen iterations of the audit"). A raised limit lets the continued run loop longer before it stops than the person's own number would.

**Depends on**: RUN-003 in Kiln Audit Loop Limits

**If they choose otherwise**: Each time the person allows more loops, Kiln **remembers the limit it replaced**, and Continue **puts back the earliest one** for each kind, so a continued run starts again with the person's own number (**3** in the example).

**Researched**: 2026-11-18; Kiln's code for Allow and for Continue, this PRD and its design, the Kiln Audit Loop Limits PRD and assumptions.

**Confirm or Correct**:
- [ ] Correct — a continued run keeps the raised limit (5 in the example)
- [ ] Wrong — a continued run goes back to the limit the person first chose (3 in the example)
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| ITEM-001 | Behavior changed outside the requirements, and a human action that none of Kiln's remaining work in the run needs, no longer hold the run; Kiln delivers and lists both under **For you** | Written up 2026-11-18 | The team's call, research settled it at 95%: now a PRD requirement in AC-ITEM-01 and AC-ITEM-03, basis in Business Context |
| SET-001 | A run already going when Kiln is upgraded keeps its **When the loops run out** choice, which then covers both audits | Written up 2026-11-18 | The team's call, one sensible answer: now a PRD requirement in AC-CHOICE-01 |
