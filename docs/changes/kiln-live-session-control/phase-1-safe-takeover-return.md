# Phase 1: Safe terminal takeover and return

**Closed:** 2026-10-27

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Architecture and Durable Authority; Safe Checkpoint and Release; Terminal Ownership and Hand-back; Local Interfaces; Evolution, Limits and Delivery; Evidence and Verification Gates.

## Summary
Let a person pause a running Claude phase or audit after its current operation, continue the same conversation in a terminal, then resume or verify that activity in Kiln. Deliver both pause choices and their distinct pending and completed states through the browser.

## Acceptance criteria covered
AC-LIVE-03, AC-LIVE-04, AC-TAKE-01, AC-TAKE-02, AC-TAKE-03, AC-TAKE-04, AC-TAKE-05, AC-BACK-01, AC-BACK-02, AC-BACK-03, AC-BACK-04.

## Out of scope for this phase
Live message submission, message receipts/review and the complete composer/availability arrangement (Phase 2); bot command/status/help additions (Phase 3). The interface-wide constraints above apply to each later interface when it is introduced.

## Phase dependencies
None. Reuse the implemented Needs you handoff and completion-audit workflows named by the PRD.

## Phase-specific notes
Introduce the shared journal/admission/attempt primitive through this working takeover slice, adopting the bot design's contract without waiting for bot discovery or CLI delivery. If concurrent bot work has landed, extend its implementation instead of creating a second authority.
Prove this slice with the assembled provider/controller, authenticated server, built browser and disposable real Git origins for phases and both audit kinds; use the design's safe-yield, exclusive-terminal, durable-engine and browser gates. Keep future message effects absent until Phase 2; no later phase may be needed to prove safe release or hand-back.

## Implementation and verification

The implementation extends the existing `CommandJournal`, with one digest-partitioned instruction receipt and exact `LiveTarget` per takeover. Private schema 11 retains the hold and attempt gate, including tool/task identities and observed child PID/start identities. The packaged `checkpoint-hook` shares atomic admission with hold acceptance; it denies new tools and yields completed batches without the cancelling stop path. New attempts expose takeover only for the validated Claude Code 2.1.311/macOS profile. Recovered input loss holds progression and waits for proven release, including older attempts without a gate.

Hand-back uses the existing recovery page and journal. It accepts exact live target/instruction identity, checks ordinary/pending terminal ownership, freshly evaluates the real phase or assigned audit, and revalidates before completion acceptance and the first prompt. Saved provider evidence repairs a torn gate projection after restart. A terminal owner, missing history, uncertain process identity or outstanding tracked work keeps the execution held. Deferred pause is independent.

Portable provider proof: `scripts/proof-run/live-takeover.mjs`, after `npm run build`, exercises the assembled adapter and packaged gate with disposable conversations. Modes `foreground`, `failed`, `background`, `agent` and `background-agent` each preserve the first completed Bash operation, leave the second mandatory operation unfinished, settle tracked operations/tasks and exit without a signal. Mode `terminal` additionally needs `KILN_PROOF_TERMINAL_CWD` set to an already trusted disposable directory; it refuses an ordinary `claude --resume` owner from that other cwd, then permits return after `/exit`. The Python PTY helper owns only that proof terminal. No prototype directory is a release dependency.

Automated boundary evidence lives in `src/live/takeover.integration.test.ts`, `src/live/gate-process.integration.test.ts` and `src/server/live-control-browser.integration.test.ts`: real local Git origins, authenticated HTTP, phase and both audit kinds, report currentness, durable replay, final prompt/acceptance races, tracked-child/history/registry release, separate deferred-pause cancellation, helper contention/death and built desktop/narrow Chrome views. Provider stand-ins are complemented by the real CLI proof above; the phase-only harness's isolated audit routing is not evidence of audit obligations.


## Acceptance evidence

