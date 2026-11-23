# Design Refinement State — Kiln Phase Model Tiers

Started: 2026-11-22   Current pass: 5 (complete)   Status: In progress
Branch: feature/kiln-phase-model-tiers
Existing code posture: Preserve (source: TD §Existing Code)
PRD words: at start 4139 · growth baseline 4139
Last updated: 2026-11-22

## Documents
| Document | Path |
|---|---|
| PRD | docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md |
| Technical Design | docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-technical-design.md |
| Assumptions | docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-assumptions.md |
| Supporting | docs/changes/kiln-phase-model-tiers/mockups/ (5 screens) |

## Passes
| Pass | Surfaced (new) | Taken | Resolved | Assumptions | Deferred | Blocked | Dropped |
|---|---|---|---|---|---|---|---|
| 1 | 13 | 12 | 12 | 0 | 1 | 0 | 0 |
| 2 | 14 | 12 (Q12 + Q14–Q24) | 12 | 0 | 3 | 0 | 0 |
| 3 | 6 (+4 from pass-2 conformance) | 12 (Q25–Q36) | 12 | 0 | 1 | 0 | 0 |
| 4 | 4 (+1 from pass-3 conformance) | 6 (Q37–Q42) | 5 | 1 | 0 | 0 | 0 |
| 5 | 3 (+1 from pass-4 conformance) | 4 (Q43–Q46) | 4 | 0 | 0 | 0 | 0 |

