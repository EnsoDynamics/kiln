# Phase 8: Complete the requirements run's controls, plan screen and stage models

**Closed:** 2026-11-27

**Added by delivery audit:** 2026-11-27, after every planned phase closed, in the audit that followed phases 5 and 6. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Reading it"; "Rows"; "The driver"; "How a stage ends"; "Feedback" (Length); "The Two Reviews"; "Models"; "Snapshot"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Fix the gaps the delivery audit found in a running requirements run:
- A plan read that finishes mid-session shows at once, and its source line stays while the plan is read again.
- A stop names every stage it passes.
- Both review screens carry the run's header and totals.
- A billing hold or a Needs you reply on a stage is handled as a phase's would be.
- Long Message Claude text becomes feedback instead of being refused.
- With no plan, a review stage resolves its model, Change and remembered choice under the row it was shown on.
- The saved-choice note shows on a PRD that first reads the changed plan.
- A stopped stage keeps its fallback heads-up and can be changed at Needs you.
- The terminal's fallback line names the stage.

## Acceptance criteria covered
AC-PLAN-03 (completes it; owned by phase 3), AC-PLAN-05 (completes it; owned by phase 3), AC-PLAN-06 (completes it; owned by phase 1), AC-STAGE-02 (completes it; owned by phase 1), AC-STAGE-03 (completes it; owned by phase 3), AC-STAGE-04 (completes it; owned by phase 1), AC-TALK-01 (completes it; owned by phase 2), AC-MODEL-01 (completes it; owned by phase 3), AC-MODEL-03 (completes it; owned by phase 3), AC-MODEL-04 (completes it; owned by phase 3), AC-MODEL-06 (completes it; owned by phase 1)

## What the audit found missing
- **AC-PLAN-05:** `Engine.adoptPlan` (`src/engine/engine.ts` ~line 6556) returns while a requirements session runs, even when the PRD has no `planFingerprint` yet. A read that finishes during the first session after Start is therefore not shown until that session ends. Meanwhile the screen says "Kiln hasn't read the plan yet." and its Read the plan button starts a second read. The design ("Reading it") says a PRD that shows no plan takes one as soon as it is read. The running-session guard belongs only on a PRD that already has a plan. `watchRequirementsPlan` goes through the same guard.
- **AC-PLAN-03:** `view/src/components/RequirementsPlan.svelte`, in its reading and failed branches, keeps showing an earlier plan's rows while the plan is read again or after a read fails. In those states it drops the "Read from the Enso Method installed on this computer, last updated …" line. `engine.planView()` already supplies `methodUpdatedAt` in both states.
- **AC-PLAN-06:** the `atStop` branch of `advanceCursor` (`src/requirements/rows.ts` lines 61–66) returns before the "Passed …" notice and drops the `skipped` entries it computed. Example: plan [A, B, C], where C reaches `prd_refined`, and a report with `ran` [A, C] at the early review. The cursor moves past B with no notice. The same branch sets the cursor past entries the stop came before without saying so.
- **AC-STAGE-03:** at the early and final review, `view/src/screens/Requirements.svelte` renders only `FeatureHeader`, never `StateHeader`. So the header doesn't name the review the run waits at, and no PRD total line is shown while the stop lasts. Those are the parts of AC-WATCH-02 and AC-TOTAL-02 this criterion replaces. The `early_review`/`final_review` branch of `headerStateOnly` (`view/src/lib/progress.ts` ~lines 141–143) is never reached.
- **AC-STAGE-02, AC-STAGE-04:** `recheckStop` (`src/engine/engine.ts` ~line 8740) sends a requirements `done_check` stop to `judgeRequirements` only when no billing hold stands. A billing hold on a requirements session goes to the phase path instead:
  - A resume hold whose session has runs goes to `doneCheck(phaseKey)` (~line 8749).
  - A launch hold still unapproved goes through `completionRows` to `doneCheck` (~lines 8771 and 8957).
  - `doneCheck` judges a `req-…` key by phase documents, so Check again never passes. It throws `CompletionCheckUnavailable` when no PRD directory exists yet. If it ever passed, `recordDone` would move on without the push.
  - Both places need a requirements branch that uses `judgeRequirements(key, true)` and `requirementsCommitted`.
