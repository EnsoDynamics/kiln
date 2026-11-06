# PRD: Kiln Missing Worktree Recovery

**Source:** Doug's request on 2026-11-06, after a saved run reported a stale phase as needing him, and his review of the first mockup the same day.

**Changes:** [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) and [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md).

**Mockup:** [Open the interactive Folder missing mockup](mockups/kiln-missing-worktree-recovery.html).

## Summary

A saved Kiln run works in its own folder, a git **worktree** on the run's feature branch. When that folder no longer exists, Kiln stops and says so plainly. It shows which folder is gone, what Kiln can still find about the work (the branch, and the plan on the base branch), and what it could not check. It then asks the person to set the run up again, with the same settings Documents found showed when the run first started: where to start from, the folder and feature branch, the model and effort. Kiln fills these in from what it found, and the agent stays the one the run chose. Nothing happens until the person presses Start. Kiln no longer reports a phase as "needs you" from an old record of a folder that is gone.

## Business Context

On 2026-11-06 Doug ran `kiln run` on a PRD, from its repository's shared checkout on `develop`. Kiln printed "4 of 5 phases done · phase 5 needs you". Both halves were wrong.

The saved run was started on 2026-10-23 in its own worktree on the PRD's feature branch. That folder had since been deleted. The branch had been merged into `develop`, and the PRD there had grown to 13 phases, 9 of them closed. Phase 5 was among them, closed on 2026-10-24. Kiln's plan check failed because the folder was missing (`ENOENT … lstat '<the deleted folder>'`). Kiln then fell back to its saved 5-phase plan, and showed phase 5's completion result from 2026-10-24, read from the old branch at its last commit. Nothing on the screen said the folder was gone, or that the plan had moved on.

Underneath, the run had already been recorded as unavailable. The person was shown a confident and stale answer instead, with no way out except investigating Kiln's saved state by hand. A missing folder is an ordinary event: worktrees are removed after a merge, cleaned up in bulk, or moved. Recovering from one is a deliberate new setup, so it should look and behave like the setup the person already knows, not like a repair button.

## Scope

This covers an **unfinished** saved run, in one repository or several, whose worktree for any of its repositories is missing, or whose saved path now holds something else. A finished run whose old worktree is gone is already handled by completed-feature discovery (AC-FIND-02 in Kiln Continue Added Phases) and is unchanged.

**Terms:**

- The **saved folder** is the worktree path the run recorded for a repository at setup. It is **the run's worktree** when a folder is there, git run inside it finds the shared checkout's repository, and git keeps a record of a worktree at that path that it does not mark as stale. Git's list of worktrees alone does not decide it: git keeps a record at a path when a worktree is deleted or replaced by hand. A saved folder that is not the run's worktree is **missing** when nothing is at that path, and **holds something else** when a folder is there, such as a plain folder or another repository's checkout. The run's worktree is the run's folder whatever it has checked out: a branch switch or detached HEAD there is for the done check (AC-DONE-01 in Kiln v1), not Folder missing.
- The run's **feature branch** is the shared checkout's branch of that name, or the remote's when the shared checkout has none. It is **gone** when it exists in neither.
- **Checked out in another folder** means git records the feature branch at a folder that exists and is not the run's worktree: another folder, or a saved folder that now holds something else (git keeps its record when a worktree is replaced by hand). Git's record of a missing saved folder is not another folder.
- The **shared checkout** is the person's own clone of the repository, the one `kiln run` names.
- The **base branch** is the branch the run delivers into, `develop` by default, read where AC-FACTS-02 says.
- The **setup panel** is the recovery form described under "Set the run up again". It has the settings Documents found shows before a first Start (AC-START-06 in Kiln v1).

## Acceptance Criteria

### Notice the missing folder before anything else

Kiln checks that each of the run's folders is there before it reads the plan, reports progress or judges a phase. A missing folder is the answer, and the screen leads with it.

