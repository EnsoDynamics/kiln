# Phase 7: Complete the starting-point lines, the suggestion when a read fails, and the existing-branch start's left-behind work
**Closed:** 2026-11-07

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Facts" (What can't be checked), "The Setup Panel" (Starting points and defaults, What will run)
**Repositories:** kiln

## Summary
Offer the base branch when Kiln can't tell whether the existing branch is usable but knows the run's work is already in the base branch; give each starting point's line in a multi-repository run its latest commit and whether it holds all of this run's work; and name the phases whose unpushed work an existing-branch start from origin's copy would leave out.

## Acceptance criteria covered
AC-SETUP-02 (completes it; owned by phase 2), AC-SETUP-03 (completes it; owned by phase 2), AC-SAFE-02 (completes it; owned by phase 2)

## What the audit found missing
- **AC-SETUP-02:** `buildPanel` in `src/engine/folder-setup.ts` returns `{ blocked }` whenever `existing.available === "unknown"`, before looking at `workNotInBase`, so when every repository's work is known to be in the base branch (the suggestion's test is false whatever the availability) but a read the existing branch's availability needs failed (the checkout/origin relation, the feature plan, the worktree list), the panel offers no starting point instead of suggesting and offering the base branch. The design's test is three-valued and is unknown only when a failed read decides it.
- **AC-SETUP-03:** in a multi-repository run the choice `line` built in `baseStart` ("A new workspace and branch in both repositories, from origin/<base> · …") and in `branchStart` ("Re-creates X's worktree in the saved workspace … · N phases, M done.") names no latest commit, and the existing-branch line never says whether it holds all of this run's work. The PRD's wording governs, as for Phase 5's behind-base line; keep the mockup's wording otherwise.
- **AC-SAFE-02:** `branchStart` in `src/engine/folder-setup.ts` hardcodes `holdsAllWork: true` and "Has all of this run's work." and never consults `completedByRun` or the stopped phase's work, so when only origin has the feature branch (`createLocal` from `read.originSha`), a completed phase's unpushed `waivedHead`, or the stopped phase's unpushed commits, not in origin's tip are left out and the panel names no phase and says none will run again.

## Phase dependencies
2 (the setup panel, `buildPanel`, `baseStart`, `branchStart`); 5 and 6 (their completion of AC-SETUP-03 and AC-SAFE-02).
