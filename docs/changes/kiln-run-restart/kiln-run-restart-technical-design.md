# Technical Design: Kiln Run Restart

**PRD:** [Kiln Run Restart](kiln-run-restart-prd.md) · **Assumptions:** [validated table](kiln-run-restart-assumptions.md) · **Screens:** [mockup](mockups/kiln-run-restart.html)

## Overview

Four changes inside Kiln's existing engine, loopback server, command journal and Svelte view. No new process, service or store.

- **Start from an existing branch.** Documents found becomes a preview the engine computes for the chosen starting point, read from Git at the commit the first session will start from. Start sets up a worktree on the chosen branch, or adopts the one it is checked out in, and records where the run began.
- **A stopped phase says what happened and can always go on.** The engine derives three facts for a stopped phase (whether a conversation ever began, the phase's work, whether its latest conversation can be reopened and why not) and offers one of three ways to start a session: resume as today, **carry on** in a new session, or **start again**.
- **Catch-up.** One new Git write: fast-forward a branch that has no commits of its own to its base's tip and push it, before a session starts.
- **Reset.** The running Kiln discards the PRD's state directory, writes a fresh not-started record and replaces its engine, without restarting. The reset's own command receipt is the one journal entry the discard keeps.

The three new commands are `kiln carry-on`, `kiln start-again` and `kiln reset` (§Command line).

## Existing Code

**Posture: Preserve.** Kiln is released. Everything not named below keeps today's behavior.

- **Reused:** `listWorktrees`, `originBranches`, `localBranchCommit`, `isAncestor`, `ensureObjects` (`git-reads.ts`); `observeGitPlan` for a plan read from Git objects; the folder check's "run's worktree" predicate; `createLocalBranch` and `addWorktreeOnBranch` from Folder missing's existing-branch start; the worktree path and workspace folder checks; `runStartChecks` and its problem wording.
- **Reused:** the evaluate-then-act boundary of manual phase recovery (`recoverPhase`): its exclusive checking, completion check, already-complete choice and stop handling. Carry on and start again run inside it.
- **Reused:** the command journal's admission (command ID, status token, digest, busy) for all three new actions, from the browser and the command line; the launch path (`launchSession`, `runProcess`) with its billing, selection and dispatch checks.
- **Reused:** the takeover ownership checks `requireExited`, `captureOwnedProcesses` and `requireNoTerminal` (the carry-on ownership check stands in for `requireTakeoverReturn`), `returningTakeover`, and `reviewMessages` and `resolveMessageHold`.
- **Kept:** Folder missing, continuations, audits, final delivery, usage waits and every held page other than AC-CARRY-06's keep their flows. Folder missing's setup panel keeps its own "Start from" wording.
- **Kept:** a hold is released for same-conversation resume only when the saved conversation is readable: `available` in §Whether the conversation can be reopened, which looks only at the folders that hold the file. This design adds a way to end a hold that was never released; it does not otherwise loosen release.
- **Kept:** a Codex safety problem (unresolved cleanup, ambiguous dispatch) blocks every Kiln-started session for the phase, as it blocks Resume today.
- **Kept:** `kiln run` on a PRD with no saved record, or a not-started one, behaves as today, including exiting when a start check fails.

## Architecture

Three structural changes carry the rest.

1. **The start preview moves into the engine.** Documents found's data depends on the starting point, so a not-started engine owns it and republishes it when the selection or a ref changes.
2. **The server follows a replaceable engine.** Everything `startLocalServer` serves reads the engine through a holder owned by the run: the snapshot, its change listener, the legacy-session binding, the inspection and control routes (`installInspectionRoutes`), and each event-stream connection's change, output and partial subscriptions. The run's stop handling closes whichever engine the holder has. Reset swaps the engine; the holder moves every open event-stream connection's subscriptions to the new engine and sends it the new snapshot, so open pages stay connected.
3. **A phase has a latest conversation, distinct from its latest launch.** A launch that never began a conversation leaves a session record that nothing can resume. Resume, reply, the terminal command, availability checks and a hold's target use the phase's latest session that began a conversation.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where an existing-branch start reads documents | The whole **What Kiln found** block (PRD, design, assumptions, plan, plan checks) is read from Git at the **start commit**: the branch's tip, or the base's tip when the catch-up is ticked. Neither of today's checks that compare the person's checkout with Git applies: the base check's PRD tree comparison (`checkPrdTreeAt`) and, for a PRD repository already set up by an earlier failed Start, `checkSetUpPrdTree` | AC-FROM-02. A branch someone built phases on necessarily differs from the person's checkout in its Closed lines, so either comparison would refuse every such start, the second one on the retry after a failed Start. Reading everything from the commit sessions start at keeps the purpose of those checks: what the person reviews is what sessions read |
| What "closed before the run" means on an existing branch | A leaf Closed in the plan at the start commit. The first plan read accepts it on that alone, with no Committed or Pushed check | AC-FROM-02, AC-DEV-03. The person chose the branch as it stands; AC-FROM-03 allows uncommitted files and an unpushed local branch, either of which would fail today's evidence check for an externally closed leaf |
| Uncommitted PRD documents in an adopted worktree | Start is unavailable while the worktree's uncommitted or untracked files touch the PRD directory, naming them and saying to commit or discard them in that worktree | The preview reads committed documents and the run reads the worktree's files (`readPlan` observes the worktree). A Closed line present in only one would start the run at a plan stop. Other uncommitted files are counted and allowed (AC-FROM-03) |
| A repository's `baseCommit` on an existing branch | The merge base of the branch's tip and the base's tip on origin, and after any catch-up the branch's new tip | Existing readers treat "tip equals `baseCommit`" as "no commits of its own": the Pushed check (`checks.ts`), the choice of repositories that need a pull request (`pullRequestRepositoriesNow`) and development delivery's unchanged test and source-work range. The merge base keeps that true at Start. A catch-up moves the tip to the base's tip, so a `baseCommit` left at the old merge base would make the caught-up branch count as having work: a pull request with no commits, and the base's commits read as source work |
| Commits of its own | `rev-list --count <base tip on origin>..<branch tip>` | AC-CURRENT-01's definition. A branch whose commits all reached the base by an early merge counts zero, which is right: its tip is an ancestor of the base, so a fast-forward loses nothing, and reset's confirmation says it has none of its own |
| Catch-up mechanics | In the worktree: `merge --ff-only <base tip>`, then a plain `push origin <branch>`. Two steps, each skipped when already true | Fast-forward and a non-force push cannot rewrite or lose anything, which is what lets Kiln do it unattended (AC-FROM-04). Recognizing a half-done catch-up lets a retry finish it |
| A conversation began | Claude: a run of the session reported the stream's `init`. Codex: a run has an accepted turn, or its dispatch is ambiguous | AC-CASE-01. A process ID proves only that something spawned; for Codex it is the work server's. An ambiguous Codex dispatch is treated as begun so it keeps today's page and safety rule |
| Why a conversation can't be reopened | The availability check returns a typed reason with the offending path and defect, not prose | AC-CARRY-02 needs seven distinct wordings, the offending path and a fix command, so the check reports the cause as data and the view words it |
| Carry-on session | A new session record for the same phase, launched through the ordinary launch path with its own prompt, run cause `launch`, and the record marked `startedAs: "carry_on"` | AC-CARRY-05. A carry-on is a fresh conversation, so every launch rule applies unchanged: billing, model selection, Codex's skill prompt and one dispatch (AC-CARRY-03). The marker keeps history clear about which sessions continued a stopped phase |
| Ending a hold without release | A separate ownership check that leaves out the saved conversation and operation-level settlement; the hold ends when the new run reports Claude `init` or a Codex `turnId` (an ambiguous Codex dispatch does not end it), or on advance | AC-CARRY-06. Release proves the old conversation is safe to reopen. Nothing reopens it here, so what must still hold is exclusive use: the old process, every descendant it was seen to start, and any terminal on that conversation are gone. An operation runs inside the attempt's process or in a process it started, so once all of those have exited nothing the attempt started is running. Settlement can't be required: an operation the process died in never gets a result, so the hold would never end |
| How reset discards | Replace `prd.json` with a fresh not-started record first, then delete the rest of the state directory, keeping the instance lock and the reset's own journal receipt | AC-RESET-04. Replacing the record first means every reader sees either the old run or a clean not-started PRD, never a half-deleted one. A crash after it is finished by the next `kiln run`, found from that receipt |
| Reset in a running Kiln | The run closes the engine, discards, runs the start checks and builds a not-started engine in the same process, keeping the server, port and page token | AC-RESET-04 has the open page show Documents found. Restarting the process would drop the page and the bot's connection. The token is the page's credential, not progress |
| The reset's own receipt | The ordinary journal receipt for the `reset` instruction, kept through the discard with its `control-index` entry and the sequence cursor | AC-RESET-06. The journal already answers a retry from the receipt before any eligibility or token check (`submitValidated`), and `kiln command-status` already finds a receipt of any execution (`lookupReceipt`: the index, else a scan of every execution's directory). Keeping the one file keeps both working with no second store or reader |
| Command names | `carry-on`, `start-again`, `reset` | AC-CARRY-04 forbids a name that promises to resume. `continue` already means "go on from a pause". The names follow the buttons |

