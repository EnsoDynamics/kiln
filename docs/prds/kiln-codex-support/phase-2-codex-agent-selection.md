# Phase 2: Choose an agent and see its models and account

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

Stand up the agent boundary, migration and start/new-session validation inside this working selection-and-metadata slice, including Claude catalogue validation. Exercise browser selection, stale-result exclusion, metadata refresh and legacy records end to end; Codex work dispatch remains unavailable until Phase 3 supplies it. Passing metadata readiness alone never enables normal execution or marks AC-AGENT-03 complete.
