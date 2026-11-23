# Phase 7: Keep the search below the home folder, name a repository set up alone by its short name, and show the label in the last places

**Closed:** 2026-11-23

**Added by delivery audit:** 2026-11-23, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "The search", "Worktree Folders and Labels", "A continuation and a base-branch start", "Screens"
**Model tier:** standard

## Summary
The search never climbs above the home folder, even from a PRD's repository kept outside it. A continuation or a base-branch start on the Folder missing page gives a repository it sets up its short name when the only other repository with that short name is one it leaves out. The last screens and terminal lines that name a repository show its label. `kiln add-repository`'s success lines match the drawing.

## Acceptance criteria covered
AC-FIND-01 (completes it; owned by phase 1), AC-FOLDER-01 (completes it; owned by phase 1), AC-FOLDER-02 (completes it; owned by phase 1), AC-SEE-05 (completes it; owned by phase 2)

## What the audit found missing
- **AC-FIND-01:** `searchRoots` (`src/engine/repository-search.ts`) climbs two folders above a PRD's repository outside the home folder. It stops only at the top of a disk or at a device change. For a PRD at `/home/shared/product` with home `/home/me`, the roots are `/home/shared` and `/home`. `/home` is above the home folder, and walking it reaches the home folder and other people's folders. The outside-home climb should stop before a folder that holds the home folder.
- **AC-FOLDER-01:** `resolvePlanRepositories` (`src/engine/plan-repositories.ts`) passes every resolved repository to `giveNames`, a row that ends in a question included. A continuation (`src/engine/continuation-readiness.ts`, the loop over the plan's names, through `reachRecordNames`/`reachedName`) and the Folder missing page's base-branch start (`src/engine/folder-setup.ts`, the loop over `written`) both leave such a row out, and it is set up later. So a found `acme/admin`, set up beside a left-out `other/admin`, gets the folder `acme+admin` instead of its free short name `admin`. Only repositories set up together should be weighed against each other.
- **AC-FOLDER-02:** these places show Kiln's name, or the name the plan writes, instead of the label:
  - Earlier deliveries: `view/src/components/ExecutionHistory.svelte` prints `{delivery.repository} · Earlier delivery`. `executionDeliveries` (`src/engine/continuation-state.ts`) records Kiln's name, and `snapshot.ts` passes `continuation.executions[].deliveries` through unlabelled.
  - The continuation's preparation line: `view/src/components/CompletedPlanCheck.svelte` prints "integrate Phase … in {preparation.repository}". `labelledPlanCheck` (`src/engine/snapshot.ts`) labels `result.leaves` but not `result.proposal.preparation[]`.
  - The waive preview in `kiln status` and the `waive-and-advance` preview receipt: `previewLines` (`src/control/waiver-facts.ts`) prints `item.subject` raw for `repository_work` items, where `itemName` labels it.
  - The changed-results receipt of `waive-and-advance`: `receiptLines` (`src/control/waiver-facts.ts`, the `check_results_changed` case) prints `${c.check} · ${c.subject}` raw for repository work.
- **AC-SEE-05:** the drawing of a session's request (mockup, "A session asks for a repository by its address path") shows two lines: "Added notifications at ~/code/acme/.worktrees/customer-returns/notifications, on feature/customer-returns from main." and then "Read its CLAUDE.md and AGENTS.md, if it has them, before you change it." `src/add-repository-command.ts` writes them as one line. The path is absolute, because the engine's add-repository answers return `expandHome(entry.worktreePath)` (`src/engine/engine.ts`), not the `~/` display form.

## Phase dependencies
1 (the search and folder names), 2 (`kiln add-repository`), 3, 5 and 6 (the label plumbing this extends)
