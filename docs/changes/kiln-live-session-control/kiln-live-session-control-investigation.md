# Live session control — runtime findings and design proof obligations

**Initial check:** 2026-10-26, against Kiln `8a3c12a` in the shared checkout; joint-refinement evidence is dated 2026-10-27 UTC below. These are requirements-research findings, not evidence that the proposed Kiln controls exist.

## Answers to the three requested unknowns

| Question | Finding | Evidence |
|---|---|---|
| Is a message sent mid-turn read immediately or only after the turn ends? | Neither is a universal rule. During a foreground tool, it affected the next model response before the first overall result. During streamed text, it waited until the initial response/result and produced a second result. Neither send interrupted the current operation. | Claude Code 2.1.307 and 2.1.311, Sonnet 5.5; timelines below. Anthropic's [streaming input documentation](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) describes sequential queued messages, but does not guarantee this exact processing boundary for every runtime state. |
| Does Kiln leave stdin open until the run's result? | Yes. The opening user message uses `stdin.write`; normal stdin closure happens on **every `result` event**, while interrupt sends a control request then closes stdin immediately. There is no message-send method in the current session control interface. | [`claude-session.ts`](../../../src/session/claude-session.ts), `runSessionProcess`, `SessionControl`, result handling. |
| Can interrupt then resume work while the supervisor remains alive, without two processes on the conversation? | Yes for the underlying Claude protocol: the probe's supervisor remained alive, sent interrupt, awaited child closure, then launched `claude -p --resume` with the same ID. It recalled the earlier marker. A later interactive `claude --resume` opened the same transcript after the headless resume had exited. The current **Kiln engine** has no browser takeover hold; introducing and proving that hold is implementation work, not a measured result of this probe. | Real interrupt/resume timeline and interactive check below; existing [`stopLiveProcess`](../../../src/engine/engine.ts) and [original proof gates](../../design/kiln-proof-gates-1-and-2-results.md). |

## Real disposable runtime probes

All commands ran in a temporary directory outside the product checkout. Claude had only Bash available for the initial probes, no MCP servers, and instructions to run a short sleep and print markers without inspecting/editing repositories, invoking skills or spawning agents. Launch used Kiln's stream-json/session-id/model/output/auto-permission/partial-message flags, with those additional tool restrictions. The supervisor recorded event-arrival times. No live Kiln execution was messaged or stopped.

### Message during a foreground tool

| Elapsed | Observed event |
|---|---|
| 2.245 s | Claude starts a foreground `sleep 12` followed by printing `BATCH_FINISHED`; the opening instruction also requested a later `SECOND_STEP`. |
| 4.747 s | Supervisor writes another `type: user` line: after the sleep, omit SECOND_STEP and respond `MESSAGE_SEEN ORCHID-731`. |
| 15.754 s | Tool returns BATCH_FINISHED with `interrupted: false`. |
| 18.349 s | Claude responds MESSAGE_SEEN ORCHID-731; no SECOND_STEP tool was invoked. |
| 18.366 s | First overall result arrives. |
| 18.604 s | Process exits 0 after the supervisor closes stdin on that result, as Kiln does. |

This proves a useful mid-run steering boundary, not model compliance with every future instruction, instant delivery during generation, or an exactly-once acknowledgement contract. A writable pipe alone is not proof Claude read a message.

### Message during streamed text

An additional valid probe on CLI 2.1.311 asked for a long numbered response, then sent “Stop the number list. Say MESSAGE_SEEN_TEXT and stop” after text streaming began. The send occurred at 4.867 s; the original response/result finished at 8.769 s; a second response/result containing MESSAGE_SEEN_TEXT arrived at 10.732 s; process closure followed at 11.101 s. The supervisor closed stdin on the first result, matching Kiln, but this already-read message was still processed. Thus closing stdin does not necessarily discard a queued message; it also does not prove that every result/write race is safe. Kiln must account for both results and the eventual process exit rather than assume the first result is the only turn.

The first attempt at this supplemental probe accidentally retained the short tool prompt and sent only after its result; it was not a valid mid-text timing test and was replaced by the long-output probe above.

### Interrupt, release, headless resume, interactive resume

| Elapsed | Observed event |
|---|---|
| 2.180 s | Foreground Bash sleep starts. |
| 4.681 s | Supervisor writes Kiln's interrupt control request and closes stdin. |
| 4.688 s | Successful control response. |
| 4.698–4.701 s | Tool interruption evidence, interruption user event and `error_during_execution` result. The normal batch-complete marker is absent. |
| 5.203 s | Original process closes, exit 1. |
| 5.204 s | Still-running supervisor starts headless resume of the same saved conversation. |
| 10.380 s | Resumed Claude responds RESUMED ORCHID-731. |
| 10.946 s | Resumed process closes, exit 0. |

