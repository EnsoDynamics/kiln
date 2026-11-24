# Phase 4: Exit Kiln and closing-audit names

**Closed:** 2026-11-22

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "Exit Kiln", "Closing-Audit Names", "Interfaces" (`kiln exit`), "Display Contract"

## Summary
A finished run's page offers **Exit Kiln** whenever no session is running or being started, including at a merge or push stop and while one waits for usage; pressing it ends Kiln with a success status and says how to open the PRD again. Separately, every closing-audit row is named for what it does, Delivery audit, Test audit or Fixing tests, with its loop number, and "Round" and "Continuation" no longer appear where a person reads an audit's name.

## Acceptance criteria covered
AC-EXIT-01, AC-EXIT-02, AC-AUDIT-01, AC-BOT-01 (also applies to this phase's work), AC-BOT-02 (also applies to this phase's work)

## Out of scope for this phase
Exit Kiln on a run still in progress (the PRD's Out of Scope).

## Phase dependencies
2 (the Merged card and the merge stop, wait and restart hold that Exit Kiln appears on); 3 (the push stop, wait and accepting state that decide whether Exit Kiln is available). The audit names need no earlier phase.

## Phase-specific notes
- Exit ends through the ordinary stop path with code 0, but a reset ends through `stop.end()` (`kiln-command.ts`), skipping `engine.stop()`; signals give 130, 129 or 143, and `InterruptCause` (`records.ts`) has no exit value. `engine.stop` needs an exit cause, its report line and code 0.

## Carried forward from Phase 3
- **The push activity is built.** `openPlanPush(record)` (`delivery-reading.ts`) is the open push, `accepting` while it has `doneAt` and no `closedAt`; `openAfterDeliveryKey(record)` gives the open merge or push key. Exit is unavailable while a push is `accepting` (Kiln's own re-check and acceptance run from the loop's `acceptAfterPush`); its push stop, wait and restart hold reuse the merge's paths, keyed `plan-push-<operationId>`. `src/engine/plan-push.integration.test.ts` holds the harness (`finished`, `pressContinue`, `refused()`, `hanging()`, `kilnRun()`).
