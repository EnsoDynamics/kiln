# Test audit: Kiln Run Restart

**Status:** 18 to fix (AC-CURRENT-01, AC-CARRY-04, AC-CARRY-06, AC-CARRY-03, AC-FROM-03, AC-RESET-02, AC-RESET-06, AC-CARRY-01, AC-RESET-05, AC-RESET-04, AC-LOOK-01, AC-CARRY-02, AC-RESET-03, AC-FROM-02, AC-CASE-01, AC-FROM-05, AC-CASE-03, AC-RESET-01)
**Last audit:** 2026-11-13, whole PRD, at `9b8b913`
**PRD:** [kiln-run-restart-prd.md](./kiln-run-restart-prd.md)

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
| AC-CURRENT-01 — Kiln offers to catch an untouched branch up (high risk) | Weak | 13 of 24 | SFB "offers to bring it up to date…", "catches the branch up before a resume…", "names each repository's own base…"; RRB catch-up tests | `src/engine/start-from.ts` (`readCatchUp`, `catchUpRepository`), `src/engine/engine.ts` (`catchUpAtStop`, `refreshStoppedWork`), `src/control/client.ts` | 2026-11-13 `9b8b913` |
| AC-CASE-01 — A stopped phase's headline says which case it is | Weak | 10 of 13 | RR, RRB, RRC case tests; THI | `src/engine/engine.ts` (`stoppedCase`), `src/engine/stopped-phase.ts` (`readPhaseWork`) | 2026-11-13 `9b8b913` |
| AC-CASE-04 — The first card shows the latest launch | Adequate | 7 of 7 | RR "says so, shows What Kiln found…", "returns the carry-on card after a carry-on that never began…"; `src/engine/stopped-phase.test.ts`; RRB | `src/engine/snapshot.ts` (`restartFacts`), `src/engine/stopped-phase.ts` (`launchFailure`) | 2026-11-13 `9b8b913` |
| AC-CASE-02 — A phase Kiln couldn't launch can be started again | Adequate | 7 of 7 | RR "says so, shows What Kiln found, offers only Start Phase N again…"; RRC "kiln start-again…"; RRB | `src/engine/engine.ts` (`startAgainControl`, `launchAtStop`) | 2026-11-13 `9b8b913` |
| AC-CASE-03 — A phase that built nothing shows no completion checks until asked | Weak | 7 of 8 | RR "names the case and the conversation's running time…"; RRB; RRC | `src/engine/snapshot.ts` (`nothingToCheck`), `src/engine/engine.ts` (stop rows' `reason`) | 2026-11-13 `9b8b913` |
| AC-CARRY-01 — Kiln carries on only when the conversation can't be reopened (high risk) | Weak | 4 of 7 | RR carry-on and Codex safety tests; RRB "draws the carry-on card…" | `src/engine/engine.ts` (`carryOnControl`, `resumeOffered`), `view/src/screens/NeedsYou.svelte`, `PhaseHandoff.svelte` | 2026-11-13 `9b8b913` |
| AC-CARRY-02 — The card says why, and how to clear it | Weak | 7 of 12 | RR reason tests; RRB carry-on and held-page tests; `src/session/claude-history.integration.test.ts`; `src/engine/codex-workflow.integration.test.ts` | `view/src/components/CarryOnCard.svelte`, `src/engine/stopped-phase.ts` (`claudeReopenCheck`) | 2026-11-13 `9b8b913` |
| AC-CARRY-05 — Carrying on starts a new session that knows what was done (high risk) | Adequate | 10 of 10 | RR "offers carry-on with the reason…", "checks completion first and starts nothing…"; RRC "kiln carry-on…"; RRB | `src/engine/engine.ts` (`recoverPhase`, `launchAtStop`), `src/session/prompts.ts` (`carryOnPrompt`) | 2026-11-13 `9b8b913` |
| AC-CARRY-03 — Starting a session keeps the existing limits (high risk) | Weak | 4 of 8 | RR "makes them unavailable, with the reason, while a billing restriction…", Codex safety test | `src/engine/engine.ts` (`carryOnControl`, `startAgainControl`, `launchBusy`, `controlView`) | 2026-11-13 `9b8b913` |
| AC-CARRY-04 — Bots can start these sessions too (high risk) | Weak | 5 of 12 | RRC; `src/control/help.test.ts`; THI | `src/control/commands.ts`, `src/control/help.ts`, `src/control/client.ts` | 2026-11-13 `9b8b913` |
| AC-CARRY-06 — A held phase can carry on when its conversation can't be reopened (high risk) | Weak | 8 of 13 | THI (macOS only); RRB "draws a held page…", "advances from the carry-on's already-complete choice…" | `src/engine/engine.ts` (takeover reconciliation, `carryOnObstacle`), `src/live/ownership.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-01 — Reset sits at the bottom of every screen | Weak | 2 of 3 | KRR "the open page resets through its confirmation…"; ERI | `src/engine/snapshot.ts`, `view/src/App.svelte`, `view/src/components/ResetFooter.svelte` | 2026-11-13 `9b8b913` |
| AC-RESET-02 — Reset waits for Kiln to stop working (high risk) | Weak | 3 of 6 | ERI "is unavailable while a session works…" | `src/engine/engine.ts` (`resetControl`, `controlView`), `view/src/components/ResetFooter.svelte` | 2026-11-13 `9b8b913` |
| AC-RESET-03 — Reset asks first, and says what goes and what stays | Weak | 6 of 9 | KRR "the open page resets…"; `view/src/lib/reset.test.ts` | `src/engine/engine.ts` (`resetPreview`), `view/src/lib/reset.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-04 — After a reset Kiln behaves as if it had never run the PRD (high risk) | Weak | 6 of 8 | KRR (all five tests) | `src/engine/reset.ts`, `src/engine/engine.ts` (`applyReset`, `rerunStartChecks`), `src/kiln-command.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-05 — Reset touches nothing in git (high risk) | Weak | 1 of 3 | KRR "the open page resets…" (`gitState`); ERI | `src/engine/engine.ts` (`applyReset`), `src/engine/reset.ts` | 2026-11-13 `9b8b913` |
| AC-RESET-06 — Bots can reset too, and the help says what it costs (high risk) | Weak | 6 of 7 | KRR "kiln reset resets at once from a bot…"; ERI; `src/control/help.test.ts` | `src/control/commands.ts`, `src/engine/engine.ts` (`resetControl`) | 2026-11-13 `9b8b913` |
| AC-LOOK-01 — The screens match their drawings | Weak | 15 of 20 | SFS; RRB; KRR | `view/src/screens/*.svelte`, `view/src/components/*.svelte` | 2026-11-13 `9b8b913` |

Red checks run (each broke the named part, saw a mapped test fail twice, and was restored byte for byte):
- **AC-FROM-04:** `setUpExistingEntry` resetting the branch to its base (`worktree add -B`): SFB "selects the existing branch…" failed.
- **AC-CARRY-05:** `recoverPhase` skipping the completion-first check for carry-on: RR "checks completion first and starts nothing…" failed.
- **AC-FROM-01:** `startChoice` always choosing a new branch: SFB "selects the existing branch…" failed.
- **AC-CASE-04:** `restartFacts` never setting What Kiln found: RR "says so, shows What Kiln found…" failed.
- **AC-CASE-02:** Start again launching with a prompt other than the phase's first one: RR "says so, shows What Kiln found…" failed.

## To fix, in order

**Weak**
- **AC-CURRENT-01** (high risk): 13 of 24.
  - Uncovered parts:
    - no offer for a branch with commits of its own, or with uncommitted files, or not behind its base;
    - **Send reply & resume** and **Send reply & continue** on a stopped page don't send the tick;
    - **Mark complete** never catching up;
    - `kiln reply` and `kiln carry-on` catching up as if ticked;
    - `--leave-branch-as-is` through the CLI, and on commands other than start-again;
    - a held phase getting no offer;
    - with several repositories, each qualifying branch moved and the others left alone.
  - Fix:
    - In SFB, one test runs `refreshStartPreview` for each of the three non-qualifying branches and asserts no `catchUp`, at Start and at a dirty stop.
    - In the stopped-branch block, add `reply` and `carry-on` submits that assert `branch_catch_up` and the worktree HEAD at develop's tip; add a Mark complete case asserting HEAD unchanged; add a held (`liveControl`) case with no offer and no move.
    - Add a two-repository ticked Start, one repository qualifying and one with its own commit.
    - Add a CLI test that `--leave-branch-as-is` sends `leave_branch` on each command.
    - Add RRB clicks for reply-and-resume and carry-on that assert `bringUpToDate`.
- **AC-CARRY-04** (high risk): 5 of 12.
  - Not proved from the command line:
    - `kiln carry-on` refused where the conversation can be reopened;
    - both commands refused under billing or while a session runs;
    - a stale `--only-if-status-matches` refused on its own;
    - a repeated `--command-id` replaying without a second session, and queried through the CLI;
    - text-mode output, and output that never promises to resume.
  - Fix, in RRC:
    - a reopenable-conversation refusal (exit 3, no new launch);
    - a stale-token call while each command is offered;
    - a same-`--command-id` retry plus `command-status`;
    - a billing spy refusal for both;
    - one run of each without `--json`, asserting the result and no `/resum/i`.
- **AC-CARRY-06** (high risk): 8 of 13.
  - Uncovered parts:
    - while the attempt still runs, the page keeps today's wait text;
    - the uncertain message shows above the cards with its acknowledgement;
    - unavailable while the attempt's work still runs (`ownership_unknown`);
    - an uncertain message reaches the new session only when the reply includes it.
  - Weak part: the real-engine page asserts only the why heading, and **Check again** is never pressed.
  - Fix, in THI:
    - remove the history before the attempt ends, and assert the wait text and that `kiln carry-on` is refused;
    - render the `delivery_recovery` hold in Chrome, and assert the message and acknowledgement above the cards and the button disabled until acknowledged;
    - make `requireExited` throw `ownership_unknown`, and assert carry-on unavailable with its reason;
    - carry on with `--message-reviewed` and a reply with, then without, the message, and assert the prompt;
    - assert the AC-CARRY-02 sentence, then press **Check again** after restoring history.
- **AC-CARRY-03** (high risk): 4 of 8.
  - Uncovered parts:
    - Start again unavailable while a session runs;
    - Start again unavailable under billing.
  - Weak parts:
    - carry-on's running-session refusal is checked through the private `launchBusy()`, not `controlView()`;
    - no stopped page draws either button unavailable with its reason.
  - Fix:
    - In RR, assert `controlView` for carry-on and start-again while the carry-on session runs.
    - Add a could-not-start case under a billing spy and under a running session.
    - Add two RRB fixture cases asserting the disabled button and the reason text.
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
