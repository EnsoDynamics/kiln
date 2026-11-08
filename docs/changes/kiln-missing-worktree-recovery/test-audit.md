# Test audit: Kiln Missing Worktree Recovery

**Status:** 14 to fix (AC-GONE-01, AC-SETUP-05, AC-SETUP-04, AC-FACTS-01, AC-FACTS-03, AC-LOOK-01, AC-SETUP-02, AC-FACTS-02, AC-GONE-02, AC-GONE-03, AC-SETUP-01, AC-SETUP-03, AC-SETUP-07, AC-SETUP-06)
**Last audit:** 2026-11-08, whole PRD, every criterion re-graded at `10ab04a`
**PRD:** [kiln-missing-worktree-recovery-prd.md](./kiln-missing-worktree-recovery-prd.md)

Each criterion is graded by one question: if this behavior broke, would the suite notice? **Weak** means something is tested, but at least one stated part could break with no test failing. Required parts come from the PRD criterion and its assumptions; the technical design is only used to find the code. Every row was re-graded on that basis on 2026-11-08, so part counts differ from earlier versions of this file. Tests added while fixing are seen red before they count, and each row says so where one could not be.

File names used below:

| Short | File |
|---|---|
| FS | `src/engine/folder-setup.integration.test.ts` |
| RUN | `src/kiln-run-folder-missing.integration.test.ts` |
| CHK | `src/engine/folder-check.integration.test.ts` |
| FF | `src/engine/folder-facts.test.ts` |
| HAND | `src/server/phase-handoff.integration.test.ts` |
| WAIT | `src/engine/usage-limit-wait.integration.test.ts` |
| BR | `src/server/folder-missing-in-browser.integration.test.ts` |
| SW | `src/server/folder-setup-start-wait-browser.integration.test.ts` |
| PT | `view/src/components/FolderSetupPanel.test.ts` |
| VL | `view/src/lib/folder-missing.test.ts` |
| HIST | `view/src/screens/folder-missing-history.test.ts` |

BR renders hand-written fixtures from `src/test-support/sample-snapshots.ts`, so it proves the view's words and not the engine's data.

## By criterion

