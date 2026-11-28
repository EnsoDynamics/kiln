# Phase 13: Retry a requirements stage that never got a response

**Added by test audit:** 2026-11-28, after all planned phases closed.
**Parent PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md)
**Technical design:** [Kiln Requirements Stages technical design](kiln-requirements-stages-technical-design.md) — Models and the requirements stage driver
**Phase plan:** [Execution order](kiln-requirements-stages-phase-plan.md)
**Model tier:** standard

## Summary

Offer a retry at Needs you when an agent exits before a requirements stage gets its first response. The retry starts a new session for that stage on its current choice.

## Acceptance criteria covered

AC-MODEL-06 (completes it; owned by phase 1)

## What the audit found missing

- **AC-MODEL-06:** The test `relaunches a requirements stage in a fresh session after an agent exits before a response` in `src/requirements/stage-fallback.integration.test.ts` reproduced the gap with a Claude stand-in that exited before initialization. The stage had no first response and Kiln held at Needs you with one attempt. Resume refused and Start again returned 409 with “Start again isn't offered here.” In `src/engine/engine.ts`, the first launch failure gets a `done_check` stop, which `stoppedPhase()` excludes for requirements stages. The test was removed after confirming the failure. Prove the retry on the stopped stage through the offered control, check the new session ID and absence of `--resume`, and verify that it uses the current model choice without moving to another stage.

## Phase dependencies

1 (the requirements driver and stage model decisions); 12 (recovery for requirements sessions that previously began)