Interactive `claude --resume` was then opened in that folder, with tools disabled for the proof. The initial folder-trust prompt appeared; after trusting this disposable folder, the screen showed the original instruction, interrupted tool and resumed marker. `/exit` closed the interactive session, exit 0. No two conversation processes overlapped. Original probes reported CLI 2.1.307; the interactive CLI announced an installed update, and a subsequent version check reported 2.1.311. Do not treat this as a single-version cross-platform certification.

## Existing boundaries that shape the PRD

- **Restart loses the input pipe.** `Engine.stopLiveProcess` checks recorded PID/start time and stops a left-over process before another session touches its history. On macOS/Linux it uses SIGINT to the process group; the original proof gate measured resumability. This session did not rerun restart/SIGINT or Windows proofs. Restart cannot reconstruct a writable connection to the old process.
- **A pause is not a finished batch.** Current interrupt cancels a tool. The ordered interrupt/resume probe preserved the conversation without overlapping its own attempts; it did not prove provider-wide exclusive ownership, atomicity or rollback of external work. The PRD requires a safe completed-operation checkpoint, so the existing interrupt alone is insufficient. The checkpoint/yield probes below establish provider feasibility; assembled safe release remains implementation verification.
- **The handoff flow currently applies to phases.** The handoff PRD explicitly excludes audit/final-delivery redesign. `Engine.resume` and `checkAgain` route phase recovery separately; ordinary audit recovery still uses dedicated completion checking. The new PRD extends the same UI/intention split to deliberately taken-over audits rather than inventing another return page.
- **Audit checks differ from phase checks.** `auditDoneCheck` reconciles the assigned report and accepted result/currentness, repository state, workspace evidence and applicable delivery/activation checks. It does not inspect a phase Closed line as an audit-completion substitute.
- **Scope source.** Doug named the three activities, the Claude input pipe and the exact `claude --resume` command. SCOPE-001 retains the business choice to deliver Claude live controls first; these runtime facts do not establish Codex parity.
- **The bot framework is refined but unimplemented.** Its PRD and technical design supply PRD-path targeting, status-match guards, durable command IDs/receipts, plain-text/JSON output, reply/resume/verify/handoff and deferred pause. Two new commands can share those capabilities; implementing their infrastructure first would not be cheap. Therefore the browser work does not depend on bot control, and the bot extension depends on both deliveries. No earlier PRD is marked superseded before this change is built.

## Design decisions and remaining implementation proof

Joint refinement answered the four mechanism questions in the technical design: ordinary-terminal admission (Q1), tracked-operation checkpoint/release (Q2), shared bot journal authority (Q3) and literal input with fresh turn-start context (Q4). The measured provider boundaries and their limits appear below. Product implementation still owes:

1. Prove the assembled input ledger and profile gate across multiple messages/results, text/tool/result boundaries, near-exit submission, write failure, pause and controller restart. Preserve unresolved messages without replay or advancement.
2. Prove durable takeover holds against completion, automatic recovery and delivery through restart; exercise per-context admission/yield and retained tracked process/task reconciliation. Uncertainty never becomes terminal readiness or forced cancellation.
3. Prove final-boundary ordinary-terminal discovery/refusal within controller-serialized hand-back, including ambiguous registry/process identity. Independent direct launches are outside Kiln’s action serialization; no provider-wide acquisition primitive is claimed.
4. Prove actual phase, delivery-audit and test-audit hand-back, changed/current completion evidence, already-complete work, deferred pause and missing history. Validate configured release profiles, including literal-input expansion syntax they actually support. Existing report/verification contracts remain authoritative.

These are implementation verification obligations, not additional business assumptions or claims that product controls exist.

## Requirements and mockup review

One independent deliverable-review round inspected all original 12 mockup states at 1280px and a phase hand-back variant. Its two findings were corrected: preserve Doug's safe-checkpoint requirement, and give uncertain delivery an explicit recovery path. The corrections and new uncertain-message hand-back state were inspected in a bounded follow-up; its hold-release clarification is incorporated in AC-MSG-05. Acknowledgement by itself never resumes or advances work.

Browser checks found no page-script errors or horizontal overflow in the original state set. Interaction checks exercised send, pause/readiness, incomplete verification, preserved unsent reply, phase versus audit check rows, resume, and uncertain receipt through terminal-review acknowledgement to explicit resume. Markdown links, stable criterion IDs and diff checks pass. These validate documents and mockups, not a product implementation; no product test suite was required for this documents-only change.

## Technical design feasibility probes

**Checked:** 2026-10-27 UTC, initial design baseline `0e0496a`; macOS, Claude Code 2.1.311, Sonnet 5.5, installed Agent SDK 0.3.310. Initial disposable conversations used short local Bash sleep/marker commands or no tools, with no MCP servers, skills or delegated agents. Joint-refinement probes below add fixture-local agents, hooks, skill listings and an MCP resource server as identified per case. Interactive inspection used the saved foreground conversation with tools disabled. No product files, live Kiln execution or shared work were controlled. These are provider feasibility probes, not assembled Kiln acceptance tests.

