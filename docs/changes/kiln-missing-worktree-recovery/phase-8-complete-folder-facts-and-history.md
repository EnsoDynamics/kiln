# Phase 8: Complete the folder facts, the reads they name, and the waiting phase's history
**Closed:** 2026-11-07

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Facts" (What can't be checked, its dependency table), "Screens"
**Repositories:** kiln

## Summary
Show every branch fact a successful read found even when the other side's read failed, word the relation and each repository's own base correctly, count origin's copy of the feature branch when deciding where the run's latest work lives, name the filesystem and pushed-commit reads that fail, and keep a waiting phase's recorded completion results in the run's history.

## Acceptance criteria covered
AC-FACTS-01 (completes it; owned by phase 1), AC-FACTS-02 (completes it; owned by phase 1), AC-FACTS-03 (completes it; owned by phase 1), AC-GONE-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-FACTS-01:** `featureRow` in `factRows` (`view/src/lib/folder-missing.ts`) falls to a bare "Couldn't check" when one side's read found no branch and the other side's read failed (checkout absent with origin failed, or checkout failed with origin absent), so the page never says the branch is not in the checkout, or not on origin. In a multi-repository run the failed side's read is also filtered out by `inRow` and named nowhere.
- **AC-FACTS-01:** `featureRow` renders the relation raw, so an ahead-only checkout reads "your checkout's is ahead origin's"; the PRD's wording is "ahead of".
- **AC-FACTS-01:** in a multi-repository run `factRows` names every repository's in-base and last-pushed results with the PRD repository's base (`view.plans.base.branch`) and decides "your checkout's <base>" and the pushed row's "Couldn't check" from the PRD repository's base source (`localBase`). `FolderMissingRepository` in `src/engine/folder-facts.ts` publishes no base branch or base source of its own (`readRepository` holds them in `reads.base`), so a repository with a different base is labelled against the wrong branch, and another repository's pushed row is hidden when only the PRD repository's origin failed.
- **AC-FACTS-02:** `readRepository` in `src/engine/folder-facts.ts` tests only `reads.tip` (the checkout's tip whenever it exists) for work not in the base branch. When origin's feature tip differs from the checkout's and holds commits not in the base branch while the checkout's tip is in it, `workNotInBase` is `false`, so `readPlans` labels the saved plan against the base plan instead of the feature branch. The design's dependency row counts origin's branch toward "has work not in base" unless the local tip already has some.
- **AC-FACTS-03:** `exists()` in `src/engine/folder-facts.ts`, used by `readRepository`'s worktree loop, treats every `lstat` error as absent, so a worktree holding the branch at a path Kiln can't stat (EACCES, EIO) is reported as `recordedAtMissing` ("a folder that no longer exists"), the existing branch is made unavailable for that wrong reason, and the failed read is never named. `classifySteps` in `folder-check.ts` already tells ENOENT/ENOTDIR from other errors.
- **AC-FACTS-03:** when the last pushed commit is in the base branch but its on-origin read failed, `pushedRow` in `factRows` adds no "on origin: couldn't check" (it does so only when `inBase !== true`) and `inRow` filters the read out, so the failure is named nowhere.
- **AC-GONE-02:** when the folder goes missing while a phase waits for usage, that wait's recorded completion results (`PhaseWait.checks` and `checkedAt` in `src/state/records.ts`) appear nowhere: `folderMissingSnapshot` in `src/engine/snapshot.ts` builds `stoppedResult` from `phases[stoppedKey].stop` only, and the history list in `view/src/screens/FolderMissing.svelte` has no row for a wait.

## Phase dependencies
1 (the facts, `readRepository`, `factRows`, the history list); 3 and 5 (their completion of AC-FACTS-01, AC-FACTS-03 and AC-GONE-02).
