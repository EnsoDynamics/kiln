# Test audit: Kiln Run Restart

**Status:** 16 to fix (AC-CARRY-06, AC-CARRY-03, AC-FROM-03, AC-RESET-02, AC-RESET-06, AC-CARRY-01, AC-RESET-05, AC-RESET-04, AC-LOOK-01, AC-CARRY-02, AC-RESET-03, AC-FROM-02, AC-CASE-01, AC-FROM-05, AC-CASE-03, AC-RESET-01); stuck: AC-CURRENT-01
**Last audit:** 2026-11-13, whole PRD, at `9b8b913`; first fixing chat 2026-11-13, at `ab4fa90`; second fixing chat 2026-11-13, at `56811fe`
**PRD:** [kiln-run-restart-prd.md](./kiln-run-restart-prd.md)
**Next:** a whole-PRD delivery audit, because the second fixing chat changed code; then a fixing chat from AC-CARRY-06. AC-CURRENT-01 waits for Doug to say how to proceed.

Every phase (1 to 8) is closed, so all 23 criteria were graded. No criterion is Missing, Not implemented, superseded or changed outside the requirements, and no mapped test was found skipped or failing. The 5 criteria at Adequate each had their riskiest stated part broken on purpose, and a mapped test failed every time; none has had every stated part broken, so none is Strong.

