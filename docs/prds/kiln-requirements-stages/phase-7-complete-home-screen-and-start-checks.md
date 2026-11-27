# Phase 7: Complete the home screen's placements and the start checks they agree with

**Added by delivery audit:** 2026-11-27, after every planned phase closed, in the audit that followed phases 5 and 6. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "What `kiln run` accepts" (its table and the paragraph on branches that hold a PRD directory); "Run identity"; "The Home Screen" ("What it lists", "The shared branch, read without a fetch", Order); the "What source material counts as written from" decision
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
List every item on the home screen exactly once, in the place AC-HOME-13's first fitting row gives it, in the cases the scan still gets wrong:
- a linked worktree inside a folder of repositories;
- a PRD known only on origin's copy of the shared branch;
- an initiative list not yet committed there;
- the PRD-list rows the method rewrites once a PRD is written;
- branches another Kiln run started;
- a brief folder that also holds `received/`.

Put a waiting Kiln at the top and sort the folded group by when changes really happened. Make `kiln run` agree: name the PRD written from material before asking for a commit, name what to commit for material held only on another branch, open today's Documents found for a PRD whose phase plan was written after Kiln first opened it, and continue a PRD whose phase plan sits on its own unmerged branch on that branch.

## Acceptance criteria covered
AC-BEGIN-02 (completes it; owned by phase 1), AC-BEGIN-03 (completes it; owned by phase 1), AC-BEGIN-05 (completes it; owned by phase 1), AC-BEGIN-08 (completes it; owned by phase 4), AC-HOME-02 (completes it; owned by phase 4), AC-HOME-03 (completes it; owned by phase 4), AC-HOME-04 (completes it; owned by phase 4), AC-HOME-05 (completes it; owned by phase 4), AC-HOME-09 (completes it; owned by phase 4), AC-HOME-12 (completes it; owned by phase 4), AC-HOME-13 (completes it; owned by phase 4)

## What the audit found missing
- **AC-BEGIN-02, AC-HOME-02:** `initiativeRows` (`src/requirements/source.ts`, the PRD-cell regex near line 47) accepts only a `[name](contracts-file#anchor)` link. The method points a row's link at the PRD file once it is written (`prd-writing-standards`; `initiative-breakdown`, "`PRD written` (with a link to the PRD file)"), so every `PRD written` and `in production` row is dropped.
  - So `kiln run docs/initiatives/<i> --prd <dir>` on a written row prints "Planned PRDs in … Name one with --prd." instead of naming the PRD written from it.
  - And a planned PRD's Ready line (`scanRepository`, `src/home/scan.ts` line 266) says its build waits for a dependency the initiative marks in production.
  - The integration fixture (`src/requirements/source.integration.test.ts` line 47) keeps contracts links on its written rows, so this is untested.
- **AC-BEGIN-02 (AC-HOME-13 row 1):** `inspectSource` (`src/requirements/source.ts`, lines 122–137) runs the shared-branch, file-present, dirty and differs checks before the written-from checks (lines ~159–174). Material something was written from therefore gets "Commit …" or "Bring the local shared branch … up to date" instead of the PRD's name. Examples: a brief committed only on its PRD's branch, or an edited folder. This holds for planned rows too. The design's table puts the written-from row first.
- **AC-BEGIN-03:** source material that is committed only on another branch, and so isn't in the checkout, is answered with "<path> doesn't exist." (`resolvePrdPath`, `src/prd-location.ts` ~line 63). That message comes before `inspectSource` runs, so it never says the material isn't committed on the shared branch or names what to commit; the home screen's line for the same material does (`scan.ts` line 218). A planned row missing from the local list has the same problem when only another branch's copy, or origin's, holds it: `inspectSource` (~line 164) answers "Planned PRDs in … Name one with --prd." instead of the commit or bring-up-to-date step.
- **AC-BEGIN-05:** `notStarted` in `src/kiln-command.ts` reuses a never-started record, and `resetEngine` does the same. It never drops that record's `requirements`, or an `origin` of kind `prd`, when the start checks now find phase documents.
  - The case: a PRD opened by `kiln run` or Review and continue before its phase plan existed, Start never pressed, then the plan written by hand.
  - It then opens the requirements screen with a stale `standsAt`, and Start adds a stage and both stops. It should open Documents found with no requirements side ("What `kiln run` accepts": a never-started record is not a run).
