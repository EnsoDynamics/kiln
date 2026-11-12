# PRD: Kiln Run Restart

**Source:** Doug's report on 2026-11-11, after a run on a remote development machine stopped Phase 1 before any code and offered no way to continue it or begin again, and the concept he worked through the same day on mockups of Kiln's existing screens.

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), [Kiln Needs You Handoff](../kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md), [Kiln Missing Worktree Recovery](../kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md), [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md), [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), [Kiln Development Deployments](../kiln-development-deployments/kiln-development-deployments-prd.md), [Kiln Bot Control](../../prds/kiln-bot-control/kiln-bot-control-prd.md) and [Kiln Live Session Control](../kiln-live-session-control/kiln-live-session-control-prd.md).

**Mockup:** [Open the interactive mockup](mockups/kiln-run-restart.html).

## Summary

Kiln stops leaving the person at a dead end. A phase whose session stops says plainly which kind of stop it is, and offers a button that has Kiln carry on even when the agent couldn't start or its earlier conversation can't be reopened, unless Kiln found a safety problem with a Codex session. The person, or a bot, can **reset Kiln for a PRD**, which makes Kiln forget its progress and return to the first screen. And that first screen lets Kiln start on a branch that already exists, so a person who built some phases themselves can hand the rest to Kiln.

## Business Context

On 2026-11-11 Doug started a run on a remote development machine. Phase 1's session stopped before writing any code: the work it builds on was not yet on `develop`. Doug merged that work and recorded it, then came back to Kiln. The page showed:

- **Conversation recovery unavailable**, with no reason and no way to try again. The conversation was intact. Kiln had refused it because an unrelated folder in Claude Code's history was writable by the user's own group, which that machine's settings produce routinely. (That check is fixed separately; this PRD covers what the page should have offered.)
- The completion checks for a phase that had not started, two of them failing, and **Mark phase 1 complete**, which would have skipped the phase.
- No way to have Kiln continue Phase 1, and no way to begin again. The only way out was stopping Kiln, moving its saved state aside by hand, removing its worktree and deleting the feature branch.

Doug did what the page suggested: he pressed **Check Phase 1 again**, and it showed the same failing checks for work that had never started. He didn't know where Kiln keeps its state, so he had no way to reset it without help. On an earlier occasion he had an agent write out the terminal commands to do it. Every way forward the page offered was wrong for the situation, and even a working resume would not have been enough: the run's branch had been cut before the missing work reached `develop`, so the phase would have stopped again.

Kiln exists so that a person does not have to supervise agent sessions one at a time. Each of these dead ends sends them back to doing exactly that. A stop should be rare, and when one happens the page should be obvious to someone who has never used Kiln: what happened, and the one button that gets Kiln going again.

The same day Doug raised a second case: someone builds part of a PRD by hand, say its first two phases, and then decides to let Kiln finish it. If that work is merged into the base branch and pushed, with each finished phase's own document marked closed, and the person's checkout holds the same PRD documents, Kiln already handles it: the first Start cuts its branch from the base branch on the remote and skips every closed phase. If the work is on a branch of its own, Kiln can't use it: the first Start always cuts a new feature branch and refuses one that exists.

## Acceptance Criteria

### Start on a New Branch or One That Already Exists

The first screen, Documents found, gains one choice: where Kiln starts from. A new feature branch is what Kiln does today. An existing branch is for work already begun, by the person or by Kiln before a reset.

- [ ] **AC-FROM-01 — The first screen asks where to start from.** Documents found offers **Start from** with two choices: **A new feature branch**, cut from the base branch, and **A branch that already exists**. When a branch with the name Kiln would give a new one exists, **A branch that already exists** is selected, with that branch; otherwise **A new feature branch** is. With an existing branch selected, **Feature branch** becomes a list of the repository's branches and **Branch from, and PR into** reads **PR into**.
  - Replaces in part: AC-START-06 and AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the first Start can use an existing branch, chosen from a list).
