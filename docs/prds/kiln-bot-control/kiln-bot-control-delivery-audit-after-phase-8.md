# Kiln bot control — whole-PRD delivery audit after Phase 8

**Date:** 2026-10-28 (UTC)
**Baseline:** `f11ecd90ab70c530dbe7035e83d028838a0e8762`, published Phase 8 implementation `a8d208e` and publication record `f11ecd9`.
**Scope:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md), whole PRD, all eight closed implementation leaves and all 18 active criteria, including cross-cutting obligations.
**Outcome:** **8 Implemented; 10 Partly implemented.** [Completion Phase 9](phase-9-complete-kiln-inspection-input.md) carries the confirmed missing parts. Whole-PRD test audit waits for completion and a fresh clean delivery audit.

Four full assessment rounds covered every active criterion with fresh independent readers, regrouped between rounds. Readers derived required parts from the requirements before tracing source. The main agent reviewed every Implemented record for omitted variants, confirmed findings against source, checked siblings and ran reverse requirements/history checks. The rounds confirmed **3, 5, 4, 1 new missing-part records**, respectively, grouped into eight families below. Billing/credit fields, legacy dates, duplicate selectors and ordinary recovery expand the shared families. The fourth round still confirmed an additional ordinary-recovery availability variant; assessment ended at the skill's four-round limit, not a claim that another audit can find nothing else. This is a delivery assessment, not a test-adequacy grade. No implementation or test files changed.

Retired AC-ACCOUNT-02–04 remain excluded. No active criterion is fully superseded. AC-ACT-01/02/03 retain their recorded partial supersessions to the independently owned live-control track. Original ownership and all Closed lines remain intact.

## Criterion assessment

