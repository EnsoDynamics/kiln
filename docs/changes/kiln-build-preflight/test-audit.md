# Test audit: Kiln Build Preflight

**Status:** 7 to fix (AC-PREFLIGHT-08, AC-PREFLIGHT-01, AC-PREFLIGHT-03, AC-PREFLIGHT-02, AC-PREFLIGHT-06, AC-PREFLIGHT-05, AC-ATTEND-05)
**Last audit:** 2026-11-15, whole PRD, at `a9d64fe`
**PRD:** [kiln-build-preflight-prd.md](./kiln-build-preflight-prd.md)

Test files: `src/engine/build-preflight.integration.test.ts` (IT), `src/engine/preflight.test.ts` (UT), `view/src/screens/build-preflight-screens.test.ts` (VT), `src/engine/attended-marks.integration.test.ts` (ENG), `view/src/screens/attended-marks-screens.test.ts` (SSR), `src/server/attended-marks-browser.integration.test.ts` (BROWSER), `src/plan/phase-plan.test.ts`. Integration files run in `npm run test:integration`, part of `npm run verify`. No criterion is high risk: a silent break costs an unattended run, not money or data.

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-PREFLIGHT-01 — The preflight comes before anything else the run does | Weak | 8 of 15 | IT (Start, Continue, unpause, `kiln continue`, Resume, `--resume`) | `src/engine/engine.ts` (`setPreflightDue` callers, `activateExecution`, `markResumePreflight`), `src/engine/preflight.ts` | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-08 — The preflight shows as a row in the plan | Weak | 5 of 12 | IT, VT | `src/engine/snapshot.ts` (`preflightRow`, `preflightPlanned`, `before` reordering), `view/src/lib/progress.ts` | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-02 — A clean preflight goes straight on, and its row says what it found | Weak | 4 of 7 | IT "runs first after Start…", UT, VT | `src/engine/engine.ts` (`applyPreflightReport`), `src/engine/snapshot.ts` (`preflightRow`, `preflightFound`) | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-03 — Items stop the run at Needs you | Weak | 11 of 15 | IT "items stop the run at Needs you", UT, VT | `src/engine/engine.ts` (`applyPreflightReport`, `checkPreflightAgain`, `preflightOffer`, refusals), `view/src/components/PreflightStop.svelte` | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-05 — An older method is not an error | Weak | 3 of 4 | IT "a run whose agent has no build-preflight skill…" | `src/agents/metadata.ts`, `src/audit/workflow.ts` (`resolveSkill`), `src/engine/engine.ts` (`drivePreflight`) | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-06 — A preflight with no report does not hold up the run | Weak | 5 of 6 | IT no-report, unresolved, usage-limit tests; UT; VT | `src/engine/preflight.ts` (`readPreflightReport`), `src/engine/engine.ts` (`judgePreflight`) | 2026-11-15 `a9d64fe` |
| AC-ATTEND-01 — Marked phases are shown in the plan | Adequate | 7 of 7 | ENG, SSR, BROWSER, `phase-plan.test.ts` | `src/engine/snapshot.ts`, `view/src/components/PhasePlan.svelte`, `NeedsYouThere.svelte` | 2026-11-15 `a9d64fe` |
| AC-ATTEND-03 — A stop in a marked phase says so | Adequate | 6 of 6 | ENG, SSR | `src/engine/snapshot.ts:760`, `view/src/components/AttendedCard.svelte`, `view/src/screens/NeedsYou.svelte` | 2026-11-15 `a9d64fe` |
| AC-ATTEND-04 — A marked phase runs like any other | Adequate | 3 of 3 | ENG "launches with the same prompts and options…" | `src/engine/plan-reading.ts` (`nextLeaf`) | 2026-11-15 `a9d64fe` |
| AC-ATTEND-05 — Documents found says when an early merge would stop the run | Weak | 7 of 8 | SSR, BROWSER, ENG | `view/src/lib/documents-found.ts` (`earlyMergeStops`), `view/src/components/DevelopmentDelivery.svelte` | 2026-11-15 `a9d64fe` |

Retired before the build, not graded: AC-PREFLIGHT-04, AC-PREFLIGHT-07, AC-ATTEND-02.

Red checks run this audit, each red twice and restored: AC-ATTEND-04 (`nextLeaf` skipping marked phases: the run never completed), AC-ATTEND-01 (`attended` dropped from run-plan rows in `snapshot.ts`: ENG failed), AC-ATTEND-03 (the card moved below the session-ended headline in `NeedsYou.svelte`: SSR failed). The Adequate rows are not yet seen to fail on every stated part.

## To fix, in order

