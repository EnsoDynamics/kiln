# PRD: Kiln v1

**Inputs:** [Kiln architecture proposal](../../design/kiln-architecture-proposal.md) (settled decisions), [Kiln interface scenarios](../../design/kiln-interface-scenarios.md) and the v1 [mockups](../../design/mockups/) (the design of record). Decisions still awaiting validation are in [assumptions](assumptions.md).

## Summary

Kiln v1 runs the implementation half of the Enso Method without a person sitting in the loop. You point it at a PRD that has already been refined and split into phases. Kiln then implements the phases one at a time, in plan order, each in a fresh unattended Claude Code session. After each session it checks in Git that the phase actually landed before it starts the next one. Kiln finishes with one pull request for the whole feature, ready for human review. When a phase doesn't land, Kiln stops and hands that exact session back to you, along with what the session said last.

You start Kiln with one terminal command, `kiln run` and the path to a PRD, and it keeps running in that terminal while it works. Everything else happens in a browser view it serves from your own machine and opens for you: reviewing what it found, starting, watching, pausing and picking up stops. If Kiln is interrupted (Ctrl+C, a closed terminal, a restart, a sleeping laptop), it picks the work back up without losing it; at most, the person runs the same command again.

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
- A **session** is one Claude Code session that Kiln starts for one phase (or, at the end, the pull-request session below). "Run" is never used as a noun for Kiln's work on a PRD, in this PRD or on screen, so it can't be confused with one phase's session; the `kiln run` command and ordinary verb uses are fine.
- The **feature name** is the PRD folder's name with hyphens read as spaces and the first letter capitalized: `docs/prds/customer-returns/` is "Customer returns". It names the feature in the terminal, the browser tab and every screen.
- The **done check** is the three-part test Kiln applies after every phase's session: the phase is closed, everything is committed, and everything is pushed.
- The **pull-request session** is the session Kiln starts once every leaf is closed, to open the pull request; Kiln handles it as one last phase (AC-PR-05).
- **Needs you** is the state Kiln stops in, handing the work to the person, when it can't confirm a session did its job — a phase failed the done check, no pull request is open (AC-PR-02), or an interrupted session can't be resumed (AC-KEEP-05) — or when the phase plan is broken before the next phase starts (AC-STOP-07).
- A session is **interrupted** when it is cut off rather than ending on its own: Kiln stops while the session is working (Ctrl+C, a closed terminal, a restart), or the computer sleeps while it is working and the session doesn't survive. Kiln knows this from its own record, never from reading the session. A session that **ended on its own**, finished or crashed, is judged by the done check alone.

## Acceptance Criteria

### Start Kiln on a Refined PRD

There is one way in: point `kiln run` at one PRD. Kiln checks that the documents it needs are where the Enso Method skills put them, then opens the browser on what it found. Nothing is implemented until the person presses Start.

- [ ] **AC-START-01 — One command, one PRD.** `kiln run <path>` is the only way to start, where the path is one PRD's directory (`docs/prds/<name>/` or `docs/changes/<name>/`) or the PRD file in it. Run with no path, or with a directory holding several PRDs, Kiln prints how to use it and exits. The same command is used every later time too (AC-CLI-01).
- [ ] **AC-START-02 — Missing or broken documents stop Kiln in the terminal.** Kiln looks for the documents where the Enso Method skills put them, in the PRD's directory: the PRD (`<name>-prd.md`), the technical design (`technical-design.md` or `<name>-technical-design.md`) and the phase documents; an assumptions document (`assumptions.md` or `<name>-assumptions.md`) is optional, and a document there under both names stops Kiln. It also checks that every leaf cites acceptance criteria, that no phase depends on a phase later in the plan, and that the checkout has no uncommitted changes. If anything is missing or fails, Kiln prints what, and where it looked, and exits without opening the browser or starting anything. A feature already underway skips these checks.
  - Superseded in part by: AC-REPO-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the named repositories are checked too; the clean-checkout check still covers only the PRD's repository)
  - Superseded in part by: AC-HANDBACK-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (active handback requires readable coherent plan sources; unrelated dirty-checkout and other startup-only checks remain skipped).
- [ ] **AC-START-03 — The browser opens on what Kiln found.** When the checks pass, Kiln opens the browser view itself: on Documents found for a feature not started, where no session starts until the person presses Start, or on the PRD's progress for a feature already underway (AC-CLI-01).
- [ ] **AC-START-04 — Kiln shows what it found beside the PRD.** For the PRD: its acceptance-criteria count and label range. For the technical design: how many of the PRD's acceptance criteria it cites. For assumptions: how many there are and how many stakeholders haven't confirmed yet ("not yet confirmed"), labeled as green lights that nothing waits on, or that there is no assumptions document. For the phase plan: how many phase documents there are, and the phases to implement in order, by number and title, showing which phases are split and into what. It also lists the checks from AC-START-02 as passed.
  - Superseded in part by: AC-REPO-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Documents found and the terminal's first line show the repositories)
  - Superseded in part by: AC-SPACE-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (one line added to a one-repository PRD's Documents found)
- [ ] **AC-START-05 — The person confirms the documents were refined.** Kiln can't tell from the files whether the documents have been through requirements refinement, because that workflow deletes its working file when it finishes. Documents found says so, and Start stays unavailable until the person confirms they have.
- [ ] **AC-START-06 — The PRD's settings are shown, can be changed before starting, and are remembered.** Documents found shows the new worktree's path, the feature branch and the base branch it starts from, the agent, model and effort level, when pushes happen, where Kiln stops, and whether Kiln keeps the computer awake. Before Start, the person can change the worktree path, the feature branch, the base branch, the model (any Claude Code offers the signed-in account), the effort level (low, medium, high, extra high or max) and keep-awake; the model starts as the latest Opus and the effort as high (UI-004). In v1 the agent is always Claude Code, pushes always happen after every phase, and Kiln always stops at "PR ready for review". Once Start is pressed, Kiln keeps the settings for the PRD, and every later `kiln run` uses them without asking again.
  - Superseded in part by: AC-BILL-01 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (Claude billing visibility and launch eligibility only; existing controls remain).
  - Superseded in part by: AC-AGENT-01, AC-MODEL-01 and AC-MODEL-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (per-PRD agent selection, agent-specific catalogue/efforts, remembered choices and validation before new sessions)
  - Superseded in part by: AC-SPACE-01 and AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch, and what a failed Start fixes; per repository, and where Kiln stops)
  - Superseded in part by: AC-AUTO-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a new setting beside keep-awake)
