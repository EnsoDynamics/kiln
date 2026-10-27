# Phase 4: Complete live connection and audit return wording

**Added by delivery audit:** 2026-10-27, after all three planned implementation phases closed. Completes the two presentation gaps confirmed against `d7c59a2`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Snapshot and browser; Activity-specific evaluate, then act; Evidence and Verification Gates.
**Repository:** kiln

## Summary

Describe a lost browser connection as last-known information, and consistently name the actual audit when returning from terminal takeover.

## Acceptance criteria covered

AC-LIVE-02 (completes it; owned by phase 2), AC-BACK-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-LIVE-02:** `view/src/lib/connection.svelte.ts::Connection.lost` sets `connected=false` on an EventSource error or missed heartbeat without observing controller/provider exit. `App.svelte` retains the snapshot, but `Running.svelte` and `PhaseDetail.svelte` render `DisconnectedBanner.svelte`, which says “Kiln isn’t running” and “Nothing is being worked on” and recommends `kiln run`. A temporary browser transport outage therefore claims work stopped when it may continue. The affected live views must present last-known state/time and reconnect guidance without inventing process-release evidence. Existing mutation disables are already wired; no ownership bypass was demonstrated.
- **AC-BACK-01:** Audit takeover reaches `PhaseHandoff.svelte` through `Engine.phaseRecoveryTarget` and the existing Needs you route. Although its action buttons use `snapshot.liveControl.label` with the audit name/round, its introduction, preserved-reply explanation, Resume guidance, unavailable-recovery guidance and completion-list accessible label still call that audit a “phase.” Complete the activity naming throughout that return flow; the same-conversation Resume/Verify behavior is already wired.

## Conflict check

No later-built criterion supersedes either requirement. Kiln v1 AC-VIEW-07 conditions stopped-work copy on Kiln actually stopping; a browser transport failure does not establish that condition. Bot-control AC-SEE-03 likewise requires clearly labeled last-known disconnected facts. The older Needs you handoff scoped its phase wording to implementation phases and explicitly excluded audits; its existing replacement pointers lead to AC-BACK-01. Completion-audits AC-RUN-01 independently requires audit identity rather than implementation-phase labeling. The remaining phase wording is inherited text, not a recorded alternative product decision.

## Phase dependencies

1 (existing phase/audit terminal return); 2 (active-session availability and browser connection states); 3 (closed cross-interface delivery baseline).

## Phase-specific notes

One bounded browser presentation slice; keep both gaps together. Prove each whole criterion, including the existing availability and hand-back safeguards, rather than only replacing the cited strings. Use built browser checks for transport loss while the controller/attempt remains alive, reconnect and retained drafts, plus delivery-audit and test-audit return with their actual rounds. Preserve ordinary phase recovery and the existing provider/process-release boundary. This phase adds no runtime capability, permission, universal ownership guarantee or new business rule.

After closure, obtain a fresh whole-PRD delivery audit, then the whole-PRD test audit only when delivery is clean. The Phase 3 leaf's Verification run details remain the source for the inherited full-run/focused-retest limits; this audit did not rerun or grade those tests.
