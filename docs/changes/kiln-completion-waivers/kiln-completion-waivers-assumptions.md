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

**Last Updated**: 2026-11-01
**Status**: DRAFT - Pending business validation (WAIVE-001 reopened, WAIVE-004, WAIVE-006)

**Document Purpose**: This document lists the business assumptions we're making to proceed with [Kiln completion waivers](kiln-completion-waivers-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

---

## Waiver Assumptions

### WAIVE-001. Can every failing check be waived, or only the checks of whether the work is done? — ⏳ PENDING (Reopened 2026-11-01 against the 2026-11-01 ruling — NEW SINCE YOUR ANSWER; 80% confidence)

**What changed since your answer**: On 2026-11-01 you ruled that **any failing completion requirement can be waived, at any stopped activity**, not only development delivery, because a mechanical check can be wrong at any step and **the person must never be stuck** behind one. Going through every check Kiln runs since then found a few that do not judge finished work but decide **whether Kiln can go on at all**; you ruled before that was known. The narrower answer below keeps your goal: none of the excluded checks judges finished work, and waiving one would leave Kiln nothing to advance to, mark unbuilt work complete or skip a safety guard (see Evidence). Current completion audits can stand in front of finished work, so it never holds the button back. The build proceeds on it; the PRD records your ruling as given.

**Assumption**: Mark complete waives every check of **whether the work is done**, an audit's own result included: **Audit result recorded** when Kiln has no usable report, and **Audit work resolved** when the report needs a person. It never waives the checks Kiln needs to **work out what comes next and start it safely**. That rule decides each check, including any added later; the table sorts the checks Kiln runs today. What a waived audit then counts as is WAIVE-006.

| Check | At Mark complete |
|---|---|
| Phase doc closed, Everything committed, Pushed, Pull request open, Required development delivery verified, Development delivery and remaining review, Audit result recorded, Audit work resolved, Audit evidence is current | **Waived** with the other failing items |
| Phase plan reads, Completion audit readiness, Prerequisite preparation, Prepared checkpoint, Preparation permissions, Codex launch settings, and recovery and safety checks such as Recovered conversation, Claude recovery, Codex recovery, Preparation recovery and Codex process cleanup and dispatch | **Mark complete is not offered** while one fails; Kiln says it must pass first, and Check again stays available |
| Current completion audits (final delivery only) | **Mark complete never waives it, but it does not hold the button back**: the other failing items are waived, then Kiln runs the audit or phase that check names, as it already does when that check fails alone, and checks final delivery again |

