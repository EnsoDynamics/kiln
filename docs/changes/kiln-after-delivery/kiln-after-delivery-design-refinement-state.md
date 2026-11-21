# Design Refinement State — Kiln After Delivery

Started: 2026-11-21   Current pass: 3   Status: In progress
Branch: feature/kiln-merge-with-agent (worktree .worktrees/kiln-merge-with-agent/kiln; commit, never push)
Existing code posture: Preserve, except the finished-run comparisons the design removes (source: TD §Existing Code)
Code baseline: this branch forked from develop at c41c7af; Kiln Pause Now (PR #20, merged) is on origin/develop only — read it with `git show origin/develop:<path>` / `git grep <pattern> origin/develop`
PRD words: at start 3871 · growth baseline 3871
Last updated: 2026-11-21 (pass 2 checkpoint)

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md |
| Technical Design | docs/changes/kiln-after-delivery/kiln-after-delivery-technical-design.md |
| Assumptions | docs/changes/kiln-after-delivery/kiln-after-delivery-assumptions.md |
| Supporting | docs/changes/kiln-after-delivery/mockups/kiln-after-delivery.html (wording reference; design canvas out of scope) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 16 (13 discovery + 2 conflict + Q1) | 12 | 11 | 0 | 5 (Q5 + untaken Q3, Q12–Q14) | 0 | 0 |
| 2 | 6 (+3 conformance carried as Q17–Q19) | 12 | 11 | 0 | 2 (Q21 at 88%; untaken Q25) | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | No main checkout: can AC-BACK-03's remote-base read work when `mainCheckoutPath` is missing, or does the check fail naming the missing checkout, and does that meet the criterion? (TD Open Questions) | Technical | HIGH | 50 → 92 | Resolved | PRD AC-BACK-03; TD §Plan Check step 2, §Design Decisions, §Delivery Reading; mockup state 5 |
| Q2 | 1 | Conflict: phases added and closed by hand outside Kiln — AC-BACK-01 counts a Closed line as done, while Continue Added Phases AC-CONTINUE-01/AC-FIND-03 accept them only through completion checks and show them separately. Intended? | Technical (settled by existing criteria) | MEDIUM | ? → 92 | Resolved | TD §The Plan Check (result table note) |
| Q3 | 1 | Conflict: AC-PRS-04's statement of what Kiln may do (as AC-MERGE-08 amends it) still says Kiln touches no other branch, while Continue may now push the plan to the base branch; is the Continue panel line enough? | Technical (PRD precision; settled by AC-BACK-05 amending AC-PRS-04) | LOW | ? → 90 | Resolved | PRD AC-MERGE-08; TD §The Merge Session, §Verification; mockup state 8 |
| Q4 | 1 | Merge session resumable after conflict stop / Ctrl+C? Clean-worktree rule at Resume and restart would refuse forever (D1) | Technical | HIGH | 70 → 92 | Resolved | TD Gates table, §Merge Session, §Push Session, §Data Models, §Verification; PRD AC-MERGE-06 (Q5 fix) |
| Q5 | 1 | Push session Done reading (same scope digest) unreachable if a reply changes a phase document? (D2) | Technical | HIGH | 75 → 92 | Resolved | TD §Continue and the Push Session, After-Delivery table, §Verification |
| Q6 | 1 | What exactly is 'the run's completion record' that marks a phase finished — union of baseline completions and this execution's done/waived leaves? (D3) | Technical | HIGH | 80 → 92 | Resolved | TD §Design Decisions, §Plan Check step 3, §Verification |
| Q7 | 1 | Pull request closed while merge activity open: does closed close the activity and return to the closed card; reopen offers Resume? vs TD 'once per delivery' and AC-MERGE-07 (D4) | Technical (was Business) | MEDIUM | 60 → 93 | Resolved | TD §Merge Session, §After-Delivery Activities, §Verification; PRD AC-MERGE-03, AC-MERGE-07 |
| Q8 | 1 | Exit Kiln while a plan check or command is in progress: TD forbids, PRD says whenever no session runs (D5) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Exit Kiln, §Interfaces, §Display Contract, §Verification; PRD AC-EXIT-01 |
| Q9 | 1 | Page open/reload after merge: full plan check every time, or GitHub reading only? (D6) | Technical | MEDIUM | 70 → 95 | Resolved | TD §The Delivery Reading, §Verification |
| Q10 | 1 | Continue one press when offer needs early-merge target grant bound to scopeDigest that the push changes (D7) | Technical | MEDIUM | 70 → 95 | Resolved | TD §Continue and the Push Session, §Data Models, §Verification; PRD AC-BACK-05 |
| Q11 | 1 | Merge session's workspace: only worktrees of PRs still to merge (Codex realpath failure on removed worktrees) (D8) | Technical | MEDIUM | 80 → 92 | Resolved | TD §After-Delivery Activities, §Verification |
| Q12 | 1 | Which session message is saved as the closing summary (D9) | Technical | LOW | 80 → 93 | Resolved | TD §The Delivery Reading, §After-Delivery Activities, §Merge Session, §Verification |
| Q13 | 1 | Which uncommitted files the page names: plan-read file set vs 'files in the PRD's folder' (D10) | Technical | LOW | 80 → 90 | Resolved | TD §The Plan Check step 2, §Continue and the Push Session, §Verification |
| Q14 | 1 | Proposal's sharedDigest and shared_documents observation removed; proposal binds source kind and revision (D11) | Technical | LOW | 85 → 95 | Resolved | TD §Existing Code, §Plan Check step 2, §Data Models |
| Q15 | 1 | More audit-name surfaces: PausedHold.svelte:50, PausePanel.svelte:23, projection.ts:284 (develop), underway-output.ts:70, waiver-facts.ts:118 (D12) | Technical | LOW | 90 → 95 | Resolved | TD §Closing-Audit Names, §Verification |
| Q16 | 1 | Card's conflicting mark only on mergeable false/DIRTY; UNKNOWN shows nothing, no re-read (D13) | Technical | LOW | 90 → 95 | Resolved | TD §The Delivery Reading, §Verification |

| Q17 | 1 | PLAN-001 reopened under Gate 3: AC-BACK-01 ("never … mentions the change") already carries the revised answer; Gate 3 says PRD keeps the stakeholder's ruling (one line per edited finished phase) until revised — revert AC-BACK-01 wording while the design builds the simpler version? (conformance) | Business/standards | MEDIUM | ? → 90 | Resolved | PRD AC-BACK-01; TD §Design Decisions, §Verification, §Open Questions; assumptions PLAN-001; mockup state 5 |
| Q18 | 1 | Card/stop wording once a merge activity exists and a PR is closed: AC-MERGE-07's "reopening it on GitHub brings the merge back" vs Resume (conformance) | Technical | LOW | ? → 90 | Resolved | PRD AC-MERGE-07; TD §Display Contract, §Verification; mockup state 4 |
| Q19 | 1 | AC-BACK-03 "Not found" parenthetical "(moved or removed while Kiln was open)" narrower than design? (conformance) | Technical | LOW | ? → 95 | Dropped | — |
| Q20 | 2 | Completion record: judge finished execution's phase keys against the execution's recorded plan, not today's plan (else finished 3 that gained 3a marks 3a finished) (E1) | Technical | HIGH | 88 → 97 | Resolved | TD §The Plan Check step 3, §Verification |
| Q21 | 2 | After Ctrl+C, kiln run resumes an open merge/push activity via restart review: what does the page show (finished page Interrupted row + Resume vs Paused overview), Exit placement (E2) | Technical | MEDIUM | 60 → 88 | Deferred | — |
| Q22 | 2 | Readiness "merged PR head contains the phase commit" needs the PR head locally (Update branch + squash, fresh clone) — use GitHub compare API or fetch refs/pull/N/head (E3) | Technical | MEDIUM | 75 → 90 | Resolved | TD §The Delivery Reading, §The Plan Check step 4, §Verification |
| Q23 | 2 | Merge press "head at or ahead of PR head" when PR head not local (after Update branch): fetch first, then compare; behind refused (E4) | Technical | MEDIUM | 75 → 90 | Resolved | TD Gates table, §Merge Session, §Delivery Reading, §Verification |
| Q24 | 2 | Resume / Send and resume at a merge stop when the fresh GitHub reading fails: resume on last saved reading, note in prompt (E5) | Technical | LOW | 70 → 90 | Resolved | TD §After-Delivery Activities, §Delivery Reading, §Push Session Done, §Verification |
| Q25 | 2 | Fresh execution carrying a finished phase whose Closed line was removed: separate carried-finished set shown as done, never waived (E6) | Technical | LOW | 80 → 80 | Deferred | — |
| Q26 | 2 | PRD AC-MERGE-06/AC-BACK-05 say push Done "starts the build unless AC-OFFER-03 calls for a fresh choice"; design also allows a blocked offer or No new phases found (e.g. local base reset) — PRD precision (conformance) | Technical | LOW | ? → ? | Pending | — |
| Q27 | 2 | Mockup state 8 says a one-repository run states nothing about merging in settings; §Verification tests the settings statement "in one repository and several" — reconcile (conformance) | Technical | LOW | ? → ? | Pending | — |
## Question notes

### Q21
Proposed answer (88%, deferred to pass 3): keep the restart review's mechanics (Kiln v1 AC-CLI-01; in-memory hold set by every kiln run; start/`kiln continue` release it, engine.ts 1686-1700, local-server.ts 490; resume() refused during review, engine.ts 2394; --resume skips) but render on the finished page, never the Paused overview (open activity turns currentlyComplete off → snapshot.ts ~529 state paused → Paused screen with no card and no Exit, breaking AC-EXIT-01; Pause Now added a separate PausedHold rather than reuse). Draft §After-Delivery Activities replacing "Ctrl+C and restart": "Ctrl+C interrupts the session as it does any other. The next `kiln run` takes the reading first and closes the activity when the work is done. Otherwise it holds the same session at the restart review (Kiln v1 AC-CLI-01): nothing launches, resumes or waits until Resume. The page stays the finished page, never the Paused overview. The activity's row reads **Interrupted**, and the pull request card shows **Resume** where it shows the running session. Resume, and `kiln continue` while the review shows, release the review: they take the reading again and then resume the session or restart its usage wait. `kiln run <path> --resume` skips the review. None of these marks a preflight while an after-delivery activity is open. An open activity is handled before anything else `kiln run` does for a finished run, including the early-merge delivery evaluation." Display Contract header row: "| The merge (push) session is running, waiting for usage, or interrupted and held for Resume | **Merging** (**Pushing the plan**); when interrupted, the fact reads "Interrupted · Resume to carry on" |". Screens append: "At the restart review the finished page shows the activity's row as Interrupted, the card's Resume, and Exit Kiln enabled in the Kiln panel. No other screen is added." Interfaces: merge.state/planPush.state gain `interrupted`; kiln status prints "merging, interrupted", lists `continue`. Exit availability adds "an after-delivery activity held at the restart review". Verification: Ctrl+C mid-merge then kiln run → finished page Interrupted + Resume, header Merging, Exit enabled; Resume or kiln continue resumes same session, no preflight on a run that has none (markResumePreflight engine.ts 4589; snapshot.ts 1505); merge done on GitHub closes at kiln run without review. PRD: AC-WAIT-02 "unless a merge session is running or has stopped" → "unless a merge session is under way (running, waiting for usage or interrupted) or has stopped"; optional AC-MERGE-05 sentence. Side note: routing rule — a finished run shows the finished page in every state except a stop (usage wait included). Conformance pass 2 adds: AC-WAIT-02 must cover the usage wait (header Merging). Remaining doubt: whether the routing rule (finished page during a usage wait) matches the design's existing wait handling and the Waiting screen.










### Q19
Dropped: Q1 evidence shows `kiln run` resolves the checkout from the path it is given and refuses a missing one before reading any record (src/prd-location.ts:47-92; state dir keyed by checkout path), so the checkout can only be missing while Kiln is open; the parenthetical is accurate.











## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-21 · 35 earlier criteria changed (21 already had Replaces lines) · 11 Replaces lines to write (+1 optional: AC-TEST-03) · 4 parentheticals to correct · 2 raised as questions (Q2, Q3). Folded: 14 Replaces lines added (12 items, incl. optional AC-TEST-03), 4 corrected; TD §Changes to Earlier Designs +2 lines.
Changed after pass 1: AC-BACK-03 (Q1 narrowing), AC-MERGE-06 (Q5 PRD fix), AC-MERGE-03, AC-MERGE-07 (Q7), AC-EXIT-01 (Q8), AC-BACK-05 (Q10), AC-BACK-01 (Q17), AC-MERGE-08 (Q3), AC-MERGE-07 (Q18)

## Register re-sort
Pass 1: 2026-11-21 · 4 open entries · 0 moved to design · 0 written up · 1 settled by lookup (AUDIT-001 → Validated, Answered) · 0 moved to technical · 0 raised as questions · 3 stay business (SCOPE-001, MERGE-001 above; PLAN-001 moved above the line — departs from the accepted one-line notice). Folded: AUDIT-001 move; MERGE-001 three fixes (drop duplicated push-session sentences, restore Pause Now AC-PAUSE-02 watch-only precedent, 'otherwise' line = Claude Code merge sessions only); PLAN-001 to above the line + design Open Questions line; header link names PLAN-001.

## Noticed, out of scope
- Legacy records without a retained baseline still go through completedBaseline (completed-plan-discovery.ts:63-81), failing when a finished phase's document changed before the run ended (legacy only, as today)
- Build note: the page-load check request lives in CompletedPlanCheck.svelte onMount; AC-WAIT-02 hides that panel while waiting, so the mount request must move to the finished page
- Build note: status token fingerprint includes control reasons (engine.ts:665); keep per-reading failure text/times out of the merge control's reason, as Pause Now did
- Mockup state 7 says Ctrl+C "does the same" as Exit Kiln, but AC-EXIT-02's last line and exit code apply only to Exit (wording nit)
- A pending grant saved without `proposalId` falls back to the previous check result's proposal (engine.ts:3551 develop); the migration drops saved check results, so such a grant would fail unless an approval receipt exists (likely rare: reserveAuthority always sets proposalId)
- Before the build, this branch must merge origin/develop (Pause Now changed engine.ts, projection.ts, the Paused page)
- A repository's delete-head-branches-on-merge setting removes the branch whatever the session does
- A main checkout with new phases but behind on the delivery may read a plan lacking the run's phase documents; readiness may block until the push (rare)
- Same new phase id locally and remotely with different text: remote wins unless another phase exists only locally
- Pull request card facts (commit counts) go stale after the merge session pushes

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 2 complete and committed. Pass 3: discovery; backlog first: Q21 (deferred, notes), Q25, Q26, Q27.
