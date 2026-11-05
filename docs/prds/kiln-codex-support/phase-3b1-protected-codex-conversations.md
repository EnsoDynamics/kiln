# Phase 3b1: Run protected durable Codex conversations

**Closed:** 2026-10-23

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — Codex Authority and Conversation Lifecycle; Persisted schema 4; proof gate 2.
**Parent phase:** [Phase 3b](phase-3b-codex-conversation-workflow.md)

## Summary
Start, interrupt and resume a protected Codex conversation through the production runner, with durable attempt and settings facts. Exercise the adapter directly against real Codex before connecting normal Kiln execution.

## Acceptance criteria covered
AC-WORK-02, AC-WORK-03 (runner boundary).
AC-AGENT-03, AC-MODEL-03, AC-RECOVER-01, AC-WORK-04, AC-COMPAT-01 (also applies to this phase's work; workflow closure remains 3b2).

## Out of scope for this phase
Engine/browser integration, normal Start, live output presentation and complete workflow recovery (3b2); automatic usage release (4); final platform/package proof (5).

## Phase dependencies
2 (metadata and agent records); 3a (authoritative evidence).

## Phase-specific notes
Keep `Engine.executionGate` in place. Prove this independent adapter's identity-before-work, protected effective settings, request handling, interrupted command cleanup, dispatch crash reconciliation and original-pair resume. Wire representation and raw observed contexts must come from the pinned installed CLI, not invented fixtures. Native Windows readiness/MXC and qualified PowerShell executable plumbing belong here; native enforcement remains Phase 5.

### Inherited delivery restrictions
Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`, repeated in this implementing chat `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Continue in this same shared checkout and preserve the unrelated staged root `README.md`. Local implementation commits are not on the remote.

## Implementation state — qualified native runner

The protected adapter and proof harness are implemented. The original universal cleanup qualification **failed on macOS**; the counterexample remains recorded. Doug subsequently approved strengthening native cleanup, disclosing its detached-process limitation and avoiding substantial architecture changes (AC-RECOVER-01; RECOVER-001). Qualification now requires provider background-terminal cleanup plus verified OS cleanup of tracked processes, honest saved results and stop guidance. Do not remove `Engine.executionGate`; normal workflow integration remains 3b2.

Native cleanup is strengthened and qualified under that explicitly limited contract. The original `cleanup: complete` was a false positive. The runner persists `tracked_processes_stopped` only for successfully checked tracked processes, or `unknown` with a distinct `cleanupFailure`. The escaped-daemon characterization retains separate proof-driver cleanup and warning assertions. Do not claim containment of untracked daemons, ask a model to preserve a marker, disable tools, grant blanket approval or weaken the workspace audit.

Preserve the original conversation/evidence. All ordinary protected delivery, request-policy, settings and recovery proof already captured remains useful. The original failed full-containment case must remain distinguished from the newly approved limited guarantee.

## Validation and delivery

The strengthened runner passed real registered-background cleanup, ordinary interruption and same-conversation recovery. The replacement-environment orphan case still demonstrates escape, but now retains the approved warning and bounded result, with separately verified proof-driver cleanup. The original full-containment failure is preserved. See [conversation runner results](kiln-codex-support-conversation-results.md#strengthened-native-runtime-qualification) for exact identities and evidence. Independent deliverable review and test hardening accept the revised native contract with no remaining Medium/High findings. Final `npm run verify` passes dependency audit, lint, TypeScript/Svelte, 480 unit tests, 13 prerequisite-proof tests and 421 integration tests (two existing skips). The focused lifecycle suite passes 28 cases; six isolated hardening tests cover ownership and cancellation.

This closure is delivered in the implementation chain's scoped local feature commit; the refactor pass follows that committed baseline. No push is authorized. The unrelated staged root README.md is excluded. Continue with [3b2](phase-3b2-codex-workflow-integration.md) from the same shared checkout and its local commits; its runner-qualification handoff carries the warning and cleanup-failure integration requirements. Do not modify Enso Method.
