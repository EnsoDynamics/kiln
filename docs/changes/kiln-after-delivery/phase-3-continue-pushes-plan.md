# Phase 3: Continue pushes the plan first

**Parent PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md)
**Technical design:** [Kiln After Delivery technical design](kiln-after-delivery-technical-design.md) — relevant sections: "Continue and the Push Session", "After-Delivery Activities" (Push the plan), "Interfaces" (`continue-with-phases`, `planPush`, `followsPush`), "Display Contract", "Data Models and Upgrade" (`planPushes`, `planPushKey`, `refreshedScope`), "Prompts"

## Summary
When the added phases were read from the person's own checkout and are not on the remote base branch yet, pressing Continue first starts a session that pushes this PRD's documents to the base branch, never forced and never touching uncommitted work. Kiln then checks again and starts the build with no second press when the same phases are still ready, or shows what it found; a push session that cannot push stops at Needs you saying why.

## Acceptance criteria covered
AC-BACK-05, AC-MERGE-05 (also applies to this phase's work), AC-MERGE-06 (also applies to this phase's work), AC-BOT-01 (also applies to this phase's work), AC-BOT-02 (also applies to this phase's work)

## Out of scope for this phase
Exit Kiln, including its availability while a push activity is accepting (Phase 4).

## Phase dependencies
1 (the plan read from the main checkout, the offer's source and origin, and the interim refusal this phase replaces); 2 (the after-delivery activity: reopening a finished run, its gates, stops, waits and restart hold).

## Phase-specific notes
- While a push activity is `accepting`, the run is not currently complete, so the check and acceptance guards (`engine.ts`, near lines 3310 and 3531 before the develop merge) must let the automatic re-check and acceptance through.
- The automatic acceptance must supply a current status token to `submitInternal`.
- The real push session with each agent runs against the disposable GitHub repository named in the design's "Before the build".
