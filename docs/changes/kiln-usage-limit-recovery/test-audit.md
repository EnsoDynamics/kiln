# Test audit: Kiln usage-limit recovery

**Status:** Done 2026-10-22; every criterion Adequate or better
**Last audit:** 2026-10-22, whole PRD, at `6ebc24c`
**PRD:** [kiln-usage-limit-recovery-prd.md](./kiln-usage-limit-recovery-prd.md)

Criteria superseded in part by `docs/changes/kiln-multi-repo-delivery/` (AC-AUTO-01, AC-RESUME-01 to 03) are graded on the part still in force. Proof gate 5 (recordings of a real refusal) was waived by Doug; the refusal the tests use is built from the SDK's typed `rate_limit_event`, and the first real limit in live use stands in for the recordings (the design's "Testing Approach").

Test files: `RI` src/engine/resume.integration.test.ts, `UW` src/engine/usage-limit-wait.integration.test.ts, `UL` src/session/usage-limit.test.ts, `CI` src/account/claude-info.integration.test.ts, `KU` src/kiln-run-underway.integration.test.ts, `LS` src/server/local-server.integration.test.ts, `VB` src/server/view-in-browser.integration.test.ts, `PS` view/src/screens/progress-screens.test.ts, `US` view/src/screens/usage-limit-screens.test.ts, `TO` src/terminal-output.test.ts, `RM` src/state/record-migration.test.ts.

## By criterion