- [ ] **AC-START-07 — One feature branch and one worktree for the whole PRD.** Before the first session, Kiln creates one new feature branch from the base branch, never one that already exists (UI-003), and one worktree for it outside the person's own checkout. Every phase's session works in that worktree and commits and pushes to that branch, each building on the one before; phases never get their own branches, worktrees or pull requests, and every later `kiln run` for the feature reuses them. Unless the person changes them before Start, the feature branch is `feature/<PRD folder name>`, the worktree is `.worktrees/<PRD folder name>/<repository>` in the folder that holds the repository, where the Enso Method puts its worktrees, and the base branch is `develop`, or the repository's default branch when there is no `develop`.
  - Superseded in part by: AC-CONTINUE-06 and AC-CONTINUE-08 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (an explicitly accepted continuation uses fresh current-base workspaces and existing controls; earlier execution settings and history remain historical), implemented in Phase 3a.
  - Superseded in part by: AC-DEV-01 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the prohibition on phase-time pull requests; the assigned feature branches and worktrees remain the working locations).
  - Superseded in part by: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch, and what a failed Start fixes)
- [ ] **AC-START-08 — The person sees what Kiln is allowed to do.** Next to Start, Documents found shows what Kiln may do: commits and pushes to the feature branch, and one pull request into the base branch once every phase closes. It also shows what is not allowed: merging, deploying anywhere, and touching other branches.
  - Superseded in part by: AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (per repository, and where Kiln stops)
- [ ] **AC-START-09 — The terminal says what's happening, briefly.** For a feature not started, the terminal prints the feature name, what Kiln found, the browser view's address, that Kiln works in this terminal so it should stay open, and that Ctrl+C interrupts the current phase and `kiln run` picks it back up. For a feature already underway, it prints the feature name, how far the feature has got, and what Kiln does next, with the address. While Kiln works, it prints one line when it starts the PRD and one each time a phase starts, is done, stops, is interrupted or is resumed; a pause taking effect prints no line.
  - Superseded in part by: AC-REPO-03, AC-ADD-03 and AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Documents found and the terminal's first line show the repositories; a terminal line when a repository is added; every pull request, and commits by repository)
  - Superseded in part by: AC-LIMIT-05 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the wait and resume lines)

### Implement Each Phase in Its Own Unattended Session

Kiln does the job of the person who starts each session, gives it permission to commit, and moves on to the next phase. The engineering stays inside the session, done by the Enso Method skills exactly as they are.

- [ ] **AC-RUN-01 — Phases run in plan order, one at a time.** The next phase is the method's own choice: walk the plan in order, through any `## Split into` tables, to the first leaf without a `**Closed:**` line. Once the worktree exists, Kiln reads the plan and the Closed lines there, where the sessions write them. Kiln never has two sessions working on one PRD at once.
  - Superseded in part by: AC-FIND-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (completed-feature discovery reads the shared checkout and remote delivery base; active execution stays in its workspace).
  - Superseded in part by: AC-DEV-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (an earlier phase with unresolved required development delivery is reconciled before selecting the next unclosed leaf; sequential plan order remains).
- [ ] **AC-RUN-02 — Each phase gets a fresh session.** Each leaf is implemented by a new, unattended Claude Code session started in the PRD's worktree, with the model and effort level from the PRD's settings.
  - Superseded in part by: AC-WORK-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (a fresh phase conversation may use Codex).
  - Superseded in part by: AC-SPACE-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the session works across the workspace, and may ask Kiln for another repository)
- [ ] **AC-RUN-03 — The session gets the authorization a person would give.** Each session is told to:
  - Superseded in part by: AC-DEV-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (Closed, Committed and Pushed, together with existing workspace checks, are insufficient for phases with unresolved required development delivery).
  - Superseded in part by: AC-DEV-01 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the prohibition on early pull requests, merging, waiting on checks to merge, and development deployment, only within the approved scope).
  - run `implement-from-requirements` on that leaf's phase document;
  - work only in the PRD's worktree and on its feature branch, without switching branches or creating another worktree;
  - commit and push to the feature branch, and run `refactor-pass` after the feature commit;
  - open no pull request, merge nothing, deploy nothing and touch no other branch;
  - treat the phase as finished when its phase document has its Closed line and everything is committed and pushed.
  - Superseded in part by: AC-SPACE-02 and AC-ADD-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the session works across the workspace, and may ask Kiln for another repository; Kiln also sets up a repository after Start, and has a second command for asking it to)
- [ ] **AC-RUN-04 — A phase that splits itself is followed.** Kiln re-reads the plan after every session. When a session split its own phase, Kiln carries on with the next unclosed leaf, and the person does nothing special.
  - Superseded in part by: AC-ADD-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a named repository Kiln can't add is a broken-plan stop, including one a session's own split names)
- [ ] **AC-RUN-05 — A session never waits for an answer.** A session runs with no one there to answer permission prompts or questions. Anything that would ask is refused instead of waiting, so a session never hangs waiting for a person. A session that needs to ask a question ends, its question becomes its last message, and the phase goes to Needs you.
  - Superseded in part by: AC-WORK-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex client requests are declined or interrupt the protected conversation; Claude behavior is unchanged).
- [ ] **AC-RUN-06 — The Enso Method skills are used unchanged.** Kiln works with the skills as published. It requires no edit to any skill, and everything it tells a session is something a person could type by hand.
- [ ] **AC-RUN-07 — A phase Kiln hands back can be finished outside Kiln.** A phase at Needs you, even one whose session can't be resumed, can be finished in an ordinary Claude Code session or any other way that leaves the work in the PRD's worktree; Kiln treats it like a phase it ran, and the done check is the only test (AC-STOP-07).
  - Superseded in part by: AC-SPACE-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the session works across the workspace, and may ask Kiln for another repository)

### Check in Git That Each Phase Landed

A phase counts as done only when Git and the phase document say so. How the session ended, and what it claimed, doesn't count.