- [ ] **AC-FROM-02 — The screen shows what will run from there.** **What Kiln found** reads the phase plan from where the first session will start, as the table says, says which, and keeps today's closed marks. Phases closed there count as closed before the run (AC-DEV-03). When some phases are closed there, the count line says how many and that Kiln starts at the first open phase, which is marked, and Start reads **Start at Phase N** with a line saying the closed phases won't run. When every phase is closed there, the count line and Start are today's: Start goes on to the audits and final delivery.

  | Start from | The plan is read from |
  |---|---|
  | A new feature branch | The base branch |
  | A branch that already exists | That branch, or the base branch's latest commit when AC-CURRENT-01's ticked offer moves it |

  - Replaces in part: AC-DEV-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (phases closed on the chosen branch count as closed before the run).

- [ ] **AC-FROM-03 — Any branch can be chosen, except where the table says.** The list holds the repository's local and remote branches, whoever made them. Each branch follows the first row that fits it.

  | The branch | What the screen does |
  |---|---|
  | Is the base branch | Unavailable; the screen says to choose a new feature branch |
  | Is the feature branch of another PRD that Kiln has started | Unavailable, naming that PRD |
  | Is checked out in the person's own checkout | Unavailable, with the reason |
  | Is still recorded by git at a worktree folder that no longer exists | Unavailable, naming that folder: git won't add the branch elsewhere until `git worktree prune` clears the record |
  | Has a local copy behind or diverged from the remote's | Unavailable, with the reason: Kiln's first push would be rejected, and Kiln never resets or force-pushes |
  | Is checked out in another worktree, such as Kiln's own from before a reset | **Worktree** shows that folder, fixed, and Kiln works there. Uncommitted files in it are counted on the screen, and the first session is told about them |
  | Is not checked out anywhere | Kiln makes a worktree of it at the **Worktree** folder, after the folder checks a first Start runs today; a branch only on the remote first gets a local branch that tracks it |

  - Replaces in part: AC-START-06, AC-START-07 and AC-GIT-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an existing worktree, its folder then fixed, and a local branch tracking one only on the remote).
- [ ] **AC-FROM-04 — Kiln adds to the branch and never rewrites it.** Kiln's sessions commit to the chosen branch and push it, and never reset or force-push it. Where a final pull request is due, Kiln uses the branch's open one into the base branch, or opens one. With an existing branch selected, a line says Kiln adds to the branch and never rewrites it, and **Starting lets Kiln** names the chosen branch, that open pull request when there is one, and, while AC-CURRENT-01's offer is ticked, bringing the branch up to date.
  - Replaces in part: AC-PR-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Kiln uses the branch's open pull request instead of opening one).
- [ ] **AC-FROM-05 — Several repositories use the one branch name.** For a PRD with several repositories, the chosen branch name applies to all of them, and the list holds every repository's branches. A repository that has the branch uses it, and its **Branch from, and PR into** reads **PR into**; one that doesn't gets it cut from its own base. A branch AC-FROM-03 makes unavailable in any repository is unavailable, naming that repository, and so is one whose existing worktrees don't share one workspace folder. **What Kiln found** reads the plan from the PRD's repository.
  - Replaces in part: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a repository that has the branch uses it).

### Bring an Untouched Branch Up to Date

A branch cut before something it needs reached the base branch can't build on that work. When the branch has nothing of its own yet, Kiln can safely move it forward. This is the one case in which Kiln moves a branch.

