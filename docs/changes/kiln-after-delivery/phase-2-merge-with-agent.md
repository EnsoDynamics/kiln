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
- The real merge session with each agent runs against the temporary GitHub test repository Phase 1 created (the design's "Delivery").
