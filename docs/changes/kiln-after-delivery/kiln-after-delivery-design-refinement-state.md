# Design Refinement State — Kiln After Delivery

Started: 2026-11-21   Current pass: 5 (Phase 7)   Status: In progress
Branch: feature/kiln-merge-with-agent (worktree .worktrees/kiln-merge-with-agent/kiln; commit, never push)
Existing code posture: Preserve, except the finished-run comparisons the design removes (source: TD §Existing Code)
Code baseline: this branch forked from develop at c41c7af; Kiln Pause Now (PR #20, merged) is on origin/develop only — read it with `git show origin/develop:<path>` / `git grep <pattern> origin/develop`
PRD words: at start 3871 · growth baseline 3871
Last updated: 2026-11-21 (pass 5 checkpoint)

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
| 3 | 4 (3 discovery + Q31 sibling; +2 conformance carried as Q26–Q27) | 9 (Q21, Q25–Q31) | 9 | 0 | 0 | 0 | 0 |
| 4 | 2 (+1 conformance carried as Q32) | 3 (Q32–Q34) | 3 | 0 | 0 | 0 | 0 |
| 5 (from final verification + conflict re-check) | 4 | 4 (Q35–Q38) | 4 | 0 | 0 | 0 | 0 |

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
| Q21 | 2 | After Ctrl+C, kiln run resumes an open merge/push activity via restart review: what does the page show (finished page Interrupted row + Resume vs Paused overview), Exit placement (E2) | Technical | MEDIUM | 60 → 92 | Resolved | TD §After-Delivery Activities, §Display Contract, §Interfaces, §Exit Kiln, §Changes to Earlier Designs, §Verification; PRD AC-WAIT-02, AC-MERGE-05, AC-MERGE-07, AC-EXIT-01 |
| Q22 | 2 | Readiness "merged PR head contains the phase commit" needs the PR head locally (Update branch + squash, fresh clone) — use GitHub compare API or fetch refs/pull/N/head (E3) | Technical | MEDIUM | 75 → 90 | Resolved | TD §The Delivery Reading, §The Plan Check step 4, §Verification |
| Q23 | 2 | Merge press "head at or ahead of PR head" when PR head not local (after Update branch): fetch first, then compare; behind refused (E4) | Technical | MEDIUM | 75 → 90 | Resolved | TD Gates table, §Merge Session, §Delivery Reading, §Verification |
| Q24 | 2 | Resume / Send and resume at a merge stop when the fresh GitHub reading fails: resume on last saved reading, note in prompt (E5) | Technical | LOW | 70 → 90 | Resolved | TD §After-Delivery Activities, §Delivery Reading, §Push Session Done, §Verification |
| Q25 | 2 | Fresh execution carrying a finished phase whose Closed line was removed: separate carried-finished set shown as done, never waived (E6) | Technical | MEDIUM (was LOW: phase would be rebuilt) | 80 → 92 | Resolved | TD §The Plan Check step 3, §Data Models, §Verification |
| Q26 | 2 | PRD AC-MERGE-06/AC-BACK-05 say push Done "starts the build unless AC-OFFER-03 calls for a fresh choice"; design also allows a blocked offer or No new phases found (e.g. local base reset) — PRD precision (conformance) | Technical | LOW | ? → 90 | Resolved | PRD AC-BACK-05, AC-MERGE-06; TD Push Session Done, §Verification |
| Q27 | 2 | Mockup state 8 says a one-repository run states nothing about merging in settings; §Verification tests the settings statement "in one repository and several" — reconcile (conformance) | Technical | LOW | ? → 95 | Resolved | TD §The Merge Session, §Verification |
| Q28 | 3 | Push activity keyed `plan-push` with one record slot, but several pushes can occur (carried into execution 2; second press after a hand push) — per-operation key, which push activation moves, closed push rows (F1) | Technical | HIGH | 70 → 90 | Resolved | TD §After-Delivery Activities, §Push Session, §Data Models, §Interfaces, §Verification |
| Q29 | 3 | Ctrl+C or Exit between push Done and the automatic acceptance: next kiln run finishes the acceptance, or a second press? Exit availability in that window (F2) | Technical | MEDIUM | 70 → 90 | Resolved | TD §After-Delivery Activities, §Push Session, §Exit Kiln, §Interfaces, §Display Contract, §Data Models, §Verification |
| Q30 | 3 | Plan Check step 4 claims "a branch updated on GitHub before merging" keeps Continue available; Update with rebase then hand merge does not (rebased head lacks phase revisions) — narrow claim and wording (F3) | Technical | MEDIUM | 75 → 90 | Resolved | TD §The Plan Check step 4, §Verification |
| Q31 | 3 | Early-merge evaluator on a finished run counts a repository delivered only when "the merged head contains the feature head the run recorded" — after Update with rebase + hand merge this lands on Needs you; same treatment as Q30 (a review PR reading `merged` counts)? (Q30 sibling) | Technical | MEDIUM | 80 → 90 | Resolved | TD §The Merge Session, §The Delivery Reading, §Verification |
| Q32 | 3 | Waiting header for a merge/push usage wait and the interrupted row's "Interrupted · Resume to carry on" exist only in the design; mockup (the wording reference) has no state for them — add dashed notes to the mockup or state the wording in the Display Contract (conformance) | Technical | LOW | 95 → 95 | Resolved | mockup state 2 dashed notes |
| Q33 | 4 | Carried-finished set: derived from the current baseline would include this execution's own finished phases (each plan read rebuilds completions), skipping their delivery checks and hiding a mid-run reopen — restrict to completions with no waiverId and no phase facts in this execution (G1) | Technical | HIGH | 80 → 90 | Resolved | TD §The Plan Check step 3, §Data Models, §Verification |
| Q34 | 4 | `followsPush` dropped by "a later check", but accept and grant run their own checks — carry it forward; only a person-asked check drops it (G2) | Technical | MEDIUM | 75 → 90 | Resolved | TD §Data Models, §Interfaces, §Verification |
| Q35 | 5 | Push session's billing read, agent readiness and Codex launch check use the run's session folder (engine.ts:1475, 6178, 6295 develop) — often removed after merge, and lacks the main checkout's gitignored .claude/settings.local.json; use the main checkout while a push activity is open (final verification H1) | Technical | HIGH | 90 → 90 | Resolved | TD §After-Delivery Activities, §Verification |
| Q36 | 5 | A delivery reading taken while the merge session is still running (page reload) could close the activity — only settle at session end / stop actions / restart / resume after wait; running readings update card only (final verification H2) | Technical | MEDIUM | 85 → 90 | Resolved | TD §After-Delivery Activities, §The Delivery Reading, §Verification |
| Q37 | 5 | Conflict: AC-TOTAL-02/03 (Kiln PRD Time Totals) list counted sessions (not merge/push) and fix totals once Complete — does a merge/push session's running time (and waiting) count in the PRD total, or does the total stay fixed? (conflict re-check) | Technical (settled by AC-TOTAL-02/03 + ruling TOTAL-001) | MEDIUM | ? → 95 | Resolved | TD §After-Delivery Activities, §Data Models, §Changes to Earlier Designs, §Verification; PRD AC-MERGE-05 Replaces |
| Q38 | 5 | Conflict: AC-RESET-02 (Kiln Run Restart) reset line while a session runs points at Pause now / pause after the phase, which merge/push sessions don't offer — what does it say then? (conflict re-check) | Technical | LOW | ? → 90 | Resolved | TD §After-Delivery Activities, §Changes to Earlier Designs, §Verification |
## Question notes

























### Q19
Dropped: Q1 evidence shows `kiln run` resolves the checkout from the path it is given and refuses a missing one before reading any record (src/prd-location.ts:47-92; state dir keyed by checkout path), so the checkout can only be missing while Kiln is open; the parenthetical is accurate.











## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-21 · 35 earlier criteria changed (21 already had Replaces lines) · 11 Replaces lines to write (+1 optional: AC-TEST-03) · 4 parentheticals to correct · 2 raised as questions (Q2, Q3). Folded: 14 Replaces lines added (12 items, incl. optional AC-TEST-03), 4 corrected; TD §Changes to Earlier Designs +2 lines.
Changed after pass 1 (also PRD Out of Scope line, final conformance): AC-BACK-03 (Q1 narrowing), AC-MERGE-06 (Q5 PRD fix), AC-MERGE-03, AC-MERGE-07 (Q7), AC-EXIT-01 (Q8), AC-BACK-05 (Q10), AC-BACK-01 (Q17), AC-MERGE-08 (Q3), AC-MERGE-07 (Q18), AC-BACK-05 and AC-MERGE-06 (Q26), AC-WAIT-02, AC-EXIT-01, AC-MERGE-05, AC-MERGE-07 (Q21); completion re-check: AC-BACK-04, AC-MERGE-02 (Replaces), AC-MERGE-05 (Q37)

Completion re-check: 2026-11-21 · 11 items (10 criteria + Out of Scope line) · 5 Replaces lines to add, 1 to correct (+1 optional) · 2 raised (Q37, Q38). Folded: 5 added (AC-RUN-01, AC-WORK-02, AC-CONTINUE-09, AC-AUTO-01, AC-AUTO-03), AC-MERGE-02 now cites AC-WORK-01 and AC-WORK-02, AC-BACK-04 says Continue pushes them first; TD usage-limit entry names §The Wait.

## Register re-sort
Pass 1: 2026-11-21 · 4 open entries · 0 moved to design · 0 written up · 1 settled by lookup (AUDIT-001 → Validated, Answered) · 0 moved to technical · 0 raised as questions · 3 stay business (SCOPE-001, MERGE-001 above; PLAN-001 moved above the line — departs from the accepted one-line notice). Folded: AUDIT-001 move; MERGE-001 three fixes (drop duplicated push-session sentences, restore Pause Now AC-PAUSE-02 watch-only precedent, 'otherwise' line = Claude Code merge sessions only); PLAN-001 to above the line + design Open Questions line; header link names PLAN-001.

## Noticed, out of scope
- newAcceptance archives the finished execution (continuation-setup.ts:24) before the save writing the push's closedAt, so the archived record shows that push still accepting (harmless unless history reads it)
- newPhaseControls gives "The run isn't finished" as the reason check-for-new-phases is unavailable while an after-delivery activity is open (wording only)
- Build note: while a push is accepting the run is not currently complete; the check and acceptance guards (engine.ts:3531, 3310) must let the automatic re-check and acceptance through
- completedScopeProblems (plan-reconciliation.ts:291-296) checks found.closed only, so a carried waived phase with no Closed line may be flagged during a run (predates this design)
- Build note: the automatic acceptance must supply a current status token to submitInternal
- Repositories with a merge queue: `gh pr merge` queues, session ends with it open → stop; later Check again closes without a summary
- A GitHub read failing at a successful merge session's end turns it into a stop; Check again closes it with no summary
- A pull request retargeted on GitHub and merged into a different base fits none of the reading's rows
- Mixed descriptions where only some carry the "Merge order" line (hand edits only): the note's wording is unspecified
- A Merge press with a removed run worktree is always refused; the refusal could name `git worktree add`
- Build note: Exit ends through the ordinary stop path with code 0, but a reset ends via stop.end() (kiln-command.ts:106,312) skipping engine.stop(); signal codes 130/129/143; InterruptCause (records.ts:398) lacks an exit value — engine.stop needs an exit cause, a report line and code 0
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
Pass 5 committed. Phase 7 again: final verification + conflict re-check of AC-MERGE-05 (new AC-TOTAL Replaces line) and AC-BACK-04 running.
