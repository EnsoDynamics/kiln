# PRD: Kiln v1

**Inputs:** [Kiln architecture proposal](../../design/kiln-architecture-proposal.md) (settled decisions), [Kiln interface scenarios](../../design/kiln-interface-scenarios.md) and the v1 [mockups](../../design/mockups/) (the design of record). Out of scope, for reference only: [Kiln ideas after v1](../../design/kiln-after-v1-ideas.md).

## Summary

Kiln v1 runs the implementation half of the Enso Method without a person sitting in the loop. You point it at a PRD that has already been refined and split into phases. Kiln then implements the phases one at a time, in plan order, each in a fresh unattended Claude Code session. After each session it checks in Git that the phase actually landed before it starts the next one. The run ends with one pull request for the whole feature, ready for human review. When a phase doesn't land, Kiln stops and hands that exact session back to you, along with what the session said last.

You start Kiln from a command line, where it stays running while it works, and you watch and control it in a browser view served from your own machine. If the run is interrupted (Ctrl+C, a closed terminal, a restart, a sleeping laptop), running the same command again picks it back up without losing work.

## Business Context

Today a person runs this loop by hand. They start a session with `implement-from-requirements`, watch it, say "commit and push", paste the continuation prompt into a new chat, and repeat. A plan of a dozen one-hour phases means a dozen interruptions spread across a day, and the plan can't run overnight. Kiln removes that babysitting. The person is needed only when a phase doesn't land and at the end, to review the PR.

These settled decisions from the architecture proposal shape everything below:

- **The Enso Method stands alone.** Everything Kiln does, a person can do by hand with the same skills. Kiln needs no change to any Enso Method skill, and it writes nothing into the repository that the skills don't already write.
- **Kiln doesn't interpret a session.** Whether a phase is done comes from three facts in Git and the phase documents (see "the done check" below). Anything else goes back to the person with what the session said, never with a cause Kiln guessed.
- **Assumptions are green lights.** Nothing in a run waits on stakeholder feedback. Unconfirmed assumptions are reported at the end as information.
- **Kiln owns the order and the visibility; the session owns the engineering.** Implementation, review, test hardening, commits, pushes and the PR all happen inside the sessions, through the skills, the same way they do by hand.

### Terms used in this PRD

- A **phase** is one session-sized slice of the PRD, described in its own phase document. A phase that was cut further has a `## Split into` table and is a **split parent**. A phase with no such table is a **leaf**, and only leaves are implemented.
- A leaf is **closed** when its phase document has a `**Closed:**` line under its title. The implement session writes that line when the phase lands.
- A **run** is Kiln implementing one feature, from its first unclosed leaf through to the PR.
- The **done check** is the three-part test Kiln applies after every session: the phase is closed, everything is committed, and everything is pushed.
- **Needs you** is the state a run enters when a phase fails the done check.
- A session is **interrupted** when Kiln stops while the session is still working: Ctrl+C, a closed terminal, `kiln pause --now`, a restart, or sleep. Kiln knows this from its own record that the session was running and never finished. It is different from a session that **ended on its own**, finished or crashed, which Kiln judges with the done check.
- The **session marker** is the log a session keeps in `.agent-sessions/` in the shared checkout. Its **DONE line** names how the session ended, for example `Blocked — vendor API credentials expired`.

## Acceptance Criteria

### Start a Run From a Refined PRD

One command enrolls a feature and starts it. Before the first session starts, Kiln shows what it found, refuses a plan it can't follow, and shows exactly what the run is allowed to do.

