# Kiln After Delivery - Assumptions

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

**Last Updated**: 2026-11-21
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln After Delivery. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

---

## Scope Assumptions

### SCOPE-001. Offer the agent merge for a delivery with several pull requests too?

**Assumption**: **Yes: a finished delivery with a pull request in each of several repositories gets one Merge with {agent} button for the whole delivery.** One press lets one session merge each open pull request, **in the order the pull requests state**. If one cannot be merged, the session stops there at Needs you and leaves the later ones open. Kiln shows a pull request as merged only once GitHub confirms it.

This widens the draft, which offered the merge only when there was a single pull request.

**When the stated order is missing or wrong**: Kiln does not check the order. A pull request whose description names no order can merge at any point. A wrong order is followed as written. If GitHub refuses a merge, or its required checks never pass, the session stops at Needs you and leaves the later ones open. If nothing catches it, the pull requests merge in the wrong order, just as they would if the person merged them by hand from the same descriptions.

**Evidence**:
- What was asked: "I rarely ever merge anything myself anymore … I'm not handling that myself" (Doug, 2026-11-21). Of work across several repositories where one piece must go first: "just because that has to happen doesn't necessarily mean it has to stop for you", since Kiln "exists so that we can minimize stopping points as much as possible and it can autonomously carry the entire thing through" (Doug, 2026-11-15, said of merges in the middle of a run, not of final pull requests).
- Kiln already gives **one permission for all of a PRD's repositories**: in the Kiln Development Deployments review on **2026-10-30**, Doug chose a single "Allow early merges" checkbox covering every repository of the PRD, rather than a choice per repository, and those early merges follow the order the pull requests state. Kiln's roadmap also lists "carry final review PRs through checks and an authorized merge".
- Against: the example given was one pull request (#20), and one press merges into several repositories' base branches.
- Rare either way: **2 of 16** Kiln runs recorded on this machine had more than one repository.

**If they choose otherwise**: A delivery with several pull requests keeps today's page: each pull request has Open on GitHub, the page says the pull requests state which to merge first, and the person merges them. Only a delivery with one open pull request gets the button.

**Confirm or Correct**:
- [ ] Correct — one button merges the whole delivery, in the stated order
- [ ] Wrong — offer the merge only when there is one open pull request
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-21, three passes; Doug's messages in the drafting chat and earlier Kiln chats; the Kiln v1, Multi-Repo Delivery and Development Deployments requirements; Kiln's roadmap, Complete screen, pull request prompts and local run records. The last pass found nothing that settles it.

---

## Merge Session Assumptions

### MERGE-001. Watch the merge session only, with no messages, Pause now or takeover while it runs?

**Assumption**: **Yes: while the merge session runs, its output can be watched, but it cannot be messaged, paused or taken over.** If it stops without merging, the usual Needs you page offers a reply to the same session and the command that opens it in a terminal.

**This narrows the mockup aligned on at 16:07 UTC on 2026-11-21**, which showed Pause now and takeover on the running merge. The question covers the merge session only. The session that pushes newly planned phases before Continue builds them is watch only too, since pausing or taking it over part-way through combining could leave the person's main checkout mid-merge.

**Evidence**:
- **The merge is handed off whole**: "I would kind of just close Kiln and say, 'Hey, go merge PR number 20 and solve anything that's needed.'" and "I'm not handling that myself." (Doug, 2026-11-21). Of replying to a running audit: "maybe we just don't have this at all… it would have to be more like it comes to a full stopping point." (Doug, 2026-11-14).
- **A running merge can already be stopped safely**: **Ctrl+C** in Kiln's terminal stops the merge session within about 30 seconds and keeps the session and its unpushed work; the next `kiln run` resumes that same session. A pull request is **never left half-merged**, since GitHub merges each in one step.
- **What the other answers would cost**: letting the running merge be **messaged is a small change**, since every session shares Kiln's message box and this one is only left out of it. **Pause now and takeover are new work**: Kiln has no way yet to hand a merge session back after either.
- **Against**: of phases and audits, "I also do want the ability to pause and take over the session … we don't want to lose that" (Doug, 2026-11-19); a merge waiting on checks or working through conflicts can run for minutes, and a merge into develop is harder to undo than a phase's commits.

**If they choose otherwise**: The running merge session's page shows the message box and Pause now as a running phase does, and takeover in a terminal; a paused one gets the Paused page. Pause after this activity, which lets a session finish and then waits before the next one, is not offered, since nothing follows the merge.

**Confirm or Correct**:
- [ ] Correct — watch only while it runs; stop it with Ctrl+C; reply or take it over once it stops
- [ ] Wrong — let it be messaged while it runs (the small change), still no Pause now or takeover
- [ ] Wrong — offer messages, Pause now and takeover on the running merge session
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-21, two passes; Doug's messages in the drafting chat and earlier Kiln chats; the Live Session Control, Pause Now, Needs You Handoff and Build Preflight requirements; Kiln's live-control and stop code. The last pass found nothing new.

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. The stakeholder review shows them in an optional closing section.

### PLAN-001. Say nothing when a finished phase's document is edited later?

**Assumption**: **Yes: Kiln says nothing about later edits to a finished phase's document.** It never rebuilds a finished phase or offers it again, and it no longer compares a finished phase's text with what it finished.

**This reverses the one quiet line accepted on 2026-11-21** for "that rare case". It is not rare: across Kiln's own repository and two others Kiln has run on, **59 of 327** finished phase documents were edited after closing, and **none added work** for a finished phase to do (56 were record-keeping; 3 recorded a later ruling in place: two relaxed a gate, one restated a criterion whose change the same commit had already built). The line would show on nearly **1 in 5** finished phases with nothing on the page able to act on it, the "friction around dotting i's and crossing t's on the paperwork" Doug objected to that day.

**Example**: Phase 6 of Kiln Live Session Control was closed in commit `32264c1`. On 2026-10-27, commit `b774f87` rewrote its closing notes to record its publication. With the line, Kiln would report "Phase 6's document was edited after Kiln finished it."

**If they choose otherwise**: When Kiln looks for new phases on a finished PRD, the page adds one line for each finished phase whose document changed after Kiln finished it, saying Kiln does not rebuild finished phases and that changing that work takes a new phase.

**Confirm or Correct**:
- [ ] Correct — say nothing
- [ ] Wrong — keep the one line, record-keeping edits included

**Confidence**: 80% | **Impact**: 🟢 LOW

**Researched**: 2026-11-21, three passes; Doug's drafting-chat messages; the Continue Added Phases requirements; the method's phase skills; Kiln's plan-checking code; the git history of closed phase documents in Kiln's repository and two others Kiln has run on. The last pass found nothing further.

---

### AUDIT-001. Title the sessions that fix a test audit's findings "Fixing tests", numbered from session 1?

**Assumption**: **Yes: such a row reads "Fixing tests" with "From test audit loop 2 · session 1" beneath it**, the words the status line already uses while that session runs ("Fixing tests from test audit loop 2 of 4", approved on 2026-11-19 with Kiln Deliver When Audit Loops Run Out). Sessions count from 1 within each loop. An audit's row reads "Delivery audit" or "Test audit" with "Loop 2 of 4" beneath it, as Doug ruled on 2026-11-19 ("loop n of however many are the max"), and "Round" and "Continuation" disappear.

This replaces "Test fixes", the title in the mockup aligned on 2026-11-21, so the row and the status line say the same thing.

**Example**: Today's rows "Test audit · Round 1", "Test audit · Round 1 · Continuation 2" and "Test audit · Round 1 · Continuation 3" become "Test audit · Loop 1 of 4", "Fixing tests · From test audit loop 1 · session 1" and "Fixing tests · From test audit loop 1 · session 2".

**If they choose otherwise**: The rows say "Test fixes", or the wording given, and differ from the status line's.

**Confirm or Correct**:
- [ ] Correct — "Fixing tests", "From test audit loop 1 · session 1"
- [ ] Wrong — title them "Test fixes"
- [ ] Wrong — different wording: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW

**Researched**: 2026-11-21, three passes; Doug's messages in the drafting chat and earlier Kiln chats; the audit-loop requirements and their records; the audit skills; Kiln's row-label code. The last pass found nothing further.

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| PLAN-002 | An unfinished phase beneath a finished phase is offered like any other added phase; the finished phase stays finished, even one that had no phases beneath it when it was finished | Written up 2026-11-21 | One sensible answer: the method treats a phase without a Closed line as unfinished and keeps finished work done. PRD AC-BACK-01 |
| AUDIT-001 (part) | A loop is one run of an audit; sessions fixing its findings are not loops and do not count against the limit; an audit row says loop n of the limit, never "last loop" | Answered 2026-11-21 | Doug, 2026-11-19, reviewing the Kiln Deliver When Audit Loops Run Out review package: "when you're building phase eight, that's not a loop. The only thing that's a loop is when it does the delivery audit again or if it does the test audit again… And we don't need to say last loop either… it should say, you know, loop n of however many are the max." AC-LAST-02 there. PRD AC-AUDIT-01 follows it |
| SCOPE-002 | A bot can merge the delivery with `kiln merge`, and `kiln continue-with-phases` pushes this PRD's documents first, as the buttons do | Written up 2026-11-21 | Follows from Doug's rule that a bot can do what a person can click: "you'd be talking to your bot to do the merging anyway, right?" (2026-11-01); "there is no human only thing in here either… the same option needs to be exposed to the CLI interface so that bots can do it as well." (2026-11-02); "make sure that any of the options that you can click on these screens are command line options" (2026-11-18); of a bot resetting a run, "Let's allow the bot to do it and… clearly mention the risk/downside in the help text, but allow it." (2026-11-12). He folded the push into Continue on 2026-11-21. Kiln Bot Control's exclusion of merging was never put to him. PRD AC-BOT-01 |
| MERGE-001 (part) | Continue's push session can be watched, but not messaged, paused or taken over while it runs | Written up 2026-11-21 | One sensible answer: pausing or taking it over part-way through combining could leave the person's main checkout mid-merge. PRD AC-MERGE-05 |
| MERGE-002 | The merge session never goes around branch protection: a missing required review, or a required check that still fails or never reports, stops it unmerged at Needs you, saying which | Written up 2026-11-21 | One sensible answer: Kiln Development Deployments AC-DEV-02, reviewed by Doug on 2026-10-30, says Kiln's permission "does not bypass branch protection, waive required human review, authorize force pushes" and "a missing required approval or unresolved blocker returns to Needs you"; the README says "Required checks and reviews still apply." PRD AC-MERGE-03 |
| MERGE-003 | No agent merge for a delivery with a pull request closed without merging; reopening it on GitHub brings the merge back, and Kiln never reopens or replaces it | Written up 2026-11-21 | One sensible answer: the merge stops at the first pull request it cannot merge, so every press would be a known partial merge; Kiln cannot tell what depends on the closed one; and Kiln already treats a closed pull request as unresolved. PRD AC-MERGE-07 |
