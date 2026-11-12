# Phase 2: Start from an existing branch, and catch an untouched branch up

**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "Architecture" (item 1), "Starting From a Branch", "Catching a Branch Up", "Interfaces" (`POST /api/settings`, `/api/start`, `bringUpToDate` on the session routes, the snapshot's `documents.start` and `needsYou.catchUp`, `--leave-branch-as-is`), "Data Models", "Changes to Earlier Designs" (the Kiln v1, Missing Worktree Recovery, Multi-Repo Delivery, Development Deployments and Continue Added Phases pointers)

## Summary
Documents found lets the person start Kiln on a branch that already exists, such as one where they built the first phases by hand, reading the plan from that branch and starting at its first open phase, in one repository or several. When that branch has nothing of its own and is behind its base, Kiln offers to move it forward to the base first, on Documents found, on a stopped phase's page and in the session-starting commands.

## Acceptance criteria covered
AC-FROM-01, AC-FROM-02, AC-FROM-03, AC-FROM-04, AC-FROM-05, AC-CURRENT-01, AC-LOOK-01 (also applies to this phase's work)

## Out of scope for this phase
Reset, including the start-check rerun on a page a reset built and a reset run from an adopted worktree (Phase 3).

## Phase dependencies
1 (the stopped-phase Work read the catch-up offer is read with, and the carry-on and start-again actions and commands the offer and `--leave-branch-as-is` apply to)

## Phase-specific notes
- `docs/kiln-command-line-and-bot-control.md` gains `--leave-branch-as-is` here, and its claim that a terminal can do everything the browser does is corrected for choosing where a run starts.

## Carried forward from Phase 1
- The stopped-phase Work read is `Engine.refreshStoppedWork` (`src/engine/stopped-phase.ts` `readPhaseWork`), run at a stop, each recheck, page open (`/api/events`) and before a carry-on; the catch-up offer is read there. `Engine.stoppedPhase()` is the stopped-phase predicate; a held phase is never one.
- The journal's `carry-on` and `start-again` actions take no `leave_branch` input yet (`src/control/commands.ts` `validateInstruction`), and `/api/carry-on` and `/api/start-again` take no `bringUpToDate`; the contracts in `prompts/kiln-command-contracts.json` have no `--leave-branch-as-is`.
- The stopped-phase cards are `view/src/components/CarryOnCard.svelte` and `StartAgainCard.svelte`, rendered from `PhaseHandoff.svelte` and `NeedsYou.svelte`; the offer sits above them, once.
- The real-agent proof for the stopped-phase actions is `scripts/proof-run/run-restart-provider-proof.mjs`.