## Questions
| ID | Pass | Question (one line) | Type | Impact | Conf. start → now | Status | Landed in |
|---|---|---|---|---|---|---|---|
| Q1 | 1 | Carry-on of a started activity checks its concrete model against an alias-only list; check against the unfiltered list instead, and what stop/remedy if gone? | Technical | HIGH | 55 → 90 | Resolved | TD §When an Activity Starts, §A choice that can't be used, §Delivery |
| Q2 | 1 | (TD OQ3) Does a Codex tool call / non-message item count as the first response? | Technical | HIGH | 65 → 90 | Resolved | TD §Design Decisions, §When an Activity Starts, §Data Models, §Changes to Earlier Designs |
| Q3 | 1 | Where does an activity's start come from after a crash/restart (firstResponseAt derived on load; detached process responding after Kiln died)? | Technical | HIGH | 75 → 92 | Resolved | TD §When an Activity Starts, §Data Models, §Design Decisions, §HTTP |
| Q4 | 1 | How do Codex per-model usage buckets (no scope today) fit the "counted limit" rule? | Technical | MEDIUM | 65 → 80 | Resolved by decision | TD §The launch decision, §Design Decisions |
| Q5 | 1 | What does `kiln status` report for top-level agent/model and each activity's model, incl. when read from disk with no live model list? | Technical | MEDIUM | 70 → 90 | Resolved | TD §Command line, §Snapshot, §Agents |
| Q6 | 1 | Launch decision: Codex "blocked" usage state, and a window with no percent | Technical | MEDIUM | 70 → 78 | Resolved by decision | TD §The launch decision, §Design Decisions, §Snapshot, §Data Models |
| Q7 | 1 | Same-agent row rule blocks moving a row's first choice to Codex one side at a time; save both sides together? | Technical | MEDIUM | 85 → 92 | Resolved | TD §Model defaults file, §HTTP, §Command line |
| Q8 | 1 | Codex one-automatic-attempt fingerprint for a not-started activity (drop threadId?) | Technical | MEDIUM | 85 → 88 | Resolved by decision | TD §A Wait Before the Start, §Data Models, §Design Decisions |
| Q9 | 1 | Row/card while the activity's session is launching, before any response (decided choice, Fallback tag) | Technical | LOW | 75 → 92 | Resolved | TD §When an Activity Starts, §Design Decisions, §HTTP, §Snapshot |
| Q10 | 1 | Refuse a family that can't run unattended (e.g. Haiku without auto mode) in Model defaults and Change? | Technical | LOW | 80 → 92 | Resolved | TD §A choice that can\'t be used, §Model defaults file, §HTTP |
| Q11 | 1 | Migration: saved Codex choice with empty model (GPT Sol not pinned) | Technical | LOW | 85 → 95 | Resolved | TD §Data Models migration step 2 |
| Q12 | 1 | Demanding/Mechanical tag explanation when the tier line gives no reason | Technical | LOW | 85 → 95 | Resolved | TD §The Tier Line |
| Q13 | 1 | (Conflict check C1) A not-started activity opened in a terminal gets a response there; Resume must keep that conversation. How does Kiln see that response? | Technical | HIGH | 70 → 90 | Resolved | TD §When an Activity Starts |
| Q14 | 2 | Who makes an agent "needed" for editor/Model defaults page (no route signals it); read every installed agent's model list instead? | Technical | MEDIUM | 60 → 92 | Resolved | TD §Agents, §HTTP, §Snapshot |
| Q15 | 2 | What discards the Claude billing reading when the needed-agent set changes; is the approval ever cleared? | Technical | MEDIUM | 75 → 90 | Resolved | TD §Agents Billing, §HTTP |
| Q16 | 2 | Contract for "start unknown" (unreadable history) and the interval before the on-load read: row, POST /api/model, kiln model | Technical | MEDIUM | 70 → 90 | Resolved | TD §When an Activity Starts, §Snapshot, §HTTP, §Command line |
| Q17 | 2 | At a stop on a not-started activity, which terminal command follows model.choice; can a resume-in-terminal override a later Change? | Technical | MEDIUM | 65 → 85 | Resolved by decision | TD §Design Decisions, §Snapshot, §Changes; PRD AC-PICK-07 Replaces |
| Q18 | 2 | Does `kiln account` report the other needed agent's account/usage and over-threshold marks? | Technical | MEDIUM | 70 → 92 | Resolved | TD §Command line, §Agents, §Changes |
| Q19 | 2 | Does an automatic Codex launch ending a Claude-started wait save an attempt in the activity's Codex record? | Technical | LOW | 75 → 92 | Resolved | TD §A Wait Before the Start, §The launch decision |
| Q20 | 2 | AC-FALLBACK-04 "next activity" when the current activity has no start and is waiting/stopped | Technical | LOW | 75 → 90 | Resolved | TD §The launch decision |
| Q21 | 2 | Unreadable or newer-schema Model defaults file: GET, page, CLI; can Restore overwrite it? | Technical | LOW | 70 → 88 | Resolved by decision | TD §Model defaults file, §HTTP, §Design Decisions |
| Q22 | 2 | Migration step 2 decides "started" from saved events only, before the history read; accept and say so? | Technical | LOW | 80 → 90 | Resolved | TD §Data Models |
| Q23 | 2 | PRD AC-PICK-02 "No model recorded" row vs TD (no session got a response); align PRD wording | Technical | LOW | 85 → 95 | Resolved | PRD AC-PICK-02 |
| Q24 | 2 | How long the "why the fallback wasn't used" row note stays | Technical | LOW | 80 → 85 | Resolved by decision | TD §The launch decision |
| Q25 | 2 | Help group/heading and contract entries for `kiln model` and `kiln model-defaults` | Technical | LOW | 80 → 80 | Resolved by decision | TD §Command line, §Design Decisions |
| Q26 | 2 | Codex start found only in thread history: which time is saved as firstResponseAt | Technical | LOW | 85 → 90 | Resolved | TD §When an Activity Starts, §Data Models |
| Q27 | 2 | A changed phase that its session splits: does the second child inherit the Change? (proposed no) | Technical | LOW | 90 → 92 | Resolved | TD §Resolving a Choice |
| Q28 | 2 | A Codex choice used up by the one-attempt record "counts as blocked for usage"; the card would say "ordinary usage blocked" — give the record its own label? | Technical | LOW | 80 → 90 | Resolved | TD §The launch decision, §Data Models |
| Q29 | 2 | `kiln account` when `agent` is null: today's fields null, every needed agent in other_agents[]? | Technical | LOW | 85 → 90 | Resolved | TD §Command line, §Agents |
| Q30 | 2 | Change during a takeover hold on a not-started activity (person in the terminal conversation): unavailable while the hold is in place? | Technical | MEDIUM | 65 → 85 | Resolved by decision | TD §When an Activity Starts, §Design Decisions |
| Q31 | 2 | Heads-up on an activity whose start is unknown: skip it like a started activity? | Technical | LOW | 85 → 85 | Resolved by decision | TD §The launch decision |
| Q32 | 3 | Fallback whose agent lacks the activity's skill or fails Codex launch settings: still used? where is the skill resolved? | Technical | HIGH | 72 → 88 | Resolved by decision | TD §The launch decision, §Agents |
| Q33 | 3 | Planned Delivery audit / Test audit / Pull request rows before allocation (mockups 2 and 3 draw them)? | Technical | MEDIUM | 65 → 88 | Resolved by decision | TD §When an Activity Starts (Planned rows), §Changes, Coverage; PRD AC-PICK-02; mockup 3 |
| Q34 | 3 | Wait on a not-started activity: decision names a different choice whose usage can't be read / agent not ready / model unusable | Technical | MEDIUM | 70 → 80 | Resolved by decision | TD §A Wait Before the Start, §The launch decision |
| Q35 | 3 | Is a change to the Audits choice refused while one Audits activity has started/launching/unknown? | Technical | MEDIUM | 80 → 90 | Resolved | TD §HTTP, §Command line, §Snapshot, §Resolving a Choice |
| Q36 | 3 | A needed agent that isn't installed: agents[] entry with installed:false for Start's reason and fallback warning? | Technical | MEDIUM | 85 → 92 | Resolved | TD §Snapshot, §Agents |
| Q37 | 3 | Do not-yet-allocated activities (preflight, audits, PR) count toward "needed" and AC-AGENTS-01's list? | Technical | LOW | 85 → 92 | Resolved | TD §Agents, Planned rows |
| Q38 | 3 | `settings.models.fallback.warning` holds one agent; fallbacks can name both agents — one warning per fallback-only agent (array)? | Technical | LOW | 85 → 95 | Resolved | TD §Snapshot |
| Q39 | 4 | A fallback account with no plan limits (Claude API key / Codex API key) can never be used under "no windows = unreadable"; count it as under the threshold? | Technical | MEDIUM | 70 → 90 | Resolved | TD §The launch decision |
| Q40 | 4 | A continuation of a PRD that finished before this change copies the migrated `kept` choice, so added phases ignore their tiers; should they? | Business | MEDIUM | 70 → 90 | Assumption | KEEP-003; PRD AC-KEEP-02 (+Replaces AC-CONTINUE-08); TD §Data Models, §Changes |
| Q41 | 4 | Planned Preflight row has no model contract; "none before Start" sentence contradicts mockup 1 | Technical | LOW | 85 → 92 | Resolved | TD §When an Activity Starts, §Snapshot |
| Q42 | 4 | Several counted limits at or above the threshold: which one does the decision record? | Technical | LOW | 85 → 95 | Resolved | TD §The launch decision, §Data Models |
| Q43 | 4 | On the Continue offer's plan (build-preflight design draws a planned Preflight row there), which model form do the Preflight and phase rows use: plain as before Start? | Technical | LOW | 85 → 90 | Resolved | TD The planned Preflight row |
| Q44 | 5 | Continued PRD: rows of phases finished in the earlier execution — Ran on from archived sessions, or No model recorded? | Technical | LOW | 65 → 75 | Resolved by decision | TD §When an Activity Starts, §Data Models, §Snapshot |
| Q45 | 5 | `kiln model` / `kiln model-defaults set` with effort omitted for a model that takes effort: what is saved? | Technical | LOW | 75 → 85 | Resolved by decision | TD §Command line, §Model defaults file |
| Q46 | 5 | `kiln model` in `kiln status`'s controls: when available, with what reason? | Technical | LOW | 85 → 85 | Resolved by decision | TD §Command line |
| Q47 | 5 | Folder missing restart from the base branch: a phase started but unfinished in the archived execution reruns on the resolver's choice or what it started on (AC-PICK-04)? | Technical | MEDIUM | 75 → 75 | Pending | — |
| Q48 | 5 | Continue offer: does Continue check readiness for the agents the added phases' tiers resolve to, as AC-AGENTS-01 does at Start? | Technical | MEDIUM | 80 → 80 | Pending | — |

