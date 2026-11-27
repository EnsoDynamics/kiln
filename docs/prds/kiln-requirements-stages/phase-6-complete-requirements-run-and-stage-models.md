# Phase 6: Complete the requirements run's screens, controls and stage models

**Closed:** 2026-11-27

**Added by delivery audit:** 2026-11-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Reading it"; "Rows"; "The driver"; "Feedback"; "The Two Reviews"; "Starting the Build"; "Models"; "Snapshot"; the "A method update at a stage boundary" decision
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Fix the gaps the delivery audit found in a requirements run:

- Kiln requires no requirements-stage skill by name.
- Start never waits for a plan read.
- An empty draft note shows nothing.
- The browser's Message Claude sends feedback to a requirements session.
- Every applied message's commit shows on the plan.
- What an early-review feedback round changed shows when Kiln carries on.
- The final review shows the phase plan as Documents found does, with its Preflight row above the build.
- Every requirements row resolves, changes, remembers and explains its model the way its launch does.

## Acceptance criteria covered
AC-PLAN-02 (completes it; owned by phase 3), AC-PLAN-05 (completes it; owned by phase 3), AC-PLAN-06 (completes it; owned by phase 1), AC-NOTE-01 (completes it; owned by phase 2), AC-STAGE-04 (completes it; owned by phase 1), AC-TALK-04 (completes it; owned by phase 2), AC-EARLY-04 (completes it; owned by phase 2), AC-FINAL-02 (completes it; owned by phase 2), AC-FINAL-04 (completes it; owned by phase 1), AC-MODEL-01 (completes it; owned by phase 3), AC-MODEL-03 (completes it; owned by phase 3), AC-MODEL-04 (completes it; owned by phase 3), AC-MODEL-06 (completes it; owned by phase 1)

## What the audit found missing
- **AC-PLAN-02:** `METHOD_SKILLS` in `src/agents/codex-metadata.ts` (line 8) names `phase-split`, the method's phase-planning requirements stage. It is enforced as an agent blocker in `src/agents/metadata.ts` (the startup read and `refreshClaudeForLaunch`) and in the Codex metadata read. Through `Engine.agentProblem` and `selectionIssue`, it gates every launch. An installed method that renamed or merged that stage therefore blocks every requirements stage until Kiln changes.
- **AC-PLAN-05:** `src/engine/engine.ts` `driveRequirements` (line 6580) calls `refreshRequirementsPlan({ wait: !!state.planFingerprint })`.
  - When the PRD already showed a plan before Start, its first session after Start waits up to 10 minutes for a read that is under way.
  - That read can be a Read again, or the read of a changed method by this Kiln, another Kiln or the home screen.
  - The wait comes from `await this.planRun` or `waitForOtherRead`.
- **AC-PLAN-06:** `advanceCursor` (`src/requirements/rows.ts`) takes the position of what ran from `report.ran[0]` alone. When a session reports several skills in `ran`, as a method that merged two stages does, the entries after the first are counted as passed. With plan [A, B, C], `ran` [A, B] and next C, the notice says "Passed B, which the method didn't run for this PRD." although B ran.
- **AC-NOTE-01:** `src/requirements/stages.ts` `readStageReport` (line 127) accepts a `draft` whose `statements` and `leftOut` are both empty. `view/src/components/RequirementsFeedback.svelte` (line 34) then shows the draft card with an empty list, where a report that gives none should show nothing.
- **AC-STAGE-04:** the browser's Message Claude composer is disabled for every requirements session.
  - `Engine.liveView` (`engine.ts` line 1274) sets `input.available` to false while the requirements are open.
  - `acceptLiveMessage` (line 1189) refuses the message.
  - `POST /api/live/message` and `kiln message` already turn such a message into feedback.
- **AC-TALK-04:** `src/engine/snapshot.ts` `requirementsView`, in the loop that hosts applied feedback on rows, skips a message silently when no shown done row comes before the session that applied it. Feedback sent before the first stage launches is one example. The plan then never shows that message's commit.
- **AC-EARLY-04:** feedback sent at the early review without Stop here again runs a feedback session, and Kiln carries on. That session's reported `changes` are then shown nowhere:
  - `readyReview` is not called again for the early review.
  - `requirementsView` exposes `review.whatChanged` only while `reviewStop` is set (`snapshot.ts`, around line 744).
  - The plan row shows only the commit.
- **AC-FINAL-02:** the final review's phase plan (`view/src/screens/Requirements.svelte`, the `{#if final}` list at line 68) shows each phase with only its model name. It has no agent, effort, tier or Change, which the screen before Start shows through `RowModel` in `view/src/screens/DocumentsFound.svelte`. The snapshot already carries each phase's `model.change`.
- **AC-FINAL-04:** the final review shows no Preflight row above the build.
  - `buildSnapshot` (`snapshot.ts` line 814) emits `requirements` in place of `preflightPlanned(...)` while the requirements are open.
  - Neither the final review's phase plan in `Requirements.svelte` nor the requirements plan shows the row.
  - The row appears only after Start the build.
- **AC-MODEL-01:** two requirements rows show a model other than the one the stage launches on.
  - With no plan, the Next row named by the latest report (`requirementsView`'s `nextRow(...)` call, around `snapshot.ts` line 720) has key `<skill>#n` but resolves its model under `req-next` or `req-design`. So it ignores a Change made on it and a remembered choice for the skill, while the launch uses `nextStageKey` and `expected.skill`. A Change on that row is saved but never shown on it.
  - `rowOfActivity` (`src/engine/activity-models.ts` line 150) resolves `req-next` to Requirements stages even while `designSpan` is open, where the launched `kiln:next` stage runs on Refining the design.
- **AC-MODEL-03:** a launched review-stage row that hasn't started, such as one stopped at Needs you because its choice can't be used, has no `skill`. The cause is `requirementsView`'s `const skill = stage.ran[0] ?? stage.expected`, because review stages never set `expected`. `view/src/components/RequirementsPlan.svelte` then passes no `rememberSkill`, and the "Use this for {skill} on every PRD" box is missing from that row's Change.
- **AC-MODEL-04:** only planned rows get `savedChoiceUnmatched` (`requirementsView`, `snapshot.ts` lines 710–715). Rows built from `state.stages` (lines 676–686) never do. `adoptPlan` runs at the stage boundary right before the next launch (`driveRequirements`, `engine.ts` lines 6578–6582). So when the stage that replaced a remembered skill is the next to run, its row turns into a stage row at once and never says the saved choice no longer applies.
- **AC-MODEL-06:** three ways a requirements stage doesn't follow a phase's model rules:
  - `choiceStopFact` (`engine.ts` line 11478) names a requirements stage "The audits, preflight and pull request session" and points to the Audits row. It also labels a saved choice as Model defaults. It reaches requirements stages through `selectionIssue`, `stopWaitOnUnusableChoice`, `launchChoice` and `modelsProblem`.
  - Requirements rows call `activityModel` without `current` (`snapshot.ts`, around line 686), so the running stage's row never says why the fallback wasn't used.
  - `placeHeadsUp` (`snapshot.ts`, around line 907) never searches `requirements.rows`. So no requirements row shows the fallback heads-up that `headsUp()` already computes for `req-*` keys.

## Phase dependencies
1 (the driver, the stops and the model rows); 2 (feedback and both reviews' screens); 3 (the plan read, its rows and stage models)
