# Live session control — implementation phase plan

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md) · **Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md).

## Implementation order

Build and verify each phase in this order before starting the next. The three original implementation leaves closed and were published on 2026-10-27. Whole-PRD delivery audit at `d7c59a2` added Phase 4; the fresh audit after its publication added Phase 5 for the activity-time gap. Phase 5 is closed and published; the audit after Phase 5 added Phase 6 for the remaining final-delivery availability explanation. Phase 6 is now closed and published as `32264c1`; the fresh audit after Phase 6 adds Phase 7 for uncertain-message review through restart. Doug requested a repeat pass before publication; that pass expands the same open Phase 7 with saved-correlation validation and observed descendant release accounting. Phase 7 is closed and published as `c02a371`; the fresh whole-PRD audit after Phase 7 added Phase 8 for the remaining live-control recovery boundaries. Phase 8 is now closed locally and awaits publication authorization before its fresh whole-PRD delivery audit. A closed leaf records its session's implementation completion; audits do not reopen those leaves.

| Phase | What it does | Depends on |
|---|---|---|
| [1: Safe terminal takeover and return](phase-1-safe-takeover-return.md) — **closed 2026-10-27** | Pause a Claude phase or audit at a safe completed operation, release it for terminal use and hand it back through the browser's existing recovery flow. | None; uses the already implemented handoff and completion-audit prerequisites. |
| [2: Live messages and delivery recovery](phase-2-live-message-recovery.md) — **closed 2026-10-27** | Send exact live instructions, show honest receipts and resolve uncertain delivery through the working takeover/return flow. | 1 (shared durable authority, safe release, terminal ownership and phase/audit return). |
| [3: Bot commands for live session control](phase-3-bot-live-controls.md) — **closed 2026-10-27** | Expose live messages, takeover and reviewed-message return through the existing bot interface. | 1 (takeover/return and shared authority); 2 (message accounting/review); external bot-control Phases 1–2 (read/authentication and durable mutation framework). |
| [4: Complete live connection and audit return wording](phase-4-live-control-state-copy.md) — **closed and published 2026-10-27** | Added by delivery audit: describe disconnected live information honestly and name the actual audit throughout terminal return. | 1 (phase/audit return); 2 (live browser availability); 3 (integrated baseline). |
| [5: Preserve takeover activity time during reconciliation](phase-5-takeover-activity-time.md) — **closed and published 2026-10-27** | Added by delivery audit: keep the last real activity time while takeover waits for release, so the elapsed-wait explanation remains truthful. | 1 (takeover gate, release reconciliation and waiting view); 2 (event replay and message recovery integrated into that reconciliation). |
| [6: Explain final-delivery live-control availability](phase-6-final-delivery-availability.md) — **closed and published 2026-10-28** | Added by delivery audit: tell the person why live messages and takeover are unavailable during final delivery. | 2 (browser availability explanation and current-session detail); 4 (current disconnected presentation). |
| [7: Preserve live session recovery safeguards](phase-7-live-session-recovery-safeguards.md) — **closed and published 2026-10-28** | Added by delivery audit: retain message uncertainty/review, validate saved correlation and preserve observed process ownership before releasing or resuming the conversation. | 1 (takeover gate, observed processes and return guards); 2 (durable message evidence, review and recovery); 3 (shared bot commands, review flags and retries). |
| [8: Complete live session control recovery](phase-8-live-session-control-recovery.md) — **closed 2026-10-28; publication held** | Added by delivery audit: complete message/return error recovery, accurate control feedback and exact terminal commands. | 1 (takeover/return and commands); 2 (messages/recovery); 3 (bot/journal); 7 (retained recovery/release safeguards). |

## Criterion ownership

| Owner | Criteria |
|---|---|
| 1 | AC-LIVE-03, AC-LIVE-04, AC-TAKE-01–05, AC-BACK-01–04 |
| 2 | AC-LIVE-01, AC-LIVE-02, AC-MSG-01–05 |
| 3 | AC-BOT-01, AC-BOT-02 |

