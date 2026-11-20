# Design Refinement State — kiln-pause-now

Started: 2026-11-19   Current pass: 2   Status: In progress
Branch: feature/kiln-preflight-card-fixes
Existing code posture: Preserve (source: TD)
PRD words: at start 2013 · growth baseline 2562 (reset 2026-11-20 on the user's continue)
Last updated: 2026-11-20

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-pause-now/kiln-pause-now-prd.md |
| Technical Design | docs/changes/kiln-pause-now/kiln-pause-now-technical-design.md |
| Assumptions | docs/changes/kiln-pause-now/kiln-pause-now-assumptions.md |
| Supporting | docs/changes/kiln-pause-now/mockups/kiln-pause-now.html; docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 12 | 12 | 9 | 3 | 0 | 0 | 0 |
| 2 | 13 | 13 | 13 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Which terminal lines besides the summary line change for a Pause now hold (exit progress line, restart ● line, summary while pausing)? | Business | MEDIUM | 55 → 85 | Assumption | PRD AC-PAUSE-05; PAUSE-009; TD §The Pause Now State |
| Q2 | 1 | Pausing wording after the stop but before the release (nothing running, release still pending; tracked background process alive)? | Business | MEDIUM | 55 → 75 | Assumption | PRD AC-PAUSE-03; PAUSE-010; TD §The Pause Now State |
| Q3 | 1 | How the paused page shows Claude open in the terminal (terminal_in_use after releasedAt) without disabling the columns? | Technical | MEDIUM | 70 → 85 | Resolved | TD §The Pause Now State, §The Paused Page |
| Q4 | 1 | Must Cancel fence an in-flight takeover reconciliation (stale finally writing a stop)? | Technical | MEDIUM | 85 → 90 | Resolved | TD §The Stop and Cancel, §Design Decisions, §Verification |
| Q5 | 1 | Reword the agent-facing checkpoint prompt to drop "for terminal takeover"? | Technical | LOW | 70 → 90 | Resolved | TD §Wording, §Verification |
| Q6 | 1 | Which text the paused card's "last thing Claude said" shows (pre-stop text vs reply to the deny)? | Technical | LOW | 60 → 92 | Resolved | TD §The Pause Now State; mockup frame 3 quote |
| Q7 | 1 | How lastCommand is chosen with no settle time (newest admitted in-flight vs settledAt)? | Technical | LOW | 70 → 88 | Resolved | TD §Design Decisions, §The Pause Now State (decision) |
| Q8 | 1 | Which operations the Running now row lists (top-level only vs subagent ops)? | Technical | LOW | 75 → 88 | Resolved | TD §Design Decisions, §The Pause Now State (decision) |
| Q9 | 1 | Do new hold fields leak into the bot session JSON, contradicting "no new field"? | Technical | LOW | 70 → 95 | Resolved | TD §Interfaces |
| Q10 | 1 | Terminal column drops BACK-01/TERMINAL-02's "record changed decisions" tip and "no special handoff phrase" line (conflict check, unintended) | Business | LOW | 70 → 80 | Assumption | PAUSE-008; PRD AC-PAUSE-06; mockup frame 3 |
| Q11 | 1 | Is Cancel offered while an incompatibility notice holds the pause (AGENT-04)? | Technical | LOW | 90 → 95 | Resolved | TD §The Stop and Cancel |
| Q12 | 1 | A paused audit's header: keep the running header's audit naming (loop position, deliver-when-audit-loops AC-STOP-05)? | Technical | LOW | 90 → 95 | Resolved | PRD AC-PAUSE-03, AC-PAUSE-05 |
| Q13 | 2 | AC-PAUSE-03 background-process row when the command can't be read (design makes it optional)? | Technical | LOW | 90 → 95 | Resolved | PRD AC-PAUSE-03; TD §The Pause Now State; mockup frame 2b |
| Q14 | 2 | Should the background-process row apply only after the stop (its words hold only then)? | Technical | LOW | 85 → 92 | Resolved | PRD AC-PAUSE-03; TD §The Pause Now State |
| Q15 | 2 | Mockup frame 2 lacks the two new pausing rows (Claude has stopped; waiting for a process) | Technical | LOW | 95 → 95 | Resolved | mockup frame 2b |
| Q16 | 2 | Background-Bash dev server (run_in_background) counts as `running` forever, never reaching the PAUSE-010 row; lastCommand could say it "finished" | Technical | MEDIUM | 65 → 85 | Resolved | PRD AC-PAUSE-03; TD §The Pause Now State, §Verification; mockup 2b |
| Q17 | 2 | Pre-release obstacles have no code on the saved hold, so the pausing panel can't tell an obstacle from waiting; checkpointUnavailable text says "Wait before opening Claude" | Technical | MEDIUM | 70 → 85 | Resolved | TD §The Pause Now State, §Wording, §Verification |
| Q18 | 2 | `background` from gate.tracked includes MCP servers, the command's shell, hooks while Claude exits → PAUSE-010 row flashes | Technical | MEDIUM | 85 → 90 | Resolved | TD §The Pause Now State, §Verification |
| Q19 | 2 | {next activity} in the Now/After choices when the activity is an audit or the last phase | Technical | LOW | 75 → 90 | Resolved | TD §The Pause Now State |
| Q20 | 2 | Gate-less (recovered) attempt has no running facts or stop; which pausing row? | Technical | LOW | 75 → 85 | Resolved | TD §The Pause Now State, §Wording |
| Q21 | 2 | Is Pause after offered while Pause now is pausing? | Business | LOW | 80 → 95 | Resolved | TD §The Pause Now State (written up: PRD AC-PAUSE-03/04 already settle it) |
| Q22 | 2 | 30-second waiting line: its own row (PRD) or an extra line under the row (mockup)? | Technical | LOW | 85 → 95 | Resolved | PRD AC-PAUSE-03 |
| Q23 | 2 | Where the async background-process lookup runs and whether its result is saved (snapshot is synchronous) | Technical | LOW | 85 → 90 | Resolved | TD §The Pause Now State |
| Q24 | 2 | Several background processes: one line each? | Technical | LOW | 88 → 95 | Resolved | PRD AC-PAUSE-03; TD §The Pause Now State |
| Q25 | 2 | PAUSE-010 register text lags the Q13/Q14 folds | Technical | LOW | 90 → 95 | Resolved | PAUSE-010 text |

## Question notes

### Q16/Q18 (decision)
Backgrounded = top-level op whose own result arrives while a non-ambient task it started is unsettled (background Bash); marked once by the gate. running excludes backgrounded; background = backgrounded ops (no pid) + tracked processes alive once Claude exited and its last observation finished. Residual: no recording of a background Bash's event order (task_started before the result); TD §Verification records one. Evidence gate.ts:16-17,104-106,132-143; claude-session.ts:241,289-290; engine.ts:1157-1211.

### Q17/Q20 (decision)
obstacle set/cleared on every reading, fenced; concrete error beats checkpoint text; control_unavailable (existing code, local-server.ts:551) for unrecognised hook contract under the hold and gate-less attempt still running; cleared on release, can't-reopen, takeover_pending only.

### Q14 (decision)
Before the stop Kiln waits on Claude's next command, not on a background process, so the background row needs `stopped`; row order: running → command; else stopped+background → background; stopped → Claude has stopped; else before-next-command. PRD row 2 condition narrowed to "No command is running, before the stop".

### Q6
Last thing the agent said = newest top-level Claude output line (source claude) at or before gate stop.at; without a gate stop, newest such line in the attempt's run; omitted if none; never the run's result text or lastRecordedRun. A yielded turn ends result "" terminal_reason hook_stopped (probe on Claude Code 2.1.329 in scratchpad; proof transcripts); later text comes from a self-started turn (background task notice) replying to the checkpoint. Quote, shortened with ellipsis. Mockup frame 3 sample quote implies post-command speech — change to pre-command text. Evidence claude-session.ts:364-366, stopped-phase.ts:34-35, snapshot.ts:848-849, session-output.ts:126-135.

### Q7 (decision)
lastCommand = label of newest-admitted top-level op (no agentId) in the hold's inFlight list, captured in the same gate critical section that writes held; no settle time; under a hold nothing new is admitted (checkpoint-hook.ts:28-29) so inFlight is exactly what can finish after the press. No top-level op → before-its-next-command sentence.

### Q8 (decision)
running = top-level ops (no agentId), oldest first; counts as running while unsettled or while a non-ambient task it started (tasks[*].toolId) is unsettled (background Bash, gate.ts:132-137). Agent/Task stands for its subagent. One row per parallel top-level call. Label stores tool and input separately (input by toolLineText's main-input rule factored out; tool line output unchanged), capped 200 chars with ellipsis. Running row renders Tool(input) or Tool; paused sentence names a Bash command by its input alone, other tools Tool(input).

### Q1
Three kiln run lines speak Needs you for a takeover hold: (1) phase line printed at process exit "stopped · waiting for you at <url>" amber (engine.ts:1218-1227, terminal-output.ts:99-100); (2) restart summary "phase 2b needs you" (underway-output.ts:30-31, PRD already names); (3) restart ● line "Phase 2b still needs you. Opened <url>" (engine.ts:4061-4065, underway-output.ts:74-85). Proposed: ● "Paused in phase 2b. Press Resume phase 2b to go on." (95%, mirrors "Paused before phase 3. Press Start phase 3 to go on."); phase line printed when releasedAt is first set, "paused · at <url>", not amber, no "waiting for you" (85% → assumption PAUSE-009). Delivery-recovery hold keeps today's lines.

### Q2
Row chosen from what is running, not from whether the stop happened. Add row: nothing running and stop recorded (or attempt ended) → "Pausing — Claude has stopped; Kiln is checking nothing is still running." + lid sentence (~90%). Tracked background process still alive → name it from the start of that wait: "Pausing — waiting for a process Claude started to end: {command} (process {pid}). Kiln won't stop it for you; if it's a server that keeps running, stop it and the pause completes." (75%; command via read-only ps of the tracked pid, gate.ts:17 stores pid/start only). Today's reasons: ownership.ts:14 "The old process still owns this conversation." (both cases), engine.ts:1161, 1205-1207. → PRD AC-PAUSE-03 rows + assumption PAUSE-010.

### Q5
Reword prompts/takeover-checkpoint.txt first and third sentences: "Kiln paused this activity. Finish no further substantive work. The completed operation and this conversation are saved; the person will resume the unfinished phase or audit work through Kiln or continue it in a terminal. Yield at this completed-operation boundary." Tests pin it: checkpoint-hook.integration.test.ts:28; hook-contract-replay.integration.test.ts:37 compares to recorded fixtures (claude-2.1.311/2.1.318-hook-contract.json) — TD §Verification: replay compares deny/stop reason fields against the current checkpoint text, recordings not hand-edited. No resume prompt changes. Also §Wording: live-message reason engine.ts:1095 "Pausing or paused for terminal takeover."

### Q3
Fold as decision (remaining 15% is presentation choice). After releasedAt, reconciliation records failures as obstacle {code: OwnershipError code or state_unavailable}; takeover_pending is ordinary waiting. terminal_in_use → neutral line in terminal column "Claude is open on this conversation; exit it, then press Resume."; others warnings. Columns, command and Copy stay (resume command gated on releasedAt, not state — snapshot.ts:851 today needs state released). Resume stays pressable; its refusal keeps existing code (check_unavailable, engine.ts:1823-1826), page shows its reason beside the button; paused page never renders checkError. Fix §The Paused Page: "terminal_in_use is shown beside the button" → "a Resume refusal's reason is shown beside the button". Evidence engine.ts:1216, 1323-1325, 5640; ownership.ts:56.

### Q4
Decision replacing Cancel step 3: reconciliation applies results (stop, "stopped" event, releasedAt, obstacle) only while record.liveControl?.takeover.operationId equals the captured hold's; restored delivery-recovery hold carries its receipt ID (engine.ts:891) so never matches. Cancel does not await the reading. Step 3 = project the change; timer keeps running (as after every hold end; clearing it without unsetting takeoverTimer breaks the next hold, engine.ts:1136). Verification: cancel during an in-flight reading then normal exit → no stop, no "stopped". Evidence engine.ts:1137-1149, 1217-1227, 3054.

### Q9
§Interfaces bot row: no new action, control, feature, status value or error code; JSON gains optional fields compatible readers ignore (bot-control TD:78 version compatibility): hold releasedAt/obstacle under live_control.takeover in kiln status and under takeover in session inspection; pauseNow under live_control; obstacle.code uses only existing identifiers. Precedent: history/carryOnObstacle (target.ts:16-19).

Pass 2 conformance: 2026-11-20 · AC-PAUSE-03 condition and row order aligned, PAUSE-010 naming, §Verification coverage for folded behaviors · no new questions

## Exploration scripts
| Script | Question | Finding |
|---|---|---|

## Conflict check
Pass 1: 2026-11-19 · 9 earlier criteria changed without a Replaces line (WATCH-01, BACK-03, VERIFY-02, STOPCHECK-01/02, REPLY-01, START-09, STOP-05 of deliver-when-audit-loops, PREFLIGHT-08, VIEW-02/03) · 9 Replaces lines to write · 2 existing lines rescoped (WATCH-02 header only; AGENT-03 vs AGENT-04) · 1 raised as a question (Q10: BACK-01/TERMINAL-02 terminal tip)
Changed after pass 1: AC-PAUSE-01, AC-PAUSE-02, AC-PAUSE-03, AC-PAUSE-05 (incl. new AC-CLI-01 Replaces line), AC-PAUSE-06 (AC-PAUSE-03 rows and AC-PAUSE-05 terminal lines again in the Q1/Q2 fold) (Replaces lines and the precision edits from the pass-1 fold; re-check the precision edits at completion)
Conflict folds: 9 Replaces lines written, 2 rescoped, Q10 → PAUSE-008.

## Register re-sort
Pass 1: 2026-11-19 · 4 open entries · 1 moved to design (PAUSE-006) · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as questions · 3 stay (PAUSE-002, PAUSE-007 business below the line; PAUSE-003 technical) · PAUSE-002 evidence gained the bot-parity precedent and `kiln cancel-pause`

## Noticed, out of scope
- Waiting line counts only seconds ("Waiting 7200 seconds…") on long waits; PRD keeps today's wording.
- kiln status/session inspection gate resume_command on hold.state === released (projection.ts:437) while the browser gates on releasedAt (intended under Q3).

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|
| No real Mac sleep available to agents | PAUSE-003 | The hands-on lid-close run in TD §Delivery |

## Next action
Pass 2 checkpoint committed. Next: pass-3 discovery (pass 2 surfaced 10 new, above the yield stop of 3).
