# Technical Design: Control a live Kiln session

**PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md) · **Business assumption:** [SCOPE-001](kiln-live-session-control-assumptions.md) · **Evidence:** [runtime investigation](kiln-live-session-control-investigation.md) · **UI contract:** [approved mockup](mockups/kiln-live-session-control.html).

**Status:** Whole-change design independently reviewed; next is joint PRD/design refinement. Design-stage macOS probes establish a useful yield and message-correlation path, not implementation readiness. Exclusive terminal hand-back, comprehensive tool coverage and literal-input context preservation remain blocking proof questions below. No product implementation is included.

## Overview

Extend the existing local TypeScript controller, authenticated loopback API and Svelte view. Add durable, attempt-bound live messages and a takeover hold independent of the existing end-of-activity pause. Claude's input remains open across correlated turns; a provider hook closes admission to new operations and yields after admitted work completes. Only reconciled process release enables terminal instructions. Manual return reuses the existing evaluate-then-resume-or-explicitly-advance flow, extended to delivery and test audits.

The browser delivery stands alone. The [bot design](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md) owns discovery, CLI routing and general command receipts. The two interfaces share live-action identity, receipt and engine authority; this design does not require that whole bot framework to ship first.

## Existing Code

**Posture: Preserve.** Change only the PRD's named behavior.

- Reuse execution/activity identity, original audit rounds, session histories, controller ownership, private state and local HTTP/SSE authentication.
- Reuse phase and audit completion predicates, currentness, workspace evidence and development-delivery obligations.
- Extend the existing Needs you reply/terminal/hand-back arrangement and phase evaluate/accept split to takeover audits.
- Preserve model/account/billing and workspace restrictions, usage recovery, ordinary stopped-session reply semantics and deferred pause timing.
- Preserve ordinary Codex and final-delivery controls; SCOPE-001 excludes their live actions.
- Keep saved provider output and transcripts as evidence; output prose and provider success results never grant completion or delivery authority.

## Architecture and Durable Authority

No hosted service, new database, daemon or scheduled job. The existing controller owns all state-changing decisions. A small packaged hook helper reads the attempt's private control state and reports provider checkpoint observations; it does not own scheduling, execute instructions, or expand permissions. Prompts and hook reason text are external package resources.

### Identity and serialization

`LiveTarget` is `{ executionId, activityId, activityKey, sessionId, providerSessionId, attemptId }`. Every field is mandatory and obtained from current authoritative state. Labels, phase numbers, audit round text, timestamps and the browser route are not substitutes. `sessionId` is Kiln's selector; the separate provider ID prevents encoding Claude-specific equality into the public contract. Persist a random attempt UUID before spawn; normalize legacy attempts deterministically from execution/session/run index without changing historical timestamps.

Each changing request carries an `instructionId` and the exact target. Match the bot contract: instruction IDs are 1–128 ASCII letters, digits, `_`, `-` or `.`, with browser-generated UUIDs recommended; the provider input UUID is separate. Deduplicate within OS-user context plus saved PRD identity across execution replacement, preserving the original execution binding. Deduplicate before testing current eligibility: the same ID and same canonical inputs returns its original receipt, including after the target ends; a different payload is a conflict. Different requests serialize through one admission boundary with provider settlement, completion acceptance, launch, automatic usage recovery and delivery transitions. Never hold the controller lock while waiting for a model turn or a tool to finish: persist intent under the lock, release it, and reconcile observations under that same boundary.

A new message may enter only while that exact attempt's input is owned and accepting. A takeover may enter while that exact attempt is running, including recovered input loss. Completion/closure seals admission under the same lock. If sealing wins, refuse the late request; if takeover wins, its hold wins even when completion evidence subsequently passes. No accepted action is retargeted to a successor or replacement attempt.

### Durable records and ordering

Extend private execution state with `liveControl` containing its schema version, revision, active target, hold references and recovery state. Keep immutable message text and individual receipt histories in execution-owned sidecars keyed by a SHA-256 digest of the instruction ID; store and compare the original ID, never interpolate it as a path. A retained PRD-level instruction lookup points to the original execution receipt so browser and bot retries survive execution replacement. Rebuild that lookup from retained receipts before admitting mutations if it is missing or incomplete; it is a projection, not a second receipt authority. No unbounded embedded message array. Snapshot fields are projections, never a second mutable authority.

