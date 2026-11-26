# Phase 1: Tier models for each activity

**Closed:** 2026-11-24

**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "Existing Code"; "The Tier Line"; "Resolving a Choice"; "When an Activity Starts"; "A choice that can't be used"; "Model defaults file" (reading it); "Snapshot"; "Data Models"; "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** standard

## Summary
Kiln reads each phase document's Model tier line and tags every phase row with it, then gives every activity its agent, model and effort from the shipped Model defaults (or Codex's choices when Claude Code isn't installed). Every row says what it will run on, is running on or ran on; an activity keeps what it started on once the model first responds; and Documents found and the run's settings no longer offer one agent, model and effort for the whole PRD.

## Acceptance criteria covered
AC-TIER-01, AC-TIER-02, AC-PICK-01, AC-PICK-02, AC-PICK-04, AC-PICK-06, AC-DEFAULT-01, AC-DEFAULT-04, AC-KEEP-01

## Out of scope for this phase
Readiness, billing and account for both agents in one run, and an activity that hasn't started going on in a new session on its current choice (Phase 2). Change, Use the default, the Audits entry, `kiln model`, the Model defaults page and its commands, and marking kept choices on the rows (Phase 3). The usage fallback's launch decision, heads-up and reporting, and the public guide (Phase 4).

## Phase dependencies
None.

## Phase-specific notes
- Schema 26 is this PRD's one record change. Build its whole migration here, including the `kept` choice, the continuation's drop of `kept`, the continuation acceptance conversion and `billing.lastLaunch` keyed by agent; later phases add the behavior behind those fields without another schema bump, since nothing is released mid-branch.
- Model defaults is read from its file, the fallback switch and threshold included, with the shipped defaults when it is missing and the refusal when it doesn't parse. Tests write the file directly; writing it is Phase 3's.
- The resolver also gives each activity its fallback (the Fallback column, none on the same agent), which DEF-003 uses here and Phase 2's readiness checks use next.
- Readiness, account and billing still follow one agent here: the agent the run's activities resolve to. A plan whose activities resolve to two agents, possible only through a written Model defaults file, refuses Start with that reason until Phase 2 replaces the check with §Agents.
- The delivery panel's and the run's settings line saying models are chosen for each phase replaces Agent, Model and Effort here; its Model defaults link, the Audits line and the fallback line arrive with Phase 3.
- Settle the technical design's Open Question 3 (whether a finished activity with no saved start has its histories read on load) and record the answer in the design.
- Build DEF-001, DEF-002 and KEEP-003 as the assumptions register states them; the stakeholder's answers change values only.
- Real-session proofs from Delivery owned here: a first response starts an activity and a refusal before one doesn't, on each agent; a carry-on of a started Claude Code activity launches on the concrete model ID it started on; each family resolves to the newest version its agent offers.
