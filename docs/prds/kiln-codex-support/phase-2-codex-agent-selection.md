# Phase 2: Choose an agent and see its models and account

**Closed:** 2026-10-23

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Agent boundary; Selection and readiness; Models and Settings; Readings and identity; Local API and snapshot changes; Persisted schema 4.

## Summary

Let a person choose the PRD's agent before Start and see that agent's selectable models, supported efforts, account and usage readings. Preserve existing Claude records and behavior while making these controls work without a model turn.

## Acceptance criteria covered

AC-AGENT-01, AC-MODEL-01, AC-MODEL-02, AC-USAGE-01, AC-USAGE-02, AC-USAGE-03, AC-USAGE-04, AC-COMPAT-01.

## Out of scope for this phase

Codex work turns, resumable sessions and session output (Phase 3); automatic usage recovery (Phase 4); release/support claims (Phase 5).

## Phase dependencies

1 (the validated compatibility candidate and reusable metadata transport/profile).

## Phase-specific notes

Phase 1 closed on 2026-10-23. Read [Prerequisite proof results](kiln-codex-support-proof-results.md), especially the corrected candidate, verified uncommon request contracts and remaining planned obligations. The isolated transport/profile is reusable evidence; it is not an integrated production adapter. Keep work dispatch unavailable in this phase.

Stand up the agent boundary, migration and start/new-session validation inside this working selection-and-metadata slice, including Claude catalogue validation. Exercise browser selection, stale-result exclusion, metadata refresh and legacy records end to end; Codex work dispatch remains unavailable until Phase 3 supplies it. Passing metadata readiness alone never enables normal execution or marks AC-AGENT-03 complete.

## Delivery and validation

The selection slice of the listed criteria is complete. [Agent selection results](kiln-codex-support-selection-results.md) records the implementation contracts, live Codex metadata read, browser evidence, review corrections and successor ownership. Full `npm run verify` passed dependency audit, ESLint, TypeScript/Svelte checks, 474 unit tests, 13 prerequisite-proof tests and 312 integration tests (two existing skips). Test hardening also passively proves the selected-agent timer initiates its own reads, without a manual refresh masking a missing scheduler. Independent deliverable review has no remaining High/Medium findings.

Codex execution remains gated. Full execution/refusal/session-account behavior and the later recovery/platform portions of shared criteria retain their existing Phase 3–5 owners; this closure makes no release claim. Phase 3 is the next planned child in the parent phase plan. Delivery remains a local scoped commit, with no push authorized and the unrelated staged root `README.md` preserved.
