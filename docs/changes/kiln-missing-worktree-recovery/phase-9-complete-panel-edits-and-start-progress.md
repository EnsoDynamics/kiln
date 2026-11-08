# Phase 9: Complete the panel's pending edits at Start, base-closed work left out, and a stopped Start's progress

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Setup Panel" (What will run), "Start", "Design Decisions" (Start's safety)
**Repositories:** kiln

## Summary
Keep Start from acting before the panel has the person's latest starting point, base branch or typed field; name a phase this run completed whose work a base-branch start leaves out even though the base plan already closes it; and show what a Start that stopped partway did and what remains after Kiln restarts.

## Acceptance criteria covered
AC-SETUP-03 (completes it; owned by phase 2), AC-SETUP-01 (completes it; owned by phase 2), AC-SAFE-02 (completes it; owned by phase 2), AC-SAFE-01 (completes it; owned by phase 2)

## What the audit found missing
- **AC-SETUP-03:** Start in `view/src/components/FolderSetupPanel.svelte` stays enabled while a `change()` POST is in flight (its `disabled` ignores it, and `buildPanel` reads origin, so the window can last seconds). `pressStart` sends the stale `panel.selected`, and `Engine.applyFolderStart` in `src/engine/engine.ts` calls `applyFolderDraft` with it, resetting the draft to the old starting point; the rebuilt `previewId` then matches and the start the person just switched away from runs. The panel must refresh before Start can be pressed.
- **AC-SETUP-01:** the same `pressStart` never commits a pending typed Worktree, Workspace folder or Feature branch edit (`typed()` posts it 400 ms later or on blur), so a Start pressed in that window runs with the old value while the field shows the new one.
- **AC-SAFE-02:** `baseStart` in `src/engine/folder-setup.ts` never names a phase this run completed, or the stopped phase, that the base plan already closes but whose recorded commit (`pushedSha` or `waivedHead`) is not in the chosen base by AC-FACTS-01's test: `again` takes only unclosed leaves and `notInPlan` only ids the base plan lacks. The work is left on the earlier branch unnamed, and `holdsAllWork` (built from `missing` and `leftWork` only) lets the base line say "Has all of this run's work."
- **AC-SAFE-01:** a Start interrupted by stopping Kiln, or one that failed before a restart, no longer says what it did and what remains: `folderStartProgress` is set only in `applyFolderStart`'s catch, and nothing rebuilds it with `progressOf(intent)` from the durable failed intent that `failedStartIntent` finds at startup or in `refreshFolderPanel`.

## Known failures
- Verified 2026-11-07 on the Phase 8 baseline (`b5a4317`): `src/server/folder-missing-in-browser.integration.test.ts` fails its merged and multi cases. Since Phase 7 the page's starting-point lines (AC-SETUP-02, AC-SETUP-03) say more than the mockup's: the merged case's existing-branch line adds "Has all of this run’s work.", and the multi case's base line adds "at 7e21b90" and its existing-branch line "last commit bec1115". The page follows the criteria; the mockup (`mockups/kiln-missing-worktree-recovery.html`) is the design reference to bring up to date, so this phase's starting-point work leaves that test green.

## Phase dependencies
2 (the setup panel, `baseStart`, Start and its intent); 4, 6 and 7 (their completion of AC-SETUP-03, AC-SAFE-01 and AC-SAFE-02).
