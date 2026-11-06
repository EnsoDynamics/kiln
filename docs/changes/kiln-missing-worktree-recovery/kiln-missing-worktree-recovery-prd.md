# PRD: Kiln Missing Worktree Recovery

**Source:** Doug's request on 2026-11-06, after a saved run reported a stale phase as needing him, and his review of the first mockup the same day.

**Changes:** [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) and [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md).

**Mockup:** [Open the interactive Folder missing mockup](mockups/kiln-missing-worktree-recovery.html).

## Summary

A saved Kiln run works in its own folder, a git **worktree** on the run's feature branch. When that folder no longer exists, Kiln stops and says so plainly. It shows which folder is gone, what Kiln can still find about the work (the branch, and the plan in the person's own checkout), and what it could not check. It then asks the person to set the run up again, using the same settings they chose when the run first started: where to start from, the new folder and feature branch, and the agent. Kiln fills these in from what it found. Nothing happens until the person presses Start. Kiln no longer reports a phase as "needs you" from an old record of a folder that is gone.

## Business Context

On 2026-11-06 Doug ran `kiln run` on a PRD, from its repository's shared checkout on `develop`. Kiln printed "4 of 5 phases done · phase 5 needs you". Both halves were wrong.

The saved run was started on 2026-10-23 in its own worktree on the PRD's feature branch. That folder had since been deleted. The branch had been merged into `develop`, and the PRD there had grown to 13 phases, 9 of them closed. Phase 5 was among them, closed on 2026-10-24. Kiln's plan check failed because the folder was missing (`ENOENT … lstat '<the deleted folder>'`). Kiln then fell back to its saved 5-phase plan, and showed phase 5's completion result from 2026-10-24, read from the old branch at its last commit. Nothing on the screen said the folder was gone, or that the plan had moved on.

Underneath, the run had already been recorded as unavailable. The person was shown a confident and stale answer instead, with no way out except investigating Kiln's saved state by hand. A missing folder is an ordinary event: worktrees are removed after a merge, cleaned up in bulk, or moved. Recovering from one is a deliberate new setup, so it should look and behave like the setup the person already knows, not like a repair button.

## Scope

This covers an **unfinished** saved run, in one repository or several, whose worktree for any of its repositories is missing, or whose folder at the saved path is no longer that worktree. A finished run whose old worktree is gone is already handled by completed-feature discovery (AC-FIND-02 in Kiln Continue Added Phases) and is unchanged.

**Terms:**

- The **saved folder** is the worktree path the run recorded for a repository at setup.
- The **shared checkout** is the person's own clone of the repository, the one `kiln run` names.
- The **base branch** is the branch the run delivers into, `develop` by default.
- The **setup panel** is the recovery form described under "Set the run up again". It has the same settings Documents found shows before a first Start (AC-START-06 in Kiln v1).

## Acceptance Criteria

### Notice the missing folder before anything else

Kiln checks that each of the run's folders is there before it reads the plan, reports progress or judges a phase. A missing folder is the answer, and the screen leads with it.

- [ ] **AC-GONE-01 — Every entry point checks the folders first.** Before Kiln reads the active plan, reports phase progress, runs a completion check, resumes or launches a session, or advances, it checks that each repository's saved folder exists and is still that repository's worktree on the run's feature branch. This applies at `kiln run`, on opening or reloading the feature page, at every hand-back or Verify action, and before every session launch.
- [ ] **AC-GONE-02 — A missing folder replaces the phase status.** When any saved folder fails AC-GONE-01, the terminal and the feature page show the **Folder missing** state instead of a phase state. Kiln shows no phase as "needs you", running or done on the strength of facts read from a folder that is gone, and starts no session. Completion results recorded earlier stay visible only in the run's history, labelled with when they were checked.
  - Replaces in part: AC-HANDBACK-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (when the assigned worktree itself is missing, Kiln stops with this state rather than treating it as an unreadable active plan; it still never runs from another checkout without the person's choice).
- [ ] **AC-GONE-03 — The terminal says it in plain words.** `kiln run` prints that the run's folder is missing, the folder's path, that nothing has run, the one-line plan summary from the shared checkout (AC-FACTS-02), and the address of the page where the person sets the run up again. It prints no phase count or phase status from the saved plan.
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an unfinished run with a missing folder reports that, not its progress).

### Show what Kiln still knows

The person decides better when they can see where the work actually is. Kiln looks in the places that are still there, read-only, and says what it found and what it could not check.