- [ ] **AC-DONE-01 — Done means three checks pass.** After every phase's session, a phase is Done only when all three checks pass:
  - **Closed:** the leaf Kiln launched has its `**Closed:**` line. If the session split that leaf, the leaf's first child has its Closed line instead.
  - **Committed:** the PRD's worktree has no uncommitted changes.
  - **Pushed:** the feature branch and its copy on `origin` point at the same commit.
  - Superseded in part by: AC-CHECK-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Committed and Pushed cover every repository)
  - Superseded in part by: AC-OUTSIDE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a fourth check, listed only when it failed)
  - Superseded in part by: AC-AUTO-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a phase session that fails its check after hitting a usage limit waits for usage rather than going to Needs you)

  Otherwise the phase is Needs you.
- [ ] **AC-DONE-02 — Exit codes and messages don't decide.** A session that exits cleanly saying it finished, but fails a check, is Needs you. A session that crashed, but whose work passes all three checks, is Done.
  - Superseded in part by: AC-OUTSIDE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a fourth check, listed only when it failed)
  - Superseded in part by: AC-AUTO-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a phase session that fails its check after hitting a usage limit waits for usage rather than going to Needs you)
- [ ] **AC-DONE-03 — The same check runs everywhere.** It is the same check after every phase's session, when the person presses Check again, when `kiln run` is run on a stopped feature, and before an interrupted session is resumed. (A broken-plan stop is checked as AC-STOP-07 says.)
- [ ] **AC-DONE-04 — No model judges how a session ended.** Kiln makes no model call to decide or explain how a session ended.

### Hand a Stopped Phase Back With What the Session Said

When a phase fails the done check, Kiln stops and gives the person everything needed to finish that phase themselves, then continues once they have.

- [ ] **AC-STOP-01 — Kiln stops and doesn't retry.** When a phase is Needs you, no later phase starts and Kiln doesn't rerun the phase on its own. (An interrupted session is resumed instead, per AC-KEEP-04.)
  - Superseded in part by: AC-OUTSIDE-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (an interrupted session that worked outside the workspace goes to Needs you instead of being resumed, shown as interrupted with the resume command)
  - Superseded in part by: AC-AUTO-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a session that hit a usage limit waits, rather than stopping at Needs you)
- [ ] **AC-STOP-02 — The person sees how the session ended, word for word.** The Needs you screen shows:
  - the session's last assistant message, verbatim;
  - the exit code and the time the session stopped;
  - the last skill seen in the session;
  - when the session ended without a final message, its last lines of output, errors included.
  - Superseded in part by: AC-OUTSIDE-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (an interrupted session that worked outside the workspace goes to Needs you instead of being resumed, shown as interrupted with the resume command)
- [ ] **AC-STOP-03 — The person sees which checks failed and why.** Each of the three checks shows whether it passed, with the specific fact behind it. Examples: "No Closed line in phase-2b-store-credit.md", "12 files changed, not committed", "a41c9e2 isn't on origin yet".
  - Superseded in part by: AC-CHECK-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (facts name their repository)
  - Superseded in part by: AC-OUTSIDE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a fourth check, listed only when it failed)
- [ ] **AC-STOP-04 — Kiln never guesses a cause or invents a question.** Nothing on any screen or in the terminal output gives a reason for a stop that Kiln inferred. Anything said about why a phase stopped is the session's own words, quoted, never summarized.
  - Superseded in part by: AC-LIMIT-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a session that hit a usage limit states its cause, from Claude Code's report rather than from Kiln's reading of the session)
- [ ] **AC-STOP-05 — The person can reopen the exact session.** Kiln shows a copyable command that changes to the PRD's worktree and runs `claude --resume <session ID>`. It opens that session in a terminal with its full history.
  - Superseded in part by: AC-RECOVER-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex resume command and saved context).
  - Superseded in part by: AC-SPACE-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the workspace in place of the one worktree)
  - Superseded in part by: AC-OUTSIDE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (no resume command for a session whose transcript Kiln can't find)
- [ ] **AC-STOP-06 — A fresh-session prompt is there when the session can't be opened.** The Needs you screen also offers a copyable prompt for a fresh session that points at the phase document, for when the session can't be reopened, for example because its transcript is gone.
  - Superseded in part by: AC-RECOVER-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex fresh-session and explicit repair prompts).
  - Superseded in part by: AC-SPACE-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the workspace in place of the one worktree)
  - Superseded in part by: AC-OUTSIDE-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the fresh-session prompt carries the facts)
- [ ] **AC-STOP-07 — Check again lets Kiln continue.** After the person finishes the phase by any means, Check again in the browser view runs the done check. When it passes, the phase shows as Done, finished by the person, and the next phase starts, unless a pause is waiting (AC-VIEW-03). When it fails, the phase stays Needs you with the updated check results. At a broken-plan stop, Check again and `kiln run` read the phase plan again in place of the done check: once the plan reads correctly, the phase starts, unless a pause is waiting, and nothing is marked Done; until then, the stop stays, showing the problem found.
  - Superseded in part by: AC-VERIFY-01 in [Kiln Needs you handoff](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) (the manual implementation-phase completion action; broken-plan recovery remains).
  - Superseded in part by: AC-ADD-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a named repository Kiln can't add is a broken-plan stop, including one a session's own split names)
  - Superseded in part by: AC-OUTSIDE-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Check again passes the fourth check only for changes a confirmation covers)
- [ ] **AC-STOP-08 — Nothing starts while the person may be in the stopped session.** After a stop, Kiln starts no session for that PRD until the person presses Check again or runs `kiln run`.
  - Superseded in part by: AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Resume is a third way for a session to start after a stop)

### Leave the Git Work to the Sessions

Kiln reads Git but doesn't repair it. Every change to the repository's history comes from a session the person can see and resume.

- [ ] **AC-GIT-01 — Kiln sets up the worktree, and does nothing more.** Kiln creates the worktree and the feature branch from the base branch before the first session starts. Apart from that setup, Kiln changes no Git state.
  - Superseded in part by: AC-SPACE-01 and AC-ADD-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch, and what a failed Start fixes; Kiln also sets up a repository after Start, and has a second command for asking it to)
- [ ] **AC-GIT-02 — Kiln never does destructive Git operations.** Kiln never resets, stashes, cleans, force-pushes or deletes branches, in any situation. A workspace left with uncommitted changes after a stop stays that way until the person resolves it.
- [ ] **AC-GIT-03 — Kiln adds nothing to the repository.** Kiln adds no files to the repository and makes no commits of its own. Its settings, session records and output live outside the repository, on the person's machine.
- [ ] **AC-GIT-04 — The worktree is kept.** Kiln leaves a PRD's worktree in place after the last phase, and says it is there until the person removes it.
  - Superseded in part by: AC-SPACE-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the workspace in place of the one worktree, including Complete's note that Kiln keeps it)

