# Changelog

What changed in each Kiln release, newest first. Each release's GitHub Release shows its
section, and the newer version notice in Kiln's top bar links here.

Work merged since the last release goes under Unreleased. Preparing a release renames that
section to the new version.

<!-- Kiln 1.0.1 and 1.1.5 were prepared but never published; their changes shipped in 1.0.2 and 1.1.6. -->

## [Unreleased]

## [1.2.0] - 2026-11-14

### Added

- **A stopped phase says what happened and how to get going again.** When a phase's session
  stops, the Needs you page names the case: the agent couldn't launch, the session ended
  having built nothing, or it stopped partway. It then offers the button that fits. **Start
  Phase N again** relaunches a phase that never began. **Send reply & continue** has Kiln
  carry on in a new session that is told what was already done, used when the earlier
  conversation can't be reopened; the card says why and offers **Check again** once the cause
  is cleared. A phase that built nothing shows **Nothing to check yet** instead of failing
  completion checks. A held phase can carry on the same way, and `kiln carry-on` and
  `kiln start-again` give bots the same controls.
- **Kiln can be reset for a PRD.** A **Reset** line at the bottom of every screen, or
  `kiln reset`, has Kiln forget its progress on the PRD and return to Documents found, as if it
  had never run it. It asks first, saying what goes and what stays, waits until no session is
  working, and touches nothing in git: branches, worktrees and pull requests stay as they are.
- **Kiln can start on a branch that already exists.** Documents found asks where to start
  from: a new feature branch, as before, or an existing branch, such as one where some phases
  were built by hand or Kiln's own branch from before a reset. Kiln reads the phase plan from
  that branch, starts at its first open phase, adds to the branch and never rewrites it. When
  the branch has no commits of its own yet, Kiln offers to bring it up to date with the base
  branch first, at the start or at a stop. Several repositories can share the one branch name.

- **The header shows the PRD's total time.** Once a PRD has started, every progress screen
  adds a **PRD total** line under the state: the running time and waiting time of the whole
  PRD so far, and when it started. Running time covers every session the PRD has run, its
  phases, audits, repairs and pull-request session; waiting time is the rest, including
  Needs you stops, usage-limit waits and pauses. The moving total goes up each minute, and
  the totals keep accumulating when added phases are continued or a run starts again after a
  missing folder. On Complete the line gives the span the PRD ran.
- **The top bar says when a newer Kiln is on npm.** Kiln asks the npm registry once when it
  starts, without holding up the page. When npm's latest release is newer than the running
  Kiln, an amber **v<version> available** pill appears beside the version. It opens the
  install command with a Copy button and a link to this changelog. A development build
  never asks, and a Kiln newer than npm's shows nothing. The request names only Kiln's own
  package, and if npm can't be reached nothing is shown.

## [1.1.6] - 2026-11-12

A finished phase or completion audit stays finished while later work builds, and a stopped
conversation on a Linux machine can be resumed again. Kiln 1.1.5 did not reach npm; its
changes ship here.

### Fixed

- **A finished phase is no longer reopened by a later phase's edits.** Each phase's
  development-delivery decision was tied to the PRD, the technical design and the phase
  document together. A later phase that edited the shared PRD or design made every earlier
  decision out of date, so Kiln went back to Phase 1 and stopped at Needs you. A finished
  phase's decision, and a check you waived on it, now hold until that phase's own document
  changes or the phase is reopened. Split phases and the accounting after the last phase
  follow the same rule.
- **`kiln delivery` works beside a set-aside copy of the saved state.** A renamed copy of a
  PRD's saved state in the same folder made `kiln delivery`, `kiln audit`,
  `kiln preparation` and `kiln add-repository` refuse, because two records claimed the same
  workspace. A session then could not record its delivery decision and the phase stopped at
  Needs you. These commands now ignore a copy whose folder name doesn't match its PRD,
  prefer the record a running Kiln holds, and name the conflicting folders when they still
  refuse.
- **A finished audit is no longer reopened by the phases it added.** A completion audit's
  development-delivery decision was tied to the PRD, the technical design and the phase
  documents as they stood. The completion phases an audit adds edit those documents, so the
  audit's own decision went out of date and Kiln stopped at Needs you, asking for a decision
  that a finished audit can no longer record. A finished audit now keeps the documents its
  check passed against.
- **Resume is offered again on Linux.** Kiln judged every folder under Claude Code's
  history before offering to resume a conversation and refused if any of them was
  group-writable, which Claude Code's own folders are under a common Linux setup. The
  stopped page then said conversation recovery was unavailable. Kiln now judges only the
  history root, the conversation's own folder and its file, and says which path it refused
  and why.

### Changed

- **The top bar shows the Kiln version.** The version of the Kiln serving the page appears
  beside the Kiln mark.

### Upgrade

A run picks up the new rule when it is started with 1.1.6. A phase that finished under an
earlier version is bound to its own document the next time its completion check passes, so
it may stop at Needs you once more; record its delivery decision or choose **Mark complete**
and it stays finished after that. An audit that finished under an earlier version is bound the
same way: choose **Mark complete** once and it stays finished.

