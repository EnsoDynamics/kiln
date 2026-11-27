# Phase 3: Models block and guide

**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md) — relevant sections: "Saving", "A choice in the Models block" and "Use my defaults here"; the `choose` body and the Models block paragraph in "HTTP"; `settings.models` in "Snapshot"; the AC-GUIDE-01 row of "Criteria Coverage"
**Phase plan:** [Execution order](kiln-model-modes-phase-plan.md)
**Model tier:** standard

## Summary
On Documents found and in a running or paused run's settings, the Models block offers Recommended model for each phase, with a line saying when the fallback is used, and One model for this PRD, with its agent, model and effort. A choice there applies to this PRD alone at once, and the PRD goes back to following the defaults when its settings match them again. The Models card and the Folder missing panel show the choice in force without the controls. Kiln's public guide explains the two modes, the three fallback settings, the new row and saving for one PRD.

## Acceptance criteria covered
AC-PRD-01, AC-PRD-02, AC-GUIDE-01

## Out of scope for this phase
Nothing later; this is the last planned phase.

## Phase dependencies
1 (the snapshot's mode, one model, fallback setting and source, and the Audits line's `changedByYou`); 2 (the change module, creating a PRD's own settings, and `useDefaults`).

## Phase-specific notes
- Mockups 5 and 6 and mockup 7 states C and D are this phase's.
