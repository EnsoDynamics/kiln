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
- **Extracted and shared:** the activation core inside `prepareContinuation` (`engine.ts`): archive the old record with `retainExecution`, append its `ExecutionSummary`, assemble and save the new record, rotate the control epoch and the command journal's execution, rebind aliases and legacy sessions, cache the inspection snapshot. Today it is inline and reads a `ContinuationAcceptance` and `old.completedAt!`; it becomes one function taking the archive row, the new record's settings, repositories, baseline, completions and carried state, called by continuation activation unchanged and by a base-branch start. Likewise the preparation binding inside `evaluateContinuationReadiness` (`continuation-readiness.ts`) becomes one function, used by continuation readiness and by a base-branch start's preview and Start.
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
| Remaining plan for a base-branch start | Its own rule, not the continuation classifier: every leaf closed in the base plan is done, whoever closed it; unfinished leaves run in plan order; leaves this run completed but not closed there run again (named per AC-SAFE-02) | The continuation classifier treats a reopened earlier phase as unresolved earlier work and blocks; AC-SAFE-02 instead asks for it to be named and run again |
| What carries into the fresh execution | Panel settings, agent, development authorization (early-merge grants), pending pause request (`pause.requestedAt`), `pendingContinuationAuthority`; a takeover hold (`liveControl.takeover`) does not carry | AC-SAFE-03; continuation activation sets the authorization to `restrictedAuthorization()` and `pause` to `{}`, so a base-branch start passes these through explicitly. Billing state is bound to its execution (`newBillingState(executionId)`; an approval names its `executionId`), so the fresh execution starts a new one: no metered approval carries over and the billing check runs again before its first launch, which keeps the restriction rather than widening it. Carrying the early-merge grants goes the opposite way to Continue Added Phases AC-CONTINUE-09, where a continuation starts restricted, because AC-SAFE-03 requires it. Start is the explicit hand-back that ends a takeover hold (AC-SAFE-03): the hold stays with the archived execution, and an existing-branch start releases it as the explicit Resume does, with that Resume's checks |
| Existing-branch start | Same execution; only the failing repositories' entries change; then the normal restart decision runs as an explicit Resume | AC-SETUP-05 keeps the execution and its stop state |
| Clearing the stale record | `git worktree remove <saved path>` for that one entry, only when it is still listed `prunable` and the path is still absent, rechecked immediately before | Verified on git 2.50: `remove` on a prunable entry clears that entry alone; `prune` would clear every stale record (AC-SAFE-04 forbids) and `add -f` would skip git's other checks and, at a new path, leave the branch listed twice (WTR-003) |
| Panel edits | Held as one in-memory draft in the engine, sent with each change; validated server-side with the Documents found field checks | AC-SAFE-01 forbids writing settings before Start; server-side checks keep one source of field wording |
| Start's safety | A durable start intent sidecar written before the first Git write; each step recognizes its own completed effect; a failed intent is resumed by a Start with the same kind and names, or superseded, its artifacts left in place, by one that differs; Start never deletes anything | AC-SAFE-01's "the next Start does only what is still missing"; the same owned-artifact pattern as continuation setup, whose retry keeps its names and whose supersede leaves the earlier setup's artifacts where they are |
| Suffix for the base-branch start | One `n ≥ 2` shared by branch and folder: the smallest for which `<stem>-<n>` exists as a branch in no repository of the start's set (local or origin; §The Setup Panel) and `.worktrees/<PRD folder>-<n>` is missing or empty, or for which both are still a failed start intent's own (§The Setup Panel, The draft) | AC-SETUP-02's "next free numeric suffix"; one number keeps branch and folder recognizably paired |

## The Folder Check (AC-GONE-01)

For each repository entry with `setupCompletedAt`, Kiln classifies the saved folder (`expandHome(entry.worktreePath)`):

| Classification | Predicate |
|---|---|
| **The run's worktree** | the predicate in Design Decisions holds |
| **Missing** | `lstat` reports nothing at the path |
| **Holds something else** | something is at the path and the predicate fails; the fact names what it is: a plain folder, a file, another repository's checkout, or a checkout of this repository that git does not list as a worktree |
| **Couldn't check** | a Git or file read failed; treated as failing, with the read named per AC-FACTS-03 |