| Criterion | Status | Reachable behavior and remaining part |
|---|---|---|
| AC-SEE-01 | Implemented | `runInspectionCommand → inventory → enumerateWork/readWork/controller` implements any-cwd, cross-repository, owner-controlled authenticated discovery, all live states, stopped unfinished work, separate counts, explicit empty/incomplete inventory and correct closed-work omission. |
| AC-SEE-02 | Partly implemented | `statusProjection → inspectionSnapshot/buildSnapshot`, phase/activity views and `latestActivity` expose plans/counts, nested/audit/delivery identity, dated activity, waits, pauses and completion/PRs. The separate unchecked `modelSession` read can attribute an unowned record's requested/effective model. |
| AC-SEE-03 | Partly implemented | Collection dates, retained labels/disabled controls and main account/usage/billing observations are independently dated. Nested Claude waiting/Needs-you usage loses its usage date; legacy history account observations omit their unavailable date/availability. |
| AC-SEE-04 | Partly implemented | Normal live/cached status preserves the browser's complete stop/check/message/request/recovery facts. Missing-sidecar fallback can attribute unowned session text, requests and agent to the current stop. |
| AC-SEE-05 | Partly implemented | Execution-bound current/historical/no-session handoff preserves provider commands, cwd, prompts and fresh alternatives, checks ownership after awaits and starts no turn. Claude's one-byte transcript check can falsely promise resumability for wholly corrupt history. |
| AC-SEE-06 | Partly implemented | Active/latest/selected logs retain saved-entry ceilings, the complete 16,384-byte stdout cap, exact scalar fragments, chronological frozen paging and stable collection-time sizing. Unpaged descriptor reuse skips required metadata validation and output-specific failure translation. |
| AC-SEE-07 | Implemented | Every scoped command uses `targetWork/resolvePrdPath`, caller cwd, exact canonical/file/authenticated-alias matching and execution binding; names do not select work and old cursors/receipts cannot retarget it. |
| AC-SEE-08 | Partly implemented | `readHistory`, selected handoff, disk-backed arrays and response spools expose owned conversations/attempts and explicit ordinary read failures. Malformed provider IDs/duplicate selectors can appear in complete history; audit sidecars bypass inspection read guards; historical Claude handoff shares the availability gap. |
| AC-ACT-01 | Implemented | Packaged help/parser covers all 27 command/group/leaf contracts, complete helper inputs, value sources, request-first examples and both reply forms; bare invocation points to help. `controlView/statusProjection` supplies availability/reasons. |
| AC-ACT-02 | Partly implemented | CLI/browser journal admission and `applyControl/recoverPhase` preserve reply/resume/Verify distinctions, unsent receipts, dedicated recovery and plan/pause/authority rules. Ordinary Claude controls can still offer same-session recovery when only a corrupt transcript filename exists. |
| AC-ACT-03 | Implemented | Journal-backed pause/cancel/continue/recheck/settings/outside confirmation preserve browser eligibility, deferred/pending-only behavior, returned settings and evidence-bound confirmation without implicit completion or dispatch. |
| AC-ACT-04 | Implemented | Execution/epoch/material-state tokens, canonical input digests, replay-before-eligibility, durable refusals and shared browser/automatic admission prevent stale retargeting or duplicate effects across restart/replacement. |
| AC-ACT-05 | Implemented | Fsynced intent, operation/attempt/completion correlation, provider-history delivery evidence and reconciliation preserve distinct acceptance/effects/outcome, lifetime receipts and indeterminate effects without speculative redispatch. Existing launch/authority guards remain. |
| AC-ACCOUNT-01 | Partly implemented | Actual/original attempt provenance remains separate from next authentication; provider windows, account corroboration, billing and recovery/credit separation are wired. Nested Claude usage freshness and explicit partially known observation fields remain incomplete. |
| AC-CLI-01 | Partly implemented | Shared versioned projections/serializers, finalized stdout/HTTP, stable ordinary exits, zoned dates, noninteractive operation, complete help and preserved legacy execution contracts are wired. The observation, identity, resource, descriptor, history-availability and expired-input branches below violate the common contract. |
| AC-CLI-02 | Partly implemented | Literal UTF-8 file/stdin messages, spaced/exact targets, strict input allowlists, JSON/argv transport and credential-free public projections are wired. A command request whose body times out can still reach admission. |
| AC-CLI-03 | Implemented | Current-user owner/permission/symlink checks, loopback binding, Host/token/Origin middleware, no redirects/CORS and operator-authority/untrusted-output guidance remain in place. |
| AC-CLI-04 | Implemented | [Release validation](kiln-bot-control-validation.md) records actual Grok Bot 0.75.8/default configuration, both providers, concurrent PRDs/unrelated cwd, exact stop/reply/continuation, terminal-history resume, unsent completed reply, Verify and replay/stale protection. Its fixture limits remain explicit; no new demonstration was run. |

## Confirmed missing parts

### 1. Nested Claude usage freshness

`src/engine/snapshot.ts::limitView` copies Claude usage percentage, reset and blocking-limit facts from `reading.limits`, but exposes only authentication `reading.updatedAt` as `limit.account.at`. It never carries `limitsObservedAt`. `waitingView/needsYouView → src/control/projection.ts::publicLimit/statusProjection` forwards this through ordinary/full live and retained status and inventory. `retainedLimit` only adjusts Codex; the separately correct full `account.usage` does not repair ordinary detail's nested facts.

An unchanged built-function probe supplied usage at `2026-10-28T02:01:00.000Z` and final authentication at `02:02:00.000Z`. Both waiting and stopped views returned percentage 87 beside only `at: 02:02:00.000Z`. Preserve independent observation dates and unavailable/stale states without changing launch or recovery permission.

### 2. Unvalidated fallback session attribution

`src/control/projection.ts::statusProjection` reads `modelSession` with `privateJson` alone, unlike the identity/binding checks in `inspectionReader/readHistory`. It uses that record for requested/effective model and, without a matching stop sidecar, final message, Codex human requests, agent and `message_complete:true`.

Disposable real saved files for both providers reproduced a foreign execution's model/final text in the selected execution's stop; Codex also exposed its foreign human request. `readHistory` reported the ownership error, but the wrong facts remained attributed. Check selector, storage key, execution and proven legacy binding before using any session facts, across live fallback and retained paths. An error elsewhere does not authorize presenting the rejected record as this stop.

