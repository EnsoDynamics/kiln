# PRD: Control a live Kiln session

**Status:** Phases 1–6 are closed and published. The [whole-PRD delivery audit after Phase 6](kiln-live-session-control-phase-plan.md#whole-prd-delivery-audit-after-phase-6--2026-10-28) confirms final-delivery availability and finds a restart gap in uncertain-message review under AC-MSG-05 and AC-BOT-02. [Phase 7](phase-7-uncertain-message-review-restart.md) completes those safeguards, followed by a fresh whole-PRD delivery audit and test audit only when delivery is clean. Paired pause UX and mockups remain approved as of 2026-10-26.

**Source:** Doug's request, 2026-10-26, Codex chat `01a17a97-2bec-7bf1-8774-e81cae357b69`: send instructions to a running phase or audit, or pause it for terminal takeover and hand it back through the existing flow. Doug subsequently confirmed: “wait until a safe completed operation,” without waiting for the whole task to finish, and make that timing clear in the UI.

**In service of:** Kiln product; a bounded change, not a phase of another PRD.

**Depends on:** The implemented [Needs you handoff](../kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) and existing [completion audits](../kiln-completion-audits/kiln-completion-audits-prd.md). Browser delivery is independent of [bot control](../../prds/kiln-bot-control/kiln-bot-control-prd.md); the command extension below ships when both capabilities are available.

**Review alongside:** [Interactive HTML mockups](mockups/kiln-live-session-control.html) · [Assumptions](kiln-live-session-control-assumptions.md) · [Runtime investigation](kiln-live-session-control-investigation.md).

## Summary

Let a person send a message to the Claude conversation Kiln is currently running, without ending it. Below that message box, show both pause choices together under **When should Kiln pause?** Offer **Pause & take over**: stop that session, preserve its conversation and work, and show the exact command and folder for continuing in a terminal. When the person exits Claude, Kiln's existing **Back from your terminal?** section lets them resume unfinished work or verify finished work and advance.

The same controls cover implementation phases, delivery audits and test audits. Audits keep their actual names and rounds. The planned bot interface gains both actions, using the same rules as the browser.

## Business Context

During a test audit, Doug needed to say: finish this batch, merge the branch into develop and push, then carry on. The browser had no way to deliver that instruction, and a separate Claude conversation could not reach the headless session. Waiting for the entire audit to end defeats the purpose.

A live message is an instruction, not proof that the requested action happened. Takeover must wait for a safe checkpoint without cancelling an in-flight operation. The observed Claude runtime can read a message at a tool boundary before the overall turn ends; its existing interrupt can cancel a running tool, so simply exposing that interrupt would not meet this requirement.

An **activity** is one implementation phase or one delivery/test-audit round. A **session** is its saved Claude conversation; an **attempt** is one running process using that conversation. A **safe checkpoint** is the earliest point where the agent has finished its in-flight operation (such as the current tool call), saved enough context to continue, and can yield before starting another substantive operation. Necessary checkpoint and cleanup work is allowed; completing the rest of the batch, phase, audit or session is not a prerequisite. **Safe to take over** additionally means Kiln has ended its attempt, reconciled its running tools and released the conversation for terminal use. It does not claim an entire batch or phase is complete.

## Acceptance Criteria

### Act on the conversation that is running now

The person sees the message composer and both clearly labeled pause choices with the session's output, with enough identity to avoid steering the wrong work.

- [x] **AC-LIVE-01 — Both actions live in the active session view.** The current activity's session-detail view places **Message Claude** directly below live output, followed by **When should Kiln pause?**, with the two choices in AC-LIVE-03 visible together above the existing progress/session facts. The running overview links to that view with **Control live session**. The activity title, audit round where applicable, provider, session identity and connection state remain visible. Historical sessions never acquire live controls merely because they are being viewed.
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the added composer, grouped pause choices and affected running/session-detail arrangement; unaffected layout and style remain).
- [x] **AC-LIVE-02 — Availability is explained in every state.** Browser controls and bot status follow this table. Disabled actions show the reason; they never imply a successful request. On narrow screens the message composer comes first, then the takeover choice, then the end-of-activity pause; each keeps its timing and consequence beside its button.
  - Replaces in part: AC-WATCH-01, AC-WATCH-02 and AC-VIEW-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (transport loss labels retained state and time as last known; it does not establish that work stopped or enable terminal recovery).
  - Replaces in part: AC-LIMIT-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a disconnected waiting state remains last known rather than implying a proven interruption).

  | State | Message | Pause / terminal takeover | What the person sees |
  |---|---|---|---|
  | Running Claude attempt controlled by this Kiln | Nonempty text can be sent | Pause & take over | Live output and message composer, then both pause choices grouped under When should Kiln pause? (AC-LIVE-03) |
  | Message submission pending | Prevent repeat submission | Wait for that submission's outcome before pausing | Submitting; no delivery claim yet |
  | Pausing or reconciling a recovered process | Unavailable | Pending; no usable resume command yet | Stopping status, latest output, explanation that terminal use must wait |
  | Paused for terminal takeover | Live send unavailable | Copy exact resume command | Needs you with the existing terminal and hand-back sections |
  | Kiln restarted and no longer owns the running attempt's input | Unavailable; retain unsent draft | Pause & take over holds progression and waits for proven safe release | Input connection lost; no forced interruption while the old operation may still be running |
  | Browser disconnected / controller unreachable | Unavailable | Unavailable | Last-known state and observation time; reconnect before acting |
  | Completed, waiting for usage, between activities, or ordinary Needs you | No live controls | Existing state-specific controls | Recovery and deferred-pause behavior stays recognizable |
  | Running Codex session | Unavailable under SCOPE-001 | Unavailable under SCOPE-001 | Claude-only explanation; existing Codex controls remain |

