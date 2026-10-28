# Live session control — implementation phase plan

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md) · **Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md).

## Implementation order

Build and verify each phase in this order before starting the next. The three original implementation leaves closed and were published on 2026-10-27. Whole-PRD delivery audit at `d7c59a2` added Phase 4; the fresh audit after its publication added Phase 5 for the activity-time gap. Phase 5 is closed and published; the audit after Phase 5 added Phase 6 for the remaining final-delivery availability explanation. Phase 6 is now closed and published as `32264c1`. A closed leaf records its session's implementation completion; audits do not reopen those leaves.

| Phase | What it does | Depends on |
|---|---|---|
| [1: Safe terminal takeover and return](phase-1-safe-takeover-return.md) — **closed 2026-10-27** | Pause a Claude phase or audit at a safe completed operation, release it for terminal use and hand it back through the browser's existing recovery flow. | None; uses the already implemented handoff and completion-audit prerequisites. |
| [2: Live messages and delivery recovery](phase-2-live-message-recovery.md) — **closed 2026-10-27** | Send exact live instructions, show honest receipts and resolve uncertain delivery through the working takeover/return flow. | 1 (shared durable authority, safe release, terminal ownership and phase/audit return). |
| [3: Bot commands for live session control](phase-3-bot-live-controls.md) — **closed 2026-10-27** | Expose live messages, takeover and reviewed-message return through the existing bot interface. | 1 (takeover/return and shared authority); 2 (message accounting/review); external bot-control Phases 1–2 (read/authentication and durable mutation framework). |
| [4: Complete live connection and audit return wording](phase-4-live-control-state-copy.md) — **closed and published 2026-10-27** | Added by delivery audit: describe disconnected live information honestly and name the actual audit throughout terminal return. | 1 (phase/audit return); 2 (live browser availability); 3 (integrated baseline). |
| [5: Preserve takeover activity time during reconciliation](phase-5-takeover-activity-time.md) — **closed and published 2026-10-27** | Added by delivery audit: keep the last real activity time while takeover waits for release, so the elapsed-wait explanation remains truthful. | 1 (takeover gate, release reconciliation and waiting view); 2 (event replay and message recovery integrated into that reconciliation). |
| [6: Explain final-delivery live-control availability](phase-6-final-delivery-availability.md) — **closed and published 2026-10-28** | Added by delivery audit: tell the person why live messages and takeover are unavailable during final delivery. | 2 (browser availability explanation and current-session detail); 4 (current disconnected presentation). |

## Criterion ownership

| Owner | Criteria |
|---|---|
| 1 | AC-LIVE-03, AC-LIVE-04, AC-TAKE-01–05, AC-BACK-01–04 |
| 2 | AC-LIVE-01, AC-LIVE-02, AC-MSG-01–05 |
| 3 | AC-BOT-01, AC-BOT-02 |

All 20 active criteria retain one original owner. Phase 4 completes earlier AC-LIVE-02 and AC-BACK-01 gaps without taking ownership from Phases 2 and 1. Phase 5 completes AC-TAKE-05 without taking ownership from Phase 1. Phase 6 completes the remaining AC-LIVE-02 explanation under Phase 2's ownership. The phase documents mark repeated interface-wide availability, pause wording, serialization and retained-obligation constraints as also applying to later work. No criterion is retired or rewritten. The audit records below retain each historical outcome; the audit after Phase 5 confirms AC-TAKE-05 and historically left AC-LIVE-02 unchecked. Phase 6 now completes that explanation and is published; a fresh whole-PRD audit is still owed.

## Sizing decision

The whole change combines two substantial runtime capabilities with separate proof surfaces: safe operation-boundary takeover and multi-turn live input. Holding both race/restart models, terminal ownership, phase/audit completion and the bot interface in one implementation session would make verification unreliable. Three phases keep each implementation chat focused on one end-to-end capability.

Phase 1 deliberately keeps the gate, durable hold/admission journal, release accounting, ordinary-terminal ownership, audit return and browser controls together. These are the inseparable safety path of one takeover capability, supported by existing phase recovery and audit evidence code. It owns 11 criteria, including the paired deferred-pause presentation; none can be deferred to a later safety-hardening phase. Its assembled-provider and real-Git proof is part of the build, not a preliminary feasibility investigation or a later validation-only phase.

