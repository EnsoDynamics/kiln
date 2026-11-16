# Phase 3: Show the setting's sentence on the command line, and count only test sessions that ran

**Closed:** 2026-11-15

**Added by delivery audit:** 2026-11-15, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md)
**Technical design:** [Kiln Audit Loop Limits technical design](kiln-audit-loop-limits-technical-design.md) — relevant sections: "Settings", "Control journal", "Display Contract", "Upgrade"
**Repositories:** kiln

## Summary
Show the person the sentence Kiln will quote as theirs when they choose Deliver, unless something serious is left with `kiln settings`. Make every place an activity row quotes a person's sentence say where and when it was given. When a run begun under an earlier Kiln is upgraded, count as test audit loops only the test audit sessions that actually ran.

## Acceptance criteria covered
AC-LOOP-06 (completes it; owned by phase 1), AC-LOOP-03 (completes it; owned by phase 1)

## What the audit found missing
- **AC-LOOP-06:** the command line never shows "I accept the remaining Weak rows after the last test audit loop." beside the choice that gives it. The `kiln settings` entry `--after-last-test-audit-loop` in `prompts/kiln-command-contracts.json` says only "deliver (deliver, unless something serious is left)". `kiln settings` with no flags (`src/control/client.ts`, settings branch) returns only the value. The `kiln status` loops line (`afterLastTestWords` / `auditLoopsText` in `src/control/loop-text.ts`) shows only the label. The page shows the sentence (`loopSettingsHelp`), and the command line already shows the Accept sentence.
- **AC-LOOP-06:** an activity row quotes an Accept sentence ("carried your words “…”", `carriedLabel` in `view/src/lib/audit-loops.ts`, rendered in `view/src/components/PhasePlan.svelte`) without saying where or when it was given. The source appears only in the row's details (`carriedQuote`), which `PhasePlan.svelte` hides while the row is implementing or interrupted.
- **AC-LOOP-03:** `reconstructLedger` in `src/engine/loop-ledger.ts` counts an observed test loop for every test audit activity whose predecessor counts as `continue_test`, without checking that a session ran. An upgraded run therefore counts a continuation `completeAuditAtOnce` (`src/engine/engine.ts`) completed at once under a waived readiness problem, with no session, as a test loop. The delivery-loop rule beside it already requires a leaf that has a session or is done.

## Phase dependencies
1 (the settings, the control commands, the activity rows and the upgrade's ledger reconstruction)
