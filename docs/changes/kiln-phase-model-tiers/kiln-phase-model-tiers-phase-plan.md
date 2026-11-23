# Kiln Phase Model Tiers — implementation phase plan

**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md)

## Sizing decision

Four phases, executed in order. The PRD holds four capabilities, each with its own engine change: each activity's model worked out from its tier and bound when it starts, replacing the PRD-wide choice; one run using both agents, with activities that haven't started following their current choice into a new session; the person changing a phase, the Audits choice and Model defaults, in the browser and from a terminal; and the usage fallback. Together they exceed one dependable session. Phase 1 reads Model defaults from its file, so Phase 2 can prove a run on both agents with a written file before any editor exists. The per-phase Change and the Model defaults editors share one editor, one effort rule and one command group, so they ride together in Phase 3. The fallback comes last because its launch decision needs both agents' readings, the fresh launch on the current choice and the switch. The Delivery section names no early merge, planned stop or hands-on work.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 tier models for each activity](phase-1-tier-models-for-each-activity.md) | Kiln reads each phase's tier, gives every activity its model from Model defaults, shows that on every row, binds it when the activity starts, and drops the one choice for the whole PRD. | None |
| [2 both agents in one run](phase-2-both-agents-in-one-run.md) | One run can use Claude Code and Codex, each checked, billed and shown on its own, and an activity that hasn't started goes on in a new session on its current choice. | 1 (the resolver, the start line and the schema 25 record) |
| [3 change models](phase-3-change-models.md) | The person changes a phase's model, the Audits choice and Model defaults, including the fallback switch, in the browser and from a terminal. | 1 (the resolver's entries and the kept choice); 2 (choices on either agent, and fresh launches on a changed choice) |
| [4 usage fallback](phase-4-usage-fallback.md) | With the switch on, an activity about to launch starts on the other agent when its first choice's account is nearly out, says so, and is warned about beforehand; the public guide covers the whole change. | 1 (each activity's fallback from the resolver); 2 (both agents' usage readings and fresh launches); 3 (the switch and threshold) |

## Acceptance-criterion ownership

| Owning phase | Criteria |
|---|---|
| 1 | AC-TIER-01, AC-TIER-02; AC-PICK-01, AC-PICK-02, AC-PICK-04, AC-PICK-06; AC-DEFAULT-01, AC-DEFAULT-04; AC-KEEP-01 (also applies to Phase 3) |
| 2 | AC-PICK-07; AC-AGENTS-01, AC-AGENTS-02, AC-AGENTS-03, AC-AGENTS-04 |
| 3 | AC-PICK-03, AC-PICK-05; AC-OTHER-01; AC-KEEP-02; AC-DEFAULT-02, AC-DEFAULT-03, AC-DEFAULT-05; AC-FALLBACK-01 |
| 4 | AC-FALLBACK-02, AC-FALLBACK-03, AC-FALLBACK-04; AC-GUIDE-01 |

## Before the build

Claude Code and Codex both installed and signed in on the build computer (technical design, Delivery). Phases 1, 2 and 4 each run their share of the real-session proofs named there.
