# Kiln proof run steps: the real feature, and the Windows and Linux checks

What a person does before Kiln v1's release, in Phase 6 of the [Kiln v1 PRD](../prds/kiln-v1/kiln-v1-prd.md) ([phase document](../prds/kiln-v1/phase-6-proof-and-release.md)). Record each result in [Kiln proof run results](kiln-proof-run-results.md). A step that doesn't hold as written comes back as a product decision (PRD, "Depends On"), not a workaround.

| Part | Covers | Where | Needs |
|---|---|---|---|
| [A. The proof repository](#a-the-proof-repository) | Setup for B and C | GitHub | One new private GitHub repository |
| [B. The proof run on macOS](#b-the-proof-run-on-macos) | AC-PROOF-01, AC-PROOF-02; the sleep check | A Mac (or Linux) | About an hour |
| [C. The proof run on Windows](#c-the-proof-run-on-windows) | AC-PROOF-01 on Windows; the sleep check, the keep-awake check, the other Windows rows of the technical design's "Windows" table and the screens, on Windows | A Windows PC | About an hour |
| [D. Proof gate 1 on Windows](#d-proof-gate-1-on-windows) | Session, interrupt, resume and sleep on Windows | The same PC | 30 minutes |
| [E. Keep-awake on Linux desktops](#e-keep-awake-on-linux-desktops) | AC-KEEP-06 on Ubuntu GNOME and on KDE; PLAT-001 | Two Linux desktops | 30 minutes each |

The proof feature is **Word tally** (`scripts/proof-run/word-tally/`): a small Node.js command-line tool, refined and split into three phases, whose phase 2 asks to be split. A macOS rehearsal with GitHub stood in for has already run it end to end with Kiln; see the results document.

## Before any part: install Kiln from this checkout

Kiln isn't on npm until after this proof. On each computer, first:

- Node 22 or later, Git 2.29 or later, and Claude Code signed in.
- The Enso Method skills installed in Claude Code, which every phase's session runs: `claude plugin marketplace add EnsoDynamics/enso-method`, then `claude plugin install enso-method@enso-method`.
- `gh` signed in to an account that can read `EnsoDynamics/kiln` (private until the release) and push to and open pull requests on the proof repository.
- On Windows, PowerShell allowed to run npm's command shims: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Record which `claude` the PC has, with `Get-Command claude`: npm's `claude.cmd` or the native `claude.exe` (C's Ctrl+C check depends on it).

Then install the package exactly as npm will publish it:

```
gh repo clone EnsoDynamics/kiln
cd kiln
npm ci
npm pack
npm install -g ./ensodynamics-kiln-1.0.0.tgz
kiln --help
```

On Windows run these in PowerShell. Keep the clone: B, C and D use its scripts.

## A. The proof repository

Create one **private** repository for the proof, for example `EnsoDynamics/kiln-proof-word-tally`, with a README so it has a `main` branch. Both runs use it: each opens its own pull request into `main` from its own feature branch, and nothing is ever merged.

```
gh repo create EnsoDynamics/kiln-proof-word-tally --private --add-readme
```

On the Mac, clone it and seed the proof feature. The seed script commits `docs/prds/word-tally/` and a `CLAUDE.md` saying "Always work directly on the `main` branch in this checkout. Never create feature branches or worktrees.", the instruction AC-PROOF-02 says Kiln's sessions must not follow. It pushes nothing:

```
gh repo clone EnsoDynamics/kiln-proof-word-tally
node <kiln clone>/scripts/proof-run/seed-proof-feature.mjs kiln-proof-word-tally
git -C kiln-proof-word-tally push origin main
```

## B. The proof run on macOS

From `kiln-proof-word-tally`:

1. Note the Claude Code processes already running, to compare with at step 8: `pgrep -fl claude`.
   **Make the first phase's push fail**, so it stops: `git config remote.origin.pushurl https://github.com/EnsoDynamics/kiln-proof-missing.git`. That repository doesn't exist, so `git push` fails with "Repository not found".
2. `kiln run docs/prds/word-tally`. The browser opens on Documents found: 3 phase documents, all checks passed, base branch `main`, feature branch `feature/word-tally`. Tick the refinement confirmation. Keep the default, Opus at high effort: on Sonnet each phase of this feature takes about a minute, which leaves little time for steps 6 and 7. Press **Start**.
3. **The stop.** Phase 1 builds, commits and fails to push, so Kiln shows Needs you with "Pushed: feature/word-tally isn't on origin yet" and the session's last message. Screenshot it.
4. **Finish it through the resume command.** In the repository, `git config --unset remote.origin.pushurl`. Copy the resume command from Needs you into a new terminal. Claude Code may first ask whether you trust the folder (Kiln's worktree is new to it); say yes. Tell it: "The push failed because the push URL was wrong; that's fixed now. Push the branch and make sure everything is committed and pushed." When it has pushed, `/exit`.
5. Press **Check again**. Phase 1 shows Done, "finished by you", and phase 2 starts.
6. **The sleep check** (carried from Phase 3). When phase 2 is Implementing, sleep the Mac (Apple menu → Sleep, or `pmset sleepnow`) for at least two minutes, then wake it. Kiln's terminal should show phase 2 interrupted and resumed when its session had no model response after waking, or the phase carrying on to Done when it did. Record the terminal lines and, from `grep -r '"interruptedBy"' ~/.local/state/kiln/`, whether the run reads `"sleep"`.
7. **The split.** Phase 2 splits itself into 2a and 2b; the plan shows phase 2 as split, and Kiln carries on with the next leaf on its own. (The session may build 2a only, and Kiln then starts 2b's own session, or build both; then 2b shows Done with no time of its own, which is correct. The rehearsal saw both.)
8. **The Ctrl+C.** Once phase 3 (or 2b) is Implementing and its latest line is moving, press **Ctrl+C** in Kiln's terminal. Check:
   - the terminal's last line says the phase was interrupted and `kiln run` picks it up;
   - the browser view says Disconnected, with the phase Interrupted;
   - `pgrep -fl claude` lists the same processes as at step 1, and none with the phase's session ID;
   - `grep -r '"interruptedBy"' ~/.local/state/kiln/` now also shows `"sigint"`.
9. `kiln run docs/prds/word-tally` again. It resumes the interrupted session (the terminal says resumed, and the phase's session ID is the same), then carries on to the pull-request session, which opens the pull request. The browser shows Complete with the pull request's number and link; open it on GitHub and check it is open and ready for review, not a draft.
10. **AC-PROOF-02**, every session stayed on Kiln's branch despite the repository's `CLAUDE.md`:
   - `git ls-remote --heads origin` lists only `main` and `feature/word-tally` (plus `feature/word-tally-windows` once C has run);
   - `main` on origin is still the seed commit: `git rev-parse origin/main` after a `git fetch`;
   - the repository itself is still on `main`, with `git status` clean;
   - `git worktree list` shows the repository and one Kiln worktree, `../kiln-proof-word-tally-kiln/word-tally`.

## C. The proof run on Windows

The same as B, in PowerShell, with these differences:

- Clone the proof repository; it's already seeded. Kiln's state for this PRD on this PC is new, so it starts at Documents found. **Change the feature branch to `feature/word-tally-windows`** before Start: `feature/word-tally` is taken by the macOS run.
- Note the processes already running before Start: `Get-Process claude, node -ErrorAction SilentlyContinue`.
- The push URL: `git config remote.origin.pushurl https://github.com/EnsoDynamics/kiln-proof-missing.git`, then `git config --unset remote.origin.pushurl` at step 4.
- The sleep check at step 6: Start → Power → Sleep, and `Get-ChildItem -Recurse "$env:LOCALAPPDATA\kiln" -Filter *.json | Select-String interruptedBy` in place of `grep`.
- The resume command on Needs you is PowerShell's form, `cd '<worktree>'; claude --resume <session ID>`; paste it into a new PowerShell window.
- At the **Ctrl+C**, watch for cmd.exe asking **"Terminate batch job (Y/N)?"** (it runs npm's `claude.cmd` shim). If it appears, don't answer it: time how long until Kiln exits. Kiln should exit within a few seconds; if the stop takes its full 30-second wait before ending the session's process tree, record it, since it's a product decision under AC-KEEP-02. Then check `Get-Process claude, node -ErrorAction SilentlyContinue` lists only what it listed before Start, and the `Select-String` line above now also shows `"sigint"`.
- **A closed window** (the technical design's "Ctrl+C and a closed window" row). After step 9's `kiln run`, once the next phase or the pull-request session is working, close Kiln's PowerShell window with its close button instead of pressing Ctrl+C. Open a new window and check as for Ctrl+C: no process left from the session, and the run reads `"sighup"`. `kiln run docs/prds/word-tally` resumes it and carries on to Complete.
- AC-PROOF-02's checks as in B step 10, with `feature/word-tally-windows`.

While the Windows run is going, also check the technical design's untried Windows pieces ("Windows" table) and record each:

| Piece | How to check |
|---|---|
| Opening the browser | `kiln run` opened the default browser on Documents found |
| One Kiln per PRD (process start time) | While Kiln runs, `kiln run docs/prds/word-tally` in a second window prints "already running at <address>" and starts nothing |
| State directory | `icacls "$env:LOCALAPPDATA\kiln"` lists your account, `SYSTEM` and `Administrators` (inherited from your profile), and no other account, no `Users` and no `Everyone` |
| Paths | The worktree path and Documents found's PRD folder show normally; the resume command's `cd` works |
| Keep-awake | With the PC plugged in, note Settings → System → Power → "When plugged in, put my device to sleep after", then set sleep to 1 minute: `powercfg /change standby-timeout-ac 1`. While a session works, `powercfg /requests` in an **administrator** PowerShell lists a SYSTEM request from `powershell.exe`, and the PC stays awake past a minute. At Needs you, and after Ctrl+C, the request is gone. Put the setting back as it was |
| Sleep readings | The sleep check at step 6, which Kiln detects from the System log's Kernel-Power events. First run `powercfg /a`: a PC whose sleep is "Standby (S0 Low Power Idle)" (Modern Standby) may not log those events the same way, so record which kind the PC has |

**The screens on Windows** (AC-INSTALL-03): with Chrome installed, from the Kiln clone, `$env:KILN_SCREENSHOTS="$HOME\kiln-screens"; npm run build; npx vitest run --config vitest.integration.config.mts src/server/view-in-browser.integration.test.ts` writes each screen beside its mockup; check they match. (A mockup's headings fall back to a system serif in its screenshot, because headless Chrome doesn't fetch Google Fonts; the view's bundled fonts are the right ones.)

## D. Proof gate 1 on Windows

Gate 1 as it ran on macOS ([results](kiln-proof-gates-1-and-2-results.md)), with the same script, from the Kiln clone in PowerShell. Make a throwaway repository first: `mkdir $HOME\gate1; cd $HOME\gate1; git init`. Then, in the Kiln clone, `$id = [guid]::NewGuid().ToString()`.

1. **Session and interrupt:** `node scripts\exploration\proof-gate-session.mjs --cwd $HOME\gate1 --out win-interrupt.jsonl --session-id $id --model sonnet --effort low --interrupt-on Bash --prompt "Run 'sleep 60' with Bash in the foreground and wait for it, then say done."` Expect the printed summary to have `init` with your session ID, `interruptSentAt`, and exit code 1, and the `.jsonl` to end with "[Request interrupted by user for tool use]".
2. **Headless resume:** `node scripts\exploration\proof-gate-session.mjs --cwd $HOME\gate1 --out win-resume.jsonl --resume $id --model sonnet --effort low --prompt "What command did I ask you to run?"` Expect the answer to name `sleep 60`, and the same session ID.
3. **Resume in a terminal:** `cd $HOME\gate1; claude --resume $id` shows both earlier turns. `/exit`.
4. **Sleep, mid-Bash:** with a new `$id`, start step 1's command without `--interrupt-on Bash`, with `sleep 300` and `--out win-sleep-mid-bash.jsonl`; about 15 seconds in, sleep the PC (Start → Power → Sleep) for at least two minutes, then wake it. Then `Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=42,107} -MaxEvents 4 | Format-List TimeCreated, Id, Message` and save the output.
5. **Sleep, mid-response:** the same with a new `$id`, `--out win-sleep-mid-response.jsonl` and `--prompt "Write a 2,000-word essay on kilns."`, sleeping while text streams.

Copy every `.jsonl`, `.jsonl.meta.json` and `.jsonl.stderr`, and the two Kernel-Power readings, into `test/fixtures/proof-gate-1/windows/` and commit them. What to look for in the sleep recordings: API-retry system events after waking, a `<synthetic>` assistant message when retries ran out, a real assistant event before any later exit, and the exit code.

## E. Keep-awake on Linux desktops

On Ubuntu with GNOME, and on a KDE desktop, each with Kiln installed and any PRD started (the proof feature is fine):

1. Settings → Power: automatic suspend on, at its shortest timeout.
2. While a session works, check the hold: on GNOME `gnome-session-inhibit --list` shows Kiln's; on KDE `systemd-inhibit --list` shows `Kiln` with `sleep` and `block`. Leave the computer idle past the timeout: it stays awake.
3. On GNOME, the screen still blanks and locks, and Suspend from the system menu still suspends.
4. Closing the lid suspends on both.
5. On KDE, `systemctl --version` gives systemd's version. If it is 257 or newer, record whether Sleep from the menu is refused while a session works (PLAT-001; the screens keep "Stops idle sleep only" either way).
6. At Needs you, or after Ctrl+C, the hold is gone from the list.
