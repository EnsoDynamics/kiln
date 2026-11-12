# PRD: Kiln Run Restart

**Source:** Doug's report on 2026-11-11, after a run on a remote development machine stopped Phase 1 before any code and offered no way to continue it or begin again, and the concept he worked through the same day on mockups of Kiln's existing screens.

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), [Kiln Needs You Handoff](../kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) and [Kiln Missing Worktree Recovery](../kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md).

**Mockup:** [Open the interactive mockup](mockups/kiln-run-restart.html).

## Summary

Kiln stops leaving the person at a dead end. A phase that stops always offers a button that has Kiln carry on, and the page says plainly which kind of stop it is. The person can **reset Kiln for a PRD**, which makes Kiln forget its progress and return to the first screen. And that first screen lets Kiln start on a branch that already exists, so a person who built some phases themselves can hand the rest to Kiln.

## Business Context

On 2026-11-11 Doug started a run on a remote development machine. Phase 1's session stopped before writing any code: the work it builds on was not yet on `develop`. Doug merged that work and recorded it, then came back to Kiln. The page showed:

- **Conversation recovery unavailable**, with no reason and no way to try again. The conversation was intact. Kiln had refused it because an unrelated folder in Claude Code's history was writable by the user's own group, which that machine's settings produce routinely. (That check is fixed separately; this PRD covers what the page should have offered.)
- The completion checks for a phase that had not started, two of them failing, and **Mark phase 1 complete**, which would have skipped the phase.
- No way to have Kiln continue Phase 1, and no way to begin again. The only way out was stopping Kiln, moving its saved state aside by hand, removing its worktree and deleting the feature branch.

Doug did what the page suggested: he pressed **Check Phase 1 again**, and it showed the same failing checks for work that had never started. He didn't know where Kiln keeps its state, so he had no way to reset it without help. On an earlier occasion he had an agent write out the terminal commands to do it. Every way forward the page offered was wrong for the situation, and even a working resume would not have been enough: the run's branch had been cut before the missing work reached `develop`, so the phase would have stopped again.

Kiln exists so that a person does not have to supervise agent sessions one at a time. Each of these dead ends sends them back to doing exactly that. A stop should be rare, and when one happens the page should be obvious to someone who has never used Kiln: what happened, and the one button that gets Kiln going again.

The same day Doug raised a second case: someone builds part of a PRD by hand, say its first two phases, and then decides to let Kiln finish it. If that work is on the base branch, Kiln already handles it, since a phase closed on the branch Kiln starts from counts as done. If it is on a branch of its own, Kiln can't use it: the first Start always cuts a new feature branch and refuses one that exists.

## Acceptance Criteria

### Start on a New Branch or One That Already Exists

The first screen, Documents found, gains one choice: where Kiln starts from. A new feature branch is what Kiln does today. An existing branch is for work already begun, by the person or by Kiln before a reset.

- [ ] **AC-FROM-01 — The first screen asks where to start from.** Under **How Kiln will deliver it**, Documents found offers **Start from** with two choices: **A new feature branch**, cut from the base branch, and **A branch that already exists**. A new feature branch is selected unless a branch with the name Kiln would give the new one already exists; then the existing branch is selected, with that branch chosen. With an existing branch selected, **Feature branch** becomes a list of the repository's branches and **Branch from, and PR into** reads **PR into**.
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the first Start can use a branch that already exists).
- [ ] **AC-FROM-02 — The screen shows what will run from there.** **What Kiln found** reads the phase plan from the selected starting point, marks each phase already closed there, and says which phase Kiln starts at. When any phase is closed, Start reads **Start at Phase N**, naming the first open phase, with a line saying the closed phases won't run. When every phase is closed there, Start is unavailable and the screen says why.
- [ ] **AC-FROM-03 — Any branch can be chosen, with three exceptions.** The list holds the repository's local and remote branches, whoever made them.

  | The branch | What the screen does |
  |---|---|
  | Is not checked out anywhere | Kiln makes a worktree of it at the **Worktree** folder, after the folder checks a first Start runs today |
  | Exists only on the remote | The same, after giving the repository a local branch that tracks it |
  | Is checked out in a worktree outside the person's own checkout | **Worktree** shows that folder, fixed, and Kiln works there. Uncommitted files in it are counted on the screen, and the first session is told about them |
  | Is checked out in the person's own checkout | Unavailable, with the reason |
  | Is the base branch | Unavailable; the screen says to choose a new feature branch |
  | Is one git can't add a worktree for, for a reason AC-SETUP-02 in Kiln Missing Worktree Recovery lists | Unavailable, with that reason |

