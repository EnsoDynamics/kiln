# Technical Design: Codex support for Kiln

**PRD:** [Codex support for Kiln](kiln-codex-support-prd.md) · **Decisions:** [validated assumptions](kiln-codex-support-assumptions.md) · **Starting evidence:** [research](kiln-codex-support-research.md)

## Overview

Add Codex as a per-PRD agent through a narrow integration boundary within Kiln's existing local TypeScript application. Codex runs through its installed CLI's app-server over private stdio. The engine retains ownership of phase order, repository setup, checks, waits and recovery; each agent supplies its own readiness, metadata, conversation execution and audit evidence.

One PRD has one agent after Start. Each logical Kiln session has its own immutable agent and settings, and a separately recorded provider conversation ID. No new service, repository, database, scheduled job or desktop dependency is introduced. The published Enso Method skills are unchanged.

This is a design draft with explicit protocol proof gates. The release cannot claim AC-PROOF-01 until real Codex usage refusal/recovery and all three platforms have been demonstrated. A failed proof changes this design or raises its product consequence; it cannot quietly weaken the PRD.

## Existing Code

**Posture: Preserve.** Existing Claude PRDs and historical output remain usable.

- Reuse phase planning, worktree setup, repository addition, Git/GitHub checks, instance locks, loopback API security, keep-awake and local storage.
- Extend settings, sessions, account views, output, workspace evidence and recovery at the agent boundary.
- Keep Claude's execution, transcripts and usage classification provider-specific; do not translate Codex into synthetic Claude events.
- Preserve existing PRD worktree paths, session IDs, waits, confirmations and recorded model facts during migration.
- Existing completion checks remain authoritative; successful model turns and progress displays never close a phase.
- Retain the existing confirmation/repair path for identified outside work. Missing Codex evidence remains a failed check, including after confirmation (AC-WORK-04).

## Architecture and Compatibility

### Agent boundary

The engine selects an installed agent adapter from the PRD/session record, never from a global default during recovery. The adapter contract has five responsibilities:

| Operation | Result and ownership |
|---|---|
| Inspect readiness | Executable/version, authentication mode, managed restrictions, required skills and supported unattended profile; typed blockers with remedies |
| Read catalogue/account | Dynamic model choices and independent account/usage readings; no inference turn |
| Start/resume/interrupt | Managed process controls, durable provider identity, normalized activity and terminal outcome |
| Read evidence | Complete or explicitly inconclusive conversation-tree evidence, independent of Kiln's captured output |
| Format recovery | Agent-specific sign-in, resume command and fresh-session guidance |

This boundary contains provider differences rather than redesigning the engine. Common output storage and Git-check input types are independent of either wire protocol. Every call returns a bounded success/error result; no provider failure selects another adapter.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Dependencies, §Design Decisions (agent execution and metadata); `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Sessions (agent-specific execution).

### Codex process and version contract

Use `codex app-server --listen stdio://` with Kiln's own child process, not the desktop or a shared daemon. `initialize` identifies Kiln and enables the experimental fields this integration requires, followed by `initialized`. Newline-delimited RPC requests are correlated by ID; server requests and notifications have separate handling. No network listener or external Codex host is enabled.

The initial compatibility candidate is **codex-cli 0.162.1**, checked against schemas generated both with and without `--experimental`. Shipping support for a version means its protocol fixtures and required real proofs pass. Initially accept exactly that tested version, not an unbounded minimum-version range. Broaden the documented compatible set after validating another version; unknown versions fail readiness with the version and supported choices. The compatibility profile includes raw history grammar and execution-tool configuration, not just RPC method names.

Require ChatGPT authentication and the OpenAI provider (AUTH-001). Do not read or copy authentication tokens, substitute API credentials, initiate login or modify the user's configuration. Account metadata may supply display identity and plan; credentials remain Codex's concern.

Metadata calls have a 30-second deadline including initialization; pagination has a per-call deadline and an overall bounded scan as specified below. Session turns have no arbitrary duration limit. Transport corruption, unexpected process exit and disconnected pipes end the attempt visibly; they never mean success. Failed persistence stops further turns. Existing platform process-tree controls supervise the app-server and its descendants.

### Selection and readiness

`kiln run` performs the common document/Git/GitHub checks before opening Documents found. It discovers agent executables without requiring either one, so a Codex-only installation reaches the chooser. A new PRD initially selects Claude Code; a missing initial Claude installation is a selection-specific readiness message with Start disabled, not a terminal startup failure.

Agent change before Start loads that agent's catalogue, account and readiness together. Each asynchronous result carries agent ID and a selection generation; a result for an older selection cannot update the current snapshot. Clear the former agent's current account panel immediately. A refresh failure leaves an explicitly stale reading only for the same agent/account context.

