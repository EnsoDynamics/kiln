# Technical Design: Clear handoffs on Kiln’s Needs you page

**PRD:** [Clear handoffs on Kiln’s Needs you page](kiln-needs-you-handoff-prd.md) · **Arrangement and wording:** [interactive mockup](mockups/kiln-needs-you-handoff.html), [editable source](mockups/kiln-needs-you-handoff-fragment.html).

**Status:** Whole-PRD implementation and validation complete. No phase split or additional design refinement. See [implementation validation](kiln-needs-you-handoff-validation.md).

## Overview

Keep the change inside Kiln’s existing local TypeScript engine, loopback HTTP API and Svelte view. Separate **evaluating phase completion** from **accepting it**: manual Resume checks without accepting; Verify and the explicit advance choice check and accept. Both agents use this shared decision boundary and their existing conversation adapters. No new service, database, process, provider protocol or background check is needed.

## Implementation Sizing

Sized with `phase-split` on 2026-10-26: **keep the PRD whole**. All 14 acceptance criteria form one coherent manual implementation-phase recovery capability for Claude Code and Codex, including one- and multi-repository work. The engine evaluation/acceptance boundary, target-bound HTTP/snapshot contracts and browser choices/draft lifetime can be built and verified together in one implementation session. Splitting by agent would duplicate the shared contracts; splitting by layer would leave the changed manual flow incomplete. No phase documents are created.

The walkthrough covered the existing Resume/recheck/dispatch paths, completion checks, stop snapshot, local routes, Needs you screen and application screen lifetime, together with the existing real-Git, HTTP, browser and provider-proof harnesses. The work adds no separate deployable or new provider protocol, and needs no earlier release or product decision before another part can be built. Validation belongs to the same implementation session: every boundary in **Validation and Delivery**, including actual assembled Claude and Codex handoffs, failure/race cases and the full verification suite, remains required. Unavailable real-agent proof must be reported as specified there; sizing does not waive it. Keep earlier planned-replacement pointers unchanged until implementation makes them true.

The independent review is recorded in `a2b1909`, with the sizing handoff pushed through `309732f`. In source chat `01a17a0d-846d-7f13-9810-f58c0427667a`, Doug said, “I think I'm going to hold off on the autonomous design refinement.” He explicitly directed this sizing chat to proceed without another design review or refinement. The implementation used `implement-from-requirements` on the unsplit PRD and this single design, following that direction.

## Existing Code

**Posture: Preserve.** Only the PRD’s named manual implementation-phase replacements change.

- Reuse completion evaluators, stopped-session identity, engine serialization, atomic records and snapshots.
- Reuse Claude transcript resumption and Codex’s saved provider conversation, protected launch, history reconciliation and recorded model/effort.
- Reuse account/billing readiness, usage restrictions, workspace repair prompts, confirmations, development-delivery evidence and fresh-session recovery.
- Retain automatic usage/restart recovery, audit/final-delivery recovery, broken-plan repair, no-session readiness recovery and requested pauses.
- Completion checks continue to decide from documents, Git and applicable provider/delivery evidence. Messages, successful exits and resumption never establish completion.
- Kiln’s checks neither edit phase documents nor commit, push, merge or launch implementation to make evidence pass.

## Manual Phase Recovery

Superseded in part by: [Terminal Ownership and Hand-back](../kiln-live-session-control/kiln-live-session-control-technical-design.md) — safe takeover phases/audits and ordinary-terminal ownership admission; live-message recovery remains Phase 2.

Superseded in part by: [Kiln bot control](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md), §Durable Controls and Retries (shared durable instruction identity, stop-bound retained unsent replies, explicit acknowledgement before advancement and safe same-ID browser retry). Existing completion predicates and manual evaluate-then-act behavior remain.

### Applicability and ownership

Expose the new handoff flow only for a stopped implementation activity with a previously started phase session. Use recorded activity/session identity, not the visible phase label: a launched leaf may have split, and the displayed judged leaf can differ from its storage key. Missing resumable history removes both reply and no-reply Resume, while retaining the fresh-session path and Verify. Billing, usage, outside-workspace and Codex recovery facts remain visible with their existing eligibility rules.

All recovery submissions share the engine’s existing exclusive checking/dispatch boundary. Acquire it before asynchronous checks; retain it through completion acceptance or the resumed run’s start/refusal. Refuse competing Resume, Verify, advance and legacy recovery commands server-side, including from a second tab. Coordinate repository additions, confirmation edits and execution-affecting settings through existing ownership boundaries so an evaluation cannot accept stale obligations. Client disabling adds immediate feedback; it is not the lock.