### Choose when to pause without guessing what “pause” means

Taking over unfinished work and letting Kiln finish the current activity are different intentions. Show both choices together so the person can compare when Kiln stops and what happens next.

- [x] **AC-LIVE-03 — The two pause choices explain their timing and result.** Under **When should Kiln pause?**, display the following peer choices. Use the actual phase identifier or audit name/round. Neither control is labeled just “Pause” or “Pause now”; the takeover choice does not imply abrupt interruption. Meaning must be clear from words, without relying on color, icons, a tooltip or opening another page.
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the paired pause region; unaffected layout and styling remain).

  | Choice | Visible timing and explanation | Action |
  |---|---|---|
  | **Take over this session** | **At the next safe stopping point.** Finish the current operation, then stop before starting more work. Open the same conversation in your terminal; the phase/audit can remain unfinished. | **Pause & take over** |
  | **Let {activity} finish first** | **After the whole phase/audit.** Kiln finishes its work, commits, pushes and required completion checks, then waits before starting the next activity. No terminal takeover is needed. | **Pause after this phase** / **Pause after this audit** |

- [x] **AC-LIVE-04 — Pending and completed pauses remain distinguishable.** The visible states and action labels follow the table below. Preserve any independently requested end-of-activity pause when takeover is requested or handed back; show that pending request and its separate cancellation action. Cancelling it never cancels takeover or resumes stopped work.
  - Replaces in part: AC-VIEW-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (replace “Keep going” and ambiguous pending/reached pause presentation; deferred timing and persistence remain).
  - Replaces in part: AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (the human-facing cancellation wording and pause status; `cancel-pause` and its deferred semantics remain).

  | State | Required wording and available next action |
  |---|---|
  | Takeover requested, operation still running | **Pausing for takeover — finishing the current operation.** Explain that the terminal becomes available after Kiln releases the conversation; never imply the whole phase/audit must finish. |
  | End-of-activity pause requested | **Will pause after {activity} finishes. Current work continues.** Keep live messaging and takeover available under their usual rules. Offer **Cancel end-of-phase pause** / **Cancel end-of-audit pause**, not “Keep going.” |
  | Takeover ready | **Paused for terminal takeover.** Offer the exact conversation command and existing hand-back flow. |
  | End-of-activity pause reached | **{activity} finished. Paused before the next activity.** Retain the existing action for starting the next eligible activity, clearly labeled with that destination; do not offer resuming the finished conversation as the way to continue. |

  These labels apply wherever Kiln exposes the affected browser controls, including the running overview and session detail. Bot status carries the same distinction; existing command names and deferred-pause behavior remain unchanged.

### Send an instruction without restarting the session

A message can change what the agent does next. Kiln must distinguish delivery to the conversation from compliance with the instruction.

