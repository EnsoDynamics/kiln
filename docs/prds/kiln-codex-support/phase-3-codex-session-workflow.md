# Phase 3: Run and recover Codex phases through pull requests — split into 3a–3b

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Codex Authority and Conversation Lifecycle; Workspace Evidence, Output and Progress; Local API and snapshot changes; Persisted schema 4; Integration and Verification → Proof gates 1, 2 and 4.

## Summary

Run the chosen Codex agent through Kiln's phase and pull-request workflow with live and saved output, authoritative workspace checks, interruption and same-conversation recovery. Keep session settings and agent identity intact through restart and manual terminal work.

## Acceptance criteria covered

AC-AGENT-02, AC-AGENT-03, AC-MODEL-03, AC-WORK-01, AC-WORK-02, AC-WORK-03, AC-WORK-04, AC-VIEW-01, AC-VIEW-02, AC-VIEW-03, AC-VIEW-04, AC-RECOVER-01, AC-RECOVER-02.

AC-MODEL-01, AC-MODEL-02, AC-USAGE-02, AC-USAGE-03, AC-USAGE-04, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase

Automatic Codex usage-limit release (Phase 4); final native-platform, installed-package and assembled-workflow release proof (Phase 5).

## Phase dependencies

1 (passed unattended/audit proof and validated raw evidence candidate); 2 (selected-agent metadata, settings, migration and validation contracts).

## Split into

| Phase | What it does | Depends on |
|---|---|---|
| [3a — Audit Codex conversation workspace evidence](phase-3a-codex-workspace-evidence.md) | Check complete saved conversation trees and bind outside-work confirmations to the exact evidence checked. | 1 (qualified audit grammar); 2 (agent records) |
| [3b — Run and recover Codex conversations through pull requests](phase-3b-codex-conversation-workflow.md) | Connect protected execution, live output and faithful recovery to Kiln's phase and pull-request workflow. | 2 (selection contracts); 3a (production checks) |

Split 2026-10-23 at implementation sizing: the independently verifiable read/check boundary must pass against real saved conversations before the mutation/recovery boundary is connected.