### Finish With One Pull Request

When every leaf is closed, Kiln finishes with a single pull request for the whole feature, opened by a session and ready for a person to review.

- [ ] **AC-PR-01 — A final session opens the pull request.** Once every leaf is closed, Kiln completes the PRD at once if AC-PR-02's check already passes; otherwise it starts one more session, authorized to open one pull request from the feature branch into the base branch. That session may not merge the pull request or touch other branches.
  - Superseded in part by: AC-AUDIT-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (automatic whole-PRD audits precede final delivery).
  - Superseded in part by: AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (one pull request per repository that changed)
- [ ] **AC-PR-02 — Kiln confirms the pull request is open.** The pull-request session's check, in place of the done check, is that a pull request from the feature branch into the base branch is open. When it passes, the PRD is complete; when it fails, Kiln goes to Needs you.
  - Superseded in part by: AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (one pull request per repository that changed)
  - Superseded in part by: AC-PRS-06 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (its check includes Stayed in the workspace)
  - Superseded in part by: AC-AUTO-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a pull-request session that fails its check after hitting a usage limit waits for usage rather than going to Needs you)
- [ ] **AC-PR-03 — Kiln stops at "PR ready for review".** Kiln doesn't merge the pull request, wait on CI to merge it, or deploy anything.
  - Superseded in part by: AC-PRS-03 and AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (truthful already-merged and mixed completion; no merge or deployment authority).
- [ ] **AC-PR-04 — The Complete screen is the progress screen, finished.** It shows:
  - Superseded in part by: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (audit and repair activity rows precede final delivery).
  - the pull request's number, title, branches and link, with its commit count and lines added and removed;
  - the phase plan with every phase Done, followed by the pull-request session's row (AC-PR-05);
  - the agent, and the worktree with a note that Kiln keeps it until the person removes it.
  - Superseded in part by: AC-SPACE-05 and AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the workspace in place of the one worktree, including Complete's note that Kiln keeps it; every pull request, and commits by repository)
- [ ] **AC-PR-05 — The pull-request session is handled as a last phase.** Wherever a phase's session appears, the pull-request session appears as one more phase, numbered "PR" and titled "Final pull request", except as the table says.
  - Superseded in part by: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (final-session allocation follows the required audit activities).
  - Superseded in part by: AC-DISPLAY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (final-session naming, recovery copy and the completion header where the result is not solely open review pull requests).
  - Superseded in part by: AC-PRS-05 and AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (one pull request per repository that changed; every pull request, and commits by repository)

  | | The pull-request session |
  |---|---|
  | Text naming a phase by number ("phase 2b of 5") | Says "the pull request" |
  | Its check | AC-PR-02's check, not the done check; its Needs you shows only that check, and its wording and fresh-session prompt are about the pull request |
  | Its row in the phase plan | "pull request session" in place of a file name, added once every leaf is closed; once its check passes, "Opened #<number>" in place of Done, with no pushed commit or Details, and no duration when the pull request was found already open |
  | Phase count and progress steps | Not counted ("5 of 5 phases done"); no progress steps |
  | Pausing | Pause after this phase isn't offered or suggested anywhere during it |
  | Its terminal lines | "opened #<number>" in place of "done · pushed <sha>", the only line when the pull request was found already open |

### Watch Kiln While It Works

The person can see how far Kiln has got, what the current session is doing, and what has been pushed, without interrupting anything. Progress is for display only and never decides whether a phase is done.

- [ ] **AC-WATCH-01 — Every phase is listed with its state.** The phase plan lists every phase in plan order, all at the same level (a split phase's children are not indented), with its number, its phase document's file name, its title taken word for word from that document, and its state:
  - Superseded in part by: AC-LIVE-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (transport loss retains last-known state and observation time; it does not prove work stopped or authorize terminal recovery).
  - Superseded in part by: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (started audit and repair rows follow execution order; pending implementation remains in plan order).
  - Superseded in part by: AC-VIEW-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (recorded agent and Codex conversation identity).
  - Superseded in part by: AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (every pull request, and commits by repository)

  | State | When | The row also shows |
  |---|---|---|
  | Planned | Not started yet | |
  | Next | Kiln is paused and this is the phase Start begins | |
  | Implementing | Its session is working | Running time, with waiting time separately when nonzero |
  | Interrupted | The view lost Kiln while this phase was in progress | Running and waiting time frozen when the view lost Kiln |
  | Needs you | It stopped and waits for the person (AC-STOP-01) | |
  | Done | It passed the done check | Running and waiting time through Done, its pushed commit, and "finished by you" when the person finished it |
  | Split into its children | It is a split parent | |

  The title of a current, interrupted or stopped phase whose session is available links to its phase detail, with a visible chevron. Each phase that has run has a Details section, collapsed until the person opens it, showing when it ran (for a Done phase, that same span), the model and effort level it ran with, its worktree, its branch, its commits and its session ID.
- [ ] **AC-WATCH-02 — The header says where the PRD stands.** Under the feature name, every browser screen except Phase detail shows the PRD's state: Not started, Implementing phase <n>, Paused, Interrupted in phase <n>, Needs you or PR ready for review. Once a phase has started, it adds how many phases are done; Needs you shows the stopped phase and when it stopped instead, and Complete adds total running time, waiting time and when it finished. Running time counts recorded session execution, including tools and tests; waiting time is the remaining elapsed time, including Needs you, usage limits and pauses. Original start timestamps remain visible.
  - Superseded in part by: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (new-work status and the ordered readiness offer precede earlier delivery; historical delivery facts and unaffected presentation remain).
  - Superseded in part by: AC-LIVE-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (transport loss retains last-known state and observation time; it does not prove work stopped or authorize terminal recovery).
  - Superseded in part by: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the header names the current audit activity).
  - Superseded in part by: AC-PRS-03 and AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (truthful already-merged and mixed completion; no merge or deployment authority).
  - Superseded in part by: AC-LIMIT-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the Waiting for usage state and its screen)
