# Phase 3: Ctrl+C, resume, sleep and keep-awake

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "Stopping a session: Ctrl+C, a closed terminal and signals", "Interruptions, sleep and resume", "The prompts" (the resumed-session prompt), "Where a Feature Stands" (its interrupted-session branches), "Keep-awake", "Windows"

## Summary
When Kiln is stopped mid-phase by Ctrl+C, a closed terminal, a signal or the computer sleeping, it ends the session cleanly so nothing is lost, and the next `kiln run` checks the phase and either counts it done or resumes that same session with its history; a session that can't be resumed goes to the person. While a session works, Kiln keeps the computer from sleeping when idle, on macOS, Linux and Windows.

## Acceptance criteria covered
AC-DONE-03, AC-KEEP-02, AC-KEEP-03, AC-KEEP-04, AC-KEEP-05, AC-KEEP-06, AC-RUN-06 (also applies to this phase's work), AC-GIT-02 (also applies to this phase's work), AC-STOP-04 (also applies to this phase's work), AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
The browser view, including how an interrupted or not-resumable phase is drawn and the Disconnected screen (Phases 4 and 5); the manual keep-awake check on Linux desktops and the Windows run of proof gate 1 (Phase 6).

## Phase dependencies
2 (the engine's session runner, its record on disk, the done check and Needs you stops)
