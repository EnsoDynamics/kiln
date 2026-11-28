# Phase 11: Complete the start screen's branch and label, the home screen's stage lines, and the contracts-file step

**Closed:** 2026-11-28

**Added by delivery audit:** 2026-11-28, after every planned phase closed, in the audit that followed phases 9 and 10. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Branch and worktree" (a start from source material always cuts a new branch); "Snapshot" (the location label); "The Home Screen" ("What it lists"); "What `kiln run` accepts"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Fix the start and home-screen gaps the delivery audit found:
- A start from source material or a planned PRD always offers a new branch, even when a branch of the default name already exists.
- Until the PRD's folder exists, every screen's header names the source material, or the initiative and planned PRD, instead of calling it the PRD folder.
- A Kiln run's Under way line gives the stage the PRD reached while a feedback, review or Next stage session runs.
- When only origin's shared branch holds a planned PRD's contracts file, the home screen and `kiln run` say to bring the local shared branch up to date.

## Acceptance criteria covered
AC-BEGIN-06 (completes it; owned by phase 1), AC-BEGIN-07 (completes it; owned by phase 1), AC-HOME-04 (completes it; owned by phase 4), AC-HOME-03 (completes it; owned by phase 4), AC-BEGIN-03 (completes it; owned by phase 1)

## What the audit found missing
- **AC-BEGIN-06:** `Engine.startChoice` (`src/engine/engine.ts` ~line 10386) has no rule for source material. With `record.start` unset, it returns `existing` whenever `feature/<folder>` exists locally or on origin. That always happens after a reset before the draft, because the reset leaves the branch Kiln cut.
  - `refreshStartPreview` then builds `existingBranchPreview`, which refuses Start with "<branch> at <sha> doesn't have source-material/<x>/<x>-prd.md" (`src/engine/start-from.ts` ~line 361). Today's "That branch already exists" name check never answers.
  - Typing another name doesn't help. `changeSettings` (~line 3801) saves `record.start ??= startChoice`, still `existing`, and `refreshStartPreview` then replaces the typed name with the first listed branch.
  - The screen shows no Start from for source material, so the person can't switch back.
  - A start from source material or a planned PRD (`record.origin` set, no `record.prdDirectory`) must always take `new`, in `startChoice` and in the line in `changeSettings`. `changeStart` already refuses `existing` for these starts.
- **AC-BEGIN-07:** `view/src/components/FeatureHeader.svelte` always labels its value "PRD folder". Until `prdDirectory` is set, every header therefore reads "PRD folder source-material/<x>/" or "PRD folder docs/initiatives/<i>/<dir>/". The headers are Requirements, StateHeader (running, Needs you, waiting, both reviews), DocumentsFound, PhaseDetail, FolderMissing and Complete. The design's location label (§Snapshot) names the source folder, or the initiative and planned PRD, until the PRD folder exists. `feature` in `src/engine/snapshot.ts` (~line 847) carries no kind of location for the header to label it by.
- **AC-HOME-04:** `recordLine` (`src/home/scan.ts` ~lines 120–126) names the activity, not the stage reached, in three cases where the running stage has no title:
  - a feedback session: "Requirements. Applying stakeholder feedback.";
  - a review session: "Requirements. Making the stakeholder review.", which doesn't say whether this is the early or the final review;
  - a Next stage (`kiln:next`) session after the first: "Requirements. The first session finds the next stage." This happens after a stage finished by hand at Needs you, or after a lost cursor. `standsAt` is deleted at the first report (`src/engine/engine.ts` ~line 6970), and the line wrongly calls the session the first.

  The record holds the stage reached in each case: the last finished stage, `standing.next`, or the review's stop (the stage key `kiln:early` / `kiln:final`, or the milestone the standing reached). The line must name it, as the between-stages branch below already does.
- **AC-HOME-03:** in `scanRepository`'s planned-PRD loop (`src/home/scan.ts` ~lines 284–291), when the local shared branch's initiative list links a contracts file the local branch lacks, `initiativeRows` throws "Commit the planned PRD contracts file … on the shared branch." (`src/requirements/source.ts` ~line 65). The local read records that as `problem`. Origin's read, which has the file, is skipped (`readLocal.some(other => other.folder === one.folder && other.problem)`), so the line names committing when the one step left is bringing the local shared branch up to date. When origin's copy reads cleanly, the line must give the bring-up-to-date step.
- **AC-BEGIN-03:** the same case in `kiln run`. `inspectSource` (`src/requirements/source.ts` ~lines 229–230) returns `initiativeRows`' commit message. When origin's shared branch holds the contracts file, it must say to bring the local shared branch up to date, as `notCommitted` does for a brief.

## Phase dependencies
1 (`inspectSource`, the start checks, Start and its branch setup); 4 (the home scan and the screen header); 5, 7 and 9 (the placements, start checks and Under way lines they completed)
