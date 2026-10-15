# PRD: Kiln v1

**Inputs:** [Kiln architecture proposal](../../design/kiln-architecture-proposal.md) (settled decisions), [Kiln interface scenarios](../../design/kiln-interface-scenarios.md) and the v1 [mockups](../../design/mockups/) (the design of record).

## Summary

Kiln v1 runs the implementation half of the Enso Method without a person sitting in the loop. You point it at a PRD that has already been refined and split into phases. Kiln then implements the phases one at a time, in plan order, each in a fresh unattended Claude Code session. After each session it checks in Git that the phase actually landed before it starts the next one. Kiln finishes with one pull request for the whole feature, ready for human review. When a phase doesn't land, Kiln stops and hands that exact session back to you, along with what the session said last.

You start Kiln with one terminal command, `kiln run` and the path to a PRD, and it keeps running in that terminal while it works. Everything else happens in a browser view it serves from your own machine and opens for you: reviewing what it found, starting, watching, pausing and picking up stops. If Kiln is interrupted (Ctrl+C, a closed terminal, a restart, a sleeping laptop), running the same command again picks it back up without losing work.

**Kiln is optional.** The Enso Method works completely without it: everything Kiln does, a person can do by hand in an ordinary Claude Code session with the same skills. Kiln only takes away the babysitting between phases, and nothing in the method or in a repository depends on it.

## Business Context

Today a person runs this loop by hand. They start a session with `implement-from-requirements`, watch it, say "commit and push", paste the continuation prompt into a new chat, and repeat. A plan of a dozen one-hour phases means a dozen interruptions spread across a day, and the plan can't run overnight. Kiln removes that babysitting. The person is needed only when a phase doesn't land and at the end, to review the PR.

These settled decisions from the architecture proposal shape everything below:

- **The Enso Method stands alone.** Everything Kiln does, a person can do by hand with the same skills. Kiln needs no change to any Enso Method skill, and it writes nothing into the repository that the skills don't already write.
- **Kiln doesn't interpret a session.** Whether a phase is done comes from three facts in Git and the phase documents (see "the done check" below). Anything else goes back to the person with what the session said, never with a cause Kiln guessed.
- **Assumptions are green lights.** Nothing Kiln does waits on stakeholder feedback. Unconfirmed assumptions are counted on Documents found as information, never as a hold.
- **Kiln owns the order and the visibility; the session owns the engineering.** Implementation, review, test hardening, commits, pushes and the PR all happen inside the sessions, through the skills, the same way they do by hand.

### Terms used in this PRD

- A **phase** is one session-sized slice of the PRD, described in its own phase document. A phase that was cut further has a `## Split into` table and is a **split parent**. A phase with no such table is a **leaf**, and only leaves are implemented.
- A leaf is **closed** when its phase document has a `**Closed:**` line under its title. The implement session writes that line when the phase lands.
- A **session** is one Claude Code session that Kiln starts for one phase (or, at the end, for the pull request). "Run" is never used as a noun for Kiln's work on a PRD, in this PRD or on screen, so it can't be confused with one phase's session; the `kiln run` command and ordinary verb uses are fine.
- The **done check** is the three-part test Kiln applies after every session: the phase is closed, everything is committed, and everything is pushed.
- **Needs you** is the state Kiln enters when a phase fails the done check.
- A session is **interrupted** when Kiln stops while the session is still working: Ctrl+C, a closed terminal, a restart, or sleep. Kiln knows this from its own record that the session was running and never finished. It is different from a session that **ended on its own**, finished or crashed, which Kiln judges with the done check.

## Acceptance Criteria

### Start Kiln on a Refined PRD

There is one way in: point `kiln run` at one PRD. Kiln checks that the documents it needs are where the Enso Method skills put them, then opens the browser on what it found. Nothing is implemented until the person presses Start.

