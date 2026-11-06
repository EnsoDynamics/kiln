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

**Assumption**: **Yes.** The Folder missing page offers using another folder, putting the folder back, and continuing from the base branch. It offers no **Discard this run and start over** choice. Every case the 2026-11-06 run raised is covered by continuing from the base branch, which keeps the run's history; discarding loses phase results and session links, and needs its own safeguards.

**If they choose otherwise**: The page gets a fourth, quieter choice that archives the saved run and starts the PRD fresh at Documents found, with a confirmation that lists what history will be set aside.

**Confirm or Correct**:
- [ ] Correct — no discard choice in this release
- [ ] Wrong — add a discard-and-start-over choice now
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

---

## Behavior Assumptions

### WTR-002. Kiln repairs the folder itself when the person chooses to?

**Assumption**: **Yes.** **Put the folder back** and **Use that folder** are one-click actions: Kiln adds the worktree (or adopts the existing one) itself, within its existing Git limit of only adding worktrees. The git command is also shown, for a person who prefers to do it themselves (AC-FIX-05).

**If they choose otherwise**: Those two choices become instructions with a copyable command and a **Check again** button; Kiln makes no change to any checkout during recovery.

**Confirm or Correct**:
- [ ] Correct — Kiln repairs the folder on the person's click
- [ ] Wrong — show the command only; the person runs it
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
