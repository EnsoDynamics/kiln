# Phase 7: Complete the stops on a launch again and the offline handoff

**Added by delivery audit:** 2026-11-25, after every planned phase and Phases 5 and 6 closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "Launching" and "A choice that can't be used", "Snapshot" (what a stop on a not-started activity names), the `kiln handoff` part of the command-line section
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
Finish two criteria that are still partly built. When the person launches a not-started activity again and its choice can't be used, the run should stop and name the choice, as a loop launch does. An audit skill that doesn't resolve should name the Audits choice when the audit is allocated and on Check again. With Kiln not running, `kiln handoff` should resolve the current choice for a stop with no saved session, and should handle a computer where Claude Code isn't installed.

## Acceptance criteria covered
AC-PICK-06 (completes it; owned by phase 1), AC-PICK-07 (completes it; owned by phase 2)

## What the audit found missing
- **AC-PICK-06:** Start again, Send reply & continue and Check Preflight again skip the launch checks when the not-started activity's choice can't be used. One case: Model defaults or the model list changed so the agent no longer offers the model.
  - These go `drive` → `requestedLaunch` → `launchAtStop` / `launchPreflightAtStop` → `launchSession` → `launchSessionNow` in `src/engine/engine.ts`. None of them calls `launchReadiness` or `selectionIssue`.
  - `ensureDecision` returns true with no decision. Then `Engine.launchChoice` throws `Error(choiceStopFact(...))`. `launchSession` has only a `finally`, and the `.catch` on `this.drive()` in `kick` rethrows the error.
  - So no `selection` stop is recorded, Needs you names nothing, and the error escapes the engine loop.
  - Fix: run the same checks `launchFresh` runs (`launchReadiness`) before these launches, so the stop is recorded with `choiceStopFact` / `launchStopFact`.
- **AC-PICK-06:** An audit skill that doesn't resolve on the Audits choice's agent stops with the raw message only, with no choice, source or place to change it.
  - At allocation: the `nextActivity` catch in `src/engine/engine.ts` (`recordStop(key, "selection", [{ name: READINESS_CHECK, … facts: [message] }])`). The skill was resolved in `allocateAudit` against `auditsAgent`.
  - On Check again: the `READINESS_CHECK` branch of `recheckStop` rewrites the stop's facts with the raw message. This includes a stop that `skillForDecision` first recorded with `launchStopFact`.
  - The stop's key can be the previous, finished audit, so the fact must name the Audits choice as it is now, not what that audit started on. Build it from `notStartedChoice` and `launchSource`, as `choiceStopFact` does.
- **AC-PICK-07:** With Kiln not running and no saved session, `kiln handoff` returns the cached stop's fresh-session command and agent.
  - Where: `src/control/projection.ts` `handoffProjection`, the `!selected` branch. It uses `view.needsYou.freshSessionCommand` / `freshSessionPrompt` and `view.agents[].inUse`.
  - Example: a selection stop before any session exists, Kiln stops, and Model defaults moves the activity to the other agent. `kiln handoff` still gives the old agent's command.
  - Fix: resolve the stop's activity's current choice now, as `offlineChoice` does, and give that agent and its fresh-session command.
- **AC-PICK-07:** With Kiln not running on a computer where Claude Code isn't installed, `kiln handoff` resolves the Claude Code first choice.
  - Where: `src/control/projection.ts` `offlineChoice` sets `claudeCodeInstalled` to `view.agents?.find(claude_code)?.installed ?? true`.
  - `snapshot.ts` `agentViews` leaves Claude Code out when it isn't installed and isn't needed, so the default `true` applies.
  - Effect: `cachedChoiceMove` withholds the reopen command for a Codex session whose choice hasn't changed, and offers a fresh Claude Code session.
  - Fix: treat an absent entry as not installed, or check whether the executable is available.

## Phase dependencies
1 (the resolver and the stop facts); 2 (`kiln handoff` and the agents); 4 (the launch decision); 5 and 6 (`launchStopFact`, `choiceStopFact`, `cachedChoiceMove`, `offlineChoice`)
