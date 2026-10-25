# Phase 4: Show remaining human actions at completion

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
Build this phase through `implement-from-requirements` in a fresh chat, proving the whole criterion. Then follow the method's whole-PRD test audit. The plan's final delivery audit has run; this document records its sole confirmed implementation gap. Phase 3's Verification environment notes and Final commit gate retain the pre-existing test limitations; the delivery audit did not grade tests or rerun application suites.