- [ ] **AC-GONE-01 — Every entry point checks the folders first.** Before Kiln reads the active plan, reports phase progress, runs a completion check, resumes or launches a session, or advances, it checks that each repository's saved folder is the run's worktree. This applies at `kiln run`, `kiln status` and `kiln handoff`, on opening or reloading the feature page, at every hand-back or Verify action, and before every session launch.
  - Replaces in part: AC-DONE-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (when `kiln run` is run on a stopped feature, and at Check again, Kiln checks the folders before the done check; a missing folder shows Folder missing instead).
  - Replaces in part: AC-VERIFY-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (Verify reruns no completion check while a folder is missing; it shows Folder missing).
  - Replaces in part: AC-AUTO-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (reopening a feature that was waiting for usage, with a folder missing, shows Folder missing rather than the restart review, and starts no wait).
  - Replaces in part: AC-SEE-05 and AC-SEE-08 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (while a folder is missing, `kiln handoff` says so and returns no resume command, continuation prompt or fresh-session instructions).
- [ ] **AC-GONE-02 — A missing folder replaces the phase status.** When any saved folder fails AC-GONE-01, the terminal and the feature page show the **Folder missing** state instead of a phase state. Completion results recorded earlier stay visible only in the run's history, labelled with when they were checked.
  - Replaces in part: AC-START-03, AC-WATCH-01 and AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an underway feature with a missing folder opens on Folder missing; the header shows that state, and earlier phase results appear only as history).
  - Replaces in part: AC-SEE-02 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (while a folder is missing, a run reports Folder missing instead of its current phase).
  - Replaces in part: AC-HANDBACK-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (when the assigned worktree itself is missing, Kiln stops with this state rather than treating it as an unreadable active plan; it still never runs from another checkout without the person's choice).
- [ ] **AC-GONE-03 — The terminal says it in plain words.** `kiln run` prints that the run's folder is missing, the folder's path, that nothing has run, the one-line summary of the base branch's plan and the saved plan's label (AC-FACTS-02), and the address of the page where the person sets the run up again. It prints no phase count or phase status from the saved plan.
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an unfinished run with a missing folder reports that, not its progress, and neither the restart review nor `--resume` launches anything).

### Show what Kiln still knows

The person decides better when they can see where the work actually is. Kiln looks in the places that are still there, read-only, and says what it found and what it could not check.

- [ ] **AC-FACTS-01 — The missing folder and the branch are described.** For each repository the page shows:
  - when Kiln checked;
  - the saved folder, its branch and the date it was set up, and whether it is missing or holds something else (and what it holds);
  - for a missing folder, whether git still records a worktree there;
  - whether the run's feature branch still exists in the shared checkout and on the remote, with its latest commit and date, both when they differ, and whether the shared checkout's is then ahead of, behind or diverged from the remote's;
  - whether the feature branch's latest commit is already in the base branch. A commit counts as in the base branch when the base branch contains it, or when a pull request merge Kiln has recorded for the run contains it and the base branch contains that merge. This is the same test completed-feature discovery applies to work completed outside a run (AC-FIND-03 in Kiln Continue Added Phases). A Closed line or an empty diff never counts as a commit being in the base branch;
  - whether the branch is checked out in another folder, and that folder's path;
  - the last commit Kiln recorded as pushed for the run, and whether that commit is on the remote or in the base branch.
