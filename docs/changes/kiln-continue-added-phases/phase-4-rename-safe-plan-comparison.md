# Phase 4: Preserve phase identity across document renames

**Added by delivery audit:** 2026-10-30, after every originally planned implementation leaf closed. It completes the missing behavior below.
**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Plan Identity and Comparison; Source Reconciliation; Data Models and Migration; Validation and Criteria Coverage.

## Summary
Keep an unchanged completed phase recognizable when a linked phase document is renamed, including valid relative and encoded link spellings. Additional work can then continue without a false earlier-work reconciliation blocker.

## Acceptance criteria covered
AC-CONTINUE-03 (completes it; owned by phase 2a).

## What the audit found missing
- **AC-CONTINUE-03:** `src/engine/plan-reconciliation.ts::planSourceFromDocuments` supplies only bare and `./` phase-filename aliases to `normalizedScope`, which exact-matches link destinations. Completed-feature discovery and external completion accounting therefore classify a completed sibling as materially changed after a harmless linked-file rename when its link uses `../comet/filename`, `x/../filename` or percent encoding, even though both document readers resolve those forms to the same phase. The shared active/legacy comparison callers use the same incomplete normalization contract.

## Phase dependencies
1 (retained plan scope and active/legacy comparisons); 2a (completed-source discovery and reconciliation); 2b1 (external completion accounting).

## Phase-specific notes
The delivery audit at `dbdd8d1` reproduced the false completed-scope error with fictional in-memory documents using existing compiled exports. Bare and `./` links stayed equivalent; the relative/encoded siblings did not. The finding and conflict check are recorded in [the whole-PRD delivery audit](kiln-continue-added-phases-delivery-audit.md).

Follow the existing design's versioned normalization and immutable-baseline rules. Resolve valid phase-document targets relative to their containing document before mapping them to phase identity, preserving meaningful query/fragment distinctions and existing path protections. Apply the same semantics to every scope-comparison caller, including retained and legacy evidence; do not mutate historical sidecars or silently compare incompatible normalization versions.

Prove the whole criterion at the real saved-checkout and immutable-Git discovery boundary, including continuation readiness after a harmless rename and continued blocking for real scope/identity changes. Include inherited external-completion and active/legacy paths affected by the shared normalizer. Use fictional disposable repositories; no actual provider turn is needed merely to prove read-only plan comparison. The current full gates remain `npm run verify` and `npm run test:package`.

## Successor
After this leaf closes and authorized development-base delivery completes, launch a fresh whole-PRD delivery audit. A clean delivery audit then launches whole-PRD test audit; any material gaps follow the same completion-phase loop.