## Starting From a Branch (AC-FROM-01 to 05)

### The starting point

Before Start the record holds the choice: `start.from` (`new` or `existing`) and `start.bringUpToDate` (default true). `settings.featureBranch` holds the new name or the chosen existing branch. A first visit selects `existing` when a branch named as Kiln's default would be exists in any of the PRD's repositories, local or on origin.

### The branch list

One list for the PRD: every local and origin branch name in every repository. Each name is classified per repository by the first row of AC-FROM-03's table that fits, and is unavailable for the PRD when any repository makes it so, naming that repository.

| Row | How Kiln tells |
|---|---|
| The base branch | The name equals that repository's base |
| Another started PRD's feature branch | A saved record under the state root, other than this PRD's, that is started and names this repository's main checkout with this feature branch, an earlier execution's branch included |
| In the person's own checkout | A `worktree list` entry for the branch at the repository's main checkout, or at the checkout `kiln run` was run from |
| Recorded at a missing folder | An entry for the branch marked `prunable` whose path is absent |
| Behind or diverged from the remote's | Local and origin tips differ and the local tip is not ahead: origin's tip is not an ancestor of the local one |
| In another worktree | An entry for the branch at a path that passes the folder check's predicate. The worktree's `HEAD` must be on the branch |
| Checked out nowhere | None of the above; local, origin-only, or both at the same tip or local ahead |

A read that fails makes the name unavailable with the read named, never silently available. A branch with no merge base with its base is unavailable, saying so.

**Several repositories (AC-FROM-05).** A repository that has the branch uses it; one that doesn't gets it cut from its base as today. Existing worktrees must each sit at `<W>/<repository name>` for one folder `W`; `W` becomes the workspace folder, fixed. Otherwise the branch is unavailable, naming the folders. Repositories without a worktree get `<W>/<name>`, after today's path checks.

### The preview

For the selection the engine computes, and digests into `previewId`:

- per repository: the branch's tip and where it was read (local or origin), its base tip, the merge base, commits of its own, how far behind the base, the worktree to adopt and its count of uncommitted files, and the open pull request from the branch into the base if one exists (`gh pr list`, the query the final-delivery check already makes);
- the catch-up offer (§Catching a Branch Up);
- the start commit in the PRD's repository and the documents read there. The plan read there must pass the plan start checks (`readPhasePlan` problems, `planStartProblems`). A branch whose start commit lacks the PRD's documents, or fails those checks, shows the problem on **Feature branch** and Start is unavailable;
- the plan's closed leaves, the first open leaf and the Start label: **Start at Phase N** when some leaves are closed and one is open, **Start** otherwise.

