# Design Refinement State — Kiln Requirements Stages

Started: 2026-11-23   Current pass: 3   Status: In progress
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
| 2 | 15 (11 discovery + 4 found during investigation) | 12 (9 carried + 3 new) | 15 (12 taken + P7, P8, P10 folded in) | 0 | 8 | 0 | 0 |

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
| D15 | 1 | Same relaunch-loop risk for feedback sessions (message back to waiting on not_worked_in) and review sessions (finished but review still missing or stale) | Technical | MEDIUM | 70 → 70 | Investigating | — |
| D8 | 1 | Who produces the draft's key statements (AC-NOTE-01) before the method change | Technical | MEDIUM | 85 → 97 | Resolved | TD §What a session is told, §The report, §The Two Reviews |
| D14 | 1 | Can a Codex plan read run in a non-Git directory under the state root (no skip-git-repo-check in src)? | Technical | MEDIUM | 50 → 90 | Dropped (reframed: Git is not the blocker; see D14b) | — |
| D14b | 1 | (reframed from D14) Kiln's Codex launch preparation refuses a launch with no assigned repositories and checks build skills for the launch directory; how does a plan read launch? | Technical | MEDIUM | 90 → 90 | Resolved | TD §Reading it |
| D9 | 1 | When a planned PRD's home line says its build waits (Depends on + Status) | Technical | LOW | 70 → 92 | Resolved | TD §What it lists |
| D10 | 1 | Review/feedback session told not to open the review itself; Kiln opens it once | Technical | LOW | 70 → 92 | Resolved | TD §What a session is told, §The Two Reviews |
| D11 | 1 | Final review's unconfirmed-assumptions count vs mockups' "business assumptions" label | Technical | LOW | 75 → 90 | Resolved | TD §Starting the Build; mockups 9, 14 |
| D12 | 1 | Served review's sandbox lacks allow-popups, so its links to documents won't open | Technical | LOW | 70 → 90 | Resolved (reasoned from code; no browser test) | TD §The Two Reviews, Ready |
| D13 | 1 | Fingerprint of "every SKILL.md beside the entry skill" under a loose-skills install covers unrelated skills | Technical | LOW | 70 → 92 | Resolved | TD §Reading it |
| C1 | 1 | One-session build judged by the session's "finished" report, though v1 AC-DONE-01/02 say a session's message never decides; wanted? | Technical (research: not theirs) | MEDIUM | 85 → 92 | Resolved by decision | TD §Design Decisions; PRD AC-FINAL-06 Replaces line |
| C2 | 1 | A reset keeps origin and prdDirectory, though run-restart AC-RESET-04 says a reset discards everything Kiln recorded; wanted? | Technical | MEDIUM | 90 → 92 | Resolved (by D6: no conflict, today's reset keeps identity per AC-RESET-03) | TD §Run identity |
| C3 | 1 | AC-TALK-02's waiting/read/applied vs live-session-control AC-MSG-02's "sent, not confirmed read" | Business | LOW | 85 → 95 | Resolved (settled) | PRD AC-TALK-02 + Replaces; TD §Feedback |
| C4 | 1 | Top-bar label (v1 AC-LOOK-05) on the home screen and before a PRD exists | Business | LOW | 85 → 95 | Resolved (settled; mockups already draw it) | PRD AC-HOME-01, AC-BEGIN-07 + Replaces; TD §Snapshot |
| C5 | 1 | PRD time totals (prd-time-totals AC-TOTAL-02): include requirements sessions; review time as waiting? | Business | MEDIUM | 85 → 96 | Resolved (settled) | PRD AC-STAGE-03 + Replaces; TD §Snapshot |
| C6 | 1 | Pause after this stage (pause-now AC-PAUSE-01 offers Now and After); AC-STAGE-04 names only Pause now | Business | MEDIUM | 80 → 95 | Resolved (settled) | PRD AC-STAGE-04 + Replaces; TD §The driver; mockups 6, 7 |
| P1 | 2 | Feedback waiting while a stage is unfinished but not taking input (paused, Needs you with work left, usage-limit wait): does a feedback session run before it resumes? | Technical | HIGH | 75 → 95 | Resolved | TD §The driver, §Feedback |
| P2 | 2 | kiln run / Review and continue on a PRD whose refinement was paused by hand (untracked prd-refinement-state file fails the clean check) | Technical | MEDIUM | 60 → 90 | Resolved | TD §What `kiln run` accepts; PRD AC-BEGIN-04 |
| P13 | 2 | The Next stage row never applies Refining the design: a PRD started by hand with a technical design already refines it on the Requirements stages model | Technical | MEDIUM | 60 → 60 | Deferred | — |
| P14 | 2 | A model choice on the Next stage row (kiln:next) would come back the next time the standing becomes unknown; clear it after the report that ends the unknown standing? (with P4) | Technical | LOW | 70 → 70 | Deferred | — |
| P12 | 2 | A stage finished by hand and committed only on the local shared branch: is it in the worktree Kiln cuts (start commit origin's tip vs local)? | Technical | LOW | 70 → 70 | Deferred | — |
| P3 | 2 | Before Start for a PRD started by hand: which plan rows show, which count for agent readiness and Change | Technical | MEDIUM | 65 → 90 | Resolved (reframed: no expected stage while standing unknown; Next stage row) | TD §Rows, §Models, §What `kiln run` accepts, §Data Models; new mockup pending |
| P4 | 2 | Stage keys and the cursor across a plan change, an inserted row, and no plan; orphaned per-PRD choices | Technical | MEDIUM | 70 → 70 | Deferred | — |
| P5 | 2 | A planned PRD's origin.path and how path-taking commands and the home launch name it | Technical | MEDIUM | 70 → 70 | Deferred | — |
| P6 | 2 | Drafting report omits prdDirectory or names one that fails Git's check | Technical | MEDIUM | 70 → 70 | Deferred | — |
| P7 | 2 | Ran-nothing guard sentence blocks the wait-off and Continue paths; only row 3 should enforce it | Technical | MEDIUM | 85 → 95 | Resolved (folded with D15) | TD §How a stage ends |
| P8 | 2 | A report's worked_in applies a message from waiting or sent too | Technical | LOW | 80 → 90 | Resolved (folded with D15) | TD §Feedback |
| P9 | 2 | A report whose ran lists several skills: row title, cursor notice | Technical | LOW | 75 → 75 | Deferred | — |
| P10 | 2 | Agent readiness at Start when the plan isn't read or failed | Technical | LOW | 75 → 85 | Resolved (with P3) | TD §What `kiln run` accepts |
| P11 | 2 | "A branch holds" wording contradiction on remote-only branches | Technical | LOW | 85 → 85 | Deferred | — |

## Question notes

### C1–C6 (from the pass 1 conflict check)
Proposed answers: C1 yes, add Replaces for v1 AC-DONE-01/02 on AC-FINAL-06. C2 yes, say so in AC-BEGIN-02 or AC-HOME-13 with Replaces for run-restart AC-RESET-04. C3 show read only on the agent's confirmation, keep a sent state (TD §Feedback already has sent). C4 home: repository or folder in scope; source folder until the PRD exists, then the PRD folder; add to AC-HOME-01, AC-BEGIN-07. C5 yes; Replaces on AC-STAGE-03. C6 also offer Pause after this stage; amend AC-STAGE-04.

Conformance pass 1: PRD AC-HOME-05 Replaces and AC-HOME-03 wording de-implementationed; TD code names cut to contracts; Changes to Earlier Designs gained needs-you-handoff and codex-support lines and extended kiln-v1 and live-session-control; Criteria Coverage updated. Orchestrator restored the beaten alternative in the one-session-build decision row.

Conformance pass 2: PRD AC-STAGE-04 pause row aligned with the TD (a stop ends a pending pause), AC-LOOK-05 Replaces split onto AC-HOME-01, AC-HOME-02 gained the build-waits policy from the TD; TD standing defined for all three cases, Feedback diagram gained sent → waiting, Changes to Earlier Designs gained kiln-pause-now and more sections, Criteria Coverage updated.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-23 · 48 earlier criteria changed (5 already covered) · 20 Replaces lines written or extended, covering 36 more · 6 raised as questions (C1–C6)
Changed after pass 1: AC-STAGE-04 (twice), AC-BEGIN-04, AC-TALK-02, AC-HOME-01, AC-HOME-02, AC-BEGIN-07, AC-HOME-03, AC-FINAL-06, AC-STAGE-03

Replaces lines folded 2026-11-23: 30 added, 4 amended (PRD 5458 → 6318 words). Writer split BEGIN-04's source-material part onto AC-BEGIN-07 and moved the one-row part onto AC-FINAL-06. Possible gap left: AC-BEGIN-02 vs v1 AC-START-02 for source material.

## Register re-sort
Pass 1: 2026-11-23 · 3 open entries · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as Technical questions · 3 stay business (SCOPE-001, HOME-004 above the line; HOME-001 below). Doubt check doubted HOME-004 and HOME-001; re-sorted by the orchestrator: both kept, since each departs from or narrows the brief's own wording, which is theirs to check. SCOPE-001's cost paragraph restated around the product, not Kiln's internals.

## Noticed, out of scope
- `Cross-Origin-Opener-Policy: same-origin` on the view's pages would add defence in depth for the served review; not needed here
- Whether the Audits row's agents count at a requirements Start is not stated in the TD
- `kiln continue` is overloaded (continue a paused run; continue past the early review); harmless unless a run can be paused at a review
- Home list's `plan` is singular, but a folder of repositories can hold method copies with different fingerprints
- A continuation after a completed `wholeBuild` execution would fail `baseline_unavailable` (completed-plan-discovery.ts:86-89 needs phase documents at the completion revision)
- After a PRD folder rename on a branch, the old directory still sits on the shared branch and may also be listed in the folded group (AC-HOME-12)
- Review-stop mockups 8, 9, 12, 14 show a bare `claude --resume <short id>`; the real command has a `cd` line and full id (mockup 13 shows it). Cosmetic.
- `kiln` with no arguments answers help from the command contracts today (covered by AC-HOME-01's Replaces line for bot AC-ACT-01)

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| Kiln Phase Model Tiers exists only as a design; its contracts can be checked against its design, not code | Any question on the resolver, start line, launch decision, Model defaults | Tiers built and merged (TD §Delivery) |

## Next action
Pass 3: discovery (8 Deferred first: P4 with P14, P5, P6, P13, P9, P11, P12).
