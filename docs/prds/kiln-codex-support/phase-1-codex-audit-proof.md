# Phase 1: Prove Codex can be audited before integration

**Closed:** 2026-10-23

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Integration and Verification → Proof gates and tests, gate 1; Unattended execution profile; Authoritative evidence; Open Questions → Audit candidate runtime proof.

## Summary

Exercise the selected Codex candidate with unchanged published-method parent and child work, including manual recovery, and record whether Kiln can account for every relevant recorded operation. This phase establishes the prerequisite for integrating normal Codex execution.

## Acceptance criteria covered

AC-PROOF-02.

## Out of scope for this phase

Normal Kiln Codex execution and automatic phase passage (Phase 3); the chooser and account screens (Phase 2); usage refusal/recovery (Phase 4); native-platform and assembled-workflow release proof (Phase 5).

## Phase dependencies

None.

## Implementation state

**Complete — corrected gate-1 candidate qualifies.** [Runtime proof results](kiln-codex-support-proof-results.md) record unchanged published-method parent/child delivery, guarded local Git delivery in all three assigned worktrees, native same-conversation terminal recovery, real CLI/Engine repository addition and a read/write child in that added root. Verified rare-request schemas were exercised through real process pipes; the live provider emitted no client requests.

The full tree audit has complete coverage of 117 policy operations across five conversations and detects exactly the deliberately planted outside-checkout marker. That negative control correctly fails Stayed in the workspace; it does not mean the prerequisite proof failed. Initial wrapper/history-ownership defects and review findings were corrected in this phase, with no unknown coverage accepted and no method edits.

Final `npm run verify` passed audit, lint, TypeScript/Svelte checks, 471 unit tests, all 13 proof tests and 297 integration tests (two existing skips). Deliverable review and test hardening completed without remaining High/Medium findings. Normal execution remains unavailable; Phase 2 is the next planned leaf.

## Phase-specific notes

Use an isolated proof harness and disposable checkouts, with only the candidate transport, decoding and evidence components needed to exercise gate 1. Record results and sanitized fixture references in `kiln-codex-support-proof-results.md` beside this phase. A failed candidate leaves this phase open and requires a design correction or explicit product consequence before Phase 3; the later phase cannot treat the existence of this document as a passing proof.