```sh
npm install -g @ensodynamics/kiln@1.1.6
```

## [1.1.4] - 2026-11-11

A clean audit no longer stops a run on a question that is already waiting for you.

### Fixed

- **Open questions ride along instead of stopping the run.** When an audit leaves you
  something to decide, for example test rows that stayed below Adequate, every later audit
  must list that item again until it is settled. A delivery audit that found nothing left to
  build had no way to do that and still pass, so Kiln stopped at Needs you on the earlier
  question even though the test audit that comes next did not depend on it. A passing audit
  can now list an outstanding item again by its id, and Kiln goes on to the next audit with
  the item still shown as waiting for you. A passing audit still cannot add a new item.
- **Delivery still waits for every answer.** A test audit that changed only tests leads to
  final delivery, so it passes only once every item is settled; otherwise it stops at Needs
  you as before. A test audit that changed implementation goes back to a delivery audit and
  can carry open items with it.
- **`kiln help` matches.** The audit submission contract it shows, the audit session's
  instructions and Kiln's requirements now state the same rule.

### Upgrade

A run already stopped at Needs you this way stays stopped until you answer, because a result
Kiln recorded doesn't change. Runs started on 1.1.4 or later get the new behavior.

```sh
npm install -g @ensodynamics/kiln@1.1.4
```

## [1.1.3] - 2026-11-11

Installing a new Kiln no longer breaks runs that are still going.

### Fixed

- **A run keeps its own version.** Each installed version of Kiln now runs from its own
  private copy in `kiln-installs`, beside Kiln's state folder. When `npm install -g` puts a
  newer Kiln in place, a run that is still going carries on with the prompts, hooks, helper
  scripts, browser view and `kiln` command of the version it started on. Commands started
  after the install use the new version. Before, a run could read the newer version's files
  partway through and crash, for example with `Prompt placeholder {{outstanding}} has no
  value.`
- **No half-installed copies.** A `kiln` command started while npm is still installing Kiln
  stops with a message to run it again once the install finishes. It never runs from a
  partial copy.
- **Old copies are cleaned up.** A version's copy is removed once no Kiln process is using it
  and it hasn't been used for seven days. The installed version and any copy a run is still
  going on are never removed.

The first `kiln` command after installing a new version takes a few seconds longer while its
copy is made. A Kiln linked from a local checkout with `npm link` still runs from its own
files. On Windows, a bare `kiln add-repository` typed by an agent reaches the newly installed
version.

### Upgrade

This protects runs started on 1.1.3 or later. Runs started on an earlier version are not
protected, so let them finish before installing this one.

```sh
npm install -g @ensodynamics/kiln@1.1.3
```

## [1.1.2] - 2026-11-10

A link in the requirements that Kiln can't follow no longer stops a run.

### Fixed

- **Broken links don't block a run.** A local Markdown link to a file that isn't in the
  repository, is outside it, is reached through a symbolic link or isn't a file used to stop
  Kiln before a phase started, with a message about the phase plan. Kiln now starts the work
  anyway. A run already stopped on such a link continues on its next Check again.
- **The agent is told.** Each phase session's prompt names the links Kiln couldn't follow and
  asks the agent to find the document if the phase needs it.
- **Documents found lists them once.** A neutral **Linked documents** item shows each link Kiln
  didn't follow and the document that holds it. It isn't a failed check, and Start stays
  available.

The PRD's own documents (the PRD, technical design, assumptions and phase documents) and the
`Superseded by:` / `Replaces:` pointers written in them still stop a run when missing, as before.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.2
```

## [1.1.1] - 2026-11-10

A delivery or test audit that adds completion phases no longer stops the whole run over a
question those phases don't depend on.

### Fixed

- **Added phases get built while a person answers.** An audit that appends completion phases
  can now also list items for a person. When the added work doesn't depend on them, Kiln builds
  it; when it does, the audit stops at Needs you as before.
- **Nothing left for a person goes missing.** Kiln keeps each open item and lists it in every
  later audit's prompt. Each later audit must settle it, saying how, or list it again, and Kiln
  refuses a report that leaves one out. Open items show on the audit's row and detail page, and
  settled ones appear once on the settling audit's page and in the final pull request.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.1
```

## [1.1.0] - 2026-11-08

Kiln now recovers a run whose worktree has gone missing, instead of reporting a stale status
for a folder that no longer exists.

### Added

- **A Folder missing page.** When a saved run's worktree is deleted, moved or replaced, Kiln
  stops and says so, in the terminal and in the browser, before checking or starting anything.
  It shows which folder is gone, what it can still find about the branch and the plan, and
  what it couldn't check.
- **Set the run up again.** The page offers the same settings as a first Start. Start a fresh
  execution from the base branch, or make a new worktree on the existing feature branch and
  carry on from the first unfinished phase, resuming an interrupted session where it can.
  Nothing changes until you press Start, and any work that would be left behind is named first.
- **A folder put back by hand is found.** Restore the folder yourself and Check again picks
  the run back up.

### Fixed

