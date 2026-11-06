# PRD: Kiln Missing Worktree Recovery

**Source:** Doug's request on 2026-11-06, after a saved run reported a stale phase as needing him.

**Changes:** [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) and [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md).

**Mockup:** [Open the interactive Folder missing mockup](mockups/kiln-missing-worktree-recovery.html).

## Summary

A saved Kiln run works in its own folder, a git **worktree** on the run's feature branch. When that folder no longer exists, Kiln stops and says so plainly: which folder is gone, what Kiln can still find about the work (the branch, and the plan in the person's own checkout), and what was not checked. It then offers the ways out that fit those facts, recommends one, and does nothing until the person chooses. It never again reports a phase as "needs you" from an old record of a folder that is gone.

## Business Context

On 2026-11-06 Doug ran `kiln run` on a PRD, from its repository's shared checkout on `develop`. Kiln printed "4 of 5 phases done · phase 5 needs you". Both halves were wrong.

The saved run was started on 2026-10-23 in its own worktree on the PRD's feature branch. That folder had since been deleted. The branch had been merged into `develop`, and the PRD there had grown to 13 phases, 9 of them closed, phase 5 among them, closed on 2026-10-24. Kiln's plan check failed because the folder was missing (`ENOENT … lstat '<the deleted folder>'`). Kiln then fell back to its saved 5-phase plan, and showed phase 5's completion result from 2026-10-24, read from the old branch at its last commit. Nothing on the screen said the folder was gone, or that the plan had moved on.

The run had already been recorded as unavailable underneath. The person was shown a confident and stale answer instead, with no way out except investigating Kiln's saved state by hand. A missing folder is an ordinary event: worktrees are removed after a merge, cleaned up in bulk, or moved. Kiln should treat it as a situation with known answers, not as a phase failure.

## Scope

This covers an **unfinished** saved run, in one repository or several, whose worktree for any of its repositories is missing, or whose folder at the saved path is no longer that worktree. A finished run whose old worktree is gone is already handled by completed-feature discovery (AC-FIND-02 in Kiln Continue Added Phases) and is unchanged.

**Terms:**

- The **saved folder** is the worktree path the run recorded for a repository at setup.
- The **shared checkout** is the person's own clone of the repository, the one `kiln run` names (the PRD's main checkout).
- The **base branch** is the branch the run delivers into, `develop` by default.

## Acceptance Criteria

### Notice the missing folder before anything else

Kiln checks that each of the run's folders is there before it reads the plan, reports progress or judges a phase. A missing folder is the answer, and the screen leads with it.

- [ ] **AC-GONE-01 — Every entry point checks the folders first.** Before Kiln reads the active plan, reports phase progress, runs a completion check, resumes or launches a session, or advances, it checks that each repository's saved folder exists and is still that repository's worktree on the run's feature branch. This applies at `kiln run`, on opening or reloading the feature page, at every hand-back or Verify action, and before every session launch.
- [ ] **AC-GONE-02 — A missing folder replaces the phase status.** When any saved folder fails AC-GONE-01, the terminal and the feature page show the **Folder missing** state instead of a phase state. Kiln shows no phase as "needs you", running or done on the strength of facts read from a folder that is gone, and starts no session. Completion results recorded earlier stay visible only in the run's history, labelled with when they were checked.
  - Replaces in part: AC-HANDBACK-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (when the assigned worktree itself is missing, Kiln stops with this state rather than treating it as an unreadable active plan; it still never runs from another checkout without the person's choice).
- [ ] **AC-GONE-03 — The terminal says it in plain words.** `kiln run` prints that the run's folder is missing, the folder's path, that nothing has run, the one-line plan summary from the shared checkout (AC-FACTS-02), and the address of the page where the person chooses what to do. It prints no phase count or phase status from the saved plan.
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an unfinished run with a missing folder reports that, not its progress).

### Show what Kiln still knows

The person decides better when they can see where the work actually is. Kiln looks in the places that are still there, read-only, and says what it found and what it could not check.

- [ ] **AC-FACTS-01 — The missing folder and the branch are described.** For each repository the page shows the saved folder and whether it is missing or holds something else (and what: another branch, or no worktree). It shows whether the run's feature branch still exists in the shared checkout and on the remote, its latest commit and date, whether that commit is already in the base branch, and whether the branch is checked out in a different folder (its path). It also shows the last commit Kiln recorded as pushed for the run, and whether that commit is on the remote or in the base branch.
- [ ] **AC-FACTS-02 — The plan is compared where it now lives.** The page shows the plan Kiln saved for the run (its phase count and how many were done, with the date it was read) beside the plan in the shared checkout's base branch: its phase count, how many are closed, and the next unfinished phase. When they differ, the page says the saved plan is out of date. Counts follow the existing rules for counting phases (AC-FIND-03 in Kiln Continue Added Phases).
- [ ] **AC-FACTS-03 — What can't be known is said.** The page states that anything left uncommitted or unpushed in a deleted folder cannot be recovered by Kiln. When any read in AC-FACTS-01 or AC-FACTS-02 fails, the page names what could not be checked, offers **Check again**, and recommends and offers no choice that depends on the unchecked fact. A failed read never shows as "none found".

### Offer the ways out that fit, and recommend one

The person sees a short list of real choices, each saying what it will do in plain words. Kiln recommends the one the facts point to, and only offers choices that can work.

