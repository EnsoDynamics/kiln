# Kiln proof gate 3 results: the stop path

Proof gate 3 of the [architecture proposal](kiln-architecture-proposal.md) ("Proof gates") ran on 2026-10-18 (UTC) on macOS (Apple silicon), Claude Code 2.1.299, Git 2.50.1, with the built `kiln run` at commit `d9f033f` (Phase 5 of Kiln v1), through [`scripts/exploration/proof-gate-3-stop-path.mjs`](../../scripts/exploration/proof-gate-3-stop-path.mjs). The session ran on `sonnet` at medium effort.

**Setup.** A throwaway repository holding a one-phase PRD (a `greet.sh` script and its test). Its fetches went to a local bare repository; its push URL pointed at a GitHub repository with no credential available (no credential helper, no terminal), so `git push` failed the way a missing credential does. The start checks need `origin` on GitHub, so a stand-in `git` first on the PATH answered `git remote get-url origin` with a GitHub address and passed every other call to the real git. Pause after this phase was pressed while the phase worked.

| Check | Result |
|---|---|
| Needs you shows the last message and the failed checks | Held. The session built and tested the script, wrote the Closed line and committed, then its push failed with `could not read Username … Device not configured`. It exited 0 with a final message explaining the failed push. Kiln stopped at Needs you showing that message word for word (rendered as Markdown), `exit 0`, the last skill seen, the resume command, and the checks: Phase doc closed (Yes), Everything committed (Yes), Pushed (Not yet, "feature/greeting-cli isn't on origin yet") |
| The phase is finished by hand through `claude --resume` | Held. With the push URL fixed, `claude -p --resume <session ID>` in the worktree (the headless form of the resume command) pushed the branch and exited 0 |
| Check again lets Kiln continue | Held. Check again ran the done check: phase 1 Done, "finished by you", pushed commit recorded. Kiln then checked GitHub for a pull request (none, since the repository isn't real) and held the pause requested during the phase, showing Paused before the pull request (AC-VIEW-03, UI-008). Ctrl+C printed "Kiln stopped while paused before the pull request." and exited 130 |

The session called `implement-from-requirements` but did its review and hardening inline, so Progress showed Build, Commit and Push and left the other steps unreached, as AC-WATCH-04 allows.

**Not tried here:** opening the pull request, which needs a real GitHub repository (AC-PROOF-01, Phase 6), and Windows.
