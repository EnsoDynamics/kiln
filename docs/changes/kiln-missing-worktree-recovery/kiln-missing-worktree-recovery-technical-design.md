# Technical Design: Kiln Missing Worktree Recovery

**PRD:** [Kiln Missing Worktree Recovery](kiln-missing-worktree-recovery-prd.md) · **Assumptions:** [WTR-001, WTR-003](kiln-missing-worktree-recovery-assumptions.md) · **Screens:** [Folder missing mockup](mockups/kiln-missing-worktree-recovery.html)

## Overview

An unfinished run now checks, at every entry point, that each repository's saved folder is still the run's worktree. When one is not, the engine enters a **Folder missing** mode that is computed, never saved: no phase state is shown or judged, no session launches, and the only actions are **Check again** and the setup panel's **Start**. The page shows read-only facts gathered from the shared checkouts and origin, and a setup panel built from Documents found's fields with recovery defaults. Start rechecks everything it showed, then either:

- **from the base branch:** sets up a new feature branch and folder and activates a fresh execution through the activation core continuations already use, the unfinished execution kept as history; or
- **from the existing feature branch:** re-creates the missing worktrees on that branch, clearing git's stale record of the saved folder where AC-SAFE-04 allows, and resumes the same execution as an explicit Resume.

WTR-001 (no discard choice) and WTR-003 (Start may clear the one stale record) are designed as stated. WTR-004 is settled below (§Resuming a session in a new folder).

## Existing Code

**Posture: Preserve.** Kiln is released; everything below keeps today's behavior outside the Folder missing mode.

- **Reused:** `listWorktrees`, `originBranches`, `localBranchCommit` and the objects-only fetch (`git-reads.ts`, `worktree-setup.ts`); `observeGitPlan` and `remoteBase` for reading a plan from Git objects (`completed-plan-sources.ts`); the path, workspace and branch-name checks and `addEntryWorktree`; `defaultSettings` for AC-START-07's layout.
- **Extracted and shared:** the activation core inside `prepareContinuation` (`engine.ts`): archive the old record with `retainExecution`, append its `ExecutionSummary`, assemble and save the new record, rotate the control epoch and the command journal's execution, rebind aliases and legacy sessions, cache the inspection snapshot. Today it is inline and reads a `ContinuationAcceptance` and `old.completedAt!`; it becomes one function taking the archive row, the new record's settings, repositories, baseline, completions and carried state, called by continuation activation unchanged and by a base-branch start.
- **Reused:** the external-completion accounting of `completed-plan-accounting.ts`.
- **Reused:** the Documents found settings components, field wording and help text, and the existing done check and restart decision for the existing-branch start.
- **Kept:** completed runs (AC-FIND-02) and runs whose setup never finished (`finishSetup`) are untouched; the folder check applies only to repository entries with `setupCompletedAt`.
- **Kept:** Kiln's Git limits. The only new Git writes are those Start performs: `worktree add`, `branch` creation (with its `branch.<name>.remote` and `.merge` config when only origin has the branch), and the one `worktree remove` of AC-SAFE-04.
- **Kept:** the Codex rule that a Codex conversation resumes only in its recorded working directory.

## Architecture

