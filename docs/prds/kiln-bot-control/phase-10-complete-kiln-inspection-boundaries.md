# Phase 10: Complete bounded output and receipt selection

**Added by delivery audit:** 2026-10-28, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: “Architecture and Decisions”, “Command grammar”, “Common result and errors”, “Status, Conversations and Handoff”, “Output Pages”, “Validation Boundaries”.

## Summary

Return bounded, explicit inspection failures for nonregular saved output, and require the original receipt selector before command-status can query anything.

## Acceptance criteria covered

AC-SEE-01 (completes it; owned by phase 1), AC-SEE-06 (completes it; owned by phase 1), AC-SEE-08 (completes it; owned by phase 1), AC-CLI-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-01:** `src/control/client.ts::inventory` synchronously projects stopped unfinished work; `statusProjection → latestActivity → recentSavedOutput` opens owner-only FIFO output with blocking `openSync("r")` and never returns the required visibly incomplete inventory.
- **AC-SEE-06:** `src/control/logs.ts::outputPage` opens saved output without establishing a regular file. An owner-only FIFO blocks before the five-second deadline can run; reject unsupported/unreadable output with the promised output-specific unavailable result through unpaged and cursor entry points.
- **AC-SEE-08:** Full live/retained status samples output through `inspectionReader` and `latestActivity`; their shared `recentSavedOutput` has the same blocking open. Guard this sibling path so full inspection returns a finalized valid unavailable/incomplete response within its read budget.
- **AC-CLI-01:** The same output-reader gap prevents a bounded result. Separately, `src/control/help.ts::parseCommand` does not enforce command-status's required `--command-id`; `src/control/client.ts::runInspectionCommand` coerces its absence to the valid ID `"undefined"` and can return that receipt successfully. Missing required input must produce the documented invalid-input result before lookup, in both formats and live/retained paths.

The [after-Phase-9 audit](kiln-bot-control-delivery-audit-after-phase-9.md) records exact source paths, disposable public-CLI reproductions, sibling checks, assessment rounds and reverse requirements checks. No criterion, business rule or authority is added.

## Phase dependencies

1 (inspection/help and output); 2 (receipt lookup); 8–9 (guarded/spooled inspection and validated stable output metadata).

## Scope and proof boundaries

Complete each covered criterion as a whole through the existing design validation boundaries. Keep pure retained reads, ownership/symlink checks, supported legacy records, exact output text/fragments, frozen cursor identity, 50/default and 1–200 entry limits, and the 16,384-byte complete stdout cap. Ordinary descriptor-write failures retain their durable-write meaning. No provider/account/recovery/delivery authority or other track's behavior changes.

Use disposable real private files and subprocess deadlines to exercise FIFO/nonregular output without a hanging test runner. Cover actual CLI text/JSON for inventory, basic/full status and logs, live authenticated controller paths and retained reads, explicit sessions and frozen cursors, alongside regular empty/valid output. A failed observation must return explicit incompleteness/unavailability; it must not become successful no-output or consume the controller indefinitely. The audit reproduced retained JSON entry points and isolated built helpers; it did not reproduce a live controller hang or establish text-format boundary proof.

Exercise missing command IDs through actual text/JSON CLI dispatch before target/provider/controller lookup, plus valid original IDs, a deliberately valid ID `undefined`, unknown IDs and ordinary lifetime/replay query behavior. Do not prohibit a valid literal ID to hide omission. Preserve legacy helper execution contracts and help availability without Git/controller/provider access.

After this phase closes and is authorized for publication, repeat whole-PRD delivery audit in a fresh chat/worktree, then whole-PRD test audit only when delivery is clean. Phase 9's [Final verification](phase-9-complete-kiln-inspection-input.md#final-verification), Phase 8/7/6 Final verification and Phase 5 Known baseline failures remain historical non-green gates; provider/Grok evidence remains separately scoped in [release validation](kiln-bot-control-validation.md).

## Publication and launch boundary

The [audit's Publication boundary](kiln-bot-control-delivery-audit-after-phase-9.md#publication-boundary) preserves Doug's exact authorization and source chat. It authorized Phase 9 publication and this delivery-audit launch. Scoped audit commits follow the skill default; this audit's publication, this Phase 10 implementation launch, future implementation/audit publication and production release remain held for explicit authorization. The prepared continuation is valid only after authorized audit publication, shared-checkout fast-forward and explicit Phase 10 launch authorization. Other tracks remain independently owned.

## Implementation launch authorization

Doug authorized publication of the after-Phase-9 audit and launch of this Phase 10 implementation on 2026-10-28. The [audit's authorization record](kiln-bot-control-delivery-audit-after-phase-9.md#audit-publication-and-phase-10-launch-authorization) preserves his exact instruction and source chat. This supersedes the audit-publication and implementation-launch holds above. After publication and shared-checkout fast-forward, the prepared fresh-chat continuation is valid immediately. Scoped implementation commits follow the skill default; publication of future implementation/later-audit commits and production release remain held.
