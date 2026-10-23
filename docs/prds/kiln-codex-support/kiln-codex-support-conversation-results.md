# Codex support for Kiln — Conversation runner results and native cleanup scope

**Recorded:** 2026-10-23 UTC. **Scope:** [Phase 3b1 — Run protected durable Codex conversations](phase-3b1-protected-codex-conversations.md). **Disposition:** 3b1 closed under the approved native cleanup contract; normal execution remains gated for workflow integration in 3b2.

## Qualified observations

The production `runCodexSession` adapter ran codex-cli 0.162.1 on macOS with existing ChatGPT authentication and the requested GPT-6.1-Sol/High pair. Its private work transport is separate from metadata/evidence transports. Durable launch, process, thread and dispatch records precede work; returned effective protection/settings are checked before dispatch, and per-turn observed settings come from owning raw `turn_context` records. Original and attempt accounts remain separate.

Real parent thread `01a169b0-384d-7d31-9bc4-cf6e344e804b` delegated read/write child `01a169b0-7107-7360-bb82-b1c86575e039`. Both read instructions and delivered markers through reviewed Git operations to disposable local bare origins. `proof-a` commit `64d5993be52ed2dc1a122b5b0c9104ed77cef675`; `proof-b` commit `98d5b982f448da1fb7ae0ad893acadae1cc6013a`. The fresh production audit covered 17 operations across both conversations with complete coverage, no problems and no outside findings. These pushes were local only; this does not establish GitHub PR delivery.

A real sleep command was interrupted in turn `01a169b2-6b46-7bd3-a7a4-bc560f1b549d`. Its edit survived. A fresh private server resumed the same thread and original pair in turn `01a169b3-87d1-7be1-9b86-e5592e27011e`, recalled `RUNNER_CONTEXT_7524`, read `PRESERVE_THIS_EDIT` and delivered the recovery files to the local origin. A further ordinary interruption with the new per-attempt marker completed in turn `01a169bb-74a3-7b82-9388-1ec72b618081`. These positive cases do not prove containment of every supported tool process.

The actual raw terminal for interruption is `event_msg.turn_aborted`, with `reason: interrupted` and exact `turn_id`; it is not `task_complete`. The reader now accepts that verified terminal only for a matching normalized interrupted turn. The sanitized recorded fixture and negative wrong-turn/status/reason/conflicting-terminal cases preserve the contract. No wrapper grammar was broadened.

## Original failed full-containment qualification

Turn `01a169c1-12a1-7513-997e-e6043ddd0803` ran a real tool that spawned a short-lived launcher and a detached long-running Node descendant with a replacement environment containing PATH only. The launcher exited between inventories, and the descendant no longer carried the inherited owner marker. Codex reported the turn interrupted. The adapter returned `cleanup: complete`, but the descendant was still running.

The driver captured PID 23940 and its OS start identity `Fri Oct 23 17:14:07 2026`. Its result is `survived: true, recordedCleanup: complete`. It explicitly ended that disposable process group afterward; a separate exact PID/start check confirmed it is gone. The failed proof exits nonzero. No user repository or unrelated process was terminated.

This is an actual pinned-profile counterexample to the original full-containment interpretation of AC-RECOVER-01. PID/start checks prevent killing an unrelated reused PID; ancestry polling and inherited markers do not supply OS containment after reparenting and environment replacement. `turn/interrupt` did not supply that guarantee here. The result originally blocked 3b1. It remains evidence of the limitation after Doug's subsequent explicit native-scope decision below; it has not become a containment pass. Codex Start remains gated for the separate 3b2 workflow integration.

## Native cleanup decision and alternatives investigated

Doug's follow-up in implementing chat `01a169a3-f351-7d63-b5a7-957bec2fd46d` rejected treating this as a choice between abandoning Codex and accepting vague best effort, and asked what more can be done. After the investigation, Doug chose: “finish strengthening native cleanup first”; a warning about Ctrl+C “maybe ... would be okay in the meantime”; “I don't want to do anything that would substantially change the architecture”; “Let's try to keep things lightweight.” RECOVER-001 and AC-RECOVER-01 now state that limited native stop contract, including honest warning guidance. Neither stronger OS containment nor abandonment of Codex was selected.

The distinction is between stopping the model/conversation (demonstrated) and containing every OS program launched by its commands (the failed boundary). An escaped test or development server could keep changing files or making requests after Stop, and could overlap later recovery. The positive ordinary interruption and same-conversation recovery cases remain valid. The negative case deliberately combines short-lived ancestry, detachment and environment replacement; no frequency claim is established by that one targeted case.