No new process, service or watcher. The engine owns the folder check, the facts, the panel draft and Start, under its existing command journal and instance lock. Folder missing is derived from disk and Git each time it is checked and is never written to the record, so a restart reaches the same answer and AC-SAFE-01's "showing only reads" holds by construction. The browser page is a new screen of the existing Svelte view, selected by a new feature state.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where Folder missing lives | Computed in memory (`FolderCheck`), recomputed at each entry point; nothing persisted | AC-SAFE-01 forbids writes before Start; a saved flag could also go stale the same way the saved plan did |
| The "run's worktree" predicate | Folder exists, `rev-parse --show-toplevel` is that folder, its common Git directory is the shared checkout's, and `worktree list --porcelain` has an entry at the path without `prunable`; paths compared as real paths, as `addEntryWorktree` already compares them | The PRD's Terms, mapped to Git's own facts. `prunable` is git's own stale marker, which AC-SAFE-04 also relies on. Git also marks an entry `prunable` when its path holds a plain folder, so `prunable` alone never means the folder is gone: every use below also requires the path to be absent |
| One gate for every entry point | A single engine guard called before plan reads, progress, completion checks, every hand-back/Verify action, and on the one dispatch path every launch and resume goes through | AC-GONE-01 lists many entry points; one guard at shared chokepoints is the only way none is missed |
| Base-branch start | A fresh execution activated through the shared activation core (Existing Code), with names and settings from the panel instead of the `-continue-<uuid>` names, and no continuation acceptance or proposal | AC-SETUP-04 says "as a finished run's accepted continuation does"; one activation core keeps archive, control-epoch and alias handling identical, while the continuation offer's proposal and prerequisite checks do not apply to an unfinished run |
| Remaining plan for a base-branch start | Its own rule, not the continuation classifier: unfinished leaves of the base plan run; leaves this run completed but not closed there run again (named per AC-SAFE-02); leaves closed there but not by this run go through external-completion accounting | The continuation classifier treats a reopened earlier phase as unresolved earlier work and blocks; AC-SAFE-02 instead asks for it to be named and run again |
| What carries into the fresh execution | Panel settings, agent, development authorization (early-merge grants), pending pause request (`pause.requestedAt`), `pendingContinuationAuthority` | AC-SAFE-03; continuation activation sets the authorization to `restrictedAuthorization()` and `pause` to `{}`, so a base-branch start passes these through explicitly. Billing state is bound to its execution (`newBillingState(executionId)`; an approval names its `executionId`), so the fresh execution starts a new one: no metered approval carries over and the billing check runs again before its first launch, which keeps the restriction rather than widening it |
| Existing-branch start | Same execution; only the failing repositories' entries change; then the normal restart decision runs as an explicit Resume | AC-SETUP-05 keeps the execution and its stop state |
| Clearing the stale record | `git worktree remove <saved path>` for that one entry, only when it is still listed `prunable` and the path is still absent, rechecked immediately before | Verified on git 2.50: `remove` on a prunable entry clears that entry alone; `prune` would clear every stale record (AC-SAFE-04 forbids) and `add -f` would skip git's other checks (WTR-003) |
| Panel edits | Held as one in-memory draft in the engine, sent with each change; validated server-side with the Documents found field checks | AC-SAFE-01 forbids writing settings before Start; server-side checks keep one source of field wording |
| Start's safety | A durable start intent sidecar written before the first Git write; each step recognizes its own completed effect | AC-SAFE-01's "the next Start does only what is still missing"; the same owned-artifact pattern as continuation setup |
| Suffix for the base-branch start | One `n ≥ 2` shared by branch and folder: the smallest for which `<stem>-<n>` exists as a branch in no repository (local or origin) and `.worktrees/<PRD folder>-<n>` is missing or empty | AC-SETUP-02's "next free numeric suffix"; one number keeps branch and folder recognizably paired |

## The Folder Check (AC-GONE-01)

For each repository entry with `setupCompletedAt`, Kiln classifies the saved folder (`expandHome(entry.worktreePath)`):

| Classification | Predicate |
|---|---|
| **The run's worktree** | the predicate in Design Decisions holds |
| **Missing** | `lstat` reports nothing at the path |
| **Holds something else** | something is at the path and the predicate fails; the fact names what it is: a plain folder, a file, another repository's checkout, or a checkout of this repository that git does not list as a worktree |
| **Couldn't check** | a Git or file read failed; treated as failing, with the read named per AC-FACTS-03 |

`listWorktrees` gains the `prunable` field from the porcelain output. A branch switch or detached HEAD inside the run's worktree passes this check and is left to the done check.

The guard runs: in `prepare()` before `readPlan()`; in `decide()` before any judgement; at snapshot rebuild after a page open or reload (as an awaited check, published through SSE); before every Verify, Mark complete, Check again, Resume, reply and continue command, from the browser or the control route; and on the dispatch path before every launch or resume, including usage-limit and audit sessions. A failing guard sets the engine's `folderMissing` and returns without acting; commands return `folder_missing` (409) with the reason. A session already running when its folder disappears is not stopped; its end is judged only after recovery (AC-SETUP-05's done check).

## Folder Missing (AC-GONE-02, AC-GONE-03)

