# Test audit: Kiln Planned Test Fix Batches

**Status:** 3 to fix (AC-MAX-02, AC-BATCH-01, AC-BATCH-04)
**Last audit:** 2026-11-26, whole PRD, at `e6a4daa`
**PRD:** [kiln-planned-test-fix-batches-prd.md](./kiln-planned-test-fix-batches-prd.md)

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-BATCH-01 — Every planned batch is a row as soon as the audit ends | Weak | 4 of 5 | `src/engine/planned-test-fix-batches.integration.test.ts` (rows, order, Planned/Next, replaces the planned Test audit row); `src/audit/fix-plan.test.ts::lists two batches…`; `view/src/screens/planned-test-fix-batches-screens.test.ts` | `src/audit/fix-plan.ts` `waitingBatches`; `src/engine/snapshot.ts` `withPlannedRows`, `batchRows` | 2026-11-26 `e6a4daa` |
| AC-BATCH-02 — The audit's row says what it found and planned | Adequate | 2 of 2 | `src/audit/fix-plan.test.ts::is the sum of its batches' criteria…`, `::never changes when a later session re-cuts…`; `planned-test-fix-batches.integration.test.ts::shows every batch as a row…`; `src/audit/admission.integration.test.ts` (criterion named twice refused) | `src/audit/fix-plan.ts` `auditFound`; `src/audit/audit-names.ts` | 2026-11-26 `e6a4daa` |
| AC-BATCH-03 — A batch's row names the batch and its size | Adequate | 6 of 6 | `src/audit/audit-names.test.ts::names a batch by its number of the plan's count…`, `::titles each audit…`, `::reads loops from the ledger…`; `src/audit/fix-plan.test.ts`; `planned-test-fix-batches.integration.test.ts`; `src/engine/audit-workflow.integration.test.ts` | `src/audit/audit-names.ts` `auditName`, `auditNameFacts` | 2026-11-26 `e6a4daa` |
| AC-BATCH-04 — The rows that have not started are the work still planned | Weak | 5 of 6 | `src/audit/fix-plan.test.ts` (AC-BATCH-04 block); `planned-test-fix-batches.integration.test.ts::shows every batch…`, `::removes the rows not started…`; `src/engine/items-for-a-person.integration.test.ts` | `src/audit/fix-plan.ts` `planCount`, `waitingBatches` | 2026-11-26 `e6a4daa` |
| AC-BATCH-05 — An audit with no batch plan shows as today | Adequate | 5 of 5 | `src/audit/admission.integration.test.ts::accepts a continue_test report with no plan…`; `src/audit/fix-plan.test.ts` (AC-BATCH-05 blocks); `planned-test-fix-batches.integration.test.ts::removes the rows not started…`; `src/engine/audit-loops-move-on.integration.test.ts` | `src/audit/validate-report.ts` `validateFixBatches`; `src/audit/fix-plan.ts` `sessionBatch` | 2026-11-26 `e6a4daa` |
| AC-MAX-01 — A loop is named with its maximum | Adequate | 13 of 13 | `src/control/loop-text.test.ts::names each row of the status line table…`; `view/src/screens/audit-loops-screens.test.ts`; `src/audit/audit-names.test.ts::says the loops a delivered run used…`; `planned-test-fix-batches.integration.test.ts`; `audit-workflow.integration.test.ts`; `items-for-a-person.integration.test.ts`; `completion-for-you.test.ts`; `delivered-run.integration.test.ts` | `src/audit/audit-names.ts` `loopText`, `positionText`, `loopsUsed` | 2026-11-26 `e6a4daa` |
| AC-MAX-02 — The settings say a run makes only the loops it needs | Weak | 0 of 4 on the page (text pinned at function level) | `view/src/lib/audit-loops.test.ts::says a loop is one audit plus its work…`; `src/control/loop-text.test.ts` (flags, `audit_loops`, guide) | `view/src/lib/audit-loops.ts` `loopSettingsHelp`; `view/src/components/AuditLoopSettings.svelte` | 2026-11-26 `e6a4daa` |
| AC-BOT-01 — `kiln status` reports the fix plan | Adequate | 15 of 15 | `planned-test-fix-batches.integration.test.ts::shows every batch as a row once the audit ends, names each, and reports them in kiln status`; `src/control/waiver-facts.test.ts`; `src/control/loop-text.test.ts` | `src/control/waiver-facts.ts` `progressRows`, `plannedBatchRows` | 2026-11-26 `e6a4daa` |

Red checks run and seen red: AC-BATCH-02 (`auditFound` summing only the first batch), AC-BATCH-03 (batch line reading "of k" instead of "of N"), AC-BATCH-05 (admission refusing a `continue_test` report with no `fixBatches`), AC-MAX-01 (status line "of 4" instead of "· max 4"), AC-BOT-01 (`kiln status` reporting a not-started batch as complete). None of the criteria is high risk.

## To fix, in order

**Batch 1 of 1:** AC-MAX-02, AC-BATCH-01, AC-BATCH-04

**Weak**
- **AC-MAX-02:** the help text is pinned exactly in `loopSettingsHelp`, but no test checks it is shown beside the **Audit loops** settings on either page; removing `{help.intro}` from `AuditLoopSettings.svelte` would fail nothing. Fix: in `view/src/screens/audit-loops-screens.test.ts`, assert the full intro on the Documents found render ("shows Max delivery audit loops…") and the short intro on the run's settings panel ("is in the run's settings, changeable…"); red-check by deleting `{help.intro}`.
- **AC-BATCH-01:** a batch row is pinned only as `will_run_on` with Change available; nothing pins that it shows the PRD's **Audits** choice as the planned Test audit row does, or that Change on it works. Fix: in `planned-test-fix-batches.integration.test.ts`, set a non-default Audits choice before the audit ends (as `change-models.integration.test.ts` does) and assert the waiting batch row shows it; red-check by passing a phase key instead of `PLANNED_AUDITS_KEY` in `batchRows`.
- **AC-BATCH-04:** no test has a session re-cut what it left into fewer batches, so N falling on every row is unproven; `planCount` taking the largest count ever planned would pass every test. Fix: in `src/audit/fix-plan.test.ts`, `record([{ batches: [3, 3, 3] }, { batches: [2] }])`, asserting row 1 reads "Batch 1 of 2…", `waitingBatches` is `[{ number: 2, of: 2, gaps: 2 }]` and `sessionBatch` has `of: 2`; red-check with that `planCount` change.
