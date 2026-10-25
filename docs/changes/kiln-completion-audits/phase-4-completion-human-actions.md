# Phase 4: Show remaining human actions at completion

**Closed:** 2026-10-25

**Added by delivery audit:** 2026-10-25, after every planned leaf closed; whole-PRD audit of `03a5f16`, chat `01a1732a-0ad2-7660-8e9b-e7fefa71ca2f`. It builds the existing criterion's missing disclosure.
**Parent PRD:** [Kiln automatic completion audits](kiln-completion-audits-prd.md)
**Technical design:** [Single governing design](kiln-completion-audits-technical-design.md) — Progress and Detail Contract; Audit Report and Local Interface; Current Work and Invalidation.
**Plan:** [Implementation plan](kiln-completion-audits-implementation-plan.md)
**Repositories:** kiln

## Summary
Show allowed remaining human actions when Kiln displays a completed execution, without implying those actions happened.

## Acceptance criteria covered
AC-TEST-04 (completes it; owned by phase 3).

## What the audit found missing
- **AC-TEST-04:** The completed-execution entry point (`view/src/screens/Complete.svelte`, reached through the browser's complete-state route) never lists allowed post-delivery human actions. `src/engine/snapshot.ts::activityViews` retains actions in each audit row's `audit.pendingActions`, but only `view/src/screens/PhaseDetail.svelte` renders them after opening an audit detail. Complete and its rendered components do not consume them, contrary to the design's Progress and Detail Contract.

## Phase dependencies
3 (accepted test conclusions and permitted post-delivery human actions); 2b (completion activity projection and completed-execution screen).

## Scope and audit confirmation
Complete the existing disclosure requirement; preserve the whole AC-TEST-04 completion gate. Do not implement unrelated audit, permission or delivery changes. The criterion stays owned by Phase 3, and all original Closed lines remain intact.

The main auditor confirmed the independent finding by reading Complete, its rendered components, `activityViews`, the sole `pendingActions` UI consumer and the admission/gating paths. A separate conflict check read all six PRD summaries and relevant completion/display criteria, followed existing replacement links and inspected Git history. No later-built requirement replaces this disclosure. The design has required the Complete list since `0c972a1`; `9936a80` added detail-only action rendering and the historical-audit note, and `03a5f16` did not change Complete. This is missing implementation, not an intentional behavior change; no assumption or supersession amendment is needed.

## Inherited execution limits
Doug: “no push, merge, production action or external message is authorized.” Source: `01a16fc4-5167-7153-b30c-28e08d04c0d2`, carried by `01a1702e-b2ad-76d0-bc15-2b3e9aa7fb1e` and the whole-PRD delivery-audit request in `01a1732a-0ad2-7660-8e9b-e7fefa71ca2f`. Scoped local document commits were authorized for the audit; the next implementation follows its skill's local commit default, with pushes still held. This phase grants no additional external authority.

## Closing handoff
Phase 4 closes the sole confirmed implementation gap from the whole-PRD delivery audit at `d4f5477`. All planned leaves are closed; the next unit in this track is a fresh whole-PRD `test-audit`, not another implementation phase. Read this phase's implementation/verification record and Phase 3's Verification environment notes, Final commit gate and retained provider proof before auditing. The delivery audit did not grade test evidence. Preserve the inherited execution limits above.

## Implementation and verification record

Complete now lists remaining human actions from the latest whole-PRD test audit. The snapshot projects that list only from a settled, accepted, passed report and includes only actions beyond the delivery boundary without recorded results. Earlier audit rounds remain inspectable history; they do not repopulate the completion list. The visible section says that Kiln has not performed the actions. No audit admission, currentness, permission or delivery gate changed.

The focused proof runs the real scheduler, authenticated child CLI/server, disposable Git/local origins and Chrome with scripted provider histories. An allowed action reaches Complete once, survives browser reload and engine restart, and retains the review outcome. An in-boundary action stops at Needs you before finalization. A later test report with an immutable recorded result keeps the earlier action in history but removes it from Complete, including after engine restart. Existing admission tests cover permitted human evidence, unresolved evidence, Missing/Weak grades, supersession and unrecorded behavior changes. Screen tests cover multiple actions, obsolete rounds, an empty latest report, historical completions and disconnected rendering. Phase 3's retained actual-provider proof remains relevant; this phase changes no provider contract.

Deliverable review independently re-read all changed files and the governing requirements, ran focused screen/lint checks, and inspected the rendered Complete screenshot. It found no issues. Test hardening independently mapped the whole criterion to existing and new evidence. Its one finding was missing regression coverage for a recorded human result; that workflow/browser case was added and passes. No production-code fix was needed. The full integration gate and approved dependency audit passed; final results are recorded below.

## Final verification — 2026-10-25

- `npm run audit`: zero blocking high/critical findings after Doug explicitly approved the dependency metadata transmission in this chat (2026-10-25).
- `npm run build`, `npm run lint` and `npm run typecheck`: pass, with zero Svelte errors or warnings.
- `npm test -- --maxWorkers=3`: 549 pass on final source.
- `npm run test:codex-proof`: all 17 provider-contract checks pass.
- `TZ=UTC npx vitest run --config vitest.integration.config.mts --maxWorkers=6 --reporter=dot`: all 52 files pass, 641 tests pass and two existing host-conditional tests skip (643 collected). The known predecessor retired-model browser race did not reproduce. This run collected the two initial human-action scenarios before the final hardening case was added.
- Final focused workflow run after hardening: all three human-action cases pass, including the recorded-result exclusion. The preceding complete workflow/admission run passed all 61 then-collected checks.
- `npm run test:package`: all four installed-package tests pass.
- Real Chrome screenshot inspected by the implementing agent and the independent deliverable reviewer; no console/CSP errors in the new workflow.
- Deliverable review and test hardening complete with no remaining in-scope finding.

The initial dependency-audit request was denied by automatic approval review because it sends dependency metadata to npm. Doug then explicitly answered “Allow the dependency audit” in chat `01a17332-9814-7e33-90ab-bbf18ddfe379`; the approved command passed. No verification waiver or human action remains for this phase. This approval covers only that check and does not lift the inherited publication restrictions. The implementation chain makes its scoped local commit and runs the post-commit refactor pass before handing off to the whole-PRD test audit.

Conflict check: since `9936a80`, AC-TEST-04 is unchanged. The only changed earlier PRD blocks add the intended AC-AUDIT-04 reverse pointers in development deployments and multi-repository delivery. They do not replace the completion disclosure. The delivery-audit finding's existing history/conflict confirmation remains valid; no supersession amendment or business assumption was needed.