`listWorktrees` gains the `prunable` field from the porcelain output. A branch switch or detached HEAD inside the run's worktree passes this check and is left to the done check.

The guard runs: in `prepare()` before `readPlan()`; in `decide()` before any judgement; at snapshot rebuild after a page open or reload (as an awaited check, published through SSE); before every Verify, Mark complete, Check again, Resume, reply and continue command, from the browser or the control route; and on the dispatch path before every launch or resume, including usage-limit and audit sessions. A failing guard sets the engine's `folderMissing` and returns without acting; commands return `folder_missing` (409) with the reason. A session already running when its folder disappears is not stopped; its end is judged only after recovery (AC-SETUP-05's done check). Stopping Kiln in the terminal (`engine.stop`) is not a route and stays available; the live controls (pause request, takeover, message) return `folder_missing`.

The status and handoff projections (`kiln status`, `kiln handoff`) run the same classification, synchronously and within their deadline, whether or not a controller is running; a read that times out is Couldn't check. While any folder fails, status reports `state: "folder_missing"` with the per-repository classifications, no current activity and `stop: null`. Handoff reports `resumable: false` with the reason, and returns `resume_command`, `continuation_prompt` and `fresh_session_instructions` as null. Both name `kiln run <PRD-path>` as the way to set the run up again. A cached `folder_missing` state is not reused: the state comes from the check made at read time.

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
| Checked out in another folder | a `worktree list` entry with the feature branch at a path that exists on disk and is not the run's worktree; a missing saved folder's record does not count; an entry at another absent path is reported separately as the reason in §The Setup Panel |
| Last pushed commit | the `pushedSha` with the latest `doneAt` among this repository's phase facts; then whether it is an ancestor of origin's feature tip and of the base commit |

**The plans (AC-FACTS-02).** The base commit is origin's base tip when `ls-remote` succeeds, else the shared checkout's own `refs/heads/<base>`; the page names which. Kiln reads the base plan with `observeGitPlan` at that commit in the PRD's repository, and the feature plan at the feature tip (the shared checkout's branch, else origin's). "Where the run's latest work lives" is the feature plan when its tip is not an ancestor of the base commit, else the base plan. The saved plan is `record.plan` with its read time (§Data Models). The label is the first row of the PRD's table that applies, comparing leaf ids and closed state; counts use AC-FIND-03's rules. In a multi-repository run the plan is read from the PRD's repository only.

**What can't be checked (AC-FACTS-03).** Every read records success or its error. A failed read names itself on the page, and every value derived from it is withheld: a label becomes **Not compared**. A starting point whose availability, plan or defaults depend on a failed read is not offered. Its card shows "Couldn't check: <read>" in place of its line (`{ unavailable }`). The suggestion is AC-SETUP-02's test (existing branch available **and** has work not in the base branch), read with three values: true, false, or unknown when a failed read decides it. The panel is `{ blocked }`, the mockup's "can't suggest where to start yet" body with **Check again**, in two cases: the test comes out unknown, or the suggested start would itself not be offered. Otherwise the panel shows normally, with the other start withheld if it must be. Dependencies:

| Read fails | Withholds |
|---|---|
| Folder check | the existing-branch start (its folder default: saved path or suffixed) |
| Local branch | existence and divergence, so the existing branch's availability; the feature tip; the base start's suffix |
| Origin branches (`ls-remote`) | existence and behind/diverged, so availability; "has work not in base" unless the local tip already has some; the base start's suffix |
| Ancestry vs base commit | "has work not in base"; the saved-plan label; "holds all work" |
| `worktree list` | "checked out elsewhere" and "recorded at another missing path", so availability; the clear-record line and the restore command |
| Base plan | the base start; the label |
| Feature plan | the existing-branch start; the label when the work lives on the branch |
| Last pushed | its fact row only |