### Checkpoint gate

The [Anthropic hook reference](https://code.claude.com/docs/en/hooks#posttoolbatch) documents a callback after all calls in a tool batch resolve and before the next model request. Its stop response preserves a reason in conversation history. The [failure-blocking contract](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails) separately governs failed gate helpers. Installed SDK types distinguish per-tool structured output from batch model-facing output; they are not interchangeable task/process evidence.

| Probe | Measured timeline and result |
|---|---|
| Foreground operation then a second operation | First Bash started at 2.830 s; pause latch at 4.039 s; first result at 15.120 s with `interrupted:false`; `PostToolBatch` stop produced `terminal_reason:hook_stopped`; process exited 0 at 15.689 s. First marker exists; second marker does not. Work remained unfinished. |
| Background operation then further work | Background start at 2.787 s; latch at 3.993 s; hook-stopped result at 5.246 s, while work still ran. Background completion arrived at 11.060 s, followed by another model result at 13.708 s and process exit 0 at 14.335 s. First marker exists; subsequent markers do not. Closing stdin after the first result did not cancel this short background task, but first-result receipt was not readiness. |
| Negative gate test: two calls in one assistant response | CLI serialized the two Bash calls. Returning only `continue:false` from the second `PreToolUse` still let that call execute. Both first and second markers appeared; third did not. Therefore a generic stop flag cannot enforce no new tool admission. This is not a successful simultaneous-tool proof. |
| Explicit denial gate | Same multi-call shape, but `PreToolUse` returned `permissionDecision:deny` while held, and `PostToolBatch` returned `continue:false`. Pause at 6.051 s; first call finished normally; second returned the hook denial; process exited 0 at 13.594 s. First marker exists; second and third do not. This proves a queued next tool can be refused without cancelling the admitted call. |

The hooks were supplied through per-process CLI settings. No global or project configuration was modified to install them. These initial Bash probes establish the narrow feasibility above; the following Q2 probes measure subordinate-agent coverage, parallel reads, failed tools, helper crashes and local admission ordering. Arbitrary MCP/remote asynchronous effects and complete descendant accounting remain unproved.

### Joint refinement: checkpoint coverage and operation accounting (Q2)

**Checked:** 2026-10-27 UTC; macOS, Claude Code 2.1.311, Sonnet 5.5. Six disposable cases used per-launch exec-form hooks with `onFailure:block`, `PreToolUse` denial while held and per-context `PostToolBatch` yield. Parent/child tool, agent and task identities were captured with raw hook/provider events. No product files, shared execution or actual workspace/global hook settings were changed.

| Case | Measured result |
|---|---|
| Foreground Agent with mandatory unfinished work | The agent was explicitly required to execute two separate Bash operations; the parent also had a later operation. Pause at 12.760 s occurred during the first seven-second sleep. Its `PostToolUse` at 19.797 s reported `interrupted:false`; the subagent's own `PostToolBatch` followed at 19.836 s. `first.txt` existed; `second.txt` and `parent-more.txt` did not. The Agent result carried matching `agentId`, `status:completed` and `handback:withheld`; CLI exit 0 followed at 21.873 s. The delegated task remained unfinished. |
| Background Agent | The first main result at 4.990 s preceded the nested Bash completion. Its own completed-operation hook yielded; correlated task completion arrived at 11.799 s with `handback:withheld`, without `SubagentStop`. A parent attempt to start more Bash was explicitly denied. CLI exit 0 was at 16.753 s; second/parent-work markers were absent. Neither the first result nor an `async_launched` Agent result established release. |
| Overlapping Read calls | Two `PreToolUse` hooks overlapped: the second began before the first hook's deliberate three-second delay ended. Both were admitted before the 2.871 s pause and completed normally; the shared `PostToolBatch` yielded at 5.842 s. No subsequent Bash marker appeared. This proves overlapping hook admission for these reads, not every possible tool combination. |
| Failed Bash | The admitted seven-second operation wrote its failure marker and exited 7. `PostToolUseFailure` reported `is_interrupt:false` at 10.671 s, then `PostToolBatch` yielded. Its second operation did not run; CLI exited 0 at 11.102 s. A failed operation still supplied terminal evidence without cancellation. |
| Helper crash after durable admission | The `PreToolUse` helper fsynced its admission file, then killed itself before replying. `onFailure:block` prevented Bash execution: its correlated tool result carried `non_execution_kind:permission-rule`, the intended side-effect marker was absent, and the CLI exited 0. Durable admission alone was not evidence the operation began. |
| Detached descendant | An admitted Bash invoked a fixture Python parent that spawned a new-session child with closed standard streams. Bash returned normally, the hook yielded and the CLI exited 0 at 6.673 s. The unregistered child still wrote `detached-done.txt` at 15.217 s. Tool completion, known provider task settlement and CLI exit were insufficient to establish all effects had ended. |

The foreground and background results bind the completed delegated operation to its original agent/task identity. A terminal Agent/task result describes execution settlement; `handback:withheld` and missing remaining markers preserve unfinished work rather than proving activity completion. `SubagentStop` was absent on the hook-stopped paths and cannot be the required settlement signal. Initial foreground fixtures whose task wording did not reliably retain the second operation were superseded by the explicitly mandatory two-operation fixture reported above.

A separate local admission proof raced **31** processes through one atomic-`mkdir` critical section. The hold was journal sequence **30**: 29 admissions preceded it and the one later admission was denied. A helper then died by SIGKILL after recording admission and before responding; a competing hold returned `LOCK_UNAVAILABLE` rather than stealing the lock. Recovery checked the recorded owner PID against the known dead child, then removed the lock and admitted the hold. This proves local process-death ordering, not power-loss durability or assembled Kiln recovery. The fixture fsynced its owner file and root directory but did not separately fsync the owner file's containing lock directory; the design requires all affected directory entries to be durable.

A native macOS `kqueue` probe observed a `NOTE_FORK` notification whose `data` was zero, without the child PID. Requesting `NOTE_TRACK` returned **ENOTSUP / Errno 45**, including in the unsandboxed repeat. A retained 1.4-second native repeat independently reproduced both results and let its disposable parent/child processes exit normally. This tested path therefore does not supply complete descendant identities. It does not prove every OS/provider accounting approach impossible. No remote asynchronous service was exercised; that completion boundary remains unproved.

**Disposition:** Q2 is resolved as a design decision at 97% confidence: use per-context pre-tool admission plus post-batch yield, identity-based ordinary/failure/non-execution settlement, and atomic cross-process admission with exact-owner-death recovery. The required accounting boundary is the attempt, admitted provider operations/tasks and controller-tracked process identities, matching AC-TAKE-02/04. Known unresolved admissions, tasks or process identities block readiness; a timeout never releases them. The detached-child result limits claims of universal containment, which the PRD does not require: a completed launcher's arbitrary external effects are not automatically provider-tracked work. A known tracked child still requires terminal evidence even after detach/reparenting. No approved criterion or product flow is changed. Assembled controller durability/restart remains implementation validation.

Reproduce the six provider cases and local admission proof with authenticated Claude, network and process-list access:

```sh
node /private/tmp/livectl-coverage-proof/probe.mjs foreground-agent
node /private/tmp/livectl-coverage-proof/probe.mjs background-agent
node /private/tmp/livectl-coverage-proof/probe.mjs parallel-read
node /private/tmp/livectl-coverage-proof/probe.mjs failed-tool
node /private/tmp/livectl-coverage-proof/probe.mjs crash
node /private/tmp/livectl-coverage-proof/probe.mjs detached
q2_admission_root="$(mktemp -d /private/tmp/livectl-admission-repeat.XXXXXX)"
sed "s|const root='/private/tmp/livectl-coverage-proof/admission'|const root='$q2_admission_root'|" /private/tmp/livectl-coverage-proof/admission-proof.mjs > "$q2_admission_root/admission-proof.mjs"
node "$q2_admission_root/admission-proof.mjs"
python3 /private/tmp/livectl-coverage-proof/kqueue-proof.py
```

The admission commands preserve the retained journal and repeat the same probe in a fresh temporary root. Each provider invocation creates a new fixture directory and UUID. The retained proof root is `/private/tmp/livectl-coverage-proof`; each provider directory contains exact settings/input logic, hooks, events and `summary.json`. These are temporary machine-local artifacts, not portable release dependencies.

| Evidence file relative to proof root | SHA-256 |
|---|---|
| `foreground-agent-1793068859137/events.jsonl` | `522ef4d38f80fe80d8d9974254806a6f49a4ddca2c558a2c8c2ca87cef1ae0a6` |
| `foreground-agent-1793068859137/hooks.jsonl` | `1524c9d9a45afb9dbd730bc5c6fcc76f8fe144066c3ba6ed5da7bf3caecc0982` |
| `background-agent-1793068641222/events.jsonl` | `3e2651b233c5d778ee77a468b3178b6c7d3a33a2ef66a95124718a083a4028e6` |
| `parallel-read-1793068640055/hooks.jsonl` | `4ab239413052259764b6d4d0332e9d6244624770fae40bbd7be98937f743432a` |
| `failed-tool-1793068640242/hooks.jsonl` | `f896b48b9d2f42c1ed7b2182eb2f6870b847b1bf5cef472c25c0014f9252281a` |
| `crash-1793068641637/events.jsonl` | `611c397ed701cff013e84c02e1280309d6530e495f6cf7292ffb0eb8909c8b1b` |
| `detached-1793068640206/events.jsonl` | `472c860c81b9819d2a6538423239a331ef02a9b477b101ea6958306014d1f974` |
| `detached-completion-facts.json` | `4afac1f546024cbb97db17211763ce8860682f74ab7bb339323f1920beec88a5` |
| `admission/summary.json` | `286d16533797f983fb5896d551684e11a7077cd8db4edc6ed99ecae34573819c` |
| `admission/race-journal.json` | `cb2113a0f7ba0c771c13a5332e9e5d07bbf4e9f08a0954f681fdf3bbf2823eec` |
| `kqueue-tracking-unsandboxed.json` | `589aa95f7603c7c3b2ba5ee7ae1dd1d19573c27f06c0769da5af735633c9ca5a` |
| `kqueue-reproducible-repeat.json` | `164bb86ba8128345fc9e5b801d8230e6e039f160afe9bd063149e59f74df61d3` |

### Correlated messages and multiple results

A no-tool conversation streamed 120 numbered lines. At 2.137–2.138 s the supervisor wrote two additional inputs with distinct UUIDs; the first included leading spaces and a trailing newline. The first result at 6.346 s named only the opening UUID and reported `queued_turn_count:0`, despite the two later inputs. Their replay events arrived at 6.353 s and 8.057 s; the latter replay carried combined content under the last UUID. The second assistant/result at 8.113–8.143 s named **both** input UUIDs in `user_message_uuids` and answered both markers in order. Process exited 0 at 8.542 s after stdin was closed on that accounting.

Consequences: retain exact submitted bytes independently; allow one result to account for several UUIDs; do not use echoed-text equality, a single `user_message_uuid`, first result, or zero queue count as the settlement predicate. Replay alone establishes input acceptance, while a correlated assistant/result establishes model consumption. No message response proves compliance with requested external actions. Crash/write races and product progression holds still require real engine validation.

### Terminal identity and failed exclusivity assumption

The foreground saved conversation reopened interactively with its original instruction, completed first tool and `PostToolBatch` stop reason visible. Its provider registry entry identified PID 45667, provider session UUID, actual cwd, `entrypoint:cli`, start identity and `status:idle`. That idle process still owned the conversation. `/exit` returned 0 and removed the entry. Reading the entry can therefore detect this actual open terminal; status alone cannot grant hand-back.

A separate no-tool probe kept its first headless process open after a result, then launched another headless `--resume` against the same UUID. The second process completed `DUPLICATE_OWNER`, exit 0, before the first closed. The provider did **not** enforce exclusive ownership. A first run's supervisor had an empty-stderr reporting bug after the peer completed; the corrected probe repeated the overlap successfully and both owned processes exited. No probe process remained registered afterwards.

The registry is observed provider metadata, not a documented acquisition primitive. Its absence plus a PID check is not provider-wide atomic exclusion. The joint-refinement probes below establish the approved ordinary-terminal admission checks within Kiln’s controlled action boundary; they do not make that broader exclusion claim.

### Joint refinement: terminal ownership (Q1)

**Checked:** 2026-10-27 UTC; macOS, Claude Code 2.1.311, Sonnet 5.5, installed Agent SDK 0.3.310. Two new disposable probes tested whether the launch hook configuration supplies ownership to an ordinary resume, and what a persistent project guard actually enforces. No product files or actual workspace/global hook settings were changed. The provider wrote its normal fixture transcript/registry state; no user process was signalled.

| Probe | Measured result |
|---|---|
| Per-launch ownership hook and concurrent ordinary resume | The original guarded process returned `OWNER_MARKER` at 2.393 s and remained alive with stdin open. After its fixture hold was set, a peer resuming the same provider UUID without the launch `--settings` returned `PEER_WITHOUT_HOOK` at 3.797 s, then exited 0 at 4.222 s. An explicitly configured peer returned `OWNERSHIP_PROOF_REFUSAL` at 4.494 s with zero model API duration. The original process exited at 5.295 s. The helper worked, but its per-launch settings were not inherited by ordinary resume. |
| Two resumes with a fixture-local project guard | A `.claude/settings.json` guard used atomic `mkdir` per provider UUID, PID/start identity and owner-validated release. Concurrent peers reached `SessionStart`; the losing peer returned `continue:false` during the lock-record creation gap, but its `UserPromptSubmit` still fired. That prompt hook blocked it as `OWNERSHIP_IN_USE` at 2.322 s with zero model API duration. The winning peer returned `RACE_A` at 3.346 s. The refused peer's `SessionEnd` recorded `released:false`; the winner's lock still existed while that process remained alive. The winner exited 0 and released its own lock. |
| Project guard helper crash | Replacing the fixture helper with a deliberate exception did not prevent startup through `SessionStart`. `UserPromptSubmit` with `onFailure:block` blocked the request at 4.144 s, with zero model API duration. All probe CLI processes exited 0; the project ownership lock was absent after the owner exited. |

The [official SessionStart contract](https://code.claude.com/docs/en/hooks#sessionstart-decision-control) offers context, not blocking or decision control; exit code 2 only shows stderr. [Failure blocking](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails) applies the event's own exit-2 behavior. The observed `UserPromptSubmit` refusal is therefore evidence of cooperative model admission, not atomic process-start exclusion.

These probes do not establish retrofit into an already-open terminal without the guard, interactive idle-process refusal, other working directories/settings profiles, automatic/deferred turns, arbitrary direct launches, or competing transcript-writer exclusion. A persistent project guard is not a proved substitute for AC-TAKE-04's exclusive-use requirement. CLI help and SDK types exposed no compatible general local acquisition primitive in the inspected surface; that does not prove every provider mechanism impossible. The separate `--bg` path advertises copying an already-running conversation and the SDK names `session_held_by_background`, but this path was inspected only, not runtime-proved as a replacement for Kiln's stream-json process or existing-terminal acquisition.

#### Approved ordinary-terminal flow

Further disposable PTY probes used the exact approved `claude --resume <session-id>` command, without installing a guard. The fixture controller admission claim checked provider UUID, registry identity and actual PID/start identity. All fixture processes exited 0 through `/exit`; no user process was signalled.

| Case | Measured result |
|---|---|
| Existing ordinary terminal | Registry appeared 693 ms after spawn. An idle owner remained discoverable and was refused as `terminal_in_use`; `/exit` removed its entry. |
| Same conversation, different cwd | The same UUID resumed from another trusted folder. Registry cwd changed, but UUID/PID/start checks still found and refused it. Cwd equality is not an ownership key. |
| Pending terminal startup | Exact OS `--resume <uuid>` argv appeared at 25 ms, registry at 716 ms, input prompt at 1,172 ms. Query pending exact-resume argv as well as registry identities. |
| New Kiln-shaped headless process | Its registry entry appeared at 478 ms while stdin was empty, before the first prompt. Exclude only that exact dispatch PID/start identity when checking peer owners. |
| Reused/mismatched process identity | A deliberately stale fixture record naming a live PID with the wrong start identity remained `ownership_unknown`; it was not adopted or called released. |

**Disposition:** Q1 is resolved at 95% confidence for AC-TAKE-04’s browser/bot/automatic action boundary. Under one controller admission claim, refuse existing or pending same-conversation terminal ownership, retain unknown observations, and revalidate before dispatch/acceptance and the first prompt/effect. Preserve the instruction to exit the terminal first and the exact ordinary command. An independent direct CLI launch after Kiln admission is outside that serialization; the PRD does not require a universal provider acquisition primitive. The negative hook probes prevent claiming such exclusion or installing an unnecessary persistent guard. Assembled engine admission/restart/race validation remains implementation work.

Reproduce the approved-flow checks with `python3 /private/tmp/livectl-ownership-proof/approved-flow.py` and `python3 /private/tmp/livectl-ownership-proof/approved-startup.py`. `approved-flow.py` creates a fresh fixture UUID in already-trusted disposable directories; `approved-startup.py` samples the retained fixture UUID recorded in that script. Update that UUID to sample a newly created fixture after repeating the first probe. They are machine-local proofs, not release dependencies.

| Artifact under `/private/tmp/livectl-ownership-proof/` | SHA-256 |
|---|---|
| `approved-flow-1793069600337/observations.jsonl` | `b0710bbd25a361e20b975167cfa116bc6e2ce15abf3aa7993a1be6501422a44d` |
| `approved-flow-1793069600337/same-cwd-terminal-pty.raw` | `8be84a2ceb870175752c9d46e21fc43cddbd95ac2342c927fe684fdcc45c46fb` |
| `approved-flow-1793069600337/other-cwd-terminal-pty.raw` | `df0181e7cfc5904d84602083f840973e19ddffccc39bcbbfe26aaa051ecc7e1d` |
| `approved-flow-1793069600337/headless-events.jsonl` | `8b6c9c0166567ce6ae7e0f3b527d3e6e9f6e2019bdc8490d192e06fb93d9e78f` |
| `approved-startup-1793069682645/pty-chunk-timing.jsonl` | `ca27f59b76f2a806c8aa0887db2740edb61fce35c6a2f58d51766e7c05e4e65d` |
| `approved-startup-1793069682645/pty.raw` | `77b29c3b2a7d81478191adf53a89d36e7eb9d6916a077e1049066a74849cc90a` |

Reproduce with authenticated Claude, network and local process-list access:

```sh
node /private/tmp/livectl-ownership-proof/launch-hooks-resume.mjs
node /private/tmp/livectl-ownership-proof/project-guard.mjs
```

Each invocation creates a new fixture directory and UUID. The retained first run used `launch-hooks-1793068567334`, provider UUID `53fb6358-233b-425c-ba1f-a5c22b1e731f`; the project-guard run used `project-guard-1793068747508`, provider UUID `8369dd1d-32f5-4a9a-b50c-b29a41c87bf7`. The proof root is `/private/tmp/livectl-ownership-proof`; scripts, exact settings, hook inputs, stdout, stderr and `summary.jsonl` are temporary machine-local artifacts, not portable release dependencies. Official-source snapshots are `.firecrawl/hooks.md` and `.firecrawl/index.md` under that root.

| Evidence file relative to proof root | SHA-256 |
|---|---|
| `launch-hooks-1793068567334/ordinary-resume-events.jsonl` | `2822e1deffe9fd7723de050c07aee3d3be16b34dee0b4cbd09d4011a1b564c60` |
| `launch-hooks-1793068567334/explicit-hook-resume-events.jsonl` | `e13e01fbd08b92b742aebcbf80a962a9ebebf75ccd07f332c6c11709cffd1692` |
| `launch-hooks-1793068567334/hooks.jsonl` | `f3858e203b7b55e23550297c0294bd3bdd9855d4fb35fabebf346a442bb999e1` |
| `project-guard-1793068747508/hooks.jsonl` | `a873522d5a865f3b2266f9ee43441345ccaaf5775434719200f8bec8e42c2af5` |
| `project-guard-1793068747508/race-b-events.jsonl` | `15fe76b4b5525e7dcf86f488660036132a80f424c6515119f7a60bacd43342ba` |
| `project-guard-1793068747508/helper-crash-events.jsonl` | `a3a1e600fe45c03c01469ea51468578cac1883c021897dc54c9ef792ce6a3fe5` |

### Joint refinement: shared bot instruction authority (Q3)

**Checked:** 2026-10-27 UTC against the bot refinement/consolidation landed through `e2a0705` and review package `d881ecc`. The completed session marker records its worktree removed and a separate phase-planning successor; the shared checkout carries the finished design. This is document/code evidence, not a new runtime probe.

The bot design’s **Durable Controls and Retries** and **Durable Data and Evolution** sections define one execution-owned authoritative journal receipt per instruction, digest-partitioned storage, a rebuildable PRD-wide locator, effect-aware crash reconciliation and stable legacy attempt IDs derived from execution/session/run index. Its **Command grammar** preserves the existing stopped-reply outer-trimming policy; current `src/engine/engine.ts` trims before applying the 4,000-unit limit. The live-message policy intentionally preserves outer whitespace and measures before normalization.

**Disposition:** Q3 is resolved at 98% confidence. The live design extends that same journal with action-specific message/takeover evidence and effects. Browser and bot map to one instruction/receipt, and the later delivery adopts existing records without replay. Live consumption evidence remains stronger than the stopped-reply saved-input receipt. Legacy migration first proves execution ownership, preserving unknown/orphan records honestly. Browser delivery does not depend on bot discovery/CLI/help. Implementation must prove the shared authority and no-double-send contract across both installation orders; no such product implementation is claimed here.

### Joint refinement: literal input and fresh context (Q4)

**Checked:** 2026-10-27 UTC; macOS, Claude Code 2.1.311, Sonnet 5.5. Three-way disposable stream-json conversations compared ordinary input, native `text_not_typed:true` and `client_composed:true`. Each fixture had a root `CLAUDE.md` importing a nested instruction, a local skill with a unique listing marker, a slash command, a text file and a read-only stdio MCP resource server. Per-launch settings supplied a fixture-local `UserPromptSubmit` hook; no persistent user/workspace settings were installed. All nine turns in the final dynamic comparison completed, all CLI processes exited 0 and zero model tool calls occurred.

| Boundary | Measured result |
|---|---|
| Literal slash/file handling | Ordinary `/proof-command` input replay became command metadata and its `@marker.txt` content appeared in context. Both marked variants replayed the submitted message exactly and omitted file contents. A command marker also appeared in the skill listing, so response prose alone was not used as dispatch evidence. |
| Nested instructions and skill context | All variants retained the imported nested `CLAUDE.md` prefix and the fixture skill-listing marker in their no-tool responses. This is positive context evidence, not proof of blanket context loss under `client_composed`. |
| Fresh turn-start instruction | Before each input, the supervisor changed a fixture context file. `UserPromptSubmit` injected its new required random marker through `additionalContext`; the marker was absent from the submitted text. Every corresponding response included the fresh marker, including both later `text_not_typed` turns. No intervening tool callback supplied it. `check-dynamic.py` checks this correlation, exact replay, retained context and zero model tools. |
| Resource marker | The local MCP server connected and completed `resources/list`; no variant issued `resources/read`. A separate ordinary control with the SDK initialization handshake also did not read the resource. `@fixture:proof://resource` remained literal, but no empirical resource-suppression positive control was established. Release contracts must cover expansion syntax actually supported by their runtime/configured servers. |

The [public TypeScript SDK reference](https://platform.claude.com/docs/en/agent-sdk/typescript#sdkusermessage) exposes `client_composed`; installed SDK 0.3.310 warns that it skips the broader turn-start attachment pass. The native 2.1.311 wire schema additionally defines internal `text_not_typed`: literal text handling while the turn-start attachment pass continues. Its human origin remains separate. That narrower retained path, plus the real fresh-context comparison, supports the selected compatibility mechanism; the field is not represented as a public stable SDK promise.

**Disposition:** Q4 is resolved at 94% confidence. Use `text_not_typed:true` only on an explicitly validated CLI/configuration profile, initially 2.1.311/macOS, without a synthetic origin, prompt rewriting or persistent settings. Unproved profiles accept no live input while existing session execution retains its existing rules. Validate message identity, literal handling, fresh context and supported expansion behavior before enabling another profile. The lack of an ordinary MCP positive control limits the empirical claim; it does not create an extra provider feature or silently mark product integration complete. A nested-file edit that ordinary input did not reload was excluded as a dynamic-context positive control; the hook-added random marker supplies that proof instead.

Temporary artifacts are under `/private/tmp/livectl-literal-proof`. Reproduce the comparison with `node /private/tmp/livectl-literal-proof/dynamic-probe.mjs normal text_not_typed client_composed`, then run `python3 /private/tmp/livectl-literal-proof/check-dynamic.py`. `initialized-probe.mjs normal` reproduces the additional ordinary resource control. `inputs.jsonl`, `context-hook-calls.jsonl`, `events.jsonl` and per-case summaries retain fixture inputs and observations. The native schema excerpt is `native-text-not-typed-schema.txt`.

| Evidence file, relative to the artifact directory | SHA-256 |
|---|---|
| `dynamic-assertions.json` | `c61d7d921bba2e47ffab7b044b69144e3391dfe35e8afe51b2835a07ea42f898` |
| `dynamic-normal-1793069130887/events.jsonl` | `4e3fb4599a2992db771c0c53ba0242e96d7465920daeabf662bd10fa79bd9f73` |
| `dynamic-text_not_typed-1793069140562/events.jsonl` | `46db4dc357c998b1d44359fd78b95cb6ed26eb03972f01747d08570b8e95c69e` |
| `dynamic-client_composed-1793069154089/events.jsonl` | `4ef42d4bf1a0b258e0a7861ee664706281ce2d81221b4195aa5a446376f05afe` |
| `dynamic-probe.mjs` | `21f8629e8dc8bedb28f282179646a1d9be1f0ffc64eceaa7f74e846441b39e8c` |
| `context-hook.mjs` | `2fa4b23c763a45f4c65e3a48381d20a46ad9f69826ad11b3d4fa558115e2d577` |
| `native-text-not-typed-schema.txt` | `b77ad1bf29f216d48cbc0c804d400460194789a385f3f492583b3cf41361a6af` |

### Reproducibility and evidence limits

Temporary proof artifacts are under `/private/tmp/kiln-livectl-design-proof` on the design machine; they are not a release dependency or portable link. `probe.mjs` exercises the foreground/background/queued-call cases, `message-probe.mjs` writes UUID-tagged streamed inputs, and `ownership-probe.mjs` checks duplicate resume. Each writes raw events and exact fixture inputs. The following SHA-256 digests identify the retained event files (all fixture data, no credentials):

| Evidence file | SHA-256 |
|---|---|
| `foreground-1793066361389/events.jsonl` | `03be2a414053af48a6fef54ed0d89df59c471e757f5f38d28f00a6f48294bdb5` |
| `background-1793066391136/events.jsonl` | `52726ef1de9387f805007af37432a71ae99bf00b2136d09a740ba4d894fcff45` |
| `parallel-1793066679195/events.jsonl` (explicit denial) | `e744987c920f358a52be5b6b9a7be8a1e7aba47a70f6bc700d99c082c6e4b58f` |
| `messages-1793066439834/events.jsonl` | `eb3520f9f39051b21c9f436cd796fe4acba8ab3c50fa9cba1cb07c40631bb9ad` |
| `ownership-1793066595363/peer-events` | `679882ec27fdf16409f6d4e9b7f29f5f5173ced791492b3a61844c79e963f172` |

The existing repository README identifies macOS as natively validated and Linux/Windows as best effort. No Linux/Windows provider proof ran here. Actual phase/audit engine takeover, crash-safe receipts, delivery races and bot/browser integration remain implementation validation; the four design mechanism questions are answered, with their measured scope and remaining release checks stated above. Runtime evidence never marks an unchecked PRD criterion implemented.
