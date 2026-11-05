# Control a live Kiln session — whole-PRD delivery audit after Phase 8

**Date:** 2026-10-28 UTC
**Governing scope:** [Whole PRD](kiln-live-session-control-prd.md), [design](kiln-live-session-control-technical-design.md), [assumptions](kiln-live-session-control-assumptions.md), [phase plan](kiln-live-session-control-phase-plan.md), all eight closed implementation leaves.
**Assessed code:** `8110b2c99cfe986f4411d7865579959cf57f499c` (published Phase 8 `0d5c9fb`, publication record `72c9d04`, then separate bot-control audit documents).
**Pre-commit baseline:** `04b2a83`, an additional separate bot-control audit-record edit only; implementation and live-control requirements are byte-identical to the assessed code.
**Outcome:** 15 Implemented, five Partly implemented. Two missing behaviors become [completion Phase 9](phase-9-live-message-order-feedback.md). No current clean delivery verdict is claimed.

## Assessment and limits

All 20 active criteria were assessed; none was excluded, superseded, changed outside requirements or waiting on a criterion-level human action. Each of two full rounds used five fresh independent readers, with four criteria per reader and different groupings in round 2. Readers derived observable parts from the requirements before opening code, then traced every named entry point and variant. The main reader checked every Implemented record for omitted variants, confirmed each missing part in code and checked its siblings. Targeted rereads corrected omitted variants in otherwise Implemented records; those corrections concern the same two confirmed behaviors, not additional gaps.

| Round | New confirmed missing behaviors | Result |
|---|---|---|
| 1 | 2 | Cross-event consumption order and released deferred-pause explanation. |
| 2 | 0 | No additional confirmed omission; assessment ends under the skill's stopping rule. |

No implementation or test file changed. No product tests ran or were graded. This is code reachability against written requirements, not a new provider qualification, runtime reproduction or current passing verification gate. Phase 8's repairs were traced in the assembled code; its implementation review does not replace this audit. Every historical leaf and its distinct verification qualification remains unchanged, including Phase 8's confirmed unrelated clock-test failure.

## Entry points and variant coverage

Browser controls enter `PhaseDetail`/`LiveComposer`/`PausePanel` and the existing `PhaseHandoff`; authenticated live routes and Resume/Check again submit to `CommandJournal`. Bot CLI grammar and literal input enter the versioned authenticated command route and that same journal. `Engine.applyControl` reaches existing message, takeover and recovery paths. Phase, delivery-audit and test-audit launches share `runProcess` and the live Claude adapter, while retained audit UUID/kind/round/report determine audit-specific checks and labels.

The reviewed state matrix includes ordinary running, HTTP/pre-write submission pending, uncertain delivery, takeover pending/released, recovered input loss, browser/controller disconnection, completed/usage-wait/between-activity/ordinary Needs you, Codex and final-delivery exclusions, historical views, independent deferred pause/cancellation/reached pause, already-complete return, failing predicates and unavailable checks. Message and ownership traces include late results, multiple results, saved-event replay, final observation errors, partial/full reviewed hand-back crashes, tracked process observations, final return races and both browser/bot entry points. Desktop/narrow ordering is traced in the shipped components, without claiming a new browser execution.

## Criterion assessment

Paths below are repository-relative. Detailed missing parts and their implementation starting points are in Phase 9.

