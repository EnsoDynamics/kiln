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
- Preserve current-authority recovery prompts, including manually reopened conversations and first-grant activation, as required by the recovery contract at `ed773ea`.
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

Add `activities[]` to the execution record. Each entry has an opaque `activityId`, monotonic `sequence`, `kind: implementation | delivery_audit | test_audit | final_delivery`, optional `phaseId`, audit `round` and `continuationIndex` numbers where applicable, `sessionIds[]`, `createdAt`, lifecycle facts, and accepted-result reference. Allocate identity and launch intent before spawning. Round numbers increase per audit kind; a test continuation increments `continuationIndex` in its original round. A resumed provider run keeps its activity and session identity. A fresh test continuation or repeated audit gets a new activity and fresh provider conversation.

Keep the phase plan authoritative for implementation scope and ordering. Activities record observed execution order, not a second phase plan. Preserve existing phase-keyed facts and session storage paths; additive `activityId` and audit session kinds distinguish audit storage under `audit-<activityId>`. Never put audit IDs in the phase parser or fabricate Closed lines. Finalization retains its existing facts and delivery history.

## Audit Report and Local Interface

### Portable report

Each audit activity writes `<prd-directory>/kiln-audit-<activityId>.json`. Its exact reserved path is assigned by Kiln, never taken from arbitrary agent input. The report is committed and pushed through normal scoped checks; a method-required empty audit commit remains permitted. Delivery audits always produce this record even when the method itself changes no document. Test audits also maintain the method's existing `test-audit.md`; its filename remains compatible with that installed skill.

The version-1 report contract is:

| Field | Contract |
|---|---|
| `schemaVersion` | `1`; unsupported versions are refused |
| `executionId`, `activityId`, `kind`, `round`, `continuationIndex` | Exact assigned identities; audit kind only, positive round and continuation index (first activity is 1) |
| `scope` | Governing PRD repository/path, `whole_prd`, requirement manifest ID and all criterion keys, including excluded keys with replacement pointers |
| `checkedSnapshotId` | Engine-issued snapshot of the work actually assessed, including all assigned repositories |
| `criteria[]` | One row per manifest key, in the typed criterion contract below |
| `methodEvidence` | Skill name/path, assessment and independent-review references; test audit additionally names baseline/final suite commands, observed results, red checks or permitted impossibility reasons, and remediation re-grade evidence |
| `completionPhases[]` | Phase ID/path, origin audit kind/activity, affected criterion keys, missing behavior and dependencies |
| `nextTestBatch` | Only for `continue_test`: remaining criterion keys, record path and precise next batch; never an opaque executable prompt |
| `pendingHumanActions[]` | Criterion, action, requirement pointer and whether the requirements put it beyond Kiln's delivery boundary |
| `blockers[]` | Criterion keys, concrete problem and required action; includes unrecorded behavior changes, unavailable mandatory evidence and denied authority |
| `outcome` | `passed \| completion_phases \| continue_test \| blocked` |

The requirement manifest is engine-owned: enumerate each acceptance-criterion block from the governing PRD, retaining repository/path, label (or bold title for an unlabeled criterion), source span and normalized content digest. A key is scoped by document path and label/title, not a globally unique label. Duplicate or ambiguous identities stop with the source location. Preserve the full source block, including nested requirements and replacement pointers. The skill's independent assessor derives required parts from those blocks; Kiln verifies source binding and complete key coverage, not the semantic completeness of prose decomposition. Each part has a stable report-local ID, source quote/span, applicability (`current | superseded`) and, for supersession, a resolvable replacement criterion reference. Partial supersession still assesses every current part.

Each criterion row contains `criterionKey`, `parts[]`, `assessmentEvidenceIds[]`, `findings[]`, `blockerIds[]` and exactly one kind-specific assessment:

| Assessment | Allowed values and required support |
|---|---|
| `deliveryStatus` | `implemented \| partly_implemented \| not_implemented \| waiting_human \| superseded \| changed_outside_requirements \| not_built_yet`; code/reachability evidence for implemented parts, missing-part findings for gaps, pending-action ID for waiting, replacement references for superseded, or owning open phase for not-built |
| `testAssessment` | Either `{grade: missing \| weak \| adequate \| strong}` or `{status: not_implemented \| person_checked \| not_built_yet \| superseded \| changed_outside_requirements}`; never both. Adequate/Strong parts map to exact test/script selectors and observed collection/run evidence; Missing/Weak record absent support rather than fabricate it; human/supersession/open-phase exceptions carry their corresponding references |

