# Phase 4: List the handoff among the status controls

**Added by delivery audit:** 2026-11-20, after every planned phase closed. It builds what earlier phases left out of the criterion below.
**Parent PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md)
**Technical design:** [Kiln Deliver When Audit Loops Run Out technical design](kiln-deliver-when-audit-loops-run-out-technical-design.md) — relevant sections: "Interfaces" (Status and snapshot: "Its controls list gives `settings`, `check-for-new-phases`, `continue-with-phases` and the handoff, each with availability and reason")
**Repositories:** kiln

## Summary
Make `kiln status` list `kiln handoff` among its controls, with whether it is available and why not, as it lists the other controls on these screens.

## Acceptance criteria covered
AC-BOT-01 (completes it; owned by phase 1)

## What the audit found missing
- **AC-BOT-01:** `kiln handoff` works (`handoffProjection` in `src/control/projection.ts`), but `kiln status` never lists it among its controls: it is not in the controls built in `statusProjection` (`src/control/projection.ts`, from `engine.controlView()` plus `engine.newPhaseControls()`), not in `PLANNED_CONTROLS` (the disconnected and folder-missing lists in the same file), and not in `ACTIONS` (`src/control/commands.ts`). The other three controls in the criterion's table (`settings`, `check-for-new-phases`, `continue-with-phases`) are listed with availability and reason.

## Phase dependencies
1 (the controls list with `check-for-new-phases` and `continue-with-phases`); 3 (`kiln status` reporting).