## Question notes

### Pass 5 conformance
Fixed: Coverage AC-PICK-02 cites earlier-execution rows; POST /api/model 400 (malformed, empty effort) and 422 (omitted effort can't be filled); §Changes bot-control §Scope and concurrency; continue-added-phases §Data Models and Migration (reads each retained execution once per process). No PRD Replaces needed. Raised Q47, Q48. Not taken: moving the omitted-effort rule to the top of §Interfaces (reads fine; consolidation can revisit).

### Q43–Q46
Answered (90/75/85/85; Q44–Q46 folded as decisions), folded. Q43: Continue offer's Preflight row plain, the continuation's resolved choice with the kept test applied (Complete.svelte:142; snapshot.ts:1507-1514). Q44: phases finished in an earlier execution show Ran on from that phase's sessions in retained executions (same response test, matched by phase id), else No model recorded; read once per process, cached; unreadable archive → No model recorded with "Historical execution is unavailable or damaged."; migration step 1 covers retained executions' sessions (ExecutionHistory.svelte; local-server.ts:245; continuation-state.ts:81-95). Q45: omitted effort → agent's reported default if listed (family: newest version's), else refused "Choose an effort for <Model>; no supported default was reported."; Claude choices that take effort must name one; no-effort model refuses an effort; empty effort malformed (engine.ts:2760-2769). Q46: `model` control available in a run underway not complete, busy only like `settings`; reasons before Start / complete / disconnected; PLANNED_CONTROLS gains model (projection.ts:41,269; engine.ts:625-665).

### Pass 4 conformance
Fixed: build-preflight §Changes bullet (§The Preflight Session, §Interfaces, §Display Contract; preflight.planned gains model); merged duplicate "plan account with no windows" rule; continuation paragraph drops source-file pointer and covers the audits/preflight/PR taking the Audits row; PRD AC-KEEP-02 KEEP-003 sentence and AC-CONTINUE-08 line cover a continuation's activities; KEEP-003 title/assumption/evidence aligned ("a finished PRD set up before this change"); TD OQ2 reworded; Coverage cites the planned Preflight row. Raised Q43. Placement doubt on KEEP-003 (above vs below the line) settled by the orchestrator: Impact is LOW by assumptions-document-writing's definition (a person can change any row before it starts; nothing irreversible), so below the line stands; AC-CONTINUE-08 was written when one choice covered the whole PRD, which the entry's Evidence already names.

### Q37 / Q38 / Q41
Answered (92/95/92), folded. Q37: unallocated activities count toward needed (leaf phases not finished; preflight while planned or unfinished; audits and PR until the PR session finishes, on the Audits choice); Start's reason names them by plan rows. No setting turns completion audits off (records.ts:651-653; audit-loops.ts:35) — fix "Planned rows" sentence to "When both kinds are closed, only the pull request row shows." Q38: keep one warning object; at most one agent can be fallback-only; rewrite §Snapshot sentence. Q41: planned Preflight row shows the Audits choice (plain before Start, Will run on underway), no Change/Use the default (the Audits line changes it), can carry the heads-up; `preflight.planned` becomes `{ before, model }`; "none before Start" covers only DA/TA/PR rows (mockup 1; progress.ts:30-36; snapshot.ts:1501-1517).

