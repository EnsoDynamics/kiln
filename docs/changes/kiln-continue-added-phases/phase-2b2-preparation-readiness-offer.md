# Phase 2b2: Evaluate preparation readiness and show the offer

**Closed:** 2026-10-30

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Readiness and Planned Preparation (observation, extraction and authority evaluation); Interfaces; Data Models and Migration; Validation and Criteria Coverage.
**Parent phase:** [Phase 2b](phase-2b-added-work-readiness.md)

## Summary
Show the ordered additional-work offer, its first eligible phase and current readiness above earlier delivery, based on verified prerequisites and existing authorization controls for planned preparation.

## Acceptance criteria covered
AC-OFFER-01; AC-FIND-04 and AC-CONTINUE-03 also apply to this phase's work.

## Out of scope for this phase
Continue/Not now, target-grant mutations, acceptance, fresh workspace activation, preparation execution and engine-owned verification runs (3).

## Phase dependencies
2a (coherent source observations); 2b1 (complete classification and external-completion evidence).

## Phase-specific notes
Own Readiness and Planned Preparation observation/extraction/authority contracts, immutable proposal bindings and the existing-control permission proof rows. Extend 2b1's full Comet Library fixture with blocked and reconciled preparation inputs and actual existing-control permission proofs. Reuse the current command owner and schema; Phase 3 consumes these evaluated bindings. Add only supersession pointers made true here.

## Inherited observation and presentation boundary

Phase 2a's immutable candidate is an observation, not an executable proposal; preserve the accepted historical baseline and the technical design's “Implemented completed-check observation (Phase 2a)” boundary. Build on 2b1's external-completion accounting to extend the current panel/header with the full offer, first eligible phase, prerequisite and authority evidence, and immutable proposal identity. Preserve source failure/retry/history behavior and explicitly earlier results; incomplete checks retain unknown current counts. Continue/Not now and acceptance remain Phase 3.

## Phase 2b1 handoff

Schema 15 stores immutable completion accounting linked from `completedPlanCheck.result.accountingId`; classified rows remain visible above historical delivery. Reuse the accounting's exact candidate digest, complete affected-repository evidence, original completion/verification timestamps and unresolved problems when building readiness. The accepted baseline is unchanged. Observation status `available` means additions were found, not that preparation is ready or authorized.

The Comet fixture and external-accounting integration tests prove seven unfinished leaves (9–15), a distinct externally closed phase 8, ordinary merge and retained squash-pair coverage, missing sources, and retained Claude/Codex provenance. Extend it for explicit preparation/existing-control permission proof; do not reinterpret its existing blocked input as a ready offer. See [External-completion validation](kiln-external-completion-accounting-validation.md) and the design's implemented accounting boundary.

## Completion evidence

[Preparation readiness validation](kiln-preparation-readiness-validation.md) records the approved permission model, immutable offer and real Git/multiple-repository/browser proofs, independent review and hardening, and the exact full-run/serial-recheck/package evidence. Phase 3 owns acceptance, pending target grants, fresh setup, preparation execution and engine-owned verification.