- [ ] **AC-FACTS-02 — The plan is compared where it now lives.** Kiln reads the base branch at the remote's latest commit when the remote can be reached, and at the shared checkout's own base branch otherwise, and the page names which it read and the commit (as AC-FIND-02 in Kiln Continue Added Phases does). The page shows the plan Kiln saved for the run (its phase count, how many were done, and the date it was read) beside the base branch's plan (its phase count, how many are closed, and the next unfinished phase). It labels the saved plan by comparing it with the plan where the run's latest work now lives: the feature branch's plan when that branch has work not in the base branch, otherwise the base branch's plan.

  | Compared with that plan, the saved plan (first row that applies) | Label |
  |---|---|
  | lacks phases or closed phases that plan has | **Out of date** |
  | agrees with it | **Matches** the branch or the base branch |
  | records closed phases that plan lacks | **Ahead of** that plan (AC-SAFE-02 names the phases) |

  Counts follow the existing rules for counting phases (AC-FIND-03 in Kiln Continue Added Phases).
  - Replaces in part: AC-HANDBACK-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (while a run's folder is missing, Kiln reads the plan in the base branch and the feature branch, read-only, outside the assigned worktree).
- [ ] **AC-FACTS-03 — What can't be known is said.** The page states that Kiln cannot recover changes never committed in the run's old folder, nor, when the feature branch is gone, its commits that were never pushed. When any read in AC-FACTS-01 or AC-FACTS-02 fails, the page:
  - names what could not be checked;
  - offers **Check again**;
  - shows no label, starting point or default that depends on the unchecked fact; the saved plan then reads **Not compared**.

### Set the run up again

Recovering from a missing folder means setting the run up again in a new folder. The person sees the choices they made at the first Start, in the same words as Documents found, already filled in from what Kiln found, and starts the run themselves. Kiln never works directly in the base branch or in the person's own checkout.

- [ ] **AC-SETUP-01 — The setup panel has the first-Start settings, in the first-Start words.** The Folder missing page has a setup panel titled **Set the run up again**, in this order:
  1. **Start from**, the choice of starting point (AC-SETUP-02).
  2. **What will run** (AC-SETUP-03).
  3. **How Kiln will deliver it**: the parts of Documents found's settings panel, with its fields, labels, help text and order:
     - **Worktree**, or for several repositories **Workspace folder** and the **Repositories** list with each repository's base (AC-SETUP-07);
     - **Feature branch**;
     - **Branch from, and PR into**, and the line on what sessions may do in a repository they add;
     - **Agent** with the account lines, **Model**, the line that listed models do not guarantee account access, and **Effort**;
     - the keep-awake and **Resume after a usage limit** switches;
     - **Pushes** and **Ends at**;
     - the early-merges panel when the run has early merges on, and the billing panel.
  4. **Before you start**, with the **Starting lets Kiln** list in Documents found's words and the Start button.

  Where recovery differs from Documents found:
  - the worktree or workspace folder, and the feature branch, each get one more help line saying whether it is new or the run's saved one; a new branch's line says it keeps this run's earlier branch and pull request separate;
  - a fixed field is shown as Documents found shows a field Start already set up, and **Branch from, and PR into** then reads **PR into**. The agent is always fixed, with Settings' words "Agent fixed for this PRD." (AC-AGENT-02 in Kiln Codex Support). Starting from the existing feature branch also fixes the feature branch, each repository's base and, for several repositories, the workspace folder;
  - the early-merges and billing panels show what the run saved, and Start keeps the run's early-merge choice and billing restrictions (AC-SAFE-03);
  - the **Starting lets Kiln** list adds the lines AC-SAFE-01, AC-SAFE-03 and AC-SAFE-04 name;
  - the refinement confirmation (AC-START-05 in Kiln v1) is left out: the person confirmed it at the first Start, and a continuation asks for none either.

  The fields start with the run's saved choices, except where AC-SETUP-02 sets a default. Every field not fixed can be changed before Start, as on Documents found.
  - Replaces in part: AC-START-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the settings panel is also shown, pre-filled, when an unfinished run's folder is missing).
  - Replaces in part: AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the worktree, feature branch and base branch, fixed once the first phase starts, can be chosen again on the Folder missing setup panel).
- [ ] **AC-SETUP-02 — The starting point and defaults follow the facts.** The panel offers two starting points, **the base branch** and **the run's existing feature branch**. It pre-selects the existing feature branch when that branch is available and has work not yet in the base branch, and the base branch otherwise. The existing feature branch is unavailable, with the reason, when:
  - it is gone;
  - it is checked out in another folder, which the panel names, as git allows a branch in one folder at a time;
  - git still records it at another folder that no longer exists, which the panel names, as git will not add the branch elsewhere until that record is cleared and Start clears no record but the saved folder's (AC-SAFE-04);
  - the shared checkout's branch is behind or diverged from the remote's, as its first push would be rejected and Kiln never resets or force-pushes.

  The base branch is unavailable, with the reason, when starting from it would run no phase: every phase is closed there and none this run completed needs to run again. When the pre-selected starting point is unavailable and the other is available, the panel pre-selects the other. When neither starting point is available, the panel offers only **Check again**.

  The folder and feature-branch defaults follow the starting point:

  | Starting point | Feature branch | Worktree |
  |---|---|---|
  | The base branch | A new branch: the run's feature branch name (`feature/<PRD folder name>` unless the person changed it at the first Start) with the next free numeric suffix (`-2`, `-3`), even when the old branch is gone | AC-START-07's layout with the same suffix on the PRD folder name: `.worktrees/<PRD folder name>-2/<repository>` |
  | The existing feature branch | That branch | The saved folder when it is missing; AC-START-07's layout with the next free suffix when it holds something else |