### Evaluate, then act

Superseded in part by: [Kiln Continue Added Phases — active handback](../kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md#active-execution-handback), Phase 1 (active-plan reconciliation before handback advancement).

An evaluation returns one of: **complete**, **incomplete**, or **check unavailable**, with an authoritative result time for completed evaluations. It may refresh the accepted plan and evidence records as existing checks require, but does not delete a stop, mark Done, clear a billing hold, activate a pause or kick subsequent work merely because it passed.

| Person’s intent | Complete | Incomplete | Check unavailable |
|---|---|---|---|
| Send reply and resume | Keep Needs you; show already-complete choice; send nothing | Queue the same conversation with the reply, subject to existing launch rules | Stay stopped; explain error; send nothing |
| Resume without reply | Same already-complete choice | Queue the same conversation without reading/submitting the reply field | Stay stopped; explain error |
| Verify, or advance from already-complete choice | Accept fresh evidence as finished by the person; follow the existing plan/pause rules | Stay stopped with refreshed requirements and terminal/Resume guidance | Stay stopped; explain error |

The already-complete choice is a view within Needs you, not a new feature state. It offers **Advance to the next step**, or **Advance without sending reply** when a draft exists, and a way back. It starts neither a conversation nor the next activity until the explicit advance succeeds. Advance always evaluates again; the earlier pass is display evidence, never authorization to skip validation. Changed or unreadable evidence prevents advancement. No confirmation token or durable pending-advance record is necessary because Verify and advance intentionally authorize the same freshly checked completion acceptance.

Acceptance publishes Done, clears a stop/hold and permits subsequent dispatch only after its authoritative record write succeeds. On failure, restore the pre-acceptance in-memory completion, stop/hold and pause state before releasing ownership; do not leave memory ahead of the saved record or emit a completion event. Observational evidence refreshes do not authorize dispatch.

After a real resumed phase completes, normal completion acceptance and automatic continuation remain unchanged. The next activity may be implementation, an audit or final delivery. The new complete-choice branch applies only to the two manual phase-resume actions, including a billing-held phase; Resume now during automatic usage waiting and automatic restart recovery keep their current rules.

Replaces in part: [usage-limit recovery design](../kiln-usage-limit-recovery/technical-design.md), §Resume (manual implementation-phase passing precheck and skipped-note behavior only); [Codex design](../../prds/kiln-codex-support/kiln-codex-support-technical-design.md), §Local API and snapshot changes (manual implementation-phase resumption only); [billing safeguards design](../kiln-billing-safeguards/kiln-billing-safeguards-technical-design.md), §Holds and recovery (manual phase Resume requires an explicit already-complete choice; completion acceptance still needs no billing approval).

## Local Interfaces

Superseded in part by: [Terminal Ownership and Hand-back](../kiln-live-session-control/kiln-live-session-control-technical-design.md) — safe takeover phases/audits and ordinary-terminal ownership admission; live-message recovery remains Phase 2.

Superseded in part by: [Kiln bot control](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md), §Durable Controls and Retries (shared durable instruction identity, stop-bound retained unsent replies, explicit acknowledgement before advancement and safe same-ID browser retry). Existing completion predicates and manual evaluate-then-act behavior remain.

Retain loopback binding, Host/Origin/token checks and existing endpoints. Require a target for the affected manual phase requests so a delayed press cannot act on a different stop. Dedicated recovery outside this scope retains its existing request/response contracts.

**PhaseRecoveryTarget:** `{ executionId, phaseKey, sessionId, stoppedAt }`. All fields are required strings from the snapshot. `sessionId` is Kiln’s local session ID, never a provider ID; `phaseKey` identifies the launched activity even after a split. `stoppedAt` identifies the recorded stop, not the latest check time; use the billing hold’s recorded time when it owns the stop. The engine compares all fields with current authoritative state.

| Endpoint | Affected phase request | Success contract |
|---|---|---|
| `POST /api/resume` | `{ target, note?: string }`; direct reply supplies nonempty `note`; no-reply return omits it | `200 { ok: true, outcome: "resume_requested" \| "already_complete", target }` |
| `POST /api/check-again` | `{ target, intent: "verify" \| "advance" }`; neither accepts reply text | `200 { ok: true, outcome: "advanced" \| "still_stopped", target }` |

`resume_requested` acknowledges the queued intent, not confirmed reply delivery. The snapshot retains busy state until work starts or a refusal is visible. `already_complete` means no reply, session start or advancement occurred; the snapshot supplies its fresh checks. `advanced` means the phase was accepted, with its resulting paused/running/audit/final state published normally. `still_stopped` means the evaluator completed and requirements remain unmet. Both Verify and advance use the same acceptance path; `intent` identifies the feedback to show.

Errors return `{ ok: false, code, reason }` plus current state through the normal snapshot:

| HTTP/code | Meaning and effect |
|---|---|
| `400 invalid_request` | Invalid JSON/object, target, intent, note type or note over the existing 4,000-character limit. Validate before starting any check; reject unknown fields, including a note on Verify/advance. |
| `409 stale_target` | Missing target on an affected phase command, or target no longer matches. Refresh the snapshot; no work starts. |
| `409 busy` / `409 recovery_unavailable` | Another operation owns dispatch, or existing conversation/state/recovery rules refuse the action; explain the current remedy. |
| `503 check_unavailable` | The evaluation could not finish. Preserve prior completed results/time; expose the failed attempt separately. Retry only on another explicit press. |
| `500 state_write_failed` | Evaluation or acceptance could not be saved. No success response or next dispatch; preserve/reestablish the stopped state and surface the error. |

Preserve the existing note’s text and trimming policy; do not paraphrase it. A nonempty note identifies the direct-reply path; an empty/whitespace-only reply is disabled in the view. Older tabs cannot bypass the phase guard by using the former targetless endpoints: return `stale_target` with reload guidance. Non-phase commands retain their older semantics, including `noteSkipped` where still applicable. The view and server ship in the same package; no second compatibility endpoint is needed.

### Snapshot and transient data

Superseded in part by: [Kiln bot control](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md), §Durable Controls and Retries (shared durable instruction identity, stop-bound retained unsent replies, explicit acknowledgement before advancement and safe same-ID browser retry). Existing completion predicates and manual evaluate-then-act behavior remain.

Extend affected `needsYou` with:

- `phaseRecovery: { target, completion: "complete" | "incomplete" | "unknown", checkError?: { reason, attemptedAt } }`.
- `attemptStartedAt` identifies the latest recorded provider run. Browser draft retention combines it with execution, launched phase and local session identity: a deferred refusal may change the stop target without starting a turn, so that exact attempt keeps its unsent draft. A newly started turn or another session never inherits it.
- Keep `checks`, `checkedAt`, `checking`, `resumeOffered`, session facts and terminal/fresh-session instructions as authoritative existing fields. For this affected flow, `checks` and `checkedAt` project the last completed phase evaluation from the retained stop, including when a billing hold owns the stop; the hold's time is not a completion-check time. Show launch-only billing approval separately through the existing billing view, outside the completion rows/count. A phase can therefore be complete while launching another model turn remains prohibited. Completion is unknown after an unsuccessful refresh, even if retained older rows passed. With no prior completed evaluation, show unknown/not yet checked and omit `checkedAt` in this affected projection rather than fabricating a completion time.

HTTP outcomes and SSE snapshots refer to the same target. A delayed response cannot overwrite a newer target’s state. Publish busy before checking and the settled result before releasing the lock; after a refused deferred launch, publish its reason and available actions. A lost response is not automatically resubmitted: reconnect/read the snapshot and output before offering another explicit action. Do not say a reply was delivered merely because HTTP accepted the request.

The engine holds the current check error in memory, keyed to the target; it clears on a subsequent completed evaluation or target change. The complete-choice display is page state. Use existing persisted stop checks/time and completion records; no disk schema change or migration. Existing schema-version rejection, session-attempt persistence and crash/restart reconciliation remain authoritative. Restart is still `kiln run` continuation under existing rules, not preservation of an unaccepted browser choice.

Replaces in part: [usage-limit recovery design](../kiln-usage-limit-recovery/technical-design.md), §HTTP API and §Snapshot (affected manual requests and outcomes); [Codex design](../../prds/kiln-codex-support/kiln-codex-support-technical-design.md), §Local API and snapshot changes (same phase contracts for both agents); [multi-repository design](../kiln-multi-repo-delivery/technical-design.md), §HTTP API and §Snapshot (manual implementation-phase verification presentation).

## Completion Evidence and Errors

Superseded in part by: [Terminal Ownership and Hand-back](../kiln-live-session-control/kiln-live-session-control-technical-design.md) — safe takeover phases/audits and ordinary-terminal ownership admission; live-message recovery remains Phase 2.
Superseded in part by: [Kiln Continue Added Phases — active handback](../kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md#active-execution-handback), Phase 1 (active-plan/source failures prevent advancement while preserving session facts).

Use every applicable existing completion obligation, including all repositories, workspace history/confirmations, Codex cleanup/dispatch safety and required development delivery. Preserve first-child judgement after a phase split and existing retained workspace-check rows. Render the evaluator’s requirement rows, facts and repository names beside Verify; derive passed/total from those rows rather than a literal three or a repository count. Do not create a second browser predicate for completion.

Every completed evaluation, including a failed one, replaces all requirement results and `checkedAt` together. Preserve the existing conditional visibility of the workspace row and its retained passed row after a prior failure; the count uses that applicable displayed set, not every theoretically possible check. Launch eligibility such as billing approval remains visible separately and never changes this denominator. Label the summary as a point-in-time check. A copy action, clock tick, billing hold or background account refresh does not refresh completion evidence.

Represent inability to read required repository/plan evidence or an interrupted/failed evaluator explicitly at its source, rather than matching error prose. The manual boundary maps that to `check_unavailable`: no resume/advance and no newly successful-check time. Retained rows remain labeled with their old time, beside the latest error. Existing automatic and non-phase callers retain their present failed-check handling. A completed workspace evaluation that reports missing/inconclusive Codex history remains an unmet requirement with the existing explicit repair-resume eligibility; it must not be mistaken for a new blanket prohibition on repair. Missing resumable conversation identity still removes Resume.

Checks retain existing bounded helper calls, origin-read retry and Codex evidence deadlines, cancellation and cleanup; no new retry loop, polling job or model request. Ordinary failed predicates such as an open phase or dirty/unpushed files are incomplete evidence, and do not block explicit Resume. Any read-only delivery reconciliation updates observations only; it cannot perform delivery to make Verify pass.

Replaces in part: [Kiln v1 design](../../prds/kiln-v1/technical-design.md), §The Done Check (manual phase evaluation/acceptance split and unavailable-attempt display only); [multi-repository design](../kiln-multi-repo-delivery/technical-design.md), §The Done Check (same scoped boundary; predicates and confirmation meanings remain).

## Reply and Agent Integration

Superseded in part by: [Terminal Ownership and Hand-back](../kiln-live-session-control/kiln-live-session-control-technical-design.md) — safe takeover phases/audits and ordinary-terminal ownership admission; live-message recovery remains Phase 2.

Store the draft in browser page memory above the screen component, keyed by the recovery target. This preserves it when Needs you unmounts for Full session output, disconnect/reconnect, checking results or the already-complete choice. Do not put an unsent draft in snapshots, disk, URLs or provider history. A new page load need not restore it. Never transfer it into another stopped session’s reply field.

Only the direct-reply action reads the draft into a request. Copy, Verify, advance and no-reply Resume omit it. Refusals and incomplete/error results retain it. Returning from the complete choice restores its exact contents with **Your reply has not been sent**; advance explicitly warns it will proceed without sending. Preserve the original draft while a request’s outcome is uncertain; do not automatically retry delivery.

On a permitted unfinished-work resume, send the note first in the existing prompt composition, then required workspace/authority repair instructions and the instruction to finish the remaining phase. Keep the shared unattended-reply policy: routine authorized work continues; an explicit hold, substantive question requiring review or material unresolved decision may hand control back. No summary, handoff phrase or requirements edit is a launch precondition.

Claude resumes its recorded session in its recorded working directory. Codex resumes its saved provider thread with current authoritative terminal history, restored recorded model/effort, existing protected launch profile, account checks and dispatch reconciliation. Preserve distinct original/attempt account facts. Neither agent is replaced with a fresh conversation on refusal; fresh-session recovery remains a separately explained terminal option. Copy the existing agent-specific recovery command and any required recovery prompt, preserving native quoting and workspace selection. Copying only copies text.

## Needs you Layout

Superseded in part by: [Terminal Ownership and Hand-back](../kiln-live-session-control/kiln-live-session-control-technical-design.md) — safe takeover phases/audits and ordinary-terminal ownership admission; live-message recovery remains Phase 2.

Build the arrangement and action wording from the saved mockup; sample agent, phase, question and check count are illustrative. Keep feature/repository/PRD identity and connection state visible. Lead with the recorded last message verbatim, or existing output/error evidence if absent; never assert that a failed check means the agent asked a question. Then show peer reply/terminal choices, followed by **Back from your terminal?**, with unfinished-work Resume and finished-personally Verify beside its visible check results. Stack in that reading order on narrow screens.

Use **Send reply & resume Phase {id}**, **Resume Phase {id} in Kiln**, and **Verify Phase {id} & advance**. There is no second Check again control in this flow. Explain same-conversation history, finishing this phase before following the rest of the plan, exiting the terminal session first, the optional tip to record changed decisions in requirements, and that no special phrase is needed. Preserve required recovery prompts, billing/usage facts, workspace confirmation and fresh-session fallback in the relevant choices. For unavailable history explain why and omit both Resume promises.

Disable competing actions during pending work and all work submissions while disconnected; retain the draft even if the established disconnected screen replaces Needs you. Show **Checking…** on Verify while its attempt runs, errors/refusals near the initiating control, and updated facts/count/time together. Announce asynchronous results accessibly; focus the complete-choice result and return focus when going back. On successful acceptance, make the resulting state or requested pause explicit.

Replaces in part: [usage-limit recovery design](../kiln-usage-limit-recovery/technical-design.md), §Screens; [multi-repository design](../kiln-multi-repo-delivery/technical-design.md), §Screens (AC-SHOW-01); [Kiln v1 design](../../prds/kiln-v1/technical-design.md), §HTTP API (Needs you on screen); [Codex design](../../prds/kiln-codex-support/kiln-codex-support-technical-design.md), §Local API and snapshot changes (implementation-phase arrangement only in all four).

## Validation and Delivery

Implementation evidence is recorded in [handoff validation](kiln-needs-you-handoff-validation.md). The built page is exercised in real Chrome at desktop and narrow widths for both providers.

Implementation evidence must cover these boundaries:

| Boundary | Required evidence |
|---|---|
| Engine and real Git | Disposable one- and multi-repository worktrees with bare origins: unfinished reply/no-reply resumes; complete precheck starts nothing and keeps stop; explicit advance rechecks changed/unreadable evidence; failed Verify refreshes every row/time; read errors preserve prior time; passing Verify accepts once and respects pause/audits/final continuation. Include split-leaf identity, outside confirmation, required delivery evidence and launch restrictions. A billing-held complete phase shows all completion rows passed at their actual evaluation time, may advance without approval, and still cannot launch model work without the existing approval. Conditional workspace rows retain the correct dynamic denominator. |
| Local API and races | Real HTTP server: strict body/target/note/error contracts, security checks, competing commands from two clients, stale responses/targets, missing-history refusal and failed deferred launch. Inject a completion-record write failure and assert the stop/hold survives in memory and on disk, with no Done event or next dispatch. Assert no duplicate turn or completion transition and no reply field in Verify/no-reply/advance payloads. |
| Browser | Real built view at desktop and narrow widths: mockup order/labels, verbatim message/error fallback, dynamic check counts, pending/disconnected disabling, full-output navigation and reconnect draft retention, already-complete choice/back/unsent warning, failed-check retry and current timestamps. Test both agents and unavailable conversation variants. |
| Agent adapters | Actual disposable Claude and Codex conversations: terminal discussion followed by no-reply Kiln resume retains that discussion; direct reply reaches that same conversation before carry-on; all-pass precheck starts no model turn. Reuse existing provider proof for unchanged protocols; fixtures alone cannot prove the changed assembled handoff. Report any unavailable real-agent proof explicitly. |
| Compatibility | Regress automatic usage/restart recovery, audit/final recovery, plan/readiness stops, billing holds, Codex cleanup and incomplete-history repair, fresh-session recovery and requested pauses. Run the existing full verification suite before the implementation commit; reuse platform limits already documented for Codex. |

Ship browser, API and engine changes together in the existing package. Keep earlier requirements’ planned-replacement pointers unchanged during design. The implementation commit converts only affected pointers to scoped supersession links and adds the corresponding earlier-design pointers; unaffected obligations and existing chains stay intact.

## Acceptance Criteria Coverage

| PRD criteria | Design coverage |
|---|---|
| AC-PAGE-01, AC-PAGE-02 | Applicability and ownership; Needs you Layout |
| AC-REPLY-01 | Evaluate, then act; Local Interfaces; Reply and Agent Integration |
| AC-TERMINAL-01, AC-TERMINAL-02 | Reply and Agent Integration; Needs you Layout |
| AC-RETURN-01, AC-RETURN-02, AC-RETURN-03 | Manual Phase Recovery; Local Interfaces; Reply and Agent Integration |
| AC-VERIFY-01, AC-VERIFY-02, AC-VERIFY-03, AC-VERIFY-04 | Manual Phase Recovery; Local Interfaces; Completion Evidence and Errors; Needs you Layout |
| AC-COMPAT-01, AC-COMPAT-02 | Existing Code; Manual Phase Recovery; Reply and Agent Integration; Validation and Delivery |

## Open Questions

None requiring a product decision. Actual assembled Claude/Codex handoff proof remains an implementation validation obligation, not permission to weaken completion or recovery protections.
