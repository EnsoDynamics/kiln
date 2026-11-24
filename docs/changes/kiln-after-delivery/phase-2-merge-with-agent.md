# Phase 2: Merge with the agent — split into 2a-2b

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "After-Delivery Activities", "The Delivery Reading" (the offer, Merged, the summary, the check after a merge), "The Merge Session", "Interfaces" (`kiln merge`, `after_delivery`), "Display Contract", "Data Models and Upgrade" (`merge`), "Prompts", "Open Questions" (SCOPE-001, MERGE-001)

## Summary
On a finished run, the pull request card offers **Merge with {agent}**. One press starts one more agent session that brings each base branch in, resolves conflicts, runs the checks, waits for GitHub's required checks and merges the delivery's pull requests in their stated order. Kiln shows the run as Merged only when GitHub says so, then checks for new phases unasked; a merge session that stops, waits for usage or is interrupted is handled like any other session, at Needs you, the Waiting screen or Resume.

## Split into
| Phase | What it does | Depends on |
|---|---|---|
| [2a merge press and session](./phase-2a-merge-press-and-session.md) | The Merge with {agent} offer and press, the merge session, Merged confirmed from GitHub with the check that follows, and the Needs you stop when the session ends without merging. | 1 (the delivery reading and its saved pull request states, the finished-run plan check) |
| [2b merge waits and recovery](./phase-2b-merge-waits-and-recovery.md) | The merge session as a full activity of the run: usage-limit waits, Ctrl+C and the restart hold, billing holds, the folder rules at every launch and resume, early-merge runs, and the PRD's time totals. | 2a (the merge activity, its session, reading and stop) |

Split 2026-11-22 when its build began: the merge activity, its session and stop have to exist and be proved before the waits, interruptions and workspace rules that reuse them.

## Acceptance criteria covered
AC-MERGE-01, AC-MERGE-02, AC-MERGE-03, AC-MERGE-04, AC-MERGE-05, AC-MERGE-06, AC-MERGE-07, AC-MERGE-08, AC-WAIT-03, AC-BOT-01 (also applies to this phase's work), AC-BOT-02 (also applies to this phase's work)

## Out of scope for this phase
The push session and its row, header, stop and wait (Phase 3; this phase builds the after-delivery activity those reuse, and the statement's push line of AC-MERGE-08); Exit Kiln on any screen (Phase 4).

## Phase dependencies
1 (the delivery reading and its saved pull request states, the waiting state, and the finished-run plan check that runs after a confirmed merge).
