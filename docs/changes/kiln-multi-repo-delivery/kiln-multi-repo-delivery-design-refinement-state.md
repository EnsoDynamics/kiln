# Design Refinement State — Kiln multi-repo delivery

Started: 2026-10-22   Current pass: 2   Status: In progress
Branch: develop
Existing code posture: Preserve (source: TD, Existing Code)
PRD words: at start 4651 · growth baseline 4651
Last updated: 2026-10-22

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md |
| Technical Design | docs/changes/kiln-multi-repo-delivery/technical-design.md |
| Assumptions | docs/changes/kiln-multi-repo-delivery/assumptions.md |
| Supporting | docs/changes/kiln-multi-repo-delivery/mockups/ (4 screens, HTML is the spec); docs/prds/kiln-v1/technical-design.md (changed by this design); docs/changes/kiln-usage-limit-recovery/ (seam; no design yet) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 12 (+1 conflict, +1 code corrections; +1 from Q5, +3 from conformance) | 14 | 12 | 1 | 1 (+Q15) | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | If usage-limit recovery is built first, do the screens AC-SHOW-01 governs keep its additions? (conflict check) | Business | LOW | 97 → 97 | Resolved | PRD AC-SHOW-01 (table row + Replaces in part on usage-limit AC-RESUME-01) |
| Q2 | 1 | Session ran (events show it) but no transcript found: does Stayed in the workspace pass or fail? | Business | HIGH | 60 → 88 | Assumption | OUT-003; PRD AC-OUTSIDE-01/03; TD §What is read |
| Q3 | 1 | Interrupted + failed Stayed → Needs you; after tick + Check again finds phase unfinished, resume or stay stopped? | Technical (implied by v1 AC-STOP-01/07) | MEDIUM | 70 → 97 | Resolved | TD §After an interruption |
| Q4 | 1 | Start after partial failure: which repository list and which checks apply (createdBranch deleted by complete())? | Technical | MEDIUM | 70 → 88 | Deferred | — |
| Q5 | 1 | Windows: placing Bash paths (/c/..., ~, forward slashes) against Windows-form file_path and cwd | Technical | MEDIUM | 70 → 92 | Resolved | TD §What is read (On Windows); Testing |
| Q15 | 1 | Windows: PowerShell tool is on by default for claude.ai accounts and its calls aren't read; start sessions with CLAUDE_CODE_USE_POWERSHELL_TOOL=0 and fail on any PowerShell call found? (surfaced by Q5) | Technical | MEDIUM | 85 → 85 | Deferred | — |
| Q16 | 1 | Pull-request session changed a checkout whose repository isn't in the workspace: what does the outside-workspace prompt ask it to do, now it can't add the repository? (conformance) | Technical | MEDIUM | — | Pending | — |
| Q17 | 1 | Only failure is a missing transcript: what do Needs you's copyable prompt and resume command say (claude --resume needs the missing transcript)? (conformance) | Technical | MEDIUM | — | Pending | — |
| Q18 | 1 | Data Models settings has bases but no baseBranch; HTTP API's baseBranch "still sets the PRD's repository's base" — stored as bases.<PRD repo name>? (conformance) | Technical | LOW | — | Pending | — |
| Q6 | 1 | Nested checkout inside a workspace worktree (submodule, .claude/worktrees/): inside or outside? | Technical | MEDIUM | 75 → 95 | Resolved | TD §Where it happened; §Subagent worktrees |
| Q7 | 1 | Add obvious read-only git subcommands missing from the read-only list (check-ignore, config <key>, …)? | Technical | MEDIUM | 75 → 95 | Resolved | TD §What counts |
| Q8 | 1 | Can a repository be added during the pull-request session? | Technical (implied by AC-ADD-01) | LOW | 60 → 95 | Resolved | TD §In the engine, §The prompt; PRD AC-ADD-01, AC-OUTSIDE-02 | — |
| Q9 | 1 | addedInPhase: launched leaf or judged leaf at addition time? | Technical | LOW | 75 → 90 | Resolved | TD §In the engine, §Named after Start |
| Q10 | 1 | Running phase's live commit list: per repository? | Technical | LOW | 75 → 92 | Resolved | TD §Snapshot, §Screens |
| Q11 | 1 | Does ticking the confirmation run the check, or tick then Check again (mockup step 3 wording)? | Technical (implied) | LOW | 80 → 97 | Resolved | Needs you mockup step 3 (HTML + PNG) |
| Q12 | 1 | Repository names matched to folder names case-sensitively? | Technical | LOW | 80 → 95 | Resolved | TD §Found beside, §Named in the phase documents |
| Q13 | 1 | Bash reader: pushd, GIT_DIR=/GIT_WORK_TREE= prefixes, /usr/bin/git, command git, env git | Technical | LOW | 85 → 90 | Resolved | TD §What is read (Bash calls) |
| Q14 | 1 | Code-answered TD corrections: NotebookEdit notebook_path; CLI Origin http://127.0.0.1:<port>; added repo's base needs v1's objects-only fetch | Technical | LOW | 95 → 98 | Resolved | TD §What is read; §The command step 3; §In the engine check 4 |