| Criterion | Grade | Parts covered | Tests | Code | Checked |
|---|---|---|---|---|---|
| AC-GONE-01 — Every entry point checks the folders first (high risk) | Weak | 15 of 20 | RUN, CHK, HAND, WAIT | `src/engine/folder-check.ts`, `src/engine/engine.ts`, `src/control/projection.ts`, `src/server/local-server.ts`, `src/kiln-command.ts` | 2026-11-08 `10ab04a` |
| AC-GONE-02 — A missing folder replaces the phase status | Weak | 10 of 13 | RUN, HAND, WAIT, BR, HIST | `src/engine/snapshot.ts`, `view/src/screens/FolderMissing.svelte`, `view/src/lib/folder-missing.ts`, `src/underway-output.ts` | 2026-11-08 `10ab04a` |
| AC-GONE-03 — The terminal says it in plain words | Weak | 10 of 13 | RUN | `src/kiln-command.ts`, `src/underway-output.ts`, `src/engine/folder-facts.ts` | 2026-11-08 `10ab04a` |
| AC-FACTS-01 — The missing folder and the branch are described | Weak | 23 of 32 | CHK, RUN, FS, VL, BR | `src/engine/folder-facts.ts`, `src/engine/folder-check.ts`, `view/src/lib/folder-missing.ts` | 2026-11-08 `10ab04a` |
| AC-FACTS-02 — The plan is compared where it now lives | Weak | 14 of 18 | FF, RUN, FS, VL, BR | `src/engine/folder-facts.ts`, `view/src/lib/folder-missing.ts` | 2026-11-08 `10ab04a` |
| AC-FACTS-03 — What can't be known is said | Weak | 18 of 23 | FS, RUN, VL, BR | `src/engine/folder-facts.ts`, `src/engine/folder-setup.ts`, `view/src/lib/folder-missing.ts` | 2026-11-08 `10ab04a` |
| AC-SETUP-01 — The setup panel has the first-Start settings, in the first-Start words | Weak | 17 of 20 | BR, PT, FS, RUN, SW | `view/src/components/FolderSetupPanel.svelte`, `src/engine/folder-setup.ts`, `src/engine/engine.ts` | 2026-11-08 `10ab04a` |
| AC-SETUP-02 — The starting point and defaults follow the facts | Weak | 16 of 20 | FS, RUN, BR | `src/engine/folder-setup.ts`, `src/engine/folder-facts.ts` | 2026-11-08 `10ab04a` |
| AC-SETUP-03 — The panel says what will run | Weak | 10 of 13 | FS, BR, SW | `src/engine/folder-setup.ts`, `view/src/components/FolderSetupPanel.svelte` | 2026-11-08 `10ab04a` |
| AC-SETUP-04 — Starting from the base branch is a fresh execution (high risk) | Weak | 5 of 8 | FS | `src/engine/engine.ts`, `src/engine/folder-setup-start.ts`, `src/engine/folder-setup.ts` | 2026-11-08 `10ab04a` |
| AC-SETUP-05 — Starting from the existing feature branch makes a new worktree on it (high risk) | Weak | 13 of 17 | FS, RUN | `src/engine/engine.ts`, `src/engine/folder-setup-start.ts`, `src/engine/worktree-setup.ts` | 2026-11-08 `10ab04a` |
| AC-SETUP-06 — A folder put back by hand is found | Weak | 13 of 14 | RUN, FS, BR | `src/engine/folder-facts.ts`, `src/engine/snapshot.ts`, `view/src/screens/FolderMissing.svelte`, `src/engine/engine.ts` | 2026-11-08 `10ab04a` |
| AC-SETUP-07 — A run with several repositories has one starting point | Weak | 7 of 10 | FS, VL, BR | `src/engine/folder-facts.ts`, `src/engine/folder-setup.ts`, `src/engine/folder-setup-start.ts` | 2026-11-08 `10ab04a` |
| AC-SAFE-01 — Nothing changes until Start (high risk) | Adequate | 13 of 13 | RUN, FS, PT | `src/engine/engine.ts`, `src/engine/folder-setup-start.ts`, `src/engine/folder-setup.ts`, `src/kiln-command.ts` | 2026-11-08 `10ab04a` |
| AC-SAFE-02 — Work that would be left behind is named (high risk) | Adequate | 6 of 6 | FS, WAIT, BR, SW | `src/engine/folder-setup.ts`, `src/engine/engine.ts` | 2026-11-08 `10ab04a` |
| AC-SAFE-03 — Existing limits still apply (high risk) | Adequate | 21 of 21 | FS | `src/engine/engine.ts`, `src/engine/folder-setup.ts`, `view/src/components/FolderSetupPanel.svelte` | 2026-11-08 `10ab04a` |
| AC-SAFE-04 — Git's record of a missing folder is cleared only when Start needs it (high risk) | Adequate | 10 of 10 | FS, BR | `src/engine/folder-setup.ts`, `src/engine/folder-setup-start.ts`, `src/engine/git-reads.ts` | 2026-11-08 `10ab04a` |
| AC-LOOK-01 — The screens match their drawings | Weak | 2 of 6 | BR, RUN | `view/src/screens/FolderMissing.svelte`, `view/src/components/FolderSetupPanel.svelte`, `src/underway-output.ts` | 2026-11-08 `10ab04a` |

## To fix, in order

High-risk criteria come first, then the most uncovered stated parts. Every new or strengthened test is seen red before it counts. Every row is Weak.

**Weak, high risk**

