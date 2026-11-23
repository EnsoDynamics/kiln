# Kiln Requirements Stages - Assumptions

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

**Last Updated**: 2026-11-23
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Requirements Stages. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** are documented in the [technical design](kiln-requirements-stages-technical-design.md).

---

## Scope Assumptions

### SCOPE-001. Does Kiln build a PRD that needs no phase plan, from its final review, in one session?

**Assumption**: Yes. When phase planning finds the work fits **one session**, or the method lets a small change skip the design and the phase plan, the final review shows, in place of the phase plan, **one row** for building the whole PRD, with its model, which the person can change, and **Start the build**. Kiln builds it in **one session** on the feature branch, with the usual stops and recovery, then the test audit and the **pull request**. It runs **no delivery audit**, as the method skips it for a PRD built in one session.

The cost of yes is **a second way of building**, which Kiln carries and keeps working as the method changes. Today Kiln refuses to build a PRD with no phase plan.

**If they choose otherwise**: The final review ends with a short prompt to paste into the person's own session. Kiln's build stays as it is, and the person looks after a build of several hours, through its stops and usage limits, and opens the pull request: about **15 to 30 minutes** of attention spread over those hours (our estimate).

**Evidence**: **9 of the 28** PRD folders in Kiln's own repository have no phase plan. For a PRD like these, the method's next step after the requirements is one build session, nearly the session Kiln already runs for a phase. Doug, 2026-11-23: "Then you completely walk away when you get to the implementation", and the final review is "a cleaner spot to go from there to the whole next phase, which is the implementation".

Against: nothing he has asked for covers such a PRD, and of keeping up with method changes he said "I would rather keep things simple" (Doug, 2026-11-23).

**Researched**: 2026-11-23; the stakeholder's messages, the brief and its screens, Kiln's start checks, plan reading, completion checks and completion audits, the method's entry skill, phase-split, implement-from-requirements and delivery audit, every PRD folder in Kiln's repository; not tried: how other products handle it, judged unable to say what this business wants here.

**Confirm or Correct**:
- [ ] Correct — Kiln builds it in one session, from the final review
- [ ] Wrong — stop at the final review; I build it in my own session
- [ ] Wrong — different approach: _______________

**Confidence**: 65% | **Impact**: 🟡 MEDIUM

---

## Home Screen Assumptions

### HOME-004. Should the home screen's Not ready yet list show only material one step from ready, and leave other folders off?

**Assumption**: Yes. **Not ready yet** is the home screen's list of material Kiln can't start from yet, each line saying why. It shows only **two things**, each cleared by one step:

- **Source material not committed** on the shared branch: commit it, or bring the local shared branch up to date when only the remote's copy holds it.
- **An intake started and not finished**: material was brought in, and its intake record isn't written yet.

Every other folder under `source-material/` that holds neither a brief nor an intake record, as the method names those files, such as a stakeholder's reply or a handoff package, **is not listed**. Instead, the home screen's **Not listed?** panel, which explains how to bring material in, says what Kiln starts from and that **other folders are not listed**.

**If they choose otherwise**: Of the **15** `source-material/` folders in the **6** repositories checked, all committed, **2** hold a brief or an intake record. The other **13**:

| Answer | What Not ready yet shows |
|---|---|
| This one | **1 line**: an intake not finished, which goes once its record is written |
| List every folder holding neither, with the reason, as the brief says | **13 lines**, of which only the unfinished intake's line ever goes. Most are stakeholder replies, where the reason given, add a brief, would start a new PRD from a reply |
| One closed line for the other folders | The 1 line above, plus one closed line per repository counting its other folders, with nothing to do about them |

**Evidence**: The brief, agreed 2026-11-23, puts under Not ready yet "a folder under `source-material/` holding neither a brief nor an intake record". This **departs from it**. He approved that wording through screens that never showed what real repositories hold.

Doug, 2026-11-23, on the kinds of source material: "I just want to make sure that these different versions of things that we're labeling (a brief, an intake record, or a planned PRD) are distinct formal things ... Otherwise, I'm not sure how we would support that kind of UI." An unfinished intake is one such formal thing: the method commits the material under `received/` before it writes the record. A folder's name can't tell a reply from a handoff: the method fixes a feedback folder's name but only suggests a handoff's.

Against: a handoff package dropped in **without a brief** is not shown, and the panel's line is the only sign of why.

**Example**: none named; the folders found belong to other projects. An intake not finished is `source-material/{name}/received/` with no `{name}-requirements-intake.md` beside it.

**Researched**: 2026-11-23; the method's rules for `source-material/` in every skill that writes there and in the intake's decision record, every `source-material/` folder in the repositories checked, across checkouts, worktrees and branches, and how each was created, the stakeholder's messages, the brief; not tried: how other products show inputs they don't recognise.

**Confirm or Correct**:
- [ ] Correct — list only uncommitted material and unfinished intakes; leave other folders off
- [ ] Wrong — list every folder holding neither, with the reason, as the brief says
- [ ] Wrong — show the other folders as one closed line with their count
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. A stakeholder can still correct any of them.

### HOME-001. Should PRDs that Kiln can't tell are built or unfinished go in one closed list at the end of the home screen?

**Assumption**: Yes. Some PRDs have no phase plan, no Kiln run and no sign of work in progress, such as a refinement running or a branch not yet merged. A small PRD **built by hand** in one session looks like that, and so does one **left unfinished**. Kiln puts them all in **one line at the end** of the home screen, closed until clicked, which says Kiln can't tell from the files which they are. Opened, it lists them newest change first, and each opens like any other PRD. Whatever SCOPE-001's answer, a PRD Kiln took to its final review never lands here.