Before Start and before every new conversation, validate the selected agent, current catalogue/choice, authentication, effective unattended permissions and enabled method skills. Inspect skills for the actual launch directory and repository contexts, including multi-repository workspaces; resolve plugin-qualified names to enabled entries and paths, not string aliases alone. Required engineering skills are `implement-from-requirements`, `deliverable-review`, `test-hardening`, `refactor-pass` and their installed method dependencies. A missing/disabled skill or a known incompatible hook/trust/organization requirement starts no implementation turn. After setup, repeat directory-dependent readiness against the assigned worktrees before the first turn; a failure preserves setup and selection at Needs you.

Do not relax an organization's restrictions. Codex readiness requires the configured profile to be permitted by `configRequirements/read`, effective thread-start settings and the compatibility proof. Unknown mandatory restrictions or known interactive hooks/trust requirements block with the terminal action required. Kiln never passes a hook-trust bypass flag.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Command line (selected agent prerequisites), §Account and Usage (startup/readiness).

## Models and Settings

A catalogue entry is `{ value, displayName, efforts: [{ value, label, description? }], defaultEffort?, selectable }`. Effort values are nonempty provider strings, not a shared five-value enum. Retain Codex's reported model names and effort descriptions. Follow every `model/list` cursor; exclude explicitly hidden/unselectable entries. A catalogue is discovery, not entitlement.

For the first Codex selection, choose the greatest numeric version of a selectable model matching the GPT Sol family (for example, `gpt-6.1-sol` sorts above `gpt-6-sol`), with `high` effort (UI-001). Do not choose Astra, Luna or an unrelated server default. If the catalogue cannot establish a unique latest Sol or does not support High, explain the conflict and require an explicit valid choice. Do not hard-code today's model ID as a fallback.

Before Start, switching agents restores that PRD's last choices for the selected agent. An invalid saved choice stays visible with its error. When an explicit model selection invalidates its effort, choose the model's advertised default effort and show the resulting saved pair and change explanation immediately; if the default is missing or invalid, require effort selection. The UI exposes only supported efforts and marks a model with no efforts as taking none.

An unavailable catalogue blocks a **new session**, not the running turn or the person's completion check. Reload the catalogue on selection, Kiln restart, account change and before starting a fresh conversation; a failed refresh is not replaced by fabricated choices. This validation applies where this PRD supersedes earlier permissive catalogue behavior, including new Claude sessions; migration preserves their stored choices. A resumed conversation is validated against its recorded pair, never next-session settings. An access refusal is Needs you with the provider's error, never substitution.

Agent becomes fixed in the atomic Start record before setup; if setup fails, it remains fixed while any repository setup persists, and otherwise can be changed on Documents found. Once implementation starts, it stays fixed permanently. Settings can change model/effort for future sessions while work runs or is paused, but never rewrite any session's pair.