- [ ] **AC-START-01 — One command, one PRD.** `kiln run <path>` is the only way to start, where the path is one PRD's directory (`docs/prds/<name>/` or `docs/changes/<name>/`) or the PRD file in it. Run with no path, or with a directory holding several PRDs, Kiln prints how to use it and exits. The same command is used every later time too (AC-CLI-01).
- [ ] **AC-START-03 — Missing or broken documents stop Kiln in the terminal.** Kiln looks for the documents where the Enso Method skills put them, in the PRD's directory: the PRD (`<name>-prd.md`), the technical design (`technical-design.md`) and the phase documents. It also checks that every leaf cites acceptance criteria, that no phase depends on a phase later in the plan, and that the checkout has no uncommitted changes. If anything is missing or fails, Kiln prints what, and where it looked, and exits without opening the browser or starting anything. An assumptions document (`assumptions.md`) is optional.
- [ ] **AC-START-10 — The browser opens on what Kiln found.** When the checks pass, Kiln opens the browser view itself. For a feature not started yet, it opens on the Documents found screen, and no session starts until the person presses Start there. For a feature already underway, it opens on the PRD's progress and carries on (AC-CLI-01).
- [ ] **AC-START-02 — Kiln shows what it found beside the PRD.** For the PRD: its acceptance-criteria count and label range. For the technical design: how many of the PRD's acceptance criteria it cites. For assumptions: how many there are and how many still await stakeholder feedback, labeled as green lights that nothing waits on, or that there is no assumptions document. For the phase plan: how many phase documents there are, and the phases to implement in order, by number and title, showing which phases are split and into what. It also lists the checks from AC-START-03 as passed.
- [ ] **AC-START-04 — The person confirms the documents were refined.** Kiln can't tell from the files whether the documents have been through requirements refinement, because that workflow deletes its working file when it finishes. Documents found says so, and Start stays unavailable until the person confirms they have.
- [ ] **AC-START-05 — The PRD's settings are shown and can be changed before starting.** Documents found shows the new worktree's path, the feature branch and the base branch it starts from, the agent, model and effort level, when pushes happen, where Kiln stops, and whether Kiln keeps the computer awake. Before Start, the person can change the worktree path, the feature branch, the base branch, the model, the effort level (low, medium, high, extra high or max) and keep-awake. The worktree, feature branch and base branch are fixed once the first phase starts (AC-VIEW-07). In v1 the agent is always Claude Code, pushes always happen after every phase, and Kiln always stops at "PR ready for review". Kiln won't merge.
- [ ] **AC-START-06 — One feature branch and one worktree for the whole PRD.** Kiln creates one new feature branch from the base branch, and one worktree for it, before the first session. Every phase's session works in that same worktree and commits and pushes to that same branch, each phase building on the one before. Phases never get their own branches, worktrees or pull requests. A later `kiln run` for the same feature, after an interruption or a stop, reuses them. The final pull request, the only one, goes from that branch into the base branch. The base branch is `develop` by default, following Git flow (`develop` deploys to a dev environment, `main` to production, and features branch off `develop`); when the repository has no `develop`, it is the repository's default branch. The person can change it before Start. Kiln never works in the person's own checkout or directly on a shared branch.
- [ ] **AC-START-07 — The person sees what Kiln is allowed to do.** Next to Start, Documents found shows what Kiln may do: commits and pushes to the feature branch, and one pull request into the base branch once every phase closes. It also shows what is not allowed: merging, deploying anywhere, and touching other branches.
- [ ] **AC-START-08 — Settings are remembered.** Running `kiln run` again on a feature already underway reuses its recorded settings without asking for them again.
- [ ] **AC-START-09 — The terminal says what's happening, briefly.** The terminal prints the feature name, what Kiln found, the browser view's address, that Kiln works in this terminal so it should stay open, and that Ctrl+C interrupts the current phase and `kiln run` picks it back up. While Kiln works, it prints one line when it starts the PRD and one each time a phase starts, is done, stops, is interrupted or is resumed.

### Implement Each Phase in Its Own Unattended Session

Kiln does the job of the person who starts each session, gives it permission to commit, and moves on to the next phase. The engineering stays inside the session, done by the Enso Method skills exactly as they are.

