# Phase 3: Reset Kiln for a PRD

**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "Architecture" (item 2, the engine holder), "Reset", "Interfaces" (`GET /api/reset/preview`, `POST /api/reset`, the snapshot's `reset`, `kiln reset` and the **Start over** help group), "Data Models" (the `reset` journal action and receipt), "Changes to Earlier Designs" (the Kiln v1 state and `kiln run` pointers, Missing Worktree Recovery's Folder Check pointer, Bot Control's retained receipt, Public Release Readiness's help groups)

## Summary
Every screen of a started PRD ends with a **Reset Kiln for this PRD** button that, after a confirmation listing what Kiln forgets and what stays, makes Kiln forget its progress and return the open page to Documents found, without touching anything in git. A bot can do the same with `kiln reset`, whose help says what it costs.

## Acceptance criteria covered
AC-RESET-01, AC-RESET-02, AC-RESET-03, AC-RESET-04, AC-RESET-05, AC-RESET-06, AC-LOOK-01 (also applies to this phase's work)

## Out of scope for this phase
Nothing later; this is the last planned phase.

## Phase dependencies
2 (Documents found's Start from, which a reset returns to, and the adopted-worktree rule for uncommitted files that AC-RESET-04 applies after a reset)

## Phase-specific notes
- `docs/kiln-command-line-and-bot-control.md` gains `kiln reset`, with its outcome read through `kiln command-status`.
- The Delivery section's minor release follows this phase, once the PRD's audits close.

## Carried forward from Phase 1
- AC-LOOK-01's `Superseded in part by:` pointer on AC-LOOK-01 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` was left for this phase: Phase 1 changes nothing on the Folder missing page, which gains only the reset line here. Phase 1 added AC-LOOK-01's other pointers.
