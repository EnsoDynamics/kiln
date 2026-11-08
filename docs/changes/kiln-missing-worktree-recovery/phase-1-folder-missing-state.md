# Phase 1: Folder missing state, with what Kiln still knows
**Closed:** 2026-11-06

**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "Design Decisions" (where Folder missing lives, the run's-worktree predicate, one gate), "The Folder Check", "Folder Missing", "The Facts", "The Setup Panel" ("Put it back yourself" only), "Interfaces" (`/api/folder-setup/check`, the snapshot's `folderMissing` block without `panel`, Terminal), "Data Models" (`planReadAt`)

## Summary
When an unfinished run's folder is gone or holds something else, Kiln stops at every entry point and says so in the terminal, on the feature page, and in `kiln status` and `kiln handoff`, instead of reporting a phase from its old saved record. The page shows what Kiln can still find (the branch, the base branch's plan beside the saved one, what it could not check), offers **Check again**, and shows the git command that puts the folder back when that is possible. Setting the run up again from the page comes in Phase 2.

## Acceptance criteria covered
AC-GONE-01, AC-GONE-02, AC-GONE-03, AC-FACTS-01, AC-FACTS-02, AC-FACTS-03, AC-SETUP-06, AC-LOOK-01

## Out of scope for this phase
The setup panel, its starting points, defaults and preview, and Start from either starting point, with its intent, recheck and safety rules (Phase 2). Until then the page has no **Set the run up again** panel; the person's ways out are the restore command and **Check again**.

## Phase dependencies
None.

## Phase-specific notes
- AC-SETUP-06 shows its command only when the existing feature branch is an available starting point. This phase builds that availability test from the facts (AC-SETUP-02's reasons for the existing branch), and Phase 2 reuses it for the panel.
- AC-LOOK-01 here covers the terminal block and the page's fact and plan cards, matched against the mockup's cases with the setup panel left out; Phase 2 proves the panel.
- Schema 20 starts here with `planReadAt`. Phase 2's fields (`pause.requestedFor`, `branchStem`, `folderSetupStart`, the `ExecutionSummary` and `ContinuationState` changes) join schema 20 there, unless record validation then requires another version.
- Each earlier design section this phase's work replaces gets its pointer in the feature commit (design, "Changes to Earlier Designs"): Kiln v1 §Where a Feature Stands, Continue Added Phases §Active execution handback, Bot Control §Status, Conversations and Handoff.
