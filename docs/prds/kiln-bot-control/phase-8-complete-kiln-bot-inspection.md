# Phase 8: Complete truthful and stable bot inspection

**Added by delivery audit:** 2026-10-28, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Closed:** 2026-10-28 — local completion; publication held. Final verification preserves the non-green full gate and exact baseline failures.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: “Common result and errors”, “Discovery, Ownership and Paths”, “Status, Conversations and Handoff”, “Output Pages”, “Account and Usage Facts”, “Validation Boundaries”.

## Summary

Make existing inspection commands report unavailable facts honestly, retain stable output pages, and return recovery/history information within the promised ownership and resource boundaries.

## Acceptance criteria covered

AC-SEE-01, AC-SEE-03, AC-SEE-04, AC-SEE-05, AC-SEE-06, AC-SEE-08, AC-ACCOUNT-01, AC-CLI-01 (each completes it; each is owned by phase 1).

## What the audit found missing

- **AC-SEE-01:** `src/control/private-state.ts::enumerateWork`, reached by inventory and target resolution, treats `existsSync(root) === false` as a genuinely missing root; inaccessible ancestors can therefore produce complete, successful zero inventory instead of explicit incompleteness.
- **AC-SEE-03:** Claude identity dates in `AgentInfo.refreshClaudeForLaunch` and `readAccount` come from later model/skill or usage completion rather than their own authentication reads. Missing Claude usage without a reported plan can acquire a successful usage date; `accountFacts` also forwards raw billing without independent live/retained freshness and availability.
- **AC-SEE-04:** `src/control/projection.ts::statusProjection` silently uses an incomplete stop when `inspection-view.json` is absent, dropping readable Codex human requests, the stopped-session selector and recovery facts without explaining their unavailability.
- **AC-SEE-05:** `handoffProjection` captures ownership before awaiting Codex history and can offer manual resume after Kiln concurrently resumes the conversation; absent retained instruction sidecars can also yield unexplained null prompts in a successful handoff.
- **AC-SEE-06:** `outputPage` sizes text against variable-width collection timestamps, so identical cursor/options can return different fragments. Shared deadline and pinned-session-generation failures also escape as generic `state_unavailable` instead of the specified `saved_output_unavailable`.
- **AC-SEE-08:** `readHistory`, full-status serialization and HTTP transport materialize complete records/results without the design's memory bound; a final synchronous record can also finish after its deadline and still be complete. Selected historical handoffs share the ownership and absent-instruction gaps above.
- **AC-ACCOUNT-01:** The Claude missing-usage/date and billing-observation gaps above reach live account refresh, full status and retained account reads. Preserve actual-attempt versus next-authentication provenance, provider windows and existing permission/authority rules.
- **AC-CLI-01:** The same incomplete/unavailable reads can return success or the wrong documented failure. Public usage rows and saved Codex provenance also forward omitted optional fields instead of the design's explicit null/availability contract.

The [after-Phase-7 audit](kiln-bot-control-delivery-audit-after-phase-7.md) records all variants, source paths, reproductions and reverse conflict checks. It found no later replacement, intentional alternative or missing business decision requiring a new assumption. Freshness of a successful observation does not imply that every identity field is known: preserve known plans/routes and explicit unknown identity, the completed Codex identity guard, valid API authentication and existing launch eligibility. Do not turn optional observation failures into new launch blockers.

## Phase dependencies

1 (inspection/storage/projections); 2 (concurrent resumption and durable controls); 4 (no-session and historical handoff); 5 (actual-attempt provenance); 6 (Claude usage binding/dating and honest output selection); 7 (Codex observation binding and completed help).

## Scope and proof boundaries

These are corrections to one existing inspection surface, sized together for one implementation session. No new command, account workflow, spending permission or delivery authority is added. Keep the original ownership, Closed lines, supersession pointers, helper execution contracts and separately owned live-control work intact.