- [ ] **AC-RUN-01 — Phases run in plan order, one at a time.** The next phase is the method's own choice: walk the plan in order, through any `## Split into` tables, to the first leaf without a `**Closed:**` line. Kiln never has two sessions working on one PRD at once.
- [ ] **AC-RUN-02 — Each phase gets a fresh session.** Each leaf is implemented by a new, unattended Claude Code session started in the PRD's worktree, with the model and effort level from the PRD's settings.
- [ ] **AC-RUN-03 — The session gets the authorization a person would give.** Each session is told to:
  - run `implement-from-requirements` on that leaf's phase document;
  - work only in the PRD's worktree and on its feature branch, without switching branches or creating another worktree;
  - commit and push to the feature branch, and run `refactor-pass` after the feature commit;
  - open no pull request, merge nothing and touch no other branch;
  - treat the phase as finished when its phase document has its Closed line and everything is committed and pushed.
- [ ] **AC-RUN-04 — A phase that splits itself is followed.** Kiln re-reads the plan after every session. When a session split its own phase, Kiln carries on with the next unclosed leaf, and the person does nothing special.
- [ ] **AC-RUN-05 — A session never waits for an answer.** A session runs with no one there to answer permission prompts or questions. Anything that would ask is refused instead of waiting, so a session never hangs waiting for a person. A session that needs to ask a question ends, its question becomes its last message, and the phase goes to Needs you.
- [ ] **AC-RUN-06 — The Enso Method skills are used unchanged.** Kiln works with the skills as published. It requires no edit to any skill, and everything it tells a session is something a person could type by hand.
- [ ] **AC-RUN-07 — Kiln is never required.** Any phase can be started, finished or picked up in an ordinary Claude Code session with no Kiln involved, and Kiln treats a phase finished that way exactly like one it ran: the done check is the only test. A feature can move between Kiln and manual sessions at any point, in either direction.

### Check in Git That Each Phase Landed

A phase counts as done only when Git and the phase document say so. How the session ended, and what it claimed, doesn't count.

- [ ] **AC-DONE-01 — Done means three checks pass.** After every session, a phase is Done only when all three checks pass:
  - **Closed:** the leaf Kiln launched has its `**Closed:**` line. If the session split that leaf, the leaf's first child has its Closed line instead.
  - **Committed:** the PRD's worktree has no uncommitted changes.
  - **Pushed:** the feature branch and its copy on `origin` point at the same commit.

  Otherwise the phase is Needs you.
- [ ] **AC-DONE-02 — Exit codes and messages don't decide.** A session that exits cleanly saying it finished, but fails a check, is Needs you. A session that crashed, but whose work passes all three checks, is Done.
- [ ] **AC-DONE-03 — The same check runs everywhere.** It is the same check after every session, when the person presses Check again, when `kiln run` is run on a stopped feature, and when `kiln run` picks up an interrupted phase.
- [ ] **AC-DONE-04 — No model judges how a session ended.** Kiln makes no model call to decide or explain how a session ended. It needs no credential beyond the person's own Claude Code login.

### Hand a Stopped Phase Back With What the Session Said

When a phase fails the done check, Kiln stops and gives the person everything needed to finish that phase themselves, then continues once they have.

- [ ] **AC-STOP-01 — Kiln stops and doesn't retry.** When a phase is Needs you, no later phase starts and Kiln doesn't rerun the phase on its own. (An interrupted session is a different case: Kiln resumes it, per AC-KEEP-04.)
- [ ] **AC-STOP-02 — The person sees how the session ended, word for word.** The Needs you screen shows:
  - the session's last assistant message, verbatim;
  - the exit code and the time the session stopped;
  - the last skill seen in the session;
  - when the session ended without a final message, its last lines of output, errors included.
