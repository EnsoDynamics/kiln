# Phase 4: Complete the folder check before a usage-wait resume, and Start's folder handling
**Closed:** 2026-11-07

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Folder Check", "The Setup Panel" (Path checks with a stale record, The draft), "Start", "Design Decisions" (Start's safety, Clearing the stale record)
**Repositories:** kiln

## Summary
Check the run's folders before Kiln's own resume at the end of a usage-limit wait runs a completion check, run the first-Start folder checks when Start re-creates a folder at its saved path, clear git's stale record when a base-branch start is pointed at the missing saved folder, and let a Start from the existing branch into a new folder pick up where a failed attempt stopped.

## Acceptance criteria covered
AC-GONE-01 (completes it; owned by phase 1), AC-SETUP-05 (completes it; owned by phase 2), AC-SAFE-04 (completes it; owned by phase 2), AC-SAFE-01 (completes it; owned by phase 2)

## What the audit found missing
- **AC-GONE-01:** Kiln's automatic resume at the end of a usage wait (`readingArrived` / `codexReadingArrived` → `resumeWait(key, "limit_resume")` → an `automatic` resume command) skips `folderRefusal` in `Engine.applyControl` (`src/engine/engine.ts`, the `receipt.source !== "automatic"` exemption) and reaches `recheckWait` → `doneCheck` / `pullRequestCheck`, which can record Done, advance or record a Needs you stop, before any folder check; the drive loop's guard catches only the dispatch after it.
- **AC-SETUP-05:** `branchStart` in `src/engine/folder-setup.ts` skips `checkWorktreePath` entirely when re-creating at the missing saved path (`reCreating`), and runs no path check for any repository of a multi-repository existing-branch start, so "not inside a checkout" is never checked there; the design runs the checks with only git's `prunable` record at the saved path treated as absent.
- **AC-SAFE-04:** a single-repository base-branch start whose Worktree field is edited to the missing saved path gets `clearRecords: []` from `baseStart` (`src/engine/folder-setup.ts`), and `checkWorktreePath` counts the stale record as "inside a checkout", so Start is refused instead of clearing that one record first; the clear step belongs before `createBranchAndFolder` in `runBaseStart` (`src/engine/engine.ts`), named in the Starting lets Kiln list.
- **AC-SAFE-01:** a single-repository existing-branch start into a new folder (saved path holds something else, or an edited Worktree) cannot be resumed after its `worktree:` step: `readRepository` in `src/engine/folder-facts.ts` records the new worktree as `featureBranch.elsewhere`, so `availability()` makes the existing branch unavailable, and `branchStart`'s suffix loop skips the now non-empty folder; neither recognizes a failed start intent's own worktree.

## Phase dependencies
1 (the folder guard and the facts); 2 (Start, its intent and steps, and `branchStart` / `baseStart`).