### Q40
Business, 90% → assumption KEEP-003 (LOW, below the line); folded: added phases on a PRD finished before this change take their tiers unless the saved choice wasn't Kiln's default; PRD AC-KEEP-02 clause + Replaces AC-CONTINUE-08; TD continuation rule + §Changes line. Evidence: KEEP-001 covers PRDs "underway… everything it has left"; continuation-setup.ts:19.

### Q39 / Q42
Answered (90 / 95), folded. Q39: Codex has no metered route (API-key sign-in is a readiness blocker, codex-metadata.ts:46,151), so only Claude: a no-plan reading with no rate limits reads with no counted limit → as fallback passes the usage test (then billing approval and launch checks); as first choice unchanged; a no-plan reading needs no email/org (readAccount waives that condition, claude-account.ts:189); still fails on sign-in/plan/auth/provider/key-source change; a plan account with no windows stays unreadable. Q42: recorded limit = usage block or used-up attempt first; else highest percent; tie → latest reset (unknown = latest), then reading order; same rule for the fallback's limit in "wasn't used" (usage-limit.ts:38).

### Pass 3 conformance
Fixed 11: decision's first step wording; Codex fallback with no stable account not used in a wait; §A Wait wording; Audits change excludes running processes; Design Decisions Change row covers the Audits entry; §Snapshot planned rows (`state: "planned"`, in activities[] only); agents[] not-installed entries have no billing; `kiln model-defaults` read needs no PRD path or controller; §Changes adds run-restart §Command line (help groups) and bot-control `computer_setting`; PRD AC-PICK-02 planned-row sentence clarified. Raised Q38; Q37 still deferred.

### Q25 / Q26 / Q27
Answered (80 decision / 90 / 92), folded. Q25: new contracts group `models`, heading "Choose models" after "Message, pause or take over"; `kiln model` change; `model-defaults` read; set/restore/fallback new side effect `computer_setting` (no safety flags, no PRD path, no controller) (help.ts:3,35,82-101; client.ts:136-154). Q26: Codex history start time = item startedAtMs / completedAtMs for agentMessage, else turn startedAt, else read time; startedSessionId = first session in creation order with a response (records.ts:190; codex-recovery-output.ts:31-35). Q27: other split children resolve on their own; parent's change doesn't carry over; split before start → parent no longer an activity (engine.ts:8071-8075; phase-split SKILL.md:101,254).

### Q28 / Q29 / Q31
Answered (90/90/85), folded. Q28: label "one automatic attempt used", no percent, in launch.fallback.limit.label, snapshot fallback/forecast limit and the "wasn't used" reason; the record only matches a reading where Codex reports usage allowed (codex-usage.ts:44-50). Q29: with agent null, today's fields read unavailable (reason: no activity current or next), every needed agent in other_agents[] (empty once all finished); last_attempt/original_attempt as today (projection.ts:160-185); §Agents wording "an unfinished activity's fallback". Q31: no row carries the heads-up when the current activity's start is unknown or the search reaches one; settles with the read.

### Q30
Answered 85% (decision), folded. No takeover-hold gate on Change: AC-PICK-03 requires Change while paused, and a hold lasts until hand-back. A not-started activity reaches a held pause only after an attempt ended with no response (acceptTakeover needs a running process; engine.ts:1163-1180). The Change's own history read refuses it if the terminal already answered; after a Change the reopen command is withdrawn (snapshot.ts:875); a later terminal answer starts the activity on the session's choice, shown from the next read, at the latest the hand-back's dispatch; Kiln launches nothing meanwhile. Design Decisions row: a process of its session is one Kiln launched or adopted; a person's terminal isn't, and a hold alone doesn't make Change unavailable. Unverified: claude --resume writes the same transcript file the history read checks.