**If they choose otherwise**: Left off the home screen, a PRD started by hand on the shared branch could be reached only with `kiln run`. Listed with the work under way, Kiln's own repository would open on **nine lines that need nothing**.

**Evidence**: **9 of the 28** PRD folders in Kiln's own repository have no phase plan, and all nine are built. Only their commit wording shows they are built, and the brief rules out Kiln reading that wording, since the method may reword its commits. Without that wording, nothing in Git tells a built PRD from an unfinished one when its work changed only documents, as it did for **4** built PRDs in other repositories checked.

Doug, 2026-11-23: "reviewing it is a real tax for humans", which argues against lines that need nothing. Of a PRD started by hand: "Wherever it picks up, it just knows where you left off", which argues against hiding them. None of the products checked, GitHub's branches page among them, mixes such items into the active list.

**Researched**: 2026-11-23; the stakeholder's messages, the method's entry skill and phase-split, Kiln's source and run records, the history of every PRD folder without a phase plan in Kiln's and other repositories, and how other products treat items gone quiet (GitHub, Linear, Jira).

**Confirm or Correct**:
- [ ] Correct — one closed list at the end
- [ ] Wrong — leave them off the home screen
- [ ] Wrong — list them all with the work under way
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| MODEL-001 | Requirements stages default to the provider's most capable model, except refining the design, which defaults to one model down. Both are defaults the person can change | 2026-11-23 | Corrected by the stakeholder: "default to the most capable model of the provider for everything except for design refinement (which should be the model down from it)". Now AC-MODEL-02 in the PRD |
| REVIEW-001 | A PRD that already has its phase plan when Kiln is first pointed at it gets today's screen before Start: no stakeholder review made, no new stop | Written up 2026-11-23 | Research settled it at 95%: done by hand, the method makes or declines the review before the phase plan, and a declined review leaves no file, so making one could override that choice. Today's screen already stops before the build. PRD AC-BEGIN-05 |
| BEGIN-001 | The branch is named from the source material's folder or a planned PRD's directory, can be changed before Start as today, and is never renamed after | Written up 2026-11-23 | Research settled it at 95%: renaming a pushed branch means deleting it, which Kiln v1 forbids (AC-GIT-01, AC-GIT-02), and the method doesn't promise a source folder and its PRD folder share a name. PRD AC-BEGIN-06 |
| BEGIN-001 (part) | How a run is kept, and what title it shows, before the PRD's folder exists | Moved to design 2026-11-23 | A build choice: Technical Design §Design Decisions (how a run is kept, the title before the draft, finding the PRD's folder) and §Run identity. The run stays under the key of what it was started from, and the draft's folder is the one the session names and Git confirms, which beat assuming it shares the source folder's name |
| HOME-002 | A PRD another Kiln is running is listed with that Kiln's state, opens in that Kiln, and can't be started here | Written up 2026-11-23 | Research settled it at 95%: Doug, 2026-11-23, "often I just have multiple of these things going on in parallel", and leaving the line out would hide work waiting for him. Kiln already reads each running Kiln's state for `kiln status`. PRD AC-HOME-05, which now opens every PRD in a Kiln of its own |
| HOME-002 (part) | Opening the other Kiln, and keeping its line current | Moved to design 2026-11-23 | A build choice: Technical Design §Design Decisions (how the home screen opens a PRD, keeping the home list current) and §The Home Screen. Opening a line makes sure its Kiln is running, then opens its address in a new tab, which beat sending the person to an address that no longer answers; the list is checked every 5 seconds |
| MODEL-002 | The two new Model defaults rows ship with the choices of the Demanding and Audits rows in Kiln Phase Model Tiers: Fable at high, fallback GPT Astra at high; Opus at high, fallback GPT Sol at extra high | Written up 2026-11-23 | One sensible answer, from the stakeholder's own rulings: Fable at high for demanding work and Opus at high for the audits (2026-11-22), the model down for design refinement (2026-11-23), and the screens he approved on 2026-11-23 drawing Fable · high and Opus · high. Extra high cuts against the reason for one model down, and medium falls below the method's refinement floor of high. The fallbacks are the Tiers rows' own, which that PRD's register asks him about, so they are asked once, there. PRD AC-MODEL-02 |
| HOME-003 | A folder under `source-material/`, whatever it holds, or a planned PRD leaves the home screen's lists once Kiln has started a PRD from it or a PRD or initiative folder of its name exists on any branch, a planned PRD's name being the directory its row gives; material whose PRD or initiative has another name stays listed | Moved to design 2026-11-23 | A build choice: Technical Design §Design Decisions (what source material counts as "written from") and §Run identity, which settle the edges below: a planned PRD's list is read from the shared branch, remote-tracking branches of `origin` count as last fetched, and a run on another computer counts only through the branches it pushed. Not a business question: what can be detected, then a build choice. Both real briefs or intake records found have a PRD of exactly their name, and the method names an intake folder after its PRD or initiative when that name is known, keeping it if the PRD is later named differently. It beat keeping every hand-written PRD's material listed (a stale line per PRD that invites writing it twice) and a Hide remembered on each computer (a click per PRD, per computer). An initiative under the method's older names (`docs/roadmaps/`) is not read. Material sharing a name with an unrelated older PRD or initiative is hidden as a match is, and renaming its folder lists it again. PRD AC-HOME-13, first row |
