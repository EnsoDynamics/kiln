# Test audit: Kiln Build Preflight

**Status:** 2 to fix (AC-PREFLIGHT-01, AC-PREFLIGHT-03)
**Last audit:** 2026-11-15, whole PRD, at `a9d64fe`; first fixing chat 2026-11-16, at `cb69be0`
**PRD:** [kiln-build-preflight-prd.md](./kiln-build-preflight-prd.md)

Test files: `src/engine/build-preflight.integration.test.ts` (IT), `src/engine/preflight.test.ts` (UT), `src/engine/build-preflight-codex.integration.test.ts` (CODEX), `view/src/screens/build-preflight-screens.test.ts` (VT), `src/engine/attended-marks.integration.test.ts` (ENG), `view/src/screens/attended-marks-screens.test.ts` (SSR), `src/server/attended-marks-browser.integration.test.ts` (BROWSER), `src/plan/phase-plan.test.ts`. Integration files run in `npm run test:integration`, part of `npm run verify`. No criterion is high risk: a silent break costs an unattended run, not money or data.

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-PREFLIGHT-01 — The preflight comes before anything else the run does | Weak | 8 of 15 | IT (Start, Continue, unpause, `kiln continue`, Resume, `--resume`) | `src/engine/engine.ts` (`setPreflightDue` callers, `activateExecution`, `markResumePreflight`), `src/engine/preflight.ts` | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-08 — The preflight shows as a row in the plan | Adequate | 13 of 13 | IT (incl. "test audit: where the row sits…": Documents found `before` for 1, 2b and end; run plan above 2b and above the delivery audit; session output on opening the row; live controls refused with the preflight reason), VT | `src/engine/snapshot.ts` (`preflightRow`, `preflightPlanned`, `before` reordering), `view/src/lib/progress.ts`, `src/server/local-server.ts` (session output) | 2026-11-16 `cb69be0` |
| AC-PREFLIGHT-02 — A clean preflight goes straight on, and its row says what it found | Adequate | 6 of 6 | IT "runs first after Start…", IT "a clean row shows how long it took…", UT, VT | `src/engine/engine.ts` (`applyPreflightReport`), `src/engine/snapshot.ts` (`preflightRow`, `preflightFound`) | 2026-11-16 `cb69be0` |
| AC-PREFLIGHT-03 — Items stop the run at Needs you | Weak | 11 of 15 | IT "items stop the run at Needs you", UT, VT | `src/engine/engine.ts` (`applyPreflightReport`, `checkPreflightAgain`, `preflightOffer`, refusals), `view/src/components/PreflightStop.svelte` | 2026-11-15 `a9d64fe` |
| AC-PREFLIGHT-05 — An older method is not an error | Adequate | 5 of 5 | IT "a run whose agent has no build-preflight skill…", CODEX (no skill; skill listed) | `src/agents/metadata.ts`, `src/audit/workflow.ts` (`resolveSkill`), `src/engine/engine.ts` (`drivePreflight`) | 2026-11-16 `cb69be0` |
| AC-PREFLIGHT-06 — A preflight with no report does not hold up the run | Adequate | 6 of 6 | IT no-report (incl. "opening a No report row shows how its session ended"), unresolved, usage-limit tests; UT; VT | `src/engine/preflight.ts` (`readPreflightReport`), `src/engine/engine.ts` (`judgePreflight`) | 2026-11-16 `cb69be0` |
| AC-ATTEND-01 — Marked phases are shown in the plan | Adequate | 7 of 7 | ENG, SSR, BROWSER, `phase-plan.test.ts` | `src/engine/snapshot.ts`, `view/src/components/PhasePlan.svelte`, `NeedsYouThere.svelte` | 2026-11-15 `a9d64fe` |
| AC-ATTEND-03 — A stop in a marked phase says so | Adequate | 6 of 6 | ENG, SSR | `src/engine/snapshot.ts:760`, `view/src/components/AttendedCard.svelte`, `view/src/screens/NeedsYou.svelte` | 2026-11-15 `a9d64fe` |
| AC-ATTEND-04 — A marked phase runs like any other | Adequate | 3 of 3 | ENG "launches with the same prompts and options…" | `src/engine/plan-reading.ts` (`nextLeaf`) | 2026-11-15 `a9d64fe` |
| AC-ATTEND-05 — Documents found says when an early merge would stop the run | Adequate | 10 of 10 | SSR, BROWSER (incl. placement beneath the checkbox and computed border and background), ENG | `view/src/lib/documents-found.ts` (`earlyMergeStops`), `view/src/components/DevelopmentDelivery.svelte` | 2026-11-16 `cb69be0` |