A new-branch start keeps today's reads and checks, including the checkout-equals-base document check, and its preview says the plan is read from the base branch.

### Start

Start submits `previewId`. Kiln recomputes the preview and refuses `start_changed` (409) with the refreshed page when it differs. Then, per repository in list order:

1. Origin-only branch: bring the tip's objects in and create the local branch with its upstream, as Folder missing's existing-branch start does.
2. No worktree: `git worktree add <folder> <branch>`. An adopted worktree is re-verified with the folder check's predicate and nothing is written.
3. Record the entry: `baseCommit` (the merge base), `runStartCommit` (the branch's tip), `adoptedWorktree` when adopted.
4. Catch-up, when ticked and still qualifying (§Catching a Branch Up); `runStartCommit` and `baseCommit` are then the new tip.

A step that fails ends Start, clears `startedAt` as today and shows Documents found with the error. Kiln removes nothing it made: a local branch or worktree left by a failed Start is classified by the same table on the next visit, so the next Start adopts it.

The record's plan at Start is the plan the preview showed. A repository that gets a new branch is set up exactly as today.

### After Start

- **Closed before the run.** The first plan read (`readPlan` with no earlier baseline) accepts each leaf Closed at the PRD repository's `runStartCommit` as an outside completion at that commit, with its scope repositories and each set-up repository's `runStartCommit`, or `baseCommit` where the branch was cut new, as its revisions. This comes before the published-base proof and the evidence check, which still apply to any other closed leaf. Development delivery's "closed before the run" set (`leavesClosedAtRunBase`, read at `baseCommit` today) is read at `runStartCommit` when the entry has one.
- **The first session is told.** The first session the run launches gets one added paragraph when the run adopted a worktree with uncommitted files: how many, and to look before building.
- **Pull requests (AC-FROM-04).** Final delivery is unchanged: its check already passes on the branch's open, ready pull request into the base, and its prompt already tells the session not to open a second. The preview names that pull request in **Starting lets Kiln**.
- **Git limits.** Sessions commit and push as today. Kiln's own writes to an existing branch are the worktree and local-branch setup above and the catch-up, nothing else.

## Catching a Branch Up (AC-CURRENT-01)

A repository's branch **qualifies** when all hold, read at the moment of use:

- its tip has no commits of its own (Design Decisions);
- its worktree, when it has one, is on the branch with nothing uncommitted (`status --porcelain --untracked-files=all` is empty);
- the local tip, or origin's copy of the branch, is behind the base's tip on origin.

The offer exists when any of the PRD's repositories qualifies, and lists each with its count behind. Doing it, per qualifying repository: bring the base tip's objects in; `merge --ff-only <base tip>` in the worktree when the local tip is behind; `git push origin <branch>` when origin's copy is not at the local tip. On any failure nothing starts, the reason is shown where the action was pressed, and what was already moved stays moved.

Each catch-up is saved (`branchCatchUps`) and told to the next session Kiln starts or resumes in one sentence: which branch moved, from and to which commit. With it, the repository's `baseCommit` becomes the new tip (Design Decisions), and so does the stopped phase's start commit in that repository. A branch qualifies only with nothing of its own, so the phase had no commits there to lose; moving its start keeps the base's commits out of its commit count and its recorded commit range, as well as its work (§A Stopped Phase's Facts).

| Where | Behavior |
|---|---|
| Documents found, existing branch | `start.bringUpToDate` decides. Ticked, the plan is read at the base's tip (AC-FROM-02) and the catch-up is Start's last step |
| A stopped phase's page | The page sends `bringUpToDate` with **Send reply & resume**, **Have Kiln resume**, **Send reply & continue** and **Start again**. Ticked but no longer qualifying returns `branch_changed` (409) and the page refreshes, so a session never starts on a branch the person believed was being moved |
| `kiln reply`, `kiln resume`, `kiln carry-on`, `kiln start-again` on a stopped phase | Done when the branch qualifies, unless `--leave-branch-as-is`. A branch that doesn't qualify proceeds; the receipt's `branch_catch_up` lists what moved, empty when nothing did |

