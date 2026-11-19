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

## Continuing Assumptions

### DEV-001. When a run is continued on its open branch, does it keep the development deployments and early-merge permissions the person gave the original run?

**Assumption**: **Yes: a run continued while its pull requests are still open keeps the development deployments and early-merge permissions** the person gave the original run. Kiln does not ask for them again.

It is the **same run, on the same branch, in the same folders**, updating the same pull requests. Kiln already keeps these permissions when a person **starts a run again after its folder went missing**. A continuation **after a merge or close** still turns development deployments off and asks again, because it builds on a **new branch**.

Against: the continued run also builds **phases added since delivery**, which the person had not seen when they gave the permission.

**Example**: The person allowed early merges into **develop** for the run's repository. Delivery left **2 phases** open. While the pull request is still open, they choose **Continue with 2 phases**: Kiln may merge those phases' work into develop early **without asking again**.

**If they choose otherwise**: A run continued on its open branch starts with development deployments **off** and asks for early-merge permission **again**, as a continuation after a merge or close does.

**Researched**: 2026-11-18; Kiln Missing Worktree Recovery's rule for a Start after a missing folder (AC-SAFE-03), Kiln Continue Added Phases' rule for a continuation's early-merge permission (AC-CONTINUE-09), this PRD and its design.

**Confirm or Correct**:
- [ ] Correct — a run continued on its open branch keeps the permissions the person gave
- [ ] Wrong — it starts with development deployments off and asks for early-merge permission again
- [ ] Wrong — different approach: _______________

**Confidence**: 86% | **Impact**: 🟡 MEDIUM

---

## Loop Assumptions

### LOOP-003. When Kiln stops at a later delivery audit limit, does Allow also build the phases left open earlier?

**Assumption**: **Only the phases set aside because no loop was left.** Allow builds them with the phases the stopped audit added, in plan order and **as one loop**. **Phases the person accepted leaving open at an earlier stop stay open**, the page names them, and **Continue with N phases** offers them after delivery.

The exception: when a phase the loop builds **depends on** an accepted phase, it cannot be built without it. Kiln then also builds that accepted phase, and any phase left open that it depends on in turn, and the page names them. The other phases accepted at that stop stay open.

A phase set aside because no loop was left was never a decision: Allow gives loops, so its reason is gone. An accepted phase is: the person looked at it and chose to leave it, and Allow at a later stop answers what that later stop shows.

Against: **one answer that builds everything left open** is simpler to explain, and a person who allows more loops may expect it to finish the lot.

**Example**: The run used its **3** delivery audit loops. At the stop after loop 3, the person accepted leaving **Phase 10** open. The test audit then added **Phase 11**, partly built, and Kiln set it aside because no loop was left. A later delivery audit added **Phase 12** with a criterion not built at all, so Kiln stopped. The person allows **1** more loop: loop 4 builds **Phase 11 and Phase 12**, and **Phase 10 stays open**, offered by Continue after delivery. Had Phase 12 depended on Phase 10, loop 4 would build **Phase 10** too, and the page would say so.

**If they choose otherwise**: Allow builds **every phase left open, accepted ones included**, and the page names the accepted ones as being built after all.

**Researched**: 2026-11-18; Kiln's code for choosing the next phase and skipping phases set aside, this design's Allow and phases left open, this PRD's Allow (AC-ANSWER-02) and Out of Scope.

**Confirm or Correct**:
- [ ] Correct — Allow builds the phases set aside because no loop was left; accepted ones stay open unless a phase it builds depends on one
- [ ] Wrong — Allow builds every phase left open, accepted ones included
- [ ] Wrong — different approach: _______________

**Confidence**: 60% | **Impact**: 🔴 HIGH

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. The stakeholder review shows them in an optional closing section.

### LOOP-001. When a run that was allowed more loops is continued with new phases, does it keep the raised limit?

**Assumption**: **Yes: the continued run keeps the limit Allow raised**, rather than going back to the limit the person first chose. Its loop counts still start at **zero**.

