# Phase 4: The local browser view, up to pressing Start

**Closed:** 2026-10-17

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "The Local Server", "HTTP API", "Snapshot" (Documents found and "Paths shown"), "Account and Usage", "Worktree and Branch Setup" (the field checks and the base check on view connect), "Where a Feature Stands" ("Startup order"), "Control From Outside the Browser", "Command line" (the terminal lines)

## Summary
`kiln run` serves a local browser view, reachable only from the same machine and closed to other web pages, at an address the PRD keeps. It opens on Documents found, where the person sees what Kiln found, reviews and changes the settings, confirms the documents were refined, and presses Start. From then on Kiln works through the phases as Phase 2 built, reporting in the terminal; watching it in the browser comes in Phase 5.

## Acceptance criteria covered
AC-START-03, AC-START-04, AC-START-05, AC-START-06, AC-START-08, AC-START-09, AC-VIEW-01, AC-VIEW-06, AC-MULTI-01, AC-MULTI-02, AC-KEEP-01, AC-LOOK-02, AC-LOOK-03, AC-LOOK-04, AC-LOOK-05, AC-STOP-04 (also applies to this phase's work), AC-INSTALL-02 (also applies to this phase's work), AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
Running, Phase detail, Paused, Disconnected, both Needs you screens and Complete, with their controls and live output (Phase 5).

## Phase dependencies
2 (the engine's command interface, the Snapshot, worktree setup and the instance lock with its port); 3 (the interrupted and resumed terminal lines AC-START-09 prints, and the keep-awake setting)

## Phase-specific notes
- The account, usage and model-list calls are built here, since Documents found's model list and account line need them; the Claude account panel on Running and Paused, and AC-WATCH-08 as a whole, are Phase 5's.
- What Phase 2 left for this phase: until the server exists, `kiln run` exits once the engine waits for a command (Needs you, Paused, Complete), printing a grey line saying so except at Complete, and its ● line names no address; for a feature not started it takes the lock, runs the start checks, prints the found line and says there is no browser view to press Start in. Nothing writes the PRD record before Start yet: this phase writes it when it serves Documents found (`newPrdRecord`, `defaultSettings` with `originBranches`, `baseBranchChoices`) and keeps `kiln run` in the foreground (AC-KEEP-01). The engine's commands (`Engine.start`, `pause`, `cancelPause`, `checkAgain`, `changeSettings`) return `{ ok: false, status: 409 | 400, reason }` for the HTTP API to pass on, and `buildSnapshot` builds the Snapshot, with `account` and `models` left for this phase.

## Inherited from Phase 3
- Ctrl+C, a closed terminal and SIGTERM are handled in `src/kiln-command.ts` (`StopControl`): it calls `Engine.stop()`, which runs steps 1 to 4 of the stop sequence and releases keep-awake, then `runKilnCommand` releases the lock and prints the line. Step 5's "close the server" is this phase's: close it after `Engine.stop()` resolves and before the lock is released. Before Start there is no engine yet, so a stop prints `StopControl.fallback` ("Kiln stopped. Nothing was started."); once Documents found is served by an engine, set `stop.engine` there so a stop during setup gets the engine's own line.
- Keep-awake is a `KeepAwake` (`src/platform/keep-awake.ts`) passed to the engine as `keepAwake`; `underway()` makes one today, so the Documents found path needs one too, for the session Start launches. Its error reaches the Snapshot as `settings.keepAwakeError`, worded as the Documents found mockup's setting message.