### 3. Public observation unknowns and undated legacy provenance

`publicLimit` forwards optional nested identity/plan/percentage observations unchanged. `src/control/history.ts::readHistory` forwards `attempts[].billing` raw; `publicAccount/publicBilling/billingFacts` likewise retain raw optional credit fields. Unreported provider/email/org/account/plan/credits/overflow fields and partially known credit `balance/hasCredits` can disappear rather than explicitly remain unknown. Pure built projections confirmed raw historical billing and a credit row with known balance but no explicit unknown `hasCredits`.

The history projection also exposes legacy `attempts[].account` as email/org without an observation date/state/reason, although `accountFacts` correctly records that legacy identity has no observation date or plan. Preserve genuinely recorded identity and independently known credit facts; explicitly represent unavailable fields/dates, never borrow attempt-start or nearby observation dates. This is presentation/provenance correction, not new spending or launch policy.

### 4. Invalid conversation identities reported complete

`src/control/history.ts::readHistory` accepts any truthy Codex `conversation.threadId` as a known provider ID. It also checks each session's directory identity separately without enforcing execution-wide selector uniqueness.

A disposable owned record with `threadId:42` produced `complete:true`, provider ID 42 and `identity_availability:known`, with no errors. Two owned phase records with the same Kiln selector likewise produced complete history with duplicate selectors; selecting that listed ID then returned `target_not_found`. Validate supported provider identity and cross-record uniqueness; preserve collected valid facts with explicit corrupt/unknown/incomplete state rather than inventing or substituting IDs.

### 5. Audit sidecars bypass inspection resource guards

Live `inspectionSnapshot → buildSnapshot → activityViews` calls `acceptedAudit/AuditStore.read` for accepted/latest audit results and WorkSnapshots. `src/audit/storage.ts::bytes/read` uses unrestricted `readFileSync/JSON.parse`, bypassing inspection ownership/allocation/deadline checks and the design's 16 MiB atomic JSON read budget. The submitted-report 8 MiB cap does not bound WorkSnapshots.

An unchanged built `activityViews` function consumed a 17,825,833-byte content-addressed snapshot and returned normal audit details despite the 16,777,216-byte inspection budget. This was a pure helper/source-path probe, not a controller memory stress test. Guard the inspection path and report unavailable facts honestly; ordinary audit acceptance/storage/currentness semantics remain independently governed. The missing-`activities` fallback in `activityHistory` is excluded: Engine construction materializes activities before the bot entry point.

### 6. Reused output descriptor validation and errors

`src/control/logs.ts::outputPage`'s unchanged-boundary unpaged branch loads a reused descriptor with bare `privateJson`, skipping the cursor branch's version/identity checks and output-specific failure translation.

A disposable unchanged output boundary with a corrupt descriptor returned generic `state_unavailable`; the corresponding cursor read correctly returned `saved_output_unavailable`. Changing only descriptor `version` to 2 still returned a successful unpaged page. Validate reused metadata/binding and return the promised output error while preserving frozen content, exact fragments and the byte cap. Descriptor write failures remain durable-write failures rather than being relabelled indiscriminately.

### 7. Cancelled command-body reads still reach admission

`src/control/server.ts`'s command route cancels its reader after five seconds but records no expiration flag. When complete valid instruction JSON arrives without body EOF, cancellation ends the loop and the buffered instruction is parsed and submitted. Sibling account-refresh and CLI message readers explicitly reject their deadline.

The actual versioned Hono route, given a Web Request with withheld EOF and a recording control host, cancelled at 5,041 ms, called `submit` once and returned HTTP 202/success. This probe applied no engine/journal/provider effect and was not a full loopback test. Reject expired/incomplete transport input before admission, preserving the existing durable replay and authority rules.

### 8. Claude handoff and ordinary recovery availability inferred from file access