- [ ] **AC-START-01 — One command starts a run.** `kiln run <PRD file or its directory>` enrolls the feature and starts its run. The same command is used every later time too (AC-CLI-01).
- [ ] **AC-START-02 — Kiln shows what it found beside the PRD.** For the PRD: its acceptance-criteria count and label range. For the technical design: how many of the PRD's acceptance criteria it cites. For assumptions: how many there are and how many still await stakeholder feedback, labeled as green lights that nothing waits on. For the phase plan: how many phase documents there are, how many leaves will be implemented, and which phases are split and into what.
- [ ] **AC-START-03 — Kiln won't start a plan it can't follow.** Kiln refuses to start, and names the problem and the document it is in, when the PRD's directory has no phase documents, when any leaf cites no acceptance criteria, when any phase depends on a phase later in the plan, or when the checkout the run starts from has uncommitted changes.
- [ ] **AC-START-04 — The person confirms the documents were refined.** Kiln can't tell from the files whether the documents have been through requirements refinement, because that workflow deletes its working file when it finishes. It says so, and it doesn't start a feature's first session until the person confirms they have, from the browser view or the command line.
- [ ] **AC-START-05 — The run's settings are shown and can be changed before starting.** These are shown: the new worktree's path, the feature branch and the base branch it starts from, the agent and model, when pushes happen, where the run ends, and whether Kiln keeps the computer awake. Before Start, the person can change the worktree path, the feature branch, the base branch, the model and keep-awake. In v1 the agent is always Claude Code, pushes always happen after every phase, and the run always ends at "PR ready for review". Kiln won't merge.
- [ ] **AC-START-06 — One feature branch and one worktree for the whole PRD.** Kiln creates one new feature branch from the base branch, and one worktree for it, before the first session. Every phase's session works in that same worktree and commits and pushes to that same branch, each phase building on the one before. Phases never get their own branches, worktrees or pull requests. A later `kiln run` for the same feature, after an interruption or a stop, reuses them. The final pull request, the only one, goes from that branch into the base branch. The base branch is `develop` by default, following Git flow (`develop` deploys to a dev environment, `main` to production, and features branch off `develop`); when the repository has no `develop`, it is the repository's default branch. The person can change it before Start. A run never works in the person's own checkout or directly on a shared branch.
- [ ] **AC-START-07 — The person sees what the run is allowed to do.** Before Start, Kiln shows what the run allows: commits and pushes to the feature branch, and one pull request into the base branch once every phase closes. It also shows what is not allowed: merging, deploying anywhere, and touching other branches.
- [ ] **AC-START-08 — Settings are remembered.** Running `kiln run` again on an enrolled feature reuses its recorded settings without asking for them again.
- [ ] **AC-START-09 — The terminal confirms the start.** When a run starts, the command line prints the feature name, its phases with their titles, the workspace and branch, where the run ends, and the browser view's address. It also says that keep-awake is on or off, that the run works in this terminal so it should stay open, that Ctrl+C interrupts the run and `kiln run` picks it back up, and that `kiln pause` stops the run after the current phase.

### Implement Each Phase in Its Own Unattended Session

Kiln does the job of the person who starts each session, gives it permission to commit, and moves on to the next phase. The engineering stays inside the session, done by the Enso Method skills exactly as they are.

- [ ] **AC-RUN-01 — Phases run in plan order, one at a time.** The next phase is the method's own choice: walk the plan in order, through any `## Split into` tables, to the first leaf without a `**Closed:**` line. A run never has two sessions working at once.
- [ ] **AC-RUN-02 — Each phase gets a fresh session.** Each leaf is implemented by a new, unattended Claude Code session started in the run's workspace, with the model from the run's settings.
- [ ] **AC-RUN-03 — The session gets the authorization a person would give.** Each session is told to:
  - run `implement-from-requirements` on that leaf's phase document;
  - work only in the run's workspace and on its feature branch, without switching branches or creating another worktree;
  - commit and push to the feature branch, and run `refactor-pass` after the feature commit;
  - open no pull request, merge nothing and touch no other branch;
  - treat the phase as finished when its phase document has its Closed line and everything is committed and pushed.
- [ ] **AC-RUN-04 — A phase that splits itself is followed.** Kiln re-reads the plan after every session. When a session split its own phase, the run carries on with the next unclosed leaf, and the person does nothing special.
- [ ] **AC-RUN-05 — A session never waits for an answer.** A session runs with no one there to answer permission prompts or questions. Anything that would ask is refused instead of waiting, so a session never hangs waiting for a person. A session that needs to ask a question ends, its question becomes its last message, and the phase goes to Needs you.
- [ ] **AC-RUN-06 — The Enso Method skills are used unchanged.** Kiln works with the skills as published. It requires no edit to any skill, and everything it tells a session is something a person could type by hand.

### Check in Git That Each Phase Landed

A phase counts as done only when Git and the phase document say so. How the session ended, and what it claimed, doesn't count.

- [ ] **AC-DONE-01 — Done means three checks pass.** After every session, a phase is Done only when all three checks pass:
  - **Closed:** the leaf Kiln launched has its `**Closed:**` line. If the session split that leaf, the leaf's first child has its Closed line instead.
  - **Committed:** the run's workspace has no uncommitted changes.
  - **Pushed:** the feature branch and its copy on `origin` point at the same commit.

  Otherwise the phase is Needs you.