While `folderMissing` is set, the snapshot's `feature.state` is `folder_missing`, and it carries the `folderMissing` block (§Interfaces) instead of a current phase or activity. Phase rows keep their recorded facts, shown only in the run's history list with each result's `checkedAt` or `doneAt`; nothing presents them as current. No restart review, wait watcher, takeover timer or dispatch starts.

`kiln run` prints, then serves the page and waits:

```
Folder missing · nothing has run
This run's folder no longer exists:
  <saved folder>  missing                      (one line per failing repository; "holds something else" when so)
The plan on <origin/develop or develop> (<short sha>) has <n> phases, <d> done. Kiln's saved plan is <label>.
Set the run up again: <page address>
```

The summary line and ● line are not printed. When the plan read failed, the plan line names what couldn't be read and the label is `not compared`.

## The Facts (AC-FACTS-01, 02, 03)

All reads are read-only toward checkouts, branches, remotes and the record. Objects-only fetches (`--no-write-fetch-head --refmap=`, writing no ref) bring a remote commit's objects into the shared checkout when a comparison needs them, as completed-feature discovery already does. Reads run per repository in parallel, bounded by the existing 120-second reconciliation deadline, and are cancelled on shutdown.

Per repository:

| Fact | Source |
|---|---|
| Checked at | the check's own time |
| Saved folder, branch, set up date, state | `entry.worktreePath`, `settings.featureBranch`, `entry.setupCompletedAt`, the folder check |
| Git still records a worktree there | the `worktree list` entry at the saved path, with `prunable` |
| Feature branch, local and on origin | `localBranchCommit`, `originBranches`; commit dates by `log -1 --format=%cI`. When both exist and differ: `rev-list --left-right --count` gives ahead, behind or diverged |
| Already in the base branch | `merge-base --is-ancestor <feature tip> <base commit>`, the base commit as AC-FACTS-02 selects it. Exit 0 is yes, exit 1 is no, any other exit is a failed read (AC-FACTS-03); the existing `isAncestor` returns false for every non-zero exit, so the facts use a read that keeps the three apart. The same applies to every other ancestry fact below |
| Checked out in another folder | a `worktree list` entry with the feature branch at a path that exists on disk and is not the run's worktree; a missing saved folder's record does not count |
| Last pushed commit | the `pushedSha` with the latest `doneAt` among this repository's phase facts; then whether it is an ancestor of origin's feature tip and of the base commit |

**The plans (AC-FACTS-02).** The base commit is origin's base tip when `ls-remote` succeeds, else the shared checkout's own `refs/heads/<base>`; the page names which. Kiln reads the base plan with `observeGitPlan` at that commit in the PRD's repository, and the feature plan at the feature tip (the shared checkout's branch, else origin's). "Where the run's latest work lives" is the feature plan when its tip is not an ancestor of the base commit, else the base plan. The saved plan is `record.plan` with its read time (§Data Models). The label is the first row of the PRD's table that applies, comparing leaf ids and closed state; counts use AC-FIND-03's rules. In a multi-repository run the plan is read from the PRD's repository only.

**What can't be checked (AC-FACTS-03).** Every read records success or its error. A failed read names itself on the page, and every value derived from it is withheld: a label becomes **Not compared**, a starting point whose availability or default depends on it is not offered, and the setup panel shows the mockup's "can't suggest where to start yet" body with **Check again**. The two standing statements (uncommitted changes, and unpushed commits when the branch is gone) are always shown.

**Facts identity.** The facts are digested (excluding check times) into a `factsId`. Start submits it, and a different digest at Start means the page is refreshed instead of acting.

## The Setup Panel (AC-SETUP-01, 02, 03, 06, 07)

The panel reuses Documents found's settings components and help text, in AC-SETUP-01's order, with recovery's extra help lines and fixed fields. The refinement confirmation is left out.

**Starting points and defaults.** Exactly AC-SETUP-02's rules, read across repositories (AC-SETUP-07). The existing branch is unavailable, with the PRD's reason, when it is gone in any repository, checked out in another folder, or behind or diverged from origin; in a multi-repository run also when any failing repository's saved folder holds something else. The stem for a base-branch start's branch suffix is the feature branch the run had at its first Start (`branchStem`, §Data Models), so a second base-branch start yields `-3`, not `-2-2`; the folder's suffix goes on the PRD folder name, which the PRD's location already gives.

