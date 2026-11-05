# Phase 2: Codex billing visibility

**Closed:** 2026-10-26

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

## Implementation evidence

The installed macOS `codex-cli 0.162.1` regenerated `GetAccountRateLimitsResponse` and completed a metadata-only account/usage/account read on 2026-10-26. ChatGPT account metadata and both workspace-routing identities agreed with the stable usage account ID. The live report supplied a credit balance string and boolean availability fields; the sanitized fixture records only field shapes and attribution results, with no real identity, balance or credentials. `scripts/exploration/codex-billing-contract.mjs` reproduces that read and schema extraction without a thread, turn, purchase, reset redemption or settings mutation. Official app-server field notes establish workspace scope.

| Phase-owned criterion | Evidence |
|---|---|
| AC-CODEX-01 | Real-server Chrome checks at 360 and 1280 pixels prove ChatGPT label/email order, reported or unavailable plan/identity, neutral billing text and dashboard link. |
| AC-CODEX-02 | `src/billing/codex.test.ts` and the generated/live contract fixture cover numeric balances, availability-only, malformed/absent data, map preference, conflicting buckets, reset-credit exclusion and identity/freshness rejection. Metadata process integration proves bracketing, independent fresh credits with retained stale usage gauges, and removal on refresh failure. |
| AC-CODEX-03 | Real metadata and browser proofs retain API-only, signed-out, alternate-provider, version, skill and managed-policy failures, with no approval bypass. Existing launch/profile and session suites retain readiness checks before every launch/resume. |
| AC-CODEX-04 | Metadata and browser proofs preserve provider-named usage rows/durations and add no billing meter. Credit parsing leaves ordinary-usage permission untouched; existing Codex usage/refusal/recovery integration and protocol proofs remain the permission evidence. |
| AC-CODEX-05 | Real engine workflow persists the launch summary in PRD and session records, survives restart, and records a different resumed account without changing the first run. Browser proofs distinguish launch/next identities, agent switching and last-known disconnected credits with disabled controls. |

Shared AC-BILL-07 and AC-RUN-04–07 remain constrained by the unchanged Claude billing suite, Codex secret-canary HTTP/state assertions, root public billing guidance and installed-package inspection. Schema 8 accepts the additive safe credit facts; Claude's private approval authority remains separate and no historical billing assertions are manufactured for older runs.

Actual unavailable-balance account conditions, paid-use behavior and allowance-exhaustion behavior were not induced; no credits were bought or allowance exhausted. Native Linux/Windows metadata parity remains unproved. Scripted process fixtures prove deterministic failure and dispatch behavior beside the real installed-CLI contract; they do not prove provider billing entitlement.

## Closing audit handoff

After both planned leaves close, the next unit is a fresh whole-PRD `delivery-audit`, followed by `test-audit` only after delivery is clean, as the phase plan requires. Read both phases' evidence and the design's Integration Evidence and Verification before judging the proof portfolio. Push and publication remain separate from proof; this phase does not authorize a release or package publication.

Final validation on 2026-10-26: `npm run verify` passes with zero blocking dependency findings, ESLint and TypeScript/Svelte checks, 601 unit tests, 17 Codex protocol proofs, and 707 passing integration tests plus two existing platform skips (709 total; integration duration 627.13 seconds). The final run used frozen sources and no concurrent builds. Four installed-package checks pass. Independent deliverable review corrected credit freshness being tied to stale usage gauges; independent test hardening added credit-only next-reading, real billing-write failure with zero dispatch, and unreadable required-configuration evidence. All 41 focused hardening integration tests pass. Responsive Chrome screenshots cover ready/credits, running and disconnected states. Staged diff and secret scans pass.
