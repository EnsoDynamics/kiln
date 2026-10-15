# Kiln v1 - Business Assumptions

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

**Last Updated**: 2026-10-15
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the business assumptions we're making to proceed with Kiln v1. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

The requirements are in the [Kiln v1 PRD](kiln-v1-prd.md); the screens are the [v1 mockups](../../design/mockups/).

---

## Screen Behavior Assumptions

### UI-001. Does a usage limit turn amber at 80% used?

**Assumption**: A Claude usage limit in the usage panel on Running and Paused turns **amber at 80% used or more**, with the note to switch accounts (AC-WATCH-08). Below 80% it stays in the normal color, and the one-line summary on Documents found never turns amber.

**Example**: In the Running and Paused mockups (fictional sample data), the 5-hour window at **82%** is amber with "Close to the limit", while the weekly limit at 41% and the weekly Fable limit at 6% are not.

**Evidence**: The mockups only show that the line falls somewhere between 41% and 82%; neither the mockups nor the architecture proposal name a number. The alternative is to follow Claude Code's own warning level, which its usage report carries for each limit, so Kiln's amber would match whatever Claude Code itself warns about.

**Confirm or Correct**:
- [ ] Correct — amber at 80% used
- [ ] Wrong — amber when Claude Code's own usage report marks the limit as a warning
- [ ] Wrong — a different threshold: _______________

**Confidence**: 70% | **Impact if Wrong**: 🟢 LOW

---

### UI-002. Once "Pause after this phase" is pressed, does the pause stand until the phase is done?

**Assumption**: After the person presses **Pause after this phase**, the view says Kiln will pause once the current phase is Done, and the **request can't be taken back**. To carry on, the person presses Start once Kiln has paused (AC-VIEW-03).

**Evidence**: No mockup draws the moment between pressing Pause and the phase being Done. The Running and Phase detail screens say only that the current phase finishes its commit and push first and that no phase starts until Start, so this is the reading that adds no control the mockups don't show. The alternative lost because it adds one: the button turns into "Keep going", which cancels the pause. Its advantage is real: a pause pressed by mistake before leaving the machine would otherwise leave the feature idle until the person returns.

**Confirm or Correct**:
- [ ] Correct — the pause stands; press Start once paused to carry on
- [ ] Wrong — the person can cancel the pause until the current phase is Done
- [ ] Wrong — different approach: _______________

**Confidence**: 60% | **Impact if Wrong**: 🟢 LOW

---

### UI-003. When the feature branch's name is already taken, does Documents found ask for another name?

**Assumption**: When a branch with the feature branch's name **already exists**, in the repository or on `origin` (the base branch included), Documents found says so **beside the Feature branch field**, and **Start stays unavailable** until the person enters a name no branch has. Kiln never works on a branch it didn't create (AC-START-07).

**Example**: In the Documents found mockup (fictional sample data), the field holds the default `feature/customer-returns`. If a branch of that name were left over from earlier work, the field would say the branch already exists, and Start would wait until the person entered, say, `feature/customer-returns-2`.

**Evidence**: No mockup draws this case. That Kiln creates a new branch is settled (architecture proposal: Kiln creates the branch "from the base branch before the first session"), so the only question is where the person hears about a taken name. Documents found is where the name is set and changed, and the only place that can catch a taken name the person types. The alternative is a terminal error before the browser opens, like the other start checks (AC-START-02): it catches a taken default name sooner, but not one typed on Documents found, so the browser would still need its own message.

How Kiln picks up a feature whose record was lost, and what happens when the worktree's path is already in use, are left to the technical design.

**Confirm or Correct**:
- [ ] Correct — say so beside the Feature branch field; Start waits for a name no branch has
- [ ] Wrong — also stop in the terminal when the default name is taken, before the browser opens
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟢 LOW

---

### UI-004. Does a new PRD start on the latest Opus at high effort?

**Assumption**: On Documents found, the Model field starts at **the latest Opus model** and Effort at **high**, for every PRD, whatever Claude Code itself would use on that machine. The Model list offers **the models Claude Code offers the signed-in account**. The person can change both before Start (AC-START-06).

**Example**: In the Documents found mockup (fictional sample data), Model shows **Opus 5.5**, chosen from the sample account's models (Opus, Fable and Sonnet), and Effort shows **High**.

**Evidence**: The mockup preselects Opus and High but can't say whether that is a fixed default or this machine's own setting. The architecture proposal names only the `--model` and `--effort` flags, with no default.

A fixed strong default suits phases that run for hours unattended and must pass review and test hardening; the cost is using plan limits faster, which the usage panel shows (AC-WATCH-08). The alternative is to start from the model and effort Claude Code uses on that machine, so Kiln matches the person's own setup; it lost because that setup is often tuned for interactive work, and the mockup draws Opus at high.

**Confirm or Correct**:
- [ ] Correct — the latest Opus at high effort; the list offers what Claude Code offers the signed-in account
- [ ] Wrong — start from the model and effort Claude Code uses on that machine
- [ ] Wrong — different approach: _______________

**Confidence**: 60% | **Impact if Wrong**: 🟢 LOW

---

### UI-005. Does Kiln wait for a usage limit to reset?

**Assumption**: **No.** Kiln starts the next phase on whichever account is signed in, **even when a limit is at 100%**, and a session that runs into a limit is **handled like any other stop**: if the phase fails the done check, it goes to **Needs you**, showing how the session ended, word for word (AC-STOP-02). The person then switches accounts with `claude auth login`, or waits for the reset, and finishes the phase as for any other stop (AC-WATCH-08, AC-STOP-05, AC-STOP-07).

**Example**: In the Running mockup (fictional sample data), the 5-hour window is at **82%** and resets in 1h 12m. If phase 3 started and the window reached 100% partway through, phase 3 would go to Needs you; Kiln would not hold it until the window resets.

**Evidence**: The architecture proposal and the after-v1 ideas don't mention waiting for a reset. The PRD's own rules lead here: Kiln doesn't rerun a stopped phase (AC-STOP-01) and never resumes a session that ended on its own (AC-KEEP-04), and the mockups' answer to a nearly used limit is to switch accounts. No mockup draws a waiting state.

The alternative is to **wait for the reset** before starting the next phase when the pre-phase usage check shows a limit at 100%. Its advantage is real for overnight work: the feature would carry on after the reset instead of sitting at Needs you until morning. It lost because it adds a state and screen copy no mockup shows, and it covers only the start of a phase, not a limit reached mid-session.

**Confirm or Correct**:
- [ ] Correct — don't wait; a limit stop goes to Needs you like any other
- [ ] Wrong — wait for the reset before starting the next phase when a limit is at 100%
- [ ] Wrong — different approach: _______________

**Confidence**: 60% | **Impact if Wrong**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
