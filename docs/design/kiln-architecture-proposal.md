# Kiln architecture proposal

Design proposal, revised September 30, 2026. No runner code exists yet. The screens are in [Kiln interface scenarios](kiln-interface-scenarios.md).

## What Kiln is

Kiln runs the implementation half of the Enso Method for you. You give it a PRD that has been refined and split into phases. For each phase it starts a fresh Claude Code session, waits for it to finish, checks that the phase actually landed, and starts the next one. When a phase doesn't land, Kiln stops and hands that phase back to you. The run ends with one pull request for the whole feature.

It replaces the loop a person runs by hand today: start a session with `implement-from-requirements`, watch it, say "commit and push", paste the continuation prompt into a new chat, and repeat.

## Principles

1. **The Enso Method stands alone.** Everything Kiln does, a person can do by hand with the same skills in any coding agent. The method has no step that depends on Kiln, and Kiln writes nothing into the repository that the skills don't already write.
2. **v1 needs no changes to the methodology.** Kiln reads what the skills already produce: the phase doc's `**Closed:**` line, Git state, and the session marker's DONE line. Any later change to a skill is proposed on its own, and only if it also improves manual use.
3. **Kiln doesn't interpret a session.** "Done" means three facts Kiln reads from Git. Anything else hands the phase to you, along with what the session said last. Kiln never guesses a cause or invents a question.
4. **Assumptions are green lights.** Nothing in Kiln waits on stakeholder feedback. Unconfirmed assumptions are listed at the end as information, not as a hold on merging.
5. **Kiln owns the order and the visibility; the session owns the engineering.** Implementation, review, test hardening, commits and pushes happen inside the session through the skills, the same way they do by hand.

## v1 scope

**In v1:**
- one repository and one feature at a time;
- phases run strictly one after another, never in parallel, with Claude Code as the agent;
- a dedicated worktree and feature branch;
- a push after every phase and one PR at the end;
- a command line and a local web view.

**After v1:** these are recorded, with the reasoning, in [Kiln ideas after v1](kiln-after-v1-ideas.md):
- running independent phases in parallel;
- the computer-use preflight and Codex desktop handoff ([preflight prompt](kiln-computer-use-preflight-prompt.md));
- Codex as an unattended agent;
- a mode that holds each phase for your review before commit;
- merging the final PR;
- a desktop app wrapper.

v1 is deliberately sequential. A dozen one-hour phases that run unattended overnight is already the main win, and running phases one at a time keeps the done check, the stop path and Git simple.

The desktop handoff waits because v1 already handles that case: a phase that needs a native desktop app ends without closing, like any other stop, and its last message says why. The preflight would add a separate model pass, a routing table and a second handoff flow. It's worth building once real features show how often the case comes up.

The review mode needs nothing from the methodology. When nobody has authorized a commit, `implement-from-requirements` already stages its work and hands the commit to the person. For that mode, Kiln would leave commit authorization out of its prompt and treat "closed and staged" as "ready for your review". You would look at the diff, press Commit and continue, and Kiln would resume the session with "commit and push".

**Never:**
- delivery across several repositories;
- production deploys;
- Git repair done by Kiln itself;
- parsing older plan formats.

## How a run works

1. **Enroll.** `kiln run <PRD>` finds the technical design, assumptions and phase docs in the PRD's directory. It checks that every leaf phase cites acceptance criteria and records the run settings: worktree, branch, base branch, agent, model and end point.
2. **Pick the next phase.** Kiln uses the method's own rule: walk the plan in order, through any `## Split into` tables, to the first leaf without a `**Closed:**` line. Kiln re-reads the plan after every session, so a session that splits its own phase needs no special handling.
3. **Run one session.** Kiln starts a headless Claude Code session in the worktree with the launch prompt below. It streams the output to disk and to the UI, and waits for the session to exit.
4. **Check.** Kiln runs the done check. If it passes, go back to step 2. If not, the run goes to Needs you.
5. **Finish.** When every leaf is closed, Kiln starts one more session to open the pull request into the base branch, then confirms the PR exists. The run ends at "PR ready for review".

### The launch prompt

The prompt is the authorization a person would give by hand, written out once:

- Run `implement-from-requirements` on `<phase doc>` of `<PRD>`.
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

If all three pass, the phase is Done. Otherwise it's Needs you, whatever the exit code or the last message says. The same check runs when you press Check again, when you run `kiln run` again, and after a desktop handoff (after v1).

There's no model-based verdict on how the session ended. The method already writes markers a program can read, so a model call would only add a chance of being wrong in either direction. It would also add a credential that every Kiln user needs (Bedrock, in the original idea). A one-line "why it stopped" headline may turn out to be useful. If so, Kiln can ask the stopped session itself through a forked headless resume, using your own Claude login. That's not in v1.

## When a phase doesn't finish

The Needs you screen shows:

- the session's last assistant message, word for word (the method's wrap-up rules put a critical finding or a blocker here);
- the session marker's DONE line, when the session wrote one (in `.agent-sessions/` in the shared checkout), which names the terminal state, for example `Blocked — vendor API credentials expired`;
- the exit code, the last lines of stderr, and which checks failed;
- the command to pick it up: `cd <worktree> && claude --resume <session-id>`.

You finish the phase with Claude however you like, then press Check again or run `kiln run` again. If the transcript is gone (Claude Code deletes transcripts after 30 days by default), Kiln offers a fresh-session prompt that points at the phase doc.

A question from Claude takes the same path. With permission prompts turned off, the question tool isn't available, so the session ends and the question is its last message.

