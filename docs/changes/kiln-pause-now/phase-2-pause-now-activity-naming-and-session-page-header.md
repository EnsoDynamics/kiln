# Phase 2: Name the paused activity as the running header does, and give the session page the Pausing header

**Added by delivery audit:** 2026-11-20, after every planned phase closed. It builds what phase 1 left out of the criteria below.
**Parent PRD:** [Kiln Pause Now](kiln-pause-now-prd.md)
**Technical design:** [Kiln Pause Now technical design](kiln-pause-now-technical-design.md) — relevant sections: "The Pause Now State" (the projection's `activityKey, label` and the header row), "The Paused Page"

## Summary
Name the activity everywhere Pause now names it the way the running header does at that time: the leaf a split phase is working on, and an audit's round even when the audit has no live target. Show the **Pausing {activity}** header beside the phases done on the session page.

## Acceptance criteria covered
AC-PAUSE-01 (completes it; owned by phase 1), AC-PAUSE-03 (completes it; owned by phase 1), AC-PAUSE-05 (completes it; owned by phase 1), AC-PAUSE-06 (completes it; owned by phase 1)

## What the audit found missing
- **AC-PAUSE-01:** with no live target (a Codex audit, or a Claude audit between sessions), `view/src/components/PausePanel.svelte`'s `name` falls back to `phaseName(id)`, the audit row's title alone, so the running overview's and session page's panel read "After delivery audit" and "Pause after delivery audit" without the round; the audit row's `round` in the snapshot is not used.
- **AC-PAUSE-03:** the pausing header names the launched key, not the leaf the running header names: `headerStateOnly` in `view/src/lib/progress.ts` uses `phaseName(pauseNow.activityKey)`, and `Engine.pauseNowView` in `src/engine/engine.ts` sets `activityKey` and `label` from the raw `hold.target.activityKey`, while the running header uses `feature.currentPhaseId`, the judged leaf (`judgedKeyFor` in `src/engine/snapshot.ts`, `Engine.judgedId`). A phase 2 session that split and works on 2a reads "Implementing phase 2a", then "Pausing phase 2". The same raw key makes `PhaseDetail.svelte`'s `pauseHere` (`pauseNow.activityKey === phaseId`) miss the leaf's session page, so it shows no Pausing pill or pause panel, and `PausePanel.svelte`'s `id` names the launched phase.
- **AC-PAUSE-03:** the session page (`view/src/screens/PhaseDetail.svelte`, header region) shows a bare "Pausing" pill beside the activity's title and the facts "Phase 2b of 5 · agent · Started …"; it never shows **Pausing {activity}** beside the phases done, which the criterion and the technical design's header row require on the session page.
- **AC-PAUSE-05:** the same raw launched key, after a split, makes the Paused header read "Paused in phase 2" (`headerStateOnly`), leaves the leaf's phase-plan row unmarked (`rowState` in `view/src/lib/progress.ts` compares `row.id === pauseNow.activityKey`), and makes the card's eyebrow read "Paused partway · phase 2 of {total}" (`eyebrow` in `view/src/screens/PausedHold.svelte`).
- **AC-PAUSE-06:** after a split, the paused page's **Resume {activity}** and the "If you finished {activity} there" hint name the launched phase (`id`/`name` from `pauseNow.activityKey` in `view/src/screens/PausedHold.svelte`).

## Phase dependencies
1 (Pause now, its pausing state and the Paused page)
