# Phase 5: Preserve takeover activity time during reconciliation

**Closed:** 2026-10-27

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

## Implementation and acceptance evidence

Gate activity retains the latest original observation time: stream input supplies its saved arrival time, transcript replay supplies the record's timestamp, and older replay cannot replace newer activity. Undated transcript rows still repair operation accounting without inventing a time. Reconciliation immediately projects newly recovered activity into the hold, while its own check time advances independently. The existing gate schema, admission, settlement and release guards remain in force.

| Criterion | Evidence |
|---|---|
| AC-TAKE-05 | `src/live/gate-activity.integration.test.ts` uses the real durable gate and process-identity lock to prove original times, repeated/older/undated replay, settlement and fresh activity. It failed against the old wall-time update and passes with the repair. |
| AC-TAKE-05 | `src/server/takeover-activity-browser.integration.test.ts` uses the real engine, journal, disposable Git, authenticated HTTP, history and built Chrome at 1200px/390px. It reconstructs stream/transcript/undated completion evidence, retains an unresolved operation, distinguishes 29/45 simulated seconds without new activity, immediately resets waiting for genuinely newer history, survives controller restart and repeated replay, and retains the hold, output link and concrete tracked-child obstacle. A real PID/start identity remains alive until natural exit; only then does the exact terminal command become available. The injected engine clock proves display semantics, not a 30-second wall-time soak. |
| Retained safe-yield boundary of AC-TAKE-05 | `node scripts/proof-run/live-takeover.mjs foreground` passed on real Claude Code 2.1.311/macOS: the admitted first operation finished, the mandatory second operation stayed unfinished, the attempt exited naturally and no cancellation signal was sent. Existing takeover/gate-process tests retain stalled/unknown ownership, hold/restart, completed-batch admission and output/release checks. Phases 1–3 retain the other provider-context qualification and its limits. |

The scripted provider in deterministic engine/browser checks complements the real-provider proof; it does not establish another supported provider profile or universal ownership guarantee. No business assumption or cancellation deadline was added.

## Publication and successor

The launch authorization is recorded in the phase plan, from Codex chat `01a17f70-0129-77e1-865b-b60fab99e8cc`: Doug said “Go ahead and push the audit, then launch a new chat for Phase 5 using GPT 6.1 Sol High Effort.” It authorized that prior audit publication and this launch, not publication of Phase 5's work. The implementation used the implement skill's scoped commit default and initially held shared-branch publication for Doug.

This repair is published as `b8cfe5e`. The authorized next unit is a fresh whole-PRD `delivery-audit`, then `test-audit` only when delivery is clean. The audit must read the full PRD, design, assumptions and all five leaves, retaining Phase 3's full-run/focused-retest portfolio and Phase 4's separate current-build full pass as distinct historical records. Bot-control and plan-continuation remain separate tracks.

Doug lifted the Phase 5 publication hold on 2026-10-27 in this implementation chat, `01a17f79-a7e3-7b40-adff-9e1a195bc47a`: “Go ahead and push Phase 5, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” `b8cfe5e` was published unchanged over `f3ec593`; no additional runtime or test changes were needed. This authorizes publication of this phase and launch of that audit with GPT 6.1 Sol at High effort. The successor uses the delivery-audit scoped commit default and holds publication of its later work for Doug. No production changes or messages to other chats are authorized.

## Repository validation

Independent deliverable review and test hardening found no material issue or additional evidence gap for this phase. Dependency audit, ESLint, TypeScript/Svelte checks, all 624 unit tests, all 17 Codex contract proofs and all 7 installed-package checks pass. The real-provider foreground proof above passed on Claude Code 2.1.311/macOS. The existing passive-billing qualification used its required retained Claude 2.1.307 on an isolated test PATH, leaving the installed CLI and takeover qualification unchanged.

The complete current-build `npm run verify` integration invocation covered all 76 files and 861 cases in 1,333.32 seconds: 858 passed, two platform skips and one timeout in the unchanged `audit-workflow.integration.test.ts` case “implements two appended repair rounds including split children before the clean test audit.” That case passed unchanged with its original 60-second deadline on both the current source (51.36 seconds for the focused invocation) and an untouched `ea5ac5e` export (53.57 seconds). Its default scripted CLI profile does not enable live controls and never enters the timestamp paths changed here. No application behavior, test assertion or deadline was changed to resolve that full-load timing failure.

All 859 executed current cases therefore have passing evidence across the complete run and focused retry. This is a full-run-plus-focused-retest portfolio, not one green full invocation. Runtime/test source hashes remained unchanged during the full run and retry. The initial new browser fixture had injected an unresolved admission before attempt drain and deadlocked its own scripted provider; the corrected crash-window fixture injects that historical projection only after natural attempt exit, and both widths pass. Phase 3 and Phase 4 retain their separate historical verification records unchanged.

Before the local commit, the worktree adopted concurrent documentation-only publication `f3ec593`. Runtime/test hashes remained identical to the validated sources; installed-package checks were rerun after its packaged README change and all seven passed (21.72 seconds).