- [ ] **AC-FACTS-01 — The missing folder and the branch are described.** For each repository the page shows:
  - when Kiln checked;
  - the saved folder, its branch and the date it was set up, and whether it is missing or holds something else (and what: another branch, or no worktree);
  - whether the run's feature branch still exists in the shared checkout and on the remote, with its latest commit and date;
  - whether that commit is already in the base branch;
  - whether the branch is checked out in another folder, and that folder's path;
  - the last commit Kiln recorded as pushed for the run, and whether that commit is on the remote or in the base branch.
- [ ] **AC-FACTS-02 — The plan is compared where it now lives.** The page shows the plan Kiln saved for the run beside the plan in the shared checkout's base branch. For the saved plan: its phase count, how many were done, and the date it was read. For the base branch: its phase count, how many are closed, and the next unfinished phase. When they differ, the page says the saved plan is out of date. Counts follow the existing rules for counting phases (AC-FIND-03 in Kiln Continue Added Phases).
- [ ] **AC-FACTS-03 — What can't be known is said.** The page states that anything left uncommitted or unpushed in a deleted folder cannot be recovered by Kiln. When any read in AC-FACTS-01 or AC-FACTS-02 fails, the page:
  - names what could not be checked;
  - offers **Check again**;
  - offers no starting point and fills in no default that depends on the unchecked fact.
  
  A failed read never shows as "none found".

### Set the run up again

Recovering from a missing folder means setting the run up again in a new folder. The person sees the same choices they made at the first Start, in the same words as Documents found, already filled in from what Kiln found, and starts the run themselves. Kiln never works directly in the base branch or in the person's own checkout.

- [ ] **AC-SETUP-01 — The setup panel has the first-Start settings, in the first-Start words.** The Folder missing page has a setup panel titled **Set the run up again**, in this order:
  1. **Start from**, the choice of starting point (AC-SETUP-02).
  2. **What will run** (AC-SETUP-03).
  3. **How Kiln will deliver it**, with the fields, labels, help text and order that Documents found uses for the run's repositories:
     - **Worktree** (for several repositories, Workspace folder);
     - **Feature branch**;
     - **Branch from, and PR into**, labelled **PR into** when starting from the existing feature branch;
     - **Agent**, **Model** and **Effort**;
     - the keep-awake and **Resume after a usage limit** switches;
     - **Pushes** and **Ends at**.
  4. **Before you start**, with the **Starting lets Kiln** list and the Start button.

  The fields start with the run's saved choices, except where AC-SETUP-02 sets a default. Each can be changed before Start, as on Documents found. Start is the only action that changes anything. The run's saved settings are updated only when Start succeeds.
  - Replaces in part: AC-START-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the settings panel is also shown, pre-filled, when an unfinished run's folder is missing).
- [ ] **AC-SETUP-02 — The starting point and defaults follow the facts.** The panel offers two starting points, **the base branch** and **the run's existing feature branch**, and pre-selects one by the first row of the table that applies. A starting point that cannot work is shown unavailable, with the reason. The folder and feature-branch defaults follow the starting point:
  - **Starting from the base branch**: Kiln creates a new feature branch. Its default name is the run's feature branch name (`feature/<PRD folder name>` unless the person changed it at the first Start) with the next free numeric suffix (`-2`, `-3`). Its default worktree is named the same way, in the same parent folder as the saved folder. A help line under the branch says the old name already exists and is not reused.
  - **Starting from the existing feature branch**: Kiln creates no branch. The default folder is the saved folder's path.

  | What Kiln found | Pre-selected starting point | The other starting point |
  |---|---|---|
  | The feature branch has work not yet in the base branch | The existing feature branch | Offered, with AC-SAFE-02's warning |
  | The feature branch is fully in the base branch, or is gone and every commit the run pushed is in the base branch | The base branch | Offered while the branch exists, with a note that it is behind the base branch's plan when it is |
  | The feature branch is gone and some pushed work is not in the base branch | The base branch, with AC-SAFE-02's warning | Unavailable: the branch is gone |

  When the feature branch is checked out in another folder, starting from it is unavailable, and the panel names that folder: git allows a branch in one folder at a time.
- [ ] **AC-SETUP-03 — The panel says what will run.** For the selected starting point, the panel shows the plan that start will follow before Start is pressed:
  - its phase count and how many are done;
  - the phases still to run, in plan order, and which one runs first;
  - that earlier phase results, sessions and delivery links are kept.

  Each starting point's choice shows that start's plan in one line (its latest commit, phase count and how many are done), and whether it holds all of this run's work. Start's label names the first phase ("Set up & start Phase 10"). Changing the starting point updates What will run, the feature branch and worktree defaults, and the Starting lets Kiln list before Start can be pressed.