- **AC-GONE-01:** 15 of 20. Untested: a folder where git finds the shared repository but holds no record at that path (the test claiming it exits earlier); a branch switch inside the worktree still passing; Mark complete with the folder gone; plain Resume as the first detection; reopening a feature waiting for usage with the folder gone. Fix: `git worktree move`, recreate the folder with a copied `.git` and assert `holds`; add `checkout -b other` to CHK's passing test; in HAND post `mark-complete` and `resume` with the folder renamed and the state not yet set, asserting 409 `folder_missing`; in WAIT remove the folder, reopen and assert `folder_missing` with no restart review and no usage reading.
- **AC-SETUP-05:** 13 of 17. Untested: resuming the interrupted session, at the saved path and from a moved folder; launching the first unfinished phase; a Codex session whose folder moved going to Needs you; an existing empty folder accepted. Fix (FS): an interrupted Claude session, Start from the branch, asserting `--resume <id>` and the cwd, once with an edited Worktree; `landStoppedPhase` with no pause, asserting Phase 3 launches first in the saved folder; a Codex stop with an edited Worktree, asserting `not_resumable` and no launch; `mkdirSync` an empty chosen folder.
- **AC-SETUP-04:** 5 of 8. Untested: the branch starting at the commit the page showed (every test has local `develop` equal to origin's); a phase closed in the base branch by someone else never running; the name existing only on origin. Fix (FS): leave local `develop` behind origin before Start; `closeOnBaseOnly` for 2b then Start, asserting Phase 3 launches first, no 2b prompt and `doneAt` set; push the name to origin only, asserting the field error, the 409 and no worktree.

**Weak**

- **AC-FACTS-01:** 23 of 32. Untested: when Kiln checked; the date set up; a branch only in the shared checkout; both commits and dates when they differ; a checkout ahead of origin against real git; a recorded merge not containing the commit; a recorded merge the base lacks; a saved folder holding something else counting as another folder; the last pushed commit among several. Fix: extend BR's regions; pin `setUpAt`; `stoppedRun(false)`; exact shas and dates in RUN's behind case; two more `inBaseBranch` expectations in CHK; `elsewhere` in FS; land two phases.
- **AC-FACTS-03:** 18 of 23. Untested: a failed folder check named and its start withheld; a failed `worktree list`; the checkout-against-origin read named; an unreadable base branch; a base start withheld when the base plan fails. Fix (FS): chmod the saved folder's parent; `failingGit` on `worktree list --porcelain`; one `unknown` expectation; delete origin's develop; assert `choices.base` unavailable.
- **AC-LOOK-01:** 2 of 6. Untested: page text outside the compared regions; section order; layout and visual style; real engine words against the drawing. Fix: extend BR's regions; assert region order; add this screen to the layout harness in `view-in-browser.integration.test.ts`; one integration case each for the range form, the behind-branch caution and the check-again label.
- **AC-SETUP-02:** 16 of 20. Untested: `-2` when the old branch is gone; a suffix on a changed branch name; the folder taking the same suffix past `-2`; the existing-branch next free suffix. Fix (FS): field assertions after the deleted-branch setup; a run with a custom branch; assert `worktreePath` at `-3`; occupy `-2`.
- **AC-FACTS-02:** 14 of 18. Untested: reading the remote's latest commit when reachable; the named commit being the one read; "Matches" and "Ahead of the branch" on the page. Fix: an origin-only commit asserting `plans.base`; `toBe(rev-parse)`; VL cases on `savedTag` and `savedLabel`.
- **AC-GONE-02:** 10 of 13. Untested: the header's Folder missing; a stopped phase's results with their check time; Done rows with their time. Fix (HIST): assert the header, render `stoppedResult`, assert a Done row.
- **AC-GONE-03:** 10 of 13. Untested: the terminal's "is ahead of" and "matches" wording; plain `kiln run` with no `--resume`. Fix (RUN): assert the line on each setup; `resume = false`, asserting the block and no Claude call.
- **AC-SETUP-01:** 17 of 20. Untested: the Starting lets Kiln list's early-merge and several-repository lines in full; the saved base branch starting the field; every field editable through to Start. Fix: full `toEqual` in FS; a non-`develop` saved base; SW setting each control and asserting its panel body, and one FS base start editing branch, model and effort.
- **AC-SETUP-03:** 10 of 13. Untested: an existing-branch start's whole run list; a base start's "runs first" notes; changing the base branch holding Start until the panel refreshes. Fix: `toEqual` on `preview.run` in FS; one SW case changing `#fm-base`.
- **AC-SETUP-07:** 7 of 10. Untested: work in any one repository pre-selecting the existing branch; unavailable in any one repository; unavailable when a failing repository's folder holds something else. Fix (FS): `phaseOneDoneInApi` asserting `suggested`; delete the branch in returns-api only; replace returns-api's folder with a plain one.
- **AC-SETUP-06:** 13 of 14. Untested: pressing Check again on the page. Fix: a browser test on `folderMissingSnapshot("unmerged")` clicking it and asserting `POST /api/folder-setup/check`.

**Strong, if asked** (high-risk criteria): AC-SAFE-01, AC-SAFE-02, AC-SAFE-03 and AC-SAFE-04 once their implied cases are covered; AC-GONE-01, AC-SETUP-04 and AC-SETUP-05 once Adequate.

**Adequate rows' red checks.** New tests on these four rows were seen red, except where the only break would widen a guard on what Start writes, launches or removes: `red check not possible` for the facts comparison, the busy refusal, a terminal holding the session, the billing launch, which stale record is removed, and a folder check during Start. Those parts keep a read grade, capped at Adequate.
