# PRD: Clear handoffs on Kiln’s Needs you page

**Closed:** 2026-10-26

**Status:** Implemented and validated as one whole PRD. See [implementation validation](kiln-needs-you-handoff-validation.md).

**Source:** Doug’s approved mockup and discussion on 2026-10-26, Codex chat `01a17999-12d9-7b91-92d3-bb9b908390af`. Doug requested a change PRD, links from the earlier requirements, and the mockup alongside the requirements; no stakeholder package.

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), [usage-limit recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md), [Codex support](../../prds/kiln-codex-support/kiln-codex-support-prd.md), and the Needs you layout in [multi-repository delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md).

**Mockup:** [Open the interactive Needs you mockup](mockups/kiln-needs-you-handoff.html). Its [editable source](mockups/kiln-needs-you-handoff-fragment.html) is stored beside it.

## Summary

Make Kiln’s **Needs you** page, the page shown when work stops for the person, distinguish three intentions: answer the agent and let Kiln finish, discuss or finish the work in a terminal, and verify a phase the person has already finished. The agent’s last message comes first. Replying in Kiln and opening the same conversation in a terminal sit beside each other. A separate “Back from your terminal?” section offers either resuming unfinished work in Kiln or verifying completion and advancing the plan.

A **phase** is the current unit of implementation in the plan. **Resuming** means returning to its saved agent conversation. **Advancing** means accepting the phase as complete and proceeding to the next eligible activity in the plan, which can be another phase, an audit, or final delivery, subject to an existing requested pause.

## Business Context

Doug reopened a stopped Claude conversation in his terminal, resolved the agent’s questions, updated the requirements, and exited so Kiln could finish the implementation. Pressing “Check again” did not resume that unfinished work: it only checked whether the phase was already closed, committed and pushed. Sending a reply through Kiln resumed it. Both paths were described as continuing, although they did different things.

This change makes the action and its outcome explicit. It also removes a related surprise: an explicit request to resume a phase that is already complete must not advance the plan and discard a typed reply without first telling the person and letting them choose.

## Scope

This is one bounded change to manual recovery of implementation phases at Needs you, for Claude Code and Codex, with one or several repositories. The approved Claude/Phase 4b screen illustrates the common resumable case; agent names, phase identifiers, commands, facts and check counts come from the actual stopped work.

| Existing situation | Application of this change |
|---|---|
| A stopped implementation phase has a resumable conversation, including a manually reopened conversation | The complete reply, terminal and return flow below applies. |
| A phase’s conversation cannot be resumed | Explain its unavailability, retain the existing fresh-session recovery path and completion check, and omit actions that promise to resume the missing conversation. |
| A phase also has a billing, usage, workspace or other existing recovery restriction | Retain the applicable facts, instructions and eligibility rules alongside the new handoff flow; this change grants no new permission and removes no required check. |
| The plan is broken before a phase can run, no session has ever started, Kiln is automatically waiting for usage, or the stopped work is an audit or final-delivery activity | Existing dedicated recovery behavior remains. Do not relabel these activities as an implementation phase or apply this phase-completion confirmation to automatic recovery. |

## Acceptance Criteria

### Understand what stopped and how to help

The person first sees the agent’s own message, then chooses where to resolve it. Finishing the phase in the terminal is one option, not a prerequisite for returning control to Kiln.

- [x] **AC-PAGE-01 — The stopped work and its message stay identifiable.** The page retains the feature, repository/PRD, phase and agent identity, connection state, recorded session-ending facts, and access to full output. The agent’s last message is shown verbatim before the action choices; when no final message exists, show the existing output/error evidence. The page must not infer a question or cause from an unsuccessful completion check.
- [x] **AC-PAGE-02 — The choices follow the approved order.** Under the session message, “Reply here and let Kiln finish” and “Open the conversation in your terminal” appear as peer choices before the billing panel. Billing remains visible below the resolution and terminal-return controls, with all existing launch restrictions. Beneath the peer choices, “Back from your terminal?” separates “We resolved the question. Kiln can finish.” from “I finished the entire phase myself.” On narrow screens these groups stack in that reading order without hiding an action. The saved mockup governs the arrangement and action wording; sample values are not literal product content.
  - Superseded in part by: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the existing terminal and hand-back flow also serves deliberate takeover of Claude phases and audits).
  - Replaces in part: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (placement of the reply, terminal and hand-back controls on implementation-phase Needs you).
  - Replaces in part: AC-VIEW-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the implementation-phase Needs you layout, retaining agent-specific information).
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (implementation-phase Needs you arrangement only; repository-specific recovery facts and obligations remain).
  - Replaces in part: AC-LOOK-01 and AC-LOOK-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the implementation-phase Needs you layout and its phase-focused headline; existing feature identity remains visible).

