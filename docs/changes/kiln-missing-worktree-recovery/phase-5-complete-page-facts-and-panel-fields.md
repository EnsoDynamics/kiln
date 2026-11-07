# Phase 5: Complete the page's facts, the unchecked reads it names, and the setup panel's fields

**Added by delivery audit:** 2026-11-07, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md
**Technical design:** docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md — relevant sections: "The Facts" (The plans, What can't be checked, its dependency table), "The Setup Panel" (What will run)
**Repositories:** kiln

## Summary
Make the Folder missing page show every fact Kiln used and name every read it could not make, never derive a fact from a failed read, give the setup panel every message and state Documents found's fields carry, and say on each starting point's line whether it is behind the base branch's plan.

## Acceptance criteria covered
AC-FACTS-01 (completes it; owned by phase 1), AC-FACTS-03 (completes it; owned by phase 1), AC-SETUP-01 (completes it; owned by phase 2), AC-SETUP-03 (completes it; owned by phase 2)

## What the audit found missing
- **AC-FACTS-01:** `factRows` in `view/src/lib/folder-missing.ts` drops the branch row's in-base result whenever the base was read in the shared checkout (`localBase`), so when the feature tip is not in that base (`featureBranch.inBase === false`, which `readPlans` uses as `workNotInBase` to label the saved plan) the page neither shows "N commits not in <base>" nor names it as unchecked.
- **AC-FACTS-03:** `readRepository` in `src/engine/folder-facts.ts` sets `tip = localSha ?? originSha` without checking `reads.localRead`, so when the shared checkout's branch read fails and origin has the branch, `featureBranch.inBase`, `notInBaseCount`, `workNotInBase`, the saved-plan label and `branchOnly` (`readPlans`) are all derived from origin's tip instead of withheld (the design's dependency table withholds the feature tip), and `factRows` says "Only on origin" beside a row saying the checkout's branch couldn't be checked.
- **AC-FACTS-03:** `readPlans` in `src/engine/folder-facts.ts` swallows a failed feature-plan read when the run's work is in the base branch (the pre-read at the `if (prd.tip)` line) and adds nothing to `facts.unknown`; only `branchStart`'s card line names it, so when `buildPanel` (`src/engine/folder-setup.ts`) blocks the panel with the generic `blockedReason` (base start unavailable for a known reason, existing branch withheld) the page names the failed read nowhere.
- **AC-SETUP-01:** `view/src/components/FolderSetupPanel.svelte` lacks parts of Documents found's fields (`view/src/screens/DocumentsFound.svelte`): `settings.keepAwakeError` under the keep-awake switch; `settings.readinessErrors` after "Listed models do not guarantee account access."; a notice when a model change resets the effort (`Engine.folderChange` in `src/engine/engine.ts` resets it silently; Documents found shows `choiceNotice`); the Codex `AccountPanel` under Effort for a Codex run; "Refresh agent information" disabled while `settings.metadataPending` or `billing.pending`; and the "Added in Phase N" tag on a session-added repository row (`PanelRepository` in `src/engine/folder-setup.ts` carries no `addedInPhase`).
- **AC-SETUP-03:** `branchStart` in `src/engine/folder-setup.ts` computes `behindBase` but neither its choice `line` nor `FolderSetupPanel.svelte` says it; "behind" appears only in `preview.caution`, shown for the selected start, so when the base branch is selected (the merged case) the existing-branch choice never says it is behind the base branch's plan. The PRD's wording governs; the mockup's caution for the selected start stays.

## Phase dependencies
1 (the facts and the page); 2 (the setup panel); 3 (its completion of these criteria).