`src/control/projection.ts::handoffProjection` finds Claude's transcript filename, checks regular-file/nonempty status and reads one byte. It never establishes usable history contents before returning `resumable:true` and `provider_history:available`.

A disposable transcript containing only `garbage` returned those availability claims. The installed official Claude Agent SDK 0.3.310 returned no session metadata and zero messages. A positive control with a valid user record returned session metadata and one message; replacing that same file with garbage returned neither. These were metadata-only file reads, without a provider turn. Missing retained instructions separately made the handoff incomplete; that error did not remove its false history/resumability claims. The fourth-round sibling check also found `Engine.resumeOffered → transcriptMissing` using filename presence alone for ordinary Claude recovery. An unchanged built eligibility-method probe with a previously started/initialized session and garbage transcript returned `transcriptMissing:false` and `resumeOffered:true`. The stronger takeover-only history check does not guard ordinary recovery. AC-ACT-02 and prerequisite AC-COMPAT-01 require the fresh-session alternative when no usable conversation is available. Check usable history within the read budget for handoff and ordinary eligibility, preserve supported partial/legacy transcripts and fresh-session alternatives, and retain exact commands/prompts and ownership guards. The eligibility probe admitted no operation and started no attempt.

## Reverse requirements conflict checks

Independent reverse checks read all 11 requirement-root titles/summaries and relevant full criteria/designs, then checked introducing source history. No later requirement replaces these obligations, and no coherent chosen alternative or unsettled business rule needs an assumption or pointer pair.

- Bot independent-observation/unknown contracts remain current. Earlier Claude limit presentation (`325eb25`) predates bot requirements (`b4cfa93`); later observation repairs leave this nested path behind. Billing/Codex requirements preserve independently known credit facts without inferring missing values or authority.
- Initial inspection `59494c5` introduced the unchecked session read, truthy provider IDs, raw public observations, descriptor reuse and one-byte Claude availability check after the relevant ownership/history contracts. Later live-control supersessions extend AC-ACT-01/02/03; they do not replace these read guarantees.
- Completion-audit immutable sidecars and report limits remain compatible with the newer inspection read budget. This finding changes inspection access, not audit acceptance or the other track's work.
- The cancellation-only command reader originated in `c25bf89`; no later requirement permits accepting timed-out input. The design already requires an input timeout to be an error.
- Duplicate selectors contradict the original unique-within-execution contract. Legacy identity remains known only to the extent recorded; its missing date is explicitly unavailable.

Retained legacy bindings can themselves preserve execution-reference evidence, so an absent current PRD reference alone is not a confirmed gap. Codex recovery dates describe a post-corroboration permission conclusion; that is not the earlier raw gauge acquisition time and is not a finding.

## Validation and limits

`npm run build` passed from the fresh worktree. All **56 root/group/leaf text/JSON help invocations** passed from unrelated `/private/tmp` with empty PATH; bare invocation returned exit 2 with the help pointer. All **37 packaged examples** parsed. The bounded disposable probes above used built code, real private files, read-only SDK metadata, or the explicitly scoped pure-function/route boundaries. Disposable files were removed. No provider turn, sign-in/account change, bot re-demonstration, production action, test mutation or test-adequacy grade occurred. Unit/integration/package/full suites were not rerun for this document-only audit.

