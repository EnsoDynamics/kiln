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

**Last Updated**: 2026-11-19
**Status**: No open assumptions

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Deliver When Audit Loops Run Out. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Validated Assumptions table is a business assumption.

**Technical details** are documented in the [Technical Design Document](kiln-deliver-when-audit-loops-run-out-technical-design.md).

---

No open assumptions: every entry has been answered or settled.

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| DEV-001 | A run continued on its open branch keeps the development deployments and early-merge permissions | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18: every audit finding is built, so no phase is left open and no run continues on its open branch |
| LOOP-001 | A continued run keeps the limit Allow raised | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18 removed Allow; a limit changed in the settings carries over as any setting does (PRD AC-CHOICE-02) |
| LOOP-002 | Raising the delivery limit mid-run builds the phases left open | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18: no phase is left open; a raise after a kind's last loop runs that audit again (PRD AC-CHOICE-02) |
| LOOP-003 | Allow at a later stop builds only the phases set aside for lack of a loop | Answered 2026-11-18 | Stakeholder ruling 2026-11-18, in chat on the review: "if it finds stuff, it should always fix whatever it found", and at the limit "it would just end". No phase is left open and there is no stop at a limit: PRD AC-LAST-01 to AC-LAST-03, AC-STOP-04 |
| ITEM-001 | Behavior changed outside the requirements, and a human action that none of Kiln's remaining work in the run needs, no longer hold the run; Kiln delivers and lists both under **For you** | Written up 2026-11-18 | The team's call, research settled it at 95%: now a PRD requirement in AC-ITEM-01 and AC-ITEM-03, basis in Business Context |
| SET-001 | A run already going when Kiln is upgraded keeps its **When the loops run out** choice, which then covers both audits | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18 removed the setting; runs already under way when Kiln is upgraded get no special handling, ruling 2026-11-19 (PRD Out of Scope) |
| TEST-001 | After the test audit's last loop, a test still missing, failing or Weak goes to the pull request, listed under **For you**, instead of stopping the run | Answered 2026-11-19 | Stakeholder ruling 2026-11-19 on the review package: after the last test audit, "if it found anything, then fix it… just like immediately go to the PR to like wrap the thing up… why do we need to officially approve any weak rows? … Just let them be." Now PRD AC-LAST-01, AC-LAST-05, AC-ITEM-01 and AC-LEFT-01 |