**Path checks with a stale record.** The worktree-path and workspace-folder checks treat git's `prunable` entry at the saved path as absent when nothing is at that path, since Start removes it first; without this, re-creating the saved folder would fail as "inside a checkout". An entry whose path holds a folder is never treated as absent.

**The draft.** The engine holds one panel draft per PRD in memory, starting from the run's saved settings plus the defaults. Each change is posted; the engine reruns the field checks and the preview and publishes them. A restart starts the draft afresh. Fixed fields are rejected if changed.

**What will run (AC-SETUP-03, AC-SAFE-02).** For the selected starting point, the preview is derived from that start's plan:

- **Base branch:** leaves closed there and completed by this run are carried. Leaves closed there but not by this run go through the existing external-completion accounting; a leaf that does not verify blocks this starting point with the accounting's problem shown. Every other leaf runs, in plan order. Leaves this run completed that are not closed there are listed as running again.
- **Existing branch:** the feature plan's closed leaves are done; the rest run. A behind-base caution compares this plan's leaves with the base plan's.

Each starting point's one-line summary, Start's label (`Set up & start Phase <id>`, or `Set up & check Phase <id> again` when the first leaf is closed on the branch and only its done check would run) and the Starting lets Kiln list come from the same preview. The list includes "Clear git's record of the missing folder <path>" exactly when Start will do it. The preview is digested into a `previewId`.

**Put it back yourself (AC-SETUP-06).** When the existing branch is an available starting point and a saved folder is missing, the page shows `git -C <shared checkout> worktree add -f <saved folder> <branch>` per missing folder. It works while git still records the folder (checked on git 2.50, leaving one record). When only origin has the branch, the command is preceded by `git -C <shared checkout> fetch origin <branch>`: without a local or remote-tracking ref, `worktree add` fails with "invalid reference", and after the fetch it creates the local branch tracking origin's (checked on git 2.50). Otherwise no command is shown.

## Start (AC-SETUP-04, 05, AC-SAFE-01 to 04)

`POST /api/folder-setup/start` carries the draft, `factsId` and `previewId`, under the command journal like continuation acceptance. Kiln reruns the folder check, the facts and the preview. If every folder now passes, Folder missing ends and Start does nothing. A different `factsId` or `previewId` returns `folder_setup_changed`, and the refreshed page is published. Otherwise Kiln writes a **start intent** sidecar (§Data Models) before any Git write, then does the steps below. Each step first checks whether its effect already exists as the intent describes; a step that fails leaves the intent with what was done and what remains, and the page shows both. The run's record changes only in the final step.

**From the base branch (AC-SETUP-04).**

1. Per repository, confirm the new branch name exists nowhere; then `addEntryWorktree` creates the branch at the base commit the page showed and the folder as its worktree. In a multi-repository run each repository uses its own base (AC-SETUP-07).
2. Activate the fresh execution through the shared activation core. The old record is archived with ending `folder_missing_setup` and `endedAt` the activation time. The new record takes the panel's settings and the carried state (Design Decisions), a baseline of the start's plan, and the completions the preview carried. It keeps the run's `branchStem`. As a continuation acceptance does, Start enables the command journal's execution index before activation, and the record's `continuation` state is created if absent, with no acceptance row (§Data Models). Later `kiln run`s use the new branch and folder because they are now the record's settings.
3. The engine loop starts the first leaf, as after a continuation's activation.

**From the existing feature branch (AC-SETUP-05).**

1. When only origin has the branch, bring origin's tip in with the objects-only fetch, create the shared checkout's branch there with `git branch --no-track <branch> <sha>`, then set `branch.<branch>.remote` to `origin` and `branch.<branch>.merge` to `refs/heads/<branch>`. `--track` and `branch -u` need a remote-tracking ref, which the objects-only fetch never writes (checked on git 2.50: `branch -u` fails with "the requested upstream branch does not exist").
2. When git records the missing saved folder and that record blocks the add (same path, or the branch is recorded there), recheck that the entry is still `prunable` and the path still absent, then `git worktree remove <saved folder>` (AC-SAFE-04).
3. `git worktree add <folder> <branch>`, for the failing repositories only. This step counts as done only when the folder check's predicate holds for the folder. `addEntryWorktree`'s own completion test (a `worktree list` entry at the path on the branch) also matches a `prunable` record, so it is not used here.
4. Save: the changed entries' `worktreePath`, `settings.worktreePath` when the folder was suffixed, `setupCompletedAt`, and the panel's editable settings.
5. Run the restart decision with the review released, as an explicit Resume: plan read in the new worktree, the done check for the stopped phase, then Needs you, resume or launch exactly as `decide()` does today.

