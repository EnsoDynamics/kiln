# Design Refinement State — Kiln Audit Loop Limits

Started: 2026-11-14   Current pass: 3   Status: In progress
Branch: feature/kiln-audit-loop-limits (worktree .worktrees/kiln-audit-loop-limits/kiln)
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 2687 · growth baseline 2687
Last updated: 2026-11-14 (pass 1 checkpoint)

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md |
| Technical Design | docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md |
| Assumptions | docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-assumptions.md |
| Supporting | docs/changes/kiln-audit-loop-limits/mockups/kiln-audit-loop-limits.html; docs/design/kiln-architecture-proposal.md (Principles only); AGENTS.md "The Enso Method stands alone" |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 13 (10 discovery + 2 conflict + Q1 carried) | 13 | 10 | 1 | 1 | 0 | 1 |
| 2 | 8 (3 repeats) | 11 (Q9, Q14, Q15 carried + 8) | 10 | 0 | 1 | 0 | 0 |
| 3 | 1 (0 repeats) | 3 (Q21, Q24 carried + 1) | 3 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Does Allow/Accept at an `items_listed` stop on an accepted `passed` test report with `changedImplementation: true` let `auditNext` skip the required delivery audit? (TD Open Questions) | Technical | MEDIUM | 50 → 95 | Resolved | TD §Loop Stops, §Loop Ledger, gate table, Verification |
| Q2 | 1 | Does Continue with N phases (AC-CONTINUE-05) reset both loop counts? Proposed: yes, restart at zero, keep settings (conflict check) | Business | MEDIUM | 80 → 85 | Assumption | RUN-003; PRD AC-LOOP-04, AC-DELIV-01; TD §Loop Ledger, §Upgrade |
| Q3 | 1 | Mark complete at a loop_limit stop on an accepted report: unwaivable per TD vs WAIVE-001 "waive anything", and AC-STOP-02 says "as at any Needs you stop". Proposed: keep unwaivable, align AC-STOP-02 wording (conflict check) | Business | LOW | 85 → 92 | Resolved (reframed: wording) | PRD AC-STOP-02 |
| Q4 | 1 | Allow/Accept at a needs_you loop stop: carry_on launch excludes audits and builds a phase prompt — need an audit launch kind in requestedLaunch/launchAtStop (C1) | Technical | HIGH | 55 → 90 | Resolved | TD §Loop Stops, Verification |
| Q5 | 1 | How allow-more-loops/accept-and-deliver dispatch and settle receipts when the session isn't a stop launch (new activity; delivery leaf) (C2) | Technical | HIGH | 60 → 85 | Dropped (reframed → Q14) | — |
| Q6 | 1 | Allow on an unsettled needs_you activity: requestedLaunch is in-memory, so which record write appends the loop? (C6) | Technical | MEDIUM | 70 → 90 | Resolved | TD §Loop Ledger |
| Q7 | 1 | Earlier Accept sentences must reach every later test audit (incl. non-last loops after Allow), not only last-loop prompts (C4) | Technical | MEDIUM | 75 → 95 | Resolved | TD §Prompts, Verification |
| Q8 | 1 | Recording page vs command line for settings changes and Accept: receipt source is "caller" for both; add optional via input as waive-and-advance does (C5) | Technical | MEDIUM | 85 → 95 | Resolved | TD §Interfaces, §Settings, §Loop Ledger, Verification |
| Q9 | 1 | Activity holding two loops (needs_you continued by Allow): which label/duration/did per row, detail, stop page (C7) | Technical | MEDIUM | 70 → 93 | Resolved | TD §Loop Ledger, §Display, §Snapshot, Verification |
| Q10 | 1 | Should allow-more-loops/accept-and-deliver catch up an untouched branch and take --leave-branch-as-is like reply/carry-on (C8) | Technical | LOW | 65 → 90 | Resolved | TD §Loop Stops |
| Q11 | 1 | Ledger reconstruction at upgrade: in Engine constructor (like activityHistory) rather than before first gate decision, so a stopped upgraded run shows counts (C9) | Technical | LOW | 80 → 95 | Resolved | TD §Upgrade, Verification |
| Q12 | 1 | Continuation allocated and completed at once under a waived readiness problem (completeAuditAtOnce): not a loop (C10) | Technical | LOW | 80 → 95 | Resolved | TD §Loop Ledger, Verification |
| Q13 | 1 | Where the "Audit loop left" row lives (built from stop.loop beside run rows, not in stop.checks) and how an Acceptance is marked used (C11) | Technical | LOW | 75 → 90 | Resolved | TD §Loop Ledger, §Loop Stops, §Display, Verification |
| Q14 | 1 | Reframed from Q5: Allow/Accept need no allocation of their own except at a needs_you stop; elsewhere one write saves epoch/Acceptance, clears stop, settles like Check again (loops_allowed / acceptance_recorded, session not_started) and the gate starts the session | Technical | HIGH | 85 → 92 | Resolved | TD §Loop Stops, §Interfaces, Verification |
| Q15 | 1 | TD Open Questions RUN-001 alternative claims 'the gate and ledger are unchanged' — under it Mark complete must let one loop start when none is left; how is that recorded? (conformance) | Technical | LOW | — → 90 | Resolved | TD Open Questions (RUN-001) |
| Q16 | 2 | Under RUN-001's case, Mark complete's offer sentence (forecastNext) says it runs added phases / moves to test audit while the gate will hold (N1) | Technical | MEDIUM | 80 → 92 | Resolved | TD §The Loop Gate, §Loop Stops, §Interfaces, Open Questions |
| Q17 | 2 | Accept session's passed report must put each accepted outstanding item in `settled` (with id, how quoting the sentence) or validate-report refuses it (N2) | Technical | MEDIUM | 85 → 95 | Resolved | TD §Loop Ledger, §Loop Stops, §Prompts, Verification |
| Q18 | 2 | What a loop_limit stop stores in stop.checks and what each Check again run records; markCompleteOffer order (N3) | Technical | LOW | 80 → 92 | Resolved | TD §Loop Stops |
| Q19 | 2 | Which Acceptance is a session's own when one activity holds two Accept sessions (sessionId on Acceptance) (N4) | Technical | LOW | 80 → 90 | Resolved | TD §Loop Ledger, §Prompts |
| Q20 | 2 | A row's `criterion` lost when an item is relisted by id: PersonItem gains optional criterion (N5) | Technical | LOW | 80 → 90 | Resolved | TD §Report Contract, §Prompts |
| Q21 | 2 | Labelling upgraded runs' observed loops beyond the limit ("loop 4 of 3", "used 5 of 3"); what reads `observed` (N6) | Technical | LOW | 75 → 92 | Resolved | TD §Upgrade, §Display, Verification |
| Q22 | 2 | Pull request line: which sentences (all of that session's `carried`) and which report summary (N7) | Technical | LOW | 80 → 90 | Resolved | TD §Prompts, Verification |
| Q23 | 2 | needs_you test stop's `loop` flag: set once or recomputed on every recheck as limits change (N8) | Technical | LOW | 75 → 90 | Resolved | TD §Loop Stops, §The Loop Gate, §Display |
| Q24 | 2 | TD §Changes to Earlier Designs misses Completion Audits design (AC-RUN-01/07, AC-TEST-02/03, AC-LOOP-02/03 sections still live?) and Live Session Control design (AC-BACK-03/04) (conformance) | Technical | LOW | — → 92 | Resolved | TD §Changes to Earlier Designs |
| Q25 | 3 | At an items_listed loop_limit stop, a raised limit + Check again: run continues as today (delivery audit, then fresh test round) and that round is not a loop — PRD AC-LOOP-03 counts only a continuation or an Allow session there | Technical | LOW | 85 → 95 | Resolved | TD §Loop Stops, Verification |

## Question notes

### Q1
Carried from the TD's Open Questions. Answer (95%, code trace): yes it skips — chain [delivery, A, B] vouches via untouchedBetweenAudits (src/audit/workflow.ts:50-79; validate-report.ts:39-41; engine.ts:4142-4166). Same hole for Accept at a test_work_saved stop whose continue_test also changedImplementation. Fix: at a stop whose held test report changedImplementation, Allow/Accept record epoch/Acceptance, clear the stop and let auditNext run delivery_audit (not a loop); the next test round is the control's session. Investigator also asked whether holding at that stop is worth it at all — PRD AC-TEST-02 settles it (stop), so not raised.

### Q2
Answer 85%: Continue counts as a Start; both counts restart at zero; settings kept. Evidence: engine.ts:3057,3079 fresh execution; continuation-setup.ts:20 copies settings; Continue TD:309; AC-CONTINUE-05/08; Doug 2026-11-14 "a dozen iterations". Against: TOTAL-001 "continue accumulating". Folding as RUN-003 + AC-LOOP-04 + Replaces AC-CONTINUE-05 + TD ledger/upgrade.

### Q3
Reframed to a wording fix: PRD already settles it (AC-STOP-02 "as at any Needs you stop" + AC-WAIVE-02 = Mark complete only where a check fails; loop_limit stop has none). Doug approved mockup screen 2 (4ad96b8) with no Mark complete; WAIVE-001 is about wrong checks; Billing approval row precedent (waivers TD:77, snapshot.ts:700). Fold: reword AC-STOP-02's Check again/Mark complete row to say Mark complete appears only where a check fails, so not at a stop that holds an accepted report.

### Q7
95%: new template audit-earlier-acceptances.txt quoting each used Acceptance (activityKey set) except the session's own, with via and time; carried by every test audit session before delivery; in {{loops}} for new activities (after audit-loop-limits, before audit-accept/Allow note) and beside the replacement text for a resumed-activity launch (carry_on builds from resume-carry-on-audit.txt + task.instructions, prompts.ts:162, not audit-session.txt); joins session `carried`. Delete "It then quotes every earlier Acceptance" from audit-loop-limits bullet.

### Q10
90%: No catch-up, no --leave-branch-as-is for Allow/Accept. AC-CURRENT-01 covers a stopped phase's session; run-restart PRD:189 leaves audit stops on today's recovery; stoppedPhase/refreshStoppedWork skip audits (engine.ts:5936,5911); catch-up list engine.ts:758-762. Reply at a loop stop unchanged.

### Q9
88% (deferred): PhaseView.loop → loops?: {number,limit,last,sessionId}[]; row shows last, detail lists all; a test loop's sessions = activity sessions from its sessionId to next loop's session; sessionId set in launchSession write; duration = runTiming of those sessions; "did" = summary of latest report received between first session createdAt and next loop's session (AuditResult has no sessionId, contracts.ts:95-100; reports engine.ts:2522, 4203); absent when none. Delivery loop: duration of its leaves' sessions, did names appended phases. Evidence engine.ts:4574-4602, snapshot.ts:1305, PhaseDetail.svelte:44-48. Gap to 90: timestamp attribution of reports to sessions.

### Q13
90%: needsYouView adds "Audit loop left" row from stop.loop only for loop_limit (like Billing, snapshot.ts:702), never in stop.checks/stop.run; needs_you stop with loop gets no such row. markCompleteOffer (engine.ts:1822-1834) refusal reason at loop_limit must say holding because no loop of that kind left (today says "Every check passed. Check again advances without a waiver."). Acceptance.activityKey set when the Accept session is committed (allocateAudit write for new; resumed activity key in the launch-commit write, per Q6); never by completeAuditAtOnce.

### Q4
90%: requestedLaunch gains kind "audit"; launchAtStop handles it in its own branch like runAuditSession: recordStartCommits, emitAudit(activity,"started"), launchSession(key, activity.kind, auditPrompt(activity), {started}), no startedAs. auditPrompt fills {{loops}} from the ledger as started() will save it, so a restart relaunch rebuilds the same prompt. Reply keeps its audit resume path (resume→recheckStop→requestedResume→resumeSession, auditRecoveryTask; engine.ts:2056-2087, 2464-2469, 4666). carry_on never offered at audit stops (2158-2166, 5934-5942, 1661); launchAtStop phase-only (4309-4342). Admission accepts a new session on an unsettled needs_you activity (admission.ts:129-130,144).

### Q6
90%: For a session on an unsettled activity, the launch's started() writes the whole control in the write that clears the stop: epoch+limit+loop (Allow) or Acceptance with activityKey (Accept). Crash before → only the stop; after → counted pending activity relaunched (engine.ts:448, 4786, 4868, 5024-5025, 3857, 4097).

### Q14 (reframed from Q5)
85%: At a needs_you stop, Allow/Accept dispatch under their own receipt like carry-on: controlDispatch, requestedLaunch audit kind, settles session_started or dispatch_not_started. Elsewhere: one record write saves epoch+limit (Allow) or Acceptance (Accept), clears loop_limit stop, stamps controlApplied; control settles like Check again (loops_allowed / acceptance_recorded, session not_started, kick after); the gate starts the session under Kiln's automatic receipt; interrupted with nothing saved and stop in place → not_applied, like Mark complete. Evidence engine.ts:3932, 544, 704-710, 721-726, 779-790, 812, 1767-1783, 4097-4106. Allocating in the control's write would leave a pending activity behind a stop on crash. Gap: confirm receipt outcomes and the controlApplied reconciliation. Conflicts left in TD for Q14: §Loop Stops says accepted-report-stop Allow/Accept 'allocate a new test audit activity'; §Interfaces says the two actions 'settle like start-again'.

### Q19
90%: append to TD "Which loop a session belongs to": "A session's own `Acceptance` is the one that starts it: for a launch from the Accept control, the control's own; for any other launch, including a relaunch after a restart, the `Acceptance` on that activity whose `sessionId` is absent or names the activity's last session record with no run, which `launchSession` reuses (run restart "A session record with no run"). Every other used `Acceptance`, one on the same activity included, is earlier. The session with an own `Acceptance` gets `audit-accept.txt`." Reason: auditPrompt builds before launchSession picks the id (engine.ts:4168 vs 4574); "latest marker" would be wrong after a later Allow. Evidence engine.ts:4574-4600, 3859-3864, 2302.

### Q21
85% (deferred): for §Upgrade: "Observed loops take `limitAtStart` from the migrated limit, 3. Each kind is numbered in activity order. `last` is false on every observed loop, so rows read **loop N of 3**, past the limit too ("loop 4 of 3"), and the stop heading counts them all ("Test audit loops used: 5 of 3"), never clamped. An observed loop's detail, and its line on a stop page, add "counted from this run's history when Kiln was upgraded"." And TD:58 comment: `last` is `number == limitAtStart`, never for `observed`. Basis: PRD:100 heading = counted + current limit; AC-SHOW-01 "last loop" = the last one allowed; observed loops' prompts never said last. Doubt: display judgment ("loop 4 of 3" reads oddly).

### Q16 Q18 Q23
Full prose in the pass-2 investigator report; summarized: Q16 gate decision as pure function; forecastNext asks it (stopped audit treated as settled with countedOutcome, never writes); nextActivity {kind:"loop_stop", key, title}; next wording "…then stops at Needs you because no delivery/test audit loop is left…". Q18 recordStop(key,"loop_limit",[],loop) stores checks [] + finished stop run; each held Check again updateStop(key,[],false) new recheck run; loop_limit branch before recheckStop's doneCheck fallback (5393-5402); recheckRunsCompletion false for loop_limit (5242-5250); markCompleteOffer tests loop_limit right after nothing-waiting check, offered:false no awaitingRecheck, reason text; held Check again settles completion_checks_failed (810). Q23 PhaseStop.loop stored only on loop_limit; loopStopOf(key) derives items_listed live for a done_check test stop whose latest attempt is needs_you and no test loop left; status token includes settings (636); ledger absent → not a loop stop, Check again retries the rebuild.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-14 · 22 earlier criteria changed (+ validated UI-004) · 5 existing Replaces lines verified accurate · 13 Replaces lines added on 8 criteria (AC-TEST-04 skipped: already superseded by AC-NEUTRAL-02, not changed) · 2 raised as questions (Q2, Q3); AC-CONTINUE-05 Replaces line waits on Q2
Changed after pass 1: AC-LOOP-04, AC-DELIV-01 (Q2), AC-STOP-02 (Q3)

## Register re-sort
Pass 1: 2026-11-14 · 2 open entries · 0 moved to design · 1 written up (RUN-002 part: upgraded run runs under Always stop and ask, 3 and 3) · 0 settled by lookup · 0 moved to technical · 0 raised as questions · 2 stay business (RUN-001 above the line, title restated to the narrower Mark-complete-at-failing-check case, Gate 1 found WAIVE-006 wording; RUN-002 below the line). Folded 2026-11-14 (RUN-001 restated, Impact MEDIUM → LOW; RUN-002 (part) Written up).

## Noticed, out of scope
- Completion Waivers TD:233 names Live Session Control §Terminal Ownership and Hand-back, but the reverse pointer in the Live Session Control TD names §Display Contract (pre-existing mismatch).

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Phase 7: final conformance + conflict re-check (AC-LOOP-04, AC-DELIV-01, AC-STOP-02) running; then final verification.
