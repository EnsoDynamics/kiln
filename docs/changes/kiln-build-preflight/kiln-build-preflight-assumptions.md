# Kiln Build Preflight - Assumptions

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

**Last Updated**: 2026-11-15
**Status**: 1 open assumption (RUN-004) - pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Build Preflight. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

---

## Run Assumptions

### RUN-004. Does every Start that ends a pause run the preflight first? — ⏳ PENDING (Added 2026-11-15 — new question; 85% confidence)

**Assumption**: Yes: **every Start that ends a pause runs the preflight first**, whether pressed on the Paused page, given with `kiln continue`, or pressed on the Folder missing page, **even when the run's preflight has already reported ready or been marked complete**.

Pauses exist so a person can switch accounts or model, and can last overnight (Kiln v1 AC-VIEW-03, AC-VIEW-08, AC-WATCH-08). The person is at the screen when they press Start and about to walk away, and a clean preflight costs **a few minutes** and asks nothing of them (AC-PREFLIGHT-02). This follows the same reasoning as RUN-003.

**If they choose otherwise**: A Start after a pause skips the preflight when one has already reported ready or been marked complete for the run.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Decision | Validated | Where it lives |
|---|---|---|---|
| RUN-001 | Kiln starts a phase marked as needing a person like any other and does what it can until it reaches that work; the mark is only a heads-up. Per the stakeholder (2026-11-15): "it most certainly should not just stop preemptively, it should do what it can until it gets to that point. The badge and the wording is just kind of like a heads up." | ✅ 2026-11-15 | PRD, AC-ATTEND-04 |
| RUN-002 | Kiln never lists the preflight report's stops: not on a clean preflight's row, not on the items page, not in a line above Start. The **Needs you there** markers on planned phases are the only heads-up. Per the stakeholder (2026-11-15): "the badge or label on it is just sort of like a heads up that those phases are going to have that happen. I think that's all we need"; on the line above Start: "get rid of that in the mock up, and we'll rely on the badges to do their job." | ✅ 2026-11-15 | PRD AC-PREFLIGHT-02, AC-PREFLIGHT-03, AC-ATTEND-01; AC-PREFLIGHT-07 and AC-ATTEND-02 retired |
| RUN-003 | Every press of Start or Continue runs the preflight first, including a Start where every phase is already closed (it runs before the delivery audit); phases added mid-run get none. | Written up 2026-11-15 | The team's call, one sensible answer (a run of audits alone is hours long and unattended): PRD AC-PREFLIGHT-01 and AC-PREFLIGHT-08 |