A held phase (§A Stopped Phase's Facts) gets no offer and no catch-up. Verify, Mark complete and a waiting phase's Resume now never catch up.

## A Stopped Phase's Facts (AC-CASE-01, 03, 04)

A **stopped phase** is an implementation leaf that is not held, one of whose sessions has a run, and that has a stop of kind `done_check` or `not_resumable` or a billing hold on a resume (`action: "resume"`). A billing hold on a launch (`action: "launch"`) is a launch hold. While it lasts, the phase is not a stopped phase and keeps today's page, **The next AI launch is held for review.**, whatever stop the phase also keeps. When it clears, the kept stop's page returns.

| Billing hold | The phase also has | Page | Stopped phase |
|---|---|---|---|
| First launch (`launch`; no session has a run) | nothing | `NeedsYou`, **The next AI launch is held for review.** | No |
| **Start again** or **Send reply & continue** (`launch`; a new session with no run) | its stop, kept | `NeedsYou`, **The next AI launch is held for review.** | No while the launch hold lasts; the stop's page, with its button, returns when it clears |
| Reply, **Resume**, **Have Kiln resume**, a usage-limit resume (`resume`) | its `done_check` stop or usage wait, kept | `PhaseHandoff`, **Phase N needs your input.** with the billing panel | Yes; AC-CASE-01's three cases apply |

A phase is **held** while the run record carries `liveControl`, in either state, `pending` or `released`, and of either kind, takeover or `delivery_recovery`. `released` means the conversation is ready for the terminal; it does not end the hold. The hold ends when `liveControl` is removed: when a resumed or carry-on run reports Claude `init` or a Codex `turnId`, on a successful advance or Mark complete, or on Folder missing's Start. A resumed run that ends before its conversation begins leaves the phase held. While a phase is held it is not a stopped phase: its page keeps today's headline and controls, apart from the reset line and AC-CARRY-06's case. It gets no catch-up offer, and no reply, resume, carry-on or start-again catches its branch up, from the page or the command line, whatever `bringUpToDate` or `--leave-branch-as-is` says. Once the hold has ended, a later stop of that phase is a stopped phase like any other.

For a stopped phase the engine derives, and the snapshot carries:

**Conversation began.** Per Design Decisions, over every session of the phase. The **latest conversation** is the last session in the phase's list that began one.

**Latest launch.** The phase's latest launch is the session whose latest run started last; a session with no run never is. A resume is a run of the session it reopens, so a failed resume leaves that session the latest launch, with its conversation begun.

**Work.** Per set-up repository: commits reachable from the feature branch's tip but not from the phase's start commit there nor from the base's tip on origin; and the count of uncommitted files in the worktree. A phase **built nothing** when every repository has zero of both. Work is read when the stop is recorded, at each recheck, when the page is opened or reloaded, and before a session starts. When a read fails, work is unknown: the page names the read, uses today's headline and shows today's checks. A hold with `history` set has work too (§A Held Phase That Can't Be Reopened).

**Case.** `could_not_start` when no session began a conversation; `built_nothing` when one did and the phase built nothing; `needs_input` otherwise, today's page. The headline, the duration line (the latest conversation's running time, from its runs' start and end times) and the first card follow AC-CASE-01 and AC-CASE-04. The first card is **What Kiln found** only when the latest launch never began a conversation, giving the program Kiln ran, the folder and the recorded error or exit; any earlier conversation's last message follows it. Otherwise it is today's **Last message from**, giving the latest launch's last recorded final message (the one the carry-on prompt carries), or its last lines when none was recorded. Under its facts row, a resume that couldn't spawn shows today's spawn-error warning line.

Both of today's pages (`PhaseHandoff` for a session that spawned, `NeedsYou` for one that didn't) render a stopped phase from these facts, so a session that spawned and exited before its conversation began shows the couldn't-start page when no other session of the phase began one.

**Nothing to check yet (AC-CASE-03).** While the phase built nothing and the stop's check run is the stop's own (`run.origin` is `stop`), the snapshot sets `nothingToCheck` and the view shows the drawn text and **Check Phase N anyway** in place of every row without `reason`. A row with `reason` still shows. `CheckResult.reason?: true` marks a row that reports why the phase stopped rather than what its work satisfies. It is set where the row is made: the agent recovery rows (Claude recovery, Codex recovery, Recovered conversation), Codex process cleanup and dispatch, the launch rows (Billing approval, Agent selection and readiness, Codex launch settings, Preparation permissions), Completion audit readiness, Phase plan reads, and the preparation rows (Prerequisite preparation, Preparation recovery, Prepared checkpoint). A stop row saved before schema 21 is marked by those names when read. Mark complete needs a finished recheck, so it is never offered while `nothingToCheck` is set. **Check Phase N anyway** is today's recheck. Its rows replace the stop's rows and all of them show as today. The Mark complete offer gains `builtNothing`, which selects the sentence above it.

## Starting a Session at a Stop (AC-CASE-02, AC-CARRY-01 to 05)

### Whether the conversation can be reopened

For the phase's latest conversation the engine computes a `ReopenCheck`:

```
ReopenCheck:
  state: "available" | "unavailable" | "safety"
  reason?: "missing" | "unsafe" | "not_a_file" | "no_messages" | "unreadable" | "reopen_failed" | "codex"
  path?: string                 // unsafe, not_a_file
  defects?: ("writable_by_others" | "link" | "other_owner")[]   // unsafe
  fixCommand?: string           // unsafe, only when defects is exactly writable_by_others
  detail?: string               // codex: the wording of the first Codex cause that applies
  problems?: string[]           // safety: the recorded sentences of the phase's Codex safety problems
```

| `reason` | From | AC-CARRY-02 row |
|---|---|---|
| `missing` | No `projects` folder, no file for the session ID in any project folder, or an ID no file could have | 1 |
| `unsafe` | The `projects` folder, the project folder holding the file, or the file fails the ownership check, judged in that order. `path` is the first that fails. A folder fails when it is a link, belongs to another account, or is writable by accounts outside its group; group write passes. The file fails when it is a link, belongs to another account, or is writable by its group or others, judged both before it is opened and as opened. A project folder that doesn't hold the file, or that this account can't search, is never the reason. A project folder that is a link and through which the file is reached is `link` | 2 |
| `not_a_file` | The saved path isn't an ordinary file | 3 |
| `no_messages` | The file holds no usable message | 4 |
| `unreadable` | A read error, the read deadline, a record over the size Kiln reads, or a line that isn't JSON and wasn't cut off | 5 |
| `reopen_failed` | A Claude stop is `not_resumable` because a resumed run spawned and then ended before its conversation began. A resume that couldn't spawn is never this reason: the check reads the file as for any stop, so reply and resume stay offered while it is `available` | 6 |
| `codex` | A Codex conversation with no safety problem, for a cause in the Codex table below | 7 |

`fixCommand` is given only when `defects` is exactly `writable_by_others`: `chmod o-w <path>` for a folder, `chmod go-w <path>` for the file, with `<path>` absolute and shell-quoted. Running it makes that path pass, and **Check again** names the next path that fails, if any. A link, another owner, or more than one defect gets no command.

