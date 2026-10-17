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

## Phase-specific notes
- Don't start this phase until proof gate 1's two sleep recordings are in `test/fixtures/proof-gate-1/` (Phase 1's pending human action): telling a sleep that cut a session off from one it survived is built and tested from them, and a sleep behaving other than the design says comes back as a product decision first. Gate 1's other recordings (interrupt, SIGINT to the group, both resumes, a missing transcript) are there, with what they showed in `docs/design/kiln-proof-gates-1-and-2-results.md`.
- What Phase 2 left for this phase: `kiln run` has no signal handling, and when its record shows an interrupted session (a run with no `endedAt`, or with `interruptedBy`) `Engine.decide()` returns `interrupted` and `kiln run` prints "● Phase <n>’s session <id> was interrupted, and this build of Kiln can’t resume a session yet. Nothing was started." and exits 1 (`src/underway-output.ts`). This phase replaces that branch with the done check and the resume. Each run already records its PID and process start time (`src/platform/process-start-time.ts`), and sessions, `git` and `gh` calls already spawn detached (`spawnDetached`, `runHelper`).
- On Windows, sessions and helper calls share Kiln's console instead of being detached (technical design, "Windows", the Ctrl+C row; Phase 2's Windows CI found the detached spawn loses the pipes through `claude.cmd` and PowerShell). So on Windows a Ctrl+C reaches the session as well as Kiln, and the stop sequence has to hold when the session has already received it.
