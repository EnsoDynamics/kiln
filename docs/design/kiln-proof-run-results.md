# Kiln proof run results

Results of the proof run before Kiln v1's release (PRD AC-PROOF-01, AC-PROOF-02), done by following [Kiln proof run steps](kiln-proof-run-steps.md). The proof needs a real GitHub repository and a run on Windows, so it is done by a person; the macOS rehearsal below, with GitHub stood in for, came first.

## The rehearsal on macOS, GitHub stood in for (2026-10-18)

[`scripts/exploration/proof-rehearsal-real-feature.mjs`](../../scripts/exploration/proof-rehearsal-real-feature.mjs) ran the proof feature, Word tally, through the built `kiln run` at this phase's code, with the real Claude Code 2.1.299 on `sonnet` at medium effort, on macOS (Apple silicon) with Git 2.50.1. Everything was real except GitHub: `origin` was `git@github.com:kiln-proof/word-tally.git` served from a local bare repository by an SSH stand-in, and `gh` was a stand-in keeping pull requests in a file. It ran three times. The first held every item but missed the Ctrl+C, because each phase's session took about a minute; the second and third sent it once the session was seen working. Before the third, the seed script began writing the proof repository's `CLAUDE.md`, which tells every session to work directly on the checked-out branch and never create a feature branch or worktree; the third run is the one that tests AC-PROOF-02 against that instruction.

| Item | Result |
|---|---|
| Documents found | Held, all three runs. 3 phase documents, every check passed; the seed script's commit was the only change to the repository before Start |
| One stop, finished through the resume command, then Check again | Held, all three runs. With origin's push URL pointing at a repository that doesn't exist, phase 1's session built, closed and committed the phase, failed to push and exited 0, saying it hadn't changed the remote configuration because that went beyond what it was authorized to do. Kiln stopped at Needs you: Phase doc closed and Everything committed passed, Pushed failed with "feature/word-tally isn't on origin yet". With the push URL fixed, `claude -p --resume <session ID>` in the worktree pushed and exited 0; Check again showed phase 1 Done, "finished by you", and phase 2 started |
| One phase that splits itself | Held, all three runs, both ways a split can go. Phase 2's session split it into 2a and 2b with `phase-split`. In the first two runs it also built 2b, each leaf in its own commit: Kiln judged the session as 2a's, showed 2 as "Split into 2a, 2b" and 2b as Done with no time of its own, and went on to phase 3. In the third it built 2a only, and Kiln started 2b's own session next |
| One Ctrl+C partway through a phase, resumed by `kiln run` | Held, runs two and three (phase 3, then phase 2b). SIGINT to Kiln's process group (what a terminal's Ctrl+C sends) 5 seconds after the session was seen working, in run two: Kiln printed "Interrupted phase 3, JSON output and the README. Its session and uncommitted work are kept." and exited 130 within a second; the run reads `interruptedBy: sigint`; no `claude` process was left. The next `kiln run` printed "Word tally · 3 of 4 phases done · phase 3 was interrupted", resumed the same session, and phase 3 finished and pushed |
| To "PR ready for review" | Held, all three runs. In run two, the pull-request session opened #101 from `feature/word-tally` into `develop`, ready for review; Complete showed it with 5 commits, every leaf Done and "Opened #101" |
| AC-PROOF-02: sessions stay on Kiln's branch | Held, all three runs, the third with the repository's `CLAUDE.md` telling sessions to stay on `develop`. Origin had only `develop` and `feature/word-tally`; `develop` was still the seed commit on origin and in the main checkout, which stayed on `develop` with a clean tree; `git worktree list` showed the main checkout and Kiln's one worktree. The feature's own tests pass |

Not covered by the rehearsal: a real GitHub repository and pull request, Windows, and the sleep check.

## The proof run

Not yet run. Record each part's result here as the steps' tables do above: the date, the computer and operating system, Claude Code's version, the model and effort, and each item as Held or what happened instead.

| Part | Result |
|---|---|
| B. macOS, real GitHub repository | |
| B6. Sleep check on macOS | |
| C. Windows, real GitHub repository | |
| C. Windows: which `claude` (`claude.cmd` or `claude.exe`); "Terminate batch job (Y/N)?" at Ctrl+C, and how long the stop took | |
| C. Windows: a closed window | |
| C. Windows: opening the browser, one Kiln per PRD, state directory, paths, keep-awake, sleep readings (and the PC's kind of sleep, from `powercfg /a`) | |
| C. Screens on Windows | |
| D. Proof gate 1 on Windows: session, interrupt, resumes | |
| D. Proof gate 1 on Windows: sleep mid-Bash and mid-response | |
| E. Keep-awake on Ubuntu GNOME | |
| E. Keep-awake on KDE, and PLAT-001 with systemd 257 or newer | |