- [ ] **AC-WATCH-03 — The current phase is always at the top.** The phase being implemented is shown in a full-width panel above the phase plan: its number and title, when it started, its progress steps (AC-WATCH-04), the last thing seen in the session, its latest output line, a link to its live output, and its own Details. The latest-output preview uses the same compact terminal presentation as the phase detail, with tool names and inputs, indented results, explicit reviewer and child-agent identities, and amber errors. It reserves three lines so new entries do not move the phase plan; Watch live opens the expandable output.
- [ ] **AC-WATCH-04 — The current phase shows its progress steps.** The current phase shows six steps, in the order the Enso Method runs them: Build, Deliverable review, Test hardening, Commit, Refactor pass and Push. A step starts when the session is seen doing it: starting `implement-from-requirements`, calling the `deliverable-review`, `test-hardening` or `refactor-pass` skill, running its first `git commit`, or running `git push`. A refactor commit, when `refactor-pass` makes one, belongs to the Refactor pass step, and the push sends it with the feature commit. A step counts as finished once the next one starts. A step the session never visibly calls stays unreached, and Kiln doesn't fill it in. After the person resumes a stopped session, show a separate active “Follow-up” indicator; recorded milestones remain visible without claiming an old step is the current activity. Automatic recovery and Resume now after a usage limit retain ordinary progress. A reply attached to a manual usage-limit resume is follow-up too.
  - Superseded in part by: AC-DISPLAY-02 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the six-step display also distinguishes authorized development-delivery activity; existing steps and Follow-up remain).
  - Superseded in part by: AC-VIEW-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex activity is observed or unobserved; activity never proves step completion).
- [ ] **AC-WATCH-05 — Session output is shown live.** For the current session, the person can watch Claude's text as it is written, each tool call and its result, and the reviewer subagent's messages labeled as the reviewer's. The live view shows the latest 100 entries in a pane about 60% of the window height, scrolling inside it, with the displayed and total entry counts. It follows new output until the person scrolls up or expands an entry; Jump to latest restores following. Long tool calls, results and messages have bounded previews with an expansion control. The compact terminal presentation uses tool names with their inputs and indented results; timestamps are available through a checkbox, off by default. Earlier output is available through the stopped session’s full-output view (AC-WATCH-10).
  - Superseded in part by: AC-VIEW-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex-native live output and explicit child-output visibility limits).
- [ ] **AC-WATCH-06 — The phase detail identifies the session.** The phase detail shows the session ID, the model and effort level, the start time, running time and waiting time, and the commits made for the phase so far.
  - Superseded in part by: AC-VIEW-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (recorded agent and Codex conversation identity).
  - Superseded in part by: AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (every pull request, and commits by repository)
- [ ] **AC-WATCH-07 — Settings are shown apart from per-phase facts.** While Kiln is working, paused or disconnected, the browser view shows the PRD's settings: the agent, with the model and effort level for the next session, and keep-awake, with the worktree, the feature branch and the one pull request into the base branch marked as fixed for the PRD. Facts that belong to a phase (worktree, branch, commits, times, session) are shown with that phase, not with the settings.
  - Superseded in part by: AC-VIEW-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (selected-agent settings and recorded session identity).
  - Superseded in part by: AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (per repository, and where Kiln stops)
  - Superseded in part by: AC-AUTO-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a new setting beside keep-awake)
- [ ] **AC-WATCH-08 — The person can see which Claude account is working and how close it is to its limits.** Documents found shows the signed-in Claude account (email and plan) with one line giving the percent used of each limit. Running and Paused give it a panel: when its usage was last updated and, for each limit (the 5-hour window, the weekly limit and any per-model limit Claude Code reports, such as a weekly Fable limit), the percent used and when it resets. In that panel, a limit at 80% or more (UI-001) turns amber and suggests switching accounts: by pausing after this phase on Running, or with `claude auth login` before starting the next phase on Paused. The next phase uses whichever account is signed in when it starts; Kiln never waits for a limit to reset (UI-005).
  - Superseded in part by: AC-BILL-01 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (Claude billing visibility and launch eligibility only; existing controls remain).
  - Superseded in part by: AC-USAGE-01/03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (selected-agent account, dynamic reported allowances and missing Claude five-hour readings)
  - Superseded in part by: AC-AUTO-01 and AC-LIMIT-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Kiln waits for a usage limit that refused a session, and the waiting and usage-limit Needs you screens show the account and the stopping limit, amber at 100%)
- [ ] **AC-WATCH-09 — Account and usage stay current without spending usage.** While `kiln run` is running, Kiln refreshes the account and its usage every 5 minutes and again just before each phase starts, using Claude Code's own usage report, which spends none of the person's usage.
  - Superseded in part by: AC-RUN-01 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (Claude billing visibility and launch eligibility only; existing controls remain).
  - Superseded in part by: AC-USAGE-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (selected-agent metadata refresh without model turns)
  - Superseded in part by: AC-AUTO-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Kiln also reads the account and usage when a wait starts, at the stopping limit's reset time, and on waking during a wait)
- [ ] **AC-WATCH-10 — A stopped session's full output can be read.** Every session's full output is saved on the person's machine, outside the repository, and the Needs you screen links to it.
  - Superseded in part by: AC-VIEW-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex-native saved output).
- [ ] **AC-WATCH-11 — Nothing claims evidence for acceptance criteria.** Kiln shows no status of its own saying an acceptance criterion is met or tested. Any such claim on screen is the session's own output, shown as session output.

### Start It in the Terminal, Control It From the Browser

The terminal only starts Kiln and hosts it. Everything the person does after that, they do in the browser view.

- [ ] **AC-CLI-01 — Reopening shows progress before restarting work.** `kiln run <path>` reconciles the phase documents, Git and saved work, then shows completed and planned phases, the total and the next activity. Started work waits for an explicit Resume before launching or resuming a session or restarting automatic usage recovery. Unresolved stops retain Needs you, intentional pauses retain Start, and completed features retain Complete. `kiln run <path> --resume` performs the existing eligible continuation immediately with saved settings, without a browser click; it requires an already-started execution and preserves intentional pauses and every recovery, billing and delivery restriction. Phases already done are never redone. New executions still require Documents found and Start; full unattended new-run configuration is outside this change.
  - Superseded in part by: AC-FIND-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (completed-feature reopening checks current plan sources before a nothing-left conclusion).
  - Superseded in part by: AC-ACT-02–05 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (documented existing-run mutations, including a distinct no-message resume, with status-bound durable instruction identity and retry protection).
  - Superseded in part by: AC-RECOVERY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (executions using development deployments reconcile current work and delivery evidence when reopened instead of treating recorded completion as sufficient; restricted executions retain historical completion).
  - Superseded in part by: AC-AUTO-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (`kiln run` on a feature that was waiting starts the wait again)