**Resuming a session in a new folder (WTR-004).** Only the single-repository "holds something else" case moves a session's folder; the saved-path re-creation and the multi-repository workspace keep it. Verified with Claude Code 2.1.319: `claude -p --resume <id>` run in a different folder resumes the conversation and appends to the original transcript, which Kiln already finds by session ID across `~/.claude/projects/*`. Codex is different by Kiln's own rule: a Codex conversation resumes only in its recorded working directory. So when an interrupted Codex session's recorded folder differs from the new worktree, `decide()` treats it as not resumable and sends the phase to Needs you with AC-KEEP-05's fresh-session wording, rather than raising the guard's error. The multi-repository Stayed check never sees a moved folder, since that case keeps its workspace.

## Interfaces

### HTTP (same-origin, token, as today)

| Route | Body | Result |
|---|---|---|
| `POST /api/folder-setup/check` | none | Reruns the folder check and facts (Check again); returns the snapshot's `folderMissing`, or leaves the mode |
| `POST /api/folder-setup/panel` | `{ start: "base" \| "branch", fields: { worktreePath?, workspaceFolder?, featureBranch?, baseBranch?, bases?, model?, effort?, keepAwake?, resumeAfterUsageLimit? } }` | `{ panel }` with field errors and the preview; also published by SSE |
| `POST /api/folder-setup/start` | `{ commandId, factsId, previewId, start, fields }` | `{ ok: true }` · `folder_setup_changed` (409) · `folder_missing_check_failed` (503) · a step's error with `done[]` and `remaining[]` (500) |

Every other mutating route and control action returns `folder_missing` (409) while the mode is set.

### Snapshot

```
feature.state: ... | "folder_missing"

folderMissing: {
  checkedAt: string
  repositories: [{
    name, savedFolder, branch, setUpAt,
    state: "missing" | "holds_something_else" | "in_place" | "unknown",
    holds?: string,                          // what is there instead
    gitRecord?: "listed" | "none",           // for the saved folder
    featureBranch: { local?: Commit, origin?: Commit, relation?: "same" | "ahead" | "behind" | "diverged",
                     inBase?: boolean, notInBaseCount?: number, elsewhere?: string },
    lastPushed?: { sha, phaseId, onOrigin?: boolean, inBase?: boolean },
    unknown: string[]                        // reads that failed, worded for the page
  }]
  plans: {
    saved: { total, done, readAt?, label: "out_of_date" | "matches_branch" | "matches_base" | "ahead" | "not_compared", aheadPhases?: string[] },
    base:  { source: "origin" | "local", branch, sha, total, closed, next?: { id, title } } | { error: string }
  }
  restoreCommands: string[]                  // AC-SETUP-06; empty when none is offered
  panel: SetupPanel | { blocked: string }    // blocked: AC-FACTS-03's "can't suggest where to start"
  factsId: string
  startProgress?: { done: string[], remaining: string[], error: string }
}

SetupPanel: {
  suggested: "base" | "branch", selected: "base" | "branch",
  choices: { base: StartChoice, branch: StartChoice | { unavailable: string } },
  fields: <Documents found's settings shape>, fixed: string[], fieldErrors, helpLines,
  preview: { done: string[], run: { id, title }[], again: string[], caution?: string, startLabel: string, lets: string[] },
  previewId: string
}
StartChoice: { sha, total, done, holdsAllWork: boolean, behindBase: boolean }
Commit: { sha, date }
```

### Terminal

The `kiln run` lines in §Folder Missing, replacing the underway summary for this state only.

## Data Models

Schema version 20.

