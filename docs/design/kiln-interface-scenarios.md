# Kiln interface scenarios

These are the screens for Kiln v1, revised October 11, 2026. They show only what v1 builds. They use a fictional customer-returns feature with phases 1, 2a, 2b, 3 and 4, and follow the [Kiln architecture proposal](kiln-architecture-proposal.md).

**The mockups in `mockups/` are the design of record.** Every screen has two files:

- the HTML is the source to build from: layout, copy, colors and type;
- the PNG is the same screen rendered at its design size, for a quick look.

Open the HTML in a browser to click between screens.

The screens were drafted on a private Claude design canvas, <https://claude.ai/artifact/Jjj5EpYDtT5YUU1PhLdNZm>. When the canvas and the repository disagree, the repository wins.

| Screen | What it shows | In v1 | Mockup |
|---|---|---|---|
| Terminal: `kiln run` | The only command: a missing-document error, a good start that opens the browser, one line per phase, and Ctrl+C then `kiln run` resuming | Yes | [HTML](mockups/kiln-screen-terminal-kickoff.html) · [PNG](mockups/kiln-screen-terminal-kickoff.png) |
| Documents found | What Kiln found beside the PRD, the run settings (model, effort, keep-awake and more), what the run is allowed to do, and Start | Yes | [HTML](mockups/kiln-screen-documents-found.html) · [PNG](mockups/kiln-screen-documents-found.png) |
| Running | The phase list, with the current phase's progress from its tool calls | Yes | [HTML](mockups/kiln-screen-running.html) · [PNG](mockups/kiln-screen-running.png) |
| Phase detail, live | Live session output, progress, session ID and commits | Yes | [HTML](mockups/kiln-screen-phase-detail-live.html) · [PNG](mockups/kiln-screen-phase-detail-live.png) |
| Needs you: session ended with a message | The last message word for word, the resume command, and the done check | Yes | [HTML](mockups/kiln-screen-needs-you-ended-with-message.html) · [PNG](mockups/kiln-screen-needs-you-ended-with-message.png) |
| Needs you: session crashed | The same, with the exit code and the last output lines | Yes | [HTML](mockups/kiln-screen-needs-you-crashed.html) · [PNG](mockups/kiln-screen-needs-you-crashed.png) |
| Notifications | Needs you, and PR ready | Yes | [HTML](mockups/kiln-screen-notifications.html) · [PNG](mockups/kiln-screen-notifications.png) |
| Complete | The PR, and assumptions still awaiting stakeholder feedback | Yes | [HTML](mockups/kiln-screen-complete.html) · [PNG](mockups/kiln-screen-complete.png) |

## Rules the screens follow

- `kiln run <PRD folder>` is the only command and the only way in. After it opens the browser, everything is controlled there; the terminal just hosts the run.
- The feature name is the largest text on every screen.
- Phase titles come from the phase docs word for word, and the phase number stays in its circle in every state.
- A phase is Done only when the done check passes (closed, committed and pushed). It shows green with a check, and its row shows the pushed commit.
- Progress steps come from the session's tool calls. Nothing on screen claims evidence for acceptance criteria.
- When a phase stops, the screen shows what the session said and how to resume it, never a guessed cause or a question Kiln made up.
- Unconfirmed assumptions appear at the end as information, never as a hold.
- The look is the Enso Method website's dark theme: Instrument Serif headings, Inter body text and JetBrains Mono for code. The single red accent marks the phase in progress, amber means it needs you, and green means done.

