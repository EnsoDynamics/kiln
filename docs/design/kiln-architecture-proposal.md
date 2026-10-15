# Kiln architecture proposal

Design proposal, revised September 30, 2026, and again on October 11, 2026 with decisions on how Kiln runs as a process, recovers from interruptions, handles sleep and is distributed. No runner code exists yet. The requirements are in the [Kiln v1 PRD](../prds/kiln-v1/kiln-v1-prd.md). The screens are in [Kiln interface scenarios](kiln-interface-scenarios.md).

## What Kiln is

Kiln runs the implementation half of the Enso Method for you. You give it a PRD that has been refined and split into phases. For each phase it starts a fresh Claude Code session, waits for it to finish, checks that the phase actually landed, and starts the next one. When a phase doesn't land, Kiln stops and hands that phase back to you. Kiln finishes with one pull request for the whole feature.

It replaces the loop a person runs by hand today: start a session with `implement-from-requirements`, watch it, say "commit and push", paste the continuation prompt into a new chat, and repeat.

## Principles

1. **The Enso Method stands alone.** Everything Kiln does, a person can do by hand with the same skills in any coding agent. The method has no step that depends on Kiln, and Kiln writes nothing into the repository that the skills don't already write.
2. **v1 needs no changes to the methodology.** Kiln reads what the skills already produce: the phase doc's `**Closed:**` line, Git state, and the session marker's DONE line. Any later change to a skill is proposed on its own, and only if it also improves manual use. Kiln's launch prompt grants commit, push and refactor-pass authorization explicitly, so Kiln works whether or not the skills commit by default; since October 2026 the implement skills commit, run `refactor-pass` and push a feature branch on their own by default, a change made for manual use first.
3. **Kiln doesn't interpret a session.** "Done" means three facts Kiln reads from Git. Anything else hands the phase to you, along with what the session said last. Kiln never guesses a cause or invents a question.
4. **Assumptions are green lights.** Nothing in Kiln waits on stakeholder feedback. Unconfirmed assumptions are counted on Documents found as information, not as a hold on merging.
5. **Kiln owns the order and the visibility; the session owns the engineering.** Implementation, review, test hardening, commits and pushes happen inside the session through the skills, the same way they do by hand.

## v1 scope

**In v1:**
- Kiln works on one PRD in one repository, its phases one at a time; several PRDs can be in progress at once on one machine, one `kiln run` per PRD, each with its own worktree, branch and browser address;
- phases run strictly one after another, never in parallel, with Claude Code as the agent;
- a dedicated worktree and feature branch;
- a push after every phase and one PR at the end;
- a command line that stays in the foreground until you press Ctrl+C or close the terminal, and a local web view it serves;
- macOS and Linux;
- GitHub-hosted repositories, where the pull request opens.

Everything else waits for later and is recorded, with the reasoning, in [Kiln ideas after v1](kiln-after-v1-ideas.md).

v1 is deliberately sequential. A dozen one-hour phases that run unattended overnight is already the main win, and running phases one at a time keeps the done check, the stop path and Git simple. Parallel phases are still the likely next step, so v1 shouldn't make them hard: keep Kiln's state per phase and per session rather than assuming a single current session, keep the done check per phase, and keep the engine's next-phase choice in one place so a dependency-aware scheduler could replace it.

**Never:**
- delivery across several repositories;
- production deploys;
- Git repair done by Kiln itself;
- parsing older plan formats.

## How Kiln works through a PRD

1. **Enroll.** `kiln run <PRD directory or PRD file>` is the only way in. Kiln looks in the PRD's directory for the PRD, the technical design and the phase docs, where the skills put them (assumptions are optional), and checks that every leaf phase cites acceptance criteria, that dependencies point backward and that the checkout is clean. Anything missing or failing is an error in the terminal, and Kiln exits. Otherwise it opens the browser on Documents found, where the person reviews what was found, sets the PRD's settings (worktree, branch, base branch, model, effort, keep-awake), confirms refinement and presses Start. A feature already underway skips this and carries on.
2. **Pick the next phase.** Kiln uses the method's own rule: walk the plan in order, through any `## Split into` tables, to the first leaf without a `**Closed:**` line. Kiln re-reads the plan after every session, so a session that splits its own phase needs no special handling.
3. **Run one session.** Kiln starts a headless Claude Code session in the worktree with the launch prompt below. It streams the output to disk and to the UI, and waits for the session to exit.
4. **Check.** Kiln runs the done check. If it passes, go back to step 2. If not, Kiln goes to Needs you.
5. **Finish.** When every leaf is closed, Kiln starts one more session to open the pull request into the base branch, then confirms the PR exists. Kiln stops at "PR ready for review".

