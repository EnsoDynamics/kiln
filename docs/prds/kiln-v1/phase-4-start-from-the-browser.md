# Phase 4: The local browser view, up to pressing Start

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