| Criterion | Grade | Tests | Code | Checked |
|---|---|---|---|---|
| AC-AUTO-01 — Kiln waits instead of stopping | Adequate | `UL` refusal tests; `UW` "waits instead of stopping…", "waits when a usage limit refuses it with no pull request open…" | `src/session/usage-limit.ts`, `src/engine/engine.ts` (`judgeEndedSession`, `settleRefused`, `drive`) | 2026-10-22 `6ebc24c` |
| AC-AUTO-02 — Kiln resumes as soon as the account has usage left | Adequate | `UW` wait and reading tests, "the check first, at Resume now and at the end of a wait"; `UL` "has usage left"; `CI` "read afresh…"; `KU` "says it is waiting…" | `src/engine/engine.ts` (`watchWait`, `readingArrived`, `resumeWait`), `src/session/usage-limit.ts` (`judgeReading`) | 2026-10-22 `6ebc24c` |
| AC-AUTO-03 — The wait survives sleep and restarts, and keep-awake covers it | Adequate, not yet seen to fail | `UW` keep-awake, sleep and restart tests; `KU` "says it is waiting…"; `US` keep-awake label | `src/engine/engine.ts` (`updateKeepAwake`, `recheckWait`) | 2026-10-22 `6ebc24c` |
| AC-AUTO-04 — Resuming by itself is a setting, on by default (high risk) | Adequate | `UW` "the setting (AC-AUTO-04)" tests; `RM` schema 3 migration; `US` and `VB` setting rows; `LS` settings route | `src/engine/engine.ts` (`changeSettings`, `resumeSession`), `src/state/records.ts` | 2026-10-22 `6ebc24c` |
| AC-AUTO-05 — Kiln stops waiting when the wait didn't free the account | Adequate | `UW` "Kiln's own resume refused again (AC-AUTO-05)"; `US` "says Kiln resumed by itself…" | `src/engine/engine.ts` (`settleRefused`), `src/session/usage-limit.ts` (`sameAccount`) | 2026-10-22 `6ebc24c` |
| AC-LIMIT-01 — The browser says which limit and when it resets | Adequate | `UL` labels; `US` limit and reset tests; `VB` both usage-limit screens as drawn; `view/src/lib/time.test.ts` | `view/src/lib/usage-limit.ts`, `src/engine/snapshot.ts` (`limitView`) | 2026-10-22 `6ebc24c` |
| AC-LIMIT-02 — The person sees how to carry on | Adequate | `US` and `VB` screen copy; `VB` "copies the command to switch accounts…"; `UW` "Resume now…"; `VB` "sends Resume now with no note…" | `view/src/components/SwitchAccountCommand.svelte`, `src/engine/engine.ts` (`resume`) | 2026-10-22 `6ebc24c` |
| AC-LIMIT-03 — The person sees which account Kiln last read | Adequate | `UW` snapshot `account`; `US` account card and amber line tests, "…never holds Resume now or Resume for the amber line"; `VB` both screens as drawn | `src/engine/snapshot.ts` (`limitView`), `view/src/components/LimitAccount.svelte`, `view/src/lib/usage-limit.ts` (`atLimitLine`) | 2026-10-22 `6ebc24c` |
| AC-LIMIT-04 — Waiting is a screen and a state of its own | Adequate | `UW` state, ending and pause tests; `US` waiting screen tests; `VB` waiting-for-usage as drawn, "shows a waiting phase as Interrupted in the Disconnected layout…" | `src/engine/snapshot.ts` (`waitingView`), `view/src/App.svelte`, `view/src/screens/Waiting.svelte` | 2026-10-22 `6ebc24c` |
| AC-LIMIT-05 — The terminal says when Kiln waits and resumes | Adequate | `TO` waiting lines; `UW` waiting and resumed events; `KU` "says it is waiting…" | `src/terminal-output.ts`, `src/kiln-command.ts` (`formatTerminalEvent`) | 2026-10-22 `6ebc24c` |
| AC-RESUME-01 — Needs you offers Resume | Adequate, not yet seen to fail | `RI` offered and not-offered tests; `PS` Resume card; `VB` needs-you-resume as drawn | `src/engine/engine.ts` (`resumeOffered`), `view/src/screens/NeedsYou.svelte` | 2026-10-22 `6ebc24c` |
| AC-RESUME-02 — Resume checks first, then picks up the same session (high risk) | Adequate | `RI` "checks first, then picks up…", "counts a phase the person finished by hand as Done…", "holds Resume and Check again…", "completes the feature, resuming nothing, when Resume's pull-request check passes…"; `UW` "the check first, at Resume now and at the end of a wait"; `UW` "waits instead of stopping…", "Resume now…" | `src/engine/engine.ts` (`resume`, `resumeWait`, `resumeSession`), `src/session/prompts.ts` | 2026-10-22 `6ebc24c` |
| AC-RESUME-03 — The person can tell the session something first | Adequate, not yet seen to fail | `RI` note tests; `UW` "Resume now…takes no note"; `LS` "carries Resume and its note…"; `VB` "sends Resume with the note…" | `src/session/prompts.ts` (`resumePrompt`), `src/engine/engine.ts` (`resume`) | 2026-10-22 `6ebc24c` |
| AC-RESUME-04 — A session that can't be picked up comes back to the person | Adequate | `RI` "comes back to Needs you as an interrupted session…"; `UW` "sends a resume with no init…"; `PS` not-resumable layout | `src/engine/engine.ts` (`judgeEndedSession`) | 2026-10-22 `6ebc24c` |

Red checks seen red at `6ebc24c`, in the audit: AC-AUTO-04 (the setting ignored once the end of a wait began; switching it off during a wait ignored), AC-AUTO-01 (a waiting phase let the loop start the next session), AC-AUTO-05 (an unknown account counted as another), AC-RESUME-04 (a resumed run without `init` judged as an ordinary failed check), AC-LIMIT-01 (a passed reset shown with a countdown), AC-LIMIT-05 (the wait line without its reset time). In remediation, each new test against the behavior it proves: a passing check that resumed anyway at Resume now, the end of a wait and the pull-request session's Resume (AC-RESUME-02, AC-AUTO-02); the lock dropped during Kiln's own resume (AC-RESUME-02); the switch-account Copy copying another command, and a copy control on the `--email` form (AC-LIMIT-02); Resume held by the amber line (AC-LIMIT-03); the waiting snapshot without its exit code and last skill, and the waiting screen kept when disconnected (AC-LIMIT-04).

## To fix, in order

Nothing below the target.

**Strong, if asked** (high-risk criteria)
- **AC-AUTO-04:** Documents found's setting row is never pressed in a browser; switching the setting off over HTTP during a wait is proven only by composition.
- **AC-RESUME-02:** Resume pressed while Check again's own check runs, the hold's release after Resume now and the end of a wait, and Resume now for the pull-request session have no direct test.

## Waiting
None.
