# Kiln Phase Model Tiers - Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE RIGHT SKILL FIRST ⚠️
     Recording a stakeholder's answer to an assumption below, however it
     arrives (a reply, an email, a decision given in chat):
     `assumptions-document-feedback`.
     Any other edit (a new entry, a rewrite, the header):
     `assumptions-document-writing`, which owns this document's format.
     Most edits here are made by sessions doing something else, which is
     exactly how the format drifts.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-11-22
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Phase Model Tiers. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** will be documented in the Technical Design, which is not written yet.

---

## Model Default Assumptions

### DEF-001. Run demanding phases on Fable at high effort rather than medium?

**Assumption**: **Yes: Fable at high**, not medium, for demanding phases; **Sonnet at medium** for mechanical phases; **GPT Astra at high** as the demanding fallback (AC-DEFAULT-01). All three efforts are the stakeholder's to confirm; Fable's is the one in real doubt. The person can change any of them in Model defaults.

**If they choose otherwise**: Those rows ship at other efforts, such as Fable at medium.

**Evidence**: For Fable at high: Anthropic's guidance keeps high for "work where verification matters or edge cases are likely", which is what a **demanding** phase is.

Against: Anthropic ships Fable at **medium** by default, and cost: "it's pretty rare that I use anything higher than Opus for actual implementation" (2026-11-22), and he worried about pushing phases onto "the really expensive model" (2026-11-22). Research leaned to **medium**.

For the other two: he set Opus at medium and GPT Sol at high (2026-11-21). Medium "fits day-to-day engineering work with a clear scope", which is what a **mechanical** phase is, and GPT Astra at high matches his high for the other Codex model.

Against Sonnet: "I would definitely not want [Sonnet] class downgrades at all by default" (2026-11-21), before he agreed to it for mechanical (2026-11-22).

**Researched**: 2026-11-22; all of the stakeholder's messages, Codex support's PRD and assumptions, the audit-loop-limits PRD and design, both agents' model lists, Anthropic's model-configuration documentation; Opus at medium and GPT Sol at high were already answered; still theirs for these three, and Sonnet moved from high to medium.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — Fable at medium
- [ ] Wrong — corrections: _______________

**Confidence**: 60% | **Impact**: 🟡 MEDIUM

---

### DEF-002. Run the audits, the preflight and the pull request session on Opus at high effort, one step above a standard phase?

**Assumption**: **Yes.** The delivery audit, the test audit, the preflight (the short check before the first phase) and the pull request session (the last session, which opens the pull request) all run on one **Audits** choice, which is **Claude Code · Opus · high** until the person changes it, with **Codex · GPT Sol · high** as its fallback (AC-DEFAULT-01, AC-OTHER-01).

**If they choose otherwise**: The audit, preflight and pull request rows show and run on another choice, such as Opus at medium (the same as a standard phase) or Fable, and each of those sessions, every audit round included, spends accordingly.

**Evidence**: The stakeholder kept audits out of the tier table because "we would just use stronger models for those" (2026-11-21), and "the audit should be a separate setting" (2026-11-22). A standard phase runs **Opus at medium**, so stronger means a raised effort or a stronger model.

Against Fable: "Should those use Opus? Do they need that much horsepower? I don't really know" (2026-11-21), and "it's pretty rare that I use anything higher than Opus for actual implementation" (2026-11-22). An audit can loop several rounds, so Fable's tighter limit would run out first. Against high for everything on it: the preflight and the pull request session are light work.

**Researched**: 2026-11-22; all of the stakeholder's messages, Kiln's documents on audit model, effort and cost, audit records, the delivery-audit, test-audit and phase-split skills; still theirs, and the best-supported answer moved from Opus at medium to Opus at high.

**Confirm or Correct**:
- [ ] Correct — Opus at high
- [ ] Wrong — Opus at medium, the same as a standard phase
- [ ] Wrong — Fable at medium
- [ ] Wrong — different choice: _______________

**Confidence**: 60% | **Impact**: 🟡 MEDIUM

---

## Command Line Assumptions

### CLI-001. Let a bot change Model defaults and turn on the fallback, which spends the other agent's account?

