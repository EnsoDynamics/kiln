# Phase 3: Complete what the Folder missing page and its setup panel say

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Facts" (What can't be checked, its dependency table), "The Setup Panel" (What will run, The draft), "Interfaces" (Snapshot)
**Repositories:** kiln

## Summary
Make the Folder missing page say everything the requirements ask of it: name every check Kiln could not make, always show the base branch's next unfinished phase, show the put-it-back command only when the panel really offers the existing branch, give the setup panel's Agent, Model and Effort fields Documents found's behavior and messages, and name every phase whose work a base-branch start would leave behind.

## Acceptance criteria covered
AC-FACTS-02 (completes it; owned by phase 1), AC-FACTS-03 (completes it; owned by phase 1), AC-SETUP-06 (completes it; owned by phase 1), AC-SETUP-01 (completes it; owned by phase 2), AC-SAFE-02 (completes it; owned by phase 2)

## What the audit found missing
- **AC-FACTS-02:** `baseCard` in `view/src/lib/folder-missing.ts` shows "this run’s latest work is only on the feature branch" in place of the base plan's next unfinished phase when the run's work lives on the branch but no phase is newly closed there (`branchOnly` empty), so the page never names `plans.base.next`.
- **AC-FACTS-03:** in `readRepository` (`src/engine/folder-facts.ts`) four failed reads are dropped without being named in `facts.unknown`: the last pushed commit's on-origin ancestry and its in-base test (the `lastPushed` block, so `pushedRow` in `view/src/lib/folder-missing.ts` shows only "on origin" or "not in <base>"), the commit date in `commitFact`, and the `rev-list --count` of commits not in the base branch (the page then says "Some commits").
- **AC-FACTS-03:** `baseStart` in `src/engine/folder-setup.ts` computes `holdsAllWork` from `again` and `leftWork` only, so a base-branch choice says "Has all of this run’s work." while a repository's `workNotInBase` is unknown; the design's dependency table withholds "holds all work" when the in-base read fails.
- **AC-SETUP-06:** `gatherFolderFacts` (`src/engine/folder-facts.ts`) builds `restoreCommands` whenever `availability()` is true, so the page shows the put-it-back command while `buildPanel` returns `{ blocked }` because a repository's `workNotInBase` is unknown; the PRD shows the command only when the panel offers the existing branch as an available starting point.
- **AC-SETUP-01:** the Effort field in `view/src/components/FolderSetupPanel.svelte` lists `snapshot.settings.effortLevels`, the saved model's levels, not those of the model chosen in the panel; it lacks Documents found's `effortDisabled` handling and its "This model takes no effort setting." line, and `Engine.folderChange` (`src/engine/engine.ts`) accepts an effort the chosen model does not take.
- **AC-SETUP-01:** the Agent field in `FolderSetupPanel.svelte` never shows `account.error` or `account.usageError`, and the Model field never shows the model field error or `modelListError`, which Documents found (`view/src/screens/DocumentsFound.svelte`, Agent and Model fields) shows.
- **AC-SAFE-02:** `baseStart` in `src/engine/folder-setup.ts` names only phases this run completed that are still to run in the base plan (`again`). It does not name: the phase the run stopped on whose commits are only on the feature branch (the line then says "Has all of this run’s work."); a phase this run completed that the base plan does not contain (name it and say its work stays on the earlier feature branch and the new start will not run it, since the base plan has no such phase); or the phases of work in a repository the start leaves out (`leftWork` names only the repository, and the multi-repository line passes repository names to `phaseList`, printing "Missing Phase <repository>’s work").

## Phase dependencies
1 (the facts, the base plan card and the restore command); 2 (the setup panel and its `baseStart` preview).
