# Kiln Requirements Stages — implementation phase plan

**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md)

## Sizing decision

Four phases, executed in order. The PRD holds 59 criteria across several capabilities, each with its own engine and screen work: running requirements sessions from source material through both stops to Start the build; feedback at any moment; the plan read from the installed method, with per-stage models; and the home screen with PRDs started by hand. Together they exceed one dependable session. Phase 1 is the walking skeleton: a run from a brief, an intake record or a planned PRD reaches Start the build with no plan read, using the design's no-plan rows, and so stands up the record, the report, the driver and both stops that every later phase builds on. Feedback comes next because it completes the answers at both stops. The plan read and stage models come third because the rows they fill and the Change on each row both read the plan. A PRD started by hand rides with the home screen, since both read where a PRD stands from its files and which branch holds it. The Delivery section names no early merge, planned stop or hands-on work.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 source material to the build](phase-1-source-material-to-the-build.md) | Kiln starts from a brief, an intake record or a planned PRD, runs each requirements stage in a fresh session, stops at the early review and the final review, and starts the build only when the person presses Start the build. | None |
| [2 feedback at any time](phase-2-feedback-at-any-time.md) | The person sends feedback whenever it comes to mind, at a stop or while a stage runs, and it reaches every requirements document; the draft's key statements show while the refinement runs, and the early review's wait can be turned off. | 1 (the requirements record, the driver, the report and both stops) |
| [3 plan and stage models](phase-3-plan-and-stage-models.md) | Kiln reads the installed method's stages once, shows every stage before and during the run, follows a method updated mid-run, and lets the person change and remember each stage's model. | 1 (the driver, the report, the standing and the two Model defaults rows); 2 (feedback listed on the rows) |
| [4 home screen and PRDs started by hand](phase-4-home-screen-and-prds-started-by-hand.md) | `kiln` alone opens a home screen listing what is ready, under way or waiting for the person, across one repository or a folder of them; a PRD started by hand continues from where it stands; the public guide covers the whole change. | 1 (run identity, the source material start paths and start checks); 2 (feedback, for the guide); 3 (the plan before Start and the plan read the home screen starts) |
| [5 complete home screen listing](phase-5-complete-home-screen-listing.md) | Added by delivery audit: places every home-screen item by the first row that fits in the cases the scan skips, names each line's other repositories, an unreadable Kiln's address and a folder's empty repositories, and has `kiln run` say which PRD was written from a planned PRD marked written. | 1 (`inspectSource` and the start checks); 4 (the home scan and view) |
| [6 complete requirements run and stage models](phase-6-complete-requirements-run-and-stage-models.md) | Added by delivery audit: requires no requirements-stage skill by name, keeps Start from waiting on a plan read, completes the draft note, Message Claude, feedback commits and what changed, shows the final review's phase plan as Documents found does with its Preflight row, and makes every requirements row's model match its launch. | 1 (the driver, the stops and the model rows); 2 (feedback and both reviews); 3 (the plan read, its rows and stage models) |
| [7 complete home screen and start checks](phase-7-complete-home-screen-and-start-checks.md) | Added by delivery audit: lists every home-screen item once where the first fitting row puts it, for worktrees in a folder of repositories, PRDs and initiative lists not on the local shared branch, written PRD-list rows, other runs' branches and a brief beside `received/`. It puts a waiting Kiln at the top, sorts the folded group by true time, and makes `kiln run` name the written PRD or the commit step, open Documents found for a plan written after Kiln first opened the PRD, and continue a PRD whose phase plan is on its own branch. | 1 (`inspectSource` and the start checks); 4 (the home scan and view); 5 (the placements it completed) |
| [8 complete requirements run controls and models](phase-8-complete-requirements-run-controls-and-models.md) | Added by delivery audit: shows a plan read the moment it lands, with its source line during a re-read, names every stage a stop passes, gives both reviews the run's header and totals, handles a billing hold and a Needs you reply on a stage as a phase's, turns long Message Claude text into feedback, keys a no-plan review's model to the row shown, notes a saved choice the plan dropped on every PRD, and keeps a stopped stage's heads-up and Change. | 1 (the driver, the stops and the model rows); 2 (feedback and both reviews); 3 (the plan read, its rows and stage models); 6 (the fixes it completed) |
| [9 complete home screen lines and branch copies](phase-9-complete-home-screen-lines-and-branch-copies.md) | Added by delivery audit: gives each Under way line the stage the PRD reached, for a run between stages and a PRD whose refinement or feedback round is part-way through. Names each other repository a PRD changes once and never its own. Lists material whose intake record isn't on the shared branch as Not ready yet, and has `kiln run` name the commit step. Reads a PRD that only origin's copy of a branch holds from that copy, and gives the current plan read's failure reason on the home screen. | 3 (the plan read the home screen starts); 4 (the home scan and view); 5 and 7 (the placements and start checks they completed) |
| [10 complete requirements plan notices and pushes](phase-10-complete-requirements-plan-notices-and-pushes.md) | Added by delivery audit: names every plan entry a report passes, including after Kiln loses its place in the plan. Marks a stop on the method's own review row while that review is made, and shows a plan read another Kiln already runs. Pushes the feature branch when Kiln leaves a review with the person's commits, and with no plan keys a stop review's fallback heads-up to its row. | 1 (the driver, the stops and the push after a stage); 3 (the plan read, its rows and stage models); 6 and 8 (the fixes they completed) |

## Acceptance-criterion ownership

| Owning phase | Criteria |
|---|---|
| 1 | AC-BEGIN-01 (also applies to Phase 4), AC-BEGIN-02, AC-BEGIN-03, AC-BEGIN-05, AC-BEGIN-06, AC-BEGIN-07; AC-PLAN-06, AC-PLAN-08; AC-STAGE-01, AC-STAGE-02, AC-STAGE-04 (also applies to Phases 2 and 3), AC-STAGE-05 (also applies to Phase 2), AC-STAGE-06; AC-EARLY-01, AC-EARLY-02; AC-FINAL-01, AC-FINAL-04, AC-FINAL-05, AC-FINAL-06; AC-MODEL-02, AC-MODEL-06 |
| 2 | AC-NOTE-01, AC-NOTE-02; AC-TALK-01, AC-TALK-02, AC-TALK-03, AC-TALK-04; AC-EARLY-03, AC-EARLY-04, AC-EARLY-05; AC-FINAL-02, AC-FINAL-03 |
| 3 | AC-PLAN-01, AC-PLAN-02, AC-PLAN-03, AC-PLAN-04, AC-PLAN-05, AC-PLAN-07; AC-STAGE-03; AC-MODEL-01, AC-MODEL-03, AC-MODEL-04, AC-MODEL-05 |
| 4 | AC-BEGIN-04, AC-BEGIN-08; AC-HOME-01 to AC-HOME-13; AC-GUIDE-01 |

Each phase adds the `Superseded in part by:` lines the design's "Changes to Earlier Designs" names for what that phase builds, in its own feature commit.

## Before the build

From the technical design's Delivery section, all needed before Phase 1 starts:

- The Enso Method's change naming a brief's file `source-material/{name}/{name}-brief.md`, the name the design reads, is published.
- Kiln Phase Model Tiers is built and merged to `develop`, and `develop` is merged into this branch. Only its requirements documents are on `develop` today.
- Claude Code and Codex both installed and signed in on the build computer, each with the Enso Method installed.
