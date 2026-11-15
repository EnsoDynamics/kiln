# Design Refinement State — kiln-build-preflight

Started: 2026-11-15   Current pass: 1   Status: In progress
Branch: feature/kiln-build-preflight
Existing code posture: Preserve (source: user)
PRD words: at start 1658 · growth baseline 1658
Last updated: 2026-11-15

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-build-preflight/kiln-build-preflight-prd.md |
| Technical Design | docs/changes/kiln-build-preflight/kiln-build-preflight-technical-design.md |
| Assumptions | docs/changes/kiln-build-preflight/kiln-build-preflight-assumptions.md |
| Supporting | docs/changes/kiln-build-preflight/mockups/kiln-build-preflight.html; enso-method skills/build-preflight/SKILL.md and skills/phase-split/SKILL.md (method side, read-only) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 9 (8 discovery + C3; C1/C2 merged) | 9 | 7 | 1 | 1 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Takeover of a running preflight: offered? if so, how is it released and read? (merges conflict C2) | Technical | MEDIUM | 50 → 90 | Resolved | TD Design Decisions, §The Preflight Stop; PRD AC-PREFLIGHT-08 |
| Q2 | 1 | Does Start that ends a pause run a preflight (always, or only while unsettled)? (part of conflict C1) | Business | MEDIUM | 55 → 85 | Assumption | RUN-004; PRD AC-PREFLIGHT-01; TD §When the Preflight Is Due |
| Q3 | 1 | Launch-check (selection) stop on a preflight key: what do Start again / Continue in normal order do? | Technical | MEDIUM | 60 → 90 | Resolved | TD §When the Preflight Is Due, Design Decisions |
| Q4 | 1 | Does Start on the Folder missing page set due (base vs branch start)? (part of conflict C1) | Technical | MEDIUM | 70 → 95 | Resolved | TD §When the Preflight Is Due; PRD AC-PREFLIGHT-01 |
| Q5 | 1 | Preflight cut off by sleep and not resumable: no report or a stop? | Technical | MEDIUM | 75 → 90 | Resolved | TD §Reading the Result |
| Q6 | 1 | When does kiln check-again's receipt settle at a preflight stop? | Technical | LOW | 75 → 90 | Resolved | TD §The Preflight Stop |
| Q7 | 1 | Where is a no-report reason shown when there is no session? | Technical | LOW | 65 → 75 | Deferred | — |
| Q8 | 1 | Entry-point table: Start is browser-only; Resume includes kiln continue at the review | Technical | LOW | 85 → 95 | Resolved | TD §When the Preflight Is Due |
| Q9 | 1 | Order of the planned-as-needing-you card vs Mark complete-first layout on a Kiln-record-only stop (conflict C3) | Technical | LOW | 70 → 90 | Resolved | TD §Display Contract |
| Q10 | 1→2 | Is RUN-004 a duplicate of RUN-003 ("every press of Start")? Keep, merge or close | Business | LOW | 60 → 60 | Pending | — |
| Q11 | 1→2 | AC-PREFLIGHT-01 proofs: kiln continue at the restart review sets due; Folder missing branch Start at Needs you runs none | Technical | LOW | 90 → 90 | Pending | — |
| Q12 | 1→2 | Does AC-PREFLIGHT-08's no-live-controls clause need a Replaces line on AC-LIVE-02 (Live Session Control)? | Technical | LOW | 70 → 70 | Pending | — |

## Question notes

### Q6
Answer (90%): at a preflight stop check-again settles as start-again does (outcome session_started, effects.session started); result read from status. Must route through the starting-action path (controlDispatch, STARTING_ACTIONS, session_started/dispatch_not_started reconciliation, engine.ts ~700-725), since reconcile assumes check-again never dispatches. Also: `kiln waive-and-advance` without --confirm at a preflight stop must return the offer without rerunning (design ~line 103 currently says it is Check Preflight again — that would launch a minutes-long session from a preview). Contract entry gains the sentence. No Replaces line (AC-ACT-03/05 silent on settle time).