For Codex, `state: "safety"` comes from the phase's Codex safety problems: cleanup unresolved, or dispatch ambiguous (`codexSafetyProblems`, without launch-settings verification). `problems` holds their recorded sentences. A launch-settings verification failure is not a safety problem. Otherwise `reason: "codex"`, with `detail` from the first row that applies; with neither, the check is `available`:

| Codex cause | `detail` | Read from |
|---|---|---|
| The recorded folder is neither the session folder nor a set-up worktree, while the run is underway | Codex reopens this conversation only in `<recorded folder>`, which is no longer this run's folder. | The session's `workingDirectory`, compared at each snapshot build as `transcriptMissing` compares it |
| Kiln's last read of the thread failed | `resumeError` as recorded: "Codex conversation cannot be opened: `<cause>`". The cause is the app server failing to start or exiting, a Codex RPC error, a different thread identity, the 30-second deadline, or a malformed or oversized reply | `session.codex.resumeError` |

A conversation that began always has a `threadId`, so no row covers a missing ID. A Codex `not_resumable` stop comes from these same conditions, so it reads `codex`, never `reopen_failed`.

For Claude, one function decides `available` and returns the typed reasons above; resume's offer, the page and a hold's release (`requireHistory`) all read it. `available` means the file is found, holds a usable message by `claudeHistoryAvailability`'s rule, and every line is JSON or cut off, read to the end within the read deadline and the size Kiln reads per record. Any other outcome is the matching reason. With one predicate, a page never offers resume for a conversation release would refuse, and a hold never waits on a conversation the page calls reopenable.

For Claude the check runs at every snapshot build, as the transcript check does today, so **Check again**, **Check Phase N again** and **Check Phase N anyway** need only republish. For Codex a snapshot build reads only the recorded facts above and starts no process. **Check again** runs `readCodexAvailability` on the latest conversation (one evidence-only Codex app server, `thread/read` only, 30 seconds at most), records or clears `resumeError`, then republishes. With no `codex` executable found it records nothing, and the card keeps the recorded result. **Check Phase N again** and **Check Phase N anyway** re-read through the completion check's `refreshCodexConversations`. A phase where no session accepted a turn, and none has an ambiguous dispatch, is `could_not_start` and never gets a `ReopenCheck`. When the latest launch began no conversation, the check reads the latest conversation, an earlier session's.

A conversation that reads as available again brings back reply and resume with no restart. `reopen_failed` is a recorded fact about an attempt and does not clear on a re-read.

The reply card follows AC-CARRY-01: `available` gives today's card; `unavailable` gives the carry-on card beside the fresh-session terminal card; `safety` gives today's **Conversation recovery unavailable**.

### Carry on

Action `carry-on`, inputs `{ message?, leave_branch?, reviewed_receipt_ids?, live_target? }`. Offered when the phase is stopped, a conversation began, and `ReopenCheck` is `unavailable`; or on AC-CARRY-06's held page. Inside the recovery boundary:

1. Run the completion check. Complete returns `phase_already_complete`: nothing starts, the reply is kept unsent, and the page shows today's already-complete choice. Unavailable returns `check_unavailable`.
2. Catch the branch up when it applies.
3. Write a new session record for the phase, marked `startedAs: "carry_on"`, and launch it (cause `launch`) in the phase's worktree with the carry-on prompt.
4. As the run starts, the stop clears, as a resumed run's does. A launch that fails leaves the stop, and its session in history. A billing hold at the launch is a launch hold (§A Stopped Phase's Facts), and it leaves the stop. Once the launch hold clears, the stop offers **Send reply & continue** again, which rebuilds the prompt and takes the reply afresh.

The **carry-on prompt** is its own template: the phase's fresh-session prompt, then the person's reply when there is one (with the reply policy a resume note gets), the latest conversation's last message verbatim or a line saying none was recorded, and the phase's work: each repository's commits (short SHA and subject) and its uncommitted file count. A last message over 16,000 characters is cut there, saying so.

The new session is judged by the completion check when it ends, like any session.

### Start again

Action `start-again`, inputs `{ leave_branch? }`. Offered when the phase is stopped and no session of it began a conversation. It catches the branch up when that applies, then launches the phase's first session again with the ordinary phase prompt in a new session record. The new session record carries no marker. A session that follows sessions that never began a conversation is a start again. It takes no reply. It does not run the completion check first: the page offers **Check Phase N anyway** for that.

### Limits (AC-CARRY-03)

Both actions are unavailable, with the reason, while Kiln is checking, dispatching or running a session, and while a billing restriction would stop a launch (the launch path's own check, surfaced as the control's reason before the press). **Start again** is also unavailable on a Codex safety problem; carry on is never offered then. The journal admits one instruction at a time and the status token changes when a session starts, so a second press starts nothing.

### Resuming after a failed launch

Reply and resume reopen the phase's latest conversation. When a later launch of the phase began none, the resumed run is recorded on the earlier session, which makes it the latest launch again (§A Stopped Phase's Facts) whether or not the resume spawned; it is also the session the hold names.

## A Held Phase That Can't Be Reopened (AC-CARRY-06)

While a hold is pending and its attempt's process has exited, takeover reconciliation also computes the `ReopenCheck` for the hold's conversation and saves it on the hold as `history` when it is `unavailable`. Release's own path stops at `requireHistory`, before its process checks, so for a hold with `history` reconciliation runs the **carry-on ownership check** in its place and saves its obstacle, if any, as the hold's reason:

- the attempt's process has exited and its final observations are saved (no running adapter for that attempt);
- for an attempt with a gate: a fresh `captureOwnedProcesses` succeeds, leaving no unresolved process observation or obstacle, and every tracked identity has exited (`requireExited` for each);
- no terminal is open on the conversation (`requireNoTerminal`).

