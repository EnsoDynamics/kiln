# Phase 6: Complete the first card, the held carry-on command and Documents found's layout

**Added by delivery audit:** 2026-11-13, after every planned phase closed. It builds what earlier phases left out of the criteria below, confirmed in the whole-PRD audit at `8ae36f3`.
**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "A Stopped Phase's Facts" (Case, the first card), "A Held Phase That Can't Be Reopened" (Carry on from a hold), "Interfaces" (`kiln carry-on`), "Starting From a Branch" (The preview)
**Phase plan:** [Kiln Run Restart phase plan](kiln-run-restart-phase-plan.md)
**Repositories:** kiln

## Summary
Finish the last few parts. A stopped phase that can't be resumed shows the latest launch's last message on its first card. `kiln carry-on --message-reviewed` works on a held phase. With several repositories, a repository that has the chosen branch reads **PR into** even when the name is unavailable. Documents found's plan-source box and Start from choices are laid out as drawn.

## Acceptance criteria covered
AC-CASE-04 (completes it; owned by phase 1), AC-CARRY-06 (completes it; owned by phase 1), AC-LOOK-01 (completes it; owned by phase 1), AC-FROM-05 (completes it; owned by phase 2)

## What the audit found missing
- **AC-CASE-04:** the `stop.kind === "not_resumable"` branch of `src/engine/snapshot.ts:needsYouView` returns only `lastLines` and never `finalMessage`. A stopped phase whose resume ended without `init`, or found its transcript missing, therefore shows "Last output from" with its last lines on `view/src/screens/PhaseHandoff.svelte`'s first card. The design's Case paragraph requires the latest launch's last recorded final message there, the one the general branch picks with `session.runs.findLast(run => run.result?.text?.trim())`, with last lines only when no final message was recorded.
- **AC-CARRY-06:** on a held phase with an unacknowledged uncertain message, `kiln carry-on --message-reviewed <id>` (and `/api/carry-on` with `reviewedReceiptIds`) is refused `control_unavailable` at admission. `src/control/commands.ts:submit` checks `controlView`'s `"carry-on"` availability, and `src/engine/engine.ts:carryOnControl` makes that false while `liveView().reviewRequired` is non-empty. So `applyControl`'s `reviewMessages` never applies the acknowledgements. The design says acknowledgements sent with the command are applied first, as `kiln resume` does, and the command line has no other way to acknowledge.
- **AC-FROM-05:** `src/engine/start-from.ts:existingBranchPreview` (`readOne`) records `hasBranch: false` for any repository whose classification is `unavailable`, even one that has the branch (behind or diverged, or another started PRD's). With several repositories, that repository's row in `view/src/screens/DocumentsFound.svelte` (the `existing && startRepository(row.name)?.hasBranch` "PR into" tag) then loses **PR into**. Phase 5 fixed the one-repository label for the same case.
- **AC-LOOK-01:** on Documents found, the "Read from …" line and the count line under Phase plan are plain `item-line` spans (`view/src/screens/DocumentsFound.svelte`, `.item.plan` / `.item-intro`). The mockup draws them in a bordered box, amber when phases are closed on the branch and neutral otherwise.
- **AC-LOOK-01:** on Documents found, the two **Start from** choices are stacked with identical 1px borders (`fieldset.start-from`, `.start-from { flex-direction: column }`, `.choice` in `view/src/screens/DocumentsFound.svelte`). The mockup draws them side by side in two columns, with a heavier border on the selected choice.

## Phase dependencies
4 and 5 (the stopped-phase first card, held carry-on and Documents found's Start from, as they now stand)
