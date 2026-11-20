# Technical Design: Kiln Pause Now

**PRD:** [Kiln Pause Now](kiln-pause-now-prd.md) · **Assumptions:** [Kiln Pause Now assumptions](kiln-pause-now-assumptions.md) · **UI contract:** [mockup](mockups/kiln-pause-now.html) · **Builds on:** [Control a live Kiln session technical design](../kiln-live-session-control/kiln-live-session-control-technical-design.md)

## Overview

Pause now is the existing safe takeover, renamed and re-presented. The hold, its provider gate, its release and its hand-back stay as they are; no identifier, route, journal action, bot command or status value changes. Three things are new underneath the wording:

1. **The stop becomes a durable gate fact**, written the first time the gate acts on a hold (a denied operation, a yielded batch, or sealed input). It is the boundary Cancel is checked against.
2. **Cancel pause and keep going** is a browser-only live instruction that withdraws a takeover hold before the stop, in the same critical section the gate uses.
3. **One engine projection, the Pause now state** (`pausing` or `paused`), drives the header, the phase plan row, the pause panel, the paused page, the terminal summary line and `kiln status` wording, so no surface re-derives it from hold internals.

## Existing Code

**Posture: Preserve.** Everything this design touches is published and in use.

- Reused unchanged: the `take-over` journal action, `POST /api/live/take-over`, the bot `take_over` action and `kiln take-over`; the attempt gate and checkpoint hook; release reconciliation; terminal ownership admission; `POST /api/resume` with its takeover `note` and the existing already-complete advance; the carry-on path for a conversation that can't be reopened; the end-of-activity pause and its cancel.
- Reused, with an added field: the gate state, the takeover hold, the live snapshot.
- Behavior to keep that the code alone doesn't make obvious: a hold reaches the running session only through the gate's three responses (deny, yield, seal) and through refusing new live input. Nothing is sent, signalled or interrupted. This is what makes Cancel before the stop safe (PAUSE-005), and nothing in this build may add another effect of a hold on the session.
- The delivery-recovery hold (an uncertain message) shares the takeover record but is not Pause now: it keeps its own page, wording and behavior throughout.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| What Pause now is | The existing `take-over` instruction, under the new name everywhere a person reads it. Machine-read names (`take-over`, `take_over`, `takeover_requested`, `effects.takeover`, compatibility feature `takeover`) stay. | AC-PAUSE-02 says it does exactly what takeover does today; PAUSE-006 keeps bot-facing values. A rename of identifiers would break scripts for a wording change. |
| Where the stop is recorded | In the attempt gate, inside its critical section, by whichever of the three gate responses first acts on the current hold. | The gate is the only place that can tell "nothing sent yet" from "Claude was told to stop", and it already serializes hook decisions with hold admission. Recording it anywhere else would race the hook. |
| How Cancel is admitted | Under the controller admission boundary and the gate critical section: refused once the stop is recorded, otherwise the gate's hold is removed first, then the saved takeover hold. | One lock decides between Cancel and the stop, so a cancel and a deny can't both win. Removing the gate's hold first means a crash between the two writes leaves a hold that no hook honors, which startup finishes removing (§Cancel). |
| Cancel with an uncertain message on the attempt | The hold returns to the delivery-recovery hold that uncertainty creates, re-derived from the receipts; otherwise the saved hold is removed. | "As if Pause now had not been pressed" (AC-PAUSE-04): a Pause now pressed from the uncertain-message recovery replaces that recovery's hold today, so withdrawing it must give it back. |
| When "Paused" begins | A `releasedAt` time set on the hold the first time release is observed, or the first time the attempt has ended and its conversation can't be reopened. It is never cleared while the hold lasts. | Reconciliation keeps running after release and turns the hold back to pending when, for example, the person opens Claude on the conversation. Today that flips the page back to "Pausing". The person is paused from the release on; a later failed observation is an obstacle on the paused page, not a return to pausing. |
| Which page an immediate pause lands on | A held Pause now (any takeover hold that is not delivery recovery, once its attempt has ended) gets its own screen. The existing recovery page keeps ordinary stops and delivery-recovery holds. | The paused page shares little with the recovery page: no checks section, two peer columns, Pausing and Paused states, and a different header. A branch inside the recovery page would multiply its conditions. The feature state stays `needs_you` underneath, so Resume, advance, carry-on and reset keep their existing admission. |
| Naming the command | The gate records each operation's display line at admission, using the session output's existing tool-line format, capped at 200 characters. The hold records which operations were in flight when Pause now was accepted. | AC-PAUSE-03 and AC-PAUSE-05 name the running and last command. The hook already receives the tool input at admission, and the gate survives a controller restart; scanning saved events for it would be a second reader of the same fact. |
| Retaining a take-over instruction ID in the browser | Kept only while the answer is uncertain, then forgotten. | Today it is kept after success, so a Pause now pressed again after a Cancel would replay the old instruction and get its old receipt without a new hold. |
| Cancel on the command line | None (PAUSE-002). | The approved scope. The journal action is browser-only and is not added to the bot contract, help or capability features. |

