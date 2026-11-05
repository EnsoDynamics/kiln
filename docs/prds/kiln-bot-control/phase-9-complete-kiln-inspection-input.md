# Phase 9: Complete truthful inspection and bounded command input

**Closed:** 2026-10-28 — local completion; publication held. Final verification records the non-green full gate and exact baseline/focused outcomes.

**Added by delivery audit:** 2026-10-28, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: “Common result and errors”, “Status, Conversations and Handoff”, “Output Pages”, “Account and Usage Facts”, “Command grammar”, “Validation Boundaries”.

## Summary

Finish truthful inspection of saved/current sessions and observations, and reject expired command input before it can be admitted.

## Acceptance criteria covered

AC-SEE-02 (completes it; owned by phase 1), AC-SEE-03 (completes it; owned by phase 1), AC-SEE-04 (completes it; owned by phase 1), AC-SEE-05 (completes it; owned by phase 1), AC-SEE-06 (completes it; owned by phase 1), AC-SEE-08 (completes it; owned by phase 1), AC-ACT-02 (completes it; owned by phase 2), AC-ACCOUNT-01 (completes it; owned by phase 1), AC-CLI-01 (completes it; owned by phase 1), AC-CLI-02 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-02:** `src/control/projection.ts::statusProjection` directly reads `modelSession` without selector/storage/execution/legacy-binding validation, so live fallback and retained detail can attribute a rejected record's requested/effective model.
- **AC-SEE-03:** `snapshot.ts::limitView → publicLimit` loses Claude waiting/Needs-you usage's `limitsObservedAt`; retained normalization only handles Codex. `history.ts::readHistory` also exposes undated legacy attempt account observations without an unavailable-date/availability label.
- **AC-SEE-04:** The unchecked `modelSession` supplies missing-sidecar fallback stop text, Codex human requests and agent, including `message_complete:true`, even when history rejects the record's ownership.
- **AC-SEE-05:** `handoffProjection` promises Claude history availability/resumability after filename/stat/one-byte access, including wholly corrupt transcripts, rather than establishing usable history within its read budget.
- **AC-SEE-06:** `logs.ts::outputPage` reuses unpaged snapshot descriptors without the cursor branch's version/identity validation or `saved_output_unavailable` translation for corrupt/unreadable metadata.
- **AC-SEE-08:** `readHistory` can label malformed Codex provider IDs and duplicate execution-local selectors as complete/known. `inspectionSnapshot → buildSnapshot → activityViews → acceptedAudit/AuditStore.read` bypasses inspection owner/allocation/deadline guards for audit results/WorkSnapshots. Selected historical Claude handoff shares the availability gap.
- **AC-ACT-02:** `Engine.resumeOffered → transcriptMissing` treats an existing Claude transcript filename as resumable even when its contents are wholly corrupt; ordinary recovery lacks the takeover-only history check and can promise same-session continuation instead of exposing the fresh-session path.
- **AC-ACCOUNT-01:** Nested Claude usage freshness and public optional account/credit observation fields remain incomplete; preserve actual/original/next-attempt separation, provider windows and independent recovery permission.
- **AC-CLI-01:** The preceding paths violate explicit unknown/freshness/identity/resource/error contracts. `publicLimit`, raw historical billing, partial credit rows and legacy attempt identity still omit unavailable observation fields/dates.
- **AC-CLI-02:** `src/control/server.ts`'s command-body timer cancels reading but then parses/admit-submits complete buffered JSON without EOF; expired input must fail before admission.

The [after-Phase-8 audit](kiln-bot-control-delivery-audit-after-phase-8.md) records every confirmed variant, source path, bounded reproduction, four review rounds and reverse conflict checks. No new business assumption, criterion or authority is needed.

## Phase dependencies

1 (inspection/help/input); 2 (durable command admission); 5–7 (actual-attempt provenance and provider observation contracts); 8 (guarded/spooled inspection, observation normalization and stable output pages).

## Scope and proof boundaries

