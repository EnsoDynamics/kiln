# Technical Design: Kiln multi-repo delivery

**PRD:** [Kiln multi-repo delivery](kiln-multi-repo-delivery-prd.md) · **Assumptions:** [assumptions.md](assumptions.md) · **Screens:** [mockups](mockups/), the design of record for the four screens drawn · **Changes:** [Kiln v1 technical design](../../prds/kiln-v1/technical-design.md), and the seams [Kiln usage-limit recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md) will need (that PRD has no design yet)

## Overview

Kiln v1 delivers a PRD through one worktree and one feature branch of the repository the PRD lives in. This change gives a PRD a list of repositories, a **workspace** holding one worktree of each on one feature branch, a done check that looks in every repository plus a fourth check read from the session's transcript, and one pull request per repository that changed.

The key decisions:

- **The PRD's repositories are a list in Kiln's record**, built at Start from the phase documents' `**Repositories:**` lines and grown afterwards by a second command, `kiln add-repository <name>`, which reaches the running Kiln through the HTTP API v1 already left open for clients outside the browser ([Control From Outside the Browser](../../prds/kiln-v1/technical-design.md#control-from-outside-the-browser)).
- **Every per-repository fact Kiln already keeps becomes per repository**: base branch, base commit, the branch Kiln created, setup state, each phase's start and pushed commits, the pull request. Everything else in v1 (one feature branch name, one engine loop, one phase at a time, the stops) is unchanged.
- **Stayed in the workspace** reads Claude Code's own transcript files for the session's file edits and Git commands, classifies each by where it happened, and never looks at the state of a checkout outside the workspace.
- **A one-repository PRD keeps v1's layout**, so the change is invisible to it until a session adds a repository.

## Existing Code

**Posture: Preserve** (the default; nobody named one). Kiln v1 is built and run from a local install of 1.0.0, not yet on npm, and PRDs may be underway on it; its behavior is the constraint, and a PRD already underway when this change ships carries on (AC-SPACE-03).