### The launch prompt

The prompt is the authorization a person would give by hand, written out once:

- Run `implement-from-requirements` on `<phase doc>` of `<PRD>`. (The session itself is started with the PRD's model and effort level.)
- Work in `<worktree>` on `<branch>`. Don't switch branches or create another worktree.
- You may commit and push to `<branch>`, and run `refactor-pass` after the feature commit. You may not open PRs, merge, or touch other branches.
- You're finished when the phase doc has its Closed line and everything is committed and pushed.

No skill text changes. The skills already act on explicit authorization from the person running them (`pre-commit-validation`, "Who Commits").

## The done check

After every session exits, Kiln checks three facts in the worktree:

| Check | Passes when |
|---|---|
| Phase closed | The leaf Kiln launched has a `**Closed:**` line. If the session split it, the passing condition is that its first child is closed. |
| Committed | The worktree has no uncommitted changes |
| Pushed | The local branch and `origin/<branch>` point at the same commit |

If all three pass, the phase is Done. Otherwise it's Needs you, whatever the exit code or the last message says. The same check runs when you press Check again, and when you run `kiln run` again.

There's no model-based verdict on how the session ended. The method already writes markers a program can read, so a model call would only add a chance of being wrong in either direction. It would also add a credential that every Kiln user needs.

## When a phase doesn't finish

The Needs you screen shows:

- the session's last assistant message, word for word (the method's wrap-up rules put a critical finding or a blocker here);
- the session marker's DONE line, when the session wrote one (in `.agent-sessions/` in the shared checkout), which names the terminal state, for example `Blocked — vendor API credentials expired`;
- the exit code, when the session stopped, and the last skill seen;
- the session's last lines of output, when it ended without a final message;
- which checks failed, with the fact behind each;
- the command to pick it up: change to the worktree, then `claude --resume <session-id>`.

You finish the phase with Claude however you like, then press Check again or run `kiln run` again. A fresh-session prompt that points at the phase doc is always offered too, for when the session can't be reopened (Claude Code deletes transcripts after 30 days by default).

A question from Claude takes the same path. With permission prompts turned off, the question tool isn't available, so the session ends and the question is its last message.

Kiln doesn't retry on its own in v1. A retry loop would need to know why the session stopped, which principle 3 rules out.

An **interrupted** session is a different case. When Kiln itself stops while a session is still working (Ctrl+C, a closed terminal, a restart, sleep), its record shows the session was running and never finished. The next `kiln run` runs the done check and, if the phase isn't done, resumes that same session and tells it to carry on. This needs no reading of the session: Kiln knows it was interrupted because it was there. Kiln never discards an interrupted phase's work and never starts a fresh session on top of it; a session it can't resume goes to Needs you with the fresh-session prompt.

## Progress and output

Progress comes from the session's own tool calls, not from anything the skills write:

| Step shown | Seen when |
|---|---|
| Build | The session starts (`implement-from-requirements`) |
| Deliverable review | The session calls the `deliverable-review` skill |
| Test hardening | It calls `test-hardening` |
| Commit | It runs its first `git commit` |
| Refactor pass | It calls `refactor-pass` (which makes its own commit only if it changes something) |
| Push | It runs `git push` |

A real `implement-from-requirements` transcript from September 2026 shows each of these skills as a separate skill call.

Kiln sees a step start but not its end, so a step counts as finished once the next one starts. Progress is for display only and never decides whether a phase is done. If a session reads a skill's file instead of calling the skill, that step just doesn't appear.

Kiln saves every session's full event stream under `~/.local/state/kiln/<repo>/<feature>/<phase>/<session-id>/` and shows it live:
- Claude's text as it's written;
- tool calls and their results;
- the reviewer subagent's messages, tagged to the call that started them.