This is one completion of the existing bot command contract. Keep original criterion ownership, all Closed lines and partial supersessions. Preserve pure retained reads, supported legacy binding/transcripts, existing independently dated account and recovery conclusions, helper execution contracts, exact messages/scalar fragments, frozen output and byte caps. Optional observation failures remain optional for launch. Inspection read guards and ordinary recovery availability must preserve separately governed audit acceptance/currentness, valid browser recovery and live-control behavior. Descriptor write failures retain their durable-write meaning.

Prove every covered criterion as a whole through the design's existing validation boundaries, including:

- Both providers' live/basic/full/retained status and inventory; foreign/mismatched/unbound sessions cannot contribute model/stop facts. Retain valid stopped messages, human requests and dated recovery facts with explicit unavailable observations.
- Independently delayed Claude usage/authentication, waiting and Needs-you nested facts, disconnected caches, legacy undated attempt identity, missing nested identity/plan/percentage, raw historical billing and partially known credits. Preserve known fields; represent unknown fields/dates explicitly without borrowing nearby dates or changing authority.
- Malformed/missing Codex IDs and duplicate local selectors across owned phase records; full-history completeness and selected handoff must report integrity/availability honestly.
- Actual inspection entry points with oversized, unsafe, missing/corrupt and late audit sidecars as well as ordinary session history, using the 16 MiB record budget, bounded aggregate memory and valid finalized text/JSON. The audit's pure helper probe is not controller resource proof. The constructor-initialized `activityHistory` fallback is not a confirmed finding.
- Unpaged descriptor reuse and cursor reads with corrupt, unsupported, mismatched and unreadable metadata, stable pages and exact output errors; preserve 50/default, 1–200 entries and 16,384-byte complete stdout.
- Claude current/historical handoff and ordinary reply/resume eligibility with valid, wholly corrupt, partial/legacy and unavailable provider history; metadata-only reads establish availability without a model turn. Preserve ownership rechecks, fresh-session alternatives and exact provider commands/prompts; unavailable ordinary history starts no same-session attempt.
- Real versioned request/journal boundaries with complete JSON but withheld EOF, partial bodies, five-second timeout, body-read errors, valid timely EOF and replay. Expired input admits no operation/effect; valid inputs retain existing durable semantics. The audit's recording-host route probe does not prove journal/dispatch behavior.

