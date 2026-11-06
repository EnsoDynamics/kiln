# Kiln Missing Worktree Recovery - Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE RIGHT SKILL FIRST ⚠️
     Recording a stakeholder's answer to an assumption below, however it
     arrives (a reply, an email, a decision given in chat):
     `assumptions-document-feedback`.
     Any other edit (a new entry, a rewrite, the header):
     `assumptions-document-writing`, which owns this document's format.

     Superseded entry text comes OUT — version control holds it.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️ -->

**Last Updated**: 2026-11-06
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Missing Worktree Recovery](kiln-missing-worktree-recovery-prd.md). We're proceeding with them and need business validation to confirm or correct any that are wrong. Every numbered entry is a business assumption.

---

## Scope Assumptions

### WTR-001. Leave out a choice to discard the saved run in this release?

**Assumption**: **Yes.** The Folder missing page offers setting the run up again, from the base branch or the run's existing feature branch. It offers no **Discard this run and start over** choice. Every case the 2026-11-06 run raised is covered by setting up again from the base branch, which keeps the run's history; discarding loses phase results and session links, and needs its own safeguards.

**If they choose otherwise**: The page gets a second, quieter choice that archives the saved run and starts the PRD fresh at Documents found, with a confirmation that lists what history will be set aside.

**Confirm or Correct**:
- [ ] Correct — no discard choice in this release
- [ ] Wrong — add a discard-and-start-over choice now
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

---

## Git Safety Assumptions

### WTR-003. May Kiln, this once, tidy up git's leftover note about the deleted folder so the person can carry on from their branch?

**Assumption**: **Yes.** This departs from a rule already given: Kiln sets up the worktree and its branch and changes nothing else in git (Kiln v1, AC-GIT-01). The nearest case today follows that rule. When git leaves a worktree half made, Kiln removes nothing and shows the person the command to run (Multi-Repo Delivery, AC-ADD-02). What is new here: when someone deletes a worktree folder by hand, git keeps a note that the run's branch is still in use in that folder, and while the note stands git won't let the branch be used anywhere else. So carrying on from the run's branch, the recovery offered first when the branch holds work not yet in the base branch, can't start until the note is gone. Under this answer Start clears that one note as part of setting up, and the **Starting lets Kiln** list says so before the person presses Start. It clears only a note git itself reports as left behind by a folder that no longer exists, never a folder that exists and never any other note. The folder is already gone, so no work is lost, and the branch and its commits are untouched.

**If they choose otherwise**: Start has no clearing step. Starting from the existing branch is unavailable while git still records the missing folder. The page shows the git command that clears the record, the person runs it themselves, then presses **Check again**.

**Confirm or Correct**:
- [ ] Correct — Start clears git's note about the one deleted folder
- [ ] Wrong — keep the rule: Kiln shows the command and the person runs it
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WTR-002 | Recovery is a pre-filled setup the person starts, not a one-click repair | Ruled 2026-11-06 | Doug's mockup review: recovery is a deliberate setup like a first Start, not a repair (PRD AC-SETUP-01/05) |
| WTR-004 | An interrupted session can be resumed from a new folder | Written up 2026-11-06 | Researched: Claude Code resumes from another folder; Kiln resumes Codex only in its recorded folder, so that case goes to Needs you. Technical Design §Resuming a session in a new folder |
| WTR-005 | A base-branch start counts every phase closed in the base branch as done, whoever closed it, and never reruns it | Ruled 2026-11-06 | Doug in chat: phases complete on develop must never be redone. PRD AC-SETUP-04; Technical Design §The Setup Panel |
