# Phase 7: Complete phases closed at the start on a cut-new PRD repository, and the catch-up offer's box

**Closed:** 2026-11-13

**Added by delivery audit:** 2026-11-13, after every planned phase closed. It builds what earlier phases left out of the criteria below, confirmed in the whole-PRD audit at `aae107e`.
**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "Starting From a Branch" (The starting point, After Start), "Catching a Branch Up"
**Phase plan:** [Kiln Run Restart phase plan](kiln-run-restart-phase-plan.md)
**Repositories:** kiln

## Summary
Finish the last two parts. On a multi-repository start from an existing branch where the PRD's repository doesn't have the branch, the first plan read accepts the phases Closed at that repository's start commit, as it already does when the PRD's repository has the branch. On Documents found, the "Bring the branch up to date" offer sits in its drawn box.

## Acceptance criteria covered
AC-FROM-02 (completes it; owned by phase 2), AC-FROM-05 (completes it; owned by phase 2), AC-LOOK-01 (completes it; owned by phase 1)

## What the audit found missing
- **AC-FROM-02, AC-FROM-05:** in `src/engine/engine.ts`'s plan read (the `closedAtStart` block, around line 7159), the Closed-line-only acceptance runs only when `prdEntry?.runStartCommit` is set. On a start from an existing branch where the PRD's repository lacks the branch, its entry is cut new and holds only `baseCommit`, so the acceptance is skipped. Leaves Closed on the base then fall to the published-base proof and `runDoneCheck`, which fail whenever another repository's adopted branch has commits of its own, is unpushed, or holds uncommitted files outside the PRD directory (all allowed by AC-FROM-03), and Kiln makes a plan stop on a phase that was closed before the run. The design ("After Start", Closed before the run) requires the acceptance at the PRD repository's start commit: "its `runStartCommit`, or its `baseCommit` when its branch is cut new".
- **AC-LOOK-01:** on Documents found, the catch-up offer ("This branch is N commits behind …" with its tick box) renders as loose lines. `view/src/components/CatchUpOffer.svelte` gives `.offer` a border and padding only for `where="stop"`, and `view/src/screens/DocumentsFound.svelte` uses `where="start"` for one and several repositories. The mockup's "Documents found after a reset" state draws it in its own bordered box (amber, radius 12, padding 14px 16px). Built with it: the stopped-phase pages' offer, which the mockup also draws as an amber box (radius 14, padding 16px 20px) and Kiln drew as a grey panel; AC-LOOK-01 names those pages too.

## Phase dependencies
2 and 6 (Start from an existing branch and Documents found's layout, as they now stand)