| Criteria | Implemented boundary and passing evidence |
|---|---|
| AC-LIVE-03/04 | Paired phase/audit timing and consequences, pending/released distinction, independent deferred-pause cancellation. Built Chrome desktop/narrow tests in `live-control-browser.integration.test.ts`; affected legacy progress/browser tests. |
| AC-TAKE-01/05 | Same-lock hold and operation admission; completed-batch yield; no cancelling signal; unfinished second operation. Real CLI proof in all five operation/context modes; separate-helper contention/death test. |
| AC-TAKE-02/03 | Exact process release, tasks/descendants/history/ordinary terminal checks before a quoted same-conversation command. Real CLI terminal proof; tracked-child/history/registry engine cases; pending audit browser case. |
| AC-TAKE-04 | Shared journal, exact execution/activity/attempt binding, deduplicated HTTP, late completion and no automatic successor. Authenticated real-server retry/stale cases, actual controller-death recovery and final prompt/acceptance races. |
| AC-BACK-01/02 | Existing phase/audit return, same conversation and round, dirty Resume, late-complete explicit choice. Real-Git phase plus both audit kinds under Resume and Verify; late preflight/first-prompt completion cases. |
| AC-BACK-03/04 | Real report/currentness/workspace/delivery predicates, fresh final evidence guard and retained deferred pause/obligations. Audit changed-report cases, final local-material race, explicit complete/advance, ordinary interruption/development-delivery compatibility suites. |

Message and bot criteria remain unchecked for their owning phases; Phase 1 does not claim those interfaces are delivered.


## Final verification

On 2026-10-27, the complete `npm run verify` gate passed: dependency audit, ESLint, TypeScript/Svelte checks, **624 unit tests**, **17 Codex contract proofs**, and **801 integration tests** (**2 skips**, 67 files). The integration run completed in 506 seconds. The existing passive-billing qualification used its explicitly required retained Claude 2.1.307 binary on an isolated test PATH; all six real-provider takeover proofs used installed 2.1.311. No billing qualification or installed provider selection was changed.

Independent deliverable review passed after fixes; test hardening covered controller/helper death, ownership and completion races, actual audit verification, tracked descendants, browser cancellation and reconnect. The installed-package suite passed all **6 tests** after pack/install into a disposable prefix; package dry-run also confirmed the compiled checkpoint helper, gate, ownership helper and prompt are included. The portable proof scripts remain because they reproduce the real-provider release boundary. No new business assumption was introduced. Phase 2 is the next planned implementation unit.


## Publication crash-boundary check

Revalidation after the concurrent bot recovery fix exposed a nondeterministic crash-test expectation: SIGKILL could land between admission-lock directory creation and owner publication. The runtime correctly retained the unknown-owner hold; expecting automatic release at that unidentified boundary was wrong. The actual-controller test now freezes only the disposable controller and selects an absent-lock or fully published-owner boundary before SIGKILL, retaining every original process/restart/release assertion. A separate real subprocess reproduces the ownerless-lock filesystem boundary with `mkdirSync`, dies by SIGKILL and proves `withGate` neither admits its callback nor removes the ambiguous lock or accepted hold. It does not claim to execute the packaged acquisition path before dying. Release-wait failures now include the held obstacle as a diagnostic.

The two explicit crash-boundary checks passed, and the recoverable controller-death case passed five consecutive repetitions. Independent test review found no safety assertion weakening or material gap. Runtime behavior was unchanged by this follow-up.


Publication validation reran the whole gate: audit, lint, type checks, 624 unit tests and 17 contract proofs passed. The full integration run covered 67 files: 801 passed, 2 skipped and 4 failed. Three failures were the existing passive-billing qualification resolving installed 2.1.311 because the earlier temporary 2.1.307 PATH directory was gone; restoring an isolated PATH to retained 2.1.307 made all six billing boundary tests pass. The remaining existing automatic weekly-limit recovery case hit its unchanged 20-second completion wait under concurrent host load; both automatic and manual modes passed on direct retest without assertion changes. All active integration cases passed across the run and these retests; this does not claim the publication run was a single uninterrupted green run. The added crash cases passed in that full run. Subsequent rebase incorporated planning documents only, with no runtime-code difference.
