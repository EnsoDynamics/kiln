# Design Refinement State — Kiln usage-limit recovery

Started: 2026-10-22   Current pass: 4   Status: In progress
Branch: wt/kiln-limit-recovery-tdd (this chat's parallel-session worktree)
Existing code posture: Preserve (source: TD)
PRD words: at start 2597 · growth baseline 2597
Last updated: 2026-10-22

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md |
| Technical Design | docs/changes/kiln-usage-limit-recovery/technical-design.md |
| Assumptions | docs/changes/kiln-usage-limit-recovery/assumptions.md |
| Supporting | docs/changes/kiln-usage-limit-recovery/mockups/ (3 screens); Kiln v1 docs/prds/kiln-v1/ (PRD, technical-design.md, assumptions.md); Kiln multi-repo delivery docs/changes/kiln-multi-repo-delivery/ (settled; its TD's "Seam With Usage-Limit Recovery") |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 12 (+1 from conformance) | 12 | 12 | 0 | 0 | 0 | 0 |
| 2 | 11 (+1 from discovery's own findings, +2 from conformance) | 14 | 14 | 0 | 0 | 0 | 0 |
| 3 | 7 (+1 from conformance) | 8 | 8 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Same account, no row for the stopping limit: usage left? | Technical | HIGH | 65 → 92 | Resolved | TD §Design Decisions, §The Wait |
| Q2 | 1 | Resume at Needs you after Stayed in the workspace failed | Technical | HIGH | 75 → 95 | Resolved | TD §Resume, §Seam |
| Q3 | 1 | Waiting screen once the reset passed but still waiting | Business | MEDIUM | 60 → 95 | Resolved | PRD AC-LIMIT-01; TD §Snapshot |
| Q4 | 1 | Refused on the very first request: transcript exists? | Technical | MEDIUM | 70 → 90 | Resolved | TD §Testing (gate 5), §Open Questions |
| Q5 | 1 | No resetsAt and a failing reading | Technical | MEDIUM | 70 → 92 | Resolved | TD §The Wait |
| Q6 | 1 | Same account = email + orgId | Technical | MEDIUM | 70 → 95 | Resolved | TD §Design Decisions, §Data Models |
| Q7 | 1 | weekly_scoped row vs the session's model family | Technical | MEDIUM | 75 → 92 | Resolved | TD §Design Decisions |
| Q8 | 1 | Usage-limit Needs you with no Resume | Technical | LOW | 75 → 92 | Resolved | TD §Screens |
| Q9 | 1 | Reset times rounded to the minute | Technical | LOW | 75 → 95 | Resolved | TD §Screens |
| Q10 | 1 | Reading when a stop carries limit | Technical | LOW | 85 → 95 | Resolved | TD §The Wait |
| Q11 | 1 | Terminal wording for Ctrl+C during a wait and the ● line | Technical | LOW | 85 → 95 | Resolved | TD §Command line |
| Q12 | 1 | Refusal type with no reading row: does another account's reading decide, and does the wait take a first reading before going to Needs you? (from conformance) | Technical | MEDIUM | 60 → 92 | Resolved | TD §Design Decisions, §The Wait |
| Q13 | 2 | Past resetsAt, a failed or undecided reading resumes | Technical | MEDIUM | 75 → 92 | Resolved | PRD/TD (writer pass 2) |
| Q14 | 2 | refusedAccount set by the first reading whose auth succeeded | Technical | MEDIUM | 70 → 92 | Resolved | PRD/TD (writer pass 2) |
| Q15 | 2 | Copy command copies only claude auth login (mockups redrawn) | Business | MEDIUM | 70 → 95 | Resolved | PRD/TD (writer pass 2) |
| Q16 | 2 | Signed in now card: no reading yet, signed out, limitsError | Technical | MEDIUM | 75 → 92 | Resolved | PRD/TD (writer pass 2) |
| Q17 | 2 | Full session output from the waiting screen | Technical | MEDIUM | 85 → 92 | Resolved | PRD/TD (writer pass 2) |
| Q18 | 2 | Resume, Resume now, Check again unavailable until the run starts | Technical | MEDIUM | 88 → 95 | Resolved | PRD/TD (writer pass 2) |
| Q19 | 2 | Setting switched off between the end-of-wait check and the run | Technical | LOW | 85 → 92 | Resolved | PRD/TD (writer pass 2) |
| Q20 | 2 | Restarted wait with no resetsAt re-applies the first-reading rule | Technical | LOW | 70 → 90 | Resolved | PRD/TD (writer pass 2) |
| Q21 | 2 | Copy for no reset time, reset passed; keep-awake subtitle | Business | LOW | 80 → 95 | Resolved | PRD/TD (writer pass 2) |
| Q22 | 2 | Pull-request session wording while waiting | Business | LOW | 85 → 95 | Resolved | PRD/TD (writer pass 2) |
| Q23 | 2 | Dropped usage rows don't count for usage left | Technical | LOW | 85 → 92 | Resolved | PRD/TD (writer pass 2) |
| Q24 | 2 | Pause refused during a wait; any resume cause without init is not_resumable | Technical | LOW | 90 → 98 | Resolved | PRD/TD (writer pass 2) |
| Q25 | 2 | Setting switched off after Resume now was pressed (from conformance) | Business | LOW | 80 → 95 | Resolved | PRD AC-AUTO-04 |
| Q26 | 2 | Waiting mockup promised a resume at the reset (from conformance) | Technical | LOW | 90 → 98 | Resolved | waiting mockup |
| Q27 | 3 | Refused account kept on the refused run, not the wait (AC-AUTO-05 survives run start) | Technical | MEDIUM | 70 → 92 | Resolved | TD (writer pass 3) |
| Q28 | 3 | Sentence forms of limit labels; card footer, PR and stopped lines | Business | LOW | 70 → 95 | Resolved | TD (writer pass 3) |
| Q29 | 3 | Readings during a resume's lock only update the card | Technical | MEDIUM | 85 → 95 | Resolved | TD (writer pass 3) |
| Q30 | 3 | Failed limit resume shows v1 not_resumable without limit facts | Technical | LOW | 80 → 92 | Resolved | TD (writer pass 3) |
| Q31 | 3 | Reset reading armed from wall clock, re-armed on sleep | Technical | LOW | 85 → 95 | Resolved | TD (writer pass 3) |
| Q32 | 3 | Reconcile restart keeps since, sessionId, run | Technical | LOW | 85 → 95 | Resolved | TD (writer pass 3) |
| Q33 | 3 | Label replacement updates run and stop together | Technical | LOW | 85 → 95 | Resolved | TD (writer pass 3) |
| Q34 | 3 | One wording rule for limits in sentences vs labels as names (from conformance) | Business | LOW | 80 → 95 | Resolved | PRD AC-LIMIT-01, AC-LIMIT-03; TD §Screens; mockups |
| C1 | 1 | Correction: usage parser is extended (kind, scope type, call-start time, orgId) | Technical | MEDIUM | — → 98 | Resolved | TD §Existing Code |

## Question notes
All pass 1 answers were decided by the orchestrator from discovery's evidence (Q2 from multi-repo AC-OUTSIDE-04; Q6 from `claude auth status --json`, which reports orgId and orgName on 2.1.307); the full answers are in the writer's brief. Folded in one writer run; conformance fixed placement (AC-AUTO-04 and AC-AUTO-05 now state rules the design held).

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-10-22 · 21 earlier criteria changed (14 already declared) · 8 Replaces lines written · 0 raised as questions
Changed after pass 1: AC-LIMIT-01, AC-AUTO-04, AC-AUTO-05, AC-LIMIT-02, AC-AUTO-03 (Replaces line), AC-RESUME-02, AC-LIMIT-03

## Noticed, out of scope

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| No Claude account at a usage limit, and no second account in a separate config directory (proof gate 5) | Any question needing Claude Code's real refusal output, a reading after a refusal, or a cross-account resume | Doug runs proof gate 5; until then, answer from the Agent SDK 0.3.302 types and recorded fixtures |

## Next action
Pass 4: run discovery.
