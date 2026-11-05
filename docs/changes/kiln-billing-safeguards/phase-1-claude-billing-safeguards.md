# Phase 1: Claude billing safeguards

**Closed:** 2026-10-26

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md) — Architecture and Decisions; Claude Inspection Contract; Approval and Dispatch; Local Interfaces; Persistent Data and Upgrade; Integration Evidence and Verification.
**Phase plan:** [Execution order and verification ownership](kiln-billing-safeguards-phase-plan.md)

## Summary
Show how Claude work will be billed and require deliberate approval for detected separately billed access. Carry that safeguard through later launches, recovery and restarts, with usable browser controls and public installation guidance.

## Acceptance criteria covered
AC-BILL-01, AC-BILL-02, AC-BILL-03, AC-BILL-04, AC-BILL-05, AC-BILL-06, AC-BILL-07, AC-BILL-08; AC-RUN-01, AC-RUN-02, AC-RUN-03, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07.

## Out of scope for this phase
New Codex billing summaries and workspace-credit observations (Phase 2). Existing Codex eligibility, usage and recovery remain regression requirements. Other exclusions remain those of the parent PRD.

## Phase dependencies
None.

## Implementation evidence

The qualified local boundary was exercised on macOS with Claude Code 2.1.307 and Agent SDK 0.3.310. `src/billing/passive-boundary.integration.test.ts` uses real disposable SDK settings cascades and the installed CLI's authentication-status command with synthetic credentials; no model request is made. The committed sanitized contract is `test/fixtures/billing/claude-passive-contract.json`. Managed-helper behavior is supported by the SDK declaration and generated extraction evidence, not a native managed host. Native Linux/Windows metadata and unavailable external-provider acceptance remain unproved, as allowed by the design.

| Phase-owned criteria | Evidence |
|---|---|
| AC-BILL-01–02, AC-BILL-06 | Passive SDK/auth qualification, source/empty projection and canaries; `src/billing/inspection.test.ts`; real-server billing browser cases |
| AC-BILL-03 | Account/usage/account switch rejection in `src/account/claude-info.integration.test.ts`; stale/mismatched/unattributed/missing overflow table in `src/engine/billing.integration.test.ts`; real browser overflow/history change |
| AC-BILL-04–05 | `src/billing/authority.test.ts` composes real classification with grant invalidation for source/helper/provider/payer/CLI/SDK changes; engine and browser stale clicks, restart, clear, post-setup changes, explicit continuation and zero pre-approval dispatch |
| AC-BILL-07–08 | Browser subscription email placement, preserved Fable/usage readings, no billing meter, running and disconnected views |
| AC-RUN-01–04 | Common dispatch boundary and existing phase/finalization/audit/interruptions/recovery suites; billing-specific manual and automatic recovery holds preserve conversations/refusals; passive timeout/cancellation/byte bounds |
| AC-RUN-05–06 | Historical launch snapshots, different next readings and disconnection; token/origin and bounded request checks; secret-canary snapshots/HTTP/private-record assertions; schema-7 migration, corruption and newer-reader refusals |
| AC-RUN-07 | Root npm-facing guidance; installed-package proof reads the shipped README, executes the installed passive worker and excludes fixtures/private state |

Deliverable review found and corrected overflow-only next-reading presentation and validation of future model choices during a saved-conversation resume. Test hardening added real-extractor invalidation composition, rejected overflow-attribution cases and readiness-error secret canaries. Provider refusals and hidden helper rotations are not inferred from synthetic credentials; no credits were bought, allowance exhausted, production inference started or package published.

Validation on 2026-10-26: dependency audit, ESLint and TypeScript/Svelte checks pass; 584 unit tests and 17 Codex protocol proof tests pass. The full integration run covered 704 tests (two platform skips). Its four failures were resolved by the completed-execution launch-control fix, synchronizing paused Start with its actual passive-readiness state, and serial rechecks of two delivery tests that exceeded their existing deadlines under four-worker load. All four affected files pass on recheck with unchanged launch/completion assertions and deadlines: 24 tests across billing, underway, delivery dependencies and delivery recovery. Four installed-package tests pass, including the shipped passive worker and README. Browser cases exercised the real local HTTP server at 360 and 1280 pixels; no paid inference was used.
