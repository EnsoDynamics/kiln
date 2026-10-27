# Live session control — implementation phase plan

**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md) · **Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md).

## Implementation order

Build and verify each phase in this order before starting the next. The three original implementation leaves closed and were published on 2026-10-27. Whole-PRD delivery audit at `d7c59a2` added Phase 4; the fresh audit after its publication finds one remaining activity-time gap and adds Phase 5 below. A closed leaf records its session's implementation completion; audits do not reopen those leaves.

| Phase | What it does | Depends on |
|---|---|---|
| [1: Safe terminal takeover and return](phase-1-safe-takeover-return.md) — **closed 2026-10-27** | Pause a Claude phase or audit at a safe completed operation, release it for terminal use and hand it back through the browser's existing recovery flow. | None; uses the already implemented handoff and completion-audit prerequisites. |
| [2: Live messages and delivery recovery](phase-2-live-message-recovery.md) — **closed 2026-10-27** | Send exact live instructions, show honest receipts and resolve uncertain delivery through the working takeover/return flow. | 1 (shared durable authority, safe release, terminal ownership and phase/audit return). |
| [3: Bot commands for live session control](phase-3-bot-live-controls.md) — **closed 2026-10-27** | Expose live messages, takeover and reviewed-message return through the existing bot interface. | 1 (takeover/return and shared authority); 2 (message accounting/review); external bot-control Phases 1–2 (read/authentication and durable mutation framework). |
| [4: Complete live connection and audit return wording](phase-4-live-control-state-copy.md) — **closed and published 2026-10-27** | Added by delivery audit: describe disconnected live information honestly and name the actual audit throughout terminal return. | 1 (phase/audit return); 2 (live browser availability); 3 (integrated baseline). |
| [5: Preserve takeover activity time during reconciliation](phase-5-takeover-activity-time.md) — **open** | Added by delivery audit: keep the last real activity time while takeover waits for release, so the elapsed-wait explanation remains truthful. | 1 (takeover gate, release reconciliation and waiting view); 2 (event replay and message recovery integrated into that reconciliation). |

## Criterion ownership

| Owner | Criteria |
|---|---|
| 1 | AC-LIVE-03, AC-LIVE-04, AC-TAKE-01–05, AC-BACK-01–04 |
| 2 | AC-LIVE-01, AC-LIVE-02, AC-MSG-01–05 |
| 3 | AC-BOT-01, AC-BOT-02 |

All 20 active criteria retain one original owner. Phase 4 completes AC-LIVE-02 and AC-BACK-01 without taking ownership from Phases 2 and 1. Phase 5 completes AC-TAKE-05 without taking ownership from Phase 1. The phase documents mark repeated interface-wide availability, pause wording, serialization and retained-obligation constraints as also applying to later work. No criterion is retired or rewritten. The first whole-PRD delivery audit found 18 Implemented and two Partly implemented; the parent checklist records their completion in Phase 4. The fresh audit after Phase 4 confirms those repairs but finds AC-TAKE-05 Partly implemented; the checklist reflects that remaining gap.

## Sizing decision

The whole change combines two substantial runtime capabilities with separate proof surfaces: safe operation-boundary takeover and multi-turn live input. Holding both race/restart models, terminal ownership, phase/audit completion and the bot interface in one implementation session would make verification unreliable. Three phases keep each implementation chat focused on one end-to-end capability.

Phase 1 deliberately keeps the gate, durable hold/admission journal, release accounting, ordinary-terminal ownership, audit return and browser controls together. These are the inseparable safety path of one takeover capability, supported by existing phase recovery and audit evidence code. It owns 11 criteria, including the paired deferred-pause presentation; none can be deferred to a later safety-hardening phase. Its assembled-provider and real-Git proof is part of the build, not a preliminary feasibility investigation or a later validation-only phase.

Phase 2 owns seven criteria and extends that working path with literal input, multiple-result settlement, receipts and uncertainty review through every layer. Messaging comes second because its required recovery would otherwise depend on an unfinished takeover path. Phase 3 is a small, separately deliverable command extension to another PRD's framework, with its own built-CLI/retry proof and external readiness boundary; folding it into browser delivery would create an unnecessary dependency on that framework. These are session-sized capability cuts, not storage/API/UI layers or assumed parallel lanes.

## Proof allocation and closeout

Use the single design's [Evidence and Verification Gates](kiln-live-session-control-technical-design.md#evidence-and-verification-gates) and the investigation's [remaining implementation proof](kiln-live-session-control-investigation.md#design-decisions-and-remaining-implementation-proof). Phase 1 owns safe yield, exclusive terminal return, takeover/restart/hand-back engine and Git cases, takeover HTTP races and browser pause/return states. Phase 2 owns literal-input/lifecycle and message durability cases, message-versus-takeover races, HTTP receipt/review and all remaining browser states. Phase 3 owns built-CLI and cross-interface retry/target/review cases. Each phase proves its affected compatibility boundaries and runs the repository's current full verification gate before its implementation commit.

Provider feasibility recorded during refinement is not assembled-product proof. Phases 1–2 do not depend on bot delivery; if bot code lands first, both reuse its shared journal contract. The bot prerequisite is checked again when Phase 3 becomes next; this plan does not declare that separate track complete or take ownership of it. Add earlier-design replacement back-pointers only as the implementing phase makes them true.

After Phase 5 closes, run a fresh whole-PRD delivery audit, then test audit only when delivery is clean. They are this PRD's closeout. The external bot-control read/mutation prerequisites were checked before Phase 3; the separate bot-control inspection cleanup remains outside this track.

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
