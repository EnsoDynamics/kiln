# Phase 3: Bot commands for live session control

**Closed:** 2026-10-27

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Bot Extension; Identity and serialization; Durable records and ordering; Local Interfaces; Evidence and Verification Gates.

## Summary
Let a bot message or request safe takeover of the current Claude activity using Kiln's command interface. Expose the same receipts, readiness facts and explicit message-review hand-back as the browser.

## Acceptance criteria covered
AC-BOT-01, AC-BOT-02.
AC-LIVE-02, AC-LIVE-04, AC-TAKE-04, AC-BACK-04 (also apply to this phase's work).

## Out of scope for this phase
Building the bot discovery, authentication, general command or receipt framework; those belong to the bot-control PRD.

## Phase dependencies
1 (safe takeover/return and shared instruction authority); 2 (live message settlement and uncertain-message review). External prerequisite: both [bot-control phases](../../prds/kiln-bot-control/kiln-bot-control-phase-plan.md), including its durable mutation/retry framework, must be implemented and integrated before this phase starts.

## Phase-specific notes
Prove the design's HTTP/bot gate with the built CLI and real authenticated controller, covering browser/bot contention through one journal and final serialization. Extend the existing framework; an absent external prerequisite blocks this phase rather than expanding its scope or blocking Phases 1–2.

## Integration notes from Phase 2

Use schema 12's existing journal `message` effect/evidence and exact-target authority, not a second send or receipt framework. Browser `POST /api/live/message` and `/api/live/message-review` already use that journal. `reviewed_receipt_ids` is accepted internally for hand-back, and uncertain receipts retain `reviewedAt` plus the successful explicit hand-back's `resolvedBy`. A reviewed receipt stays `Delivery uncertain`; review never resumes or advances by itself. Review-operation restart reconciles fully saved acknowledgement sets and conclusively fails partial sets so remaining reviews can be submitted without a permanent journal block. History is sorted by durable sequence before paging.

The versioned bot route/status deliberately exclude the newly introduced `message` and internal `message-review` actions until this phase implements the public command, capability/help and retry/status contract. Remove that message-only exclusion as part of delivering the bot commands. Enforce the bot's material status-token match at its route before using the browser's exact-target journal admission, including settings/ownership revisions; exact target equality alone does not implement the bot token contract. Preserve current `reply` normalization and live text's separate literal policy.

`SessionControl.sendMessage` supplies `text_not_typed: true` only on validated newly launched Claude attempts, bounds write settlement to five seconds and never resends. The gate seals input only under its shared admission lock after correlated terminal-result accounting or safe takeover drain. Retain every existing takeover and final hand-back guard when adding cross-interface calls. The Phase 2 leaf and investigation name portable real-provider and crash/HTTP/browser evidence to rerun for affected contracts.

## Implementation and acceptance evidence

The built CLI exposes `message` and `take-over`, and repeatable `--message-reviewed` on explicit Resume/Verify. Both live commands extend the existing authenticated route and instruction journal. New bot admission requires the material status token as well as exact attempt identity; retries retain their original execution, target, contents and token. No second send, receipt store, terminal launcher or permission grant was introduced. Literal input preserves whitespace and BOM; stopped replies retain their trim policy.

| Criteria | Boundary and evidence |
|---|---|
| AC-BOT-01 | `src/control/live-commands.integration.test.ts`: built CLI, authenticated controller and disposable Git; literal file/stdin equality, exact conversation/attempt, strict input limits, real receipt lookup, live status labels, plain-text output and independent help/timing assertions. Existing command inventory/help tests include both commands. |
| AC-BOT-02 | Same suite: retries after controller/execution replacement, changed-input conflicts, material settings-token rejection, old-controller capability refusal, uncertain-message review with explicit Resume/Verify and per-receipt acknowledgements. Assigned delivery/test audit return preserves round identity and report-currentness checks. |
| AC-LIVE-02/04 | Running, pending/released and disconnected live status; concrete unavailable reasons, independently requested deferred pause, safe terminal instructions only after fresh reconciled release. |
| AC-TAKE-04, AC-BACK-04 | Browser/bot contention through one journal, ended explicit-target refusal, no successor delivery, retained uncertainty and pause obligations. Existing takeover/message crash, final ownership, audit, billing and workspace suites remain the shared safeguards. |

Provider proof remains separate from deterministic provider events: the portable `live-messages.mjs tool` and `text` modes passed on real Claude Code 2.1.311/macOS in disposable conversations. Tool mode consumed the instruction while its admitted Bash operation finished naturally; text mode retained three correlated results and both exact inputs. Neither used a cancellation signal. The proof scripts retain the evidence they print; no machine-local fixture is required to repeat them.

Test hardening intentionally replaces Phase 2's temporary expectation that versioned bot messaging is unavailable. It now proves supported bot acceptance and retained rejection of standalone internal `message-review`. It also checks literal receipt wording, independent help semantics and disconnected control/readiness projections. The live-attempt directory is excluded from saved-conversation enumeration, and history reports the same dispatch/legacy attempt identity as the live target.

## Publication and successor

Implementation closure does not authorize shared-branch publication. This chat's starting instruction explicitly holds Phase 3 publication; no production changes or messages to other chats are authorized. After publication, the next planned unit is a fresh whole-PRD delivery audit, followed by test audit only when delivery is clean. The separate bot-control inspection cleanup remains owned by its own track.

## Verification run details

Dependency audit, ESLint, TypeScript/Svelte checks, all 624 unit tests and all 17 Codex contract proofs passed. The nine final bot CLI cases passed against a fresh isolated build of the current working files (198 seconds), including exact BOM/whitespace transport, public conflicts/refusals, text/JSON receipt labels, offline help, old capabilities, phase/audit hand-back and disconnected safety. The runtime source hashes were retained and compared with the implementation worktree. All 36 existing bot compatibility cases passed as well.

The broad `npm run verify` integration invocation covered 844 cases across 72 files in 2,199 seconds: 825 passed, 17 failed and 2 were platform skips. It began before the final review/hardening fixes: its three bot failures exercised cached earlier route code and the older compiled handoff projection; all nine final bot cases subsequently passed on a fresh current build. The other fourteen failures were existing automatic-audit/takeover deadline cases. Every one subsequently passed focused checks with unchanged assertions and original deadlines. Representative unchanged Phase 2 exports and the current implementation both passed the same closed-at-start and repair-round flows; both weekly-recovery modes also passed on the untouched export and current code. This is complete-run-plus-current-retest evidence, not a claim that one full invocation exited green.

A separate hardening run's existing 32-message capacity case refused a send during contention; its unchanged isolated rerun and the broad full run passed. The assertion now includes the refusal body as a diagnostic. The new audit CLI fixture prepares its real prerequisite audit in `beforeEach`, keeping the original 60-second functional test deadline; its isolated test-audit Verify case passed. No application timeout, capacity limit or safety assertion was weakened.

Independent deliverable review and test hardening are complete. Review fixes preserve action-ID conflicts before target lookup and durable explicit stale-target refusals. Hardening added independent receipt/help/disabled-state evidence and fixed disconnected handoff safety. No new business assumption was introduced. The portable real-provider text/tool proof details are above.

## Pending human actions

- Doug: authorize publication of the scoped Phase 3 implementation commit. The starting instruction holds shared-branch publication; the finished work remains in this chat's worktree until that approval.
