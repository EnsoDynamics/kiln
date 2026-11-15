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
| 2 | 8 (+3 from conformance; 2 repeats) | 12 | 12 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Takeover of a running preflight: offered? if so, how is it released and read? (merges conflict C2) | Technical | MEDIUM | 50 → 90 | Resolved | TD Design Decisions, §The Preflight Stop; PRD AC-PREFLIGHT-08 |
| Q2 | 1 | Does Start that ends a pause run a preflight (always, or only while unsettled)? (part of conflict C1) | Business | MEDIUM | 55 → 85 | Assumption | RUN-004; PRD AC-PREFLIGHT-01; TD §When the Preflight Is Due |
| Q3 | 1 | Launch-check (selection) stop on a preflight key: what do Start again / Continue in normal order do? | Technical | MEDIUM | 60 → 90 | Resolved | TD §When the Preflight Is Due, Design Decisions |
| Q4 | 1 | Does Start on the Folder missing page set due (base vs branch start)? (part of conflict C1) | Technical | MEDIUM | 70 → 95 | Resolved | TD §When the Preflight Is Due; PRD AC-PREFLIGHT-01 |
| Q5 | 1 | Preflight cut off by sleep and not resumable: no report or a stop? | Technical | MEDIUM | 75 → 90 | Resolved | TD §Reading the Result |
| Q6 | 1 | When does kiln check-again's receipt settle at a preflight stop? | Technical | LOW | 75 → 90 | Resolved | TD §The Preflight Stop |
| Q7 | 1 | Where is a no-report reason shown when there is no session? | Technical | LOW | 65 → 90 | Resolved | TD Display Contract, Interfaces; PRD AC-PREFLIGHT-06 |
| Q8 | 1 | Entry-point table: Start is browser-only; Resume includes kiln continue at the review | Technical | LOW | 85 → 95 | Resolved | TD §When the Preflight Is Due |
| Q9 | 1 | Order of the planned-as-needing-you card vs Mark complete-first layout on a Kiln-record-only stop (conflict C3) | Technical | LOW | 70 → 90 | Resolved | TD §Display Contract |
| Q10 | 1→2 | Is RUN-004 a duplicate of RUN-003 ("every press of Start")? Keep, merge or close | Business | LOW | 60 → 85 | Resolved | Assumptions RUN-003 (RUN-004 written up) |
| Q11 | 1→2 | AC-PREFLIGHT-01 proofs: kiln continue at the restart review sets due; Folder missing branch Start at Needs you runs none | Technical | LOW | 90 → 95 | Resolved | TD Verification |
| Q12 | 1→2 | Does AC-PREFLIGHT-08's no-live-controls clause need a Replaces line on AC-LIVE-02 (Live Session Control)? | Technical | LOW | 70 → 90 | Resolved | PRD AC-PREFLIGHT-08 |
| Q13 | 2 | Is "Pause after this activity" offered while a preflight runs? | Technical | HIGH | 70 → 90 | Resolved | TD §The Preflight Stop; PRD AC-PREFLIGHT-08 |
| Q14 | 2 | Paused page / restart review: what is named next when a preflight will run first? (+ launch-check stop headline copy) | Technical | MEDIUM | 65 → 90 | Resolved | TD Display Contract |
| Q15 | 2 | How does crash reconciliation recognise a check-again that launched a session? | Technical | MEDIUM | 65 → 90 | Resolved | TD §The Preflight Stop |
| Q16 | 2 | At a preflight items stop, are resume / start-again / carry-on / verify-and-advance refused? | Technical | MEDIUM | 70 → 90 | Resolved | TD §The Preflight Stop; PRD AC-PREFLIGHT-03 |
| Q17 | 2 | Row position for a preflight run before resuming an interrupted phase or wait | Technical | MEDIUM | 65 → 90 | Resolved | TD Data Models, Display Contract |
| Q18 | 2 | Should the preflight prompt protect an interrupted phase's uncommitted work? | Technical | MEDIUM | 60 → 90 | Resolved | TD §The Preflight Session |
| Q19 | 2 | "No skill found" vs "found but not resolvable": exact rule; resolver returns absent distinctly | Technical | LOW | 85 → 90 | Resolved | TD §When the Preflight Is Due |
| Q20 | 2 | due.trigger / activity trigger values for the newer entry points | Technical | LOW | 80 → 90 | Resolved | TD Data Models |

## Question notes