It does not replay the transcript or require `unsettled(gate)` to be empty. The one case it can't see is a descendant that detached from the attempt between two of the scanner's 250 ms inventories; Live Session Control accepted the same bound for release (its Q2: containment of arbitrary downstream shell or remote effects is not part of AC-TAKE-02 or AC-TAKE-04).

A hold with `history` set stays `pending`: it is never reported as released, and nothing that requires release changes.

**The page.** A hold with `history` set shows the carry-on card (with its reason and **Check again**, which re-reads the hold's conversation: for Codex, `readCodexAvailability` on that conversation) beside the fresh-session terminal card, in place of the wait text and card. **Send reply & continue** and the terminal card's copy buttons are unavailable while the ownership check has an obstacle, showing it. Each uncertain message shows above the cards with **I reviewed this message in the conversation**, and **Send reply & continue** is unavailable until each is acknowledged. Work is also computed for a hold with `history` set, the same way as for a stopped phase: from the held phase's start commit in each repository (`RepositoryPhaseFacts.startCommit`). No catch-up moves it, since carrying on from a hold skips catch-up. It is read when `history` is saved, at **Check again**, when the page is opened or reloaded, and before the carry-on session starts. It is carried in `needsYou.work`. The held page renders it as the card's "Phase N's work so far" row, and the carry-on prompt's work section reads it as for a stopped phase. The headline is today's for the hold's kind and the page keeps today's checks, so `case`, `nothingToCheck` and `markComplete.builtNothing` stay absent.

**Carry on from a hold.** Before step 1 of §Carry on: every uncertain message is acknowledged (acknowledgements sent with the command are applied first), and the ownership check passes. The catch-up step is skipped. The launch path runs the carry-on ownership check on the hold's conversation in place of `requireTakeoverReturn`, and its pre-prompt guard does the same: no terminal on the hold's conversation, with the activity-material comparison unchanged, and no `requireHistory` for either conversation. A check that fails there settles the receipt `not_started` (`dispatch_not_started`). The carry-on reuses `returningTakeover`. The hold ends, with its acknowledged messages resolved, when the new run reports Claude `init` or a Codex `turnId`, and the receipt's `effects.session` becomes `started`. A launch that ends before then leaves the hold `pending` and clears `returningTakeover`. Until the hold ends, the hold is the page's live target: **Message Claude** and **Pause & take over** are unavailable for the new attempt, whatever the hold's kind, with the reason that the session is starting, and each becomes available on the new attempt once the hold ends. An uncertain message is not added to the prompt.

**Advance from a hold.** The already-complete choice's advance, for a hold with `history` set, uses the same two preconditions in place of release, then accepts completion and ends the hold as a released hand-back does. Verify and Mark complete on the page are unchanged and stay unavailable until release, as AC-CARRY-06 changes only the carry-on button's path.

**Bots.** `kiln status` lists `carry-on` as available under the same conditions. `kiln handoff` returns the fresh-session instructions, and no resume command, when the hold has `history` set and the ownership check passes.

## Reset (AC-RESET-01 to 06)

### Availability

`reset` is a control of every started PRD: `startedAt` is set, whatever the screen (Needs you, a wait, a pause, Folder missing, Complete). It is unavailable while Kiln is working: a session process is running or being watched, the engine is driving, checking, setting up, reading a completed plan, saving billing or delivery state, running a Folder missing start, or stopping, or another instruction is pending. A held phase whose attempt has ended is not working. The snapshot carries `reset: { available, reason? }`; the view renders the line and button from it at the bottom of every screen but Documents found.

### The confirmation

Opening it reads `GET /api/reset/preview`, computed at that moment:

```
ResetPreview:
  forgets:  { phaseResults: number, sessions: number, stops: number, waivers: number, audits: number, deliveries: number }
  stays:    [{ repository, branch, ownCommits?: number, worktree?: string, uncommittedFiles?: number,
               pullRequests: [{ number, url }], unknown: string[] }]
  closedOnBranch?: number        // leaves Closed in the plan on the feature branch, PRD's repository
```

Each line shows by what it names (AC-RESET-03). **Kiln forgets:** "Which phase it was on, and each phase's result" and "Its settings for this PRD, which you choose again on the first screen" always show, since every started PRD has both. "Its N session(s) and their output" shows when `forgets.sessions` > 0 ("Its 1 session and its output"). "Stops, completion waivers and audit results" shows when `stops + waivers + audits` > 0, with no count. "Its record of earlier deliveries" shows when `deliveries` > 0. **Stays exactly as it is:** each `stays` entry gives a branch line, "`<branch>`, which has N commits of its own", and, when `worktree` is set, "The worktree folder, with N uncommitted files". Both are named even at zero, written "no commits of its own" and "no uncommitted files". With several repositories each line names its repository. A repository's pull requests show when `pullRequests` is non-empty, each by number. "The phases closed in the plan on the feature branch" shows when `closedOnBranch` > 0. An absent count means the read failed: it is listed in `unknown` (for `closedOnBranch`, the `unknown` of the PRD repository's `stays` entry), its line says Kiln couldn't count it, and the reset is still offered, because it touches none of those things.

### Doing it

Reset is admitted through the command journal like every changing command, as action `reset`; its receipt is saved `in_progress` before any effect. Then the run:

1. closes the engine's work: timers, watchers, keep-awake;
2. replaces `prd.json` with a fresh not-started record: default settings as a first `kiln run` computes them, a new execution ID, the same page token;
3. deletes everything else in the PRD's state directory except `instance.lock`, the files under `controls/` of this and every earlier `reset` receipt, their `control-index` entries when the journal is indexed, and the sequence cursor;
4. settles the receipt `completed`, outcome `reset`, with the `forgets` counts, and closes the old journal;
5. runs the start checks and builds a not-started engine over the new record, then publishes it through the holder.

The new engine's journal loads the kept receipts with the rest; they belong to earlier executions, so nothing reads them as current. Nothing in any repository, and nothing of Claude Code's or Codex's own, is touched (AC-RESET-05). The port registration (`ports.json`, outside the PRD's state directory) stays.

