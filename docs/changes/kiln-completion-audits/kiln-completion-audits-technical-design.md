# Technical Design: Kiln automatic completion audits

**PRD:** [Kiln automatic completion audits](kiln-completion-audits-prd.md) · **Assumptions:** [UPGRADE-001, validated](kiln-completion-audits-assumptions.md#upgrade-001)

## Overview

Extend Kiln's foreground execution loop with delivery-audit and test-audit activities before final delivery. An activity is a durable unit of scheduled work, with provider sessions and independently checked completion facts. The engine owns routing and recovery; installed Enso Method skills own assessment, completion-phase writing and test remediation. A typed audit report binds their conclusions to requirements, plan, repositories and evidence. Neither provider prose nor an audit-completion commit grants completion.

## Existing Code

**Posture: Preserve**, as requested.

- Reuse the engine's single execution owner, instance lock, atomic private JSON storage and authenticated local HTTP/SSE transport.
- Reuse plan parsing, ordered leaf selection, repository discovery and all implementation completion checks.
- Reuse Claude Code and Codex launch, identity, transcript, workspace and usage-recovery protections.
- Extend external prompt templates, snapshot-driven progress rows, detail screens and terminal events.
- Preserve development grants, retained checkpoint obligations, synchronization and mixed delivered/review outcomes.
- Preserve current-authority recovery prompts, including manually reopened conversations and first-grant activation.
- Preserve original phase IDs, closure history, provider conversations and historical completion facts.
- Keep method skills unchanged; Kiln supplies its explicit execution contract around them.

## Architecture and Scheduling

This is an extension of the local TypeScript application; no new service, database, queue, timer or external credential is needed. Store scheduling facts beside existing private execution state. Store portable audit reports with the governing PRD, and retain immutable copies in private state when accepted. Single-engine serialization owns scheduling, result acceptance, repository additions and recovery; do not add a second lock protocol.

### One completion decision

Every startup, loop continuation, session settlement, Check again and Resume uses one next-activity decision. Evaluate outstanding workspace, plan and required development evidence first. Then select the first applicable row:

| Current facts | Next work |
|---|---|
| An activity is live, interrupted, stopped or usage-limited | Reconcile that activity under Recovery; never start another concurrently |
| An unfinished implementation leaf is eligible | Ordinary implementation session, including discovered completion phases and split descendants |
| No current successful whole-PRD delivery audit | Fresh Delivery audit |
| Delivery audit passed; test evidence absent, stale or unfinished | Fresh Test audit or its saved continuation |
| Both audits current, no blocker and no open leaf | Existing final repository evaluation; finalization session only for remaining work |
| Final evaluation and current audit checks pass together | Complete |

An accepted report advances only after its session settles and repository/workspace checks pass. Atomically retain that accepted result and next-work facts before dispatch. The next iteration starts immediately unless an existing pause, interruption, usage wait or blocker applies (AC-RUN-07). Pause after the current activity becomes active at an accepted audit boundary, including before a test continuation or repair phase. A failed audit remains stopped with the pending pause retained.

A delivery audit with gaps routes to its completion leaves. After their completion, allocate a new delivery round. A test audit with completion phases does the same. A direct implementation fix made by a test audit invalidates delivery success even if all its grades pass: run a new delivery audit, then reassess affected test rows before finalization. Test-only remediation may continue in fresh sessions within the same test round. No hard-coded round limit silently approves or abandons a PRD. A normally ended session lacking either a valid result or an actionable saved continuation becomes Needs you; it is never automatically retried merely for failing.

### Activity identity and order

Add `activities[]` to the execution record. Each entry has an opaque `activityId`, monotonic `sequence`, `kind: implementation | delivery_audit | test_audit | final_delivery`, optional `phaseId`, audit `round` and `continuation` numbers where applicable, `sessionIds[]`, `createdAt`, lifecycle facts, and accepted-result reference. Allocate identity and launch intent before spawning. Round numbers increase per audit kind; a test continuation increments `continuation` in its original round. A resumed provider run keeps its activity and session identity. A fresh test continuation or repeated audit gets a new activity and fresh provider conversation.

Keep the phase plan authoritative for implementation scope and ordering. Activities record observed execution order, not a second phase plan. Preserve existing phase-keyed facts and session storage paths; additive `activityId` and audit session kinds distinguish audit storage under `audit-<activityId>`. Never put audit IDs in the phase parser or fabricate Closed lines. Finalization retains its existing facts and delivery history.

## Audit Report and Local Interface

### Portable report

Each audit activity writes `<prd-directory>/kiln-audit-<activityId>.json`. Its exact reserved path is assigned by Kiln, never taken from arbitrary agent input. The report is committed and pushed through normal scoped checks; a method-required empty audit commit remains permitted. Delivery audits always produce this record even when the method itself changes no document. Test audits also maintain the method's existing `test-audit.md`; its filename remains compatible with that installed skill.

The version-1 report contract is:

| Field | Contract |
|---|---|
| `schemaVersion` | `1`; unsupported versions are refused |
| `executionId`, `activityId`, `kind`, `round`, `continuation` | Exact assigned identities |
| `scope` | Governing PRD repository/path, `whole_prd`, requirement manifest ID and all criterion labels, including excluded labels with replacement pointers |
| `checkedSnapshotId` | Engine-issued snapshot of the work actually assessed, including all assigned repositories |
| `criteria[]` | One row per scoped label; required parts, applicable/superseded portion, method status/grade, code/test references, checked revisions, findings and evidence references |
| `methodEvidence` | Skill name/path, assessment and independent-review references; test audit additionally names baseline/final suite commands, observed results, red checks or permitted impossibility reasons, and remediation re-grade evidence |
| `completionPhases[]` | Phase ID/path, origin audit kind/activity, affected labels, missing behavior and dependencies |
| `continuation` | When test work remains: remaining labels, record path and precise next batch; never an opaque executable prompt |
| `pendingHumanActions[]` | Criterion, action, requirement pointer and whether the requirements put it beyond Kiln's delivery boundary |
| `blockers[]` | Criterion labels, concrete problem and required action; includes unrecorded behavior changes, unavailable mandatory evidence and denied authority |
| `outcome` | `passed | completion_phases | continue_test | blocked` |

References identify assigned repository, relative path and immutable commit/blob, or provider session/turn/tool-call identity. Do not treat report assertions of successful commands as observed command results. Store the full report bytes and their digest with the accepted result; later edits do not erase the original. This is structured evidence of an agent audit, not a claim that Kiln can formally prove application behavior.

Delivery rows use the installed method's Implemented, Partly implemented, Not implemented, Waiting on a human action, Superseded, Changed outside the requirements and Not built yet statuses. Test rows retain its grades and special statuses. The engine applies AC-TEST-04's stricter completion boundary: a method-level Done does not waive a blocked row. Person-checked evidence must identify the governing criterion's permitted human evidence and its recorded result; the engine cannot invent it. Missing/Weak, waiting-on-delivery, unexplained omitted criteria, unresolved intentional behavior changes and in-boundary human work prevent final success.

### Commands and routes

Use the running Kiln executable pinned in the session's prompt, as for development delivery. The CLI discovers the execution from the assigned workspace and calls the authenticated loopback API. It reads JSON payloads from files, prints JSON results, and exits nonzero for refused or unresolved operations. No command grants permissions or launches arbitrary commands.

| CLI / HTTP | Request | Response |
|---|---|---|
| `kiln audit status` / `GET /api/audit` | None | Execution/activity identities, revision, current snapshot, required report path, accepted results and outstanding checks |
| `kiln audit snapshot <file>` / `POST /api/audit/snapshot` | `{executionId, activityId, revision, testPaths[], evidencePaths[]}` | `{revision, snapshotId, requirements, plan, repositories}` read independently from disk/Git |
| `kiln audit submit <file>` / `POST /api/audit/result` | `{executionId, activityId, revision, reportPath}` | `{revision, disposition: recorded | unresolved, checks[], nextAction}` |

Snapshot declarations are repository-relative exact paths, not exclusion globs; evidence paths identify method output documents, never implementation. Snapshot issuance does not confer a pass. An audit that changes code or tests requests a new snapshot after changes and re-grades against that snapshot. The report can then be committed without changing the content it claims to have checked.

Submission runs under existing engine serialization, records the candidate and validation facts, and retains them through a disconnect. Identical identity/report-digest retries return the same result before rejecting an old revision. A different digest for a settled activity is refused; a failed/unresolved submission may be corrected in the same activity and is retained as a new attempt. Recovery can discover a committed report at the assigned path even if the submission command never ran. It applies exactly the same validation.

Errors: `400 malformed_request`, `403 outside_execution`, `409 stale_revision | wrong_activity | busy | result_conflict`, `422 invalid_report | stale_snapshot | inconsistent_plan | missing_evidence`, `503 evidence_unavailable`. Return `{code, reason, criteria[], checks[]}`; missing fields never default to success. File paths must resolve within the assigned repository, without symlink escapes. Retain Host, Origin and token protections. A state-write failure rolls back the in-memory mutation and prevents advancement. Remote/history reconciliation has the existing 120-second overall deadline including pagination; incomplete reads are unresolved, not empty evidence.

### Acceptance checks

Validate schema/identities, full criterion coverage, current snapshots, referenced files and provider evidence, plan consistency, and Committed/Pushed/Stayed-in-workspace facts across every assigned repository. Audit sessions have an **Audit result recorded** check instead of Phase doc closed. Required development obligations remain an additional check.

A `completion_phases` result must match new open plan entries with method origin markers and affected labels, append identities without changing original ownership or closures, resolve dependencies, and contain only missing behavior for existing criteria. Validate these audit-added entries beyond the normal underway structural plan check. Record their IDs before dispatch. If a crash leaves phase files but no valid report, resume/recover the originating audit to reconcile those files; it must adopt the existing entries, not allocate duplicates. A report and plan disagreement stops at Needs you.

A `continue_test` result requires committed updated test-audit records, nonempty remaining work and evidence of progress since the preceding continuation: changed evidence/grades, completed remediation, or newly identified actionable work. An identical unfinished batch without progress is a blocker, not an endless fresh-session loop. Blockers win over all routing outcomes. An audit cannot return `passed` while its report or current plan contains an implementation gap/open leaf. The engine independently derives the next action from these facts rather than executing report text.

## Current Work and Invalidation

A snapshot stores canonical repository identities, assigned branches, HEADs, tree/blob digests, required-document manifest, normalized plan, criterion labels and provider-evidence references. Resolve governing PRD, assumptions, design, phase documents and referenced replacement requirements; missing/unreadable references stop. Record hashes of installed audit skill sources for provenance, without making a later skill installation alone invalidate completed history.

Use content equality for currentness, with commit IDs retained for inspectability. A record-only or synchronization commit with unchanged relevant content does not force another audit. Current checks still require clean assigned worktrees and verified pushed heads. Repo additions, deleted/missing sources, requirements changes or unknown changed paths invalidate delivery and test conclusions. New plan leaves take scheduling priority; changes to phase scope/dependencies count as requirements changes.

Classify deltas conservatively:

- Requirements and all non-test, non-record tracked content form the delivery fingerprint. Unknown files count as implementation. Code/requirements changes require a fresh delivery audit and test reassessment.
- Exact test and shared-test-setup paths declared in audit evidence form the test fingerprint. Their changes require test reassessment; shared setup changes reassess all rows. New/unclassified tests conservatively invalidate both until classified in the new audit.
- Exclude only assigned audit JSON paths and the method's exact test-audit record from work fingerprints, while still checking their bytes against accepted records. Do not exclude their directory or arbitrary agent-declared files. Exclude only parsed checkbox/Closed status metadata from phase-document content; retain phase IDs, scope, dependencies, split structure and every other byte. GitHub final-description text is outside repository content and does not invalidate audits, but finalization still verifies it.

Path classification is a checked artifact: testPaths must be supported by the repository's test collection/configuration and observed commands, and cannot contain runtime/configuration files used by the built system. Ambiguous classification uses the implementation category; an agent assertion cannot exempt code. Merely listing a file in `evidencePaths` never excludes it. Changes to report evidence or its criterion accounting invalidate that result even when excluded from work fingerprints.

Retained test grades need their original checked content and referenced tests/code still current under the method's re-audit rules. Conservative whole-test reassessment is valid where a precise affected set cannot be established. A new delivery audit after a direct test fix is followed by a fresh test-audit activity that validates the retained grades and reassesses affected rows. Final completion reruns currentness after finalization and in the same serialized decision as repository delivery checks; changed material routes back to audits, not Complete.

## Provider Sessions and Development Delivery

External audit prompt templates name the installed `delivery-audit` or `test-audit` skill, whole-PRD paths, round, record contract, current snapshots, prior report/continuation, repository roots and effective authority. They expressly require fresh assessment/re-grading per the method and instruct the session to finish its assigned activity, leaving the next activity to Kiln. They supply scoped commit/push authority for records, tests and permitted small fixes on the assigned feature branches. A delivery audit cannot implement its gaps.

Claude Code invokes the available skill through its normal Skill mechanism; persist the tool call and its result from authoritative saved events. Missing skill or failed invocation is Needs you. Codex resolves the exact enabled installed skill path for the activity at launch rather than unconditionally invoking implement-from-requirements. Persist the discovered path/source digest and require authoritative conversation evidence of reading that skill and conducting the requested audit. Both providers retain subagent assessment/re-grade evidence and actual command/result references, including errors. Missing/incomplete authoritative history cannot be replaced by rendered success text. Follow the existing bounded transcript/history collection and workspace audit for each provider, including subagent work. Never add writable roots solely to let a provider edit private state; the CLI supplies the local interface.

Audit activities can assess required development delivery for their affected criteria, using the same target grants and retained ledger. Extend assessment/checkpoint ownership additively with `activityId`; existing `phaseId` remains for phase obligations. An audit-owned assessment names criteria and governing-document digest; audit continuation retains its outstanding checkpoints and later repair phases inherit obligations by explicit assignment. A stale/new audit report cannot erase an unresolved delivery obligation. Allow preparation only for the active audit's required verification/remediation and existing recovery scope, never arbitrary future work or final review remainder. First-grant activation includes the stopped audit and earlier relevant phase obligations without granting new targets. Final evaluation covers all retained phase- and audit-owned checkpoints.

## Recovery and Upgrade

Persist activity intent, session association, submitted report attempts and accepted decision before their corresponding next action. On restart acquire the existing instance lock; settle or stop any owned live provider process before checking artifacts. Check completion first, then resume only the still-unfinished activity. For Codex retain dispatch/turn reconciliation and refuse ambiguous dispatch or cleanup; a private server exit is not proof of turn completion. For Claude retain session ID, run records, transcript and resume semantics. A valid report may be accepted after interruption even if the final process result was never saved, once current checks and workspace evidence pass.

An audit that ended normally without its result stops. An interrupted audit may resume its original conversation; a usage-limit refusal uses existing provider/account recovery. A nonresumable conversation uses the existing explicit fresh-session recovery path with its activity identity, report location, added phases and checkpoints. No normal failure automatically creates a replacement session. Resume and manual terminal recovery prompts include current saved authority, original audit task and progress, and existing user-note/workspace-repair precedence. Check again can accept manually completed records through the same checker; it cannot infer audit success from a PR. Final PR creation/reuse remains under existing reconciliation, so a restart after creation checks the actual PR before attempting more work.

Introduce the next persisted schema version after schema 5, with normal older-record migrations and newer-schema refusal. Add an audit-policy marker `required | legacy_complete` and execution activity history. New and unfinished executions become required. A live session keeps its current task and settings until settlement; the next scheduling decision applies the audits. Previously completed executions receive legacy_complete with no fabricated audit rows or results. Preserve their existing restricted snapshot behavior and enabled current-delivery reconciliation. If that reconciliation makes the execution unfinished, atomically set required before further dispatch/completion. Missing historical audits alone never reopens it (UPGRADE-001).

Migrate existing implementation/finalization rows in recorded session order, with unstarted phase rows still in plan order. Preserve original timestamps, done facts and historical completion; do not invent session durations. State is owner-retained with the execution and deleted only through its existing lifecycle; no automatic audit pruning. Portable committed reports remain with project history. Invalid schema or missing accepted evidence surfaces Needs you with the exact path. No rollback by lowering a schema number.

## Progress and Detail Contract

Expose a unified `activities` projection in the snapshot, retaining `phases` for plan details/counts. Rows include activity identity, kind, display label, round/continuation, state, timing, session details, result summary and checks. Started rows follow monotonic execution sequence; pending plan leaves follow them in plan order. Added completion phases appear after the audit that added them. Split parents keep their existing relationships and details, without counting audits as phases.

Use the existing row styling and click-to-detail interaction for **Delivery audit** and **Test audit**, with “Round 2” and “Continuation 2” secondary labels when needed. Do not prefix them with “Phase.” Keep implementation steps for implementation rows; audit detail shows observed assessment/remediation/recording activity without inventing Build, Test hardening or Refactor completions. Report findings, affected criteria, checked repositories/revisions and blocked actions are available in the same detail panel as output. Terminal events carry identical labels/order and stop facts.

All Running, Paused, Waiting, Needs you, disconnected and Complete screens use activity identity for the current task. Phase totals remain phase totals; “all phases done” never implies complete while audits remain. Pause wording during audits is **Pause after this audit**. Needs you offers the familiar Resume, Check again and supported fresh-session instructions with concrete audit checks. A preserved historical completion states that automatic audit history is unavailable; it never shows audits as passed. Complete retains development/review outcome labels and lists allowed post-delivery human actions without claiming they happened.

## Verification and Criteria Coverage

This document specifies implementation evidence; no runtime tests were run for the design. Use real temporary Git worktrees and bare origins for clean/pushed/current-content checks and crash replay. Exercise the installed packaged CLI/local server, real browser controls and both actual providers against disposable non-production fixtures; deterministic provider fixtures supplement but cannot replace those proofs. Retain raw provider evidence proving actual skill loading, structured report submission and recovery. Existing supported OS/provider contract checks remain applicable. Full repository verification is the implementation commit gate.

| Criteria | Contract and named proof scenario |
|---|---|
| AC-AUDIT-01, AC-AUDIT-04 | One completion decision: closed-at-start and already-open/already-merged cases still run both audits; repeat on startup, Check again and Resume |
| AC-AUDIT-02 | Portable report: whole-PRD cross-repo required-parts matrix, partial/full supersession and intentional behavior change fixtures |
| AC-AUDIT-03 | Acceptance checks: missing, corrupt, stale, wrong-execution, contradictory reports and old empty commits cannot pass |
| AC-LOOP-01, AC-LOOP-02 | Activity identity/Acceptance checks: audit appends completion entries once, builds leaves with normal checks, discovers repository and follows split children |
| AC-LOOP-03 | Scheduling: two repair rounds each force fresh delivery assessment before tests |
| AC-LOOP-04 | Acceptance checks/Recovery: denied permission, missing evidence, critical finding and normal exit without result stop; usage recovery remains available |
| AC-TEST-01 | Provider contract: real skill assessment, command evidence, red checks, remediation and independent re-grade; Adequate accepted without optional Strong work |
| AC-TEST-02 | Continuation: unfinished test-only batch persists and starts fresh automatically; no-progress batch stops |
| AC-TEST-03 | Invalidation: test-created completion phase and direct implementation fix each return through delivery, then affected test reassessment |
| AC-TEST-04 | Report policy: blocked Done, Weak, Missing, waiting-on-delivery and unrecorded changes fail; explicit after-delivery human action remains visible |
| AC-RUN-01 | Progress: browser and terminal show implementation/audit/repair/repeat order and click-through findings without phantom phase numbering |
| AC-RUN-07 | Scheduling: spy on automatic dispatch after each accepted activity; no new confirmation, default pause or timer |
| AC-RUN-02 | Recovery: terminate before/after launch, report commit, submission, acceptance and final PR creation; no duplicate sessions/phases/PRs; pause and usage waits across both providers |
| AC-RUN-03 | Fingerprints: code, requirements, tests, fixtures, new repo and material plan edits invalidate correctly; report-only/status-only/PR-description edits terminate without a cycle |
| AC-RUN-04 | Provider/authority: actual Claude and Codex skill execution, inherited settings/roots, scoped commit/push, missing skill, ambiguous evidence and out-of-workspace refusal |
| AC-RUN-05 | Development integration: audit remediation checkpoint, first grant during stopped audit, current-authority manual recovery and mixed final repository outcomes |
| AC-RUN-06 | Upgrade: historical complete preserved, active session settles unchanged, unfinished/reopened execution gated; unknown schema rejected |

## Earlier Design Boundaries

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does, §Sessions, §Snapshot and §Kiln's State on Disk (audit activity types, scheduling, recovery and persisted records).

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Pull Requests and §Screens (audit gate before final checks, ordered audit rows).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One evaluator at every transition, §Record contract and §Display Contract (audit gate and audit-owned obligations, next schema and progress activities; permission and delivery evidence rules retained).

Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records (audit session kinds and activity-specific skill resolution).

Replaces in part: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Resume (audit result check and task-specific continuation).

Reverse pointers belong in the implementation commit, at each then-current owner, with earlier wording preserved. Newer development recovery at local `ed773ea` must be retained when implementing; its current-authority/manual-recovery contract is included above. This design does not merge unpublished histories.

## Open Questions

None. UPGRADE-001 is validated. Provider/CLI/browser proof obligations above remain implementation work, not claims of completed validation.
