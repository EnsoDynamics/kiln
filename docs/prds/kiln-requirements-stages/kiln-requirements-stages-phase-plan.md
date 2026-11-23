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

- The Enso Method names where a plain brief lives under `source-material/`. Not yet in the method; the design reads it as `source-material/{name}/{name}-brief.md`.
- Kiln Phase Model Tiers is built and merged to `develop`, and `develop` is merged into this branch. Only its requirements documents are on `develop` today.
- Claude Code and Codex both installed and signed in on the build computer, each with the Enso Method installed.