- **AC-BEGIN-08:** two variants of a PRD whose documents are on an unmerged branch:
  - **The phase plan is on that branch.** `inspectStartedPrd` (`src/requirements/source.ts` line 110) refuses with "has its phase plan on <branch> … merge … and pull". The home screen lists the PRD Under way with that branch, and Review and continue then fails. The design says the holding branch is the start, and no document records this refusal. The build path from phase documents runs through `runStartChecks` (`src/start-checks.ts`) and `notStarted`.
  - **Phase documents are in the checkout and a branch holds the PRD.** That branch is never preselected under Start from. `adoptStartedByHand` runs only for `report.startedByHand`, so `Engine.startChoice` (`src/engine/engine.ts` ~line 10300) falls back to `featureBranchExists`.
- **AC-HOME-04:** `scanRepository`'s Under way push for a PRD started by hand, or a finished run (`src/home/scan.ts` ~line 336), takes `state: live.state` but never sets `waitsForYou`. A line whose Kiln shows "Waiting for you" (open before Start, or finished and still open; `runStateOf` in `src/control/client.ts`) is not sorted to the top.
- **AC-HOME-04, AC-HOME-12, AC-HOME-13:** a PRD whose only copy is on `origin/<shared>` is listed nowhere. This happens when the local shared branch is behind, for example a PRD merged on the remote and not yet pulled.
  - `onShared` (`scan.ts` line 277) reads only `sharedRead`, the local tip whenever one exists.
  - `holdingByDirectory` skips the shared branch's name in both copies.
  - `unplaced` applies only with no shared branch.
  - Place it by rows 5–7 from origin's copy, with the bring-up-to-date step `kiln run` needs.
- **AC-HOME-03, AC-HOME-13 row 2:** a planned PRD whose initiative list is only in the checkout or a worktree, or committed only on another branch, is listed nowhere. `initiativesAt` reads only `sharedLocal`, and `sharedRemote` when origin is ahead (`scan.ts` ~lines 225–247). `kiln run` refuses it with "Commit <list> on <base>." It needs a Not ready yet line naming the commit step, as briefs get at line 218.
- **AC-HOME-13 row 2:** a source folder holding a committed brief and `received/` with no intake record is listed under Ready to start (`scan.ts` lines 209–214). The `received` test at line 220 runs only when neither a brief nor an intake record is found. The first fitting row is Not ready yet with the intake step.
- **AC-HOME-13, AC-HOME-05:** the scan's `exclude` set (`scan.ts` line 275) leaves out only the feature branches of records that are started and not completed. `kiln run`'s `otherStartedBranches` (`src/engine/start-from.ts` line 67) also leaves out completed runs' branches, `branchStem` and earlier executions' branches. So the home screen can list a PRD Under way on such a branch, and opening it fails with "<branch> doesn't hold …".
- **AC-HOME-09, AC-HOME-13:** `repositoriesIn` (`src/home/scan.ts` ~line 356), used by `homeScope` (`src/home/home.ts`), takes every child folder holding `.git`, a linked worktree's `.git` file included. `buildHomeList` scans it as a second repository, so every item of that repository is listed twice under two names. A worktree must count as its main checkout's repository, not as its own.
- **AC-HOME-12:** "Newest change first" compares `git log --format=%cI` strings with `localeCompare`. That happens in `newest` (`scan.ts` ~line 349) and in the folded sort of `buildHomeList` (`home.ts` line 74). The strings keep each committer's UTC offset, so commits from different time zones, or either side of a daylight-saving change, are misordered. Compare instants.

## Phase dependencies
1 (`inspectSource` and the start checks); 4 (the home scan, `src/home/scan.ts`, `src/home/home.ts`, and starting a PRD on a branch of its own); 5 (the placements and reset path it completed)