## Claude Code interface

The table below was checked on September 30, 2026 against Claude Code 2.1.286 (`claude --help`) and the headless and sessions documentation. None of it has been tried for real yet; that is proof gate 1.

| Need | Claude Code feature |
|---|---|
| Unattended session | `claude -p "<launch prompt>"` run in the worktree |
| Known session ID | `--session-id <uuid>`, chosen by Kiln before launch |
| Model and effort | `--model <model>` and `--effort low\|medium\|high\|xhigh\|max` (effort checked against Claude Code 2.1.292 on October 11, 2026) |
| Live output | `--output-format stream-json --verbose --include-partial-messages` |
| Reviewer subagent text | `--forward-subagent-text`; the messages carry `parent_tool_use_id` |
| Nobody to answer prompts | `--permission-prompts none`: anything that would prompt is denied, `AskUserQuestion` is removed, and denials appear as `permission_denied` events |
| Hand back to you | `claude --resume <session-id>` opens a `-p` session interactively with its full history. `-p` sessions are left out of the `/resume` picker and `--continue`, so Kiln has to show the ID |
| Stop now | SIGINT ends the turn and leaves the session resumable. SIGTERM exits with code 143 and leaves the turn unfinished |
| Outcome | The final `result` event carries the exit status and session ID |

Kiln must not start the next session while you have the stopped one open, because two processes resuming the same transcript interleave their messages. A stopped PRD doesn't start anything until you press Check again or run `kiln run`, so this is covered.

## Git and branches

- **One worktree and one feature branch for the whole PRD, always.** Kiln creates them from the base branch before the first session, and every phase works in them in turn: no per-phase branches, worktrees or PRs, and every later `kiln run` for the feature reuses them. Per-phase branches would only add cost when phases run one after another: each would have to branch off the previous phase's branch to get its code, and the end would be a stack of PRs to review instead of one. They become necessary only for parallel phases (after v1). Many unattended hours of work in the shared checkout would collide with everything else happening there, so there is no option to work in the current checkout.
- **Git flow by default.** The base branch is `develop` (deploys to dev; `main` deploys to production), falling back to the repository's default branch when there is no `develop`, and it can be changed before Start. The PR goes from the feature branch into the base branch. Other branching strategies get no special support in v1.
- **A push per phase.** Every phase pushes to the feature branch, and there is one PR at the end.
- **The session does the Git work.** Commits, pushes, conflict repair and the PR all happen in the session. Kiln only reads Git state.
- **Nothing destructive.** Kiln never resets, stashes, cleans or force-pushes. If the worktree is dirty after a stop, you resolve it.

## Kiln's own state

Kiln writes nothing into the repository. Its state lives under `~/.local/state/kiln/`: the PRD's settings, each phase's session ID and output, which session (if any) was interrupted, and pause requests.

Git and the phase docs are the record of what's done. If Kiln's state is lost, `kiln run` finds the next unclosed leaf the same way it always does; only the old transcripts, and the ability to resume an interrupted session automatically, are gone. Choose the storage format from what actually has to be stored and queried; a database isn't needed just because there is a web view.

## Command line and web view

```
kiln run <PRD directory or PRD file>   move this feature forward: show Documents found, start, continue, resume, or re-check
```

**One command; the browser does the rest.** `kiln run` is Kiln's only command. It starts Kiln, opens the browser view, and hosts the work. Everything else, including reviewing documents, settings, Start, Pause after this phase, Check again, session output and this PRD's state, is in the browser view. In the terminal, Ctrl+C is the only other control. There are no `status`, `logs`, `open` or `pause` commands, and no command to run a single phase.

**`kiln run` means "move this feature forward", not "start over".** Every invocation reads the phase docs, Git and Kiln's own record, works out where the feature really stands, and does the next right thing: start the next phase, resume an interrupted session, or run the done check on a stopped one. The same command serves the first time, after Ctrl+C, after a restart, after a Needs you is resolved, and after a fix in the worktree. There is no separate `kiln resume`.

