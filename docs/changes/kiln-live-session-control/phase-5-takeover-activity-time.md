# Phase 5: Preserve takeover activity time during reconciliation

**Added by delivery audit:** 2026-10-27, after all four implementation/completion leaves closed. Completes the AC-TAKE-05 gap confirmed against `d81de98`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Safe Checkpoint and Release, especially Release is a separate fact; Snapshot and browser; Evidence and Verification Gates.
**Repository:** kiln

## Summary

Show how long takeover has waited without new activity while Kiln is still reconciling safe release.

## Acceptance criteria covered

AC-TAKE-05 (completes it; owned by phase 1).

## What the audit found missing

- **AC-TAKE-05:** `Engine.reconcileTakeoverOnce` (`src/engine/engine.ts:755–786`) reads gate `observedAt` into the pending hold's `latestActivityAt`, then replays saved provider events and transcript user rows through `observeGate`. `src/live/gate.ts::observeGate` replaces `observedAt` with the current wall time even for already-seen historical events. Once the attempt exits, repeated reconciliation while an unsettled operation, tracked child or other release obstacle remains therefore invents fresh activity. The active session's `PausePanel.svelte` uses that time for its 30-second elapsed-wait explanation, so the explanation can remain absent despite no new activity. Keep real activity time distinct from reconciliation/check freshness; historical replay must not make old work look newly observed. The hold, output access and release guards already remain in force.

## Conflict check

No later-built criterion supersedes this part of AC-TAKE-05 or authorizes replay time as new activity. The audit shortlisted every PRD/change title and summary, then read applicable observation/recovery criteria in Kiln v1, bot control, Needs you handoff, completion audits, usage recovery and Continue Added Phases. Bot-control AC-SEE-02 reinforces the last-observed-activity rule; AC-SEE-03 requires independently read facts to retain their own observation times. Continue Added Phases AC-HANDBACK-01–04 changes revised-plan return, not activity-time semantics. The timestamp update originated with safe takeover and was extended by live-message recovery; it is a malfunction, not a recorded alternative product choice. No replacement pointer or business assumption is needed.

## Phase dependencies

1 (takeover gate, release reconciliation and waiting view); 2 (event replay and message recovery integrated into that reconciliation).

## Phase-specific notes

One bounded observation/reconciliation slice; it fits one implementation session. Prove the whole criterion, including waiting through unresolved tracked ownership with repeated reconciliation and restart/history replay, while retaining actual output and obstacles, safe hold/yield behavior and the absence of an automatic cancellation deadline. Follow the existing design's proof boundaries and repository gate. This phase adds no provider capability, ownership guarantee or new pause timing rule.

After closure, obtain a fresh whole-PRD delivery audit, then whole-PRD test audit only when delivery is clean. Phase 3's Verification run details and Phase 4's Repository validation retain their distinct historical verification claims.
