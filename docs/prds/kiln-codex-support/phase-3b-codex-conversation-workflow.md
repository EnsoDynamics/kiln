# Phase 3b: Run and recover Codex conversations through pull requests — split into 3b1–3b2

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — Codex Authority and Conversation Lifecycle; Live and saved output; Local API and snapshot changes; Persisted schema 4; proof gates 1, 2 and 4.
**Parent phase:** [Phase 3](phase-3-codex-session-workflow.md)

## Summary
Connect protected Codex execution, live and saved output, and same-conversation recovery to Kiln's phase and final pull-request workflow.

## Acceptance criteria covered
AC-AGENT-02, AC-AGENT-03, AC-MODEL-03, AC-WORK-01, AC-WORK-02, AC-WORK-03, AC-VIEW-01, AC-VIEW-02, AC-VIEW-03, AC-VIEW-04, AC-RECOVER-01, AC-RECOVER-02.

AC-MODEL-01, AC-MODEL-02, AC-WORK-04, AC-USAGE-02, AC-USAGE-03, AC-USAGE-04, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase
Automatic usage-limit release (4); final native-platform, installed-package and assembled-workflow release proof (5).

## Phase dependencies
2 (selected-agent metadata, settings, migration and validation); 3a (production evidence checks).

## Split into

| Phase | What it does | Depends on |
|---|---|---|
| [3b1 — Run protected durable Codex conversations](phase-3b1-protected-codex-conversations.md) | Exercise protected start, stop and same-conversation resume with durable identities and provider outcomes. | 2 (metadata); 3a (authoritative evidence) |
| [3b2 — Connect Codex conversations to the phase and pull-request workflow](phase-3b2-codex-workflow-integration.md) | Integrate the proved runner, output and recovery controls into Kiln's existing screens and checks. | 3b1 (proved protected lifecycle) |

Split 2026-10-23 at implementation sizing: prove the protected mutation/recovery boundary before connecting automatic phase passage and browser recovery.
