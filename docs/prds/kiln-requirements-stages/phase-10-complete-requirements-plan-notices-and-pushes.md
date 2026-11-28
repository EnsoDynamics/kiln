# Phase 10: Complete the requirements plan's notices and stop marks, and the pushes after a review

**Added by delivery audit:** 2026-11-27, after every planned phase closed, in the audit that followed phases 7 and 8. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Reading it"; "Rows"; "How a stage ends"; "The Two Reviews"; "Models"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Fix the requirements-run gaps the delivery audit found:
- Kiln names every plan entry a report passes, including after it has lost its place in the plan.
- It marks a stop on the method's own review row while that review is being made.
- It shows a plan read another Kiln is already running.
- It pushes the feature branch when it leaves a review with the person's own commits.
- With no plan, the fallback heads-up and choice checks for a stop's review use that review's row.

## Acceptance criteria covered
AC-PLAN-01 (completes it; owned by phase 3), AC-PLAN-04 (completes it; owned by phase 3), AC-PLAN-06 (completes it; owned by phase 1), AC-STAGE-02 (completes it; owned by phase 1), AC-MODEL-06 (completes it; owned by phase 1)

## What the audit found missing
- **AC-PLAN-06:** `advanceCursor` (`src/requirements/rows.ts`) says too little of what changed in three cases.
  - Away from a stop, it never names the entries between the cursor and the first one the session ran. Take a plan [A, B, C, D] with the cursor at A and a report that ran C with D next. The notice says only "The session ran C where the plan had A next.", and B leaves the plan unnamed. The at-stop branch names such entries; this branch must too.
  - After `cursorLost`, `expected` is undefined, so a report that moves the cursor gives no notice at all. Take a PRD refined by hand and held at the early review, then Continue. The next session runs the technical design, and the draft and refinement entries drop with nothing said.
  - At a stop where the stage session ran nothing (`ranAt < 0`), the branch only sets `cursorLost`. At the early review, the plan then still lists entries already behind the report's milestones as stages to come, such as writing and refining the PRD.
- **AC-PLAN-01:** while the method's own review entry runs as a stop's review session (the entry right after the one that reaches `prd_refined` or `requirements_finished` reaches `review_made`), no row carries that stop's mark.
  - `plannedRows` (`src/requirements/rows.ts`) marks the milestone entry, which is done by then and not among the planned rows.
  - The active-row check in `requirementsView` (`src/engine/snapshot.ts` ~lines 712–717) tests only the milestone entry's key.
  - The "row before Kiln's review row" pass (~line 739) covers only Kiln's own review rows.
- **AC-PLAN-04:** when another Kiln already holds the plan read, `Engine.refreshRequirementsPlan` (`src/engine/engine.ts` ~lines 6481–6485) sets `planMethod` and returns without `changed()`. A screen published before that keeps showing "Kiln hasn't read the plan yet." until the other read lands. Every other branch of the method republishes.
- **AC-STAGE-02:** `leaveRequirementsReview` (`src/engine/engine.ts` ~line 6320), reached by Resume at either review, and `startRequirementsBuild` (~line 6297) go on once Everything committed passes but never push. The person's own session's commits therefore stay unpushed when Kiln moves on: past the early review, back to the final review, or into the build. Push the feature branch there, as `judgeRequirements` does (~line 6929), stopping on the Pushed check when Git rejects it.
- **AC-MODEL-06 (Phase Model Tiers AC-FALLBACK-04, AC-PICK-06):** with no plan, while the driver's next launch is a stop's review (`noPlanReview()` returns `kiln:early` or `kiln:final`), the no-plan branch of `Engine.unfinishedActivityKeys` (`src/engine/engine.ts` ~lines 2081–2084) still returns `req-row:<nextStageKey(skill)>` or `req-next`. As a result:
  - `headsUp()` works out a forecast under a key no row has, so `placeHeadsUp` puts it on no row.
  - The choice checks that read these keys check a choice other than the one the review row shows and launches on.
  - Use `req-row:kiln:<kind>` when `noPlanReview()` returns a review.

## Phase dependencies
1 (the driver, the stops and the push after a stage); 3 (the plan read, its rows and stage models); 6 and 8 (the requirements-run fixes they completed)