**Recovery.** Before reading the record, `kiln run` looks in the journal for a `reset` receipt that isn't settled. One means a reset was interrupted: Kiln finishes steps 2 and 3, whichever remain (step 2 remains when `prd.json` still holds the receipt's execution ID), settles the receipt as in step 4, and carries on as a first run.

**Start checks on the page (AC-RESET-04).** A not-started engine built by a reset holds the start-check report. When a check fails, the preview's check list names it in `kiln run`'s words where the passed ones are listed, the documents that could not be read are absent, and Start is unavailable with **Fix what failed, then reload.** Opening or reloading the page reruns the checks. `kiln run` from a terminal is unchanged: it prints the failure and exits.

**The receipt (AC-RESET-06).** A retry with the same command ID and inputs finds the kept receipt before any eligibility or token check, so it returns the recorded result and not a stale-token refusal against the new execution. `kiln command-status` finds it as it finds any receipt, through the running Kiln or from disk; one read without a running Kiln while not settled reports `indeterminate`, as today. Each reset keeps the receipts of earlier resets.

A reset refused at admission (stale token, busy, unavailable) is an ordinary journal receipt and discards nothing.

## Interfaces

### HTTP (same-origin, token, as today)

| Route | Body | Result |
|---|---|---|
| `POST /api/settings` | adds `start: { from, bringUpToDate }` before Start | as today; the preview is republished |
| `POST /api/start` | adds `previewId` | adds `start_changed` (409) |
| `POST /api/resume` | adds `bringUpToDate?` | adds `branch_changed` (409), `branch_catch_up_failed` (409, with the reason) |
| `POST /api/carry-on` | `{ note?, bringUpToDate?, reviewedReceiptIds?, target }` with the `X-Kiln-Status` and `X-Kiln-Command-Id` headers Mark complete uses | `{ ok, outcome: "session_started" \| "already_complete" }` and the errors of `/api/resume` |
| `POST /api/start-again` | `{ bringUpToDate? }`, same headers | `{ ok, outcome: "session_started" }` |
| `POST /api/reopen-check` | none | **Check again**: for Codex, reads the thread of the latest conversation, or on a held page the hold's conversation (`readCodexAvailability`), and records or clears `resumeError`; then republishes |
| `GET /api/reset/preview` | | `ResetPreview` |
| `POST /api/reset` | none, same headers | `{ ok, outcome: "reset" }`; `control_unavailable` (409) with the reason |

`target` on carry-on is today's recovery target, extended so a stop whose session never spawned has one.

### Snapshot

```
documents: adds
  start: { from: "new" | "existing", bringUpToDate: boolean, previewId,
           branches: [{ name, available: boolean, reason?: string, repository?: string }],
           planSource: { kind: "base" | "branch" | "base_after_catch_up", branch, sha },
           worktree?: { path, adopted: boolean, uncommittedFiles?: number },
           repositories: [{ name, hasBranch: boolean, pullRequest?: { number, url } }],
           closedCount, startAt?: { id, title },
           catchUp?: CatchUpOffer }
  checks: each row may be { name, passed: false, text }      // after a reset
  plan?: absent when the plan could not be read

needsYou: adds
  case?: "could_not_start" | "built_nothing" | "needs_input"
  work?: { repositories: [{ name, commits: [{ sha, subject }], uncommittedFiles }], builtNothing: boolean } | { unknown: string }
  conversationRanMs?: number
  launchFailure?: { ran: string, folder: string, error: string, at: string }   // What Kiln found: only when the latest launch never began a conversation
  nothingToCheck?: true
  reopen?: ReopenCheck
  carryOn?: { available: boolean, reason?: string, endsHold?: "takeover" | "message" }
  startAgain?: { available: boolean, reason?: string }
  catchUp?: CatchUpOffer
  markComplete: adds builtNothing?: true

CatchUpOffer: { base: string, repositories: [{ name, branch, behind: number }] }

reset?: { available: boolean, reason?: string }                // started PRDs only
liveControl.takeover: adds history?: ReopenCheck
```

### Command line

All three are changing commands under bot control's contract: a PRD path, `--only-if-status-matches`, `--command-id`, text and JSON results, the same exit classes, no prompt. Each has a command contract with examples and joins `kiln status`'s controls and the controller's advertised features (`carry_on`, `start_again`, `reset`).

| Command | Options | Outcomes |
|---|---|---|
| `kiln carry-on <PRD-path>` | at most one of `--message-file <path>`, `--message-from-stdin`; `--message-reviewed <receipt-id>` (repeatable); `--leave-branch-as-is` | `session_started`, `phase_already_complete`, `check_unavailable`, `branch_catch_up_failed`, `message_review_required`, `dispatch_not_started` |
| `kiln start-again <PRD-path>` | `--leave-branch-as-is` | `session_started`, `branch_catch_up_failed`, `dispatch_not_started` |
| `kiln reset <PRD-path>` | none | `reset` |

`kiln reply` and `kiln resume` gain `--leave-branch-as-is`. Receipts of the four session-starting commands gain `branch_catch_up: [{ repository, branch, from, to, commits }]`. The receipt's `effects.session` for carry on and start again is `starting`, then `started` once the receipt's run begins its conversation, and each command succeeds on `started`. `started` counts as success wherever `resumed` does. Other receipts keep `resumed`. Neither command's name, help or output says "resume".

`kiln reset --help` states, before its options, that a reset can't be undone, lists what Kiln forgets (AC-RESET-03's first column), and says nothing runs afterwards until someone opens the browser view with `kiln run <PRD-path>` and presses Start on Documents found. It takes no confirming flag. `kiln status` lists `reset` for a not-started PRD as unavailable, "Not started; there is nothing to reset."