## The Stop and Cancel

Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Safe Checkpoint and Release (a pending takeover hold can be withdrawn before its stop).

**The stop.** The gate state gains `stop?: { at, by: "deny" | "yield" | "seal", operationId }`, bound to the hold's operation ID. It is written once, in the same critical section that returns the response: the checkpoint hook's first `PreToolUse` deny or `PostToolBatch` yield under the hold, or the session adapter's drain sealing input under the hold. Later responses leave it as written. A gate without a hold never records a stop. The field is additive; gate schema 2 readers that predate it ignore it, and nothing older can hold a Pause now this build creates.

An attempt without a gate (a legacy attempt waiting for natural exit) has no stop to observe: its stop is its exit, and Cancel is offered until the attempt ends.

**Cancel.** A `cancel-take-over` journal instruction carries `{ instructionId, target }` and the take-over hold's instruction ID. Its receipt is written before any effect. Admission requires a takeover hold (not delivery recovery) whose target and instruction match, no recorded stop for that hold, and a connected browser. Then, in order:

1. Inside the gate critical section, recheck the stop and remove the gate's hold. A stop recorded first refuses the cancel with code `already_paused` and the PRD's wording.
2. Replace the saved hold: with the delivery-recovery hold re-derived from unresolved uncertain receipts on the attempt, or with nothing.
3. Stop the takeover reconciliation timer and project the change. Live input availability, the pause panel and `kiln status` return to their unpaused state because they read the hold.

The take-over receipt stays `takeover_requested`; the cancel receipt records `takeover_withdrawn`. A separately requested end-of-activity pause is a different record and is untouched. A later Pause now is a new instruction and a new hold.

**Restart.** Startup reconciles an unsettled cancel receipt before admitting other live actions: if the gate no longer holds its take-over, finish step 2 and settle it `takeover_withdrawn`; if the gate still holds it, settle it `not_applied` and the pause continues. Settled take-over receipts are not re-reconciled, so a withdrawn hold is never recreated.

**Sleep while pausing (PAUSE-003).** No timer, signal or deadline in the hold depends on wall-clock progress: the stop happens when the gate next acts, which needs the session to run, and the gate hooks fail closed (a hook that times out on wake blocks the new operation rather than allowing it). Keep-awake holds idle sleep only, so closing the lid sleeps the machine as today. The design adds nothing for sleep; the lid-close run under §Delivery confirms the assumption on real hardware.

## The Pause Now State

The engine projects one state for the activity under a takeover hold that is not delivery recovery:

```
PauseNowView:
  phase: "pausing" | "paused"
  activityKey, label            — "phase 2b", "delivery audit · round 2"
  requestedAt
  releasedAt?                   — present exactly when phase is "paused"
  stopped: boolean              — the gate recorded the stop (Cancel withheld from here on)
  running: string[]             — display lines of operations admitted and not yet settled, newest last
  lastCommand?                  — display line of the last operation in flight at the press, once settled
  waitingSeconds?               — today's 30-second waiting figure (AC-TAKE-05)
  obstacle?: { code, reason }   — anything other than ordinary waiting for the attempt or its evidence
  cancel: { available, reason? }
```

`phase` is `paused` from `releasedAt` on, otherwise `pausing`. Ordinary waiting (attempt still running, completed-operation evidence pending) is never an obstacle; ownership, history, gate and checkpoint failures are. After the release an obstacle shows on the paused page without changing its header.

With no hold, the panel is the idle pair from AC-PAUSE-01: heading **Pause**, **Now** then **After {activity}** in reading order, so Now comes first on narrow screens. Every surface reads this projection:

| Surface | `pausing` | `paused` |
|---|---|---|
| Header (running overview, session page, held page) | New header kind: **Pausing {activity}**, amber outline with the progress arc, beside the phases done | The existing Paused look: **Paused in {activity}**, phases done, "Paused {time} · {how long ago}" from `releasedAt` |
| Phase plan row | Keeps its running pill; never Needs you | **Paused** |
| Pause panel | The pausing wording per AC-PAUSE-03, chosen from `running`, `waitingSeconds` and `obstacle`; Cancel per `cancel`; a pending end-of-activity pause stays below with its own cancel | Not shown, except a pending end-of-activity pause with its cancel |
| Terminal summary line | Unchanged while the session runs | "paused in {activity}" where it says "needs you" |
| `kiln status` text | "Pausing — …" with the panel's sentence | "Paused" where it says "Paused for terminal takeover" |

The paused card's sentence uses `lastCommand` when set ("Kiln stopped after {lastCommand} finished. Nothing is running."), otherwise the before-its-next-command sentence. The eyebrow, the last thing the agent said, and the two columns follow AC-PAUSE-05 and AC-PAUSE-06 and the mockup.

