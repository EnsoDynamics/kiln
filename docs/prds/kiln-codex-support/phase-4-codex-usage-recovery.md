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
