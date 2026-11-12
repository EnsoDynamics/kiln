# Kiln Checks at a Stop - Assumptions

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

**Last Updated**: 2026-11-12
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Checks at a Stop](kiln-checks-at-a-stop-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

---

## Stop Assumptions

### STOP-001. Can Mark complete be pressed straight from the automatic check, with no Check again first?

**Assumption**: Yes: once the automatic check at a stop finishes with a check still failing, **Mark complete** is usable at once (AC-STOPCHECK-07).

Today Mark complete needs the person to press **Check again** first (AC-WAIVE-02). That rule made sense when a stop showed only one row, because the recheck was the first time the full checks ran. With the full checks already on the page, the press shows nothing new. Mark complete still **reruns every check before it saves** and refuses if anything changed (AC-WAIVE-04), so nothing is waived that the person did not see.

**If they choose otherwise**: the button stays unusable with "Check again first" until the person presses Check again, as it is today, even though the full checks already show.

**Example**: a delivery audit stops at Needs you. The page shows **Why Kiln stopped** and, a moment later, its completion checks with one failing. **Mark delivery audit complete** can be pressed there and then.

**Confirm or Correct**:
- [ ] Correct — usable straight from the automatic check
- [ ] Wrong — keep "Check again first" even with the full checks showing
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

### STOP-002. Does Kiln move on by itself when the automatic check passes everything?

**Assumption**: No: the automatic check only shows results. When every check passes, the page says so and the person presses **Check again** to move Kiln on (AC-STOPCHECK-04).

Kiln stopped because something needed a person. Moving on without one, on a check nobody asked for, could start the next activity while the person is still reading the stop.

**If they choose otherwise**: a stop whose checks all pass clears itself and Kiln starts the next activity without anyone pressing anything.

**Confirm or Correct**:
- [ ] Correct — show the results and wait for Check again
- [ ] Wrong — move on automatically when every check passes
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM
