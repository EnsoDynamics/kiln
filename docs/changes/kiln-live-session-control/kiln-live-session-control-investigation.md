# Live session control — runtime findings and design proof obligations

**Checked:** 2026-10-26, against Kiln `8a3c12a` in the shared checkout. These are requirements-research findings, not evidence that the proposed Kiln controls exist.

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
- **A pause is not a finished batch.** Current interrupt cancels a tool. Preserved conversation and exclusive process ownership are established; atomicity or rollback of external work is not. The PRD requires a safe completed-operation checkpoint, so the existing interrupt alone is insufficient. A checkpoint/yield mechanism is a design proof obligation, not a product requirement to weaken.
- **The handoff flow currently applies to phases.** The handoff PRD explicitly excludes audit/final-delivery redesign. `Engine.resume` and `checkAgain` route phase recovery separately; ordinary audit recovery still uses dedicated completion checking. The new PRD extends the same UI/intention split to deliberately taken-over audits rather than inventing another return page.
- **Audit checks differ from phase checks.** `auditDoneCheck` reconciles the assigned report and accepted result/currentness, repository state, workspace evidence and applicable delivery/activation checks. It does not inspect a phase Closed line as an audit-completion substitute.
- **The bot framework is still a draft.** Its PRD already supplies PRD-path targeting, status-match guards, durable command IDs/receipts, plain-text/JSON output, reply/resume/verify/handoff and deferred pause. Two new commands can share those capabilities; implementing their infrastructure first would not be cheap. Therefore the browser work does not depend on bot control, and the bot extension depends on both deliveries. No earlier PRD is marked superseded before this change is built.

## Technical design must resolve before implementation

1. Prove message identity, provider receipt correlation and ordered accounting for multiple messages, including input arriving during model text, near a result, during pause and before disconnect/restart. Decide how the session's multiple results affect final completion; the current close-on-first-result behavior must not be assumed sufficient. Preserve unresolved messages without automatic replay or advancing to later work.
2. Prove durable takeover hold ordering against completion, automatic recovery, delivery actions and restart. Establish a safe checkpoint without cancelling an in-flight operation, then stop/reconcile existing process trees and prove no old writer remains before displaying a usable command. Distinguish confirmed clean release, forced termination and uncertain cleanup; uncertainty must not masquerade as ready.
3. Prove detection/refusal of a still-open terminal conversation before hand-back. The old recorded Kiln PID alone cannot identify a newer interactive process. A UI instruction to exit is necessary but not sufficient evidence of exclusive ownership.
4. Prove actual engine takeover and hand-back for a phase, delivery audit and test audit, including changed audit evidence, already-complete work, pending deferred pause and missing history. Repeat provider/platform boundary checks on the supported release versions. Keep the existing report/verification contracts authoritative.

These are technical questions, not additional business assumptions. The PRD states the required observable outcomes; this document records why those outcomes need proof.

## Requirements and mockup review

One independent deliverable-review round inspected all original 12 mockup states at 1280px and a phase hand-back variant. Its two findings were corrected: preserve Doug's safe-checkpoint requirement, and give uncertain delivery an explicit recovery path. The corrections and new uncertain-message hand-back state were inspected in a bounded follow-up; its hold-release clarification is incorporated in AC-MSG-05. Acknowledgement by itself never resumes or advances work.

Browser checks found no page-script errors or horizontal overflow in the original state set. Interaction checks exercised send, pause/readiness, incomplete verification, preserved unsent reply, phase versus audit check rows, resume, and uncertain receipt through terminal-review acknowledgement to explicit resume. Markdown links, stable criterion IDs and diff checks pass. These validate documents and mockups, not a product implementation; no product test suite was required for this documents-only change.

## Technical design feasibility probes

**Checked:** 2026-10-27 UTC, design baseline `0e0496a`; macOS, Claude Code 2.1.311, Sonnet 5.5, installed Agent SDK 0.3.310. Disposable conversations used only short local Bash sleep/marker commands or no tools, no MCP servers, skills or delegated agents. Interactive inspection used the same saved foreground conversation with tools disabled. No product files, live Kiln execution or shared work were controlled. These are provider feasibility probes, not assembled Kiln acceptance tests.

### Checkpoint gate