Findings identify affected part IDs and code/test evidence; pending actions and blockers have unique IDs referenced by their rows. Any blocker wins, independently of a grade. For final test success every current part needs Adequate/Strong or permitted recorded human evidence; post-delivery human actions remain explicit exceptions, never synthetic passing grades. A gap routes only through matching completion phases; otherwise it stops. A not-built row requires an open phase and cannot pass. Unknown enums and impossible combinations are invalid reports. The independent assessors own grade/reachability judgment; Kiln mechanically checks identities, required support, recorded outcomes and routing consistency. It does not infer that arbitrary source code satisfies English requirements.

References identify assigned repository, relative path and immutable commit/blob, or provider session/turn/tool-call identity. Do not treat report assertions of successful commands as observed command results. Store the full report bytes and their digest with the accepted result; later edits do not erase the original. This is structured evidence of an agent audit, not a claim that Kiln can formally prove application behavior.

Delivery rows use the installed method's Implemented, Partly implemented, Not implemented, Waiting on a human action, Superseded, Changed outside the requirements and Not built yet statuses. Test rows retain its grades and special statuses. The engine applies AC-TEST-04's stricter completion boundary: a method-level Done does not waive a blocked row. Person-checked evidence must identify the governing criterion's permitted human evidence and its recorded result; the engine cannot invent it. Missing/Weak, waiting-on-delivery, unexplained omitted criteria, unresolved intentional behavior changes and in-boundary human work prevent final success.

### Commands and routes

Use the running Kiln executable pinned in the session's prompt, as for development delivery. The CLI discovers the execution from the assigned workspace and calls the authenticated loopback API. It reads JSON payloads from files, prints JSON results, and exits nonzero for refused or unresolved operations. No command grants permissions or launches arbitrary commands.

| CLI / HTTP | Request | Response |
|---|---|---|
| `kiln audit status` / `GET /api/audit` | Optional evidence cursor | Execution/activity identities, revision, current snapshot, required report path, accepted-result references, outstanding checks and evidence catalog page |
| `kiln audit snapshot <file>` / `POST /api/audit/snapshot` | `{executionId, activityId, revision, testPaths[], evidencePaths[]}` | `{revision, snapshotId, requirements, plan, repositories}` read independently from disk/Git |
| `kiln audit submit <file>` / `POST /api/audit/result` | `{executionId, activityId, revision, reportPath}` | `{revision, disposition: recorded \| unresolved, checks[], nextAction}` |

Snapshot declarations use assigned repository IDs and repository-relative exact paths, not exclusion globs; `testPaths` entries additionally carry the classification support defined below; evidence paths identify method output documents, never implementation. Snapshot issuance does not confer a pass. An audit that changes code or tests requests a new snapshot after changes and re-grades against that snapshot. Capture the checked snapshot before verification commands, then confirm the same relevant content after they settle. Bind command evidence to that interval; intervening material writes require re-verification. Runs against a built/deployed artifact additionally identify its immutable source through observed artifact/development evidence, not the current checkout HEAD. Red-check mutations have separate evidence and must restore the checked snapshot before the final passing run. The report can then be committed without changing the content it claims to have checked.

Submission runs under existing engine serialization, records the candidate and validation facts, and retains them through a disconnect. Identical identity/report-digest retries return the same result before rejecting an old revision. A different digest for a settled activity is refused; a failed/unresolved submission may be corrected in the same activity and is retained as a new attempt. Recovery can discover a committed report at the assigned path even if the submission command never ran. It applies exactly the same validation.

Errors: `400 malformed_request`, `403 outside_execution`, `413 report_too_large`, `409 stale_revision | wrong_activity | busy | result_conflict`, `422 invalid_report | stale_snapshot | inconsistent_plan | missing_evidence`, `503 evidence_unavailable`. Return `{code, reason, criteria[], checks[]}`; missing fields never default to success. File paths must resolve within the assigned repository, without symlink escapes. Retain Host, Origin and token protections. A state-write failure rolls back the in-memory mutation and prevents advancement. Remote/history reconciliation has the existing 120-second overall deadline including pagination; incomplete reads are unresolved, not empty evidence.

### Evidence contract and limits

Reports reference an engine-issued evidence catalog; they never supply authoritative command outcomes. Each entry has `evidenceId`, provider, owning session/run, child-conversation identity when relevant, turn/tool-call or transcript-record locator, capture time (UTC), raw-source digest and private retained-source reference. Command entries include the observed invocation, working directory, terminal outcome and available exit code/output. File entries name assigned repository, relative path and immutable blob/commit. Assessment/re-grade entries link the delegated task and its completed response, affected criterion/part IDs and assessed snapshot. Re-grading remediation requires a distinct assessor conversation from the writer. Skill-loading evidence points to the successful Claude Skill call/result or Codex read of the discovered source digest. Unsupported or missing provider provenance is unresolved.