An unreachable origin does not fail the base plan: AC-FACTS-02 reads the shared checkout's own base branch instead. It still fails the origin branches read, which withholds the base start's suffix and leaves the existing branch's availability unknown, so the panel is always blocked. The two standing statements (uncommitted changes, and unpushed commits when the branch is gone) are always shown.

**Facts identity.** The facts are digested (excluding check times) into a `factsId`. Start submits it, and a different digest at Start means the page is refreshed instead of acting.

## The Setup Panel (AC-SETUP-01, 02, 03, 06, 07)

The panel reuses Documents found's settings components and help text, in AC-SETUP-01's order, with recovery's extra help lines and fixed fields. The refinement confirmation is left out.

**Starting points and defaults.** Exactly AC-SETUP-02's rules, read across repositories (AC-SETUP-07). The existing branch is unavailable, with the PRD's reason, when it is gone in any repository, checked out in another folder, recorded by git at another missing path (a `worktree list` entry with the feature branch, marked `prunable`, at a path that is absent and is not the saved folder; the reason names that path and that git still records the branch there), or behind or diverged from origin; in a multi-repository run also when any failing repository's saved folder holds something else. The stem for a base-branch start's branch suffix is the feature branch the run had at its first Start (`branchStem`, §Data Models), so a second base-branch start yields `-3`, not `-2-2`; the folder's suffix goes on the PRD folder name, which the PRD's location already gives.

**Repositories for a base-branch start.** A base-branch start sets up the repositories a continuation would. These are the PRD's repository and every repository the base plan names. A repository the run already has keeps its saved entry and base. A newly named one is found with `findRepository`, and its base is `settings.bases[name]`, else origin's default. A repository a session added that the base plan does not name is left out. Its branch and folder are untouched. Each repository's base is editable, and its base commit is origin's tip, read as for AC-FACTS-02. A repository that cannot be found, has no base, or has the wrong origin is shown in the Repositories list with the continuation's problem text. The base-branch start is then unavailable until **Check again** passes. When the set has more than one repository, the panel shows **Workspace folder** and **Repositories**, even if the run had one. AC-FACTS-01 describes the run's current repositories. A newly named repository appears only in the Repositories list. A repository being left out is listed as such. The suffix search (Design Decisions) checks the new branch name in every repository of the start's set.

**Path checks with a stale record.** The worktree-path and workspace-folder checks treat git's `prunable` entry at the saved path as absent when nothing is at that path, since Start removes it first; without this, re-creating the saved folder would fail as "inside a checkout". An entry whose path holds a folder is never treated as absent.

