# Design Refinement State — kiln-completion-waivers

Started: 2026-11-02   Current pass: 4   Status: In progress
Branch: develop
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 3381 · growth baseline 3381
Last updated: 2026-11-02

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md |
| Technical Design | docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md |
| Assumptions | docs/changes/kiln-completion-waivers/kiln-completion-waivers-assumptions.md |
| Supporting | docs/changes/kiln-completion-waivers/mockups/kiln-completion-waivers.html |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 9 (+4 from conformance) | 9 | 9 | 0 | 0 | 0 | 0 |
| 2 | 8 (+4 carried, +1 conformance) | 13 | 11 | 0 | 0 | 0 | 1 |
| 3 | 4 (+1 conformance) | 5 | 5 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Waiving a launch-check stop on an unstarted activity must also cover its completion check, or it relaunches | Technical | HIGH | 55 → 90 | Resolved | TD §Check Runs, §Mark Complete; PRD AC-WAIVE-02 wording |
| Q2 | 1 | Continuing a PRD completed on a waived Closed line or skipped phase (continue-added-phases) | Technical (PRD decides) | HIGH | 55 → 95 | Resolved | TD §Coverage (Continuation executions); Open Question removed; PRD Replaces AC-CONTINUE-01 |
| Q3 | 1 | Does a waiver-resolved checkpoint count for dependents' operation gate and artifact binding | Technical | HIGH | 60 → 90 | Resolved | TD §Coverage (WAIVE-004 bullet) |
| Q4 | 1 | What Mark complete requires under live takeover / uncertain messages / unsent reply | Technical | HIGH | 80 → 93 | Resolved | TD §Mark Complete, §Interfaces |
| Q5 | 1 | Mark complete on a stop sitting on an already complete activity (later development check) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Check Runs, §Mark Complete |
| Q6 | 1 | Final-delivery rerun with only Current completion audits failing: route to audits or keep stop | Technical | MEDIUM | 70 → 90 | Resolved | TD §Check Runs, §Mark Complete step 2 |
| Q7 | 1 | Side-effect-free computation of "next activity" for the preview sentence | Technical | MEDIUM | 75 → 90 | Resolved | TD §Mark Complete (forecast), §Interfaces |
| Q8 | 1 | Recheck of a Codex launch-settings stop without dispatching a turn | Technical | MEDIUM | 60 → 85 | Resolved by decision | TD §Check Runs (probe); Open Question removed; proof in §Verification |
| Q-C1 | 1 | AC-WAIVE-12 "None usable" includes a readable report Kiln refused | Business | MEDIUM | 95 → 97 | Resolved | PRD AC-WAIVE-12 |
| Q9 | 1 (conformance) | TD §Check Runs says a waived launch item (Billing approval, Agent selection, Codex launch settings, Preparation permissions) never covers a later launch, but PRD AC-WAIVE-09 says a waived item counts wherever Kiln asks again (`other` row: until a feature head changes); PRD exception or design change? | Business | MEDIUM | — | Resolved | TD §Failing Items `other` row, §Check Runs (launch item keyed by activity; no PRD exception needed) |
| Q10 | 1 (conformance) | PRD's Replaces in part is one list after the criteria, not a `Replaces in part:` line on each new criterion as prd-writing-standards specifies; distribute onto AC-WAIVE-xx? | Technical | LOW | — | Dropped | — (each list entry already names its AC-WAIVE criterion; no implementer judgment call) |
| Q11 | 1 (conformance) | TD §Upgrade lists the new saved fields but not final delivery's `waiverId` (§Mark Complete); say where it is saved | Technical | LOW | — | Resolved | TD §Upgrade |
| Q12 | 1 (conformance) | TD §Interfaces lists `check_unavailable` both as a response outcome and as a 503 refusal; which does the route return? | Technical | LOW | — | Resolved | TD §Interfaces (503 with outcome) |

