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
- The real push session with each agent runs against the temporary GitHub test repository, `EnsoDynamics/kiln-proof-after-delivery-temp-20261122` (created 2026-11-22; its ruleset and fixture PRD are in [the merge proof results](kiln-after-delivery-merge-proof-results.md)). `scripts/proof-run/merge-with-agent-provider-proof.mjs` is the driver to copy.

## Carried forward from Phase 1
- **The interim refusal to replace:** `acceptContinuation` (`engine.ts`) refuses an offer whose `proposal.source.kind` is `main_checkout` with code `plan_not_pushed` and the reason "These phases are committed on this machine's {base} but not pushed. Push them to origin/{base}, then check for new phases again." The integration test "reads the main checkout's committed plan only when it holds unfinished phases the remote base lacks" pins it; this phase changes that expectation to the push.
- **The unpushed line still lacks its second sentence:** `originLine` in `src/engine/new-phases-wording.ts` says "These documents are committed on this machine’s {base} but not pushed." and `addedSentence` says "committed on this machine's {base} and not pushed"; AC-BACK-04 adds "Continue pushes them first." once Continue does.
- **The proposal carries `source` but not yet its commit list** (each commit beyond the remote, marked as touching only this PRD's documents or not), which the push session's prompt needs.
- **Owed `Superseded in part by:` line:** the Kiln Continue Added Phases technical design's §Durable proposal and one acceptance (accepting an offer read from the main checkout pushes first).