- [ ] **AC-STOP-03 — The person sees which checks failed and why.** Each of the three checks shows whether it passed, with the specific fact behind it. Examples: "No Closed line in phase-2b-store-credit.md", "12 files changed, not committed", "a41c9e2 isn't on origin yet".
- [ ] **AC-STOP-04 — Kiln never guesses a cause or invents a question.** Nothing on any screen or in the terminal output gives a reason for a stop that Kiln inferred. Anything said about why a phase stopped is the session's own words, quoted, never summarized; the Needs you screen's "Finish the phase" step uses the same wording for every stop.
- [ ] **AC-STOP-05 — The person can reopen the exact session.** Kiln shows a copyable command that changes to the PRD's worktree and runs `claude --resume <session ID>`. It opens that session in a terminal with its full history.
- [ ] **AC-STOP-06 — A fresh-session prompt is there when the session can't be opened.** The Needs you screen also offers a copyable prompt for a fresh session that points at the phase document, for when the session can't be reopened, for example because its transcript is gone.
- [ ] **AC-STOP-07 — Check again lets Kiln continue.** After the person finishes the phase by any means, Check again in the browser view runs the done check (as does `kiln run`, if Kiln was restarted in the meantime). When it passes, the phase shows as Done, finished by the person, and the next phase starts. When it fails, the phase stays Needs you with the updated check results.
- [ ] **AC-STOP-08 — Nothing starts while the person may be in the stopped session.** After a stop, Kiln starts no session for that PRD until the person presses Check again or runs `kiln run`.

### Leave the Git Work to the Sessions

Kiln reads Git but doesn't repair it. Every change to the repository's history comes from a session the person can see and resume.

- [ ] **AC-GIT-01 — Kiln sets up the worktree, and does nothing more.** Kiln creates the worktree and the feature branch from the base branch before the first session starts. Apart from that setup, Kiln changes no Git state.
- [ ] **AC-GIT-02 — Kiln never does destructive Git operations.** Kiln never resets, stashes, cleans, force-pushes or deletes branches, in any situation. A workspace left with uncommitted changes after a stop stays that way until the person resolves it.
- [ ] **AC-GIT-03 — Kiln adds nothing to the repository.** Kiln adds no files to the repository and makes no commits of its own. Its settings, session records and output live outside the repository, on the person's machine.
- [ ] **AC-GIT-04 — The worktree is kept.** Kiln leaves a PRD's worktree in place after the last phase, and says it is there until the person removes it.

### Finish With One Pull Request

When every leaf is closed, Kiln finishes with a single pull request for the whole feature, opened by a session and ready for a person to review.

- [ ] **AC-PR-01 — A final session opens the pull request.** Once every leaf is closed, Kiln starts one more session, authorized to open one pull request from the feature branch into the base branch. That session may not merge it or touch other branches.
- [ ] **AC-PR-02 — Kiln confirms the pull request exists.** The PRD counts as complete only after Kiln confirms that a pull request from the feature branch into the base branch exists. If it can't confirm one, Kiln goes to Needs you like any other stop.
- [ ] **AC-PR-03 — Kiln stops at "PR ready for review".** Kiln doesn't merge the pull request, wait on CI to merge it, or deploy anything.
- [ ] **AC-PR-04 — The Complete screen is the progress screen, finished.** It shows the phase plan, all done, and the pull request:
  - the pull request's number, title, branches and link, with its commit count and lines added and removed;
  - the total time and when it finished;
  - every phase with its pushed commit and how long it took, marking the phases the person finished themselves, each with its Details (AC-WATCH-01), followed by the final pull-request session;
  - the agent, and the worktree with a note that Kiln keeps it until the person removes it.

### Watch Kiln While It Works

The person can see how far Kiln has got, what the current session is doing, and what has been pushed, without interrupting anything. Progress is for display only and never decides whether a phase is done.

