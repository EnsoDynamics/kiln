# Phase 12: Complete the plan's notices at a stop, the plan read after billing approval, stage recovery, and the start-build reason

**Closed:** 2026-11-28

**Added by delivery audit:** 2026-11-28, after every planned phase closed, in the audit that followed phases 9 and 10. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Rows"; "Reading it"; "The driver"; "How a stage ends"; "Starting the Build"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Fix the requirements-run gaps the delivery audit found:
- At a stop, Kiln corrects the plan and says what changed in three more cases:
  - when the session ran an entry before the one that reaches the stop;
  - when the standing was unknown;
  - when a feedback session reports the milestone.
- Approving billing never starts a second plan read once a plan for the installed method is already known.
- At Needs you and on a Pause now hold, a requirements stage gets the controls and checks a phase gets:
  - a fresh-session prompt for its own work;
  - a completion check that judges it as a requirements stage;
  - a way on when its conversation can't be reopened.
- `kiln start-build` and `kiln status` give the no-phase-plan reason that the screen gives.

## Acceptance criteria covered
AC-PLAN-06 (completes it; owned by phase 1), AC-PLAN-03 (completes it; owned by phase 3), AC-STAGE-04 (completes it; owned by phase 1), AC-FINAL-06 (completes it; owned by phase 1)

## What the audit found missing
- **AC-PLAN-06:** `advanceCursor` (`src/requirements/rows.ts`, the `atStop` branch, ~lines 73–92) misses three at-stop cases.
  - **The session ran an entry before the one that reaches the stop's milestone.** Take plan [Write, Refine (reaches `prd_refined`), Design], where the session ran Write and reported `prd_refined`. Or take the final stop, where the session ran the design refinement with the build next and so skipped Phase split. In both, the `ranAt >= 0` path moves the cursor only to `ranAt + 1` (or `+ 2`). The entries up to the first one that reaches the milestone are neither passed nor named:
    - at the early review, Refine still shows as a stage to come;
    - at the final review, Phase split drops with nothing said.
    
    Move the cursor past them as the ran-nothing path does (`indexReaching`), and name them as passed.
  - **The standing was unknown and the session ran a plan entry.** No notice is given at all: `expected` is undefined, and the "Passed …" line is suppressed by `!unknown` with nothing in its place. Take a PRD written by hand whose first session refines it: Write leaves the plan silently. Say "Kiln continues from X, where the method found this PRD stands.", as the ran-nothing path and the away-from-a-stop path do.
  - **A feedback session reports a stop's milestone.** Its report never moves the cursor and gives no notice, because the milestone handling is inside `if (task === "stage")`. Take a standing left unknown by a stage finished by hand at Needs you, or at Start for a PRD started by hand, with feedback waiting, so the driver runs the feedback session first. The early review then lists Write and Refine as stages to come, and the next stage session runs as Write with a wrong "Passed …" notice. A feedback report at a stop must move the cursor past the entries its milestones put behind the work, and name them, as a stage report does.
- **AC-PLAN-03:** `Engine.billingCommand` (`src/engine/engine.ts` ~line 1652) calls `refreshRequirementsPlan({ force: true })` on approval whenever `planWaitsForBilling` is set. `force` skips the known-plan check, and `planWaitsForBilling` is cleared only by a read this Kiln starts (`startPlanRead` ~line 6543). So when another PRD's Kiln reads the plan while this one waits for billing, and this Kiln adopts it through its watch, approving billing here still runs a second, paid read of a method that already has a plan. Once a plan for the agent and fingerprint is known, the approval must not read again: clear the wait when a plan lands, or don't force.
- **AC-STAGE-04:** the Needs you and Pause now screens treat a requirements session as a phase in three places.
  - **Fresh-session prompt.** `needsYouView` (`src/engine/snapshot.ts`, `originalPrompts` ~line 1161) has no requirements branch. For a `req-` key it falls to `freshSessionPrompt(engine.phasePromptValues(engine.fileOf(judged) ?? "", folder))`, a prompt to implement a phase with implement-from-requirements and write a Closed line. The person sees it under "Copy a prompt for a fresh session instead", and as the "Start a fresh session" step when no resume command exists. For a stage, feedback or review session it must be that session's own prompt (`requirementsPrompt`, as `launchRequirementStage` builds it).
  - **Resume or carry-on from a Pause now hold.**
    - `recoverPhase`'s requirements branch (`src/engine/engine.ts` ~line 2861) sets `returningTakeover` and queues the resume without judging the stage. The launch then calls `takeoverBecameComplete` (~line 1540), which runs the phase `doneCheck` on the `req-` key.
    - That judges the stage by phase documents. It never sees a stage the person finished and committed in their terminal, which is the move-on that the held page promises.
    - It throws "Could not recheck activity completion before dispatch." when the PRD directory doesn't exist yet, as for a planned-PRD run before its draft.
    - Judge a requirements session here with `judgeRequirements(key, true)`, as Check again does.
  - **A conversation that can't be reopened.** `resumeSession` (~line 8139) and `launchSessionNow` (~line 8348) record `not_resumable` for any key whose history is missing, requirements keys included. There is then no way on:
    - `Engine.stoppedPhase()` (~line 9587) returns undefined for requirements keys, so carry-on is never offered and `restartFacts` gives no carry-on card;
    - `phaseRecoveryTarget` needs `session.kind === "phase"`;
    - `recheckStop`'s requirements guard (first line) takes only `done_check`, so Check again falls through to the phase `doneCheck` / `recordDone` on the `req-` key.
    
    A requirements `not_resumable` stop must offer carry-on, with a fresh session of its own (`launchAtStop` already has the requirements branch), and its Check again must go to `judgeRequirements`.
- **AC-FINAL-06:** with no phase documents at the final review, the `start-build` control is unavailable (`controlView`, `src/engine/engine.ts` ~line 732), but its reason is `this.finalStartProblems[0] ?? "The phase plan must pass the start checks."` (~line 764). With no phase documents, `runStartChecks` takes the started-by-hand path and adds no missing-document line, so `finalStartProblems` is empty. `kiln start-build` therefore refuses with the generic sentence, and `kiln status` shows it as the control's reason, instead of the "No phase documents" fact the screen shows. When `requirementsBuildPlan` isn't ok, the reason must be its `problem`.

## Phase dependencies
1 (the driver, the stops, Needs you for a stage and Start the build); 3 (the plan read, its rows and billing); 6, 8 and 10 (the requirements-run fixes they completed)
