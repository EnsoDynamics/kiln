# Phase 4: Complete live connection and audit return wording

**Closed:** 2026-10-27

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

## Implementation and acceptance evidence

Transport loss now labels retained information as last known across the shared banner, activity header/rows, session detail, settings and Kiln panel. The browser offers reconnect guidance without claiming controller/provider exit or suggesting that an unobserved attempt is released. Existing connection detection, disabled mutations and exact-attempt draft storage are unchanged. The terminal return introduction, preserved-reply explanation, Resume/unavailable guidance and accessible completion list use the same actual activity label as its action buttons.

| Criterion | Current evidence |
|---|---|
| AC-LIVE-02 | `src/server/live-connection-browser.integration.test.ts`: built Chrome at 1200px/390px, real assembled controller and a scripted provider subprocess, with only the browser SSE transport broken by a loopback proxy. It proves the attempt stays alive, retained output/state/time, disabled Send/takeover/deferred pause, no false stopped/released claim or restart command, exact draft retention and reconnect without a second attempt. `live-control-browser.integration.test.ts` adds Codex's Claude-only explanation, absent composer, disabled takeover and working deferred pause. Existing `live-message-browser.integration.test.ts`, `view-in-browser.integration.test.ts`, live engine suites and bot command tests retain pending-send/input-loss, heartbeat, historical, waiting/stopped/completed and recovery-state evidence. |
| AC-BACK-01 | `src/server/live-control-browser.integration.test.ts`: delivery audit Round 3 and test audit Round 2 at 1200px/390px, checking actual activity wording throughout return, preserved replies, unavailable recovery and accessible completion labels, plus exit-first/requirements/no-special-phrase guidance. Existing `phase-handoff-browser.integration.test.ts`, `phase-handoff.integration.test.ts` and `live/takeover.integration.test.ts` retain ordinary phase/Codex recovery, stopped reply versus no-message Resume, same-conversation audit rounds, explicit already-complete choice, release/ownership and uncertain-message safeguards. |

The network/provider-event fixtures prove the changed presentation, not a new provider qualification or universal ownership guarantee. Earlier real-provider proof remains governed by Phases 1–3 and the technical design. Independent deliverable review found no remaining product gap. Test hardening added the missing Codex availability case; both criteria's scoped evidence is adequate. No new business assumption was introduced.

## Publication and successor

The original implementation launch in Codex chat `01a17f2a-6ba2-7cf2-9f5e-aaa2a49c6f46` held Phase 4 publication for Doug. Doug lifted that hold on 2026-10-27 in this implementation chat `01a17f38-170a-7e40-9592-6daa88192bed`: “Go ahead and push Phase 4, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.”

Phase 4 is published as `731c591`. Its original local commit `e99fd7d` was replayed over two remote documentation-only bot-control commits; `git range-diff` confirms its patch is unchanged, and runtime/test files match the validated implementation. The shared checkout is current and clean after publication. This approval authorizes the fresh whole-PRD delivery-audit launch with GPT 6.1 Sol at High effort. The successor uses the delivery-audit scoped commit default; its publication, production changes and messages to other chats remain unauthorized. Test audit follows only after delivery is clean. Bot-control and plan-continuation remain separate tracks.

## Repository validation

Validation uses a fresh build after the concurrent bot-control publication at `6ced34a`. Dependency audit, ESLint, TypeScript/Svelte checks, all 624 unit tests, all 17 Codex contract proofs and all 7 installed-package checks pass. The earlier broad invocation crossed that publication and loaded mixed baselines; it is not claimed as the final current-build gate. The stale disconnected-detail expectation found during that invocation was corrected to the required last-known wording, retaining its output and disabled-control checks.

The fresh complete integration invocation passed all 74 files: **856 passed, 2 platform skips**, 858 cases, in **848.48 seconds**. Runtime/test source hashes remained unchanged during that invocation. The built-browser portfolio covers 22 focused cases across live-control, transport loss, messaging and ordinary terminal hand-back; the complete run includes the added Codex availability case. This is a green complete current-build run, without reclassifying Phase 3's historical full-run/focused-retest portfolio. No application timeout or safety assertion was weakened.
