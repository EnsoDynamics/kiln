# Phase 2: The engine that runs a PRD's phases to a pull request

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "Dependencies" (detached helper calls and their timeouts), "Design Decisions", "Where a Feature Stands" (all but its interrupted-session branches), "A plan that breaks after Start", "Sessions" ("Starting a phase's session", "The prompts", "Output and progress"), "The Done Check", "Worktree and Branch Setup", "Ports and one Kiln per PRD", "Kiln's State on Disk", "Snapshot"

## Summary
Kiln creates the feature branch and its worktree, then implements the leaf phases one at a time, each in a fresh unattended Claude Code session, checks in Git after each that the phase is closed, committed and pushed, stops without retrying when one isn't, and finishes by having one more session open the pull request. Start, Check again and the other controls are engine commands here, exercised by tests; the browser that presses them comes in Phase 4.

## Acceptance criteria covered
AC-START-07, AC-RUN-01, AC-RUN-02, AC-RUN-03, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07, AC-DONE-01, AC-DONE-02, AC-DONE-04, AC-STOP-01, AC-STOP-04, AC-STOP-08, AC-GIT-01, AC-GIT-02, AC-GIT-03, AC-PR-01, AC-PR-02, AC-PR-03, AC-MULTI-03, AC-MULTI-04, AC-INSTALL-02, AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
Ctrl+C handling, resuming an interrupted session, sleep and keep-awake (Phase 3); the local server, Documents found and the Start button (Phase 4); every other screen, and the browser controls for pausing and changing settings between phases (Phase 5).

## Phase dependencies
1 (the package, the plan reader and start checks, and the stream-json recordings from proof gates 1 and 2 used as fixtures)

## Phase-specific notes
- Phase 1 has no Closed line only because proof gate 1's sleep recordings, its pending human action, aren't in yet; this phase doesn't use them and can start. Gate 1 and 2 results, and what they changed in the design: `docs/design/kiln-proof-gates-1-and-2-results.md`.
- The engine's whole command interface is built here, as the design gives it: start, pause after this phase, cancel a pause, check again and change settings, with the engine loop's pause handling. Phases 4 and 5 only add the controls that call it; Phase 3 needs the paused state to release keep-awake.
- The engine produces the Snapshot the screens will render from; this phase builds it for the states it can reach, without any server.
- The instance lock takes the PRD's port with it, as the design gives, so the "already running" message can name the address even though nothing serves on it until Phase 4.