For Codex, request the exact model and effort and set `allowProviderModelFallback: false` on creation. Compare thread-start/resume effective settings before sending work. Save per-turn execution model/effort from the versioned persisted `turn_context`, not `Thread.model`/`reasoningEffort`, which describe mutable configuration rather than per-turn execution. Keep requested, effective configuration and observed execution facts distinct; disagreement or missing required provenance is visible at Needs you. Later metadata refreshes never rewrite the original account or execution facts. Manual turns may have different settings; retain them as separate observed attempts, and a Kiln resume explicitly restores the original recorded pair or reports refusal.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Account and Usage (models/effort), §Snapshot (settings and each phase's model).

## Codex Authority and Conversation Lifecycle

### Unattended execution profile

The proposed Codex profile is `approvalPolicy: on-request`, `approvalsReviewer: auto_review`, workspace-write sandbox, and network access for authorized dependency/test/Git operations. The filesystem grant includes the workspace folder plus a one-repository worktree located outside that folder. A folder added inside the existing workspace root does not require expanding authority to sibling main checkouts.

Git metadata of a linked worktree can lie outside the workspace and remains protected. The session requests reviewed escalation for authorized Git operations; Kiln does not grant the whole source checkout or common Git directory as writable simply to make Git succeed. The launch prompt states the assigned branches/paths and commit/push authorization, and distinguishes a sandbox restriction from an automatic-review denial. A denial remains effective and visible. Only the session performs Git delivery.

Keep the supported code-mode host enabled. Audit its recorded wrapper programs through the bounded decoder below; do not disable tools to simplify auditing. The compatibility profile requires enough persisted raw input to decode relevant operations without executing provider-supplied code. If ordinary method work cannot produce complete evidence under that profile, the version cannot be advertised as supported. An optional executed-tool metadata flag is not a completeness guarantee.

Preserve each repository's instructions explicitly: prompts require reading its `AGENTS.md` and `CLAUDE.md` before changing it, including repositories added through Kiln. Codex's `instructionSources` records the files loaded automatically; it is not evidence that every sibling's instructions loaded. Do not merge project configurations or overwrite provider instructions. Display the selected agent's actual project-settings limitations on Documents found.

Every server request is handled promptly and saved with the decision:

| Request | Kiln response |
|---|---|
| Command/file approval reaching the client | `decline`; retain request and outcome in output. Automatic review is Codex's responsibility, never blanket acceptance by Kiln |
| Permission expansion reaching the client | Empty granted permissions, turn scope; no new grant |
| MCP elicitation | `decline`, no content |
| User question, including connected-tool consent | Interrupt the turn and stop at Needs you with the full request; never fabricate an answer |
| Unknown server request | Unsupported-request RPC error, interrupt and stop with method/request visible |
| Async question embedded in an agent message | Detect structured `questions`, interrupt and stop with the question |

Kiln sends no `acceptForSession`, policy amendment, purchase/reset-credit request or bypass flag. A request handler must settle or initiate interruption within 5 seconds. A blocked human request is a recorded stop, not an invisible pending promise. Parent and child requests receive the same policy. Existing checks still run after the attempt; their pass may finish the work before any retry/recovery decision.

### Identity before work

Allocate a local Kiln session ID and persist its launch intent with agent, requested model/effort, working directory, assigned repositories and account reading before spawning. Start the app-server and record PID/start time immediately. `thread/start` creates a persistent conversation; save returned `thread.id` and effective settings atomically **before `turn/start`**. Codex's `thread.id` is the resume ID; its `sessionId` is the wider tree's identity and is stored separately.

The prompt and any skill input reference the discovered installed skill path without modifying its content. Launch and resume use the existing phase/PR templates with agent-specific nouns and invocation syntax; resume note remains first, outside-workspace instructions next, carry-on instruction last. Never replace `baseInstructions` merely to invoke a skill.

Persist a launch-attempt intent before sending `turn/start`, then returned turn ID and observed settings when available. A crash before `turn/start` cannot have performed work; an orphan empty thread is not adopted by guessing its title. A crash after dispatch uses the saved thread ID and authoritative history to determine whether the turn started. Do not resend a possibly delivered prompt automatically. If history cannot settle that ambiguity, Needs you preserves the conversation and work. Reconcile never launches two turns for the same session.

A normal session ends at its parent turn's terminal state, after tracked children and tool processes have settled. Record semantic turn outcome separately from app-server process exit, then close the private server and await cleanup. A long-lived server exiting zero is not a completed phase. Final text is the current attempt's `agentMessage` with final phase; failures and raw stderr remain accessible when no final text exists.

### Resume and stopping

Before every resume, stop any still-owned process using PID plus start-time verification, run the existing completion/workspace checks, and refresh account metadata. A passing completion check finishes the work without resuming. Automatic interruption/usage recovery requires a passing workspace check; failed or incomplete evidence goes to Needs you. Explicit manual Resume remains available when Codex can resume the saved conversation, including while outside work is unconfirmed or the workspace audit is inconclusive. It sends the person's note and the identified outside-work repair instructions before the carry-on instruction. An inconclusive audit also names the evidence that must be recovered or made readable; resuming, confirming repairs or starting another session does not erase that obligation or make it pass.

`thread/resume` uses the saved thread ID, original directory, model/effort and current assigned workspace policy. Send no caller-supplied replacement history and do not fork the conversation. An effective setting mismatch blocks before a new work turn. Missing/unresumable conversation removes resume actions and retains the existing fresh-session prompt; the prompt never substitutes for missing evidence in an earlier session.

The copyable terminal command changes to the saved working directory and invokes `codex resume <thread.id> --model <recorded model> -c model_reasoning_effort='<recorded effort>'`. Use the platform's argument quoting; omit effort when absent. The terminal retains Codex's interactive permission controls. Manual work is reread from the same original conversation tree; it is never inferred solely from Kiln's logs. Sign-in guidance uses `codex login` in a terminal and existing ChatGPT authentication.

On Ctrl+C/SIGHUP/SIGTERM, record interruption first, request `turn/interrupt` for the parent and tracked live child turns, and wait for terminal state. Then close stdin and wait for the owned server/tool tree to exit. Use the existing bounded 30-second grace, whole-tree termination and 5-second escalation; a second Ctrl+C shortens the grace. Never roll back edits. After stop begins, save arriving evidence but perform no verdict or next-session launch until reconciliation.

Retain existing sleep and restart rules. Codex model activity comes from genuine agent-response items, not tool completion, error notifications or synthetic status messages. On wake refresh account/usage and inspect persisted/runtime turn state before deciding an interrupted conversation needs resuming. Cross-platform cleanup, including child tool processes outside a detached group, must pass the platform proof; PID ownership never authorizes ending an unrelated terminal session.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Sessions, §Stopping a session, §Interruptions, sleep and resume; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Sessions; `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Resume (agent-specific lifecycle and prompts).

## Workspace Evidence, Output and Progress

### Authoritative evidence

For every recorded session of the phase, read the provider's own history, including terminal resumes and all descendants. Kiln's event capture is supplementary evidence and the source of live output, never the sole workspace audit. A turn that was dispatched counts as possibly having acted even when no successful initialization/model response was recorded.

For Codex, use metadata and paginated history to discover the tree: `thread/read`, `thread/turns/list` with `itemsView: full`, `thread/items/list` when supported, plus `thread/list` filtered by `ancestorThreadId`, with explicit subagent source kinds and separate archived/unarchived passes. Exhaust every cursor. Union descendants from returned parent links, collab receiver IDs, subagent-activity IDs and the persisted spawn records; recursively verify referenced children. A page of summaries, an empty default interactive listing or a parent's final report is never complete evidence.

**The normalized history API alone is insufficient.** In the design probe it omitted a failed shell command embedded in an `exec` wrapper. The audit also reads the local persisted rollout returned by `thread.path`, resolving within the initialized Codex home. This is an unstable provider field: support is pinned to the validated raw grammar. Use the returned path rather than reconstructing Claude-style paths. Re-discover on every audit because archival can move it; if necessary locate only that recorded thread ID under Codex's sessions/archived_sessions and verify session metadata matches. Never scan unrelated conversation contents. Do not open Codex's database directly.

The evidence reader inventories every persisted function/custom-tool invocation and its outcome before interpreting safe normalized commands/file changes. Preserve raw inputs, result status, originating thread/turn/call ID, timestamp and working directory/turn context. Track known direct shell and patch calls, edits/moves/deletes, delegated work, commands that failed after partial effects, and calls interrupted without a result. Unknown executable wrappers or tool forms that might conceal relevant writes produce an **inconclusive** audit fact; do not evaluate arbitrary JavaScript to extract actions. Native command events cannot cover a missing raw invocation by assumption. Decoding a recorded call proves its input was visible, not that the called command succeeded.

For a code-mode `exec` wrapper, parse its JavaScript into an AST using a non-executing parser. Decode only the compatibility profile's allowlisted orchestration grammar: `await`, literal tool calls, blocks, variable declarations with constant data, literal string concatenation/templates, and arrays/objects passed through known `Promise.all`/`allSettled` or output helpers. Resolve each tool name and complete input from literals/immutable constants; never run JavaScript, evaluate arbitrary functions, follow computed tool names or read tool outputs to guess a path. Enumerate every potentially called operation conservatively, including branches and calls without results. Dynamic code generation, unknown helpers, mutation of tool references, undecodable arguments or malformed syntax fails coverage for that wrapper. A complete, untruncated structured executed-call list can supply inputs only when the validated provider contract proves its coverage; absent/incomplete metadata never replaces decoding.

The decoder returns `{ callId, operations[], coverage: complete | inconclusive, reason? }`, not a success judgment. Every raw wrapper must have complete coverage before the session audit can pass. This introduces a small runtime JavaScript-parser dependency; the compatibility grammar and verified raw fixtures own its behavior, not a broad JavaScript evaluator. Normal published-skill work must pass real proof with this grammar; implementation must not quietly broaden it or teach the model a new skill-specific syntax to hide a failure.

Normalize supported decoded operations into the existing workspace-check policy: file writes and mutating Git operations placed by their actual working directory and explicit path/branch arguments. Reuse its definition of outside checkouts, `.agent-sessions` exemption, realpath comparison and confirmation/repair flow. Codex command arguments and shells need their own readers; do not feed a quoted `/bin/zsh -lc …` launch string blindly to the Bash parser. POSIX shell bodies use the existing shell interpretation limits. PowerShell/dynamic commands without a supported reader fail as inconclusive, with the command visible; no guess that a missing path is inside. File renames cover both endpoints; failed/partial operations count when effects cannot be ruled out.

A failed/unavailable raw file, unexhausted cursor, missing child, unknown action grammar, corrupt record or a live/unsettled parent or descendant fails Stayed in the workspace. Check tree membership, available runtime activity and raw-source identity/frontiers before and after the scan. A changed tree, new turn, replacement/truncation or changed source frontier makes that scan inconclusive; retry within the same total deadline or return the failure. An idle status from a private server alone does not prove a conversation reopened elsewhere has stopped. Known interrupted attempts with stopped owned processes can still be audited conservatively from their recorded calls; an absent tool result never proves no effect.

A truncated final JSON record is incomplete evidence until complete provider evidence repairs the gap; a person cannot confirm unknown Codex evidence into a pass. It is not silently skipped. Confirmations cover only identified outside-workspace changes at the exact evidence frontier evaluated at that stop (thread IDs, last observed raw positions/turns and last-modified facts), not every future event bearing an old timestamp. New manual work or a newly discovered child invalidates the old coverage. Preserve existing Claude confirmation semantics for migrated Claude sessions.

Evidence is a policy check over recorded tools, not an operating-system proof that arbitrary shell programs cannot write elsewhere. The sandbox and automatic review remain separate safeguards. Missing recorded evidence never becomes a passing check. Repeated inability to produce an auditable normal Codex session is a compatibility blocker, not a reason to require the person to confirm every phase.

Stream audit scans with 100-record pages, at most 4 concurrent provider reads and a 2-minute total deadline. On a deadline, return a visible inconclusive check; retrying Check again performs a new complete scan, never blesses a partial scan. Bound memory by streaming raw files and pages, rather than loading entire histories. Persist a compact per-check frontier/findings, not another mutable copy of provider history. Do not delete provider history or Kiln output automatically.

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Stayed in the workspace (Codex evidence and confirmation coverage).

### Live and saved output

Normalize provider events into `{ line, at, agentId, source, text, threadId?, turnId?, itemId?, parentThreadId?, role?, timestampSource }`. Sources add `codex` while retaining all existing Claude sources. Save completed messages/tool events, approval decisions, errors and terminal outcomes in Kiln's owner-only JSON Lines storage; deltas feed live output and are replaced by completed items. Stable item IDs deduplicate replayed subscriptions. Times are UTC on disk and local in the view. For recovered messages with only a turn-level timestamp, label the timestamp source; do not invent an exact tool time.

Observe discovered child threads without starting model turns. Child text is marked as subagent output; reviewer requires explicit role metadata or a proven delegated reviewer invocation, never position in a sequence. Where child live output is unavailable, show that limitation and hydrate available stored output later. Display limitations do not excuse missing audit evidence. Raw provider logs may contain sensitive task content and stay local; redact authentication material from diagnostics and never ship account payloads into general logs.

Keep the six existing steps. A structured skill invocation or an unambiguous direct read of the resolved skill file is evidence the skill was started, not completed. The initial explicit method invocation can start Build. Decoded observed Git commit/push attempts may start those steps as the existing display does. Assistant text, plan status and later steps do not prove unseen earlier skills occurred. Each step distinguishes observed activity from unobserved activity; later evidence never paints an unobserved step completed. Output uncertainty never changes the done check.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Output and progress, §Output line, §Snapshot (agent identity and observed progress).

## Account Usage and Recovery

### Readings and identity

Call `account/read` and `account/rateLimits/read` without a model turn. Use a freshly started bounded metadata process when refreshing to observe terminal login changes; never assume a session server's cached credentials reflect them. Each snapshot carries agent, reading start/finish times, known account identity, field-level unknowns and errors. Keep a last successful reading only with its original timestamp and stale indication. A fresh session records the account before work; each resume attempt records its own account without rewriting the session's original account.

Prefer `rateLimitsByLimitId`; use the legacy single-bucket payload only when the map is absent and identify it explicitly. Flatten every reported bucket/window into a collection keyed by reported limit ID plus window role. Store reported label/ID, duration, percent used, reset time and available model scope. Primary/secondary are identifiers, not names for fixed durations. Missing windows/percent/reset/account fields remain unknown, including an empty map. Warn at 80% for known percentages. Do not show credit balances as usage percentages or assume paid credits authorize automatic spending.

Preserve the backend `accountId` when supplied; email/plan are display facts, not stable allowance identity. Pair the account read with the usage response's account ID; conflicting identities or account changes during the reading invalidate recovery evidence. With no stable identity, show what is known but do not infer account-change recovery. Use `normalModelSlug` only for the explicit model relation it reports; names resembling a model never establish scope.

Refresh at least every five minutes while Kiln runs, on selection, before starts/resumes, immediately after a confirmed refusal, on wake and at the applicable reported reset. Join duplicate reads but a read begun before the refusal cannot release its wait. Provider notifications can refresh display sooner; partial notifications do not clear prior unknown or administrative fields. Revalidate through a full read before automatic recovery. Lookup failure alone does not block permitted normal work.

### Classification and bounded release

A confirmed Codex usage stop requires a structured terminal `usageLimitExceeded` provider error for that attempt, with no subsequent successful model activity in that attempt. `rateLimitExceeded`, HTTP 429 alone, network errors, retry notifications, prose and old failures are not usage stops. Preserve `willRetry`; do not classify an intermediate error while Codex is still retrying. Administrative/spend-control failures remain distinct even if accompanied by quota information.

First run completion checks. A pass finishes; failed workspace evidence stops at Needs you; otherwise apply the PRD recovery table. Keep the existing manual Resume now, pause, keep-awake and wait lifecycle. The applicability/release result is one of `allowed`, `blocked`, `unknown`, with evidence and account scope, not a boolean derived from a percentage.

`ordinaryUsageAllowed` is the backend permission signal in the candidate version. `false` blocks and null/missing is unavailable: its schema explicitly forbids deriving recovery permission from percentages/reset times. A fresh `true` for the active account is positive ordinary-usage evidence, provided no applicable explicit administrative/spend-control block remains. Never convert credits available, a credit purchase offer or reset-credit availability into permission. Window readings identify the refusing allowance only when structured provider scope establishes the connection; do not guess from whichever bucket is at 100%. Known other-model allowances do not block the stopped model.

If applicability/permission remains unknown but the structured refusal supplies an applicable future reset, save that reset and wait. At it, refresh and make **one** automatic resume attempt if usage remains unreadable. Persist that attempt's consumption before dispatch so restart cannot repeat it. A new refusal requires a newly established allowance change or a later applicable reset, never the same past reset. No applicable permission evidence and no future structured reset means Needs you, even when a human-readable error mentions a time. The candidate `TurnError` schema has no dedicated reset field; do not scrape `message`/`additionalDetails`. A real captured refusal must establish whether a structured future reset is available at all.

A fresh changed-account reading releases a wait only when it explicitly establishes allowance for the original model/session; changed email by itself does not. Recreate/resume the private server under current Codex authentication and record the attempt account. If the same applicable stop refuses an automatic attempt before meaningful model activity, suppress another attempt until a proven allowance change or a later applicable reset. Fingerprints compare semantic account/model/allowance scope, permission/block state and structured reset evidence; observation timestamps, request IDs and another identical `ordinaryUsageAllowed: true` reading are not new recovery evidence. A proven change can be a scoped blocked-to-allowed transition or a different stable account with positively established permission. Unknown identity/scope cannot bypass suppression. Persist the evidence/reset fingerprint and consumed attempt before dispatch across restarts; all decisions are serialized with existing Resume/Check again control locking.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Account and Usage; `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §Design Decisions, §Recognizing a Usage Limit, §The Wait, §Snapshot (Codex classification, readings and bounded recovery; Claude classifier/release rules otherwise retained).

## Interfaces and Records

### Local API and snapshot changes

All endpoints retain current loopback, Host, Origin and token checks. Existing controls keep their state locking and no-double-submit behavior.

| Interface | Contract change |
|---|---|
| `POST /api/settings` | Adds `agentId?: claude_code \| codex`. A model/effort change names its `agentId` and `selectionGeneration` so a stale editor cannot change a newer selection. Unknown agent/empty effort/malformed body → 400. Agent fixed or stale selection → 409 with reason. Invalid catalogue choice → 422 with field errors. Response includes authoritative choices and any effort adjustment explanation |
| `POST /api/start` | Existing request; 409 while catalogue/readiness pending or invalid, preserving selection and field errors. Recheck directory-dependent readiness after setup, before work |
| `POST /api/resume` | Existing note contract. Completion check first; recorded adapter/pair only; refusal/missing history becomes Needs you, never a fresh conversation by substitution |
| `GET /api/snapshot` and SSE snapshot | Settings carry selected agent, `agentFixed`, choices, catalogue/readiness state and selection generation; current/history carry recorded agent, provider ID, requested/observed settings and account provenance |
| SSE output/partial and saved output pages | Add agent/thread/parent/role fields and child-visibility notice; existing output line numbers and old source labels remain valid |
| Usage/Needs you/waiting | Dynamic allowance rows, unknown/stale fields, explicit recovery evidence/reason and right-agent commands; preserve existing screen purposes |

No new login endpoint or provider credential fields are exposed. Readiness/model errors stay beside existing controls. A next-session validation failure between phases goes to Needs you without creating a session; its action is to correct settings/sign-in/readiness, not resume an imaginary conversation. Historical session detail uses its recorded agent even if Documents found later changes selection.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API, §Snapshot; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §HTTP API, §Snapshot; `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §HTTP API, §Snapshot, §Screens (agent-specific fields only).

### Persisted schema 4

Continue atomic owner-only JSON records and append-only output outside repositories. UTC ISO timestamps, explicit unknowns and provider-discriminated details preserve provenance.

| Record | Added/changed fields |
|---|---|
| PRD settings | `agentId`, `agentChoices: { agentId: { model, effort? } }`; this map owns next-session settings, replacing duplicated top-level model/effort after migration |
| Session | Local `sessionId` remains the storage/phase-list key; add `agentId`, requested pair, effective pair, provider-specific version/configuration, original account, `conversation: { threadId?, sessionTreeId?, codexHome? }` for Codex; existing Claude fields remain Claude-specific |
| Attempt/run | Launch intent, process identity, dispatch/turn ID, requested/effective/observed pair, account identity, provider terminal state/error, human-request stop, interruption and existing note/cause fields |
| Codex usage refusal/wait | Agent tag; structured error code; account/allowance/model scope when known; future reset evidence if available; `release: allowed \| blocked \| unknown`; consumed reset-only attempt fingerprint and attempted time |
| Workspace check | Reader/profile version, discovered tree IDs, source frontiers, completeness and findings; confirmation references checked frontier, separate from existing Claude timestamp confirmations |
| Output | Additive agent/thread/role/provenance fields; retain historical line IDs/source strings |

Migrate schemas 1–3 through existing migrations, then add Claude Code as agent and move saved next-session choices into its map. Legacy provider conversation identity stays the original Claude session ID; do not regenerate directory names or reinterpret Claude waits as Codex. No Codex executable/account call is required for that migration. Never backfill an unrecorded historical account or observed effort by guessing.

Every record reader, including session/output readers, rejects a newer unsupported schema with an update message before writing. Unknown agent IDs are errors. Migration runs on read and persists at the next ordinary atomic save. Existing port/state keys and session/output locations stay stable. Older Kiln versions cannot operate on schema 4; rollback requires reinstalling the newer reader or restoring an owner-controlled pre-upgrade state backup while retaining worktrees, never rewriting schema numbers downward.

Kiln records remain authoritative for assigned agent/settings/attempts; provider history is authoritative for executed tools/conversation; Git/docs/GitHub decide delivery. Output can be rebuilt from retained evidence under a versioned reader without rewriting historic facts. Storage exhaustion surfaces as a stop before another turn, not silently lost audit/output. Preserve the current owner-managed retention model; no automatic pruning or deletion is added.

## Integration and Verification

### Design investigation results

Checks made against codex-cli 0.162.1 on macOS during this design, using temporary disposable repositories and the existing signed-in ChatGPT account:

| Research question | Evidence obtained | Remaining proof |
|---|---|---|
| Unattended authority | Effective workspace-write/on-request/auto-review returned by `thread/start`. First sandboxed Git write failed on linked metadata; same conversation subsequently created a file, committed and pushed to a local bare origin through reviewed escalation | Every human-request form; all-platform Git/network behavior |
| Persistent identity | Returned thread UUID saved before work; a fresh app-server resumed it and the model recalled the first turn's marker; effective Sol/High settings returned | Abrupt-crash dispatch race, interruption while a real command runs, interactive terminal resume |
| Workspace evidence | One-turn pages exhausted four turns with full items; underlying raw rollout held omitted wrapper invocation and per-turn model/effort. Normalized full history proved incomplete. After archiving the disposable parent, `thread/read` returned its readable archived rollout, full turns remained available, and archived ancestor listing found its child | Wrapper decoder coverage in real method work, manual turns, compacted/missing/corrupt evidence and Windows paths |
| Progress/children | A real parent wrote in a folder created after thread establishment; a child read it and was discovered by ancestor ID. Parent and child raw histories were readable | Live subscriptions and reliable skill-start derivation |
| Usage/refusal | Live account/read and rateLimits/read succeeded without a turn; one weekly primary window, no secondary, account ID and `ordinaryUsageAllowed: true` present | Real exhausted allowance/refusal/reset and account-change recovery; structured reset availability |
| Compatibility/platforms | Normal and experimental generated schemas, CLI feature flags/help and enabled method skills checked; existing Claude coupling traced in code | Real published method workflow in assigned workspace, Linux/Windows lifecycle and installed-package proof |

Disabling the code-mode host was tested and made `apply_patch` unavailable. Enabling executed-tool-call metadata produced complete metadata for direct collaboration calls but none for the parent patch wrapper or child shell wrapper; that feature alone cannot close the audit gap. The design therefore requires raw wrapper decoding and keeps its real-work coverage as a pre-implementation proof obligation.

Official protocol reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server). The generated installed-version schemas and actual probe behavior govern version-specific fields; documentation alone does not prove tool/audit completeness. Probe conversations contain test markers only; no credentials or personal account values belong in committed fixtures. Temporary probe scripts are exploration, not a new supported product interface.

### Proof gates and tests

The gates below are dependencies of the affected integration work; they do not remove acceptance criteria or split this PRD into separately accepted products.

1. **Supported unattended/audit profile:** real Codex with fully decoded recorded tools, repository instructions and published skill invocation; guarded commit/push in every assigned worktree, mid-conversation repository addition, read/write child agent, client approval/question/elicitation handling, no hidden pending request. Capture raw and normalized evidence, including a deliberately outside-workspace mutation in disposable checkouts and a manual recovery turn. Any normal operation missing from the authoritative audit grammar blocks using that profile.
2. **Faithful recovery and platforms:** real interrupted commands, process-tree cleanup, crash points before/after identity/dispatch persistence, same-thread Kiln resume and terminal resume, changed next-session settings and recorded original pair. Demonstrate macOS, Linux and Windows; if a platform cannot preserve protection and required authority, report the product consequence before release.
3. **Usage recovery:** capture an actual structured exhausted-allowance refusal and the applicable real recovery. Prove stable account/scope matching, administrative blocks, unavailable readings with/without structured reset, the single persisted reset-only attempt and restart suppression. Do not deliberately burn substantial allowance to manufacture the refusal. Until natural or approved test conditions provide it, this remains an explicit release gap; synthetic fixtures cannot close AC-PROOF-01.
4. **Whole workflow:** a real Codex PRD with at least two phases through expected GitHub PRs, cross-repository work including an addition, live/saved output and usage display, interrupted Kiln resume and manual terminal recovery. Run the existing Claude regression path and package/platform matrix. No merge/deploy is authorized by this proof design.

Use unit tests for deterministic model selection, dynamic efforts, provider-event normalization, raw-tool coverage, classification, frontier confirmations, scope matching and retry fingerprints. Include unchanged positive readings after refusal, history/tree changes during a scan, a manually reopened parent, and explicit repair resume while evidence remains incomplete. Use recorded and verified contracts for uncommon failure forms beside actual provider runs, not invented success fixtures alone. Real temporary Git/bare-origin tests cover setup, checks, paths and migration; real browser tests cover agent switching, stale-result exclusion, every existing screen and saved historical output. Exercise executable/version/auth/skill/policy errors through the actual adapter. The full existing verification suite remains the pre-commit code gate when implemented; this documents-only draft is checked by link/coverage/diff validation.

## Acceptance Criteria Coverage

| Criteria | Design sections |
|---|---|
| AC-AGENT-01 to 03 | Selection and readiness; Models and Settings; Agent boundary; Local API; schema 4 |
| AC-MODEL-01 to 03 | Models and Settings; Identity before work; Resume and stopping; persisted settings provenance |
| AC-WORK-01 to 04 | Agent boundary; Unattended execution profile; Conversation lifecycle; Authoritative evidence; proof gates |
| AC-VIEW-01 to 04 | Live and saved output; Models and Settings; Local API/snapshot; schema migration |
| AC-USAGE-01 to 04 | Readings and identity; Classification and bounded release; Local API/snapshot |
| AC-RECOVER-01 to 03 | Identity before work; Resume and stopping; Authoritative evidence; Classification and bounded release |
| AC-COMPAT-01, 02 | Existing Code; Codex process/version contract; schema 4; platform/package proof |
| AC-PROOF-01 | Design investigation results; Proof gates and tests |

## Open Questions

- **Auditable wrapper coverage:** Does the bounded decoder cover ordinary published-method work in parent and child conversations without unknown executable inputs? The normalized-history omission is verified. Disabling the code-mode host disabled tools, and enabling executed-tool metadata left nested calls without completeness metadata. Normal-phase automatic passage depends on closing the real-work proof, not repeated human confirmations or pretending the normalized view is complete.
- **Quota applicability and structured reset:** Which exact structured scope/reset accompanies a real `usageLimitExceeded`, and does ordinaryUsageAllowed establish permission for the stopped model after an account change? If scope/reset is unavailable, use the specified unknown/Needs you path; actual refusal/recovery still must be proved before release.
- **Platform authority and cleanup:** Do reviewed Git operations, added roots, native Windows shells and descendant shutdown satisfy the same boundaries on Linux/Windows? The chosen protocol has not yet established those runtime facts.

No open business assumptions are introduced. AUTH-001 and UI-001 remain settled. These questions are technical proof obligations, not delegated product decisions or permission to ship weaker behavior. Earlier designs receive supersession pointers when this change is implemented, not during this drafting session.