| Q13 | 2 | Launch-check rule on an activity that already ran (billing hold with runs, Preparation permissions as done_check) | Technical | HIGH | 65 → 92 | Resolved | TD §Check Runs |
| Q14 | 2 | Mark complete on a preparation stop: what happens to record.preparation | Technical | MEDIUM | 70 → 90 | Resolved | TD §Mark Complete (preparation bullet) |
| Q15 | 2 | Where a billing hold on an unstarted activity keeps its run and saved row | Technical | MEDIUM | 75 → 85 | Resolved (proposal rejected; carried on the hold) | TD §Check Runs, §Upgrade |
| Q16 | 2 | Journal identity of waive-and-advance without --confirm; `by` string input | Technical | MEDIUM | 75 → 85 | Resolved (proposal changed: no-confirm form journaled as its recheck) | TD §Interfaces |
| Q17 | 2 | Closed row failing with plan-problem text: phase_closed item and leaf validity without a readable plan | Technical | MEDIUM | 80 → 88 | Resolved | TD §Failing Items, §Coverage |
| Q18 | 2 | Audits completed under normal order on another activity's waiver: own AuditWaiverResult each | Technical | MEDIUM | 80 → 90 | Resolved | TD §Audits Marked Complete, §Snapshot, §Display |
| Q19 | 2 | Continuation baseline revision when final delivery waived the PRD repo push (waivedHead fallback) | Technical | MEDIUM | 85 → 90 | Resolved | TD §Coverage (Continuation executions) |
| Q20 | 2 | Display of a continued waiver on an already-complete activity | Technical (PRD decides) | LOW | 70 → 95 | Resolved (AC-WAIVE-10 decides) | TD §Display Contract |
| Q21 | 2 (conformance) | TD §Check Runs: on a billing hold whose activity already ran, a recheck "replaces the hold's rows" with the done check's, and the snapshot reads the hold's rows rather than appending one, yet the same paragraph says the preview never counts "the Billing approval row the snapshot shows"; does the hold keep showing its Billing approval row after such a recheck (outside the waivable run), and where is it stored? | Technical | LOW | — | Resolved | TD §Check Runs |
| Q22 | 3 | Under a waived plan problem, every later phase's Closed row fails with the plan-problem text: covered by the known_problem waiver? | Technical | HIGH | 60 → 85 | Resolved by decision (proposal rejected: Closed judged from the leaf document) | TD §Failing Items |
| Q23 | 3 | Where 'Complete · N waived' is stored when an activity passes only on a carried waiver | Technical | MEDIUM | 70 → 90 | Resolved | TD §Coverage, §Display, §Upgrade |
| Q24 | 3 | Plan stop raised by something other than the plan read (activation-recovery missing phase) never gets a recheck run | Technical | MEDIUM | 75 → 90 | Resolved | TD §Check Runs, §Normal Order |
| Q25 | 3 | After check_results_changed, is Mark complete re-offered at once | Technical | LOW | 85 → 95 | Resolved (mockup decides) | TD §Display Contract |
| Q26 | 3 (conformance) | Under a waived plan problem, PRD AC-WAIVE-04 takes the next phase "whose own document reads", but TD §Normal Order takes any next leaf (from the plan Kiln last recorded when none read) and §Failing Items then fails its Closed row with the plan-problem text; should §Normal Order pass over a leaf whose own document does not read, and how does such a leaf count for AC-NEUTRAL-04's open-phase rule and final delivery's "Phase N is still open"? | Technical | MEDIUM | — | Resolved (PRD decides: next phase whose own document reads; unreadable leaf skipped) | TD §Normal Order |

Status values: Pending · Investigating · Answered, not folded · Resolved · Assumption · Deferred (carried to next pass) · Blocked · Dropped (failed the scope gate on closer look; reason in notes). A Reframed question is replaced by a new row marked Pending with "reframed from Qn" in its notes.

## Question notes

### Q8
Resolved by decision at 85%: read-only investigation cannot raise it further; the residual (MCP servers possibly starting inside the ephemeral `thread/start` probe) is a build-time proof with a real Codex install, written into §Verification. Evidence: codex-launch-profile.ts:21-77, codex-session.ts:189-206, Codex 0.166.0 `Thread.ephemeral`.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-02 · 42 earlier criteria changed (25 listed: 24 right, AC-TEST-03 mis-targeted; 17 missing) · 16 Replaces entries added, AC-TEST-03 repointed (AC-CONTINUE-01 dropped: a readiness offer, not a stopped activity) · PRD 3381 → 3687 words · 0 unintended conflicts. Gap noted: AC-WAIVE-12 "None usable" row should say it includes a readable report Kiln refused (no-progress continuation, plan disagreeing with report) → Q-C1.
Changed after pass 1: AC-WAIVE-12 (None usable row, Q-C1); AC-WAIVE-02 (other heading scoped to plan/readiness stops, Q1); Replaces list + AC-CONTINUE-01 (Q2)

## Noticed, out of scope

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 4 discovery.