### Q10 + Q11 + Q12 + Q18 + Q19 + Q20 (pass 2)
Q10: RUN-003 (from AC-PREFLIGHT-01's unconditional "presses Start"; Kiln v1 AC-VIEW-02 calls the pause button Start) already settles it; no requirement points to skip-if-settled → widen RUN-003's text to name a Start that ends a pause; move RUN-004 to the validated table as Written up (covered by RUN-003; keep the ID), Status 0 open; citations RUN-004 → RUN-003 (PRD AC-PREFLIGHT-01, design header and pause row). Q11: add proofs for kiln continue at the review, kiln run --resume, none after Folder missing branch Start at Needs you, none after Needs-you Resume/Reply. Q12 (supersedes Q13's line): Replaces in part AC-LIVE-02 and AC-BOT-01 in kiln-live-session-control PRD (not AC-LIVE-01: activity = phase/audit); disabled actions show their reason as for final delivery. Q18: unconditional line in preflight-session.txt: leave uncommitted changes exactly as they are (never stash/reset/clean/commit them); stage and commit only files the skill changes, by path. Q19: resolver takes a skill name; found = enabled build-preflight or enso-method:build-preflight; zero → distinct absent (no row); two names / 0 or >1 real existing paths / any discovery read failure → unresolvable no_report; existsSync before realpath; audits map absent to today's error; planned row uses the same test. Q20: trigger values start | unpause | continue | resume per entry-point table.

### Q13 + Q15 + Q16 (pass 2)
Q13: refuse request-pause during a preflight (as PR session): pause() engine.ts:1642, controlView 609, resetControl pauseAfter 2194, Running.svelte:42; reason: pause fires right after preflight goes on (pauseDue 3903/3915) and RUN-004 Start reruns it. PRD AC-PREFLIGHT-08: "no live controls and no pause while it runs" + Replaces in part AC-LIVE-01, AC-LIVE-02 in kiln-live-session-control PRD (also answers Q12). Q15: receipt records starts_session: true in its applying checkpoint at acceptance (effects.session "starting" is overwritten to unknown by uncertainEffects, commands.ts:69-71); starting = STARTING_ACTIONS or that field, read by reconciliation (engine.ts:723) and observeControlDispatch (4975); check-again at a preflight items stop takes controlDispatch (771-775) and the start-again dispatch path; applying with no run → dispatch_not_started. Q16: refuse resume, carry-on, start-again, verify-and-advance at a preflight stop with "At a preflight stop, use Check Preflight again, Reply or Mark complete."; split resumeOffered (2121) so only reply passes; PRD AC-PREFLIGHT-03 adds "offers no other control; matching commands refused with a reason naming these three".

### Q7 + Q14 + Q17 (pass 2)
Q7 (90): Option A — Why line on the row with reason; row not a link; PhaseView.preflight.reason; PRD AC-PREFLIGHT-06 "when no session ran, the row says why instead". Q14 (88→90): restart review is Paused.svelte's Ready-to-resume form; planned row state `planned` so nextPhase() (progress.ts:303) never names it; allocated unfinished preflight is restartReview.activityKey; launch-check headlines come from existing per-kind copy via the classifier. Q17 (PRD AC-PREFLIGHT-08 requires "just above"): PreflightActivity.before records the resumed/waiting activity; row placed directly above it. Writer folding.

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
Changed after pass 1: AC-PREFLIGHT-03, AC-PREFLIGHT-06, AC-PREFLIGHT-08, AC-PREFLIGHT-01 (cites RUN-004) (no live controls), AC-PREFLIGHT-01 (pause Start, Folder missing; Replaces AC-VIEW-03, AC-SETUP-04/05)
Pass 1: 2026-11-15 · 2 existing Replaces lines (4 criteria) · 12 Replaces lines added on AC-PREFLIGHT-01/03/06/08, AC-ATTEND-01/03 (AC-PAGE-02, AC-DISPLAY-01 dropped: not changed) · 3 raised as questions (C1 Start on pause/Folder missing, C2 takeover during preflight, C3 card vs Mark complete order) — Q ids assigned after discovery

## Register re-sort
Pass 1: 2026-11-15 · 0 open entries (register holds only validated RUN-001 to RUN-003) · nothing to sort

## Noticed, out of scope
- (see Q13) pause during a preflight + RUN-004 → second preflight; handled under Q13, not separately

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 2 committed. Start pass 3 discovery.
Conformance pass 2: trigger column in due table, AC-PREFLIGHT-01 proof for pause Start after settled, bot-control §Command grammar Replaces. Its question (restart on a paused run) answered from code during checkpoint: decide() returns paused → no restart review (engine.ts ~3894, 3708-3714); one sentence added to the due table's Resume row.