| Record | Authoritative fields |
|---|---|
| Live instruction | Version; instruction ID/input digest; execution and exact target; action; monotonic acceptance sequence; accepted/updated UTC times; state/outcome/reason. For a message, exact text and provider input UUID. |
| Message evidence | Write intent/attempted/completed times; provider event UUIDs and saved event offsets; correlated input UUID sets and result indices; receipt state; optional person-review acknowledgement and time. |
| Takeover hold | Instruction/target; requested time; checkpoint state; latest operation observation; release observations; obstacle/retry state; explicit hand-back operation reference. |
| Delivery-resolution hold | Target and unresolved receipt IDs; acknowledgement state; explicit hand-back operation reference. It remains held after acknowledgement alone. |
| Attempt control | Attempt UUID; CLI version/configuration profile; controller epoch; input ownership; checkpoint-hook capabilities; PID/start identities; known tool/task identities and terminal outcomes; saved transcript availability. |

Before acknowledging a message, persist and fsync its intent. The durability boundary includes both replacement-file contents and the containing directory entry; an unsupported or failed durability operation refuses admission instead of claiming crash safety. Persist `write_started` before touching stdin. A crash after that intent cannot prove non-delivery merely because a callback or echo is absent. Save correlated provider evidence before projecting a confirmed receipt. Before acknowledging takeover, persist and fsync the hold; only then ask the adapter to yield. New tool admission must participate in the same atomic hold/admission boundary described under Provider gate. A failed hold write accepts nothing and sends no control. A post-intent write failure retains unresolved intent and inhibits conflicting actions; it never rolls back a potentially delivered external effect.

Atomic replacement alone is not a transaction between receipts, attempt records and execution state. Use operation references and revisions to reconcile torn transitions on startup before any dispatch. The existing atomic JSON helper does not currently fsync: durable live admission requires that stronger write boundary. Reconstruct projections from authoritative receipts/effects, never infer success from a missing record. If bot control is present, its control journal stores the same instruction identity and references the live receipt; it must not generate a second provider send. If it lands later, adopt the live receipt IDs/effects without replay. General bot infrastructure remains owned by that PRD.

## Message Delivery and Attempt Settlement

### Literal input and admission

Accept nonempty plain text of at most **4,000 UTF-16 code units**, measured before any normalization; display that exact limit/counter. Use whitespace trimming only to detect an empty message. Preserve all accepted leading/trailing whitespace, newlines and quotes. Reject NUL, malformed Unicode and excess length, never truncate. Bot file/stdin decoding rejects malformed UTF-8 and preserves the same text. This live limit does not change the stopped reply's existing outer-trimming policy.

Write a stream-json `user` message to the existing attempt, with its stable provider UUID, exact session identity and literal content. The adapter must suppress slash-command dispatch and file/resource expansion without dropping the conversation's applicable instructions. The candidate per-message `client_composed: true` field has a wider effect in SDK 0.3.310: it skips turn-start attachments, including nested `CLAUDE.md`/rules and skill/tool listings, until a later tool boundary. Q4 must establish the literal-input contract with those instructions preserved; do not assume this field is a narrow expansion switch or enable it globally. No shell interpretation or new permission is introduced. Enable provider user-message replay for evidence. Neither a pipe write nor a replay echo alone proves model consumption.

Bound stdin write settlement to 5 seconds. A timeout becomes `Delivery uncertain`, persists its hold and closes further send admission; it does not cancel the provider/tool, retry the input or claim zero bytes were delivered. Continue observing that same write and provider evidence. A late callback cannot reopen admission or clear a hold by itself, and takeover may proceed under the safe-checkpoint rules after the submission has settled as uncertain. Only one stdin write submission is in flight per attempt; another conflicting submission gets `busy`, not a queue that can later run against different work. After write settlement, later accepted messages can follow in acceptance sequence even while earlier ones await provider consumption. Takeover waits for a currently submitting write to resolve; an uncertain receipt allows takeover but blocks further sends. At most 32 accepted live inputs may await correlated terminal results; an assistant-only read receipt does not release a slot. At capacity, reject new sends as `busy` with the current count/reason, retain the draft and continue offering takeover under its normal rules. This stays below the provider's 64-entry consumption-UUID list limit while leaving room for the opening input; it is an admission rule, not an assumption of an unbounded provider queue. Browser pending/capacity state is feedback; server admission enforces both limits.

### Receipts and correlation