- [ ] **AC-CURRENT-01 — Kiln offers to catch an untouched branch up.** A branch behind its base branch, with no **commits of its own** (commits its base branch lacks) and nothing uncommitted in its worktree, gets **Bring the branch up to date with `<base>` first**, ticked, with how many commits it is behind, in each place the table names. Ticked, Kiln moves the branch forward to the base branch's latest commit and pushes it before the session starts, and tells the session; if that fails, nothing starts and Kiln says why. Any other branch shows nothing. With several repositories there is one offer, which moves each repository's branch that qualifies and gives its count.

  | Where | What the offer covers |
  |---|---|
  | Documents found, with an existing branch selected | **Start** |
  | A stopped phase's page (AC-CASE-01), once, above the ways to resolve it | Every button on the page that starts or resumes this phase's session, not **Mark complete** |
  | A command that starts or resumes a stopped phase's session, not a held one's: `kiln reply`, `kiln resume` and AC-CARRY-04's | The command, as if ticked, unless it is told to leave the branch as it is |

  - Replaces in part: AC-GIT-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-SAFE-03 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (Kiln may move forward, and push, a branch that has no commits of its own).
  - Replaces in part: AC-ACT-02 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (`kiln reply` and `kiln resume` may first bring the branch up to date).

### Say What Kind of Stop It Is

A phase can stop in three different ways, and today's page treats them alike. The person should see at once whether an agent ever ran and whether anything was built, because the right next step differs.

- [ ] **AC-CASE-01 — A stopped phase's headline says which case it is.** This theme, Always a Way for Kiln to Carry On and AC-CURRENT-01's stopped-phase row change two of today's pages (AC-CARRY-06 changes one held page besides), each a **stopped phase**'s page: the handoff page headed **Phase N needs your input.**, and the Needs you page headed **Phase N ended before it was done.** with the line **Kiln couldn't start this session.** A phase held by **Pause & take over** or a message Kiln isn't sure was delivered keeps today's page whole, apart from the reset line and AC-CARRY-06's case, until the hold ends. So does every other page, for example **Phase N hasn't started.** or **Phase N hasn't passed its checks.** A phase's **work** is two things: the commits the phase's branch has gained in any of the PRD's repositories since the phase started, leaving out any that came from the base branch, and uncommitted changes in any of the PRD's worktrees. A phase with neither has **built nothing**. A stopped phase's headline follows the table.

  | The phase | Headline |
  |---|---|
  | No session of it has begun a conversation | **Kiln couldn't start Phase N.** |
  | A session began one, and the phase has built nothing | **Phase N stopped before building anything.** with a line giving how long its latest conversation ran and that it has built nothing |
  | A session began one, and the phase has built something | **Phase N needs your input.** as today |

  - Replaces in part: the Scope table in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the headline).
- [ ] **AC-CASE-04 — The first card shows the latest launch.** On a stopped phase's page, the first card shows the phase's latest launch: when it began a conversation, today's **Last message from** the agent; when the agent's process didn't start or exited before beginning one, **What Kiln found**, saying what Kiln ran and the error it got, then any earlier conversation's **Last message from** card.
  - Replaces in part: the Scope table in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the first card).
- [ ] **AC-CASE-02 — A phase Kiln couldn't launch can be started again.** In AC-CASE-01's first case the page offers one way to start the phase, **Start Phase N again**, which launches the phase's first session again (AC-RUN-02 in Kiln v1), with a line giving the phase's work so far. The page has no reply box and no terminal instructions.
  - Replaces in part: the Scope table and AC-TERMINAL-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (this page replaces the reply, terminal and recovery flows).
  - Replaces in part: AC-STOP-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (another way for a session to start after a stop).
- [ ] **AC-CASE-03 — A phase that built nothing shows no completion checks until asked.** While a stopped phase has built nothing and its completion checks haven't run since it stopped, the page shows **Nothing to check yet** in place of those checks only (a row giving the stop's own reason still shows), with **Check Phase N anyway** and a line saying Kiln checks only the PRD's worktree. Once the checks have run, today's section shows their results, with **Mark complete** offered as today once a check still fails (AC-WAIVE-02 in Kiln Completion Waivers), and the sentence above it says the phase has built nothing.
  - Replaces in part: AC-WAIVE-03 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (for a phase that built nothing, the sentence above Mark complete names no missing work).
  - Replaces in part: AC-STOP-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-NEXT-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (no checks shown until asked).