The [Anthropic hook reference](https://code.claude.com/docs/en/hooks#posttoolbatch) documents a callback after all calls in a tool batch resolve and before the next model request. Its stop response preserves a reason in conversation history. The [failure-blocking contract](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails) separately governs failed gate helpers. Installed SDK types distinguish per-tool structured output from batch model-facing output; they are not interchangeable task/process evidence.

| Probe | Measured timeline and result |
|---|---|
| Foreground operation then a second operation | First Bash started at 2.830 s; pause latch at 4.039 s; first result at 15.120 s with `interrupted:false`; `PostToolBatch` stop produced `terminal_reason:hook_stopped`; process exited 0 at 15.689 s. First marker exists; second marker does not. Work remained unfinished. |
| Background operation then further work | Background start at 2.787 s; latch at 3.993 s; hook-stopped result at 5.246 s, while work still ran. Background completion arrived at 11.060 s, followed by another model result at 13.708 s and process exit 0 at 14.335 s. First marker exists; subsequent markers do not. Closing stdin after the first result did not cancel this short background task, but first-result receipt was not readiness. |
| Negative gate test: two calls in one assistant response | CLI serialized the two Bash calls. Returning only `continue:false` from the second `PreToolUse` still let that call execute. Both first and second markers appeared; third did not. Therefore a generic stop flag cannot enforce no new tool admission. This is not a successful simultaneous-tool proof. |
| Explicit denial gate | Same multi-call shape, but `PreToolUse` returned `permissionDecision:deny` while held, and `PostToolBatch` returned `continue:false`. Pause at 6.051 s; first call finished normally; second returned the hook denial; process exited 0 at 13.594 s. First marker exists; second and third do not. This proves a queued next tool can be refused without cancelling the admitted call. |

The hooks were supplied through per-process CLI settings. No global or project configuration was modified to install them. These probes do not prove propagation into subagents, arbitrary MCP tasks, detached descendants, failure/timeouts, or restart-safe operation admission. Those are Q2 in the technical design, not inferred successes.

### Correlated messages and multiple results

A no-tool conversation streamed 120 numbered lines. At 2.137–2.138 s the supervisor wrote two additional inputs with distinct UUIDs; the first included leading spaces and a trailing newline. The first result at 6.346 s named only the opening UUID and reported `queued_turn_count:0`, despite the two later inputs. Their replay events arrived at 6.353 s and 8.057 s; the latter replay carried combined content under the last UUID. The second assistant/result at 8.113–8.143 s named **both** input UUIDs in `user_message_uuids` and answered both markers in order. Process exited 0 at 8.542 s after stdin was closed on that accounting.

Consequences: retain exact submitted bytes independently; allow one result to account for several UUIDs; do not use echoed-text equality, a single `user_message_uuid`, first result, or zero queue count as the settlement predicate. Replay alone establishes input acceptance, while a correlated assistant/result establishes model consumption. No message response proves compliance with requested external actions. Crash/write races and product progression holds still require real engine validation.

### Terminal identity and failed exclusivity assumption

The foreground saved conversation reopened interactively with its original instruction, completed first tool and `PostToolBatch` stop reason visible. Its provider registry entry identified PID 45667, provider session UUID, actual cwd, `entrypoint:cli`, start identity and `status:idle`. That idle process still owned the conversation. `/exit` returned 0 and removed the entry. Reading the entry can therefore detect this actual open terminal; status alone cannot grant hand-back.

A separate no-tool probe kept its first headless process open after a result, then launched another headless `--resume` against the same UUID. The second process completed `DUPLICATE_OWNER`, exit 0, before the first closed. The provider did **not** enforce exclusive ownership. A first run's supervisor had an empty-stderr reporting bug after the peer completed; the corrected probe repeated the overlap successfully and both owned processes exited. No probe process remained registered afterwards.

The registry is observed provider metadata, not a documented acquisition primitive. Its absence plus a PID check is not atomic exclusion. The technical design leaves Q1 open and blocks implementation readiness until a compatible enforceable ownership mechanism is proved. It does not weaken the PRD to “please exit first.”

### Reproducibility and evidence limits

Temporary proof artifacts are under `/private/tmp/kiln-livectl-design-proof` on the design machine; they are not a release dependency or portable link. `probe.mjs` exercises the foreground/background/queued-call cases, `message-probe.mjs` writes UUID-tagged streamed inputs, and `ownership-probe.mjs` checks duplicate resume. Each writes raw events and exact fixture inputs. The following SHA-256 digests identify the retained event files (all fixture data, no credentials):

| Evidence file | SHA-256 |
|---|---|
| `foreground-1793066361389/events.jsonl` | `03be2a414053af48a6fef54ed0d89df59c471e757f5f38d28f00a6f48294bdb5` |
| `background-1793066391136/events.jsonl` | `52726ef1de9387f805007af37432a71ae99bf00b2136d09a740ba4d894fcff45` |
| `parallel-1793066679195/events.jsonl` (explicit denial) | `e744987c920f358a52be5b6b9a7be8a1e7aba47a70f6bc700d99c082c6e4b58f` |
| `messages-1793066439834/events.jsonl` | `eb3520f9f39051b21c9f436cd796fe4acba8ab3c50fa9cba1cb07c40631bb9ad` |
| `ownership-1793066595363/peer-events` | `679882ec27fdf16409f6d4e9b7f29f5f5173ced791492b3a61844c79e963f172` |

The existing repository README identifies macOS as natively validated and Linux/Windows as best effort. No Linux/Windows provider proof ran here. Actual phase/audit engine takeover, crash-safe receipts, delivery races and bot/browser integration remain implementation validation after the design proof blockers are resolved. Runtime evidence never marks an unchecked PRD criterion implemented.
