# Design Refinement State — Kiln Missing Worktree Recovery

Started: 2026-11-06   Current pass: 3   Status: In progress
Branch: develop
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 3636 · growth baseline 3636
Last updated: 2026-11-06

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md |
| Technical Design | docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md |
| Assumptions | docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-assumptions.md |
| Supporting | docs/changes/kiln-missing-worktree-recovery/mockups/kiln-missing-worktree-recovery.html |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 15 | 12 | 11 | 0 | 3 | 0 | 1 |
| 2 | 10 (+2 conformance) | 12 | 12 | 0 | 3 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Claude resume after a moved folder uses recorded `workingDirectory` (old path); switch it at Start? | Technical | HIGH | 85 → 92 | Resolved | TD §Resuming a session in a new folder; §Start step 4 |
| Q2 | 1 | Suffixed existing-branch start must also save `settings.workspaceFolder` (`--add-dir`) | Technical | HIGH | 90 → 95 | Resolved | TD §Start step 4; §The Setup Panel draft |
| Q3 | 1 | Draft after a partly failed Start: resume intent's names, suffix search counts intent's own branch as its own | Technical | HIGH | 80 → 90 | Resolved | TD §The draft; §Start; §Data Models |
| Q4 | 1 | Which repositories a multi-repo base-branch start sets up (follow continuation's set?) | Technical | HIGH | 65 → 90 | Resolved | TD §The Setup Panel (Repositories for a base-branch start); §Start |
| Q15 | 1 | Multi-Repo "Stayed in the workspace" check after a session's folder moves (single-repo holds-something-else) | Technical | HIGH | 50 → 95 | Dropped | — |
| Q8 | 1 | Stale git record of the feature branch at another missing path: existing-branch start unavailable? | Technical | MEDIUM | 70 → 95 | Resolved | PRD AC-SETUP-02; TD §The Setup Panel, §The Facts |
| Q7 | 1 | Start while the old execution's session process still runs | Technical | MEDIUM | 75 → 92 | Resolved | PRD AC-SAFE-01; TD §Start, §The Folder Check, §Interfaces |
| Q9 | 1 | Offline status / bot control (`kiln status`, AC-SEE-02/05) still reports the saved stop; report folder_missing (merges conflict obs. C3) | Technical | MEDIUM | 60 → 90 | Resolved | PRD AC-GONE-01/02; TD §The Folder Check, §Changes, §Interfaces |
| Q12 | 1 | When a failed read blocks the whole panel vs withholds one choice | Technical | MEDIUM | 80 → 90 | Resolved | TD §The Facts, §Interfaces |
| Q6 | 1 | Base plan has nothing left to run: base-branch choice unavailable? | Technical (reclassified) | MEDIUM | 55 → 92 | Resolved | PRD AC-SETUP-02; TD §What will run |
| Q10 | 1 | Base-branch start runs `extractPreparation` for first leaf as a continuation does | Technical | MEDIUM | 65 → 90 | Resolved | TD §Start base-branch, Existing Code, Data Models |
| Q14 | 1 | Start releases a live-session takeover hold (LSC AC-TAKE-01) — conflict check C1 | Business | LOW | 85 → 95 | Resolved (written up) | PRD AC-SAFE-03; TD §What will run, Design Decisions |
| Q16 | 1 | Base preselected but unavailable (nothing to run) while existing branch available without new work: suggest existing branch? (conformance) | Technical | MEDIUM | 70 → 90 | Resolved | PRD AC-SETUP-02; TD §What can't be checked, §What will run, §Interfaces |
| Q17 | 1 | Panel shape when neither start is available (`startLabel`, `suggested`/`selected`): `{ blocked }` or optional preview? (conformance) | Technical | LOW | 70 → 90 | Resolved by decision (reuse `{ blocked }`) | — |
| Q18 | 2 | Base-branch suffix search can reuse a dead branch name and the saved folder (stale record) — count earlier executions' branches and recorded worktrees as taken | Technical | HIGH | 80 → 95 | Resolved | TD Design Decisions Suffix; §Start base step 1 |
| Q19 | 2 | Left-over session process from an earlier Kiln makes Start busy forever — stop it as the restart decision does? | Technical | MEDIUM | 60 → 90 | Resolved by decision | PRD AC-SAFE-01; TD §Start, §The Folder Check, §Architecture |
| Q20 | 2 | Failed existing-branch intent whose worktree is already back: finish its steps or supersede; stale intent never seeds a later draft | Technical | MEDIUM | 70 → 90 | Resolved by decision | TD §The Folder Check, §Start, §The draft, §Data Models | — |
| Q21 | 2 | Nothing identifies a base-branch-start execution (startup delivery check engine.ts:2158, journalScope) — `folderSetupStartId`? | Technical | MEDIUM | 75 → 90 | Resolved | TD §Data Models, §Start |
| Q22 | 2 | Carried pause request turns "Set up & start Phase N" into a pause; Start ends an active pause? | Technical (reclassified) | MEDIUM | 65 → 90 | Resolved by decision | PRD AC-SAFE-03; TD §Start, Data Models | — |
| Q23 | 2 | Editing the single-repo Worktree field away from the saved path moves the session folder — counts as moved | Technical | MEDIUM | 80 → 92 | Resolved | TD §Resuming, §Start, §The draft | — |
| Q24 | 2 | After Check again passes, what runs (startup work then restart review)? | Technical | MEDIUM | 85 → 90 | Resolved | TD §The Folder Check | — |
| Q25 | 2 | Completion receipt shape for base-closed leaves (`kind:"external"`, engine.ts:5559) | Technical | LOW | 80 → 80 | Deferred | — |
| Q26 | 2 | Folder missing detected mid-run: emit terminal block once via event stream | Technical | LOW | 80 → 80 | Deferred | — |
| Q27 | 2 | Codex run whose folder moves: preview says it will stop at Needs you | Technical | LOW | 75 → 75 | Deferred | — |
| Q28 | 2 | Start route lists no result for refusing to supersede a failed intent whose artifacts were changed, or for an intent `in_progress` (`busy`?) (conformance) | Technical | LOW | 75 → 75 | Pending | — |
| Q5 | 1 | Squash-merged branch looks like "work not in base"; keep ancestry test | Technical (reclassified) | MEDIUM | 65 → 90 | Resolved | PRD AC-FACTS-01; TD §The Facts |
| Q11 | 1 | Saved plan read date for older records when `planReconciliation.check` is failed | Technical | LOW | 75 → 92 | Resolved | TD §Data Models |
| Q13 | 1 | History wording for an archived unfinished execution ("Ended … · set up again") | Business | LOW | 85 → 95 | Resolved (written up) | — |

## Question notes

Discovery evidence (pass 1), for investigators:
- Q1: engine.ts:3531-3532, 5306-5307 (`workingDirectoryOf`, `multi = cwd !== this.worktreePath`); session/codex-session.ts:68.
- Q2: engine.ts:1179-1181, 5316-5319; state/records.ts:506.
- Q3: TD §The draft, §Data Models start intent.
- Q4: continuation-readiness.ts:51-68.
- Q5: development-delivery.ts:798; completed-plan-accounting.ts:149. Proposed: keep ancestry; behind-base caution warns.
- Q7: engine.ts:2546; proposed 409 busy while a session process runs.
- Q8: git 2.50.1 refuses add: "'feat' is already used by worktree at …".
- Q9: control/projection.ts:238; Bot Control AC-SEE-02/05.
- Q10: continuation-readiness.ts:70; engine.ts:2544.
- Q11: engine.ts:5582, 5591. Proposed: no read date shown ("read date not recorded").
- Q13: ExecutionHistory.svelte:47.
- Q14: LSC AC-TAKE-01, AC-MSG-05.
- Q15: Multi-Repo AC-OUTSIDE-01/04; TD §Resuming a session in a new folder claims the Stayed check never sees a moved folder.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-06 · 19 earlier criteria changed · 7 Replaces lines already correct, 2 fixed, 8 added (folded) · 1 raised as a question (C1: Start releases a live-session takeover hold, LSC AC-TAKE-01) · 2 design observations raised as questions (C2 Stayed check after a moved folder, C3 kiln status / Bot Control AC-SEE-02/05)
Changed after pass 1: AC-SETUP-01 (billing wording), AC-SETUP-02 (Q8), AC-SAFE-01 (Q7), AC-GONE-01 (Q9), AC-GONE-02 (Q9), AC-SAFE-03 (Q14), AC-SETUP-02 (Q6, Q16), AC-FACTS-01 (Q5), AC-SAFE-01 (Q19), AC-SAFE-03 (Q22), AC-SETUP-01, AC-SETUP-05 (pass-2 conformance)

## Register re-sort
Pass 1: 2026-11-06 · 2 open entries · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as Technical questions · 2 stay business (WTR-003 restated in plain words and cited as a departure from Kiln v1 AC-GIT-01 / Multi-Repo AC-ADD-02; folded)

## Noticed, out of scope
- Single-repository Claude sessions always get the workspace folder as `--add-dir` (engine.ts:5318); predates this feature.
- A base-branch start discards the old execution's in-flight development-delivery operations (`emptyDevelopmentLedger`); not covered by the PRD, rare.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 2 conformance, then checkpoint commit, then pass 3 discovery (Q25-27 deferred first).
