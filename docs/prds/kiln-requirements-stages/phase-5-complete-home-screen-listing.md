# Phase 5: Complete the home screen's listing and what `kiln run` says was written

**Added by delivery audit:** 2026-11-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "What `kiln run` accepts"; "Run identity"; "The Home Screen" ("What it lists"); the "What source material counts as written from" decision
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
Place every home-screen item by the first row of AC-HOME-13 that fits, in every case the code skips today: a planned PRD or source material known only on the remote or another branch, a repository with no shared branch, a Kiln record never started or already completed. Name each line's other repositories and an unreadable Kiln's address, name the empty repositories of a folder, and have `kiln run` say which PRD was written from a planned PRD whose row the method has marked written. A reset after the draft keeps the branch that holds the PRD.

## Acceptance criteria covered
AC-BEGIN-02 (completes it; owned by phase 1), AC-BEGIN-08 (completes it; owned by phase 4), AC-HOME-02 (completes it; owned by phase 4), AC-HOME-03 (completes it; owned by phase 4), AC-HOME-04 (completes it; owned by phase 4), AC-HOME-05 (completes it; owned by phase 4), AC-HOME-09 (completes it; owned by phase 4), AC-HOME-10 (completes it; owned by phase 4), AC-HOME-12 (completes it; owned by phase 4), AC-HOME-13 (completes it; owned by phase 4)

## What the audit found missing
- **AC-BEGIN-02:** `src/requirements/source.ts` `inspectSource`, initiative branch, filters rows to `planned` before `rows.find(r => r.directory === parts[3])`. So `kiln run docs/initiatives/<name> --prd <dir>` on a row the method has set to `PRD written` returns "Planned PRDs in … Name one with --prd." and never says which PRD was written from it.
- **AC-BEGIN-08:** a run from source material that is reset inside the running Kiln after its draft doesn't continue on the branch that holds its PRD. `resetEngine` in `src/kiln-command.ts` runs the start checks against `run.location`, which is still the source-material path. So `inspectSource` runs instead of `inspectStartedPrd`, `report.startedByHand` is never set, and `adoptStartedByHand` never runs: no `holdingBranch`, and no `record.start = existing` with that branch. When the PRD folder shares the source folder's name, the checks fail with "was written from" and Start is held. A fresh `kiln run` re-resolves to the written PRD (`runKilnCommand`, lines 239–244); the reset doesn't.
- **AC-HOME-02:** Review and start fails to open the screen before Start for two kinds of item listed under Ready, because `kiln run` refuses them:
  - A planned row with no `**PRD directory, when written:**` line is listed by `scanRepository`, which matches by name only when `row.fromLine` is set (line 215), as the technical design says. `inspectSource`'s `existing` check (`src/requirements/source.ts`, lines 146–151) still refuses it with "<dir> was written from <path>" when a PRD or change folder of its derived name exists on any ref.
  - A brief or intake committed on the local shared branch is listed from that tree alone (`scanRepository`, lines 184–188). `inspectSource` (lines 129–132) also requires the folder to be clean in the checkout and identical to that commit, so uncommitted edits, or a checkout whose copy differs, get it refused. These belong under Not ready yet with their commit step (AC-HOME-03).
- **AC-HOME-03:** these source-material and planned-PRD placements in `src/home/scan.ts` `scanRepository` (`scan.notReady.push` and `scan.ready.push` sites, lines 177–221) fail:
  - A planned PRD is read only from `sharedRead`, the local shared tip, else origin's. A row committed only on `origin/<shared>` while a local shared branch exists is listed nowhere. With no local shared branch, it is listed under Ready, though `kiln run` refuses it with "Bring the local shared branch up to date". It needs the bring-up-to-date line.
  - A `received/` folder with no intake record is not listed when it is only on origin's shared branch, because `received` ignores `found.remote`. It is also missed when it is only on another branch, because the `elsewhere` loop keeps only paths with `parts.length === 3`.
  - A brief or intake committed on the local shared branch is listed under Ready (lines 184–189) even when its folder has uncommitted changes, or the checkout's copy differs from that commit. `kiln run` refuses it with "Commit the changes under …" or "Commit the source material on <base>".
  - Done when no site the search returns fails.
- **AC-HOME-04:** when no shared branch is known (`sharedBranchOf` returns nothing), `holding` and `onShared` are empty (`scanRepository`, around line 225). Every PRD without a Kiln record is then listed nowhere, and no line says why.
- **AC-HOME-04, AC-HOME-12, AC-HOME-13:** a Kiln record that was never started, which `kiln run` writes before Start, still places the PRD in `scanRepository`. The technical design says such a record places nothing.
  - The every-phase-built skip at line 258 requires `!record`, so a fully built PRD with such a record is folded instead of not listed.
  - Line 277 labels a PRD with such a record "Not started" where it should say it was started by hand.
  - Its `alsoChanges` comes from the record and not from the phase documents (see AC-HOME-10).
- **AC-HOME-05:** the Under way line for a run from source material whose PRD isn't written yet (`scanRepository`, the final `for (const work of works)` loop, line 288) adds no "couldn't read its state" text with the Kiln's address when `probe.state === "unreadable"`. Lines 266 and 277 add it. `view/src/screens/Home.svelte` never renders `item.address`.
- **AC-HOME-09:** in a folder where every repository is empty, `Home.svelte` takes the `{#if empty}` branch (line 123). That branch leaves out the filters nav and its "Nothing found in …" text, so no repository is named.
- **AC-HOME-10:** `alsoChanges` in `scanRepository` (around line 259) leaves out repositories in two cases:
  - With a Kiln record, it uses only `record.repositories`. A named repository joins that list only when its phase starts (`addNamedRepositories` in `src/engine/engine.ts`). A run through the requirements stages, and a record not yet started, therefore leave out the repositories named by phases that haven't started.
  - Without a record, it reads only leaves (`leavesOf`), so a repository named only on a split record's `**Repositories:**` line is left out. `namedRepositories` in `src/plan/phase-plan.ts` counts split records like any other phase.
- **AC-HOME-13:**
  - A planned PRD is not hidden when an initiative folder of its directory's name, other than its own initiative, exists on any branch. `scanRepository` line 215 checks only `docs/prds/` and `docs/changes/`, and `inspectSource` leaves initiatives out for a planned PRD.
  - A PRD on the shared branch whose later documents, such as its technical design, are only on an unmerged branch goes to the folded group, not Under way. `onlyOnBranch` (line 256) requires the shared branch to have no copy at all. A PRD with requirements work still under way on a branch is not one Kiln "can't tell" about (AC-HOME-12).
  - `scanRepository` line 233, `if (record?.completedAt) continue;`, drops a PRD whose Kiln run completed before the Under way rows are tested: a phase not yet built, the method's refinement-state or pending-feedback file, documents only on an unmerged branch.
  - With no shared branch known, line 192 lists every folder under `source-material/` as Not ready yet. That includes folders holding no brief, no intake record and no `received/`, which the "Any other folder" row leaves unlisted.
  - The placement failures under AC-HOME-03 and the never-started record above are this criterion's rows too.

## Phase dependencies
1 (`inspectSource` and the start checks); 4 (the home scan, `src/home/scan.ts`, the home view, and the start of a PRD on a branch of its own)
