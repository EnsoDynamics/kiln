# Live session control — delivery audit during publication

**Date:** 2026-10-28 (UTC)
**Assessed baseline:** `3562d45` — concurrent bot-control publication `4853d2b` / implementation `29851a2`, rebased live-control test audit `83ab9ef`, and publication metadata. Subsequent edits in this audit change documents only.
**Scope:** [Control a live Kiln session](kiln-live-session-control-prd.md), whole PRD, all nine implementation leaves closed at assessment entry, all 20 active criteria and cross-cutting obligations.
**Outcome:** **13 Implemented; seven Partly implemented through one shared usable-history guard omission.** [Phase 10](phase-10-usable-takeover-history.md) completes the existing requirements. No criterion is superseded, excluded, awaiting a human action or changed outside requirements.

## Why reassessment was required

The initial fetch found `origin/develop` at `5339c2d`; the first push was rejected because separately owned bot-control `29851a2`/`4853d2b` published concurrently. Rebase was clean. Those commits change shared recovery, history and inspection runtime, so the earlier delivery audit's clean currentness could not simply carry forward. No product code or test was changed during this reassessment.

Two full assessment rounds covered all 20 criteria. First readers derived required parts from the PRD, SCOPE-001, complete design and applicable leaves before tracing each browser/bot/provider/recovery entry point. A fresh second group independently repeated the full scope with different groupings, without earlier reports. The main reader checked every Implemented record and missing variant, traced the shared release and Verify paths, and confirmed the single root defect and seven criterion manifestations. Round 1 confirmed that defect; round 2 confirmed no additional missing part/root defect, so assessment stopped. No assumption or acceptance wording was changed.

## Confirmed missing boundary

`src/live/ownership.ts::requireHistory` establishes only a main transcript's existence, nonzero length and absence of a parser problem. A readable metadata-only record, empty JSON object, partial-only record or message explicitly belonging to another session passes. `Engine.reconcileTakeoverOnce` calls that helper after genuine attempt/tool/task/tracked-process and terminal-owner checks, then saves `takeover.state = released`.

The concurrently published `Engine.transcriptMissing → claudeHistoryAvailability` correctly rejects the same files as unusable. Browser snapshot and bot handoff therefore withhold the same-conversation resume command while the hold and browser/bot progress say Paused for terminal takeover. Resume additionally checks the stronger predicate before launch; this is not evidence that Resume starts a peer or bypasses terminal ownership.

Verify still reaches `recoverPhase(verify) → requireTakeoverReturn → requireHistory`, then real `doneCheck/auditDoneCheck`, then `recordDone.finalTakeoverCheck → requireTakeoverReturn`. There is no stronger usability guard on that acceptance path. With otherwise passing completion material and required message reviews, it can accept completion and resolve the hold despite unusable exact-conversation history. Browser and bot share the same authority; phases and both actual audit kinds share these functions. Actual process/terminal identity checks and all other completion predicates remain present.

A real disposable owner-private provider-file probe called the current compiled helpers without network/provider/model effects. Metadata-only, `{}`, partial-only and wrong-session contents passed `requireHistory` while `claudeHistoryAvailability.available` was false. A matching usable user record passed both; garbage was refused by both. The temporary fixture tree was removed. This is direct helper-contract proof plus independently confirmed reachable controller/presentation traces, not an executed full-controller failing integration case. The completion phase requires those missing boundary tests.

## Criterion assessment

