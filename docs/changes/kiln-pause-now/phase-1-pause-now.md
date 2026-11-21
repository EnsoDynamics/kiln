# Phase 1: Pause now, its pausing state, Cancel and the Paused page

**Closed:** 2026-11-20

**Parent PRD:** [Kiln Pause Now](kiln-pause-now-prd.md)
**Technical design:** [Kiln Pause Now technical design](kiln-pause-now-technical-design.md) — all sections: "Design Decisions", "The Stop and Cancel", "The Pause Now State", "The Paused Page", "Interfaces", "Wording", "Verification"

## Summary
Rename Pause & take over to Pause now everywhere a person reads it, and offer it beside Pause after {activity} in one Pause panel. While Kiln waits for the safe stop it shows what it is waiting for and lets the person cancel until the stop; once stopped, it shows a calm Paused page with Resume and the terminal command side by side.

## Acceptance criteria covered
AC-PAUSE-01, AC-PAUSE-02, AC-PAUSE-03, AC-PAUSE-04, AC-PAUSE-05, AC-PAUSE-06

## Out of scope for this phase
The lid-close run that settles PAUSE-003 (technical design §Delivery, Hands-on work): it exercises the hold this build leaves unchanged, so a person runs it against today's Pause & take over, outside the build. The `CHANGELOG.md` entry, written when the branch merges to `develop`.

## Phase dependencies
None.
