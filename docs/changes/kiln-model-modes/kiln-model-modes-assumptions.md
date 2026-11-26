# Kiln Model Modes - Assumptions

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

**Last Updated**: 2026-11-26
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Model Modes. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** will be documented in the technical design, `kiln-model-modes-technical-design.md`, once it is written.

---

## Saving Assumptions

### SAVE-001. Does "this session only" mean this PRD, kept until you undo it? — ⏳ PENDING (Ruled 2026-11-26 — we read your words; updated 2026-11-26; 85% confidence)

**We read your words**: on 2026-11-26 you said the list this was on "sounds good", and in the same message leaned towards a change that is gone when Kiln stops. We read the lean as resting on where the copy would be kept, and that turns out not to be a problem.

**Assumption**: **Yes.** The second place to save is **This PRD only**. The PRD keeps the change until you press **Use my defaults here**, including when Kiln is **stopped and started again**. The copy is kept with Kiln's own record of the PRD, **outside the repository**, so there is no file to commit or ignore (AC-SAVE-04).

**Why your 2026-11-26 answer didn't close this**: You asked whether the change would be "saving it somewhere in the PRDs directory", said you would lean towards not checking such a file in, and concluded: "For that reason, it seems like it might be easier to just have it be ephemeral." Kiln already keeps a record of each PRD on this computer, outside every repository, and the copy goes there. With that reason gone, we kept the change across restarts. Confirm that, or say you want it gone when Kiln stops anyway.

**If they choose otherwise**: The change lasts only while Kiln stays running. When Kiln is stopped and started again on the PRD, it follows the defaults again, and the page no longer says the PRD has its own settings.

**Example**: You save "For everything" for this PRD only on Monday to spare an account, and stop Kiln overnight. On Tuesday the remaining phases still launch on their fallbacks. If the change were gone when Kiln stops, Tuesday's phases would launch on the account you meant to spare.

**Evidence**: You asked on 2026-11-26: "Should we save these as global defaults, or is it for this session only?", with the example of switching Claude off for the few days before a limit resets. A PRD's run can outlast one sitting, and Kiln is stopped and started again during it.

Against it: a second PRD started the next day follows the defaults, so you would set it again there. And a change you forgot about stays until you undo it; the page and Documents found both say when a PRD has its own settings.

**Confirm or Correct**:
- [ ] Correct — this PRD, until I undo it, kept when Kiln restarts
- [ ] Wrong — gone when Kiln stops
- [ ] Wrong — corrections: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WHEN-001 | A third fallback setting, For everything, stands in for switching an agent off by name | 2026-11-26 | Confirmed in chat. In the PRD: AC-WHEN-01, AC-WHEN-02 and Out of Scope |
| WHEN-002 | With For everything on, a run waits when a fallback can't be used and never runs on the first choice | 2026-11-26 | Confirmed in chat. In the PRD: AC-WHEN-02 |
| MODE-001 | One model has no fallback; at a usage limit the run waits | 2026-11-26 | Confirmed in chat. In the PRD: AC-MODE-03 |
| ROW-001 | The preflight and the pull request session share one row, Opus medium with GPT Sol medium as its fallback | 2026-11-26 | Confirmed in chat. In the PRD: AC-ROW-01 |
| SAVE-002 | A PRD with its own settings keeps a copy of the whole page, and later changes to the defaults don't reach it | 2026-11-26 | Confirmed in chat. In the PRD: AC-SAVE-04 |