### Q33 / Q36
Answered (88% decision / 92%), folded (AC-PR-05 line not added: that part is already superseded by completion-audits AC-RUN-01, whose line now covers it). Q33: in a run underway, planned Delivery audit / Test audit rows (per auditStepAfterSettled, engine.ts:4947) and a planned pull request row after the last row; Will run on the Audits choice; audit rows offer Change (PRD's Audits entry), PR row doesn't; allocated row replaces it; no steps/timing/details; phase count excludes them; none before Start (mockup 1); heads-up can sit on one. Evidence: validated FALL-002 ("next phase or audit"), mockup 3 draws a planned DA row with the heads-up. PRD: AC-PICK-02 gains one sentence + Replaces AC-RUN-01 (completion-audits) and AC-PR-05 (v1). TD §Changes: completion-audits §Progress and Detail Contract. Mockup 3 lacks the PR row mockup 2 draws → redraw. Q36: agents[] also carries each needed agent that isn't installed (installed:false, no models/account, readinessErrors naming the install remedy; Claude message "Claude Code is not on PATH. Install Claude Code <min> or later and sign in."); fallback warning reads the fallback agent's entry; §Agents: a missing agent is needed by the same rule (DEF-003 substitutes only a Model defaults first choice). Executables looked up again at each refresh (kiln-command.ts:181,266; codex-metadata.ts:105).

### Q32
Answered 88% (decision); folded. Fallback used only when every agent-specific launch check passes on its agent (readiness incl. METHOD_SKILLS, model list + auto mode, Claude billing, the activity's own skill, Codex launch settings, preparation-permissions read); run only when the first choice is over the threshold; failure keeps the first choice, reason names the check. Skills resolved at allocation against the resolver's agent; re-resolved per launch against the decided agent. Heads-up skips launch-only checks. Evidence: audit/workflow.ts:105-160; engine.ts:4511-4535,4585-4626,4960-4970,5111-5180; codex-session.ts:75,89.

### Q34 / Q35
Answered (80% decision / 90%), folded. Q34: §A Wait row 3 rewritten — Claude: ends at no counted limit at 100% or unreadable; 100% keeps waiting with a reading at reset; Codex: today's release rules on that choice's account bounded by the one-attempt record. A reading naming an unusable choice (known before launch) ends the wait in the selection stop; launch checks at the end of a wait stop as found-at-launch; "Resume after a usage limit" off → no wait. Q19 paragraph: Codex first choice with no stable account → wait stops at Needs you, as today (engine.ts:7100,5897; codex-usage.ts:40-44). Orchestrator addition: a first choice with a known-before-launch problem stops with selection before the decision runs; the fallback never replaces an unusable first choice (AC-PICK-06, AC-FALLBACK-02 "nothing but a usage reading"). Q35: the Audits change is never refused for an activity's state; reaches Audits activities with no start, no launch, no process; launching/running keep the saved decision; unknown start takes it only if the next read finds no start; a row's Change follows its own state; one activity at a time (completion-audits TD:48).

### Pass 2 conformance
Fixed: AC-PICK-07 Replaces chain ends (AC-NEXT-01, AC-TAKE-03, AC-SEE-08 added; AC-STOP-05 Claude-only); §Changes gains completion-waivers §Display Contract and live-session-control §Terminal Ownership and Hand-back; start-unknown row in the row table; §A Wait wording for a used-up first choice; GET/`kiln model-defaults` read readiness on demand, readinessErrors optional; POST /api/model-defaults 409 while unreadable; Restore row refuses newer schema; Criteria Coverage updated. Raised Q28–Q31 as Pending for pass 3.

### Q18 / Q21
Answered (92% / 88%), folded. Q18: `kiln account` and full status's account keep today's fields for the reported activity's agent (`agent` names it, null when none); `other_agents[]` per other needed agent with agent, next_attempt, usage, recovery, billing; over_threshold per usage row and `data.fallback {enabled, threshold}` with the fallback on; billing loses selectionGeneration; --refresh reads every needed agent; provider_unavailable names each failed agent (projection.ts:162-201; server.ts:61-83; client.ts:219-224). Q21 (folded as decision): unparseable or newer-schema file is an error with path; GET 409 {reason, path, canRestore}; page shows reason in place of table; CLI exits 4 state_unavailable; saves refused; Restore overwrites only an unparseable file (rows default, fallback off at 95, says so); refused over a newer schema ("written by a newer Kiln; update Kiln") (records.ts:578-579; local-server.ts:130; installed-copy.ts:1-3). Restore Design Decisions row amended accordingly.

### Q19 / Q20
Answered (92% / 90%), folded. Q19: every automatic Codex launch ending a wait saves its attempt in the activity's record (whatever agent's refusal began the wait); creates the record if none, account from the decision's Codex reading, which must name a stable account; a Codex choice whose fingerprint matches the saved attempt counts as blocked for usage in both decision tests during a wait (else the decision loops); first launch ends no wait, saves nothing; person's Resume/reply and Claude launches not bounded (codex-usage.ts:26-59; codex-session.ts:77-92; engine.ts:7086-7100). Full prose in investigator's report (replace §A Wait Before the Start "While the activity hasn't started…" paragraph; add one sentence after counted-limit paragraph). Q20: heads-up on the activity Kiln launches next — current when no start and nothing launching/running, else first not-started after it; started or launch-in-progress rows never carry it; on a waiting row it shows only until the next reading (engine.ts:4848-4866; plan-reading.ts:35; mockup 3 line 95). Not the same as status's `activity` (projection.ts:328).

### Q16 / Q17
Answered (90% / 85%); folded. Conformance to check: AC-STOP-05 and AC-TERMINAL-01 are already partly superseded (AC-RECOVER-02, AC-SPACE-04, AC-OUTSIDE-01; AC-BACK-01, AC-NEXT-01/02, AC-WAIVE-02, run-restart AC-CASE-02) — the new Replaces lines may need to point to the end of those chains. Q16: load read runs in prepare() before folderGuard (kiln-command.ts:453-486; engine.ts:4109-4125), so no "checking" state; start unknown = will_run_on + change unavailable with the reopen check's reason; 409/refusal for unknown start. Orchestrator ruling: Codex not installed = unreadable; a Codex thread Codex reports it doesn't have = no response (like a missing Claude file). Q17 (85%, folded as decision): resume command offered only while model.choice equals the session's recorded choice; otherwise fresh-session command for the current agent (snapshot.ts:807,873-875,1063,1087-1090; projection.ts:478-479). Conflict-check additions: AC-TERMINAL-01 (needs-you-handoff) merged into the AC-PICK-07 line; AC-STOP-05 (v1) new line; codex-support line extended.

### Q12 / Q22 / Q23 / Q24
Folded. Q12: no-reason explanation + "with no separator, the rest after the tier word". Q22: migration step 2 decides "started" from saved evidence only (records.ts:614 sync; private-state.ts:65). Q23: PRD AC-PICK-02 last two rows → "a session of it got a response from the model" / "no session of it got a response" (PRD criterion text change). Q24 (85%, mockup 5 panel D): note shows while current; dropped on Ran on; kept in phase detail.

### Q14 / Q15
Answered (92% / 90%), folded. Q14: drop the editor/page clause from "needed"; every installed agent's model list read at start and each refresh (cheap, ~0.3s each), carried in agents[].models; GET /api/model-defaults and CLI read on demand; a signed-out agent returns its built-in list, editor shows it with the readiness problem beside it, re-read once signed in (metadata.ts:68-105; local-server.ts:482). Q15: a change in the needed set discards no reading and clears no approval; approval stays keyed to the identity fingerprint (authority.ts:61-92); not-needed Claude reading not refreshed/shown/blocking; when needed again, read and pending until it returns; Start/approval/launch read fresh (engine.ts:1724, 5607). Build notes: refreshBilling early-return (engine.ts:1481-1484) and refreshClaudeForLaunch (engine.ts:536-545) move to the per-agent Claude reader.

### Q9 / Q11
Answered (92% / 95%); folded. Q9: new row-table row for a launch under way or a running process (Will run on the session's recorded choice + Fallback tag, no Change); Change unavailable from the saved decision until the launch ends; snapshot model.choice from the launching session once decided. Q11: migration step 2 treats a choice with no model as no choice (engine.ts:1523,1535-1537,1688; records.ts:63).

### Q8
Answered 88% (residual is the build choice in case b; folded as a design decision). Fingerprint while not started: model, effort, account, generation — no thread, no activity key (record lives on the activity). Correction to TD: Codex never uses AC-AUTO-05's Needs-you rule (engine.ts:6875-6882; codex-support AC-RECOVER-03 replaced it), so the "across the two sessions" sentence is Claude Code only; for Codex the one-attempt rule applies across them (repeat refusal → new wait; unchanged reading buys no attempt). Record read/updated at each wait reading and the launch that ends it; launch saves its attempt before the process starts. Codex model/effort change allows one attempt; a launch on Claude Code leaves the record; record removed when the activity starts (either agent), later refusals use the session's record. Data Models: `codexUsageRecovery?` same shape as a session's `codex.usageRecovery`, fingerprint without the conversation. Build note: snapshot's Codex wait reason (snapshot.ts:1021) reads the activity's record while not started. Prose in the investigator's report targets §A Wait Before the Start last paragraph and §Data Models.

### Q7
Answered 92%. A save sets one or both sides of one row; refused when, with the saved sides in place, first and fallback would share an agent (reason names the agent, says change both sides in one save); also refused when a given side's family/effort isn't in the agent's current list, the list can't be read, or the threshold isn't 1–100. `POST /api/model-defaults` `{ set: { row, first?: FamilyChoice, fallback?: FamilyChoice } }` (≥1 side). Page: each side has its own Change (mockup 4 lines 52-66); Done saves every open editor in that row in one request, carrying only opened sides (so a shipped default isn't marked set); refused save keeps editors open with the reason. CLI: `kiln model-defaults set --row <…> [--first-agent --first-model [--first-effort]] [--fallback-agent --fallback-model [--fallback-effort]]`, at least one side, a side's agent and model go together (help.ts:82-100 — repeated flags can't pair). Folded.