- [ ] **AC-CLI-02 — `kiln run` is the only command.** Kiln has no other commands in v1: no separate commands for status, logs, pausing, or running a single phase. In the terminal, the only other control is Ctrl+C (AC-KEEP-02).
  - Superseded in part by: AC-ACT-02–05 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (documented existing-run mutations, including a distinct no-message resume, with status-bound durable instruction identity and retry protection).
  - Superseded in part by: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (documented inspection, output/history and recovery-instruction reads plus CLI help outside the browser; existing run-changing controls remain).
  - Superseded in part by: AC-ADD-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Kiln also sets up a repository after Start, and has a second command for asking it to)
- [ ] **AC-VIEW-01 — The browser view is local only.** The browser view can be reached only from the same machine, never from another computer on the network.
- [ ] **AC-VIEW-02 — The browser view is where Kiln is controlled.** It offers Start (on Documents found, and to continue after a pause), Pause after this phase (with Keep going to cancel it, AC-VIEW-03) and Check again, and session output is read there.
  - Superseded in part by: AC-ACT-02–05 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (documented existing-run mutations, including a distinct no-message resume, with status-bound durable instruction identity and retry protection).
  - Superseded in part by: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (documented inspection, output/history and recovery-instruction reads plus CLI help outside the browser; existing run-changing controls remain).
  - Superseded in part by: AC-OUTSIDE-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the confirmation joins the browser view's controls)
  - Superseded in part by: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Resume joins the browser view's controls)
  - Superseded in part by: AC-LIMIT-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Resume now joins the browser view's controls)
- [ ] **AC-VIEW-03 — Pause after this phase stops Kiln between phases.** The current session finishes, including its commit and push, and the pause holds until that phase is Done by any route (its session, a resumed one, or the person after Needs you); then no phase starts until the person presses Start, even if Kiln is interrupted or restarted in between. Until that phase is Done, the person can cancel the pause with Keep going, and the view says Kiln will pause once the current phase is Done (UI-002).
  - Superseded in part by: AC-LIVE-03/04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (paired takeover and end-of-activity pause choices, distinct pending/reached wording and separate cancellation; deferred timing remains).
  - Superseded in part by: AC-RUN-02 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (pause applies at accepted audit-session boundaries).
  - Superseded in part by: AC-LIMIT-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (no Pause after this phase or Keep going while waiting; a pending pause stays pending through the wait)
- [ ] **AC-VIEW-04 — The browser view stays current.** The browser view updates on its own while Kiln works, without a reload, and shows when it was last updated.
- [ ] **AC-VIEW-05 — The browser view lasts as long as `kiln run`.** While `kiln run` is running for a feature, its browser view works, including while Kiln is stopped at Needs you, paused or complete.
- [ ] **AC-VIEW-06 — Other web pages can't use Kiln.** A page from any other site, open in the same browser, can neither read Kiln's state or output nor press Kiln's controls. The person never has to log in or handle a key to use the browser view.
- [ ] **AC-VIEW-07 — The browser view shows whether Kiln is still there.** Every screen shows whether it is connected to the running Kiln. When Kiln has stopped (Ctrl+C, a closed terminal, a restart), the view says plainly that it is disconnected, that nothing is running, and that `kiln run` picks up where it left off; it never keeps showing Kiln as live when it isn't.
  - Superseded in part by: AC-LIVE-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (transport loss retains last-known state and observation time; it does not prove work stopped or authorize terminal recovery).
- [ ] **AC-VIEW-08 — Model, effort and keep-awake can change between phases; the worktree and branches can't.** While Kiln is working or paused, the person can change the model and effort level in the browser view; a change applies to every session Kiln starts after it, and the session already working keeps what it started with. Keep-awake can be switched on or off at any time and applies at once. The worktree, feature branch and base branch are fixed once the first phase starts, and the view says so.
  - Superseded in part by: AC-MODEL-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (new-session choices remain distinct from the original Codex conversation pair).
  - Superseded in part by: AC-MODEL-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (new sessions require a confirmed available catalogue and valid saved pair; unavailable lists no longer permit unchecked aliases)
  - Superseded in part by: AC-SPACE-01 and AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch, and what a failed Start fixes; per repository, and where Kiln stops)
  - Superseded in part by: AC-AUTO-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a new setting beside keep-awake)

### Run Several PRDs at Once

Phases within one PRD run one at a time, but a person can have several PRDs moving at once, in the same repository or in different ones, each from its own `kiln run`.

- [ ] **AC-MULTI-01 — Several PRDs at once.** Several `kiln run` instances can run at the same time on one machine, each in its own terminal, each moving a different PRD forward one phase at a time. The PRDs can be in the same repository or in different ones.
- [ ] **AC-MULTI-02 — Each PRD has its own browser view.** Every instance serves its own browser view at its own address, prints that address in its terminal, and never takes over another instance's address. A PRD keeps the same address every time `kiln run` starts it, so a tab left open on it reconnects. Each browser tab's title names its feature, so tabs for different PRDs can be told apart.
- [ ] **AC-MULTI-03 — PRDs don't touch each other's work.** Each PRD's sessions work only in its own worktree and feature branch (AC-START-07), so two PRDs in one repository never change each other's files or branches.
  - Superseded in part by: AC-SPACE-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the session works across the workspace, and may ask Kiln for another repository)
- [ ] **AC-MULTI-04 — One PRD, one Kiln.** A PRD can be run by only one instance at a time; a second `kiln run` for the same PRD says it is already running, gives its address and starts nothing.

### Survive Interruptions Without Losing Work

Working through a PRD can take many hours, but each phase is its own session, so an interruption costs at most the phase in progress, and usually not even that. Kiln runs in the terminal it was started from; it doesn't install a background service. In exchange, any interruption is cheap: `kiln run` picks the work back up where it was.