Short names for the test files used below:
- **SFB:** `src/engine/start-from-branch.integration.test.ts`
- **SFS:** `view/src/screens/start-from-screens.test.ts`
- **RR:** `src/engine/run-restart.integration.test.ts`
- **RRB:** `src/server/run-restart-browser.integration.test.ts`
- **RRC:** `src/server/run-restart-cli.integration.test.ts`
- **THI:** `src/live/takeover-history.integration.test.ts`. It runs only on macOS (`describe.skipIf(platform !== "darwin")`), so `npm run verify` on a Mac runs it and the Linux and Windows CI runners skip it.
- **KRR:** `src/kiln-run-reset.integration.test.ts`
- **ERI:** `src/engine/reset.integration.test.ts`
- **KRP:** `src/kiln-run-repositories.integration.test.ts`

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-FROM-01 — The first screen asks where to start from | Adequate | 7 of 7 | SFB "selects the existing branch…", SFS "asks where to start from…" | `src/engine/engine.ts` (`startChoice`), `view/src/screens/DocumentsFound.svelte` | 2026-11-13 `9b8b913` |
| AC-FROM-02 — The screen shows what will run from there | Weak | 10 of 13 | SFB "selects the existing branch…", "offers to bring it up to date…", "goes straight to final delivery…"; SFS | `src/engine/start-from.ts` (`newBranchPreview`, `existingBranchPreview`), `view/src/lib/documents-found.ts` | 2026-11-13 `9b8b913` |
| AC-FROM-03 — Any branch can be chosen, except where the table says (high risk) | Weak | 15 of 19 | SFB "makes the base, the person's own checkout…unavailable", "adopts a worktree…", "makes a local branch that tracks one only on origin"; KRR | `src/engine/start-from.ts` (`classifyBranch`, `branchList`) | 2026-11-13 `9b8b913` |
| AC-FROM-04 — Kiln adds to the branch and never rewrites it (high risk) | Adequate | 8 of 8 | SFB "selects the existing branch… adds to the branch without rewriting it", "goes straight to final delivery…"; SFS | `src/engine/engine.ts` (`setUpExistingEntry`), `src/engine/start-from.ts` (`readRepository`) | 2026-11-13 `9b8b913` |
| AC-FROM-05 — Several repositories use the one branch name | Weak | 6 of 8 | KRP "uses the branch where a repository has it…"; SFB "a repository that has an unavailable branch…" | `src/engine/start-from.ts` (`existingBranchPreview`, `branchList`) | 2026-11-13 `9b8b913` |
| AC-CURRENT-01 — Kiln offers to catch an untouched branch up (high risk) | Weak, stuck | 26 of 27 | SFB "offers to bring it up to date…", "offers nothing at Start…", "offers nothing at a stop…", "catches the branch up before kiln reply…", "…before kiln carry-on…", "never catches up on Mark complete", "gives a held phase no offer…", "carries on from a held phase…"; RRC `--leave-branch-as-is` tests; KRP "moves only the repository whose branch qualifies…", "moves at a stop only the repository…"; RRB catch-up tests | `src/engine/start-from.ts` (`readCatchUp`, `catchUpRepository`), `src/engine/engine.ts` (`catchUpAtStop`, `refreshStoppedWork`), `src/control/client.ts` | 2026-11-13 `56811fe` |
| AC-CASE-01 — A stopped phase's headline says which case it is | Weak | 10 of 13 | RR, RRB, RRC case tests; THI | `src/engine/engine.ts` (`stoppedCase`), `src/engine/stopped-phase.ts` (`readPhaseWork`) | 2026-11-13 `9b8b913` |
| AC-CASE-04 — The first card shows the latest launch | Adequate | 7 of 7 | RR "says so, shows What Kiln found…", "returns the carry-on card after a carry-on that never began…"; `src/engine/stopped-phase.test.ts`; RRB | `src/engine/snapshot.ts` (`restartFacts`), `src/engine/stopped-phase.ts` (`launchFailure`) | 2026-11-13 `9b8b913` |
| AC-CASE-02 — A phase Kiln couldn't launch can be started again | Adequate | 7 of 7 | RR "says so, shows What Kiln found, offers only Start Phase N again…"; RRC "kiln start-again…"; RRB | `src/engine/engine.ts` (`startAgainControl`, `launchAtStop`) | 2026-11-13 `9b8b913` |
| AC-CASE-03 — A phase that built nothing shows no completion checks until asked | Weak | 7 of 8 | RR "names the case and the conversation's running time…"; RRB; RRC | `src/engine/snapshot.ts` (`nothingToCheck`), `src/engine/engine.ts` (stop rows' `reason`) | 2026-11-13 `9b8b913` |
| AC-CARRY-01 — Kiln carries on only when the conversation can't be reopened (high risk) | Weak | 4 of 7 | RR carry-on and Codex safety tests; RRB "draws the carry-on card…" | `src/engine/engine.ts` (`carryOnControl`, `resumeOffered`), `view/src/screens/NeedsYou.svelte`, `PhaseHandoff.svelte` | 2026-11-13 `9b8b913` |
| AC-CARRY-02 — The card says why, and how to clear it | Weak | 7 of 12 | RR reason tests; RRB carry-on and held-page tests; `src/session/claude-history.integration.test.ts`; `src/engine/codex-workflow.integration.test.ts` | `view/src/components/CarryOnCard.svelte`, `src/engine/stopped-phase.ts` (`claudeReopenCheck`) | 2026-11-13 `9b8b913` |
| AC-CARRY-05 — Carrying on starts a new session that knows what was done (high risk) | Adequate | 10 of 10 | RR "offers carry-on with the reason…", "checks completion first and starts nothing…"; RRC "kiln carry-on…"; RRB | `src/engine/engine.ts` (`recoverPhase`, `launchAtStop`), `src/session/prompts.ts` (`carryOnPrompt`) | 2026-11-13 `9b8b913` |
| AC-CARRY-03 — Starting a session keeps the existing limits (high risk) | Weak | 6 of 7 | RR "makes them unavailable, with the reason, while a billing restriction…", "makes Start Phase N again unavailable…", Codex safety test; RRB "draws Start Phase N again and Send reply & continue Phase N unavailable…" | `src/engine/engine.ts` (`carryOnControl`, `startAgainControl`, `launchBusy`, `controlView`) | 2026-11-13 `56811fe` |
| AC-CARRY-04 — Bots can start these sessions too (high risk) | Adequate | 16 of 16 | RRC (refusals, stale token, billing, running session, retried command ID, `command-status`, text mode); `src/control/help.test.ts`; THI | `src/control/commands.ts`, `src/control/help.ts`, `src/control/client.ts` | 2026-11-13 `ab4fa90` |
| AC-CARRY-06 — A held phase can carry on when its conversation can't be reopened (high risk) | Weak | 13 of 15 | THI (macOS only), including "keeps today's wait text until the attempt ends…" and "shows the uncertain message above the cards…"; RRB "draws a held page…", "advances from the carry-on's already-complete choice…" | `src/engine/engine.ts` (takeover reconciliation, `carryOnOwnership`, `stoppedPhaseKey`, `launchSession`), `src/live/ownership.ts` | 2026-11-13 `56811fe` |
| AC-RESET-01 — Reset sits at the bottom of every screen | Weak | 2 of 3 | KRR "the open page resets through its confirmation…"; ERI | `src/engine/snapshot.ts`, `view/src/App.svelte`, `view/src/components/ResetFooter.svelte` | 2026-11-13 `9b8b913` |
| AC-RESET-02 — Reset waits for Kiln to stop working (high risk) | Weak | 3 of 6 | ERI "is unavailable while a session works…" | `src/engine/engine.ts` (`resetControl`, `controlView`), `view/src/components/ResetFooter.svelte` | 2026-11-13 `9b8b913` |
| AC-RESET-03 — Reset asks first, and says what goes and what stays | Weak | 6 of 9 | KRR "the open page resets…"; `view/src/lib/reset.test.ts` | `src/engine/engine.ts` (`resetPreview`), `view/src/lib/reset.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-04 — After a reset Kiln behaves as if it had never run the PRD (high risk) | Weak | 6 of 8 | KRR (all five tests) | `src/engine/reset.ts`, `src/engine/engine.ts` (`applyReset`, `rerunStartChecks`), `src/kiln-command.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-05 — Reset touches nothing in git (high risk) | Weak | 1 of 3 | KRR "the open page resets…" (`gitState`); ERI | `src/engine/engine.ts` (`applyReset`), `src/engine/reset.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-06 — Bots can reset too, and the help says what it costs (high risk) | Weak | 6 of 7 | KRR "kiln reset resets at once from a bot…"; ERI; `src/control/help.test.ts` | `src/control/commands.ts`, `src/engine/engine.ts` (`resetControl`) | 2026-11-13 `9b8b913` |
| AC-LOOK-01 — The screens match their drawings | Weak | 15 of 20 | SFS; RRB; KRR | `view/src/screens/*.svelte`, `view/src/components/*.svelte` | 2026-11-13 `9b8b913` |

Red checks run (each broke the named part, saw a mapped test fail twice, and was restored byte for byte):
- **AC-CURRENT-01 (fixing chat, new tests):** Start's and a stop's qualification ignoring uncommitted files, commits of its own, and being behind; `reply` and `carry-on` left out of the catch-up commands; Mark complete catching up; the held-phase offer guards; Start moving every repository rather than only qualifying ones; the CLI dropping `--leave-branch-as-is` (for every command, and for `reply`/`resume` alone); the page's Send reply & resume and Send reply & continue dropping the tick. Each made a new test fail twice.
- **Second fixing chat, new tests:** catch-up at a held phase (`catchUpAtStop`'s hold guard removed); a stop catching up every repository rather than only qualifying ones; carry-on offered before a held attempt ends; the carry-on ownership obstacle dropped; held-page **Check again** not rechecking; the button not waiting for the acknowledgement; the uncertain message forwarded into the carry-on prompt; Start again ignoring billing; the running-session limit dropped; the page's carry-on button ignoring its control's availability. Each made a new test fail twice.
- **AC-CARRY-04 (fixing chat, new tests):** carry-on offered where the conversation can be reopened; start-again and carry-on settling as `session_resumed`. Each made a new RRC test fail twice. Red check not possible for the billing, stale-token, running-session and command-ID-replay refusals: each is a guard on whether Kiln launches a session.
- **AC-FROM-04:** `setUpExistingEntry` resetting the branch to its base (`worktree add -B`): SFB "selects the existing branch…" failed.
- **AC-CARRY-05:** `recoverPhase` skipping the completion-first check for carry-on: RR "checks completion first and starts nothing…" failed.
- **AC-FROM-01:** `startChoice` always choosing a new branch: SFB "selects the existing branch…" failed.
- **AC-CASE-04:** `restartFacts` never setting What Kiln found: RR "says so, shows What Kiln found…" failed.
- **AC-CASE-02:** Start again launching with a prompt other than the phase's first one: RR "says so, shows What Kiln found…" failed.

## Code fixed by this audit

- **AC-CURRENT-01, a catch-up failing on Kiln's own read (fix commit `1687340`):** a new test caught a stopped phase's catch-up failing `branch_catch_up_failed` with "index.lock: File exists" in 2 of 9 loaded runs. Kiln's own `git status` reads, the stop's background Work read and the one each page open or reconnect runs, took the worktree's index lock while the fast-forward ran. Both reads (`readPhaseWork` in `src/engine/stopped-phase.ts` and `uncommittedFiles` in `src/engine/start-from.ts`) now pass `--no-optional-locks`, so they never take that lock. A deliverable review found that awaiting the stop's background read, the first form tried, left the page-open read racing. Red check not possible: the race can't be reproduced on demand. Because this changed implementation, a whole-PRD delivery audit runs before the next fixing chat.

- **AC-CARRY-06, `kiln run` crashing when a carry-on starts from a held page (fix commit `56811fe`):** a new test with the page open caught an uncaught TypeError in the server's snapshot timer. After a carry-on from a hold clears the phase's stop, and before the new process runs, `stoppedPhaseKey()` still returned the hold's phase, and `needsYouView` read its missing stop. A hold now counts as the stopped phase only while its stop is recorded. Seen red: the test fails with the unhandled error on every run without the fix.
- **AC-CARRY-06, the held page coming back once a carry-on began (same commit):** in the same window, the once-a-second takeover reconciliation recorded the stop again, and it outlived the new run's init, which ends the hold. A deliverable review found it; a new assertion in SFB "carries on from a held phase…" (a reconciliation during the launch's ownership check) failed twice before the fix. A session process run (a launch or a resume) that has cleared its stop now keeps reconciliation from recording it again until that run returns; a second review caught the first form leaking past a resume. Because this changed implementation, a whole-PRD delivery audit runs before the next fixing chat.

## To fix, in order

**Stuck** (waiting for Doug to say how to proceed)
- **AC-CURRENT-01** (high risk): 26 of 27. `stuck`
  - tried 2026-11-13 (first fixing chat): added the no-offer cases at Start and at a stop, catch-up on `reply` and `carry-on`, Mark complete, the held-phase offer, a two-repository ticked Start, `--leave-branch-as-is` on every command, and the page's reply and carry-on buttons, each seen red. The re-grader still found two parts.
  - tried 2026-11-13 (second fixing chat): added a ticked carry-on at a held phase that starts a session without moving the branch, and a stop over two repositories where only the qualifying one moves, each seen red. The re-grader found a part not named before.
  - Uncovered part: with more than one repository qualifying, each one's branch moves. Every test that moves branches has exactly one qualifying repository, so a loop that stopped after the first (in `catchUpAtStop` or in Start's per-repository catch-up) would fail nothing.
  - Fix, if Doug says to go on: in KRP, make both product's and returns-api's branches untouched and behind (1 and 2 commits), press **Start Phase N again** ticked at a stop, and assert two `branch_catch_up` rows, both origins at their develop tips and two `branchCatchUps`; the same through `/api/start` at Start.

**Weak**
- **AC-CARRY-06** (high risk): 13 of 15.
  - tried 2026-11-13: added the wait text before the attempt ends, the carry-on obstacle, the reason sentence and **Check again**, the uncertain message above the cards with the button waiting for its acknowledgement, and the message reaching the new session only through the reply, each seen red. The fresh re-grader still found two parts.
  - Weak parts: the button and the terminal card's copy buttons unavailable while work the attempt started is still running. The only test mocks `captureOwnedProcesses` to throw (Kiln can't confirm), so `carryOnOwnership`'s `gate.tracked` loop and its `gate.obstacle` check are never reached; deleting the loop fails no test.
  - Fix: in THI (`phase`, `takeover`), remove the history, push a live process's real identity into the attempt gate's `tracked` list with `withGate` (the pattern in `src/live/owned-processes.integration.test.ts` "drops tracked processes…"), reconcile, and assert the obstacle "Work the paused session started is still running.", `needsYou.carryOn` unavailable with it, **Send reply & continue** disabled and "Copy terminal command" absent on the page, the terminal card's own reason, and `kiln carry-on` starting nothing; then end the process and assert the obstacle clears.
- **AC-CARRY-03** (high risk): 6 of 7.
  - tried 2026-11-13: added Start again's billing and running-session limits (engine, snapshot, controls and a refused submit), the running-session controls for bots, and the page drawing both buttons unavailable with their reasons, each seen red. The fresh re-grader still found one part.
  - Weak part: **Send reply & continue**'s reason while a session runs is never pinned; removing `this.launchBusy() ||` from `carryOnControl` fails no test, because `recoverPhase` still refuses.
  - Fix: in RR, on the carry-on stop, set `current` to `{ phaseKey: "1", processRunning: true }` as the Start again test does, and assert `carryOnControl()` and `needsYou.carryOn` give "A session for this PRD is running."; tighten the running-session `controlView` assertions to that sentence.
- **AC-FROM-03** (high risk): 15 of 19.
  - Uncovered parts:
    - a branch whose recorded worktree folder now holds something else (`holds_something_else`);
    - the folder checks running before a worktree is made for a branch checked out nowhere.
  - Weak parts:
    - the uncommitted-file count line is drawn only at 0;
    - nothing asserts the new worktree is at the Worktree setting.
  - Fix:
    - In SFB "which branches…unavailable", replace a removed worktree's folder with a plain folder, and with another checkout, and assert each reason.
    - Add an SFB case with a non-empty Worktree folder, refused at Start, with no worktree added.
    - Add an SFS case with `uncommittedFiles: 2`.
    - Assert `engine.worktreePath` in "makes a local branch that tracks one only on origin".
- **AC-RESET-02** (high risk): 3 of 6.
  - Uncovered part: Kiln's own work between sessions makes reset unavailable, with its sentences.
  - Weak parts:
    - ERI's expected reason follows a ternary on `liveView()`, so only one of the Pause & take over and pause-after-only rows runs;
    - no test draws the footer unavailable.
  - Fix:
    - Add an ERI case holding the engine in its own work, asserting both sentences and that a reset submit is refused.
    - Run deterministic take-over and no-take-over cases, each with its literal sentence.
    - Render `ResetFooter` with `available: false` and assert the reason and the disabled button.
- **AC-RESET-06** (high risk): 6 of 7. The command's refusal during Kiln's own work is untested. Fix: AC-RESET-02's own-work case also submits `reset` through the journal or the CLI and asserts the refusal.
- **AC-CARRY-01** (high risk): 4 of 7.
  - Weak parts:
    - the Needs you page's carry-on branch is never drawn;
    - the Codex safety row's "Conversation recovery unavailable" beside the terminal card is never drawn for a stopped phase;
    - row 2's terminal card isn't checked for the old resume-unavailable note.
  - Fix:
    - Add RRB fixture cases for a `not_resumable` stop with `reopen_failed` and for `reopen.state: "safety"`.
    - Add `not.toContain("The saved conversation cannot be opened.")` to the carry-on test.
- **AC-RESET-05** (high risk): 1 of 3.
  - Weak parts:
    - no pull request change is shown only through origin's refs;
    - documents are compared only in the worktree.
  - Fix:
    - Add the main checkout's `status --porcelain` and HEAD to KRR's `gitState`, with a two-repository variant.
    - Assert the `gh` stand-in got no mutating call during the reset.
- **AC-RESET-04** (high risk): 6 of 8.
  - Weak parts:
    - after the fixing reload, Start's enabled state is never asserted;
    - nothing shows the settings are forgotten.
  - Fix: in KRR's first test, assert `button.start` enabled after the reload, and start from non-default settings that are back at their defaults after the reset.
- **AC-LOOK-01:** 15 of 20.
  - Uncovered parts:
    - the held page's order;
    - the reset line while working;
    - the reset confirmation's two-column layout and order.
  - Weak parts:
    - the built-nothing page's card order;
    - the confirmation's intro sentence and "Kiln forgets" heading.
  - Fix:
    - Add `order(page)` checks to RRB's held-page and built-nothing tests.
    - Draw the footer unavailable (shared with AC-RESET-02).
    - In KRR's first test, assert the intro text, the heading, two columns side by side at 1200 px, and Cancel before Reset.
- **AC-CARRY-02:** 7 of 12.
  - Weak parts: the card's sentences for `not_a_file`, `no_messages`, `unreadable` and `reopen_failed` are never drawn. `stopped-phase.test.ts` asserts `reopenSentence`, which the card doesn't use.
  - Uncovered parts: the Codex row (the recorded reason), and Check again clearing it for Codex.
  - Fix:
    - Add one RRB `it.each` over the five reasons, asserting each table sentence on the card.
    - In `codex-workflow.integration.test.ts`, assert `reopen {reason: "codex", detail}` and carry-on after a missing thread, then available again after `reopenCheckAgain()`.
- **AC-RESET-03:** 6 of 9. The real preview's own-commit count, uncommitted-file count, pull requests and phases closed on the branch are seen only at zero, or as wording from hand-made previews. Fix: an ERI or KRR case with 2 own commits, 1 uncommitted file in the worktree, a leaf closed on the branch and an open stand-in pull request, asserting `resetPreview()`.
- **AC-FROM-02:** 10 of 13.
  - Weak parts:
    - a new branch's `closedCount` and `startAt` from `newBranchPreview` are seen only in a hand-built snapshot;
    - with every phase closed, the audits before final delivery are replaced by a harness stand-in.
  - Uncovered part: with every phase closed, the count line and Start are today's.
  - Fix:
    - Assert `documents.start` after `changeStart({from: "new"})` in SFB, with a phase closed on develop.
    - Add an SFS all-closed case.
    - Assert the audit step runs, or `auditNext` is called, in "goes straight to final delivery…".
- **AC-CASE-01:** 10 of 13.
  - Uncovered parts:
    - work in a second repository counts;
    - a hold on an uncertain message keeps today's page.
  - Weak part: the conversation's running time is only `expect.any(Number)`.
  - Fix:
    - Pin `conversationRanMs` to the run's start and end in RR.
    - Add a two-repository stop whose only commit is in the second repository.
    - Assert `needsYou.case` undefined in THI's uncertain-message test.
- **AC-FROM-05:** 6 of 8.
  - Uncovered parts:
    - the list holding every repository's branches;
    - existing worktrees in different workspace folders making the branch unavailable.
  - Fix:
    - Call `branchList` over two real repositories in SFB.
    - Add a case with the branch's worktrees in two folders, asserting the field error and the refused Start.
- **AC-CASE-03:** 7 of 8. Weak part: no test checks that a fresh stop's own reason row carries `reason`, so it would still show under Nothing to check yet. Fix: in RR, assert the `not_resumable` stop's reason row has `reason: true` and "Phase doc closed" doesn't; or assert the reason text on RRC's real-snapshot page.
- **AC-RESET-01:** 2 of 3. Weak part: the line is seen only on the stopped Needs you page. Fix: assert `buildSnapshot(engine).reset` on Complete, held and Folder missing, and `footer.reset` last on one more browser page.

**Strong, if asked** (high-risk criteria)
- **AC-FROM-04:** the riskiest part has been seen to fail. Not yet broken:
  - the pull-request read;
  - the refusal when origin moved ahead (untested);
  - a fast-forward catch-up swapped for a reset (undetectable on an untouched branch).
- **AC-CARRY-05:** completion-first has been seen to fail. The reply, last message and work reaching the prompt have not been broken, and a Codex carry-on runs only in the opt-in provider proof.
