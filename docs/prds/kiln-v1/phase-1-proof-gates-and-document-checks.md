# Phase 1: Proof gates 1 and 2, and kiln run checking a PRD's documents

**Closed:** 2026-10-17

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "Workload Type and Starting Point", "Dependencies", "The Plan Reader", "Command line", "Windows" (Paths), "Testing Approach" (its "Order" paragraph and the plan reader tests)
**Proof gates:** docs/design/kiln-architecture-proposal.md — "Proof gates", gates 1 and 2

## Summary
Try for real, by hand and with no Kiln code, the Claude Code behaviors the design relies on (proof gate 1) and one real phase run with Kiln's launch prompt (proof gate 2), keeping their recorded output as test fixtures. Alongside, stand up the npm package and its CI, and make `kiln run <path>` find a PRD's documents, read its phase plan and refuse in the terminal when anything is missing or broken. Nothing is implemented by Kiln yet.

## Acceptance criteria covered
AC-START-01, AC-START-02, AC-CLI-02, AC-INSTALL-03

## Out of scope for this phase
Worktree setup, sessions, the done check and the pull request (Phase 2); interruptions, resume, sleep and keep-awake (Phase 3); the local server and every browser screen, Documents found included (Phases 4 and 5); the Windows run of proof gate 1, gates 3 and 4, and publishing to npm (Phase 6).

## Phase dependencies
None.

## Phase-specific notes
- Gates 1 and 2 run on macOS in this phase; their Windows run is Phase 6's. Gate 1's sleep items need the computer actually asleep: if the session can't do that itself, they are this phase's human action for Doug.
- A gate item that doesn't behave as the design says comes back as a product decision (PRD, "Depends On"); it is surfaced, never worked around, before Phase 2 builds on it.
- CI runs the unit and Git integration tests on macOS, Linux and Windows runners from this phase on, which is how AC-INSTALL-03 is held until Phase 6's Windows run.
- Until Phase 4 serves the browser view, `kiln run` on a PRD that passes every start check prints the drawn "all checks passed" line, then says it can't start phases yet, and exits 0.

- Gate 1's two sleep items were this phase's last open item, a human action for Doug. Doug waived them on 2026-10-17: they're optional, to be checked in normal use ([the gate results](../../design/kiln-proof-gates-1-and-2-results.md), "Not yet run: the sleep items"), so this phase is closed.
