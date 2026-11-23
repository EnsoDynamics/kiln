# Design Refinement State — Kiln Requirements Stages

Started: 2026-11-23   Current pass: 5   Status: In progress
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
| 4 | 3 | 4 (3 + one LOW) | 5 (+ R5 LOW batch) | 0 | 0 | 0 | 0 |
| 3 | 10 | 12 (8 carried + Q1–Q4) | 18 (12 taken + Q5–Q10 folded in) | 0 | 0 | 0 | 0 |
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
| D15 | 1 | Same relaunch-loop risk for feedback sessions (message back to waiting on not_worked_in) and review sessions (finished but review still missing or stale) | Technical | MEDIUM | 70 → 90 | Resolved (pass 2) | TD §How a stage ends, §Feedback, §The driver, §The report, stale-review decision |
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
| P13 | 2 | The Next stage row never applies Refining the design: a PRD started by hand with a technical design already refines it on the Requirements stages model | Technical | MEDIUM | 60 → 80 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| P14 | 2 | A model choice on the Next stage row (kiln:next) would come back the next time the standing becomes unknown; clear it after the report that ends the unknown standing? (with P4) | Technical | LOW | 70 → 85 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| P12 | 2 | A stage finished by hand and committed only on the local shared branch: is it in the worktree Kiln cuts (start commit origin's tip vs local)? | Technical | LOW | 70 → 90 | Resolved | TD (group D) |
| P3 | 2 | Before Start for a PRD started by hand: which plan rows show, which count for agent readiness and Change | Technical | MEDIUM | 65 → 90 | Resolved (reframed: no expected stage while standing unknown; Next stage row) | TD §Rows, §Models, §What `kiln run` accepts, §Data Models; new mockup pending |
| P4 | 2 | Stage keys and the cursor across a plan change, an inserted row, and no plan; orphaned per-PRD choices | Technical | MEDIUM | 70 → 80 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| P5 | 2 | A planned PRD's origin.path and how path-taking commands and the home launch name it | Technical | MEDIUM | 70 → 90 | Resolved | TD (group D) |
| P6 | 2 | Drafting report omits prdDirectory or names one that fails Git's check | Technical | MEDIUM | 70 → 85 | Resolved | TD (group D) |
| P7 | 2 | Ran-nothing guard sentence blocks the wait-off and Continue paths; only row 3 should enforce it | Technical | MEDIUM | 85 → 95 | Resolved (folded with D15) | TD §How a stage ends |
| P8 | 2 | A report's worked_in applies a message from waiting or sent too | Technical | LOW | 80 → 90 | Resolved (folded with D15) | TD §Feedback |
| P9 | 2 | A report whose ran lists several skills: row title, cursor notice | Technical | LOW | 75 → 90 | Resolved | TD (group D) |
| P10 | 2 | Agent readiness at Start when the plan isn't read or failed | Technical | LOW | 75 → 85 | Resolved (with P3) | TD §What `kiln run` accepts |
| P11 | 2 | "A branch holds" wording contradiction on remote-only branches | Technical | LOW | 85 → 95 | Resolved | TD (group D) |
| Q1 | 3 | A Kiln PRD-refinement stage that pauses by the method's rule leaves an untracked state file, so Everything committed can never pass: what that Needs you shows and allows | Technical | MEDIUM | 65 → 85 | Resolved by decision (method gives the cap decision to the person) | TD §How a stage ends |
| Q2 | 3 | Do review and feedback sessions' reports set the standing and cursor? | Technical | MEDIUM | 65 → 80 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| Q3 | 3 | Feedback text limit: live paths cap at 4,000 chars, the review's reply is longer | Technical | MEDIUM | 70 → 92 | Resolved | TD §Feedback, §HTTP, §Command line; PRD AC-TALK-01 |
| Q4 | 3 | Standing after a Needs you passes by Check again/Resume, and how "unknown" is recorded vs "before the first report" | Technical | MEDIUM | 75 → 85 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| Q5 | 3 | A reset source-material run with prdDirectory set: standing unknown, PRD form before Start? | Technical | MEDIUM | 80 → 85 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| Q6 | 3 | The whole build's report breaks the report validity rule (needs next, milestones) | Technical | MEDIUM | 80 → 95 | Resolved | TD §The report |
| Q7 | 3 | A Kiln started by the home screen with the browser suppressed: does it still open the review at a stop? | Technical | MEDIUM | 85 → 95 | Resolved | TD (group D) |
| Q8 | 3 | Feedback state gaps: sent with no outcome; state of messages handed to a feedback session's prompt | Technical | MEDIUM | 85 → 93 | Resolved | TD §Feedback |
| Q9 | 3 | First session of a source run with no plan and no report: which row and key? | Technical | LOW | 75 → 85 | Resolved | TD (group A: §Rows, §The driver, §How a stage ends, §Models, §Data Models) |
| Q10 | 3 | Resume at a review session's Needs you, committed but review still stale | Technical | LOW | 85 → 90 | Resolved | TD §How a stage ends |
| R1 | 4 | A method plan entry that itself makes the stakeholder review, at the cursor when the driver reaches a review: shown how, does the cursor pass it? | Technical | MEDIUM | 70 → 88 | Resolved | TD §Rows, §Data Models |
| R2 | 4 | Live messages to a running review session conflict with its "nothing else" prompt and give no What changed | Technical | MEDIUM | 75 → 90 | Resolved (review sessions take no live messages) | TD §What a session is told, §Feedback, §The report, §How a stage ends |
| R3 | 4 | Home screen placement of a started run whose PRD folder doesn't exist yet | Technical | MEDIUM | 85 → 92 | Resolved | PRD AC-HOME-13 row; TD §What it lists |
| R5 | 4 | LOW batch from discovery: kiln-plan validity; feedback session's valid report at a passed Needs you; plan kept after a failed re-read; initiative without --prd lists planned PRDs; feedback after a ran-nothing session; feedback has no stage key | Technical | LOW | 85 → 92 | Resolved | TD §Interfaces, §How a stage ends, §Reading it, §What `kiln run` accepts, §Rows, §Data Models |
| R4 | 4 | Plan read lists steps before the PRD (intake, initiative), giving rows Kiln never runs and false notices | Technical | LOW | 90 → 95 | Resolved | TD §Reading it |

## Question notes

### C1–C6 (from the pass 1 conflict check)
Proposed answers: C1 yes, add Replaces for v1 AC-DONE-01/02 on AC-FINAL-06. C2 yes, say so in AC-BEGIN-02 or AC-HOME-13 with Replaces for run-restart AC-RESET-04. C3 show read only on the agent's confirmation, keep a sent state (TD §Feedback already has sent). C4 home: repository or folder in scope; source folder until the PRD exists, then the PRD folder; add to AC-HOME-01, AC-BEGIN-07. C5 yes; Replaces on AC-STAGE-03. C6 also offer Pause after this stage; amend AC-STAGE-04.

Conformance pass 1: PRD AC-HOME-05 Replaces and AC-HOME-03 wording de-implementationed; TD code names cut to contracts; Changes to Earlier Designs gained needs-you-handoff and codex-support lines and extended kiln-v1 and live-session-control; Criteria Coverage updated. Orchestrator restored the beaten alternative in the one-session-build decision row.

Conformance pass 2: PRD AC-STAGE-04 pause row aligned with the TD (a stop ends a pending pause), AC-LOOK-05 Replaces split onto AC-HOME-01, AC-HOME-02 gained the build-waits policy from the TD; TD standing defined for all three cases, Feedback diagram gained sent → waiting, Changes to Earlier Designs gained kiln-pause-now and more sections, Criteria Coverage updated.

Conformance pass 3: §Rows and §What a session is told now read the standing's `next`, so a review report never moves the cursor; §How a stage ends rows scoped by session kind and the PRD-folder row covers a PRD file gone with no rename; readiness and `standsAt` keyed on an unknown standing; `KILN_NO_BROWSER` and the restated v1 opening rules removed for pointers; Changes to Earlier Designs extended. Orchestrator: a feedback session with no valid report makes the standing unknown; the span-open `kiln:next` case is P13's decision, not a new question.

Conformance pass 4: §Feedback and §What a session is told say only stage and feedback sessions take live messages; expected-stage sentence covers a review-at-a-stop `next` with no plan; stage-key sentence untangled; live-session-control line and the Delivery spend line updated; PRD AC-TALK-01 gained the stop's-review case. Orchestrator: a stop's review `next` matching no plan entry keeps Kiln's row and the cursor.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-23 · 48 earlier criteria changed (5 already covered) · 20 Replaces lines written or extended, covering 36 more · 6 raised as questions (C1–C6)
Changed after pass 1: AC-HOME-13, AC-TALK-01 (again), AC-PLAN-06, AC-TALK-01, AC-STAGE-04 (twice), AC-BEGIN-04, AC-TALK-02, AC-HOME-01, AC-HOME-02, AC-BEGIN-07, AC-HOME-03, AC-FINAL-06, AC-STAGE-03

Replaces lines folded 2026-11-23: 30 added, 4 amended (PRD 5458 → 6318 words). Writer split BEGIN-04's source-material part onto AC-BEGIN-07 and moved the one-row part onto AC-FINAL-06. Possible gap left: AC-BEGIN-02 vs v1 AC-START-02 for source material.

## Register re-sort
Pass 1: 2026-11-23 · 3 open entries · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as Technical questions · 3 stay business (SCOPE-001, HOME-004 above the line; HOME-001 below). Doubt check doubted HOME-004 and HOME-001; re-sorted by the orchestrator: both kept, since each departs from or narrows the brief's own wording, which is theirs to check. SCOPE-001's cost paragraph restated around the product, not Kiln's internals.

## Noticed, out of scope
- `kiln` run from inside a Kiln worktree may resolve a different scope than the main checkout (two home screens for one repository)
- The person's own session at a review stop running alongside a Send-feedback session in the same worktree; Kiln can't see the person's session
- The `whole` build has no phase document Repositories line; `kiln add-repository` is the only route to other repositories
- Whether Copy reply works in the sandboxed served review is untested; mockups 8, 9, 12 lead with it (Download reply is the fallback)
- If phase-split edits the PRD or design, every final review needs a refresh session; correct, affects time only
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
Pass 5: discovery. LOW items folded as R5; left: PRD-differs check for a by-hand PRD on a new branch vs local shared tip; no kiln:early row when no plan entry reaches prd_refined (both for final verification to judge).
