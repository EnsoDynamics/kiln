# Technical Design: Kiln control from a phone-driven bot

**PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md) · **Interface examples:** [command mockup](kiln-bot-control-command-mockup.md) · **Business choices:** [assumptions](kiln-bot-control-assumptions.md) · **Evidence:** [investigation](kiln-bot-control-investigation.md).

**Status:** Phases 1–9 are closed and published; Phase 9 implementation is `29851a2`, with publication/launch record `4853d2b`. The [after-Phase-9 delivery audit](kiln-bot-control-delivery-audit-after-phase-9.md) finds 14 of 18 criteria Implemented and four Partly implemented. [Completion Phase 10](phase-10-complete-kiln-inspection-boundaries.md) carries bounded nonregular-output handling and required receipt selection. Test audit waits for that completion and a fresh clean whole-PRD delivery audit. Phase 9's non-green complete gate and Phase 8/7/6/5 historical limits remain unchanged; [provider/Grok evidence](kiln-bot-control-validation.md) stays separately scoped. Scoped audit commits remain local by default; this audit's publication, Phase 10 launch, future publication and production release remain held under the [audit's Publication boundary](kiln-bot-control-delivery-audit-after-phase-9.md#publication-boundary).

## Overview

Add a versioned local command client to Kiln's existing controller. The PRD path remains the public target. Discovery reads owner-only saved state across repositories and authenticates each live controller before trusting it. Browser, CLI and automatic recovery share one engine authority boundary; durable command receipts protect retries across disconnects and restarts.

Help has two levels: `kiln --help` inventories every command, and `kiln <command> --help` is the complete reference for that command. Bare `kiln` points to help. Grok Bot on Doug's Mac is an accepted equivalent caller for the phone workflow (AC-CLI-04); the CLI remains vendor-independent.

## Existing Code

**Posture: Preserve.** Existing work, recovery and delivery authority constrain this change.

- Reuse canonical PRD resolution, execution identity, owner-only state, process-identity-aware controller locks and the local authenticated API.
- Reuse engine snapshots, account/usage reads, phase evaluation and dispatch ownership; CLI presentation derives from the same facts and control eligibility as the browser.
- Reuse saved session/attempt records and provider-specific recovery instructions. Enumerate every phase session rather than treating a phase's latest-session summary as history.
- Preserve reply versus no-message resume versus explicit completion acceptance from [Needs you handoff](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md).
- Preserve all billing, outside-workspace, Codex cleanup/history, model/policy and development-delivery checks. These commands grant no spending or delivery authority.
- Preserve `run`, `add-repository`, `audit` and `delivery` execution contracts. Extend their discoverable help; bot-control JSON and exit contracts below govern the new interface.

## Architecture and Decisions

| Decision | Choice and requirement |
|---|---|
| Runtime and hosting | Existing local Node/TypeScript package and loopback Hono controller, on the user's Mac. No new hosted service, relay, scheduler or bot SDK (AC-CLI-03; stated scope). |
| Storage | Extend existing private JSON state with versioned execution control receipts. Provider credentials stay entirely in provider-owned storage. Durable intent is necessary because accepted changes outlive the caller (AC-ACT-05). |
| Public identity | Canonical absolute PRD directory; execution UUID is response/binding data, never a required user-selected run ID. Session selectors and provider IDs stay separate (AC-SEE-07/08). |
| Control authority | One engine admission path serializes browser, CLI and automatic transitions; the existing final provider launch gate retains authentication, usage, billing and delivery checks. A disabled control is never enforcement (AC-ACT-02/04). |
| Help source | One command contract owns dispatch syntax, validation and help metadata. Long help prose/examples are package resources. The reference is generated from these contracts to prevent drift (AC-ACT-01). |
| Read behavior | No interactive prompts and no automatic controller start. A stopped execution exposes saved facts and receipts, with current controls unavailable (AC-SEE-03). |
| Limits | Inventory probes: four concurrent, 2 seconds per controller, 15 seconds total; targeted local reads: 5 seconds; provider metadata: existing 30-second deadline. Commands return accepted receipts for longer work. No indefinite CLI waits. |

### Scope and concurrency

Superseded in part by: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Bot Extension (live message/takeover commands, exact-attempt status and phase/audit message-review hand-back; existing controls and durable retry rules remain).

Only the post-start controls in SCOPE-001 are new bot mutations. No new-run setup, model selection, billing approval, delivery grant, merge or release command is added. Read-only billing facts use the billing feature's authoritative projection. Its implementation is owned by another chat; this design consumes that boundary and does not redesign it.

Each controller admits at most one conflicting work transition, including completion evaluation, resumption and dispatch. Explicit pause requests/cancellations and setting values remain allowed where existing eligibility permits them; their writes serialize with other changes. Duplicate accepted instructions join their existing operation. A different competing instruction is refused as `busy`, never queued for a later stop. The existing port range 4700–4799 admits at most 100 simultaneous controllers (and fewer when other processes occupy it); this interface does not enlarge it. Inventory includes unprobed rows as unknown when its 15-second fan-out deadline expires, so its counts never imply complete discovery after that ceiling. Every state write that authorizes subsequent dispatch must succeed before dispatch can happen.

## Discovery, Ownership and Paths

### Outstanding-work inventory

Enumerate the current OS user's Kiln state root, including every PRD state directory, not just `ports.json`: that file can lose old entries when ports are reused. Combine saved records, controller lock hints and the new authenticated capability response. A missing state root is a successful empty inventory; an unreadable root or record is an incomplete inventory with a concrete error. Never migrate, repair or delete saved state as a side effect of a read.

`kiln status` includes every authenticated live controller, including not-started, paused, waiting, Needs you and complete; also every saved started-but-unfinished execution with no live controller. Exclude closed completed executions and closed never-started setup records. Report counts separately: live controllers, active working sessions, waiting/Needs you/paused controllers and stopped unfinished executions. Unknown records contribute to an explicit unknown count; do not guess completion or subtract them from a purportedly complete total.

A port is a hint. Probe only loopback with the saved API token; validate the capability response's execution ID, canonical PRD, protocol major and instance identity against saved state. Cross-check PID/start time when readable, but an authenticated execution response establishes controller identity without requiring unrestricted process enumeration. A stale lock or reused port never redirects control to its new occupant. A known live process that times out is unreachable and inventory-incomplete. A dead controller is stopped; its saved work state is last-known, not live. Per-item observation times and an overall collection start/end make fan-out freshness honest.

No arbitrary state-root argument is added. The caller's existing state-root environment selects its OS-user context. Require owner-controlled directories/files and reject symlink escapes, unexpected ownership or group/world-writable control material. API tokens and raw environment/configuration never appear in public inventory.

### Target resolution and retained work

For an existing PRD path, resolve it as `kiln run` does, using its main checkout and repository-relative PRD directory. Match the resulting saved record and return the canonical main-checkout PRD directory. Worktree and main-checkout aliases converge. Match by path identity, never repository basename, PRD display name or suffix.

A read can inspect retained work after the document/worktree disappears: normalize the input against caller cwd, resolve the nearest existing ancestor's real path, and match only an exact stored canonical directory, its exact `<folder>-prd.md` filename, or an alias previously authenticated for that execution. Store alias provenance and execution binding. Do not synthesize aliases from arbitrary directory names. If the old checkout itself moved, its former path still retrieves the saved record, labelled `document_unavailable`; the new location is not automatically adopted. Multiple matches are `ambiguous_target`, and an unmatched moved path is `target_not_found`. Mutation requires a reachable controller with matching identity; it cannot silently resurrect work or relocate it.

### Version compatibility

Add authenticated `GET /api/control/v1/capabilities`, returning `{ protocol_major: 1, protocol_minor, kiln_version, execution_id, prd_path, instance: { pid, process_start_time }, features }`. An older controller's 404, unknown/newer major, mismatched identity or unsupported saved schema yields an explicit incompatible/unavailable row and exit 4. Never try its legacy mutation routes. Compatible readers tolerate additional optional response fields, refuse unknown mutation kinds and never interpret unknown states as eligible.

New controller startup upgrades saved records under the existing exclusive PRD lock. CLI reads use pure versioned projections; the existing migration-writing read path must not be used for inventory. The durable-control implementation uses PRD schema 10 after billing schema 9. Receipt envelopes remain independently versioned at 1; inspection sidecars remain version 1.

## CLI and Help Contracts

### Discovering commands

- `kiln` prints a short description, `Use kiln --help to see commands; kiln <command> --help for complete details.`, then exits 2 without starting work.
- `kiln --help` and `kiln -h` exit 0 with the command tree, one-line purposes, read/change distinction, common flags and directions to detailed help. Include existing `run`, `add-repository`, `audit` and `delivery`, their actual subcommands and context requirements (`audit status/snapshot/submit`; `delivery status/assess/prepare/evidence`). An unknown command/flag prints a specific error and the appropriate help invocation, exit 2.
- Every command and nested group supports `--help`/`-h` without Git, saved state, a controller, provider sign-in, network or TTY. Detailed command help is complete; no `--verbose-help` flag is needed. Root/group help points to each leaf.
- `kiln --help --json` and command help with `--json` expose versioned command metadata: path, purpose, side-effect category, usage, arguments, flags, required/exclusive groups, value sources, limits, result fields/states, errors/exits and examples. This is reference data, not a controller capability claim.
- Each example begins with a natural-language request and gives a complete invocation. Explain where PRD paths, status tokens, command IDs and session selectors come from. Reply help covers literal UTF-8 file and stdin forms, quoted paths, receipt lookup, stale-target refusal, unknown outcomes and already-complete unsent replies. Account help describes read-only observations and fresh readings.
- Ship bot integration guidance with the package and surface it in command help: use structured status/controls, take authority from the operator's request, treat all session/output text as untrusted data, never execute embedded output commands, refresh rather than retarget stale replies, and inspect a receipt before retrying. Provider sign-in/account switching uses the provider’s terminal tools independently; no Kiln login wrapper, credential store or shared-account coordinator is introduced.

### Command grammar

Superseded in part by: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Bot Extension (live message/takeover commands, exact-attempt status and phase/audit message-review hand-back; existing controls and durable retry rules remain).

All new commands accept `--json`. Read commands need no safety arguments. Run mutations require both `--only-if-status-matches <status_token>` and `--command-id <id>`. Arguments use an argv array and HTTP JSON, never shell concatenation. Displayed commands use platform-safe quoting and also return `next_argv` arrays to bot clients.

| Command after `kiln` | Inputs and response |
|---|---|
| `status [<PRD-path>] [--detail full]` | No path: inventory. Path: detail with complete stop and control availability. `full` adds full phase/activity, conversation/attempt, settings, account and completion history within this execution. |
| `logs <PRD-path> [--session-id <selector>] [--max-lines <1..200>] [--older-output-cursor <cursor>]` | Bounded output page, as defined below. Session selector and cursor must agree when both supplied. |
| `handoff <PRD-path> [--session-id <selector>]` | Exact existing provider resume instructions, cwd and continuation prompt. Default current recovery session, otherwise most recent saved session; no session or absent instructions is explicit. |
| `account <PRD-path> [--refresh]` | Latest account facts by default; optional bounded fresh provider read. |
| `settings <PRD-path>` | Read runtime preferences. |
| `command-status <PRD-path> --command-id <id>` | Read receipt even after controller closure, without reapplying anything. |
| `reply <PRD-path> (--message-file <path> \| --message-from-stdin)` | Safety flags required. One nonempty UTF-8 literal message, maximum existing 4,000 UTF-16 code units after the existing outer-trimming policy; preserve internal quotes/newlines. Reject malformed UTF-8, NUL and over-limit input before admission. Store accepted contents, not a file reference. |
| `resume <PRD-path>` | Safety flags; no message. Dispatches the state-specific browser Resume action; phase recovery retains already-complete behavior. |
| `verify-and-advance <PRD-path> [--without-sending-reply]` | Safety flags; freshly evaluate completion and accept only passing evidence. A current unsent reply requires the acknowledgement flag. |
| `request-pause <PRD-path>` / `cancel-pause <PRD-path>` | Safety flags; explicit desired state, never toggle or implicit Continue. |
| `continue <PRD-path>` / `check-again <PRD-path>` | Safety flags; existing paused/dedicated-recovery actions. Phase completion uses Verify. |
| `settings <PRD-path> [--keep-awake on\|off] [--resume-after-usage-limit on\|off]` | With either setting: safety flags; atomic requested values, returning resulting settings. No agent/model/delivery/billing-authority options. |
| `outside-confirmation <PRD-path> (--confirm-resolved \| --clear-confirmation)` | Safety flags; offered only for the browser's current reviewed evidence. Does not resume, advance or fix files. |

Reject unknown/duplicate flags, surplus positionals, incompatible selectors and absent targets. Mutations have no implicit current/last/all selection. Command IDs are caller-generated 1–128-character ASCII identifiers (`A–Z`, `a–z`, digits, `_`, `-`, `.`); recommend UUIDs. Status/cursor/operation identifiers are opaque values copied unchanged. Input reads are bounded to 32 KiB and 5 seconds. An input timeout is an error, never an empty reply. HTTP request bodies are capped at 64 KiB including transport overhead.

### Common result and errors

This execution result/exit contract governs the new bot-control commands. Existing helper execution formats and exits remain as recorded in Existing Code; all commands expose text and JSON help (AC-CLI-01; SCOPE-001).

JSON mode writes exactly one UTF-8 JSON object plus newline to stdout; diagnostics go to stderr without payloads/secrets. Text and JSON share the same result object and eligibility decisions. Machine timestamps are ISO 8601 UTC. Text includes a date, time and time-zone label; relative times supplement absolute observations.

```json
{
  "schema_version": "1",
  "ok": true,
  "observed_at": "2026-10-26T13:00:00Z",
  "prd_path": "/work/shop/docs/prds/customer-returns",
  "execution_id": "internal-execution-uuid",
  "data": {},
  "errors": []
}
```

`data` is the command-specific read payload. Inventory uses top-level `inventory_complete`, `counts`, `runs`, `errors` as in the mockup. Targeted status uses top-level `status_token` and `controls`. Mutations/receipt reads use top-level `command_id`, `operation`, `run_state`; logs use the fields in Output Pages. Absent optional observations have `null` plus an availability/reason field, never fabricated empty/zero values. Every independently collected fact has `observed_at`, `state: current | stale | unavailable` and an optional reason. A successful receipt query has `ok: true` even when the recorded operation failed. An admission refusal has `ok: false` and an identified refused receipt when a valid instruction identity could be established.

| Exit | Contract / representative stable codes |
|---|---|
| 0 | Complete read, accepted mutation, or successfully retrieved receipt. Accepted/in-progress is distinct from completed. Completed domain outcomes such as `phase_already_complete` and `completion_checks_failed` remain explicit. |
| 2 | `invalid_input`, `metadata_too_large`, `target_not_found`, `ambiguous_target`, `invalid_cursor`, `cursor_target_mismatch`, `command_id_conflict`, `command_not_found`. No accepted mutation. |
| 3 | `stale_status_token`, `busy`, `control_unavailable`, `ownership_mismatch`, `unsent_reply_acknowledgement_required`. No newly accepted requested change. |
| 4 | `inventory_incomplete`, `controller_unreachable`, `instance_incompatible`, `state_unavailable`, `provider_unavailable`, `saved_output_unavailable`, `operation_indeterminate`, `check_unavailable`. Explicit partial/unavailable/unknown facts; no implied empty success. |

Errors contain `{ code, message, retryable, next_command, next_argv }`; `next_*` is nullable guidance, never authority. A failed durable admission write returns `state_unavailable` and no acceptance. A network timeout after send reports `operation_indeterminate` with command-status guidance, not a claim that nothing happened. Existing legacy helper exits retain their documented meanings.

## Status, Conversations and Handoff

Superseded in part by: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Bot Extension (live message/takeover commands, exact-attempt status and phase/audit message-review hand-back; existing controls and durable retry rules remain).

Targeted status always includes execution/PRD/repository identity, controller reachability, current work state/activity (phase, audit round or delivery), phase counts, agent/requested/effective model, start/latest activity times, pending pause, usage wait, completion outcome and recorded PR links. The complete stop includes its exact final message or explicit absence, reason, failed checks and their check times, human requests and browser recovery instructions. No quiet-time heuristic claims healthy or stuck. Disconnected facts retain their last-known dates; no executable controls or current status token are returned.

Each supported control is `{ name, available, reason, required_inputs, invocation }`. State-specific action identity is part of the status token, so a `resume` of an audit cannot become a phase Resume after a delayed request. Full status additionally includes the phase plan, activity history, settings/account observations and `session_history: { complete, errors, phases }`. Never truncate full stop/history silently; unlike logs, these responses have no 16 KiB product cap. Full history reads saved Kiln records within the targeted-read deadline; it does not start one provider subprocess per conversation. Unchecked provider history remains `unknown`. Report every unread/missing record and `session_history.complete: false` when the deadline or a read failure prevents full enumeration; an unscanned directory is itself an explicit error. Incomplete full history returns its collected records with `ok: false`, `state_unavailable` and exit 4. Assemble the single result with bounded memory: spool full session records and public conversation arrays to private request-local files, project one record at a time, guard inspection snapshot session reads with the same owner/allocation/deadline checks, omit browser-only aggregate timing from inspection snapshots, and finalize either text or JSON into a temporary response before streaming it through HTTP/stdout. Clean up every temporary file on success, failure or cancelled transport. Atomic saved JSON reads have a 16 MiB per-record allocation budget; an over-budget record is explicitly unreadable (`state_unavailable`, incomplete history), with no shortened message or invented facts. This is a read-resource failure, not history deletion or a response-size cap. Apply the shared deadline after synchronous read/parse/projection as well as before them; output either a complete valid result with explicit incompleteness or `state_unavailable`, never a partial JSON object. A changing control revision during assembly requires a fresh read or `state_unavailable` with an inconsistent-snapshot reason, rather than mixing execution revisions.

For every phase key, enumerate the union of its recorded `sessionIds` and session records proven to belong to this execution, preserving reference order and explicit errors for missing/corrupt records. New session records carry `execution_id`; directory placement alone never proves ownership. Legacy records are included only when current execution references and retained migration/creation evidence establish that binding; otherwise report ownership as unknown and history incomplete. Orphan records from a previous execution at this PRD path cannot enter this execution’s history or handoff selection. Include split parents and audit/final activities under their recorded identity, without counting them as executable leaves. Do not scan the user's unrelated provider conversations. A conversation entry contains:

```text
phase_key, phase_id, phase_title, activity_kind
session_id                  Kiln selector, unique within the execution
agent                       claude_code | codex
provider_session_id         Claude recorded session ID; Codex conversation.threadId
identity_availability       known | unknown, with reason
working_directory           recorded cwd; legacy derived cwd labelled as derived
created_at, latest_attempt_at
controller_session_state    running | stopped | unknown
provider_history            available | unavailable | unknown, observed_at, reason
attempts[]                  attempt_id, started_at, ended_at, cause, state,
                            requested/effective model, account provenance
```

Repeated attempts keep the same conversation entry and distinct stable attempt IDs. Earlier replaced conversations remain listed. A phase that never started has an empty conversation list. A stale in-progress attempt with a dead controller is not called currently running. Claude's known local/provider ID equality never licenses substituting Kiln's selector for a missing Codex thread ID. Provider history availability is unknown until checked, not inferred from possessing an ID.

`handoff` is read-only and confines session selection to this execution. It returns `{ session_id, provider_session_id, agent, phase_key, working_directory, resumable, reason, provider_history, resume_command, resume_argv, environment, continuation_prompt, fresh_session_instructions }`. Environment contains only required non-secret profile selectors. Obtain resume commands/prompts through the existing provider recovery boundary, preserving recorded profile/model/effort and quoting. For an earlier phase derive that conversation's instructions, never reuse the current phase's prompt. A currently Kiln-owned conversation is reported active and unavailable for concurrent manual resume; missing identity, cwd or provider history is explicit. Bounded history reads may use Claude's provider-owned saved transcript and Codex metadata/history APIs; they start no turn. If availability cannot be established, do not promise resumption; preserve any available fresh-session instructions.

## Durable Controls and Retries

### Status-token semantics

Issue an opaque token binding execution, controller epoch and a persisted control revision. The revision changes for a new stop/attempt/activity, pause/setting/confirmation change, dispatch ownership or material eligibility/authority change. It includes the handoff recovery target and outside-evidence fingerprint where applicable. A later question in the same conversation is a new stop. New ordinary output, a clock tick or an identical observational refresh alone does not invalidate it. Restart changes controller epoch, so old unaccepted instructions must refresh.

Under engine serialization: resolve ownership and instruction identity; look up a receipt first; compare canonical inputs; only for a new instruction validate the current token, current evidence/eligibility and actual authority. Store a refused receipt for a well-formed stale/ineligible instruction. Replaying the same instruction returns that receipt; refreshing intent requires a new command ID. Never rebind an accepted command to a later stop.

The deduplication key is OS-user context + saved PRD identity + command ID, retained across execution replacement. Canonical input includes protocol/action, bound execution and target revision, supplied setting/confirmation values and exact normalized message contents; file path versus stdin is not part of message identity. A repeated ID with different effective inputs is refused before acting. Old receipts clearly identify their original execution. A saved path reused for a new execution cannot apply the old mutation; it can only return an earlier receipt or reject a conflicting reuse.

### Operations, dispatch and crash reconciliation

A receipt records `id`, `command_id`, `execution_id`, action/target, accepted/updated times, `state: accepted | in_progress | completed | refused | failed | indeterminate`, stable outcome/reason and separate effects:

```text
reply:   not_applicable | not_sent | submitted | delivered | unknown
session: not_started | starting | resumed | unknown
plan:    not_advanced | advanced | unknown
```

`delivered` requires provider conversation evidence that includes the submitted reply; writing provider stdin or spawning a process establishes only `submitted`. Adapter evidence identifies its exact attempt/turn/message where available. A reply already found in durable provider history is never resent after a crash. Without conclusive evidence report unknown and inhibit automatic replay. Resume success requires a correlated saved attempt and actual provider start; acceptance alone never says resumed. Plan advancement identifies the accepted phase and resulting next activity/pause rather than promising that the next model turn started.

Before any effect, atomically write and fsync durable intent. Keep one authoritative receipt per command in an execution-owned control journal; persist monotonic sequence and schema. Related PRD transition writes carry the applying operation ID/revision, and new session attempts carry the dispatching operation ID before spawn. After the durable effect, settle the receipt. Atomic file replacement alone does not make several records a transaction: restart reconciliation uses these IDs and the existing authoritative phase/session/delivery facts. No mutation is acknowledged before its journal entry is durable. A failure before that write means no acceptance and no effect. After durable intent, a failed related write may leave partially applied records: retain the accepted operation, disable conflicting dispatch, and reconcile its persisted operation references before settling `failed` or `indeterminate`. Do not promise an unchanged state or undo a possibly delivered provider effect. A receipt-settlement write failure likewise preserves pending intent for reconciliation; it cannot authorize another dispatch.

A controller restart, `command-status`, or control admission reconciles pending receipts before admitting conflicting effects. If persisted facts prove the effect, settle once; if provider side effects might have happened, keep `indeterminate` and expose recovery guidance. `command-status` reconciliation only records or returns proven effects and uncertainty; it never dispatches work. Only controller startup or control admission may resume the same accepted operation when persisted facts prove no dispatch/write occurred and its original target remains eligible. Never dispatch a second turn to find out. Reads may report uncertainty but do not start work. Recovery on controller startup respects pause/billing/usage holds before any automatic dispatch.

Browser controls use the same admission/dispatch/effect mechanism, with browser-generated instruction IDs; automatic actions have internal stable event IDs and the same mutual exclusion/launch checks. Preserve existing HTTP request compatibility by generating an instruction ID server-side for an older browser request, without promising deduplication for its blind retries. The shipped view uses returned revisions and receipts. No legacy route may bypass current stop validation, pending operations or existing launch restrictions.

### Manual phase outcomes

Superseded in part by: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Bot Extension (live message/takeover commands, exact-attempt status and phase/audit message-review hand-back; existing controls and durable retry rules remain).

Reply and no-message Resume use the prerequisite's evaluate-then-act contract. An unfinished phase resumes the saved conversation with the reply first (or no reply), preserving terminal history. A completed phase yields `phase_already_complete`, starts nothing and does not advance. A reply's normalized text is retained in its private receipt as `not_sent`, not posted to provider history. Current status exposes the pending unsent receipt IDs and text for this exact stop; new attempts/stops never inherit it.

Verify evaluates every applicable obligation afresh and changes neither files nor Git delivery. Passing checks accept completion once and respect the existing pause/audit/final plan. Failed checks settle as `completion_checks_failed`; an interrupted/unreadable check reports `check_unavailable` and labels any retained previous rows with their original time. If unsent receipts exist for the current stop, `--without-sending-reply` acknowledges the set included in the current status token. It marks those receipts acknowledged without deleting or sending their text. Without it, refuse advancement. Ordinary no-message Resume can still finish unfinished work; the flag cannot waive any completion requirement.

Replaces in part: [handoff design](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md), §Local Interfaces and §Snapshot and transient data (add durable bot receipts and stop-bound unsent reply retention; browser drafts remain page memory); §Manual Phase Recovery (durable instruction identity supplements existing command ownership). Existing recovery semantics and completion predicates stand.

## Output Pages

The saved Kiln output projection is the source; partial live deltas are excluded. Use a reverse, chunked read of `output.jsonl`, not a full-transcript load. A page covers at most 50 saved numbered output records by default, 1–200 with `--max-lines`. The public word “line”, the `lines` array and `--max-lines` use this saved-entry unit, not newline-delimited text lines (AC-SEE-06; OUTPUT-001). Preserve record text, including internal newlines and Unicode; `number` is the existing output record number. Text rendering prefixes metadata outside the text and JSON preserves exact text. No follow or whole-output mode.

On a new unpaged request capture the session, execution, output-file generation, last complete JSONL record byte boundary and observation time. Never include a partially written trailing record. Output storage is append-only for that generation; recovery/rebuild/replacement increments its generation. Pin those coordinates in an authenticated opaque cursor and retain a compact snapshot descriptor until execution history deletion. A cursor cannot select another execution/session; detect generation/length/prefix changes and report unavailable instead of reading different content. The descriptor records `output_generation` (a persisted UUID), `file_identity` (device/inode where supported), `frozen_byte_end`, `last_record_number` and `prefix_sha256` of exactly the complete bytes through that end. Build and validate the prefix digest with bounded-memory streaming under the targeted-read deadline; never load the transcript into memory. Each page opens the pinned generation, verifies identity, minimum length and the frozen-prefix digest, and reads only its selected suffix records from that file. Appending beyond the frozen end is allowed. Every Kiln rewrite/rebuild publishes a new generation before replacement; a missing generation, changed prefix or validation deadline yields `saved_output_unavailable` with a specific reason. Legacy saved output may establish a descriptor from its actual bytes without rewriting the output or migrating its session. Newly appended output cannot move a snapshot.

Each page has the common result identity/time plus `session_id`, `snapshot_id`, `snapshot_observed_at`, `snapshot_end_line`, `requested_lines`, `response_byte_limit: 16384`, `byte_limit_reached`, `range`, `lines`, `has_older`, `next_before`, `next_command` and `next_argv`. Each line has `{ number, at, source, text, fragment }`; a fragment is `{ start, end, total, unit: "unicode_scalar" }`, half-open offsets into the original text. Null fragment means the full record. Cursor position is the exclusive endpoint for the next older page, possibly inside a record.

**Serialization is the budget.** Construct complete metadata including the cursor and next invocation before selecting text, serialize in the selected output format including its trailing newline, and measure UTF-8 bytes. Choose the largest newest contiguous suffix that fits, honoring the saved-entry ceiling; serialize again after final cursor selection. If a record cannot fit, split only at Unicode scalar boundaries, return its newest fitting fragment, and position the older cursor immediately before that fragment. On older pages finish that record before preceding records. Within each page all content is chronological. No ellipsis replaces text; fragments have explicit offsets. Metadata is capped separately: identifiers/cursors are bounded, and a too-long canonical path uses a compact `metadata_too_large` error with no echoed path, never an oversized response or payload loss. Cap the entire stdout result at 16,384 bytes in both formats, including errors. A response containing zero content because metadata consumed the budget is an error, not a successful page.

A cursor fixes snapshot and exclusive endpoint; repeated requests with the same cursor and presentation/options return the same text, while response collection time may change. `--max-lines` may change only the preceding page size. Cursor/session mismatch is exit 2. Beginning-of-history is successful with `has_older: false` and null next fields. No session/no output is successful with an explicit reason. Missing, corrupted or unreadable output is `saved_output_unavailable`, exit 4. Traverse pages backward, sort fragments by their recorded offsets and concatenate their `text` to reconstruct each saved record exactly, without inserted separators or dropped prefixes.

## Account and Usage Facts

`account` and full status separate `last_attempt`/`original_attempt` provenance from `next_attempt` current authentication. Each account, plan, billing route, usage bucket and permission observation retains its own timestamp/state/reason. Codex preserves provider window IDs, duration and account identity; five-hour and weekly names are only assigned when provider data supports them. Claude preserves provider-specific weekly scoped rows. Missing usage is not 0%, and credit balance is not ordinary usage permission. Refresh uses provider metadata, never an inference request. Concurrency joins identical display refreshes; a required prelaunch check starts freshly after older reads settle.

## Durable Data and Evolution

All state is local to this OS user; moving to another Mac is outside this feature. Private state loss means loss of receipts and retained output, reported explicitly, not silently reconstructed as a successful operation. History deletion is one execution-owned lifecycle operation: active or indeterminate effects must reconcile first; provider-owned conversations/credentials are not deleted with Kiln history. A later retention policy can remove one execution without changing another execution’s operation/session identity. No cloud backup or second credentials store is introduced.

| Entity / authority | Added persisted contract and lifecycle |
|---|---|
| PRD record | Schema version; canonical path and authenticated aliases; controller epoch/control revision; applied operation references. Existing execution UUID, phase and authority records remain authoritative. |
| Session/attempt records | Explicit execution UUID on new sessions, proven legacy ownership on migration; stable attempt identity and dispatching operation reference; provider conversation ID and recorded effective profile/account provenance remain source facts. Legacy attempt IDs derive deterministically from execution/session/attempt index, never timestamps alone. |
| Per-execution control journal | Version, ordered sequence, command ID/input digest, bound execution/target, accepted intent, state/outcome/effects and unsent normalized reply when applicable. Authoritative receipt; effects reconciled against owned run/session records. One receipt per instruction; no TTL while execution history remains. |
| Output snapshot descriptor | Version, execution/session, output generation UUID, file identity, frozen byte end, last record number, frozen-prefix SHA-256 and creation time. Cursors bind it and an exclusive text endpoint; retired only with the execution's saved history. |

Partition receipt storage by execution and command-ID digest so one growing embedded PRD array is unnecessary. The controller builds its cross-execution command-ID locator in memory by scanning the owner-only execution partitions under the five-second deadline. Closed-controller lookup uses the same bounded scan. The locator is rebuilt from authoritative receipts rather than persisted as a second file; duplicate command identities and invalid envelopes fail closed. Persist new records with atomic replacement and fsync; checksums/version markers distinguish malformed/truncated state. Coordinate read/modify/write with existing exclusive controller ownership. No new cross-controller coordination lock is required.

Reads never migrate. Under exclusive controller startup, migrate supported records idempotently and preserve original bytes using the existing migration-evidence convention. Validate all added fields and relationships; an unknown schema disables mutations. An incompatible controller exposes no bot mutations. Rollback can read only versions it supports; do not downgrade files or discard receipts to run an old binary. Export/restore of histories later can retain stable execution/session/operation IDs and explicit schema versions without reinterpreting path labels as identity.

Receipt and cursor growth is proportional to explicit commands/pages; inventory/status/receipt polling creates no new receipt or output snapshot. Repeated unpaged logs at an unchanged output boundary reuse the descriptor. Per controller, one work mutation and one provider refresh are active; excess distinct requests receive `busy`. Keep disk/write failures visible and refuse new effects when durable state cannot be preserved. Retained data has no hidden item limit or automatic pruning. Reads can fail explicitly at disk capacity, the five-second scan/hash deadline, or the documented per-record allocation budget. Emit explicit read completeness/validation-deadline errors and durable-write failures with operation identity; expose inventory totals and retained history/output byte counts where readable so growth is visible. Chunk-integrity indexing can later replace full-prefix streaming behind the same cursor contract without re-keying execution/session history. Retain no silent time/size pruning: execution history deletion removes its receipts and cursors together, while active/indeterminate dispatch ownership must first be reconciled. Atomic metadata may be rebuilt from authoritative records; never rebuild missing operation outcomes by assuming they succeeded.

### Inspection metadata compatibility

The inspection surface uses version-1 sidecars for retained browser facts and per-conversation recovery instructions, legacy session bindings, Git-authenticated PRD aliases and output snapshots. Pure readers never create bindings, migrate records or synthesize an execution identity. The exclusively locked controller creates legacy bindings and records aliases resolved by Git at startup. New sessions add explicit execution identity and output-generation UUID fields to the compatible existing record shape; the durable-control phase chooses its journal/schema upgrade separately.

Inspection cache writes share the existing 100 ms snapshot cadence and flush pending observations when the controller closes. Live reads still project current engine facts. Retained inspection facts keep their original collection time after disconnection. A failed projection/cache write is explicit in live status; corrupt or unreadable session records still appear as incomplete history. Selected earlier conversations retain their own provider/activity prompts, including Codex's recorded skill context. Status samples saved output with bounded memory and marks any fragment; complete final stop messages remain unabridged.

## Local API and Integration Points

Every route retains loopback-only binding, strict Host and matching mutation Origin, `X-Kiln-Token`, no CORS, no-store and owner-only token lookup. CLI does not expose tokens in argv or public output. Validate execution binding on all responses. Redirects are refused; a loopback redirect cannot forward a token elsewhere.

| Route | Request / result |
|---|---|
| `GET /api/control/v1/capabilities` | Authenticated identity and version handshake described above. |
| `GET /api/control/v1/status?detail=full` | Shared bot-facing status projection, status token, controls and history. |
| `GET /api/control/v1/logs?session_id=…&max_lines=…&older_output_cursor=…` | Bounded output page; only registered selectors/cursors, no arbitrary file path. |
| `GET /api/control/v1/handoff?session_id=…` | Read-only selected-conversation recovery instructions. |
| `GET /api/control/v1/account` | Latest provider facts. `POST …/account/refresh` requests bounded observational refresh; no model request or mutation receipt. |
| `POST /api/control/v1/commands` | `{ command_id, execution_id, status_token, action, inputs }`; strict action-specific fields; returns durable receipt. |
| `GET /api/control/v1/commands/:command_id` | Saved receipt for the selected instruction. |

HTTP mapping: 200 completed reads/results, 202 accepted work, 400 invalid input, 403 token/ownership, 404 unknown target/receipt, 409 stale/busy/ineligible, 413 oversized request, 503 unavailable/indeterminate. Always return the documented JSON error, not an HTML page. Browser legacy endpoints enter the same authority boundary; the CLI does not call undocumented browser routes. For a closed controller, pure local readers project saved status/history/output/receipts; fresh provider reads and new mutations are unavailable.

Integration boundaries are the installed provider CLIs, provider-owned account metadata/history storage, existing engine eligibility and launch APIs, filesystem state and the bot's existing Mac command runner. No credential-helper execution is added to discovery. All provider/process/helper calls retain bounded deadlines and process-tree cleanup. Public diagnostics include action/operation ID, stable reason and observation time, never raw environment/provider output or secrets.

Replaces in part: [Kiln v1 design](../kiln-v1/technical-design.md), §Command line and §Control From Outside the Browser (documented local client and broader help); §Local security and §Kiln's State on Disk (additive private control metadata only). Earlier-design supersession pointers are added when implementation ships, not during this design stage.

## Validation Boundaries

| Boundary | Required evidence |
|---|---|
| Help and input | Built package from unrelated cwd with no controller/Git/provider access: bare invocation, root/group/leaf help in text/JSON, every existing/new command present, full flag/exclusivity/error/field docs, all examples parse. A bot obtains help and constructs status/reply without undocumented knowledge. Quotes, Unicode, spaces, literal shell metacharacters and stdin/file equivalence reach the same provider message; invalid inputs start nothing. |
| Discovery and saved state | Real private state directories, Git worktrees and live loopback controllers: two repositories, aliases/missing PRD, zero work, completed-open/closed, unfinished-old records, unreadable files/root, reused ports/PIDs, old protocol/schema and partial timeout. Pure reads create no migration writes. |
| Status/history | Real Claude and Codex saved records from earlier/current phases, multiple conversations in one phase and multiple resumes. Distinct local/Codex provider IDs; missing/corrupt records, unprovable legacy/orphan ownership, unavailable provider history, histories exceeding one ordinary response page, deadline incompleteness and active handoff refusal. Inspect exact stop, checks, human requests, plan/audit counts and dated account facts. |
| Durable effects | Real server/process/file boundaries and real disposable Git repos: stale status/changed stop, same-ID replay after restart/advance/execution replacement, changed-input conflict, browser/CLI/automatic races. Inject termination/write failure before/after admission, provider stdin, provider dispatch, completion acceptance and receipt settlement. No duplicate message/turn/advance; genuinely uncertain delivery stays unknown. |
| Logs | Exercise actual saved output and both final serializers with quotes, escapes/control text, multi-byte Unicode, internal newlines, empty/very long records, exact 16,384-byte boundary, long metadata/errors and repeated snapshots. Every stdout page including newline is within cap. Reassemble all fragments without gaps/duplicates; append/change/delete/rebuild between pages; prove session/execution mismatch is refused. |
| Account facts | Existing real provider metadata reads for Claude and Codex, labelled attempt/current identity and usage freshness, unavailable reads, and ordinary launch/recovery checks after an externally changed sign-in. No new login or credential handling. |
| Complete workflow | Local Grok Bot (accepted phone-equivalent) uses help and the built CLI on two simultaneous disposable PRDs from an unrelated cwd; exact stop/reply/continuation, terminal discussion/no-note Resume, complete/unsent reply, explicit Verify, per-phase lookup, replay/stale protection. Record caller/app/provider versions and configuration. This release demonstration follows implementation; design-stage feasibility checks do not satisfy it. |

Use real filesystem/process/HTTP boundaries and disposable Git origins, with existing provider authentication for provider-boundary checks. Recorded verified provider contracts support deterministic negative tests; mocks alone do not establish account metadata or reply delivery. No production run control or repository writes are used as proof. Run the repository's normal full verification gate before implementation commits; this document-only stage runs document/contract checks and the explicitly recorded feasibility probes.

Design-stage serializer feasibility evidence is recorded in [Investigation, Resolved design questions](kiln-bot-control-investigation.md#resolved-design-questions); it does not establish the future implementation’s validation.

## Acceptance Criteria Coverage

| PRD criteria | Design sections |
|---|---|
| AC-SEE-01, AC-SEE-02, AC-SEE-03, AC-SEE-07 | Discovery, Ownership and Paths; Status, Conversations and Handoff; Common result and errors |
| AC-SEE-04, AC-SEE-05, AC-SEE-08 | Status, Conversations and Handoff; Command grammar; Validation Boundaries |
| AC-SEE-06 | Output Pages; Validation Boundaries (Logs) |
| AC-ACT-01 | CLI and Help Contracts; Status, Conversations and Handoff |
| AC-ACT-02, AC-ACT-03 | Durable Controls and Retries; Command grammar; Scope and concurrency |
| AC-ACT-04, AC-ACT-05 | Status-token semantics; Operations, dispatch and crash reconciliation; Durable Data and Evolution; Local API and Integration Points |
| AC-ACCOUNT-01 | Account and Usage Facts; Status, Conversations and Handoff |
| AC-CLI-01, AC-CLI-02, AC-CLI-03 | Common result and errors; CLI and Help Contracts; Local API and Integration Points |
| AC-CLI-04 | Validation Boundaries (Complete workflow) |

## Open Questions

No unresolved technical decisions. SCOPE-001 and OUTPUT-001 remain the declared business assumptions. Release demonstrations and implementation validation remain owed by the build stages.
