# PRD: Kiln Planned Test Fix Batches

**Source:** Doug's request, 2026-11-23: a run's test audit found 13 gaps and Kiln worked through them one fixing session after another, with nothing on the page to say how many were coming, and "loop 1 of 4" read as if four loops were planned.

**Review alongside:** [Mockup](mockups/kiln-planned-test-fix-batches.html)

## Summary

When a test audit finds gaps in the tests, show the whole plan for fixing them as soon as the audit ends: one row for each batch of test fixes the audit planned, the way the phases a delivery audit adds all appear at once. And wherever Kiln names a loop, for either audit, say that the limit is a maximum ("loop 1 · max 4") instead of "loop 1 of 4".

## Business Context

Until now each session of test fixes decided, when it started, how much of the audit's list it would take. Kiln learned of the next session only when the last one ended, so the page showed session 3, then 4, then 5, and nobody could tell whether the work would end at 6 or at 16. On one run a test audit found 13 gaps and five sessions followed, each a couple of hours long, most of it spent on the project's full test suite, which every session runs once.

The Enso Method's test audit is being changed to plan that work itself. When it finds more than it fixes in its own session, it cuts its fix list into batches, one for each fixing session, sized the way a phase is sized, and records them in its `test-audit.md`. That change stands on its own in the method: a person running the method by hand also wants to know how many fixing chats are coming. This PRD is Kiln showing that plan, and Kiln keeps working with an audit that has none (AC-BATCH-05).

The loop wording is a smaller fault on the same rows. A limit of 4 is the most audits of a kind Kiln will run, and most runs use fewer. "Loop 1 of 4" reads as a promise of four.

## Acceptance Criteria

### Show the Fix Plan When the Audit Ends

After a test audit, a person looking at the page should see how much fixing is planned before any of it starts, as they see the phases a delivery audit added.

- [ ] **AC-BATCH-01 — Every planned batch is a row as soon as the audit ends.** When a test audit ends having planned batches of test fixes, the phase plan shows one row for each batch, in the audit's order, before any of them starts. A batch that has not started shows the way a phase that has not started does.
- [ ] **AC-BATCH-02 — The audit's row says what it found and planned.** The row of a test audit that planned batches says how many test gaps it found and how many batches it planned, such as "found 13 test gaps and planned them as 1 batch". A test gap is one acceptance criterion the audit put in a batch, so the audit's number is the sum of its batches' numbers.
- [ ] **AC-BATCH-03 — A batch's row names the batch and its size.** Closing-audit rows read as the table says. An audit Kiln did not count as a loop names no loop, in its own row and in the rows of its test fixes, as today.

  | Session | Row title | Line beneath it |
  |---|---|---|
  | A delivery audit | Delivery audit | Loop _n_ · max _limit_ |
  | A test audit | Test audit | Loop _n_ · max _limit_, then what it found and planned (AC-BATCH-02) |
  | A batch of test fixes | Fixing tests | Batch _k_ of _N_ from test audit loop _n_ · its number of gaps |
  | A session of test fixes with no batch (AC-BATCH-05) | Fixing tests | From test audit loop _n_ · session _k_ |

  - Replaces in part: AC-AUDIT-01 in `docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md` (the line beneath an audit's row, which reads Loop _n_ · max _limit_, and beneath a session of test fixes; the titles, and "Round" and "Continuation" appearing nowhere, remain)
- [ ] **AC-BATCH-04 — The rows that have not started are the work still planned.** When a session of test fixes ends having cut the work it left into a different number of batches, the rows that have not started change to match, and _N_ on every row is the plan's current count. When the test fixes end with batches not started, because a session ended that work or a new test audit is due, their rows are removed: what was left is listed under **For you** or found again by the next test audit, as today.
- [ ] **AC-BATCH-05 — An audit with no batch plan shows as today.** When a test audit saves test work without planning batches, as an earlier version of the method's test audit does and another method's audit may, or when a session of test fixes starts that the plan holds no batch for, each such session appears when it starts and reads "From test audit loop _n_ · session _k_". Kiln never stops or refuses because a plan is missing.

### Say the Limit Is a Maximum

A run uses only the loops it needs. Nothing a person reads should suggest that the limit is a number of loops the run will make.

- [ ] **AC-MAX-01 — A loop is named with its maximum.** Wherever a person reads a loop's name or a count of loops, it reads as the table and AC-BATCH-03's rows say, and "loop _n_ of _limit_" appears nowhere: the phase plan, the status line, the session page, the terminal, Needs you, the finished page and each pull request's description. Batch _k_ of _N_ keeps "of", because every planned batch is worked.

  | Where | Reads, for example |
  |---|---|
  | The status line while an audit runs | **Delivery audit loop 2 · max 4** |
  | The status line while a batch of test fixes runs | **Fixing tests · batch 1 of 2 from test audit loop 1** |
  | The status line while a session of test fixes with no batch runs | **Fixing tests from test audit loop 1** |
  | The status line at a Needs you stop | **Test audit loop 4 · max 4** |
  | The loops a delivered run used | Delivery audit: 4 loops (max 4). Test audit: 1 loop (max 4). |

  - Replaces in part: AC-STOP-05 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (the wording of each status line; what the status line names, and when, remains)
  - Replaces in part: AC-LEFT-01 and AC-LEFT-02 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (the wording of the loops used; where they are shown remains)
- [ ] **AC-MAX-02 — The settings say a run makes only the loops it needs.** The explanation beside the **Audit loops** settings, wherever they appear, says that a loop is one audit plus the work it finds, and that each limit is the most loops of that audit a run makes, not a number it always makes.
  - Replaces in part: AC-LOOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (what the settings' help text says a loop and a limit are)

### A Bot Sees the Same

Whatever these rows tell a person, `kiln status` tells a bot, as it does for the rest of the page.

- [ ] **AC-BOT-01 — `kiln status` reports the fix plan.** `kiln status` reports, in text and JSON, each batch a test audit planned with its number, the plan's count, its number of gaps and whether it has started or finished, and names loops as AC-MAX-01 says.
  - Replaces in part: AC-BOT-02 in `docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md` (the audit names `kiln status` reports are those of AC-BATCH-03 and AC-MAX-01)

## Out of Scope

- A limit on the number of batches or sessions of test fixes. Each audit keeps its one limit.
- When a second test audit runs, and how many loops a run makes. Both are unchanged.
- How the test audit sizes a batch. That is the Enso Method's test audit.
- Progress inside a batch that is running.
