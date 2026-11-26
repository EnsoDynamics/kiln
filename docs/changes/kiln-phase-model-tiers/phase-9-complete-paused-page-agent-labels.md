# Phase 9: Complete the paused page's labels for a new session on another agent

**Closed:** 2026-11-25
**Added by delivery audit:** 2026-11-25, after every planned phase and Phases 5 to 8 closed. It builds what earlier phases left out of the criterion below.
**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "When an Activity Starts" (Pause now's hold), the "Replaces in part" entry for the Pause Now technical design's §The Paused Page
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
Finish one criterion that is still partly built. On the Pause now paused page, when Resume will start a new session because the paused session never got a response, the note label, its placeholder and the busy status should name the agent that Resume launches on. Today they say Claude and "reopening the conversation" even when the activity's choice has moved to Codex.

## Acceptance criteria covered
AC-AGENTS-04 (completes it; owned by phase 2)

## What the audit found missing
- **AC-AGENTS-04:** On the Pause now page's "Let Kiln carry on" column, when the paused session never got a response (`stop.newSession`), the labels name the paused session's agent and not the agent Resume launches on.
  - Where: `view/src/screens/PausedHold.svelte`. The label "Note for Claude" and the placeholder "Anything to tell Claude before it carries on" are hardcoded. The `BusyStatus` text "Checking the work, then reopening the {agent} conversation." uses `agent`, the paused session's agent (`stop.agent`), and says it reopens the conversation.
  - The paragraph above them already names `nextAgent.agent` for this case ("Starts a new {nextAgent.agent} session…").
  - Example: Pause now holds a Claude session that never got a response. The person changes the phase to a Codex choice, and Resume launches a new Codex session, but the note and the status still say Claude and reopening.
  - Pause now only holds Claude sessions, so the take-over column's Claude labels, and these labels for a session that did get a response, are correct as they are.

## Phase dependencies
2 (the activity's agent, `activityAgent`); 3 (Change at a Pause now hold)