| User-visible receipt | Evidence and progression consequence |
|---|---|
| Submitting | Client submission or durable accepted intent pending transport settlement; no delivery claim. |
| Sent to session — not confirmed read | Full write completion to this attempt; retain as unsettled until provider correlation or explicit uncertainty. |
| Received by Claude | Saved assistant/result evidence explicitly names the submitted UUID in `user_message_uuid`/`user_message_uuids`, or an equivalently proved provider consumption signal. This says nothing about compliance. |
| Not sent | Refused before delivery or conclusive proof no write began. Exact text stays copyable/revisable. |
| Delivery uncertain | Partial/failed write, lost controller after write intent, uncorrelated attempt exit, or inconclusive history. Persist the resolution hold; no automatic resend. |

The measured CLI coalesces queued inputs: a replay bearing the last UUID can contain multiple messages, while its assistant/result lists all contributing UUIDs. Match UUID sets within the bound attempt, not echoed text equality, response prose, result ordinal or `queued_turn_count`. Preserve original text separately. Persist both acceptance order and provider evidence; inconsistent identities/order become uncertain, not silently reordered. A transcript user record establishes saved input, but does not by itself upgrade the receipt to model-read evidence.

A result finishes a provider turn, not necessarily the attempt. Persist every result and contributing UUID set. After each result, under serialization, seal admission and close stdin **only when all accepted live inputs have correlated terminal results**, or takeover has closed admission and the safe drain path is active. While an accepted input is unaccounted for, keep reading subsequent events/results. A zero queued-turn count is insufficient: the measured first result reported zero even with additional accepted inputs awaiting their second result.

On eventual process exit, reconcile the entire attempt and its input ledger before normal completion checks. Any unaccounted write becomes uncertain and holds progression; an earlier successful result cannot clear it. An accounted input with provider error still preserves that error for normal activity settlement. A takeover hook's successful result is an intentional yield, never a completed phase/audit. Aggregate usage/result evidence without counting cumulative provider cost twice; retain per-result deltas and the final cumulative observation distinctly.

### Uncertainty recovery

Show each exact uncertain message, its receipt, output link and observation time. If still running, offer takeover under the same safe checkpoint rules. If ended, offer the existing terminal recovery only after release/history checks. Do not automatically launch a conversation to ask whether the message arrived.

`I reviewed this message in the conversation` records a human acknowledgement for that receipt, not a provider confirmation. It never resends, changes `Delivery uncertain` into `Received`, clears the execution hold, or starts work. All uncertain receipts for this target must be acknowledged before direct reply/resume/verify/advance; a later uncertain receipt requires its own acknowledgement. Explicit successful hand-back clears the resolution hold as well as the takeover hold, if present. A failed check or failed launch leaves both holds. A missing transcript retains copyable messages and existing fresh-session guidance, without promising same-conversation recovery.

## Safe Checkpoint and Release

### Provider gate

For newly launched Claude phase/audit attempts, supply a per-attempt hook configuration through CLI launch settings without rewriting user/project hook files. It names the packaged Node executable/helper through exec-form argv, binds execution/attempt identity, and composes with existing hooks/permissions. It never emits an allow decision that overrides another restriction. Do not expose private state tokens in argv, prompt text or logs.

The gate has two distinct jobs:

1. `PreToolUse` checks durable attempt control before authorizing new work. While takeover is held it returns an explicit **deny** decision for a not-yet-started substantive operation. `continue:false` alone is insufficient here: the negative probe still ran a second pre-generated Bash call. Already admitted calls finish naturally. Admission must serialize with takeover acceptance; an operation admitted just before the hold counts as in flight even if OS spawn follows shortly afterwards.
2. `PostToolBatch` yields the main loop after admitted tool calls resolve, using `continue:false` and a concise saved stop reason. The completed results and hook reason preserve continuation context. A whole test batch, phase or audit is not required. While generating text, a pending takeover waits for the current generation/boundary; the pre-tool gate prevents its next substantive tool from starting. An idle/result boundary can seal input and drain without sending a cancelling interrupt.

Gate helpers are separate processes: an in-memory controller mutex plus a latch read cannot serialize them. The controller and helpers share one attempt-scoped cross-process admission critical section. A helper checks the hold and durably records a unique provider tool/agent admission before returning permission; takeover writes its hold in that same critical section. A helper death between admission and permission leaves an unresolved admission until provider/process evidence proves its outcome. Restart must establish the previous lock owner's death before recovery, never steal a lock on elapsed time alone. Lock/identity failure blocks new admission and leaves a visible obstacle. Q2 must prove this primitive and crash ordering on the release profile; the disposable latch probes did not exercise it.

