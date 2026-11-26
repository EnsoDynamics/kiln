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
**Status**: DRAFT - No assumption awaiting validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Model Modes. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** will be documented in the technical design, `kiln-model-modes-technical-design.md`, once it is written.

---

No open assumptions. Every assumption raised so far has been confirmed; the table below says where each now lives.

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WHEN-001 | A third fallback setting, For everything, stands in for switching an agent off by name | 2026-11-26 | Confirmed in chat. In the PRD: AC-WHEN-01, AC-WHEN-02 and Out of Scope |
| WHEN-002 | With For everything on, a run waits when a fallback can't be used and never runs on the first choice | 2026-11-26 | Confirmed in chat. In the PRD: AC-WHEN-02 |
| MODE-001 | One model has no fallback; at a usage limit the run waits | 2026-11-26 | Confirmed in chat. In the PRD: AC-MODE-03 |
| ROW-001 | The preflight and the pull request session share one row, Opus medium with GPT Sol medium as its fallback | 2026-11-26 | Confirmed in chat. In the PRD: AC-ROW-01 |
| SAVE-001 | "This session only" means this PRD: the change is kept until Use my defaults here, including when Kiln restarts, and is stored outside the repository | 2026-11-26 | Confirmed in chat, once told the copy adds no file to the repository. In the PRD: AC-SAVE-04 |
| SAVE-002 | A PRD with its own settings keeps a copy of the whole page, and later changes to the defaults don't reach it | 2026-11-26 | Confirmed in chat. In the PRD: AC-SAVE-04 |