**The draft.** The engine holds one panel draft per PRD in memory, starting from the run's saved settings plus the defaults. Each change is posted; the engine reruns the field checks and the preview and publishes them. While the unfinished execution has a start intent in state `failed`, the draft starts from that intent's kind, names and settings, including after a restart; an intent found `in_progress` at startup is treated as `failed`. The suffix search counts the intent's own branch and folder as free when they are still its own: the branch is at the intent's base commit, and the folder is a clean worktree on that branch at that commit (continuation setup's `validatePreparedWorkspace` test). So a resumed base-branch start keeps `-2`. Fixed fields are rejected if changed. When the start has a single repository, a draft whose folder is suffixed sets `workspaceFolder` to `.worktrees/<PRD folder>-<n>`, even when the person edits the worktree path, as `defaultSettings` keeps the default workspace folder for an edited worktree. The field stays fixed.

**What will run (AC-SETUP-03, AC-SAFE-02).** For the selected starting point, the preview is derived from that start's plan:

- **Base branch:** every leaf closed there is done, whoever closed it; a Closed line in the base branch is enough (AC-SETUP-04), so no external-completion evidence is asked for. Every other leaf runs, in plan order. Leaves this run completed that are not closed there are listed as running again. Work this run committed in a repository being left out, and not in that repository's base, is named with its phases. It stays on that repository's feature branch.
- **Existing branch:** the feature plan's closed leaves are done; the rest run. A behind-base caution compares this plan's leaves with the base plan's.

When the base-branch preview has nothing to run and nothing to run again, the base-branch choice is unavailable, with the reason "Every phase is already closed on `<base>`; there is nothing to start." It gets no Start label. The existing-branch choice follows its normal rules. When neither choice is available, the panel offers only **Check again** (WTR-001: no discard).

Each starting point's one-line summary, Start's label (`Set up & start Phase <id>` with the first leaf that runs, or, for an existing-branch start whose stopped phase is closed on the branch so only its done check would run, `Set up & check Phase <id> again` with the phase the run stopped on, per AC-SETUP-05) and the Starting lets Kiln list come from the same preview. The list includes "Clear git's record of the missing folder <path>" exactly when Start will do it, and a line saying Start ends the terminal takeover exactly when the run holds one (`record.liveControl.takeover`). The preview is digested into a `previewId`.

**Put it back yourself (AC-SETUP-06).** When the existing branch is an available starting point and a saved folder is missing, the page shows `git -C <shared checkout> worktree add -f <saved folder> <branch>` per missing folder. It works while git still records the folder (checked on git 2.50, leaving one record). When only origin has the branch, the command is preceded by `git -C <shared checkout> fetch origin <branch>`: without a local or remote-tracking ref, `worktree add` fails with "invalid reference", and after the fetch it creates the local branch tracking origin's (checked on git 2.50). Otherwise no command is shown.

## Start (AC-SETUP-04, 05, AC-SAFE-01 to 04)

`POST /api/folder-setup/start` carries the draft, `factsId` and `previewId`, under the command journal like continuation acceptance. Kiln reruns the folder check, the facts and the preview. While a session process of this run is still live, Start returns `busy` (409) and does nothing: that is Kiln's own (`current.processRunning` or the engine loop running), or one left from an earlier Kiln (the latest session's last run has no `endedAt` and its process, or Codex's tracked processes, is still live). The page says the session is still running and that Start becomes available when it ends, or when Kiln is stopped in the terminal. When the process ends, the loop records the run's end, judges nothing, clears `current` and ends, so the next Start proceeds. If every folder now passes, Folder missing ends and Start does nothing. A different `factsId` or `previewId` returns `folder_setup_changed`, and the refreshed page is published. Otherwise Kiln writes a **start intent** sidecar (§Data Models) before any Git write, then does the steps below. Each step first checks whether its effect already exists as the intent describes; a step that fails leaves the intent with what was done and what remains, and the page shows both. The run's record changes only in the final step. After a failed Start, the page is republished with the facts and preview recomputed, so the next Start compares against that page and the intent's own completed steps never cause `folder_setup_changed`. A step already done is not listed again in Starting lets Kiln.

**From the base branch (AC-SETUP-04).**

1. Per repository in the start's set (§The Setup Panel), confirm the new branch name exists nowhere; then `addEntryWorktree` creates the branch at the base commit the page showed and the folder as its worktree. In a multi-repository run each repository uses its own base (AC-SETUP-07).
2. Read the plan in the PRD's repository's new worktree. Its digest must equal the plan the preview was built from, as continuation activation's `candidateDigest` check requires; on a mismatch Start returns `folder_setup_changed` and the refreshed page is published.
3. **Preparation.** Start computes the first leaf's preparation exactly as continuation readiness does. The binding part of `evaluateContinuationReadiness` (extraction, source and revision pinning, repository identity, base, prerequisite scope, destination and check validation) is extracted into one function, used by both. The preview runs it too, so any problem it reports is a preview problem, and the base-branch start is unavailable until **Check again** passes. When it yields bindings, the new record's `preparation` is `newPreparationState`'s shape, with `phaseId` the first leaf and `proposalId` the start's `previewId` (a 64-hex digest).
4. Activate the fresh execution through the shared activation core. The old record is archived with ending `folder_missing_setup` and `endedAt` the activation time. The new record takes the panel's settings and the carried state (Design Decisions), a baseline of the start's plan, the completions the preview carried, and the preparation from step 3. It keeps the run's `branchStem`. As a continuation acceptance does, Start enables the command journal's execution index before activation, and the record's `continuation` state is created if absent, with no acceptance row (§Data Models). Later `kiln run`s use the new branch and folder because they are now the record's settings.
5. The engine loop handles that preparation and starts the first leaf, as after a continuation's activation (AC-CONTINUE-07). The startup delivery check (the `engine.ts` recovery loop) treats a base-branch execution like one with an active acceptance: carried completions and prepared leaves are not delivery-checked again.

**From the existing feature branch (AC-SETUP-05).** The run's repositories are unchanged. Only failing entries are re-created.

1. When only origin has the branch, bring origin's tip in with the objects-only fetch, create the shared checkout's branch there with `git branch --no-track <branch> <sha>`, then set `branch.<branch>.remote` to `origin` and `branch.<branch>.merge` to `refs/heads/<branch>`. `--track` and `branch -u` need a remote-tracking ref, which the objects-only fetch never writes (checked on git 2.50: `branch -u` fails with "the requested upstream branch does not exist").
2. When git records the missing saved folder and that record blocks the add (same path, or the branch is recorded there), recheck that the entry is still `prunable` and the path still absent, then `git worktree remove <saved folder>` (AC-SAFE-04).
3. `git worktree add <folder> <branch>`, for the failing repositories only. This step counts as done only when the folder check's predicate holds for the folder. `addEntryWorktree`'s own completion test (a `worktree list` entry at the path on the branch) also matches a `prunable` record, so it is not used here.
4. Save: the changed entries' `worktreePath`, `setupCompletedAt` and the panel's editable settings, and, when the folder moved, the session records' `workingDirectory` (§Resuming a session in a new folder). When the folder was suffixed, also save `settings.worktreePath` and `settings.workspaceFolder` = `.worktrees/<PRD folder>-<n>` beside the PRD's repository, the folder AC-START-07's suffixed layout puts the worktree in. Otherwise sessions would get `--add-dir` write access to the old `.worktrees/<PRD folder>/`, which now holds something else, and `kiln add-repository` would place repositories there.
5. Run the restart decision with the review released, as an explicit Resume: plan read in the new worktree, the done check for the stopped phase, then Needs you, resume or launch exactly as `decide()` does today.

**Resuming a session in a new folder (WTR-004).** Only the single-repository "holds something else" case moves a session's folder; the saved-path re-creation and the multi-repository workspace keep it. Verified with Claude Code 2.1.319: `claude -p --resume <id>` run in a different folder resumes the conversation and appends to the original transcript, which Kiln already finds by session ID across `~/.claude/projects/*`. When the single-repository "holds something else" start moves the worktree, existing-branch Start step 4 also rewrites `workingDirectory` to the new worktree in this execution's Claude Code session records whose recorded folder is the entry's old saved path. Those session files are written before the run's record, so a Start that stops partway can run again: the second rewrite finds nothing left to change. Every reader then uses the new folder: resume, the resume prompt's single-repository wording and phase-document path, the snapshot and fresh-session instructions, the inspection resume command and history. Claude Code resumes from there and adds to the original transcript, which Kiln finds by session ID.

Codex records are not rewritten: a Codex conversation resumes only in its recorded working directory. A Codex session whose recorded folder is neither the session folder nor any set-up repository's worktree cannot be resumed, the same as a missing transcript. `resumeOffered`, the restart decision, a usage-limit wait and the inspection resume command (`projection.ts`) all send it to Needs you with AC-KEEP-05's fresh-session wording. This is checked before dispatch, because `runCodexSession`'s realpath check would pass for a foreign folder now sitting at the old path.

A session that started in a worktree before a repository was added still matches a set-up worktree, so it stays resumable.

## Interfaces

### HTTP (same-origin, token, as today)

| Route | Body | Result |
|---|---|---|
| `POST /api/folder-setup/check` | none | Reruns the folder check and facts (Check again); returns the snapshot's `folderMissing`, or leaves the mode |
| `POST /api/folder-setup/panel` | `{ start: "base" \| "branch", fields: { worktreePath?, workspaceFolder?, featureBranch?, baseBranch?, bases?, model?, effort?, keepAwake?, resumeAfterUsageLimit? } }` | `{ panel }` with field errors and the preview; also published by SSE |
| `POST /api/folder-setup/start` | `{ commandId, factsId, previewId, start, fields }` | `{ ok: true }` · `folder_setup_changed` (409) · `busy` (409) · `folder_missing_check_failed` (503) · a step's error with `done[]` and `remaining[]` (500) |

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
  choices: { base: StartChoice | { unavailable: string }, branch: StartChoice | { unavailable: string } },
  fields: <Documents found's settings shape>, fixed: string[], fieldErrors, helpLines,
  preview: { done: string[], run: { id, title }[], again: string[], caution?: string, startLabel: string, lets: string[] },
  previewId: string
}
StartChoice: { sha, total, done, holdsAllWork: boolean, behindBase: boolean }
Commit: { sha, date }
```

### Terminal

The `kiln run` lines in §Folder Missing, replacing the underway summary for this state only. `kiln status` and `kiln handoff` report the state as §The Folder Check describes.

## Data Models

Schema version 20.

- **`PrdRecord.planReadAt?: string`**: written with every successful write of `record.plan`. For records from earlier schemas, the saved plan's date is the accepted `planReconciliation.check.attemptedAt`, the last time Kiln accepted that plan.
- **`PrdRecord.branchStem?: string`**: the feature branch at the first Start; set when a base-branch start activates a fresh execution, carried to every later one, and read in place of `settings.featureBranch` when present. The folder needs no stem: its suffix goes on the PRD folder name, derived from `prdDirectory`.
- **`ExecutionSummary`**: `completedAt` becomes optional; add `endedAt: string` and `ending: "completed" | "folder_missing_setup"`. Existing summaries read as `ending: "completed"`, `endedAt = completedAt`. Archive validation (`readExecution`, `assertContinuationState`) compares `endedAt` and `ending`, not only `completedAt`.
- **`ContinuationState.currentAcceptanceId`** becomes optional, required only when `acceptances` is non-empty: a base-branch start on a run that never continued creates the state with an empty `acceptances` list and its archived execution in `executions`. Today's validation requires `currentAcceptanceId` to name an acceptance. `journalScope` and `prepare()` tolerate its absence.
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
  state: "in_progress" | "failed" | "superseded" | "activated" | "resumed"
  newExecutionId?: string                     // base starts
```