- [x] **AC-MSG-01 — Send preserves the exact message and conversation.** **Send message** submits nonempty plain text to the displayed active Claude attempt without restarting it or opening a peer conversation. Leading/trailing whitespace is not silently rewritten. The text and its submission time remain inspectable beside that session's output. Later messages preserve accepted order. Any input limit is visible before submission and rejects rather than truncates text.
- [x] **AC-MSG-02 — Timing and receipt are honest.** The composer says **“Claude reads this at its next opportunity. The current tool may finish first.”** Sending does not interrupt a tool or guarantee an immediate response. Receipt distinguishes **Submitting**, **Sent to session — not confirmed read**, **Received by Claude** only when supported by correlated provider evidence, **Not sent**, and **Delivery uncertain**. No receipt claims a requested merge, push, pause or other action happened; the session's subsequent output supplies that evidence.
- [x] **AC-MSG-03 — An ending attempt cannot lose or redirect a message silently.** Sending revalidates the targeted activity, conversation and attempt. A stale request is refused, never sent to the next activity or a replacement attempt. Once accepted, a message is either accounted for in that conversation or explicitly unresolved; a first turn result alone cannot discard pending messages or permit automatic advancement past unresolved delivery. An uncertain outcome holds progression for recovery and is never automatically resent. A refused or unsent message remains available to copy or revise.
  - Replaces in part: AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-AUTO-02/03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (unresolved live-message delivery holds Claude automatic recovery/advancement, including restart; ordinary recovery remains).
- [x] **AC-MSG-04 — A message is the person's instruction, not a new Kiln permission.** Kiln delivers the text as user input and retains existing workspace, billing, completion and delivery rules. The example “after this batch, merge into develop and push, then carry on” reaches Claude literally; whether and how it is authorized remains subject to those rules. The control itself never executes shell text, merges, pushes or bypasses an audit.

- [ ] **AC-MSG-05 — Uncertain delivery has an explicit recovery path.** Show the exact message, its receipt and **View session output**. Offer **Pause & take over** under the same safe-checkpoint rules if the attempt is still running, or the existing terminal handoff once it has ended. The person can inspect and resolve the instruction in that conversation. In the existing hand-back section, **I reviewed this message in the conversation** acknowledges each uncertain receipt without resending or relabeling it as provider-confirmed. Acknowledgement alone never resumes or advances: the execution stays held until an explicit Resume or successful Verify/advance, even if the original attempt already ended without a takeover hold. Resume/Verify remain unavailable until this acknowledgement and the usual ownership checks pass. A disconnected view explains that reconnecting is required first.

### Pause, release the conversation, and take over

The takeover action keeps Kiln open but prevents it from continuing the plan while the person works. The terminal command becomes usable only after the old attempt is gone.

- [x] **AC-TAKE-01 — The pause holds this activity and the plan.** Accepting **Pause & take over** immediately holds automatic advancement and automatic recovery for this execution, then requests that the active session yield at the next safe completed-operation checkpoint (as defined above), before starting more substantive work. The activity is not marked complete or failed solely because the person interrupted it. The hold survives browser disconnection and Kiln restart until an explicit hand-back action resolves it. The visible timing and consequence follow AC-LIVE-03/04. The existing deferred pause still means finish the current phase/audit, including its normal checks, before stopping.
  - Replaces in part: AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-AUTO-02/03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (an accepted Claude takeover hold prevents automatic recovery/advancement through restart until explicit hand-back; ordinary recovery remains).
- [x] **AC-TAKE-02 — Terminal readiness requires exclusive use.** Kiln shows **Pausing for takeover — finishing the current operation**, explains that it will stop before starting more work, and says **Wait before opening Claude**. The pending state remains until its attempt and tracked tool processes are stopped and the saved conversation is available. A result event or interrupt acknowledgement alone is insufficient. No terminal-ready claim or enabled copy command is offered while cleanup, process identity or resumability is unresolved. Failure shows the concrete obstacle and a retry/recovery path; it does not automatically resume or advance. A recovered process after restart uses the same release requirement, despite having no message channel. If a safe checkpoint cannot be established, keep the hold and wait for the old attempt to end; do not apply the existing cancelling interrupt or forced termination merely to enable takeover.
- [x] **AC-TAKE-03 — The paused page opens the exact saved conversation.** Once ready, the existing Needs you layout says **Paused for terminal takeover**, names the interrupted activity, and shows the last message/output and interruption facts. Its terminal choice displays the actual working directory and copyable, correctly quoted `cd <folder> && claude --resume <session-id>` command, including existing necessary recovery instructions. Copying does not launch anything. Missing history shows existing recovery guidance without promising same-conversation resumption.
- [x] **AC-TAKE-04 — Competing and late actions cannot start another owner.** Browser, bot and automatic actions serialize against the same activity/attempt. Repeated requests return the existing outcome, not another message or pause. If the targeted activity ends before pause is accepted, report that it ended and never pause its successor. If it ends after acceptance, retain the hold and allow completion verification. Hand-back cannot start a Kiln attempt while the terminal conversation or unresolved tracked work still owns it; where exclusive use cannot be established, remain stopped and explain why.

