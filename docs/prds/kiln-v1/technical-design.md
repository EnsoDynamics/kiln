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

The engine has no dependency on the server or the view; the server reaches the engine only through the engine's command interface (start, pause, check again, change settings) and its state snapshots. Orchestration never lives in view code. The engine keeps state per phase and per session, never as "the one current session", and chooses the next phase in one function, so a dependency-aware scheduler could later replace it (proposal, "v1 scope").

**Starting point:** there is no seed project for an npm CLI. Tooling copies `commercesong/ensodynamics-admin`: Node `>=22` in `engines`, TypeScript with `tsc --noEmit` typecheck, ESLint, Vitest with one config per test tier, a dependency audit script, and a `verify` script that CI runs. The HTTP layer is Hono on `@hono/node-server`, chosen for its small footprint and built-in server-sent-events support.

### State store

Plain files under Kiln's state directory: one JSON record per PRD, written atomically, and append-only JSON Lines for each session's events and output. Nothing Kiln stores needs a query beyond "this PRD's record" and "a page of one session's output by line number", and there is exactly one writer per PRD (the instance lock), so a database would add a native dependency for no benefit. Details in [Kiln's state on disk](#kilns-state-on-disk).

### Dependencies

All already on the person's machine (AC-INSTALL-02); Kiln has no account, credential or service of its own.

| Dependency | Used for |
|---|---|
| `claude` (Claude Code CLI) | Sessions, resume, account (`claude auth status --json`), usage (`/usage`) |
| `@anthropic-ai/claude-agent-sdk` (npm dependency) | Only the model list (`supportedModels()`), pointed at the person's own `claude` executable. The SDK's optional platform package, a bundled Claude Code of about 245 MB unpacked (0.3.220, macOS arm64), installs with Kiln although Kiln never runs it |
| `git` | Worktree setup and every read of Git state |
| `gh` (GitHub CLI) | The pull-request check and the Complete screen's pull-request facts |
| `caffeinate` (macOS) or `systemd-inhibit` (Linux) | Keep-awake |
| `open` (macOS) or `xdg-open` (Linux) | Opening the browser view |

Every `git`, `gh` and helper `claude` call Kiln makes (everything except a session) runs with a timeout of 2 minutes and with no terminal to prompt on: stdin closed and `GIT_TERMINAL_PROMPT=0`. A credential prompt or a hung network call becomes that call's error, shown where its result would have been, instead of a stall.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| How sessions are run | Spawn the `claude` CLI directly with the flags in the proposal's interface table; the Agent SDK is used only for the model list | The CLI flags are what the proposal checked and the proof gates try; the resume command handed to the person is the same CLI, so Kiln runs exactly what a person could |
| Process group | Each `claude` process is spawned detached, in its own process group | Kiln, not the terminal, decides what the session receives on Ctrl+C or a closed terminal, and can end the whole group, including tool subprocesses, without orphans |
| Branch start point | `git fetch origin <base>`, then `git worktree add --no-track -b <branch> <path> origin/<base>` | The pull request targets the remote base, so starting from it avoids a stale start; `--no-track` stops a bare `git push` from ever targeting the base branch |
| Pushed check | Compare the local branch tip with `git ls-remote origin refs/heads/<branch>` | Asks the remote itself rather than trusting the remote-tracking ref or the session's claim that `git push` succeeded |
| Interrupted vs ended on its own | From Kiln's own record: a session record with no end time, or an exit after a sleep Kiln detected without a successful result event | Kiln knows it was there; no reading of what the session said (principle 3) |
| Live updates | Server-sent events, one stream per open tab | Updates flow one way; controls are ordinary POSTs; `EventSource` reconnects on its own when `kiln run` comes back on the same address |
| Port | One port per PRD from 4700 upward, assigned once and kept | Several instances run at once, and a tab left open reconnects to the same address (AC-MULTI-02). The range avoids 4317 and 4318, OpenTelemetry's default ports, which Claude Code's own telemetry setup points at on localhost, and Erlang's 4369 |
| Model list | The Agent SDK's `supportedModels()`, accepting the SDK's bundled Claude Code as install size | The only route to the models Claude Code offers the signed-in account (UI-004); the cost is disk space, not behavior |
| Control security | Loopback bind, Host and Origin checks, and a per-PRD token embedded in the page Kiln serves | Blocks other sites and DNS rebinding with nothing for the person to enter (AC-VIEW-06) |
| State format | Plain JSON and JSON Lines files | See [State store](#state-store) |
| Fonts | Bundled in the package (Instrument Serif, Inter and JetBrains Mono, all under the SIL Open Font License) | Nothing the view loads leaves the machine (AC-INSTALL-02) |
| Prompts | Each prompt Kiln sends is a template file in the package | House standard: prompts live in files, not inline strings |
| Usage-limit threshold | One constant, 80% (UI-001) | Switching to Claude Code's own warning level is a one-line change if UI-001 is corrected |
| Permission mode | `--permission-mode auto --permission-prompts none` | The only mode an unattended session can work in: `dontAsk` and `acceptEdits` deny the Bash commands that run tests and Git, and `bypassPermissions` drops every safeguard. Settles the PRD's open question and the proposal's open question 3 |

## Where a Feature Stands: what `kiln run` does

Every `kiln run` resolves the PRD, takes the PRD's instance lock, and reconciles. Pseudocode:

```
resolve path → repository (git common dir), PRD directory, feature name
take the instance lock, or print "already running at <address>" and exit   (AC-MULTI-04)
record ← the PRD's record, if any

if no record, or Start was never pressed:
    run the start checks (AC-START-02) in the checkout the path is in; any failure → print it, exit
    serve; print the not-started lines; open the browser on Documents found
elif record says complete:
    serve; show Complete
else:
    if the setup isn't recorded as done: finish it                   (see Worktree and Branch Setup)
    plan ← read the phase docs in the worktree
    if a session in the record has no end time (Kiln stopped while it worked):
        stop any live process still holding it                        (see Interruptions)
        done check → pass: Done · fail: resume it, or Needs you if it can't be resumed
    elif the record holds a stop (Needs you):
        that phase's check (done check, or the pull-request check) → pass: Done, finished by the person · fail: Needs you with the new facts
    elif a pause is active: Paused
    else: carry on
    serve; print the underway lines; open the browser on the progress view
then the engine loop runs until Ctrl+C
```

Engine loop, after Start and after each phase is Done:

```
loop:
    re-read the plan from the worktree
    leaf ← first leaf without a Closed line, in plan order               (AC-RUN-01, AC-RUN-04)
    if a pause is pending: mark it active; wait for Start                (AC-VIEW-03)
    if no leaf is left:
        pull-request check passes → complete, no session                 (AC-PR-01)
        otherwise run the pull-request session; its check decides Complete or Needs you
        stop here
    refresh account and usage                                            (AC-WATCH-09)
    run a session for the leaf; wait for it to end
    done check → pass: Done, next iteration · fail: Needs you; wait for Check again
```

A pause pressed during a phase stays pending through a Needs you and becomes active only when that phase is Done by any route, including Check again and a restart (AC-VIEW-03).

**A lost record.** If Kiln's state for a PRD is deleted, `kiln run` treats the feature as not started: Documents found, where UI-003 refuses the existing feature branch name and the [worktree check](#worktree-and-branch-setup) refuses the existing worktree path. The worktree, the branch and every commit stay untouched, and the person can finish the work by hand. Kiln does not try to adopt an existing worktree, because without its record it can't tell which branch it created or which base branch the pull request should target. This narrows the proposal's line that a lost record only costs transcripts and automatic resume, because adopting the old branch would mean working on a branch Kiln can't show it created, which AC-START-07 and UI-003 rule out (settled October 15, 2026). The taken-branch message warns that a new name starts the PRD over from the base branch, since the Closed lines live on the old branch. Moving or renaming the repository's folder has the same effect, because the record is found by the main checkout's path ([Kiln's state on disk](#kilns-state-on-disk)).

**A plan that breaks after Start.** Start checks don't run again once the feature is underway (AC-START-02), but every plan read does the same structural checks: a `## Split into` row with no file, or a phase file no split record lists. A broken plan found after Start stops Kiln at Needs you on the current phase, with the problem as its Closed check's fact (for example `phase-2-refund-routing.md lists 2c, which has no file`); Check again reads the plan again.

## The Plan Reader

Kiln reads the plan the way `phase-split` writes it, and nothing older (proposal, "Never").

- **Documents.** In the PRD directory: `<folder name>-prd.md`, `technical-design.md`, optional `assumptions.md`, and every `phase-*.md`. Before the worktree exists Kiln reads them in the checkout the path is in; after, in the worktree only (AC-RUN-01).
- **Phase ids and order.** The id is the part of the file name between `phase-` and the next `-`, read as alternating digit and letter runs (`2`, `2a`, `2a1`). Top-level phases run in numeric order; a split record's children run in the order of its `## Split into` table, in their parent's slot. A phase file whose parent isn't a split record listing it, or a `## Split into` row with no file, fails the start checks.
- **Title.** The H1 after `Phase <id>:`, word for word, without a trailing ` — split into …` (AC-LOOK-03).
- **Split record vs leaf.** A document with a `## Split into` heading is a split record; any other is a leaf.
- **Closed.** A line starting `**Closed:**` before the document's first `##` heading.
- **Cited criteria.** Labels matching `AC-<AREA>-<NN>` under `## Acceptance criteria covered`. Every leaf needs at least one (AC-START-02).
- **Dependencies.** Phase ids found under `## Phase dependencies`, outside parentheses. Each must come earlier in plan order than the phase naming it (AC-START-02).
- **What Documents found counts (AC-START-04).** PRD: distinct `AC-…` labels in the PRD file, their count, first and last. Technical design: how many of those labels it cites, counting a range such as `AC-START-01 to 09` or `AC-START-01–09` as every label in it, since designs commonly cite criteria that way. Assumptions: entries are `### <ID>.` headings; those not yet confirmed are the entries outside the "Validated Assumptions" table whose heading doesn't carry `✅ VALIDATED` (a transitional marker, per `assumptions-document-writing`), and the total adds that table's rows. Plan: phase document count, leaf count, and the ordered tree.

## Sessions

### Starting a phase's session

```
claude -p <launch prompt>
  --session-id <UUID Kiln generates and records first>
  --model <model> --effort <effort>                         (from settings when the session starts)
  --output-format stream-json --verbose --include-partial-messages
  --forward-subagent-text
  --permission-mode auto --permission-prompts none
working directory: the worktree · stdin: closed · stdout, stderr: piped · own process group
```

Before spawning, Kiln writes the session record (ID, phase, model, effort, start time, and the branch tip as the phase's starting commit), so a crash at any later point still leaves a record that says the session was running.

### The prompts

Each is a template file; `<…>` are filled from the record. Everything in them is something a person could type (AC-RUN-06).

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

> Kiln was interrupted at `<time>` (`<cause: Ctrl+C | the terminal closed | Kiln was stopped | the computer slept>`) while this session was working, and has resumed it. Carry on with `<phase doc>` from where you stopped; check the worktree first, because work may have stopped partway through a step. Everything in the first message still applies.

For the pull-request session, "Carry on with `<phase doc>`" reads "Carry on opening the pull request", and its check is "check GitHub first, because the pull request may already be open".

**Pull-request session (AC-PR-01):**

> Every phase of the `<feature name>` PRD (`<PRD file>`) is implemented and pushed to `<branch>`. Open one pull request on GitHub from `<branch>` into `<base branch>`, titled and described from the PRD. You may not merge it, deploy anything, or touch any other branch. You're finished when the pull request is open.

**Fresh session, offered on Needs you (AC-STOP-06):** the phase-session prompt with one added sentence after the first: "A previous session stopped partway through this phase; check the worktree's state before you start." The pull-request variant is the pull-request prompt unchanged.

The Needs you resume command is `cd <worktree>` then `claude --resume <session ID>` (AC-STOP-05).

### Output and progress

Kiln saves every event exactly as received, stamped with the time it arrived, except partial-message deltas: those only feed the live view, and the finished message that follows carries the same text, so storing them would multiply the file's size for nothing. Output lines are derived from the saved events and can be rebuilt from them. Rules:

| Event | Output line |
|---|---|
| Assistant text, top level | `claude`: the text |
| Assistant text or tool call with `parent_tool_use_id` | `reviewer` when the parent Agent call started during the Deliverable review step, otherwise `subagent`; a tool call reads like a `tool` line (`Read src/returns/models.py`, as in the Phase detail mockup) (AC-WATCH-05) |
| `tool_use` | `tool`: the tool name and its main input (the Bash command, the file path, the Agent description) |
| `tool_use` of the Skill tool | `skill`: `Skill <name>` |
| `tool_result` | `out`: its first lines; `stderr` when it is an error |
| `permission_denied` | `tool`: `denied` and the tool |
| Process stderr | `stderr` |
| Process exit | `exit`: `Process exited with code <n>` (or the signal) |
| Partial-message deltas | Not stored; pushed to open views as live text, replaced by the finished line |
| Anything else (thinking, `init`, hook, rate-limit and other system events) | Saved, no output line |

Lines are numbered per session; the full output and "Load earlier" read pages by line number (AC-WATCH-05, AC-WATCH-10).

**Progress steps (AC-WATCH-04)** come only from top-level tool calls. A Skill name matches on the part after its last colon, so plugin-qualified names count:

| Step | Starts at |
|---|---|
| Build | Skill `implement-from-requirements` |
| Deliverable review | Skill `deliverable-review` |
| Test hardening | Skill `test-hardening` |
| Commit | The first Bash call whose command runs `git … commit` |
| Refactor pass | Skill `refactor-pass` |
| Push | The first Bash call, after Commit, whose command runs `git … push` |

When a step starts, every earlier step that had started counts as finished; a step never seen stays unreached. "Seen in the session" is the latest step start or Skill call. "Last skill seen" on Needs you is the last top-level Skill call and its time.

**How a session ended (AC-STOP-02).** The final message is the `result` event's text when the stream has one and it isn't empty. Otherwise the session ended without a final message, and Needs you shows its last 10 output lines. The exit code is the process's; a session ended by a signal shows the signal.

### Stopping a session: Ctrl+C, a closed terminal and signals

Kiln handles SIGINT (Ctrl+C), SIGHUP (the terminal closed) and SIGTERM the same way (AC-KEEP-02):

1. Write the interruption into the session record first (cause and time), so the record is right even if Kiln is killed partway through what follows.
2. Send SIGINT to the session's process group. Claude Code ends the turn and leaves the session resumable.
3. Wait up to 30 seconds for the process to exit. A second Ctrl+C skips the rest of the wait.
4. If it is still running, send SIGTERM to the group; after 5 more seconds, SIGKILL.
5. Release keep-awake, close the server, release the instance lock, print "Interrupted phase <n>, <title>. Its session and uncommitted work are kept." (skipped when the terminal is gone), and exit.

Kiln never touches the worktree on the way out (AC-KEEP-03). If Kiln itself is killed outright, the session record still has no end time, and the next `kiln run` treats it as interrupted.

**Never two processes on one session.** The record keeps the `claude` process's PID and start time. Before resuming, and on every `kiln run`, Kiln checks whether that process is still alive (same PID and start time, so a reused PID isn't mistaken for it). If it is, Kiln stops it as in steps 2 to 4 before going on. Nothing starts after a stop until Check again or `kiln run` (AC-STOP-08).

### Interruptions, sleep and resume

**Detecting sleep.** Every 10 seconds Kiln compares how far the wall clock moved with how far the monotonic clock moved. The monotonic clock doesn't advance while macOS or Linux is suspended, so a gap of more than 30 seconds means the computer slept; Kiln records the sleep on any working session's record.

**After waking, while Kiln kept running:**

- If the session's process is still alive, Kiln leaves it alone; it is still working.
- If it exited, and a sleep was recorded during that process's run, and that run's own events have no `result` or its `result` is an error, the session was interrupted by the sleep. Kiln runs the done check and resumes it if the check fails (AC-KEEP-04).
- Any other exit, including a successful `result` after a sleep, ended on its own and is judged by the done check alone.

Both facts belong to the one run, never to the session as a whole: an error from an earlier run, or a sleep during one, doesn't make a later run's exit an interruption. Otherwise a resumed run that fails on its own (a usage limit, say) would be resumed again and again.

**Resuming (AC-KEEP-04).** Done check first; if it passes the phase is Done and nothing is resumed. Otherwise:

```
claude -p <resume prompt> --resume <session ID>
  with the model and effort the session started with, and the same output and permission flags
```

The resumed process keeps the session ID; it gets a new entry in the session's record, and its events go to the same files. A session can be resumed after every interruption; Kiln never resumes one that ended on its own.

**A session that can't be resumed (AC-KEEP-05).** If the resumed process exits without its stream first reporting that session's `init` event, the session can't be resumed. The phase goes to Needs you showing when it was interrupted, its last output lines, and the fresh-session prompt, with no resume command.

Kiln has no watchdog for a session that stops producing output without exiting; the view shows how long ago the last line arrived, and Ctrl+C then `kiln run` resumes it.

## The Done Check

Run in the worktree after every phase's session, on Check again, on `kiln run` for a stopped phase, and before any resume (AC-DONE-03). All three must pass (AC-DONE-01); the session's exit code and words play no part (AC-DONE-02, AC-DONE-04).

| Check | Predicate | Fact shown when it fails (AC-STOP-03) |
|---|---|---|
| Closed | The launched leaf's document has its Closed line; if that leaf is now a split record, its first child's document has it | `No Closed line in <file>` |
| Committed | `git status --porcelain --untracked-files=all` in the worktree prints nothing | `<n> files changed, not committed` |
| Pushed | The worktree is on the feature branch, and the branch's local tip equals the commit `git ls-remote origin refs/heads/<branch>` reports | `<sha> isn't on origin yet` (origin's commit is an ancestor of the local tip), `origin is at <sha>, not <local sha>` (any other difference), `<branch> isn't on origin yet`, `The worktree is on <other>, not <branch>`, or `Couldn't reach origin: <git's error>` |

A check Kiln can't run at all (the worktree is gone, `git` or `gh` fails) fails with the command's own error as its fact. A read of origin that fails on the network is retried for up to 2 minutes before the check reports `Couldn't reach origin`, because the network is often not back yet when a computer wakes; this retries a read, never a session. Passing facts are shown too ("Latest commit a41c9e2, tree clean", "Matches origin at 5d81b37"). A pass records the pushed commit, the Done time, and whether the person finished it (any pass reached through Check again or `kiln run` on a stopped phase).

**The pull-request check (AC-PR-02)** replaces the done check for the pull-request session: `gh pr list --head <branch> --base <base> --state open` run in the main checkout returns a pull request. Its number, title, link, commit count, and lines added and removed come from the same call (AC-PR-04).

## Worktree and Branch Setup

Done once, when Start is pressed on Documents found, and the only Git state Kiln ever changes (AC-GIT-01). Kiln never resets, stashes, cleans, force-pushes or deletes (AC-GIT-02).

**Defaults (AC-START-07):** branch `feature/<PRD folder name>`; worktree `<repository folder>-kiln/<PRD folder name>` beside the repository; base `develop` when `origin/develop` exists, otherwise the remote's default branch.

**Checked as the person edits the fields, and again at Start; Start stays unavailable while any fails:**

- the feature branch name is a valid ref and no branch of that name exists locally or on origin (UI-003);
- the worktree path doesn't exist, or is an empty directory;
- the base branch exists on origin, and the PRD directory on `origin/<base>` is identical to the one Kiln read, so sessions implement exactly the documents Documents found showed.

Each failure is shown beside its field, in the wording the Documents found mockup's source gives in its field-message comments (UI-003 for the branch). Then Kiln records the settings as fixed (AC-VIEW-08) and Start as pressed, fetches, adds the worktree as in [Design Decisions](#design-decisions), records the setup as done, and starts the first phase. Recording first means an interruption partway through setup leaves a record that owns the branch and worktree names, so the next `kiln run` finishes the setup instead of refusing names Kiln itself just took: it accepts a worktree already at the recorded path on the recorded branch, and otherwise repeats the steps. The worktree stays after completion (AC-GIT-04).

## Keep-awake

Kiln holds a keep-awake while a session's process is running and keep-awake is on, and releases it whenever none is: at Needs you, paused, complete, and on exit (AC-KEEP-06). Turning the setting off or on applies at once.

- **macOS:** a child process `caffeinate -i -w <Kiln's PID>`. `-i` prevents idle sleep only, so closing the lid still sleeps the machine (AC-KEEP-07); `-w` makes it exit if Kiln dies without releasing it.
- **Linux:** a child process `systemd-inhibit --what=idle:sleep --mode=block --who=Kiln --why="Kiln: <feature name> is being implemented"` holding a command that exits when Kiln's PID does. logind ignores inhibitors for the lid switch by default, so closing the lid still suspends.

If the tool is missing (Linux without systemd), Kiln says so in the terminal and the keep-awake setting shows the error (wording in the Documents found mockup's source), rather than appearing on while doing nothing.

## The Local Server

### Ports and one Kiln per PRD

- **Port.** Each PRD gets a port from 4700 to 4799 the first time `kiln run` serves it: the lowest port neither assigned to another PRD nor in use. The assignment is kept only in the shared port registry, `ports.json`, updated under a lock and keyed by the PRD's state directory (repository directory and PRD key together, since two repositories can both have `docs/prds/customer-returns/`), with the time each PRD was last served. The PRD keeps its address for good (AC-MULTI-02). If its port is held by something other than Kiln, `kiln run` says what port and exits rather than move the address. When every port in the range is assigned, the PRD served least recently that isn't running gives up its port; a tab still open on that PRD from long ago no longer reconnects.
- **Address.** `http://127.0.0.1:<port>/<PRD folder name>/`. The page title is the feature name (AC-MULTI-02).
- **Instance lock (AC-MULTI-04).** A lock file in the PRD's state directory, created exclusively, holding Kiln's PID, start time and port. A second `kiln run` that finds a live holder confirms it by calling that instance's API, prints "<feature> is already running at <address>" and exits without starting anything. A lock whose holder is gone is stale and is replaced.

### Local security

- The server binds `127.0.0.1` only (AC-VIEW-01).
- Every request must carry a `Host` of `127.0.0.1:<port>` or `localhost:<port>`, which defeats DNS rebinding.
- Every API request must carry the PRD's token (random, 256 bits, created with the record and kept in it): in a header for fetches, as a query parameter for the event stream. Kiln writes the token into the page it serves, which other sites can't read (AC-VIEW-06). Keeping it per PRD rather than per process lets a tab left open keep working after `kiln run` restarts.
- Requests that change anything must also carry an `Origin` matching the `Host` they were sent to (`http://127.0.0.1:<port>` or `http://localhost:<port>`).
- The state directory is created readable by its owner only (`0700`), since the record holds the token and the saved output can hold whatever the sessions printed.
- No CORS headers are ever sent. Every response sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and a Content Security Policy allowing only Kiln's own origin, with `frame-ancestors 'none'`.

## Interfaces

### Command line (AC-CLI-01, AC-CLI-02, AC-START-09)

`kiln run <PRD directory or PRD file>` is the only command. No path, or a directory with no single PRD, prints usage and exits non-zero. Start-check failures print what is missing and where Kiln looked, and exit non-zero. Phase event lines are `<local time> <phase id> <title> <started | done · pushed <sha> | stopped | interrupted | resumed | opened #<n>>`, as in the terminal mockup. Kiln needs `claude`, `git` and `gh` on the PATH, `gh` signed in, and `origin` on GitHub; a missing one is reported among the start checks.

### HTTP API

All under the view's origin; JSON bodies; times in UTC ISO 8601, shown in local time by the view. A control not allowed in the current state returns 409 with the reason.

| Method and path | Purpose |
|---|---|
| `GET /<PRD folder name>/…` | The view (client-side routes: progress, phase detail, full output) |
| `GET /api/snapshot` | The current `Snapshot` |
| `GET /api/events` | Server-sent events: `snapshot` on connect and on every change, `output` (new `OutputLine`s for working sessions), `partial` (live text), `heartbeat` every 5 seconds |
| `GET /api/sessions/{sessionId}/output?before={line}&limit={n}` | A page of a session's output (Load earlier, full output) |
| `POST /api/settings` | `{ model?, effort?, keepAwake?, worktreePath?, featureBranch?, baseBranch? }` → the settings with any field errors; worktree and branches only before Start (AC-START-06, AC-VIEW-08) |
| `POST /api/start` | Before the first phase: `{ refinementConfirmed: true }`, refused until the settings validate (AC-START-05). When paused: no body |
| `POST /api/pause` | Pause after this phase; not offered during the pull-request session (AC-VIEW-03, AC-PR-05) |
| `POST /api/check-again` | Run the stopped phase's check (AC-STOP-07) |

**Connection (AC-VIEW-04, AC-VIEW-07).** The view shows "updated <n>s ago" from the last event. On a stream error, or no heartbeat for 15 seconds, it shows Disconnected and keeps the last snapshot on screen, with a phase that was Implementing shown as Interrupted (AC-WATCH-01, AC-WATCH-02). `EventSource` keeps retrying; when `kiln run` is back on the same address, the first `snapshot` restores the live view.

### Snapshot

What every screen renders from. Outline:

```
Snapshot:
  feature: { name, repositoryName, prdFolder, state: not_started | implementing | paused | needs_you | complete,
             currentPhaseId?, phasesDone, phasesTotal, startedAt?, completedAt?, stoppedAt? }
  documents?: (not started only) { prd: { file, criteriaCount, firstLabel, lastLabel },
             design: { file, criteriaCited }, assumptions: { file, total, notYetConfirmed } | null,
             plan: { phaseDocCount, leafCount, phases: [ { id, title, splitInto? } ] },
             checks: [ { name, passed } ] }
  settings: { agent: "Claude Code", model: { value, displayName }, effort, keepAwake, keepAwakeError?,
             worktreePath, featureBranch, baseBranch, fixed, fieldErrors }
  models: [ { value, displayName } ]                       (Documents found and Change)
  phases: [ PhaseView ]                                    (plan order; the pull-request row once every leaf is closed)
  current?: { phaseId, sessionId, model, effort, startedAt, steps: [ { name, state, startedAt? } ],
             seenInSession: { text, at }, latestLine, commits: [ { sha, subject } ] }
  needsYou?: { phaseId, kind: done_check | pull_request_check | not_resumable, stoppedAt,
             finalMessage?, exitCode?, signal?, lastSkill?: { name, at }, lastLines?,
             checks: [ { name, passed, fact } ], checkedAt, resumeCommand?, freshSessionPrompt, outputLineCount }
  pause: { pending, active }
  account: { email, plan, updatedAt, limits: [ { label, percent, resetsAt, nearLimit } ], error? }
  pullRequest?: { number, title, url, head, base, commits, additions, deletions }

PhaseView: { id, title, file, state: planned | next | implementing | needs_you | done | split,
             splitInto?, sessionStartedAt?, doneAt?, pushedSha?, finishedByPerson,
             details?: { from, to, model, effort, worktree, branch, commitCount, latestCommit, sessionId } }
```

"Interrupted" is never in a snapshot: Kiln is never running while a phase is interrupted, so the view derives it when disconnected. A phase's commits are those between its starting commit and the branch tip at Done.

Kiln's record is keyed by the leaf it launched, but rows follow the plan as it now reads. When a session split its leaf, the leaf's row shows Split and its session, times, pushed commit and Details move to the first child's row, the leaf the done check judged. A leaf closed without a Kiln session of its own (closed before Start, or closed by a session launched for another leaf) shows Done with no time, pushed commit or Details.

### Output line

```
OutputLine: { line, at, source: claude | tool | out | skill | reviewer | subagent | stderr | exit, text }
```

## Account and Usage

- **Account:** `claude auth status --json`; the screens use `email` and `subscriptionType` (the plan).
- **Usage:** `claude -p "/usage" --output-format stream-json --verbose --no-session-persistence`, run with stdin closed (left open, `claude -p` waits 3 seconds for piped input first) and with the PRD's state directory as its working directory so no project's hooks or settings load. Kiln reads `usage_report.rate_limits.limits[]`: `session` is "5-hour window", `weekly_all` is "Weekly", `weekly_scoped` is "Weekly · <model display name>". `nearLimit` is `percent >= 80` (UI-001).
- **When:** at `kiln run`, every 5 minutes while it runs, and just before each phase's session starts (AC-WATCH-08, AC-WATCH-09). Kiln never waits for a reset (UI-005).
- **If the report's shape isn't recognized** (the SDK calls it experimental), the account panel shows the error instead of guessed numbers.
- **Models (AC-START-06, UI-004):** at `kiln run`, Kiln opens an Agent SDK query against the person's `claude` executable without sending a prompt, calls `supportedModels()`, and closes it. The list is each entry's `value` and `displayName`. The default is the entry whose value is `opus`, so each session runs the latest Opus. Effort defaults to `high`. If proof gate 1 shows that an entry's `supportsAutoMode` reflects what the signed-in account may use, Documents found and Change show an error beside Model when the chosen model's is false, since a session needs auto mode to run; otherwise the first session's failure is the signal.

## Kiln's State on Disk

Root: `$XDG_STATE_HOME/kiln`, else `~/.local/state/kiln`, on macOS and Linux alike. Never inside the repository (AC-GIT-03).

```
<root>/ports.json                                   PRD state directory → port, last served
<root>/<repository name>-<8-char hash of the main checkout's path>/<PRD key>/
    prd.json                                        PrdRecord
    instance.lock
    <phase id | pr>/<session id>/
        session.json                                SessionRecord
        events.jsonl                                every stream event, with the time received
        output.jsonl                                OutputLine per line
        stderr.log
```

The PRD key is the PRD directory's path from the repository root with `/` replaced by `--`. The repository is identified through Git's common directory, so running from the main checkout or the worktree reaches the same record. JSON files are written to a temporary file and renamed into place; only the instance-lock holder writes, apart from `ports.json`, which every instance updates under its own lock.

```
PrdRecord:
  schemaVersion: 1
  repository: { mainCheckoutPath, name }
  prdDirectory, featureName, token
  settings: { worktreePath, featureBranch, baseBranch, model, effort, keepAwake }
  refinementConfirmedAt?, startedAt?, setupCompletedAt?, completedAt?
  phases: { <phase id>: { sessionIds[], startCommit, doneAt?, pushedSha?, finishedByPerson,
                          stop?: { kind, at, checks[] } } }       (stop: Needs you)
  pause: { requestedAt?, activeSince? }
  pullRequest?: { number, url }

SessionRecord:
  schemaVersion: 1
  sessionId, phaseId, kind: phase | pull_request
  model, modelDisplayName, effort, permissionMode, claudeVersion
  runs: [ { pid, processStartTime, startedAt, endedAt?, exitCode?, signal?, cause: launch | resume,
            interruptedBy?: sigint | sighup | sigterm | sleep, result?: { subtype, isError, text? } } ]
  sleeps: [ { at, seconds } ]
  lastSkill?: { name, at }, steps: [ { name, startedAt } ]
```

The stop lives on its phase, not on the PRD, so state stays per phase as the proposal asks of v1 (parallel phases later would each need their own). The model's display name is recorded when the session starts, because `opus` names whichever Opus is latest and a finished phase's Details must keep showing the one it ran with. A record with a newer `schemaVersion` than this Kiln knows stops `kiln run` with a message to update Kiln; an older one is migrated when read.

Git and the phase documents stay the record of what is done; Kiln's record only remembers settings, sessions and stops.

## Package and Distribution

- **Package:** `@ensodynamics/kiln`, providing the `kiln` command; installed with `npm install -g @ensodynamics/kiln` (AC-INSTALL-01). The unscoped name `kiln` is taken on npm. The `ensodynamics` organization doesn't exist on npm yet; creating it before the first publish is a pending human action in the PRD.
- **Contents:** the compiled CLI, engine and server; the built view with its fonts; the prompt templates.
- **Platforms:** macOS and Linux; on Windows `kiln run` exits saying it isn't supported (AC-INSTALL-03).
- **Release:** a GitHub Actions workflow in `EnsoDynamics/kiln` publishes to npm with provenance on a version tag; nothing is published from a laptop.

## Testing Approach

**Order.** Proof gates 1 and 2 (architecture proposal) come first, before the engine is built: both run by hand with no Kiln code, gate 1 now includes the untried behaviors this design relies on, and their recorded stream-json output becomes the test fixtures below. Gate 3 runs once Needs you exists; gate 4 is AC-PROOF-01. A behavior that doesn't hold comes back as a product decision (PRD, "Depends On").

- **Plan reader, output and progress derivation:** unit tests on fixture phase documents and on stream-json transcripts recorded during proof gate 1.
- **Done check, worktree setup, pushed check:** against real temporary Git repositories with a local bare repository as `origin`, never a mocked Git.
- **Engine, signals and resume:** against a stand-in `claude` executable that replays recorded transcripts and honors SIGINT the way proof gate 1 shows the real one does. This is acceptable only because proof gates 1 to 3 and AC-PROOF-01 exercise the real Claude Code boundary.
- **Server security:** requests with a foreign Host, a foreign Origin or no token are refused.
- **The view (AC-LOOK, AC-WATCH):** each mockup screen rendered in a real browser from a fixture `Snapshot` carrying that mockup's sample data, and compared with the mockup rendered alongside it, plus the Disconnected and reconnect behavior against a server that stops and returns.
- **The release:** AC-PROOF-01 and AC-PROOF-02, a real three-to-five-phase feature with a real pull request.

## Integration Points

- **Claude Code:** sessions, resume, account, usage and the model list, as above. Every flag is from the proposal's interface table, checked against Claude Code 2.1.299's help on October 15, 2026.
- **Git:** fetch, worktree add, status, rev-parse, rev-list, ls-remote. All reads except the one-time setup.
- **GitHub:** only through `gh`, for the pull-request check and its facts. The pull-request session opens the pull request itself.
- **The Enso Method skills:** used as published, never edited or read for status (AC-RUN-06). Kiln depends on four of their conventions: the phase file layout, `## Split into`, the `**Closed:**` line, and the step skill names.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-START-01 to 09 | What `kiln run` does; The Plan Reader; Worktree and Branch Setup; Command line; Snapshot |
| AC-RUN-01 to 07 | What `kiln run` does; The Plan Reader; Sessions; The prompts |
| AC-DONE-01 to 04 | The Done Check |
| AC-STOP-01 to 08 | What `kiln run` does; How a session ended; The prompts; The Done Check; HTTP API |
| AC-GIT-01 to 04 | Worktree and Branch Setup; Stopping a session; Kiln's State on Disk |
| AC-PR-01 to 05 | Engine loop; The prompts; The pull-request check; Snapshot |
| AC-WATCH-01 to 11 | Output and progress; Snapshot; Account and Usage; Interfaces. AC-WATCH-11 holds because Kiln derives nothing from what sessions say beyond quoting it |
| AC-CLI-01, 02; AC-VIEW-01 to 08 | What `kiln run` does; Command line; The Local Server; HTTP API |
| AC-MULTI-01 to 04 | Ports and one Kiln per PRD; Kiln's State on Disk; Worktree and Branch Setup |
| AC-KEEP-01 to 07 | Stopping a session; Interruptions, sleep and resume; Keep-awake |
| AC-INSTALL-01 to 03 | Dependencies; Package and Distribution |
| AC-LOOK-01 to 05 | The view is built from the mockups' HTML, which is its specification; fonts are bundled |
| AC-PROOF-01, 02 | Testing Approach; the phase-session prompt's worktree and branch lines |

## Open Questions

None. The permission mode, the lost-record behavior, the Documents found field messages, the untried Claude Code behaviors and the npm package name were settled on October 15, 2026, in the sections above and in the proposal's proof gate 1.
