# Design Refinement State — Kiln Requirements Stages

Started: 2026-11-23   Current pass: 2   Status: In progress
Branch: feature/kiln-requirements-stages
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 5458 · growth baseline 5458
Last updated: 2026-11-23

## Documents
| Document | Path |
|---|---|
| PRD | docs/prds/kiln-requirements-stages/kiln-requirements-stages-prd.md |
| Technical Design | docs/prds/kiln-requirements-stages/kiln-requirements-stages-technical-design.md |
| Assumptions | docs/prds/kiln-requirements-stages/kiln-requirements-stages-assumptions.md |
| Supporting | docs/prds/kiln-requirements-stages/mockups/ (14 screens); docs/changes/kiln-phase-model-tiers/ (designed, not built) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 21 (11 discovery + 6 conflict + 4 found during investigation) | 12 | 12 | 0 | 9 | 0 | 1 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| D1 | 1 | Which unmerged branch "holds" a PRD's documents (AC-BEGIN-08 preselect, home copy, Under way row)? | Technical | HIGH | 75 → 90 | Resolved | TD §What `kiln run` accepts (a branch holds), §What it lists |
| D2 | 1 | Which session a review stop's "session of your own" command resumes | Technical | MEDIUM | 70 → 90 | Resolved | TD §The Two Reviews (the command shown), §Snapshot |
| D3 | 1 | During a stage, is a Message Claude message tracked as feedback, or only the feedback box? | Technical | MEDIUM | 70 → 92 | Resolved (reversed: one route) | TD §Feedback; PRD AC-STAGE-04 row |
| D4 | 1 | One-session build that splits the PRD: reconciling the `whole` row with readPlan's baseline checks | Technical | MEDIUM | 70 → 90 | Resolved | TD §Starting the Build |
| D5 | 1 | How the home screen finds each repository's shared branch without a network call | Technical | MEDIUM | 75 → 95 | Resolved | TD §What it lists, §What `kiln run` accepts; PRD AC-HOME-03 |
| D6 | 1 | A reset record with origin but no prdDirectory: does it still hide its source material? | Technical | MEDIUM | 75 → 92 | Resolved | TD §Run identity, §What it lists |
| D7 | 1 | Stage session that ran nothing, not at a hold, not before PRD, not at build: what Kiln does | Technical | MEDIUM | 80 → 92 | Resolved | TD §How a stage ends |
| D15 | 1 | Same relaunch-loop risk for feedback sessions (message back to waiting on not_worked_in) and review sessions (finished but review still missing or stale) | Technical | MEDIUM | 70 → 70 | Deferred | — |
| D8 | 1 | Who produces the draft's key statements (AC-NOTE-01) before the method change | Technical | MEDIUM | 85 → 97 | Resolved | TD §What a session is told, §The report, §The Two Reviews |
| D14 | 1 | Can a Codex plan read run in a non-Git directory under the state root (no skip-git-repo-check in src)? | Technical | MEDIUM | 50 → 90 | Dropped (reframed: Git is not the blocker; see D14b) | — |
| D14b | 1 | (reframed from D14) Kiln's Codex launch preparation refuses a launch with no assigned repositories and checks build skills for the launch directory; how does a plan read launch? | Technical | MEDIUM | 90 → 90 | Resolved | TD §Reading it |
| D9 | 1 | When a planned PRD's home line says its build waits (Depends on + Status) | Technical | LOW | 70 → 70 | Deferred | — |
| D10 | 1 | Review/feedback session told not to open the review itself; Kiln opens it once | Technical | LOW | 70 → 70 | Deferred | — |
| D11 | 1 | Final review's unconfirmed-assumptions count vs mockups' "business assumptions" label | Technical | LOW | 75 → 75 | Deferred | — |
| D12 | 1 | Served review's sandbox lacks allow-popups, so its links to documents won't open | Technical | LOW | 70 → 70 | Deferred | — |
| D13 | 1 | Fingerprint of "every SKILL.md beside the entry skill" under a loose-skills install covers unrelated skills | Technical | LOW | 70 → 70 | Deferred | — |
| C1 | 1 | One-session build judged by the session's "finished" report, though v1 AC-DONE-01/02 say a session's message never decides; wanted? | Technical (research: not theirs) | MEDIUM | 85 → 92 | Resolved by decision | TD §Design Decisions; PRD AC-FINAL-06 Replaces line |
| C2 | 1 | A reset keeps origin and prdDirectory, though run-restart AC-RESET-04 says a reset discards everything Kiln recorded; wanted? | Technical | MEDIUM | 90 → 92 | Resolved (by D6: no conflict, today's reset keeps identity per AC-RESET-03) | TD §Run identity |
| C3 | 1 | AC-TALK-02's waiting/read/applied vs live-session-control AC-MSG-02's "sent, not confirmed read" | Business | LOW | 85 → 85 | Deferred | — |
| C4 | 1 | Top-bar label (v1 AC-LOOK-05) on the home screen and before a PRD exists | Business | LOW | 85 → 85 | Deferred | — |
| C5 | 1 | PRD time totals (prd-time-totals AC-TOTAL-02): include requirements sessions; review time as waiting? | Business | MEDIUM | 85 → 96 | Resolved (settled) | PRD AC-STAGE-03 + Replaces; TD §Snapshot |
| C6 | 1 | Pause after this stage (pause-now AC-PAUSE-01 offers Now and After); AC-STAGE-04 names only Pause now | Business | MEDIUM | 80 → 80 | Deferred | — |

## Question notes

### C1–C6 (from the pass 1 conflict check)
Proposed answers: C1 yes, add Replaces for v1 AC-DONE-01/02 on AC-FINAL-06. C2 yes, say so in AC-BEGIN-02 or AC-HOME-13 with Replaces for run-restart AC-RESET-04. C3 show read only on the agent's confirmation, keep a sent state (TD §Feedback already has sent). C4 home: repository or folder in scope; source folder until the PRD exists, then the PRD folder; add to AC-HOME-01, AC-BEGIN-07. C5 yes; Replaces on AC-STAGE-03. C6 also offer Pause after this stage; amend AC-STAGE-04.

Conformance pass 1: PRD AC-HOME-05 Replaces and AC-HOME-03 wording de-implementationed; TD code names cut to contracts; Changes to Earlier Designs gained needs-you-handoff and codex-support lines and extended kiln-v1 and live-session-control; Criteria Coverage updated. Orchestrator restored the beaten alternative in the one-session-build decision row.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-23 · 48 earlier criteria changed (5 already covered) · 20 Replaces lines written or extended, covering 36 more · 6 raised as questions (C1–C6)
Changed after pass 1: AC-STAGE-04, AC-HOME-03, AC-FINAL-06, AC-STAGE-03

Replaces lines folded 2026-11-23: 30 added, 4 amended (PRD 5458 → 6318 words). Writer split BEGIN-04's source-material part onto AC-BEGIN-07 and moved the one-row part onto AC-FINAL-06. Possible gap left: AC-BEGIN-02 vs v1 AC-START-02 for source material.

## Register re-sort
Pass 1: 2026-11-23 · 3 open entries · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as Technical questions · 3 stay business (SCOPE-001, HOME-004 above the line; HOME-001 below). Doubt check doubted HOME-004 and HOME-001; re-sorted by the orchestrator: both kept, since each departs from or narrows the brief's own wording, which is theirs to check. SCOPE-001's cost paragraph restated around the product, not Kiln's internals.

## Noticed, out of scope
- A continuation after a completed `wholeBuild` execution would fail `baseline_unavailable` (completed-plan-discovery.ts:86-89 needs phase documents at the completion revision)
- After a PRD folder rename on a branch, the old directory still sits on the shared branch and may also be listed in the folded group (AC-HOME-12)
- Review-stop mockups 8, 9, 12, 14 show a bare `claude --resume <short id>`; the real command has a `cd` line and full id (mockup 13 shows it). Cosmetic.
- `kiln` with no arguments answers help from the command contracts today (covered by AC-HOME-01's Replaces line for bot AC-ACT-01)

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| Kiln Phase Model Tiers exists only as a design; its contracts can be checked against its design, not code | Any question on the resolver, start line, launch decision, Model defaults | Tiers built and merged (TD §Delivery) |

## Next action
Pass 2: discovery (with the 9 Deferred first in the ranking: D15, C6, D9–D13, C3, C4).
