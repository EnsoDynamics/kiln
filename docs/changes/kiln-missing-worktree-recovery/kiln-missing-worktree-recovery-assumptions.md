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

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Missing Worktree Recovery](kiln-missing-worktree-recovery-prd.md). We're proceeding with them and need business validation to confirm or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

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

## Technical Assumptions

> Facts the build relies on that research could not reach. Answered by the build team, not business stakeholders; the stakeholder review package leaves this section out.

### WTR-004. Can an interrupted session be resumed from a new folder?

**Assumption**: When the existing-branch start uses a new folder (AC-SETUP-02, the saved path holds something else), the agent resumes the run's interrupted session from that folder (AC-KEEP-04 in Kiln v1). If it cannot, AC-KEEP-05 already sends the phase to Needs you.

**Evidence**: Claude Code stores each session's transcript under a directory named for the folder it ran in (`~/.claude/projects/<folder path>/`), and Kiln resumes from the worktree (`cd <worktree>` then `claude --resume <id>`).

**Blocked by**: Checking it means launching agent sessions from a moved folder, which writes session state; this refinement only reads.

**Would settle it**: The design resumes a test session of each agent, Claude Code and Codex, from a different folder.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — the fact is: _______________

**Confidence**: 50% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WTR-002 | Recovery is a pre-filled setup the person starts, not a one-click repair | Ruled 2026-11-06 | Doug's mockup review: recovery is a deliberate setup like a first Start, not a repair (PRD AC-SETUP-01/05) |
