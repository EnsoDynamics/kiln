# Phase 3b: Run and recover Codex conversations through pull requests

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

## Phase-specific notes

Phase 1's [proof results](kiln-codex-support-proof-results.md) qualify the revised static-dataflow candidate and record the original failure. Build the production reader from that contract, including bounded paginated memory, persisted frontiers and adversarial missing/corrupt/truncated/archived/compacted history and changing-tree tests. The diagnostic capture is not a production reader; parser dependency placement, durable stop/resume, process-tree cleanup and confirmation/repair remain this phase's original scope. Any newly unsupported ordinary operation stays inconclusive and reopens candidate qualification.

The gate-1 result must pass before normal execution is connected. Integrate complete evidence and confirmations before enabling automatic phase passage; incomplete evidence must still permit the specified explicit repair resume. Include the native PowerShell reader and Windows readiness/profile plumbing here so Phase 5 exercises the delivered implementation. Prove the lifecycle and real Git/browser boundaries in this phase; the separate all-platform runtime/support obligation remains open until Phase 5.

## Phase 2 handoff

Read [Agent selection results](kiln-codex-support-selection-results.md) for the implemented interfaces, actual live metadata/browser evidence and delivery restrictions. Schema 4 and selection generations are already in use; consume `selectedChoice`, `AgentInfo`, the authenticated settings/refresh endpoints and the distinct `selection` stop rather than reintroducing top-level settings or a session for a failed preflight. Codex Start remains explicitly gated in `Engine.executionGate`; remove that gate only when this phase's executor, complete evidence checks and recovery are integrated and proved.

The metadata transport's allowlist deliberately excludes conversation/turn methods. Keep that property: the work adapter owns its separate authority/lifecycle transport and may reuse verified contracts from Phase 1. Metadata compatibility is partial readiness, not an effective launch-profile proof. Add the design's actual launch settings/profile enforcement, Windows readiness/startup checks, durable requested/effective/observed pairs and original/attempt account provenance here. Existing session fields remain Claude-specific until their planned Codex discriminators are implemented. The method-skill list is currently the nine skills used by the published implementation chain.

Work from the same local shared checkout until Doug separately authorizes a push; Phase 1 and Phase 2 commits are not on the remote. Preserve the unrelated staged root `README.md`. Doug's quoted no-push and no-Enso-Method-edit restrictions, with their source chat IDs, are retained in the selection results and must travel with successor tasks.

## Phase 3a handoff

Read [workspace evidence results](kiln-codex-support-workspace-evidence-results.md). `auditCodexConversation` owns the evidence-only transport and production scan; `Engine.readWorkspaceEvidence` runs before the existing done/PR checks. `PhaseFacts.codexAudits` persists compact source frontiers/findings keyed by local session ID; `codexConfirmations` binds identified changes to each exact fingerprint. Session `conversation` supplies the saved thread ID, Codex home and known spawn IDs. Creation and durable population of those identities remain this phase's executor responsibility; the field is not launch authorization.

The snapshot's cached audit is for display only. Completion always calls the fresh reader. Unknown history cannot be confirmed. Preserve the original failed audit obligation through explicit repair dispatch, including while a conversation is resumable despite incomplete evidence. Do not reuse Claude's `initModel` or timestamp-confirmation shortcuts for Codex.

The packaged PowerShell helper parses stdin without evaluation and requires a qualified parser version (currently the actual macOS test host's `pwsh` 7.5.2). A native Windows launch profile must establish its actual executable/version and prove recorded argv and path semantics before it is accepted. Linux/Windows enforcement and process proofs remain Phase 5 obligations. The metadata transport remains separate and cannot start work.

### Inherited delivery restrictions
Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`, repeated in this implementing chat `01a16974-c46c-73f3-bad3-625613b83a7b`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Continue in this same shared checkout and preserve the unrelated staged root `README.md`. Local implementation commits are not on the remote.
