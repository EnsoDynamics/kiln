# Phase 2: Both agents in one run

**Closed:** 2026-11-24

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
1 (the resolver, including each activity's fallback; the start line and its history reads; the schema 26 record).

## Phase-specific notes
- Replace Phase 1's refusal of a plan on two agents with §Agents' needed-agent checks.
- A choice changes here through a written Model defaults file, a tier line edit or Claude Code being installed or removed; tests use those until Phase 3's Change exists. A fallback-only agent is reached with the switch set in the written file.
- From "A Wait Before the Start", build the rows for the choice it was refused on and for a different choice, and the activity's own one-attempt record; the row where the decision names the fallback is Phase 4's.
- Real-session proof from Delivery owned here: an activity that hasn't started goes on in a new session on a changed choice, on the other agent included.

## Carried forward from Phase 1
- **One reader stands in for §Agents.** Phase 1 keeps the single `AgentInfo` and points it at the agent the run's activities resolve to (`Engine.syncRunAgent`, called on plan reads, Model defaults changes, launches and a selection stop's Check again); `neededAgents()` and `agentOf(key)` already name each activity's agent. Replace the reader with one per installed agent, and the snapshot's `settings.agent`, `settings.agentId`, top-level `models`, `account` and `billing` with `agents[]` (§Snapshot). `BillingAuthority`'s generation is the reader's selection generation, no longer sent by the browser.
- **The start line reads only Kiln's saved record.** Phase 1 saves `firstResponseAt` from the live stream (Claude Code's events, Codex's items via `isCodexModelItem`) and derives it from saved events in the migration and for retained executions. The agents' own histories (Claude Code's conversation file, the Codex thread's turns), read at the four points §When an Activity Starts names, and the start-unknown row with its unavailable Change, are not built. AC-PICK-07's launch-instead-of-resume needs them, so they are built here.
- **The Needs you selection stop has no editor.** Phase 1 removed the PRD-wide Model and effort editor there; the stop's fact names the choice, where it came from and where to change it (`choiceStopFact`). Reply and Resume at such a stop still follow today's rules until this phase's AC-PICK-07.
- **Known failures, not this PRD's (verified 2026-11-24 on the branch and on its base `f924b82`):** five tests in `src/engine/preparation-execution.integration.test.ts`, one in `src/engine/continuation-readiness.integration.test.ts` ("offers seven phases with local preparation…") and the Exit Kiln test in `src/kiln-run-exit.integration.test.ts`.
- **Real-session proof:** `scripts/proof-run/phase-model-tiers-proof.mjs` (run with `npm run build` first) proves Phase 1's share against the installed agents; extend it, or add a sibling, for this phase's share.
