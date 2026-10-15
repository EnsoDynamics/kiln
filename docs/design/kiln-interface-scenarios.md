# Kiln interface scenarios

These are the screens for Kiln v1, revised October 15, 2026. They show only what v1 builds, and they implement the [Kiln v1 PRD](../prds/kiln-v1/kiln-v1-prd.md). They use a fictional customer-returns feature with phases 1, 2a, 2b, 3 and 4.

**The mockups in `mockups/` are the design of record.** Edit the HTML there directly; it is the only source. Every screen has two files:

- the HTML is the source to build from: layout, copy, colors and type;
- the PNG is the same screen rendered at its design size, for a quick look.

Open any HTML file in a browser to see it at full size. A few screens link to each other (Watch live, All phases, Full session output).

| Screen | What it shows | Mockup |
|---|---|---|
| Terminal: `kiln run` | The only command: a missing-document error, a good start that opens the browser, one line per phase event, and Ctrl+C then `kiln run` resuming the interrupted session | [HTML](mockups/kiln-screen-terminal-kickoff.html) · [PNG](mockups/kiln-screen-terminal-kickoff.png) |
| Documents found | What Kiln found beside the PRD, the settings (worktree, branches, model, effort, keep-awake), what Kiln may do, the Claude account and its usage, the refinement confirmation, and Start | [HTML](mockups/kiln-screen-documents-found.html) · [PNG](mockups/kiln-screen-documents-found.png) |
| Running | The current phase at the top with its progress, the phase plan with each phase's Details, the settings, the Claude account and its usage, Pause Kiln, and the connection to Kiln | [HTML](mockups/kiln-screen-running.html) · [PNG](mockups/kiln-screen-running.png) |
| Paused | Kiln paused between phases, the next phase, the Claude account and its usage with how to switch accounts, and Start to continue | [HTML](mockups/kiln-screen-paused.html) · [PNG](mockups/kiln-screen-paused.png) |
| Disconnected | Kiln has stopped: what the view last saw, and the `kiln run` command that picks it back up | [HTML](mockups/kiln-screen-disconnected.html) · [PNG](mockups/kiln-screen-disconnected.png) |
| Phase detail, live | Live session output, progress, session ID, model and effort, and commits | [HTML](mockups/kiln-screen-phase-detail-live.html) · [PNG](mockups/kiln-screen-phase-detail-live.png) |
| Needs you: session ended with a message | The last message word for word, exit code, last skill seen, the resume command, and the done check | [HTML](mockups/kiln-screen-needs-you-ended-with-message.html) · [PNG](mockups/kiln-screen-needs-you-ended-with-message.png) |
| Needs you: session crashed | The same, with the last output lines in place of a final message | [HTML](mockups/kiln-screen-needs-you-crashed.html) · [PNG](mockups/kiln-screen-needs-you-crashed.png) |
| Complete | The progress screen, finished: the pull request and every phase done | [HTML](mockups/kiln-screen-complete.html) · [PNG](mockups/kiln-screen-complete.png) |

## Rules the screens follow

- `kiln run <PRD folder or PRD file>` is the only command and the only way in. After it opens the browser, everything is controlled there; the terminal just hosts Kiln.
- The top bar has the Kiln mark on the left and, on the right, the connection to Kiln and the Enso Method mark. Above the feature name, every browser screen labels the Repository and the PRD folder.
- The feature name is the largest text on every browser screen.
- "Run" is never a noun on screen. One phase's Claude Code work is a session; Kiln's whole job is the PRD.
- Phase titles come from the phase docs word for word, all phases are listed at the same level, and the phase number stays in its circle in every state.
- A phase is Done only when the done check passes (closed, committed and pushed). It shows green with a check, and its row shows the pushed commit.
- Progress steps come from the session's tool calls: Build, Deliverable review, Test hardening, Commit, Refactor pass, Push. Nothing on screen claims evidence for acceptance criteria.
- When a phase stops, the screen shows what the session said and how to resume it, never a guessed cause or a question Kiln made up.
- Unconfirmed assumptions are counted on Documents found as information, never as a hold.
- The look is the Enso Method website's dark theme: Instrument Serif headings, Inter body text and JetBrains Mono for code. Each color has one role: red is Kiln's accent (the phase in progress, links and the keep-awake checkbox), amber marks what needs you (Needs you, a disconnected Kiln or interrupted phase, an error, a confirmation still to give, a usage limit nearly used), and green means done, passed or connected. In session output, each source's label is colored as the mockups show.
