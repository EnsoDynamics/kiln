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

## Model Assumptions

### MODEL-001. Does Kiln ship with every requirements stage on the most capable model?

**Assumption**: Yes: Kiln comes with **one default for all requirements stages**, set to the choice it ships for demanding phases. No stage ships on a cheaper model. A person who wants the design refinement on a cheaper model changes that stage once and ticks **Use this for Refine the design on every PRD**.

The alternative is to ship the design refinement on the standard choice, since it is the longest stage and is normally run on a cheaper model. It lost because Kiln holds no list of the method's stages (AC-PLAN-02): shipping a choice for one stage means shipping that stage's skill name inside Kiln, and a method that renames the stage would drop the choice without anyone having made it.

**If they choose otherwise**: Kiln would come with a remembered choice for the design refinement already saved, on the standard choice, and a first run would use less of a subscription's allowance without any setup.

**Confirm or Correct**:
- [ ] Correct — one default, every stage on the most capable model until the person changes one
- [ ] Wrong — ship the design refinement on the standard choice
- [ ] Wrong — different approach: _______________

**Confidence**: 60% | **Impact**: 🟡 MEDIUM

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

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
