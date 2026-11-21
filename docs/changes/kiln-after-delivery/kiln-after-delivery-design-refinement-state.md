# Design Refinement State — Kiln After Delivery

Started: 2026-11-21   Current pass: 2   Status: In progress
Branch: feature/kiln-merge-with-agent (worktree .worktrees/kiln-merge-with-agent/kiln; commit, never push)
Existing code posture: Preserve, except the finished-run comparisons the design removes (source: TD §Existing Code)
Code baseline: this branch forked from develop at c41c7af; Kiln Pause Now (PR #20, merged) is on origin/develop only — read it with `git show origin/develop:<path>` / `git grep <pattern> origin/develop`
PRD words: at start 3871 · growth baseline 3871
Last updated: 2026-11-21 (pass 1 checkpoint)

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

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | No main checkout: can AC-BACK-03's remote-base read work when `mainCheckoutPath` is missing, or does the check fail naming the missing checkout, and does that meet the criterion? (TD Open Questions) | Technical | HIGH | 50 → 92 | Resolved | PRD AC-BACK-03; TD §Plan Check step 2, §Design Decisions, §Delivery Reading; mockup state 5 |
| Q2 | 1 | Conflict: phases added and closed by hand outside Kiln — AC-BACK-01 counts a Closed line as done, while Continue Added Phases AC-CONTINUE-01/AC-FIND-03 accept them only through completion checks and show them separately. Intended? | Technical (settled by existing criteria) | MEDIUM | ? → 92 | Resolved | TD §The Plan Check (result table note) |
| Q3 | 1 | Conflict: AC-PRS-04's statement of what Kiln may do (as AC-MERGE-08 amends it) still says Kiln touches no other branch, while Continue may now push the plan to the base branch; is the Continue panel line enough? | Business | LOW | ? | Deferred | — |
| Q4 | 1 | Merge session resumable after conflict stop / Ctrl+C? Clean-worktree rule at Resume and restart would refuse forever (D1) | Technical | HIGH | 70 → 92 | Resolved | TD Gates table, §Merge Session, §Push Session, §Data Models, §Verification; PRD AC-MERGE-06 (Q5 fix) |
| Q5 | 1 | Push session Done reading (same scope digest) unreachable if a reply changes a phase document? (D2) | Technical | HIGH | 75 → 88 | Deferred | — |
| Q6 | 1 | What exactly is 'the run's completion record' that marks a phase finished — union of baseline completions and this execution's done/waived leaves? (D3) | Technical | HIGH | 80 → 92 | Resolved | TD §Design Decisions, §Plan Check step 3, §Verification |
| Q7 | 1 | Pull request closed while merge activity open: does closed close the activity and return to the closed card; reopen offers Resume? vs TD 'once per delivery' and AC-MERGE-07 (D4) | Technical (was Business) | MEDIUM | 60 → 93 | Resolved | TD §Merge Session, §After-Delivery Activities, §Verification; PRD AC-MERGE-03, AC-MERGE-07 |
| Q8 | 1 | Exit Kiln while a plan check or command is in progress: TD forbids, PRD says whenever no session runs (D5) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Exit Kiln, §Interfaces, §Display Contract, §Verification; PRD AC-EXIT-01 |
| Q9 | 1 | Page open/reload after merge: full plan check every time, or GitHub reading only? (D6) | Technical | MEDIUM | 70 → 95 | Resolved | TD §The Delivery Reading, §Verification |
| Q10 | 1 | Continue one press when offer needs early-merge target grant bound to scopeDigest that the push changes (D7) | Technical | MEDIUM | 70 → 95 | Resolved | TD §Continue and the Push Session, §Data Models, §Verification; PRD AC-BACK-05 |
| Q11 | 1 | Merge session's workspace: only worktrees of PRs still to merge (Codex realpath failure on removed worktrees) (D8) | Technical | MEDIUM | 80 → 92 | Resolved | TD §After-Delivery Activities, §Verification |
| Q12 | 1 | Which session message is saved as the closing summary (D9) | Technical | LOW | 80 → 80 | Deferred | — |
| Q13 | 1 | Which uncommitted files the page names: plan-read file set vs 'files in the PRD's folder' (D10) | Technical | LOW | 80 → 80 | Deferred | — |
| Q14 | 1 | Proposal's sharedDigest and shared_documents observation removed; proposal binds source kind and revision (D11) | Technical | LOW | 85 → 85 | Deferred | — |
| Q15 | 1 | More audit-name surfaces: PausedHold.svelte:50, PausePanel.svelte:23, projection.ts:284 (develop), underway-output.ts:70, waiver-facts.ts:118 (D12) | Technical | LOW | 90 → 95 | Resolved | TD §Closing-Audit Names, §Verification |
| Q16 | 1 | Card's conflicting mark only on mergeable false/DIRTY; UNKNOWN shows nothing, no re-read (D13) | Technical | LOW | 90 → 95 | Resolved | TD §The Delivery Reading, §Verification |

| Q17 | 1 | PLAN-001 reopened under Gate 3: AC-BACK-01 ("never … mentions the change") already carries the revised answer; Gate 3 says PRD keeps the stakeholder's ruling (one line per edited finished phase) until revised — revert AC-BACK-01 wording while the design builds the simpler version? (conformance) | Business/standards | MEDIUM | ? → ? | Pending | — |
| Q18 | 1 | Card/stop wording once a merge activity exists and a PR is closed: AC-MERGE-07's "reopening it on GitHub brings the merge back" vs Resume (conformance) | Technical | LOW | ? → ? | Pending | — |
| Q19 | 1 | AC-BACK-03 "Not found" parenthetical "(moved or removed while Kiln was open)" narrower than design? (conformance) | Technical | LOW | ? → 95 | Dropped | — |
## Question notes

### Q19
Dropped: Q1 evidence shows `kiln run` resolves the checkout from the path it is given and refuses a missing one before reading any record (src/prd-location.ts:47-92; state dir keyed by checkout path), so the checkout can only be missing while Kiln is open; the parenthetical is accurate.








### Q5
Proposed answer (88%): Done is read from the remote base alone, at session end and before Check again/Resume act on a stop: the remote base's plan holds every offered phase id (whatever their documents say), OR the remote base contains the main checkout's base-branch tip as it stands at that reading (`git merge-base --is-ancestor` against the fetched `remoteBase` revision) — covers a requested combination that renumbers/drops a phase. Neither true before the push lands (offer came from main checkout only because remote lacked those ids and local tip was ahead). Then the plan check re-runs (reads remote); matching offer by id+scope digest and ready → auto-accept as journal instruction linked to original receipt; otherwise shown as found: refreshed offer (fresh choice, AC-OFFER-03), blocked, or No new phases found. "Remote contains the tip recorded at the press" rejected: a rebase rewrites it. Doc text: (Q10 fold sets the second-paragraph wording to each phase's own scope digest); replace Done paragraph; §Verification AC-BACK-05 add: session-changed phase doc (Done, then fresh choice), rebase (Done), later unrelated local commit (still Done). PRD fix (FOLDED with Q4): AC-MERGE-06 table push row "When the work is done" cell → "Kiln checks again and starts the build as Continue does, unless AC-OFFER-03 in Kiln Continue Added Phases calls for a fresh choice (AC-BACK-05)". Evidence: TD ~181-199, ~142-148; PRD AC-BACK-05 l.121, AC-MERGE-06 l.79-84; continue-added-phases PRD l.53; plan-reconciliation.ts:264; completed-plan-sources.ts:11; continuation-authority.ts:31; engine.ts:3396. Remaining doubt: the tip clause's edge cases (person resets local base to remote → Done, re-check finds nothing; acceptable).

### Q12
Proposed (discovery): only the final message of a session run that ended with every PR merged; activity closed by Check again, Resume pre-check or kiln run after a hand merge saves none. Evidence: TD line ~100, AC-MERGE-04.
### Q13
Proposed: use the plan-read file set (TD ~180 definition of "this PRD's documents") for the page's named uncommitted files. Evidence: TD ~147, ~180; AC-BACK-03.
### Q14
Proposed: yes, both go; proposal binds source kind and revision. Evidence: completed-plan-discovery.ts:130,136; continuation-readiness.ts:178.
### Q3
Conflict check: AC-PRS-04's statement (as AC-MERGE-08 amends it) says Kiln touches no other branch; Continue now pushes the plan to base. Panel line only, or the statement too?


## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-21 · 35 earlier criteria changed (21 already had Replaces lines) · 11 Replaces lines to write (+1 optional: AC-TEST-03) · 4 parentheticals to correct · 2 raised as questions (Q2, Q3). Folded: 14 Replaces lines added (12 items, incl. optional AC-TEST-03), 4 corrected; TD §Changes to Earlier Designs +2 lines.
Changed after pass 1: AC-BACK-03 (Q1 narrowing), AC-MERGE-06 (Q5 PRD fix), AC-MERGE-03, AC-MERGE-07 (Q7), AC-EXIT-01 (Q8), AC-BACK-05 (Q10)

## Register re-sort
Pass 1: 2026-11-21 · 4 open entries · 0 moved to design · 0 written up · 1 settled by lookup (AUDIT-001 → Validated, Answered) · 0 moved to technical · 0 raised as questions · 3 stay business (SCOPE-001, MERGE-001 above; PLAN-001 moved above the line — departs from the accepted one-line notice). Folded: AUDIT-001 move; MERGE-001 three fixes (drop duplicated push-session sentences, restore Pause Now AC-PAUSE-02 watch-only precedent, 'otherwise' line = Claude Code merge sessions only); PLAN-001 to above the line + design Open Questions line; header link names PLAN-001.

## Noticed, out of scope
- Before the build, this branch must merge origin/develop (Pause Now changed engine.ts, projection.ts, the Paused page)
- A repository's delete-head-branches-on-merge setting removes the branch whatever the session does
- A main checkout with new phases but behind on the delivery may read a plan lacking the run's phase documents; readiness may block until the push (rare)
- Same new phase id locally and remotely with different text: remote wins unless another phase exists only locally
- Pull request card facts (commit counts) go stale after the merge session pushes

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 1 complete and committed. Pass 2: discovery (deferred Q5, Q3, Q12–Q14 and pending Q17, Q18 come first in ranking).