The status interface exposes available evidence IDs with their observed metadata, paged by opaque cursor (100 entries per page), so sessions need not guess identifiers. Artifact references bind test selectors, source/configuration and report parts to catalog entries; red checks name the mutation/restoration evidence, two failing mapped runs and restored passing run, or the skill-permitted impossibility reason. Baseline/final failures remain named, including pre-existing unrelated failures; a mapped failure cannot be hidden by a successful later unrelated command. The engine verifies command identity/outcome and references; the independent assessor judges test semantics. Preserve complete raw evidence privately and show summaries through the existing detail view; never copy credentials or full raw provider output into portable reports.

Bound a report to 8 MiB and 10,000 criterion rows; reject overflow as `413 report_too_large` with the actual limit, without partial acceptance. Reject duplicate JSON keys. Keep snapshots/reports/evidence in immutable private sidecars referenced by the execution record, not embedded raw payloads in each activity or SSE snapshot. The first ceiling is report size or the inherited history-scan deadline, both visible stopped checks; increasing a bound or extending the compatible report schema is the recovery path, never truncating evidence or waiving an audit. The CLI uses the existing 125-second request timeout around the 120-second reconciliation deadline. Single-engine admission rejects competing mutations as `busy`; no unbounded request queue or automatic retry.

### Acceptance checks

Validate schema/identities, full criterion coverage, current snapshots, referenced files and provider evidence, plan consistency, and Committed/Pushed/Stayed-in-workspace facts across every assigned repository. Audit sessions have an **Audit result recorded** check instead of Phase doc closed. Required development obligations remain an additional check.

A `completion_phases` result must match new open plan entries with method origin markers and affected labels, append identities without changing original ownership or closures, resolve dependencies, and contain only missing behavior for existing criteria. Validate these audit-added entries beyond the normal underway structural plan check. Record their IDs before dispatch. If a crash leaves phase files but no valid report, resume/recover the originating audit to reconcile those files; it must adopt the existing entries, not allocate duplicates. A report and plan disagreement stops at Needs you.

A `continue_test` result requires committed updated test-audit records, nonempty remaining work and evidence of progress since the preceding continuation: changed evidence/grades, completed remediation, or newly identified actionable work. An identical unfinished batch without progress is a blocker, not an endless fresh-session loop. Blockers win over all routing outcomes. An audit cannot return `passed` while its report or current plan contains an implementation gap/open leaf. The engine independently derives the next action from these facts rather than executing report text.

## Current Work and Invalidation

A snapshot stores canonical repository identities, assigned branches, HEADs, tree/blob digests, required-document manifest, normalized plan, criterion keys and provider-evidence references. Resolve governing PRD, assumptions, design, phase documents and referenced replacement requirements; missing/unreadable references stop. Record hashes of installed audit skill sources for provenance, without making a later skill installation alone invalidate completed history.

Use content equality for currentness, with commit IDs retained for inspectability. A record-only or synchronization commit with unchanged relevant content does not force another audit. Current checks still require clean assigned worktrees and verified pushed heads. Repo additions, deleted/missing sources, requirements changes or unknown changed paths invalidate delivery and test conclusions. New plan leaves take scheduling priority; changes to phase scope/dependencies count as requirements changes.

Classify deltas conservatively:

- Requirements and all non-test, non-record tracked content form the delivery fingerprint. Unknown files count as implementation. Code/requirements changes require a fresh delivery audit and test reassessment.
- Exact test and shared-test-setup paths accepted in the snapshot classification form the test fingerprint. Their changes require test reassessment; shared setup changes reassess all rows. New/unclassified tests conservatively invalidate both until classified in the new audit.
- Exclude only assigned audit JSON paths and the method's exact test-audit record from work fingerprints, while still checking their bytes against accepted records. Do not exclude their directory or arbitrary agent-declared files. Exclude only parsed checkbox/Closed status metadata from phase-document content; retain phase IDs, scope, dependencies, split structure and every other byte. GitHub final-description text is outside repository content and does not invalidate audits, but finalization still verifies it.