**Assumption**: **Yes.** Commands do everything the Model defaults page does: print it, change any row, restore Kiln's defaults, and turn the fallback on or off and set its threshold (AC-DEFAULT-05). A bot can therefore start activities on the other agent's account on every PRD on the computer.

**If they choose otherwise**: Model defaults and the fallback switch stay in the browser. A bot can still change a phase that hasn't started (AC-PICK-05), but not the defaults, and it can't turn the fallback on.

**Evidence**: The stakeholder on bot control: "there is no human only thing in here either… the same option needs to be exposed to the CLI interface so that bots can do it as well" (2026-11-02), and, overturning a browser-only reset, "Let's allow the bot to do it and to address the downside in the CLI help for it" (2026-11-12).

Against it: the fallback spends a second account, and the team's still-unconfirmed reading for bot control keeps new spending authority in the browser. Every setting a command changes today belongs to one PRD, not the whole computer.

**Researched**: 2026-11-22; all of the stakeholder's messages, the command-line guide, bot control's PRD and assumptions, the run-restart, live-session-control and pause-now documents, the settings code; changing a phase's model in a run underway was already answered and is now AC-PICK-05; the defaults and the switch are still theirs, and the best-supported answer moved to giving them commands too.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep Model defaults and the fallback switch in the browser
- [ ] Wrong — commands for Model defaults, but the fallback switch stays in the browser

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or is easy to change later.

### PICK-001. Hold a started phase to its model even when the person starts a new session for it?

**Assumption**: **Yes.** Once a phase's session has had a response from the model, its agent, model and effort are fixed, even when it carries on in a new session because its conversation can't be reopened (AC-PICK-04). To run it on something else, the person resets Kiln for the PRD and changes the phase before starting again. A session that ends before any response, such as one whose model the account refused, doesn't count, so that phase can still be changed, and goes on in a new session on its new choice (AC-PICK-07).

**If they choose otherwise**: The card that starts a new session for a stopped phase also offers a model and effort on the same agent, and the phase's row then shows more than one model.

**Evidence**: The stakeholder: "Once you start a phase, that's committed to whatever model and agent you started it on" (2026-11-21), and the person can change "any future phase that hasn't been started yet" (2026-11-22).

Against it: his reason, "the other provider doesn't really know where you're at in the middle of that process" (2026-11-22), is weaker for a new session handed the phase's work. It matters when the account refuses the model after it has answered once, or is out for days: the person is left waiting, finishing in the terminal, or resetting, which loses the PRD's settings and audits.

**Researched**: 2026-11-22; all of the stakeholder's messages, Codex support's PRD and assumptions, the run-restart, usage-limit-recovery and needs-you-handoff documents, the session launch code; still theirs, and the best-supported answer agrees.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — let the person choose a model and effort on the same agent when starting a new session for a stopped phase

**Confidence**: 70% | **Impact**: 🟢 LOW

### FALL-001. Let a phase whose model the person picked by hand fall back too, when its account is nearly out?

**Assumption**: **Yes.** A phase the person changed falls back like any other: when its own choice's account is at or above the threshold, it starts on the fallback Model defaults gives its tier, and its row says so (AC-FALLBACK-02, AC-FALLBACK-03). If the person's pick already runs on the agent the fallback would use, the phase has no fallback.

**If they choose otherwise**: A phase the person changed never falls back. It starts on what they chose and waits at a limit.

**Evidence**: The stakeholder framed the switch around running out, not around which phases: "Even if this is your preferred model, let's say that it runs out… for it to just be acceptable to fall back to another provider… do you want that, or do you just want it to stop?" (2026-11-21). Once set, "that's how it's set from that point forward" (2026-11-22). Kiln never replaces a choice silently today; this one is opted into and shown.

Against it: a phase changed by hand is a deliberate pick, and "the second choice would be something that Kiln would sort of store privately" (2026-11-21) ties the fallback to the rating rather than to the person's pick.

**Researched**: 2026-11-22; all of the stakeholder's messages, the Codex support, usage-limit-recovery and billing-safeguards documents; still theirs, and the best-supported answer agrees.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — a phase the person changed never falls back

**Confidence**: 65% | **Impact**: 🟢 LOW