Kiln doesn't retry on its own in v1. A retry loop would need to know why the session stopped, which principle 3 rules out.

## Progress and output

Progress comes from the session's own tool calls, not from anything the skills write:

| Step shown | Seen when |
|---|---|
| Build | The session starts (`implement-from-requirements`) |
| Deliverable review | The session calls the `deliverable-review` skill |
| Test hardening | It calls `test-hardening` |
| Commit | It runs `git commit` |
| Refactor pass | It calls `refactor-pass` |
| Push | It runs `git push` |

A real `implement-from-requirements` transcript from September 2026 shows each of these skills as a separate skill call.

Kiln sees a step start but not its end, so a step counts as finished once the next one starts. Progress is for display only and never decides whether a phase is done. If a session reads a skill's file instead of calling the skill, that step just doesn't appear.

Kiln saves every session's full event stream under `~/.local/state/kiln/<repo>/<feature>/<phase>/<session-id>/` and shows it live:
- Claude's text as it's written;
- tool calls and their results;
- the reviewer subagent's messages, tagged to the call that started them.

## Claude Code interface

The table below was checked on September 30, 2026 against Claude Code 2.1.286 (`claude --help`) and the headless and sessions documentation. None of it has been tried in a live run yet; that is proof gate 1.

| Need | Claude Code feature |
|---|---|
| Unattended session | `claude -p "<launch prompt>"` run in the worktree |
| Known session ID | `--session-id <uuid>`, chosen by Kiln before launch |
| Live output | `--output-format stream-json --verbose --include-partial-messages` |
| Reviewer subagent text | `--forward-subagent-text`; the messages carry `parent_tool_use_id` |
| Nobody to answer prompts | `--permission-prompts none`: anything that would prompt is denied, `AskUserQuestion` is removed, and denials appear as `permission_denied` events |
| Hand back to you | `claude --resume <session-id>` opens a `-p` session interactively with its full history. `-p` sessions are left out of the `/resume` picker and `--continue`, so Kiln has to show the ID |
| Stop now | SIGINT ends the turn and leaves the session resumable. SIGTERM exits with code 143 and leaves the turn unfinished |
| Outcome | The final `result` event carries the exit status and session ID |

Kiln must not start the next session while you have the stopped one open, because two processes resuming the same transcript interleave their messages. A stopped run doesn't start anything until you press Check again, so this is covered.

## Git and branches

- **One worktree and branch per run.** Kiln creates the worktree and feature branch from the base branch before the first session. This is the default because a multi-hour unattended run in the shared checkout would collide with everything else happening there. "This checkout and branch" is available as a setting.
- **A push per phase.** Every phase pushes to the feature branch, and there is one PR at the end.
- **The session does the Git work.** Commits, pushes, conflict repair and the PR all happen in the session. Kiln only reads Git state.
- **Nothing destructive.** Kiln never resets, stashes, cleans or force-pushes. If the worktree is dirty after a stop, you resolve it.

## Kiln's own state

Kiln writes nothing into the repository. Its state lives under `~/.local/state/kiln/`: run settings, each phase's session ID and output, and pause requests.

Git and the phase docs are the record of what's done. If Kiln's state is lost, `kiln run` finds the next unclosed leaf the same way it always does, and only the old transcripts are gone.

## Command line and web view

```
kiln run <PRD path or directory>   start, continue, or re-check after a stop
kiln status                        what's running, for every enrolled feature
kiln open                          open the local web view
kiln logs [--follow]               session output
kiln pause                         stop after the current phase
kiln pause --now                   end the current turn now (SIGINT)
```

`kiln run` is safe to run at any time: it attaches to a run in progress, runs the done check when a run is stopped, and starts the next phase when the check passes. The local web view listens on loopback only, shows the same state, and has the same controls: Start, Pause and Check again.

A background supervisor owns the sessions, so closing the terminal or the browser doesn't stop a run. Sleep suspends it. After a reboot, `kiln run` recovers by running the done check on the phase that was in flight.

Kiln notifies you when a phase needs you, when a Codex desktop handoff is ready (after v1), and when the PR is ready. Routine phase changes don't notify.

## Proof gates

1. **Launch and resume.** In a throwaway repo:
   - start a headless session with a session ID Kiln chose and stream its output;
   - stop it mid-turn with SIGINT;
   - reopen it with `claude --resume <id>` in a terminal;
   - confirm skills load and their calls appear in the stream.
2. **One real phase.** Run a small real phase end to end with the launch prompt, and confirm:
   - the session stays on Kiln's worktree and branch, even when instructions say otherwise (a global "work on develop" rule, or the method's rule for parallel sessions);
   - it writes the Closed line, commits and pushes;
   - the done check passes.
3. **The stop path.** Make a phase fail with a missing credential, then:
   - confirm Needs you shows the last message and the DONE line;
   - finish the phase by hand through `claude --resume`;
   - confirm Check again continues the run.
4. **A whole small feature.** Three to five phases through to the PR, including one phase that splits itself and one stop.

## Open questions

1. **Command line with a web view, or a desktop app?** Recommendation: a command line that serves the local web view, with a desktop wrapper later only if dropping a folder onto the app matters. A browser can't learn the path of a folder dropped onto a page.
2. **Language and distribution.** Python installed with `uv tool install`, or TypeScript with npm. Both have a supported Agent SDK. .NET would require the .NET SDK on every machine.
3. **Default permission mode for unattended sessions.** Recommendation: `auto` with permission prompts off. It needs an account that qualifies for auto mode.
4. **Default workspace.** A new worktree and feature branch (the current default), or the current checkout and branch, which matches the method's own default.
