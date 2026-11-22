# Phase 2a: The merge press, the merge session and Merged

**Closed:** 2026-11-22

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "After-Delivery Activities" (Opening, While open, No live controls, Ending, At the stop, Keys), "The Delivery Reading", "The Merge Session" (apart from "Under early merges"), "Interfaces" (`kiln merge`, `after_delivery`), "Display Contract", "Data Models and Upgrade" (`merge`), "Prompts"

## Summary
The pull request card offers **Merge with {agent}** from the saved delivery reading; one press, from the page or `kiln merge`, takes a fresh reading and opens the merge activity, whose session merges the delivery's pull requests. The run shows Merged only from GitHub, with the session's closing summary, and the check for new phases runs unasked; a session that ends without merging stops at Needs you, where Check again, Resume and Send and resume read GitHub first.

## Acceptance criteria covered
AC-MERGE-01, AC-MERGE-02, AC-MERGE-03, AC-MERGE-04, AC-MERGE-06, AC-MERGE-07, AC-MERGE-08, AC-WAIT-03, AC-BOT-01 (also applies to this phase's work), AC-BOT-02 (also applies to this phase's work)

## Out of scope for this phase
Of AC-MERGE-05, what Phase 2b builds: usage-limit waits, Ctrl+C and the restart hold, billing holds, the folder rule at a resume, the workspace set at each launch and resume, early-merge runs and the time totals. This phase builds the parts a running merge session needs on the page: the run reopened while the activity is open, its **Merge** row and **Merging** header, and no message box, pause or takeover with the reason shown. The push session (Phase 3); Exit Kiln (Phase 4).

## Phase dependencies
1 (the delivery reading and its saved pull request states, the finished-run plan check that runs after a confirmed merge).

## Phase-specific notes
- The status token's fingerprint includes control reasons (`engine.ts`, near line 665 before the develop merge). Keep per-reading failure text and times out of the merge control's reason, as Pause Now did.
- The real merge session with each agent runs against the temporary GitHub test repository (the design's "Delivery"). It was created on 2026-11-22: see "Real merge sessions".

## Real merge sessions
Run on 2026-11-22 against the temporary repository with each agent: [Kiln After Delivery merge proof results](kiln-after-delivery-merge-proof-results.md).

## Carried forward from Phase 1
- **The delivery reading is built** (`src/engine/delivery-reading.ts`); since 2a, the merge activity's own occasions take a fresh reading (`readDeliveryNow(…, fresh)`).
- **AC-BOT-01's `Superseded in part by:` lines** on AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` are written.
