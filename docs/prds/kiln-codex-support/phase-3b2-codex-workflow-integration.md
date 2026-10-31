# Phase 3b2: Connect Codex conversations to the phase and pull-request workflow

**Superseded in part by:** [AC-WORK-04, workspace evidence recovery amendment of 2026-10-30](kiln-codex-support-prd.md#workspace-evidence-recovery-amendment--2026-10-30). Historical unknown-evidence confirmation restrictions below describe the original delivery; the amended PRD and technical design govern explicit acknowledgment now.

**Closed:** 2026-10-23. Protected phase/final-PR execution, truthful saved/live output and same-conversation recovery are integrated. Native Codex interruption/restart/explicit repair retained the original pair and edit; fresh complete audits passed before completion. `npm run verify` passes: 483 unit tests, 14 classifier proofs, 429 integration tests with two existing skips; audit/lint/TypeScript/Svelte pass. Deliverable review and test hardening completed. See [workflow results](kiln-codex-support-workflow-results.md) for exact proof boundaries and the Phase 4 handoff. Product commits remain local; no push authorized.

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — Codex Authority and Conversation Lifecycle; Persisted schema 4; Live and saved output; Local API and snapshot changes; proof gates 2 and 4.
**Parent phase:** [Phase 3b](phase-3b-codex-conversation-workflow.md)

## Summary
Use the proved protected runner for phase and final pull-request sessions, with truthful output and same-conversation recovery in Kiln's existing browser workflow.

## Acceptance criteria covered
AC-AGENT-02, AC-AGENT-03, AC-MODEL-03, AC-WORK-01, AC-VIEW-01, AC-VIEW-02, AC-VIEW-03, AC-VIEW-04, AC-RECOVER-01, AC-RECOVER-02.
AC-WORK-02, AC-WORK-03, AC-WORK-04, AC-MODEL-01, AC-MODEL-02, AC-USAGE-02, AC-USAGE-03, AC-USAGE-04, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase
Automatic usage release (4); final native-platform, installed-package and assembled release proof (5).

## Phase dependencies
3b1 (protected durable conversation runner and runtime proof).

## Phase-specific notes

Phase 1's [proof results](kiln-codex-support-proof-results.md) qualify the revised static-dataflow candidate and record the original failure. Phase 3a implemented the production reader, bounded pagination, persisted frontiers and adversarial history/tree checks. Consume that reader and its confirmation/repair behavior; the diagnostic capture is not a replacement. Phase 3b1 implemented the protected durable runner and native cleanup. This leaf connects those proved boundaries to the existing engine, output and recovery controls. Any newly unsupported ordinary operation stays inconclusive and reopens candidate qualification.

The gate-1 result has passed. Integrate complete evidence and confirmations before enabling automatic phase passage; incomplete evidence must still permit the specified explicit repair resume. Preserve the delivered PowerShell reader and Windows launch-profile checks so Phase 5 exercises the actual implementation. Prove the integrated lifecycle and real Git/browser boundaries here; the separate all-platform runtime/support obligation remains open until Phase 5.

## Phase 2 handoff

Read [Agent selection results](kiln-codex-support-selection-results.md) for the implemented interfaces, actual live metadata/browser evidence and delivery restrictions. Schema 4 and selection generations are already in use; consume `selectedChoice`, `AgentInfo`, the authenticated settings/refresh endpoints and the distinct `selection` stop rather than reintroducing top-level settings or a session for a failed preflight. Codex Start remains explicitly gated in `Engine.executionGate`; remove that gate only when this phase's executor, complete evidence checks and recovery are integrated and proved.

The metadata transport's allowlist deliberately excludes conversation/turn methods. Keep that property: 3b1's work adapter owns its separate authority/lifecycle transport, actual profile enforcement, Windows startup checks and durable requested/effective/observed pairs and original/attempt accounts. Metadata compatibility alone remains partial readiness. Integrate `runCodexSession`, `reconcileCodexAttempt` and their additive Codex records rather than copying the runner into the engine. Existing Claude-only fields remain Claude-specific. The method-skill list is currently the nine skills used by the published implementation chain.

Work from the same local shared checkout until Doug separately authorizes a push; Phase 1 and Phase 2 commits are not on the remote. Preserve the unrelated staged root `README.md`. Doug's quoted no-push and no-Enso-Method-edit restrictions, with their source chat IDs, are retained in the selection results and must travel with successor tasks.

## Phase 3a handoff

Read [workspace evidence results](kiln-codex-support-workspace-evidence-results.md). `auditCodexConversation` owns the evidence-only transport and production scan; `Engine.readWorkspaceEvidence` runs before the existing done/PR checks. `PhaseFacts.codexAudits` persists compact source frontiers/findings keyed by local session ID; `codexConfirmations` binds identified changes to each exact fingerprint. Session `conversation` supplies the saved thread ID, Codex home and known spawn IDs. The 3b1 executor now creates and durably populates those identities; the field itself is not launch authorization.

The snapshot's cached audit is for display only. Completion always calls the fresh reader. Unknown history cannot be confirmed. Preserve the original failed audit obligation through explicit repair dispatch, including while a conversation is resumable despite incomplete evidence. Do not reuse Claude's `initModel` or timestamp-confirmation shortcuts for Codex. The 3b1 runner now creates and durably populates `conversation` identity before dispatch; consume those facts rather than deriving provider identity from a local directory name.

The packaged PowerShell helper parses stdin without evaluation and requires a qualified parser version (currently the actual macOS test host's `pwsh` 7.5.2). A native Windows launch profile must check its actual executable/version before permitting work. Doug’s subsequent 2026-10-23 platform decision makes Linux/Windows compatibility best effort and explicitly untested; their native argv/path, enforcement and process proofs are outside Phase 5’s closure gate. Preserve the runtime checks and use Phase 5’s current acceptance scope. The metadata transport remains separate and cannot start work.

### Inherited delivery restrictions
Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`, repeated in implementing chat `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Continue in this same shared checkout and preserve the unrelated staged root `README.md`. Local implementation commits are not on the remote.

## Runner qualification prerequisite

Read [conversation runner results](kiln-codex-support-conversation-results.md), the 3b1 closure and RECOVER-001 before integration. The original full-containment counterexample remains real; Doug approved a limited native cleanup contract with truthful warning guidance, without a privileged helper or isolated architecture. Consume `CodexRunFacts.cleanup` (`tracked_processes_stopped` or `unknown`) and `cleanupWarning`, and wire `runCodexSession.onWarning` into terminal guidance. Never reinterpret a legacy `complete` value as universal containment.

Show the warning where the terminal describes Ctrl+C and in the browser recovery view for Codex: independently detached programs may survive; check background servers or jobs before resuming. Show `cleanupFailure` prominently even when the attempt also has a different work `failure`, prohibit automatic continuation while actual cleanup is unresolved, and retain the current evidence/check obligations. These UI/engine paths are owned by this integration leaf; 3b1 proves saved warning delivery at the runner boundary only. Remove `Engine.executionGate` only after the complete integrated workflow is proved.