## Data Models

Schema version 21. Every addition is optional; a record from schema 20 reads unchanged, except that its stop rows are marked `reason` by name (§A Stopped Phase's Facts, Nothing to check yet).

- **`PrdRecord.start?: { from: "new" | "existing"; bringUpToDate: boolean }`**: the starting point chosen on Documents found. Absent reads as `new`.
- **`RepositoryEntry.runStartCommit?: string`**: the branch's tip when the run started on an existing branch, after any catch-up. Named apart from `RepositoryPhaseFacts.startCommit`, which is where one phase's commits begin. **`RepositoryEntry.adoptedWorktree?: true`**: the worktree existed before Start.
- **`PrdRecord.branchCatchUps?: [{ at, repository, branch, from, to, commits, toldSessionId? }]`**: each catch-up Kiln made; `toldSessionId` is set once a session's prompt carried it.
- **`CheckResult.reason?: true`**: the check row reports why the phase stopped, not what its work satisfies (§A Stopped Phase's Facts, Nothing to check yet).
- **`SessionRecord.startedAs?: "carry_on"`**: set on a carry-on session's record. Absent means an ordinary launch. Run causes are unchanged.
- **`TakeoverHold.history?: ReopenCheck`**: additive under `liveControl` version 1.
- **Command journal:** actions `carry-on` (inputs `message`, `leave_branch`, `live_target`, `reviewed_receipt_ids`), `start-again` (`leave_branch`) and `reset` (none). A receipt version 1 gains optional `branch_catch_up` (the four session-starting actions), the `effects.session` values `starting` and `started` (`carry-on` and `start-again`) and, for `reset`, `reset: { forgets: ResetPreview.forgets, new_execution_id }`. An older Kiln reading a journal with these actions refuses it as unreadable, as it refuses any receipt it does not validate; nothing older runs against a record of schema 21.

## Changes to Earlier Designs

Each pointer is added under the named heading when this change is built.

- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (a first Start may use an existing branch and adopt its worktree; Kiln may fast-forward and push a branch with no commits of its own).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does (Documents found is computed for a starting point; a reset returns a running Kiln to it; an interrupted reset is finished first).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk (reset discards the PRD's state directory except the instance lock and reset receipts).
- Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §Start (AC-SAFE-03: Kiln may fast-forward and push a branch with no commits of its own).
- Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Settings before Start and §Setup at Start (a repository that has the chosen branch uses it; existing worktrees fix the workspace folder).
- Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One evaluator at every transition (closed before the run is read at the start commit on an existing branch).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Completion evidence from outside Kiln (a leaf Closed at an existing branch's start commit is accepted on its Closed line).
- Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Applicability and ownership, §Local Interfaces and §Needs you Layout (the three cases; carry on and start again; the recovery target for a session that never spawned; missing history no longer leaves only the terminal).
- Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Display Contract (no checks shown for a phase that built nothing until asked; the sentence above Mark complete).
- Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Release is a separate fact, §Activity-specific evaluate, then act and §Bot Extension (a hold whose conversation can't be reopened ends by a carry-on session or its advance, on the carry-on ownership check).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar, §Durable Controls and Retries and §Durable Data and Evolution (three commands; the catch-up before reply and resume; a reset's receipt survives the discard of the journal it belongs to).

## Integration Points

- Git in each repository's main checkout, worktree and origin: the reads above, `worktree add`, local branch creation, `merge --ff-only`, `push`.
- GitHub through `gh pr list`, read only.
- Claude Code and Codex: launch and resume as today; Claude Code's saved conversations are read, never changed.
- `docs/kiln-command-line-and-bot-control.md` gains the three commands and `--leave-branch-as-is`, and its claim that a terminal can do everything the browser does with existing work is corrected for what stays browser-only (choosing where a run starts).

## Delivery

- **Expected build spend:** about $10 of agent usage, for short disposable Claude Code and Codex sessions proving that a carry-on session receives the reply, last message and work (AC-CARRY-05), that start again launches a first session (AC-CASE-02), and that a hold ends when the carry-on run reports Claude `init` or a Codex `turnId` (AC-CARRY-06). Everything else is proved on disposable repositories with bare origins and the existing fake-agent harness.
- **After the build:** a minor release (three new commands) by `docs/release/kiln-npm-release-steps.md`, once the PRD's audits close.

## Criteria Coverage

| Criteria | Section |
|---|---|
| AC-FROM-01 | Starting From a Branch: The starting point, The branch list; Snapshot |
| AC-FROM-02 | Design Decisions (documents, closed before the run); The preview; After Start |
| AC-FROM-03 | The branch list; Start; Design Decisions (uncommitted PRD documents) |
| AC-FROM-04 | After Start (pull requests, Git limits); The preview |
| AC-FROM-05 | The branch list, Several repositories |
| AC-CURRENT-01 | Catching a Branch Up; Design Decisions (commits of its own, catch-up mechanics) |
| AC-CASE-01, 04 | A Stopped Phase's Facts |
| AC-CASE-02 | Start again; Limits |
| AC-CASE-03 | A Stopped Phase's Facts, Nothing to check yet |
| AC-CARRY-01, 02 | Whether the conversation can be reopened |
| AC-CARRY-03 | Limits |
| AC-CARRY-04 | Command line |
| AC-CARRY-05 | Carry on |
| AC-CARRY-06 | A Held Phase That Can't Be Reopened; A Stopped Phase's Facts (held); Design Decisions (ending a hold without release) |
| AC-RESET-01, 02 | Reset: Availability |
| AC-RESET-03 | The confirmation |
| AC-RESET-04, 05 | Doing it |
| AC-RESET-06 | Doing it (The receipt); Command line |
| AC-LOOK-01 | Snapshot (the data each drawn state needs); the view renders the mockup's layout and wording on today's screens |

## Open Questions

None.
