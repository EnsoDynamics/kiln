# Kiln proof gates 1 and 2: results

Proof gates 1 and 2 of the [architecture proposal](kiln-architecture-proposal.md) ("Proof gates"), run by hand with no Kiln code on October 17, 2026, on macOS (Apple silicon), Claude Code 2.1.299, Git 2.50.1, Agent SDK 0.3.302. Their Windows run is Phase 6's. Every session was started the way the [technical design](../prds/kiln-v1/technical-design.md) says Kiln will start one ("Starting a phase's session"), through [`scripts/exploration/proof-gate-session.mjs`](../../scripts/exploration/proof-gate-session.mjs), which records every stream-json event with its arrival time. The recordings are test fixtures in [`test/fixtures/proof-gate-1/`](../../test/fixtures/proof-gate-1/) and [`test/fixtures/proof-gate-2/`](../../test/fixtures/proof-gate-2/), with the person's skill, command, plugin and MCP lists trimmed from each `init` and `commands_changed` event, and their home folder, name and private skill names replaced (`/home/person`, `Alex`), so the repository's client-terms check passes.

## Gate 1: launch and resume

| Item | Result | Recording |
|---|---|---|
| Start a headless session with a session ID chosen in advance, and stream its output | Held. Every flag in the design was accepted; `init` carried the chosen ID, `permissionMode: "auto"` and the concrete model ID | `launch-skill-then-interrupt-mid-bash` |
| Stop it mid-turn (the interrupt request on stdin, the design's stop path) | Held. Sent 40 seconds into a foreground Bash call: the turn ended 14 ms later, the process exited 0.35 s after it, and the running tool's process was gone. The last events are a `tool_result` "The user doesn't want to proceed with this tool use", the text `[Request interrupted by user for tool use]` and a `result` with subtype `error_during_execution`; the exit code is **1** | same |
| SIGINT to the session's whole process group | Held. Sent 10 seconds into a foreground Bash call: same ending, exit code 0, tool process gone, session resumable | `sigint-process-group-mid-bash` |
| Reopen with `claude --resume <id>` in a terminal | Held, with full history of both runs. A folder Claude Code has never trusted asks "Is this a project you created or one you trust?" first, with "No, exit" selected; Kiln's worktree is a new folder, so the person's first resume of a stopped session there gets this question once | `resume-interactive-screen.txt` |
| Continue headlessly with `claude -p --resume <id>` | Held after both kinds of stop: the resumed run had the earlier turns (it repeated a codeword given before the stop) and kept the session ID | `resume-headless-after-interrupt`, `resume-headless-after-sigint` |
| Skills load and their calls appear in the stream | Held: a top-level `tool_use` named `Skill` with input `{"skill": "<name>"}`; plugin skills appear qualified (`enso-method:implement-from-requirements`, gate 2) | `launch-skill-then-interrupt-mid-bash` |
| Headless `/usage` returns `usage_report` with no model call, and polling it during a session doesn't disturb it | Held: `usage_report.rate_limits.limits[]` with `session`, `weekly_all` and a Fable `weekly_scoped` row; the assistant message's model is `<synthetic>` with zero tokens and the result costs 0. Two polls during session A's Bash call left the session unaffected | `usage-report-idle`, `usage-report-during-session` |
| `supportedModels()` spends no usage and works against the person's own `claude` | Held: the SDK spawned only the given executable (no bundled copy), answered in 0.5 s, and the child wrote nothing but a `control_response`, so no model turn ran | `supported-models.json` |
| `claude -p --resume` of a session whose transcript is gone exits without `init` | Held: no `init`; one `result` (`error_during_execution`, no result text, `errors: ["No conversation found with session ID: …"]`), the same line on stderr, exit code 1 | `resume-transcript-gone` |
| With `--forward-subagent-text`, a subagent's tool calls reach the stream as well as its text | Held: its tool calls and their results arrive with `parent_tool_use_id`. Its report to its caller arrives as a **`SubagentHandback` tool call** whose input is `{"message": …}`, not as a text block | `subagent-tool-calls-forwarded` |
| Whether a model's `supportsAutoMode` reflects what the signed-in account may use | Every alias entry had it `true`; one entry (`claude-haiku-4-5-20251001`) lacked it. A session on that model with `--permission-mode auto` ran in **`default` mode with no error**: its `init` reports `permissionMode: "default"`. Variation between accounts wasn't tried, with one account | `auto-mode-on-model-without-auto-support`, `supported-models.json` |
| What a streaming session does when the computer sleeps and wakes, mid-response and mid-Bash | **Not run.** It needs the computer actually asleep, which this unattended session can't do and then wake from. Optional since 2026-10-17: [below](#not-yet-run-the-sleep-items) | |

### What changed in the design

- **Model list and auto mode** (technical design, "Account and Usage", Models): the field message beside Model is built, shown when the chosen model's entry lacks `supportsAutoMode: true`, since otherwise a session silently runs in `default` mode where unattended work is refused.
- **Subagent reports** (technical design, "Output and progress"): a `SubagentHandback` call becomes a `reviewer` or `subagent` line carrying its `message`, so the reviewer's report reads as the reviewer's words (AC-WATCH-05).
- Nothing else needed changing. The interrupt's exit code 1 doesn't matter, because Kiln writes `interruptedBy` on the run before it sends the interrupt.

Found while building Phase 1, not by a gate item: in a submodule, `git worktree list --porcelain`'s first entry is the submodule's git directory, not its working tree; the technical design's "Command line" now asks that entry for `rev-parse --show-toplevel`.

## Gate 2: one real phase

A throwaway repository (a local bare repository as `origin`), with a two-phase PRD and an `AGENTS.md` saying "Always work directly on the `develop` branch in this checkout. Never create feature branches or worktrees." Doug's global instructions on this machine say the same, and add the method's parallel-session rule. The worktree and branch were made as Kiln will make them (`git worktree add --no-track -b feature/greeting-cli <path> <origin's develop tip>`), and phase 1 ran with the technical design's phase-session prompt, word for word ([`launch-prompt.txt`](../../test/fixtures/proof-gate-2/launch-prompt.txt)), on `opus` at high effort.

| Check | Result |
|---|---|
| The session stays on Kiln's worktree and branch even when instructions say otherwise | Held. It worked only in the worktree, on `feature/greeting-cli`; `develop` stayed at its starting commit locally and on origin, and no other branch or worktree appeared. Its final message says the reviewer flagged the repository's `develop` rule and the session kept to the branch the prompt assigned |
| It writes the Closed line, commits and pushes | Held: `**Closed:** 2026-10-17` under the title, one feature commit, `git push -u origin feature/greeting-cli` |
| The done check passes | Held: Closed line present; `git status --porcelain --untracked-files=all` empty; the local tip equals `git ls-remote origin refs/heads/feature/greeting-cli` (`3da2830`) |

The session took 2 minutes 26 seconds and exited 0. All six progress steps were visible as the design reads them: Skill calls for `implement-from-requirements`, `deliverable-review`, `test-hardening` and `refactor-pass` (plugin-qualified), a Bash call running `git commit`, then one running `git push`. Recording: `test/fixtures/proof-gate-2/one-real-phase-session.jsonl`.

## Not yet run: the sleep items

These two items of gate 1 check how Kiln tells a sleep that cut a session off from one it survived (technical design, "Interruptions, sleep and resume"). They need the computer asleep for real. Doug waived them as a prerequisite on 2026-10-17: they're optional, to be checked in normal use, and Phase 3 built the sleep handling from the design. To run them:

1. In a throwaway Git repository holding a script that takes several minutes (the gate used a `slow-task.sh` that prints a line a second for two minutes), run, from the Kiln checkout:
   `node scripts/exploration/proof-gate-session.mjs --cwd <repo> --out sleep-mid-bash.jsonl --session-id $(uuidgen | tr A-Z a-z) --model sonnet --effort low --prompt "Run ./slow-task.sh with Bash in the foreground and wait for it, then say done."`
2. About 15 seconds in, run `sysctl -n kern.sleeptime kern.waketime`, then sleep the Mac (close the lid, or `pmset sleepnow`). Wait at least two minutes, wake it, and run the `sysctl` line again.
3. Repeat with a prompt that makes a long answer, sleeping while text is streaming: `--out sleep-mid-response.jsonl --prompt "Write a 2,000-word essay on kilns."`
4. Copy both `.jsonl` files and their `.meta.json`, with the two `sysctl` readings, into `test/fixtures/proof-gate-1/`.

What to look for: whether the stream shows API-retry system events after wake, a `<synthetic>` assistant message when retries run out, a real assistant event before any later exit, and the exit code.