| Criterion | Status | Reachable implementation and remaining omission |
|---|---|---|
| AC-LIVE-01 | Implemented | `App` → `CurrentPhase`/`PhaseDetail` → output/composer/paired pauses/facts. `liveTarget`, activity labels and current-session guards retain identity, audit round, connection and historical exclusion. |
| AC-LIVE-02 | Partly implemented | `liveView`, composer/pause/draft/connection and bot projections cover the state matrix. Released `PhaseHandoff` → `PausePanel:42` disables deferred pause without explaining that action's disable. |
| AC-LIVE-03 | Implemented | Shared `PausePanel:24–42` supplies exact peer choices, activity/round, timing, consequence and buttons, with narrow source ordering. |
| AC-LIVE-04 | Implemented | `PausePanel`, `PhaseHandoff`, `Paused`, `cancelPause` and bot `statusProjection` distinguish requested/released/reached states and retain the separate deferred request/cancellation through return. |
| AC-MSG-01 | Partly implemented | Literal browser/bot input, rejecting visible limits, exact target/stdin, immutable text/time, monotonic acceptance sequence and paged receipts are wired. `observeLiveMessage:625–635` misses first-consumption order contradictions spread across events. |
| AC-MSG-02 | Partly implemented | Exact timing, pipe-versus-read distinctions, UUID/conversation evidence, exit uncertainty and no-compliance claims exist. The same cross-event contradiction can leave receipts Received by Claude instead of uncertain. |
| AC-MSG-03 | Partly implemented | Exact-target deduplication, durable intent, bounded writes/capacity, multi-result drain and exit/restart holds exist. Separate B-before-A consumption/result events can be accounted with no hold; startup replay repeats the omission. |
| AC-MSG-04 | Implemented | Existing stdin receives literal human user JSON; sending invokes no shell, launch, merge/push, permission or completion effect. Existing billing/workspace/audit/delivery rules remain. |
| AC-MSG-05 | Implemented | Exact receipt/output/review UI and routes → `reviewMessages`/`requireTakeoverReturn`; running uncertainty can request takeover after restart. Per-message acknowledgement retains uncertainty and the hold until explicit successful guarded return. |
| AC-TAKE-01 | Implemented | Shared journal/gate hold → packaged pre-tool denial/completed-batch yield. Driver, settlement and restart guards retain plan/activity holds; independent deferred pause remains. |
| AC-TAKE-02 | Implemented | `reconcileTakeoverOnce` requires exact process exit/finalization, settled admitted work/tasks, retained descendant identities, history, terminal ownership and unchanged release ledger. Concrete pending reasons/retries never force cancellation. |
| AC-TAKE-03 | Implemented | Existing stopped snapshot/`PhaseHandoff` retains activity/output/facts and exact cwd/conversation. Conditional command builder preserves embedded LF/spaces/apostrophes; copy-only command/history/release gating and recovery guidance remain. |
| AC-TAKE-04 | Implemented | Shared browser/bot/automatic journal, exact-target retries, known-ended explanation and final Resume/first-prompt/Verify material and ownership guards retain exclusive Kiln admission and successor safety. |
| AC-TAKE-05 | Implemented | Gate/stream/transcript observations retain original activity time separately from reconciliation time. `PausePanel` retains elapsed wait, obstacle and output; non-cancelling operation-boundary yield can leave activity work unfinished. |
| AC-BACK-01 | Implemented | Existing `PhaseHandoff` terminal and Back from your terminal grouping retains phase or actual audit/round names, stopped reply semantics and exit/requirements/no-special-phrase guidance. |
| AC-BACK-02 | Implemented | `recoverPhase` and late completion checks allow dirty/incomplete same-conversation/original-round Resume, retain drafts and unsent acknowledgements, and present explicit already-complete advance without sending or automatic acceptance. |
| AC-BACK-03 | Implemented | Real phase predicates or assigned audit/report/currentness/repository/workspace/delivery checks govern pure Verify. Failing predicates refresh rows; unavailable evaluators retain dated rows/error/retry; final material/ownership checks govern acceptance. |
| AC-BACK-04 | Implemented | Successful explicit return resolves only current-target holds; separate pause, billing/workspace, report invalidation/remediation, audit-loop and delivery obligations survive normal next-work routing. |
| AC-BOT-01 | Implemented | Command contracts/parser/literal file/stdin → authenticated versioned route → shared engine; required guards/source exclusivity, identity/availability/reason/receipt/progress and text/JSON meanings remain wired. Old command meanings remain distinct. |
| AC-BOT-02 | Partly implemented | Original-target/token durable retries, auth, readiness-gated handoff, reviewed-message return and help are wired. Shared bot observation/restart inherits the undetected cross-event consumption-order contradiction and missing uncertainty recovery. |

## Confirmed missing behaviors

1. **Cross-event consumption order:** for accepted A then B, the first evidence that B was consumed can arrive alone before any evidence that A was consumed. Later A-only evidence also passes. `observeLiveMessage` compares only the current event's UUID subset with its filtered acceptance subset. `projectMessage` can record both results, the gate independently marks each terminal, and exit/restart accounting sees no unresolved message. This is distinct from valid overlapping terminal results after A already has consumption evidence. The missing safeguard affects browser/bot messages and all three supported activity kinds, live and during saved-event recovery, including already-durable result fields.
2. **Released disabled pause:** `PhaseHandoff:123` still renders `PausePanel` after release. With no separate deferred request, `PausePanel:42` disables its deferred-pause button. Its normal timing paragraph, the other choice's takeover-ready label and the disconnected branch do not explain this disabled action. Phases and both audit kinds share it. This finding requires an explanation, not new action availability.

## Requirement conflict checks and rejected candidate

All ten other PRD/change directories were shortlisted by title/summary: Kiln v1, Codex support, bot control, billing safeguards, completion audits, Continue Added Phases, development deployments, multi-repository delivery, Needs you handoff and usage-limit recovery. Applicable active criteria and replacement pointers were read. No later-built requirement supersedes accepted message order, inconsistent-order uncertainty or disabled reasons beside controls. The per-event validator originated in `f82374c`; the released deferred-button condition originated in `ae33be4`. Neither is a later documented alternative product choice. No new assumption or replacement pointer is needed.

An assessor's unreadable subagent/prior-session workspace-transcript candidate was rejected after the conflict check. Multi-repository AC-OUTSIDE-01 expressly defines unreadable transcripts as failed workspace predicates; AC-OUTSIDE-03 permits human confirmation and AC-OUTSIDE-04 preserves manual repair Resume. Its design explicitly says an unreadable transcript keeps Resume. This PRD preserves those predicates and excludes changing completion evidence; generic check-error wording does not replace that domain policy. Fresh failed rows therefore remain correct for that case. Unavailable current conversation history required for safe release remains subject to separate live ownership/history checks.

## Publication boundary and next unit

In source implementation chat `01a1804a-ad27-7fc0-9317-60119e6ac0c8`, Doug authorized: “Go ahead and push Phase 8, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” That covers Phase 8 publication and this launch only. This audit uses the scoped commit default and holds publication for Doug.

After authorized publication, implement Phase 9 in a fresh chat, then obtain a fresh whole-PRD delivery audit. Test audit follows only when delivery is clean. The successor uses the scoped implementation commit default and holds its later publication for Doug. No production changes or messages to other chats are authorized; bot-control and plan-continuation remain separate tracks. All eight historical leaves retain their Closed lines and original validation qualifications.