**`kiln run` stays in the foreground.** It owns the orchestration, the local web server, the current Claude Code process and Kiln's state, and it runs in the terminal it was started from until you press Ctrl+C or close the terminal, including after the PR is ready. There is no daemon, launchd or systemd service. Kiln's users already live in terminals, and a cheap interruption makes this acceptable: closing the terminal or pressing Ctrl+C interrupts the current phase, and `kiln run` picks it back up. Ctrl+C is a controlled interruption: Kiln ends the session's turn so it stays resumable, records the interrupted phase and session, and exits without leaving a Claude Code process behind.

**Keep-awake.** While a phase's session is working, Kiln prevents idle sleep, on by default, with a setting to turn it off. It releases the hold whenever no session is working. Kiln says plainly that this prevents idle sleep only: closing a laptop's lid may still sleep the machine, and a sleep that ends the session is recovered like any interruption. Kiln doesn't count on a streaming session surviving suspend and wake.

**The web view.** The view is interactive, not a status report: Start, Pause after this phase and Check again (and the settings before Start) call the Kiln process. It is served by `kiln run` on loopback only, opened in the browser by `kiln run` itself, gets live updates pushed from the process rather than by reloading, and stays up while `kiln run` is running, including at Needs you, paused and complete. Being on localhost doesn't make it safe on its own: a page from another site open in the same browser must not be able to read Kiln's state or press its controls, without making the person log in.

**Shape of the code.** Kiln is TypeScript, distributed as one npm package (`npm install -g <package>`) that holds the command line, the engine, the local server and the compiled web view (Svelte and Vite). The engine and the web view talk only through a local API. Orchestration stays out of the UI code.

## Proof gates

1. **Launch and resume.** In a throwaway repo:
   - start a headless session with a session ID Kiln chose and stream its output;
   - stop it mid-turn with SIGINT;
   - reopen it with `claude --resume <id>` in a terminal;
   - continue it headlessly with `claude -p --resume <id>`, the way `kiln run` resumes an interrupted session;
   - confirm skills load and their calls appear in the stream.
2. **One real phase.** Run a small real phase end to end with the launch prompt, and confirm:
   - the session stays on Kiln's worktree and branch, even when instructions say otherwise (a global "work on develop" rule, or the method's rule for parallel sessions);
   - it writes the Closed line, commits and pushes;
   - the done check passes.
3. **The stop path.** Make a phase fail with a missing credential, then:
   - confirm Needs you shows the last message and the DONE line;
   - finish the phase by hand through `claude --resume`;
   - confirm Check again lets Kiln continue.
4. **A whole small feature.** Three to five phases through to the PR, including one phase that splits itself, one stop finished by hand, and one Ctrl+C partway through a phase that `kiln run` then resumes.

## Open questions

Decided on October 11, 2026:

1. ~~Command line with a web view, or a desktop app?~~ A command line that serves the local web view.
2. ~~Language and distribution.~~ TypeScript, as one npm package. Python remained viable; .NET was rejected for adding a runtime boundary without enough benefit.
4. ~~Default workspace.~~ Always a new worktree and feature branch, off `develop` by default. No current-checkout option in v1.

Still open:

3. **Default permission mode for unattended sessions.** Recommendation: `auto` with permission prompts off. It needs an account that qualifies for auto mode.

## Left to the technical design

These are deliberately not settled here, and the technical design decides each one on purpose rather than by accident:

- **Ctrl+C and signals.** What Kiln sends the Claude Code process, whether it waits for a graceful end before forcing one, what it saves before exiting, and how it cleans up the process group on macOS and Linux so no Claude Code process is orphaned. Don't assume Node's default child-process behavior is enough.
- **Resuming an interrupted session.** The exact prompt for the resumed turn, and what to do when a Claude Code process is still alive after the machine wakes versus when it has to be resumed.
- **The pushed check.** The exact Git predicate, proving that the local head exists on the remote rather than trusting that `git push` succeeded.
- **Keep-awake implementation** on macOS (`caffeinate` or a power assertion) and Linux.
- **The local server.** How each instance picks its own port so several can run at once, and how a second `kiln run` for the same PRD finds the instance already running it (and its address).
- **Local security.** Binding, origin checks and a per-PRD or per-install token for the control endpoints, invisible to the person.
- **State format.** Plain files or a small SQLite store, chosen from what has to be stored.
- **The npm package name** and install command.