### Always a Way for Kiln to Carry On

When Kiln can't reopen a phase's saved conversation, today's page offers only terminal instructions, and a phase paused for takeover waits for good. The reply card should still work, for a bot as well as in the browser, and the person should learn the real reason and be able to clear it.

- [ ] **AC-CARRY-01 — Kiln carries on only when the conversation can't be reopened.** When a stopped phase (AC-CASE-01) has had a conversation, the reply card follows the table for the phase's latest conversation.

  | Kiln finds | The reply card |
  |---|---|
  | The conversation can be reopened | Today's **Reply here and let Kiln finish**, with reply and resume |
  | It can't be, for a reason in AC-CARRY-02's table | **Reply here and let Kiln carry on** (AC-CARRY-05), beside today's card for a fresh session in the terminal, worded as drawn |
  | A Codex safety problem (an earlier Codex session's cleanup or dispatch is unresolved), whatever else holds | Today's **Conversation recovery unavailable**, beside today's card for a fresh session in the terminal |

  - Replaces in part: the "A phase's conversation cannot be resumed" row of the Scope table in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the page offers a Kiln-run new session).
  - Replaces in part: AC-NEXT-01 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (row 2's terminal card has no resume-unavailable note).
- [ ] **AC-CARRY-05 — Carrying on starts a new session that knows what was done.** The carry-on card keeps the reply box, now optional. Its button, **Send reply & continue Phase N**, first checks completion as resuming does, with today's already-complete choice, and otherwise starts a new session for the phase in the same worktree and on the same branch, given the person's reply, the agent's last message, and the phase's work (AC-CASE-01), which the card also shows. The earlier session stays in the phase's history, and the new one is judged by the completion checks as before.
  - Replaces in part: AC-STOP-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (another way for a session to start after a stop).
- [ ] **AC-CARRY-02 — The card says why, and how to clear it.** Under **Send reply & continue Phase N** the card says why the earlier conversation can't be reopened, in the words of the table, and offers **Check again**. When it can now be reopened, the page offers the reply and resume choices (AC-REPLY-01 and AC-TERMINAL-01 in Kiln Needs You Handoff) without restarting Kiln. **Check Phase N again** and **Check Phase N anyway** also check the conversation again.

  | What Kiln found | The card says |
  |---|---|
  | No saved conversation with the session's ID, or an ID no saved conversation could have | Claude Code has no saved conversation for this session. |
  | The conversation's file, or a folder holding it, can be changed by other accounts, is a link, or belongs to another account | Kiln won't hand the saved conversation back to an agent to act on unattended, because `<path>`, whichever applies, can be changed by other accounts on this computer, is a link, or belongs to another account. When removing other accounts' access would clear it, the card shows the command that does. |
  | The saved file isn't an ordinary file | The saved conversation isn't an ordinary file: `<path>`. |
  | The conversation holds no messages Kiln can use | The saved conversation has no messages Kiln can reopen. |
  | The conversation could not be read in time or at all, or holds a message larger than Kiln reads | Kiln couldn't read the saved conversation. |
  | Kiln reopened it, and the agent stopped before the conversation began | Kiln tried to reopen the conversation, and the agent stopped before it began. |
  | A Codex conversation that can't be opened | The reason Kiln records for it. |

- [ ] **AC-CARRY-03 — Starting a session keeps the existing limits.** **Send reply & continue Phase N** and **Start Phase N again** are unavailable, with the reason, while:

  - a session for this PRD is running
  - billing restrictions would stop a launch
  - for **Start Phase N again** only, Kiln has found a Codex safety problem (AC-CARRY-01)

  Pressing either twice starts one session.
- [ ] **AC-CARRY-04 — Bots can start these sessions too.** **Send reply & continue Phase N** and **Start Phase N again** each have a command with the button's effect, eligibility and limits (AC-CARRY-03), accepted only where the button would be offered. Each follows bot control's rules for changing commands (AC-ACT-04, AC-ACT-05 and AC-CLI-01/02 in Kiln Bot Control). The continue command takes an optional reply in the same forms as `kiln reply`. Neither asks for confirmation, and neither's name or output promises to resume the earlier conversation.
  - Replaces in part: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (two more commands join the controls for a run already started).
  - Replaces in part: AC-STOP-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (two more ways for a session to start after a stop).
- [ ] **AC-CARRY-06 — A held phase can carry on when its conversation can't be reopened.** The page changes for a phase when:

  - it is held by **Pause & take over** or by a message Kiln isn't sure was delivered
  - its attempt has ended
  - the hold can't be released because the saved conversation can't be reopened, for a reason in AC-CARRY-02's table

  In place of today's wait text and card, the page shows **Reply here and let Kiln carry on** (AC-CARRY-05, with AC-CARRY-02's reason and **Check again**) beside today's card for a fresh session in the terminal. Above them, each uncertain message shows with its acknowledgement (AC-MSG-05 in Kiln Live Session Control), and **Send reply & continue Phase N** is unavailable until each is acknowledged; the continue command takes the acknowledgements as `kiln resume` does. The button and the terminal card's copy buttons are unavailable, saying why, while Claude is open on that conversation or work the attempt started is still running (AC-TAKE-02 and AC-TAKE-04 there). Starting the carry-on session, or advancing from the button's already-complete choice, ends the hold; neither needs the hold released. An uncertain message reaches the new session only if the person's reply includes it.
  - Replaces in part: AC-LIVE-02, AC-TAKE-01, AC-TAKE-02, AC-MSG-05, AC-BACK-04 and AC-BOT-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (for a hold whose conversation can't be reopened, the page offers these two cards in place of the explanation that terminal use must wait, and starting a Kiln-run new session, or advancing from the carry-on button's already-complete choice, ends the hold without its release).