### Q10
Answered 92%. A Claude Code model whose list entry has `supportsAutoMode: false` is treated like a model the list doesn't offer, with today's autoModeError text ("<Model> can't run unattended on this account; it needs auto mode."): Model defaults saves (page, CLI), a phase's Change (`POST /api/model` 422, `kiln model`), and the resolver's known-before-launch problems (support can change after a save). Evidence: model-list.ts:22,52,83-86; engine.ts:1516-1524,1688,4521-4524. Folded.

### Q4
Answered 80%; to fold as a design decision with the evidence gap stated (no per-model Codex bucket exists today to test against; live 0.167.2 probe returned only `codex`; one historic `codex_bengalfox`/"GPT-5.3-Codex-Spark" bucket in rollouts). Rule: Codex scopes a bucket by `normalModelSlug`, else by `limitName` equal (ignoring case) to a listed model's display name or ID from the list read with the usage; `limitId` never identifies a model; a bucket naming no model counts (incl. `codex`, unmatched names). Claude: scope name is a hyphen-separated part of the model ID (usage-limit.ts:143-147); one matcher serves both with "or equals the whole ID". Scoping serves only the launch decision; Codex refusal/release rules unchanged. TD prose in the investigator's report (target §The launch decision, counted-limit paragraph).

### Q6
Answered 78%; to fold as a design decision. Usage block (Codex ordinary usage blocked for usage) counts as at/above threshold in both tests, recorded limit "ordinary usage blocked", no percent. Orchestrator ruling on the investigator's open judgment: an ADMINISTRATIVE block is not a usage reading, so per AC-FALLBACK-02 ("nothing but a usage reading sends an activity to the fallback") it never sends the first choice to the fallback, but it does make the fallback unusable (it would fail). Codex window with no percent: unreadable, that window only. First choice's usage reads when usage-blocked or ≥1 counted window reads a percent. Fallback's usage reads only when not blocked and every counted window reads a percent. Failed reading or no windows: unreadable for either. Claude needs nothing (claude-account.ts:132-133 never keeps a row without a percent). Card wording for a block: name "ordinary usage blocked" in place of a percent (AC-FALLBACK-03).

