# Phase 4: Wait and resume after a confirmed Codex usage stop

**Closed:** 2026-10-23 — implementation accepted with Doug’s explicit deferral of real quota exhaustion/recovery to live use.

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Account Usage and Recovery; Resume and stopping; Persisted schema 4; Integration and Verification → Proof gate 3; Open Questions → Usage runtime proof.

## Summary

Apply Codex's reported allowance and account identity to usage waits and bounded attempts to resume the original conversation. Verify the refusal/recovery rules and restart-safe suppression of repeated attempts, retaining Doug’s deferred real-quota validation explicitly.

## Acceptance criteria covered

AC-RECOVER-03.

AC-AGENT-02, AC-MODEL-03, AC-WORK-03, AC-WORK-04, AC-USAGE-01, AC-USAGE-02, AC-USAGE-03, AC-USAGE-04, AC-RECOVER-01, AC-RECOVER-02, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase

A reset-only recovery path for the pinned candidate; credit purchases or reset redemption; platform/package and final assembled-workflow proof (Phase 5).

## Phase dependencies

2 (fresh account/usage identity and readings); 3 (durable attempts, same-thread resume, completion/workspace precedence and wait controls).

## Phase-specific notes

Gate 3 initially uses pinned provider contracts, real metadata and automated process/engine/browser recovery evidence. Doug explicitly deferred actual quota exhaustion/recovery to the first live occurrence on 2026-10-23: an exhausted account is unavailable, and “Just do your best to have it work the right way, and I will have to test it in real life conditions when that actually occurs.” Source: chat `01a16a2e-3595-7d31-b4e5-25753d32f125`; incorporated into PRD AC-PROOF-03. Real refusal, changed-account recovery and native repeat-refusal suppression remain unproved, but do not block implementation closure. Never burn allowance to manufacture them or claim fixtures are native quota proof.

## Implementation and continuation state — 2026-10-23

The recovery implementation is complete under the initial verification standard above. The production metadata probe reports ordinary usage allowed. The proof driver’s exhaustion guard ran and started no model turn. Actual quota refusal, changed-account inference recovery and native repeat-refusal suppression remain unproved under Doug’s approved live-use deferral above. See [Gate 3 observations](kiln-codex-support-proof-results.md#gate-3--actual-usage-proof-deferred-to-live-use). Phase 5 may consume the implementation after this phase closes; no real quota pass or release authorization follows.

`codex-usage.ts` classifies only the current failed terminal's scalar `usageLimitExceeded`. The runner retains structured retry notifications separately, records refusal/account/original-model facts, and persists consumed semantic permission before dispatch. `codex.usageRecovery` survives restarts; unchanged positive readings, emails, timestamps and window percentages cannot release a consumed attempt. Fresh full metadata brackets account/usage/account, retains stable usage identity, recognizes administrative/spend-control blocks, and never derives inference permission or refusal scope from `normalModelSlug`, window percentages, credits or prose. The pinned profile supplies no reset-only path.

The engine reuses protected execution, fresh completion/workspace checks and existing locks. It refreshes immediately after refusal and on wake, retains the five-minute metadata schedule, and checks a fresh launch reading again before a bounded automatic attempt. Unknown permission and administrative blocks show Needs you; manual Resume and Resume now retain their existing authority. Original and attempt accounts remain separate. Codex waiting/Needs you expose truthful allowance rows, unknown/reset fields, provider permission and the RECOVER-001 warning.

To run the live proof when conditions exist:

```text
npm run build
node scripts/proof-run/codex-usage-proof.mjs seed
node scripts/proof-run/codex-usage-proof.mjs inspect <printed-owned-folder>
node scripts/proof-run/codex-usage-proof.mjs refuse <same-folder>
# After the person changes Codex sign-in in a terminal:
node scripts/proof-run/codex-usage-proof.mjs recover <same-folder>
# Only after an actual repeated refusal, in a fresh process reading saved state:
node scripts/proof-run/codex-usage-proof.mjs suppression <same-folder>
```

The driver does not log account identity publicly, change authentication, purchase/reset anything or exhaust an account deliberately. Saved owner-only session records retain the actual identities. Resume only the original conversation and pair, with fresh complete workspace evidence and tracked cleanup. Record actual outcomes, including unexercised cases, in the shared proof results. Existing native workflow proof remains useful; do not rerun ordinary implementation work to consume allowance.

## Phase 3b2 implementation handoff

Read [workflow integration results](kiln-codex-support-workflow-results.md), the runner results and RECOVER-001. `Engine.runCodexProcess` now delegates to the protected runner for both phase and final PR conversations; normal Codex Start no longer has an execution gate. Consume that path rather than adding a second executor. `SessionRecord.agentId` and conversation identity remain immutable; new sessions consume the selected next-session pair, while resumed attempts retain the original session model and effort.

`CodexRunFacts` retains requested/effective/observed settings, original/attempt account provenance, terminal status, structured native terminal error, failure, verificationFailure, humanRequests, modelActivityAt and independent cleanup state/warning/failure. Add structured refusal/retry facts without inferring quota exhaustion from ordinary text or a positive usage reading. Account metadata remains a separate transport that cannot dispatch work. Manual terminal turns are retained in `SessionRecord.codex.recoveryObserved`, without a fabricated Kiln launch or account claim; Check again also hydrates saved output through the evidence-only transport. A presentation refresh failure is displayed separately and never overrides the workspace audit.

All completion and PR checks call fresh `readWorkspaceEvidence`; incomplete history is never confirmable. `withCodexSafety` additionally blocks unresolved tracked-process cleanup, ambiguous dispatch and mismatched execution provenance. Preserve those checks before any usage retry and preserve the failed audit obligation through explicit repair resume. Resume notes precede repair instructions and carry-on text. A passing completion check takes precedence over another turn. Sleep recovery counts parent/child model messages, never tool results, as activity.

Keep the RECOVER-001 warning visible: independently detached programs may survive; check background servers or jobs before resuming. `tracked_processes_stopped` describes only the qualified known process set. `cleanupFailure` stays prominent beside any different work failure. Do not reintroduce universal containment or an isolated/privileged architecture.

### Inherited delivery restrictions

Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`, repeated in implementing chat `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Phase 3b2 chat `01a169f6-da99-7ad0-b166-bb105357125c` uses the same local shared `kiln` checkout, on `develop`, preserving the unrelated staged root `README.md` and local predecessor commits. Continue there under normal preflight/parallel-session rules. Local commits are authorized by the invoked implementation chain; pushing remains separately held.

## Final validation and delivery

Dependency audit, ESLint, TypeScript/Svelte, all 487 unit tests and all 14 pinned protocol proofs pass. The full integration run passes 450 tests with two existing skips, and times out in the existing paused-CLI Start case. The same case fails under full load in an unchanged export of predecessor `a88935f`; the complete nine-test CLI file passes separately on both predecessor (69.04 seconds) and current code (65.20 seconds). The twenty-test quota recovery file passes in the complete run. The hardened durable-dispatch scenario passes again after strengthening the child’s on-disk consumption assertion. No combined full-suite green is claimed.

Independent deliverable review and test hardening completed with no remaining material findings. Browser checks cover Waiting and unknown Needs you at 360/1280 widths, with no overflow or browser errors. Actual quota refusal/recovery remains unproved under Doug’s decision; no allowance was spent to manufacture it. Phase 5 is the next planned leaf. The scoped implementation chain commits locally, preserves staged root `README.md` and all predecessor commits, and never pushes under the inherited restriction. Refactor judgment follows that committed baseline.
