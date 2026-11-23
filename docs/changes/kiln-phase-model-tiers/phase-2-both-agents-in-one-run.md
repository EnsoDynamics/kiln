# Phase 2: Both agents in one run

**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "Agents"; "An activity that hasn't started goes on in a new session"; "A Wait Before the Start"; the "What a stop on a not-started activity names" and "A launch on Claude Code and the Codex wait record" decisions; `agents[]` in "Snapshot"; `kiln account` and `kiln status` in "Command line"; "Changes to Earlier Designs"
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** demanding — AC-AGENTS-02 combines which agents the run needs with each agent's own billing approval (rules that interact), and a mistake launches on a metered route nobody approved (money)

## Summary
One run's activities can now run on Claude Code and Codex: Kiln checks readiness and billing for every agent the run can use before Start, shows each agent's account and usage, and labels, recovery commands and usage-limit waits follow each activity's own agent. An activity that hasn't started is always launched in a new session on its current choice, whatever asked to resume it, and terminal commands reopen its old conversation only while that choice is unchanged.

## Acceptance criteria covered
AC-PICK-07, AC-AGENTS-01, AC-AGENTS-02, AC-AGENTS-03, AC-AGENTS-04

## Out of scope for this phase
The person's Change and the Model defaults editors (Phase 3). A wait that ends on the fallback, and every launch decided for the fallback (Phase 4).

## Phase dependencies
1 (the resolver, including each activity's fallback; the start line and its history reads; the schema 25 record).

## Phase-specific notes
- Replace Phase 1's refusal of a plan on two agents with §Agents' needed-agent checks.
- A choice changes here through a written Model defaults file, a tier line edit or Claude Code being installed or removed; tests use those until Phase 3's Change exists. A fallback-only agent is reached with the switch set in the written file.
- From "A Wait Before the Start", build the rows for the choice it was refused on and for a different choice, and the activity's own one-attempt record; the row where the decision names the fallback is Phase 4's.
- Real-session proof from Delivery owned here: an activity that hasn't started goes on in a new session on a changed choice, on the other agent included.