- [ ] **AC-KEEP-01 — Kiln lives in its terminal.** `kiln run` stays in the foreground of its terminal, including after the pull request is ready, until the person interrupts it with Ctrl+C or by closing the terminal. Kiln installs no background or system service. Closing the browser has no effect on Kiln.
- [ ] **AC-KEEP-02 — Ctrl+C is a controlled interruption.** On Ctrl+C, Kiln ends the current session's turn so the session stays resumable, records which phase and session were interrupted, and exits leaving no Claude Code process behind.
  - Superseded in part by: AC-RECOVER-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex interruption stops tracked processes and discloses detached-process limits).
- [ ] **AC-KEEP-03 — Interrupted work is never thrown away.** Changed and new files, partly written tests and uncommitted work in an interrupted phase stay exactly as they were. Kiln never starts a fresh session on top of them on its own.
- [ ] **AC-KEEP-04 — An interrupted session is resumed.** When the phase in progress was interrupted, Kiln first runs the done check: at the next `kiln run`, or on waking when Kiln itself kept running through a sleep. If it passes, the phase is Done. If not, Kiln resumes that same session after the restart confirmation in AC-CLI-01 (or immediately when waking within the same running controller), with its full history, and tells it the session was interrupted and to carry on with the phase. Kiln never resumes a session that ended on its own.
  - Superseded in part by: AC-MSG-03/05 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (unresolved live-message delivery holds automatic recovery and advancement until review and explicit hand-back).
  - Superseded in part by: AC-TAKE-01/02/04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (accepted Claude takeover holds and safe release before deliberate hand-back, including recovered input loss; ordinary settled interruption recovery remains).
  - Superseded in part by: AC-RUN-03 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (Claude billing visibility and launch eligibility only; existing controls remain).
  - Superseded in part by: AC-RECOVER-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex same-conversation recovery and cleanup checks).
  - Superseded in part by: AC-OUTSIDE-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (an interrupted session that worked outside the workspace goes to Needs you instead of being resumed, shown as interrupted with the resume command)
  - Superseded in part by: AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the person can ask Kiln to resume a session that ended on its own)
  - Superseded in part by: AC-AUTO-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Kiln resumes a session that ended on its own when it hit a usage limit)
- [ ] **AC-KEEP-05 — A session that can't be resumed comes to the person.** If an interrupted session can't be resumed, for example because its transcript is gone, the phase goes to Needs you showing, in place of AC-STOP-02's list, when the session was interrupted and its last lines of output, with the fresh-session prompt (AC-STOP-06) and no resume command.
- [ ] **AC-KEEP-06 — Kiln keeps the computer awake while it works.** While a phase's session is working, Kiln stops the computer from going to sleep when idle. This is on by default and can be turned off in the PRD's settings. Kiln lets the computer sleep again whenever no session is working: at Needs you, when paused, when complete, and when Kiln exits.
  - Superseded in part by: AC-AUTO-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the computer is kept awake during a wait too)
- [ ] **AC-KEEP-07 — Kiln is honest about sleep.** Wherever keep-awake is shown, Kiln says that closing the lid can still put the computer to sleep; Documents found also says keep-awake stops idle sleep only.

### Install It With One Command

Kiln's users already run Claude Code from a terminal, so Kiln installs the way their other developer tools do.

- [ ] **AC-INSTALL-01 — One package, one command.** Kiln installs from npm as a single package with one command. That one install includes the `kiln` command and the browser view.
- [ ] **AC-INSTALL-02 — Nothing runs outside the person's machine.** Kiln uses only the Claude Code, Git and GitHub access already on the machine; it has no account, credential, server or cloud service of its own. Nothing Kiln handles leaves the person's machine, apart from what Claude Code and Git already send and Kiln's reads from GitHub (AC-PR-02, AC-PR-04).
  - Superseded in part by: AC-AGENT-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex readiness and existing ChatGPT authentication).
- [ ] **AC-INSTALL-03 — macOS validation, best-effort Linux and Windows.** macOS is the natively validated release platform. Linux and Windows remain available as best-effort targets; their native agent, console, sleep and desktop behavior is not claimed as tested. A release candidate on or targeting `main` must pass full verification and installed-package tests on macOS and build and pack successfully on Linux and Windows. Development pushes and other pull requests run the inexpensive audit, lint, type, unit, build and package checks on Ubuntu; full macOS tests also run locally during development. Linux/Windows native runtime tests are not release gates. Reported native issues are investigated when users encounter them.
- [ ] **AC-INSTALL-04 — Release mistakes fail before expensive checks.** Local pushes to `main` refuse a release whose committed package version has not advanced. Release preparation defaults to one patch increase when needed and preserves an intentional higher version; development commits do not each need a version increase. GitHub validates the package version, lockfile, registry availability and required publishing configuration before starting the release platform checks. The initial unpublished `1.0.0` remains valid.
- [ ] **AC-INSTALL-05 — Successful approved releases are installable and downloadable.** After publication is explicitly enabled, a successful `main` release publishes the checked package to `@ensodynamics/kiln` and creates its version tag and GitHub Release with the package archive and checksum. CI retains the candidate archive before publication. Preparation may configure publishing credentials, but does not merge to `main`, change repository visibility, create a release tag or publish a package.

### Look and Read Like the Design

The v1 mockups are the design of record.

