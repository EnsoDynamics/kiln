# Phase 2: Merge with the agent

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "After-Delivery Activities", "The Delivery Reading" (the offer, Merged, the summary, the check after a merge), "The Merge Session", "Interfaces" (`kiln merge`, `after_delivery`), "Display Contract", "Data Models and Upgrade" (`merge`), "Prompts", "Open Questions" (SCOPE-001, MERGE-001)

## Summary
On a finished run, the pull request card offers **Merge with {agent}**. One press starts one more agent session that brings each base branch in, resolves conflicts, runs the checks, waits for GitHub's required checks and merges the delivery's pull requests in their stated order. Kiln shows the run as Merged only when GitHub says so, then checks for new phases unasked; a merge session that stops, waits for usage or is interrupted is handled like any other session, at Needs you, the Waiting screen or Resume.

## Acceptance criteria covered
AC-MERGE-01, AC-MERGE-02, AC-MERGE-03, AC-MERGE-04, AC-MERGE-05, AC-MERGE-06, AC-MERGE-07, AC-MERGE-08, AC-WAIT-03, AC-BOT-01 (also applies to this phase's work), AC-BOT-02 (also applies to this phase's work)

## Out of scope for this phase
The push session and its row, header, stop and wait (Phase 3; this phase builds the after-delivery activity those reuse, and the statement's push line of AC-MERGE-08); Exit Kiln on any screen (Phase 4).

## Phase dependencies
1 (the delivery reading and its saved pull request states, the waiting state, and the finished-run plan check that runs after a confirmed merge).

## Phase-specific notes
- The status token's fingerprint includes control reasons (`engine.ts`, near line 665 before the develop merge). Keep per-reading failure text and times out of the merge control's reason, as Pause Now did.
- The real merge session with each agent runs against the temporary GitHub test repository (the design's "Delivery"). Phase 1 did not create it: see "Carried forward from Phase 1".

## Carried forward from Phase 1
- **The temporary GitHub test repository does not exist yet.** Phase 1's `gh repo create EnsoDynamics/kiln-proof-after-delivery-temp-<YYYYMMDD>` was refused by this machine's agent permission settings (the auto-mode classifier denied it as unauthorized access), so Phase 1 captured the delivery reading's `gh pr view` and compare answers read-only from public pull requests instead (`test/fixtures/gh/pr-view-states-recorded-2026-11-21.json`, replayed by `test/stand-ins/gh-stand-in.mjs` through `recordedPullRequest`). Create the repository as the design's "Delivery" describes before the real merge sessions; if the permission is still refused, that is a blocker only a person can clear by allowing the command.
- **The delivery reading is built** (`src/engine/delivery-reading.ts`, called by `Engine.deliveryDecision` before every finished-run check): it saves `afterDelivery.pullRequests` with `headSha`, `conflicts`, `order` and the merged time and commit. The merge press, the end of a merge session and the stop's occasions call `readDelivery` too; one reading at a time is today guaranteed only by the check's own join (`completedPlanReading`), so a reading taken outside the check needs its own join.
- **AC-BOT-01's `Superseded in part by:` lines on AC-ACT-01 and AC-ACT-03** in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (two more commands, and `kiln merge` merges work) are owed with `kiln merge`; Phase 1 wrote AC-BOT-01's line on Kiln Deliver When Audit Loops Run Out AC-BOT-01.

