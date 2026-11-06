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

### WTR-003. May Start clear git's leftover record of the missing folder?

**Assumption**: **Yes.** When a worktree folder is deleted without git's own remove command, git keeps a record that the run's branch is checked out there. Until that record is cleared, git refuses to check the branch out in any other folder, or to make a new worktree at the saved path, unless forced. When that record would stop Start, Start clears that one record before creating the worktree, and the **Starting lets Kiln** list names the folder before Start is pressed. It clears only a record git itself reports as stale because its folder is gone: never a folder that exists, never another record. The folder is already gone, so this loses no work, and the branch and its commits are untouched. Without it, carrying on from the run's existing branch, the recovery offered first when the branch holds work not yet in the base branch, would have to force git past its refusal (`worktree add -f`). That works, but skips git's other checks on the new worktree and, at a new path, leaves the branch listed twice.

**If they choose otherwise**: Starting from the existing branch is unavailable while git still records the missing folder. The page shows the git command that clears the record, the person runs it themselves, then presses **Check again**.

**Confirm or Correct**:
- [ ] Correct — Start clears git's record of the one missing folder it needs
- [ ] Wrong — Kiln shows the command and the person clears the record
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WTR-002 | Recovery is a pre-filled setup the person starts, not a one-click repair | Ruled 2026-11-06 | Doug's mockup review: recovery is a deliberate setup like a first Start, not a repair (PRD AC-SETUP-01/05) |
| WTR-004 | An interrupted session can be resumed from a new folder | Written up 2026-11-06 | Researched: Claude Code resumes from another folder; Kiln resumes Codex only in its recorded folder, so that case goes to Needs you. Technical Design §Resuming a session in a new folder |
| WTR-005 | A base-branch start counts every phase closed in the base branch as done, whoever closed it, and never reruns it | Ruled 2026-11-06 | Doug in chat: phases complete on develop must never be redone. PRD AC-SETUP-04; Technical Design §The Setup Panel |