Install the pre-tool gate for every tool and subordinate agent context that can start work, not just Bash. Track parent/child tool admission and task completion so a foreground Agent call cannot run its entire delegated task merely because the parent is waiting. For already active background agents, gate their next operation too and allow current operations/necessary checkpoint work to settle. Unknown inheritance, missing hook coverage, or operations that cannot be accounted for prevent safe readiness. These cases are the blocking coverage proof Q2; the simple Bash probes do not establish them.

Use bounded helper reads (5 seconds) and hook timeout (10 seconds) with failure blocking enabled on gate hooks. Helper failures report the obstacle and retain the hold. Hooks must not wait indefinitely or fail open because the controller restarted. A controller-owned private latch remains readable after restart; ordinary hooks and normal output remain intact. Only checkpoint/reconciliation work explicitly classified by the adapter may continue while held; arbitrary model-generated “cleanup” is not permission to start more substantive work.

### Release is a separate fact

After yielding, stop accepting user input and let the provider drain admitted work. Background tool return is not process completion: the probe returned `hook_stopped`, then a background-task completion and another model result before the process closed. Keep the no-new-work gate in force across these callbacks. Do not cancel background work to accelerate readiness.

Terminal readiness requires all of:

- The exact old attempt's process has exited, with identity established by PID **and** start time; missing/denied identity reads are unknown, never “gone.”
- Every admitted tool and tracked background/subagent task has terminal evidence; tracked descendant processes have exited. Process-group leader exit alone cannot establish child release, and detached/reparented children require retained identity.
- Provider transcript/history for the exact conversation is readable and usable, including the completed operation and checkpoint context.
- No unresolved writer or ownership ambiguity remains, and the takeover/recovery hold is still durable.

No signal, interrupt acknowledgement, result, stale registry removal, or transcript mtime is sufficient alone. Takeover never uses the existing stop path's SIGINT/TERM/KILL escalation. If an operation stalls, keep waiting and show the last observed activity and concrete obstacle; after 30 seconds without a new observation label the elapsed wait without asserting a hang. Observation reads have deadlines; the operation has no automatic cancellation deadline. Retry repeats reconciliation, not the work or interrupt.

A restart loads the holds before completion, delivery reconciliation that could authorize effects, automatic usage recovery or leftover-process cleanup. Recovered input is unavailable; never reconnect by opening a peer conversation. If this attempt has a proven persistent gate, request/observe its yield through that gate. If it predates gate support or its identity is unknown, hold progression and wait for natural completion/release; no forced stop. Retain unsent browser drafts during reconnect. Legacy activity work can still finish naturally, but a takeover request accepted before its end retains the hold for explicit verification.

Replaces in part: [Kiln v1 design](../../prds/kiln-v1/technical-design.md), §Sessions, §Output and progress, §Stopping a session: Ctrl+C, a closed terminal and signals, and §Interruptions, sleep and resume (live-controlled attempt input settlement and deliberate safe takeover/restart only). Ordinary application shutdown policy is not changed into a promise of safe takeover.

## Terminal Ownership and Hand-back

### Ownership admission

The provider registry under the effective Claude configuration directory exposes session UUID, PID, start identity, cwd and entrypoint for both headless and interactive processes on the tested macOS version. Read only identities needed for this conversation; no credentials or unrelated transcript content. Check the registry against actual OS process identity, exact provider conversation and configuration root. An idle interactive process still owns its conversation. A missing registry entry, unreadable process listing, unknown provider version or inaccessible start identity cannot establish exclusive use.

Before any hand-back action, check old attempt/tool release, same-conversation terminal ownership, current transcript and existing launch restrictions. A live terminal owner yields `terminal_in_use`; ambiguous observations yield `ownership_unknown`, with no launch or completion acceptance. Recheck at the final launch/accept boundary, not only when rendering the page. Copying is a read and does not acquire ownership or start Claude.

**Exclusive acquisition is a blocking interface contract, not a proved implementation.** The ownership boundary must return either `{ acquired, target, ownerGeneration, evidence }` retained through dispatch/acceptance, `{ in_use, observedAt }`, or `{ unknown, reason, observedAt }`. It must prevent a terminal starting between the check and Kiln's first model/tool work from becoming a competing writer. A Kiln-only mutex and two registry scans do not meet that contract: the measured provider allows concurrent resumes. Q1 must establish an enforceable acquisition mechanism compatible with the PRD's ordinary terminal command before this path can be implemented as available. Do not silently install global/workspace hooks or replace the terminal command to hide that unresolved choice.