### FALL-002. Show a one-line heads-up on the next phase or audit when it would start on the fallback?

**Assumption**: **Yes.** With the fallback on, when the next phase or audit would launch on the fallback if it launched now, that row adds a line such as "Or on Codex · GPT-6.2-Sol · high, if Claude is still at or above 95% when it launches" (AC-FALLBACK-04). Every other row that hasn't started names only its first choice, and with the fallback off no row mentions it.

**If they choose otherwise**: No row mentions a fallback until a phase or audit has started on one.

**Evidence**: The stakeholder: "none of this should be silent. Even when you're listing out the phase plan, it should always state what model it would use" (2026-11-21). Without the line, the next row would name a model it probably won't run on.

Against it: "You would always see first choice. The second choice would be something that Kiln would sort of store privately" (2026-11-21), said of the choice the plan offers, though it may cover notices too. He reviewed a mockup carrying this line on 2026-11-22 without remarking on it.

**Researched**: 2026-11-22; all of the stakeholder's messages, the build-preflight PRD and assumptions, usage-limit-recovery, the existing 80% usage warnings, billing-safeguards notices; still theirs, and the best-supported answer agrees; nothing material left to try.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — never mention the fallback before it is used

**Confidence**: 85% | **Impact**: 🟢 LOW

### FALL-003. With the fallback on but its agent not ready, warn and still let the run start?

**Assumption**: **Yes.** Start stays available. Where Documents found reports the fallback, a warning names the fallback's agent, what is wrong with it (not installed, signed out, the Enso Method's skills not installed, billing not approved), what fixes it, and that the run will wait at a usage limit as if the fallback were off (AC-AGENTS-01, AC-AGENTS-02).

**If they choose otherwise**: Start is unavailable on every PRD until the fallback's agent is fixed or the fallback is turned off.

**Evidence**: Codex support for Kiln promises "A person with only the selected agent installed can reach Documents found and start" (AC-AGENT-03). An unusable fallback costs only the wait that would have happened without it. Elsewhere the stakeholder prefers a heads-up to a stop before work begins: of a phase marked as needing a person, "it most certainly should not just stop preemptively" (2026-11-15).

Against it: the Model defaults mockup he agreed to on 2026-11-22 said "Both agents must be ready before Start"; he did not remark on that line.

**Researched**: 2026-11-22; all of the stakeholder's messages, the Codex support, billing-safeguards, build-preflight and development-deployments documents, Kiln's start checks; still theirs, and the best-supported answer moved from blocking Start to a warning.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep Start unavailable until the fallback's agent is ready or the fallback is off

**Confidence**: 75% | **Impact**: 🟢 LOW

### KEEP-001. Let a PRD already underway keep its one model, and move a PRD not yet started to the per-phase models unless the person picked its model?

**Assumption**: **Yes.** For a PRD set up before this change:

- **Already underway**: it **keeps the one model** it was set up with, on everything it has left.
- **Set up but not yet started**: it **moves to the per-phase models**, unless the person had **picked a model** for it themselves; then it keeps that pick.

A kept model shows as **Changed by you** on each row, and the person can change it or return it to the default (AC-KEEP-02).

**If they choose otherwise**: A PRD already underway moves to the per-phase models for what it has left, or a PRD not yet started keeps whatever was saved.

**Evidence**: Kiln has never rewritten a saved choice. When Codex support arrived, existing PRDs stayed "Claude Code PRDs with their settings"; when Claude Code's starting effort was lowered, "a PRD whose settings were already saved keeps the effort it has". A PRD not yet started has run nothing, so moving it undoes no work.

Against it: that effort change kept every saved setting, even ones Kiln had filled in rather than the person, so a PRD not yet started would keep its model too.

**Researched**: 2026-11-22; all of the stakeholder's messages, the six change folders, the saved-record migration and default settings, the selection code; still theirs; agrees for runs underway, and the not-yet-started half was narrowed to keep a model the person picked.

**Confirm or Correct**:
- [ ] Correct — underway keeps its model; not yet started moves, unless the person picked one
- [ ] Wrong — a PRD already underway moves to the per-phase models too
- [ ] Wrong — a PRD not yet started keeps whatever was saved
- [ ] Wrong — corrections: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