- [ ] **AC-FROM-04 — Kiln adds to the branch and never rewrites it.** Kiln's sessions commit to the chosen branch and push it. Kiln never resets or force-pushes it. At the end the pull request goes from that branch into the base branch; when the branch already has an open pull request into the base, Kiln uses that one. **Starting lets Kiln** names the chosen branch.
- [ ] **AC-FROM-05 — Several repositories use the one branch name.** For a PRD with several repositories, the chosen branch name applies to all of them, as the feature branch does today. A repository that has the branch uses it; one that doesn't gets it cut from its own base. **What Kiln found** reads the plan from the PRD's repository.

### Bring an Untouched Branch Up to Date

A branch cut before something it needs reached the base branch can't build on that work. When the branch has nothing of its own yet, Kiln can safely move it forward. This is the one case in which Kiln moves a branch.

- [ ] **AC-CURRENT-01 — Kiln offers to catch an untouched branch up.** Wherever the person is about to start or continue a phase on a branch that has no commits of its own and whose base branch has commits it lacks, the page says how many, and offers **Bring the branch up to date with `<base>` first**, ticked. With it ticked, Kiln moves the branch forward to the base branch's latest commit and pushes it before the session starts, and the session is told. Kiln never offers it for a branch that has commits of its own, and then shows nothing about it. It appears on Documents found when an existing branch is selected, and on the stopped-phase page beside each button that starts or resumes a session.
  - Replaces in part: AC-SAFE-03 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (Kiln may move forward a branch that has no commits of its own).

### Say What Kind of Stop It Is

A phase can stop in three different ways, and today's page treats them alike. The person should see at once whether an agent ever ran and whether anything was built, because the right next step differs.

- [ ] **AC-CASE-01 — The page tells the three cases apart.** When a phase stops and needs the person, the page's headline and first card follow the table. "Built nothing" means no commits since the phase started and no uncommitted changes in the worktree.

  | What happened | Headline | First card |
  |---|---|---|
  | Kiln could not launch the agent, so no session exists | **Kiln couldn't start Phase N.** | **What Kiln found**: what Kiln ran and the error it got, in Kiln's voice |
  | The agent ran, built nothing, and stopped | **Phase N stopped before building anything.** with a line giving how long the session ran and that there are no commits or changed files | **Last message from** the agent, as today |
  | The agent stopped after building something | **Phase N needs your input.** as today | **Last message from** the agent, as today |

  - Replaces in part: the screen table in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the headline and first card depend on which of the three happened).
- [ ] **AC-CASE-02 — A phase Kiln couldn't launch can be started again.** In the first case the page offers one action, **Start Phase N again**, which launches the phase as its first session would have been (AC-RUN-02 in Kiln v1), with a line saying that nothing is lost because nothing had begun. The page has no reply box, no terminal resume command and no completion checks.
- [ ] **AC-CASE-03 — A phase that built nothing shows no completion checks.** In the second case the page shows **Nothing to check yet** in place of the completion checks and **Mark complete** (UI-001). A person who built the phase somewhere else can press **Check Phase N anyway**, which runs the checks and shows today's section with their results.

### Always a Way for Kiln to Carry On

When Kiln can't reopen a phase's saved conversation, today's page offers only terminal instructions. The reply card should still work, and the person should learn the real reason and be able to clear it.

- [ ] **AC-CARRY-01 — The reply card works without the old conversation.** When the saved conversation can't be reopened, the card that normally reads **Reply here and let Kiln finish** reads **Reply here and let Kiln carry on**. It keeps the reply box, now optional, and its button, **Send reply & continue Phase N**, starts a new session for the phase in the same worktree and on the same branch. The new session is given the person's reply, the earlier session's last message, and what the phase has already produced: the number of commits since it started, and any uncommitted changes. The card shows those same facts before the button is pressed. The earlier session stays in the phase's session history, and when the new session ends the phase is judged by its completion checks as before. A new session is offered only when the conversation can't be reopened (RERUN-001).
  - Replaces in part: the "A phase's conversation cannot be resumed" row of the screen table in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the page offers a Kiln-run new session).