Once release is proved, show the actual cwd and platform-correct quoted `cd <folder> && claude --resume <provider-session-id>`, plus existing recovery instructions. Copy does not launch. With unavailable history, display existing recovery guidance and no enabled same-conversation copy/resume promise.

### Activity-specific evaluate, then act

Extend the handoff target to activity and attempt identity for takeover/recovery, while retaining existing ordinary phase endpoint compatibility. Audits keep assigned kind, activity UUID, round, continuation, report path and conversation. Never allocate a new round merely because a person took over.

| Intent | Fresh checks complete | Incomplete | Read/check error |
|---|---|---|---|
| Resume or direct reply | Stay held; show explicit already-complete advance choice; send nothing | Resume same conversation under ownership/launch checks; direct reply alone submits its text | Stay held; show error; old rows keep their old check time |
| Verify or explicit advance | Accept once, release only resolved takeover/message holds and follow normal next-work/deferred-pause rules | Stay held with fresh rows/time | Stay held with dated prior rows and retry |

A phase uses its applicable phase predicates. An audit uses assigned report validity, accepted report digest, relevant currentness, repository, workspace and retained delivery/activation checks. Expose **Audit evidence is current** as a failing predicate when currentness fails; do not leave **Audit result recorded** passing as though it proves currentness. Evaluate the assigned audit's valid routing outcome, including completion phases or test continuation; do not require every audit to say `passed` before accepting its legitimate next-work result. Acceptance and next-work selection still enforce the whole audit loop.

Evaluation must not mark activity Done, clear holds, start work or perform commits/merges/pushes. Report discovery may refresh observations, but only explicit acceptance may apply scheduling effects. Changed audit evidence is reconciled through the existing report/currentness contract; a changed report cannot reuse an old pass or bypass reassessment. Recheck after evaluation and before committing acceptance if owned state/material evidence changed. Incomplete work or dirty/unpushed files alone permits Resume under existing restrictions; Verify does not manufacture a pass.

Keep the existing advance-without-sending acknowledgement and browser draft preservation. Required uncertain-message acknowledgements and unsent-reply acknowledgement are independent. Direct reply to the stopped conversation remains a resume operation, never the live-send endpoint. A successful dispatch transfers ownership and resolves its holds only after the durable attempt/dispatch relation is saved; failed or uncertain dispatch preserves recovery and cannot trigger a second attempt. Separately requested deferred pause, billing/usage restrictions, workspace repairs, development obligations and audit invalidation survive hand-back.

Replaces in part: [Needs you handoff design](../kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md), §Manual Phase Recovery, §Local Interfaces, §Completion Evidence and Errors, §Reply and Agent Integration and §Needs you Layout (takeover phases/audits, ownership and uncertain-message recovery only); [completion audits design](../kiln-completion-audits/kiln-completion-audits-technical-design.md), §Recovery and Upgrade and §Progress and Detail Contract (manual takeover audit evaluate/accept and hold semantics; ordinary automatic recovery remains).

## Local Interfaces

Retain loopback binding, Host/Origin/token checks, no CORS and no-store responses. All payloads use strict action-specific validation and a 64 KiB transport cap. Text is data, never HTML or a shell expression. Read deadlines are 5 seconds; mutations return a durable receipt promptly rather than holding HTTP open for a checkpoint. Client timeout after submission queries the same instruction ID, never creates a replacement send.

| Route | Request and response |
|---|---|
| `POST /api/live/message` | `{ instructionId, target: LiveTarget, text }` → `202 { ok: true, receipt }` after durable acceptance; write/consumption evolve independently. |
| `POST /api/live/take-over` | `{ instructionId, target }` → `202 { ok: true, receipt, takeover }`; acceptance holds progression, never asserts terminal readiness. |
| `GET /api/live/instructions/:instructionId` | Receipt scoped to this execution, including exact message, all evidence states and human acknowledgement. |
| `GET /api/live/messages?sessionId=…&before=…` | Newest 50 receipts, bounded opaque backwards cursor; historical read never exposes live actions. Individual text stays retrievable in full. |
| `POST /api/live/reconcile` | `{ instructionId, target }` retries only release/history/ownership observations under an existing hold; no send, signal or launch. |
| `POST /api/live/message-review` | `{ instructionId, target, receiptIds }` acknowledges exact uncertain receipts. Returns updated receipts; leaves holds and progression unchanged. |
| `POST /api/resume` | Existing phase contract retained; takeover/recovery adds `{ instructionId, target: LiveTarget, note?, reviewedReceiptIds? }`; returns `resume_requested` or `already_complete`. |
| `POST /api/check-again` | Takeover/recovery adds `{ instructionId, target, intent: verify \| advance, reviewedReceiptIds?, withoutSendingReply? }`; returns `advanced` or `still_stopped`. |

