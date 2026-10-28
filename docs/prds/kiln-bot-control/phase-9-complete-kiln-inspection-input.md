# Phase 9: Complete truthful inspection and bounded command input

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