- **`PrdRecord.planReadAt?: string`**: written with every successful write of `record.plan`. For records from earlier schemas, the saved plan's date is the accepted `planReconciliation.check.attemptedAt`, the last time Kiln accepted that plan.
- **`PrdRecord.branchStem?: string`**: the feature branch at the first Start; set when a base-branch start activates a fresh execution, carried to every later one, and read in place of `settings.featureBranch` when present. The folder needs no stem: its suffix goes on the PRD folder name, derived from `prdDirectory`.
- **`ExecutionSummary`**: `completedAt` becomes optional; add `endedAt: string` and `ending: "completed" | "folder_missing_setup"`. Existing summaries read as `ending: "completed"`, `endedAt = completedAt`. Archive validation (`readExecution`, `assertContinuationState`) compares `endedAt` and `ending`, not only `completedAt`.
- **`ContinuationState.currentAcceptanceId`** becomes optional, required only when `acceptances` is non-empty: a base-branch start on a run that never continued creates the state with an empty `acceptances` list and its archived execution in `executions`. Today's validation requires `currentAcceptanceId` to name an acceptance.
- **Start intent, `folder-setup-starts/<command id>.json`** (private, durable, like continuation acceptances):

```
FolderSetupStart:
  formatVersion: 1
  id, commandId, executionId: string          // the unfinished execution
  kind: "base" | "branch"
  factsId, previewId: string
  createdAt: string
  settings: AgentSettings                     // the panel's, as Start will save them
  repositories: [{ name, mainCheckoutPath, baseBranch, baseCommit?, branch, worktreePath,
                   createLocalFromOrigin?: sha, clearStaleRecord?: path }]
  steps: [{ name, state: "pending" | "done" | "failed", error? }]
  state: "in_progress" | "failed" | "activated" | "resumed"
  newExecutionId?: string                     // base starts
```

A Start is resumable only by the same kind and names; a draft that changes kind or names after a partial failure starts a new intent, and Start refuses while the earlier one holds an artifact the new one would collide with.

## Changes to Earlier Designs

Each pointer is added under the named heading when this change is built.

- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does (an unfinished run checks its folders before reading the plan and reports Folder missing, not progress).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (a later `kiln run` may create a second branch and worktree, or a new worktree on the run's existing branch and its local branch from origin).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Active execution handback (a missing assigned worktree is Folder missing, not an unreadable active plan, and its plan is read read-only outside the worktree).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Implemented integrated-prerequisite continuation (Phase 3a) (the activation core is shared with a base-branch start from an unfinished execution, which brings panel names and carried state and no acceptance).
- Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Workspace (a recovery re-creates missing worktrees in the saved workspace, or sets up a new workspace and branch).

## Integration Points

- Git in each repository's shared checkout and origin (`ls-remote`, objects-only fetch, `worktree list/add/remove`, `branch`).
- Claude Code and Codex session resume, unchanged apart from §Resuming a session in a new folder.
- The browser view and SSE; the control route, which refuses actions while the mode is set.

## Criteria Coverage

| Criteria | Section |
|---|---|
| AC-GONE-01 | The Folder Check |
| AC-GONE-02, 03 | Folder Missing |
| AC-FACTS-01, 02, 03 | The Facts |
| AC-SETUP-01, 02, 03, 06, 07 | The Setup Panel |
| AC-SETUP-04, 05 | Start |
| AC-SAFE-01 | Architecture; Start (recheck, intent, final save) |
| AC-SAFE-02 | The Setup Panel, What will run |
| AC-SAFE-03 | Design Decisions (carried authority); Start |
| AC-SAFE-04 | Design Decisions (clearing the stale record); Start step 2 |
| AC-LOOK-01 | The Setup Panel (Documents found's components); Folder Missing (terminal) |

## Open Questions

1. **Can the 2026-11-06 case start from the base branch?** In that run, phases 6 to 9 were added and closed on `develop` after the run last read its plan, so this execution holds no receipt for them. AC-SETUP-04 accepts them only under the existing external-completion rules, which need a retained Kiln receipt or an `## External completion evidence` entry. Without one, the base-branch start is blocked with the accounting's problem, while the mockup shows "Set up & start Phase 10". The design follows the PRD's rule. Waivers (AC-WAIVE-02 in Kiln Completion Waivers) are no way through either: they are offered only at a stopped activity after a failed recheck, and the setup panel is not one. Should the build find these phases unverified for that run, it is a PRD question, not a design one.