All 20 active criteria retain one original owner. Phase 4 completes earlier AC-LIVE-02 and AC-BACK-01 gaps without taking ownership from Phases 2 and 1. Phase 5 completes AC-TAKE-05 without taking ownership from Phase 1. Phase 6 completes the remaining AC-LIVE-02 explanation under Phase 2's ownership. The phase documents mark repeated interface-wide availability, pause wording, serialization and retained-obligation constraints as also applying to later work. No criterion is retired or rewritten. The audit records below retain each historical outcome; the audit after Phase 5 confirms AC-TAKE-05 and historically left AC-LIVE-02 unchecked. Phase 6 now completes that explanation and is published. The fresh audit after Phase 6 confirms it and adds Phase 7 to complete AC-MSG-05 and AC-BOT-02. The repeat pass expands that open leaf to AC-MSG-03 and AC-TAKE-02/04 as well; original ownership remains with Phases 1–3. The audit after Phase 7 adds Phase 8 to complete AC-LIVE-02/04, AC-MSG-02/03/05, AC-TAKE-03/04, AC-BACK-02/03 and AC-BOT-01/02 without transferring ownership or reopening a closed leaf.

## Sizing decision

The whole change combines two substantial runtime capabilities with separate proof surfaces: safe operation-boundary takeover and multi-turn live input. Holding both race/restart models, terminal ownership, phase/audit completion and the bot interface in one implementation session would make verification unreliable. Three phases keep each implementation chat focused on one end-to-end capability.

Phase 1 deliberately keeps the gate, durable hold/admission journal, release accounting, ordinary-terminal ownership, audit return and browser controls together. These are the inseparable safety path of one takeover capability, supported by existing phase recovery and audit evidence code. It owns 11 criteria, including the paired deferred-pause presentation; none can be deferred to a later safety-hardening phase. Its assembled-provider and real-Git proof is part of the build, not a preliminary feasibility investigation or a later validation-only phase.

Phase 2 owns seven criteria and extends that working path with literal input, multiple-result settlement, receipts and uncertainty review through every layer. Messaging comes second because its required recovery would otherwise depend on an unfinished takeover path. Phase 3 is a small, separately deliverable command extension to another PRD's framework, with its own built-CLI/retry proof and external readiness boundary; folding it into browser delivery would create an unnecessary dependency on that framework. These are session-sized capability cuts, not storage/API/UI layers or assumed parallel lanes.

## Proof allocation and closeout