- [ ] **AC-DONE-02 — Exit codes and messages don't decide.** A session that exits cleanly saying it finished, but fails a check, is Needs you. A session that crashed, but whose work passes all three checks, is Done.
- [ ] **AC-DONE-03 — The same check runs everywhere.** It is the same check after every session, when the person presses Check again, when `kiln run` is run on a stopped feature, and when `kiln run` picks up an interrupted phase.
- [ ] **AC-DONE-04 — No model judges how a session ended.** Kiln makes no model call to decide or explain how a session ended. It needs no credential beyond the person's own Claude Code login.

### Hand a Stopped Phase Back With What the Session Said

When a phase fails the done check, the run stops and gives the person everything needed to finish that phase themselves, then continues once they have.

- [ ] **AC-STOP-01 — The run stops and doesn't retry.** When a phase is Needs you, no later phase starts and Kiln doesn't rerun the phase on its own. (An interrupted session is a different case: Kiln resumes it, per AC-KEEP-04.)
- [ ] **AC-STOP-02 — The person sees how the session ended, word for word.** The Needs you screen shows:
  - the session's last assistant message, verbatim;
  - the session marker's DONE line, when the session wrote one;
  - the exit code and the time the session stopped;
  - the last skill seen in the session;
  - when the session ended without a final message, its last lines of output, errors included.
- [ ] **AC-STOP-03 — The person sees which checks failed and why.** Each of the three checks shows whether it passed, with the specific fact behind it. Examples: "No Closed line in phase-2b-store-credit.md", "12 files changed, not committed", "a41c9e2 isn't on origin yet".
- [ ] **AC-STOP-04 — Kiln never guesses a cause or invents a question.** Nothing on any screen, notification or command-line output gives a reason for a stop that Kiln inferred. Anything said about why a phase stopped is the session's own words.
- [ ] **AC-STOP-05 — The person can reopen the exact session.** Kiln shows a copyable command, `cd <workspace> && claude --resume <session ID>`. It opens that session in a terminal with its full history.
- [ ] **AC-STOP-06 — A fresh-session prompt is there when the session can't be opened.** The Needs you screen also offers a copyable prompt for a fresh session that points at the phase document, for when the session can't be reopened, for example because its transcript is gone.
- [ ] **AC-STOP-07 — Check again continues the run.** After the person finishes the phase by any means, Check again in the browser view or `kiln run` at the command line runs the done check. When it passes, the phase shows as Done, finished by the person, and the next phase starts. When it fails, the phase stays Needs you with the updated check results.
- [ ] **AC-STOP-08 — Nothing starts while the person may be in the stopped session.** After a stop, Kiln starts no session for that run until the person presses Check again or runs `kiln run`.

### Leave the Git Work to the Sessions

Kiln reads Git but doesn't repair it. Every change to the repository's history comes from a session the person can see and resume.

- [ ] **AC-GIT-01 — Kiln sets up the worktree, and does nothing more.** Kiln creates the worktree and the feature branch from the base branch before the first session starts. Apart from that setup, Kiln changes no Git state.
- [ ] **AC-GIT-02 — Kiln never does destructive Git operations.** Kiln never resets, stashes, cleans, force-pushes or deletes branches, in any situation. A workspace left with uncommitted changes after a stop stays that way until the person resolves it.
- [ ] **AC-GIT-03 — Kiln adds nothing to the repository.** Kiln adds no files to the repository and makes no commits of its own. Its settings, session records and output live outside the repository, on the person's machine.
- [ ] **AC-GIT-04 — The worktree is kept.** Kiln leaves a run's worktree in place after the run ends, and says it is there until the person removes it.

### Finish With One Pull Request

When every leaf is closed, the run ends with a single pull request for the whole feature, opened by a session and ready for a person to review.

- [ ] **AC-PR-01 — A final session opens the pull request.** Once every leaf is closed, Kiln starts one more session, authorized to open one pull request from the feature branch into the base branch. That session may not merge it or touch other branches.
- [ ] **AC-PR-02 — Kiln confirms the pull request exists.** The run counts as complete only after Kiln confirms that a pull request from the feature branch into the base branch exists. If it can't confirm one, the run goes to Needs you like any other stop.
- [ ] **AC-PR-03 — The run ends at "PR ready for review".** Kiln doesn't merge the pull request, wait on CI to merge it, or deploy anything.
- [ ] **AC-PR-04 — The Complete screen sums up the run.** It shows:
  - the pull request's number, title, branches and link, with its commit count, lines added and removed, and its CI status at the time;
  - the run's total time and when it finished;
  - every phase with its pushed commit and how long it took, marking the phases the person finished themselves, followed by the final pull-request session;
  - how many times the run needed the person;
  - how many sessions ran;
  - where the worktree is.
