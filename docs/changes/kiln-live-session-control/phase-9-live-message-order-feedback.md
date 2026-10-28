# Phase 9: Preserve live-message order and explain paused controls

**Closed:** 2026-10-28

**Added by delivery audit:** 2026-10-28, after all eight implementation leaves closed. Completes the remaining cross-event correlation and disabled-control explanation gaps confirmed against `8110b2c`.

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Receipts and correlation; Uncertainty recovery; Snapshot and browser; Bot Extension; Evidence and Verification Gates.

## Summary

Retain accepted live-message order across provider events and recovery, and explain the unavailable deferred-pause choice after terminal takeover is ready.

## Acceptance criteria covered

AC-LIVE-02, AC-MSG-01, AC-MSG-02 and AC-MSG-03 (complete them; owned by phase 2).
AC-BOT-02 (completes it; owned by phase 3).
AC-MSG-05, AC-TAKE-02/04 and AC-BACK-04 also apply to this phase's work.

## What the audit found missing

- **AC-LIVE-02:** `PhaseHandoff.svelte:123` renders `PausePanel` after release. `view/src/components/PausePanel.svelte:42` disables the deferred-pause button when `held.state === "released" && !snapshot.pause.pending`, but supplies no adjacent reason. The existing timing paragraph describes an available action; the takeover status and generic disconnected explanation do not explain this disable. The phase and both audit kinds share it. Explain the existing unavailable state; the audit does not require enabling a new pause or changing deferred-pause semantics.
- **AC-MSG-01:** `Engine.observeLiveMessage` (`src/engine/engine.ts:625–635`), reached from the shared browser/bot input observer and startup replay, compares acceptance order only among UUIDs named in one event. Accepted A then B can first receive consumption evidence for B alone, before any evidence that A was consumed, then A alone. Each event passes, so cross-event reversal is silently accepted despite the existing order contract.
- **AC-MSG-02:** The same cross-event contradiction reaches `projectMessage` (`engine.ts:587–596`) and labels both inputs Received by Claude, rather than retaining uncertainty as the correlation design requires. Preserve exact text, original provider evidence and honest receipts; later evidence alone must not clear an uncertainty/review obligation.
- **AC-MSG-03:** For separate B-then-A result events, `gate.ts::observeGate` marks both inputs terminal, `claude-session.ts::maybeDrain` can seal input, and `endLiveMessages` sees both `resultAt` fields and adds no hold. `recoverLiveMessages` (`engine.ts:608–622`) replays through the same per-event validator, including when both result fields were already saved. Detect the chronology contradiction and preserve explicit recovery without resend or automatic advancement.
- **AC-BOT-02:** Bot `message` reaches the same observer through the versioned command route; its retries, saved-event recovery and explicit reviewed-message return therefore inherit the missing cross-event uncertainty safeguard. Retain the shared browser/bot authority and original exact target, not a second receipt or send path.

## Conflict check

All other PRD/change directories were shortlisted by title/summary and applicable active criteria read. No later-built requirement supersedes accepted message order, the design's inconsistent-order uncertainty rule or the disabled-reason requirement. Existing replacement chains lead to this PRD. The per-event-only validator originated in `f82374c`; the released deferred-button condition originated in `ae33be4`. These are omissions under their original contracts, not later product decisions. No new assumption, supersession pointer, provider capability or ownership guarantee is needed.

## Phase dependencies

1 (paired pause controls and safe takeover/return); 2 (literal messages, correlation and uncertainty); 3 (shared bot authority and reviewed-message return); 7 (saved-event validation/recovery); 8 (pending/exit/restart recovery repairs that must remain intact).

## Phase-specific notes

One bounded live-control completion slice fits one implementation session. Prove the five whole criteria, not only the cited branches. Exercise separate out-of-order consumption events before earlier-input consumption through live callbacks and saved-event recovery, including a restart after both result fields were saved, both input channels and implementation/delivery-audit/test-audit identities. Distinguish that contradiction from legitimate overlapping terminal completion after the earlier input already has consumption evidence; preserve valid ordered/coalesced and multi-result flows. Retain exact receipts, uncertainty, per-message review, explicit hand-back, no resend, no successor delivery and independent pause/release safeguards.

At desktop and narrow widths, show why the existing deferred-pause action is disabled after release without a pending request. Preserve cancellation of a separately requested deferred pause and all pending/disconnected availability rules. Use the design's existing provider, durable-engine, browser/bot and compatibility gates; this audit adds no new runtime qualification or universal containment promise.

