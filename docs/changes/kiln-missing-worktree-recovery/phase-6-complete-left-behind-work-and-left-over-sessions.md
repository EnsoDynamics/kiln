# Phase 6: Complete the work a base-branch start leaves behind, and an earlier Kiln's session at startup
**Closed:** 2026-11-07

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Setup Panel" (What will run), "Start", "Design Decisions" (Start's safety)
**Repositories:** kiln

## Summary
Name every phase whose committed work a base-branch start would leave out (waived, unpushed, in another repository, the phase the run was on, against the base the person picked), and treat a Claude session an earlier Kiln left running as busy when Kiln starts with a folder already missing.

## Acceptance criteria covered
AC-SAFE-02 (completes it; owned by phase 2), AC-SAFE-01 (completes it; owned by phase 2)

## What the audit found missing
- **AC-SAFE-02:** `Engine.folderPanelContext` (`src/engine/engine.ts`) fills `completedByRun` and `phasesByRepository` from `pushedSha` only, and `workLeftIn` in `baseStart` (`src/engine/folder-setup.ts`) returns false without a sha, so a phase completed with waived, unpushed work (`waivedHead`, no `pushedSha`) is never named in `notInPlan` or a left-out repository's phase list.
- **AC-SAFE-02:** `notInPlan` in `baseStart` tests only the PRD repository's `pushedSha` (`workLeftIn(prdRead, …)`), so in a multi-repository run a completed phase the base plan lacks, whose work is only in another repository of the start's set, is never named.
- **AC-SAFE-02:** `stoppedPhaseId` and `stoppedStarts` in `Engine.folderPanelContext` come only from `stoppedPhaseKey()`, so when Folder missing is entered while a session works (`settleSession`) or at a usage-wait resume (`recheckWait`, the phase keeps its `wait`), the phase the run was on is not named and the base-branch line can say "Has all of this run’s work." while its commits are only on the feature branch.
- **AC-SAFE-02:** `baseStart` names the stopped phase only when `runIds.has(stopped)`, and `notInPlan` scans only `completedByRun`, so a stopped phase the base plan lacks, with commits not in the base branch, is never named.
- **AC-SAFE-02:** after the person edits the base branch in the panel, `workLeftIn` and `stoppedWorkIn` in `baseStart` still test against the facts read for the saved base (`read.base.sha`, `read.workNotInBase` from `readRepository`), not the chosen base's tip (`baseCommits`), so work in the saved base but not the chosen one goes unnamed.
- **AC-SAFE-01:** when `kiln run` starts with a folder already missing, `underway` in `src/kiln-command.ts` returns after `Engine.prepare` without calling `decide()`, so the adoption of a live Claude phase, audit or takeover session left by an earlier Kiln (`decideQuietly`, `observeRecoveredLive`) never runs: `current` stays unset, `folderBusy()` returns nothing, `applyFolderStart` proceeds with Git writes while that process runs, and its end is never recorded.

## Phase dependencies
1 (the folder guard); 2 (Start and `baseStart`); 3 and 4 (their completion of these criteria).