- [ ] **AC-LOOK-01 — The screens match the v1 mockups.** These screens match their mockups in `docs/design/mockups/` for layout, copy, colors and type, with no exceptions: terminal, Documents found, Running, Paused, Disconnected, both Needs you screens and Complete. Phase detail follows [the compact terminal mockup](../../design/mockups/kiln-screen-phase-detail-terminal.html); Running reserves three lines for its output preview.
  - Superseded in part by: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (new-work status and the ordered readiness offer precede earlier delivery; historical delivery facts and unaffected presentation remain).
  - Superseded in part by: AC-LIVE-01/02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (active-session message composer, availability and output/control ordering; unaffected layout remains).
  - Superseded in part by: AC-LIVE-03/04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the paired pause region and reached-pause wording; unaffected layout remains).
  - Superseded in part by: AC-PAGE-02 in [Kiln Needs you handoff](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) (implementation-phase Needs you layout).
  - Superseded in part by: AC-RUN-07 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (Claude billing visibility and launch eligibility only; existing controls remain).
  - Superseded in part by: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (added audit rows and labels retain the existing layout and visual style).
  - Superseded in part by: AC-VIEW-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (agent-specific information on existing screens).
  - Superseded in part by: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the screens this change alters, as the table says)
  - Superseded in part by: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Needs you matches that change's mockups where they differ from v1's)
  - Superseded in part by: AC-AUTO-03, AC-AUTO-04 and AC-LIMIT-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (keep-awake's "While a session works" names the wait too; Documents found, Running, Paused and Disconnected gain the "Resume after a usage limit" row; the Waiting for usage state and its screen)
- [ ] **AC-LOOK-02 — The feature name identifies every browser screen.** The feature name is the largest text except on Phase detail, where it is compact context and the phase title is largest. Phase detail has a clearly outlined back link with a comfortable click target.
  - Superseded in part by: AC-PAGE-02 in [Kiln Needs you handoff](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) (the phase-focused Needs you headline; feature identity stays visible).
- [ ] **AC-LOOK-03 — Phase numbers and titles stay put.** Phase titles come from the phase documents word for word. A phase's number stays in its circle in every state.
- [ ] **AC-LOOK-04 — Each color has one role.** Red is Kiln's accent: the phase in progress, links and the keep-awake checkbox. Amber marks what needs the person: Needs you, a disconnected Kiln or interrupted phase, an error, a confirmation still to give, a usage limit nearly used. Green means done, passed or connected. In the compact session viewer and main current-phase preview, tool names and message bullets establish hierarchy; reviewer and child-agent identities remain explicit, and errors remain amber. Stopped and waiting session-output summaries keep the source-label colors the mockups show. The look is the Enso Method website's dark theme: Instrument Serif headings, Inter body text, and JetBrains Mono for code.
  - Superseded in part by: AC-BILL-03 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (Claude billing visibility and launch eligibility only; existing controls remain).
  - Superseded in part by: AC-AUTO-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the "Resume after a usage limit" checkbox is red too)
- [ ] **AC-LOOK-05 — Every screen says where it is and whose it is.** Above the feature name, every browser screen labels the repository (its name, taken from the Git repository's top-level folder) and the PRD folder (its path from the repository root), without assuming anything about how the person arranges their folders. The top bar carries the Kiln mark on the left and, on the right, the connection status and the Enso Method mark, since Kiln runs only Enso Method PRDs.

### Proven on a Real Feature

The release is accepted in real use, not only on tests of its parts.

- [ ] **AC-PROOF-01 — A small real feature runs end to end.** A real feature of three to five phases runs from `kiln run` to "PR ready for review". It includes one phase that splits itself, one stop that the person finishes through the resume command before continuing with Check again, and one Ctrl+C partway through a phase that `kiln run` then resumes to completion. The required native proof runs on macOS. Windows and Linux native proof is best effort and is not a release gate under AC-INSTALL-03 (Doug, 2026-10-25).
- [ ] **AC-PROOF-02 — Sessions stay on Kiln's branch.** In that test, every session works only on the PRD's worktree and feature branch. This holds even where the person's own instructions or the method's parallel-session rule would otherwise tell it to work elsewhere.
  - Superseded in part by: AC-SPACE-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the session works across the workspace, and may ask Kiln for another repository)

## Out of Scope

Anything this PRD doesn't describe. Ideas for later versions are kept in [Kiln ideas after v1](../../design/kiln-after-v1-ideas.md), not here.

## Depends On

The criteria rely on Claude Code features that were checked on September 30, 2026 against Claude Code 2.1.286's help text and documentation: starting an unattended session with an ID chosen in advance, streaming its output live, refusing prompts with no one there, reopening an unattended session with `claude --resume`, and continuing an interrupted one headlessly with `claude -p --resume`. The effort levels were checked against Claude Code 2.1.292 on October 11, 2026. The account comes from `claude auth status --json`. "The latest Opus" is the `--model opus` alias in Claude Code 2.1.299's help text, but no `claude` command lists the models the signed-in account is offered (AC-START-06); the technical design's route to that list, the Agent SDK, worked against the person's own `claude` in proof gate 1. Usage limits come from running `/usage` headlessly, which was run for real on October 14, 2026 (Claude Code 2.1.299): it is answered locally, with no model call and no usage spent, but the Agent SDK documents its structured `usage_report` as experimental, so its shape may change. Stopping a session by sending it an interrupt over its input, then resuming it, was run for real on macOS on October 17, 2026 (Claude Code 2.1.299); Kiln uses the same route on Windows, where it hasn't been tried, nor has any of Kiln's Windows-specific behavior (the technical design's Windows section). Proof gates 1 and 2 of the architecture proposal ran on macOS on October 17, 2026 (Claude Code 2.1.299), and every item held except the two sleep items, which haven't run yet ([results](../../design/kiln-proof-gates-1-and-2-results.md)). One finding changed the design: a model the list doesn't mark as supporting auto mode runs a session in `default` mode without saying so, so Kiln flags such a model beside Model on Documents found. Proof gate 3, the stop path, ran on macOS on October 18, 2026 with Kiln's own Needs you, resume command and Check again, and every item held ([results](../../design/kiln-proof-gate-3-results.md)). If one doesn't work as documented, the criteria that depend on it come back as product decisions, not silent workarounds.

The mockups also assume the repository is hosted on GitHub, where the pull request opens ("Open on GitHub" on the Complete screen). v1 supports GitHub-hosted repositories only.

## Questions This PRD Leaves Open

None. The [technical design](technical-design.md) settles the architecture proposal's remaining open questions, including the permission mode unattended sessions run in, and its "Left to the technical design" list.

## Pending human actions

- Completed 2026-10-25: Doug confirmed the `ensodynamics` npm organization; the package remains `@ensodynamics/kiln`. The account login is a separate identity.
- Doug: create the proof repository and run the proof feature on macOS (AC-PROOF-01, AC-PROOF-02), parts A and B of [Kiln proof run steps](../../design/kiln-proof-run-steps.md), recording results in [Kiln proof run results](../../design/kiln-proof-run-results.md).
- Native Windows/Linux proof and desktop keep-awake checks are best effort, not pending release actions (Doug, 2026-10-25; AC-INSTALL-03). Required Linux/Windows build-and-pack checks remain enabled; full runtime and installed-package checks run on macOS.
- Doug: explicitly approve publication after the release candidate is reviewed. MIT/public-source intent is confirmed under REL-001; repository visibility, release tags and npm publication remain on hold until that approval. Follow [Kiln npm release steps](../../release/kiln-npm-release-steps.md).
