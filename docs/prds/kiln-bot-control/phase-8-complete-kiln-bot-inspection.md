# Phase 8: Complete truthful and stable bot inspection

**Added by delivery audit:** 2026-10-28, after every planned phase closed. It builds what earlier phases left out of the criteria below.
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