After closure/publication, obtain a fresh whole-PRD delivery audit; test audit follows only when delivery is clean. All eight earlier Closed lines and historical validation qualifications remain unchanged, including Phase 8's confirmed unrelated baseline clock-test failure.

## Publication and successor

The source authorization in implementation chat `01a1804a-ad27-7fc0-9317-60119e6ac0c8` was: “Go ahead and push Phase 8, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” It covers that publication and this audit launch only. This audit uses delivery-audit's scoped commit default and holds publication for Doug. The successor uses implement-from-requirements' scoped commit default and holds publication of its later work for Doug. No production changes or messages to other chats are authorized; bot-control and plan-continuation remain separate tracks.


Doug subsequently lifted this audit's publication hold in audit chat `01a18088-e7b9-72c1-99d9-cfeabc3deedb`: “Go ahead and push the audit, then launch a new chat for Phase 9 using GPT 6.1 Sol High Effort.” This authorizes publishing audit `8d2428f` and its authorization/handoff record, then launching this Phase 9 implementation. The successor uses the scoped implementation commit default and holds publication of its later work for Doug. Production changes and messages to other chats remain unauthorized; the fresh delivery-audit-then-test-audit closeout remains required.


## Implementation and acceptance evidence

First-consumption validation checks the full accepted attempt ledger, including earlier written inputs absent from the current event. A later input consumed before an earlier unobserved input holds both receipts as uncertain. Matching original provider evidence and result accounting remain retained; later observations cannot remove uncertainty or review. Ordered/coalesced input and overlapping terminal results after earlier consumption remain valid. Startup reconstructs chronology from saved events independently of already-saved receipt timestamps/results. No new receipt store, schema or provider capability is introduced.

The released deferred-pause choice explains that the session is already stopped and must be handed back before requesting that pause. Its availability is unchanged; a separately pending pause can still be cancelled without affecting takeover.

| Criteria | Current evidence |
|---|---|
| AC-MSG-01/02 | `live/messages.integration.test.ts` exercises separate B-only result and assistant consumption before A, valid A consumption before B/A terminal results, ordered separate results and coalesced consumption. Exact text, target, read/result evidence and receipt/effect state survive restart. Existing literal/limit/capacity and multi-result cases remain. |
| AC-MSG-03 | Same suite: actual disposable-supervisor SIGKILL after a saved B-only result and before its callback; separate replay cases with missing callbacks and with both pre-upgrade result fields saved. Repeated restart retains both uncertain receipts, per-message review, original target, no successor advancement and exactly two original inputs. Negative checks on an untouched `f11ecd9` source export fail with the old incorrect received states. |
| AC-BOT-02, AC-MSG-05 | `control/live-commands.integration.test.ts` sends both inputs through the built CLI, retries their original command IDs after restart, retains uncertain receipts and each review, refuses unreviewed/partially reviewed return and resumes only through explicit reviewed Resume of the original conversation. The receipt remains uncertain after resolution; no input is resent. Existing Verify, token, authentication, contention and recovery cases remain. |
| AC-MSG-03/05, AC-TAKE-02/04, AC-BACK-04 | `live/takeover.integration.test.ts` exercises both actual assigned audit kinds through browser/versioned bot input, cross-event uncertainty, restart, per-message review, already-complete Resume and explicit successful advance. The original audit kind/round and independently requested pause survive; no new attempt starts, and resolved holds do not resurrect. Existing phase/release/ownership/final-boundary cases remain. |
| AC-LIVE-02 | `server/live-control-browser.integration.test.ts` shows the disabled reason immediately beside its button for phase, delivery audit and test audit at 1200px/390px. It retains separate cancellation and takeover. The narrow baseline check fails on the absent reason; current cases pass. Existing pending/disconnected, input-loss, Codex, final-delivery and state-specific portfolios remain. |
| AC-MSG-01/02 browser evidence | Test hardening strengthens `server/live-message-browser.integration.test.ts` at both widths: exact timing sentence, visible limit, exact receipt text and submission time, session-output link, submitted/received/not-sent labels, disclaimer and editable unsent text. Receipt fixtures exercise independent presentation states, not a provider-confirmed receipt changing into not sent. |

