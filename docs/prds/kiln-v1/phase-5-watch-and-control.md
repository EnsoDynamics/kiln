# Phase 5: Watching Kiln work and handling stops in the browser

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "HTTP API" (the phase route, "Needs you on screen", "Connection"), "Snapshot", "Output line", "Sessions" ("Output and progress", "How a session ended"), "Account and Usage", "Engine loop" (pause), "Testing Approach" ("The view")

## Summary
The browser view shows Kiln at work and lets the person control it: the phase plan with each phase's state, the current phase's progress steps and live session output, the Claude account's usage, Pause after this phase, changing model and effort between phases, the Needs you screens with how the session ended, the checks that failed, the resume command and Check again, the Complete screen with the pull request, and a plain Disconnected state when Kiln isn't running. Every screen then matches its mockup.

## Acceptance criteria covered
AC-STOP-02, AC-STOP-03, AC-STOP-05, AC-STOP-06, AC-STOP-07, AC-GIT-04, AC-PR-04, AC-PR-05, AC-WATCH-01, AC-WATCH-02, AC-WATCH-03, AC-WATCH-04, AC-WATCH-05, AC-WATCH-06, AC-WATCH-07, AC-WATCH-08, AC-WATCH-09, AC-WATCH-10, AC-WATCH-11, AC-CLI-01, AC-VIEW-02, AC-VIEW-03, AC-VIEW-04, AC-VIEW-05, AC-VIEW-07, AC-VIEW-08, AC-KEEP-07, AC-LOOK-01, AC-LOOK-02 (also applies to this phase's work), AC-LOOK-03 (also applies to this phase's work), AC-LOOK-04 (also applies to this phase's work), AC-LOOK-05 (also applies to this phase's work), AC-STOP-04 (also applies to this phase's work), AC-INSTALL-02 (also applies to this phase's work), AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
The real-feature proof, the Windows checks and publishing to npm (Phase 6).

## Phase dependencies
2 (the engine's Needs you stops, check-again command and pull-request facts); 3 (the interrupted and not-resumable states the screens draw); 4 (the server, event stream, account and usage data, and the shared screen frame)

## Phase-specific notes
- Proof gate 3 (architecture proposal) runs at the end of this phase, against the real Claude Code, once Needs you exists.