### Answer here or talk it through in the terminal

A short answer can be sent directly from Kiln. A longer discussion uses the same saved conversation in a terminal, so the person need not summarize it again on returning.

- [x] **AC-REPLY-01 — A direct reply clearly resumes this phase.** The reply field names the stopped conversation’s agent. “Send reply & resume Phase {id}” is available only for a nonempty reply. It sends that reply in the person’s own words to the same saved conversation before the instruction to resume, unless AC-RETURN-02 finds the phase already complete. Existing unattended-work rules remain: routine work proceeds; an explicit request to wait or a material decision can return control to the person.
  - Replaces in part: AC-RESUME-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the shared optional-note control becomes a labeled direct-reply action and a separate no-reply hand-back action; reply delivery order and unattended-work policy remain).
  - Replaces in part: AC-RECOVER-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex manual phase-recovery labels and grouping only; the saved conversation and existing recovery rules remain).
- [x] **AC-TERMINAL-01 — The terminal choice reopens the exact conversation.** The adjacent terminal choice supplies the existing copyable command for the correct workspace and saved agent session, including any required recovery instructions. It explicitly serves either a discussion or finishing the phase personally. Copying the command does not launch or resume work. It directs the person to exit the terminal agent session before using the return choices.
  - Superseded in part by: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the existing terminal and hand-back flow also serves deliberate takeover of Claude phases and audits).
- [x] **AC-TERMINAL-02 — Handing back needs no special phrase.** A short visible tip recommends asking the agent to record decisions in the requirements when the conversation changed the plan. The page explicitly says no special handoff phrase is needed. Kiln does not require a phrase, a typed summary, or a requirements edit merely to resume the conversation.
  - Superseded in part by: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the existing terminal and hand-back flow also serves deliberate takeover of Claude phases and audits).

### Hand unfinished work back to Kiln

Resolving the question does not mean the whole phase is done. The return action resumes the phase without asking the person to finish its commits or repeat their terminal discussion.

- [x] **AC-RETURN-01 — Resuming unfinished work needs no reply.** “Resume Phase {id} in Kiln” resumes the saved conversation with its history, including the terminal discussion, and directs it to finish the remaining phase work. An open phase or uncommitted/unpushed work alone does not disable this action. Existing launch, conversation-availability and recovery restrictions still apply. The page distinguishes finishing this phase from proceeding through the rest of the plan afterwards.
  - Superseded in part by: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the existing terminal and hand-back flow also serves deliberate takeover of Claude phases and audits).
  - Replaces in part: AC-RESUME-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (empty-note resumption has its own clearly identified return action).
- [x] **AC-RETURN-02 — An already complete phase is an explicit choice.** Before either manual phase-resume action starts work, Kiln checks completion. If the phase is already complete, show that result without resuming a conversation or advancing the plan. Offer a separate action to advance and a way back to the recovery page. A typed reply is preserved on return, clearly labeled not sent, and the advance action explicitly says it will advance without sending that reply. Advancing revalidates completion; changed or unreadable evidence keeps the phase stopped with an explanation. This applies only to these manual implementation-phase resume actions, not automatic usage or restart recovery.
  - Superseded in part by: AC-BACK-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (takeover audit Resume retains the explicit complete/unsent choice and same conversation identity).
  - Replaces in part: AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a passing completion precheck on manual phase Resume no longer advances immediately).
  - Replaces in part: AC-RESUME-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (manual phase Resume no longer discards a reply and advances after merely notifying the person).
  - Replaces in part: AC-RECOVER-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the same explicit choice applies to Codex manual phase resumption).
- [x] **AC-RETURN-03 — Unsent text is never mistaken for a delivered reply.** Only the direct-reply action submits the reply field. Checking completion, copying the terminal command, or using the no-reply return action does not send it. Checks that leave the person at Needs you, refusals, and returning from the already-complete choice retain the draft during the current page visit. The already-complete reply case follows AC-RETURN-02’s explicit advance-without-sending choice.
  - Superseded in part by: AC-BACK-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (takeover audit Resume retains the explicit complete/unsent choice and same conversation identity).

### Verify a phase finished outside Kiln

The completion action answers “is this phase finished?” It does not ask the agent to finish unfinished work. Its results and button are shown together so there is no second refresh control to interpret.

- [x] **AC-VERIFY-01 — Verify replaces Check again for phase completion.** The finished-personally choice offers “Verify Phase {id} & advance” instead of a separate “Check again” button. It reruns all applicable existing completion checks. It does not close the phase document, commit or push changes, or resume unfinished implementation to make the checks pass. A passing result accepts the phase as finished by the person and follows the existing next-activity and requested-pause rules. A failing result stays at Needs you, shows what remains, and points to either finishing it in the terminal or resuming it in Kiln.
  - Superseded in part by: AC-BACK-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (takeover audits show and recheck their assigned report, currentness, workspace and delivery predicates).
  - Replaces in part: AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the manual implementation-phase completion action’s label and explanation; broken-plan recovery and the completion rules remain).
  - Replaces in part: AC-RECOVER-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the corresponding Codex phase-completion label).
