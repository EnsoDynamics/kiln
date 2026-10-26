# Phase 2: Codex billing visibility

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md) — Codex Account and Credit Contract; Local Interfaces; Persistent Data and Upgrade; Integration Evidence and Verification.
**Phase plan:** [Execution order and verification ownership](kiln-billing-safeguards-phase-plan.md)

## Summary
Show the ChatGPT account used by Codex and any attributable workspace credit facts before and during work. Preserve Codex's sign-in, provider and recovery rules while keeping current and historical account readings distinct.

## Acceptance criteria covered
AC-CODEX-01, AC-CODEX-02, AC-CODEX-03, AC-CODEX-04, AC-CODEX-05.

AC-BILL-07, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07 (also apply to this phase's work; owned by Phase 1).

## Out of scope for this phase
Claude metered-approval behavior, delivered by Phase 1; Codex API-billing approval, new provider support and other exclusions in the parent PRD.

## Phase dependencies
1 (billing view, persisted launch snapshots and shared account UI).

## Phase 1 handoff

Phase 1 owns schema 8 and the private Claude authority in `src/billing/authority.ts`, safe launch summaries in `src/billing/inspection.ts`, and `BillingPanel.svelte`. Extend the safe shared presentation/run snapshots for Codex; keep Claude's private grant exclusively Claude-owned. The schema migration preserves execution IDs and progress and begins with no historical billing assertion. Source/contract changes invalidate Claude approval, and a saved conversation's own model remains independent of future catalogue choices.

The proof contract remains the phase plan's verification ownership and the design's Integration Evidence and Verification. Phase 1's evidence and explicit native/platform limits are recorded in its phase document. Its new billing tests pair real passive SDK/installed-auth qualification with scripted model processes, real temporary Git, a protected loopback server and Chrome; they require no paid inference. Preserve that portfolio and the existing Codex regression suite when extending account attribution and history.