A replayed instruction may return 200 with its original outcome. An accepted operation's subsequent provider failure is recorded in its receipt, not rewritten as a pre-admission refusal. The snapshot supplies current state independently; a delayed old receipt cannot overwrite a newer target.

Errors use `{ ok: false, code, reason, instructionId?, observedAt, remedy }`: `400 invalid_request`, `413 input_too_large`, `403 forbidden`, `404 receipt_not_found`, `409 stale_target | instruction_conflict | busy | input_unavailable | takeover_pending | terminal_in_use | message_review_required | unsent_reply_acknowledgement_required`, `503 ownership_unknown | checkpoint_unavailable | history_unavailable | check_unavailable | state_unavailable`. Admission failure before durable intent means no effect; an uncertain post-admission response identifies the receipt and retains the hold. Unknown target/state/schema always refuses, never defaults to current work.

### Snapshot and browser

Add `liveControl` with target, activity label/round/provider, observed time, input state/reason, action availability, latest receipt summaries/unresolved IDs, takeover progress/reason, terminal readiness/observation, and independently requested deferred pause. Full texts/history are paged rather than copied into every SSE update. Capability projection is provider-specific and cannot infer live safety from a historical schema upgrade or the presence of a writable input pipe. Preserve the normal phase/activity/session facts. Disconnected views label last-known observation times and disable all mutations.

The running overview links **Control live session** to the current session. Detail order is output, **Message Claude**, **When should Kiln pause?**, then progress/session facts. Both pause choices remain visible together: **Take over this session — At the next safe stopping point**, and **Let {actual activity} finish first — After the whole phase/audit**. Use all timing/consequence text from AC-LIVE-03 and the approved mockup. Narrow layout preserves composer, takeover, deferred-pause order.

Use the exact requested/completed wording in AC-LIVE-04 across overview/detail/Needs you/bot status. Cancellation is **Cancel end-of-phase pause** or **Cancel end-of-audit pause**, only clears that request and never resumes work. The reached boundary identifies the completed activity and offers starting the named next eligible activity, not resuming the finished conversation.

Store unsent live drafts in page memory keyed by exact attempt above route/screen lifetime. Reconnect, output navigation and input loss preserve them; a successor never inherits them. Keep a submitted copy until receipt recovery settles. Announce async receipts/pauses accessibly; retain keyboard focus sensibly and label disabled reasons beside controls. Historical sessions, ordinary Needs you, usage waits and between-activity states retain state-specific controls. Codex/final-delivery views explain Claude-only live availability while keeping existing controls.

## Bot Extension

When both capabilities are installed, add `message` and `take-over` to the bot command contract/help and capability features. Both accept `<PRD-path>`, required `--only-if-status-matches` and `--command-id`. Message accepts exactly one of `--message-file` or `--message-from-stdin`; transport bounds, authentication, target resolution and retry lookup follow the bot design. Preserve exact live text rather than applying `reply` normalization.

`POST /api/control/v1/commands` accepts actions `message` and `take_over`, using the same live instruction ID/effects and retained PRD-scoped deduplication lookup, including non-UUID command IDs and retries after execution replacement. Status tokens bind the exact activity/conversation/attempt and material control revision; ordinary output does not stale them. Status exposes the same read/submitted/uncertain distinction, independently requested deferred pause, checkpoint progress and readiness. JSON uses the bot version/exit envelope; text expresses identical facts. Accepted is not delivered, resumed or advanced.

Bot `resume` and `verify-and-advance` accept repeatable `--message-reviewed <receipt-id>` and atomically acknowledge those exact receipts before evaluating hand-back; acknowledgement by itself cannot clear the hold. Existing `--without-sending-reply` remains separate. `handoff` returns commands only with current readiness evidence, never starts the terminal. `reply`, `request-pause`, `cancel-pause` and `handoff` keep their distinct meanings. Help includes timing examples and explains receipt lookup after uncertainty.