- [x] **AC-VERIFY-02 — Completion requirements stay visible beside Verify.** Show each applicable requirement’s result and the concrete fact behind it, with repository names where required. These rows are visible without expanding a section. A completed-check summary identifies how many requirements passed and when they were checked; it never implies continuous observation of terminal work. The count uses the applicable requirements, not a fixed denominator of three. The existing workspace confirmation and extra failure evidence remain available when required.
  - Superseded in part by: AC-CHECK-01 in `docs/changes/kiln-completion-checks/kiln-completion-checks-prd.md` (workspace auditing and acceptance only; independent completion requirements remain).
  - Superseded in part by: AC-BACK-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (takeover audits show and recheck their assigned report, currentness, workspace and delivery predicates).
  - Retains the evidence obligations of AC-STOP-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-CHECK-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md`; the layout replacement is owned by AC-PAGE-02.
- [x] **AC-VERIFY-03 — A recheck produces fresh results or a visible error.** Every completed Verify attempt refreshes all applicable results and their check time, including an attempt that still fails a requirement. While checking, the action says it is checking. If the check itself cannot finish, show the error and do not advance or present earlier results as newly checked; any retained results retain their previous successful-check time. The same Verify action retries the check after the problem is addressed. A passing check may leave this page for the resulting execution state; the outcome remains explicit.
  - Superseded in part by: AC-BACK-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (takeover audits show and recheck their assigned report, currentness, workspace and delivery predicates).
- [x] **AC-VERIFY-04 — Pending actions cannot start competing work.** From submitting a reply, requesting resume, verifying completion or explicitly advancing until its result is shown or work starts, competing resume/verify/advance submissions are unavailable. Refusals explain why, preserve unsent text, and leave the person with the actions actually available. A disconnected view cannot submit work as if Kiln were connected.

### Keep existing recovery protections and the rest of the plan

Clearer choices must not change what counts as finished or which work the person has authorized.

- [x] **AC-COMPAT-01 — The current agent, evidence and permissions remain authoritative.** All affected controls and instructions use the recorded agent and phase, and retain the current account/model, billing, workspace, required confirmations, missing-history and launch eligibility rules. Resuming a conversation does not establish completion or clear failed evidence. Both Claude Code and Codex retain their existing terminal and fresh-session recovery capabilities; no control promises a resumable conversation when none is available.
  - Superseded in part by: AC-CHECK-01 in `docs/changes/kiln-completion-checks/kiln-completion-checks-prd.md` (workspace auditing and acceptance only; independent completion requirements remain).
- [x] **AC-COMPAT-02 — Ordinary continuation remains automatic.** After a resumed phase genuinely completes, and after a successful explicit Verify/advance, Kiln follows the existing plan without introducing another manual handoff between phases, audits or final delivery. Existing requested pauses, limits and blockers remain effective. The explicit already-complete choice in AC-RETURN-02 is confined to the person’s manual phase-resume request.

## Mockup and review examples

[Open the interactive mockup](mockups/kiln-needs-you-handoff.html). The sample question and sample session facts are illustrative, not evidence of a live execution. Its preview controls change the simulated completion result; they are not Kiln controls.

| Example to inspect | Criteria illustrated |
|---|---|
| Initial page, direct reply and terminal choice | AC-PAGE-01/02, AC-REPLY-01, AC-TERMINAL-01/02 |
| Return from a terminal discussion with implementation still unfinished | AC-RETURN-01, AC-COMPAT-02 |
| Verify an unfinished phase; recheck results and time | AC-VERIFY-01/02/03/04 |
| Resume a phase already complete, with and without a typed reply | AC-RETURN-02/03 |
| Completion check cannot read the repository | AC-VERIFY-03 |

## Relationship to earlier requirements

The `Replaces in part:` lines identify the requirements changed by this implementation. The earlier PRDs carry matching scoped `Superseded in part by:` links. Existing supersession chains and unaffected obligations remain intact.

## Out of Scope

- Changing completion evidence, automatically committing or pushing on the person’s behalf, or granting additional merge/deployment authority.
- A new embedded interactive chat, terminal launcher, account-switching flow, or automatic detection that a terminal conversation is finished.
- Redesigning automatic usage waits, audit/final-delivery recovery, broken-plan repair, or application screens outside the affected Needs you phase flow.
- A stakeholder review package, technical design, implementation, or additional PRD review rounds beyond the one full round completed with its findings fixed.
