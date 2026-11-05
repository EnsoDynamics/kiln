# Phase 2a: Audit-owned development delivery

**Closed:** 2026-10-24

**Parent PRD:** [Kiln automatic completion audits](kiln-completion-audits-prd.md)
**Technical design:** [Single governing design](kiln-completion-audits-technical-design.md)
**Plan:** [Implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Let assigned audits assess and satisfy required development delivery under the execution's existing grants, preserving every retained obligation during recovery and assignment to repair work.

## Acceptance criteria covered
AC-RUN-05.

AC-AUDIT-02, AC-AUDIT-03, AC-RUN-03, AC-LOOP-04, AC-RUN-02 and AC-RUN-04 also apply to this interface's work; their ownership stays with Phases 1 and 2b.

## Out of scope
Automatic activity allocation/dispatch, general activity progress and upgrade adoption (2b); automatic test continuations and test-discovered repair routing (3). No new user-facing manual audit launch mode.

## Phase dependencies
1 (assigned audit identities, requirement manifests, snapshots and evidence admission).

## Phase-specific notes
Implement the design's Provider Sessions and Development Delivery owner union, immutable checkpoint origins, criterion-scoped retained assignments, active-owner scope enforcement, current-manifest binding, first-grant recovery and final reconciliation. Normalize legacy phase records without fabricating phase IDs for audits. Expose the owner in the existing delivery CLI/HTTP status and requests; preserve current-authority resume/manual-recovery and user-note/workspace-repair precedence. Supply the assignment operation consumed atomically by 2b/3 allocation; prove that repair phases inherit only affected obligations and cannot drop requiredMerge or weaken grants. Phase 1's existing assigned-audit fixture is the independent interface proof boundary. Keep scheduler integration with 2b; this leaf must not start audits or bypass gates.

## Verification
Follow the technical design's verification contract. Exercise actual packaged delivery CLI/local HTTP, real temporary Git repositories/local bare origins, immutable provider/current-artifact source observations and state restart. Include retained audit obligations after their origin finishes, corrected assessments, replacements, split repair assignments, first grant during a stopped audit, wrong-owner/future-scope refusal, rollback and unchanged legacy phase behavior. Actual-provider audit scheduling/browser sequence proof belongs to 2b; this interface must preserve Phase 1 provenance/currentness and existing provider contract checks.

## Inherited execution limits
Source: Doug's request in chat `01a16ff4-29de-7bf3-b2a1-d199d3a28766`, carrying chat `01a16fc4-5167-7153-b30c-28e08d04c0d2`: “no push, merge, production action or external message is authorized.” Scoped local commits, reviews and non-production verification are authorized. Carry these limits, with their source, into successor prompts; use the explicitly requested existing worktree. Disposable local-origin test repositories are verification fixtures.

## Recorded verification

AC-RUN-05's development interface is implemented and independently exercised with assigned audit activities; automatic allocation and workflow entry points remain 2b. `src/engine/audit-development-delivery.integration.test.ts` proves whole-manifest binding, immutable audit origins, retained merge/evidence obligations, criterion-limited repair/continuation/split transfer, bounded checkpoint replacement, actual successful owner-scoped CLI prepare/evidence, wrong-owner refusal, real save rollback, legacy migration and ordered first-grant recovery. Its actual browser control test grants the exact local fixture target and displays the retained audit owner without dispatching a session. Existing development tests continue to prove target boundaries, prerequisite/current-artifact observations, source synchronization and mixed final outcomes; final evaluation checks audit-origin checkpoints even after their originating activity finishes.

`src/audit/admission.integration.test.ts` additionally refuses a valid report while the audit's required development assessment is absent, then records the corrected result in the same activity. Earlier provider provenance/currentness checks remain intact. Captured GitHub contracts and seeded accepted-audit fixtures supplement real filesystem/Git/HTTP/browser checks; they do not claim a real external merge/deployment or an automatic provider run.

The reusable proof `scripts/proof-run/audit-development-owner-proof.mjs` runs against a separately packed/installed package outside the source checkout, invokes the actual child CLI against the authenticated local server and confirms persisted owner/revision plus stale-revision refusal. Its [retained proof summary](kiln-audit-development-owner-proof.json) pins the final installed package digest and private artifact location. It uses only a disposable Git repository/local bare origin. Phase 1's actual-provider admission proof remains the provenance precedent; both actual providers' automatic execution/recovery and activity/browser sequences remain 2b's explicit verification obligation.

Deliverable review found and corrected three groups: replacement widening from partial ownership, criterion widening through continuation/split propagation, and incomplete/misordered first-grant history. Regression cases pass for each. Test hardening added successful audit-owned prepare/evidence through the CLI/server and verified that a wrong explicit owner leaves state unchanged.

Final validation on 2026-10-24: dependency audit had no blocking high/critical findings; lint, TypeScript/Svelte checks, all 536 unit tests and all 16 Codex contract checks passed. The complete integration suite, `npm run test:integration -- --maxWorkers=3`, passed 607 tests with two existing skips in 577.13 seconds. `npm run test:package` passed all four installed-package checks in 18.69 seconds, and the final installed-package owner proof passed. The initial sandbox-restricted integration attempt could not inspect process start times or serve loopback HTTP; rerunning with that local access passed without changing those checks or suppressing errors.