## The Paused Page

The held screen shows, in order of precedence (each replaces what follows it while it applies):

1. Uncertain messages to acknowledge (AC-MSG-05), as today.
2. While pausing: the pausing panel. No terminal command and no resume controls.
3. When the conversation can't be reopened (the hold carries its reopen check): the existing carry-on and fresh-terminal cards, under the Paused header.
4. Otherwise the two columns. **Resume {activity}** calls the existing takeover resume, with `note` when the Note for Claude box has text. The terminal column shows the existing released command and fresh-session disclosure.

Resume's answers keep their existing handling: `terminal_in_use` is shown beside the button; `already_complete` shows the existing advance choice and keeps the note unsent; an advance that then fails its checks shows the existing checks section with Check again and Mark complete. Nothing else adds a checks section to this page (PAUSE-004). Below the columns: a pending end-of-activity pause with its cancel, the full session output link, and the billing, development delivery and reset panels, as today.

## Interfaces

| Route | Request and response |
|---|---|
| `POST /api/live/cancel-take-over` (new) | `{ instructionId, target: LiveTarget, takeoverInstructionId }` → `200 { ok: true, receipt, outcome: "takeover_withdrawn" }`. Errors use the live error shape: `409 already_paused` ("Kiln had already paused. Press Resume once it’s paused to carry on."), `409 stale_target`, `503 state_unavailable` when the gate or record can't be written durably. Same-ID retries return the original receipt. |
| `POST /api/live/take-over`, `POST /api/resume`, `POST /api/check-again` | Unchanged. |
| Snapshot | `liveControl.pauseNow?: PauseNowView` beside the existing `liveControl.takeover`. |
| Bot command contract and help | Wording only: "Pause now" where it says "Pause & take over", and the status text above. No new action, feature, field or value. |

Data model additions, all optional and additive: gate `stop` and per-operation `label`; gate hold `inFlight` (operation IDs at acceptance); saved hold `releasedAt` and `obstacle`. The private execution schema does not change version.

## Wording

Every place a person reads the action's name says **Pause now**: the pause panel, the unavailable reasons (Codex, preflight, final delivery, message submission pending, unsupported Claude Code, disconnected), compatibility notices (the `takeover` feature's display name), `kiln status` and its help, the bot command contract's descriptive text, the reset explanation, the uncertain-message recovery, the final-delivery notes on the running and session pages, and the README. The Folder missing page's takeover wording stays (Out of Scope). The build's check is a search for "take over" and "takeover" in user-facing strings, each hit either renamed or listed as an intended keeper.

## Integration Points

- **Claude Code hooks:** the existing `PreToolUse` and `PostToolBatch` hooks write the stop and the operation label. No new hook event, no new provider capability.
- **Session adapter drain:** writes the stop when it seals input under a hold.
- **Journal:** one new browser-only action, `cancel-take-over`, reconciled at startup like other live actions.

## Verification

| Criteria | Evidence |
|---|---|
| AC-PAUSE-01, 02, 03, 05, 06 (presentation) | Built-view screen tests at desktop and narrow widths for every mockup state, each unavailable reason, the pausing rows, the paused card with and without a last command, the carry-on precedence, Resume's three answers and the absence of checks; terminal summary and `kiln status` text tests from engine fixtures. |
| AC-PAUSE-02 (behavior unchanged) | The existing takeover, release, ownership and hand-back integration suites pass untouched apart from wording, plus the real-provider takeover proof. |
| AC-PAUSE-04 (Cancel) | Real-process gate tests: cancel before any operation, during a running command, racing a deny, a yield and a seal (each order once), and after the stop; crash between the two writes, then restart. A real Claude Code proof: Pause now during a long command, cancel, and the next command starts with no denied call or extra turn (PAUSE-005's spike). Cancel with an uncertain message restores delivery recovery. |
| "Paused" survives later observations | Release, then open Claude on the conversation: the header stays Paused, the obstacle shows, Resume is refused with its reason. |
| PAUSE-003 | The lid-close run under §Delivery. |

## Delivery

- **Hands-on work:** one lid-close run on a real Mac (PAUSE-003): press Pause now during a long command, close the lid, wake it, and confirm the session stops after that command with nothing new started. It exercises the hold, which this build doesn't change, so it can run against today's Pause & take over before the build starts. Needs a person to close and open the lid.
- **Expected build spend:** a few short real Claude Code sessions for the Cancel and takeover proofs, under a few dollars.
- **After the build:** a `CHANGELOG.md` Unreleased entry when the branch merges to `develop` (Changed: Pause & take over is now Pause now, with the paused page; Added: cancel a pending pause), then a release per the release guide when the maintainer asks for one.

## Open Questions

None. PAUSE-005 is settled by the code read recorded in §Existing Code and is proved by the Cancel spike under §Verification. PAUSE-003 remains a technical assumption until the lid-close run.
