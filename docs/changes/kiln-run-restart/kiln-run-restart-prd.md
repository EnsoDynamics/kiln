# PRD: Kiln Run Restart

**Source:** Doug's report on 2026-11-11, after a run on a remote development machine stopped Phase 1 before any code and offered no way to run it again or start over, and his request the same day for a start-over button that also works when some phases were built outside Kiln.

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), [Kiln Needs You Handoff](../kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) and [Kiln Missing Worktree Recovery](../kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md).

**Mockup:** [Open the interactive mockup](mockups/kiln-run-restart.html).

## Summary

Kiln gives the person three ways to get a run moving again when the run itself is not the problem. When Kiln can't reopen a phase's conversation, the page says why in plain words and can check again. Any phase that hands back to the person can be **run again** in a fresh session from the work as it stands. And the whole run can be **started over**, as if Kiln had never run it, either from the base branch or from the run's own feature branch. The same choice of starting branch is offered at the very first Start, so a person who built some phases themselves can hand the rest to Kiln.

## Business Context

On 2026-11-11 Doug started a run on a remote development machine. Phase 1's session stopped before writing any code: the work it builds on was not yet on `develop`. Doug merged that work and recorded it, then came back to Kiln. The page showed:

- **Conversation recovery unavailable**, with no reason and no way to try again. The conversation was intact. Kiln had refused it because an unrelated folder in Claude Code's history was writable by the user's own group, which that machine's settings produce routinely. (That check is fixed separately; this PRD covers what the page should have offered.)
- The completion checks for a phase that had not started, two of them failing, and **Mark phase 1 complete**, which would have skipped the phase.
- No way to run Phase 1 again, and no way to start the run over. The only way out was stopping Kiln, moving its saved state aside by hand, removing its worktree and deleting the feature branch.

A run that stops before doing anything, or that the person wants to begin again, is ordinary. Kiln already knows how to set a run up again: when a run's folder goes missing, its **Set the run up again** panel offers the base branch or the run's existing feature branch as a starting point (AC-SETUP-01 to AC-SETUP-07 in Kiln Missing Worktree Recovery). It already treats a phase closed on the branch it starts from as done, whoever closed it. This change offers those abilities when the person asks for them, not only when a folder is missing.

## Acceptance Criteria

### Say Why a Conversation Can't Be Reopened, and Check Again

When Kiln won't reopen a phase's saved conversation, the person should know the actual reason, and fixing it should be enough to get the reply and resume choices back.

- [ ] **AC-REASON-01 — The page names the reason.** When a phase's saved conversation cannot be resumed, the hand-back page's **Conversation recovery unavailable** card states the reason Kiln found, in plain words, in place of today's general sentence. The reasons and their wording:

  | What Kiln found | The card says |
  |---|---|
  | No saved conversation with the session's ID | Claude Code has no saved conversation for this session. |
  | The conversation, or the folder holding it, can be changed by other users of the computer | Kiln won't reopen this conversation because other users of this computer can change it: `<path>`. |
  | The conversation holds no messages Kiln can use | The saved conversation has no messages Kiln can reopen. |
  | The conversation could not be read in time, or could not be read at all | Kiln couldn't read the saved conversation. |
  | A Codex conversation that can't be opened | The reason Kiln already records for it. |

  - Replaces in part: the "A phase's conversation cannot be resumed" row of the screen table in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the page names the specific reason).
- [ ] **AC-REASON-02 — Checking again also checks the conversation.** **Check Phase N again** also checks again whether the saved conversation can be resumed. When it now can, the page offers the reply and resume choices (AC-TERMINAL-01 in Kiln Needs You Handoff) without restarting Kiln.

### Run a Phase Again in a Fresh Session

A phase that hands back to the person, for whatever reason, can be given to a new session that starts from the work as it now stands. This covers a session that stopped before doing anything, a conversation that can't be reopened, and a person who would rather not continue the old conversation.

- [ ] **AC-RERUN-01 — Any phase that hands back can be run again.** The hand-back page offers **Run Phase N again** beside the existing choices, whether or not the saved conversation can be resumed (RERUN-001). It starts a new unattended session for the phase in the run's worktree, as the phase's first session was started (AC-RUN-02 in Kiln v1), with the run's current settings. The earlier session stays in the phase's session history. When the new session ends, the phase is judged by its completion checks as before.
- [ ] **AC-RERUN-02 — The page says what the new session starts from.** Before the person presses it, the choice says how many commits were made for this phase since it started, or that none were, and lists any uncommitted changes in the worktree. The new session's prompt carries the same facts, so it continues from the work rather than redoing it, and it is told why the phase was run again when the earlier session left a final message.
- [ ] **AC-RERUN-03 — Running again keeps the existing limits.** **Run Phase N again** is unavailable, with the reason, while a session of this run is running, while the person holds the run from **Pause & take over**, or while billing restrictions would stop a launch. Pressing it twice starts one session.