- [ ] **AC-CARRY-02 — The card says why, and how to clear it.** Under that button the card says why the earlier conversation can't be reopened, in the words of the table, and offers **Check again**, which checks the conversation again. When it can now be reopened, the page offers the reply and resume choices (AC-TERMINAL-01 in Kiln Needs You Handoff) without restarting Kiln. **Check Phase N again** also makes this check.

  | What Kiln found | The card says |
  |---|---|
  | No saved conversation with the session's ID | Claude Code has no saved conversation for this session. |
  | The conversation, or a folder holding it, can be changed by other accounts on the computer | Its saved file can be changed by other accounts on this computer, so Kiln won't hand it back to an agent to act on unattended: `<path>`. When removing that access would clear it, the card shows the command that does. |
  | The conversation holds no messages Kiln can use | The saved conversation has no messages Kiln can reopen. |
  | The conversation could not be read in time, or could not be read at all | Kiln couldn't read the saved conversation. |
  | A Codex conversation that can't be opened | The reason Kiln already records for it. |

- [ ] **AC-CARRY-03 — Starting a session keeps the existing limits.** **Send reply & continue Phase N** and **Start Phase N again** are unavailable, with the reason, while a session for this PRD is running, while the person holds the phase from **Pause & take over**, or while billing restrictions would stop a launch. Pressing either twice starts one session.

### Reset Kiln for This PRD

When nothing on the page fixes the situation, the person can make Kiln forget its progress on the PRD and begin from the first screen, without knowing where Kiln keeps anything.

- [ ] **AC-RESET-01 — Reset sits at the bottom of every screen.** Once a PRD has been started, every screen for it ends with a line saying what reset does and a **Reset Kiln for this PRD** button, below everything else on the page. Documents found, before the first Start, has none.
- [ ] **AC-RESET-02 — Reset waits for a working session to stop.** While a session for the PRD is working, the button is unavailable and the line says to stop the session first with **Pause & take over**, or to wait for the phase to end.
- [ ] **AC-RESET-03 — Reset asks first, and says what goes and what stays.** Pressing the button opens a confirmation in place. It lists what Kiln forgets (which phase it was on and each phase's result, its sessions and their output with their count, stops, completion waivers and audit results) and what stays exactly as it is (the feature branch with its commit count, the worktree with its count of uncommitted files, any pull request, and the phases closed in the plan, which Kiln won't build again). It says the reset can't be undone. **Cancel** closes it and changes nothing.
- [ ] **AC-RESET-04 — After a reset Kiln behaves as if it had never run the PRD.** Confirming discards everything Kiln recorded about the PRD, including its settings, session history and earlier deliveries. The page then shows Documents found exactly as a first visit does, and `kiln run` for the PRD starts as a first run does. Because the earlier branch still exists, AC-FROM-01 selects it.
  - Replaces in part: AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (after a reset the worktree, feature branch and base branch are chosen again).
- [ ] **AC-RESET-05 — Reset touches nothing in git.** A reset changes no branch, worktree, commit, pull request or document in any repository.

### Look Like the Mockup

- [ ] **AC-LOOK-01 — The screens match their drawings.** Documents found with **Start from**, the three stopped-phase pages, the reset line and its confirmation match this change's mockup for layout, order and wording, in Kiln's existing visual style. Each is today's screen with the drawn change, not a new screen. Sample names, paths, commits and counts are illustrative.

## Out of Scope

- Deleting a branch, worktree or pull request. The person does that with Git or GitHub as today.
- Bringing a branch that has commits of its own up to date with its base. The person or a session merges as today.
- Resetting one repository of a multi-repository PRD on its own; reset covers the PRD.
- Undoing a reset.

## Mockup

[Open the interactive mockup](mockups/kiln-run-restart.html). Its preview control switches between the states; it is not a Kiln control. Names, paths and commits are fictional; the Phase 1 case follows the 2026-11-11 run.

| Preview state | Criteria shown |
|---|---|
| Documents found, starting from an existing branch | AC-FROM-01, AC-FROM-02, AC-FROM-04 |
| Kiln couldn't launch the agent | AC-CASE-01, AC-CASE-02, AC-RESET-01 |
| The agent stopped before building anything | AC-CASE-01, AC-CASE-03, AC-CURRENT-01 |
| The earlier conversation can't be reopened | AC-CARRY-01, AC-CARRY-02 |
| Reset, the confirmation | AC-RESET-01, AC-RESET-03 |
| A session is working | AC-RESET-02 |