- [x] **AC-TAKE-05 — Waiting never becomes an unsafe automatic stop.** While awaiting the checkpoint, show the pause request, latest observed activity and the reason terminal access is not ready. If a tool stalls or the provider cannot establish a checkpoint, say so and retain access to output; do not claim the tool finished, start the terminal, or silently switch to immediate cancellation. The technical design must prove a checkpoint/yield path before this action is implemented, including a multi-operation task that pauses between operations while unfinished work remains; waiting for the whole activity to finish does not satisfy that proof.

### Hand work back through the existing flow

The person returns to the same **Back from your terminal?** section already used at Needs you. They choose who finishes the work; they do not learn a second recovery workflow.

- [x] **AC-BACK-01 — The existing hand-back serves phases and audits.** Reuse the existing terminal choice and **Back from your terminal?** grouping, with **Resume {activity} in Kiln** and **Verify {activity} & advance**. Replace “phase” with the actual audit name and round where applicable. Direct reply remains the existing stopped-conversation reply action, never the live-send action. Preserve the instructions to exit Claude first, save changed decisions in requirements when useful, and use no special handoff phrase or compulsory summary.
  - Replaces in part: AC-PAGE-02, AC-TERMINAL-01/02 and AC-RETURN-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (extend that same flow to deliberate live takeover and its audit hand-back; existing ordinary phase recovery remains).
- [x] **AC-BACK-02 — Resume finishes this activity before following the plan.** Resume continues the same conversation with terminal history and the original activity/round identity. Uncommitted work or an unfinished phase/audit alone does not disable it. If fresh checks find the activity already complete, show an explicit advance choice without resuming or advancing automatically. Preserve any unsent reply and the existing advance-without-sending acknowledgement. Existing launch restrictions still apply.
  - Replaces in part: AC-RETURN-02/03 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (apply the same explicit complete/unsent choice to audit takeover).
  - Replaces in part: AC-RUN-02 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (manual audit takeover Resume gets the explicit already-complete choice; automatic recovery outside takeover keeps its existing behavior).
- [x] **AC-BACK-03 — Verify checks the real activity's completion rules.** Verify freshly checks all applicable existing requirements, shows their facts and check time beside the button, and advances only when they pass. Audit verification requires the assigned audit result/report, its currentness, repository and workspace evidence and applicable delivery checks; it never substitutes a phase Closed line. A failing check stays stopped with fresh results; a check error retains honestly dated old results and a retry. Verify does not ask the agent to finish work, commit or push to manufacture a pass.
  - Replaces in part: AC-VERIFY-01/02/03 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (extend presentation to takeover audits using their own completion rules).
- [x] **AC-BACK-04 — Hand-back retains all remaining obligations.** A successful explicit resume or advance releases the takeover hold and any acknowledged uncertain-message hold for that activity only. Existing separately requested pauses, usage/billing/workspace restrictions, audit invalidation, remediation and delivery obligations remain. The next eligible work follows the existing plan without a new manual handoff; a changed audit report or merged branch cannot silently skip remaining audits or delivery checks.

### Offer the same actions to a bot

Both actions belong in the planned bot command interface. They are small command additions once that interface's targeting and receipt framework exists; this change does not recreate that framework.

- [x] **AC-BOT-01 — Bot commands expose both live actions.** Add `kiln message <PRD-path>` with exactly one of `--message-file <path>` or `--message-from-stdin`, and `kiln take-over <PRD-path>`. Both require the bot PRD's `--only-if-status-matches` and `--command-id`. Status identifies the current activity, conversation, attempt, action availability/reasons, message receipt and takeover progress. Text and JSON outputs use the same outcomes as the browser. `kiln reply` stays a stopped-session reply; `kiln request-pause` stays a deferred activity-boundary pause; `kiln handoff` only reads instructions.
  - Replaces in part: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (the post-start command boundary gains `message` and `take-over` when both capabilities are available).
