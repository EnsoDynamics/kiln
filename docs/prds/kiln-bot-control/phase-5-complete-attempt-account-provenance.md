# Phase 5: Complete attempt account provenance

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "Account and Usage Facts", "Status, Conversations and Handoff", "Validation Boundaries".

## Summary

Keep the last attempt’s reported account, plan and observation time tied to that attempt when a later launch fails before starting.

## Acceptance criteria covered

AC-SEE-03 (completes it; owned by phase 1), AC-ACCOUNT-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-ACCOUNT-01:** `src/control/projection.ts::accountFacts`, reached by `kiln account`, full status and authenticated account/status routes, falls back to global `record.billing.lastLaunch` instead of the selected saved attempt’s provenance. `Engine.runProcess` saves a new inspection there before its durable dispatch checkpoint and before the next attempt exists. A checkpoint failure leaves the prior actual attempt intact but can relabel it with the next account/plan. The prior attempt’s `SessionRun.billing` remains available. Return only correlated attempt facts; missing reliable provenance must remain explicitly unavailable.
- **AC-SEE-03:** The same `accountFacts` path can return an existing Claude `lastRun.account` with a newer prelaunch `lastLaunch.observedAt`. Retain the reported account fact’s own observation time rather than borrowing another reading’s timestamp.

## Phase dependencies

1 (account/status projections); 2 (durable launch admission, correlated attempts and failure handling).

## Scope and closeout

Prove both criteria as a whole through the technical design’s Account facts and Status/history boundaries. Include first Claude launch, resumed Claude attempts, Codex provenance, unavailable facts and next-account separation; exercise a later predispatch failure after the global reading changes, with no new attempt, through the public live and retained interfaces. Existing billing, provider dispatch and delivery authority remain governed by their requirements. This phase adds no account management or new spending authority.

After this phase closes, repeat whole-PRD delivery audit, then whole-PRD test audit only when delivery is clean. Implementation commits follow the implement skill default. Publication of new commits remains held for Doug’s explicit authorization; no production release is authorized.
