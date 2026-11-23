# Design Refinement State — Kiln Phase Model Tiers

Started: 2026-11-22   Current pass: 1 (complete)   Status: In progress
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
| Q12 | 1 | Demanding/Mechanical tag explanation when the tier line gives no reason | Technical | LOW | 85 → 85 | Deferred | — |
| Q13 | 1 | (Conflict check C1) A not-started activity opened in a terminal gets a response there; Resume must keep that conversation. How does Kiln see that response? | Technical | HIGH | 70 → 90 | Resolved | TD §When an Activity Starts |

## Question notes

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
Changed after pass 1: none (pass 1 added Replaces lines only; no criterion's requirement text changed)

### C1 (unintended, Business — enters Questions table in pass 1)
Needs-you-handoff AC-RETURN-01, AC-TERMINAL-01 and live-session-control AC-BACK-02 promise Resume keeps a terminal discussion. A not-started activity (refused before first response, or held by Pause now) offers "Open the conversation in your terminal"; if the person talks there then presses Resume, AC-PICK-07 launches a new session and the discussion is lost. Proposed: a model response in that session, even in the terminal, counts as the start, so AC-PICK-04 applies and Resume reopens it on its original choice. ~85%.

Observations (not criteria): Codex-support and usage-limit-recovery Out of Scope sections are reversed on purpose by this PRD (per-phase agents, failover, a setting shared by every PRD); maybe mention in the PRD's Changes line. Bot parity: no PRD criterion makes `kiln status` report each activity's tier and current choice (TD already does, §Command line).

## Register re-sort
Pass 1: 2026-11-22 · 2 open entries · 0 moved to design · 0 written up · 0 settled by lookup · 0 moved to technical · 0 raised as Technical questions · 2 stay business (DEF-001, DEF-002, both below the line). Second reviewer doubted neither. Folded: DEF-001's "If they choose otherwise" line and boxes lack "Mechanical ships at Sonnet · high" (the stakeholder's Sonnet reluctance is the main argument against it); add it.

## Noticed, out of scope
- AC-KEEP-02 moves an unstarted PRD whose person picked Codex (with the auto-filled GPT Sol · high) onto Claude Code tiers on a computer with both agents; the PRD says so explicitly, may surprise Codex-preferring people.
- On an account without Fable, the shipped Demanding row makes Start unavailable for a plan with a demanding phase until changed (AC-PICK-06 settles it); maybe a guide line.
- Kiln's Claude terminal command (`claude --resume <id>`) passes no `--model`, unlike Codex's; a terminal response may come from the person's default model.
- Surface-scoped Claude windows (e.g. the "Claude Code" surface) count as counted limits under the PRD's definition.

## Blockers
| Blocker | Questions affected | What unblocks it |
|---|---|---|

## Next action
Pass 1 committed. Start pass 2: discovery (carry Q12 Deferred first), scope-gated, state file passed in.
