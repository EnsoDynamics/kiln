# Phase 2: Control existing work safely

**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "Scope and concurrency", "CLI and Help Contracts", "Status, Conversations and Handoff", "Durable Controls and Retries", "Durable Data and Evolution", "Local API and Integration Points", "Validation Boundaries".

## Summary
Let a caller reply, resume, verify completion and use the other existing-run controls while preserving the person's intention through concurrent requests, retries and controller restarts. Demonstrate the complete bot-driven workflow against the built command interface.

## Acceptance criteria covered
AC-ACT-02, AC-ACT-03, AC-ACT-04, AC-ACT-05, AC-CLI-04.
AC-SEE-03 (also applies to this phase's work), AC-SEE-07 (also applies to this phase's work), AC-ACT-01 (also applies to this phase's work), AC-CLI-01 (also applies to this phase's work), AC-CLI-02 (also applies to this phase's work), AC-CLI-03 (also applies to this phase's work).

## Out of scope for this phase
The PRD's exclusions. Do not add provider sign-in, new spending or delivery authority, or new-run setup to complete the demonstration.

## Phase dependencies
1 (authenticated discovery, execution/session identity, read commands, shared result/help contracts and bounded logs used by the complete workflow).

## Phase-specific notes
Keep shared browser/CLI/automatic admission, persisted effect correlation and restart reconciliation together with every new mutation; no control ships through a temporary retry-unsafe path. Prove the Durable effects and Complete workflow validation rows, including both provider boundaries and the accepted local Grok Bot caller. The demonstration is part of this build, not a later test-only phase; retain its release evidence in this PRD directory and do not close the phase while that proof remains owed.
