# Phase 4: Complete recovery instructions without a saved conversation

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criterion below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "Status, Conversations and Handoff", "CLI and Help Contracts", "Validation Boundaries".

## Summary

Return the fresh-session instructions Kiln already offers when work stops before any conversation has been saved.

## Acceptance criteria covered

AC-SEE-05 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-05:** `src/control/projection.ts::handoffProjection`, reached by `kiln handoff <PRD-path>` and the authenticated handoff route, returns early when no saved conversation exists. A first prelaunch plan/selection stop can still have a fresh command/prompt in `src/engine/snapshot.ts::needsYouView`; the handoff response omits those instructions and their working directory. Preserve available live/cached recovery instructions while explaining that no conversation can be resumed. Keep explicit historical selection and the documented latest-saved-conversation fallback intact.

## Out of scope for this phase

New recovery actions, changes to conversation-selection policy, provider sign-in or other product scope. Reading instructions must continue to start no work.

## Phase dependencies

1 (handoff/history projections and retained browser instructions).

## Scope and closeout

Prove AC-SEE-05 as a whole through the design's Status/history validation boundary, including live and disconnected no-conversation recovery and existing selected-conversation behavior. After this phase closes, repeat whole-PRD delivery audit, then whole-PRD test audit only when delivery is clean.
