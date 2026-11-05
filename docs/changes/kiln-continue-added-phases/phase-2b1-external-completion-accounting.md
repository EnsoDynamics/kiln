# Phase 2b1: Account for externally completed work

**Closed:** 2026-10-30

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Plan Identity and Comparison; Completion evidence from outside Kiln; Interfaces; Validation and Criteria Coverage.
**Parent phase:** [Phase 2b](phase-2b-added-work-readiness.md)

## Summary
Show actual unfinished additions separately from externally completed work and unresolved earlier work in the browser and terminal, retaining the completion and integration evidence behind each classification.

## Acceptance criteria covered
AC-FIND-03; AC-FIND-04 and AC-CONTINUE-03 also apply to this phase's work.

## Out of scope for this phase
Preparation extraction/authority, first eligible phase and executable proposal readiness (2b2); Continue/Not now, grants, acceptance, fresh activation and preparation execution (3).

## Phase dependencies
2a (immutable current-source observations and historical comparison).

## Phase-specific notes
Own the discovery/classification proof row and external-completion accounting across CLI, server and browser. Establish the full synthetic Comet Library phases 1–15 fixture with external phase 8 and seven unfinished additions; 2b2 extends it to prove authorized preparation. Do not label unevaluated preparation ready or publish an executable proposal. Add only supersession pointers made true here; reuse the current command owner and schema.

## Phase 2a handoff

Schema 14 and `completedPlanCheck` provide source observations, legacy baseline recovery, historical-scope blocking and explicitly earlier results. Reuse the immutable candidate sidecar referenced by the observation; it is not an executable proposal and its added-leaf list is not the completed classification/readiness contract. The accepted historical baseline remains unchanged. The technical design's “Implemented completed-check observation (Phase 2a)” owns the code boundary.

Extend the existing panel with external-completion accounting while preserving source failure/retry/history behavior. The current CLI deliberately reports unresolved counts for blocked observations; report classified counts only when their source evidence is complete. The smaller catalog/lending fixture covers only Phase 2a's source checks. Full offer presentation, first eligible phase, preparation/authority evidence and immutable proposal identity belong to 2b2.

## Closure evidence

[External-completion accounting validation](kiln-external-completion-accounting-validation.md) records the real Git, provider-history, CLI/HTTP and desktop/narrow browser proof, independent review, test hardening and full passing repository/package gates. Schema 15 retains classified completion evidence without accepting a new execution. Phase 2b2 owns the next planned capability.
