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

**Last Updated**: 2026-11-18
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Deliver When Audit Loops Run Out. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Validated Assumptions table is a business assumption.

**Technical details** are documented in the [Technical Design Document](kiln-deliver-when-audit-loops-run-out-technical-design.md).

---

## Test Assumptions

### TEST-001. After the test audit's last loop, does a test only you can accept go to the pull request, listed for you, instead of stopping the run? — ⏳ PENDING (Added 2026-11-18 — new question; 85% confidence)

**Assumption**: **Yes: Kiln goes on to the pull request** and lists each such test under **For you** at the top, as **not accepted**. It does not stop and wait for you.

These are a criterion with **no test**, a **failing test**, a **high-risk criterion still Weak**, or a row the audit marked **stuck**. The last loop's sentence accepts only the **remaining Weak rows**, and the test audit accepts these others only when **you name them**, so Kiln cannot accept them for you.

While test loops are left, such a test **does not stop the run either**: the next loop may fix it.

The same goes for **test work the last loop saved** but did not do, and for **Weak rows** the last loop's sentence did not accept, such as in a run whose person chose to be asked: they are listed, not stopped on.

Delivering is what you asked for at the limit: when the last loop is done, the run goes **straight to the pull request**. Kiln never merges its own pull request, so you still decide on each listed test **before the work lands**.

Against: a **failing test** in a pull request is more serious than a Weak one, and a stop would make you look at it before anything is delivered.

**Example**: The test audit used its **4** loops. The last one fixed what it could and accepted 2 Weak rows by the sentence. It still lists **AC-LABEL-05 with no test**, because the label service has no sandbox. Kiln opens the pull request, and **For you** lists AC-LABEL-05: no test, not accepted.

**If they choose otherwise**: Kiln **stops at Needs you** once nothing else is left, with each such test listed, and opens no pull request until you accept or fix them.

**Researched**: 2026-11-18; the stakeholder ruling of 2026-11-18 that a run at its limits goes straight to the pull request, Kiln Audit Loop Limits' handling once no test loop is left (AC-TEST-02) and the test audit skill's rule that it accepts these tests only when the person names them.

**Confirm or Correct**:
- [ ] Correct — after the last test audit loop, such tests go to the pull request, listed under For you as not accepted
- [ ] Wrong — Kiln stops at Needs you until you accept or fix them
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| DEV-001 | A run continued on its open branch keeps the development deployments and early-merge permissions | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18: every audit finding is built, so no phase is left open and no run continues on its open branch |
| LOOP-001 | A continued run keeps the limit Allow raised | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18 removed Allow; a limit changed in the settings carries over as any setting does (PRD AC-CHOICE-02) |
| LOOP-002 | Raising the delivery limit mid-run builds the phases left open | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18: no phase is left open; a raise after a kind's last loop runs that audit again (PRD AC-CHOICE-02) |
| LOOP-003 | Allow at a later stop builds only the phases set aside for lack of a loop | Answered 2026-11-18 | Stakeholder ruling 2026-11-18, in chat on the review: "if it finds stuff, it should always fix whatever it found", and at the limit "it would just end". No phase is left open and there is no stop at a limit: PRD AC-LAST-01 to AC-LAST-03, AC-STOP-04 |
| ITEM-001 | Behavior changed outside the requirements, and a human action that none of Kiln's remaining work in the run needs, no longer hold the run; Kiln delivers and lists both under **For you** | Written up 2026-11-18 | The team's call, research settled it at 95%: now a PRD requirement in AC-ITEM-01 and AC-ITEM-03, basis in Business Context |
| SET-001 | A run already going when Kiln is upgraded keeps its **When the loops run out** choice, which then covers both audits | No longer applies 2026-11-18 | Stakeholder ruling 2026-11-18 removed the setting; a run already going keeps its limits (PRD AC-CHOICE-01) |