A Start whose kind and names match a `failed` intent resumes it, and its other settings replace the intent's. A Start whose kind or names differ first checks that each artifact the earlier intent created is still its own and untouched (§The Setup Panel, The draft). If so, it marks that intent `superseded`, leaves those artifacts in place, and starts a new intent. If not, it refuses and names the location holding work. Start never deletes anything. Artifacts left behind count as taken for the new draft, so a later base-branch start picks the next suffix. Start refuses while an intent is `in_progress` in this engine.

## Changes to Earlier Designs

Each pointer is added under the named heading when this change is built.

- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does (an unfinished run checks its folders before reading the plan and reports Folder missing, not progress).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (a later `kiln run` may create a second branch and worktree, or a new worktree on the run's existing branch and its local branch from origin).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Active execution handback (a missing assigned worktree is Folder missing, not an unreadable active plan, and its plan is read read-only outside the worktree).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Implemented integrated-prerequisite continuation (Phase 3a) (the activation core is shared with a base-branch start from an unfinished execution, which brings panel names and carried state and no acceptance).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Completion evidence from outside Kiln (a base-branch start here counts every phase closed in the base branch as done on its Closed line alone).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Status, Conversations and Handoff (a run whose folder is missing reports `folder_missing` and offers no resume or continuation).
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
| AC-SAFE-01 | Architecture; Start (busy, recheck, intent, final save) |
| AC-SAFE-02 | The Setup Panel, What will run |
| AC-SAFE-03 | Design Decisions (carried authority); The Setup Panel, What will run (takeover line); Start |
| AC-SAFE-04 | Design Decisions (clearing the stale record); existing-branch Start step 2 |
| AC-LOOK-01 | The Setup Panel (Documents found's components); Folder Missing (terminal) |

## Open Questions

None.