- **Reused as is:** the engine loop, plan reader, session runner and output derivation, stop handling, sleep and interrupt handling, keep-awake, ports, instance lock, local security, the Windows platform module.
- **Reused and extended:** worktree and branch setup (run once per repository), the done check (per repository, plus a fourth check), the pull-request check (per repository), the Bash command reader ([Reading a Bash command](../../prds/kiln-v1/technical-design.md#output-and-progress)), which this design also uses to place Git commands, the prompt templates, the record (schema 2, migrated from 1).
- **Behavior to keep that the code alone wouldn't say:** v1's default worktree is already `.worktrees/<PRD folder>/<repository>` (commit `a5322bc`), so a v1 PRD's worktree on the default path is already inside this change's default workspace folder. A record of schema 1 must migrate without touching Git; the worktree, branch and commits it names stay where they are.

## Claude Code Behaviors This Design Relies On

The PRD's "Depends On" names three. Each was tried against Claude Code 2.1.307 on 2026-10-22, in throwaway repositories laid out as a workspace (`W/product`, `W/returns-api`, `W/storefront`) with an outside checkout `O` beside it.

### Per-repository instructions

- **Session started in the workspace folder** (multi-repository): a worktree's `CLAUDE.md` isn't loaded at startup. It is loaded on demand, after the session's first Read or Write of a file in that worktree, and recorded in the transcript as a `nested_memory` attachment. Because it arrives after that first tool call, a first write can miss the rule; the session saw the rule then and corrected its write.
- **Session started in one worktree** (one-repository): a sibling worktree's `CLAUDE.md`, such as an added repository's, is never loaded, even after files there are read and written. `--add-dir` alone doesn't change that. `--add-dir` together with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` loads it at startup, but only for a folder that exists at launch.
- **A worktree's `.claude/settings.json` (permission rules and hooks) isn't honored** by a session started in the workspace folder, or for an `--add-dir` folder. Only the starting folder's own settings and the person's user settings apply.

**What that changes.** Every prompt tells the session to read a repository's `CLAUDE.md` and `AGENTS.md` before changing it ([Sessions](#sessions)), and so does the output of `kiln add-repository`. That covers the first-write gap and the added repository Claude Code never loads. A multi-repository session runs with no repository's own settings or hooks, the PRD's repository's included. Kiln can't fix that without writing settings into the workspace folder, and the PRD doesn't ask for that. It goes back as a product decision ([Open Questions](#open-questions)).

### Write limits

Claude Code refused **none** of a session's writes outside its starting folder under `--permission-mode auto --permission-prompts none`, with or without `--add-dir`. That included a sibling worktree, an outside checkout, and `git -C <outside checkout> commit`. Inside the starting folder or an `--add-dir` folder, writes are accepted by mode, with no classifier call. Outside them, the auto-mode classifier decides each one; it allowed every one tried. Three further findings:

- An `--add-dir` naming a folder that doesn't exist at launch is silently dropped.
- `/add-dir` isn't available in a headless session.
- No way was found to add a folder mid-session.

**What that changes.** Kiln starts every session in the workspace folder or passes it with `--add-dir`, so writes in every worktree, one added mid-phase included, are allowed by mode, never left to the classifier ([Sessions](#sessions)). Stayed in the workspace is the only guard against work outside the workspace, as the PRD allows.

### Transcripts

- **Main session:** `<Claude config folder>/projects/<starting folder, every non-alphanumeric character replaced by '->/<session ID>.jsonl`.
- **Subagents:** recorded apart, at `<same project folder>/<session ID>/subagents/agent-<agent ID>.jsonl`. Their records carry `isSidechain: true` and the parent's `sessionId`. The parent's file holds only the Agent call, not the subagent's edits or commands.
- **Resume:** `claude --resume`, from the starting folder or from any other folder, appends to the original file under the original project folder. Each new record carries the folder it ran in.
- **Records:** every `user` and `assistant` record carries `timestamp`, `cwd` and `sessionId`. `cwd` is the Bash shell's directory at that point, so a `cd` in one Bash call shows in the next call's record; Claude Code resets the shell to the starting folder after a `cd` outside the session's folders. A tool call is an assistant `tool_use` block with its `input` (`file_path`, `command`). Its outcome is a user `tool_result` block with `is_error`. For a Bash call, `is_error` is set whenever the command exits non-zero, including after earlier parts of it ran.

**What that changes.** Kiln finds a session's transcript by its session ID, `projects/*/<session ID>.jsonl` and `projects/*/<session ID>/subagents/*.jsonl`, not by rebuilding the folder name. The ID is Kiln's own and unique, and the folder-name encoding was only seen on macOS. The Claude config folder is `~/.claude`, or `CLAUDE_CONFIG_DIR` when that is set. The `CLAUDE_CONFIG_DIR` case is documented but wasn't tried.

## Architecture

No new process, store or dependency. The engine, session runner, local server and view are as in v1; the [state store](../../prds/kiln-v1/technical-design.md#state-store) keeps one `prd.json` per PRD, now at schema 2 ([Data Models](#data-models)). `git`, `gh` and `claude` are called per repository exactly as v1 calls them for its one, with the same detached spawning, timeouts and `--repo github.com/<owner>/<name>` on every `gh` call, the owner and name now taken from each repository's own `origin`.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where the list of repositories lives | `PrdRecord.repositories`, one entry per repository, ordered: the PRD's repository, then named repositories in first-mention plan order, then added repositories in the order added | Every per-repository fact needs a home that outlives a plan edit ("a repository Kiln has set up stays among them"); the order is the one every screen and line lists them in |
| How a repository is identified | Its folder name beside the PRD's repository (REPO-001); the PRD's repository by its main checkout's folder name | The name the phase documents use, the name the screens show, and the worktree's folder name in the workspace are then one string |
| Workspace folder | Default `<parent of the PRD's repository>/.worktrees/<PRD folder name>/`, each worktree `<workspace folder>/<repository name>`; fixed once any repository is set up | It is v1's default worktree's parent, so a v1 PRD on the default path needs nothing moved; outside every checkout, as AC-SPACE-01 asks |
| One-repository PRD | Keeps v1's `worktreePath` setting and screens; its workspace folder is the default and isn't shown | AC-SPACE-03. The folder is needed only if a repository is added, and then a worktree moved elsewhere can't define it |
| How a session asks for a repository | `kiln add-repository <name>`, a client of `POST /api/repositories` on the running Kiln (CLI-001) | v1 kept every control an engine command behind the HTTP API so a second client could be added with no engine code; setup stays in Kiln, which owns the branch-name check |
| How the command finds its PRD | From the current directory: the PRD record whose workspace folder or any of whose worktrees contains it, found among Kiln's state directories | Works for a session and a person alike, with no marker file in the workspace and no environment variable a person typing it wouldn't have |
| Where a multi-repository session starts | The workspace folder (AC-SPACE-02); a one-repository PRD's session, in its worktree as in v1 | AC-SPACE-02 and AC-SPACE-03; the resume command then changes to the same folder (AC-SPACE-04), so a person reopening it by hand works where the session did |
| Base of an added repository | `develop` on its origin, else origin's default branch, read with v1's `ls-remote --symref` (REPO-003) | The rule Documents found starts every repository with |
| What Stayed in the workspace reads | Claude Code's transcript files for the session's ID, the main session's and its subagents', never Kiln's own `events.jsonl` | The PRD's transcript includes turns of a `claude --resume` the person runs by hand, which only Claude Code's files hold |
| Git subcommands Kiln doesn't recognize | Fail Stayed in the workspace, as a change | A false stop costs one tick of the confirmation; a false pass is the harm the check exists to catch (OUT-002) |
| Pushed for a repository with no commits of its own | Passes without asking origin; "commits of its own" means the feature branch tip differs from that repository's `baseCommit` | AC-CHECK-01; a repository added for reading only never needs a push |
| Pull requests | One per repository whose feature branch tip differs from its `baseCommit`, opened by the one pull-request session | AC-PRS-01; one session keeps the cross-links and merge order in one reading of the technical design (AC-PRS-02) |
| Record schema | `schemaVersion: 2`, a schema 1 record migrated when read | v1's rule: a newer Kiln migrates an older record; an older Kiln refuses a newer one |

Each section below that changes a v1 section carries its `Replaces in part:` line. When the change is built, each of those v1 sections gets its `Superseded in part by:` line in the same commit as the code.

## The PRD's Repositories

### Named in the phase documents (AC-REPO-01)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The Plan Reader (a `**Repositories:**` line is read)

The plan reader reads a line starting `**Repositories:**` before a phase document's first `##` heading, the place it already reads `**Closed:**` from. The rest of the line is split at commas; each item, trimmed, is a repository name. A name must be a plain folder name: no `/` or `\`, not `.` or `..`, not empty. A line with no names, or a name that isn't a folder name, is a plan problem naming the file, a start-check failure before Start and a structural plan problem after it ([A plan that breaks after Start](../../prds/kiln-v1/technical-design.md#where-a-feature-stands-what-kiln-run-does)). Every phase document is read, split records included; a split record's names are not passed to its children. Each plan entry, in the record and the snapshot, gains `repositories: [name]`, empty when the document has no line.

The **named repositories** are the union of every phase document's names other than the PRD's repository's own name, in first-mention plan order.

### Found beside the PRD's repository (AC-REPO-02)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Command line (start checks for each named repository)

For each named repository, the start checks look at `<parent of the PRD's main checkout>/<name>` and fail, one line each, as the terminal mockup draws:

| Check | Fails when | Line |
|---|---|---|
| Found | The folder doesn't exist | `<phase file> names <name>, which isn't in <parent folder>/.` (the first phase file naming it) |
| A checkout | `git -C <folder> rev-parse --show-toplevel` fails or doesn't print the folder itself | `<name> in <parent folder>/ isn't a Git checkout.` |
| On GitHub | `git remote get-url origin` doesn't parse as v1's GitHub forms | `<name>: origin isn't on GitHub: <url>` |

A named repository's own checkout isn't checked for cleanliness: Kiln reads nothing in it except its `origin` URL and its branches, and starts the feature branch from origin's tip. The clean-checkout check stays on the PRD's repository and its line names it (`Working tree of product is clean`). When every named repository passes, the passed checks gain "Named repositories found beside <PRD's repository>".

A **multi-repository PRD** is one whose repositories number more than one, before Start from the plan and after Start from `PrdRecord.repositories`.

## The Workspace

### Settings before Start (AC-SPACE-01, AC-REPO-03)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (defaults and field checks, per repository)

| Field | Multi-repository | One repository |
|---|---|---|
| Workspace folder | Shown, editable; default as in [Design Decisions](#design-decisions) | Not shown; the default, fixed |
| Worktree | Not shown; each is `<workspace folder>/<name>` | v1's field, unchanged |
| Feature branch | One field, used in every repository (BRANCH-001) | v1's field |
| Base branch | A select per repository row, listing that repository's origin branches in v1's order | v1's field |

The checks, run when a view connects, as fields change and at Start, are v1's applied per repository, worded as the Documents found mockup's field-message comments give:

- **Workspace folder:** absolute after `~` expansion; new or empty; not inside any checkout of any of the PRD's repositories (each main checkout and each of its worktrees from `git worktree list --porcelain`). Each worktree path inside it gets v1's worktree-path check too, so a leftover folder there fails before setup does.
- **Feature branch:** a valid name, free locally and on origin in every repository, apart from each repository's own Kiln branch (v1's `createdBranch`, now per repository). The message names every repository where it exists.
- **Base, per repository:** on that repository's origin. Only the PRD's repository's row also gets v1's PRD-differs check, since only its documents are read.

The base check's `ls-remote --symref` and, when a tip isn't local, the objects-only fetch run once per repository, in parallel. Each repository's row shows its own "Couldn't reach origin" message.

### Setup at Start

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (setup and a failed Start, per repository); `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands (setup is done when every repository's is)

Start runs v1's setup sequence once per repository in list order, the PRD's repository first: the base check, then `baseCommit` recorded on that repository's entry, then `git worktree add --no-track -b <branch> <path> <baseCommit>`, then `setupCompletedAt` on the entry. v1's finish-the-setup rules (a worktree already on the branch is done; Kiln's own branch with no worktree gets `worktree add <path> <branch>`; the 30-minute timeout; Ctrl+C leaves the record for `kiln run` to finish) apply per repository unchanged. Setup is done when every entry has `setupCompletedAt`; only then is the PRD's `setupCompletedAt` written and the first phase started.

A failure stops at the failing repository. `startError` reads "Couldn't set up <name>'s worktree: <git's message>", under Start and in the terminal. Then:

- **No repository was set up yet:** as v1, the feature goes back to not started and every field is editable.
- **Some repository was set up:** `startedAt` is cleared, so `kiln run` shows Documents found; the workspace folder and feature branch are fixed, and so is each set-up repository's base. Fixed is derived, never stored: a field is fixed once any `repositories` entry has a `baseCommit` or `createdBranch` (the snapshot's `settings.fixed`). The bases of repositories not yet set up stay editable. The next Start runs the sequence again, which finds the set-up repositories done and makes only what is missing.

The terminal's Started line names the repositories: `Started · feature/customer-returns in 3 repositories` (one-repository: as v1).

### The workspace kept (AC-SPACE-05)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup ("The worktree stays after completion")

Kiln removes nothing at Complete. The Complete screen's settings panel and Kiln panel say so in the mockup's words.

## Adding a Repository

### The command (AC-ADD-01, CLI-001)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Command line ("`kiln run` is the only command")

```
kiln add-repository <name>
```

1. Resolve the current directory's real path. Read every `prd.json` under Kiln's state root; the PRD is the one with a recorded worktree path containing it, else the one whose workspace folder contains it. None: `kiln: <directory> isn't in a Kiln workspace.`, exit 1. More than one at the same level (two PRDs whose default workspace folders coincide): `kiln: <directory> is in the workspace of more than one PRD (<feature names>); run it from inside a repository's worktree.`, exit 1.
2. Read that PRD's `instance.lock`. No live holder: `kiln: kiln run isn't running for <feature name>, so nothing was added.`, exit 1.
3. `POST /api/repositories` on the lock's port with `{ name }`, the PRD's token, and `Host` and `Origin` set to `127.0.0.1:<port>` as v1's checks require. Wait for the answer with no response timeout at all, since setup can take Kiln's 30-minute setup timeout; Node's `fetch` gives up waiting for response headers after 5 minutes by default, so the client turns that off or uses `node:http`. Kiln carries a setup through to its end even when the requester disconnects.
4. On success print `Added <name> at <worktree path>, on <branch> from <base>. Read its CLAUDE.md and AGENTS.md, if it has them, before you change it.` (or `<name> is already in the workspace at <worktree path>.`), exit 0. On a refusal print Kiln's reason, exit 1. Usage errors exit 2.

A session whose Bash call times out while the command waits can run it again: a second request for a repository already being set up waits for the same setup ([below](#in-the-engine)).

So that sessions reach the same Kiln, on macOS and Linux Kiln puts the directory of `process.argv[1]` first on each session's `PATH`: npm links `kiln` to `dist/cli.js`, and Node keeps the link's path there, so that directory holds the `kiln` the person ran. On Windows npm's `kiln.cmd` shim starts Node with `dist/cli.js` itself, so the shim's directory isn't known; Kiln leaves `PATH` as it is, and the session finds `kiln` where the person's own shell does, which a global install provides. The command a session runs is still the one a person would type (AC-RUN-06).

### In the engine (AC-ADD-01, AC-ADD-02, AC-ADD-03)

`addRepository(name, phaseId)` is an engine command like v1's others. It is allowed while a phase or the pull-request session is in progress or stopped at Needs you; otherwise it is refused with 409 and the reason ("Kiln adds a repository only while a phase is running or stopped at Needs you."). Requests are serialized: a request for a repository already in `PrdRecord.repositories` and set up answers with its path and changes nothing; one for a repository whose setup is under way waits for it.

The checks, in order, each failure answered with its own words and nothing changed:

1. AC-REPO-02's three checks, worded as the start checks.
2. The feature branch name is free locally and on that repository's origin, apart from its own Kiln branch (v1's UI-003 message, naming the repository).
3. The worktree path `<workspace folder>/<name>`: new or empty, and not inside a checkout.
4. The base: `develop`, else origin's default branch, from one `ls-remote --symref`. No base: `<name>'s origin has no develop and no default branch.`

Then the entry is written (`kind: added`, `addedInPhase`, `addedAt`, `baseBranch`, `baseCommit`) before `git worktree add`, exactly as setup at Start records before adding, so a failed or interrupted add is finished by the next request through v1's finish-the-setup rules. An entry counts among the PRD's repositories only once it has `setupCompletedAt`: until then the prompts, screens, done check and pull requests leave it out, and only the next request for it, or AC-ADD-04, picks it up. A done check, pull-request check or session launch that comes while an addition is under way waits for it to end first. A git failure answers with git's message and keeps what was made (AC-ADD-02). On success Kiln writes `setupCompletedAt`, records the phase's start commit for the repository as its `baseCommit`, prints `<time> <phase id> <title> added <name>` (the judged leaf, as v1's event lines), and pushes a snapshot. During the pull-request session the label reads "added in the pull request", by AC-PR-05's rule for that session's copy.

An added repository's base is fixed from the start.

### Named after Start (AC-ADD-04)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands (engine loop: names are added before a phase starts)

In the engine loop, after the plan is re-read and the next leaf chosen, Kiln collects the names on that leaf and every split record above it that `PrdRecord.repositories` doesn't hold, and adds each as above with `addedInPhase` the leaf's id, before spawning its session. A failure records a `plan` stop on that leaf whose one check, Phase plan reads, carries the failed check's words prefixed with the repository (`storefront: That branch already exists in storefront…`). Check again and `kiln run` re-run the plan read, which re-tries the addition.

## Sessions

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Starting a phase's session, §The prompts (the workspace in place of the one worktree)

**Working directory.** A multi-repository PRD's sessions, launched and resumed, run in the workspace folder; a one-repository PRD's in its worktree, as v1. A one-repository PRD whose first repository was added mid-phase becomes multi-repository from its next session; the session that added it keeps the folder it started in, in every run, so the paths in its first message stay true.

**Flags.** v1's, plus `--add-dir` for the workspace folder when the working directory isn't it, and for every worktree of the workspace outside both, so that writes anywhere in the workspace are accepted by mode ([Write limits](#write-limits)). Because a missing folder is silently dropped, Kiln creates the workspace folder before launch when it doesn't exist; it is outside every checkout. A resumed run gets the flags for the workspace as it then stands, so a repository added in an earlier run is covered.

**The phase prompt** keeps v1's text for a one-repository PRD and adds one paragraph:

> If you need a repository that isn't in this worktree's workspace, run `kiln add-repository <folder name>`; Kiln adds a worktree of it on `<branch>` and prints where. Work there, never in a repository's own checkout such as `<parent folder>/<folder name>`.

For a multi-repository PRD the worktree paragraph becomes:

> Work only in this Kiln workspace, `<workspace folder>`: one worktree of each repository below, every one on branch `<branch>`. Kiln created them for this PRD; they are not shared checkouts and not parallel-session worktrees. Don't work in any repository's own checkout, such as `<parent folder>/<a repository>`, and don't switch branches, create another branch or worktree, or land work on any other branch, whatever other instructions say.
>
> - `<name>`: `<worktree path>`, base `<base>` (the PRD's repository, `<name>` only)
> - …
>
> If you need a repository that isn't listed, run `kiln add-repository <folder name>` from this workspace; Kiln adds its worktree here on `<branch>` and prints where. Carry on with the phase there.
>
> Before you change a repository, read its own `CLAUDE.md` and `AGENTS.md`, if it has them, and follow them in that repository.

and the authorization and finished lines name every repository: "commit to `<branch>` and push it to origin (`git push -u origin <branch>`) in each repository you change", and "everything is committed and pushed to `origin/<branch>` in every repository". `<phase doc>` and `<PRD file>` are paths from the workspace folder (`product/docs/prds/customer-returns/phase-2b-store-credit.md`). The CLAUDE.md sentence is there because of [Per-repository instructions](#per-repository-instructions). A one-repository PRD's added paragraph carries it too, for the added repository.

**Fresh-session prompt and resume command (AC-SPACE-04).** The fresh-session prompt is the phase prompt plus v1's sentence, so it names the workspace and the repositories. The resume command and the fresh-session command change to the folder the session started in, read from the session record (`workingDirectory`, new), not recomputed, and quote it as v1's [Paths shown](../../prds/kiln-v1/technical-design.md#snapshot) gives.

## The Done Check

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The Done Check (Committed and Pushed per repository; a fourth check)

Four checks. The first is v1's Closed check, run in the PRD's repository's worktree. Facts become a list, each naming its repository when the PRD has more than one (AC-CHECK-02).

| Check | Predicate | Facts |
|---|---|---|
| Phase doc closed | v1's | v1's |
| Everything committed | `git status --porcelain --untracked-files=all` prints nothing in every worktree | Failing: one per dirty repository, `storefront: 3 files changed, not committed`. Passing: `Clean in product, returns-api and storefront` |
| Pushed | In every repository, v1's predicate. A repository whose worktree is on the feature branch and whose branch tip equals its `baseCommit` passes with no origin read; a worktree on another branch fails with v1's `The worktree is on <other>, not <branch>` either way | Failing: v1's facts prefixed `<name>: `. Passing: one line per repository, `returns-api: 7f3d9a0 on origin`; a repository with no commits of its own, `notifications: no commits yet` |
| Stayed in the workspace | No change outside the workspace that no confirmation covers ([below](#stayed-in-the-workspace-ac-outside-01-to-04)) | Failing: one per change, then "Kiln changed nothing in that checkout, since it may hold other work too." Passing: shown only as a passed row when it has failed earlier in this stop; otherwise left out of Needs you (AC-OUTSIDE-01) |

The git reads for the repositories run in parallel; v1's 2-minute origin retry applies per repository. A pass records per repository the pushed commit and the phase's commit count (v1's `--first-parent` count, from that repository's start commit for the phase). The pull-request check gets the fourth check too (AC-PRS-01).

### Stayed in the workspace (AC-OUTSIDE-01 to 04)

**What is read.** For each session Kiln recorded for the phase (or the pull-request session), the transcript files [Transcripts](#transcripts) locates: the main session's and every subagent's. A session with no transcript file passes. Kiln reads `assistant` records' `tool_use` blocks and the matching `tool_result` blocks, each record with its `timestamp` and `cwd`. The changes come from:

- **File tools** (`Edit`, `MultiEdit`, `Write`, `NotebookEdit`): the `file_path` in the tool call's input, absolute.
- **Bash calls:** the command, split by v1's Bash reader into simple commands. A simple command is a Git command when its first word, after v1's skipped assignments and keywords, is `git`. Its directory is the entry's working directory, moved by any `cd <path>` earlier in the same call (a leading `~` or `$HOME` is expanded; a `cd` whose argument is otherwise not a literal path is followed no further, and Git commands after it are placed in no checkout and pass), then by `-C <path>` options in order; `--git-dir` and `--work-tree` place it at that path. Commands inside script files or `bash -c '…'` strings aren't read, as in v1.

A file tool call whose `tool_result` has `is_error` doesn't count, since a refused or failed edit wrote nothing. Every Bash call counts whatever its result, since `is_error` only says the command exited non-zero, and `git commit -m … && npm test` with a failing test committed all the same. A call with no result yet, because the session was cut off mid-call, counts, since it may have changed something.

**Where it happened.** Paths are compared by the real path of their nearest existing folder, as v1's worktree-path check compares them, so a symlinked or `/private`-prefixed path matches the worktree it is in. A path is in a checkout when it or an ancestor holds a `.git` entry (folder or file): the nearest such ancestor is the checkout. Kiln looks only for that entry, never at the checkout's status. A path inside one of the workspace's worktrees is inside the workspace; one in no checkout passes; any other checkout is outside the workspace, another PRD's worktree included.

**What counts** (OUT-002):

| Seen outside the workspace | Change? | Fact |
|---|---|---|
| A file tool on a path under `<checkout>/.agent-sessions/` | No | |
| Any other file tool | Yes | `Edited <path from the checkout> in <checkout>` (`Wrote` for `Write`) |
| `git commit` | Yes | `Committed <sha> to <branch> in <checkout>`, from the `[<branch> <sha>]` line of the call's result; `Ran git commit in <checkout>` when that line isn't there |
| `git push` | Yes | `Pushed from <checkout>` |
| `add`, `rm`, `mv`, `restore`, `checkout`, `switch`, `stash` (other than `list` and `show`), `reset`, `merge`, `rebase`, `pull`, `cherry-pick`, `revert`, `am`, `apply`, `clean`, `commit-tree`… any subcommand not in the read-only list | Yes | `Ran git <subcommand> in <checkout>` |
| `branch` with a name to create, or `-m`, `-M`, `-c`, `-C`, `-d`, `-D`, `-f`; `worktree add`, `move`, `remove` | Yes | `Ran git branch in <checkout>` |
| Read-only: `status`, `log`, `diff`, `show`, `fetch`, `blame`, `grep`, `ls-files`, `ls-remote`, `ls-tree`, `rev-parse`, `rev-list`, `merge-base`, `describe`, `cat-file`, `for-each-ref`, `show-ref`, `shortlog`, `reflog` (no subcommand or `show`), `branch` (listing forms only), `stash list`/`show`, `worktree list`, `remote` (no subcommand, `-v`, `show`, `get-url`), `config` (`--get`, `--list`, `-l`), `check-ref-format`, `help`, `version` | No | |
| Any other shell command | No | |

Paths in facts are shown as v1's [Paths shown](../../prds/kiln-v1/technical-design.md#snapshot) gives. Repeated changes of one kind in one checkout show once (`Edited src/tokens/colors.ts in …` once however many edits).

**The confirmation (AC-OUTSIDE-03, OUT-001).** Ticking the box on Needs you records `{ at }` in `PhaseFacts.outsideConfirmations`; unticking before the next check removes it. A change is covered when its transcript timestamp is at or before the latest confirmation's `at`. The box is offered, unticked, whenever the check fails with an uncovered change, and only then. Confirmations are kept in the record, so they outlast a restart.

**After an interruption (AC-OUTSIDE-04).**

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Interruptions, sleep and resume (no resume after work outside the workspace)

Wherever v1 resumes an interrupted session after its check fails (Ctrl+C, a closed terminal, sleep, Kiln killed), Kiln first looks at Stayed in the workspace. When it has failed, Kiln records a `done_check` stop (`pull_request_check` for the pull-request session) with `interrupted: { at, atIsLastOutput }` and resumes nothing. Needs you then shows the interrupted time and last lines as v1's AC-KEEP-05 screen does, with the resume command and AC-OUTSIDE-02's prompt. What usage-limit recovery must do at its own resume points is in [Seam With Usage-Limit Recovery](#seam-with-usage-limit-recovery).

**The prompt (AC-OUTSIDE-02).** A template, `outside-workspace.txt`, as the Needs you mockup draws it: the phase, the facts as a list, the request to bring only its own edits into the workspace on the feature branch and nothing else from the checkout, "<name> isn't in the workspace yet, so ask Kiln to add it first." for each checkout whose repository isn't among the PRD's (matched by the checkout's folder name), and the request to leave each checkout as it is and say what still needs putting back. The fresh-session prompt appends the same facts.

## The Pull Requests

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The pull-request check, §The prompts (pull-request session), §Where a Feature Stands (engine loop's check before the session)

**Which repositories.** Every repository whose feature branch tip, read locally, differs from its `baseCommit`. The PRD's repository always qualifies once a phase has closed (PR-001).

**The check (AC-PRS-01).** v1's `gh pr list` query, run per qualifying repository with its own `--repo`, head and base, plus Stayed in the workspace for the pull-request session. It passes when every qualifying repository has an open, ready, same-repository pull request and the session stayed in the workspace. Facts per repository: `product: #12 open`, `storefront: No open pull request from feature/customer-returns into develop`, `returns-api: #57 is a draft`. On a pass Kiln records each pull request's facts (v1's fields plus `repository`) with `completedAt`. The engine loop's check before the session uses the same per-repository query and starts no session when every one is already open.

**The prompt (AC-PRS-02).** One template for one and several repositories:

> Every phase of the `<feature name>` PRD (`<PRD file>`) is implemented and pushed to `<branch>`. Open one pull request in each of these repositories, from `<branch>` into the base given, titled and described from the PRD. Pass `--repo github.com/<owner>/<name>` to every `gh` command for that repository:
>
> - `<name>` (`<owner>/<name>`), worktree `<worktree path>`, into `<base>`
> - …
>
> Each description names the PRD and links every other pull request opened for it, so once all are open, edit each to add the links. Where one must merge before another, for example an endpoint before the page that calls it, say so in each, as the technical design gives the order.
>
> Open them ready for review, not as drafts, even if your own instructions say to open drafts. Where one is already open, don't open another; if it is a draft, mark it ready (`gh pr ready <number> --repo …`). You may not merge, deploy anything, or touch any other branch. You're finished when every one is open and ready for review.

For a one-repository PRD the list has one entry and the cross-link paragraph is left out, which is v1's prompt in substance.

## Interfaces

### Command line

- `kiln run <path>`: unchanged, plus the start checks above.
- `kiln add-repository <name>`: [above](#the-command-ac-add-01-cli-001). The usage text lists both commands.
- Terminal lines, as the terminal mockup draws them, the rest as v1:
  - summary: `<feature> · PRD, technical design, assumptions, <n> phase docs, <m> repositories · all checks passed` (the repository count only when more than one);
  - `Started · <branch> in <m> repositories`;
  - `<time> <id> <title> added <name>`;
  - `<time> <id> <title> done · pushed <name> <sha> · <name> <sha>`, the repositories the phase pushed to (tip moved since the phase's start commit), code repositories in list order, then the PRD's repository, as drawn; one-repository: v1's `done · pushed <sha>`;
  - `<time> PR <title> opened <name> #<n> · <name> #<n>`, in list order.

### HTTP API

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API

| Method and path | Change |
|---|---|
| `POST /api/settings` | Gains `workspaceFolder?` and `bases?: { <name>: <branch> }`; `baseBranch` still sets the PRD's repository's base. Each is refused once that field is fixed |
| `POST /api/repositories` | New: `{ name }` → `200 { name, worktreePath, branch, baseBranch, added: boolean }`; `409 { reason }` when not allowed in this state; `422 { reason }` for a failed check or setup step |
| `POST /api/outside-confirmation` / `DELETE /api/outside-confirmation` | New: tick or untick the confirmation on the current stop; 409 when Stayed in the workspace hasn't failed |

Every new route carries v1's Host, Origin and token checks.

### Snapshot

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot

```
Snapshot (changed and added fields only):
  feature: { …, multiRepository }
  repositories: [ { name, kind: prd | named | added, addedInPhase?, baseBranch, baseBranches?, baseCheck?,
                    worktreePath, fixed, fieldErrors } ]
                                 (baseBranches, baseCheck: not started only; fieldErrors: that row's base messages)
  documents.plan.phases[]: { …, repositories: [ name ] }
  documents.checks: adds "Named repositories found beside <PRD's repository>" for a multi-repository PRD
  settings: { …, workspaceFolder, fixed: { workspaceFolder, featureBranch, worktreePath } }
  PhaseView: { …, pushedRepositoryCount?,
               details?: { …, repositories: [ { name, addedInPhase?, worktree, branch, commitCount, latestCommit } ] } }
  needsYou: { …, checks: [ { name, passed, facts: [ string ] } ],
              outside?: { changes: [ string ], confirmation: { offered, ticked } },
              interrupted?: { at, atIsLastOutput } }
  pullRequests?: [ { repository, number, title, url, head, base, commits, additions, deletions } ]   (replaces pullRequest)
```

`fact` becomes `facts` for every check; a one-repository PRD's facts are v1's, one each.

## Data Models

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk

```
PrdRecord (schema 2; fields not shown are v1's):
  repository: { mainCheckoutPath, name, github }      (the PRD's repository; still keys the state directory)
  repositories: [ {
      name, kind: prd | named | added, mainCheckoutPath, github, baseBranch, worktreePath,
      addedInPhase?, addedAt?, baseCommit?, createdBranch?: { name, commit, baseBranch }, setupCompletedAt? } ]
  settings: { workspaceFolder, worktreePath, featureBranch, model, effort, keepAwake, bases: { <name>: <branch> } }
                                                       (bases: chosen before Start, kept by name so a kiln run that re-reads
                                                        the plan keeps them; copied to repositories[] at Start)
  phases.<id>: { …, repositories: { <name>: { startCommit, pushedSha?, commitCount? } },
                 outsideConfirmations: [ { at } ],
                 stop?: { …, checks: [ { name, passed, facts[] } ], interrupted?: { at, atIsLastOutput } } }
  plan[]: { …, repositories: [ name ] }
  pullRequests?: [ { repository, …v1's PullRequestFacts } ]

SessionRecord (schema 2): adds workingDirectory, the folder the session was launched in.
```

`baseCommit`, `createdBranch` and the phase's `startCommit`, `pushedSha` and `commitCount` move from the PRD and phase to each repository. **Migration from schema 1**, on read, with no Git call: one `repositories` entry of `kind: prd` from `repository`, `settings.baseBranch`, `settings.worktreePath`, `baseCommit`, `createdBranch` and `setupCompletedAt`; each phase's three facts under that repository's name; `pullRequest` as a one-entry `pullRequests`; each check's `fact` as a one-item `facts`; `workspaceFolder` the default; each session's `workingDirectory` the worktree path. The record is written as schema 2 at its next write.

## Screens (AC-SHOW-01)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot ("Needs you on screen", Disconnected rules, Settings and each phase's model)

The four drawn screens are built from their mockups' HTML, which is their specification, field messages included. The rest follow AC-SHOW-01's table:

- **Running, Paused, Disconnected, Phase detail:** phase rows and Details as Complete draws them ("pushed to 2 repositories"; Commits by repository); the settings show the workspace folder and repository list as Documents found draws them, without help text, every field fixed, plus "<n> repositories, one added in phase 2b" as Complete's settings panel reads.
- **v1's two Needs you screens:** facts by repository, as the outside-workspace mockup lists them.
- **A one-repository PRD's Documents found:** the added-repositories sentence under the worktree fields, in the Documents found mockup's words for one repository; every other part as v1.
- **Needs you after an interruption with work outside the workspace:** the outside-workspace mockup with v1's interrupted line and last lines in place of the final message.

The view renders all of it from the snapshot; no new view logic decides anything.

## Seam With Usage-Limit Recovery

That PRD has no design yet. This design asks of it, so its design honors AC-OUTSIDE-04 and AC-PRS-01's `Replaces in part:` lines on it:

- Before a usage-limit wait starts, and before Resume, Resume now or a resume by itself, Kiln runs Stayed in the workspace. A failure means Needs you with no wait; Resume honors the confirmation as Check again does.
- Resume is offered on an interrupted session's Needs you that this design produces (`interrupted` set), and to a pull-request session whose check failed for any reason.
- While the confirmation is unticked, a resumed session's first message is AC-OUTSIDE-02's prompt, after the person's note and before the instruction to carry on.

## Integration Points

- **Claude Code:** sessions as in v1 with `--add-dir` and a working directory per the workspace; transcript files read by [Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04).
- **Git**, per repository: v1's reads; `worktree add` at Start and when adding a repository, still the only Git change Kiln makes (AC-GIT-01); `remote get-url origin` and `rev-parse --show-toplevel` in each named repository's own checkout, both reads.
- **GitHub:** `gh pr list` per repository.
- **The Enso Method:** reads the `**Repositories:**` line, which `phase-split` doesn't write yet (PRD, Out of Scope).

## Testing Approach

As v1's, against real temporary Git repositories with local bare repositories as `origin`, and the stand-in `claude`:

- **Plan reader:** `**Repositories:**` lines, bad names, split records' names not inherited, the union and its order.
- **Start checks and setup:** a named repository missing, not a checkout, not on GitHub; a branch taken in one repository; a Start failing at the second repository, then a Start that finishes it; a partly set-up PRD's fixed fields; `kiln run` after Ctrl+C mid-setup.
- **Adding a repository:** each refusal, a git failure then a retry, two concurrent requests, a repository named only after Start (AC-ADD-04's `plan` stop and its retry), the command's PRD lookup from a worktree, from the workspace folder and from a folder two PRDs share, the command with no Kiln running, a setup longer than 5 minutes, and a session ending while its addition is under way.
- **Done and pull-request checks:** facts by repository, a repository with no commits of its own, a PR missing in one of three.
- **Stayed in the workspace:** unit tests over recorded transcripts from the [behaviors tried above](#claude-code-behaviors-this-design-relies-on): an edit in an outside checkout, an `.agent-sessions/` write, `git -C`, `cd … &&` and a `cd` in an earlier call (placed by the record's `cwd`), a Bash call that committed outside and then exited non-zero, each row of the table, a subagent's edit, a turn added by a manual `claude --resume`, confirmation coverage by timestamp, and a session with no transcript.
- **Migration:** a schema 1 record from each v1 state (not started, underway, Needs you, complete) reads as schema 2 and renders as before.
- **The view:** the four mockups rendered from fixture snapshots and compared, as in v1.
- **AC-PROOF-01:** a real PRD in a repository holding no code, changing two code repositories, one session adding a third; a one-repository PRD adding one; a session editing an own checkout, stopped and cleared. The multi-repository run repeated on Windows, which also checks the transcript location's folder encoding there.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-REPO-01 to 03 | The PRD's Repositories; Settings before Start; Snapshot; Command line |
| AC-SPACE-01 to 05 | The Workspace; Sessions; Data Models |
| AC-ADD-01 to 04 | Adding a Repository; HTTP API; Command line |
| AC-OUTSIDE-01 to 04 | Claude Code Behaviors; The Done Check; Seam With Usage-Limit Recovery |
| AC-CHECK-01, 02 | The Done Check |
| AC-PRS-01 to 04 | The Pull Requests; Command line; Screens; Settings before Start |
| AC-SHOW-01 | Screens |
| AC-PROOF-01 | Testing Approach |

## Open Questions

- **Per-repository settings and hooks don't apply in a multi-repository session** ([Per-repository instructions](#per-repository-instructions)). This is a "Depends On" behavior that didn't hold, so it is a product decision. The draft proceeds on this recommendation: accept it and tell the person. Documents found would add one line, "Sessions follow each repository's CLAUDE.md, but not its .claude/settings.json or hooks." That line isn't drawn and isn't in AC-REPO-03, so the PRD needs a ruling either way. The alternative is for Kiln to write a merged `.claude/settings.json` into the workspace folder, which needs a merge rule for conflicting permissions and hooks.
- **Usage-limit recovery's design** must take the [seam](#seam-with-usage-limit-recovery) as given; check it once that design is drafted.