### Q2
Answered (90%), folded. Yes, any model-issued item counts, in a NEW run field `codex.firstResponseAt`, not a widened `modelActivityAt`. Counts: item/started for reasoning, plan, commandExecution (any source but userShell), fileChange, mcpToolCall, dynamicToolCall, collabAgentToolCall, webSearch, imageView, imageGeneration, sleep; item/completed agentMessage with text; parent or child thread. Excluded: userMessage, hookPrompt, functionCallOutput, subAgentActivity, contextCompaction, review-mode markers. The one automatic attempt's record is cleared by the attempt's firstResponseAt (recordCodexUsageProgress, codex-usage.ts:29). Sleep rule (engine.ts:5910) and codexUsageRefusal's after-refusal check (codex-usage.ts:11-14) stay on modelActivityAt (messages). Rationale: Codex makes a new model request after each tool result; 123/194 of Kiln's Codex turns ran a tool before the first message; counting only messages lets a run that changed files relaunch elsewhere. Migration step 1 Codex clause: first saved item notification passing the same test (codex-session.ts:124 saves them). Remove TD OQ3. Extend codex-support Replaces line in §Changes to Earlier Designs with §Classification and bounded release ("a repeat refusal is before model activity only when the attempt's run has no first response, and any item the model issued counts, a tool call included, not only an agent message"). No PRD Replaces needed (AC-AUTO-05 says "any response").

### Q5
Answer: keep top-level `agent`, `model`, `requested_model` (bot-control AC-SEE-02; inspection.integration.test.ts:360,620,811); values from the reported activity's session, else its `model.choice`; null when none. Disconnected status reads the controller's last saved snapshot (inspection-view.json, projection.ts:139), never a model list. Also: current card of a launching session takes model.choice (snapshot.ts:701); handoffProjection/accountFacts (projection.ts:174,414,430) take the activity's agent; `kiln model` in the controller feature list (server.ts:41). Folded.

### Q1
Resolved by decision (simpler than proposed): later sessions of a started activity skip the model-list and effort checks, like a resume; launch on the concrete model it started on; a model the account no longer serves fails at launch before any response and takes the found-at-launch stop (no Change offered; remedies are the stopped-phase page's terminal card, Mark complete, Reset). Evidence: Claude accepts concrete IDs (test/fixtures/proof-gate-1/resume-headless-after-interrupt.meta.json); resumes already skip the check (engine.ts:5365, 5542); Codex list requested with includeHidden:false (codex-metadata.ts:119). Residual: what Claude emits for an unserved concrete model is unverified (80%); both paths end in the same stop, so the design holds either way — folded as a decision at ≥90% on the design choice. Implementer note: launchReadiness (engine.ts:4521) and prepareCodexLaunch (:4529) must use the started choice.

### Q3
Refined: start derived from Kiln's events/model activity or the agent's own history (Claude file, Codex thread turns), same test; only ever added; read on load, on adopted-process exit, at each wait reading, and at dispatch/Change/launch decision once the last process ended; unreadable history → start unknown, launch nothing, reopen-check stop with Check again. Evidence: claude-session.ts:241,334,371; engine.ts:1227-1239,1306-1312,4215,5457-5488; codex-session.ts:165. Folded.

### Q13
Resolved (90%): terminal responses land in the same Claude file / Codex thread, so the Q3 read covers them; started-on stays the session's recorded choice (Claude concrete model from its own run's init). Kiln's Claude terminal command passes no --model (snapshot.ts:1063). Folded with Q3.
Raised by the conflict check as a Business question (C1). Reclassified Technical: the PRD's terms already say an activity starts when one of its sessions gets its first response from the model, which a response given in a terminal is, so AC-PICK-04 governs and Resume reopens that conversation. What remains is how Kiln detects a response given outside its own stream (agent's own history, as recovery already reads). Overlaps Q3.

### Q12
Deferred (12-question cap). Proposed: say the line gives no reason, plus "from the Model tier line". 85%.

