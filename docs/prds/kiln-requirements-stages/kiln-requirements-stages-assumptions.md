# Kiln Requirements Stages - Assumptions

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

**Last Updated**: 2026-11-23
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Requirements Stages. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** will be documented in the technical design, which is not written yet.

---

## Home Screen Assumptions

### HOME-001. Should old PRDs with no phase plan be kept out of the main list?

**Assumption**: Yes: a PRD with **no phase plan and no Kiln run**, whose documents last changed **more than 30 days ago**, is listed under a collapsed **Older** heading and not in Under way. Every other unfinished PRD is in Under way.

A small PRD built by hand in one session never gets a phase plan, and nothing in its documents says it was built. Kiln can't tell it from a PRD someone stopped working on. **9 of the 28** PRD folders in Kiln's own repository are like this, and all nine are built. Without this rule the home screen would open on nine lines that need nothing.

**If they choose otherwise**: every PRD without a phase plan would be listed in Under way as waiting for its next requirements stage, however old, and the person would need a way to hide each one.

**Confirm or Correct**:
- [ ] Correct — older than 30 days goes under Older
- [ ] Wrong — list them all, and let me hide a line
- [ ] Wrong — different approach: _______________

**Confidence**: 50% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later.

### REVIEW-001. Does a PRD whose phase plan was written by hand skip Kiln's final review?

**Assumption**: Yes: a PRD that already has its phase plan when Kiln is first pointed at it **starts as it does today**. Kiln makes no stakeholder review for it and adds no stop. People who run the requirements by hand and use Kiln only for the build see no change.

**If they choose otherwise**: Kiln would have a stakeholder review made for every PRD before its build, including ones prepared by hand, and would stop at it.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

---

### BEGIN-001. Is the feature branch named from the source material's folder?

**Assumption**: Yes: the branch is `feature/` followed by **the source material folder's name**, or a planned PRD's directory name. The branch is cut before the PRD has a title, so it can't be named from one. When the PRD's title gives its folder a different name, the branch keeps the name it was cut with.

**Example**: source material in `source-material/gift-card-balance/` gets the branch `feature/gift-card-balance`. If the PRD is titled "Gift Card Balance Lookup", its folder is `docs/prds/gift-card-balance-lookup/` and the branch is still `feature/gift-card-balance`.

**If they choose otherwise**: Kiln would rename the branch to match the PRD's folder once the draft exists, and the screens would show the new name from then on.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — rename the branch to match the PRD's folder after the draft
- [ ] Wrong — different approach: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

---

### HOME-002. Is a PRD that another Kiln is running shown but not startable?

**Assumption**: Yes: its line says it is running and gives **the address of the Kiln running it**. It can't be opened for a second run from the home screen. Kiln already refuses to run one PRD twice and points at the running one's address.

**If they choose otherwise**: the home screen would either leave such a PRD out, or open the other Kiln's view of it inside this one.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

### MODEL-002. Does refining the design ship at high effort?

**Assumption**: Yes: the **Refining the design** row ships as **Opus at high effort**, with GPT Sol at high effort as its fallback. Business stakeholders set the model on 2026-11-23, one down from the most capable, and did not name an effort. High matches the effort of the other requirements stages.

**If they choose otherwise**: the row would ship at medium effort, the effort Kiln ships for standard phases, and a design refinement would use less of a subscription's allowance.

**Confirm or Correct**:
- [ ] Correct — high effort
- [ ] Wrong — medium effort
- [ ] Wrong — different answer: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| MODEL-001 | Requirements stages default to the provider's most capable model, except refining the design, which defaults to one model down. Both are defaults the person can change | 2026-11-23 | Corrected by the stakeholder: "default to the most capable model of the provider for everything except for design refinement (which should be the model down from it)". Now AC-MODEL-02 in the PRD |