Prove every covered criterion as a whole through the design's existing validation boundaries. Include real inaccessible/missing state-root distinctions; independently delayed Claude auth/usage/model/skill reads; absent versus explicitly empty usage; both providers' live/retained billing and unknown optional fields; missing inspection/instruction sidecars with readable stopped and historical sessions; Codex history delayed across actual controller resumption; frozen text/JSON cursor replay across collection-time width changes and unavailable generation/deadline errors; and complete/incomplete large histories through the actual CLI/HTTP serializers with bounded resources. Preserve exact stop messages, scalar fragments, pure retained reads and unavailable-control/authority rules. Report unavailable data explicitly rather than inventing prompts or migrating state during reads.

After this phase closes, repeat whole-PRD delivery audit in a fresh chat, then whole-PRD test audit only when delivery is clean. Read Phase 7's [Final verification](phase-7-complete-codex-binding-help.md#final-verification), Phase 6's [Final verification](phase-6-complete-inspection-freshness-help.md#final-verification) and Phase 5's [Known baseline failures](phase-5-complete-attempt-account-provenance.md#known-baseline-failures); their non-green full gates remain non-green. Existing provider/Grok release evidence remains separately scoped in [release validation](kiln-bot-control-validation.md).

Doug authorized the predecessor audit's publication and this Phase 8 implementation chat; see the audit's Publication boundary for his actual instruction and source chat. Scoped implementation commits follow the skill default. Publishing new Phase 8 implementation/later-audit commits and production release remain held. Other tracks are independently owned.


## Implementation

Inventory uses a real root stat to distinguish absence from inaccessible ancestors and invalid roots. Claude authentication is dated at each completed authentication read, independently of usage, models and skills. A successful usage observation requires reported rows, including an explicitly empty array; absent no-plan usage remains optional for launch and explicitly unavailable for inspection. Same-account retained gauges keep their original date, and changed identities do not acquire nearby gauges.

Account inspection dates billing independently for both providers, labels disconnected observations last known, preserves existing billing hold fields/reasons, and exposes unknown usage/provenance fields as null with availability. Waiting and stopped usage facts use the same public normalization. Actual/original attempt provenance remains separate from next authentication; no sign-in, spending or launch authority was added.

Missing inspection sidecars preserve readable stop messages, checks, human requests and session identity while explicitly reporting absent recovery instructions. A retained matching instruction entry can still supply its dated recovery facts. Handoff preserves intentionally unnecessary continuation prompts, explains missing instruction sidecars, and checks exact-session ownership after awaited provider history. Inspection ownership spans pending recovery, usage-wait checks, automatic restart preflight and the active session; unrelated commands do not claim earlier conversations. No handoff executes a command.

Text timestamps use fixed-width local dates with an explicit UTC offset. A page uses one honest collection time, so frozen cursor/options select stable text across clock-width changes. Output deadlines and missing/corrupt generation records report saved_output_unavailable while preserving exact scalar fragments and the full stdout byte cap.

History session records and conversation projections are request-local disk arrays. Complete final text/JSON responses are spooled before HTTP/stdout streaming, and the CLI relays full HTTP status without parsing the whole result into memory. Atomic JSON reads have the technical design's explicit 16 MiB allocation guard; over-budget records remain unavailable, never shortened or deleted. Streaming directory scans stop at the shared deadline and report the unscanned remainder without growing one error per remaining reference. Inspection snapshots use guarded session readers and bounded saved-output samples; browser-only aggregate timing remains on the browser's unchanged default path. Temporary files/descriptors are cleaned after success, initialization/serialization failure, cancelled HTTP and broken output.

Independent deliverable review found and the implementation corrected deadline-exhaustion error growth, billing-hold field loss, overly broad historical ownership, nested usage unknowns, resume-preflight ownership, failed/cancelled spool cleanup and started-snapshot timing allocations. Its final verification and test-hardening outcome are recorded with the final gate below.

## Covered-criterion evidence

| Criterion | Boundary evidence |
|---|---|
| AC-SEE-01 | Inspection integration tests exercise missing/inaccessible/invalid roots through CLI, cross-repository live/stopped inventory, separate counts, aliases, schema/identity failures and pure saved reads. |
| AC-SEE-03 | Claude subprocess tests independently delay initial/final auth, usage, models and skills; account/provenance and Codex observation tests exercise live refresh/full status and pure retained freshness, unknowns, failures and account changes. Both installed providers were also read without model turns. |
| AC-SEE-04 | Inspection/live engine tests preserve exact browser stop messages/checks and recovery facts; missing-sidecar Codex tests retain saved human requests, session identity and exact multiline text while returning explicit incompleteness. |
| AC-SEE-05 | Handoff tests cover exact provider instructions, earlier/no-session recovery, missing sidecars, active refusal, a delayed Codex history read crossing actual Resume, unrelated settings admission, automatic restart preflight and usage-wait checks. |
| AC-SEE-06 | Both final serializers reconstruct exact numbered entries/fragments within 16,384 bytes, freeze snapshots across appends/replacements, replay at changed clock widths, and distinguish cursor, generation and deadline failures. |
| AC-SEE-08 | Real saved conversations/attempts for both providers retain execution ownership and IDs; actual CLI/HTTP text/JSON reads exercise complete large started histories under a 48 MiB child heap, explicit over-budget/late records, constant-sized deadline errors and failed/cancelled response cleanup. |
| AC-ACCOUNT-01 | Existing actual-attempt/original-account, Claude binding, Codex corroboration, billing/recovery and launch checks remain; new billing/unknown observations are exercised live/retained for both providers, including absent versus explicitly empty usage. |
| AC-CLI-01 | Shared public projections and serializers retain versioned errors/exits and explicit unknowns. Built CLI/local HTTP tests cover complete/partial results, no partial JSON after transport failure, pure retained reads and bounded log errors; existing installed-help/provider/Grok proof remains separately scoped. |

## Final verification

Independent deliverable review and test hardening finished with no remaining findings. The eight covered criteria have boundary evidence in the table above; neither review declares whole-PRD delivery or whole-PRD test audit complete.

- Focused inspection/account/provider portfolio: 63 tests passed across five files (71.69 seconds). Subsequent ownership, cleanup and nested-usage portfolio: 65 passed across three files (128.48 seconds). Four spool cleanup/deadline tests passed against real private files and narrow failure injection.
- The large-history test passed in 13.78 seconds using an actual started controller and CLI, each capped at a 48 MiB JavaScript heap. Retained/live text/JSON retained all 40 conversations and more than 40 MiB of output; an oversized latest record explicitly failed snapshot, controls and history. No shortened response was accepted as complete.
- Both installed providers completed metadata-only account reads without model turns, sign-in or authority changes. Claude reported known identity, Max plan and three usage rows; usage was observed at `2026-10-28T03:41:10.214Z`, final authentication at `2026-10-28T03:41:10.335Z`. Codex reported known identity, pro plan and one usage row; usage at `2026-10-28T03:41:02.312Z`, authentication at `2026-10-28T03:41:02.318Z`. Neither returned read errors; Codex returned no launch blockers.
- All eight installed-package checks passed (26.09 seconds) after the first full integration gate. No runtime/package source changed afterward.

The first complete `npm run verify` passed the dependency security gate (zero blocking high/critical findings), lint, typecheck (zero errors/warnings), all 639 unit tests and all 17 provider-contract tests. Integration finished with 924 passed, 5 failed and 2 existing skipped tests across 81 files (582.40 seconds). Four failures are reproduced on published baseline `04b2a83`, as recorded below. The fifth was the migration test's obsolete equality between usage and final authentication dates; Phase 8 intentionally dates those separate observations independently. Its assertion now requires the earlier usage observation to precede final authentication, preserving all migration/value/freshness/date-progress checks. All three migration cases passed afterward (5.74 seconds), and independent test hardening confirmed the corrected assertion. Source hashes show that assertion was the only source/test change after the first complete gate. The full gate remains non-green; the rerun after that correction is recorded below.

The final complete `npm run verify`, after that assertion correction, again passed the dependency security gate, lint, typecheck, all 639 unit tests and all 17 provider-contract tests. Integration finished with **925 passed, 4 failed and 2 existing skipped tests across 81 files in 557.60 seconds**. The four failures are exactly the three passive-billing qualification cases and the takeover case reproduced on published baseline below. The full gate is **non-green**. Runtime/test hashes remained unchanged for the entire final run; only documentation changed afterward. All eight installed-package checks remain applicable because runtime/package source did not change. Phase 5/6/7's historical non-green gates are not reclassified.

Pre-commit checks cover the 29 task-owned paths only: no unrelated staged files, no credential-pattern matches, no whitespace/conflict-marker errors, working local document links and unchanged parent requirement bodies. Publication remains held. The post-commit refactor pass follows this implementation commit; whole-PRD audits remain separate.

Machine-local diagnostics: `/private/tmp/kiln-ph8-targeted3.log`, `/private/tmp/kiln-ph8-review-fixes2.log`, `/private/tmp/kiln-ph8-spool-tests.log`, `/private/tmp/kiln-ph8-bounded-controller4.log`, `/private/tmp/kiln-ph8-real-metadata.log`, `/private/tmp/kiln-ph8-final-package.log`, `/private/tmp/kiln-ph8-final-verify.log`, `/private/tmp/kiln-ph8-final-verify-after-date-test.log` and `/private/tmp/kiln-ph8-migration-date.log`. The outcomes and limits stated here are the durable evidence; machine-local files are supplementary.

## Publication boundary and next audit

Doug authorized this launch in source chat `01a18060-0411-7953-9d61-ce393a9a3726`: “Go ahead and push the audit, then launch a new chat using GPT-6.1 Sol with high reasoning to implement Phase 8.” Audit `0750caf`, authorization `8110b2c` and publication note `04b2a83` were published before this implementation. Scoped implementation commits follow the skill default. Publishing new Phase 8 implementation/later-audit commits and production release remain held. Other tracks remain independently owned.

After authorized Phase 8 publication and shared-checkout fast-forward, repeat whole-PRD delivery audit in a fresh chat/worktree from published origin/develop. Do not reuse this implementation worktree. Test audit waits for a current clean whole-PRD delivery audit. Preserve Phase 7/6/5's historical non-green full-gate limits, this phase's final evidence below, original criterion ownership, all Closed lines, partial supersessions and independently owned live-control work.

### Fresh-audit continuation

This prompt is valid only after authorized Phase 8 publication. The next chat starts from the published reference and preserves this phase's final gate limits.

```text
botControl kiln delivery audit

In service of: Kiln control from a phone-driven bot (PRD)
  Whole PRD — all implementation phases, including completion Phase 8
  This chat: audits completed delivery.
Parallel: yes

Use enso-method:delivery-audit for
 docs/prds/kiln-bot-control/kiln-bot-control-prd.md.

Locate Kiln's existing shared checkout with git worktree list; it uses develop.
Create a fresh sibling worktree from published origin/develop, named
 botcontrol-kiln-delivery-audit-after-ph8/kiln
on wt/botcontrol-kiln-delivery-audit-after-ph8. Do not reuse Phase 8's worktree.
Own this PRD's audit documents; other tracks remain independently owned.

Read phase-8-complete-kiln-bot-inspection.md under docs/prds/kiln-bot-control/:
 Implementation, Covered-criterion evidence, Final verification,
 Publication boundary and next audit — completed work, proof limits and authority.
Load the parent PRD, technical design, assumptions, phase plan and the
 after-Phase-7 delivery audit. Preserve original ownership/supersession pointers.
Read Phase 7/6 Final verification and Phase 5 Known baseline failures;
 their non-green full gates remain non-green. Test audit waits for clean delivery.

Scoped audit commits follow the skill default. Publishing new audit/implementation
commits and production release remain held; carry the phase's authorization source.

First: read Phase 8 in full, then load the governing requirements.
```

### Baseline failures reproduced during Phase 8

An initial, interrupted full gate reported the unchanged usage-wait CLI assertion `says it is waiting, starts the wait again with a fresh reading, and resumes the session once the account has usage left`. Its reset is computed one hour ahead; near local midnight the correct existing output includes the next weekday, while the test's regex accepts only a same-day time. The exact assertion fails on both Phase 8 and an untouched `git archive 04b2a83`, with original assertions/deadlines. Those isolated runs took 2.77 and 3.13 seconds. The interrupted full run is not complete-gate evidence, and the legacy assertion was not changed.

The full gate reported three installed-Claude qualification failures in `src/billing/passive-boundary.integration.test.ts`: installed-auth qualification, inactive project/local endpoint exclusion, and inactive credentials/helpers. All three reproduce unchanged on untouched published baseline `04b2a83` (3 failed, 3 passed in 2.12 seconds). The existing qualification expects Claude `2.1.307`; installed Claude reports `2.1.311`, leaving the boundary inventory incomplete. This phase does not requalify that separately owned billing contract or change its assertions, credentials or authority.

The final full run reported the separately owned live-control test `holds an unaccounted message after final observation failure despite passing test_audit evidence`. Fresh isolated current/baseline runs both reproduce the same assertion at `src/live/takeover.integration.test.ts:468`: expected `message.delivery: uncertain`, observed `not_sent`. The companion delivery-audit variant passes on both. The two selected-case portfolios took 26.85 seconds on Phase 8 and 27.31 seconds on untouched published baseline `04b2a83`. This establishes that exact failure before Phase 8; neither the live-control implementation nor its assertion/deadline was changed to pass this phase. It does not reclassify any historical Phase 5/6/7 gate.

Machine-local comparison diagnostics: `/private/tmp/kiln-ph8-{baseline,current}-takeover-observation.log`, `/private/tmp/kiln-ph8-baseline-passive-boundary.log`, `/private/tmp/kiln-ph8-usage-wait-isolated.log` and `/private/tmp/kiln-ph8-baseline-usage-wait.log`. The recorded commits, cases, assertions and outcomes above are the durable evidence.

## Phase 8 publication authorization

On 2026-10-28, Doug instructed in source chat `01a1808a-407c-7e53-8ab2-0ce47095ff33`: “Go ahead and push Phase 8, then launch a fresh chat using GPT-6.1 Sol with high reasoning for the whole-PRD delivery audit.” This authorizes publication of implementation `a8d208e` and its publication/handoff record, then launching the fresh whole-PRD delivery audit. It supersedes the Phase 8 publication hold above; publication of later audit/implementation commits and production release remain held. Other tracks stay independently owned.

The implementation's post-commit refactor pass completed: no refactor warranted; the shared guarded reader, response spool and public fact normalization already express their separate responsibilities without a concrete small tidy. The implementation worktree is clean, with no runtime/test changes after its final verification. The four reproduced baseline failures and all historical non-green gate limits remain unchanged.

Phase 8 is published as `a8d208e`. After the shared checkout fast-forwards, the Fresh-audit continuation above is valid immediately; the launched audit reads this authorization section as well as Final verification and Publication boundary and next audit. Scoped audit commits follow the delivery-audit skill default. This instruction authorizes the audit launch, not publishing its future commits, implementing newly found gaps, running the later test audit, or production release.

Publication rebased the implementation from original local `8a52368` to `a8d208e` over concurrent upstream `244043b`. The incoming changes are live-session-control audit/planning documents only; their criterion bodies and existing partial supersessions are unchanged. Inspection requirements and authority remain compatible. Runtime/test trees match the completed Phase 8 verification exactly, so no implementation tests were rerun for this documentation-only rebase. Local link, unchanged-body and diff checks passed again.