Phase 2 owns seven criteria and extends that working path with literal input, multiple-result settlement, receipts and uncertainty review through every layer. Messaging comes second because its required recovery would otherwise depend on an unfinished takeover path. Phase 3 is a small, separately deliverable command extension to another PRD's framework, with its own built-CLI/retry proof and external readiness boundary; folding it into browser delivery would create an unnecessary dependency on that framework. These are session-sized capability cuts, not storage/API/UI layers or assumed parallel lanes.

## Proof allocation and closeout

Use the single design's [Evidence and Verification Gates](kiln-live-session-control-technical-design.md#evidence-and-verification-gates) and the investigation's [remaining implementation proof](kiln-live-session-control-investigation.md#design-decisions-and-remaining-implementation-proof). Phase 1 owns safe yield, exclusive terminal return, takeover/restart/hand-back engine and Git cases, takeover HTTP races and browser pause/return states. Phase 2 owns literal-input/lifecycle and message durability cases, message-versus-takeover races, HTTP receipt/review and all remaining browser states. Phase 3 owns built-CLI and cross-interface retry/target/review cases. Each phase proves its affected compatibility boundaries and runs the repository's current full verification gate before its implementation commit.

Provider feasibility recorded during refinement is not assembled-product proof. Phases 1–2 do not depend on bot delivery; if bot code lands first, both reuse its shared journal contract. The bot prerequisite is checked again when Phase 3 becomes next; this plan does not declare that separate track complete or take ownership of it. Add earlier-design replacement back-pointers only as the implementing phase makes them true.

Phase 6 is closed and published; run a fresh whole-PRD delivery audit and test audit only when delivery is clean. They are this PRD's closeout. The external bot-control read/mutation prerequisites were checked before Phase 3; the separate bot-control inspection cleanup remains outside this track.

## Whole-PRD delivery audit — 2026-10-27

Assessed published implementation `d7c59a2` (`14a15ce` plus the publication record), with no uncommitted implementation changes. Three independent readers derived the required parts from the PRD, assumptions, design and closed phase leaves, then traced all 20 criteria from browser/bot/provider entry points. The main reader confirmed both gaps in code and checked their requirement ownership. AC-LIVE-02 and AC-BACK-01 are Partly implemented; the other 18 criteria are Implemented. No criterion was excluded, awaiting a human action, or changed outside the requirements. Phase 4 records both missing parts and their conflict checks.

This was a delivery/code-reachability audit. No implementation or test file was changed, no product tests were run, and no test-evidence grade is claimed. The validated Claude Code 2.1.311/macOS profile, tracked-operation release boundary and Kiln-controlled terminal-admission limits remain as documented. Phase 3's full-run-plus-focused-retest portfolio is not reclassified as a single green full run.

**Audit outcome:** Phase 4 was added and has since closed and been published, as recorded below. This historical audit does not establish that those repairs satisfy the whole PRD.

## Phase 4 closeout — 2026-10-27

[Phase 4](phase-4-live-control-state-copy.md) completes AC-LIVE-02 and AC-BACK-01, with independent deliverable review and test hardening. Its Repository validation section records a fresh complete current-build integration pass after the concurrent bot-control publication, plus the other verification gates. Scoped implementation is closed and published as `731c591`. The leaf’s Publication and successor section records Doug’s authorization and the unchanged-patch publication check.

The authorized fresh whole-PRD delivery audit is recorded below. Bot-control and plan-continuation remain separate tracks.

## Whole-PRD delivery audit after Phase 4 — 2026-10-27

Assessed published implementation `d81de98` (`731c591` plus its publication record), with a clean audit worktree and no uncommitted implementation changes. All four implementation/completion leaves were closed at audit entry. Three independent readers derived required parts from the full PRD, assumptions, design and applicable leaves, then traced all 20 active criteria from browser, bot, controller and provider entry points. The main reader confirmed the gap and its requirement ownership. No criterion was excluded, awaiting a human action, superseded, or changed outside the requirements.

| Criteria | Status | Reachable implementation reviewed |
|---|---|---|
| AC-LIVE-01–04 | Implemented | `PhaseDetail`, `LiveComposer`, `PausePanel`, disconnected views, deferred-pause views and `Engine.liveView`; current-session identity, state availability, paired pause wording and separate cancellation. |
| AC-MSG-01–05 | Implemented | Live HTTP routes → shared `CommandJournal` → `Engine.acceptLiveMessage` → existing Claude stdin; correlated result accounting, restart uncertainty, per-message review and explicit hand-back holds. |
| AC-TAKE-01–04 | Implemented | Takeover HTTP/bot admission → shared journal/gate → `checkpoint-hook`; `reconcileTakeoverOnce`, process/history/terminal ownership and final resume/accept guards. |
| AC-TAKE-05 | Partly implemented | Safe yield and retained hold/output are wired, but historical-event replay refreshes the time used for latest activity while release remains pending. The elapsed-wait explanation can disappear despite no new activity. |
| AC-BACK-01–04 | Implemented | Existing `PhaseHandoff` → browser/bot shared recovery → `recoverPhase`, activity-specific `doneCheck`, current audit evidence, final ownership/material checks and normal next-work scheduling. |
| AC-BOT-01–02 | Implemented | CLI grammar/input/help → authenticated versioned route → the same journal/engine; status/receipt projection, exact-token retry protection, readiness-gated handoff and reviewed-message return. |

**Audit outcome:** 19 Implemented, one Partly implemented. [Phase 5](phase-5-takeover-activity-time.md) records the confirmed AC-TAKE-05 gap and conflict check. The safety hold remains intact; this is a truthful waiting/observation-time gap, not evidence of unsafe release. No implementation or test file was changed, no product tests were run, and no test-evidence grade is claimed. Phase 4's repository validation remains its own historical evidence.

**Next unit:** implement Phase 5 in a fresh chat, then obtain a fresh whole-PRD delivery audit. Whole-PRD test audit follows only when delivery is clean. This audit uses delivery-audit's scoped commit default; publication of its documents remains held for Doug under the launch authorization recorded in Phase 4. No production changes or messages to other chats are authorized.


### Audit publication and Phase 5 launch

The audit is published as `a8f2140`. On 2026-10-27 Doug authorized this publication and the successor launch in Codex chat `01a17f70-0129-77e1-865b-b60fab99e8cc`: “Go ahead and push the audit, then launch a new chat for Phase 5 using GPT 6.1 Sol High Effort.” This lifts the audit publication hold above and authorizes the Phase 5 implementation chat with that model and effort. It does not authorize publication of Phase 5's later work, production changes or messages to other chats; the successor uses the implement skill's scoped commit default and holds publication for Doug. Phase 5 remains the next implementation leaf, followed by a fresh whole-PRD delivery audit and test audit only when delivery is clean.

## Phase 5 closeout — 2026-10-27

[Phase 5](phase-5-takeover-activity-time.md) completes AC-TAKE-05's activity-time repair. Its acceptance evidence covers durable timestamp ordering, original stream/transcript history, undated settlement, immediate fresh activity, repeated reconciliation, controller restart, built browser waiting/output/obstacles, retained tracked ownership and natural safe release. The real Claude foreground proof retains completed-operation yield with unfinished work and no cancellation signal. Independent deliverable review and test hardening are complete; no business assumption was added.

The leaf's Repository validation records the complete current-build run plus one focused retry, the unchanged-baseline timing comparison and passing other repository/package gates. It does not claim one green full invocation or alter Phase 3's or Phase 4's historical verification records. Phase 5 is published as `b8cfe5e`. The authorized next unit is a fresh whole-PRD delivery audit; test audit follows only when delivery is clean. Bot-control and plan-continuation remain separate tracks.

### Phase 5 publication and fresh audit launch

On 2026-10-27 Doug authorized publication and the successor launch in Codex chat `01a17f79-a7e3-7b40-adff-9e1a195bc47a`: “Go ahead and push Phase 5, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” Phase 5 is published unchanged as `b8cfe5e`. The shared checkout will be fast-forwarded before launching the audit on that published baseline. This approval covers this publication and the audit launch with GPT 6.1 Sol at High effort; the audit's later work uses its scoped commit default and remains held for publication. It does not authorize production changes or messages to other chats. Test audit follows only after delivery is clean; bot-control and plan-continuation remain separate tracks.

## Whole-PRD delivery audit after Phase 5 — 2026-10-27

Assessed published implementation `16881f9064db05e21ce768e33b19b2d89129f825` (`b8cfe5e` plus its publication record), in a clean isolated worktree with all five leaves closed and no uncommitted implementation changes. Three independent readers derived required parts from the full PRD, SCOPE-001, design and applicable leaves before tracing reachable browser, bot, controller and provider paths. The main reader confirmed the missing explanation and its conflict check. All 20 active criteria were assessed; none was excluded, superseded, awaiting a human action, or changed outside the requirements.

| Criterion | Status | Reachable implementation reviewed |
|---|---|---|
| AC-LIVE-01 | Implemented | `App` → `PhaseDetail`, `LiveComposer`, `PausePanel`; `CurrentPhase` overview link and `Engine.liveTarget` preserve active identity and historical exclusion. |
| AC-LIVE-02 | Partly implemented | `Engine.liveView`, composer/pause availability, exact-attempt drafts, last-known disconnected views and bot status are wired. `Running:40` and `PhaseDetail:69–74` omit the final-delivery explanation required by SCOPE-001 and the design. |
| AC-LIVE-03 | Implemented | `PausePanel` renders both peer choices, exact timing/consequences and actual phase/audit labels beside their buttons, including narrow layout. |
| AC-LIVE-04 | Implemented | `PausePanel`, `PhaseHandoff`, `Paused` and bot status distinguish requested/released/reached pauses; `Engine.cancelPause` clears only the separate deferred request. |
| AC-MSG-01 | Implemented | Live HTTP route → `CommandJournal.submit` → `Engine.acceptLiveMessage` → existing `SessionControl.sendMessage`; exact literal text, rejecting visible limit, durable order and paged inspectable receipts. |
| AC-MSG-02 | Implemented | `LiveComposer` timing text; `LiveMessages` receipt labels; `Engine.projectMessage` correlates provider session/consumption UUIDs; bounded pipe settlement never claims instruction compliance. |
| AC-MSG-03 | Implemented | Journal deduplication and repeated exact-target gate checks; durable write intent; `maybeDrain` waits for correlated terminal results; exit/restart reconstruct uncertainty without resend and retain progression holds/drafts. |
| AC-MSG-04 | Implemented | Literal human user JSON enters existing stdin; journal effects remain `session:not_started` and `plan:not_advanced`; message handling executes no shell text or permission/delivery override. |
| AC-MSG-05 | Implemented | Receipt/output/review UI and authenticated review route → `Engine.reviewMessages`; acknowledgement retains uncertainty and hold; `requireTakeoverReturn` and explicit successful hand-back enforce release/review/ownership. |
| AC-TAKE-01 | Implemented | Browser/bot journal → `Engine.acceptTakeover` → durable gate hold; packaged pre-tool denial/completed-batch yield and driver/settlement guards retain activity/plan hold through restart. |
| AC-TAKE-02 | Implemented | `reconcileTakeoverOnce` requires exact attempt exit, settled tools/tasks, tracked-child exit, history and terminal ownership; pending UI/commands/retries use those release facts without signalling cancellation. |
| AC-TAKE-03 | Implemented | Existing `PhaseHandoff` and snapshot command construction name the real activity/cwd/provider conversation, quote the command and withhold copy until history/release checks pass. |
| AC-TAKE-04 | Implemented | Shared journal and automatic admission, exact-target retries and final `recoverPhase`/`recordDone`/first-prompt ownership guards prevent successor targeting or competing Kiln ownership. |
| AC-TAKE-05 | Implemented | `observeGate` retains the newest original stream/transcript/hook activity time; replay/undated settlement do not invent activity. Reconciliation check time is separate; `PausePanel` retains elapsed wait, obstacles and output. Gate yield/drain leaves unfinished work without an automatic cancellation deadline. |
| AC-BACK-01 | Implemented | Existing recovery target → `PhaseHandoff`; actual phase or audit name/round throughout stopped reply, terminal choice and Back from your terminal, with exit-first/requirements/no-special-phrase guidance. |
| AC-BACK-02 | Implemented | `recoverPhase` evaluates before dispatch; `resumeSession` retains exact conversation/activity/round and permits unfinished/dirty work; fresh complete facts yield explicit advance with preserved unsent-reply acknowledgement. |
| AC-BACK-03 | Implemented | `doneCheck` → real phase predicates or `auditDoneCheck`/`auditCurrentness`; assigned report, repository/workspace/delivery checks and final material/ownership revalidation govern acceptance; dated errors remain stopped. |
| AC-BACK-04 | Implemented | Successful completion/dispatch resolves only current target's holds; deferred pause remains separate; normal driver/audit workflow retains billing/workspace/currentness/remediation/delivery obligations. |
| AC-BOT-01 | Implemented | CLI grammar/literal input/help → authenticated versioned route → same journal/engine; required token/ID and source exclusivity, current identity/availability/receipts/progress and shared text/JSON outcomes. |
| AC-BOT-02 | Implemented | Original-target/token retries, durable receipts, readiness-gated handoff, reviewed-message Resume/Verify and existing final ownership/completion guards; help distinguishes live send/takeover from stopped reply/deferred pause. |

**Audit outcome:** 19 Implemented, one Partly implemented. [Phase 6](phase-6-final-delivery-availability.md) carries the confirmed AC-LIVE-02 gap and conflict check. Phase 5's activity-time repair is implemented. No implementation or test file changed; no product tests were run or graded. This is a delivery/code-reachability assessment, not a new provider qualification or test audit. The Claude Code 2.1.311/macOS profile, tracked-operation release boundary and Kiln-controlled terminal-admission limits remain as documented. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run and Phase 5's full-run/focused-retest qualification remain distinct historical evidence.

**Next unit:** publish this audit after Doug approves, then build Phase 6 in a fresh chat. After its closure/publication, repeat whole-PRD delivery audit; test audit follows only when delivery is clean. This audit uses delivery-audit's scoped commit default and holds publication under the Phase 5 publication/launch authorization above. No production changes or messages to other chats are authorized. Bot-control and plan-continuation remain separate tracks.

### Audit publication and Phase 6 launch

The audit is published as `8e508c6`. On 2026-10-27 Doug lifted its publication hold in Codex chat `01a17fac-9acd-70c3-9931-5c4b69483ddd`: “Go ahead and push the audit, then launch a new chat for Phase 6 using GPT 6.1 Sol High Effort.” This authorizes publication of this audit and launch of Phase 6 with GPT 6.1 Sol at High effort. It does not authorize publication of Phase 6's later work, production changes or messages to other chats. The successor uses the implement skill's scoped commit default and holds publication for Doug. The shared checkout is fast-forwarded before launch; Phase 6 remains followed by a fresh whole-PRD delivery audit and test audit only when delivery is clean.


## Phase 6 closeout — 2026-10-28

[Phase 6](phase-6-final-delivery-availability.md) completes AC-LIVE-02's final-delivery availability explanation in both running browser views. Built Chrome checks cover Claude/Codex at desktop/narrow widths, output/session/settings retention, explicit unavailability, excluded live actions and honest disconnected/reconnected presentation. Independent deliverable review and test hardening found no material issue or evidence gap; no new business assumption was introduced.

The leaf's Repository validation records a green complete current-build `npm run verify` invocation, alongside focused browser checks. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run and Phase 5's full-run/focused-retest qualification remain distinct historical evidence. Phase 6 is published as `32264c1` under Doug's subsequent authorization below. Obtain a fresh whole-PRD delivery audit, then test audit only when delivery is clean. Bot-control and plan-continuation remain separate tracks; production changes and messages to other chats remain unauthorized.


### Phase 6 publication and fresh audit launch

Doug lifted the Phase 6 publication hold in implementation chat `01a17fc8-27a6-7802-ac03-9a0ac8c2f1ea`: “Go ahead and push Phase 6, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” Phase 6 is published unchanged as `32264c1`; the shared checkout is fast-forwarded before launching the audit on that published baseline. This authorizes publication of Phase 6 and launch of the fresh whole-PRD delivery audit with GPT 6.1 Sol at High effort. The successor uses delivery-audit's scoped commit default and holds publication of its later work for Doug. Test audit follows only when delivery is clean; production changes and messages to other chats remain unauthorized. Bot-control and plan-continuation remain separate tracks.