### Reset Kiln for This PRD

When nothing on the page fixes the situation, the person can make Kiln forget its progress on the PRD and begin from the first screen, without knowing where Kiln keeps anything. A bot can do it too, and is told first what it costs.

- [ ] **AC-RESET-01 — Reset sits at the bottom of every screen.** Once a PRD has been started, every screen for it ends with a line saying what reset does and a **Reset Kiln for this PRD** button. Documents found, before the first Start, has none.
- [ ] **AC-RESET-02 — Reset waits for Kiln to stop working.** While Kiln is working on the PRD (a session running, or Kiln's own work between sessions), the button is unavailable and the line says to stop the session first with **Pause & take over** where offered, or to pause after the current phase or audit and reset once it ends.
- [ ] **AC-RESET-03 — Reset asks first, and says what goes and what stays.** Pressing the button opens a confirmation in place that lists the table's lines, leaving out any with nothing to name, and says the reset can't be undone. With several repositories, the branch and worktree counts are per repository. **Cancel** closes it and changes nothing.

  | Kiln forgets | Stays exactly as it is |
  |---|---|
  | Which phase it was on, and each phase's result | The feature branch, counting its commits of its own (AC-CURRENT-01) |
  | Its sessions and their output, with their count | The worktree, with its count of uncommitted files |
  | Stops, completion waivers and audit results | Any pull request |
  | Its settings for the PRD | The phases closed in the plan on the feature branch |
  | Its record of earlier deliveries | |

- [ ] **AC-RESET-04 — After a reset Kiln behaves as if it had never run the PRD.** Confirming discards everything Kiln recorded about the PRD. The page then shows Documents found as a first visit does (AC-FROM-01), after the start checks a first `kiln run` makes: a check that fails is named where the passed ones are listed, in the words `kiln run` prints, and Start is unavailable, with the note **Fix what failed, then reload.**, until a reload finds them all passing. `kiln run` for the PRD starts as a first run does.
  - Replaces in part: AC-START-06, AC-START-07 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (after a reset the settings, worktree and branches are chosen again).
  - Replaces in part: AC-START-02 and AC-START-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (after a reset, a failing start check shows on Documents found).
- [ ] **AC-RESET-05 — Reset touches nothing in git.** A reset changes no branch, worktree, commit, pull request or document in any repository.
- [ ] **AC-RESET-06 — Bots can reset too, and the help says what it costs.** Reset has a command with the button's effect and eligibility, so it is refused while AC-RESET-02 makes the button unavailable. The command resets at once, with no confirming flag or step; its help is the warning. The help says plainly that a reset can't be undone, that Kiln forgets everything in AC-RESET-03's first column, and that afterwards nothing runs until someone opens the browser view with `kiln run <PRD-path>` and presses Start on Documents found, because a run is set up only in the browser. The command follows bot control's rules for changing commands (AC-ACT-04, AC-ACT-05 and AC-CLI-01/02 in Kiln Bot Control), and the reset's own result stays queryable afterwards. `kiln status` lists it among a started PRD's controls.
  - Replaces in part: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (one more command joins the controls for a run already started).

### Look Like the Mockup

- [ ] **AC-LOOK-01 — The screens match their drawings.** Documents found with **Start from**, the three stopped-phase pages, the held page AC-CARRY-06 changes, the reset line and its confirmation match this change's mockup for layout, order and wording, in Kiln's existing visual style. Each is today's screen with the drawn change, not a new screen. Sample names, paths, commits and counts are illustrative.

## Out of Scope

- Deleting a branch, worktree or pull request. The person does that with Git or GitHub as today.
- Bringing a branch that has commits of its own, or uncommitted changes, up to date with its base. The person or a session merges as today.
- Resetting one repository of a multi-repository PRD on its own; reset covers the PRD.
- Undoing a reset.
- How a stopped audit or final delivery is shown. Apart from the reset line, those pages keep today's recovery.

## Mockup

[Open the interactive mockup](mockups/kiln-run-restart.html). Its preview control switches between the states; it is not a Kiln control. Names, paths and commits are fictional; the Phase 1 case follows the 2026-11-11 run.

| Preview state | Criteria shown |
|---|---|
| Documents found, starting from a branch someone built phases on | AC-FROM-01, AC-FROM-02, AC-FROM-03, AC-FROM-04, AC-RESET-01 (no reset line before the first Start) |
| Documents found after a reset, on Kiln's untouched branch | AC-FROM-01, AC-FROM-02, AC-FROM-03, AC-FROM-04, AC-CURRENT-01, AC-RESET-04, AC-RESET-01 (no reset line, as on a first visit) |
| Kiln couldn't launch the agent | AC-CASE-01, AC-CASE-04, AC-CASE-02, AC-CASE-03, AC-RESET-01 |
| The agent stopped before building anything | AC-CASE-01, AC-CASE-04, AC-CASE-03, AC-CARRY-01, AC-CURRENT-01, AC-RESET-01 |
| The earlier conversation can't be reopened, in a phase that built nothing (as on 2026-11-11; the reason shown is illustrative) | AC-CASE-01, AC-CASE-04, AC-CASE-03, AC-CARRY-01, AC-CARRY-05, AC-CARRY-02, AC-CURRENT-01, AC-RESET-01 |
| A phase held for takeover whose conversation can't be reopened | AC-CARRY-06 (its note says what differs for a message Kiln isn't sure was delivered), AC-CARRY-05, AC-CARRY-02, AC-CASE-01 (a held page keeps today's headline), AC-RESET-01 |
| Reset, the confirmation | AC-RESET-01, AC-RESET-03 |
| A session is working | AC-RESET-02 |