- [ ] **AC-WATCH-01 — Every phase is listed with its state.** The phase list shows every phase in plan order, all at the same level (a split phase's children are not indented), with its number, its phase document's file name, and its title taken word for word from that document. Each phase shows its state: Planned, Implementing, Done, Needs you, or split into its children. A Done phase shows its pushed commit and how long it took. Each phase that has run has a Details section, collapsed until the person opens it, showing when it ran, the model and effort level it ran with, its worktree, its branch, its commits and its session ID.
- [ ] **AC-WATCH-08 — The current phase is always at the top.** The phase being implemented is shown in a full-width panel above the phase plan, so a long plan never pushes it out of sight: its number and title, when it started, its progress steps (AC-WATCH-02), the last thing seen in the session, its latest output line, a link to its live output, and its own Details.
- [ ] **AC-WATCH-09 — The person can see which Claude account is working and how close it is to its limits.** Documents found, Running and Paused show the signed-in Claude account (email and plan) and its usage limits: the 5-hour window, the weekly limit, and any per-model limit Claude Code reports (such as a weekly Fable limit), each with the percent used and when it resets. Kiln refreshes them every 5 minutes while it is open and again just before each phase starts, using Claude Code's own usage report, which spends none of the person's usage. Each shows how long ago it was updated. A limit at 80% or more turns amber and suggests pausing after the current phase to switch accounts. The next phase always uses whichever account is signed in when it starts.
- [ ] **AC-WATCH-02 — The current phase shows its progress steps.** The current phase shows six steps, in the order the Enso Method runs them: Build, Deliverable review, Test hardening, Commit, Refactor pass and Push. A step starts when the session is seen doing it: starting `implement-from-requirements`, calling the `deliverable-review`, `test-hardening` or `refactor-pass` skill, running its first `git commit`, or running `git push`. A refactor commit, when `refactor-pass` makes one, belongs to the Refactor pass step, and the push sends it with the feature commit. A step counts as finished once the next one starts. A step the session never visibly calls stays unreached, and Kiln doesn't fill it in.
- [ ] **AC-WATCH-03 — Session output is shown live.** For the current session, the person can watch Claude's text as it is written, each tool call and its result, and the reviewer subagent's messages labeled as the reviewer's. Every line is timestamped, and earlier output can be loaded.
- [ ] **AC-WATCH-04 — The phase detail identifies the session.** The phase detail shows the session ID, the model and effort level, the start time and elapsed time, and the commits made for the phase so far.
- [ ] **AC-WATCH-05 — Settings are shown apart from per-phase facts.** While Kiln is working, the browser view shows the PRD's settings: agent, model and effort level for the next session, keep-awake, and where Kiln stops, with the worktree and branches marked as fixed for the PRD. Facts that belong to a phase (worktree, branch, commits, times, session) are shown with that phase, not with the settings.
- [ ] **AC-WATCH-06 — A stopped session's full output can be read.** Every session's full output is saved on the person's machine, outside the repository, and the Needs you screen links to it.
- [ ] **AC-WATCH-07 — Nothing claims evidence for acceptance criteria.** Kiln shows no status of its own saying an acceptance criterion is met or tested. Any such claim on screen is the session's own output, shown as session output.

### Start It in the Terminal, Control It From the Browser

The terminal only starts Kiln and hosts it. Everything the person does after that, they do in the browser view.

- [ ] **AC-CLI-01 — `kiln run` always means "move this feature forward".** The same command is used the first time, after Ctrl+C, after a restart, after a Needs you is resolved, and after the person fixes something in the workspace. Each time it works out where the feature really stands from the phase documents, Git and its own record, then does the right next thing: show Documents found for a feature not started, start the next phase, resume an interrupted session (AC-KEEP-04), or run the done check on a stopped phase. Phases already done are never redone, and there is no separate resume command. If Kiln is already running the feature, `kiln run` says so, gives the browser view's address and starts nothing.
- [ ] **AC-CLI-07 — `kiln run` is the only command.** Kiln has no other commands in v1: no separate commands for status, logs, pausing, or running a single phase. In the terminal, the only other control is Ctrl+C (AC-KEEP-02).
- [ ] **AC-VIEW-01 — The browser view is local only.** The browser view can be reached only from the same machine, never from another computer on the network.
- [ ] **AC-VIEW-02 — The browser view is where Kiln is controlled.** It offers Start (on Documents found, and to continue after a pause), Pause after this phase, and Check again. Pause after this phase lets the current session finish its phase, including its commit and push, and the done check runs; no further phase starts until the person presses Start. Session output is read in the browser view.
- [ ] **AC-VIEW-03 — The browser view stays current.** The browser view updates on its own while Kiln works, without a reload, and shows when it was last updated.
- [ ] **AC-VIEW-04 — The browser view lasts as long as `kiln run`.** While `kiln run` is running for a feature, its browser view works, including while Kiln is stopped at Needs you, paused or complete, so Check again and Start work from the browser.
- [ ] **AC-VIEW-05 — Other web pages can't use Kiln.** A page from any other site, open in the same browser, can neither read Kiln's state or output nor press Kiln's controls. The person never has to log in or handle a key to use the browser view.
- [ ] **AC-VIEW-07 — Model, effort and keep-awake can change between phases; the worktree and branches can't.** While Kiln is working or paused, the person can change the model and effort level in the browser view; a change applies to every session Kiln starts after it, and the session already working keeps what it started with. Keep-awake can be switched on or off at any time and applies at once. The worktree, feature branch and base branch are fixed once the first phase starts, because every phase builds on the code the earlier phases left on that branch; the view says so.
- [ ] **AC-VIEW-06 — The browser view shows whether Kiln is still there.** Every screen shows whether it is connected to the running Kiln. When Kiln has stopped (Ctrl+C, a closed terminal, a restart), the view says plainly that it is disconnected, that nothing is running, and that `kiln run` picks up where it left off; it never keeps showing Kiln as live when it isn't.

### Run Several PRDs at Once

Phases within one PRD run one at a time, but a person can have several PRDs moving at once, in the same repository or in different ones, each from its own `kiln run`.

- [ ] **AC-MULTI-01 — Several PRDs at once.** Several `kiln run` instances can run at the same time on one machine, each in its own terminal, each moving a different PRD forward one phase at a time. The PRDs can be in the same repository or in different ones.
- [ ] **AC-MULTI-02 — Each PRD has its own browser view.** Every instance serves its own browser view at its own address, prints that address in its terminal, and never takes over another instance's address. Each browser tab's title names its feature, so tabs for different PRDs can be told apart.
- [ ] **AC-MULTI-03 — PRDs don't touch each other's work.** Each PRD's sessions work only in its own worktree and feature branch (AC-START-06), so two PRDs in one repository never change each other's files or branches.
- [ ] **AC-MULTI-04 — One PRD, one Kiln.** A PRD can be run by only one instance at a time; a second `kiln run` for the same PRD says it is already running and gives its address (AC-CLI-01).

### Survive Interruptions Without Losing Work

Working through a PRD can take many hours, but each phase is its own session, so an interruption costs at most the phase in progress, and usually not even that. Kiln runs in the terminal it was started from; it doesn't install a background service. In exchange, any interruption is cheap: `kiln run` picks the work back up where it was.

- [ ] **AC-KEEP-01 — Kiln lives in its terminal.** `kiln run` stays in the foreground of its terminal until the person presses Ctrl+C or closes the terminal, including after the pull request is ready. Pressing Ctrl+C or closing that terminal interrupts Kiln. Kiln installs no background or system service. Closing the browser has no effect on Kiln.
- [ ] **AC-KEEP-02 — Ctrl+C is a controlled interruption.** On Ctrl+C, Kiln ends the current session's turn so the session stays resumable, records which phase and session were interrupted, and exits leaving no Claude Code process behind.
- [ ] **AC-KEEP-03 — Interrupted work is never thrown away.** Changed and new files, partly written tests and uncommitted work in an interrupted phase stay exactly as they were. Kiln never starts a fresh session on top of them on its own.
- [ ] **AC-KEEP-04 — `kiln run` resumes an interrupted session.** When the phase in progress was interrupted, the next `kiln run` first runs the done check. If it passes, the phase is Done. If not, Kiln resumes that same session, with its full history, and tells it the session was interrupted and to carry on with the phase. Kiln resumes only sessions it recorded as interrupted; a session that ended on its own goes to Needs you as before.
- [ ] **AC-KEEP-05 — A session that can't be resumed comes to the person.** If an interrupted session can't be resumed, for example because its transcript is gone, the phase goes to Needs you with the fresh-session prompt (AC-STOP-06).
- [ ] **AC-KEEP-06 — Kiln keeps the computer awake while it works.** While a phase's session is working, Kiln stops the computer from going to sleep when idle. This is on by default and can be turned off in the PRD's settings. Kiln lets the computer sleep again whenever no session is working: at Needs you, when paused, when complete, and when Kiln exits.
- [ ] **AC-KEEP-07 — Kiln is honest about sleep.** Where keep-awake is shown, Kiln says it prevents idle sleep only, and that closing a laptop's lid may still put the computer to sleep. A sleep that ends the session is recovered like any other interruption (AC-KEEP-04).

### Install It With One Command

Kiln's users already run Claude Code from a terminal, so Kiln installs the way their other developer tools do.

- [ ] **AC-INSTALL-01 — One package, one command.** Kiln installs from npm as a single package with one command. That one install includes the `kiln` command and the browser view.
- [ ] **AC-INSTALL-02 — Nothing runs outside the person's machine.** Kiln has no account, server or cloud service of its own. Apart from what Claude Code and Git already do, nothing Kiln handles leaves the person's machine.
- [ ] **AC-INSTALL-03 — macOS and Linux.** v1 runs on macOS and Linux. Windows is not supported in v1.

### Look and Read Like the Design

The v1 mockups are the design of record. The rules below hold on every screen.

- [ ] **AC-LOOK-01 — The screens match the v1 mockups.** These screens match their mockups in `docs/design/mockups/` for layout, copy, colors and type, with no exceptions: terminal, Documents found, Running, Paused, Disconnected, Phase detail live, both Needs you screens and Complete.
- [ ] **AC-LOOK-02 — The feature name is the largest text on every screen.**
- [ ] **AC-LOOK-07 — Every screen says where it is and whose it is.** Above the feature name, every browser screen labels the repository (its name, taken from the Git repository's top-level folder) and the PRD folder (its path from the repository root), without assuming anything about how the person arranges their folders. The top bar carries the Kiln mark on the left and, on the right, the connection status and the Enso Method mark, since Kiln runs only Enso Method PRDs.
- [ ] **AC-LOOK-03 — Phase numbers and titles stay put.** Phase titles come from the phase documents word for word. A phase's number stays in its circle in every state.
- [ ] **AC-LOOK-04 — Color means one thing.** A single red accent marks the phase in progress, amber means it needs the person, and green with a check means Done. The look is the Enso Method website's dark theme: Instrument Serif headings, Inter body text, and JetBrains Mono for code.

### Proven on a Real Feature

The release is accepted in real use, not only on tests of its parts.

- [ ] **AC-PROOF-01 — A small real feature runs end to end.** A real feature of three to five phases runs from `kiln run` to "PR ready for review". It includes one phase that splits itself, one stop that the person finishes through the resume command before continuing with Check again, and one Ctrl+C partway through a phase that `kiln run` then resumes to completion.
- [ ] **AC-PROOF-02 — Sessions stay on Kiln's branch.** In that test, every session works only on the PRD's worktree and feature branch. This holds even where the person's own instructions or the method's parallel-session rule would otherwise tell it to work elsewhere.

## Out of Scope

Anything this PRD doesn't describe. Ideas for later versions are kept in [Kiln ideas after v1](../../design/kiln-after-v1-ideas.md), not here.

## Depends On

The criteria rely on Claude Code features that were checked on September 30, 2026 against Claude Code 2.1.286's help text and documentation, but haven't yet been tried for real. These are: starting an unattended session with an ID chosen in advance, streaming its output live, refusing prompts with no one there, reopening an unattended session with `claude --resume`, and continuing an interrupted one headlessly with `claude -p --resume`. The account comes from `claude auth status --json`, and usage limits from running `/usage` headlessly, whose structured `usage_report` the Agent SDK documents as experimental, so its shape may change. The architecture proposal's proof gates 1 to 3 try them. If one doesn't work as documented, the criteria that depend on it come back as product decisions, not silent workarounds.

The mockups also assume the repository is hosted on GitHub, where the pull request opens ("Open on GitHub" on the Complete screen). v1 supports GitHub-hosted repositories only.

## Questions This PRD Leaves Open

Still open, and the criteria above hold whichever way it is answered:

1. The default permission mode for unattended sessions (proposal open question 3).

The technical design settles the rest; the architecture proposal lists them under "Left to the technical design".
