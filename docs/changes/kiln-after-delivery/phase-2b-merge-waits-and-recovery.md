# Phase 2b: The merge session's waits, interruptions and workspace

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "After-Delivery Activities" (Gates, Ctrl+C and restart, While open's time totals), "The Merge Session" ("Under early merges"), "Display Contract" (the Interrupted and Waiting rows), "Interfaces" (`interrupted`, `waiting`)

## Summary
The merge session behaves as any other session of the run: a usage limit becomes a wait whose resume reads GitHub first, Ctrl+C holds the session on the finished page until Resume, a billing hold shows Needs you, every launch and resume checks the worktrees and gives the session only the ones still to merge, an early-merge run stays complete once its review pull requests merge, and the PRD's totals count the session.

## Acceptance criteria covered
AC-MERGE-05, AC-BOT-02 (also applies to this phase's work)

## Out of scope for this phase
The push session (Phase 3); Exit Kiln, including on the Waiting screen and at the restart hold (Phase 4).

## Phase dependencies
2a (the merge activity, its session, delivery reading and Needs you stop).

## Carried forward from Phase 2a
- **Built in 2a for a running merge session:** the run reopened while the merge activity is open (`openMerge`, `Engine.finished`), the **Merge** row (key `merge`, circle M), the **Merging** and **Merged** headers, and no message, pause or takeover with `MERGE_LIVE_REASON`. 2a wrote the design sections' `Superseded in part by:` lines for these, but no PRD lines for AC-MERGE-05: they are owed here, on AC-PR-05, AC-WATCH-01 and AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md`, AC-LIVE-02 and AC-BOT-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md`, AC-PAUSE-02 in `docs/changes/kiln-pause-now/kiln-pause-now-prd.md`, AC-AUTO-01 in Kiln Usage Limit Recovery and AC-TOTAL-01 to 03 in Kiln PRD Time Totals.
- **Today's interim behavior to replace:** `decideMerge` (`engine.ts`) resumes an interrupted merge session at `kiln run` after its reading (`pendingResume`), as Kiln does for any interrupted session; the design's restart hold at the review is this phase's. A billing hold on the `merge` key reaches `recheckStop`'s billing branch, which runs `doneCheck("merge")`; it should read GitHub as the merge stop does. On an early-merge run the evaluator change of "Under early merges" is not built.
- **Tests:** `src/engine/merge-with-agent.integration.test.ts` holds 2a's harness (a finished run, `show()`, `mergeByHand()`, the `gh-mark-merged.mjs` stand-in). Run integration files with `umask 022` on a machine whose umask is 0002: Kiln's transcript safety check refuses group-writable transcripts, so Resume is otherwise never offered.