- [ ] **AC-SETUP-04 — Starting from the base branch is a fresh execution.** Start creates the new feature branch from the current base branch, and the folder as a worktree of it. Then it runs the remaining plan as a finished run's accepted continuation does. Phases closed in the base branch but not by this run are accepted only as the existing rules for work completed outside Kiln allow. The feature branch name must not already exist; Kiln never reuses, resets or deletes a branch.
  - Replaces in part: AC-CONTINUE-06 and AC-OFFER-02/03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (an unfinished run whose folder is missing can also continue from the current base branch, accepted through the setup panel's Start rather than the continuation offer).
  - Replaces in part: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the fresh execution sets up its workspace as a continuation does, with the panel's settings).
- [ ] **AC-SETUP-05 — Starting from the existing feature branch makes a new worktree on it.** Start creates a worktree of the existing feature branch at the chosen folder, after the checks a worktree path gets at a first Start (new or empty, not inside a checkout). It creates no branch. Kiln then reads the plan there and carries on as at any reopening, under the run's existing execution.
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a later `kiln run` may create a new worktree on the run's existing feature branch; it still never creates a branch that already exists).
- [ ] **AC-SETUP-06 — A folder put back by hand is found.** The page says that a person who moved or removed the folder on purpose can restore it at the saved path themselves, using the git command the page shows, then press **Check again**. Check again reruns AC-GONE-01 and leaves the Folder missing state once every folder passes.

### Keep the person's work and permissions safe

Recovery changes nothing until the person presses Start, and Start does only what the panel showed.

- [ ] **AC-SAFE-01 — Nothing changes until Start.** Showing the Folder missing state, and editing the panel, only read. They write to no checkout, branch, remote or saved run, and start no session. Start rechecks the facts and the plan it showed before acting. When they have changed, Kiln shows the refreshed page instead of acting. A Start that fails partway says what it did and what remains, and the next Start does only what is still missing.
- [ ] **AC-SAFE-02 — Work that would be left behind is named.** When a starting point would leave out pushed work of this run that is not in it, the panel lists the affected phases and says they will run again, before Start can be pressed.
- [ ] **AC-SAFE-03 — Existing limits still apply.** Start keeps the run's billing restrictions, pause requests, repository permissions and the existing Git limits: Kiln creates new branches and worktrees, and never merges, deletes, resets or force-pushes. In a run with several repositories, the panel shows a starting point, folder and feature branch for each repository whose folder failed AC-GONE-01, and keeps the others as they are. Starting from the base branch applies to the whole run, and the panel says so.

### Look like the mockup

- [ ] **AC-LOOK-01 — The screens match their drawings.** The Folder missing page and its terminal message match this change's mockup for layout, order and wording, in Kiln's existing visual style. Sample names, paths, commits and counts are illustrative; the real ones come from the run.

## Mockup

[Open the interactive mockup](mockups/kiln-missing-worktree-recovery.html). Its preview control switches between the cases; it is not a Kiln control. The repository, PRD, paths and commits are fictional; the counts and dates follow the 2026-11-06 run.

| Preview state | Criteria shown |
|---|---|
| Branch merged, plan moved on (the 2026-11-06 case) | AC-GONE-02, AC-FACTS-01/02/03, AC-SETUP-01/02/03/04/06 |
| Branch has work not yet in develop | AC-SETUP-02/03/05, AC-SAFE-02 |
| Branch gone, some work not in develop | AC-SETUP-02, AC-SAFE-02 |
| Branch checked out in another folder | AC-SETUP-02 (existing-branch start unavailable) |
| A check could not run | AC-FACTS-03 |
| Terminal | AC-GONE-03 |

## Assumptions

One product choice is declared in [the assumptions document](kiln-missing-worktree-recovery-assumptions.md): no choice to discard the saved run in this release (WTR-001).

## Out of Scope

- Recovering uncommitted or unpushed work from a deleted folder.
- Adopting a folder that holds the branch somewhere other than the saved path; the person restores the saved path or starts afresh.
- Watching for folders being removed while Kiln is closed, or cleaning up worktrees.
- Finished runs (already covered by completed-feature discovery) and saved runs whose shared checkout itself is missing.
- Discarding or archiving a saved run (WTR-001).
