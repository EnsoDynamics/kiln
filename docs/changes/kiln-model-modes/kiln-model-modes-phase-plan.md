# Kiln Model Modes — implementation phase plan

**Parent PRD:** [Kiln Model Modes](kiln-model-modes-prd.md)
**Technical design:** [Kiln Model Modes technical design](kiln-model-modes-technical-design.md)

## Sizing decision

Three phases, executed in order. The PRD holds three capabilities, each with its own surface: what the settings mean when Kiln resolves and launches an activity (the mode, the fallback for everything, the fifth row, the carry-over); saving on purpose on Model defaults and from a terminal, for every PRD or for one; and the Models block's choice where the PRD starts, which saves for one PRD at once. Together they exceed one dependable session. Phase 1 reads settings from written files, so the engine is proved, including both paid proofs, before any editor changes. Phase 2 rebuilds Model defaults around a draft, so the page is built once, and its commands share the same change module. Phase 3 puts the two choices in the Models block on top of phase 2's change module and own settings, and the public guide comes last, once every setting it describes exists. The Delivery section names no early merge, planned stop or hands-on work.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 modes in the engine](phase-1-modes-in-the-engine.md) | Kiln runs every activity on one model or on its fallback when the saved settings say so, gives the preflight and the pull request session a row of their own, reads a PRD's own settings when it has them, and keeps what people saved before the upgrade. | None |
| [2 save on Model defaults](phase-2-save-on-model-defaults.md) | Model defaults offers the two ways to pick models and the three fallback settings, holds every change until Save, saves it for every PRD or for this PRD only with a clear way back, and the commands save the same things. | 1 (the schema 2 settings files, the reader over both files, the fifth row) |
| [3 models block and guide](phase-3-models-block-and-guide.md) | Documents found and the run's settings offer the two choices for this PRD, applied at once, and the public guide explains the new settings. | 1 (the snapshot's mode, one model and source); 2 (the change module, own settings and Use my defaults here) |

## Acceptance-criterion ownership

| Owning phase | Criteria |
|---|---|
| 1 | AC-MODE-02, AC-MODE-03; AC-WHEN-02, AC-WHEN-03; AC-ROW-01; AC-CARRY-01 |
| 2 | AC-MODE-01; AC-WHEN-01; AC-SAVE-01, AC-SAVE-02, AC-SAVE-03, AC-SAVE-04, AC-SAVE-05; AC-CLI-01 |
| 3 | AC-PRD-01, AC-PRD-02; AC-GUIDE-01 |

## Before the build

Claude Code and Codex both installed and signed in on the build computer (technical design, Delivery). Phase 1 runs both paid proofs named there.

## After the build

Once the PRD's audits have closed and its pull request has merged, the changelog entry and a minor release, as the technical design's Delivery section says.