- [ ] **AC-SETUP-03 — The panel says what will run.** For the selected starting point, the panel shows the plan that start will follow before Start is pressed:
  - its phase count and how many are done;
  - the phases still to run, in plan order, and which one runs first;
  - that earlier phase results, sessions and delivery links are kept.

  Each starting point's choice shows that start's plan in one line (its latest commit, phase count and how many are done), whether it holds all of this run's work, and whether it is behind the base branch's plan. Start's label names the first phase ("Set up & start Phase 10"). Changing the starting point or the base branch refreshes the panel before Start can be pressed.
- [ ] **AC-SETUP-04 — Starting from the base branch is a fresh execution.** Start creates the new feature branch from the base-branch commit the page showed, and the folder as a worktree of it. Then it runs the remaining plan as a finished run's accepted continuation does. Every phase closed in the base branch counts as done, whoever closed it, and never runs again. The feature branch name must not already exist. Every later `kiln run` for the PRD uses the new branch and folder.
  - Replaces in part: AC-CONTINUE-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (for a start from the base branch here, a Closed line in the base branch is enough to count a phase completed elsewhere as done).
  - Replaces in part: AC-CONTINUE-06 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (an unfinished run whose folder is missing can also restart from the current base branch, through the setup panel's Start).
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the PRD can get a second feature branch and worktree this way; later runs use those, not the first ones).
  - Replaces in part: AC-STOP-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Start on the Folder missing page is another way for work to start after a stop).
- [ ] **AC-SETUP-05 — Starting from the existing feature branch makes a new worktree on it.** Start creates a worktree of the run's feature branch at the chosen folder, after the checks a worktree path gets at a first Start (new or empty, not inside a checkout), clearing git's record of the missing saved folder first where AC-SAFE-04 allows. It creates no new branch: when only the remote has the feature branch, Start gives the shared checkout its branch of the same name, tracking the remote one at its latest commit. The run keeps its existing execution, and pressing Start is the person's explicit Resume (AC-CLI-01 in Kiln v1). Kiln reads the plan in the new worktree and runs the done check for the phase the run stopped on. If the run stopped in Needs you and that check still fails, it stays in Needs you; otherwise Kiln resumes the interrupted session (AC-KEEP-04 in Kiln v1) or launches the first unfinished phase.
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a later `kiln run` may create a new worktree on the run's existing feature branch, and its local branch when only the remote has it).
- [ ] **AC-SETUP-06 — A folder put back by hand is found.** When a saved folder is missing and the panel shows the run's existing feature branch as an available starting point (AC-SETUP-02), the page says that a person who moved or removed the folder on purpose can put it back at the saved path, and shows the git command that does so, one that also works while git still records the missing folder; otherwise it shows no command. **Check again** reruns AC-GONE-01 and leaves the Folder missing state once every folder passes.
- [ ] **AC-SETUP-07 — A run with several repositories has one starting point.** The run keeps one workspace folder and one feature branch name in every repository (AC-SPACE-01 in Kiln Multi-Repo Delivery), so the panel offers one starting point for the whole run and shows AC-FACTS-01 for each repository. AC-SETUP-02 is read across the repositories: the feature branch has work not in the base branch, or is unavailable, when that is so in any of them.
  - **Starting from the base branch** sets up a new workspace folder with AC-SETUP-02's suffix, such as `.worktrees/<PRD folder name>-2/`, and a new feature branch in every repository, as a continuation does, each from its own base branch.
  - **Starting from the existing feature branch** re-creates only the failing repositories' worktrees, at their saved folders, and keeps the others as they are. It is unavailable, with the reason, when any failing repository's saved folder holds something else.
  - Replaces in part: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a run whose folder is missing either sets up a new workspace and feature branch in every repository or re-creates the missing worktrees in its saved workspace, with the panel's settings).

### Keep the person's work and permissions safe

Recovery changes nothing until the person presses Start, and Start does only what the panel showed.