The deterministic provider stream supplies otherwise unreliable order/crash faults around real Git, durable files, subprocesses, authenticated HTTP, the built CLI and Chrome. Existing real-provider `live-messages.mjs text`, `live-messages.mjs tool` and `live-takeover.mjs foreground` proofs also pass on Claude Code 2.1.311/macOS, preserving literal input/fresh context, natural operation completion, unfinished takeover work and no cancellation signal. These do not add a runtime qualification or universal containment guarantee.

Independent deliverable review found no material issue. Fresh-eyes test hardening identified the two browser assertion gaps above; the strengthened cases and bounded delta assessment pass. The published audit's conflict check remains applicable: the current owning criteria are unchanged, and intervening bot-control closeout documents introduce no supersession of these requirements. No business assumption or replacement pointer was added.

## Successor after publication

This phase uses the scoped implementation commit default and holds publication for Doug under the authorization quoted above. This implementation review and its tests do not establish a clean whole-PRD delivery verdict. After publication, the next planned unit is a fresh whole-PRD `delivery-audit` of `kiln-live-session-control-prd.md`, in a new chat, reading the full PRD, design, assumptions, phase plan and all nine leaves. Test audit follows only when delivery is clean. Preserve all eight earlier Closed lines and their distinct validation qualifications, especially Phase 8's confirmed unrelated baseline clock-test failure. Bot-control and plan-continuation remain separate tracks; production changes and messages to other chats remain unauthorized.


## Repository validation

The complete current-build `npm run verify` invocation passed dependency audit (zero blocking high/critical findings), ESLint, TypeScript/Svelte checks, all **639 unit tests** and all **17 Codex contract proofs**. Its complete **81-file integration run** took **1,697.15 seconds**: **943 passed, two platform skips and three failures** (948 cases). Two tests reached their unchanged 60-second deadlines: the existing unavailable-test-audit Verify case and the new cross-event test-audit return case. The existing final-observation test-audit fixture instead observed `Not sent`, before its intended delivery/exit assertion; its message admission/exit-accounting code is unchanged by this phase.

All three failed cases subsequently passed in one serial focused invocation (**111.28 seconds**) with their original deadlines and assertions unchanged. The separate full message suite passed all 38 cases, the focused chronology/replay portfolio passed seven, both actual audit flows passed, the built-CLI regression passed, all six released-pause browser variants passed, and the hardened receipt workflow passed both widths. All **946 executed current integration cases** therefore have passing evidence across the full run and unchanged retries. This is a **complete-run-plus-focused-retest portfolio, not one green full invocation**. Runtime, browser, test, fixture, prompt and configuration hashes stayed unchanged throughout the full run and retries; no application rule, test assertion or deadline was weakened.

The initial new fixtures needed corrected API origins, an explicit recovery target, asynchronous receipt assertions and settled dispatch before capturing a bot status token. The final fixtures retain exact targeting, no resend, required reviews, independent pauses and original deadlines. The baseline red checks fail for the intended incorrect received receipts and missing disabled explanation on untouched `f11ecd9` runtime/browser sources, then pass on the repair. Existing real-provider text, in-flight-tool messaging and foreground takeover proofs pass on Claude Code 2.1.311/macOS. The full gate's passive-billing qualification uses retained Claude 2.1.307 on an isolated test PATH; live-control qualification is unchanged.

All **eight installed-package checks** pass after packing and installing the current build into a disposable prefix (`npm run test:package`, **68.09 seconds**).

All eight earlier leaves remain byte-identical, including Phase 8's Confirmed unrelated baseline failure section. Independent deliverable review, documentation delta review, test hardening and its delta assessment are complete with no remaining material finding. Publication remains held for Doug; fresh whole-PRD delivery audit remains owed after publication, followed by test audit only when delivery is clean.


## Phase 9 publication and fresh audit launch

Doug lifted the publication hold in implementation chat `01a1819a-a403-7031-b655-4d92c0489b3e`: “Go ahead and commit and push, and then launch a new chat to do the fresh delivery audit.” Phase 9 is published unchanged as `23bd3c3`; no runtime or test edit was needed for publication. This authorizes publishing the implementation and this authorization/handoff record, then launching a fresh whole-PRD delivery audit.

The successor uses delivery-audit's scoped commit default and holds publication of its later work for Doug. It reads the full PRD, design, assumptions, phase plan and all nine leaves; Phase 9's complete-run-plus-focused-retest qualification and all eight earlier validation records remain unchanged. Test audit follows only a current clean whole-PRD delivery verdict. No production changes or messages to other chats are authorized; bot-control and plan-continuation remain separate tracks.