### KEEP-002. Drop the one agent, model and effort choice for a whole PRD, leaving each phase's Change and Model defaults?

**Assumption**: **Yes.** Neither Documents found nor the run's settings offers one agent, model and effort for the whole PRD any more (AC-KEEP-01), so putting **every remaining phase** on one model, before Start or **partway through a run**, means changing each phase's row. A person who always wants one model sets it **once in Model defaults**, which covers every PRD.

**If they choose otherwise**: Documents found and the run's settings keep a control that sets every phase of this PRD that hasn't started at once, marking each row as changed, and the rows still allow a change to any one of them.

**Evidence**: What each answer costs a person:

| To run on one model | Drop it (proposed) | Keep it |
|---|---|---|
| For one PRD | Change each row: Kiln's PRDs most often have **3 to 6 phases** (up to 11), **about 1 to 3 minutes** at 15 to 20 seconds a row | One action |
| For every PRD | Set **Model defaults once** | The same |

Keeping it also puts **one more control** on both screens, which every person sees. Dropping it removes something a person can do today: change the model for **every remaining session in one action** while a run is going (AC-VIEW-08 in Kiln v1). The usage fallback covers the commonest reason to switch partway, running out of usage.

For: Kiln should "pre-fill out the model and the effort level, and then let the user change it" (2026-11-21), for "any future phase that hasn't been started yet" (2026-11-22). He agreed to the mockups, which have no such control (2026-11-22).

Against: he never said it should go, and described his usual run as one choice that "would just carry through to the entire thing" (2026-11-21).

**Researched**: 2026-11-22; all of the stakeholder's messages, Codex support for Kiln's PRD and assumptions, Kiln v1's settings criteria, the README's Start section, phase counts across this repository's PRDs, common practice (one web search); still theirs; agrees with the entry.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — keep a control that sets every phase of a PRD at once

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| CLI-001 (part) | Changing a not-started phase's model, or a PRD's Audits choice, in a run underway has a command | Answered 2026-11-22 | PRD AC-PICK-05. The stakeholder on bot control, 2026-11-02: "there is no human only thing in here either… the same option needs to be exposed to the CLI interface so that bots can do it as well" |
| DEF-001 (part) | Opus ships at medium effort and GPT Sol at high, including as the Standard, Mechanical and Audits fallback | Answered 2026-11-22 | PRD AC-DEFAULT-01. The stakeholder, 2026-11-21: "If I were doing Opus 5.5, then right now, today anyway, I would do medium effort, whereas if I was doing 6.2 [Sol], then I would do high effort". Mechanical's fallback being the same as Standard's: he asked that mechanical be "a lower rung, not just the same exact choices" (2026-11-21), which its Sonnet first choice is, then agreed the tier outline with GPT Sol as Mechanical's fallback, 2026-11-22: "I think it's fine, except for demanding" |
| DEF-003 | A person with only Codex can start without opening Model defaults, on the Fallback column's Codex choices | Written up 2026-11-22 | PRD AC-DEFAULT-04. Required by Codex support's promise that a person with only the selected agent installed can start (AC-AGENT-03) |
| DEF-003 (part) | How Kiln substitutes when Claude Code isn't installed | Left to the design 2026-11-22 | Choice: plan each affected row on its Codex fallback at the moment it is shown, without rewriting the saved Model defaults, so installing Claude Code later restores the first choices; independent of the usage fallback switch. Beat: writing a detected table on first launch (persists a guess); substituting only when the fallback switch is on (mixes installation with usage) |
| KEEP-001 (part) | How Kiln tells a model the person picked from one it filled in, on a PRD not yet started | Left to the design 2026-11-22 | Choice: a saved choice equal to Kiln's current default (Claude Code · Opus · medium, or Codex · any GPT Sol version · high) is treated as not picked; any other saved choice, an earlier default such as Opus at high included, is treated as picked. Why: the saved record does not say who set it. Beat: treating every saved choice as picked (every PRD not yet started would stay on one model), or none (real picks would be discarded). The person sees every row before Start and can press Use the default. PRD AC-KEEP-02 |
