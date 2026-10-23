# Phase 1: Prove Codex can be audited before integration

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

## Phase-specific notes

Use an isolated proof harness and disposable checkouts, with only the candidate transport, decoding and evidence components needed to exercise gate 1. Record results and sanitized fixture references in `kiln-codex-support-proof-results.md` beside this phase. A failed candidate leaves this phase open and requires a design correction or explicit product consequence before Phase 3; the later phase cannot treat the existence of this document as a passing proof.