| Approach | What it adds | Remaining boundary or product cost |
| --- | --- | --- |
| Layered native supervision — selected | Provider interrupt, provider background-terminal cleanup, process-group termination, durable PID identities and rediscovery of marked descendants. | Improves ordinary cleanup, but a daemon in a new group with vanished ancestry and replaced environment can still escape. Record only `tracked_processes_stopped` or `unknown`; save and display the limitation rather than claiming universal `cleanup: complete`. |
| macOS native event tracking helper | EndpointSecurity can report fork/exec/exit events and track descendants independently of shell environment and current parent/group membership. | Requires a restricted Apple entitlement and signed distribution. The current systemwide client also requires elevated privileges and TCC approval; a new descendant-scoped client is documented for macOS 27, beyond this host's 26.6.1. This is a substantial prerequisite/distribution change and still needs a designed, exercised fail-closed supervisor. |
| Isolated execution environment | A dedicated VM or correctly configured kernel process containment domain can be destroyed as a unit, independently of descendant reparenting/environment. | Changes execution architecture, tooling, file/credential/skill access and prerequisites. A container label alone is not proof: its process domain and shutdown behavior must actually prevent escape and prove the retained failing case. |

The pinned installed CLI exposes experimental `thread/backgroundTerminals/list`, `/terminate` and `/clean` APIs. Its [registered process listing and termination implementation](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core/src/unified_exec/process_manager.rs) lists retained active handles; local termination ultimately uses [process-group signals](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/utils/pty/src/process_group.rs). The strengthened runner uses `/list` and `/clean` for the loaded parent/known descendant threads, then checks provider inventory and native identities. These controls do not establish discovery of independently detached orphans. `process/spawn` is explicitly outside the Codex sandbox and is not a replacement for protected tool execution.

The existing Claude runner also delegates forced stopping to `endProcessTree`, whose Unix primitive is process-group signaling. This source observation identifies a shared limitation of the current host supervisor; it is not a real Claude reproduction, nor permission to silently weaken Codex acceptance. A proportionate product decision should compare both agents against the same intended stop guarantee.

The installed macOS SDK explicitly says kqueue `NOTE_TRACK`, `NOTE_TRACKERR` and `NOTE_CHILD` have been unsupported since 10.5. Polling faster cannot establish complete lifetime ownership. Private immutable original-parent identities can improve discovery after direct reparenting, but cannot reconstruct an unseen intermediate process that already exited; they add an unsupported API dependency without supplying the full guarantee.