[Phase 8 Final verification](phase-8-complete-kiln-bot-inspection.md#final-verification) remains **non-green**: its final complete verify passed security/lint/typecheck, 639 unit tests and 17 provider-contract checks; integration finished 925 passed, four failed and two skipped across 81 files. The four exact failures were reproduced on published baseline `04b2a83`: three installed-Claude qualification cases and the separately owned live-control takeover case. This audit does not reclassify them, requalify billing or adopt live-control fixes. Phase 7/6 Final verification and Phase 5 Known baseline failures retain their original non-green limits, isolated outcomes and unestablished timing/port attributions. Existing provider/Grok release evidence remains separately scoped in [release validation](kiln-bot-control-validation.md).

The assessment source remained at `f11ecd9`; runtime/test/package resources were unchanged. A temporary dependency symlink was used for the build and removed before commit. Only this PRD's five audit/planning documents change. Local link, unchanged-requirement-body, Closed-line, scope/staging, secrets and whitespace checks accompany the document commit.

## Completion sizing and handoff

One [completion Phase 9](phase-9-complete-kiln-inspection-input.md) groups these existing command-boundary corrections: guarded inspection facts/history, public observations, recovery availability, reused output metadata and expired input admission. They share existing readers/projections/result handling, add no new service/state machine/command or authority, and fit one implementation session. Splitting these small corrections would repeat whole build/review/audit overhead without an independent delivery seam. Phase 1 retains its nine affected criteria and Phase 2 retains AC-ACT-02; every prior Closed line and supersession remains intact.

Build Phase 9, then repeat whole-PRD delivery audit in a fresh chat; test audit follows only current clean delivery. There are no criterion rows Waiting on a human action or Changed outside the requirements and no unresolved business question.

## Publication boundary

Doug's exact instruction in source chat `01a1808a-407c-7e53-8ab2-0ce47095ff33` was: “Go ahead and push Phase 8, then launch a fresh chat using GPT-6.1 Sol with high reasoning for the whole-PRD delivery audit.” Phase 8 publication is complete. That instruction authorized this audit's launch, not publication of its future commits, implementation of newly found gaps, the later test audit or production release. The starting prompt in this audit chat, `01a1819b-0071-7ef2-a8f4-ba816f72d229`, explicitly holds publishing future audit/implementation commits and production release.

Scoped audit documents commit under the delivery-audit default and remain **local, not pushed**. The continuation below is valid only after Doug authorizes publication, the audit commit is published and the shared checkout fast-forwards, and Phase 9 implementation is explicitly authorized. Do not reuse this audit worktree; other tracks stay independently owned.

## Phase 9 continuation

The prepared machine-specific continuation accompanies this audit's commit. It uses `implement-from-requirements` on [Phase 9](phase-9-complete-kiln-inspection-input.md), with this audit's confirmed missing parts, validation limits and Publication boundary as the source of work state. Its publication and implementation-launch prerequisites remain in force.

## Audit publication and Phase 9 launch authorization

On 2026-10-28, Doug instructed in this audit chat, `01a1819b-0071-7ef2-a8f4-ba816f72d229`: “Go ahead and commit and push, and then go ahead and launch a new chat to implement page nine.” In this plan, that names completion Phase 9, “Complete truthful inspection and bounded command input.” This authorizes publication of the audit (original local `950ac08`, rebased publication commit `9fa8b04`) and its authorization/handoff record, then launching a fresh Phase 9 implementation chat. It supersedes this audit's publication and implementation-launch holds above.

Scoped implementation commits follow the implement skill default. Publication of future implementation/later-audit commits and production release remain held. The successor starts from published `origin/develop` after the shared checkout fast-forwards, in its own fresh worktree. The audited source, criterion ownership, supersessions and historical non-green verification limits are unchanged; this publication adds documents only. Other tracks remain independently owned.

Publication rebased the audit from original local `950ac08` to `a596afa` over independently published live-control `23bd3c3`. The incoming runtime delta preserves first-consumption message order across events and adds the released-pause explanation; it does not change bot inspection readers, observation normalization, ordinary recovery-history checks, log descriptor handling or command-body admission. Bot requirement bodies and existing partial supersessions are unchanged. The audit assessment baseline remains `f11ecd9`; this is compatibility review of the publication boundary, not a new whole-PRD audit or a reclassification of historical test gates. Document links and unchanged requirement bodies were rechecked; no runtime suite was rerun for this documentation-only publication.

A concurrent documentation-only live-control publication record `9a643ca` required one further fast-forward publication rebase. The final audit publication commit is `9fa8b04` (original local `950ac08`, intermediate `a596afa`). The incoming record changes only the other track's publication/launch notes; source, bot requirements, findings and verification limits are unchanged.
