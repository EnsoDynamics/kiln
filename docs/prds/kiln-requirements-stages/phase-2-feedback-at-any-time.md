# Phase 2: Feedback at any time

**Closed:** 2026-11-27

**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — relevant sections: "Feedback"; "The driver" (the feedback check, Stop here again, the wait); "What a session is told" (the feedback prompt and the draft ask); "How a stage ends" (a feedback session's rows); "The Two Reviews" (the draft note, the three answers, what changed, the wait); "Interfaces" (the report's `messages`, `draft` and `changes`; `POST /api/feedback`; `POST /api/settings`; `kiln feedback`, `kiln settings`); "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary
The person can send feedback at any moment, in the browser or from a terminal: a message to a running stage's session is delivered to it, and anything that session can't take is applied by a fresh session before the next stage, across every requirements document already written, without pausing the run. Both reviews gain Send feedback, the early review's wait can be turned off, and the draft's key statements show while the refinement runs.

## Acceptance criteria covered
AC-NOTE-01, AC-NOTE-02, AC-TALK-01, AC-TALK-02, AC-TALK-03, AC-TALK-04, AC-EARLY-03, AC-EARLY-04, AC-EARLY-05, AC-FINAL-02, AC-FINAL-03, AC-STAGE-04 (also applies to this phase's work), AC-STAGE-05 (also applies to this phase's work)

## Out of scope for this phase
Reading the plan from the installed method and per-stage models (Phase 3). The home screen and PRDs started by hand (Phase 4).

## Phase dependencies
1 (the requirements record with its feedback list, the driver, the report, review sessions and both stops).

## Phase-specific notes
- Message Claude to a requirements session, the feedback box and `kiln feedback` share one route; Message Claude to a build session keeps today's behaviour and hold.
- This phase's share of AC-STAGE-04 is Message Claude and the feedback session as an activity; its share of AC-STAGE-05 is `kiln feedback` and `kiln settings --wait-at-early-review`.
- Real-session proofs from Delivery owned here: a feedback session, and one message delivered live to a running stage or feedback session.