**Weak**
- **AC-PREFLIGHT-08:** 5 of 12. Documents found placement (above Phase 1 on a new branch, above the first open phase, after the closed phases when all are closed) is only rendered from hand-built snapshots, and the engine's `preflightPlanned` choice of `before` from the Documents found documents is never exercised. The run plan's placement above the first open phase on a branch with closed phases is never distinguished from Phase 1. The row is never checked above the delivery audit. A finished preflight's session detail and full report are never checked. Fix: in IT, build the snapshot with the documents the controller passes, for the default fixture (`before: "1"`), phase 1 closed (`"2b"`) and every phase closed (`"end"`). Close phase 1, Start, and assert the allocated row sits directly above "2b". With every phase closed and a delivery audit enabled (`auditCycles: true` with an audit stand-in), assert the preflight row sits above the `audit-…` row. Render or inspect a finished preflight's session detail and assert the full report appears (this also covers AC-PREFLIGHT-02 part 7 and AC-PREFLIGHT-06 part 4).
- **AC-PREFLIGHT-01:** 8 of 15. No test covers a Folder missing Start (from the base branch, from the existing feature branch before the preflight is settled, or one that ends a pause). No test covers Resume after Mark complete at an items stop. No test covers phases an audit appends getting no preflight, or the absence of any preflight setting. A Start with every phase closed never checks that the preflight comes before the delivery audit, because the harness mocks audits out. Fix: in IT with `createHarness({ preflight: true })`:
  - Reuse `folder-setup.integration.test.ts`'s Folder missing setup for three cases: the base-branch Start (trigger "start"), the feature-branch Start before the preflight is settled (trigger "resume", with a negative case at a phase's Needs you stop) and a Start that ends a pause (trigger "unpause").
  - Mark complete at an items stop, interrupt Phase 1, then Resume, and assert no second preflight. Add `preflightSettled({items, doneAt})` to UT.
  - Use `auditCycles: true` with an audit that appends a phase, and assert one preflight activity.
  - Run the all-closed fixture with a delivery audit, and assert the order is preflight, then the audit.
  - Assert the settings carry no key matching `/preflight/i`.
- **AC-PREFLIGHT-03:** 11 of 15. Nothing presses Check Preflight again or Mark complete in the browser. No engine test proves that a real stop's snapshot carries the terminal `resumeCommand`. No normal-run test proves the worktree's `HEAD`, index and `git status --porcelain` are unchanged across a preflight. No test covers a second report from Check Preflight again that has items again. The refusal reason is compared only to the imported constant. Fix:
  - In IT-stop, seed an uncommitted file and compare `HEAD`, the index and the porcelain status before Start, at the stop and after Mark complete.
  - Assert `needsYou.resumeCommand` contains `claude --resume <preflight sessionId>`.
  - Add `[items, items]` and `[items, noReport]` cases after `check-again`.
  - Add a VT or browser press test asserting `check-again` and `waive-and-advance` with the offer's `checkRunId`.
  - Assert the literal reason text once.
- **AC-PREFLIGHT-02:** 4 of 7. The row's duration is pinned only from hand-built VT timestamps. The ready fixtures carry no stop lines, so "does not repeat the stops" is never tested. Opening the row is never checked to show the stops in the full report. Fix: in IT's ready test, assert the row's `sessionStartedAt` and `doneAt`. Add a "**The build will stop** at …" line to the ready fixtures in IT and UT, and assert the row and result omit it. Cover opening the row with the shared session-detail test under AC-PREFLIGHT-08.
- **AC-PREFLIGHT-06:** 5 of 6. Opening a no-report row is never checked to show how the session ended. Fix: the shared session-detail test under AC-PREFLIGHT-08, asserting that a no-report preflight's detail shows its ending (the final message "I ran out of time before writing the report."). Implied: a failed spawn giving No report with the spawn message as its reason.
- **AC-PREFLIGHT-05:** 3 of 4. The Codex agent with no `build-preflight` skill is untested; the metadata and `resolveSkill` paths for Codex differ from Claude's. Fix: an IT case with the Codex stand-in and no skill (no planned row, no activity, first session is Phase 1), plus a positive Codex case with the skill installed.
- **AC-ATTEND-05:** 7 of 8. "Set apart from the text around it" has no assertion: deleting the `.early-stop` border and background in `DevelopmentDelivery.svelte` leaves every test green. Fix: in the BROWSER early-merge test, assert the `.early-stop` element's computed border or background differs from its container's.

Implied gaps, worth covering while the files are open: the AC-ATTEND-01 marker on the Paused and Complete screens; the AC-ATTEND-03 card on the `carryOn` and record-only stop layouts and with an empty Attended line; AC-ATTEND-04 with a marked phase reached later or after a pause; AC-ATTEND-05 with an Early merge line on a split parent.