Use the single design's [Evidence and Verification Gates](kiln-live-session-control-technical-design.md#evidence-and-verification-gates) and the investigation's [remaining implementation proof](kiln-live-session-control-investigation.md#design-decisions-and-remaining-implementation-proof). Phase 1 owns safe yield, exclusive terminal return, takeover/restart/hand-back engine and Git cases, takeover HTTP races and browser pause/return states. Phase 2 owns literal-input/lifecycle and message durability cases, message-versus-takeover races, HTTP receipt/review and all remaining browser states. Phase 3 owns built-CLI and cross-interface retry/target/review cases. Each phase proves its affected compatibility boundaries and runs the repository's current full verification gate before its implementation commit.

Provider feasibility recorded during refinement is not assembled-product proof. Phases 1–2 do not depend on bot delivery; if bot code lands first, both reuse its shared journal contract. The bot prerequisite is checked again when Phase 3 becomes next; this plan does not declare that separate track complete or take ownership of it. Add earlier-design replacement back-pointers only as the implementing phase makes them true.

Phase 8 is closed locally following the whole-PRD audit after Phase 7. After publication, repeat whole-PRD delivery audit and run test audit only when delivery is clean. Those audits remain this PRD's closeout. The external bot-control read/mutation prerequisites were checked before Phase 3; the separate bot-control inspection cleanup remains outside this track.

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


## Whole-PRD delivery audit after Phase 6 — 2026-10-28

Assessed published implementation `b774f8764953b31b2cda77a4f98c8c2612750054` (`32264c1` plus its publication/launch record), with all six leaves closed and no uncommitted implementation changes. The shared checkout was current and clean; no live session marker required isolation. Three independent readers derived required parts from the full PRD, SCOPE-001, design and all six leaves before tracing browser, bot, controller and provider entry points. The main reader confirmed the restart defect and its requirement ownership. All 20 active criteria were assessed; none was excluded, superseded, awaiting a human action, or changed outside the requirements.

| Criterion | Status | Reachable implementation reviewed |
|---|---|---|
| AC-LIVE-01 | Implemented | `App` → current `PhaseDetail`, `LiveComposer`, `PausePanel`; `CurrentPhase` overview link and exact `Engine.liveTarget` retain identity, ordering and historical exclusion. |
| AC-LIVE-02 | Implemented | `Engine.liveView`, composer/pause reasons, exact-attempt drafts and last-known disconnected views; Phase 6’s final-delivery explanation is reachable in `Running` and current `PhaseDetail`, with existing controls retained. Bot projection uses the same availability. |
| AC-LIVE-03 | Implemented | Shared `PausePanel` supplies both peer choices, actual activity/round labels and exact timing/consequences beside buttons, including narrow source order. |
| AC-LIVE-04 | Implemented | `PausePanel`, `PhaseHandoff`, `Paused` and bot projection distinguish requested, released and reached states; `cancelPause` only clears the independent deferred request. |
| AC-MSG-01 | Implemented | Live HTTP → shared journal → `acceptLiveMessage` → existing Claude stdin preserves exact text, session/attempt and acceptance sequence; rejecting visible limits and paged inspectable text/time remain wired. |
| AC-MSG-02 | Implemented | Composer timing text and all receipt labels; provider session/input-UUID correlation precedes a read claim. No receipt claims instruction compliance; the restart defect below concerns the review obligation after correlated late evidence. |
| AC-MSG-03 | Implemented | Exact-target repeated admission and durable write intent; `maybeDrain` retains all accepted inputs through correlated terminal results. Exit/restart uncertainty retains automatic progression holds, text and no resend. |
| AC-MSG-04 | Implemented | Literal human user JSON reaches existing stdin; message effects remain `session:not_started` and `plan:not_advanced`, without shell execution or permission/delivery overrides. |
| AC-MSG-05 | Partly implemented | Existing exact receipt/output/review and explicit hand-back paths work, but `reconcileControl` upgrades an uncertain receipt with late `resultAt` on restart, removing its required acknowledgement from browser and engine guards. |
| AC-TAKE-01 | Implemented | Shared journal/gate acceptance durably holds the execution; packaged pre-tool denial and completed-batch yield stop before more substantive work. Driver/settlement/restart guards retain the hold. |
| AC-TAKE-02 | Implemented | `reconcileTakeoverOnce` requires exact process exit, settled admitted work/tasks, tracked identity exit, history and terminal ownership before release; pending reasons/retry use those facts without cancelling signals. |
| AC-TAKE-03 | Implemented | Existing stopped snapshot/`PhaseHandoff` names the actual activity/cwd/conversation and quotes the exact copy-only resume command, gated by release/history. |
| AC-TAKE-04 | Implemented | Browser/bot/automatic shared journal, original-target deduplication and final release/ownership guards prevent successor targeting and competing Kiln dispatch/acceptance. |
| AC-TAKE-05 | Implemented | `observeGate` and reconciliation retain original dated activity independently of check time; replay/undated rows do not invent activity. Pending UI retains elapsed wait, output, obstacles and no automatic cancellation deadline. |
| AC-BACK-01 | Implemented | Existing recovery target → `PhaseHandoff` retains actual phase/audit name and round throughout terminal, stopped reply and return guidance, including exit-first and no-special-phrase instructions. |
| AC-BACK-02 | Implemented | `recoverPhase` evaluates before dispatch; same-conversation/activity/round Resume permits unfinished/dirty work. Late complete checks produce explicit advance without sending; reply and acknowledgement choices remain. |
| AC-BACK-03 | Implemented | Real phase/audit predicates, assigned report/currentness, repository/workspace/delivery checks and final material/ownership checks govern acceptance. Fresh failures and honestly dated errors remain stopped; Verify performs no finishing/publishing effects. |
| AC-BACK-04 | Implemented | Successful explicit hand-back releases only current-target holds while independent pause, billing/workspace, currentness, remediation, audit-loop and delivery obligations remain. The missing uncertain-message acknowledgement safeguard is recorded under AC-MSG-05. |
| AC-BOT-01 | Implemented | CLI grammar/literal input/help → authenticated versioned route → same journal/engine; token/ID, exclusive input source, current identity/status/receipts and shared text/JSON outcomes remain wired. |
| AC-BOT-02 | Partly implemented | Original-token/target retries, authentication, readiness-gated handoff and review flags are wired, but the shared restart upgrade removes the per-message acknowledgement requirement from bot Resume/Verify too. |

**Audit outcome:** 18 Implemented, two Partly implemented. [Phase 7](phase-7-live-session-recovery-safeguards.md) records the confirmed shared recovery gap and conflict check. Phase 6’s availability explanation is implemented. The execution hold survives the defect until explicit hand-back; no automatic resend or automatic-advancement bypass was found. This audit changed no implementation/test files and ran or graded no product tests. It is a code-reachability assessment, not new provider qualification. The Claude Code 2.1.311/macOS profile, tracked-operation release boundary and Kiln-controlled terminal-admission limits remain as documented. Phase 3, Phase 4, Phase 5 and Phase 6 retain their distinct historical verification claims unchanged.

**Next unit:** publish this audit after Doug approves, then implement Phase 7 in a fresh chat. After its closure/publication, repeat whole-PRD delivery audit; test audit follows only when delivery is clean. This audit uses delivery-audit’s scoped commit default and holds publication under Doug’s Phase 6 publication/launch authorization above. The successor uses implement-from-requirements’ scoped commit default and holds publication of its later work for Doug. Production changes and messages to other chats remain unauthorized. Bot-control and plan-continuation remain separate tracks.


## Repeat delivery audit after Phase 6 — 2026-10-28

Doug requested one further pass before publication. Assessed `eb363a9`, whose only changes from the earlier code baseline are this PRD's first audit documents. All six implementation leaves remain closed; Phase 7 is open. Three fresh independent readers, with different criterion groupings and no prior chat history, re-derived all 20 criteria from the requirements/design/leaves and traced the browser, bot, provider, journal and recovery paths. The main reader also traced shared admission, event settlement, restart and release paths, then independently confirmed both additional gaps and the requirement conflict checks. The two previously recorded incomplete criteria remain owed by open Phase 7 rather than being counted as newly discovered gaps.

| Criterion | Repeat outcome | Missing part confirmed in code |
|---|---|---|
| AC-MSG-03 | Partly implemented — additional gap | Saved-event recovery uses per-receipt `projectMessage` without live `observeLiveMessage`'s conflicting conversation/order checks. A crash between event append and its callback can therefore treat contradictory saved correlation as accounted, bypassing the required uncertainty hold. |
| AC-MSG-05 | Not built yet — existing Phase 7 completion | Retain the earlier review requirement through restart. The repeat also confirms variants for acknowledged/failed hand-back, resolved and prior-execution receipts, plus fully saved versus partial review-operation reconciliation. |
| AC-TAKE-02 | Partly implemented — additional gap | Partial descendant capture can lose already resolved A when a later B lookup fails. Release reconciliation then clears the generic obstacle on inventory success without resolving those observations, potentially enabling terminal access while A remains alive. |
| AC-TAKE-04 | Partly implemented — same additional release gap | Final hand-back guards depend on that incomplete released gate, so unresolved already observed work can be omitted from ownership checks. |
| AC-BOT-02 | Existing Phase 7 completion; also inherits new gaps | Bot hand-back shares the uncertainty/review, saved-correlation and observed-ownership paths; all three repairs must retain its retry, review and release safeguards. |

The other 15 criteria have every required part reachable in the current code; no additional UI, pause wording, availability, ordinary return or completion-rule omission was found. [Phase 7](phase-7-live-session-recovery-safeguards.md) now completes all five affected criteria as one bounded recovery slice, with one missing-part line per criterion and the confirmed variants. This keeps the repairs together rather than creating separate small completion phases. Original ownership and all six Closed lines remain unchanged. No new business decision, supersession or provider/ownership guarantee was introduced.

**Audit limits:** no implementation or test file changed, no product tests were run or graded, and no clean whole-PRD delivery verdict is claimed while Phase 7 remains open. The existing release boundary covers already observed/tracked work, not universal discovery or containment of arbitrary downstream effects. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run, Phase 5's full-run/focused-retest qualification and Phase 6's green complete gate remain unchanged historical records.

### Repeat audit publication and Phase 7 launch

In source chat `01a17ff9-e25a-7a90-84d2-b5a2d823456d`, Doug said: “So, do it one more time, then go ahead and commit and push the changes, and then just launch a new chat on your own to address phase seven, do the implementation for it.” This lifts the prior audit publication hold and authorizes committing/publishing the repeat audit and launching the expanded Phase 7 implementation. Publish `eb363a9` and this repeat record before launch; the implementation chat reads the expanded leaf and this record. Phase 7 uses implement-from-requirements' scoped commit default; publication of its later implementation remains held for Doug. Production changes and messages to other chats remain unauthorized. Bot-control and plan-continuation remain separate tracks.

**Next unit:** implement Phase 7 in the new chat. After it closes and is published, obtain a fresh whole-PRD delivery audit, then test audit only when delivery is clean. This repeat pass does not waive those post-repair checks.

## Phase 7 closeout — 2026-10-28

[Phase 7](phase-7-live-session-recovery-safeguards.md) completes AC-MSG-03/05, AC-TAKE-02/04 and AC-BOT-02. Its evidence records uncertainty/review retention after late results, shared saved-event correlation validation, durable partial descendant observations, exact-old-attempt scanner finalization and fresh release-ledger validation. Browser, built CLI, actual supervisor deaths and real subprocess trees exercise those recovery boundaries; real Claude takeover and live-message proofs retain the existing provider qualification. Independent deliverable review and test hardening are complete; no new business assumption was introduced.

The leaf records a green complete current-build `npm run verify` invocation, focused/hardening checks and negative regressions against an untouched baseline. All seven leaves are closed and published; Phase 7 is `c02a371` under Doug’s subsequent authorization below. The authorized next unit is a fresh whole-PRD delivery audit, followed by test audit only when delivery is clean. Historical Phase 3–6 verification records are unchanged; neither the historical audits nor this phase review claims a current clean whole-PRD audit. Bot-control and plan-continuation remain separate tracks, and production changes/messages to other chats remain unauthorized.

### Phase 7 publication and fresh audit launch

Doug lifted Phase 7's publication hold in implementation chat `01a18006-cb71-71f1-934a-6bbb7830d56f`: “Go ahead and push Phase 7, then launch a new chat for the fresh whole-PRD delivery audit using GPT 6.1 Sol High Effort.” Phase 7 is published unchanged as `c02a371`; the shared checkout is current before launch. This authorizes publication of this implementation and launch of the fresh whole-PRD delivery audit using GPT 6.1 Sol at High effort. The successor uses delivery-audit's scoped commit default and holds its later publication for Doug. Test audit follows only when delivery is clean. No production changes or messages to other chats are authorized; bot-control and plan-continuation remain separate tracks.


## Whole-PRD delivery audit after Phase 7 — 2026-10-28

Assessed published baseline `bf005864c4819bbe41274b7aa414f82a9586d992` (Phase 7 `c02a371` plus its publication/launch record), with all seven leaves closed and no uncommitted implementation changes. The shared checkout was current and clean; no live session marker required a worktree. Four complete assessment rounds covered every one of the 20 active criteria with independent readers grouped differently, followed by main-reader confirmation of missing parts, skipped variants and sibling paths. No criterion was excluded, superseded, awaiting a criterion-level human action, or changed outside requirements.

| Criterion | Status | Reachable implementation reviewed and remaining omission |
|---|---|---|
| AC-LIVE-01 | Implemented | App/current detail/output → composer → paired pauses → facts; overview link, activity/round/provider/session/connection identity and historical exclusion. |
| AC-LIVE-02 | Partly implemented | State-specific controls, retained drafts and disconnected/final-delivery explanations exist; pre-write pending Send can re-enable, invalid text can silently disable it, restarted uncertainty loses running takeover, and bot Verify advertises pending-release eligibility. |
| AC-LIVE-03 | Implemented | Shared PausePanel supplies both peer timing/consequence choices, activity identity, distinct buttons and narrow source order; audit identity remains visible in the activity view. |
| AC-LIVE-04 | Partly implemented | Durable independent pauses/cancellation and requested/released/reached browser states work; bot takeover-first pause_status suppresses the separate deferred-request wording when both requests exist. |
| AC-MSG-01 | Implemented | Browser/bot literal source → shared journal/exact gate → same Claude stdin; exact text/time/order, visible rejecting limit and paged inspectable history. |
| AC-MSG-02 | Partly implemented | Timing, correlated provider receipts and no-compliance claim are wired; final observation failure can skip exit-to-uncertainty receipt settlement. |
| AC-MSG-03 | Partly implemented | Durable intent, exact-target retries and multi-turn/restart validation exist; rejected final observation can bypass endLiveMessages, leaving an accepted unaccounted input without a progression hold. |
| AC-MSG-04 | Implemented | Literal human user JSON reaches existing stdin without shell execution, permission grants or completion/delivery effects; existing authorities remain. |
| AC-MSG-05 | Partly implemented | Exact receipts, review and explicit guarded return exist; a restarted delivery_recovery hold suppresses running takeover, and combined bot review crashes can permanently block recovery. |
| AC-TAKE-01 | Implemented | Shared durable hold/admission → packaged pre-tool deny/completed-batch yield; driver/settlement/restart retain the plan/activity hold and separate deferred pause. |
| AC-TAKE-02 | Implemented | Exact process exit/finalization, admitted tools/tasks, durable descendant observations, history and terminal ownership govern release with final ledger revalidation and no cancelling stop. |
| AC-TAKE-03 | Partly implemented | Existing stopped layout, exact identity/facts, copy-only recovery and history gating are wired; first-newline substitution corrupts a quoted newline-containing cwd, including current bot handoff. |
| AC-TAKE-04 | Partly implemented | Exact-target deduplication/serialization, postacceptance hold and final ownership guards work; a verifiably finished explicitly targeted activity gets a generic stale explanation instead of reporting its ending. |
| AC-TAKE-05 | Implemented | Original activity timestamps, separate reconciliation freshness, elapsed-wait/obstacle/output presentation and no cancellation deadline remain; gate yield leaves unfinished work. |
| AC-BACK-01 | Implemented | Existing terminal/Back from your terminal flow names phase or actual audit/round throughout reply, Resume/Verify and recovery guidance. |
| AC-BACK-02 | Partly implemented | Same conversation/round, dirty Resume, explicit complete/unsent choice and final launch guards exist; audit source errors can be treated as unfinished work and permit Resume. |
| AC-BACK-03 | Partly implemented | Real phase/audit/report/currentness/workspace/repository/delivery checks and final material guards exist; several audit unavailable-source variants overwrite old rows/time instead of dated check-error recovery. |
| AC-BACK-04 | Implemented | Successful explicit return resolves only current-target holds; separate pause, billing/workspace, currentness, remediation and delivery obligations remain in normal scheduling. |
| AC-BOT-01 | Partly implemented | Strict message/take-over grammar, exact literal input, capabilities/help, identity/receipts/progress and shared text/JSON outcomes exist; pending-release Verify availability is inaccurate. |
| AC-BOT-02 | Partly implemented | Authentication, original-target/token durable retries and shared return guards exist; combined review pre-effect crashes deadlock the journal, and shared exit/restart/audit-error/command/known-ended-target omissions remain. |

**Audit outcome:** Nine Implemented, 11 Partly implemented. [Phase 8](phase-8-live-session-control-recovery.md) carries ten confirmed missing behaviors as one bounded completion slice; original ownership and all seven Closed lines remain unchanged. New missing behaviors confirmed per round: **1, 4, 4, 1**. The fourth round still found a new gap; assessment stopped at the skill's four-round limit. The last gap is the known-ended explicit-target explanation, not an ownership bypass. Phase 7's repaired late-result review retention, saved correlation and observed-descendant release accounting remain present.

**Conflict check:** All 11 PRD/change titles and summaries were shortlisted and applicable requirements/history checked. The leaf records the affected siblings and origins; no later decision supersedes these obligations, and no new assumption or replacement pointer is needed.

**Audit limits:** No implementation or test file changed; no product tests were run or graded. This is delivery/code-reachability assessment, not a current passing test gate or provider qualification. Claude Code 2.1.311/macOS, observed/tracked ownership and Kiln-controlled admission limits remain unchanged. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run, Phase 5's full-run/focused-retest qualification and Phase 6's green complete gate remain distinct historical records; Phase 7's own verification is not a whole-PRD delivery verdict.

**Publication and next unit:** This audit uses the scoped commit default and holds publication for Doug under the Phase 7 publication/audit-launch authorization quoted above and in Phase 8. Publish this audit after authorization, then implement Phase 8 in a fresh chat. The successor also uses its scoped commit default and holds its later publication. After closure/publication, repeat whole-PRD delivery audit, then test audit only when delivery is clean. No production changes or messages to other chats are authorized; bot-control and plan-continuation remain separate tracks.


### Audit publication and Phase 8 launch

Doug lifted this audit's publication hold in Codex chat `01a18027-b227-7b20-88de-35cb621a01a9`: “Go ahead and push the audit, then launch a new chat for Phase 8 using GPT 6.1 Sol High Effort.” This authorizes publication of audit `e7eb01c` and this authorization/handoff record, followed by the Phase 8 implementation launch using GPT 6.1 Sol at High effort. The audit patch is unchanged; the shared checkout is current before launch.

Phase 8 uses implement-from-requirements' scoped commit default and holds publication of its later work for Doug. This approval does not authorize production changes or messages to other chats. Build the existing Phase 8 scope, then obtain a fresh whole-PRD delivery audit after its closure/publication; test audit follows only when delivery is clean. Bot-control and plan-continuation remain separate tracks.

## Phase 8 closeout — 2026-10-28

[Phase 8](phase-8-live-session-control-recovery.md) completes the ten confirmed recovery omissions: pending feedback, final exit accounting, running uncertain restart, combined reviewed hand-back reconciliation, independent pause status, exact terminal commands, known-ended explicit-target explanations, unavailable audit checks and pending-release bot eligibility. Its leaf records criterion evidence and the final repository gate. Independent deliverable review and test hardening are complete, including the strengthened assembled snapshot/bot command proof. No new business assumption, provider capability or ownership guarantee was introduced.

The implementation is committed locally under the scoped default; publication remains held under the Audit publication and Phase 8 launch authorization above. After publication, obtain a fresh whole-PRD delivery audit, then test audit only when delivery is clean. The earlier four-round audit remains historical, with no current clean delivery verdict inferred from this implementation review. All seven earlier Closed lines and the distinct Phase 3–7 verification records remain unchanged. Bot-control and plan-continuation remain separate tracks; no production changes or messages to other chats are authorized.
