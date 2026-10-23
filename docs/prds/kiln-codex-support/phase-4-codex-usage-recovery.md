# Phase 4: Wait and resume after a confirmed Codex usage stop

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Account Usage and Recovery; Resume and stopping; Persisted schema 4; Integration and Verification → Proof gate 3; Open Questions → Usage runtime proof.

## Summary

Apply Codex's reported allowance and account identity to usage waits and bounded attempts to resume the original conversation. Prove the real refusal/recovery behavior as well as the restart-safe suppression of repeated attempts.

## Acceptance criteria covered

AC-RECOVER-03.

AC-AGENT-02, AC-MODEL-03, AC-WORK-03, AC-WORK-04, AC-USAGE-01, AC-USAGE-02, AC-USAGE-03, AC-USAGE-04, AC-RECOVER-01, AC-RECOVER-02, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase

A reset-only recovery path for the pinned candidate; credit purchases or reset redemption; platform/package and final assembled-workflow proof (Phase 5).

## Phase dependencies

2 (fresh account/usage identity and readings); 3 (durable attempts, same-thread resume, completion/workspace precedence and wait controls).

## Phase-specific notes

Gate 3 is part of this phase's completion evidence, not work left for the final proof phase. Record the actual refusal, changed-account recovery and repeat-refusal result in the shared proof-results document. Natural or approved test conditions must supply the real exhaustion; do not burn substantial allowance to manufacture it. If unavailable, retain the explicit release gap and leave this phase open; verified fixtures alone cannot close it.

## Phase 3b2 implementation handoff

Read [workflow integration results](kiln-codex-support-workflow-results.md), the runner results and RECOVER-001. `Engine.runCodexProcess` now delegates to the protected runner for both phase and final PR conversations; normal Codex Start no longer has an execution gate. Consume that path rather than adding a second executor. `SessionRecord.agentId` and conversation identity remain immutable; new sessions consume the selected next-session pair, while resumed attempts retain the original session model and effort.

`CodexRunFacts` retains requested/effective/observed settings, original/attempt account provenance, terminal status, structured native terminal error, failure, verificationFailure, humanRequests, modelActivityAt and independent cleanup state/warning/failure. Add structured refusal/retry facts without inferring quota exhaustion from ordinary text or a positive usage reading. Account metadata remains a separate transport that cannot dispatch work. Manual terminal turns are retained in `SessionRecord.codex.recoveryObserved`, without a fabricated Kiln launch or account claim; Check again also hydrates saved output through the evidence-only transport. A presentation refresh failure is displayed separately and never overrides the workspace audit.

All completion and PR checks call fresh `readWorkspaceEvidence`; incomplete history is never confirmable. `withCodexSafety` additionally blocks unresolved tracked-process cleanup, ambiguous dispatch and mismatched execution provenance. Preserve those checks before any usage retry and preserve the failed audit obligation through explicit repair resume. Resume notes precede repair instructions and carry-on text. A passing completion check takes precedence over another turn. Sleep recovery counts parent/child model messages, never tool results, as activity.

Keep the RECOVER-001 warning visible: independently detached programs may survive; check background servers or jobs before resuming. `tracked_processes_stopped` describes only the qualified known process set. `cleanupFailure` stays prominent beside any different work failure. Do not reintroduce universal containment or an isolated/privileged architecture.

### Inherited delivery restrictions

Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`, repeated in implementing chat `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Phase 3b2 chat `01a169f6-da99-7ad0-b166-bb105357125c` uses the same local shared `kiln` checkout, on `develop`, preserving the unrelated staged root `README.md` and local predecessor commits. Continue there under normal preflight/parallel-session rules. Local commits are authorized by the invoked implementation chain; pushing remains separately held.
