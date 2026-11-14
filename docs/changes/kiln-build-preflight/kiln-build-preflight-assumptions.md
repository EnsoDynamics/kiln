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

**Last Updated**: 2026-11-14
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Build Preflight. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

---

## Run Assumptions

### RUN-001. Does Kiln start a phase marked as needing a person like any other phase, rather than waiting for the person before it?

**Assumption**: **Yes.** Kiln shows the mark **before Start** and in the plan, then starts the phase as usual. If the phase reaches work only a person can do, it stops at Needs you as any phase does, and the page says it was planned that way.

The request, on 2026-11-14, was for a warning up front: "Kiln might be able to put some icon next to it to sort of warn the user right up front instead of like them starting it thinking that, hey, I'm going to go to bed and wake up and this thing's going to be done." It did not say whether Kiln should also hold the phase.

The method plans this work into the **first phases**, so the person is normally still there when it runs. Much of a marked phase is ordinary work a session can do before it needs anyone, and holding the phase would make them wait for that part too.

**If they choose otherwise**: Kiln stops at Needs you **before** starting each marked phase, and starts it only when the person presses a button saying they are there.

**Confirm or Correct**:
- [ ] Correct — warn before Start, then start the phase as usual
- [ ] Wrong — hold each marked phase until the person says they are there
- [ ] Wrong — different approach: _______________

**Confidence**: 70% | **Impact**: 🟡 MEDIUM