## Question notes

### Q2
Proposed answer (Business 88% → OUT-003): never reached init → passes; reached init but no projects/*/<session ID>.jsonl → fails with fact "No transcript found for session <ID> in <config folder>/projects, so Kiln can't tell what it did outside the workspace"; a tick after that session's last run ended clears it. Evidence: Claude Code 2.1.307 writes no transcript with CLAUDE_CODE_SKIP_PROMPT_HISTORY set (scratch run: init, success, no .jsonl); Kiln passes whole env (engine.ts:837, claude-session.ts:182); cleanupPeriodDays (30 default) deletes old transcripts.

### Q8
Answer (95%): refuse during the pull-request session and at its Needs you with 409 and the reason. TD §In the engine line ~166: "It is allowed while a phase is in progress or stopped at Needs you; during the pull-request session, or at its Needs you, and otherwise, it is refused with 409 and the reason (...). The pull-request session changes no code, so a repository added then would have no commits and get no pull request (AC-PRS-01)." Delete the "added in the pull request" label sentence (~175). §The prompt (AC-OUTSIDE-02, ~267): for the pull-request session the add-it-first line is left out. PRD AC-ADD-01 optional clarification: "a phase, not the pull-request session, ...". Evidence: AC-ADD-01/03, v1 AC-PR-01/05, PR prompts, mockups draw only "added in phase 2b".

### Q9
Answer (90%): store the launched leaf, display the judged leaf. TD §In the engine, replacing "(the judged leaf, as v1's event lines)": "`phaseId` is the session's record key, the launched leaf. `addedInPhase` records it, and the repository's start commit goes under `phases.<phaseId>.repositories.<name>`; like the rest of `PrdRecord.phases`, both stay keyed by the launched leaf. Before it prints the added line, Kiln re-reads the plan; a read that fails changes nothing and doesn't refuse the addition. The line names the session's judged leaf, id and title from the latest read (v1 §Snapshot, "Which phase a split session is shown as"). Every "added in phase <n>" label and the settings summary map `addedInPhase` to its judged leaf through `PrdRecord.plan` the same way, so the label stays on the row that shows the session's Details. When the session splits after the addition, the label can differ from the line, as v1's "3 started" can be followed by "3a done"." §Named after Start: "the leaf about to launch is its own judged leaf." (Drop "or pr": Q8 refuses additions in the pull-request session.) Evidence: v1 TD :483-485, :390; plan-reading.ts:39-53; engine.ts:1225-1252, :734-737; snapshot.ts:204-208.

### Q10
Answer (92%): v1's current.commits and needsYou.commits (flat [{sha,subject}], one worktree; refreshStoppedCommits engine.ts:1097-1102 also feeds a stopped row's Details) both become per repository. TD §Snapshot block add:
  current: { …, repositories: [ { name, commits: [ { sha, subject } ] } ] }   (replaces commits)
  needsYou: { …, repositories?: [ { name, commits: [ { sha, subject } ] } ] } (replaces commits)
     (each: the PRD's repositories in list order, only those with commits in the phase, newest first; addedInPhase and worktree come from the top-level repositories[])
Prose after block: "While a phase works, Kiln reads its commits in every set-up repository in parallel, at most every 5 seconds. Each read runs v1's first-parent read on that repository's worktree, from the phase's startCommit for that repository to the feature branch. A repository added during the phase starts from the baseCommit recorded when it was added. A stopped phase is read the same way, when it stops and on each check, and its row's Details take each repository's count and latest commit from that read. A repository with no commits in the phase is left out, as Complete's Details leave it out. A one-repository PRD has one entry, and its screens are v1's."
§Screens add: "Phase detail's Commits list and the current-phase panel: grouped by repository, as Complete's Details draw it. Each repository's name gets its 'added in phase' label, and its sha subject lines sit under it. The panel's Commits row reads '<n> in <m> repositories'. With no commits anywhere, v1's 'None for this phase yet' line stays."
Evidence: mockup complete line 37 ("3 in 2 repositories"); engine.ts:892-898; PhaseDetail.svelte:85-89; CurrentPhase.svelte:29; v1 TD:450,457; snapshot.ts:88,118,385-396.

### Q12
Answer (95%): exact match against readdir(<parent folder>). TD §Found beside: Found row "Fails when" → "No entry in `readdir(<parent folder>)` is exactly `<name>`"; after the table: "Names are matched exactly, case included, on every platform. Found reads the parent folder's listing and doesn't ask the file system whether the path exists. On macOS and Windows that check ignores case, so `Storefront` would reach `storefront`, and git would then print `storefront`, failing A checkout with the wrong reason. A name that differs only in case fails Found ("isn't in <parent folder>/"). So each folder answers to one spelling, and no two entries share a checkout or a worktree folder. Two plan names that differ only in case need no rule of their own: on a case-insensitive disk at most one passes Found, and on Linux they can be two real folders. `kiln add-repository` runs the same check, so `Storefront` against a recorded `storefront` is refused with Found's words, not answered as already added. Paths are still compared with v1's `comparable()`." §Named in the phase documents, after "other than the PRD's repository's own name": "(compared exactly with its main checkout's real folder name)". Evidence: scratch on APFS (existsSync/statSync case-insensitive, readdirSync real case, git rev-parse prints real case); prd-location.ts:92,98 realpathSync.native basename; worktree-setup.ts:193.

### Q13
Answer (90%): replace TD Bash calls bullet (§What is read) with: Git command = first word `git` or a path ending in `/git`, after skipping v1's assignments and keywords plus `if`, `elif`, `while`, `until`, `!`, and any run of `command`, `env`, `exec`, `nohup`, `nice`, `sudo`, `time`, `timeout`, `xargs` with their options (words starting `-`), assignments, and whole numbers/durations; these additions are this reader's only, v1's commit/push detection unchanged. Directory: entry cwd, moved by earlier `cd`/`pushd` in the call, `popd` returns to before the matching pushd; leading ~/$HOME expanded; other non-literal or missing argument → followed no further, later Git commands placed in no checkout and pass; then `-C` in order. GIT_WORK_TREE, else GIT_DIR (assignment before git or after env, or earlier `export` not `unset`) places it at that path; --work-tree/--git-dir (either form) override; relative paths from the command's directory. Not read: script files, bash -c strings, find -exec, aliases/functions (as v1); wrapper options with non-number values (sudo -u bob, xargs -I {}, env -u NAME, env -C dir). A cd/pushd inside ( … ) or $( … ) stays in effect after it. Evidence: bash-command.ts:28,30,32-42,53-57,176-179; scratch test q13.ts.

### Q15
Proposed answer (85%): Kiln starts every session with CLAUDE_CODE_USE_POWERSHELL_TOOL=0 (as it already sets PATH for sessions), so the only shell is the Bash tool (Git Bash). A PowerShell tool call found in a transcript anyway is a change in no known checkout; fact `Ran PowerShell commands Kiln can't read`. Evidence: code.claude.com/docs/en/setup (PowerShell tool on by default for claude.ai/Console accounts on Windows); docs/en/tools-reference#powershell-tool ("primary shell", tool name PowerShell, input.command); session-output.ts:189 v1 reads only Bash. Unverified: whether a person's settings.json env setting the variable to 1 overrides the spawn env (if so, a product decision); whether "fail on any PowerShell call" is too blunt vs reading PowerShell git commands. AC-PROOF-01 Windows run must check PowerShell is off in sessions.

### Q4
Proposed answer (88%, TD §Setup at Start, append to "Some repository was set up" bullet): On the next Start the repositories are the entries with setupCompletedAt in recorded order, then the names the plan gives as Documents found now reads it (plan read from the checkout kiln run was given). An entry without setupCompletedAt the plan no longer names is dropped, createdBranch included; its branch stays, as v1 leaves an abandoned createdBranch. Bases from settings.bases by name; a set-up entry's base is its own fixed baseBranch. For an entry with setupCompletedAt the field checks skip the workspace folder's new-or-empty check, that worktree's path check, and the branch-free check (its worktree and branch are Kiln's by record; finish-the-setup rules handle a worktree removed in between; an existing worktree on the branch is left as is and keeps its setupCompletedAt — complete() must not overwrite it). The PRD's repository, once set up, keeps v1's PRD-differs check, run against its feature branch tip (as v1 runs it against createdBranch.commit), worded "<repo>'s worktree has different PRD documents from this checkout. Commit the change on <branch> in <worktree path> too, or undo it here; sessions start from that worktree." Unset-up repositories get every v1 check. A repository the PRD's worktree names but Documents found didn't is left to AC-ADD-04.
Evidence: worktree-setup.ts:243-248 (complete sets setupCompletedAt, deletes createdBranch), :254-263 undoFailedSetup, engine.ts:1179-1187, worktree-setup.ts:139 own-branch needs branch in no worktree, :101-103 PRD-differs at createdBranch.commit, :170-179 path checks, :225, :232; kiln-command.ts:178, :269; start-checks.ts:96-101. v1 never reaches this state (setupCompletedAt only with startedAt).
Checked: code read; not checked: whether the PRD-differs comparison at the branch tip vs the given checkout's HEAD is the right pair when the person ran kiln run from the main checkout on another branch; whether dropping an unset-up entry needs any record cleanup beyond removing it.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-10-22 · 37 earlier criteria changed (34 v1, 4 usage-limit recovery; 22 Replaces lines already correct) · 5 Replaces lines extended (SPACE-05, OUTSIDE-03, OUTSIDE-04 ×2, ADD-04) · 1 unintended raised (Q1: AC-SHOW-01 would undo usage-limit recovery's screen additions; Business 97% → PRD fix) · folded
Changed after pass 1: AC-OUTSIDE-01, AC-OUTSIDE-03, AC-ADD-01, AC-OUTSIDE-02 (twice)

## Noticed, out of scope
- v1's Commit and Push steps miss PowerShell calls on Windows today (v1 reads only Bash); the Q15 env var would fix that too.
- Kiln's start checks don't confirm Git Bash exists on Windows.
- Git aliases (git st) fail Stayed in the workspace as unknown subcommands; acceptable under the existing decision.
- Everything committed and Pushed don't check commits made inside a submodule; a submodule commit never pushed isn't caught.
- Creating a subagent worktree puts .claude/worktrees/ in the person's main checkout; the transcript records only the Agent call, so it isn't counted.
- v1's automatic resume also fails under CLAUDE_CODE_SKIP_PROMPT_HISTORY; Kiln could warn at Start or set CLAUDE_CODE_FORCE_SESSION_PERSISTENCE for its sessions.
- A fresh session the person starts by hand gets a new session ID, so Stayed in the workspace never reads its transcript.
- A user whose ~/.claude or org folder is itself a Git checkout would see Claude Code's memory writes fail Stayed in the workspace.
- The outside-workspace prompt says "ask Kiln to add it first" even for a checkout not beside the PRD's repository, where adding can't succeed.
- gh pr checkout and other non-Git tools can switch an outside checkout's branch and still pass, as the PRD intends.
- A file written in the workspace folder's root, outside every worktree, passes both checks and lands on no branch.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 1: discovery done (12 surfaced, 12 taken; Q14 = code-answered corrections). Pass 2: run discovery (carry Q4, Q15 deferred and Q16-Q18 pending first).
