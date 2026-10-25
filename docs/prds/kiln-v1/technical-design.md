# Technical Design: Kiln v1

**PRD:** [Kiln v1](kiln-v1-prd.md) · **Assumptions:** [assumptions.md](assumptions.md) · **Architecture:** [Kiln architecture proposal](../../design/kiln-architecture-proposal.md) · **Screens:** [mockups](../../design/mockups/), the design of record

## Overview

Kiln v1 is a single Node.js process, started by `kiln run <PRD>`, that drives a PRD's leaf phases through headless Claude Code sessions one at a time, checks each in Git, and serves a local browser view of its progress and controls. It ends with a pull-request session and stops at "PR ready for review".

This design builds on the architecture proposal and does not reopen its settled decisions: one command, foreground process, one worktree and feature branch per PRD, the three-fact done check, no model-based verdicts, no retries, TypeScript with a Svelte view in one npm package. It settles the proposal's "Left to the technical design" list:

| Left open | Settled in |
|---|---|
| Ctrl+C and signals | [Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals) |
| Resuming an interrupted session | [Interruptions, sleep and resume](#interruptions-sleep-and-resume) |
| The pushed check | [The done check](#the-done-check) |
| Keep-awake | [Keep-awake](#keep-awake) |
| The local server's port and finding a running instance | [Ports and one Kiln per PRD](#ports-and-one-kiln-per-prd) |
| Local security | [Local security](#local-security) |
| State format | [Kiln's state on disk](#kilns-state-on-disk) |
| The npm package name | [Package and distribution](#package-and-distribution) |

No runner code exists yet; everything here is new.

## Architecture

### Workload Type and Starting Point

A command-line program that runs in the foreground of its terminal and hosts, in the same process:

- the **engine**: works out where the feature stands, picks the next phase, runs sessions, runs the done check, and owns Kiln's state;
- the **session runner**: spawns and supervises the `claude` process and turns its event stream into Kiln's output lines and progress steps;
- the **local server**: serves the compiled view and a small HTTP API with server-sent events, on loopback only;
- the **web view**: Svelte 5, built with Vite, shipped prebuilt in the package.

The engine has no dependency on the server or the view; the server reaches the engine only through the engine's command interface (start, pause, cancel a pause, check again, change settings) and its state snapshots. Orchestration never lives in view code. The engine keeps state per phase and per session, never as "the one current session", and chooses the next phase in one function, so a dependency-aware scheduler could later replace it (proposal, "v1 scope").

**Starting point:** there is no seed project for an npm CLI. Tooling copies `commercesong/ensodynamics-admin`: Node `>=22` in `engines`, TypeScript with `tsc --noEmit` typecheck, ESLint, Vitest with one config per test tier, a dependency audit script, and a `verify` script that CI runs. The HTTP layer is Hono on `@hono/node-server`, chosen for its small footprint and built-in server-sent-events support.

### State store

Plain files under Kiln's state directory: one JSON record per PRD, written atomically, and append-only JSON Lines for each session's events and output. Nothing Kiln stores needs a query beyond "this PRD's record" and "a page of one session's output by line number", and there is exactly one writer per PRD (the instance lock), so a database would add a native dependency for no benefit. Details in [Kiln's state on disk](#kilns-state-on-disk).

### Dependencies

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Agent boundary (agent-specific metadata and execution boundary).

All already on the person's machine (AC-INSTALL-02); Kiln has no account, credential or service of its own.

| Dependency | Used for |
|---|---|
| `claude` (Claude Code CLI) | Sessions, resume, account (`claude auth status --json`), usage (`/usage`) |
| `@anthropic-ai/claude-agent-sdk` (npm dependency) | Only the model list (`supportedModels()`), pointed at the person's own `claude` executable. The SDK's optional platform package, a bundled Claude Code of about 245 MB unpacked (0.3.220, macOS arm64), installs with Kiln although Kiln never runs it |
| `git` (2.29 or later, for `fetch --no-write-fetch-head`) | Worktree setup and every read of Git state |
| `gh` (GitHub CLI) | The pull-request check, which also reads the pull-request facts Complete shows. Every call passes `--repo github.com/<owner>/<name>`, the repository recorded from `origin` ([Command line](#command-line-ac-cli-01-ac-cli-02-ac-start-09)): without it `gh` prefers an `upstream` remote over `origin`, and the host-qualified form keeps a person's `GH_HOST` from redirecting it |
| `caffeinate` (macOS); `gnome-session-inhibit` (Linux, GNOME) or `systemd-inhibit` (Linux, elsewhere); `powershell` (Windows) | Keep-awake; on Windows also process start times and sleep readings ([Windows](#windows)) |
| `open` (macOS), `xdg-open` (Linux) or `cmd /c start` (Windows) | Opening the browser view |

Every `git`, `gh` and helper `claude` call Kiln makes (everything except a session) runs detached, in its own process group, on macOS and Linux (on Windows in Kiln's console, [Windows](#windows)), with a timeout of 2 minutes and with no terminal to prompt on: stdin closed and `GIT_TERMINAL_PROMPT=0`. A credential prompt or a hung network call becomes that call's error, shown where its result would have been, instead of a stall. Two setup calls get 30 minutes instead, the base check's objects-only fetch and `git worktree add`: a first fetch of a base, or a checkout of a large repository whose Git LFS files download at checkout, can take longer than 2 minutes, while a stalled fetch with no timeout would hang for good, since git's https and ssh transports have no stall timeout of their own. A timeout ends the call with SIGTERM; on SIGTERM, `git worktree add` removes its half-made worktree and leaves only Kiln's branch, which a retry reuses ([Worktree and Branch Setup](#worktree-and-branch-setup)). Git LFS asks for credentials through `git credential`, which with `GIT_TERMINAL_PROMPT=0` fails rather than prompting. Kiln's timeouts and waits, these and the [stop sequence's](#stopping-a-session-ctrlc-a-closed-terminal-and-signals), count on Node's monotonic clock, which on macOS includes sleep, so a wait in progress when the computer sleeps may end at wake; the done check's origin retry is the one wait that [starts again](#the-done-check).

## Design Decisions

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Models and Settings (agent-specific next-session settings).

| Decision | Choice | Rationale |
|---|---|---|
| How sessions are run | Spawn the `claude` CLI directly with the flags in the proposal's interface table; the Agent SDK is used only for the model list | The CLI flags are what the proposal checked and the proof gates try; the resume command handed to the person is the same CLI, so Kiln runs exactly what a person could |
| Stopping a session | An interrupt control request written to the session's stdin, the message the Agent SDK's `interrupt()` sends; signals only as the fallback for a session that doesn't exit | Uses no signal, so it works the same on macOS, Linux and Windows, where Node can only end a process outright. Measured on Claude Code 2.1.299 on 2026-10-17: the turn ended at once, the process exited 0.6 seconds after stdin closed, the running tool left no process behind, and `--resume` carried on with full history. A forced kill also left a resumable session, but its running tool kept going ([Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals)) |
| Process group | Each `claude` process, every `git` and `gh` call, and the Agent SDK's `claude` child is spawned detached, in its own process group, on macOS and Linux; on Windows they stay in Kiln's console ([Windows](#windows)) | Kiln, not the terminal, decides what the session receives on Ctrl+C or a closed terminal, and can end the whole group, including tool subprocesses, without orphans. A child left in the terminal's process group gets the terminal's SIGINT too, and its exit can be handled before Kiln's own SIGINT handler runs, so a stop flag alone can't keep that exit from being judged ([Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals)) |
| Branch start point | The base's tip from `git ls-remote --exit-code origin refs/heads/<base>`, made local when it isn't with the base check's objects-only `git fetch --no-write-fetch-head --refmap= origin refs/heads/<base>`; the base check runs against that commit, Kiln records it as `baseCommit`, then runs `git worktree add --no-track -b <branch> <path> <baseCommit>` (a Start that reuses Kiln's own branch checks and records that branch's commit instead, [Worktree and Branch Setup](#worktree-and-branch-setup)) | The pull request targets the remote base, so starting from origin's tip avoids a stale start; taking the commit from origin's answer, rather than from `origin/<base>` or `FETCH_HEAD`, makes the start point exactly the commit the base check passed, with no remote-tracking ref that a single-branch clone leaves stale or absent and no shared file another fetch in the same checkout could overwrite; the fetch moves no ref, so the branch and worktree are setup's only Git changes (AC-GIT-01); the recorded commit lets a retry recognize the branch Kiln made ([Worktree and Branch Setup](#worktree-and-branch-setup)); `--no-track` stops a bare `git push` from ever targeting the base branch |
| Pushed check | Compare the local branch tip with `git ls-remote origin refs/heads/<branch>` | Asks the remote itself rather than trusting the remote-tracking ref or the session's claim that `git push` succeeded |
| Interrupted vs ended on its own | From Kiln's own record: the session's latest run has no end time or carries `interruptedBy` (written for a stop signal, or for an exit after a sleep Kiln detected with no model response after it) | Kiln knows it was there; no reading of what the session said (principle 3) |
| Live updates | Server-sent events, one stream per open tab | Updates flow one way; controls are ordinary POSTs; `EventSource` reconnects on its own when `kiln run` comes back on the same address |
| Port | One port per PRD from 4700 to 4799, assigned once and kept while the range has room ([Ports and one Kiln per PRD](#ports-and-one-kiln-per-prd)) | Several instances run at once, and a tab left open reconnects to the same address (AC-MULTI-02). The range avoids 4317 and 4318, OpenTelemetry's default ports, which Claude Code's own telemetry setup points at on localhost, and Erlang's 4369 |
| Model list | The Agent SDK's `supportedModels()`, accepting the SDK's bundled Claude Code as install size | The only route to the models Claude Code offers the signed-in account (UI-004); the cost is disk space, not behavior |
| Control security | Loopback bind, Host and Origin checks, and a per-PRD token embedded in the page Kiln serves | Blocks other sites and DNS rebinding with nothing for the person to enter (AC-VIEW-06) |
| State format | Plain JSON and JSON Lines files | See [State store](#state-store) |
| Fonts | Bundled in the package (Instrument Serif, Inter and JetBrains Mono, all under the SIL Open Font License) | Nothing the view loads leaves the machine (AC-INSTALL-02) |
| Prompts | Each prompt Kiln sends is a template file in the package | House standard: prompts live in files, not inline strings |
| Usage-limit threshold | One constant, 80% (UI-001) | Confirmed in business validation over following Claude Code's own warning level |
| Permission mode | `--permission-mode auto --permission-prompts none` | The only mode an unattended session can work in: `dontAsk` and `acceptEdits` deny the Bash commands that run tests and Git, and `bypassPermissions` drops every safeguard (AC-RUN-05; the proposal's open question 3) |

## Where a Feature Stands: what `kiln run` does

Superseded in part by: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (automatic audit gates before final delivery), implemented in Phase 2b. Existing authority and evidence protections remain.

Superseded in part by: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §Evidence and Completion (enabled execution rechecks current work despite historical completion). Restricted execution behavior remains in force.

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Setup at Start (setup is done when every repository's is), §Named after Start (names are added before a phase starts), §The Pull Requests (the engine loop's check before the session, per repository)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait (a refused session's failed check records a wait; the reconcile at `kiln run` waits again)

Every `kiln run` resolves the PRD, takes the PRD's instance lock, and reconciles. Pseudocode:

```
resolve path → repository (main checkout, found as Command line gives), PRD directory, feature name
take the instance lock and the port, or print "<feature> is already running at <address>" and exit   (AC-MULTI-04)
start the account, usage and model-list calls, not awaited             (see Startup order)
record ← the PRD's record, if any

if no record, or no startedAt (Start never pressed, or its setup failed and was undone):
    run the start checks (AC-START-02) in the checkout the path is in; any failure → print it, exit
    serve; print the not-started lines; open the browser on Documents found
elif record says complete:
    serve; print the underway lines (wording: UI-010); open the browser on Complete, shown from the record alone: the plan as last read,
        phase facts, session records and pull request recorded with completedAt — no Git or GitHub call and no read of the worktree, which the person
        may have removed (AC-GIT-04)                                          (see The Done Check)
else:
    if the setup isn't recorded as done: finish it                   (see Worktree and Branch Setup)
        fails → clear startedAt, baseCommit and refinementConfirmedAt; print git's error; carry on as not started,
            since no phase has started and so the feature isn't underway: run the start checks (AC-START-02) in
            the checkout; any failure → print it, exit; otherwise serve; print the not-started lines; open the browser on
            Documents found showing startError; stop here
    plan ← read the phase docs in the worktree → reads: write PrdRecord.plan · fails: nothing here (the branch that needs the plan reports the problem)
    print the summary line (wording: UI-010)                         (see Startup order)
    s ← the latest session: greatest createdAt across every phase's sessions (none yet: skip the first branch below); r ← s's latest run
    check ← the done check, or the pull-request check when s is the pull-request session
    if s's phase isn't Done (for the pull-request session: the PRD isn't complete) and holds no stop:
        stop any live process still holding s                         (see Interruptions)
        if s has no run (Kiln stopped between recording s and spawning): it never started, so nothing to resume or check → launch it as planned: same session ID, the launch prompt, cause: launch
        elif r has no endedAt, or r has interruptedBy (Kiln stopped while it worked, or a sleep cut it off):
            check → pass: Done · fail: resume it, or Needs you if it can't be resumed   (AC-KEEP-04)
        else (it ended on its own; Kiln stopped before recording the verdict):
            check → pass: Done · fail: Needs you, as after any session; never resumed, never a fresh session   (AC-KEEP-03, AC-STOP-01)
    elif the record holds a stop (Needs you):
        kind plan: re-read the plan → reads: clear the stop, carry on · a plan problem: Needs you with the new fact
        otherwise: that phase's check (done check, or the pull-request check) → pass: Done, finished by the person · fail: Needs you with the new facts
    elif a pause is active: Paused, rows from PrdRecord.plan; a plan problem is raised only when Start is pressed
    else: carry on
    print the ● line (wording: UI-010); serve; open the browser on the progress view; only then spawn or resume a session
then the engine loop runs until Ctrl+C
```

**Startup order.** Taking the instance lock, which settles the port, is the first step after resolving the PRD ([Ports and one Kiln per PRD](#ports-and-one-kiln-per-prd)). Right after it, Kiln starts the account, usage and model-list calls in parallel and never waits for them; each reaches the snapshot when it returns, and a refresh asked for while one runs joins it. Until then the snapshot has no `account` and no `models`: Documents found's Agent field shows "Claude Code" alone, Running and Paused leave out the Claude account panel (as Disconnected does), and Model holds the saved alias, named as is, with all five efforts enabled, as when the list can't be read but with no message ([Account and Usage](#account-and-usage)). For a feature underway, Kiln prints the summary line (UI-010 item 5), counted from `PrdRecord.plan`, once the record and plan are read, before the reconcile check, whose origin retry can take 2 minutes. The ● line waits for the check, since it says what the check decided; Kiln then serves, opens the browser on that result (AC-START-03), and only then spawns or resumes a session.

Engine loop, after Start and after each phase is Done:

```
loop:
    if a pause is active: wait for Start                                 (AC-VIEW-03: kiln run while paused)
    re-read the plan from the worktree; a plan problem → a `plan` stop, Needs you   (A plan that breaks after Start)
    leaf ← first leaf without a Closed line, in plan order               (AC-RUN-01, AC-RUN-04)
    if no leaf is left and the pull-request check passes:
        complete, no session; a pending pause is dropped, since nothing would start   (AC-PR-01, UI-008)
        stop here
    if a pause is pending: mark it active; wait for Start; next iteration   (AC-VIEW-03, UI-008)
    refresh account and usage, not awaited                               (AC-WATCH-09)
    if no leaf is left:
        run the pull-request session; its check decides Complete or Needs you
        stop here
    run a session for the leaf; wait for it to end
    done check → pass: Done, next iteration · fail: Needs you; wait for Check again
```

A pause pressed during a phase stays pending through a Needs you and becomes active only when that phase is Done by any route, including Check again and a restart (AC-VIEW-03). Until then, Keep going cancels it (`DELETE /api/pause`, which clears `pause.requestedAt`; UI-002); once active, there is nothing to cancel, and Start carries on. Needs you shows no pause control (UI-006), so a pause requested before a stop holds. A pause pressed during the last leaf holds before the pull-request session like before any phase (UI-008). Going round again after Start re-reads the plan and re-runs the pull-request check, so a pull request the person opened while Kiln was paused completes the feature with no session. That check, before the session, fails on a `gh` error just as on no pull request: Kiln starts the pull-request session (AC-PR-01's "otherwise") without showing the error, and the session's own check decides; a `gh` error in that later check shows at Needs you ([The pull-request check](#the-done-check)).

**A lost record.** If Kiln's state for a PRD is deleted, `kiln run` treats the feature as not started: Documents found, where UI-003 refuses the existing feature branch name and the [worktree check](#worktree-and-branch-setup) refuses the existing worktree path. The worktree, the branch and every commit stay untouched, and the person can finish the work by hand. Kiln does not try to adopt an existing worktree, because without its record it can't tell which branch it created or which base branch the pull request should target. This narrows the proposal's line that a lost record only costs transcripts and automatic resume, because adopting the old branch would mean working on a branch Kiln can't show it created, which AC-START-07 and UI-003 rule out. The taken-branch message warns that a new name starts the PRD over from the base branch, since the Closed lines live on the old branch. Moving or renaming the repository's folder has the same effect, because the record is found by the main checkout's path ([Kiln's state on disk](#kilns-state-on-disk)).

**A plan that breaks after Start.** Start checks don't run again once the feature is underway (AC-START-02): a plan read after Start applies only the structural checks of [Phase ids and order](#the-plan-reader) (an id that doesn't parse, two files with one id, a phase file whose parent isn't a split record listing it, a `## Split into` row with no file), while the cited-criteria and dependency checks are start checks only. A plan that reads as nothing at all is a plan problem too: a missing worktree, no PRD directory in it, or no `phase-*.md` files, with the fact `Couldn't read the phase plan: <path> doesn't exist` or `No phase documents in <path>`, and any other read error, with the error itself as the fact. Once the feature is underway, an empty plan never reads as "no leaf left", which would send Kiln to the pull-request session. Every successful read is written to `PrdRecord.plan`. The read and its structural checks are part of the Closed check, so a plan problem stops the phase whose session just ran as a `done_check` Needs you, showing that session's ending, with the problem as the Closed check's fact (for example `phase-2-refund-routing.md lists 2c, which has no file`). When no session has run since the plan was last read (Start after a pause, or `kiln run` between phases), Kiln records a `plan` stop on the first leaf not marked closed in `PrdRecord.plan`, the last successful read; when every leaf there is closed, the stop sits on `pr` and its copy says "the pull request" (AC-PR-05). `kiln run` while paused shows Paused from `PrdRecord.plan` and raises a plan problem only when Start is pressed. The stop has no session fields, and its only check is the plan's problem. That leaf hasn't started, so there is nothing to finish and nothing to mark Done. Kiln never re-creates or moves a missing worktree (AC-GIT-01); the person restores it. Check again and `kiln run` read the plan again: if it now reads, Kiln clears the stop without recording Done and the engine loop goes round again, which launches the first unclosed leaf, or holds first if a pause is pending; if it still doesn't read, the stop stays with the new fact. A `done_check` stop caused by a plan problem stays a done check: Check again runs the full done check, plan structure included, and a pass is Done, finished by the person.

## The Plan Reader

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Named in the phase documents (a `**Repositories:**` line is read)

Kiln reads the plan the way `phase-split` writes it, and nothing older (proposal, "Never").

- **Documents.** In the PRD directory: `<folder name>-prd.md`, `technical-design.md` or `<folder name>-technical-design.md`, optional `assumptions.md` or `<folder name>-assumptions.md`, and every `phase-*.md`. A document under both names is a start-check problem, since Kiln can't tell which one is meant. Before the worktree exists Kiln reads them in the checkout the path is in; after, in the worktree only (AC-RUN-01).
- **Phase ids and order.** The id is the part of the file name between `phase-` and the next `-`, read as alternating digit and letter runs (`2`, `2a`, `2a1`). A `## Split into` row's id is the id of the file its first cell links to, since the link text can disagree with the file; with no link, it is the cell's first word. Top-level phases run in numeric order; a split record's children run in the order of its `## Split into` table, in their parent's slot. A `phase-*.md` whose id doesn't parse, two files with the same id, a phase file whose parent isn't a split record listing it, or a `## Split into` row with no file fails the start checks, naming the files; after Start each is a plan problem ([A plan that breaks after Start](#where-a-feature-stands-what-kiln-run-does)).
- **Title.** The H1 after `Phase <id>:`, word for word, without a trailing ` — split into …` (AC-LOOK-03).
- **Split record vs leaf.** A document with a `## Split into` heading is a split record; any other is a leaf.
- **Closed.** A line starting `**Closed:**` before the document's first `##` heading.
- **Cited criteria.** Labels matching `AC-<AREA>-<NN>` under `## Acceptance criteria covered`. Every leaf needs at least one (AC-START-02).
- **Dependencies.** Kiln reads every phase document's `## Phase dependencies` section, split records' included (AC-START-02). A section that starts with "None" names no dependencies. Otherwise Kiln drops text inside parentheses, replaces a Markdown link to a phase file with that file's id, and splits the rest into items at `;`, `,`, ` and `, list bullets and blank lines. An item counts only when it is nothing but an id, optionally after `Phase` or `Phases` and optionally followed by a period or by ` — ` and a description — the form `phase-split` writes (`1 (the notification records); 2a (the retry queue)`). Prose naming phases, dates, criterion labels and commit hashes isn't read. An id naming the phase itself, one of its ancestors or one of its descendants is ignored. Every other id must have a phase document and come earlier in plan order than the phase naming it, so a child may depend on an earlier sibling of its parent but not a later one. Otherwise the start checks fail, naming the document, the id and the reason.
- **What Documents found counts (AC-START-04).** PRD: its criteria are the list items that open with a bold label (`- [ ] **AC-<AREA>-<NN>` or `- [x] **…`), leaving out retired labels (the text after the label begins "retired", as `phase-split` writes them) and fully superseded criteria (those with a `Superseded by:` line; `Superseded in part by:` still counts). Kiln shows their count and the first and last in file order. Labels anywhere else aren't counted: another PRD's criteria named in `Replaces:` or `Superseded by:` lines, or labels cited in prose. Technical design: how many of those criteria's labels it cites, counting a range such as `AC-START-01 to 09` or `AC-START-01–09` as every label in it, and bare numbers continuing a label after commas (`AC-CLI-01, 02`) as labels of that label's area, since designs commonly cite criteria that way. Assumptions: entries are `### <ID>.` headings; those not yet confirmed are the entries outside the "Validated Assumptions" table whose heading doesn't carry `✅ VALIDATED` (a transitional marker, per `assumptions-document-writing`), and the total adds that table's rows. Plan: phase document count; every leaf in plan order, in the ordered tree, each marked closed when its document already has a Closed line (a phase done by hand before Start, which the method allows); and the count of leaves to implement, the leaves not closed, with the closed leaves counted beside it, worded as UI-010 item 12 gives.

## Sessions

Superseded in part by: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Provider Sessions and Development Delivery (task-specific audit skill launch and recovery), implemented in Phase 2b. Existing authority and evidence protections remain.

Superseded in part by: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Activity identity and order (additive audit session kinds and `audit-<activityId>` storage, implemented in Phase 1; automatic dispatch remains Phase 2).

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Codex Authority and Conversation Lifecycle (Codex protected conversations, immutable session settings and recovery; Claude behavior retained).

### Starting a phase's session

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Sessions (the workspace in place of the one worktree; no PowerShell tool)

```
claude -p --input-format stream-json
  --session-id <UUID Kiln generates and records first>
  --model <model> --effort <effort>                         (from settings when the session starts; no --effort for a
                                                             model whose supportsEffort is false, Account and Usage)
  --output-format stream-json --verbose --include-partial-messages
  --forward-subagent-text
  --permission-mode auto --permission-prompts none
working directory: the worktree · stdin: piped · stdout, stderr: piped · own process group
stdin carries the launch prompt as the first user message, {"type":"user","message":{"role":"user","content":<prompt>}},
and later any interrupt (Stopping a session); Kiln closes it when the result event arrives, and the process then exits
```

Before spawning, Kiln writes the session record (ID, phase, model, the effort it passes, `createdAt`) and, for the phase's first session, the branch tip as the phase's `startCommit`. Once the process is spawned it adds the run (PID, [process start time](#ports-and-one-kiln-per-prd), start time), so from then on a crash leaves a run with no end time, which the next `kiln run` treats as interrupted. A crash between the two leaves a session with no run, which never started and is launched as planned ([What `kiln run` does](#where-a-feature-stands-what-kiln-run-does)).

**When `claude` can't be started.** If `spawn` returns no PID (ENOENT, EACCES or any other spawn error), Kiln records the run with no `pid` or `processStartTime`, `endedAt` equal to `startedAt`, no `exitCode`, and `spawnError: { code, message }`, in one write, and ignores the process's `close`, whose code is minus the errno, not an exit code, so no `exit` line follows. The error becomes a `stderr` output line, `Couldn't start claude in <worktree>: <message>` (ENOENT also means the working directory is missing). The run ended on its own, for a launch and a resume alike: the done check runs, or the pull-request check for the pull-request session, and a failure is a `done_check` Needs you (`pull_request_check` for the pull-request session) with no final message, its facts row headed by the error code ([How a session ended](#output-and-progress)). Kiln never retries (AC-STOP-01). A session with at least one run that started keeps the resume command on Needs you, and the line under the headline says Kiln couldn't restart it (wording: UI-007). When no run of the session ever started, nothing ran: the resume command and the last skill seen are left out, the line under the headline says Kiln couldn't start the session, step 1 offers the fresh session in the resume command's place, and that prompt omits the previous-session sentence (wording: UI-007).

### The prompts

Superseded in part by: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §Session Contract and Delivery Interface (saved development authority replaces blanket restrictions only for approved targets). Restricted execution behavior remains in force.

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Sessions, §The Pull Requests (the workspace in place of the one worktree; one pull request per repository)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Resume (the resume prompt after the person's Resume, with its note)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Resume (the opening after a usage limit)

Each is a template file; `<…>` are filled from the record. Everything in them is something a person could type (AC-RUN-06). `<phase doc>` and `<PRD file>` are paths relative to the worktree root (`docs/prds/customer-returns/phase-2b-store-credit.md`), never main-checkout paths, which would send the session to files outside its worktree. After a session splits its leaf, the fresh-session prompt's `<phase doc>` is its judged leaf's document and the resume prompt's stays the launched leaf's ([Which phase a split session is shown as](#snapshot)).

**Phase session (AC-RUN-03, AC-RUN-05):**

> Use the implement-from-requirements skill to implement `<phase doc>` of the `<feature name>` PRD (`<PRD file>`).
>
> Work only in this worktree, `<worktree path>`, on branch `<branch>`. Kiln created this worktree and branch for this PRD; it is not a shared checkout and not a parallel-session worktree. Don't switch branches, create another branch or worktree, or land work on any other branch, whatever other instructions say.
>
> You are authorized, without asking, to commit to `<branch>`, push it to origin (`git push -u origin <branch>`), and run refactor-pass after the feature commit. You are not authorized to open a pull request, merge, deploy, or touch any other branch.
>
> Nobody is watching this session and nobody can answer a question. If you need a decision you can't make, stop and put the question in your final message.
>
> You're finished when `<phase doc>` has its `**Closed:**` line and everything is committed and pushed to `origin/<branch>`.

**Resumed session (AC-KEEP-04):**

> Kiln was interrupted at `<time>` (<cause: Ctrl+C | the terminal closed | Kiln was stopped | the computer slept>) while this session was working, and has resumed it. Carry on with `<phase doc>` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.

`<time>` is UTC ISO 8601 to the second (`2026-10-17T15:02:11Z`), in backticks; the cause is plain text. When the run has neither `endedAt` nor `interruptedBy` (Kiln was killed outright), the first sentence reads instead: "Kiln stopped without recording why while this session was working; its last output was at `<time>`, and Kiln has resumed it." `<time>` is the run's last output time: the arrival time of the run's last saved event, or the run's `startedAt` when it saved none. `events.jsonl` holds every run of the session, so only events that arrived during that run count, from its `startedAt` to the next run's.

For the pull-request session, "Carry on with `<phase doc>`" reads "Carry on opening the pull request", and its check is "check GitHub first, because the pull request may already be open".

**Pull-request session (AC-PR-01):**

> Every phase of the `<feature name>` PRD (`<PRD file>`) is implemented and pushed to `<branch>`. The repository is `<owner>/<name>` on GitHub, the one `origin` points to; pass `--repo github.com/<owner>/<name>` to every `gh` command. Open one pull request on GitHub from `<branch>` into `<base branch>`, titled and described from the PRD. Open it ready for review, not as a draft, even if your own instructions say to open drafts. If a pull request from `<branch>` into `<base branch>` is already open, don't open another; if it is a draft, mark it ready for review (`gh pr ready <number>`). You may not merge it, deploy anything, or touch any other branch. You're finished when the pull request is open and ready for review.

**Fresh session, offered on Needs you (AC-STOP-06):** the phase-session prompt with one added sentence after the first: "A previous session stopped partway through this phase; check the worktree's state before you start." The pull-request variant is the pull-request prompt unchanged. When nothing ran, the sentence would be untrue, so the prompt is the phase-session prompt unchanged: at a `plan` stop, for the leaf the stop is on, or the pull-request prompt when the stop is on `pr`; and for a session no run of which ever started ([When `claude` can't be started](#starting-a-phases-session)).

The Needs you resume command is `cd <worktree>` then `claude --resume <session ID>` (AC-STOP-05), its path shown and quoted as [Snapshot](#snapshot) gives under Paths shown; `<worktree path>` in the session prompts stays absolute.

### Output and progress

Superseded in part by: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §Display Contract (observed delivery activity; existing six steps and Follow-up retained). Restricted execution behavior remains in force.

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Workspace Evidence, Output and Progress → Live and saved output (Codex-native output, child visibility and observed progress; Claude behavior retained).

Kiln saves every event exactly as received, stamped with the time it arrived, except partial-message deltas: those only feed the live view, and the finished message that follows carries the same text, so storing them would multiply the file's size for nothing. Output lines are derived from the saved events and can be rebuilt from them. Rules:

| Content block or event | Output line |
|---|---|
| Assistant text block, top level | `claude`: the block's text |
| Assistant text block or tool call with `parent_tool_use_id` | `reviewer` when the parent Agent call started during the Deliverable review step, otherwise `subagent`, whose label is colored as UI-010 gives; a tool call reads like a `tool` line (`Read src/returns/models.py`, as in the Phase detail mockup), and its result gets no line (AC-WATCH-05) |
| A subagent's `SubagentHandback` tool call (how Claude Code 2.1.299 delivers a subagent's report to its caller, proof gate 1) | `reviewer` or `subagent`, as above: its `message`, as text rather than as a tool line |
| `tool_use` block | `tool`: the tool name and its main input (the Bash command, the file path, the Agent description) |
| `tool_use` block of the Skill tool | `skill`: `Skill <name>` |
| `tool_result` block, top level | `out`: its last non-empty line, after dropping Claude Code's leading `Exit code <n>` line; `stderr` when it is an error. The Skill tool's result gets no line |
| `permission_denied` | `tool`: `denied` and the tool |
| Process stderr | `stderr` |
| Process exit | `exit`: `Process exited with code <n>` (or the signal) |
| Partial-message deltas | Not stored; pushed to open views as live text, replaced by the finished line |
| Anything else (thinking blocks, `init`, hook, rate-limit and other system events) | Saved, no output line |

Each content block is one output line, whatever its length: an assistant event carrying several blocks (text and tool calls) gives one line per block, in order, and a user event carrying several tool results one line per result, so no tool call is dropped. Events with no content blocks (process stderr, exit, `permission_denied`) give one line each. A line's text keeps its line breaks and wraps in the view, and `events.jsonl` keeps every result in full. Lines are numbered per session. The viewer labels them entries, because one may contain many physical lines. The live viewer requests the latest 100 entries and retains at most that many as SSE updates arrive; reconnect refreshes this tail rather than fetching missed history. Stopped-session Full session output retains paged Load earlier access. Stored events, stored output and the last 10 lines (AC-STOP-02) are unchanged. Live and saved output use the same output API (AC-WATCH-05, AC-WATCH-10).

The compact terminal viewer is bounded to 60% of the viewport height (220px minimum, 700px maximum), with internal scrolling. New entries follow at the bottom; scrolling up or expanding an entry suspends following. Updates preserve the reader’s visible entry when older entries are evicted. Jump to latest restores following. Tool inputs preview at most two lines or 240 characters; results preview three lines or 600 characters; prose previews four lines or 600 characters. Expansion reveals the original entry, and timestamps are optional, hidden initially. Tool formatting is derived only from recognized tool names on tool/skill/reviewer/subagent entries; other text and provider identity notices remain explicit. No command/result association or successful-tool status is inferred. The phase detail uses a compact feature header and outlined back link; the active phase-plan title links to it. The main current-phase preview reuses the terminal entry renderer without timestamps or expansion controls and reserves three lines to avoid layout movement; Watch live opens the full viewer. Identity notices share that bounded preview, taking the space they need before the remaining space is assigned to the entry text.

**Progress steps (AC-WATCH-04)** come only from top-level tool calls. A Skill name matches on the part after its last colon, so plugin-qualified names count:

| Step | Starts at |
|---|---|
| Build | Skill `implement-from-requirements` |
| Deliverable review | Skill `deliverable-review` |
| Test hardening | Skill `test-hardening` |
| Commit | The first Bash call that runs `git commit`, read as below |
| Refactor pass | Skill `refactor-pass` |
| Push | The first Bash call, after Commit, that runs `git push`, read as below |

After a manual Needs you resume, the active indicator is “Follow-up”, separate from the six recorded milestones, through subsequent recovery of that same session. A manual usage-limit resume without a reply and automatic recovery do not start follow-up. During follow-up a formerly current milestone is shown as observed, never inferred complete. The original step events stay intact. Otherwise the current step is the highest step in this order that has started; started steps below it are finished, and steps never seen stay unreached. A step that starts later but sits lower, such as Refactor pass after Push, doesn't move the current step back. Only the first `git commit` starts Commit; one Bash call that runs both commit and push starts Commit, then Push.

Each started step's line on Phase detail is worded as UI-010 item 11 gives and built only from the step's start event (the step, its time, and whether a Skill or Bash call started it); its one addition, Deliverable review's "its reviewer subagent is working" (`current.reviewerWorking`), shows only while the session is running, Deliverable review is the current step, and a top-level Agent call made since that step started has no `tool_result` yet.

**Reading a Bash command.** A command runs `git commit` (or `git push`) when, split the way the shell splits it, one of its simple commands is `git` followed by the subcommand `commit` (or `push`). Kiln splits at `&&`, `||`, `;`, `|`, newlines, `(`, `)`, `$(` and backticks, and treats heredoc bodies and quoted text as data. Before `git` it skips `VAR=value` assignments and the words `do`, `then`, `else` and `{`; after `git` it skips global options (`-C <path>`, `-c <key=value>`, `--git-dir=…`). `commit-tree` and other subcommands don't count. Commands inside script files or `bash -c '…'` strings aren't read; a miss leaves a step unreached, which AC-WATCH-04 allows. Sessions write these calls every way this covers: of 1,648 real commit and push Bash calls sampled, 615 ran commit and push in one call, 85 used `git -C …`, 79 set a variable before `git`, and about 1,000 passed the message in a heredoc, where a plain text search matched words inside the message.

"Seen in the session" is the latest step start or Skill call. "Last skill seen" on Needs you is the last top-level Skill call and its time.

**How a session ended (AC-STOP-02).** The final message, exit code, signal and spawn error come from the session's latest run, never an earlier run's, as for every per-run fact ([Interruptions](#interruptions-sleep-and-resume)); the last lines and last skill seen are the session's. The final message is the text of a `result` event that arrived during that run, when there is one and it isn't empty. Needs you renders it as CommonMark (paragraphs, emphasis, code, lists, links), as the mockup draws it, with raw HTML escaped and shown as text: the words are the session's own, unchanged, and only their Markdown is drawn. Output lines, everywhere they appear, stay plain text with their line breaks, as drawn. Otherwise the session ended without a final message, and Needs you shows its last 10 output lines. The row of facts under the headline starts with `exit <n>`, the process's exit code, or the signal's name (`SIGKILL`) when a signal ended the process, or the spawn error's code (`ENOENT`) when `claude` couldn't be started ([Starting a phase's session](#starting-a-phases-session)). The line under the headline depends on the ending:

| Ending | Line under the headline |
|---|---|
| A final message, any exit | "Kiln doesn't try to interpret why. This is how the session ended." (drawn) |
| No final message, non-zero exit | "The session exited with an error and no final message. These are the last lines it wrote." (drawn) |
| Couldn't be started, after an earlier run of the session started | UI-007's couldn't-restart line; the last lines shown end with the spawn error's output line |
| Couldn't be started, and no run of the session ever started | UI-007's never-started line, followed by the spawn error's output line |
| No final message, exit 0 | "The session exited with no final message. These are the last lines it wrote." |
| No final message, ended by a signal | "The session was ended by `<signal>` with no final message. These are the last lines it wrote." |

A signal Kiln sends itself is an interruption and the session is resumed ([Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals)), so the last row covers only a signal from something else. The other Needs you variants nobody drew (pull request, not resumable, a broken plan with no session, a session that never started or couldn't be restarted) follow UI-007.

### Stopping a session: Ctrl+C, a closed terminal and signals

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Resume and stopping (Codex tracked-process cleanup and visible native limitation; Claude behavior retained).

Kiln handles SIGINT (Ctrl+C), SIGHUP (the terminal closed) and SIGTERM the same way (AC-KEEP-02). On Windows, Node raises SIGINT for Ctrl+C and SIGHUP for a closed console window, which Windows follows with ending Kiln about 5 seconds later; the interrupt below finishes well within that:

1. If a run is live (no `endedAt`), write the interruption on that run first (`interruptedBy` and `interruptedAt`), so the record is right even if Kiln is killed partway through what follows. A signal during a done check or the pull-request check, with no run live, abandons the check and writes nothing; the next `kiln run` runs it again, since the check only reads.
2. Write an interrupt control request to the session's stdin, `{"type":"control_request","request_id":<id>,"request":{"subtype":"interrupt"}}`, then close stdin. Claude Code ends the turn, stops the tool it was running and exits, leaving the session resumable ([Design Decisions](#design-decisions), "Stopping a session").
3. Wait up to 30 seconds for the process to exit. A second Ctrl+C skips the rest of the wait.
4. If it is still running, end it with its whole process tree: SIGTERM to the group, then SIGKILL 5 seconds later, on macOS and Linux; `taskkill /T /F /PID <pid>` on Windows. A session ended this way is still resumable, since Claude Code writes its transcript as it goes; only the step in progress is lost.
5. Release keep-awake, close the server, release the instance lock, print one line, and exit with 128 plus the signal's number (130 for Ctrl+C, 129 for a closed terminal, 143 for SIGTERM). When a phase's run was live in step 1, the line is "Interrupted phase <n>, <title>. Its session and uncommitted work are kept.", naming the session's [judged leaf](#snapshot). Otherwise it is the line UI-010 gives for the state Kiln stopped in (the pull-request session working, Needs you, a check running, Paused, Complete, Documents found, or setup); in the moment between a phase's Done and the next session's spawn, it is the setup line naming the next phase ("Kiln stopped before phase 3 started. kiln run picks it back up.", or "before the pull request started"). When the terminal is gone, Kiln prints nothing.

**Once a stop begins, nothing is judged.** From step 1 on, a process that exits only has its run's `endedAt`, `exitCode` and `signal` recorded; events it still writes are saved as usual. No sleep marking, done check, pull-request check, not-resumable verdict, stop, resume, next phase or setup rollback follows; a check in progress is abandoned as in step 1. The next `kiln run` judges from the record. A setup stopped after `startedAt` was recorded keeps it, and `kiln run` finishes the setup ([Worktree and Branch Setup](#worktree-and-branch-setup)); one stopped before that point (during the base check at Start) recorded nothing, so step 5 prints the Documents found line (UI-010). On macOS and Linux every `git`, `gh` and helper `claude` call is spawned detached, like a session, so Ctrl+C or a closed terminal reaches only Kiln; step 2 also ends any of them still running (SIGINT to the group; `taskkill /T /F` on Windows), and Kiln ignores their results. On Windows they and the session share Kiln's console ([Windows](#windows)), so a Ctrl+C reaches them too and one may end before Kiln's own handler runs. Kiln therefore handles a session's end there one second after its process closes, and holds a helper call's abnormal end (no exit code, or a code of 128 or more) for the same second; Kiln's handler runs within it, marking a session's run interrupted in step 1 and turning the call's result into the stop's, so neither is judged.

Kiln never touches the worktree on the way out (AC-KEEP-03). If Kiln itself is killed outright, the session's latest run still has no end time, and the next `kiln run` treats it as interrupted. The session's stdin closes with Kiln, so it ends after its current turn at the latest; a session still running then is stopped by the next `kiln run` (below).

**Never two processes on one session.** The record keeps the `claude` process's PID and start time. Before resuming, and on every `kiln run`, Kiln checks whether that process is still alive (same PID and [process start time](#ports-and-one-kiln-per-prd), so a reused PID isn't mistaken for it). If it is, Kiln stops it as in steps 3 and 4 before going on; a run with no PID never started, so there is nothing to check. Step 2's interrupt request can't reach it, since its stdin closed with the Kiln that started it, so on macOS and Linux Kiln first sends SIGINT to its group, the stop proof gate 1 showed leaves a session resumable; on Windows it waits, then ends the tree. Nothing starts after a stop until Check again or `kiln run` (AC-STOP-08).

### Interruptions, sleep and resume

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Resume and stopping (Codex same-conversation recovery; Claude behavior retained).

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Stayed in the workspace (no resume after work outside the workspace)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait (Kiln resumes a session that ended on its own when a usage limit refused it)

**Detecting sleep.** Kiln reads the operating system's own record of suspend, not the difference between two clocks (Node's monotonic clock counts sleep on macOS but not on Linux):

- **macOS:** `sysctl -n kern.sleeptime kern.waketime`. A non-zero wake time different from the last reading means the computer slept from `sleeptime` to `waketime`.
- **Linux:** the first number in `/proc/uptime` (time since boot, suspend included) minus `process.hrtime` (suspend excluded). Growth of more than 2 seconds since the last reading is a sleep of that length, which began after the last reading.
- **Windows:** the system log's own sleep records, read as [Windows](#windows) gives.

Kiln checks every 10 seconds from its first session or check on, at the start of handling any `claude` process's end, and just before starting any `claude` process, so a sleep is always recorded before the exit it may have caused is judged. A sleep is recorded on each run still working when Kiln detects it, so it belongs to that run and never to a run started later. Its start, used as `interruptedAt`, is `sleeptime` on macOS, the logged sleep time on Windows, and the last reading before it on Linux. Neither source moves with the wall clock, so NTP steps and clock changes don't look like sleeps.

**After waking, while Kiln kept running:**

- If the session's process is still alive, Kiln leaves it alone; it is still working.
- If it exited, and a sleep was recorded on that process's run, and no model response arrived on that run after the latest such sleep was detected, the session was interrupted by the sleep. A model response is a saved `assistant` event, top level or subagent, whose `message.model` isn't `<synthetic>` (Claude Code writes synthetic assistant messages for API errors it gives up on). A `tool_result`, a system event (an API retry included) or a partial delta doesn't count: a tool finishes after wake whether or not the network is back, and retries mean the session hasn't got through yet. "After" compares the event's arrival stamp with the sleep's `detectedAt`, both Kiln's own clock; a response in the gap between wake and the reading that found the sleep is missed, which errs toward resuming by at most the 10-second polling interval. Kiln writes `interruptedBy: sleep` on the run, with the sleep's start as `interruptedAt` (the latest sleep, if the run has several), then runs the done check, or the pull-request check for the pull-request session, and resumes it if the check fails (AC-KEEP-04). Kiln judges this when it handles the exit, after the stream has ended (`close`), and writes the sleep reading taken at the start of that handling, `endedAt`, `exitCode`, `signal` and any `interruptedBy: sleep` with its `interruptedAt` in one write of `session.json`, so a record never holds a run's end without the sleep verdict that was due, and Kiln being stopped during the check leaves the run marked interrupted, not ended on its own. If step 1 of a [stop](#stopping-a-session-ctrlc-a-closed-terminal-and-signals) has already written `interruptedBy` on the run, that one stands. A sleep no reading found before that write is unknown: the run counts as ended on its own, and a failed check is Needs you, never a resume.
- Any other exit ended on its own and is judged by its check alone. A run that got a model response after waking survived the sleep, and its later exit — a usage limit or a crash — ended on its own.

Both facts belong to the one run, never to the session as a whole: a sleep during an earlier run doesn't make a later run's exit an interruption, and a response on an earlier run doesn't count for a later one. Otherwise a resumed run that fails on its own (a usage limit, say) would be resumed again and again.

**Resuming (AC-KEEP-04).** The done check first, or the pull-request check for the pull-request session; if it passes, the phase is Done (the PRD complete) and nothing is resumed. Otherwise:

```
claude -p --input-format stream-json --resume <session ID> --model <initModel> [--effort <effort>]
  with the same output and permission flags; the resume prompt is the first user message on stdin
```

`--model` is the session record's `initModel`, the concrete model ID the session's `init` event reported, so a newer Opus released between runs doesn't change the session's model; if no `init` ever arrived, it is the recorded alias. Effort is the one the session recorded, left out when it recorded none.

The resumed process keeps the session ID; it gets a new entry in the session's record, and its events go to the same files. A session can be resumed after every interruption; Kiln never resumes one that ended on its own.

**A session that can't be resumed (AC-KEEP-05).** If a resumed run that started ends on its own without its stream first reporting that session's `init` event, the session can't be resumed. A resumed run that a detected sleep cut off before its `init` event isn't that case: the sleep rule above wins, the run is marked `interruptedBy: sleep`, and Kiln resumes again. The phase goes to Needs you showing when it was interrupted, its last output lines, and the fresh-session prompt, with no resume command, in the wording UI-007 gives.

Kiln has no watchdog for a session that stops producing output without exiting; the view shows how long ago the last line arrived, and Ctrl+C then `kiln run` resumes it.

## The Done Check

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Done Check (Committed and Pushed per repository; a fourth check, Stayed in the workspace), §The Pull Requests (the pull-request check per repository, with Stayed in the workspace)

Run in the worktree after every phase's session, on Check again and on `kiln run` for a stopped phase (not a `plan` stop), on `kiln run` for a session whose verdict was never recorded, and before any resume (AC-DONE-03). All three must pass (AC-DONE-01); the session's exit code and words play no part (AC-DONE-02, AC-DONE-04).

| Check | Predicate | Fact shown when it fails (AC-STOP-03) |
|---|---|---|
| Closed | The launched leaf's document has its Closed line. Kiln finds that document by the leaf's id in the plan as it now reads, not by a recorded path. If that leaf is now a split record, the first leaf below it in plan order has the Closed line instead (AC-DONE-01's first child, or its first leaf when the child is itself split): the session's [judged leaf](#snapshot). When no document in the plan has the launched leaf's id, the check fails; Check again passes only once phase <id> is back in the plan and closed. A plan problem fails it, an unreadable plan included ([A plan that breaks after Start](#where-a-feature-stands-what-kiln-run-does)) | `No Closed line in <file>`, `Phase <id> is no longer in the plan`, or the plan's problem |
| Committed | `git status --porcelain --untracked-files=all` in the worktree prints nothing | `<n> files changed, not committed` |
| Pushed | The worktree is on the feature branch, and the branch's local tip equals the commit `git ls-remote origin refs/heads/<branch>` reports | `<sha> isn't on origin yet` (origin's commit is an ancestor of the local tip), `origin is at <sha>, not <local sha>` (any other difference), `<branch> isn't on origin yet`, `The worktree is on <other>, not <branch>`, or `Couldn't reach origin: <git's error>` |

A check Kiln can't run at all (the worktree is gone, `git` or `gh` fails) fails with the command's own error as its fact; for Closed, that is the plan's problem (`Couldn't read the phase plan: <path> doesn't exist`). A read of origin that fails on the network is retried for up to 2 minutes before the check reports `Couldn't reach origin`, because the network is often not back yet when a computer wakes; after a [detected sleep](#interruptions-sleep-and-resume), the 2 minutes start again from wake. This retries a read, never a session. Passing facts are shown too ("Latest commit a41c9e2, tree clean", "Matches origin at 5d81b37"). A pass records the pushed commit, the phase's commit count (`git rev-list --first-parent --count <startCommit>..<pushed commit>`, counted as [Snapshot](#snapshot) gives), the Done time, and whether the person finished it (any pass reached through Check again or `kiln run` on a stopped phase).

**The pull-request check (AC-PR-02)** replaces the done check for the pull-request session: `gh pr list --repo github.com/<owner>/<name> --head <branch> --base <base> --state open --json number,title,url,isDraft,isCrossRepository,headRefName,baseRefName,additions,deletions,commits`, run in the main checkout, passes only on a pull request with `isCrossRepository` false and `isDraft` false: "open" means open and ready for review (WORK-001), and `--head` also matches a fork's pull request from a branch of the same name, which doesn't count. When the check passes, Kiln records the pull request's number, title, link, head and base branches, and lines added and removed, all from the same call, and its commit count as the length of `commits`; `gh` returns at most 100 commits, so a count of 100 shows as "100+" (AC-PR-04). Kiln records these with `completedAt` in the PRD record. Complete, on that run and every later `kiln run`, renders from the record and never queries GitHub again: the facts are as they stood when the pull request was confirmed open, and merging or closing it later changes nothing Kiln shows. The facts: a pass shows `#<n> open`; an open draft fails with `#<n> is a draft`; no open pull request fails with `No open pull request from <branch> into <base>`; a `gh` failure shows gh's own error, as for the other checks. Its Needs you screen shows this one check, in the wording UI-007 gives.

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Delivery-history evidence (the no-further-GitHub-queries rule only for auxiliary delivery history; original completion facts remain historical).

## Worktree and Branch Setup

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Settings before Start, §Setup at Start, §The workspace kept (defaults, field checks, setup and a failed Start, per repository)

Done once, when Start is pressed on Documents found, and the only Git state Kiln ever changes (AC-GIT-01): the feature branch and its worktree. The base check's fetch adds objects but moves no ref. Kiln never resets, stashes, cleans, force-pushes or deletes (AC-GIT-02).

**Defaults (AC-START-07):** branch `feature/<PRD folder name>`; worktree `.worktrees/<PRD folder name>/<repository folder>` in the folder that holds the repository, where the Enso Method puts its worktrees; base `develop` when origin has it, otherwise the branch origin's `HEAD` points to, both read with one `git ls-remote --symref` (below). The base field is a select listing every branch on origin: `develop`, then the branch origin's `HEAD` points to, then the rest by name.

**Checked when a view connects (below), as the person edits the fields, and again at Start; Start stays unavailable while any fails:**

- the feature branch name is a valid branch name (`git check-ref-format --branch <name>` exits 0) and no branch of that name exists locally or on origin, apart from Kiln's own `createdBranch` (below) (UI-003);
- the worktree path, with a leading `~` expanded to the home directory, is absolute; it doesn't exist or is an empty directory; and it isn't inside the main checkout or any other worktree of the repository, since a worktree nested in a checkout shows there as an untracked folder and fails the clean-checkout check (AC-START-02, AC-START-07 "outside the person's own checkout"). Kiln compares the realpath of the path's nearest existing ancestor with each `worktree` line of `git worktree list --porcelain`, which prints real paths. A missing parent folder is fine; `git worktree add` creates it;
- the base branch exists on origin, and its PRD directory is identical to the one Kiln read, so sessions implement exactly the documents Documents found showed.

Before Start, each field edit is saved to the record's `settings` as it is made, so a `kiln run` after Ctrl+C reopens Documents found with them; a branch name taken in the meantime gets UI-003's message when a view connects.

When Kiln reads the documents it keeps the PRD directory's tree, `git rev-parse HEAD:<PRD directory>`. AC-START-02's clean-checkout check, `git status --porcelain --untracked-files=all` printing nothing in the checkout, makes that tree what Kiln read, whichever branch the checkout is on; untracked files count, since an uncommitted new phase file would otherwise slip past.

Kiln reads the documents, runs the start checks and keeps the PRD tree once per `kiln run`, never on a view connect: a start check can fail only in the terminal (AC-START-02), and the counts, the plan, the base check and the branch check all describe what that run read. Documents changed afterwards aren't seen until the next `kiln run`; a view connect still asks origin again (below).

Before Start, Kiln runs the base check whenever a view connects to the event stream (each page load or reconnect), unless a check or setup is already running, and whenever the base setting changes, asking origin directly. On connect, `git ls-remote --symref origin HEAD 'refs/heads/*'` chooses the default base, gives the base field's list and gives the base's tip; the same list of origin's branches serves the branch check's "exists on origin" half, so one call answers both, and reloading after pushing the documents, or after going back online, clears a PRD-differs or "Couldn't reach origin" message. After a base change, or an edit to the worktree or branch field, the same `ls-remote --symref` call gives the new base's tip, and a base absent from its list gets the not-on-origin message; only a base change shows the base check as running (UI-010 item 4). If the tip isn't in the local repository, Kiln fetches its objects with `git fetch --no-write-fetch-head --refmap= origin refs/heads/<base>`, which moves no ref (AC-GIT-01). If `git rev-parse <tip>:<PRD directory>` is missing or differs from the kept tree, the field shows the PRD-differs message. While a check runs, Start is unavailable ([Snapshot](#snapshot)). Any other error (offline, credentials, a timeout) shows under the base field as "Couldn't reach origin: <git's message>", the done check's wording; when the connect call fails that way, the list holds only the current base setting. If origin advertises no default branch and has no `develop`, the base field starts empty. At Start, Kiln asks origin for the base's tip again with `git ls-remote --exit-code origin refs/heads/<base>`, and the check runs against the commit sessions will start from, before `startedAt` and `baseCommit` are recorded: for a new branch, that tip, fetched as above when it isn't local ([Design Decisions](#design-decisions), "Branch start point"); when Start reuses Kiln's own branch, `createdBranch.commit`. A failure there, origin's included (the base gone from origin, or origin unreachable), leaves the feature not started, as any setup failure does (below), but shows as the base field's message (PRD-differs, not-on-origin or "Couldn't reach origin"), with Start unavailable, never as `startError`, which carries git's message for a failing setup step.

Each failure is shown beside its field, in the wording the Documents found mockup's source gives in its field-message comments (UI-003 for the branch; UI-010 for an empty field and a name that isn't a valid branch name). Then Kiln runs the base check again, records Start as pressed (`startedAt`, with `refinementConfirmedAt`) and `baseCommit`, the commit that check ran against, adds the worktree as in [Design Decisions](#design-decisions), records the setup as done, and starts the first phase. Recording before the add means the record owns the branch and worktree names, so an interrupted setup is finished rather than refused for names Kiln itself just took. The same finish-the-setup step runs when Start is pressed again and on the next `kiln run` after an interruption:

- a worktree at the recorded path, on the recorded branch and not marked `locked initializing` by `git worktree list --porcelain`, means the setup is done;
- Kiln's own branch gets `git worktree add <path> <branch>`, which works when the path is missing or an empty directory. This includes the branch with no worktree that a `git worktree add -b` stopped by Ctrl+C or a closed terminal leaves, which is at the recorded `baseCommit`. A branch is Kiln's own when it is local, absent from origin, not checked out in any worktree, at `createdBranch.commit` (or, while the record has no `createdBranch`, at the recorded `baseCommit` of the setup in progress), and the base-branch setting is unchanged since it was cut. For a new press of Start, and so for the branch check on Documents found, `createdBranch` is also Kiln's own only while `git rev-parse <createdBranch.commit>:<PRD directory>` equals the PRD tree Kiln kept: sessions start from that commit, not origin's current tip, so it must hold the documents Documents found showed. When they differ, the branch gets UI-003's taken-branch message and stays in place (AC-GIT-02). A branch reused this way can start behind the base on origin; bringing the pull request up to date is the pull-request session's or the person's job, as for any base that moves while the feature runs;
- with no branch of that name, a `kiln run` finishing an interrupted setup runs `git worktree add --no-track -b <branch> <path> <baseCommit>` from the recorded `baseCommit`, without asking origin again, since the base check already passed against it; a new press of Start runs the whole sequence again: base check, record, add.

If any step fails, a timeout included, the feature goes back to not started (a step stopped by Ctrl+C, a closed terminal or a signal to Kiln hasn't failed: Kiln ignores its result and keeps the record, [Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals)): Kiln clears `startedAt`, `baseCommit` and `refinementConfirmedAt`, and the worktree and branch fields are editable again, since AC-VIEW-08 fixes them only once the first phase starts. `git worktree add -b` creates the branch before the folder, so a non-empty or unwritable path (the path check can't see an unwritable parent) leaves Kiln's branch with no worktree; when it exists, the record keeps it as `createdBranch { name, commit, baseBranch }`, with the base branch it was cut from. Documents found shows the field checks again and the failing git command's error as one amber line under Start, in the wording the mockup's source gives in its Start-message comment; the terminal prints the same line. That error is `startError`, held in memory, not in the record, and the next Start clears it. The refinement confirmation box belongs to the view: the same tab keeps it ticked, and a reload or `kiln run` asks again, since a tick kept across a restart could vouch for documents that have changed since. The branch check treats `createdBranch` as available while it is still Kiln's own branch as defined above, at `createdBranch.commit`, so after changing the path the person can Start on the same branch, and that Start records the branch's commit as `baseCommit` rather than origin's tip. A branch someone else made in the meantime gets UI-003's message, and a half-made worktree fails the path check; Kiln removes neither (AC-GIT-02). The worktree stays after completion (AC-GIT-04).

## Keep-awake

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait (the hold is taken during a wait too)

Kiln holds a keep-awake while a session's process is running and keep-awake is on, and releases it whenever none is: at Needs you, paused, complete, and on exit (AC-KEEP-06). Turning the setting off or on applies at once.

- **Windows:** a child PowerShell process that calls `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` and then waits on Kiln's PID (`Wait-Process`), so the hold ends if Kiln dies. That flag prevents idle sleep only; closing the lid does what the power plan says, which by default is sleep (AC-KEEP-07).
- **macOS:** a child process `caffeinate -i -w <Kiln's PID>`. `-i` prevents idle sleep only, so closing the lid still sleeps the machine (AC-KEEP-07); `-w` makes it exit if Kiln dies without releasing it.
- **Linux, in a GNOME session** (`XDG_CURRENT_DESKTOP` contains `GNOME`): a child process `gnome-session-inhibit --inhibit suspend --app-id kiln --reason "Kiln: <feature name> is being implemented" <a command that exits when Kiln's PID does>`. GNOME's automatic suspend honors only gnome-session's own inhibitors, never a logind lock, so this is the one hold it sees. It stops automatic suspend only: the screen still blanks and locks, a suspend the person asks for still happens, and GNOME hands the lid to logind, which ignores inhibitors for it, so closing the lid still suspends.
- **Linux, elsewhere:** a child process `systemd-inhibit --what=sleep --mode=block --who=Kiln --why="Kiln: <feature name> is being implemented"` holding the same command. KDE's power manager and logind's IdleAction honor a `sleep` block, and logind ignores inhibitors for the lid switch by default, so where logind handles the lid, closing it still suspends. `idle` is left out: no desktop's automatic suspend honors it, and KDE reads it as "don't change screen settings", so it would stop the screen locking. `--mode=delay` is not an alternative, since it only postpones a suspend. **Known limitation:** from systemd 257, a block lock is enforced for every caller, so outside GNOME a suspend the person asks for (from the desktop's menu, or `systemctl suspend`) is refused while a session works (PLAT-001); the screens keep the drawn "Stops idle sleep only", which is exact on macOS and GNOME.

If the tool for the session is missing (`gnome-session-inhibit` in a GNOME session, `systemd-inhibit` elsewhere), Kiln says so in the terminal and the keep-awake setting shows the error, in the wording the Documents found mockup's source gives with the missing tool's name, rather than appearing on while doing nothing. A hold whose process ends while Kiln still holds it (the tool refused, such as logind denying the lock) is shown the same way, as "Can’t keep this computer awake: <the tool's first line of error output>". Kiln never falls back from one to the other: GNOME's automatic suspend ignores a `systemd-inhibit` lock.

## The Local Server

### Ports and one Kiln per PRD

- **Port.** Each PRD gets a port from 4700 to 4799 the first time `kiln run` takes its instance lock: the lowest port neither assigned to another PRD nor in use. The assignment is kept only in the shared port registry, `ports.json`, updated under a lock and keyed by the PRD's state directory (repository directory and PRD key together, since two repositories can both have `docs/prds/customer-returns/`), with the time each PRD was last served. From then on the PRD keeps its address (AC-MULTI-02), unless the range fills (below). If its port is held by something other than Kiln, `kiln run` says what port and exits rather than move the address. When every port in the range is assigned, the PRD served least recently that isn't running gives up its port; a tab still open on that PRD from long ago no longer reconnects.
- **Address.** `http://127.0.0.1:<port>/<PRD folder name>`, with no trailing slash: the form Kiln prints and the view's root, with its client-side routes beneath it. A request for `/<PRD folder name>/` is redirected to it, so the view has one address. The page title is `<feature name> · Kiln`, as every browser mockup's `<title>` reads (`Customer returns · Kiln`), so each tab names its feature (AC-MULTI-02).
- **Instance lock (AC-MULTI-04).** `instance.lock` in the PRD's state directory holds Kiln's PID, process start time and port. Kiln takes it as the first step after resolving the PRD, under the `ports.json` lock, and looks up or assigns the PRD's port in the same step, so the address is known before any startup work. The file is written to a temporary file and `link`ed into place, which fails if it already exists, so a reader never sees a partial lock. A holder is live when its PID exists and its process start time equals the recorded one. A live holder decides on its own: Kiln prints "<feature> is already running at <address>", built from the lock's port, and exits without starting anything, with no API call, since a holder still in its startup work isn't serving yet. Any other lock, an unreadable one included, is stale and is replaced under the same `ports.json` lock.
- **Process start time.** On Linux, field 22 of `/proc/<pid>/stat`, counted after the last `)` (the command name can contain spaces and parentheses); on Windows, `(Get-Process -Id <pid>).StartTime.ToUniversalTime().Ticks` through PowerShell; on macOS, the trimmed output of `ps -o lstart= -p <pid>` run with `TZ=UTC LC_ALL=C`, since that output otherwise follows the time zone and locale. A missing file, or `ps` exiting 1, means the process is gone. Kiln records its own value and its children's through the same reader, so values compare like for like.

### Local security

- The server binds `127.0.0.1` only (AC-VIEW-01).
- Every request must carry a `Host` of `127.0.0.1:<port>` or `localhost:<port>`, which defeats DNS rebinding.
- Every API request must carry the PRD's token (random, 256 bits, created with the record and kept in it): in a header for fetches, as a query parameter for the event stream. Kiln writes the token into the page it serves, which other sites can't read (AC-VIEW-06). Keeping it per PRD rather than per process lets a tab left open keep working after `kiln run` restarts.
- Requests that change anything must also carry an `Origin` matching the `Host` they were sent to (`http://127.0.0.1:<port>` or `http://localhost:<port>`).
- The state directory is created readable by its owner only (`0700`), since the record holds the token and the saved output can hold whatever the sessions printed.
- No CORS headers are ever sent. Every response sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and a Content Security Policy allowing only Kiln's own origin, with `frame-ancestors 'none'`.

## Interfaces

### Command line (AC-CLI-01, AC-CLI-02, AC-START-09)

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Selection and readiness (common startup permits reaching the chooser without either agent).

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Found beside the PRD's repository, §The command (start checks for each named repository; a second command)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Command line (the wait's lines)

`kiln run <PRD directory or PRD file>` is the only command. Kiln resolves the path from the current directory and finds the checkout the path is in with `git -C <the path's directory> rev-parse --show-toplevel`. The PRD directory is the path itself, or its parent when the path is a file, and must sit directly under `docs/prds/` or `docs/changes/` at that checkout's root. Run from inside Kiln's worktree, that root is the worktree folder, so Kiln finds the main checkout separately: the first `worktree` entry of `git -C <the path's directory> worktree list --porcelain`, then `git -C <that entry> rev-parse --show-toplevel`. In an ordinary repository the entry is the main working tree; in a submodule it is the submodule's git directory, `<superproject>/.git/modules/<name>` (found on Git 2.50.1 while building Phase 1), and the second call turns it into the submodule's working tree. The parent of `git rev-parse --git-common-dir` isn't used for the same reason. The repository name (AC-LOOK-05), the state directory's key and the PRD key come from the main checkout, whichever checkout the path is in, so the main checkout and the worktree reach the same record ([Kiln's state on disk](#kilns-state-on-disk)). A file path must be that directory's `<folder name>-prd.md`, whether or not the file exists. The PRD is always `<folder name>-prd.md`; any other `*-prd.md` there is ignored, and when it is absent the start checks list it among what is missing, as the terminal mockup draws. Any other path prints one line naming the problem, then usage, and exits non-zero: no path, a path that doesn't exist (other than a missing `<folder name>-prd.md` in an existing PRD directory), a path outside a Git repository, any other folder (including `docs/prds/` itself, the "several PRDs" case of AC-START-01) and any other file. Start-check failures print what is missing or failed and where Kiln looked, one line per problem in the terminal mockup's frame (missing documents as drawn, every other problem as UI-010 gives), and exit non-zero. Phase event lines are `<local time> <phase id> <title> <started | done · pushed <sha> | stopped | interrupted | resumed | opened #<n>>`, as in the terminal mockup; after a session splits its leaf, all but the started line name its judged leaf ([Snapshot](#snapshot)). Kiln needs `claude`, `git` and `gh` on the PATH, `gh` signed in, and `origin` on GitHub; a missing one is reported among the start checks. "`gh` signed in" means `gh auth status --hostname github.com` exits 0. "`origin` on GitHub" means `git remote get-url origin` parses as `https://[user@]github.com/<owner>/<name>[.git]`, `git@github.com:<owner>/<name>[.git]` or `ssh://git@github.com[:port]/<owner>/<name>[.git]`, host matched case-insensitively; anything else, GitHub Enterprise hosts and SSH host aliases included, fails with "origin isn't on GitHub: <url>", since the PRD covers GitHub-hosted repositories only. Kiln records `<owner>/<name>` as the record's `repository.github`, which every `gh` call passes ([Dependencies](#dependencies)). It never runs `gh repo set-default`, which writes Git config (AC-GIT-01).

### HTTP API

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Local API and snapshot changes (agent selection and stale-editor validation).

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §HTTP API (workspace settings, repositories, the outside-workspace confirmation)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §HTTP API (`POST /api/resume`)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §HTTP API (`resumeAfterUsageLimit`; Resume now during a wait)

All under the view's origin; JSON bodies; times in UTC ISO 8601, shown in local time by the view, with a day when not today (UI-010). A control not allowed in the current state returns 409 with the reason.

| Method and path | Purpose |
|---|---|
| `GET /<PRD folder name>` and `GET /<PRD folder name>/…` | The view (client-side routes: progress at the root; Phase detail and Full session output at `/<PRD folder name>/phase/<id>`) |
| `GET /api/snapshot` | The current `Snapshot` |
| `GET /api/events` | Server-sent events: `snapshot` on connect and on every change, `output` (`{ sessionId, lines: [OutputLine] }`, new lines of a working session), `partial` (`{ sessionId, source: claude \| reviewer \| subagent, text }`, a text delta, labelled as its finished line will be; the view appends deltas of one source until a finished line from that source replaces them), `heartbeat` every 5 seconds. After the stream comes back, the view pages the output it missed from `GET /api/sessions/{sessionId}/output` |
| `GET /api/sessions/{sessionId}/output?before={line}&limit={n}` | A page of a session's output (Load earlier, full output) |
| `POST /api/settings` | `{ model?, effort?, keepAwake?, worktreePath?, featureBranch?, baseBranch? }` → the settings with any field errors; an effort outside the snapshot's `effortLevels` is a field error; worktree and branches only before Start (AC-START-06, AC-VIEW-08) |
| `POST /api/start` | Before the first phase: `{ refinementConfirmed: true }`, refused until the settings validate (AC-START-05). When paused: no body |
| `POST /api/pause` | Pause after this phase; not offered during the pull-request session (AC-VIEW-03, AC-PR-05) |
| `DELETE /api/pause` | Keep going: cancel a pending pause; 409 once the pause is active (AC-VIEW-03, UI-002) |
| `POST /api/check-again` | Run the stopped phase's check (AC-STOP-07); for a `plan` stop, read the plan again ([A plan that breaks after Start](#where-a-feature-stands-what-kiln-run-does)) |

**The phase route.** `/<PRD folder name>/phase/<id>` renders from the snapshot. When `current.phaseId` is the phase, it is the live Phase detail, including the moments between the session's exit and its verdict, with `exit` as the latest line ([While Kiln is busy between states](#snapshot)). When `needsYou.phaseId` is the phase and it has a session, it is [Full session output](#snapshot), keeping the lines already loaded when the live Phase detail turns into it. Otherwise the route is replaced by the progress view: the phase is Done, the next phase has started, or Kiln is Paused, Complete or at a `plan` stop. While disconnected, the route keeps its screen, by the rules below.

**Needs you on screen (UI-006).** While Kiln is stopped at Needs you, the progress view is the Needs you screen alone, as drawn: no phase plan, no settings and no Claude account panel, and the Kiln mark leads back to it. A plan row in the Needs you state appears only on the Disconnected layout below.

**Connection (AC-VIEW-04, AC-VIEW-07).** The view shows "updated <n>s ago" from the last event. On a stream error, or no heartbeat for 15 seconds, it shows Disconnected and keeps the last snapshot on screen, with a phase that was Implementing shown as Interrupted (AC-WATCH-01, AC-WATCH-02). `EventSource` keeps retrying; when `kiln run` is back on the same address, the first `snapshot` restores the live view.

While disconnected, every screen renders from that last snapshot by the rules the Disconnected mockup applies to Running:

- **Header and layout.** Each screen keeps its header and layout, except that Implementing phase <n> becomes Interrupted in phase <n>. Not started (Documents found), Paused and PR ready for review stay as they are. Needs you switches to the Disconnected progress layout (UI-006): the Needs you header with the stopped phase and time, no current-phase panel, the plan with that phase's row in Needs you, and the settings.
- **Status and banner.** The top bar shows "Disconnected from Kiln · last seen <time>". A "Kiln isn't running" banner sits above the main panel: "Nothing is being worked on. This page shows what Kiln last saw, at <time>[, in phase <n>]. [Its work is kept.] To pick up where it left off, run this in a terminal:", then this PRD's `kiln run` command with its Copy command button, which keeps working. The bracketed phase clause appears only when there is a current phase (Implementing or Needs you); "Its work is kept." is left out on Documents found, where nothing has run. Where a screen has the Kiln panel, it reads "Disconnected · The terminal running Kiln was closed or stopped. Controls come back when Kiln is running again."
- **Hidden.** Panels that are only a control or live data: Pause Kiln (even with a pause pending, which still holds at the next `kiln run`, AC-VIEW-03), the Claude account panel, Watch live and Load earlier.
- **Disabled in place.** Controls inside panels that inform: Change and the keep-awake checkbox, with the settings note becoming "Settings can be changed again once Kiln is running."; Start and its fields on Documents found; Start on Paused.
- **Dimmed.** Only the current-phase panel, relabelled "Last seen · phase <n> of <total>".

### Snapshot

Superseded in part by: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Progress and Detail Contract (ordered audit activities alongside preserved phase details), implemented in Phase 2b. Existing authority and evidence protections remain.

**Running and waiting time (AC-WATCH-01, 02, 06).** Derive timing from saved runs across all sessions belonging to a phase; no schema migration. Count the union of run intervals, capped at interruption or exit, as running. For an unended run not currently executing, use its last recorded output as the known boundary. Everything else from the original start through Done (or now while unfinished) is waiting, including Needs you and usage limits. Feature totals use all runs, from feature start to completion, including pauses between phases. Snapshots carry running/waiting milliseconds, the calculation time and which clock advances; the view ticks only that clock and freezes on disconnect. A running process includes tests and tool waits; this does not claim model compute time.

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Local API and snapshot changes (selected agent, catalogue, readiness and selection generation).

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Snapshot, §Screens (the repositories, facts by repository, every pull request; work outside the workspace on Needs you)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Resume, §Snapshot, §Screens (`resumeOffered` and Resume on Needs you)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Snapshot, §Screens (the `waiting` state and screen, the limit on Needs you)

What every screen renders from. Outline:

```
Snapshot:
  feature: { name, repositoryName, prdFolder, state: not_started | implementing | paused | needs_you | complete,
             currentPhaseId?, phasesDone, phasesTotal, startedAt?, completedAt?, stoppedAt? }
  documents?: (not started only) { prd: { file, criteriaCount, firstLabel, lastLabel },
             design: { file, criteriaCited }, assumptions: { file, total, notYetConfirmed } | null,
             plan: { phaseDocCount, leafCount, closedCount, phases: [ { id, title, splitInto?, closed } ] },
             checks: [ { name, passed } ], starting?: true, startError? }
                                                           (starting: setup after Start under way; startError: git's message when the setup failed;
                                                            leafCount: every leaf; closedCount: leaves with a Closed line, so
                                                            leafCount − closedCount are to implement; wording: UI-010 item 12)
  settings: { agent: "Claude Code", model: { value, displayName }, effort, effortLevels: [ level ] | null, modelListError?,
             keepAwake, keepAwakeError?, worktreePath, featureBranch, baseBranch, baseBranches?: [ name ],
             baseCheck?: checking | ok | error, fixed, fieldErrors }
                                                           (effortLevels: the chosen model's supported levels, [] when it takes
                                                            no effort, null when Kiln has no entry for it: all five enabled;
                                                            modelListError doesn't hold Start, unlike fieldErrors;
                                                            baseBranches and baseCheck: not started only)
  models?: [ { value, displayName } ]                      (Documents found and Change; absent until the model-list call returns
                                                            (Startup order); every displayName in the snapshot is
                                                            Kiln's name made from the model ID, except a saved alias with no
                                                            entry, named as is; see Account and Usage)
  phases: [ PhaseView ]                                    (plan order; the pull-request row once every leaf is closed)
  current?: { phaseId, sessionId?, model, effort?, startedAt?, steps: [ { name, state, startedAt? } ],
             seenInSession?: { text, at }, latestLine?, commits: [ { sha, subject } ], reviewerWorking? }
                                                           (sessionId, startedAt, seenInSession, latestLine: absent between
                                                            states, see While Kiln is busy between states)
  needsYou?: { phaseId, kind: done_check | pull_request_check | not_resumable | plan, stoppedAt, stoppedAtIsLastOutput?,
             finalMessage?, exitCode?, signal?, spawnError?: { code, message }, lastSkill?: { name, at }, lastLines?: [ OutputLine ],
             checks: [ { name, passed, fact } ], checkedAt, checking?: true, resumeCommand?, freshSessionPrompt,
             freshSessionCommand, outputLineCount?, sessionEndedAt?, steps?: [ { name, state, startedAt? } ],
             sessionId?, model?, effort?, sessionStartedAt?, commits?: [ { sha, subject } ] }
                                                                   (freshSessionCommand: `cd <worktree>` then `claude`, quoted as
                                                                    resumeCommand is, for UI-007's fresh-session step 1;
                                                                    steps, sessionId to commits: the stopped session, for Full
                                                                    session output; commits read from Git when the stop is recorded
                                                                    and on each check; checking: Check again's check under way)
  pause: { pending, active }
  account?: { email?, plan?, updatedAt, limits: [ { label, shortLabel, percent, resetsAt, nearLimit } ], error?, limitsError? }
                                                           (absent until the first account and usage calls return, Startup order)
  pullRequest?: { number, title, url, head, base, commits, additions, deletions }

PhaseView: { id, title, file, state: planned | next | implementing | needs_you | done | split,
             splitInto?, sessionStartedAt?, doneAt?, pushedSha?, finishedByPerson,
             details?: { from, to, model, effort?, worktree, branch, commitCount, latestCommit, sessionId } }
```

**Needs you fields.** `finalMessage`, `exitCode`, `signal` and `spawnError` are the latest run's, never an earlier run's result ([How a session ended](#output-and-progress)). `lastLines` are the session's last 10 output lines, a failed resume's `stderr` and `exit` lines included. For `not_resumable`, `stoppedAt` is the `interruptedAt` of the interrupted run, the one before the failed resume, not the latest run's; when Kiln was killed outright and wrote no time, it is that interrupted run's last output time (its last saved event, or its `startedAt` when it saved none, as [The prompts](#the-prompts) defines), `stoppedAtIsLastOutput` is set, and the screen says "last output at" in place of "interrupted at". For `kind: plan` ([A plan that breaks after Start](#where-a-feature-stands-what-kiln-run-does)), the session fields (`finalMessage` to `lastLines`, `resumeCommand`, `outputLineCount`, `sessionEndedAt`, `steps`) are absent, and `checks` holds the one plan check. For `done_check` and `pull_request_check`, `stoppedAt` is the latest run's `endedAt` (the same as `sessionEndedAt`; AC-STOP-02's "the time the session stopped"), not `stop.at`, which a later `kiln run` or the 2-minute origin retry can push past it; for `plan`, it is `stop.at`. `feature.stoppedAt` is the same value.

**Full session output (AC-WATCH-10).** Both Needs you mockups link "Full session output" to the Phase detail layout, and that is what it is for a stopped session, with everything that only makes sense while the phase is running left out: the LIVE badge, the blinking cursor and live text, and Pause after this phase with its note. The phase pill is the amber Needs you pill and the phase circle is amber-outlined, as in the Disconnected mockup. Running time stops when execution ends; waiting time continues while Needs you is open. Both clocks freeze at the last snapshot if disconnected. "Latest of <n> lines · Load earlier" stays, paging by line number. Progress shows `steps` as Kiln last recorded them. How the step where the session stopped is drawn, and the back link, are as UI-010 gives.

**While Kiln is busy between states.** Between a session's exit and its verdict, `state` stays `implementing`: the current-phase panel keeps its steps as last seen and its latest line is the `exit` line. Between a Done verdict (or the end of setup) and the next spawn, `state` is `implementing` and `current` is the next phase with no `sessionId` or `startedAt`, every step unreached, no seen-in-session or latest line and no commits, its model and effort the settings'; the view leaves out what is absent. This lasts moments, except before the pull-request session, whose `gh` check can take 2 minutes. During setup after Start, `state` stays `not_started` until the setup is recorded done, with `documents.starting` set: Documents found keeps its fields, Start is unavailable, and the grey note under Start reads as UI-010 gives; `POST /api/start` and changes to the worktree or branch fields return 409. A setup failure clears `starting` and sets `startError`; a base check that fails at Start clears `starting` and sets `baseCheck: error` and the base field's message instead. While the base check runs (`baseCheck: checking`, on connect and after a base change), Start is likewise unavailable, with the note UI-010 gives. While Check again's check runs, which the done check's origin retry can stretch to 2 minutes, `needsYou.checking` is set: the check rows keep their last facts, Check again is unavailable and `POST /api/check-again` returns 409, and the grey line under it reads "Checking…" (UI-010) in place of the drawn "Checked <time>." The result replaces the rows and clears `checking`.

"Interrupted" is never in a snapshot: Kiln is never running while a phase is interrupted, so the view derives it when disconnected. A phase's commits are those between its starting commit and the branch tip at Done. Kiln lists and counts them along the branch's first-parent chain (`git log --first-parent`, `git rev-list --first-parent --count <startCommit>..<tip>`), so a session's merge of the base into the branch counts as one commit, the merge, not every base commit it brought in. A fast-forward merge before the phase's first commit, and a rebase onto the base, still bring base commits into the chain; both are accepted. The current phase's commit list is read from Git while it works; a done phase's count is the one recorded at Done, and Details' `latestCommit` is its `pushedSha`, so Details never needs Git.

**Paths shown.** Paths are stored absolute. Displayed paths (`settings.worktreePath`, Details' `worktree`, and so the Documents found Worktree field) show a path under `$HOME` as `~/…`, matched on a path boundary, and `$HOME` itself as `~`. `resumeCommand` ([The prompts](#the-prompts)) uses the same `~/`, unquoted so the shell expands it; the rest of the path is single-quoted only when it holds a character outside `[A-Za-z0-9_@%+=:,./-]`, with `'` written `'\''`: `cd ~/'my repo/x'`. A quoted `"~/…"` wouldn't expand. The session prompts, and so `freshSessionPrompt`, keep the absolute path, so the fresh-session prompt is exactly what Kiln sent.

Kiln's record is keyed by the leaf it launched, but rows follow `PrdRecord.plan`, the last successful read of the plan, which every read refreshes. Paused's "Next: phase <n>" is the first leaf in that record not marked closed. When a session split its leaf, the leaf's row shows Split and its session, times, pushed commit and Details move to the row of the session's judged leaf (below). A leaf closed without a Kiln session of its own (closed before Start, or closed by a session launched for another leaf) shows Done with no time, pushed commit or Details. The pull-request row separates running and waiting time across all of its saved sessions, from its first run's `startedAt` to its `doneAt`; when AC-PR-01 finds the pull request already open, `phases.pr` holds no session and the row shows no duration.

**Which phase a split session is shown as.** A session's judged leaf is the leaf its [done check](#the-done-check) judges: the launched leaf, or, when the latest plan read shows the launched leaf as a split record, the first leaf below it in plan order (its first child, or that child's first leaf when the child is itself split). When the plan doesn't read, or no document has the launched leaf's id, the judged leaf is the launched leaf. Everything that names the session's phase uses the judged leaf's id and title from the latest read: `current.phaseId` and `feature.currentPhaseId` (during a resume too), `needsYou.phaseId`, the Needs you header and headline, [the phase route](#http-api), the fresh-session prompt's `<phase doc>`, the summary and ● lines, and the stopped, interrupted, done and resumed event lines. Only the started line, printed before any re-read, and the resume prompt's `<phase doc>`, which continues that session's own task, name the launched leaf; so "3 started" may be followed by "3a done · pushed <sha>", and a split record never gets a done line. `PrdRecord.phases` stays keyed by the launched leaf; the view maps it onto rows through `PrdRecord.plan`.

**Complete's times** separate recorded session execution from waiting between `startedAt` and `completedAt`. Their sum is wall-clock elapsed time; pauses and stops appear as waiting. These totals remain fixed after completion.

**Paused before the pull request.** When the pause holds before the pull-request session (UI-008), Paused applies AC-PR-05's "says 'the pull request'" to the Paused mockup's copy: the header's Paused pill has "<n> of <n> phases done" beside it, every leaf done and the pull request not counted; the eyebrow stays "Paused after phase <last leaf>"; the heading reads "Next: the pull request" (drawn: "Next: phase 2b, Store credit"); the body reads "Phase <n>, <title>, finished with its commit and push at <time>. Nothing is running. Change the model or effort first if you want; they apply to the pull request."; the button reads "Start the pull request" (drawn: "Start phase 2b"); and the plan shows every leaf Done, then the pull-request row in Next.

**Settings and each phase's model.** The settings panel's model and effort are the setting for the next session. The current-phase panel and each phase's Details show the model and effort recorded for that phase's session, so a change doesn't alter them (AC-WATCH-07, AC-VIEW-08); the drawn settings note is the only confirmation. A model with no effort, in the settings or a session's record, is shown alone (UI-011). A resumed session keeps its recorded model and effort ([Resuming](#interruptions-sleep-and-resume)). On Running and Paused, Change opens the Documents found Model list and Effort buttons in place inside the settings panel, Model's error line included; each choice is saved at once (`POST /api/settings`), with no Save button, and while the editor is open Change reads "Done", which closes it. The keep-awake checkbox saves when toggled and applies at once, its label reading "On" or "Off". During the pull-request session the settings note reads "Model and effort changes apply from the next phase; the pull-request session keeps what it started with." (UI-009).

### Output line

```
OutputLine: { line, at, source: claude | tool | out | skill | reviewer | subagent | stderr | exit, text }
```

## Account and Usage

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Models and Settings; §Readings and identity (agent-specific models, confirmed pairs, dynamic allowances and metadata refresh).

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait, §Design Decisions (Kiln waits for a reset; rows keep their kind; readings keep `orgId` and their start)

- **Account:** `claude auth status --json`; the screens use `email` and `subscriptionType` (the plan, shown with its first letter capitalized and followed by "plan": `max` → "Max plan"). Not signed in means the output's `loggedIn` is false, whatever the exit code. `subscriptionType` can be absent (an API-key login, for example); the plan is then left out and the email shows alone. When the call fails with no JSON Kiln can parse (an error, a timeout, other output), `account.error` carries that error, shown like the not-signed-in line: amber, in place of the email and plan, and Start isn't held.
- **When Claude Code isn't signed in**, `account.error` carries the amber line UI-010 gives in place of the email, plan and limits. Start isn't held by it, and nothing waits for a sign-in: a session that then fails comes to Needs you like any other stop (UI-005).
- **Usage:** `claude -p "/usage" --output-format stream-json --verbose --no-session-persistence`, run with stdin closed (left open, `claude -p` waits 3 seconds for piped input first) and with the PRD's state directory as its working directory so no project's hooks or settings load. Kiln shows `usage_report.rate_limits.limits[]` in the server's order, never re-sorted or re-graded, and labels each row from its `kind`: `session` is "5-hour window", `weekly_all` is "Weekly", and `weekly_scoped` is "Weekly · <name>", where the name is the row's `scope.model.display_name` ("Fable"), else its `scope.surface.display_name`. A `weekly_scoped` row with neither name, and a row of any other `kind`, is left out, not an error, since the server can add meters without a client release. Those are the labels on Running and Paused; Documents found's one line uses the short forms "5-hour", "weekly" and the name alone: "Used: 5-hour 13% · weekly 22% · Fable 0%", which never turns amber (UI-001). An empty list shows no limits and no message. `nearLimit` is `percent >= 80` (UI-001).
- **When:** at `kiln run`, every 5 minutes while it runs, and just before each phase's session starts (AC-WATCH-08, AC-WATCH-09), never awaited ([Startup order](#where-a-feature-stands-what-kiln-run-does)). Kiln never waits for a reset (UI-005).
- **When the limits can't be read** (the SDK calls the report experimental), `account.limitsError` is shown in place of the limits instead of guessed numbers; the email and plan still show. When the account has a plan (`subscriptionType` present) but the result has no `usage_report`, or its `rate_limits` or `limits` is null (how a failed fetch of the limits shows), `limitsError` says Claude Code didn't report the plan's limits; without a plan (an API-key login, for example), there are no limits and no message. When the usage call itself fails, `limitsError` carries its error. A row with a missing or mistyped `kind`, or a row of a known `kind` with a missing or mistyped `percent`, is an unrecognized shape and gives `limitsError` too.
- **Models (AC-START-06, UI-004):** at each `kiln run`, and only then, Kiln opens an Agent SDK query against the person's `claude` executable without sending a prompt, calls `supportedModels()`, and closes it; an account switched while Kiln runs shows in the list at the next `kiln run`. The query sets `pathToClaudeCodeExecutable` to that executable, `cwd` to the PRD's state directory and `persistSession: false`, as for `/usage`, so no project's hooks or settings load. The SDK's own spawn isn't detached, so Kiln passes `spawnClaudeCodeProcess`, spawning the given command, arguments, working directory and environment detached in its own process group, forwarding the abort signal, like every other helper call; Kiln reads that child's stderr itself for `modelListError`. Kiln keeps each entry's `value`, `resolvedModel` (the alias resolved to a concrete model ID), `description`, `supportsEffort` and `supportedEffortLevels`, and leaves out entries marked `disabled: true` (a field Claude Code sends at runtime that the SDK's `ModelInfo` type doesn't declare, as in "Fable (disabled)"). The dropdown lists the family-alias entries, those whose `value` is a bare alias such as `opus`, `fable` or `sonnet`, one per resolved model; `default`, the 1M-context variants and legacy entries are left out. Proof gate 1 (2026-10-17, Claude Code 2.1.299) recorded what the list returns for a real account (`test/fixtures/proof-gate-1/supported-models.json`): the entries `default`, `opus`, `fable`, `sonnet` and `haiku`, then concrete model IDs; alias entries' `displayName` now carries a version ("Opus 5.5"). Kiln names a model from its model ID: `claude-<family>-<major>[-<minor>]`, with any date suffix dropped, becomes "<Family> <major>[.<minor>]" (`claude-opus-5-5` is "Opus 5.5"), and an ID that doesn't fit the pattern is shown as is. The SDK's `displayName` isn't used: Claude Code chooses its wording, which has changed between versions (an alias entry's read "Opus", with no version, before proof gate 1 found "Opus 5.5"), while the model ID names exactly what runs. The default is the entry whose value is `opus`, so each session runs the latest Opus. An entry's `supportsAutoMode` is what decides whether a session on that model gets auto mode: proof gate 1 started a session with `--permission-mode auto` on the one entry without it (`claude-haiku-4-5-20251001`), and Claude Code ran it in `default` mode with no error, its `init` event reporting `permissionMode: "default"`, so the first session's failure would not be a clear signal. Documents found and Change therefore show the error beside Model when the chosen model's loaded entry doesn't have `supportsAutoMode: true`, since a session needs auto mode to run. Whether the value also differs between accounts wasn't tried, with one account.
  - **When the list can't be read** (`supportedModels()` fails or times out), Model holds the saved alias as its only option, named as is (`opus`), with one amber line, "Couldn't load Claude Code's models: <the error>" (`modelListError`, wording in the Documents found mockup's source, UI-011). Start isn't held by it, unlike the other field messages, because `--model <alias>` works without the list.
  - **When the saved alias isn't listed** (left out, disabled, or not offered after an account switch), it stays selected as one extra option named by its alias, with no message.
  - In both cases Kiln has no entry for the chosen model, so all five effort levels are enabled and the auto-mode error never shows, since it needs a loaded entry. A model the account can't use surfaces as the session's own failure, at Needs you.
- **Effort (AC-START-06):** defaults to `high`. Claude Code never refuses an `--effort` the model can't honor: max or xhigh on a model without them quietly runs at high, and a model whose `supportsEffort` is false gets no effort at all. Kiln matches the setting to the chosen model so its records say what actually ran. Effort always shows all five buttons, as drawn; levels missing from the chosen entry's `supportedEffortLevels` are disabled (UI-011). For a model that takes effort, when the model list loads or the model changes and the saved effort isn't supported, Kiln saves the highest supported level below it, or the lowest supported level when none is below. If `supportsEffort` is false, all five are disabled, Kiln passes no `--effort`, and the model is shown without an effort wherever model and effort appear (UI-011); the saved effort is kept for the next model that takes one. A session records the effort Kiln passed, none when it passed none.

## Kiln's State on Disk

Superseded in part by: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Recovery and Upgrade (execution activity history and preserved legacy completion), implemented in Phase 2b. Existing authority and evidence protections remain.

Superseded in part by: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Recovery and Upgrade and §Audit Report and Local Interface (schema 6 audit records, stable execution identity and immutable evidence sidecars, implemented in Phase 1; execution-wide upgrade scheduling remains Phase 2).

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Persisted schema 4 (per-agent choices and legacy Claude identities).

Superseded in part by: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Data Models (schema 2, per repository; the outside-workspace confirmations and an interrupted stop)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Data Models (schema 3; a run the person resumed, with its note)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Data Models (the wait, `limitRefusal`, `limit_resume`, the setting)

Root: `$XDG_STATE_HOME/kiln`, else `~/.local/state/kiln`, on macOS and Linux alike; `%LOCALAPPDATA%\kiln` on Windows, readable by its owner only. Never inside the repository (AC-GIT-03).

```
<root>/ports.json                                   PRD state directory → port, last served
<root>/<repository name>-<8-char hash of the main checkout's path>/<PRD key>/
    prd.json                                        PrdRecord
    instance.lock                                   Kiln's PID, process start time and port
    <phase id | pr>/<session id>/
        session.json                                SessionRecord
        events.jsonl                                every stream event, with the time received
        output.jsonl                                OutputLine per line
        stderr.log
```

The PRD key is the PRD directory's path from the repository root with `/` replaced by `--`. The repository is identified by its main checkout, found as [Command line](#command-line-ac-cli-01-ac-cli-02-ac-start-09) gives, so running from the main checkout or the worktree reaches the same record. JSON files are written to a temporary file and renamed into place (`instance.lock` is linked instead, so taking it fails when it exists); only the instance-lock holder writes, apart from `ports.json`, which every instance updates under its own lock.

```
PrdRecord:
  schemaVersion: 1
  repository: { mainCheckoutPath, name, github }   (github: "<owner>/<name>", parsed from origin's URL)
  prdDirectory, featureName, token
  settings: { worktreePath, featureBranch, baseBranch, model, effort, keepAwake }
  refinementConfirmedAt?, startedAt?, setupCompletedAt?, completedAt?
                                                (refinementConfirmedAt: recorded with startedAt and cleared with it)
  baseCommit?                                   (the commit the branch starts from: the base's tip on origin that the base check at Start ran against, or createdBranch's commit when Start reuses that branch)
  createdBranch?: { name, commit, baseBranch }  (a branch Kiln made in a Start whose setup failed; Kiln's own only as Worktree and Branch Setup defines)
  phases: { <phase id | pr>: { sessionIds[], startCommit?, doneAt?, pushedSha?, commitCount?, finishedByPerson,
                               stop?: { kind: done_check | pull_request_check | not_resumable | plan, at, checks[], checkedAt } } }  (stop: Needs you, its checks replaced on each Check again; commitCount recorded at Done;
                                                                   pr: the pull-request session, no startCommit, pushedSha or commitCount)
  pause: { requestedAt?, activeSince? }
  pullRequest?: { number, title, url, head, base, commits, additions, deletions }   (recorded with completedAt)
  plan?: [ { id, title, file, splitInto?, closed } ]   (the last successful plan read, in plan order: written at Start and after every
                                                        successful read, so at Complete it holds the plan as it stood at completion)

SessionRecord:
  schemaVersion: 1
  sessionId, phaseId, kind: phase | pull_request, createdAt   (createdAt: written with the record, before spawning)
  model, initModel?, modelDisplayName, effort?, permissionMode, claudeVersion
                                                (model: the chosen alias; initModel: the init event's concrete model ID;
                                                 effort: the --effort Kiln passed, absent when it passed none;
                                                 permissionMode, claudeVersion: from the init event, kept for diagnosis; no screen shows them)
  runs: [ { pid?, processStartTime?, startedAt, endedAt?, exitCode?, signal?, spawnError?: { code, message },
            cause: launch | resume, interruptedBy?: sigint | sighup | sigterm | sleep, interruptedAt?,
            result?: { subtype, isError, text? } } ]
                                                (pid and processStartTime absent, and spawnError set, when claude couldn't be started)
  sleeps: [ { at, seconds, detectedAt, run } ]  (run: index in runs of the run the sleep was recorded on;
                                                 detectedAt: Kiln's own time at the reading that found the sleep,
                                                 compared with events' arrival stamps, both Kiln's clock)
  lastSkill?: { name, at }, steps: [ { name, startedAt } ]
```

The stop lives on its phase, not on the PRD, so state stays per phase as the proposal asks of v1 (parallel phases later would each need their own). `modelDisplayName` is first made from the chosen entry's `resolvedModel` when the session record is written before spawning, then overwritten when the `init` event arrives: its `model`, the concrete ID the session runs, is kept as `initModel`, which every resume passes ([Resuming](#interruptions-sleep-and-resume)), and the name is made from it ([Account and Usage](#account-and-usage) gives how a name is made). `opus` names whichever Opus is latest, so a finished phase keeps the name it ran with. A record with a newer `schemaVersion` than this Kiln knows stops `kiln run` with a message to update Kiln; an older one is migrated when read.

Git and the phase documents stay the record of what is done; Kiln's record remembers settings, sessions, stops, and the facts it shows for finished work (each phase's commit count, the pull request's facts, and the plan as last read).

## Package and Distribution

- **Package:** `@ensodynamics/kiln`, providing the `kiln` command; installed with `npm install -g @ensodynamics/kiln` (AC-INSTALL-01). The unscoped name `kiln` is taken on npm. The `ensodynamics` organization doesn't exist on npm yet; creating it before the first publish is a pending human action in the PRD.
- **Contents:** the compiled CLI, engine and server; the built view with its fonts; the prompt templates.
- **Platforms:** macOS, Linux and Windows (AC-INSTALL-03); Windows specifics in [Windows](#windows).
- **Release:** a GitHub Actions workflow in `EnsoDynamics/kiln` (`release.yml`) publishes to npm with provenance on a version tag on `main`, after CI's checks on all three platforms; nothing is published from a laptop. npm records provenance only from a public repository (REL-001). A trusted publisher (npm's OIDC publishing) can be set up only on a package that already exists, so the first publish authenticates with a granular token in the `NPM_TOKEN` secret and later ones through the trusted publisher; the workflow needs no change between them. Steps: [Kiln npm release steps](../../release/kiln-npm-release-steps.md).

## Windows

v1 runs on Windows as well as macOS and Linux (AC-INSTALL-03). Every operating-system-specific call lives in one platform module behind one interface, chosen once at startup, so the engine, session runner and server never call a signal name, `/proc`, `sysctl` or a platform tool directly. Its Windows implementation:

| Piece | On Windows | Tried |
|---|---|---|
| Stopping a session | The interrupt request on stdin, as on every platform; `taskkill /T /F /PID <pid>` as the fallback, which ends the whole process tree ([Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals)) | The interrupt on macOS; Windows uses the same pipe |
| Ctrl+C and a closed window | Node raises SIGINT and SIGHUP for them, as on macOS and Linux. Sessions and helper calls are not spawned detached: Node's detached spawn on Windows starts the child with no console, so the program `claude.cmd` (npm's shim) or any `.cmd` starts gets a new console instead of Kiln's pipes and never reads the prompt, and PowerShell's output is lost (found on the Windows CI runner while building Phase 2). Children therefore share Kiln's console, and Ctrl+C reaches them as well as Kiln; the one-second hold on a child's end ([Stopping a session](#stopping-a-session-ctrlc-a-closed-terminal-and-signals)) lets Kiln's handler mark the run interrupted first | No |
| Keep-awake | PowerShell holding `SetThreadExecutionState` ([Keep-awake](#keep-awake)) | No |
| Sleep readings | The System log's Kernel-Power events, read through PowerShell on the 10-second tick: event 42 (entering sleep, with its time) and event 107 (resumed). A pair newer than the last reading is a sleep of that span | No |
| Process start time | `Get-Process` through PowerShell ([Ports and one Kiln per PRD](#ports-and-one-kiln-per-prd)) | No |
| Opening the browser | `cmd /c start "" <address>` | No |
| State directory | `%LOCALAPPDATA%\kiln`, inside the person's own profile, whose inherited access list (the person, `SYSTEM` and `Administrators`) stands in for mode `0700` | No |
| Paths | Separators normalized before any path comparison (the PRD directory's place under `docs/`, the worktree path check, the state key) | No |
| The resume command | PowerShell form: `cd '<worktree>'; claude --resume <session ID>`, quoted with single quotes, a `'` written `''` | No |

Claude Code runs natively on Windows; Kiln uses the same `claude` flags there. A Windows run of proof gate 1, and of AC-PROOF-01, tries every "No" above before release ([Testing Approach](#testing-approach)); one that doesn't work as written comes back as a product decision (PRD, "Depends On").

## Control From Outside the Browser

Not in v1 (AC-CLI-02, AC-VIEW-01). Business feedback (2026-10-17) expects it soon after, so v1 is built so that adding it changes no engine code.

A later version may let another client take every action the browser view offers: more `kiln` commands ([Kiln ideas after v1](../../design/kiln-after-v1-ideas.md), "More terminal commands"), or a chat bot the person drives from a phone. v1 keeps that open:

- Every control is an engine command reached through the [HTTP API](#http-api) (start, pause, cancel a pause, check again, settings), and every screen renders from the Snapshot and its event stream. The view holds no control logic of its own, so a new client calling the same API can do exactly what the view can, and no more. No view-only endpoint bypasses an engine command.
- A command on the same machine finds a running instance through its `instance.lock` (the port) and authenticates with the PRD's token in `prd.json`, both readable by the owner only ([Kiln's State on Disk](#kilns-state-on-disk)).
- A control refused in the current state returns 409 with its reason, so a client that can't see the screen still learns why.
- Reaching Kiln from off the machine is what v1 deliberately prevents (AC-VIEW-01, AC-VIEW-06). A phone path comes through a process on the same machine that calls the local API and relays to the outside service under that service's own authentication, never by binding beyond loopback or relaxing the Host, Origin and token checks. That relay needs its own design.

## Testing Approach

Superseded in part by: docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md, §Proof gates and tests (new Claude sessions also require catalogue validation).

**Order.** Proof gates 1 and 2 (architecture proposal) come first, before the engine is built: both run by hand with no Kiln code, gate 1 includes the untried behaviors this design relies on, and their recorded stream-json output becomes the test fixtures below. Gate 3 runs once Needs you exists; gate 4 is AC-PROOF-01. A behavior that doesn't hold comes back as a product decision (PRD, "Depends On").

- **Plan reader (ids from file names and `## Split into` links, unparseable and duplicate ids, order, Closed lines, dependencies, Documents found counts), output and progress derivation (one line per content block, several from one assistant event; a top-level result's last non-empty line after Claude Code's `Exit code` line; no line for a Skill or subagent result), including [reading a Bash command](#output-and-progress) for Commit and Push (commit and push in one call, `git -C`, a variable before `git`, a heredoc message that mentions `git push`, `commit-tree`):** unit tests on fixture phase documents, PRDs and designs, and on stream-json transcripts recorded during proof gate 1.
- **Instance lock and process start time (AC-MULTI-04):** against real processes: a second `kiln run` while the holder is live prints the address and starts nothing; a lock whose PID is gone, whose PID now belongs to another process (a different start time), or that is unreadable is replaced; the start-time reader on the running platform, including a command name with spaces and parentheses.
- **Ports (AC-MULTI-02):** against a real `ports.json` and real listeners: a PRD keeps its port across runs, two repositories with the same PRD folder get different ports, a port held by another program stops `kiln run`, and a full range takes the least recently served stopped PRD's port.
- **Account and usage (AC-WATCH-08, AC-WATCH-09):** unit tests over recorded `claude auth status --json` output (signed in, `loggedIn` false, no plan, unparseable) and a recorded `/usage` report: labels and short labels (a surface-named `weekly_scoped` row included), server order kept, rows left out (an unknown `kind`, a `weekly_scoped` row with no name), an empty list, a missing report with and without a plan, `nearLimit` at 80%, and an unrecognized shape giving `limitsError`.
- **Keep-awake (AC-KEEP-06, AC-KEEP-07):** against the real `caffeinate`, `gnome-session-inhibit` or `systemd-inhibit` on the running platform: the tool chosen for the session type, held only while a session's process runs and keep-awake is on, released at Needs you, pause, completion and exit, and the error shown when no tool is available.
- **Keep-awake on Linux desktops (manual check):** on Ubuntu GNOME and on KDE, with automatic suspend at its shortest timeout, a working session keeps the computer awake past the timeout. On GNOME the screen still locks and suspend from the menu still works. Closing the lid suspends on both; on KDE with systemd 257 or newer, record whether suspend from the menu is refused while a session works (PLAT-001).
- **Origin and the pull-request check:** unit tests over each origin URL form the [Command line](#command-line-ac-cli-01-ac-cli-02-ac-start-09) accepts and rejects, and over recorded `gh pr list` output with a draft and a fork's pull request; a stand-in `gh` that records its arguments confirms every call carries `--repo`.
- **Done check, worktree setup, the worktree path check (a relative path, `~`, a path inside the main checkout or another worktree), base check, pushed check, the `kiln run` path rules ([Command line](#command-line-ac-cli-01-ac-cli-02-ac-start-09); a path inside Kiln's worktree reaches the main checkout's record and repository name, and a path in a submodule reaches the submodule's own):** against real temporary Git repositories with a local bare repository as `origin`, never a mocked Git.
- **Sleep detection:** unit tests over recorded sequences of each operating system's suspend readings (macOS sleep and wake times, Linux uptime against the monotonic clock), including a wall-clock change that isn't a sleep. Interrupted-or-ended classification is unit-tested over a gate 1 recording (`sigint-process-group-mid-bash`) with sleeps placed into it: a session that survived a sleep then hit a usage limit (ended on its own), one a sleep killed mid-Bash and one a sleep killed mid-response (both interrupted). Gate 1's own sleep recordings are optional (waived by Doug on 2026-10-17); what a real session does across a sleep is checked in normal use and in Phase 6's proof run.
- **Engine, signals and resume:** against a stand-in `claude` executable that replays recorded transcripts and honors the interrupt request the way proof gate 1 shows the real one does, including a signal that arrives while a session is exiting, a check is running or a setup step is in progress: nothing is judged, and the next `kiln run` judges from the record. A `claude` that can't be started (a missing executable or worktree), on a launch and on a resume, records a run with `spawnError` and goes to Needs you by the done check (the pull-request check for the pull-request session), with no retry. A worktree or PRD directory removed after Start gives a `plan` stop, or the Closed fact after a session, never the pull-request session. This is acceptable only because proof gates 1 to 3 and AC-PROOF-01 exercise the real Claude Code boundary.
- **Models and effort:** unit tests over a `supportedModels()` result recorded during proof gate 1, and over a failing call: the dropdown's entries and names, disabled effort levels, the saved effort moved to a supported level, no `--effort` for a model without effort, and the saved alias kept when the list fails.
- **Server security:** requests with a foreign Host, a foreign Origin or no token are refused.
- **Pause (AC-VIEW-03):** against the stand-in `claude`: Keep going before the phase is Done lets the next phase start; Keep going once the pause is active returns 409; a pause requested before a Needs you holds after Check again passes.
- **The view (AC-LOOK, AC-WATCH):** each mockup screen rendered in a real browser from a fixture `Snapshot` carrying that mockup's sample data, and compared with the mockup rendered alongside it, plus the Disconnected and reconnect behavior against a server that stops and returns, and a final message containing raw HTML shown as text (AC-STOP-02).
- **Windows:** CI runs the unit tests, the Git integration tests and the engine tests with the stand-in `claude` on a Windows runner as well. Before release, a person on Windows runs proof gate 1's session, interrupt, resume and sleep checks, the keep-awake check, and AC-PROOF-01.
- **The package (AC-INSTALL-01):** `npm pack`, then `npm install -g` of that tarball into a temporary prefix, then the installed `kiln` on a real temporary repository: it prints its usage and serves the view, its scripts, styles and bundled fonts. CI runs it on all three platforms (`npm run test:package`).
- **The release:** AC-PROOF-01 and AC-PROOF-02, a real three-to-five-phase feature with a real pull request: the proof feature Word tally (`scripts/proof-run/`), run by a person on Windows and on macOS or Linux ([Kiln proof run steps](../../design/kiln-proof-run-steps.md)). Before that, `scripts/exploration/proof-rehearsal-real-feature.mjs` runs the same feature on macOS with the real Claude Code and GitHub stood in for.

## Integration Points

- **Claude Code:** sessions, resume, account, usage and the model list, as above. Every flag is from the proposal's interface table, checked against Claude Code 2.1.299's help on October 15, 2026.
- **Git:** `ls-remote` (`--symref origin HEAD 'refs/heads/*'` for origin's branches and default branch in one call; a changed base's tip; at Start, the base's tip recorded as `baseCommit`; the done check's origin tip); the objects-only `fetch --no-write-fetch-head --refmap=` of a base tip that isn't local; at Start, `worktree add`; `worktree list --porcelain` (the main checkout, the worktree path check and setup's state); `status`; `rev-parse`; `rev-list`; `merge-base --is-ancestor` (the "isn't on origin yet" fact); `log` (commit subjects); `remote get-url origin` ([Command line](#command-line-ac-cli-01-ac-cli-02-ac-start-09)); `check-ref-format --branch` (the branch field's valid branch name check). All are reads except `worktree add` at Start, which creates the branch and worktree; the objects-only fetch adds objects but moves no ref.
- **GitHub:** only through `gh`, for the sign-in start check and the pull-request check and its facts. The pull-request session opens the pull request itself.
- **The Enso Method skills:** used as published, never edited or read for status (AC-RUN-06). Kiln depends on the conventions [The Plan Reader](#the-plan-reader) reads: the document names and phase file layout, the `Phase <id>:` title, `## Split into`, `## Phase dependencies`, `## Acceptance criteria covered`, the `**Closed:**` line, the PRD's criterion labels with their retired and `Superseded by:` forms, and the assumptions document's entry headings and Validated Assumptions table; and on the step skill names (Progress steps).

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-START-01 to 09 | What `kiln run` does; The Plan Reader; Worktree and Branch Setup; Command line; Snapshot |
| AC-RUN-01 to 07 | What `kiln run` does; The Plan Reader; Sessions; The prompts |
| AC-DONE-01 to 04 | The Done Check; What `kiln run` does (a stopped feature, and a `plan` stop's check, AC-DONE-03) |
| AC-STOP-01 to 08 | What `kiln run` does; How a session ended; Stopping a session; The prompts; The Done Check; HTTP API |
| AC-GIT-01 to 04 | Worktree and Branch Setup; Stopping a session; Kiln's State on Disk |
| AC-PR-01 to 05 | Engine loop; The prompts; The pull-request check; Snapshot |
| AC-WATCH-01 to 11 | Output and progress; Snapshot; Account and Usage; Interfaces. AC-WATCH-11 holds because Kiln derives nothing from what sessions say beyond quoting it |
| AC-CLI-01, 02; AC-VIEW-01 to 08 | What `kiln run` does; Command line; The Local Server; HTTP API; Snapshot |
| AC-MULTI-01 to 04 | Ports and one Kiln per PRD; Kiln's State on Disk; Worktree and Branch Setup |
| AC-KEEP-01 to 07 | Workload Type and Starting Point; Stopping a session; Interruptions, sleep and resume; Keep-awake |
| AC-INSTALL-01 to 03 | Dependencies; Package and Distribution; Windows |
| AC-LOOK-01 to 05 | The view is built from the mockups' HTML, which is its specification; fonts are bundled; Command line (the repository name) |
| AC-PROOF-01, 02 | Testing Approach; the phase-session prompt's worktree and branch lines |

## Open Questions

None. These are settled and not to be reopened: the permission mode ([Design Decisions](#design-decisions)), the lost-record behavior ([What `kiln run` does](#where-a-feature-stands-what-kiln-run-does)), the Documents found field messages ([Worktree and Branch Setup](#worktree-and-branch-setup)), how the untried Claude Code behaviors are tried (proof gate 1, [Testing Approach](#testing-approach)) and the npm package name ([Package and Distribution](#package-and-distribution)).
