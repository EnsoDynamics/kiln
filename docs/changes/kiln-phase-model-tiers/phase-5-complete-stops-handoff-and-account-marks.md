# Phase 5: Complete the stop pages, offline handoff, fallback card and account marks

**Closed:** 2026-11-24

**Added by delivery audit:** 2026-11-24, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "Agents" (readiness, billing and the account panel), "The launch decision", "Snapshot", the `kiln handoff` part of the command-line section
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
Finish six criteria that the first four phases built only in part. The Start reason for a missing Claude Code billing approval should name the agent and the activities that need it. Before Start, the usage line should mark a limit above the threshold, and the agent marked in use should follow the session a split phase runs on. A stop should say where its choice came from and where to change it, including at a preflight stop. `kiln handoff` should withhold the reopen command when Kiln isn't running and the choice has changed. An activity that started on the fallback should keep saying so after it continues in a new session.

## Acceptance criteria covered
AC-AGENTS-02 (completes it; owned by phase 2), AC-AGENTS-03 (completes it; owned by phase 2), AC-PICK-07 (completes it; owned by phase 2), AC-PICK-03 (completes it; owned by phase 3), AC-PICK-06 (completes it; owned by phase 1), AC-FALLBACK-03 (completes it; owned by phase 4)

## What the audit found missing
- **AC-AGENTS-02:** When a missing Claude Code billing approval holds Start for an activity that runs on Claude Code, the reason doesn't name the agent or the activities that need it, as AC-AGENTS-01's table requires. It reads only the billing `readinessError` or a generic "Review and approve…" / "Review billing before starting.". The fix belongs in `src/engine/engine.ts` `Engine.start` (the `claudeNeed` billing refusal; `neededAgentReason` and `neededBy().claude_code` already hold the parts) and in `view/src/lib/documents-found.ts` `agentsHoldStart`.
- **AC-AGENTS-03:** With the fallback on, Documents found and the Folder missing setup panel show Claude Code's usage only as the `accountLines` text ("Used: 5-hour …"), which ignores `limit.overThreshold`, so a Claude Code limit at or above the threshold is never marked before Start. The fix belongs in `view/src/lib/documents-found.ts` `accountLines`, rendered in `view/src/screens/DocumentsFound.svelte` and `view/src/components/FolderSetupPanel.svelte`. Codex's `AccountPanel` there is already marked.
- **AC-AGENTS-03:** After a session splits its phase, Kiln's engine looks up the child phase (`2a`) by its own id, but the facts stay keyed by the launched phase (`2`).
  - `Engine.unfinishedActivityKeys` pushes `phase.id`, and `agentOf("2a")` returns 2a's own tier choice rather than the running session's agent. So `neededBy` can leave out the agent the session runs on.
  - `inUseAgent` receives the judged ids `needsYou.phaseId` and `waiting.phaseId` from `src/engine/snapshot.ts` `agentViews`, so it can mark the wrong agent as in use.
  - The fix belongs in `src/engine/engine.ts` (`unfinishedActivityKeys`, `agentOf` / `inUseAgent`): map a leaf to the launched key that holds its facts, as `snapshot.ts` `phaseViews` does with `judgedKeyFor` and `factsByRow`.
- **AC-PICK-06:** A stop found at launch (the agent didn't run, or the account refused the model) shows where its choice came from only on the session detail page. `snapshot.ts` `choiceSource` becomes `needsYou.choiceSource`, which only `view/src/screens/PhaseDetail.svelte` renders ("Chosen from"). Needs you itself doesn't name the source or where to change it. The fix belongs in the stop cards of `view/src/screens/NeedsYou.svelte` and `view/src/screens/PhaseHandoff.svelte`.
- **AC-PICK-06:** For the preflight and the pull request session, the stop names the wrong place to change the choice. The cause is two strings:
  - `choiceStopFact` (`src/engine/engine.ts`) says "Change it on its row in the phase plan." for a changed Audits choice.
  - `choiceSource` (`src/engine/snapshot.ts`) adds "or on its row in the phase plan" for a Model defaults choice.

  Neither the Preflight row nor the pull request row offers Change. The places AC-OTHER-01 gives are the Audits line in Documents found or the run's settings, a Delivery audit or Test audit row, or Model defaults.
- **AC-PICK-06:** When the fallback's launch checks pass in the decision but fail just before launch, the stop doesn't name the fallback. The failing check is either `selectionIssue` on the fallback's agent or `prepareCodexLaunch`, and `src/engine/engine.ts` `launchReadinessNow` records only the raw message. The stop doesn't say the choice was the fallback, where it came from or where to change it. `recordStop` drops the decision, so `choiceSource` has nothing to read. The fix: build the fact from `this.decisions.get(nextKey)` before recording the stop.
- **AC-PICK-03:** At a preflight stop, and at a loop-limit stop saved by Kiln 1.3.0, the browser offers no Change for phases that haven't started, nor the Audits line. `view/src/screens/NeedsYou.svelte` renders `<ModelChanges>` only when `!stop.preflight && stop.kind !== "loop_limit"`, though `kiln model` works there. The build preflight's "no other control at a preflight stop" rule covers session controls, not model changes.
- **AC-PICK-07:** `kiln handoff` run while Kiln isn't running never checks the current choice. `src/control/client.ts` calls `src/control/projection.ts` `handoffProjection` with no engine, so `choiceMoved` is always false. The command then returns `resume_command` and `resume_argv` for an activity that hasn't started even after its choice changed, gives no "choice changed" reason, and keeps the saved fresh-session command for the session's own agent. The fix: in `handoffProjection`'s no-engine branch, decide from the cached snapshot (the row's `model.choice`, or a `needsYou` that left `resumeCommand` out), and return the fresh-session instructions for the current choice's agent.
- **AC-FALLBACK-03:** An activity that started on the fallback and then continues in a new session (a carry-on when its conversation can't be reopened) loses its fallback facts. `ensureDecision` skips started activities, so the new session has no `launch`.
  - The finished row's **Ran on** drops the **Fallback** tag. `src/engine/activity-models.ts` `modelView` (finished branch) reads `rowFallback` from the latest session that got a response.
  - The card no longer says it started on the fallback while that session is current. `src/engine/snapshot.ts` `currentView` reads `current.session.launch`.
  - The fix for both: take the fallback from the session that started the activity, as `Engine.detailsFallback` already does.

## Phase dependencies
1 (the resolver and the stop facts); 2 (agents, billing, the account panel and `kiln handoff`); 3 (Change and the Models card); 4 (the launch decision and its saved `launch`).
