# Phase 4: Complete Restore from an empty own copy, the Merge button's agent and the one-model command

**Closed:** 2026-11-27
**Added by delivery audit:** 2026-11-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md) — relevant sections: "Saving" ("The page holds a draft"), "Snapshot", "Command line"
**Phase plan:** [Execution order](kiln-model-modes-phase-plan.md)
**Model tier:** standard

## Summary
Let Restore Kiln's defaults, saved for every PRD, return a PRD to the defaults even when its own settings hold nothing. Make the finished page's Merge with {agent} button name the agent the merge session will actually run on. Give the terminal a way to save the one model without switching every PRD to One model for everything.

## Acceptance criteria covered
AC-SAVE-03 (completes it; owned by phase 2), AC-ROW-01 (completes it; owned by phase 1), AC-CLI-01 (completes it; owned by phase 2)

## What the audit found missing
- **AC-SAVE-03:** A PRD's own settings file can exist yet hold no field, for example after Restore saved for This PRD only or `kiln model-defaults restore --prd`. When Model defaults also hold no field, `holdsSettings` in `settingsView` (`src/models/model-defaults-edit.ts`) is false, so `draftState` (`src/models/settings-change.ts`) doesn't count Restore as a change. Save then stays unavailable with Every PRD on this computer selected, and the PRD never follows the defaults again. `saveSettings` already removes the PRD's file on such a save. The design's rule in "The page holds a draft" ("Restore is a change while Model defaults or this PRD's own settings hold any field") doesn't cover an own-settings file that holds no field; the criterion governs.
- **AC-ROW-01:** Before the merge is pressed, the Merge with {agent} button (`view/src/screens/Complete.svelte`) takes its agent from `mergeAgent` in `view/src/lib/agents.ts`. That reads a merge row that doesn't exist until the press, then falls back to `inUseAgent`, which on a complete run is the first installed agent (Claude Code whenever it is installed). When the Preflight and pull request row, this PRD's change, the one model or For everything puts the merge on Codex, the button reads "Merge with Claude Code". The note beside it is right: `afterDeliveryView` in `src/engine/snapshot.ts` builds it from `engine.agentOf(MERGE_KEY)`.
  - Search: callers of `mergeAgent(` in `view/src`. Failing sites: the button in `Complete.svelte`, the merge line in `Complete.svelte`, `mergeAllowedLine` on Documents found (`DocumentsFound.svelte`), and `repositoriesStatement` in the run's settings (`SettingsPanel.svelte`). The last two quote "Merge with {agent}" and follow the first unfinished activity's agent rather than the merge's. Done when no site the search returns fails.
- **AC-CLI-01:** The page can save the one model without changing the mode. This happens when the person edits it and returns to Recommended before saving, or saves a one-model change for every PRD from a PRD whose own settings are on One model while Model defaults are on Recommended (SAVE-004). The only command that sets the one model, `kiln model-defaults mode --one-model --agent … --model …` (`changeOf` in `src/control/model-defaults-command.ts`), also sets the mode to One model. `mode --recommended` refuses `--agent`. Every PRD that follows the defaults therefore runs on one model between the two commands. The form belongs in `changeOf`, with its contract in `prompts/kiln-command-contracts.json`, and the design's "Command line" usage.

## Phase dependencies
1 (the merge session's choice from the Preflight and pull request row, `agentOf`); 2 (the page's draft, `settingsView` and the Model defaults commands)