| Criterion | Status | Required parts and reachable implementation |
|---|---|---|
| AC-LIVE-01 | Implemented | `App → PhaseDetail`, current activity selection, output/composer/paired-pause/facts order; `CurrentPhase` control link, real phase/audit/provider/session identity; historical detail lacks current controls. |
| AC-LIVE-02 | Partly implemented | `liveView/controlView`, composer exact-attempt drafts, submission/profile/capacity/connection reasons, pending/recovered/ordinary/Codex/final-delivery controls and narrow order exist. Unusable-history branch falsely selects ready state while snapshot hides its command. |
| AC-LIVE-03 | Implemented | Shared `PausePanel` reached from overview/detail/handoff contains both exact timing/consequence choices, actual activity label and explicit action words; narrow source order preserves adjacent explanations. |
| AC-LIVE-04 | Partly implemented | Pending/released and independent deferred/reached presentation/cancellation/next-destination paths exist. Weak history authority falsely reports released rather than pending when resumability is unresolved. |
| AC-MSG-01 | Implemented | Browser/bot → shared journal → `acceptLiveMessage` → existing stdin preserves literal text/UUID/target/accepted sequence, no new process; 4,000-unit visible rejecting validation and authenticated 50-receipt pages retain text/time. |
| AC-MSG-02 | Implemented | Exact composer timing; five honest labels/no-compliance disclaimer; `projectMessage/observeLiveMessage` correlated consumption; bounded write uncertainty and multi-result accounting; no tool interrupt. |
| AC-MSG-03 | Implemented | Durable original target/dedup/write intent, same-gate revalidation, `maybeDrain` all-input settlement, final-observation accounting, saved chronology replay, uncertainty/no resend/no successor and exact draft/receipt retention. |
| AC-MSG-04 | Implemented | Qualified native user-role literal wire, no permission/origin additions, unchanged session/plan effects; normal workspace/billing/completion/audit/delivery boundaries remain separate. |
| AC-MSG-05 | Partly implemented | Exact uncertain receipt/output, safe running takeover, per-message review/restart/late-evidence retention and reconnect guidance exist. Ended reviewed Verify uses the weak history guard and can resolve recovery without usable conversation history. |
| AC-TAKE-01 | Implemented | Browser/bot common journal, same-lock durable hold/operation admission, packaged deny/completed-batch yield; startup/driver/completion hold before automatic continuation; deferred pause independent. |
| AC-TAKE-02 | Partly implemented | Exact PID/start exit, adapter/scanner finalization, operation/task ledger and tracked identities, terminal registry/pending argv, final ledger recheck, pending output/obstacle/retry and natural wait all exist. `requireHistory` does not establish usable exact-conversation history before released/readiness. |
| AC-TAKE-03 | Implemented | Existing `needsYouView → PhaseHandoff` supplies activity/output/message/ending facts and exact correctly quoted cwd/session command, copy only; stronger current history check removes command and retains fresh recovery when unavailable. The false readiness precondition is accounted under TAKE02/LIVE02/04. |
| AC-TAKE-04 | Implemented | Shared exact admission/dedup/ended-target refusal/late-completion hold; `requireTakeoverReturn`, final dispatch/first prompt/acceptance recheck terminal and tracked ownership/material. No second owner or unresolved tracked process bypass found; history-content omission is recorded separately. |
| AC-TAKE-05 | Implemented | Original activity times across replay/reconciliation/restart, request/reason/output and elapsed-wait language; gate deny/yield preserves unfinished work; observation deadlines never become cancellation/forced provider stop. |
| AC-BACK-01 | Implemented | Existing `PhaseHandoff` terminal/reply/Back from terminal grouping, actual phase and both audit labels/rounds, exit-first/requirements/no-special-phrase guidance; stopped reply and live Send remain distinct. |
| AC-BACK-02 | Implemented | Exact recovery target, real fresh completion check and explicit complete/unsent acknowledgement; original conversation/task/round Resume for unfinished/dirty work, launch restrictions and strengthened late history checks, no automatic complete advancement. |
| AC-BACK-03 | Partly implemented | Real assigned report/currentness/repository/workspace/development/delivery checks, fresh rows/time, retained dated error rows/retry, no manufactured finishing effects and final material revalidation exist. Final explicit acceptance repeats weak history helper rather than proving usable conversation. |
| AC-BACK-04 | Implemented | Successful explicit current-target return resolves only reviewed holds; deferred pause/billing/workspace, audit invalidation/continuation/remediation/development/delivery and normal next-work scheduling remain enforced. Final history precondition is accounted under BACK03. |
| AC-BOT-01 | Partly implemented | Built grammar/client literal file/stdin/token/ID validation, authenticated exact journal and text/JSON projection exist; separate stopped reply/deferred pause/read-only handoff preserved. Status forwards false released progress for unusable history. |
| AC-BOT-02 | Partly implemented | Authentication/exact retained retry target/durable receipts/no resend, per-message reviews, readiness-gated non-launching handoff and help exist; actual handoff uses stronger history availability. `verify-and-advance` inherits BACK03's weak final history acceptance. |

## Conflict check, scope and completion work

The existing design's Release is a separate fact explicitly requires readable and usable exact-conversation history; Ownership admission applies history checks before resume or completion acceptance. All criteria remain active. `requireHistory` is byte-identical to `5339c2d` and originated in earlier live-control implementation; this is a historical missed omission. Bot-control Phase 9 strengthens ordinary history/inspection and explicitly preserves live release rules; it neither supersedes nor intentionally relaxes this contract. No new product choice, assumption, capability or scope is introduced.

One bounded repair covers all seven affected criteria in Phase 10. The original owner remains Phase 1, 2 or 3 as listed there; all nine earlier Closed lines and leaf bytes remain unchanged. This audit writes no runtime or test repair. The earlier Done/all-Adequate test result is historical for its actual tested boundaries; affected rows now wait on delivery. After the completion phase, obtain a fresh whole-PRD delivery audit, then reassess affected test rows while retaining unchanged evidence.

Qualification remains Claude Code 2.1.311/macOS, observed/tracked operation/process release and Kiln-controlled terminal admission. No provider-wide independent-launch exclusion or universal descendant/remote-effect containment is claimed. SCOPE-001 remains proposed. Preserve all earlier validation records, including Phase 8's unrelated baseline failure and each full-run-plus-focused/repaired-test portfolio.

## Publication verification

After the clean rebase, `npm run build`, ESLint, TypeScript/Svelte checks (zero errors/warnings) and all **639 unit tests** pass. The affected current integration invocation passes **73 of 73 cases in seven files**, no skips: takeover 24, built live commands 10, live help 4, ordinary command/late-history/transport cases 18, released/reached audit browser 14, uncertain disconnect/reconnect browser two, and installed-SDK usable-history one. These passing tests do not exercise the newly confirmed release/Verify history-content hole; they are compatibility evidence, not proof the missing behavior is built.

The first sandboxed integration attempt ended with five passes, 52 failures and 16 skipped cases, including explicit child-process `spawn EPERM` and denied loopback readiness. The same source, assertions and command reran outside that sandbox and passed all 73 (exit 0). No application, test, deadline or safety assertion changed for that retry. The final unit/lint/type invocation also exited 0. Original full-run and repaired-test portfolios remain distinct historical evidence; no new full repository integration run or authenticated provider rerun is claimed. The provider adapter/profile is unchanged. The helper probe above ran against disposable files only.


## Authority and successor

Doug's exact publication instruction in chat `01a18274-6992-7ae2-bee2-a8b93feecda8` is recorded in the phase plan and Phase 10. It authorizes publishing the scoped audit and accurate reassessment/planned successor to develop. No production changes or messages to other chats are authorized. The next unit is implement-from-requirements on [Phase 10](phase-10-usable-takeover-history.md), in a fresh chat. Its scoped commit default applies; its later publication remains held for Doug.