Retired before the build, not graded: AC-PREFLIGHT-04, AC-PREFLIGHT-07, AC-ATTEND-02.

Red checks run this audit, each red twice and restored: AC-ATTEND-04 (`nextLeaf` skipping marked phases: the run never completed), AC-ATTEND-01 (`attended` dropped from run-plan rows in `snapshot.ts`: ENG failed), AC-ATTEND-03 (the card moved below the session-ended headline in `NeedsYou.svelte`: SSR failed). The Adequate rows are not yet seen to fail on every stated part.

Red checks in the first fixing chat (2026-11-16), each new test red twice and restored: Documents found's `before` ignoring closed phases and always `end` (`preflightPlanned`); the closed phases drawn after the activity rows, and the Preflight row drawn last (`activityViews`); the row's start time taken from its finish; the report's text copied into a ready row's Found line; the session-output route returning only the last line; Message Claude losing the preflight reason; a ready report keeping its stop lines (UT); Codex's `optionalSkills` forced on and forced off (`metadata.ts`); the early-merge warning's border and background removed (BROWSER). One break, a ready report keeping its stops in `readPreflightReport`, never reached the row (the engine saves only the outcome) and was replaced by the Found-line break above.

## To fix, in order

**Weak**
- **AC-PREFLIGHT-01:** 8 of 15. No test covers a Folder missing Start (from the base branch, from the existing feature branch before the preflight is settled, or one that ends a pause). No test covers Resume after Mark complete at an items stop. No test covers phases an audit appends getting no preflight, or the absence of any preflight setting. A Start with every phase closed never checks that the preflight comes before the delivery audit, because the harness mocks audits out. Fix: in IT with `createHarness({ preflight: true })`:
  - Reuse `folder-setup.integration.test.ts`'s Folder missing setup for three cases: the base-branch Start (trigger "start"), the feature-branch Start before the preflight is settled (trigger "resume", with a negative case at a phase's Needs you stop) and a Start that ends a pause (trigger "unpause").
  - Mark complete at an items stop, interrupt Phase 1, then Resume, and assert no second preflight. Add `preflightSettled({items, doneAt})` to UT.
  - Use `auditCycles: true` with an audit that appends a phase, and assert one preflight activity.
  - (Done in the first fixing chat, not yet re-graded for this row: IT "with every phase closed and completion audits on, the row sits directly above the delivery audit" runs the preflight session before the delivery audit's.)
  - Assert the settings carry no key matching `/preflight/i`.
- **AC-PREFLIGHT-03:** 11 of 15. Nothing presses Check Preflight again or Mark complete in the browser. No engine test proves that a real stop's snapshot carries the terminal `resumeCommand`. No normal-run test proves the worktree's `HEAD`, index and `git status --porcelain` are unchanged across a preflight. No test covers a second report from Check Preflight again that has items again. The refusal reason is compared only to the imported constant. Fix:
  - In IT-stop, seed an uncommitted file and compare `HEAD`, the index and the porcelain status before Start, at the stop and after Mark complete.
  - Assert `needsYou.resumeCommand` contains `claude --resume <preflight sessionId>`.
  - Add `[items, items]` and `[items, noReport]` cases after `check-again`.
  - Add a VT or browser press test asserting `check-again` and `waive-and-advance` with the offer's `checkRunId`.
  - Assert the literal reason text once.

Implied gaps, worth covering while the files are open: AC-PREFLIGHT-05 under Claude Code asserting the run completes, and Resume or Continue with the skill absent; AC-PREFLIGHT-06 a resumed preflight after a usage-limit wait has its report read; AC-PREFLIGHT-02 a ready report read under Codex; AC-ATTEND-05 an Early merge line on a split parent's leaf; the AC-ATTEND-01 marker on the Paused and Complete screens; the AC-ATTEND-03 card on the `carryOn` and record-only stop layouts and with an empty Attended line; AC-ATTEND-04 with a marked phase reached later or after a pause; AC-ATTEND-05 with an Early merge line on a split parent.