**Example**: The person chose **3** delivery audit loops. The run used all 3, stopped, and the person allowed **2** more, so the limit became **5**. After delivery they choose **Continue with N phases**: the continued run starts at loop 0 of **5**, not 0 of 3.

That is what "the three settings **carry over unchanged**" means today (RUN-003 in Kiln Audit Loop Limits): Allow raises the limit in the run's own settings, and nothing records the number it replaced. The person also sees **both limits** on the finished run's page and can **lower one before pressing Continue**.

Against: the reason limits exist is a closing pass that runs away (Doug, 2026-11-14, coming back "two days later" to "a dozen iterations of the audit"). A raised limit lets the continued run loop longer before it stops than the person's own number would.

**Depends on**: RUN-003 in Kiln Audit Loop Limits

**If they choose otherwise**: Each time the person allows more loops, Kiln **remembers the limit it replaced**, and Continue **puts back the earliest one** for each kind, so a continued run starts again with the person's own number (**3** in the example).

**Researched**: 2026-11-18; Kiln's code for Allow and for Continue, this PRD and its design, the Kiln Audit Loop Limits PRD and assumptions.

**Confirm or Correct**:
- [ ] Correct — a continued run keeps the raised limit (5 in the example)
- [ ] Wrong — a continued run goes back to the limit the person first chose (3 in the example)
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW

---

### LOOP-002. Under Deliver, and tell me what is left, does raising the delivery audit limit while the run is still going build the phases left open?

**Assumption**: **Yes: raising the delivery audit limit builds the phases left open**, with the phases that depend on them, in plan order and **as one loop**, as Allow does. It takes effect at **Kiln's next decision whether to start a loop**; a test audit running at the time **finishes first**, and the audits after the loop run as usual.

It builds **the phases Allow would build** (LOOP-003): those set aside because no loop was left, and a phase the person **accepted** leaving open only when one of those depends on it. The run's settings say so **beside the delivery audit limit** while such phases are left open.

Allow now raises the limit itself, so **a raise and Allow are the same number** and should do the same thing. Kiln Audit Loop Limits already says a change applies from Kiln's next decision whether to start a loop (AC-LOOP-05). Under this setting there is **no stop, so no Allow**: otherwise the only way to build them is **Continue after delivery**.

Against: a decision already recorded should stand. A settings change brings back work that was set aside, and the test audit **redoes its results** after the loop.

**Example**: The person chose **3** delivery audit loops. The audit after loop 3 added **Phase 10 and Phase 11**, both partly built, so Kiln left them open and started the test audit. While it runs, the person raises the delivery limit to **4**. Once the test audit finishes, Kiln builds Phase 10 and Phase 11 as **loop 4 of 4**, then runs both audits again.

**Depends on**: LOOP-003

**If they choose otherwise**: Raising the limit applies **only to phases audits add later**; the phases already left open stay open until **Continue after delivery**, and the settings say so beside the limit.

**Researched**: 2026-11-18; Kiln Audit Loop Limits' rule for changing a limit during a run (AC-LOOP-05), this PRD's Allow (AC-ANSWER-02), this design's loop gate.

**Confirm or Correct**:
- [ ] Correct — raising the delivery limit builds the phases Allow would build, at Kiln's next decision whether to start a loop
- [ ] Wrong — a raise applies only to phases audits add later; those left open wait for Continue after delivery
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| ITEM-001 | Behavior changed outside the requirements, and a human action that none of Kiln's remaining work in the run needs, no longer hold the run; Kiln delivers and lists both under **For you** | Written up 2026-11-18 | The team's call, research settled it at 95%: now a PRD requirement in AC-ITEM-01 and AC-ITEM-03, basis in Business Context |
| SET-001 | A run already going when Kiln is upgraded keeps its **When the loops run out** choice, which then covers both audits | Written up 2026-11-18 | The team's call, one sensible answer: now a PRD requirement in AC-CHOICE-01 |
