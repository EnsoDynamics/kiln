# Phase 3: Run and recover Codex phases through pull requests

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

## Phase-specific notes

Phase 1's [proof results](kiln-codex-support-proof-results.md) qualify the revised static-dataflow candidate and record the original failure. Build the production reader from that contract, including bounded paginated memory, persisted frontiers and adversarial missing/corrupt/truncated/archived/compacted history and changing-tree tests. The diagnostic capture is not a production reader; parser dependency placement, durable stop/resume, process-tree cleanup and confirmation/repair remain this phase's original scope. Any newly unsupported ordinary operation stays inconclusive and reopens candidate qualification.

The gate-1 result must pass before normal execution is connected. Integrate complete evidence and confirmations before enabling automatic phase passage; incomplete evidence must still permit the specified explicit repair resume. Include the native PowerShell reader and Windows readiness/profile plumbing here so Phase 5 exercises the delivered implementation. Prove the lifecycle and real Git/browser boundaries in this phase; the separate all-platform runtime/support obligation remains open until Phase 5.