**Evidence**:
- **Phase plan reads** and **Completion audit readiness** fail when Kiln **cannot read** the plan or **cannot work out** the next audit from the audit state, so past either failing there is **nothing to advance to**. A waiver can stand in for an audit's result (WAIVE-006), never for a plan or audit state Kiln cannot use.
- **Prerequisite preparation** is Kiln preparing what a phase needs from another PRD before that phase starts (not a development-delivery checkpoint's prerequisite). It holds the phase back **before any of its work exists**, so waiving it would mark unbuilt work complete. **Prepared checkpoint** and **Preparation permissions** guard the same preparation, and **Codex launch settings** fails only when the first launch was rejected before any work ran.
- **Recovery and safety checks** guard the saved conversation and running processes, not the work.
- **Current completion audits**: today Kiln runs the required audits only when this is the **only** failing check, and otherwise stays stopped. Holding Mark complete back while it fails would leave a person stuck at final delivery behind a wrong delivery check.

**Confirm or Correct**:
- [ ] Correct — only the "is the work done" checks can be waived, as in the table
- [ ] Wrong — keep the original ruling: every failing check can be waived
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

### WAIVE-004. Does a checkpoint resolved by a waiver count as resolved for the checkpoints that depend on it? — ⏳ PENDING (Added 2026-11-01 — new question; 75% confidence)

**Assumption**: **Yes.** A checkpoint resolved only by waiving its failing requirements **also counts as resolved** for the checkpoints that depend on it, for as long as the waiver holds (same checkpoint, same merge revision). Each dependent checkpoint's **own** requirements still need their own evidence or their own waiver.

**Example**: Checkpoint `phase3-dev-fixes-4` fails `dev-health-reports-merge`, and the person waives it. A later checkpoint that depends on `phase3-dev-fixes-4` no longer fails with "prerequisite phase3-dev-fixes-4 is unresolved", so the person is not asked to waive the same root cause again. (These ids are the mockup's illustrative ones; no real dependent checkpoint was pulled.)

**Evidence**: Kiln today fails every dependent checkpoint with "prerequisite X is unresolved" until X has passing evidence. The settled rule that the same unchanged item is **never waived twice** (WAIVE-002), and the goal that the person is **never stuck behind a wrong check**, favour counting the waiver. The first draft said the opposite (a waiver never resolves another checkpoint), so this is not settled.

**Confirm or Correct**:
- [ ] Correct — a checkpoint resolved by a waiver counts as resolved for its dependents
- [ ] Wrong — each dependent checkpoint fails on it until it is waived there too
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟡 MEDIUM

### WAIVE-006. What does an audit marked complete before Kiln accepted its report count as when Kiln picks what comes next? — ⏳ PENDING (Added 2026-11-01 — new question; 65% confidence)

**Assumption**: It depends on the report the audit left (PRD AC-WAIVE-12). An accepted report needs no assumption: its own outcome decides. What the audit counts as is **set at the waiver**; from then on, an audit counted as accepted **stays current as any accepted audit does**, so a delivery audit stays current through a test audit that changed only tests.

| The audit's report | The waived audit counts as | It stays current |
|---|---|---|
| **Valid but not accepted**: it says a person is needed, or Kiln held it back because a repository was not committed or pushed, or Required development delivery verified failed | **Accepted**: its outcome, and for a test audit its changed-implementation statement, decide what comes next; **needs a person counts as passed** | As an accepted audit does |
| **No report Kiln could use**: missing, unreadable, refused, or changed while Kiln checked it | **Passed**, but a test audit is **never taken as having changed only tests**: if the work changed since the delivery audit, Kiln runs a **fresh delivery audit and test audit** before final delivery | Only **until anything is committed, the next audit's report included** |

Every audit commits its report, so a **delivery audit marked complete with no report usually runs again** after its test audit, and that test audit then runs again too.

**Example** (illustrative, no real record pulled):
- A **test audit's report says a person is needed** and that it **changed implementation**. The person decides the open question is fine and marks it complete. Kiln runs a **fresh delivery audit**, as the report's own statement asks, instead of going straight to final delivery.
- A **test audit's session ended with test commits but no report**. The person marks it complete. Because nothing says those commits touched only tests, Kiln runs a **fresh delivery audit, then a fresh test audit**, instead of going straight to final delivery.
- A **delivery audit's report says a person is needed**. The person marks it complete, and the test audit that follows **changes only tests**. Kiln goes on to **final delivery**; the delivery audit is not run again.

**Evidence**:
- Kiln today picks the step after an audit **only from a report it accepted**: a passed delivery audit, and a test audit's outcome (passed or more testing) and its statement of whether it **changed implementation**. A report that says a person is needed, or is held back by unpushed work or a failing development-delivery check, is **valid but never accepted**; without this rule a person who marks the audit complete is sent straight back to it.
- A report that says a person is needed can never pass **Check again**, so for that audit Mark complete is the normal way on. Its outcome and statement are valid, so following them keeps the audit's own request for a fresh delivery audit.
- Every audit commits and pushes its report, so **every test audit moves a feature head**. If every waived audit counted only until anything is committed, a waived delivery audit would run again after every test audit, and one that keeps asking for a person would **loop** through Mark complete. An accepted delivery audit already stays current through test-only changes (PRD AC-NEUTRAL-06 in Kiln method-neutral audits), so the waived one follows the same rule.
- With no usable report there is no statement. A waiver is never evidence (PRD AC-WAIVE-09): the person confirmed the work is done, not what the commits changed, so it counts only until anything is committed, the next audit's report included.
- How this arose: the earlier draft assumed a report held back by unpushed work fails Audit result recorded; Kiln's code shows it passes that check and fails as an ordinary unpushed check instead.

**Confirm or Correct**:
- [ ] Correct — a valid report decides as if accepted (needs a person counts as passed) and stays current as an accepted audit; with no report, a test audit is not taken as test-only and the audit counts only until anything is committed, the next audit's report included
- [ ] Wrong — ignore a report Kiln did not accept and count the audit as passed: in the first example, Kiln goes straight to final delivery
- [ ] Wrong — with no report, take a test audit as having changed only tests: in the second example, Kiln goes straight to final delivery
- [ ] Wrong — every waived audit counts only until anything is committed: in the third example, Kiln runs the delivery audit again after the test audit, and it may ask for a person again
- [ ] Wrong — different approach: _______________

**Confidence**: 65% | **Impact if Wrong**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WAIVE-001 | Corrected: any failing completion requirement can be waived, at any stopped activity, not only development delivery | 2026-11-01 | Moved to PRD AC-WAIVE-02; Reopened 2026-11-01, see body |
| WAIVE-002 | A waived requirement also counts at final delivery; the same unchanged item is never waived twice | 2026-11-01 | Moved to PRD AC-WAIVE-09 |
| WAIVE-003 | Corrected: not person-only; bots waive through `kiln waive-and-advance`, under the same Needs you eligibility as the browser | 2026-11-01 | Moved to PRD AC-WAIVE-05 |
