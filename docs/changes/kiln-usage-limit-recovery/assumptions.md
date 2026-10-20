# Kiln usage-limit recovery - Business Assumptions

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

**Last Updated**: 2026-10-20
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the business assumptions we're making to proceed with [Kiln usage-limit recovery](kiln-usage-limit-recovery-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

---

## Screen Assumptions

### UI-001. Offer Resume on every stop where the session ended on its own, not only on usage-limit stops? — ⏳ PENDING (Added 2026-10-20 — new question; 85% confidence)

**Assumption**: **Resume appears on every Needs you whose session ended on its own**: a failed done check after any phase session, and a pull-request session with no pull request open. It is left off only where there is no session to pick up: a broken-plan stop, a session whose first run never started, and an interrupted session that already couldn't be resumed.

**Evidence**: The request was "a resume button on the Needs you screen", made while discussing usage limits. Resuming costs the same whatever the cause, and Kiln v1 forbids Kiln from deciding a stop's cause from the session's words (AC-STOP-04), so limiting Resume to limit stops would hide it whenever Claude Code's report is missing. The risk is a session that stopped to raise a critical finding: Resume tells it to carry on, which could push past the finding. The optional note (UI-002) is what lets the person answer it instead.

**Confirm or Correct**:
- [ ] Correct — Resume on every stop where the session ended on its own
- [ ] Wrong — Resume only on usage-limit stops
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟢 LOW

---

### UI-002. Let the person add a note to the session when pressing Resume? — ⏳ PENDING (Added 2026-10-20 — new question; 70% confidence)

**Assumption**: **An optional text box sits beside Resume.** What the person types is sent to the session in their own words, ahead of Kiln's instruction to carry on with the phase. Left empty, the session gets the instruction alone.

**Example**: The [ended-with-message mockup](mockups/kiln-screen-needs-you-resume.html) stops on a critical finding about a migration numbering clash. The person types "Rebase on develop and renumber the migration to 0043, then carry on" and presses Resume, instead of opening a terminal to say the same thing.

**Evidence**: Not requested. Without it, Resume on a session that stopped to ask something can only say "carry on", and the person would still have to open a terminal to answer. It is one text box and no new screen.

**Confirm or Correct**:
- [ ] Correct — optional note beside Resume
- [ ] Wrong — Resume alone, no note
- [ ] Wrong — different approach: _______________

**Confidence**: 70% | **Impact if Wrong**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