Path classification is snapshot-owned. Each proposed test path supplies its blob digest, test configuration/script references, observed collection/run evidence IDs and independent assessor evidence that it is test-only; shared helpers require the same support. The validator resolves these references and exact paths, and refuses unsupported declarations. Configurations, dependency manifests and dual-use helpers stay in the delivery fingerprint. Semantic test-only judgment comes from the independent assessor, not a universal static analyzer; unknown or disputed paths remain implementation. Classifications are immutable within a snapshot, and changed source/configuration invalidates their support. Merely listing a file in `evidencePaths` never excludes it.

Currentness compares the latest accepted result used for each gate; earlier attempts and immutable reports are history, not competing mutable truth. Later test continuations may replace `test-audit.md` while retaining earlier evidence by its immutable revision and accepted report ID. That expected record update does not invalidate delivery or restart a finished continuation. Unauthorized changes to the latest portable report, missing referenced evidence or changed criterion accounting invalidate the affected gate. Do not compare every historical report against the current bytes of the shared method record.

Retained test grades need their original checked content and referenced tests/code still current under the method's re-audit rules. Conservative whole-test reassessment is valid where a precise affected set cannot be established. A new delivery audit after a direct test fix is followed by a fresh test-audit activity that validates the retained grades and reassesses affected rows. Final completion reruns currentness after finalization and in the same serialized decision as repository delivery checks; changed material routes back to audits, not Complete.

## Provider Sessions and Development Delivery

External audit prompt templates name the installed `delivery-audit` or `test-audit` skill, whole-PRD paths, round, record contract, current snapshots, prior report/continuation, repository roots and effective authority. They expressly require fresh assessment/re-grading per the method and instruct the session to finish its assigned activity, leaving the next activity to Kiln. They supply scoped commit/push authority for records, tests and permitted small fixes on the assigned feature branches. A delivery audit cannot implement its gaps.

Claude Code invokes the available skill through its normal Skill mechanism; persist the tool call and its result from authoritative saved events. Missing skill or failed invocation is Needs you. Codex resolves the exact enabled installed skill path for the activity at launch rather than unconditionally invoking implement-from-requirements. Persist the discovered path/source digest and require authoritative conversation evidence of reading that skill and conducting the requested audit. Both providers retain subagent assessment/re-grade evidence and actual command/result references, including errors. Missing/incomplete authoritative history cannot be replaced by rendered success text. Follow the existing bounded transcript/history collection and workspace audit for each provider, including subagent work. Never add writable roots solely to let a provider edit private state; the CLI supplies the local interface.

Audit activities can assess required development delivery for their affected criteria, using the same target grants and retained ledger. Assessments, checkpoints and activation-recovery entries gain an explicit owner union: `{kind: phase, phaseId}` or `{kind: audit, activityId}`. Old records normalize to phase owners and retain their legacy `phaseId`; audit owners never fabricate one. Audit assessments bind criterion keys and the requirement-manifest digest. The existing delivery assessment/prepare/evidence requests and status response carry this owner; validate it against the running/stopped activity, its assigned repositories and current grants. Execution and ledger revision checks remain mandatory. Audit assessment/checkpoint payloads carry `owner: {kind: audit, activityId}`, `requirementManifestDigest` and exact manifest criterion keys; the assessment accounts for the whole assigned manifest. Status supplies its current document digest. Audit prepare/evidence requests identify the active owner even when the checkpoint originated elsewhere. Phase-owned records retain their legacy `phaseId` and normalize to an explicit phase owner.

A checkpoint's origin owner is immutable. Retained obligation assignments map `(checkpointId, requirementId)` to eligible phase/activity owners and criterion keys; `requiredMerge` remains an explicit obligation. A test continuation inherits its predecessor's unfinished assignments atomically with activity allocation. Repair phases inherit only obligations for their affected criteria, with existing split propagation thereafter. Shared obligations may have several assignees but one retained checkpoint/evidence history; nobody may remove them by issuing a replacement report or assessment. The active owner may prepare only its assigned obligations and criterion subsets, plus existing prerequisite restoration and finalization scopes. Transfers intersect criterion scope per requirement with the source owner's assignments; splitting cannot add criteria outside that inherited subset. Replacing a checkpoint requires ownership of all its retained merge/evidence obligations and criteria, because the replacement's origin receives those obligations. Origins on existing checkpoints never change. First-grant recovery records the stopped owner and ordered prior relevant obligations, including audits before a stopped repair phase. Keep observed implementation/audit/repair order from session history and accepted completion-phase origins; do not group all phases ahead of all audits. Audit stops use `stoppedOwner` without a fabricated `stoppedPhaseId`; old phase recovery records retain that field and normalize to an ordered owners list; changing the current owner never widens target grants. Final evaluation checks all retained phase- and audit-owned checkpoints, including those whose origin activity has finished.