- [ ] **AC-SAFE-01 — Nothing changes until Start.** Showing the Folder missing state, and editing the panel, only read. They write to no checkout, branch, remote or saved setting, and start no session; Kiln still records the end of a session that was already running. Start rechecks the facts and the plan it showed before acting. When they have changed, Kiln shows the refreshed page instead of acting. While a session the run started is still running, Start does nothing. The page says to wait for it to end, or, for a session this Kiln started, to stop Kiln. A session left by an earlier Kiln that Kiln stops when it restarts is stopped by Start instead, and the Starting lets Kiln list says so. The run's saved settings change only when Start succeeds. A Start that fails partway says what it did and what remains, and the next Start does only what is still missing.
- [ ] **AC-SAFE-02 — Work that would be left behind is named.** When a starting point would leave out work this run committed, pushed or not, that is not in it, the panel lists the affected phases and says they will run again, before Start can be pressed.
- [ ] **AC-SAFE-03 — Existing limits still apply.** Start keeps the run's billing restrictions, early-merge permission, a pending pause after a phase that is still to run, repository permissions and the existing Git limits: Kiln creates new branches and worktrees, and never merges, deletes, resets or force-pushes. The one exception is AC-SAFE-04. Start ends an active pause. Start is also the explicit hand-back that ends a hold from **Pause & take over**: a start from the base branch leaves the hold with the execution it archives, and a start from the existing feature branch is an explicit Resume. The Starting lets Kiln list says so when the run is held, and names the phase Kiln will pause after when a pending pause carries through Start.
  - Replaces in part: AC-VIEW-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Start on the Folder missing page ends an active pause; a pending pause carries through Start only when its phase is still to run, and otherwise ends with that Start instead of holding after the phase is Done).
  - Replaces in part: AC-TAKE-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (Start on the Folder missing page counts as the explicit hand-back that ends a takeover hold, and the Starting lets Kiln list says so).
  - Replaces in part: AC-PERMIT-03 and AC-PERMIT-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (a base-branch start carries the run's effective early-merge choice and approved targets into its fresh execution).
- [ ] **AC-SAFE-04 — Git's record of a missing folder is cleared only when Start needs it.** When git still records a worktree at a missing saved folder, and that record would stop Start (the chosen folder is the saved path, or the existing feature branch is recorded there), Start clears that one record before creating the worktree (WTR-003). It clears only a record git itself reports as stale because its folder is gone, never one for a folder that exists, and nothing else. The Starting lets Kiln list says so, naming the folder, before Start can be pressed.
  - Replaces in part: AC-GIT-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (besides setting up worktrees and branches, Start may clear git's stale record of one missing worktree folder).

### Look like the mockup

- [ ] **AC-LOOK-01 — The screens match their drawings.** The Folder missing page and its terminal message match this change's mockup for layout, order and wording, in Kiln's existing visual style. Sample names, paths, commits and counts are illustrative; the real ones come from the run.

## Mockup

[Open the interactive mockup](mockups/kiln-missing-worktree-recovery.html). Its preview control switches between the cases; it is not a Kiln control. The repository, PRD, paths and commits are fictional; the counts and dates follow the 2026-11-06 run.

| Preview state | Criteria shown |
|---|---|
| Branch merged, plan moved on (the 2026-11-06 case) | AC-GONE-02, AC-FACTS-01/02/03, AC-SETUP-01/02/03/04/06 |
| Branch has work not yet in develop | AC-FACTS-02 (Matches), AC-SETUP-02/03/05/06, AC-SAFE-02, AC-SAFE-04 |
| Branch gone, some work not in develop | AC-FACTS-02 (Ahead of), AC-SETUP-02, AC-SAFE-02 |
| Branch checked out in another folder | AC-SETUP-02 (existing-branch start unavailable), AC-SETUP-06 (no command) |
| Saved folder holds something else | AC-FACTS-01, AC-SETUP-02 (suffixed folder), AC-SETUP-06 (no command) |
| Two repositories, one folder missing | AC-SETUP-07, AC-SAFE-04 |
| A check could not run | AC-FACTS-02 (local base branch), AC-FACTS-03, AC-SETUP-06 (no command) |
| Terminal | AC-GONE-03 |

## Assumptions

Two product choices are declared in [the assumptions document](kiln-missing-worktree-recovery-assumptions.md): no choice to discard the saved run in this release (WTR-001), and Start may clear git's leftover record of the one missing folder it needs (WTR-003). Whether an interrupted session can be resumed from a new folder (WTR-004) is settled in the [technical design](kiln-missing-worktree-recovery-technical-design.md).

## Out of Scope

- Recovering what AC-FACTS-03 says Kiln cannot recover.
- Adopting a folder that holds the branch somewhere other than the saved path; the person restores the saved path or starts afresh.
- Watching for folders being removed while Kiln is closed, or cleaning up worktrees beyond the one record AC-SAFE-04 clears.
- Finished runs (already covered by completed-feature discovery) and saved runs whose shared checkout itself is missing.
- Discarding or archiving a saved run (WTR-001).
