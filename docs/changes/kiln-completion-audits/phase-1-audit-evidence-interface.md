# Phase 1: Audit evidence interface

**Closed:** 2026-10-24

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: Audit Report and Local Interface; Current Work and Invalidation; Provider Sessions and Development Delivery; Recovery and Upgrade; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Accept or refuse whole-PRD audit reports through Kiln's packaged CLI and authenticated local server, using actual provider evidence and current repository content. Retain the checked work and accepted results so later execution steps can rely on them.

## Acceptance criteria covered
AC-AUDIT-02, AC-AUDIT-03, AC-RUN-03.

## Out of scope for this phase
Automatic audit/repair dispatch, activity progress screens, execution-wide upgrade adoption and audit-owned development obligations (Phase 2); automatic test-remediation continuations and test-discovered repair routing (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
Include both audit kinds' typed report/evidence contracts, snapshot classification, provider provenance, sidecars and the additive storage/migration mechanics needed for real CLI/server admission. Prove the interface with fixture-assigned activities and actual provider report producers as described in the plan; do not add a user-facing manual audit-launch mode. Scheduling integration re-proves these constraints in subsequent phases.

## Verification

The implementation uses real filesystem/Git/HTTP integration checks in `src/audit/admission.integration.test.ts`, plus the installed-package producer in `scripts/proof-run/completion-audit-proof.mjs`. Its required `KILN_PROOF_PACKAGE_ROOT` points to an installed package; each invocation creates only disposable repositories and a local bare origin. It calls the production provider launcher, server and CLI, with no scheduling shortcut or external GitHub write. [Retained provider proof summary](kiln-audit-interface-provider-proof.json) records both actual successful runs and the private original artifact locations; raw conversations remain private.

| Criterion | Evidence |
|---|---|
| AC-AUDIT-02 | Full/partial supersession, post-delivery human action and two-repository admission; unresolved replacement, missing current part and unrecorded behavior-change refusal; independently delegated actual Claude/Codex whole-PRD assessments. |
| AC-AUDIT-03 | Real authenticated CLI/server submission, immutable sidecars, stale/conflicting/replayed/missing/blocked submissions, exact source/evidence references, real state-save rollback and stable migration identity with original bytes retained. |
| AC-RUN-03 | Classified-test-only versus implementation/configuration invalidation, phase-status/record-only termination, accepted method-record currentness, real Node baseline/two red assertion failures/restoration/final pass, independent re-grade, and restored source mutations after verification rejected. |

The provider proof exposed real format differences and was rerun after fixing them: Claude completes child reports with `SubagentHandback`; Codex encrypts delegated task text in both authoritative histories. The collector links the matching encrypted parent invocation to the child's own completed turn rather than treating inherited context as independent assessment.

Deliverable review found and corrected contradictory report combinations, stale/misattributed provenance, plan/origin validation, remediation/red-check binding, artifact source binding and correctable blocked attempts. Test hardening added classified-test invalidation, requirements exceptions across repositories and targeted verification regressions. Scheduling, progress UI and execution-wide upgrade adoption remain Phase 2; full remediation routing remains Phase 3.

Final validation on 2026-10-24: dependency audit reported no blocking high/critical findings; lint, typecheck, all 536 unit tests and all 16 Codex contract checks passed. The final complete integration run, `npm run test:integration -- --maxWorkers=3`, passed 596 tests with two existing skips in 414.12 seconds, including all 30 audit cases. `npm run test:package` passed all four installed-package tests in 12.93 seconds. The default-concurrency `npm run verify` reached a timeout in the existing paused-view case; that case passed alone and in the complete three-worker run without changing its assertions or timeout. An audit HTTP fixture cleanup race was corrected by using the existing account-discovery process fixture and awaiting startup; the actual provider proofs remain separate.

The retained provider proof identifies the installed package digest used for both live producers. Subsequent deterministic admission hardening is covered by the final suite above; the live producers were not rerun for those validator-only changes. Historical design reverse pointers cover only the additive state/session behavior implemented here.