## Recovery and Upgrade

Persist activity intent, session association, submitted report attempts and accepted decision before their corresponding next action. On restart acquire the existing instance lock; settle or stop any owned live provider process before checking artifacts. Check completion first, then resume only the still-unfinished activity. For Codex retain dispatch/turn reconciliation and refuse ambiguous dispatch or cleanup; a private server exit is not proof of turn completion. For Claude retain session ID, run records, transcript and resume semantics. A valid report may be accepted after interruption even if the final process result was never saved, once current checks and workspace evidence pass.

An audit that ended normally without its result stops. An interrupted audit may resume its original conversation; a usage-limit refusal uses existing provider/account recovery. A nonresumable conversation uses the existing explicit fresh-session recovery path with its activity identity, report location, added phases and checkpoints. No normal failure automatically creates a replacement session. Resume and manual terminal recovery prompts include current saved authority, original audit task and progress, and existing user-note/workspace-repair precedence. Check again can accept manually completed records through the same checker; it cannot infer audit success from a PR. Final PR creation/reuse remains under existing reconciliation, so a restart after creation checks the actual PR before attempting more work.

Use persisted schema 7 for audit-owned development obligations; schema 6 is the earlier audit-admission interface. Both retain the existing record locations and normal older-record migrations/newer-schema refusal. Schema 6 readers cannot interpret audit-owned delivery records and must refuse schema 7. New readers accept supported old records through migration; old binaries refuse the new schema. Preserve the pre-migration private record for rollback, and require a compatible reader once new activities exist; never discard audit history to downgrade. Add an audit-policy marker `required | legacy_complete` and execution activity history. Persist a stable execution UUID before allocating the first activity, preserving any existing execution ID, including for restricted executions; migration is idempotent. New and unfinished executions become required. A live session keeps its current task and settings until settlement; the next scheduling decision applies the audits. Previously completed executions receive legacy_complete with no fabricated audit rows or results. Preserve their existing restricted snapshot behavior and enabled current-delivery reconciliation. If that reconciliation makes the execution unfinished, atomically set required before further dispatch/completion. Missing historical audits alone never reopens it (UPGRADE-001).

Migrate existing implementation/finalization rows in recorded session order, with unstarted phase rows still in plan order. Preserve original timestamps, done facts and historical completion; do not invent session durations. Private state remains local and owner-retained with the execution; there is no new deletion command or retention policy, and removing an execution must remove its audit sidecars too; no automatic audit pruning. Portable committed reports remain with project history. Invalid schema or missing accepted evidence for a required/current gate surfaces Needs you with the exact path. No rollback by lowering a schema number.

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
| AC-AUDIT-03 | Acceptance checks: missing, corrupt, oversized, duplicate-key, stale, wrong-execution, contradictory reports and old empty commits cannot pass; unlabeled/duplicate criterion identities and typed status combinations are exercised |
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
| AC-RUN-03 | Fingerprints: code, requirements, tests, fixtures, new repo and material plan edits invalidate correctly; report-only/status-only/PR-description edits and successive updates to the shared test-audit record terminate without a cycle; dual-use test helpers cannot exempt runtime changes |
| AC-RUN-04 | Provider/authority: actual Claude and Codex skill execution, inherited settings/roots, scoped commit/push, missing skill, ambiguous evidence and out-of-workspace refusal |
| AC-RUN-05 | Development integration: audit remediation checkpoint, continuation/repair assignment without dropping retained obligations, first grant during stopped audit, current-authority manual recovery and mixed final repository outcomes |
| AC-RUN-06 | Upgrade: historical complete preserved, active session settles unchanged, unfinished/reopened execution gated; unknown schema rejected |

## Earlier Design Boundaries

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does, §Sessions, §Snapshot and §Kiln's State on Disk (audit activity types, scheduling, recovery and persisted records).

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Pull Requests and §Screens (AC-SHOW-01) (audit gate before final checks, ordered audit rows).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One evaluator at every transition, §Record contract and §Display Contract (audit gate and audit-owned obligations, next schema and progress activities; permission and delivery evidence rules retained).

Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records (audit session kinds and activity-specific skill resolution).

Replaces in part: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Resume (audit result check and task-specific continuation).

Reverse pointers belong in the implementation commit, at each then-current owner, with earlier wording preserved.

## Open Questions

None. UPGRADE-001 is validated. Provider/CLI/browser proof obligations above remain implementation work, not claims of completed validation.
