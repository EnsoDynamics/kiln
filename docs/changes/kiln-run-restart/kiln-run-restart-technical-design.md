# Technical Design: Kiln Run Restart

**PRD:** [Kiln Run Restart](kiln-run-restart-prd.md) · **Assumptions:** [validated table](kiln-run-restart-assumptions.md) · **Screens:** [mockup](mockups/kiln-run-restart.html)

## Overview

Four changes inside Kiln's existing engine, loopback server, command journal and Svelte view. No new process, service or store.

- **Start from an existing branch.** Documents found becomes a preview the engine computes for the chosen starting point, read from Git at the commit the first session will start from. Start sets up a worktree on the chosen branch, or adopts the one it is checked out in, and records where the run began.
- **A stopped phase says what happened and can always go on.** The engine derives three facts for a stopped phase (whether a conversation ever began, the phase's work, whether its latest conversation can be reopened and why not) and offers one of three ways to start a session: resume as today, **carry on** in a new session, or **start again**.
- **Catch-up.** One new Git write: fast-forward a branch that has no commits of its own to its base's tip and push it, before a session starts.
- **Reset.** The running Kiln stops its engine, writes a fresh not-started record, discards the rest of the PRD's state directory and replaces the engine, without restarting. A step that fails after the engine has stopped ends the run instead, and the next `kiln run` finishes what the reset left. Reset command receipts, the reset's own and any earlier resets', are the only journal entries the discard keeps.

The three new commands are `kiln carry-on`, `kiln start-again` and `kiln reset` (§Command line).

## Existing Code

**Posture: Preserve.** Kiln is released. Everything not named below keeps today's behavior.

- **Reused:** `listWorktrees`, `originBranches`, `localBranchCommit`, `isAncestor`, `ensureObjects` (`git-reads.ts`); `observeGitPlan` for a plan read from Git objects; the folder check's "run's worktree" predicate; `createLocalBranch` and `addWorktreeOnBranch` from Folder missing's existing-branch start; the worktree path and workspace folder checks; `runStartChecks` and its problem wording.
- **Reused:** the evaluate-then-act boundary of manual phase recovery (`recoverPhase`): its exclusive checking, completion check, already-complete choice and stop handling. Carry on and start again run inside it.
- **Reused:** the command journal's admission (command ID, status token, digest, busy) for all three new actions, from the browser and the command line; the launch path (`launchSession`, `runProcess`) with its billing, selection and dispatch checks.
- **Reused:** the takeover ownership checks `requireExited`, `captureOwnedProcesses` and `requireNoTerminal` (the carry-on ownership check stands in for `requireTakeoverReturn`), `returningTakeover`, and `reviewMessages` and `resolveMessageHold`.
- **Kept:** Folder missing, continuations, audits, final delivery, usage waits and every held page other than AC-CARRY-06's keep their flows; Folder missing gains only reset (§Reset, Availability). Folder missing's setup panel keeps its own "Start from" wording.
- **Kept:** a hold is released for same-conversation resume only when the saved conversation is readable: `available` in §Whether the conversation can be reopened, which looks only at the folders that hold the file. This design adds a way to end a hold that was never released; it does not otherwise loosen release.
- **Kept:** a Codex safety problem (unresolved cleanup, ambiguous dispatch) blocks every Kiln-started session for the phase, as it blocks Resume today.
- **Kept:** `kiln run` on a PRD with no saved record, or a not-started one, behaves as today, including exiting when a start check fails.

## Architecture

Three structural changes carry the rest.

1. **The start preview moves into the engine.** Documents found's data depends on the starting point, so a not-started engine owns it and recomputes it (§The preview).
2. **The server follows a replaceable engine.** Everything `startLocalServer` serves reads the engine through a holder owned by the run: the snapshot and Documents found, its change listener and the inspection projection it writes, the legacy-session binding, the inspection and control routes (`installInspectionRoutes`), and each event-stream connection's change, Claude account (`engine.claude`), output and partial subscriptions. The run's stop handling closes whichever engine the holder has. Reset swaps the engine; the holder moves every open connection's subscriptions to the new engine, writes the inspection projection from it, and sends the new snapshot, so open pages stay connected.
3. **A phase has a latest conversation, distinct from its latest launch.** A launch that never began a conversation leaves a session record that nothing can resume (§A Stopped Phase's Facts, A session record with no run).

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| The name the computed starting point looks for | `settings.featureBranch` (§The starting point) | AC-FROM-01. On every fresh or reset record it is the name Kiln would give a new branch, and a not-started record from schema 20 keeps the name the person typed |
| Where an existing-branch start reads documents | The whole **What Kiln found** block (PRD, design, assumptions, plan, plan checks) is read from Git at the **start commit** (§The starting point) when the PRD's repository has the chosen branch. Neither of today's checks that compare the person's checkout with Git applies: the base check's PRD tree comparison (`checkPrdTreeAt`) and, for a PRD repository already set up by an earlier failed Start, `checkSetUpPrdTree`. When it doesn't, that repository's entry is cut new and keeps today's reads and checks | AC-FROM-02. A branch someone built phases on necessarily differs from the person's checkout in its Closed lines, so either comparison would refuse every such start, the second one on the retry after a failed Start. Reading everything from the commit sessions start at keeps the purpose of those checks: what the person reviews is what sessions read |
| Which repositories decide whether an existing branch is available | A name is unavailable when any of today's repositories or any repository of the selection's set makes it so (§The branch list, Which repositories) | AC-FROM-05. The list is complete before any branch is chosen and needs no plan read per branch, so failures in unrelated branches' plans never show. It matches today's start checks, which already block Start over a missing repository the checkout's plan names, and the reason names the repository so the person can clear it. A name can therefore read unavailable because of a repository only the checkout's plan names |
| What the branch list computes per name | AC-FROM-03's rows over today's repositories, from refs and local reads, with no fetch; the preview's reads for the selected name only | An origin-only branch's merge base needs a fetch per branch, and the list already needs no plan read per branch (the row above). Row 5 needs no fetch, so no name the table makes unavailable can read available |
| What "closed before the run" means on an existing branch | A leaf Closed in the plan at the start commit. Only the first plan read accepts it on that alone, with no Committed or Pushed check | AC-FROM-02, AC-DEV-03. The person chose the branch as it stands; AC-FROM-03 allows uncommitted files and an unpushed local branch, either of which would fail today's evidence check for an externally closed leaf |
| Uncommitted PRD documents in an adopted worktree | Start is unavailable while the worktree's uncommitted or untracked files touch the PRD directory (AC-FROM-03 row 6) | The preview reads committed documents and the run reads the worktree's files (`readPlan` observes the worktree). A Closed line present in only one would start the run at a plan stop. Other uncommitted files are counted and allowed (AC-FROM-03 row 6) |
| Where the preview carries a worktree | On its repository's `start.repositories` entry (§The preview) | One source of facts per repository, as today's repository rows are, meets AC-FROM-03 (each adopted worktree's uncommitted files are counted) and AC-FROM-05 (one workspace folder for several worktrees). The mockup draws no Documents found with several repositories, so the help line's wording is not drawn |
| A branch with a rebase or bisect in progress in another worktree (a detached entry) | The name stays available, and Start fails with git's refusal, which names the folder | Row 6 of §The branch list adopts a worktree only when its `HEAD` is on the branch, and the case is rare |
| A repository's `baseCommit` on an existing branch | The merge base of the branch's tip and the base's tip on origin, and after any catch-up the branch's new tip | Existing readers treat "tip equals `baseCommit`" as "no commits of its own": the Pushed check (`checks.ts`) in a PRD with several repositories, the choice of repositories that need a pull request (`pullRequestRepositoriesNow`) and development delivery's unchanged test and source-work range. The merge base keeps that true at Start. A catch-up moves the tip to the base's tip, so a `baseCommit` left at the old merge base would make the caught-up branch count as having work: a pull request with no commits, and the base's commits read as source work. The two readers of where the run began, the closed-before-the-run set and the delivery history's base range, read `runStartCommit` instead, so a catch-up after Start does not move them |
| Commits of its own | `rev-list --count <base tip on origin>..<branch tip>` | AC-CURRENT-01's definition. A branch whose commits all reached the base by an early merge counts zero, which is right: its tip is an ancestor of the base, so a fast-forward loses nothing, and reset's confirmation says it has none of its own |
| Catch-up mechanics | In the worktree: save `catchUp`, `merge --ff-only <base tip>`, record the fast-forward, then a plain `push origin <branch>` (§Catching a Branch Up). Each step is skipped when already done | Fast-forward and a non-force push cannot rewrite or lose anything, which is what lets Kiln do it unattended (AC-FROM-04). The `catchUp` saved before the fast-forward lets Kiln tell a fast-forward that landed unrecorded from one that never ran, so a retry or the next `kiln run` neither loses a fast-forward that landed nor records one that didn't |
| A failed Start's catch-up rows | A failed Start drops its `branchCatchUps` rows with its existing-branch entries; what moved in git stays | The next preview reads the moved tip anyway. A kept row would be carried by every prompt until a session is told it, which is wrong when the person then picks another branch |
| When a saved `catchUp` is settled | On set-up entries, once, as `kiln run` prepares: after an interrupted setup is finished and before the folder check. An entry not yet set up is finished by Start's steps | Settling first would remove a ticked Start catch-up that never landed, and the run would start on the old tip though its plan was read at the base's tip. Settling before the folder check puts Folder missing and every plan read after it, and the main checkout holds the branch ref while the folder is gone. While Kiln keeps running, a failed save inside a command freezes the journal and leaves the record in memory as the step set it, so no reader sees the gap. Settling must not guess, so a read that fails ends `kiln run` |
| When a stopped phase's catch-up offer is read | With Work, and awaited when a page is opened, as the folder check's read is (§Catching a Branch Up) | A page never opens showing an old offer, so the offer and its count behind (AC-CURRENT-01) are those of the branch as the page opens |
| A conversation began | Claude: a run of the session reported the stream's `init`. Codex: a run has an accepted turn, or its dispatch is ambiguous | AC-CASE-01. A process ID proves only that something spawned; for Codex it is the work server's. An ambiguous Codex dispatch is treated as begun so it keeps today's page and safety rule. It sets the page's case and latest conversation only. Receipts and holds go by the run's reported `init` or `turnId`, once its prompt is submitted |
| Where a stop's reason rows go while there is nothing to check | Below the drawn section's first line (§A Stopped Phase's Facts, Nothing to check yet) | AC-CASE-03, AC-LOOK-01. The drawn line then reads the same with or without rows, and explanation then rows is today's order. No drawn state has a reason row, so the mockup does not settle it |
| Why a conversation can't be reopened | The availability check returns a typed reason with the offending path and defect, not prose | AC-CARRY-02 needs seven distinct wordings, the offending path and a fix command, so the check reports the cause as data and the view words it |
| Carry-on session | A session record for the same phase, launched through the ordinary launch path, and the record marked `startedAs: "carry_on"` (§Carry on, step 3) | AC-CARRY-05. A carry-on is a fresh conversation, so every launch rule applies unchanged: billing, model selection, Codex's skill prompt and one dispatch (AC-CARRY-03). The marker keeps history clear about which sessions continued a stopped phase |
| A launch that reuses a session record with no run | `startedAs` is set on every such launch, to `carry_on` or absent | The record then says how its run started whichever launch comes next, including a restart that relaunches it with the ordinary prompt, and `launchSession`'s reuse of a record with no run is kept |
| Ending a hold without release | A separate ownership check that leaves out the saved conversation and operation-level settlement (§A Held Phase That Can't Be Reopened) | AC-CARRY-06. Release proves the old conversation is safe to reopen. Nothing reopens it here, so what must still hold is exclusive use: the old process, every descendant it was seen to start, and any terminal on that conversation are gone. An operation runs inside the attempt's process or in a process it started, so once all of those have exited nothing the attempt started is running. Settlement can't be required: an operation the process died in never gets a result, so the hold would never end |
| The four `reset.reason` sentences the mockup does not draw | Each keeps the drawn sentence's words and drops only the advice that is not offered (§Reset, Availability) | AC-RESET-02 has the line say to stop the session with Pause & take over "where offered", or to pause after and reset once it ends. A Codex session never offers take-over, and Kiln's own work is not a session. The mockup draws only the first sentence |
| How reset discards | Replace `prd.json` with a fresh not-started record first, then delete the rest of the state directory, keeping the instance lock and the journal's reset receipts (§Doing it, steps 3 and 4) | AC-RESET-04. Replacing the record first means every reader sees either the old run or a clean not-started PRD, never a half-deleted one. The receipt holds the new execution ID before the record changes, so the next `kiln run` can tell from it which steps a crash or a step that threw left (§Doing it, Recovery) |
| Reset in a running Kiln | The run builds a not-started engine in the same process (§Reset, Doing it), keeping the server, port and page token, unless a step throws (the next row) | AC-RESET-04 has the open page show Documents found. Restarting the process would drop the page and the bot's connection. The token is the page's credential, not progress |
| A reset step that throws | The run ends with exit 1 (§Doing it, A step that fails) | After step 1 no engine is left to serve, and exit 1 is the run's existing way to stop when it cannot go on. The receipt on disk tells the next `kiln run` what remains |
| The reset's own receipt | The ordinary journal receipt for the `reset` instruction, settled by the old journal, or by the next `kiln run` after a step that threw, and kept through the discard with its `control-index` entry and the sequence cursor | AC-RESET-06. The journal already answers a retry from the receipt before any eligibility or token check (`submitValidated`), and `kiln command-status` already finds a receipt of any execution (`lookupReceipt`: the index, else a scan of every execution's directory). Keeping the one file keeps both working with no second store or reader |
| Rerunning start checks after a reset | On every event-stream connection before Start, whatever the last report said (§Doing it, Start checks on the page) | AC-RESET-04. A pass can go stale too, the step is about four local calls, and one rule is simpler than a second condition |
| When `POST /api/reset` answers | After the new engine is published, or with 500 `restart_required` when a step fails after the engine stopped (§Doing it) | Its response then carries a token the next action is accepted on. A failed step leaves no engine to accept one, so the response says to run `kiln run` again |
| Command names | `carry-on`, `start-again`, `reset` | AC-CARRY-04 forbids a name that promises to resume. `continue` already means "go on from a pause". The names follow the buttons |
| Where the commands go in `kiln --help` | `carry-on` and `start-again` under **Answer a stopped phase**; `reset` alone in a new last group, **Start over**; a group's names may take more than one line (§Command line) | Reset answers no stopped phase and looks at nothing, so it fits no existing group, and the 80-character line limit the earlier design sets forces the longer group onto a second line |
| What the run's terminal prints after a reset | One `Reset` line in the Started line's form, and no Documents found line (§Reset, Doing it) | One line consistent with the terminal's other state-change lines that claims nothing about the start checks, which may fail after a reset |

## Starting From a Branch (AC-FROM-01 to 05)

### The starting point

Until Start, a record with no `start` gets its choice computed at each preview. `from` is `existing` when a branch named `settings.featureBranch` exists in any of the PRD's repositories, local or on origin, and `new` otherwise. `bringUpToDate` is true. `settings.featureBranch` holds the new name or the chosen existing branch, and keeps the name the first `kiln run` or a reset saved until one is typed or chosen. `POST /api/settings` saves `start` whenever it changes `start` or the feature branch, and Start saves the `start` its preview used. Switching to `new` keeps the name, so today's "That branch already exists" message shows until a new name is typed. Switching to `existing` while the name isn't listed selects the list's first available name.

**The start commit** is where the first session starts in the PRD's repository, and **What Kiln found** is read there. With a new feature branch it is the base's tip on origin. With an existing branch it is that branch's tip in the PRD's repository, or the base's tip on origin while the offer is ticked and that repository qualifies. When the PRD's repository doesn't have the chosen branch, its branch is cut from its base (AC-FROM-05), so the start commit is the base's tip on origin. Its entry is then a new-branch entry: it holds only `baseCommit`, today's reads and checks apply, including the checkout-equals-base document check (`checkPrdTreeAt`), `planSource.kind` is `base`, and the offer never moves it.

### The branch list

One list for the PRD: every local and origin branch name in each of today's repositories, which are the PRD's repository and the repositories the checkout's plan names, found by the start checks. Each name is classified per repository by the first row of AC-FROM-03's table that fits, and is unavailable for the PRD when any repository makes it so, naming that repository.

| Row | How Kiln tells |
|---|---|
| The base branch | The name equals that repository's base |
| Another started PRD's feature branch | A saved record under the state root, other than this PRD's, that is started and names this repository's main checkout with this feature branch, an earlier execution's branch included |
| In the person's own checkout | A `worktree list` entry for the branch at the repository's main checkout |
| Recorded at a folder that is gone or holds something else | An entry for the branch, not locked `initializing`, whose folder the folder check's predicate finds `missing` or `holds_something_else`; this includes every entry git marks `prunable`. The reason names the folder, what is there, and `git worktree prune`. For a locked entry it is preceded by `git worktree unlock <folder>`. For a folder holding a checkout, which git never prunes, it is preceded by moving that checkout away |
| Behind or diverged from the remote's | Local and origin tips differ and origin's tip is not an ancestor of the local one. When origin's tip is not among the repository's objects (`cat-file -e`) it is not an ancestor; otherwise `merge-base --is-ancestor` decides, and an exit other than 0 or 1 is a failed read |
| In another worktree | An entry for the branch at a path that passes the folder check's predicate. The worktree's `HEAD` must be on the branch. This includes the checkout the PRD path given to `kiln run` is in, when that checkout is a linked worktree |
| Checked out nowhere | None of the above; local, origin-only, or both at the same tip or local ahead |

An entry for the branch locked `initializing` makes the name unavailable with today's half-made message (`halfMadeMessage`), whatever its folder holds; rows 4 and 6 exclude it. A detached entry is not an entry for the branch: a rebase or bisect of the branch in progress there leaves the name available, and Start fails with git's refusal (§Start, Failure).

A read the classification needs that fails makes the name unavailable with the read named, never silently available. The list's `available` comes from AC-FROM-03's rows over today's repositories, read with no fetch. Only the selected name gets the preview's reads (§The preview): the selection's repositories and workspace folder, its objects, merge base, commits of its own, how far behind, and the start commit's documents and plan. A selected branch with no merge base with its base shows that as the field's message under **Feature branch**, as a document problem does, and Start is unavailable.

With an existing branch selected, **Feature branch** lists every name, available or not, by name alone. An unavailable name can be selected, and is selected when it is the default (§The starting point). Its reason is the field's message under **Feature branch**, where the preview's document problem shows, and Start is unavailable while the message shows. For the base branch the message reads "That's the base branch. Choose A new feature branch to start from it." For rows 2 to 5 it names the PRD, or the checkout folder, or gives row 4's reason, or says Kiln's first push would be rejected. With several repositories it starts with the repository's name. Today's "That branch already exists" message doesn't apply while `existing` is selected.

**Several repositories (AC-FROM-05).** A repository of the selection (Which repositories, below) that has the branch uses it; one that doesn't gets it cut from its base as today. The selection's existing worktrees must each sit at `<W>/<repository name>` for one folder `W`; `W` becomes the workspace folder, fixed. Otherwise the branch is unavailable, naming the folders. The selection's repositories without a worktree get `<W>/<name>`, after today's path checks.

**Which repositories (AC-FROM-05).** With an existing branch selected, the PRD's repositories are those an earlier Start set up, the PRD's repository, and the repositories that the plan at the start commit names (`namedRepositories` on the plan `observeGitPlan` reads there). The start commit is read first (§The starting point). Each named repository outside today's repositories is found beside the PRD's repository by the start checks' lookup (`findRepository`), and the chosen name is classified there by the same table. A repository that isn't found makes the name unavailable, with the lookup's problem. The chosen name is unavailable when any of today's repositories or any repository of this set makes it so. Start sets up exactly this set. A repository that the checkout's plan names and the start commit's plan doesn't is not set up. A repository a phase names after Start is added as today. A new-branch start keeps today's repositories.

### The preview

For the selection the engine computes, and digests into `previewId`:

- per repository of the selection (§The branch list, Which repositories): its base tip and, when it has the branch, the branch's tip and where it was read (local or origin), the merge base, commits of its own, how far behind the base, the worktree to adopt and its count of uncommitted files, and the open pull request from the branch into the base if one exists (`gh pr list`, the query the final-delivery check already makes);
- the catch-up offer (§Catching a Branch Up);
- the start commit in the PRD's repository and the documents read there. The plan read there must pass the plan start checks (`readPhasePlan` problems, `planStartProblems`). A branch whose start commit lacks the PRD's documents, or fails those checks, shows the problem on **Feature branch** and Start is unavailable;
- the plan's closed leaves, the first open leaf and the Start label: **Start at Phase N** when some leaves are closed and one is open, **Start** otherwise.

When the pull request read fails, Start stays available, and **Starting lets Kiln** names the read that failed in place of a pull request, since final delivery reads it again. `previewId` digests the read's outcome (the pull request's number, none, or failed), never the error's text.

The worktree of each repository is on its `start.repositories` entry, and the one-repository screen reads its only entry for **Worktree**. With several repositories, when the selection has existing worktrees, **Workspace folder** shows `W`, fixed (§The branch list, Several repositories); when it has none, the field is editable as today. Its help line names each adopted worktree's repository with its count of uncommitted files.

The engine recomputes the preview when a view connects to the event stream, when `POST /api/settings` changes `start`, the feature branch or a base, and at Start (§Start). Nothing watches refs; a moved ref is read at the next of these.

A new-branch start keeps today's reads and checks, including the checkout-equals-base document check, and its preview says the plan is read from the base branch.

### Start

Start submits `previewId`. Kiln recomputes the preview and refuses `start_changed` (409) with the refreshed page when it differs. Then one save records `startedAt` and every repository's entry, before any git write. An existing-branch entry, for a repository that has the chosen branch, holds `baseCommit` (the merge base) and `runStartCommit` (the branch's tip). It also holds `adoptedWorktree` when adopted. When the offer is ticked and the repository qualifies, it holds `catchUp` from that tip to the base tip the preview read. A new-branch entry holds `baseCommit` as today.

Then, per repository in list order, an existing-branch entry is set up in three steps. Each step is skipped when its effect is already there.

1. **Local branch.** With no local branch, and origin's copy at `runStartCommit` or `catchUp.to`, Kiln brings the tip's objects in and creates the local branch with its upstream, as Folder missing's existing-branch start does.
2. **Branch check and worktree.** The local branch must be at `runStartCommit`, or at `catchUp.to` while that is saved. Origin's copy must not be ahead of it or diverged from it (the branch list's fifth row). Otherwise the step fails, naming the tip that moved. Then `git worktree add <folder> <branch>` runs. An adopted worktree, or one already at the folder on the branch, is re-verified with the folder check's predicate, and fails with today's half-made message when Git has left its entry `locked initializing`.
3. **Catch-up**, while `catchUp` is saved or this Start's catch-up is not yet pushed, by §Catching a Branch Up's steps. The step fails if a fast-forward that has not landed finds the branch no longer qualifies.

The entry is then marked set up. A new-branch entry is set up exactly as today, with today's check that the branch is Kiln's and today's undo.

**Failure.** A failed step ends Start, clears `startedAt` and `refinementConfirmedAt` as today, and shows Documents found with the error. A new-branch entry set up before the failure stays set up, so the feature branch and workspace folder stay fixed as today. The failing new-branch entry gets today's undo, and one not reached loses its `baseCommit`. Every existing-branch entry loses what this Start gave it (`baseCommit`, `runStartCommit`, `adoptedWorktree`, `catchUp`, `setupCompletedAt`), whether it was set up, failing or not reached, and is never marked as Kiln's branch. Entries left holding nothing are dropped, as today, and so are this Start's `branchCatchUps` rows. Kiln removes nothing in git. A local branch, worktree or catch-up left behind is classified by the branch list on the next visit, so the next Start adopts it.

**Interruption.** Kiln stopping mid-Start keeps the record. The next `kiln run` finishes each entry not yet set up with these same steps before it serves the page, as it finishes an interrupted setup today. There, step 3 completes the saved `catchUp` to its own `to`, the base tip the preview read and the place the record's plan and the start commit were read. A fast-forward that landed is recorded and pushed whatever else has changed. One that did not land runs only while the branch still qualifies against that `to`, and otherwise fails as Failure says. A step that then fails ends as Failure says, and `kiln run` opens Documents found with the error.

The record's plan at Start is the plan the preview showed.

### After Start

- **Closed before the run.** On a start from an existing branch, only the first plan read (`readPlan` with no earlier baseline) accepts each leaf Closed at the PRD repository's start commit (its `runStartCommit`, or its `baseCommit` when its branch is cut new) as an outside completion at that commit, with its scope repositories and each set-up repository's `runStartCommit`, or `baseCommit` where the branch was cut new, as its revisions. This comes before the published-base proof and the evidence check, which still apply to any other closed leaf. That includes a leaf that becomes Closed after Start, such as one a catch-up at a stopped phase brings in from the base: when no session of the run ran it, the next plan read needs its completion evidence (the Closed line, and every set-up repository clean and pushed, or, with several repositories, still at its `baseCommit`), and today's development-delivery check when delivery is on. A failure is a plan stop that names the leaf. The catch-up meets that evidence in each repository it moves, because a branch qualifies only when it is clean and the catch-up leaves it at origin; a fast-forward settled before its push meets it only with several repositories, at the entry's `baseCommit`. A repository it did not move must meet it in its own right. A stopped phase that itself arrives Closed is judged by its completion check when its next session ends. Development delivery's "closed before the run" set (`leavesClosedAtRunBase`, read at `baseCommit` today) is read at `runStartCommit` when the entry has one, as is the start of the delivery history's base range.
- **Sessions are told.** While an adopted worktree has uncommitted files and no run of the PRD's sessions has reported Claude `init` or a Codex `turnId`, every prompt Kiln sends at a launch or resume gets one added paragraph: how many files in each such worktree, counted when the prompt is built, and to look before building. A count of zero adds nothing.
- **Pull requests (AC-FROM-04).** Final delivery is unchanged: its check already passes on the branch's open, ready pull request into the base, and its prompt already tells the session not to open a second. The preview names that pull request in **Starting lets Kiln**.
- **Git limits.** Sessions commit and push as today. Kiln's own writes to an existing branch are the worktree and local-branch setup above and the catch-up, nothing else.

## Catching a Branch Up (AC-CURRENT-01)

A repository's branch **qualifies** when all hold, read at the moment of use:

- its tip has no commits of its own (Design Decisions);
- its worktree, when it has one, is on the branch with nothing uncommitted (`status --porcelain --untracked-files=all` is empty);
- the local tip, or origin's copy of the branch, is behind the base's tip on origin.

The offer exists when any of the PRD's repositories qualifies, and lists each with its count behind. A stopped phase's offer is read with Work (§A Stopped Phase's Facts), at Work's moments and from the same reads, with the branch and the base asked of origin in one `ls-remote`. The engine keeps the latest read for the snapshot, and there is no offer until the first read finishes. When a page is opened, that read finishes before the first snapshot, as the folder check does. A read that fails gives no offer, and the page names the read through Work's unknown state. A press reads again, so an offer read before the base moved catches the branch up to the base's newer tip, and one read before the branch gained commits returns `branch_changed`.

Doing it, per qualifying repository in list order:

1. One save records `catchUp` on the entry: `from` the local tip, `to` the base's tip on origin. Start's own save already holds it.
2. Bring `to`'s objects in and run `merge --ff-only <to>` in the worktree.
3. One save records the fast-forward: the `branchCatchUps` row from `from` to `to`, the moved commits, and `catchUp` removed. At Start, `runStartCommit` and `baseCommit` become `to`. At a stop, in that repository, `runStartCommit` takes the entry's `baseCommit` when it has none, then `baseCommit` and the stopped phase's start commit become `to`. Earlier phases' start commits never move.
4. `git push origin <branch>` when origin's copy is not at the local tip.

Steps 1 and 2 run when the local tip is behind the base's tip, step 3 while `catchUp` is saved. A branch fast-forwarded but not pushed still qualifies, because origin's copy is behind, so a retry only pushes it. On any failure nothing starts, and the reason is shown where the action was pressed. What already moved stays moved and recorded, and the failed receipt's `branch_catch_up` lists it.

A `catchUp` still saved on a set-up entry, after Kiln stopped or a save failed, is settled as `kiln run` prepares. This happens after an interrupted setup is finished and before the folder check, so it comes before the plan read and before Folder missing. The local tip is read as `refs/heads/<branch>` in the repository's main checkout, so settling works while the worktree folder is missing. When `to` is that tip or an ancestor of it, the fast-forward landed and step 3's save records it. Otherwise `catchUp` is removed. A read that fails ends `kiln run` and names the read. An entry not yet set up is finished by Start's steps instead (§Start, Interruption). While Kiln keeps running after a failed save, the record in memory keeps what the step set, and the journal's fault refuses every later save and dispatch until Kiln restarts. Every reader, including Work when a page is opened, therefore sees the moved tip. After settling, a start with the box unticked or `--leave-branch-as-is` starts on the branch as it stands. When the fast-forward landed, that is `to`, and the prompt carries the catch-up. In a PRD with one repository the Pushed check then asks the session to push, as for any commit not on origin. With several repositories that check passes while the tip is the entry's `baseCommit`, so the branch reaches origin with the session's first push in that repository or with the next catch-up. When it did not land, nothing moved and nothing is told.

Each catch-up is told in one sentence: which branch moved, from and to which commit. Every prompt Kiln sends at a launch or resume carries it until it is told. It is told when a run whose prompt carried it reports Claude `init` or a Codex `turnId`, the report that settles a receipt `started` or `resumed`. A launch that fails, is held or is interrupted before then tells nothing, so start again, carry on and a resume repeat it. Both additions, this sentence and §After Start's uncommitted-files paragraph, go at the end of the prompt, in `runProcess` after the billing check, so the phase, start-again, carry-on and resume prompts all carry them.

A branch qualifies only with nothing of its own, so nothing unmerged is lost. Moving the phase's start keeps the base's commits out of its commit count and its recorded commit range, as well as its work (§A Stopped Phase's Facts); a commit of the phase that reached the base by an early merge is one of them.

| Where | Behavior |
|---|---|
| Documents found, existing branch | `start.bringUpToDate` decides. Ticked, the plan is read at the start commit (§The starting point, AC-FROM-02) and the catch-up is each existing-branch entry's last setup step (§Start, step 3) |
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

A phase is **held** while the run record carries `liveControl`, in either state, `pending` or `released`, and of either kind, takeover or `delivery_recovery`. A Codex phase is never held, since live control covers Claude sessions only (Kiln Live Session Control, SCOPE-001). `released` means the conversation is ready for the terminal; it does not end the hold. The hold ends when `liveControl` is removed: when a resumed or carry-on run's prompt is submitted and the run reports Claude `init`, on a successful advance or Mark complete, or on Folder missing's Start. A resumed or carry-on run that ends without that report leaves the phase held. While a phase is held it is not a stopped phase: its page keeps today's headline and controls, apart from the reset line, AC-CARRY-06's case and a launch hold's page. It gets no catch-up offer, and no reply, resume, carry-on or start-again catches its branch up, from the page or the command line, whatever `bringUpToDate` or `--leave-branch-as-is` says. Once the hold has ended, a later stop of that phase is a stopped phase like any other.

For a stopped phase the engine derives, and the snapshot carries:

**Conversation began.** Per Design Decisions, over every session of the phase. The **latest conversation** is the last session in the phase's list that began one.

**Latest launch.** The phase's latest launch is the session whose latest run started last. A resume is a run of the session it reopens, so a failed resume leaves that session the latest launch, with its conversation begun.

**A session record with no run.** A launch writes its session record before any run, so a launch that is held, or fails before it runs, leaves a record with no run. Such a record is never the latest launch or the latest conversation. Resume, reply, the terminal command, `ReopenCheck` and the recovery target read the latest conversation, or the latest launch when none began. Everything about an attempt reads the latest launch: the first card, the attempt's start time, the running attempt's live controls, judging a run's end (whether a run was added, an interruption, a usage-limit refusal, `not_resumable`), stopping a leftover process, and `kiln status`'s saved session. A billing hold's recheck reads the hold's own session, so a launch hold is rechecked as a launch. The recovery target exists, as today, only when its session has a run that spawned. It never exists during a launch hold, which keeps `NeedsYou` with resume and reply unoffered. Only the next launch reads the phase's last record. It reuses a last record with no run, as today, and sets `startedAs` for that launch: `carry_on` or absent.

**Work.** Per set-up repository: commits reachable from the feature branch's tip but not from the phase's start commit there nor from the base's tip on origin; and the count of uncommitted files in the worktree. A phase **built nothing** when every repository has zero of both. Work is read when the stop is recorded, at each recheck, when the page is opened or reloaded, and before a session starts, and the catch-up offer is read with it (§Catching a Branch Up). When a read fails, work is unknown: the page names the read, uses today's headline and shows today's checks. A hold with `history` set has work too (§A Held Phase That Can't Be Reopened).

**Case.** `could_not_start` when no session began a conversation; `built_nothing` when one did and the phase built nothing; `needs_input` otherwise, today's page. The headline, the duration line (`conversationRanMs`: the running time the phase rows show, `runTiming`'s `runningMs` over the latest conversation's runs, a run with no recorded end ending at its last saved output) and the first card follow AC-CASE-01 and AC-CASE-04. The first card is **What Kiln found**, drawn from `launchFailure`, when that is set; any earlier conversation's last message follows it. Otherwise it is today's **Last message from**, giving the latest launch's last recorded final message (the one the carry-on prompt carries), or its last lines when none was recorded. Under its facts row, a resume that couldn't spawn shows today's spawn-error warning line.

**`launchFailure`** is set when the latest launch has a run and never began a conversation. `ran` is `claude` or `codex`. `folder` is `workingDirectoryOf(session)`, and `at` is the run's start. `sentence` is the card's sentence from the table below, which calls the folder "the worktree" when it is the PRD's worktree, and `<folder>` otherwise. `error` is shown in the block below it, then the facts row "Kiln · launch failed · `<at>` · no conversation". "Last output lines" means the session's last 10 saved output lines, the reader the ended-early page uses. The first matching row applies.

| The run | Sentence | `error` |
|---|---|---|
| Codex refused before its work server (`spawnError.code` `CODEX_PREFLIGHT`) | Kiln ran `codex` in the worktree, and it couldn't start a session. | `spawnError.message` |
| No process started (no `pid`) | Kiln ran `<ran>` in the worktree, and the computer couldn't start it. | Claude: last output lines. Codex: `run.codex.failure` |
| Interrupted (`interruptedBy`) | Kiln ran `<ran>` in the worktree, and it was interrupted (`<cause>`) before beginning a conversation. | Claude: last output lines. Codex: `run.codex.failure`, else last output lines |
| Claude exited (`exitCode` or `signal`) | Kiln ran `claude` in the worktree, and it exited with code N (or: was ended by `<signal>`) before beginning a conversation. | Last output lines, ending with its exit line |
| Codex stopped (`run.codex.failure`) | Kiln ran `codex` in the worktree, and it stopped before beginning a conversation. | `run.codex.failure` |
| No end recorded | Kiln ran `<ran>` in the worktree, and it stopped before beginning a conversation. | Last output lines, or "Kiln recorded no output." |

`<cause>` is the resume prompt's existing cause wording: Ctrl+C, the terminal closed, Kiln was stopped, or the computer slept. A Claude spawn failure saves one line, "Couldn't start claude in `<folder>`: `<message>`", which is the drawn block.

A launch held before Kiln runs anything, for billing approval or Claude's selection check, adds no run, so it never sets `launchFailure`. A Codex first launch whose settings fail verification is a `selection` stop and keeps today's page, and a usage limit never arrives before a conversation begins, so neither shows the card.

A stopped phase keeps today's choice of page: `PhaseHandoff` when it has a recovery target, `NeedsYou` otherwise. Each renders the case, first card and controls from these facts. A phase none of whose sessions began a conversation shows the couldn't-start page on either one: `PhaseHandoff` when its latest launch spawned, `NeedsYou` when it didn't. The recheck stays the page's own, `verify-and-advance` or `check-again`, and is **Check Phase N anyway**. A phase that began a conversation always has a target, so a failed carry-on leaves it on `PhaseHandoff`.

**Nothing to check yet (AC-CASE-03).** While the phase built nothing and the stop's check run is the stop's own (`run.origin` is `stop`), the snapshot sets `nothingToCheck` and the view shows the drawn section in place of the checks. `CheckResult.reason?: true` marks a row that reports why the phase stopped rather than what its work satisfies. It is set where the row is made: the agent recovery rows (Claude recovery, Codex recovery, Recovered conversation), Codex process cleanup and dispatch, the launch rows (Billing approval, Agent selection and readiness, Codex launch settings, Preparation permissions), Completion audit readiness, Phase plan reads, and the preparation rows (Prerequisite preparation, Preparation recovery, Prepared checkpoint). A stop row saved before schema 21 is marked by those names when read. Mark complete needs a finished recheck, so it is never offered while `nothingToCheck` is set. **Check Phase N anyway** is today's recheck. Its rows replace the stop's rows and all of them show as today. The Mark complete offer gains `builtNothing`, which selects the sentence above it.

On both pages the drawn section takes the place of the page's whole check card: the **Is Phase N already done?** card on `PhaseHandoff`, and the side card on `NeedsYou`. `NeedsYou` then drops its side column, and the section follows the page's cards as drawn. The section's first line is the drawn text, with **Check Phase N anyway** beside it, keeping today's checking label and refresh warning. Each row with `reason` shows below that line, in today's row markup (`CheckFacts`).

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
| `reopen_failed` | The latest conversation is Claude's, and its last run is a resumed run (cause other than `launch`) that spawned and ended, with its exit code or signal recorded, without reporting `init`. A run whose end Kiln recorded only as an observed exit, as a recovered process's is after Kiln was stopped outright, is not this reason: Kiln never read its stream. It is read from that run, never from the stop's kind, so it still holds after a carry-on fails and its `done_check` stop replaces the `not_resumable` one. A hold's check never gives this reason, because release reads the file alone. A resume that couldn't spawn is never this reason: the check reads the file as for any stop, so reply and resume stay offered while it is `available` | 6 |
| `codex` | A Codex conversation with no safety problem, for a cause in the Codex table below | 7 |

`fixCommand` is given only when `defects` is exactly `writable_by_others`: `chmod o-w <path>` for a folder, `chmod go-w <path>` for the file, with `<path>` absolute and shell-quoted. Running it makes that path pass, and **Check again** names the next path that fails, if any. A link, another owner, or more than one defect gets no command.

For Codex, `state: "safety"` comes from the phase's Codex safety problems: cleanup unresolved, or dispatch ambiguous (`codexSafetyProblems`, without launch-settings verification). `problems` holds their recorded sentences. A launch-settings verification failure is not a safety problem. Otherwise `reason: "codex"`, with `detail` from the first row that applies; with neither, the check is `available`:

| Codex cause | `detail` | Read from |
|---|---|---|
| The recorded folder is neither the session folder nor a set-up worktree, while the run is underway | Codex reopens this conversation only in `<recorded folder>`, which is no longer this run's folder. | The session's `workingDirectory`, compared at each snapshot build as `transcriptMissing` compares it |
| Kiln's last read of the thread failed | `resumeError` as recorded: "Codex conversation cannot be opened: `<cause>`". The cause is the app server failing to start or exiting, a Codex RPC error, a different thread identity, the 30-second deadline, or a malformed or oversized reply | `session.codex.resumeError` |

A conversation that began always has a `threadId`, so no row covers a missing ID. A Codex `not_resumable` stop comes from these same conditions, so it reads `codex`, never `reopen_failed`.

For Claude, one function decides `available` and returns the typed reasons above; resume's offer, the page and a hold's release (`requireHistory`) all read it. `available` means the file is found, holds a usable message by `claudeHistoryAvailability`'s rule, and every line is JSON or cut off, read to the end within the read deadline and the size Kiln reads per record. Any other outcome is the matching reason. With one predicate, a page never offers resume for a conversation release would refuse, and a hold never waits on a conversation the page calls reopenable.

For Claude the check runs at every snapshot build, as the transcript check does today, so on a stopped phase **Check again**, **Check Phase N again** and **Check Phase N anyway** need only republish; on a held page **Check again** does more (§A Held Phase That Can't Be Reopened). For Codex a snapshot build reads only the recorded facts above and starts no process. **Check again** runs `readCodexAvailability` on the latest conversation (one evidence-only Codex app server, `thread/read` only, 30 seconds at most), records or clears `resumeError`, then republishes. With no `codex` executable found it records nothing, and the card keeps the recorded result. **Check Phase N again** and **Check Phase N anyway** re-read through the completion check's `refreshCodexConversations`. A phase where no session accepted a turn, and none has an ambiguous dispatch, is `could_not_start` and never gets a `ReopenCheck`.

A conversation that reads as available again brings back reply and resume with no restart. `reopen_failed` is a recorded fact about an attempt and does not clear on a re-read.

The reply card follows AC-CARRY-01: `available` gives today's card; `unavailable` gives the carry-on card beside the fresh-session terminal card; `safety` gives today's **Conversation recovery unavailable**. Resume's offer, the reply card and the terminal's resume command go by `ReopenCheck`, never by the stop's kind. So after a failed carry-on the carry-on card returns, and reply and resume stay unoffered.

### Carry on

Action `carry-on`, inputs `{ message?, leave_branch?, reviewed_receipt_ids?, live_target? }`. Offered when the phase is stopped, a conversation began, and `ReopenCheck` is `unavailable`; or on AC-CARRY-06's held page. Inside the recovery boundary:

1. Run the completion check. Complete returns `phase_already_complete`: nothing starts, the reply is kept unsent, and the page shows today's already-complete choice. Unavailable returns `check_unavailable`.
2. Catch the branch up when it applies.
3. Write a session record for the phase, new or the phase's last one when it has no run, marked `startedAs: "carry_on"`, and launch it (cause `launch`) in the phase's worktree with the carry-on prompt.
4. Just before dispatch, after the billing check, the launch runs the step a resumed run uses, and the phase's stop clears. A launch that fails after that ends through the ordinary session-end path. The completion check records a new `done_check` stop, as for a first launch that fails, and the session stays in history. The new stop's rows are that check's. Its check run is the stop's own (`origin: stop`), so AC-CASE-03's Nothing to check yet applies to it as to any stop. A failed carry-on from a hold leaves the hold and its page, and a billing hold at that launch shows the launch hold's page while it lasts (§A Held Phase That Can't Be Reopened, Carry on from a hold). From a stopped phase, a billing hold at the launch is a launch hold (§A Stopped Phase's Facts), and it leaves the stop. Once the launch hold clears, the stop offers **Send reply & continue** again, which rebuilds the prompt and takes the reply afresh.

The **carry-on prompt** is its own template: the phase's fresh-session prompt, then the person's reply when there is one (with the reply policy a resume note gets), the latest conversation's last message verbatim or a line saying none was recorded, and the phase's work: each repository's commits (short SHA and subject) and its uncommitted file count. A last message over 16,000 characters is cut there, saying so.

The new session is judged by the completion check when it ends, like any session.

### Start again

Action `start-again`, inputs `{ leave_branch? }`, with no recovery target: the route refuses a request without `X-Kiln-Status` (400), as Mark complete does, and the status token changes with the stop, its phase and its check run. Offered when the phase is stopped and no session of it began a conversation. It catches the branch up when that applies, then launches the phase's first session again with the ordinary phase prompt in a session record, new or the phase's last one when it has no run. Its stop clears, and a failure records a new stop, as in §Carry on step 4. That session record carries no marker. A session that follows sessions that never began a conversation is a start again. It takes no reply. It does not run the completion check first: the page offers **Check Phase N anyway** for that.

### Limits (AC-CARRY-03)

Both actions are unavailable, with the reason, while Kiln is checking, dispatching or running a session, and while a billing restriction would stop a launch (the launch path's own check, surfaced as the control's reason before the press). **Start again** is also unavailable on a Codex safety problem; carry on is never offered then. The journal admits one instruction at a time and the status token changes when a session starts, so a second press starts nothing.

### Resuming after a failed launch

When a later launch of the phase began no conversation, a resumed run is recorded on the latest conversation's session, the earlier one, which makes it the latest launch again (§A Stopped Phase's Facts) whether or not the resume spawned; it is also the session the hold names.

## A Held Phase That Can't Be Reopened (AC-CARRY-06)

While a hold is pending and its attempt's process has exited, each takeover reconciliation, including the one **Check again** runs, also computes the `ReopenCheck` for the hold's conversation. It saves the check on the hold as `history` when it is `unavailable`, and removes `history` when it is `available`. Release then proceeds as today, and the page returns to today's held page: `pending` until release passes, `released` once it does. Release's own path stops at `requireHistory`, before its process checks, so for a hold with `history` reconciliation runs the **carry-on ownership check** in its place and saves its obstacle, if any, as the hold's reason:

- the attempt's process has exited and its final observations are saved (no running adapter for that attempt);
- for an attempt with a gate: a fresh `captureOwnedProcesses` succeeds, leaving no unresolved process observation or obstacle, and every tracked identity has exited (`requireExited` for each);
- no terminal is open on the conversation (`requireNoTerminal`).

It does not replay the transcript or require `unsettled(gate)` to be empty. The one case it can't see is a descendant that detached from the attempt between two of the scanner's 250 ms inventories; Live Session Control accepted the same bound for release (its Q2: containment of arbitrary downstream shell or remote effects is not part of AC-TAKE-02 or AC-TAKE-04).

A hold with `history` set stays `pending`: it is never reported as released, and nothing that requires release changes.

**The page.** A hold with `history` set shows the carry-on card (with its reason and **Check again**, which runs takeover reconciliation on the hold's conversation) beside the fresh-session terminal card, in place of the wait text and card. **Send reply & continue** and the terminal card's copy buttons are unavailable while the ownership check has an obstacle, showing it. Each uncertain message shows above the cards with **I reviewed this message in the conversation** (AC-CARRY-06). Work is also computed for a hold with `history` set, the same way as for a stopped phase: from the held phase's start commit in each repository (`RepositoryPhaseFacts.startCommit`). No catch-up moves it, since carrying on from a hold skips catch-up. It is read when `history` is saved, at **Check again**, when the page is opened or reloaded, and before the carry-on session starts. It is carried in `needsYou.work`. The held page renders it as the card's "Phase N's work so far" row, and the carry-on prompt's work section reads it as for a stopped phase. The headline is today's for the hold's kind and the page keeps today's checks, so `case`, `nothingToCheck` and `markComplete.builtNothing` stay absent.

**Carry on from a hold.** Before step 1 of §Carry on: every uncertain message is acknowledged (acknowledgements sent with the command are applied first), and the ownership check passes. The catch-up step is skipped. The launch path runs the carry-on ownership check on the hold's conversation in place of `requireTakeoverReturn`, and its pre-prompt guard does the same: no terminal on the hold's conversation, with the activity-material comparison unchanged, and no `requireHistory` for either conversation. A check that fails there fails the command, with `effects.session` `not_started`: `terminal_in_use` when a terminal is open on the conversation, and `ownership_unknown` for any other failure, a failed process inventory or identity read included. `takeover_pending` never reaches the command: until the attempt and its adapter have ended, carry-on is not offered and the command is refused `control_unavailable`. The carry-on reuses `returningTakeover`. The hold ends, with its acknowledged messages resolved, when the new run's prompt is submitted and the run reports Claude `init`, the condition that makes the receipt `started` (§Command line). A launch that ends before then leaves the hold `pending` and clears `returningTakeover`. A billing hold at that launch is a launch hold, and its page shows while it lasts. The phase's own hold stays `pending` with `history`, `returningTakeover` is cleared, and once the billing hold clears the held page and its carry-on card return. Until the hold ends, the hold is the page's live target: **Message Claude** and **Pause & take over** are unavailable for the new attempt, whatever the hold's kind, with the reason that the session is starting, and each becomes available on the new attempt once the hold ends. An uncertain message is not added to the prompt.

**Advance from a hold.** The already-complete choice's advance, for a hold with `history` set, uses the same two preconditions in place of release, then accepts completion and ends the hold as a released hand-back does. Verify and Mark complete on the page are unchanged and stay unavailable until release, as AC-CARRY-06 changes only the carry-on button's path.

**Bots.** `kiln status` lists `carry-on` as available under the same conditions. `kiln handoff` returns the fresh-session instructions, and no resume command, when the hold has `history` set and the ownership check passes.

## Reset (AC-RESET-01 to 06)

### Availability

`reset` is a control of every started PRD: `startedAt` is set, whatever the screen (Needs you, a wait, a pause, Folder missing, Complete). It is unavailable while Kiln is working: a session process is running or being watched, the engine is driving, checking, setting up, reading a completed plan, saving billing or delivery state, running a Folder missing start, or stopping, or another instruction is pending. A held phase whose attempt has ended is not working. `controlView()` computes `reset` with the other controls, so the page's `controlToken` and `kiln status`'s `status_token` are the same value and give the same availability on every screen. The snapshot carries `reset: { available, reason? }`. The view renders the reset line once, after everything else on the page, Earlier deliveries included. It shows on every screen, the phase detail screen included, while `snapshot.reset` is present, so Documents found never has it. It is the drawn footer: a rule, then the text with **Reset Kiln for this PRD** beside it. While reset is available the text reads "In a state nothing above fixes? Reset makes Kiln forget its progress on this PRD and takes you back to the first screen. Your branch, worktree and commits are kept." While it is unavailable, the text is `reset.reason` and the button is unavailable. The button is also unavailable while the page is disconnected. Pressing it opens the confirmation in place, below the line in the same footer, with the button marked open. **Cancel** closes it.

`reset.reason` is the first matching row. A session is working while its process is running or being watched. Kiln's own work is the rest of the working listed above. **Pause after** counts as offered while `request-pause` is available and an activity is current, which is when the page shows Pause after this phase or audit.

| Working | Offered | `reset.reason` |
|---|---|---|
| A session | Pause & take over and Pause after | Reset isn't available while a session is working. Stop it now with Pause & take over above, or pause after the current phase or audit and reset once it ends. |
| A session | Pause after | Reset isn't available while a session is working. Pause after the current phase or audit and reset once it ends. |
| A session | otherwise: a pause already requested, a takeover finishing, final delivery, Folder missing | A session is still running. Reset becomes available when it ends. |
| Kiln's own work | Pause after | Reset isn't available while Kiln is working. Pause after the current phase or audit and reset once it ends. |
| Kiln's own work | otherwise | Kiln is still working. Reset becomes available when that work ends. |

While Folder missing is set, reset is the only control left. `kiln status` returns the controller's status token and lists `reset` with its availability, and every other control stays unavailable with Folder missing's reason. `POST /api/reset` joins the routes the folder-missing gate admits, and `applyControl` admits `reset` as it admits `folder-setup-start`. Reset judges nothing and launches nothing, so no folder check runs before it. While Folder missing is set, a session still running makes reset unavailable, with the table's third row as its reason. With no Kiln running, `kiln status` returns no status token and lists `reset` unavailable, like every control.

### The confirmation

Opening it in the reset footer (§Availability) reads `GET /api/reset/preview`, computed at that moment:

```
ResetPreview:
  forgets:  { phaseResults: number, sessions: number, stops: number, waivers: number, audits: number, deliveries: number }
  stays:    [{ repository, branch, ownCommits?: number, worktree?: string, uncommittedFiles?: number,
               pullRequests: [{ number, url }], unknown: string[] }]
  closedOnBranch?: number        // leaves Closed in the plan on the feature branch, PRD's repository
```

Each line shows by what it names (AC-RESET-03). **Kiln forgets:** "Which phase it was on, and each phase's result" and "Its settings for this PRD, which you choose again on the first screen" always show, since every started PRD has both. "Its N session(s) and their output" shows when `forgets.sessions` > 0 ("Its 1 session and its output"). "Stops, completion waivers and audit results" shows when `stops + waivers + audits` > 0, with no count. "Its record of earlier deliveries" shows when `deliveries` > 0. **Stays exactly as it is:** each `stays` entry gives a branch line, "`<branch>`, which has N commits of its own", and, when `worktree` is set, "The worktree folder, with N uncommitted files". Both are named even at zero, written "no commits of its own" and "no uncommitted files". With several repositories each line names its repository. A repository's pull requests show when `pullRequests` is non-empty, each by number. "The phases closed in the plan on the feature branch" shows when `closedOnBranch` > 0. An absent count means the read failed: it is listed in `unknown` (for `closedOnBranch`, the `unknown` of the PRD repository's `stays` entry), its line says Kiln couldn't count it, and the reset is still offered, because it touches none of those things.

### Doing it

Reset is admitted through the command journal like every changing command, as action `reset`; its receipt is saved `in_progress` before any effect. The journal's apply then:

1. stops the engine as the run's stop handling does (`stop`): it saves nothing more and refuses every control, and its git and gh calls, timers, watchers and keep-awake end;
2. computes the `forgets` counts and a new execution ID and checkpoints them on the receipt as `reset`;
3. replaces `prd.json` with a fresh not-started record, as `newPrdRecord` writes one for a first `kiln run`: from the run's PRD location and the old record's `repository.github`, default settings computed without an origin read (`defaultSettings` with no origin, which leaves the PRD repository's base empty and sets no named repository's base), that execution ID and the same page token. It reads nothing from Git or GitHub, so Recovery can repeat it;
4. deletes everything else in the PRD's state directory except `instance.lock`, the files under `controls/` of this and every earlier `reset` receipt, their `control-index` entries when the journal is indexed, and the sequence cursor, then returns outcome `reset`.

The old journal settles the receipt `completed`, outcome `reset`, in its kept file. Once it has (`settled()`), the run:

5. runs the start checks, sets `repository.github` from the report when it has one, fills the named repositories' bases and builds a not-started engine over the new record, as `kiln run` does for a saved not-started record, without exiting when a check fails; and publishes it through the holder, then runs its base check (`checkBase`), as an event-stream connection does, which chooses each empty base from origin.

After the publish, the run's terminal prints one line in the Started line's form, `<time>  Reset  ·  back to Documents found`; Documents found's own line is not printed again, since a reset's start checks may fail.

`POST /api/reset` answers after the publish, with the settled receipt's outcome and the new engine's `controlToken`. `kiln reset` prints the admission receipt, `in_progress`, and exits 0, as every accepted changing command does; `kiln command-status` gives the outcome. Until step 5 publishes the new engine, the old engine's journal answers: a retry of the reset's command ID returns the reset's own receipt, `in_progress` until it settles and `completed` after (`indeterminate` after a step that threw), and any other instruction is refused as an ordinary receipt of the old execution.

**A step that fails.** Once step 1 has stopped the engine, a step that throws leaves the run nothing to serve, so the run ends. When step 2, 3 or 4 throws, the apply throws a `ControlFailure` whose message, the receipt's reason, is "The reset didn't finish: <error>. Run kiln run again to finish it." The journal records the receipt `indeterminate`, as it does for any effect that throws, and the next `kiln run` finishes it (Recovery). When step 2 throws before its checkpoint, the same reason is given, and the next `kiln run` finds nothing to finish and settles the receipt `failed`, `not_applied`. When step 5 throws (the start checks, the PRD tree read or the engine's construction; a check that fails is not a throw), the receipt is already `completed` and the record is not started, so the next `kiln run` is a first run. In both cases `POST /api/reset` answers 500 `{ ok: false, code: "restart_required", reason }`. Step 5's reason is "Kiln was reset but couldn't open Documents found: <error>. Run kiln run again." The terminal prints `kiln: <reason>` on stderr, and the run closes the server, releases the instance lock and exits 1. An open page shows Connection to Kiln lost. After the exit, `kiln command-status` reads the receipt from disk: `indeterminate` with that reason until the next `kiln run`, or `completed`.

The new engine's journal loads the kept receipts with the rest; they belong to earlier executions, so nothing reads them as current. Nothing in any repository, and nothing of Claude Code's or Codex's own, is touched (AC-RESET-05). The port registration (`ports.json`, outside the PRD's state directory) stays.

**Recovery.** Before reading the record, `kiln run` scans the journal's files (`readReceipts`, no journal built) for a `reset` receipt whose stage isn't `settled`: `in_progress`, or `indeterminate` after a step that threw. A receipt with no `reset` field discarded nothing, so Kiln settles it `failed`, `not_applied`. Otherwise Kiln finishes steps 3 and 4, whichever remain (step 3 remains while `prd.json`'s execution ID differs from `reset.new_execution_id`), settles the receipt, and carries on as a first run. A stop after the receipt settled needs nothing, because the record is not started. No reset receipt outlives Recovery unsettled, because the journal built over the fresh record loads every kept receipt and one unsettled receipt would keep it busy.

**Start checks on the page (AC-RESET-04).** An engine built by a reset holds the run's start-check step (`runStartChecks`, the PRD tree read and the document reads). Before Start, on each event-stream connection, it reruns that step before the field checks and replaces its report, PRD tree, plan and named repositories. The rerun looks `gh` up on Kiln's PATH again (`findExecutable`), so installing it clears "gh isn't on the PATH." on reload. The engine keeps the tool paths `kiln run` found, since a `gh` that wasn't found is called by name and resolves through the PATH when called. An engine built by `kiln run` keeps what it was built with. When a check fails, the preview's check list names it in `kiln run`'s words where the passed ones are listed, the documents that could not be read are absent, and Start is unavailable with **Fix what failed, then reload.** `kiln run` from a terminal is unchanged: it prints the failure and exits.

**A reset run from the adopted worktree.** On a page built by a reset, a selection may adopt the checkout the PRD path is in, when that checkout is a linked worktree. For that selection, the uncommitted-files check gives way to AC-FROM-03's row 6 and the Design Decision on uncommitted PRD documents. The files are counted, and only changes in the PRD directory make Start unavailable. For every other selection the check fails as any start check does (above). The start-check report keeps the uncommitted-files result apart from its other problems, so the page applies it per selection and the linked documents are still read. `kiln run` from a terminal is unchanged in every case: in a dirty linked worktree it prints the failure and exits. The person then gives `kiln run` the PRD path in the main checkout, where the worktree is adopted and its files counted, or commits first.

**The receipt (AC-RESET-06).** Once the new engine is published, or a later `kiln run` has loaded the journal, a retry with the same command ID and inputs finds the kept receipt before any eligibility or token check, so it returns the recorded result, `completed` with outcome `reset` or, after Recovery found nothing discarded, `failed` with `not_applied`, and not a stale-token refusal against the new execution. `kiln command-status` finds it as it finds any receipt, through the running Kiln or from disk; one read without a running Kiln while not settled reports `indeterminate`, as today, as does a receipt a step that threw left `indeterminate` (A step that fails), until the next `kiln run` settles it (Recovery).

A reset refused at admission (stale token, busy, unavailable) is an ordinary journal receipt and discards nothing.

## Interfaces

### HTTP (same-origin, token, as today)

| Route | Body | Result |
|---|---|---|
| `POST /api/settings` | adds `start: { from, bringUpToDate }` before Start, saved as §The starting point says | as today; the preview is republished |
| `POST /api/start` | adds `previewId` | adds `start_changed` (409) |
| `POST /api/resume` | adds `bringUpToDate?` | adds `branch_changed` (409), `branch_catch_up_failed` (409, with the reason) |
| `POST /api/carry-on` | `{ note?, bringUpToDate?, reviewedReceiptIds?, target }` with the `X-Kiln-Status` and `X-Kiln-Command-Id` headers Mark complete uses | `{ ok, outcome: "session_started" \| "already_complete" }`, the errors of `/api/resume`, and on a held page the ownership check's `terminal_in_use` and `ownership_unknown` |
| `POST /api/start-again` | `{ bringUpToDate? }`, same headers | `{ ok, outcome: "session_started" }` and the errors of `/api/resume` |
| `POST /api/reopen-check` | none | **Check again**: for Codex, reads the latest conversation's thread (`readCodexAvailability`) and records or clears `resumeError`; on a held page, runs takeover reconciliation; then republishes |
| `GET /api/reset/preview` | | `ResetPreview` |
| `POST /api/reset` | none, same headers | `{ ok, outcome: "reset", controlToken }`, once the new engine is published; `control_unavailable` (409) with the reason; `restart_required` (500, with the reason) when a step fails after the engine stopped (§Reset, Doing it). Admitted while Folder missing is set (§Reset, Availability) |

`target` on carry-on is the recovery target (§A Stopped Phase's Facts), naming the phase's latest conversation: after a failed carry-on, the earlier session, while the first card names the failed launch. `POST /api/carry-on` submits as `POST /api/mark-complete` does. The page's `X-Kiln-Status` is the status token and must match in full, never the live target alone. The control server fills `live_target` for `carry-on` as it does for `reply`.

### Snapshot

```
documents: adds
  start: { from: "new" | "existing", bringUpToDate: boolean, previewId,
           branches: [{ name, available: boolean }],   // available: AC-FROM-03's rows over today's repositories, no fetch; the selected name's message, from those rows or the preview's reads, is settings.fieldErrors.featureBranch (§The branch list)
           planSource: { kind: "base" | "branch" | "base_after_catch_up", branch, sha },   // the start commit (§The starting point)
           repositories: [{ name, hasBranch: boolean, pullRequest?: { number, url } | { unknown: string },   // unknown: the failed read, named in Starting lets Kiln (§The preview)
                            worktree?: { path, adopted: boolean, uncommittedFiles?: number } }],
           workspaceFolder?,                                  // several repositories with existing worktrees: W, fixed (§The branch list, Several repositories)
           closedCount, startAt?: { id, title },
           catchUp?: CatchUpOffer }
  checks: each row may be { name, passed: false, text }      // after a reset
  plan?: absent when the plan could not be read

needsYou: adds
  case?: "could_not_start" | "built_nothing" | "needs_input"
  work?: { repositories: [{ name, commits: [{ sha, subject }], uncommittedFiles }], builtNothing: boolean } | { unknown: string }
  conversationRanMs?: number                                  // the duration line's running time (§A Stopped Phase's Facts, Case)
  launchFailure?: { ran: "claude" | "codex", folder: string, sentence: string, error: string, at: string }   // What Kiln found (§A Stopped Phase's Facts): the latest launch has a run and never began a conversation
  nothingToCheck?: true
  reopen?: ReopenCheck
  carryOn?: { available: boolean, reason?: string, endsHold?: "takeover" | "message" }
  startAgain?: { available: boolean, reason?: string }
  catchUp?: CatchUpOffer                                      // read with work; absent until the first read finishes, or when it fails (§Catching a Branch Up)
  markComplete: adds builtNothing?: true

CatchUpOffer: { base: string, repositories: [{ name, branch, behind: number }] }

reset?: { available: boolean, reason?: string }                // started PRDs only; present means the reset line shows (§Reset, Availability)
liveControl.takeover: adds history?: ReopenCheck
```

### Command line

All three are changing commands under bot control's contract: a PRD path, `--only-if-status-matches`, `--command-id`, text and JSON results, the same exit classes, no prompt. Each has a command contract with examples and joins `kiln status`'s controls and the controller's advertised features (`carry_on`, `start_again`, `reset`).

| Command | Options | Outcomes |
|---|---|---|
| `kiln carry-on <PRD-path>` | at most one of `--message-file <path>`, `--message-from-stdin`; `--message-reviewed <receipt-id>` (repeatable); `--leave-branch-as-is` | `session_started`, `phase_already_complete`, `check_unavailable`, `branch_catch_up_failed`, `message_review_required`, `terminal_in_use`, `ownership_unknown`, `dispatch_not_started` |
| `kiln start-again <PRD-path>` | `--leave-branch-as-is` | `session_started`, `branch_catch_up_failed`, `dispatch_not_started` |
| `kiln reset <PRD-path>` | none | `reset`, `not_applied` |

`kiln reply` and `kiln resume` gain `--leave-branch-as-is`. Receipts of the four session-starting commands gain `branch_catch_up: [{ repository, branch, from, to, commits }]`. A carry-on or start-again receipt's `effects.session` settles as a resume receipt's does, with `started` in place of `resumed`. It reads `starting` at dispatch. It reads `started` when the run's prompt is submitted and the run reports Claude `init` or a Codex `turnId`, in either order, the condition that also ends a hold, and the command succeeds with `session_started`. It reads `not_started` when nothing was dispatched, the process couldn't spawn, or the run ended without that report: the command fails `dispatch_not_started`, or with the ownership check's code when that check fails after spawn. It reads `unknown` when the Codex dispatch is ambiguous or the attempt couldn't be recorded: the receipt stays indeterminate with no outcome, as a resume's does. Other receipts keep `resumed`. Neither command's name, help or output says "resume".

`kiln reset --help` states, before its options, that a reset can't be undone, lists what Kiln forgets (AC-RESET-03's first column), and says nothing runs afterwards until someone opens the browser view with `kiln run <PRD-path>` and presses Start on Documents found. It takes no confirming flag. `kiln status` lists `reset` on every screen of a started PRD, Folder missing included (§Reset, Availability), and for a not-started PRD as unavailable, "Not started; there is nothing to reset."

In `kiln --help`, `carry-on` and `start-again` follow `resume` under **Answer a stopped phase**, and `reset` is the only command of a new group, `reset`, headed **Start over** and printed after **Look closer**. A group whose names pass 80 characters continues on further lines with the same two-space indent, each line breaking after the last comma that fits.

## Data Models

Schema version 21. Every addition is optional; a record from schema 20 reads unchanged, except that its stop rows are marked `reason` by name (§A Stopped Phase's Facts, Nothing to check yet).

- **`PrdRecord.start?: { from: "new" | "existing"; bringUpToDate: boolean }`**: the starting point chosen on Documents found. On a not-started record, absent means computed (§The starting point). On a started record, absent reads as `new`.
- **`RepositoryEntry.runStartCommit?: string`**: where the run began in that repository: the branch's tip when the run started, after a catch-up at Start. Start sets it on an existing branch. On a branch cut new, the first catch-up at a stop sets it to the entry's `baseCommit` before moving that. After Start, no catch-up changes it. An entry not yet set up that has it is an existing-branch entry. Named apart from `RepositoryPhaseFacts.startCommit`, which is where one phase's commits begin. **`RepositoryEntry.adoptedWorktree?: true`**: the worktree existed before Start.
- **`RepositoryEntry.catchUp?: { from: string; to: string }`**: a catch-up begun in that repository and not yet recorded (§Catching a Branch Up).
- **`PrdRecord.branchCatchUps?: [{ at, repository, branch, from, to, commits, toldSessionId? }]`**: each catch-up Kiln made; `toldSessionId` is set, in one save, to the session whose run reported Claude `init` or a Codex `turnId` after its prompt carried the row.
- **`CheckResult.reason?: true`** (§A Stopped Phase's Facts, Nothing to check yet).
- **`SessionRecord.startedAs?: "carry_on"`**: set on a carry-on session's record. Absent means an ordinary launch. Run causes are unchanged.
- **`TakeoverHold.history?: ReopenCheck`**: additive under `liveControl` version 1.
- **Command journal:** actions `carry-on` (inputs `message`, `leave_branch`, `bring_up_to_date`, `live_target`, `reviewed_receipt_ids`), `start-again` (`leave_branch`, `bring_up_to_date`) and `reset` (none); `reply` and `resume` gain `leave_branch` and `bring_up_to_date`. `leave_branch` is `--leave-branch-as-is`, or the page's box unticked or not offered; `bring_up_to_date` is the page's ticked box, so a branch that no longer qualifies returns `branch_changed`. With neither, a command catches up a branch that qualifies and proceeds when none does. A receipt version 1 gains optional `branch_catch_up` (the four session-starting actions), the `effects.session` values `starting` and `started` (`carry-on` and `start-again`) and, for `reset`, `reset: { forgets: ResetPreview.forgets, new_execution_id }`, checkpointed before the record changes (§Doing it, step 2). An older Kiln reading a journal with these actions refuses it as unreadable, as it refuses any receipt it does not validate; nothing older runs against a record of schema 21.

## Changes to Earlier Designs

Each pointer is added under the named heading when this change is built.

- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (a first Start may use an existing branch and adopt its worktree; Kiln may fast-forward and push a branch with no commits of its own).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does (Documents found is computed for a starting point; a reset returns a running Kiln to it; an interrupted reset is finished first).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk (reset discards the PRD's state directory except the instance lock and reset receipts).
- Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §Start (AC-SAFE-03: Kiln may fast-forward and push a branch with no commits of its own).
- Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §The Folder Check and §Interfaces (while Folder missing is set, `kiln status` returns the status token and lists `reset`, and `reset` is admitted from the page and from the command line).
- Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Settings before Start, §Setup at Start and §Delivery-history evidence (a repository that has the chosen branch uses it; existing worktrees fix the workspace folder; the delivery history's base range starts at `runStartCommit` when the entry has one).
- Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One evaluator at every transition (closed before the run is read at `runStartCommit` when the entry has one: an existing branch's tip when the run started, or where a branch cut new stood before its first catch-up at a stop).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Completion evidence from outside Kiln (a leaf Closed at an existing branch's start commit, where the first session starts, is accepted on its Closed line).
- Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Applicability and ownership, §Local Interfaces and §Needs you Layout (the three cases; carry on and start again; the recovery target names the latest conversation, or the latest launch when none began; missing history no longer leaves only the terminal).
- Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Display Contract (no checks shown for a phase that built nothing until asked; the sentence above Mark complete).
- Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Release is a separate fact, §Activity-specific evaluate, then act and §Bot Extension (a hold whose conversation can't be reopened ends by a carry-on session or its advance, on the carry-on ownership check).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar, §Durable Controls and Retries and §Durable Data and Evolution (three commands; the catch-up before reply and resume; a reset's receipt survives the discard of the journal it belongs to).
- Replaces in part: `docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-technical-design.md`, §Design Decisions, Text help and §Top-level text help (a fourth task group, **Start over**; a group's names may take more than one line).

## Integration Points

- Git in each repository's main checkout, worktree and origin: the reads above, `worktree add`, local branch creation, `merge --ff-only`, `push`.
- GitHub through `gh pr list`, read only.
- Claude Code and Codex: launch and resume as today; Claude Code's saved conversations are read, never changed.
- `docs/kiln-command-line-and-bot-control.md` gains the three commands and `--leave-branch-as-is`, with `kiln reset`'s outcome read through `kiln command-status`, and its claim that a terminal can do everything the browser does with existing work is corrected for what stays browser-only (choosing where a run starts).

## Delivery

- **Expected build spend:** about $10 of agent usage, for short disposable Claude Code and Codex sessions proving that a carry-on session receives the reply, last message and work (AC-CARRY-05), that start again launches a first session (AC-CASE-02), that a hold ends when the carry-on run reports Claude `init` (AC-CARRY-06), and that a carry-on from an unheld stopped Codex phase reads `started` on its `turnId`. Everything else is proved on disposable repositories with bare origins and the existing fake-agent harness. The real-agent proof is `scripts/proof-run/run-restart-provider-proof.mjs claude_code|codex`, run by hand after `npm run build`.
- **After the build:** a minor release (three new commands) by `docs/release/kiln-npm-release-steps.md`, once the PRD's audits close.

## Criteria Coverage

| Criteria | Section |
|---|---|
| AC-FROM-01 | Starting From a Branch: The starting point, The branch list (how an unavailable name shows); Snapshot; `POST /api/settings`; Data Models (`PrdRecord.start`); Design Decisions (the name the computed starting point looks for) |
| AC-FROM-02 | Design Decisions (documents, closed before the run); The starting point; The preview; After Start |
| AC-FROM-03 | The branch list, including half-made and detached entries, row 5's local reads, which failed reads make a name unavailable, and each unavailable name's message; The preview (each worktree's count); Start (step 2's re-check, Failure); After Start (sessions are told); Design Decisions (uncommitted PRD documents, a detached entry, where the preview carries a worktree, what the branch list computes per name) |
| AC-FROM-04 | After Start (pull requests, Git limits); The preview (including a failed pull request read) |
| AC-FROM-05 | The branch list, Several repositories and Which repositories; The starting point; The preview (the workspace folder and its help line); Design Decisions (which repositories, where the preview carries a worktree) |
| AC-CURRENT-01 | Catching a Branch Up, including when a stopped phase's offer is read and settling a saved `catchUp`; A Stopped Phase's Facts (Work); Start (step 3, Interruption); Command line (`--leave-branch-as-is`); Design Decisions (commits of its own, catch-up mechanics, when a saved `catchUp` is settled, when a stopped phase's catch-up offer is read) |
| AC-CASE-01, 04 | A Stopped Phase's Facts |
| AC-CASE-02 | Start again; Limits |
| AC-CASE-03 | A Stopped Phase's Facts, Nothing to check yet; Design Decisions (where reason rows go) |
| AC-CARRY-01, 02 | Whether the conversation can be reopened |
| AC-CARRY-03 | Limits |
| AC-CARRY-04 | Command line, including `kiln --help`'s groups; Design Decisions (command names, where the commands go in `kiln --help`) |
| AC-CARRY-05 | Carry on |
| AC-CARRY-06 | A Held Phase That Can't Be Reopened; A Stopped Phase's Facts (held); Design Decisions (ending a hold without release) |
| AC-RESET-01, 02 | Reset: Availability (the reset line, the `reset.reason` table), Folder missing included; Design Decisions (the sentences the mockup does not draw) |
| AC-RESET-03 | The confirmation; Availability (where it opens, **Cancel**) |
| AC-RESET-04, 05 | Doing it, including A step that fails, Recovery, Start checks on the page and A reset run from the adopted worktree; Architecture (the engine holder); Design Decisions (how reset discards, reset in a running Kiln, a reset step that throws) |
| AC-RESET-06 | Doing it (what `kiln reset` prints, A step that fails, Recovery, The receipt); Availability (`kiln status` and Folder missing); Command line; Design Decisions (the reset's own receipt, when `POST /api/reset` answers) |
| AC-LOOK-01 | Snapshot (the data each drawn state needs); the view renders the mockup's layout and wording on today's screens; Nothing to check yet and Reset, Availability (where the drawn section and the reset footer go); Design Decisions (reason rows, the undrawn sentences) |

## Open Questions

None.