## Exploration scripts
| Script | Question | Finding |
|---|---|---|
| scratchpad turns.py, turns2.py, kilnturns.py (not in repo) | Q2 | 123/194 Kiln Codex turns and 312/2733 interactive turns issue a tool before the first message |
| scratchpad probe.mjs (not in repo) | Q4, Q6 | live Codex 0.167.2 rateLimits read returns only the `codex` bucket, limitName and normalModelSlug null |

## Conflict check
Pass 1: 2026-11-22 · 20 earlier criteria changed · Replaces lines folded (new lines on AC-PICK-01, -07, DEFAULT-02, -05, FALLBACK-01, AGENTS-01, -04, KEEP-01; merged into existing lines on PICK-07, AGENTS-02, -03, KEEP-01); TD Open Question 1 removed, its panel decision moved to §Changes to Earlier Designs, 4 earlier-design bullets added. AC-WATCH-06, AC-SEE-02, AC-CONTINUE-08, billing AC-RUN-01 checked: not changed · 1 raised as a question (C1, below) · existing lines accurate, 3 stopped short of their chain (closed by the new lines)
Changed after pass 1: AC-KEEP-02 (pass 4, KEEP-003 sentence + Replaces AC-CONTINUE-08), AC-PICK-02 again (pass 3, Q33 + conformance: planned audit/PR rows sentence + Replaces AC-RUN-01), AC-PICK-07 (Replaces lines only: AC-TERMINAL-01, AC-STOP-05 Claude-only, AC-NEXT-01 completion-waivers, AC-TAKE-03 live-session-control, AC-SEE-08 bot-control added in pass 2), AC-PICK-02 (pass 2, Q23: finished rows keyed on whether a session got a response)

### C1 (unintended, Business — enters Questions table in pass 1)
Needs-you-handoff AC-RETURN-01, AC-TERMINAL-01 and live-session-control AC-BACK-02 promise Resume keeps a terminal discussion. A not-started activity (refused before first response, or held by Pause now) offers "Open the conversation in your terminal"; if the person talks there then presses Resume, AC-PICK-07 launches a new session and the discussion is lost. Proposed: a model response in that session, even in the terminal, counts as the start, so AC-PICK-04 applies and Resume reopens it on its original choice. ~85%.

Observations (not criteria): Codex-support and usage-limit-recovery Out of Scope sections are reversed on purpose by this PRD (per-phase agents, failover, a setting shared by every PRD); maybe mention in the PRD's Changes line. Bot parity: no PRD criterion makes `kiln status` report each activity's tier and current choice (TD already does, §Command line).

## Register re-sort
Pass 1: 2026-11-22 · 2 open entries · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as Technical questions · 2 stay business (DEF-001, DEF-002, both below the line). Second reviewer doubted neither. Folded: DEF-001's "If they choose otherwise" line and boxes lack "Mechanical ships at Sonnet · high" (the stakeholder's Sonnet reluctance is the main argument against it); add it.

## Noticed, out of scope
- Claude Code installed partway through a run on a Codex-only computer moves every not-started phase to its Claude first choice at the next refresh; Claude billing then reads pending and can stop the next launch on approval (consequence of the "restores with no step" rule).
- On Paused or with nothing current, the account panel's "in use" mark has no stated owner; `kiln account` uses the next activity's agent and the panel could do the same.
- `kiln model` receipt outcome name and effect fields unspecified; the journal pattern settles them.
- Whether `kiln model` works before Start is unspecified; the PRD requires it only in a run underway.
- An older Claude session with no saved initModel carries on with its saved model alias.
- A tier-line edit mid-run shows on the plan only at the next plan read (engine.ts:8091); the launch re-reads the plan.
- The status token doesn't change when Model defaults change (file outside the record's fingerprint, engine.ts:665); harmless.
- A family's newest version lacking the saved effort now stops the run, where today's effortFor (model-list.ts:73-78) adjusts it; fits "no silent replace" but changes today's behavior.
- Concurrent saves to model-defaults.json from several Kilns and the CLI have no lock; one change can be lost (hardening).
- On a Codex-only computer a row's first choice can't move to Codex (its fallback would need Claude Code's unreadable list); only the Fallback column is editable.
- With Codex uninstalled, a not-started activity with Codex sessions sits at "start unknown" until reinstall, Mark complete or Reset.
- Reading usage at every launch adds calls to Claude's usage endpoint beyond the scheduled reads.
- AC-KEEP-02 moves an unstarted PRD whose person picked Codex (with the auto-filled GPT Sol · high) onto Claude Code tiers on a computer with both agents; the PRD says so explicitly, may surprise Codex-preferring people.
- On an account without Fable, the shipped Demanding row makes Start unavailable for a plan with a demanding phase until changed (AC-PICK-06 settles it); maybe a guide line.
- Kiln's Claude terminal command (`claude --resume <id>`) passes no `--model`, unlike Codex's; a terminal response may come from the person's default model.
- Surface-scoped Claude windows (e.g. the "Claude Code" surface) count as counted limits under the PRD's definition.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 5 committed. Pass 6: discovery (carry Q47, Q48 Pending first).