- [ ] **AC-PR-05 — Unconfirmed assumptions are listed as information.** The Complete screen lists every assumption still awaiting stakeholder feedback, with its ID and statement. It says that nothing waited on them and that feedback can come after the merge.

### Watch a Run While It Works

The person can see where the run is, what the current session is doing, and what has been pushed, without interrupting anything. Progress is for display only and never decides whether a phase is done.

- [ ] **AC-WATCH-01 — Every phase is listed with its state.** The phase list shows every phase with its number, its phase document's file name, and its title taken word for word from that document. Each phase shows its state: Planned, Implementing, Done, Needs you, or split into its children. A Done phase shows its pushed commit and how long it took.
- [ ] **AC-WATCH-02 — The current phase shows its progress steps.** The current phase shows six steps: Build, Deliverable review, Test hardening, Commit, Refactor pass and Push. A step starts when the session is seen doing it: starting `implement-from-requirements`, calling the `deliverable-review`, `test-hardening` or `refactor-pass` skill, running `git commit`, or running `git push`. A step counts as finished once the next one starts. A step the session never visibly calls stays unreached, and Kiln doesn't fill it in.
- [ ] **AC-WATCH-03 — Session output is shown live.** For the current session, the person can watch Claude's text as it is written, each tool call and its result, and the reviewer subagent's messages labeled as the reviewer's. Every line is timestamped, and earlier output can be loaded.
- [ ] **AC-WATCH-04 — The phase detail identifies the session.** The phase detail shows the phase document, the acceptance-criteria labels it covers, the session ID, the model, the start time and elapsed time, and the commits made for the phase so far.
- [ ] **AC-WATCH-05 — The run summary is always visible.** While a run is in progress, the browser view shows the agent and model, the workspace, the feature branch, the number of commits pushed and the latest one, where the run ends, and when it started.
- [ ] **AC-WATCH-06 — Every session's full output is kept.** Every session's full output is saved on the person's machine, outside the repository. It stays viewable after the session and the run end.
- [ ] **AC-WATCH-07 — Nothing claims evidence for acceptance criteria.** Kiln shows no status of its own saying an acceptance criterion is met or tested. Any such claim on screen is the session's own output, shown as session output.

### Use It From the Terminal or the Browser

The command line and the browser view show the same state and offer the same controls, so the person can use whichever is at hand.

- [ ] **AC-CLI-01 — `kiln run` always means "move this feature forward".** The same command is used the first time, after Ctrl+C, after a restart, after a Needs you is resolved, and after the person fixes something in the workspace. Each time it works out where the feature really stands from the phase documents, Git and its own record, then does the right next thing: start the next phase, resume an interrupted session (AC-KEEP-04), or run the done check on a stopped phase. Phases already done are never redone, and there is no separate resume command. If Kiln is already running the feature, `kiln run` says so and starts nothing.
- [ ] **AC-CLI-02 — `kiln status` summarizes every enrolled feature.** For each feature it shows the phase being implemented (number and title), the agent, the last skill seen and how long ago, how many phases are done, implementing, planned and needing the person, and how many commits have been pushed.
- [ ] **AC-CLI-03 — `kiln open` opens the browser view.**
- [ ] **AC-CLI-04 — `kiln logs` shows session output.** `kiln logs` prints the output of the current or most recent session, and `kiln logs --follow` keeps printing it as it is written.
- [ ] **AC-CLI-05 — `kiln pause` stops after the current phase.** The current session finishes its phase, including its commit and push, and the done check runs. No further phase starts until the person continues the run with Start or `kiln run`.
- [ ] **AC-CLI-06 — `kiln pause --now` stops the current session now.** The session's current turn ends immediately and the session stays resumable. The phase counts as interrupted, and continuing the run resumes that session (AC-KEEP-04).
- [ ] **AC-VIEW-01 — The browser view is local only.** The browser view can be reached only from the same machine, never from another computer on the network.
- [ ] **AC-VIEW-02 — The browser view has the same state and controls.** It shows the same state as the command line and offers Start, Pause after this phase, and Check again. Each does the same as its command-line counterpart.
- [ ] **AC-VIEW-03 — The browser view stays current.** The browser view updates on its own while a run progresses, without a reload, and shows when it was last updated.
- [ ] **AC-VIEW-04 — The browser view lasts as long as `kiln run`.** While `kiln run` is running for a feature, its browser view works, including while the run is stopped at Needs you, paused or complete, so Check again and Start work from the browser.
- [ ] **AC-VIEW-05 — Other web pages can't use Kiln.** A page from any other site, open in the same browser, can neither read a run's state or output nor press Kiln's controls. The person never has to log in or handle a key to use the browser view.