- [ ] **AC-FIX-01 — The choices follow the facts.** The page offers the choices in the table, marks one **Recommended** by the first row that applies, and leaves out a choice that cannot work in that case, saying why on a short line instead. Each choice states what it will do, which plan it will follow and which phase will run next, before the person presses it.

  | What Kiln found | Recommended | Also offered |
  |---|---|---|
  | The feature branch is checked out in another folder | **Use that folder** | Continue from the base branch |
  | The branch exists and has work not yet in the base branch | **Put the folder back** | Continue from the base branch |
  | The branch is fully in the base branch, or is gone and every commit the run pushed is in the base branch | **Continue from the base branch** | Put the folder back, while the branch exists |
  | The branch is gone and some pushed work is not in the base branch | **Continue from the base branch**, with AC-SAFE-02's warning | None |

- [ ] **AC-FIX-02 — Use that folder.** Kiln adopts the folder where the branch is now checked out as the repository's worktree for the run, after the same checks it gives a worktree at setup, then reads the plan there and carries on as at any reopening. (WTR-002.)
- [ ] **AC-FIX-03 — Put the folder back.** Kiln adds the worktree again at the saved path on the existing feature branch. It never creates or resets a branch, and the path must pass the checks a worktree path gets at setup (new or empty, not inside a checkout). Kiln then reads the plan there and carries on as at any reopening. When the branch is behind the base branch's plan, the choice says so before it is pressed ("this branch knows 5 phases; develop has 13"). (WTR-002.)
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a later `kiln run` may recreate the run's worktree on its existing feature branch; it still never creates a branch that already exists).
- [ ] **AC-FIX-04 — Continue from the base branch.** Kiln shows the proposal the existing continuation offer shows: the phases already done, the phases still to run in plan order, the first one, and its readiness. **Continue with N phases** then starts a fresh execution from the current base branch, as a finished run's continuation does. Earlier phase results, sessions and delivery links are kept. Phases closed in the base branch but not by this run are accepted only as the existing rules for work completed outside Kiln allow. The person's choice and the proposal's freshness follow the existing continuation rules.
  - Replaces in part: AC-CONTINUE-06 and AC-OFFER-02/03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (an unfinished run whose folder is missing can also continue from the current base branch, by the same proposal and acceptance).
  - Replaces in part: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the fresh execution sets up its workspace as a continuation does).
- [ ] **AC-FIX-05 — Moving the folder back yourself works too.** The page says that a person who moved or removed the folder on purpose can put it back at the saved path themselves (with the exact git command Kiln would run), then press **Check again**. Check again reruns AC-GONE-01 and leaves the Folder missing state once every folder passes.

### Keep the person's work and permissions safe

Recovery changes nothing until the person chooses, and a choice does only what it said it would.

- [ ] **AC-SAFE-01 — Nothing changes until the person chooses.** Showing the Folder missing state reads only. It writes to no checkout, branch or remote, and starts no session. Each choice rechecks the facts it depends on before acting; when they have changed, it shows the refreshed page instead of acting. A choice that fails partway says what it did and what remains, and the next try does only what is still missing.
- [ ] **AC-SAFE-02 — Work that would be left behind is named.** When continuing from the base branch would leave pushed work of this run out (the branch is gone and some recorded pushed commits are not in the base branch), the choice lists the affected phases and says they will run again from the base branch, before it can be pressed.
- [ ] **AC-SAFE-03 — Existing limits still apply.** Every choice keeps the run's agent and model settings, billing restrictions, pause requests, repository permissions and the existing Git limits (Kiln adds worktrees; it never merges, deletes, resets or force-pushes). In a run with several repositories, only the repositories whose folders failed AC-GONE-01 are affected; the others are kept as they are, and a choice that applies to the whole run (continuing from the base branch) says so.

### Look like the mockup

- [ ] **AC-LOOK-01 — The screens match their drawings.** The Folder missing page and its terminal message match this change's mockup for layout, order and wording, in Kiln's existing visual style. Sample names, paths, commits and counts are illustrative; the real ones come from the run.

## Mockup

[Open the interactive mockup](mockups/kiln-missing-worktree-recovery.html). Its preview control switches between the cases; it is not a Kiln control. The repository, PRD, paths and commits are fictional; the counts and dates follow the 2026-11-06 run.

| Preview state | Criteria shown |
|---|---|
| Branch merged, plan moved on (the 2026-11-06 case) | AC-GONE-02, AC-FACTS-01/02/03, AC-FIX-01/04/05 |
| Branch has unmerged work | AC-FIX-01/03 |
| Branch checked out in another folder | AC-FIX-01/02 |
| Branch gone, some work not in develop | AC-FIX-01, AC-SAFE-02 |
| A check could not run | AC-FACTS-03 |
| Terminal | AC-GONE-03 |

## Assumptions

Two product choices are declared in [the assumptions document](kiln-missing-worktree-recovery-assumptions.md): no choice to discard the saved run in this release (WTR-001), and Kiln repairing the folder itself rather than handing the person a command (WTR-002).

## Out of Scope

- Recovering uncommitted or unpushed work from a deleted folder.
- Watching for folders being removed while Kiln is closed, or cleaning up worktrees.
- Finished runs (already covered by completed-feature discovery) and saved runs whose shared checkout itself is missing.
- Discarding or archiving a saved run (WTR-001).