- [ ] **AC-BOT-02 — Bot retries and hand-back share the browser's safeguards.** Inherit the bot PRD's exact targeting, persistent operation receipts, uncertainty handling, authentication and retry protection. A repeated command cannot repeat delivery, and a stale token cannot steer a successor. `kiln handoff` exposes terminal-ready instructions only with the readiness facts; bot `resume` and `verify-and-advance` use AC-BACK-01–04. When AC-MSG-05 requires message review, both accept `--message-reviewed <receipt-id>` for each uncertain message, with the same explicit acknowledgement and no resend. A bot requesting takeover does not launch the terminal itself. Help includes both live command examples and the timing distinction from `reply` and deferred pause.
  - Replaces in part: AC-ACT-02 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (explicit already-complete/unsent choices also serve deliberate audit takeover and uncertain-message review; ordinary dedicated audit recovery remains).

## Mockup states

The [standalone mockup](mockups/kiln-live-session-control.html) uses the existing handoff palette, typography, peer choices and return grouping. Its preview selectors are outside the product UI; all sample names, paths, commands and check facts are illustrative.

| Preview | Criteria illustrated |
|---|---|
| Running; sent; delivery uncertain | AC-LIVE-01–04, AC-MSG-01–05 |
| End-of-activity pause requested; both requests; end-of-activity pause reached | AC-LIVE-03/04 |
| Pausing; restart without input; disconnected | AC-LIVE-02, AC-TAKE-01/02/04 |
| Paused; back from terminal; uncertain-message review; incomplete verification | AC-TAKE-03, AC-MSG-05, AC-BACK-01/03 |
| Already complete; resumed; advanced | AC-BACK-02/04 |

## Delivery boundary

Phase 1's assembled controller/provider/browser takeover and phase/audit hand-back are implemented and verified. The [Phase 1 leaf](phase-1-safe-takeover-return.md#acceptance-evidence) records the criterion evidence and repository gates; the [investigation](kiln-live-session-control-investigation.md#assembled-phase-1-release-evidence-2026-10-27) distinguishes real provider proof from deterministic controller tests. Safe takeover is advertised only for validated Claude Code 2.1.311/macOS attempts. This records implementation completion, not publication or production deployment.

Phase 2 adds assembled literal input, correlated multi-turn settlement, durable message receipts and uncertain-delivery review/explicit hand-back. Its [phase leaf](phase-2-live-message-recovery.md) records acceptance and repository evidence; the [investigation](kiln-live-session-control-investigation.md#assembled-phase-2-provider-evidence-2026-10-27) records real-provider proof and limits. Earlier-design back-pointers now include those message/recovery replacements. Phase 3 extends those safeguards through the bot interface; its [phase leaf](phase-3-bot-live-controls.md) records current-build CLI and compatibility evidence.

## Next: Complete uncertain-message review through restart

The [audit after Phase 6](kiln-live-session-control-phase-plan.md#whole-prd-delivery-audit-after-phase-6--2026-10-28) finds AC-MSG-05 and AC-BOT-02 partly implemented: after uncertain delivery receives late provider evidence, restart can remove its required review before explicit hand-back. [Phase 7](phase-7-uncertain-message-review-restart.md) carries that repair. Phase 6's final-delivery explanation is implemented; 18 of the 20 criteria are fully implemented. After Phase 7 closes and is published, repeat whole-PRD `delivery-audit`; run `test-audit` only when delivery is clean. Phase 3's full-run/focused-retest portfolio, Phase 4's separate green full run and Phase 5's full-run/focused-retest qualification remain distinct historical records. This audit traced code without running or grading product tests.

## Out of scope

- Embedded terminal/chat client, automatic terminal launch, peer inbox, attachments or editing a submitted message.
- Changing completion evidence, merge/deployment permissions, billing rules, or when the existing deferred pause takes effect. Its labels and presentation are clarified by AC-LIVE-03/04.
- Final-delivery sessions and Codex live controls under SCOPE-001; existing recovery for both remains.
- Building the bot discovery, account-login or command-receipt infrastructure here; the bot PRD owns it. Its original first-release boundary is extended by AC-BOT-01/02 when this change is built, not retroactively declared implemented.