### Survive Interruptions Without Losing Work

A run can last many hours, but each phase is its own session, so an interruption costs at most the phase in progress, and usually not even that. Kiln runs in the terminal it was started from; it doesn't install a background service. In exchange, any interruption is cheap: `kiln run` picks the work back up where it was.

- [ ] **AC-KEEP-01 — A run lives in its terminal.** `kiln run` stays in the foreground of its terminal for the whole run. Pressing Ctrl+C or closing that terminal interrupts the run. Kiln installs no background or system service. Closing the browser has no effect on the run.
- [ ] **AC-KEEP-02 — Ctrl+C is a controlled interruption.** On Ctrl+C, Kiln ends the current session's turn so the session stays resumable, records which phase and session were interrupted, and exits leaving no Claude Code process of the run behind.
- [ ] **AC-KEEP-03 — Interrupted work is never thrown away.** Changed and new files, partly written tests and uncommitted work in an interrupted phase stay exactly as they were. Kiln never starts a fresh session on top of them on its own.
- [ ] **AC-KEEP-04 — `kiln run` resumes an interrupted session.** When the phase in progress was interrupted, the next `kiln run` (or Start) first runs the done check. If it passes, the phase is Done. If not, Kiln resumes that same session, with its full history, and tells it the session was interrupted and to carry on with the phase. Kiln resumes only sessions it recorded as interrupted; a session that ended on its own goes to Needs you as before.
- [ ] **AC-KEEP-05 — A session that can't be resumed comes to the person.** If an interrupted session can't be resumed, for example because its transcript is gone, the phase goes to Needs you with the fresh-session prompt (AC-STOP-06).
- [ ] **AC-KEEP-06 — Kiln keeps the computer awake while it works.** While a phase's session is working, Kiln stops the computer from going to sleep when idle. This is on by default and can be turned off for a run in its settings or from the command line. Kiln lets the computer sleep again whenever no session is working: at Needs you, when paused, when complete, and when Kiln exits.
- [ ] **AC-KEEP-07 — Kiln is honest about sleep.** Where keep-awake is shown, Kiln says it prevents idle sleep only, and that closing a laptop's lid may still put the computer to sleep. A sleep that ends the session is recovered like any other interruption (AC-KEEP-04).
- [ ] **AC-KEEP-08 — Git and the phase documents are the record.** If Kiln's own records are lost, `kiln run` still finds the next unclosed leaf and continues. Only the old session output, and the ability to resume an interrupted session automatically, are lost.

### Install It With One Command

Kiln's users already run Claude Code from a terminal, so Kiln installs the way their other developer tools do.

- [ ] **AC-INSTALL-01 — One package, one command.** Kiln installs from npm as a single package with one command. That one install includes the command line and the browser view.
- [ ] **AC-INSTALL-02 — Nothing runs outside the person's machine.** Kiln has no account, server or cloud service of its own. Apart from what Claude Code and Git already do, nothing Kiln handles leaves the person's machine.
- [ ] **AC-INSTALL-03 — macOS and Linux.** v1 runs on macOS and Linux. Windows is not supported in v1.

### Tell the Person Only When They're Needed

Notifications are for stops and for the finished PR. Routine progress stays quiet.

- [ ] **AC-NOTIFY-01 — Every stop notifies.** Whenever a phase ends without being done, for whatever reason, Kiln sends a notification on the person's machine. It names the feature and phase, says the phase ended before it was done, and quotes the opening of the session's last message word for word.
- [ ] **AC-NOTIFY-02 — A ready PR notifies.** When the pull request is confirmed, Kiln sends a notification with the feature, the pull request number, a note that every phase is done, and how many assumptions still await stakeholder feedback.
- [ ] **AC-NOTIFY-03 — Routine phase changes don't notify.** A phase starting or finishing successfully sends no notification.

### Look and Read Like the Design

The v1 mockups are the design of record. The rules below hold on every screen.