Replaces in part: [bot design](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md), §Scope and concurrency, §Command grammar, §Status, Conversations and Handoff, and §Manual phase outcomes (add live actions and explicit takeover-audit/message-review recovery). The dependency is drafted/reviewed, not yet jointly refined; reconcile its journal/attempt contracts during joint refinement, not by building a parallel framework here.

## Evolution, Limits and Delivery

Bump private state to the next available schema after concurrent changes are integrated; do not reserve an integer here. Migrate under exclusive controller ownership, preserving source bytes and stable historical identities. Existing attempts lacking a gate retain `input_lost`/capability-unavailable status rather than invented support. Unknown/newer schemas refuse mutations; rollback requires a compatible reader, never removal of holds or lowering schema numbers. Capability changes are additive; unknown states/actions are unavailable to older clients.

Receipts/evidence stay with the execution for its history lifetime, including after completion; the PRD-level lookup retains references to prior executions for that same lifetime. No automatic history deletion is introduced. Any later execution-history deletion must remove its sidecars and corresponding lookup entries together only after active/uncertain ownership is reconciled; provider-owned history is not deleted. Text stays in owner-only records, excluded from ordinary logs. Public diagnostics carry IDs, observation times and concrete error codes; full input appears only in authorized receipt/output views. Correction is new evidence or person acknowledgement, never rewriting submitted text or replaying delivery.

The first message ceiling is the provider's 64-entry consumption-UUID list, bounded by the 32-unsettled-input admission limit and exposed in action availability. Other ceilings are private disk/write capacity, bounded reconciliation time and the provider's ability to account for its tools. Disk failure refuses new effects and retains uncertainty; a read deadline returns unknown without releasing ownership. Keep 50-receipt pages and bounded reads; no retention TTL or silent pruning. Future provider parity can add an adapter and correlation evidence version without rekeying activity/session/message history; no generic remote-control platform is introduced now.

Deliver provider/engine/storage/API/browser changes together in the existing package after proof gates pass. Bot commands can follow independently through its existing framework. Incremental internal work can establish provider proof, durable engine/recovery contracts, then UI/API and bot integration, but none is a declared product phase here. Earlier-design back-pointers are added only when implementation makes these replacements true.

## Evidence and Verification Gates

