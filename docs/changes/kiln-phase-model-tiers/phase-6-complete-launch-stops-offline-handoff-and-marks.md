# Phase 6: Complete the launch stops, offline handoff, split-phase fallback detail and in-use mark

**Closed:** 2026-11-24

**Added by delivery audit:** 2026-11-24, after every planned phase and Phase 5 closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "The launch decision", "Snapshot" (what a stop on a not-started activity names), "Agents" (the account panel), the `kiln handoff` part of the command-line section
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
Finish four criteria that Phase 5 left partly built. Every stop where an activity can't run on its choice should name the choice: its agent, model and effort, where it came from and where to change it. That includes Codex refusing the model, a skill that doesn't resolve on the decided agent, an agent missing at the end of a wait, and a stop whose session ran. With Kiln not running, `kiln handoff` should notice a Model defaults or tier change made after Kiln stopped. A split phase's detail should keep its fallback facts. Before Start, Claude Code's account should be marked in use when two agents are shown.

## Acceptance criteria covered
AC-PICK-06 (completes it; owned by phase 1), AC-PICK-07 (completes it; owned by phase 2), AC-AGENTS-03 (completes it; owned by phase 2), AC-FALLBACK-03 (completes it; owned by phase 4)

## What the audit found missing
- **AC-PICK-06:** When Codex refuses the recorded model at the first launch, the stop names no choice, source or place to change it.
  - `src/engine/engine.ts` `judgeEndedSession` records a `selection` stop whose only fact is the raw `run.codex.verificationFailure`.
  - For a `selection` stop, `src/engine/snapshot.ts` drops the session, so `needsYou.choiceSource` is never set.
  - Check again's Codex probe row (`recheck`, the `probeCodexLaunch` result) records raw facts too.
  - Build these facts from the session's saved `launch` with `launchSource`, as `launchStopFact` does.
- **AC-PICK-06:** Two more stops found at launch record only the raw message, with no choice, source or place to change it.
  - `Engine.skillForDecision`'s catch, when the audit skill doesn't resolve on the agent the decision named. Wrap it with `launchStopFact` while the decision is still there.
  - `Engine.stopWaitOnUnusableChoice` when the choice's agent isn't installed: it records `installRemedy(...)` alone.
- **AC-PICK-06:** A stop found at launch whose session ran names the agent and the source, but not the choice's model and effort.
  - The fact comes from `snapshot.ts` `choiceSource` → `activity-models.ts` `launchSource`, which gives only where the choice came from and where to change it.
  - `view/src/screens/NeedsYou.svelte` (both stop layouts) and `view/src/screens/PhaseHandoff.svelte` render `choiceSourceLine` and never `stop.model` or `stop.effort`. Only `PhaseDetail.svelte` shows the model.
  - So after a fallback launch, or for a Claude Code preflight, audit or pull request stop, Needs you never says which model and effort could not run.
- **AC-PICK-07:** With Kiln not running, `kiln handoff` still returns `resume_command` and `resume_argv` after the current choice has moved through a Model defaults change (`kiln model-defaults` needs no controller) or a tier change made after Kiln stopped.
  - `src/control/projection.ts` `cachedChoiceMove` compares only against the row in the last saved snapshot.
  - The technical design ("Snapshot", what a stop on a not-started activity names) withdraws the reopen command after a Model defaults or tier change.
  - Compare against the choice resolved now from the record's `modelChoices`, the Model defaults file and the plan's tier.
- **AC-FALLBACK-03:** After its session splits the phase, a phase that started on the fallback loses the fallback facts from its detail once it is no longer current.
  - `src/engine/snapshot.ts` `addFallbackDetails` calls `Engine.detailsFallback(row.id)` with the child's id (`2a`), but the facts are keyed by the launched phase (`2`).
  - Map the row id with `factsKeyOf` first.
- **AC-AGENTS-03:** On Documents found and the Folder missing setup panel, Claude Code's account shows only as `accountLines` text, with no in-use mark.
  - Only Codex's `AccountPanel` there carries `markInUse`. So with two agents shown and Claude Code in use, neither account is marked.
  - Mark the entry whose `agent.inUse` is set in `view/src/screens/DocumentsFound.svelte` and `view/src/components/FolderSetupPanel.svelte`, or in `view/src/lib/documents-found.ts` `accountLines`.

## Phase dependencies
1 (the resolver and the stop facts); 2 (agents, the account panel and `kiln handoff`); 4 (the launch decision and its saved `launch`); 5 (`launchStopFact`, `cachedChoiceMove`, `factsKeyOf` and the Documents found account marks)