- [ ] **AC-LOOK-01 — The screens match the v1 mockups.** These screens match their mockups in `docs/design/mockups/` for layout, copy, colors and type, apart from the differences in AC-LOOK-05 and AC-LOOK-06: terminal kickoff, Documents found, Running, Phase detail live, both Needs you screens, Notifications and Complete.
- [ ] **AC-LOOK-02 — The feature name is the largest text on every screen.**
- [ ] **AC-LOOK-03 — Phase numbers and titles stay put.** Phase titles come from the phase documents word for word. A phase's number stays in its circle in every state.
- [ ] **AC-LOOK-04 — Color means one thing.** A single red accent marks the phase in progress, amber means it needs the person, and green with a check means Done. The look is the Enso Method website's dark theme: Instrument Serif headings, Inter body text, and JetBrains Mono for code.
- [ ] **AC-LOOK-05 — After-v1 content is left out.** v1 screens leave out everything the mockups show for after v1: the preflight step and its Run preflight button (Documents found leads straight to Start), Codex desktop as a phase's agent and any "Kiln stops before this phase" notice, the "Ready for Codex desktop" notification, Codex desktop handoffs in the Complete screen's summary, and Change controls on settings that have only one choice in v1 (when pushes happen, and where the run ends). A phase that needs a native desktop app stops and goes to Needs you like any other stop.
- [ ] **AC-LOOK-06 — Where a mockup summarizes the session, v1 doesn't.** Two mockups put Kiln's own summary of the session's last message on screen: the Needs you notification ("a critical finding about a migration clash") and the Needs you screen's "Finish the phase" step ("Here, that means resolving the migration clash"). Kiln can't write either without interpreting the session (AC-STOP-04, AC-DONE-04). In v1 the notification quotes the message instead (AC-NOTIFY-01). The "Finish the phase" step uses the same wording for every stop, and may name the checks still failing.

### Proven on a Real Feature

The release is accepted on a real run, not only on tests of its parts.

- [ ] **AC-PROOF-01 — A small real feature runs end to end.** A real feature of three to five phases runs from `kiln run` to "PR ready for review". The run includes one phase that splits itself, one stop that the person finishes through the resume command before continuing with Check again, and one Ctrl+C partway through a phase that `kiln run` then resumes to completion.
- [ ] **AC-PROOF-02 — Sessions stay on Kiln's branch.** In that run, every session works only on the run's workspace and feature branch. This holds even where the person's own instructions or the method's parallel-session rule would otherwise tell it to work elsewhere.

## Out of Scope

Recorded with their reasoning in [Kiln ideas after v1](../../design/kiln-after-v1-ideas.md):

- running independent phases in parallel;
- the computer-use preflight and the Codex desktop handoff;
- Codex as an unattended agent;
- a mode that holds each phase for the person's review before commit;
- merging the final pull request;
- a desktop app;
- a model-written "why it stopped" headline;
- a background or system service that keeps runs going without a terminal;
- Windows support.

Never part of Kiln: delivery across several repositories, production deploys, Git repair done by Kiln itself, and reading older plan formats.

## Depends On

The criteria rely on Claude Code features that were checked on September 30, 2026 against Claude Code 2.1.286's help text and documentation, but haven't yet been tried in a live run. These are: starting an unattended session with an ID chosen in advance, streaming its output live, refusing prompts with no one there, and reopening an unattended session with `claude --resume`. The architecture proposal's proof gates 1 to 3 try them. If one doesn't work as documented, the criteria that depend on it come back as product decisions, not silent workarounds.

The mockups also assume the repository is hosted on GitHub, where the pull request opens and its CI status is read ("Open on GitHub" on the Complete screen). v1 supports GitHub-hosted repositories only.

## Questions This PRD Leaves Open

Decided on October 11, 2026, and no longer open: v1 is a command line plus a local browser view, with a desktop app possible later (proposal open question 1); Kiln is TypeScript, installed as one npm package (open question 2); v1 runs on macOS and Linux; every run works in its own new worktree and feature branch, off `develop` by default (open question 4, AC-START-06).

Still open, and the criteria above hold whichever way they are answered:

1. The default permission mode for unattended sessions (proposal open question 3).
2. Whether two features' runs can be in progress at once on one machine. v1 runs one feature at a time, but `kiln status` lists every enrolled feature.
3. How a run started from the command line shows the Documents found step. The terminal mockup goes straight from `kiln run` to Running, but the person still has to see what Kiln found and the run's settings, and confirm refinement, before the first session starts (AC-START-02, AC-START-04, AC-START-05, AC-START-07).

The technical design settles the rest; the architecture proposal lists them under "Left to the technical design".
