# Phase 2: Live messages and delivery recovery

**Closed:** 2026-10-27

Closure records implementation and verification. Shared-branch publication remains held under this phase’s starting instruction.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Architecture and Durable Authority; Message Delivery and Attempt Settlement; Terminal Ownership and Hand-back; Local Interfaces; Evidence and Verification Gates.

## Summary
Send exact instructions into the running Claude conversation, show evidence-based receipts and hold uncertain delivery for explicit review and return. Complete the active-session controls and availability states around the existing takeover flow.

## Acceptance criteria covered
AC-LIVE-01, AC-LIVE-02, AC-MSG-01, AC-MSG-02, AC-MSG-03, AC-MSG-04, AC-MSG-05.
AC-LIVE-03, AC-LIVE-04, AC-TAKE-04, AC-BACK-04 (also apply to this phase's work).

## Out of scope for this phase
Bot live commands, bot status/help additions and bot review flags (Phase 3).

## Phase dependencies
1 (the durable instruction/admission authority, safe takeover, ownership checks, phase/audit hand-back and paired pause controls).

## Phase-specific notes
Extend Phase 1's authority with message accounting and recovery, through provider, engine, HTTP and browser together. Apply the design's literal-message/lifecycle, durable-engine, HTTP and browser gates, including all uncertainty/acknowledgement states and message-versus-takeover races; rerun the takeover invariants affected by multi-turn settlement.

## Integration notes from Phase 1

Extend `src/live/target.ts`, the existing control journal and per-attempt gate; do not add a second receipt store. Browser takeover uses `POST /api/live/take-over`, receipt lookup and release reconciliation. Live hand-back accepts `instructionId` and exact `LiveTarget` through the existing resume/check-again routes, preserving legacy phase recovery. A failed or uncertain launch retains the hold; already-complete late Resume sends no prompt and requires explicit advance. New takeover capability is profile-gated separately from the future literal-message capability.

The adapter currently closes stdin after the ordinary result only when held tracked work is settled. Phase 2 replaces that settlement predicate with its accepted-input/result accounting while retaining background task drain and non-cancelling yield. Its changes must retain gate contention/death, durable evidence replay, ordinary-terminal exclusion, tracked-child release and final completion/first-prompt guards. The Phase 1 leaf records the portable real-provider proof command and test ownership.

## Implementation and acceptance evidence

Schema 12 extends the existing journal and attempt gate with literal message UUIDs, durable pre-write intent, write settlement, read/result correlation and review acknowledgement. A five-second uncertain write or unaccounted exit closes send admission and holds the execution; it never resends. The existing release/ownership and explicit hand-back path resolves that hold. Read-only receipts remain visible during pending release, missing history and the already-complete choice. Receipt history sorts by durable acceptance sequence before cursor paging, including after restart.

| Criteria | Boundary and evidence |
|---|---|
| AC-LIVE-01/02 | Built Chrome at 1200px and 390px: output/composer/paired-pause/facts order, active audit identity, historical exclusion, successor draft isolation, input loss and pending HTTP/provider-write disables. `live-message-browser.integration.test.ts` plus retained takeover/disconnect browser coverage. |
| AC-MSG-01/04 | Exact text, whitespace, UUID, order and literal syntax through the real assembled adapter; same process/conversation and unchanged session/plan effects in real-Git HTTP tests. Portable `live-messages.mjs text` and `tool` proofs retain nested instructions, fixture skill names and fresh turn-start hook context. |
| AC-MSG-02 | Correlated assistant/result evidence, coalescing, first-result survival, real blocked-pipe five-second timeout and late failure; sending during a proven in-flight Bash operation without cancelling it. Result sidecars retain result indices, UUID sets and cost deltas separately from the run's final cumulative cost observation. |
| AC-MSG-03 | Exact-target retries/refusals; 32 unsettled-input ceiling despite assistant-only reads; conflicting identity/order; message/takeover race; actual disposable supervisor SIGKILL at durable intent, write-started, write-completed, saved evidence, full review and partial review boundaries. No resend, successor delivery or automatic advancement. |
| AC-MSG-05 | Uncertain text/copy/output and stable instruction recovery after lost HTTP/404; review before Resume or Verify, failed completion remaining held, explicit successful Resume and Verify/advance, retained receipt uncertainty and no hold resurrection after restart. |
| Retained AC-LIVE-03/04, AC-TAKE-04, AC-BACK-04 | Existing safe takeover/release and final ownership/completion guards rerun alongside message races, independent deferred pause and phase/audit return. |

The new automatic boundary tests are `src/live/messages.integration.test.ts`, `src/live/message-pipe.integration.test.ts` and `src/server/live-message-browser.integration.test.ts`. They use real local Git origins, authenticated HTTP, actual subprocess pipes/supervisor deaths and the built browser. Scripted provider events cover deterministic correlation/error boundaries; they are supplemented by the real Claude proofs, not presented as provider proof themselves.

Portable provider proof: build, then `node scripts/proof-run/live-messages.mjs text` and `node scripts/proof-run/live-messages.mjs tool` on validated Claude Code 2.1.311/macOS with existing authentication. Every invocation creates disposable fixture/context files and a new conversation, and reports its evidence file. No machine-local prototype or saved fixture UUID is required. The tool mode waits for its started marker before sending, proves its finish marker and correlated consumption, and uses no cancellation signal. The text mode proves later results survive the opening result. Configured MCP resource syntax without a supported ordinary positive control is not claimed as a newly proven expansion feature.

Independent deliverable review and test hardening ran in this chat; recovery/paging and missing browser/Verify/tool-boundary evidence were fixed in scope. Bot live commands, status/help and external bot token integration remain Phase 3; its integration notes identify the shared contracts and current interface boundary. No new business assumption was introduced.


## Verification run details

Dependency audit, ESLint, TypeScript/Svelte checks, all 624 unit tests and all 17 Codex contract proofs passed after reconciling the concurrent bot inspection changes. The portable real-provider text and in-flight-tool message proofs passed on installed Claude Code 2.1.311/macOS; the retained background-agent takeover proof also passed. The passive-billing integration qualification uses its required retained Claude 2.1.307 on an isolated test PATH, without changing the installed CLI or live-message eligibility.

A full-run reset-reading test exposed a pre-existing fixture race: its approximately five-second reset window began before real Git/setup completed. The same timeout reproduced against an unchanged Phase 1 snapshot. The corrected fixture keeps setup observation timestamps ordered, starts its real clock when waiting begins and observes that wait without blocking behind unrelated commit reads. It retains the actual timer and now also asserts that the reading occurs at or after reset plus sixty seconds. Its focused real-process rerun, ESLint and TypeScript checks pass; production reset behavior and test deadlines are unchanged.


The complete two-worker integration run covered 835 cases across 71 files: 823 passed, 10 timing failures and 2 platform skips. All ten failures subsequently passed focused checks: the corrected reset fixture above, plus nine unchanged audit/CLI cases. The audit continuation timeout also reproduced against the unchanged application baseline. An audit rerun allowed a larger whole-test process budget for workstation contention; every passing flow completed within the original 60-second budget, and final reruns of the remaining polling waits used the original deadlines. No assertion or application timeout was weakened. All 833 executed current cases therefore have passing evidence; this is a full-run-plus-targeted-retest portfolio, not a claim that one full invocation exited successfully. No application code changed during that portfolio.

The installed-package suite also passed all six checks after packing and installing the built CLI into a disposable prefix. Independent deliverable review and test hardening are complete. Shared-branch publication remains held; Phase 3 is the next planned implementation unit after publication and prerequisite checks.