Design probes used Claude Code **2.1.311**, Sonnet 5.5 and local macOS disposable directories. The [investigation](kiln-live-session-control-investigation.md#technical-design-feasibility-probes) records exact observed behavior, negative results and retained evidence digests. Anthropic's [hook contract](https://code.claude.com/docs/en/hooks#posttoolbatch) and installed Agent SDK 0.3.310 types support the chosen boundary; actual CLI behavior remains the release proof. macOS is the repository's natively validated platform; Linux/Windows remain best effort under the README, not implicitly certified by these probes. On any runtime where safety cannot be established, controls explain unavailability and preserve the hold.

| Boundary / criteria | Evidence owed before implementation readiness or release |
|---|---|
| Literal messages and lifecycle — AC-MSG-01–04 | Real CLI: literal slash-command/file-mention handling (the existing prose-only probes do not prove this), turn-start instruction preservation under Q4, bounded write backpressure and late callbacks, the 32-unsettled-input limit through coalescing and multiple turns, UUID/whitespace retention, coalesced messages, text/tool/result boundaries, near-exit submission, pause-versus-write, pipe failure and controller restart. Kill the disposable supervisor at each journal/write/evidence boundary; no duplicate send or successor delivery. Deterministic verified event fixtures supplement these real tests. |
| Safe yield — AC-TAKE-01/02/05 | Foreground, provider background and queued tool denial probes passed narrowly. Q2 adds cross-process admission versus hold races and helper crash recovery, subordinate agents, genuinely concurrent tools, detached descendants, failed/stalled calls, hook failure and restarted controller. Prove no post-hold substantive operation begins and no in-flight work is cancelled; unfinished work must remain. |
| Exclusive terminal return — AC-TAKE-03/04, AC-BACK-01/02 | Q1 must prove enforceable ownership acquisition: already-open interactive resume, terminal starting during hand-back, PID reuse, absent/corrupt registry, wrong config root and unreadable process identity. Real terminal retained checkpoint history and its live identity were observed; concurrent resume exclusion failed. |
| Durable engine and Git — AC-MSG-03/05, AC-TAKE-01/04, AC-BACK-02–04 | Disposable real Git repositories/origins: phase, delivery audit and test audit takeover/return; accepted hold versus completion/delivery/usage/restart; write-failure replay; changed reports/currentness/requirements, legitimate audit continuation/repair, dirty work Resume, missing history and stale targets. Actual assembled engine proof belongs to implementation; no prototype claims this exists. |
| HTTP and bot — AC-LIVE-02, AC-BOT-01/02 | Real server plus built CLI: auth/target/limit errors, two-client races, non-UUID command IDs and same-ID retry after restart/execution replacement; exact text file/stdin equality; uncertainty/acknowledgement/explicit return; capabilities absent on old controller; no duplicate instruction framework. |
| Browser — AC-LIVE-01–04, AC-MSG-01/02/05, AC-BACK-01/03 | Built Svelte view at desktop/narrow widths: every mockup state, correct output/composer/paired-pause order, identity, historical exclusion, pending/disconnected disables, draft retention, separate cancellation, uncertain receipts, explicit complete choice, point-in-time check/error facts. |
| Compatibility | Real existing full verification before implementation commit: ordinary phase/audit recovery, Codex/final delivery, account/billing, workspace, deferred pause, audit invalidation and development obligations. No product suite is claimed for this document-only stage. |

## Acceptance Criteria Coverage

| Criteria | Owning sections |
|---|---|
| AC-LIVE-01, AC-LIVE-02, AC-LIVE-03, AC-LIVE-04 | Snapshot and browser; Identity and serialization; Bot Extension |
| AC-MSG-01, AC-MSG-02 | Literal input and admission; Receipts and correlation |
| AC-MSG-03, AC-MSG-04 | Durable records and ordering; Message Delivery and Attempt Settlement |
| AC-MSG-05 | Uncertainty recovery; Activity-specific evaluate, then act; Local Interfaces |
| AC-TAKE-01, AC-TAKE-02, AC-TAKE-05 | Safe Checkpoint and Release; Durable Authority; proof Q2 |
| AC-TAKE-03, AC-TAKE-04 | Terminal Ownership and Hand-back; serialized targets; proof Q1 |
| AC-BACK-01, AC-BACK-02, AC-BACK-03, AC-BACK-04 | Activity-specific evaluate, then act; Uncertainty recovery; Snapshot and browser |
| AC-BOT-01, AC-BOT-02 | Bot Extension; shared Local Interfaces and receipt semantics |

## Open Questions

**Q1 — Enforceable terminal ownership (blocks implementation readiness).** What provider-supported or compatible local mechanism can atomically acquire this conversation for Kiln while refusing a concurrently open/starting ordinary `claude --resume` terminal? The real CLI permits two same-conversation owners; registry/start-time checks detect an existing owner but do not close the launch race. Prove the acquisition contract without changing the approved command/flow. If it requires persistent workspace/global hooks or a different command, return that concrete scope/UX decision to the PRD owner rather than pretending detection is exclusion.

**Q2 — Complete operation accounting and gate coverage (blocks implementation readiness).** Does the selected runtime apply the pre-tool gate to every nested/background agent and preserve ongoing operations when the parent yields, including failed tools, parallel calls and detached/reparented processes? Establish identity/completion evidence, failure-blocking behavior and the cross-process atomic admission primitive on the supported release profile, including a helper crash after durable admission but before its response. The Bash proof is sufficient for feasibility, not the full contract. Unknown coverage remains held/unavailable; it cannot be released by timeout.

**Q3 — Dependency integration (joint refinement check).** Reconcile the bot design's final journal/attempt schema with this standalone live receipt boundary after its joint refinement; preserve one instruction identity and one send. Browser delivery must not depend on bot discovery/help implementation. SCOPE-001 remains the existing pending business assumption; these technical questions do not add business assumptions.

**Q4 — Literal input without lost instruction context (blocks implementation readiness for messaging).** Which supported per-message mechanism prevents slash/@ expansion while retaining applicable turn-start instructions and tool/skill context? SDK 0.3.310 documents that `client_composed: true` currently skips the whole turn-start attachment pass. Prove ordinary versus literal input with a fixture-local nested instruction and slash/file/resource markers, including a no-tool response; a later tool callback cannot repair a response already generated without required context. Preserve the PRD's literal text and existing rules rather than inventing prompt rewriting.