After this phase closes, repeat whole-PRD delivery audit in a fresh chat, then whole-PRD test audit only when delivery is clean. [Phase 8 Final verification](phase-8-complete-kiln-bot-inspection.md#final-verification), Phase 7/6 Final verification and Phase 5 Known baseline failures retain their non-green full-gate limits. Existing provider/Grok release evidence remains separately scoped in [release validation](kiln-bot-control-validation.md).

## Publication boundary

The [audit's Publication boundary](kiln-bot-control-delivery-audit-after-phase-8.md#publication-boundary) records Doug's actual instruction and source chats. Scoped audit/implementation commits follow their skill defaults. Publishing future audit/implementation commits and production release remain held. This phase is planned, not authorized to launch by the prior Phase 8/audit instruction; the audit's continuation is valid only after authorized audit publication and explicit implementation authorization. Other tracks remain independently owned.

## Implementation launch authorization

Doug authorized publication of the after-Phase-8 audit and launch of this Phase 9 implementation chat on 2026-10-28. The exact instruction and source chat are recorded in the [audit publication and launch authorization](kiln-bot-control-delivery-audit-after-phase-8.md#audit-publication-and-phase-9-launch-authorization). This supersedes the launch hold above. After audit publication and shared-checkout fast-forward, the prepared fresh-chat continuation is valid immediately. Scoped implementation commits follow the skill default; publishing future implementation/later-audit commits and production release remain held.

## Implementation

Saved session attribution now shares the inspection reader's schema, selector, storage-key, execution and proven-legacy-binding checks before contributing model, message, request or agent facts. Full history explicitly reports malformed provider IDs and execution-wide duplicate selectors; ambiguous selectors cannot select handoff. Known legacy account fields retain explicit unavailable observation dates and plan fields. Public account, billing and credit projections preserve independently known values and dates while identifying missing fields; retained credit observations are stale.

Claude waiting and stopped usage views retain their own allowance observation date independently of later authentication, with explicit nested unknowns and pure retained stale normalization. This changes presentation only; authentication, optional-observation launch behavior, provider windows, recovery permission, original/actual/next-attempt provenance and spending authority remain governed by their existing boundaries.

Inspection injects owner-controlled, regular-file, checksum-checked audit reads with the existing 16 MiB per-record allocation guard and shared deadline. Ordinary audit storage, acceptance and currentness keep their own reader. Synchronous parse completion is checked before returning facts; a failed inspection remains an explicit unavailable result. Claude history scans inside inspection inherit the same deadline. Browser-only timing and audit acceptance semantics remain separate.

Unpaged descriptor reuse and cursor reads share metadata validation. Both verify generation, file identity, frozen prefix and the final pinned record number; missing, corrupt, unsupported and unreadable metadata returns the output-specific unavailable error. Descriptor write failures retain their durable-write meaning. Existing frozen fragments, entry ceilings and complete-response byte limits remain intact.

Claude current/historical handoff and ordinary recovery establish usable user/assistant history with bounded directory/file/record reads, supporting partial trailing and legacy message records without a model turn. Wholly corrupt, missing, unsafe and unreadable history cannot promise same-session continuation; fresh-session instructions remain available. The dispatch boundary rechecks history after awaited metadata/ownership checks and before recording or starting a resumed attempt, preserving unsent replies and `not_started` effects when history disappears. Existing live-control ownership/release rules remain unchanged.

Command-body reads require timely EOF. A five-second expiration or read error fails before parsing/admission, including complete buffered JSON with withheld EOF. Cancellation cannot convert buffered input into an accepted instruction; valid timely input and durable replay retain their existing semantics.

## Covered-criterion evidence

| Criterion | Boundary evidence |
|---|---|
| AC-SEE-02 | Live basic/full status and inventory plus pure retained CLI reject foreign model/session attribution for both providers; existing plan/activity/model/count/completion portfolios remain. |
| AC-SEE-03 | Claude waiting/stop tests distinguish usage and authentication dates, explicit nested unknowns and disconnected stale facts; existing independently delayed provider/actual-attempt suites remain. Historical undated identity and partial credit rows expose their own dates and availability. |
| AC-SEE-04 | Exact owned stop messages/requests remain; foreign/mismatched/unbound records cannot supply message, requests, agent or completeness. Missing-sidecar reads preserve valid saved facts with explicit unavailable recovery. |
| AC-SEE-05 | Current/historical Claude handoff tests use valid, wholly corrupt, foreign-message and partial transcripts; fresh instructions and exact provider commands remain. Installed official Claude SDK metadata independently checks valid/partial/corrupt JSONL without a turn; Codex ownership/history and no-session tests remain. |
| AC-SEE-06 | Unpaged text/JSON tests cover descriptor corruption, version, identity, byte-boundary, date, final-number and unreadability failures with output-specific errors; cursor corrupt-metadata regression exercises the shared reader. Existing full fragment reconstruction, frozen replay, entry limits and 16,384-byte final serializers remain. |
| AC-SEE-08 | Malformed provider IDs and duplicate selectors produce explicit incomplete history and refused ambiguous handoff. A real controller and CLI with 48 MiB heaps read audit results/WorkSnapshots through both final serializers, rejecting oversized/unsafe/missing/corrupt evidence; a narrow late-parse injection proves finalized unavailable HTTP responses. Existing complete/incomplete large-history and cleanup tests remain. |
| AC-ACT-02 | Real engine/Git/provider-peer tests reject ordinary reply/resume for corrupt history without another attempt; loss during real awaited billing metadata also starts nothing and preserves unsent effects. Valid/partial history and existing completion/Verify/authority behavior remain. |
| AC-ACCOUNT-01 | Existing real metadata contracts and actual/original/next-attempt tests combine with nested Claude usage dates, historical legacy identity, explicit missing account/billing fields and independently dated partial credits. Optional observations add no new launch/recovery authority. |
| AC-CLI-01 | Shared text/JSON projections, final response spools and actual CLI/HTTP errors cover the corrected unavailable/freshness/identity/resource/output paths. Existing packaged help/helper contracts remain. |
| AC-CLI-02 | Real versioned route plus engine/journal waits for the actual five-second deadline with complete and partial bodies, accepts no operation/effect, handles body-read error, then accepts timely EOF once and replays one durable receipt. Existing literal message, target and security portfolios remain. |

## Review and verification

Independent deliverable review found and the implementation fixed shared Claude inspection-deadline propagation and final output-record metadata consistency. Its final source/receipt review is clean. The first affected portfolio passed 62 cases; two inspection failures (controller probe deadline and a restart fixture stopped before initialization) passed the targeted rerun. Restart fixtures now wait for initialization before stopping, preserving their original assertions/deadlines and ensuring their same-session recovery premise is real.

A broader six-file affected portfolio completed with 105 passed and one failure: an exact old Claude usage-limit object assertion omitted the newly required unavailable-observation fields. Its exact expected object now includes those fields; no assertion or deadline was relaxed. All eight review regressions passed afterward (51.86 seconds). All 639 unit tests passed (5.53 seconds). The full repository/package gates and independent test-hardening outcome are recorded at final closeout below; these earlier portfolios are not a substitute for those gates.

Independent test hardening identified one missing positive legacy-binding proof. Both providers now have matching-binding text/JSON CLI tests asserting complete history, exact stop/model/provider facts and unchanged saved bytes, plus creation-date mismatch rejection. Both cases pass (7.32 seconds). The independent reassessment grades all ten whole covered criteria adequate, with no remaining evidence gap or unjustified mock. No deliberate red checks or whole-PRD test audit ran.

## Publication and fresh-audit handoff

The launch authorization above remains the governing boundary: Doug's exact instruction in source chat `01a1819b-0071-7ef2-a8f4-ba816f72d229` was “Go ahead and commit and push, and then go ahead and launch a new chat to implement page nine.” Audit `9fa8b04` and authorization `118c659` were already published when this implementation began. Scoped implementation commits follow the skill default. Publishing Phase 9 or later audit/implementation commits and production release remain held; this chat does not inherit a standing publication or successor-launch grant.

After authorized Phase 9 publication and shared-checkout fast-forward, repeat whole-PRD delivery audit in a fresh chat and worktree from published `origin/develop`. Do not reuse this implementation worktree. Test audit waits for a current clean delivery audit. Preserve original criterion ownership, every prior Closed line, all partial supersessions, Phase 8/7/6/5 historical non-green limits and the independently scoped provider/Grok release evidence. Other tracks remain independently owned.

### Prepared fresh-audit continuation

This prompt is valid only after authorized Phase 9 publication and shared-checkout fast-forward. It does not authorize publication, successor launch or production release.

```text
botControl kiln delivery audit

In service of: Kiln control from a phone-driven bot (PRD)
  Whole PRD — all implementation phases, including completion Phase 9
  This chat: audits completed delivery.
Parallel: yes

Use enso-method:delivery-audit for
 docs/prds/kiln-bot-control/kiln-bot-control-prd.md.

Locate Kiln's existing shared checkout with git worktree list; it uses develop.
Create a fresh sibling worktree from published origin/develop, named
 botcontrol-kiln-delivery-audit-after-ph9/kiln
on wt/botcontrol-kiln-delivery-audit-after-ph9.
Do not reuse Phase 9's implementation worktree. Own this PRD's audit documents;
other tracks remain independently owned.

Under docs/prds/kiln-bot-control/, read Phase 9's Implementation,
Covered-criterion evidence, Review and verification, Final verification,
and Publication and fresh-audit handoff for work state, limits and authorization.
Then load the parent PRD, technical design, assumptions, phase plan,
and after-Phase-8 delivery audit. Preserve ownership and partial supersessions.
Read Phase 8/7/6 Final verification and Phase 5 Known baseline failures;
whole-PRD test audit waits for current clean delivery.

Carry the exact authorization and publication limits from Phase 9's handoff;
scoped audit commits follow the skill default, publication/release remain held.
First: read the Phase 9 document in full.
```

The implementation worktree fast-forwarded from `118c659` to published `5339c2d` during verification. Incoming changes are the independently owned live-control delivery-audit/authorization documents only; its criterion bodies and runtime/test/resource files are unchanged. The narrowed conflict check from `a8d208e` through `118c659`, extended over these metadata-only updates, finds no new requirement conflict or supersession. This does not adopt the other track's audit verdict or test-audit work.


### Published-baseline comparison during Phase 9

An untouched disposable `git archive 118c659` reproduces two of the full gate's live-control failures with original assertions/deadlines: `retains dated checks for unavailable test_audit sources through verify` times out at its existing 60-second limit, and `holds an unaccounted message after final observation failure despite passing test_audit evidence` expects `uncertain` but observes `not_sent` at `src/live/takeover.integration.test.ts:468`. The selected baseline run has two failures, one pass and 21 unselected cases (161.64 seconds). The companion `retains cross-event uncertainty and original test_audit identity through browser/bot review and explicit return` passes on that baseline; this does not establish a pre-existing failure for it. No live-control source, assertion or deadline was changed by this phase.

The same untouched published baseline reproduces all three installed-Claude passive-boundary qualification failures (three failed, three passed, 4.64 seconds): the qualified contract expects Claude `2.1.307`, while installed Claude reports `2.1.311`. This phase does not requalify that billing contract, change the default installed CLI, or alter billing assertions/authority. Phase 8's older baseline comparisons and Phase 7/6/5 gate limits retain their separate original meaning.


## Final verification

The complete `npm run verify` passed the dependency security gate (zero blocking high/critical findings), lint, TypeScript/Svelte checks (zero errors/warnings), all 639 unit tests and all 17 provider-contract checks. Integration completed **954 passed, 10 failed, two existing skipped cases across 82 files in 1,760.32 seconds**. The full gate is **non-green**. This is the recorded complete run, not a combination of selective passes.

The integration run included all 47 inspection cases, including the two positive legacy-binding tests appended after verification began. Runtime/resource hashes remained unchanged throughout the full run. The only later test change corrects the manual-audit recovery fixture described below; no application runtime changed. An earlier sandbox-constrained test attempt was interrupted and supplies no complete-result claim.

All eight `npm run test:package` cases pass against the packed/installed artifact (55.47 seconds). Final lint and TypeScript/Svelte checks also pass after the fixture correction. Independent deliverable review and test hardening are clean/adequate for all ten covered whole criteria; neither is a whole-PRD delivery or test audit.

### Full-gate failure disposition

- Three installed-Claude passive-boundary failures reproduce on untouched published `118c659`, as recorded above. No qualification or billing policy is changed.
- The dated-test-audit Verify timeout and observation-failure `uncertain` versus `not_sent` assertion reproduce on that same untouched baseline, with original assertions/deadlines. These independently owned live-control failures are not repaired by this phase.
- Weekly automatic audit recovery after switching accounts fails at its existing `waitFor` at `src/engine/audit-workflow.integration.test.ts:477` on both the full run and untouched `118c659`. The two-case baseline portfolio records one failure and one pass (81.23 seconds); its unchanged large-history companion passes. No timer or provider/recovery rule was altered to pass this phase.
- The large-history full-run failure is an explicit saved-state read-deadline error during retained CLI assembly, not a shortened or successful incomplete response. The unchanged current 48 MiB controller/CLI case passes in the focused portfolio and the subsequent two-case current rerun; the published baseline case also passes. This resolves the scoped resource-behavior concern without classifying the full-run failure as a reproduced baseline failure or claiming its environmental cause is established.
- The manual audit authority-prompt fixture constructed a synthetic started session with no provider history, then expected same-session instructions. Phase 9 correctly returns fresh-session recovery in that state. The fixture now writes a real private user-message transcript for the exact session and explicitly requires `resumeOffered:true`, retaining every original authority/prompt/order assertion and deadline. It fails before this fixture correction and passes afterward (6.22 seconds); independent test hardening confirms the premise repair is required by the availability contract. No runtime change followed the complete full run.

The live-control chronology timeout and billing-browser cleanup-hook timeout are recorded separately with their final unchanged reruns below. Their complete-run failures are not erased by any focused pass.

Supplementary machine-local diagnostics: `/private/tmp/kiln-ph9-verify.log`, `kiln-ph9-package.log`, `kiln-ph9-regressions.log`, `kiln-ph9-focused-final.log`, `kiln-ph9-review-regressions.log`, `kiln-ph9-legacy-binding.log`, `kiln-ph9-final-isolated.log`, `kiln-ph9-manual-audit-before.log`, `kiln-ph9-manual-audit-after.log`, `kiln-ph9-baseline-takeover.log`, `kiln-ph9-baseline-cross-event-alone.log`, `kiln-ph9-baseline-passive.log`, `kiln-ph9-baseline-inspection-audit.log`, `kiln-ph9-post-gate-reruns.log`, `kiln-ph9-final-lint.log` and `kiln-ph9-final-typecheck.log`, all under `/private/tmp`. The outcomes/configurations/limits stated here are the durable evidence; those machine-local files are supplementary.

The final post-gate unchanged rerun passes both `retains cross-event uncertainty and original test_audit identity through browser/bot review and explicit return` and the billing-browser `keeps both phase Resume controls unavailable before approval while advance remains independent` case: two passed, 34 unselected, across two files in 60.90 seconds. The chronology case previously timed out in both the full gate and its first current focused run; it passes on two published-baseline checks, including the isolated 34.35-second run, so this phase does not call its failure a reproduced baseline failure. The browser failure was its existing 60-second cleanup-hook timeout; the unchanged focused case passes. These outcomes resolve scoped regression concerns without establishing the original timing/cleanup cause or turning the complete gate green.

All ten whole covered criteria have the evidence above and an independent adequate test-hardening grade. Final evidence review confirms the fixture correction, baseline distinctions and qualified gate claims. No new business assumption, spending/recovery/delivery authority, provider turn, production action or whole-PRD audit was added. The next planned unit is the fresh whole-PRD delivery audit after authorized publication; test audit still waits for current clean delivery.


## Phase 9 publication and delivery-audit launch authorization

Doug authorized publication of this Phase 9 implementation and launch of the next planned fresh whole-PRD delivery audit on 2026-10-28 in source chat `01a18269-0027-7d63-85c9-15a05dedf7a4`. His exact instruction was “Okay, well, go ahead and commit and push, and then launch another chat for the next step.” He reiterated: “Please continue. We want to commit and push and then launch another chat for the next step.”

This supersedes the Phase 9 publication and successor-launch holds above for implementation `29851a2` and this scoped authorization/handoff record. Publication fast-forwards the shared checkout before the successor starts from published `origin/develop` in a fresh worktree. The original Closed line and all verification limits remain historical evidence; publication does not turn the complete verification gate green.

The next planned unit is the whole-PRD delivery audit described above. The prepared continuation is valid after publication and shared-checkout fast-forward, and its launch is now explicitly authorized. The successor reads this authorization section in addition to the sections its prepared prompt names. Scoped audit commits follow the skill default; publishing future audit/implementation commits and production release remain held. Whole-PRD test audit follows only current clean delivery. Other tracks remain independently owned.
