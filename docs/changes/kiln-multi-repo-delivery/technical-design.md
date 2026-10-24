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

The PRD's "Depends On" names the first three; the fourth and fifth, subagent worktrees and shell tools, are further behaviors Stayed in the workspace relies on. Each was tried against Claude Code 2.1.307 on 2026-10-22, in throwaway repositories laid out as a workspace (`W/product`, `W/returns-api`, `W/storefront`) with an outside checkout `O` beside it.

### Per-repository instructions

- **Session started in the workspace folder** (multi-repository): a worktree's `CLAUDE.md` isn't loaded at startup. It is loaded on demand, after the session's first Read or Write of a file in that worktree, and recorded in the transcript as a `nested_memory` attachment. Because it arrives after that first tool call, a first write can miss the rule; the session saw the rule then and corrected its write.
- **Session started in one worktree** (one-repository): a sibling worktree's `CLAUDE.md`, such as an added repository's, is never loaded, even after files there are read and written. `--add-dir` alone doesn't change that. `--add-dir` together with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` loads it at startup, but only for a folder that exists at launch.
- **A worktree's `.claude/settings.json` (permission rules and hooks) isn't honored** by a session started in the workspace folder, or for an `--add-dir` folder. Only the starting folder's own settings and the person's user settings apply.

**What that changes.** The launch prompt tells the session to read a repository's `CLAUDE.md` and `AGENTS.md` before changing it ([Sessions](#sessions); which prompts carry it is settled in [Open Questions](#open-questions)), and so does the output of `kiln add-repository`. That covers the first-write gap and the added repository Claude Code never loads. A multi-repository session runs with no repository's own settings or hooks, the PRD's repository's included. Kiln can't fix that without writing settings into the workspace folder, and the PRD doesn't ask for that. It goes back as a product decision ([Open Questions](#open-questions)).

### Write limits

Claude Code refused **none** of a session's writes outside its starting folder under `--permission-mode auto --permission-prompts none`, with or without `--add-dir`. That included a sibling worktree, an outside checkout, and `git -C <outside checkout> commit`. Inside the starting folder or an `--add-dir` folder, writes are accepted by mode, with no classifier call. Outside them, the auto-mode classifier decides each one; it allowed every one tried. Three further findings:

- An `--add-dir` naming a folder that doesn't exist at launch is silently dropped.
- `/add-dir` isn't available in a headless session.
- No way was found to add a folder mid-session.

**What that changes.** Kiln starts every session in the workspace folder or passes it with `--add-dir`, so writes in every worktree, one added mid-phase included, are allowed by mode, never left to the classifier ([Sessions](#sessions)). Stayed in the workspace is the only guard against work outside the workspace, as the PRD allows.

### Transcripts

- **Main session:** `<Claude config folder>/projects/<starting folder, every non-alphanumeric character replaced by '-'>/<session ID>.jsonl`.
- **Subagents:** recorded apart, at `<same project folder>/<session ID>/subagents/agent-<agent ID>.jsonl`. Their records carry `isSidechain: true` and the parent's `sessionId`. The parent's file holds only the Agent call, not the subagent's edits or commands.
- **Resume:** `claude --resume`, from the starting folder or from any other folder, appends to the original file under the original project folder. Each new record carries the folder it ran in.
- **Records:** every `user` and `assistant` record carries `timestamp`, `cwd` and `sessionId`. `cwd` is the Bash shell's directory at that point, so a `cd` in one Bash call shows in the next call's record; Claude Code resets the shell to the starting folder after a `cd` outside the session's folders. A tool call is an assistant `tool_use` block with its `input` (`file_path`, `command`). Its outcome is a user `tool_result` block with `is_error`. For a Bash call, `is_error` is set whenever the command exits non-zero, including after earlier parts of it ran.

**What that changes.** Kiln finds a session's transcript by its session ID, `projects/*/<session ID>.jsonl` and `projects/*/<session ID>/subagents/*.jsonl`, not by rebuilding the folder name. The ID is Kiln's own and unique, and the folder-name encoding was only seen on macOS. The Claude config folder is `~/.claude`, or `CLAUDE_CONFIG_DIR` when that is set. The `CLAUDE_CONFIG_DIR` case is documented but wasn't tried.

### Subagent worktrees

An Agent call with `isolation: "worktree"` from the workspace folder, which isn't a checkout, is refused ("Cannot create agent worktree: not in a git repository and no WorktreeCreate hooks are configured"), and no subagent runs. Once the Bash shell has `cd`'d into a worktree, or in a one-repository session, Claude Code makes the worktree at `<repository's main checkout>/.claude/worktrees/agent-<id>` on branch `worktree-agent-<id>`, never in the workspace. The subagent's records carry that `cwd` and paths. A subagent worktree left unchanged is removed again, branch included, so it leaves no change to count.

**What that changes.** A subagent's edit or commit in such a worktree fails [Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04), rightly: that work is on another branch, which no pull request covers.

### Shell tools

On Windows Claude Code may offer a `PowerShell` tool next to Bash, on by default for claude.ai accounts. A settings `env` block overrides `CLAUDE_CODE_USE_POWERSHELL_TOOL` from the spawn environment, but `--disallowedTools PowerShell` removes the tool for the session and its subagents whatever the settings say, managed settings included (tried on 2.1.307, macOS with pwsh installed).

**What that changes.** Kiln launches every session with `--disallowedTools PowerShell` ([Sessions](#sessions)), so a session's only shell is the Bash tool, and Kiln's sessions on Windows need Git for Windows' Git Bash.

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
| Pull requests | One per repository whose feature branch tip differs from its `baseCommit`, opened by the one pull-request session | AC-PRS-05; one session keeps the cross-links and merge order in one reading of the technical design (AC-PRS-02) |
| Record schema | `schemaVersion: 2`, a schema 1 record migrated when read | v1's rule: a newer Kiln migrates an older record; an older Kiln refuses a newer one |

Each section below that changes a v1 section carries its `Replaces in part:` line. When the change is built, each of those v1 sections gets its `Superseded in part by:` line in the same commit as the code.

## The PRD's Repositories

### Named in the phase documents (AC-REPO-01)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The Plan Reader (a `**Repositories:**` line is read)

The plan reader reads a line starting `**Repositories:**` before a phase document's first `##` heading, the place it already reads `**Closed:**` from. The rest of the line is split at commas; each item, trimmed, is a repository name. A name must be a plain folder name: no `/` or `\`, not `.` or `..`, not empty. A line with no names, or a name that isn't a folder name, is a plan problem naming the file, a start-check failure before Start and a structural plan problem after it ([A plan that breaks after Start](../../prds/kiln-v1/technical-design.md#where-a-feature-stands-what-kiln-run-does)). Every phase document is read, split records included; a split record's names are not passed to its children. Each plan entry, in the record and the snapshot, gains `repositories: [name]`, empty when the document has no line.

The **named repositories** are the union of every phase document's names other than the PRD's repository's own name (compared exactly with its main checkout's real folder name), in first-mention plan order.

### Found beside the PRD's repository (AC-REPO-02)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Command line (start checks for each named repository)

For each named repository, the start checks look at `<parent of the PRD's main checkout>/<name>` and fail, one line each, as the terminal mockup draws:

| Check | Fails when | Line |
|---|---|---|
| Found | No entry in `readdir(<parent folder>)` is exactly `<name>` | `<phase file> names <name>, which isn't in <parent folder>/.` (the first phase file naming it); for `kiln add-repository`, `<name> isn't in <parent folder>/.` |
| Not a link | The `readdir` entry named `<name>` is a symbolic link (on Windows, also a junction) | `<name> in <parent folder>/ is a link to <target>; Kiln needs the checkout itself there.` |
| A checkout | `git -C <folder> rev-parse --show-toplevel` fails or doesn't print the folder itself | `<name> in <parent folder>/ isn't a Git checkout.` |
| On GitHub | `git remote get-url origin` doesn't parse as v1's GitHub forms | `<name> in <parent folder>/ has an origin that isn't on GitHub: <url>` |

Names are matched exactly, case included, on every platform. Found reads the parent folder's listing and doesn't ask the file system whether the path exists: on macOS and Windows that check ignores case, so `Storefront` would reach `storefront`, and Git would then print `storefront`, failing A checkout for the wrong reason. A name that differs only in case fails Found. So each folder answers to one spelling, and no two entries share a checkout or a worktree folder. Two plan names that differ only in case need no rule of their own: on a case-insensitive disk at most one passes Found, and on Linux they can be two real folders. `kiln add-repository` runs the same check, so `Storefront` against a recorded `storefront` is refused with Found's words, not answered as already added. Paths are still compared with v1's `comparable()`.

A named repository is the folder itself, never a link to one (REPO-001): following a link would reach a checkout elsewhere, whose folder name can differ from the plan's name, and could make two names share one checkout. The parent folder is the real parent of the PRD's main checkout, so when that checkout is reached through a link, its siblings are looked for beside the real checkout.

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

The bases are stored as [Data Models](#data-models) gives.

The checks, run when a view connects, as fields change and at Start, are v1's applied per repository, worded as the Documents found mockup's field-message comments give:

- **Workspace folder:** absolute after `~` expansion; new or empty; not inside any checkout of any of the PRD's repositories (each main checkout and each of its worktrees from `git worktree list --porcelain`). Each worktree path inside it gets v1's worktree-path check too, so a leftover folder there fails before setup does.
- **Feature branch:** a valid name, free locally and on origin in every repository, apart from each repository's own Kiln branch (v1's `createdBranch`, now per repository). The message names every repository where it exists.
- **Base, per repository:** on that repository's origin. Only the PRD's repository's row also gets v1's PRD-differs check, since only its documents are read.

After a Start that failed partway, a set-up repository's checks are as [Setup at Start](#setup-at-start) gives.

The base check's `ls-remote --symref` and, when a tip isn't local, the objects-only fetch run once per repository, in parallel. Each repository's row shows its own "Couldn't reach origin" message.

### Setup at Start

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Worktree and Branch Setup (setup and a failed Start, per repository); `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands (setup is done when every repository's is)

Start runs v1's sequence across all the repositories. It first runs every repository's field checks, each base check's objects-only fetch included; a failure there refuses Start, as in v1, and nothing is recorded. Next, one save writes `startedAt` and the whole `repositories` list, each entry with its `baseBranch` and the `baseCommit` its check found (its `createdBranch` commit when that branch is still Kiln's own, as in v1). Then `git worktree add --no-track -b <branch> <path> <baseCommit>` runs for each repository in list order, the PRD's repository first, and `setupCompletedAt` is written on each entry as it finishes. A failed `git worktree add` is the only way Start fails partway. v1's finish-the-setup rules (a worktree already on the branch is done; Kiln's own branch with no worktree gets `worktree add <path> <branch>`; the 30-minute timeout; Ctrl+C leaves the record for `kiln run` to finish) apply per repository, except that a worktree Git left `locked initializing` fails with the half-made message of [In the engine](#in-the-engine-ac-add-01-ac-add-02-ac-add-03), ending "then press Start again." in place of "then ask again.", never v1's "<branch> already exists and isn't the branch Kiln made". Ctrl+C at any point leaves every entry holding `baseCommit`, and `kiln run` finishes them from the recorded list, in order. Setup is done when every repository in the list has `setupCompletedAt`; only then is the PRD's `setupCompletedAt` written and the first phase started.

A failure stops at the failing repository. v1's undo applies to the failing entry; the entries after it were never tried, so they lose their `baseCommit`, and an entry left holding nothing is removed. `startError` reads "Couldn't set up <name>'s worktree: <git's message>", under Start and in the terminal. Then:

- **No repository was set up yet:** as v1, the feature goes back to not started and every field is editable. A `createdBranch` kept by v1's undo stays Kiln's own, as v1 defines, only while its repository's base is unchanged.
- **Some repository was set up:** `startedAt` is cleared, so `kiln run` shows Documents found; the workspace folder and feature branch are fixed, and so is each set-up repository's base. Fixed is derived, never stored (the snapshot's `settings.fixed` and each row's `fixed`): the workspace folder and feature branch are fixed once any `repositories` entry has `setupCompletedAt`, and an entry's own base once that entry has `setupCompletedAt` or, with the feature branch fixed, holds a `createdBranch`. The bases of other repositories not yet set up stay editable.

On the next Start the repositories are, in order, the entries with `setupCompletedAt` as recorded, then the names the plan gives as this `kiln run` read it from the checkout it was given. Start skips an entry with `setupCompletedAt`, as v1's `kiln run` skips a recorded setup, and a failure leaves the set-up entries as they are, handling the rest as above. An entry without `setupCompletedAt` that the plan no longer names is left out of the list, as an unfinished added entry is; it is kept while it holds a `createdBranch`, so naming the repository again, before Start or by AC-ADD-04, reuses Kiln's branch, and removed when it holds nothing. No entry holding `baseCommit` reaches a next Start: such an entry exists only while `startedAt` is recorded, and `kiln run` finishes it first. `git worktree add` usually removes its own half-made worktree when it fails; a folder it leaves (a failing post-checkout hook, or git killed outright) stays where it is, since Kiln removes nothing. Bases come from settings as [Data Models](#data-models) gives; a set-up repository's base is its entry's `baseBranch`, and once the feature branch is fixed, so is the base of an entry holding a `createdBranch`, since the fixed branch name can't be cut again from another base. For a set-up repository the field checks skip the workspace folder's new-or-empty check, its worktree path check, the branch-free check and the base's on-origin check: its worktree and branch are Kiln's by record. The PRD's repository, once set up, keeps v1's PRD-differs check, comparing the PRD tree read from the given checkout (`HEAD:<PRD directory>`) with `<feature branch>:<PRD directory>`, the commit its sessions start from, as v1 compares with `createdBranch.commit`; its message reads "<repository>'s worktree has different PRD documents from this checkout. Make the same change on <branch> in <worktree path>, or run kiln run from that worktree; sessions start from it." Repositories not yet set up get every v1 check. A repository the PRD's worktree names but Documents found didn't is left to AC-ADD-04.

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
3. `POST /api/repositories` on the lock's port with `{ name }`, the PRD's token, `Host` set to `127.0.0.1:<port>` and `Origin` set to `http://127.0.0.1:<port>`, as v1's checks require. Wait for the answer with no response timeout at all, since setup can take Kiln's 30-minute setup timeout; Node's `fetch` gives up waiting for response headers after 5 minutes by default, so the client turns that off or uses `node:http`. Kiln carries a setup through to its end even when the requester disconnects.
4. On success print `Added <name> at <worktree path>, on <branch> from <base>. Read its CLAUDE.md and AGENTS.md, if it has them, before you change it.` (or `<name> is already in the workspace at <worktree path>.`), exit 0. On a refusal print Kiln's reason, exit 1. Usage errors exit 2.

A session whose Bash call times out while the command waits can run it again: a second request for a repository already being set up waits for the same setup ([below](#in-the-engine-ac-add-01-ac-add-02-ac-add-03)).

So that sessions reach the same Kiln, on macOS and Linux Kiln puts the directory of `process.argv[1]` first on each session's `PATH`: npm links `kiln` to `dist/cli.js`, and Node keeps the link's path there, so that directory holds the `kiln` the person ran. On Windows npm's `kiln.cmd` shim starts Node with `dist/cli.js` itself, so the shim's directory isn't known; Kiln leaves `PATH` as it is, and the session finds `kiln` where the person's own shell does, which a global install provides. The command a session runs is still the one a person would type (AC-RUN-06).

### In the engine (AC-ADD-01, AC-ADD-02, AC-ADD-03)

`addRepository(name, phaseId)` is an engine command like v1's others. It is allowed only as AC-ADD-01 gives. During the pull-request session, at its Needs you and in every other state it is refused with 409 and the reason ("Kiln adds a repository only while a phase is running or stopped at Needs you."). The pull-request session changes no code, so a repository added then would have no commits of its own and get no pull request (AC-PRS-05). Requests are serialized: a request for a repository already in `PrdRecord.repositories` and set up answers with its path and changes nothing; one for a repository whose setup is under way waits for it.

The checks, in order, each failure answered with its own words and nothing changed:

1. The four checks of [Found beside the PRD's repository](#found-beside-the-prds-repository-ac-repo-02), worded as the start checks, Found in its `kiln add-repository` words.
2. The feature branch name is free locally and on that repository's origin, apart from its own Kiln branch (v1's UI-003 message, naming the repository).
3. The worktree path `<workspace folder>/<name>`: new or empty, and not inside a checkout.
4. The base: `develop`, else origin's default branch, from one `ls-remote --symref`, whose tip is the `baseCommit`. No base: `<name>'s origin has no develop and no default branch.` When that tip isn't in the repository's checkout, v1's objects-only fetch of the base branch brings it in, as the start checks do, so `git worktree add` can start from `baseCommit`; a failed fetch answers `Couldn't reach origin: <git's message>`.

Then the entry is written (`kind: added`, `addedInPhase`, `addedAt`, `baseBranch`, `baseCommit`) before `git worktree add --no-track -b <branch> <path> <baseCommit>`, exactly as setup at Start records before adding. An entry counts among the PRD's repositories only once it has `setupCompletedAt`: until then the prompts, screens, done check and pull requests leave it out, and only the next request for it, or AC-ADD-04, picks it up. A done check or session launch that comes while an addition is under way waits for it to end first. A git failure, a timeout included, answers with git's message and is undone by v1's undo for that entry only: `baseCommit` is cleared, a branch git made at it (`git worktree add -b` creates the branch before the folder) stays as the entry's `createdBranch`, and an entry holding nothing is removed, so the next request is a fresh add. An add stopped by Ctrl+C, a closed terminal or a signal to Kiln hasn't failed, and the entry keeps its `baseCommit` (AC-ADD-02).

A request for an entry without `setupCompletedAt` runs check 1, then reads `git worktree list --porcelain`:

- A worktree at the path marked `locked initializing` is never done, whatever its files hold, and Git refuses another add there even after the folder is deleted. The request changes nothing and answers `<name>'s worktree at <path> was left half made. Remove it with git -C <checkout> worktree remove -f -f <path>, then ask again.` Kiln removes nothing (AC-GIT-01). The removal leaves Kiln's branch with no worktree, and the next request finishes the add.
- A worktree at the path on the feature branch, not locked, is done (v1's first finish rule).
- An entry holding `baseCommit` (an interrupted add) skips checks 2 to 4 and is finished from its recorded `baseBranch` and `baseCommit` without asking origin: Kiln's own branch at `baseCommit` gets `git worktree add <path> <branch>`, no branch gets `git worktree add --no-track -b <branch> <path> <baseCommit>`, and any other branch answers `<branch> already exists in <name> and isn't the branch Kiln made.`
- An entry holding `createdBranch` (a failed add) runs checks 2 and 3, and check 2 passes Kiln's own branch as v1 defines it. That definition needs origin's branches, so when origin can't be reached, check 2 answers `Couldn't reach origin: <git's message>`. The branch takes the place of check 4: its base is the entry's `baseBranch`, fixed, and its commit is recorded as `baseCommit` before `git worktree add <path> <branch>`.

On success Kiln writes `setupCompletedAt`, deletes `createdBranch`, records the phase's start commit for the repository as its `baseCommit`, prints `<time> <phase id> <title> added <name>`, and pushes a snapshot. The request that finishes an add, including one from a later phase or AC-ADD-04, rewrites `addedInPhase` and `addedAt` to its own phase and time: that phase is the first whose session has the repository, its start commit is recorded under it, and the "added in phase <n>" label and the added line name it.

`phaseId` is the session's record key, the launched leaf. `addedInPhase` records the finishing request's, and the repository's start commit goes under `phases.<phaseId>.repositories.<name>`; like the rest of `PrdRecord.phases`, both stay keyed by the launched leaf. Before it prints the added line, Kiln re-reads the plan; a read that fails changes nothing and doesn't refuse the addition. The line names the session's judged leaf, its id and title from the latest read (v1 [§Snapshot](../../prds/kiln-v1/technical-design.md#snapshot), "Which phase a split session is shown as"). Every "added in phase <n>" label, and the settings summary, maps `addedInPhase` to its judged leaf through `PrdRecord.plan` the same way, so the label stays on the row that shows the session's Details. When the session splits after the addition, the label can differ from the line, as v1's "3 started" can be followed by "3a done".

An added repository's base is fixed as [Data Models](#data-models) gives.

### Named after Start (AC-ADD-04)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands (engine loop: names are added before a phase starts)

In the engine loop, after the plan is re-read and the next leaf chosen, Kiln collects the names on that leaf and every split record above it that `PrdRecord.repositories` doesn't hold as an entry with `setupCompletedAt`, and adds each as above with `addedInPhase` the leaf's id, before spawning its session; the leaf about to launch is its own judged leaf. A failure records a `plan` stop on that leaf whose one check, Phase plan reads, carries the failed check's words prefixed with the repository (`storefront: That branch already exists in storefront…`). Check again and `kiln run` re-run the plan read, which re-tries the addition.

## Sessions

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Codex Authority and Conversation Lifecycle (agent-specific execution and assigned workspace protection; Claude behavior retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Starting a phase's session, §The prompts (the workspace in place of the one worktree)

**Working directory.** A multi-repository PRD's sessions, launched and resumed, run in the workspace folder; a one-repository PRD's in its worktree, as v1. A one-repository PRD whose first repository was added mid-phase becomes multi-repository from its next session; the session that added it keeps the folder it started in, in every run, so the paths in its first message stay true.

**Flags.** v1's, plus `--add-dir` for the workspace folder when the working directory isn't it, and for every worktree of the workspace outside both, so that writes anywhere in the workspace are accepted by mode ([Write limits](#write-limits)), and `--disallowedTools PowerShell` on every launch, a resumed run's included, so that every shell command is one Stayed in the workspace reads ([Shell tools](#shell-tools)). Because a missing folder is silently dropped, Kiln creates the workspace folder before launch when it doesn't exist; it is outside every checkout. A resumed run gets the flags for the workspace as it then stands, so a repository added in an earlier run is covered.

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

and the authorization and finished lines name every repository: "commit to `<branch>` and push it to origin (`git push -u origin <branch>`) in each repository you change", and "everything is committed and pushed to `origin/<branch>` in every repository". `<phase doc>` and `<PRD file>` are paths from the workspace folder (`product/docs/prds/customer-returns/phase-2b-store-credit.md`), and the resume prompt's `<phase doc>` is a path from the folder the session started in, the workspace folder for these sessions. v1's resume and fresh-session sentences say "workspace" where they say "worktree": "check the workspace first" and "check the workspace's state before you start". The CLAUDE.md sentence is there because of [Per-repository instructions](#per-repository-instructions). A one-repository PRD's added paragraph carries it too, for the added repository. Which prompts carry it is settled in [Open Questions](#open-questions).

**Fresh-session prompt and resume command (AC-SPACE-04).** The fresh-session prompt is the phase prompt plus v1's sentence, so it names the workspace and the repositories. It takes the workspace form whenever the PRD is multi-repository when Needs you is shown, so a one-repository PRD's session that added a repository and then stopped gets the workspace paragraph and every worktree, with its paths from the folder that session started in, the PRD's worktree. The resume command and the fresh-session command change to the folder the session started in, read from the session record (`workingDirectory`, new), not recomputed; when the stop has no session, a `plan` stop's (AC-ADD-04's included), the fresh-session command changes to the folder the phase's next session would start in. Both quote the folder as v1's [Paths shown](../../prds/kiln-v1/technical-design.md#snapshot) gives. Like v1's, both are the bare command a person would type: they carry none of the launch flags, so no `--add-dir` and no `--disallowedTools PowerShell`, as v1's carry no `--model` or `--permission-mode`. A session reopened by hand runs in the person's own permission mode, where Claude Code asks before a write outside the folder it started in, and a `PowerShell` call in such a turn fails [Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04).

## The Done Check

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The Done Check (Committed and Pushed per repository; a fourth check)

Four checks. The first is v1's Closed check, run in the PRD's repository's worktree. Facts become a list, each naming its repository when the PRD has more than one (AC-CHECK-02).

| Check | Predicate | Facts |
|---|---|---|
| Phase doc closed | v1's | v1's |
| Everything committed | `git status --porcelain --untracked-files=all` prints nothing in every worktree | Failing: one per dirty repository, `storefront: 3 files changed, not committed`. Passing: `Clean in product, returns-api and storefront` |
| Pushed | In every repository, v1's predicate. A repository whose worktree is on the feature branch and whose branch tip equals its `baseCommit` passes with no origin read; a worktree on another branch fails with v1's `The worktree is on <other>, not <branch>` either way | Failing: v1's facts prefixed `<name>: `. Passing: one line per repository, `returns-api: 7f3d9a0 on origin`; a repository with no commits of its own, `notifications: no commits yet` |
| Stayed in the workspace | No change outside the workspace that no confirmation covers ([below](#stayed-in-the-workspace-ac-outside-01-to-04)) | Failing: one per uncovered change, then "Kiln changed nothing in that checkout, since it may hold other work too."; one per uncovered missing or unreadable transcript. Passing: shown only as a passed row when it has failed earlier in this stop, with the fact `The changes outside the workspace have been dealt with`; otherwise left out of Needs you (AC-OUTSIDE-01) |

The git reads for the repositories run in parallel; v1's 2-minute origin retry applies per repository. A pass records per repository the pushed commit and the phase's commit count (v1's `--first-parent` count, from that repository's start commit for the phase). The pull-request check gets the fourth check too (AC-PRS-06).

### Stayed in the workspace (AC-OUTSIDE-01 to 04)

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Workspace Evidence, Output and Progress → Authoritative evidence (Codex complete history and frontier-bound confirmations; Claude semantics retained).

**What is read.** For each session Kiln recorded for the phase (or the pull-request session), the transcript files [Transcripts](#transcripts) locates: the main session's and every subagent's. A run that never reported `init` (a spawn error, or a resume that ended before `init`) ran nothing, so a session none of whose runs reported it, its record holding no `initModel`, passes. A session that reported `init` but has no `projects/*/<session ID>.jsonl` under the Claude config folder fails, with the fact `No transcript found for session <ID> in <config folder>/projects, so Kiln can't tell what it did outside the workspace` (OUT-003): Claude Code writes none when `CLAUDE_CODE_SKIP_PROMPT_HISTORY` is set (tried on 2.1.307), and deletes old ones after `cleanupPeriodDays`. A line cut off by a killed process is skipped wherever it sits, since Claude Code leaves one and, on resume, starts its next record on a new line (tried on 2.1.307); a cut-off line is one that fails to parse only at its end (`Unexpected end of JSON input`, or an error positioned at the line's length). Any other line that isn't JSON, or a transcript file Kiln can't read, fails the check with `Kiln couldn't read <transcript path>: <reason>`; the file's other lines are read as usual. That fact is covered by a confirmation and shown on Needs you as a missing transcript's is, with the differences given below. Kiln reads `assistant` records' `tool_use` blocks and the matching `tool_result` blocks, each record with its `timestamp` and `cwd`. The changes come from:

- **File tools** (`Edit`, `MultiEdit`, `Write`, `NotebookEdit`): the path in the tool call's input, absolute: `file_path` for `Edit`, `MultiEdit` and `Write`, `notebook_path` for `NotebookEdit`.
- **Bash calls:** the command, split by v1's Bash reader into simple commands.
  - **Which are Git commands.** A simple command is a Git command when its first word is `git` or a path ending in `/git`. Before that word Kiln skips v1's assignments and keywords, plus `if`, `elif`, `while`, `until` and `!`, and any run of `command`, `env`, `exec`, `nohup`, `nice`, `sudo`, `time`, `timeout` and `xargs`, each with its options (words starting with `-`), assignments, and whole numbers or durations (`nice -n 5`, `timeout 60s`). These additions are this reader's only; v1's commit and push detection is unchanged.
  - **Its directory.** It starts at the entry's working directory. It is moved by any earlier `cd <path>` or `pushd <path>` in the same call, and `popd` returns to the directory before the matching `pushd`. A leading `~` or `$HOME` is expanded. A `cd`, `pushd` or `popd` whose argument is otherwise not a literal path, or that has none, is followed no further, and Git commands after it are placed in no checkout and pass. Then `-C <path>` options move it, in order.
  - **A path given to Git.** `GIT_WORK_TREE`, or failing that `GIT_DIR`, places it at that path, whether set as an assignment before `git` or after `env`, or by an earlier `export` in the call that no `unset` has cleared. `--work-tree` or `--git-dir`, in either form, overrides the variable. A relative path is resolved from the command's directory.
  - **Not read:** commands inside script files, `bash -c '…'` strings, `find -exec`, aliases or functions, as in v1; wrapper options whose value isn't a number (`sudo -u bob git`, `xargs -I {} git`, `env -u NAME git`, `env -C <dir> git`). A `cd` or `pushd` inside `( … )` or `$( … )` stays in effect after it.
- **On Windows,** records' `cwd` is in Windows form (`C:\…`): Claude Code converts the shell's `pwd -P` after each call. A path in a Bash command is placed the way Claude Code places it: `/cygdrive/<d>/…` and `/<d>/…` become `<D>:\…`, `//host/share` becomes `\\host\share`, and `C:/…` and quoted `C:\…` are taken as given. A leading `~` or `$HOME` is the user profile folder (`os.homedir()`). A relative path is resolved against the directory reached so far. Any other POSIX path (`/tmp`, `/usr`) is in no checkout. Inside double quotes a backslash escapes only `$`, `` ` ``, `"`, `\` and a newline, as in Bash, so `"C:\Users\me\x"` keeps its backslashes, and v1's Bash reader keeps them too. The result is compared as **Where it happened** below says, case-insensitively through v1's `comparable()`.
- **PowerShell calls:** Kiln doesn't read them. Any `PowerShell` tool call, whatever its result, is a change in no known checkout, with the fact `Ran PowerShell commands Kiln can't read`, shown once. Kiln's sessions don't have the tool, so such a call can only come from a turn added by a manual `claude --resume`.

A file tool call whose `tool_result` has `is_error` doesn't count, since a refused or failed edit wrote nothing. Every Bash call counts whatever its result, since `is_error` only says the command exited non-zero, and `git commit -m … && npm test` with a failing test committed all the same. A call with no result yet, because the session was cut off mid-call, counts, since it may have changed something.

**Where it happened.** Paths are compared by the real path of their nearest existing folder, as v1's worktree-path check compares them, so a symlinked or `/private`-prefixed path matches the worktree it is in. A path inside one of the workspace's worktrees is inside the workspace, whatever lies between: a submodule or any other checkout nested in a worktree is part of it. Otherwise a path is in a checkout when it or an ancestor holds a `.git` entry (folder or file), and the nearest such ancestor is the checkout. Kiln looks only for that entry, never at the checkout's status. A path in no checkout passes. Any other checkout is outside the workspace, including another PRD's worktree and a worktree Claude Code makes for a subagent ([Subagent worktrees](#subagent-worktrees)).

**What counts** (OUT-002). A Git command's subcommand is its first word after Git's own leading options, so `git --no-pager log` is `log`:

| Seen outside the workspace | Change? | Fact |
|---|---|---|
| A file tool on a path under `<checkout>/.agent-sessions/` | No | |
| Any other file tool | Yes | `Edited <path from the checkout> in <checkout>` (`Wrote` for `Write`) |
| `git commit` | Yes | `Committed <sha> to <branch> in <checkout>`, from the `[<branch> <sha>]` line of the call's result; `Ran git commit in <checkout>` when that line isn't there |
| `git push` | Yes | `Pushed from <checkout>` |
| `add`, `rm`, `mv`, `restore`, `checkout`, `switch`, `stash` (other than `list` and `show`), `reset`, `merge`, `rebase`, `pull`, `cherry-pick`, `revert`, `am`, `apply`, `clean`, `commit-tree`… any subcommand not in the read-only list | Yes | `Ran git <subcommand> in <checkout>` |
| `branch` or `tag` in any other form; `fetch` with a `<src>:<dst>` refspec; `worktree add`, `move`, `remove` | Yes | `Ran git <subcommand> in <checkout>` |
| Read-only: `git` with no subcommand (`--version`, `--help`); `status`, `log`, `whatchanged`, `diff`, `diff-tree`, `diff-index`, `diff-files`, `range-diff`, `show`, `show-branch`, `blame`, `grep`, `ls-files`, `ls-remote`, `ls-tree`, `rev-parse`, `rev-list`, `merge-base`, `describe`, `name-rev`, `cherry`, `cat-file`, `for-each-ref`, `show-ref`, `shortlog`, `count-objects`, `var`, `check-ignore`, `check-attr`, `check-ref-format`, `verify-commit`, `verify-tag`, `help`, `version`; `fetch` with no refspec carrying a destination (no argument after the repository contains `:`); `reflog` (no subcommand or `show`); `stash list`/`show`; `worktree list`; `notes` (no subcommand, `list`, `show`); `submodule` (no subcommand, `status`, `summary`); `remote` (no subcommand, `-v`, `show`, `get-url`); `config` with `get` or `list`, with `--get`, `--get-all`, `--get-regexp`, `--get-urlmatch`, `--list` or `-l`, or with no action option and exactly one key (`git config user.email`); `symbolic-ref` with one ref and no `-d`/`--delete` (`symbolic-ref --short HEAD`); `branch` with `--show-current`, `-l`/`--list`, `-a`, `-r`, `--contains`, `--no-contains`, `--merged`, `--no-merged` or `--points-at`, or with no positional argument; `tag` with `-l`/`--list`, `-n`, `--contains`, `--no-contains`, `--merged`, `--no-merged`, `--points-at` or `-v`, or with no positional argument. A `branch` or `tag` form isn't read-only if it carries `-d`, `-D`, `-m`, `-M`, `-c`, `-C`, `-f`, `-u`/`--set-upstream-to`, `--unset-upstream`, `--edit-description`, `-t`, `-a` (tag), `-s` or `-F`. | No | |
| A `PowerShell` tool call, wherever it ran | Yes | `Ran PowerShell commands Kiln can't read` |
| Any other shell command | No | |

Paths in facts are shown as v1's [Paths shown](../../prds/kiln-v1/technical-design.md#snapshot) gives. Repeated changes of one kind in one checkout show once (`Edited src/tokens/colors.ts in …` once however many edits).

**The confirmation (AC-OUTSIDE-03, OUT-001).** Ticking the box on Needs you records `{ at }` in the phase's `outsideConfirmations` (`phases.<id>`, or `phases.pr` for the pull-request session; [Data Models](#data-models)); unticking before the next check removes it. A change is covered when its transcript timestamp is at or before the latest confirmation's `at`. A missing or unreadable transcript's fact has no timestamp: it is covered by a confirmation whose `at` is after that session's last run ended, that is the run's `endedAt`, or, when Kiln stopped before recording it (Kiln killed, or a stop cut short), the phase's current stop's `at`, which is recorded only once no process of the session is left running and is the snapshot's `sessionEndedAt`. The box is offered, unticked, whenever the check fails with an uncovered change or an uncovered missing or unreadable transcript, and only then. Confirmations are kept in the record, so they outlast a restart.

**After an interruption (AC-OUTSIDE-04).**

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Interruptions, sleep and resume (no resume after work outside the workspace)

Wherever v1 resumes an interrupted session after its check fails (Ctrl+C, a closed terminal, sleep, Kiln killed), Kiln first looks at Stayed in the workspace. When it has failed, Kiln records a `done_check` stop (`pull_request_check` for the pull-request session) with `interrupted: { at, atIsLastOutput }` and resumes nothing. Needs you then shows the interrupted time and last lines as v1's AC-KEEP-05 screen does, with the resume command (unless the transcript is missing, [below](#stayed-in-the-workspace-ac-outside-01-to-04)) and AC-OUTSIDE-02's prompt. The stop then behaves as any `done_check` stop: Check again and `kiln run` run the check, honoring the confirmation, and while it fails they update the stop's checks, keep `interrupted`, and never resume the session. A recorded stop is read before the interrupted run, as in v1, so recording it is what prevents the resume. Only the person resumes the session, with the resume command, or with usage-limit recovery's Resume once that is built. What usage-limit recovery must do at its own resume points is in [Seam With Usage-Limit Recovery](#seam-with-usage-limit-recovery).

**The prompt (AC-OUTSIDE-02).** A template, `outside-workspace.txt`, as the Needs you mockup draws it: the phase, the change facts as a list, the request to bring only its own edits into the workspace on the feature branch and nothing else from the checkout, "<name> isn't in the workspace yet, so ask Kiln to add it first." for each checkout whose repository isn't among the PRD's (matched by the repository's folder name: the checkout's own, or for a linked worktree such as a subagent's, its main checkout's, read from the `gitdir:` line of its `.git` file; the steps' headings name checkouts the same way), and the request to leave each checkout as it is and say what still needs putting back. For the pull-request session the opening reads "While opening the pull requests" in place of the phase, and the bring-in request and its add-first lines are left out: that session opens pull requests and changes no code ([In the engine](#in-the-engine-ac-add-01-ac-add-02-ac-add-03)), so it is only asked to leave each checkout as it is and say what still needs putting back. The fresh-session prompt appends the same change facts.

**A missing or unreadable transcript on Needs you (OUT-003).** `claude --resume` needs the transcript Kiln couldn't find, so when the phase's latest session has none, the snapshot leaves out `resumeCommand`, whether or not a confirmation covers the fact. Step 1 is then v1's fresh session, as for a session that can't be resumed (Kiln v1, AC-KEEP-05), with no "Session can't be opened?" link; this holds after an interruption (AC-OUTSIDE-04) and for the pull-request session, whose step 1 copies the pull-request prompt. A missing-transcript fact is never part of `outside-workspace.txt` or of the facts the fresh-session prompt appends, since no session can act on it. When it is the only uncovered fact, step 2 reads "Check your own checkouts for anything this session changed", with "Kiln found no transcript for this session, so it can't see what it did outside the workspace. Deal with anything it changed however you like.", and step 3 reads "Once your checkouts are as they should be, tick the confirmation on the right and press Check again.", followed by the drawn sentence. An unreadable transcript is shown the same way, except that the resume command stays and step 2's text under its heading reads "Kiln couldn't read this session's transcript, so it can't see what it did outside the workspace. Deal with anything it changed however you like." A change and a missing-transcript fact appear together only across two sessions, since a session with no transcript records no changes; an unreadable transcript's fact can come with changes its other lines record. Whenever changes appear with either fact, the check row lists the changes, then the transcript facts, and steps 2 and 3 stay as drawn.

## The Pull Requests

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The pull-request check, §The prompts (pull-request session), §Where a Feature Stands (engine loop's check before the session)

**Which repositories.** Every repository whose feature branch tip, read locally, differs from its `baseCommit`, or whose recorded phase receipts show a pushed commit different from that base. A later branch reset or deletion cannot remove an already changed repository from the completion check. The PRD's repository always qualifies once a phase has closed (PR-001).

**The check (AC-PRS-05, AC-PRS-06).** Retain the ready, same-repository open-PR route. Otherwise, read the assigned worktree's checked-out branch, clean status and exact local feature tip. Require origin's feature ref, when still present, to match that tip, and require every recorded completed-phase pushed commit for this repository to remain an ancestor of it; a branch reset must not erase the work owed. Query GitHub `repos/<owner>/<repo>/compare/<encoded base>...<exact tip>`: only `behind` or `identical`, zero ahead commits and `merge_base_commit.sha` equal to the exact feature tip prove prior integration. Record the live `base_commit.sha` too. GitHub errors, missing/malformed evidence, dirty worktrees, wrong branches and nonmatching origin tips fail visibly. Recheck the local worktree after the network call so newly added work cannot inherit an older proof. A deleted origin feature ref is acceptable only with exact-tip containment; an empty diff or historical merged PR never substitutes for ancestry. Squash/rebase histories without this ancestry remain on the existing PR/recovery path.

Every qualifying repository must have a ready PR or a containment proof; a mixture is valid. Stayed in the workspace and Codex's existing evidence checks still gate completion. Run the same check before the final session, at Check again, Resume and restart. A passing check skips unnecessary sessions. Keep `pullRequests` for actual review PRs and persist additive `mergedBranches: [{ repository, head, base, featureCommit, baseCommit, url }]` with `completedAt`; expose the same fields in the snapshot. Existing records without this optional field retain their current behavior. Complete, the final plan row, header and terminal distinguish all-merged and mixed outcomes rather than claiming a nonexistent PR or further review. Kiln gains no merge, deployment or cleanup authority.

**The prompt (AC-PRS-02).** One template for one and several repositories. The session is told to skip a repository only when its exact current feature commit is already contained in its given base, report that evidence, and never infer integration from an empty diff or old merged PR. Kiln independently verifies the result:

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

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records → Local API and snapshot changes (agent-specific session recovery; Claude behavior retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §HTTP API (`POST /api/resume`)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §HTTP API (`resumeAfterUsageLimit`; Resume now during a wait)

| Method and path | Change |
|---|---|
| `POST /api/settings` | Gains `workspaceFolder?` and `bases?: { <name>: <branch> }` for the other repositories, where a key naming the PRD's repository is refused; `baseBranch` still sets `settings.baseBranch`, the PRD's repository's base. Each is refused once that field is fixed |
| `POST /api/repositories` | New: `{ name }` → `200 { name, worktreePath, branch, baseBranch, added: boolean }`; `409 { reason }` when not allowed in this state; `422 { reason }` for a failed check or setup step |
| `POST /api/outside-confirmation` / `DELETE /api/outside-confirmation` | New: tick or untick the confirmation on the current stop; 409 when Stayed in the workspace hasn't failed |

Every new route carries v1's Host, Origin and token checks.

### Snapshot

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records → Local API and snapshot changes (recorded Codex identity, output and provenance; Claude behavior retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Snapshot (`resumeOffered` on Needs you)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Snapshot (the `waiting` state, the limit on Needs you)

```
Snapshot (changed and added fields only):
  feature: { …, multiRepository }
  repositories: [ { name, kind: prd | named | added, addedInPhase?, baseBranch, baseBranches?, baseCheck?,
                    worktreePath, fixed, fieldErrors } ]
                                 (baseBranches, baseCheck: not started only; fieldErrors: that row's base messages;
                                  a row's baseBranch comes from settings, as Data Models gives, until the entry has
                                  setupCompletedAt, then from the entry; settings keeps v1's baseBranch, baseBranches
                                  and baseCheck for the PRD's repository)
  documents.plan.phases[]: { …, repositories: [ name ] }
  documents.checks: adds "Named repositories found beside <PRD's repository>" for a multi-repository PRD
  settings: { …, workspaceFolder, fixed: { workspaceFolder, featureBranch, worktreePath } }
  PhaseView: { …, pushedRepositoryCount?,
               details?: { …, repositories: [ { name, addedInPhase?, worktree, branch, commitCount, latestCommit } ] } }
  current: { …, repositories: [ { name, commits: [ { sha, subject } ] } ] }   (replaces commits)
  needsYou: { …, checks: [ { name, passed, facts: [ string ] } ],
              outside?: { changes: [ string ], missingTranscripts: [ string ], checkouts: [ string ], prompt?,
                          confirmation: { offered, ticked } },
                         (changes: each uncovered change's fact; missingTranscripts: each uncovered fact for a missing or unreadable transcript;
                          checkouts: the changed checkouts' folder names, which step 2's and step 3's headings name; prompt:
                          outside-workspace.txt filled, when there are changes; ticked: a confirmation made since the stop was last checked)
              interrupted?: { at, atIsLastOutput },
              repositories?: [ { name, commits: [ { sha, subject } ] } ] }   (replaces commits)
       (current.repositories, needsYou.repositories: the PRD's repositories in list order, only those with
        commits in the phase, newest first; addedInPhase and worktreePath come from the top-level repositories[])
  pullRequests?: [ { repository, number, title, url, head, base, commits, additions, deletions } ]   (replaces pullRequest)
```

`fact` becomes `facts` for every check; a one-repository PRD's facts are v1's, one each.

While a phase works, Kiln reads its commits in every set-up repository in parallel, at most every 5 seconds. Each read runs v1's first-parent read on that repository's worktree, from the phase's `startCommit` for that repository to the feature branch. A repository added during the phase starts from the `baseCommit` recorded when it was added. A stopped phase is read the same way, when it stops and on each check, and its row's Details take each repository's count and latest commit from that read. A repository with no commits in the phase is left out, as Complete's Details leave it out. A one-repository PRD has one entry, and its screens are v1's.

## Data Models

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Data Models (schema 3; a run the person resumed, with its note)

Superseded in part by: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Data Models (the wait, `limitRefusal`, `limit_resume`, the setting)

```
PrdRecord (schema 2; fields not shown are v1's):
  repository: { mainCheckoutPath, name, github }      (the PRD's repository; still keys the state directory)
  repositories: [ {
      name, kind: prd | named | added, mainCheckoutPath, github, baseBranch, worktreePath,
      addedInPhase?, addedAt?, baseCommit?, createdBranch?: { name, commit, baseBranch }, setupCompletedAt? } ]
  settings: { workspaceFolder, worktreePath, featureBranch, model, effort, keepAwake, baseBranch,
              bases: { <name>: <branch> } }
       (baseBranch: the PRD's repository's base, v1's field; bases: the other repositories' bases, never keyed by
        the PRD's repository's name. Both are chosen before Start and kept by name, so a kiln run that re-reads the
        plan keeps them, and copied to each entry's baseBranch at Start; an entry without setupCompletedAt takes
        its base from them, except an added entry, whose baseBranch is its own and fixed from the start.)
  phases.<id>: { …, repositories: { <name>: { startCommit, pushedSha?, commitCount? } },
                 outsideConfirmations: [ { at } ],
                 stop?: { …, checks: [ { name, passed, facts[] } ], interrupted?: { at, atIsLastOutput } } }
  plan[]: { …, repositories: [ name ] }
  pullRequests?: [ { repository, …v1's PullRequestFacts } ]

SessionRecord (schema 2): adds workingDirectory, the folder the session was launched in.
```

`baseCommit`, `createdBranch` and the phase's `startCommit`, `pushedSha` and `commitCount` move from the PRD and phase to each repository. **Migration from schema 1**, on read, with no Git call: `settings.baseBranch` and `settings.worktreePath` stay, and `bases` is `{}`. A record with `startedAt` or `createdBranch` gets one `repositories` entry of `kind: prd` from `repository`, `settings.baseBranch`, `settings.worktreePath`, `baseCommit`, `createdBranch` and `setupCompletedAt`; a record with neither gets no entry, and its Start builds the list. Also: each phase's three facts under that repository's name; `pullRequest` as a one-entry `pullRequests`; each check's `fact` as a one-item `facts`; `workspaceFolder` the default; each session's `workingDirectory` the worktree path. The record is written as schema 2 at its next write.

## Screens (AC-SHOW-01)

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot ("Needs you on screen", Disconnected rules, Settings and each phase's model)

The four drawn screens are built from their mockups' HTML, which is their specification, field messages included. The rest follow AC-SHOW-01's table:

- **Running, Paused, Disconnected, Phase detail:** phase rows and Details as Complete draws them ("pushed to 2 repositories"; Commits by repository); the settings show the workspace folder and repository list as Documents found draws them, without help text, every field fixed, plus "<n> repositories, one added in phase 2b" as Complete's settings panel reads.
- **Phase detail's Commits list and the current-phase panel:** grouped by repository, as Complete's Details draw it. Each repository's name gets its "added in phase" label, and its `sha subject` lines sit under it. The panel's Commits row reads "<n> in <m> repositories". With no commits anywhere, v1's empty lines stay: "None for this phase yet. The feature commit comes after test hardening." (or "None for this phase." once stopped) in Phase detail, and "None yet for this phase" in the panel.
- **v1's two Needs you screens:** facts by repository, as the outside-workspace mockup lists them.
- **A one-repository PRD's Documents found:** the added-repositories sentence under the worktree fields, in the Documents found mockup's words for one repository; every other part as v1.
- **Needs you after an interruption with work outside the workspace:** the outside-workspace mockup with v1's interrupted line, saying Kiln "didn't resume it, since it worked outside the workspace" (or, with no changes and only a missing or unreadable transcript, "since it can't see what the session did outside the workspace"), and the last lines in place of the final message.
- **Needs you when a transcript is missing or unreadable:** the outside-workspace mockup, with the steps [Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04) gives.

The view renders all of it from the snapshot; no new view logic decides anything.

## Seam With Usage-Limit Recovery

That PRD has no design yet. This design asks of it, so its design honors AC-OUTSIDE-01, AC-OUTSIDE-04, AC-PRS-05 and AC-SHOW-01's `Replaces in part:` lines on it, the last by naming each failed fact's repository on its Needs you screens:

- Before a usage-limit wait starts, and before Resume, Resume now or a resume by itself, Kiln runs Stayed in the workspace. A failure means Needs you with no wait; Resume honors the confirmation as Check again does.
- Resume is offered on an interrupted session's Needs you that this design produces (`interrupted` set), and to a pull-request session whose check failed for any reason.
- Resume isn't offered, and Resume now or a resume by itself isn't attempted, when the phase's latest session has no transcript, the case where the snapshot leaves out `resumeCommand` ([Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04)), since `claude --resume` needs it. Needs you offers v1's fresh session instead, as [Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04) gives. An unreadable transcript keeps Resume.
- While the confirmation is unticked, a resumed session's first message is AC-OUTSIDE-02's prompt, after the person's note and before the instruction to carry on.

## Integration Points

- **Claude Code:** sessions as in v1 with `--add-dir`, `--disallowedTools PowerShell` and a working directory per the workspace; transcript files read by [Stayed in the workspace](#stayed-in-the-workspace-ac-outside-01-to-04).
- **Git**, per repository: v1's reads; `worktree add` at Start and when adding a repository, still the only Git change Kiln makes (AC-GIT-01); `remote get-url origin` and `rev-parse --show-toplevel` in each named repository's own checkout, both reads.
- **GitHub:** `gh pr list` per repository.
- **The Enso Method:** reads the `**Repositories:**` line, which `phase-split` doesn't write yet (PRD, Out of Scope).

## Testing Approach

As v1's, against real temporary Git repositories with local bare repositories as `origin`, and the stand-in `claude`:

- **Plan reader:** `**Repositories:**` lines, bad names, split records' names not inherited, the union and its order.
- **Start checks and setup:** a named repository missing, a name differing from its folder only in case, a named repository that is a link, not a checkout, not on GitHub; a branch taken in one repository; a check failing in the third repository (Start refused, nothing recorded); a Start failing at the second repository's add, then a Start that finishes it; a plan edited between the two Starts (a dropped unset-up entry with and without a `createdBranch`), and PRD documents changed in the given checkout after the first repository was set up; a partly set-up PRD's fixed fields; `kiln run` after Ctrl+C mid-setup, and after Ctrl+C before a later repository's add (finished by `kiln run`).
- **Adding a repository:** each refusal, a git failure then a retry, two concurrent requests, a repository named only after Start (AC-ADD-04's `plan` stop and its retry), the command's PRD lookup from a worktree, from the workspace folder and from a folder two PRDs share, the command with no Kiln running, a setup longer than 5 minutes, a session ending while its addition is under way, an add interrupted mid-`worktree add` (finished from `baseCommit`), a failed add holding only its branch, and a worktree left `locked initializing`.
- **Done and pull-request checks:** facts by repository, a repository with no commits of its own, a PR missing in one of three.
- **Stayed in the workspace:** unit tests over recorded transcripts from the [behaviors tried above](#claude-code-behaviors-this-design-relies-on): an edit in an outside checkout, an `.agent-sessions/` write, `git -C`, `cd … &&` and a `cd` in an earlier call (placed by the record's `cwd`), `pushd`/`popd`, a `GIT_DIR` or `GIT_WORK_TREE` assignment or export, and `/usr/bin/git`, `command git` and `env git`, Windows-form paths (`/c/…`, `C:/…`, quoted `C:\…`), a Bash call that committed outside and then exited non-zero, each row of the table, the `branch`, `tag`, `config`, `symbolic-ref` and `fetch` forms on both sides of the line, a subagent's edit, an edit in a submodule of a worktree (inside) and a subagent worktree's edit (outside), a turn added by a manual `claude --resume`, a `PowerShell` tool call, confirmation coverage by timestamp, a session that never reached `init` (passes), one that ran with no transcript (fails, and a later tick clears it, also when its last run recorded no `endedAt`), a cut-off line mid-file (skipped), a corrupt line and an unreadable transcript file (each fails, with the resume command kept).
- **Migration:** a schema 1 record from each v1 state (not started, underway, Needs you, complete) reads as schema 2 and renders as before; a not-started record gets no `repositories` entry; one holding only a `createdBranch` gets one.
- **The view:** the four mockups rendered from fixture snapshots and compared, as in v1.
- **AC-PROOF-01:** a real PRD in a repository holding no code, changing two code repositories, one session adding a third; a one-repository PRD adding one; a session editing an own checkout, stopped and cleared. All on macOS (PRD, Out of Scope).
- **Not tried on Windows:** the Windows behavior above is built from this design and its unit tests over Windows-form paths, never run on Windows. When someone first runs Kiln on Windows, these are the checks to make: the transcript location's folder encoding there, that records' `cwd` is `C:\…`, that `cd /c/<outside checkout> && git commit` fails Stayed in the workspace, that with `"CLAUDE_CODE_USE_POWERSHELL_TOOL": "1"` in the person's `~/.claude/settings.json` `env` a session's `init` `tools` lists `Bash` and not `PowerShell`, and that a manual `claude --resume` turn running a PowerShell command fails Stayed in the workspace.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-REPO-01 to 03 | The PRD's Repositories; Settings before Start; Snapshot; Command line |
| AC-SPACE-01 to 05 | The Workspace; Sessions; Data Models |
| AC-ADD-01 to 04 | Adding a Repository; HTTP API; Command line |
| AC-OUTSIDE-01 to 04 | Claude Code Behaviors; Sessions; The Done Check; HTTP API; Snapshot; Data Models; Screens; Seam With Usage-Limit Recovery |
| AC-CHECK-01, 02 | The Done Check |
| AC-PRS-02 to 06 | The Pull Requests; Command line; Screens; Settings before Start |
| AC-SHOW-01 | Screens; Seam With Usage-Limit Recovery |
| AC-PROOF-01 | Testing Approach |

## Open Questions

- **Usage-limit recovery's design** must take the [seam](#seam-with-usage-limit-recovery) as given; check it once that design is drafted.

Settled while building Phase 1 (2026-10-22):

- **Per-repository settings and hooks don't apply in a multi-repository session** ([Per-repository instructions](#per-repository-instructions)). Kiln accepts it and Documents found says so in one line, "Sessions follow each repository's CLAUDE.md, but not its .claude/settings.json or hooks." (assumption REPO-005, awaiting validation). Kiln writes no merged settings.
- **Which prompts carry the CLAUDE.md sentence.** The launch prompt, both forms, and so the fresh-session prompt built from it. The resume prompts don't repeat it: they say everything in the first message still applies, and the session's own history holds it. The pull-request prompt doesn't carry it, since that session changes no code. `outside-workspace.txt` (Phase 2) is sent to a resumed session, so it doesn't either; its bring-in request changes code only in worktrees whose instructions the first message already pointed at, and the add-first line's `kiln add-repository` prints the sentence for a repository added then.