- **AC-STAGE-04:** the requirements branch of `launchFresh` (`src/engine/engine.ts` line 7973) calls `launchRequirementStage` without the Resume note. A reply given at Needs you for a stage whose session never started a conversation is dropped. A phase in the same case carries the reply as a carry-on note (line 7978).
- **AC-TALK-01:** Message Claude to a requirements session over 4,000 characters is refused instead of being applied by a fresh session. The PRD's replacement of AC-MSG-01 says feedback too long to deliver "is applied by a fresh session, not rejected".
  - Browser: `POST /api/live/message` (`src/server/local-server.ts`) answers 413 `input_too_large` before it checks `engine.requirementsOpen`.
  - Composer: `view/src/components/LiveComposer.svelte` disables Send over the limit.
  - Terminal: `kiln message` is refused by the "live" read policy (`src/control/client.ts`, `src/control/input.ts` `messageProblem`) and by the `message` validation in `src/control/commands.ts` (~line 121).
  - The technical design's "Feedback" Length line ("Message Claude and the Needs you reply keep their 4,000") contradicts the PRD and gives no reason. Correct it with this fix.
- **AC-MODEL-01, AC-MODEL-03:** with no plan, when the latest report names the method's review skill as next, the snapshot and the launch use different keys.
  - The snapshot shows a Next row keyed `nextStageKey(state, skill)` (`requirementsView`, `src/engine/snapshot.ts` ~line 727), with the skill and its Change.
  - `driveRequirements` launches `task: "review"` keyed `kiln:early` or `kiln:final` (`reviewRowKey`, engine.ts ~line 6596), with no `expected`.
  - So a Change made on that row is never used, and the choice remembered for that skill isn't applied: `requirementsSkill` / `planStageInfo` find no skill for `kiln:*` without a plan.
  - Once launched, the review row has no `skill`, because `snapshot.ts` ~line 688 falls back to `plan.reviewSkill` only with a plan. So its Change has no "Use this for {skill} on every PRD" box.
- **AC-MODEL-04:** the "a saved choice no longer applies" note (`unmatchedOn` in `requirementsView`) needs the row's key in `state.notice.added`. Only `adoptPlan` sets that, and only when the PRD already held an earlier `planFingerprint`. A PRD whose first plan already lacks a remembered skill, because the method changed after the choice was saved, runs the replacing stage on its default with no note on any row. Mark it against the computer-wide plan file's earlier plan, in `adoptPlan`'s first-plan branch and in `unmatchedOn`.
- **AC-MODEL-06:** three gaps:
  - **The terminal fallback line (Phase Model Tiers AC-FALLBACK-03).** It names a requirements stage "Phase req-<uuid>". `noteStart` (engine.ts ~line 2222) passes `this.activityName(key)` to `fallbackStartLine`. `Engine.activityName` (~line 2971) has no requirements case and falls through to `Phase ${judgedId(key)}`. Search `activityName(` for its other callers that can receive a `req-` key, and name the stage by its row title (`titleOf`) wherever it does.
  - **The fallback heads-up (Phase Model Tiers AC-FALLBACK-04).** A requirements stage stopped at Needs you, or waiting before it started, gets no heads-up. With a plan, `unfinishedActivityKeys` (engine.ts ~line 2072) lists only `req-row:<key>` planned rows, because that stage isn't `current`. `requirementsView` shows the stage as `req-<activityId>` and leaves its planned entry out, so the key `headsUp()` returns matches no row (`placeHeadsUp`, `snapshot.ts` ~line 925). A stopped feedback session's heads-up lands on the next planned stage instead.
  - **Where to change a stopped choice (Phase Model Tiers AC-PICK-06).** At a requirements stage's selection stop, Needs you says to change the choice "on its row in the requirements plan". But `NeedsYou.svelte`, `Waiting.svelte` and `PhaseHandoff.svelte` show no plan. Their only model control, `view/src/components/ModelChanges.svelte`, lists `snapshot.activities ?? snapshot.phases`, and `activityViews` (`snapshot.ts` ~line 1999) skips requirements activities. So no Change, and no remember box (AC-MODEL-03), is on screen for that stage. A phase at the same stop gets its Change there, which AC-MODEL-01's "exactly as a phase can" also requires for a stage.

## Phase dependencies
1 (the driver, the stops and the model rows); 2 (feedback and both reviews); 3 (the plan read, its rows and stage models); 6 (the requirements-run fixes it completed)
