# Phase 4: Usage fallback

**Parent PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md)
**Technical design:** [Kiln Phase Model Tiers technical design](kiln-phase-model-tiers-technical-design.md) — relevant sections: "The launch decision" (including the fallback's launch checks, Skills and the heads-up); "A Wait Before the Start" (the fallback row); the "Telling a model-scoped Codex bucket, and a usage block" and "Usage read for a launch" decisions; `launch` on the session record in "Data Models"; `fallback` and `forecast` in "Snapshot"; "Criteria Coverage" for AC-GUIDE-01
**Phase plan:** [Execution order](kiln-phase-model-tiers-phase-plan.md)
**Model tier:** demanding — AC-FALLBACK-02 combines the threshold, which usage windows count, Codex's usage blocks and the fallback's own launch checks (rules that interact), and a wrong decision spends the other agent's account (money)

## Summary
With the fallback switched on, each time Kiln launches an activity that hasn't started it reads both accounts' usage and starts the activity on the other agent when the first choice's account is at or above the threshold and the other agent can take it. The row, the card, the phase detail and the terminal say when that happened, the next activity warns in advance, and Kiln's public guide explains tiers, changing models, Model defaults and the fallback.

## Acceptance criteria covered
AC-FALLBACK-02, AC-FALLBACK-03, AC-FALLBACK-04, AC-GUIDE-01, AC-PICK-06 (also applies to this phase's work), AC-PICK-07 (also applies to this phase's work)

## Out of scope for this phase
Nothing beyond the PRD's own Out of Scope.

## Phase dependencies
1 (each activity's fallback from the resolver); 2 (both agents' readings, readiness and billing, and fresh launches on the current choice, including from a wait); 3 (the fallback switch and threshold).

## Phase-specific notes
- Real-session proof from Delivery owned here: a launch decided for the fallback starts and reports there, with the usage reading supplied at the reader's boundary; the evidence states that no live reading at the threshold was taken.
- The guide covers every phase's work: where the tier comes from, Change and Model defaults in the browser and from a terminal, and the fallback.