### Q7
Proposed (75%): a no_report preflight with no session shows No report, Found "Ended without a report", plus a **Why** line with result.reason verbatim; row not a link (no row without a session opens today: PhasePlan.svelte:40; PhaseDetail assumes a session). Precedent: waiver warning on row (snapshot.ts 1420-1423). Needs PRD AC-PREFLIGHT-06 wording "when no session ran, the row says why instead" and PhaseView.preflight.reason. Alternative: make the row openable with a no-session detail branch. Deferred: build choice under 90; next pass decides (or record as decision if deferred again).

### Q9
Answer (90%; approved mockup state 4 lines 205-212 already shows it): planned-as-needing-you card first on every Needs you layout, above the headline card; at a Kiln-record-only stop: card, headline card, Mark complete (still first control under headline, AC-WAIVE-02). NeedsYou.svelte ~192-236. No Replaces line.

### Q1 + Q3 + Q5
Q1 (reframed, decided): preflight session has no live controls (no Message Claude / takeover), as final delivery has none (liveTarget excludes pull_request, engine.ts ~1016); Reply at the stop steers it; PRD AC-PREFLIGHT-08 gains "no live controls" clause. Q3: launch-check stops on the preflight key work as at any launch-check stop (Continue in normal order only for KNOWN_PROBLEM_CHECKS, waivers.ts:96-99); Start again/Check again launch the preflight prompt; Mark complete settles; narrow Decisions row so launch checks never become no_report. Q5: no done check on preflight keys anywhere (session end, interruption recovery, billing-hold recheck ~5268-5281); unresumable sleep = ended → read. Writer folding.

### Q4 + Q8
Answer (95%): base Folder missing Start activates a fresh execution (activateExecution, engine.ts ~3588-3622) → due always; branch start keeps execution → Resume rule, only when a restart-review action applies (AC-SETUP-05 keeps Needs-you). `kiln run` never presses Start (contracts ~2465); `kiln continue` = restart-review Resume (engine.ts ~771, local-server.ts ~480). Corrected table being folded with Q2.

### Q2
Proposed answer: Always — a Start that ends a pause (Paused page Start, Folder missing Start ending a pause, `kiln continue` at a pause) runs a preflight, set in the same write that clears the pause. 85%: follows AC-PREFLIGHT-01's literal "presses Start" and RUN-003's reasoning; pauses exist to change accounts/model and can last overnight (Kiln v1 AC-VIEW-03/08, AC-WATCH-08). Below 95 because a short pause could reasonably skip it → write as business assumption RUN-004 (open), proceed on Always. Fold: PRD AC-PREFLIGHT-01 adds "including a Start that ends a pause"; Replaces in part AC-VIEW-03 in kiln-v1 PRD; design Start row. Fold together with Q4/Q8 (same table). Evidence: engine.ts start() pause branch ~1499-1503 sets no due today; Paused.svelte:53.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Changed after pass 1: AC-PREFLIGHT-08, AC-PREFLIGHT-01 (cites RUN-004) (no live controls), AC-PREFLIGHT-01 (pause Start, Folder missing; Replaces AC-VIEW-03, AC-SETUP-04/05)
Pass 1: 2026-11-15 · 2 existing Replaces lines (4 criteria) · 12 Replaces lines added on AC-PREFLIGHT-01/03/06/08, AC-ATTEND-01/03 (AC-PAGE-02, AC-DISPLAY-01 dropped: not changed) · 3 raised as questions (C1 Start on pause/Folder missing, C2 takeover during preflight, C3 card vs Mark complete order) — Q ids assigned after discovery

## Register re-sort
Pass 1: 2026-11-15 · 0 open entries (register holds only validated RUN-001 to RUN-003) · nothing to sort

## Noticed, out of scope

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 1 committed. Start pass 2: discovery with backlog first (Q7 deferred; Q10-Q12 from conformance).
Conformance pass 1: fixed header link, PRD count, Replaces lines for 4 more earlier designs, RUN-004 format, removed existing-code description in Data Models.
