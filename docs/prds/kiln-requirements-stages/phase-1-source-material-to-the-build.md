# Phase 1: Source material to the build

**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Existing Code"; "Design Decisions"; "What Kiln Knows About the Method"; "Starting" (what `kiln run` accepts for source material and planned PRDs, "Requirements start checks", "Run identity", "Branch and worktree"); "Rows" (the no-plan form and the unknown standing); "Stage Sessions"; "The Two Reviews" (ready, the review route, Continue and a session of their own); "Starting the Build"; "Models"; "Interfaces"; "Data Models"; "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** demanding — AC-PLAN-08 combines the milestone reached, the early review held, the wait and the review's staleness to decide each stop (rules that interact), and a wrong result, or a review page whose script can send controls, lets the build start without the person, which AC-STAGE-06 forbids (access)

## Summary
Pointed at a brief, an intake record or a planned PRD, Kiln shows what it found, cuts the feature branch at Start, and runs each requirements stage in a fresh agent session that uses the installed method, reports in Kiln's form and has its work pushed. It stops at the early review after the PRD is refined, and at the final review when the requirements are finished, making or refreshing the stakeholder review first, and the build begins only when the person presses Start the build.

## Acceptance criteria covered
AC-BEGIN-01, AC-BEGIN-02, AC-BEGIN-03, AC-BEGIN-05, AC-BEGIN-06, AC-BEGIN-07, AC-PLAN-06, AC-PLAN-08, AC-STAGE-01, AC-STAGE-02, AC-STAGE-04, AC-STAGE-05, AC-STAGE-06, AC-EARLY-01, AC-EARLY-02, AC-FINAL-01, AC-FINAL-04, AC-FINAL-05, AC-FINAL-06, AC-MODEL-02, AC-MODEL-06

## Out of scope for this phase
Feedback in every form, the draft note and the Wait for me at the early review setting (Phase 2). Reading the plan from the installed method, the full rows, a method updated mid-run, per-stage Change and remembered choices (Phase 3). A PRD folder with no phase documents given to `kiln run`, a PRD on a branch of its own, and the home screen (Phase 4).

## Phase dependencies
None.

## Phase-specific notes
- The record's schema change is the next version after Kiln Phase Model Tiers' migration. Build the whole of it here, the feedback list, `waitAtEarlyReview` and `modelChoices.stages` included, so later phases add behaviour without another bump. Do the same for the Model defaults file: both new rows and the `skills` map, read and validated here, with the schema version decided by whether a released Kiln has already shipped the file (design, "Data Models").
- No plan is read in this phase. The rows are the design's no-plan form, and a stage's expected skill comes from the standing's `next`. The unknown standing and the `kiln:next` row are built here, since Check again after a stage finished by hand needs them.
- At the early review, Continue and a session of their own with Resume are built here, and the wait is always on. Phase 2 adds Send feedback at both stops and proves AC-EARLY-03 and AC-FINAL-02 whole.
- Message Claude is not offered for a requirements session until Phase 2's feedback list exists: a message to one is never an untracked live message.
- `kiln status`, `kiln continue` past the early review and `kiln start-build` are this phase's share of AC-STAGE-05; status and run commands take any path `kiln run` accepts from here on.
- The brief's file name is one constant, `source-material/{name}/{name}-brief.md`, until the method sets it (design, Open Question 2).
- Real-session proofs from Delivery owned here: a stage session that drafts a small PRD from a short brief and reports; a review session. AC-FINAL-06 is proved on a fixture run with no paid session.