- **`kiln status` no longer fails on old saved records** that can't affect the work it reports.
- **A repeated check name no longer blanks the Needs you page.**
- **Every stop that needs a person now prints a line in the terminal**, including one raised
  before the browser view is ready.

### Changed

- **Every push to `main` is now a release.** The separate publication setting is gone. This
  affects Kiln's own release process only.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.0
```

## [1.0.3] - 2026-11-08

Fixes for runs with early merges and development deployments turned on, where phases stopped
again and again on development evidence they could not or no longer needed to provide.

### Fixed

- **Phases already Closed before a run starts no longer stop it.** With early merges on, a fresh
  run stopped on every phase that was Closed before Start with "Phase N needs a current
  development-delivery assessment", and each had to be marked complete by hand. Only a Kiln
  session writes that assessment, so such a phase could never pass. A phase Closed before the
  run, that the run never touched, now owes no development evidence, as with early merges off.
- **Marking a phase complete now lasts past later commits.** A waived "needs a current
  development-delivery assessment" item stopped matching as soon as any repository got a new
  commit, so the waived phase stopped the run again when the next phase pushed its work, and
  again at final delivery. The waiver now holds until that phase's own documents change.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.3
```

Waivers saved by earlier versions were recorded against the repositories' commits, so a phase
waived before upgrading may stop once more; marking it complete again records a waiver that
lasts.

## [1.0.2] - 2026-11-07

Fixes for live Claude Code sessions that finished their work but never closed. Kiln 1.0.1 was
prepared but not published; its changes are included here.

### Fixed

- **A phase no longer stays on Implementing after Claude has finished.** Kiln waited for a
  report from its own hook that each tool call had finished before it closed a session. When
  that report never came, the session stayed open after Claude's final turn, the phase showed
  Implementing indefinitely, and the run went no further. Kiln now closes a session once Claude
  has given its final result and answered every message, as designed. Reports of finished tool
  calls are still required before you take over a session from the terminal.
- **The report a tool call has finished no longer goes missing.** When two of Kiln's hooks
  reached its lock at the same moment, one could fail and lose that report.
- **A tool call the auto-mode classifier rejects no longer holds the session open.** Kiln now
  treats any rejected tool call as finished, since it never ran.
- **Taking over a long session is no longer refused.** Kiln kept every process a session had
  ever started on its list, even after it ended, so a long session passed the list's limit and
  Pause & take over stayed blocked. Ended processes now leave the list.

### Changed

- **Over SSH, `kiln run` says how to reach the view instead of reporting an error.** Kiln no
  longer tries to open a browser on a remote machine. It prints the view's address with an
  example `ssh -N -L` command for opening it from your own computer through a tunnel to the same
  port. On a machine with no way to open a browser, it says to open the address yourself. Only
  an attempt to open the browser that fails is still reported as an error.
- **`KILN_PORT_RANGE` is a supported setting.** Set `KILN_PORT_RANGE=<first>-<last>` to give a
  machine its own block of ports, for example when several machines are tunnelled to one
  computer. A value that isn't two ports from 1024 to 65535, first no greater than last, stops
  `kiln run` with a message instead of quietly using 4700-4799.
- **`kiln --version` says when a build is not a release.** A build packed or linked from a local
  checkout now prints `(dev build, <when it was built>)` after the version. Installed releases
  print the plain version, as before.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.2
```

A run stuck on Implementing this way can be stopped and started again with `kiln run` after
upgrading.

## [1.0.0] - 2026-11-05

The first public release of Kiln.

Kiln builds a PRD you already planned with the [Enso Method](https://github.com/EnsoDynamics/enso-method), one phase after another, with nobody sitting in the loop. Every phase gets a fresh Claude Code or Codex session. Git confirms the phase landed before the next one starts. When the last phase closes, delivery and test audits check the whole PRD, and the work waits for you as pull requests. A local browser view shows each session live, and you come back when it's done or when a phase genuinely needs you.

### Install

```sh
npm install -g @ensodynamics/kiln
kiln --help
```

Then, from the root of a repository whose PRD has been planned and split into phases:

```sh
kiln run docs/prds/<name>
```

### Requirements

- Node.js 22.15 or later and Git 2.29 or later.
- GitHub CLI signed in to github.com, with the repository's `origin` on GitHub.
- Claude Code 2.1.311 or later, or Codex 0.162.1 or later signed in through ChatGPT, with the Enso Method skills installed in it. Codex on Windows also needs PowerShell 7.5.2 or later.
- macOS is validated. Linux and Windows are best effort.

Kiln accepts every agent version at or above these minimums. When a newer Claude Code or Codex changes what live messaging, takeover or Codex command evidence relies on, that feature turns off with a compatibility notice and the rest of the run carries on.

### Reporting problems

Open an issue at [github.com/EnsoDynamics/kiln/issues](https://github.com/EnsoDynamics/kiln/issues). Report a suspected security vulnerability privately, as [SECURITY.md](https://github.com/EnsoDynamics/kiln/blob/main/SECURITY.md) describes, not in a public issue.

More at [ensomethod.org/kiln](https://ensomethod.org/kiln/).