### Start the Run Over

The person can begin the whole run again, as if Kiln had never run it, without deleting anything by hand.

- [ ] **AC-OVER-01 — Start over is always within reach.** The feature page offers **Start over** whenever no session of the run is running: at Needs you, paused, interrupted, stopped by a usage limit and after the run completed. It is not offered while the run's folder is missing, since the Folder missing page already sets the run up again.
- [ ] **AC-OVER-02 — Start over uses the setup panel Kiln already has.** **Start over** opens the **Set the run up again** panel of Kiln Missing Worktree Recovery, with its fields, starting points, plan preview and safety rules (AC-SETUP-01 to AC-SETUP-07, AC-SAFE-01 to AC-SAFE-04), titled **Start the run over**. Where it differs:

  | Panel part | On Start over |
  |---|---|
  | Starting points | **The base branch** and **the run's feature branch**, pre-selected by AC-SETUP-02's rule |
  | The run's feature branch, worktree | The run's existing worktree, when its folder exists |
  | The run's feature branch, unavailable | Also when its worktree has uncommitted changes, which the panel lists; Kiln never discards them |
  | What will run | Counts as done only the phases closed on the chosen starting point (AC-OVER-03) |
  | Start's label | **Start over from Phase N** |
  | Cancel | Closes the panel and changes nothing |

- [ ] **AC-OVER-03 — Starting over is a fresh run.** Start archives the current execution, which stays in the feature page's execution history marked **Started over** with its date, and begins a new execution. The new execution counts a phase as done only when it is closed on the starting point. It carries over no phase results, stops, completion waivers, audit results or session history from the archived execution. It keeps the run's settings, billing restrictions and early-merge permission (AC-SAFE-03 in Kiln Missing Worktree Recovery).
  - Replaces in part: AC-SETUP-05 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (a start over from the run's feature branch begins a fresh execution instead of keeping the existing one).
  - Replaces in part: AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the worktree, feature branch and base branch can be chosen again when starting over).
- [ ] **AC-OVER-04 — Nothing is deleted.** Starting over leaves the earlier feature branch, its worktree and any pull request as they were; the panel says so for the starting point that leaves them behind. Kiln's existing Git limits apply: it creates branches and worktrees and never merges, deletes, resets or force-pushes.

### Begin a Run on a Branch That Already Has Work

A person who built some phases without Kiln can start Kiln on the branch that holds that work, and Kiln builds only the phases still open there.

- [ ] **AC-ADOPT-01 — The first Start offers an existing branch.** The settings panel at the first Start (Documents found) gains **Start from**, with two choices: **a new feature branch** from the base branch, the default and today's behavior, and **an existing branch**, picked from the repository's local and remote branches. An existing branch Kiln did not make is accepted. It is unavailable, with the reason, for the cases AC-SETUP-02 in Kiln Missing Worktree Recovery lists for the run's feature branch.
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the first Start can use an existing branch instead of making a new one).
- [ ] **AC-ADOPT-02 — The panel says what will run on it.** With an existing branch chosen, the panel shows the plan read from that branch: its phase count, the phases closed there, which count as done and never run, and the phase that runs first, as AC-SETUP-03 in Kiln Missing Worktree Recovery shows for a restart. Start's label names the first phase.
- [ ] **AC-ADOPT-03 — Kiln works on the branch without rewriting it.** Start creates a worktree of the chosen branch at the panel's folder, after the first-Start folder checks, and gives the shared checkout a local branch tracking the remote one when only the remote has it. Kiln's sessions add commits to the branch and push them; it never rewrites, resets or force-pushes it. The pull request at the end goes from that branch into the base branch.

### Look Like the Mockup

- [ ] **AC-LOOK-01 — The screens match their drawings.** The hand-back page, the Start over panel and the first-Start **Start from** choice match this change's mockup for layout, order and wording, in Kiln's existing visual style. Sample names, paths, commits and counts are illustrative.

## Out of Scope

- Deleting an earlier branch, worktree, pull request or archived execution. The person does that with Git or GitHub as today.
- Starting over one repository of a multi-repository run on its own; the run starts over as a whole, as AC-SETUP-07 in Kiln Missing Worktree Recovery sets it up again.

## Mockup

[Open the interactive mockup](mockups/kiln-run-restart.html). Its preview control switches between the states; it is not a Kiln control. Names, paths and commits are fictional; the Phase 1 case follows the 2026-11-11 run.

| Preview state | Criteria shown |
|---|---|
| Hand-back, conversation unavailable | AC-REASON-01, AC-RERUN-01, AC-RERUN-02, AC-OVER-01 |
| Start the run over | AC-OVER-02, AC-OVER-03, AC-OVER-04 |
| First Start on an existing branch | AC-ADOPT-01, AC-ADOPT-02 |
