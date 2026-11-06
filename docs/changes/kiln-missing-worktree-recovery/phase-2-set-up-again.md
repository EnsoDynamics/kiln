# Phase 2: Set the run up again from the Folder missing page

**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "Existing Code" (the extracted activation core and preparation binding), "Design Decisions", "The Setup Panel", "Start", "Interfaces" (`/api/folder-setup/panel`, `/api/folder-setup/start`, `SetupPanel`), "Data Models", "Changes to Earlier Designs"

## Summary
The Folder missing page gains the **Set the run up again** panel: Documents found's settings, filled in from the run and the facts, with a choice of starting from the base branch or the run's existing feature branch and a preview of what will run. Pressing Start either sets up a new feature branch and folder and runs the remaining plan as a fresh execution, or re-creates the missing worktree on the existing branch and resumes the same execution, changing nothing before Start and keeping the run's existing limits.

## Acceptance criteria covered
AC-SETUP-01, AC-SETUP-02, AC-SETUP-03, AC-SETUP-04, AC-SETUP-05, AC-SETUP-07, AC-SAFE-01, AC-SAFE-02, AC-SAFE-03, AC-SAFE-04, AC-FACTS-03 (also applies to this phase's work), AC-LOOK-01 (also applies to this phase's work)

## Out of scope for this phase
Discarding the saved run (WTR-001), and everything the PRD's Out of Scope lists.

## Phase dependencies
1 (the folder check and guard, the facts and `factsId`, the Folder missing state, page and terminal block, Check again and leaving the mode, and the existing-branch availability test).

## Phase-specific notes
- Each earlier design section this phase's work replaces gets its pointer in the feature commit (design, "Changes to Earlier Designs"): Kiln v1 §Worktree and Branch Setup, Continue Added Phases §Implemented integrated-prerequisite continuation (Phase 3a) and §Completion evidence from outside Kiln, Multi-Repo Delivery §The Workspace.
- The start intent's supersede-on-pass rule (design, "The Folder Check") lands here, in Phase 1's leaving-the-mode path.