Apple documents the [EndpointSecurity entitlement requirement](https://developer.apple.com/system-extensions/), [current client prerequisites](https://developer.apple.com/documentation/endpointsecurity/es_new_client(_:_:)) and [new descendant-scoped client](https://developer.apple.com/documentation/endpointsecurity/es_new_descendants_client(_:_:)). No helper was installed, security setting changed, entitlement requested or execution architecture changed during this investigation.

## Implemented interfaces awaiting qualification

`prepareCodexLaunch` validates model/effort, ChatGPT account, enabled installed skill paths and managed requirements in assigned directories. `runCodexSession` records launch/dispatch intent, returned thread/tree/home identities, effective/observed pairs, server requests, semantic terminal state and cleanup facts. `reconcileCodexAttempt` reads saved authoritative turns without dispatching a possibly delivered prompt. A dispatch with no durable returned turn ID remains ambiguous and cannot automatically resend. UI resolution belongs to 3b2 after this runner is qualified.

Known client approvals are declined; permission expansion gets no permissions; elicitation is declined. Questions/unknown requests and structured asynchronous questions trigger interruption with their full payload retained. Actual process peers exercise these verified uncommon contracts; the live provider did not need to emit every rare request.

Independent review fixed inherited-pipe cleanup deadlocks (including failed ownership probes), unbounded queued inventories and stale process lists. The current inventory is coalesced; EOF wait is bounded; known descendants are still terminated when a fresh ownership probe fails, with cleanup unknown. Those fixes do not repair the counterexample above.

The Windows path adds process-local MXC selection, readiness/startup checks, a pinned PowerShell executable/version and a fixed non-breakaway Job Object supervisor that assigns a suspended server before execution and kills job descendants on closure. A no-model-turn supervisor probe runs before work. The C# helper compiled under actual macOS PowerShell 7.5.2; no native Windows execution, MXC, argv/root enforcement or job-cleanup pass is claimed. Native runtime/package proof remains Phase 5. The current Windows test metadata version shim is explicitly a fixture, not proof of a qualified PowerShell installation.

Provider terminal cleanup is bounded to 10 seconds across paginated discovery and verification, and filters loaded identities to the saved conversation tree. It records registered handles and available OS PID/start identities before cleanup. Provider errors, malformed/repeated pagination and terminals remaining afterward become visible failures with `cleanup: unknown`; OS termination still runs. `cleanupWarning` is durable on every attempt and surfaced through a separate `onWarning` callback. Raw provider events and stderr remain unmodified. Phase 3b2 owns wiring that warning into terminal Ctrl+C guidance and the browser recovery view; its handoff states those requirements explicitly.

## Strengthened native runtime qualification

The following real runs use the same parent conversation and original model/effort as the earlier proof. All emitted the native limitation warning and saved `tracked_processes_stopped`; that result describes only tracked processes.

| Case | Actual turn | Evidence and result |
| --- | --- | --- |
| Registered background terminal | `01a169e2-f3db-7191-8eed-9614c61f883a` | Captured live PID 43539 before turn completion; provider handle `68948` was inventoried and cleaned; exact PID/start identity was gone afterward. `background-cleanup-result-run-6.json` records `exercised: true, survived: false, driverCleanupComplete: true`. The real reply omitted optional `osPid`; native ancestry/marker tracking supplied OS ownership. |
| Independently detached program | `01a169e4-573d-7f60-90ef-ab2a7215c1cb` | Captured live PID 47177, actually interrupted, then reproduced survival. `orphan-cleanup-result-run-7.json` records `survived: true`, the bounded cleanup claim, `interruptedBy: sigint`, interrupted terminal and `driverCleanupComplete: true`. This characterizes the approved limitation, not containment. |
| Ordinary interruption with strengthened controls | `01a169e5-e0ae-75d3-b056-6520290673f0` | Interrupted terminal, preserved edit, registered terminal handle `38315` cleaned and tracked-process cleanup passed. |
| Same-conversation recovery | `01a169e7-582f-77b0-a750-f934e793485c` | Resumed the same parent and original pair, read the preserved marker and completed reviewed local Git delivery. No network push was involved. |

A fresh production audit after these runs covered 36 operations with complete coverage, zero problems and zero outside findings. The original full-containment failure artifact is unchanged. History coverage does not establish termination of independently detached programs; that distinction is retained in both the new characterization and the product warning.

## Reproduction and retained evidence

The harness is isolated from application entry points and package files:

```text
npm run build
node scripts/proof-run/codex-conversation-proof.mjs seed
node scripts/proof-run/codex-conversation-proof.mjs run <printed-folder>
node scripts/proof-run/codex-conversation-proof.mjs interrupt <same-folder>
node scripts/proof-run/codex-conversation-proof.mjs resume <same-folder>
node scripts/proof-run/codex-conversation-proof.mjs background <same-folder>
node scripts/proof-run/codex-conversation-proof.mjs orphan <same-folder>
node scripts/proof-run/codex-conversation-proof.mjs audit <same-folder>
```

The real calls use existing authentication and model allowance. The background case must capture a live PID and observe actual registered terminal cleanup. The orphan case characterizes the approved limitation and does not assert containment: it must capture a live PID, actually interrupt the turn and retain the native limitation warning and accurately scoped result. An unexercised proof fails. Driver cleanup runs even on exceptions and records its exact-identity check separately from runner acceptance, in per-attempt result files. The original `orphan-cleanup-result.json` is preserved. Run only in the owned disposable folder. No network push, merge, deployment, method modification or normal Kiln PRD is involved.

Owner-only local evidence: `/private/var/folders/p3/fyw8z5213xn41qkl15tr42d80000gn/T/kiln-codex-conversation-VZhUNi`, including manifest, saved attempts/events, audit and `orphan-cleanup-result.json`. Provider raw files remain under their returned Codex history paths; no database or authentication tokens were read. A first empty-thread probe in a separate disposable folder established that turn pagination is unavailable before materialization; the adapter no longer calls it before a new thread's first input.

## Validation and delivery restrictions

Final `npm run verify` passed dependency audit (zero blocking findings), ESLint, TypeScript/Svelte (zero errors/warnings), 480 unit tests, 13 prerequisite-proof tests and 421 integration tests (two existing skips). The focused lifecycle suite passes 28 cases and six isolated ownership/cancellation hardening tests pass. Independent deliverable review and test hardening have no remaining Medium/High findings under RECOVER-001. This closure is delivered as a scoped local feature commit, followed by the required refactor pass on that committed baseline. No push is authorized.

Test hardening reloads durable state before resumption and asserts both attempts' saved identities, original/attempt accounts, requested/effective/observed pairs and dispatch/terminal facts. It also covers provider failure with native cleanup, a real stalled inventory at the 10-second deadline, independently retained work/cleanup failures, cancellation during OS identity lookup and remembered-child cleanup after an exited launcher lost its start identity. Six isolated failure/ownership tests supplement the real-process lifecycle and live provider cases. Independent review accepts the approved native scope; the earlier full-containment finding remains documented history, not an unresolved demand for an architecture Doug declined.

Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” This session preserves the unrelated staged root README.md and the same shared checkout's local commits.
