# Kiln completion waivers - Business Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE `assumptions-document-writing` SKILL FIRST ⚠️
     It owns this document's format, and most edits here are made by sessions
     doing something else — recording a ruling while building a phase — which is
     exactly how the format drifts. Folding a stakeholder's answers? Load
     `assumptions-document-feedback` as well.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-11-02
**Status**: VALIDATED - all assumptions validated (2026-11-02)

**Document Purpose**: This document lists the business assumptions we're making to proceed with [Kiln completion waivers](kiln-completion-waivers-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

---

## Waiver Assumptions

None pending: every assumption is validated below.

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WAIVE-001 | Corrected: any failing completion requirement can be waived, at any stopped activity, not only development delivery | 2026-11-01 | Moved to PRD AC-WAIVE-02. Reopening withdrawn 2026-11-02; Doug's ruling stands: any failing check can be waived, no exceptions |
| WAIVE-002 | A waived requirement also counts at final delivery; the same unchanged item is never waived twice | 2026-11-01 | Moved to PRD AC-WAIVE-09 |
| WAIVE-003 | Corrected: not person-only; bots waive through `kiln waive-and-advance`, under the same Needs you eligibility as the browser | 2026-11-01 | Moved to PRD AC-WAIVE-05 |
| WAIVE-004 | A checkpoint resolved only by waiving its failing requirements also counts as resolved for the checkpoints that depend on it, while the waiver holds; each dependent checkpoint's own requirements still need their own evidence or waiver | 2026-11-02 | Moved to PRD AC-WAIVE-09 |
| WAIVE-006 | An audit marked complete counts as passed: Kiln follows its report if it left one, and otherwise moves on with a "no audit report" warning instead of running it again | 2026-11-02 | Moved to PRD AC-WAIVE-12 |
