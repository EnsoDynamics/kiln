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

### DEF-002. Run the audits on Opus at medium effort, the same as a standard phase?

**Assumption**: **Yes.** Until the person changes it, the **Audits** choice is **Claude Code · Opus · medium**, with **Codex · GPT Sol · high** as its fallback (AC-DEFAULT-01). The delivery audit, the test audit, the preflight and the pull request session all run on it (AC-OTHER-01).

**If they choose otherwise**: Audits come set to a stronger choice, such as Fable at high effort or Opus at high effort, and every PRD's audit rows show that.

**Evidence**: The stakeholder asked that audits stay out of the tier table and said "we would just use stronger models for those" (2026-11-22). We read "stronger" as never the mechanical model, and Opus is what audits run on today for most runs. Against it: "stronger" may mean stronger than a standard phase, which points at Fable. An audit reads the whole PRD and can loop several rounds, so Fable's tighter limit would be used up sooner. The mockup the stakeholder reviewed shows Opus at medium on the audit rows, and he did not comment on it.

**Confirm or Correct**:
- [ ] Correct — Opus at medium
- [ ] Wrong — Opus at high effort
- [ ] Wrong — Fable at high effort
- [ ] Wrong — different choice: _______________

**Confidence**: 55% | **Impact**: 🟡 MEDIUM

---

## Command Line Assumptions

### CLI-001. Change models in the browser only, with no command-line form?

**Assumption**: **Yes.** Changing a phase's model, the Audits choice for a PRD, Model defaults and the fallback switch are browser controls only. `kiln run --resume` continues with whatever is saved. A bot can't change a model.

**If they choose otherwise**: The command line gains commands to change a not-started phase's model, and perhaps the defaults and the fallback, with bot control's usual targeting and retry safeguards.

**Evidence**: Today the model is chosen on Documents found, which has no command-line form, and no command changes it during a run. The stakeholder asked that the defaults be kept out of the way: "most people don't need to override it" (2026-11-22). Against it: Kiln's command-line guide promises "Everything the browser view does with existing work can also be done from a terminal", and changing a phase that hasn't started, in a run underway, is new work on existing work. Asked rather than decided because a browser-only control departs from that promise.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — add a command to change a not-started phase's model
- [ ] Wrong — add commands for the defaults and the fallback as well

**Confidence**: 60% | **Impact**: 🟢 LOW

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or is easy to change later.

### DEF-001. Ship these effort levels with the tier choices?

**Assumption**: **Yes.** Kiln comes with **Fable at high**, **Opus at medium**, **Sonnet at high**, **GPT Astra at high** and **GPT Sol at high** (AC-DEFAULT-01). The person can change any of them in Model defaults.

**If they choose otherwise**: Kiln ships different efforts, or leaves each model at the effort its agent suggests.

**Evidence**: The stakeholder agreed the models for each tier and the fallbacks on 2026-11-22; the efforts beside them were our proposal and he did not rule on them. GPT Sol at high is today's default for Codex (AC-MODEL-02 in Codex support for Kiln). Sonnet at high gives a mechanical phase the lighter model without also lowering its effort. Against it: Opus at medium is lower than some people run today, and Kiln currently starts each model at the effort its agent suggests.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — corrections: _______________

**Confidence**: 70% | **Impact**: 🟡 MEDIUM

### DEF-003. On a computer with only Codex, use the Fallback column as the first choices?

**Assumption**: **Yes.** While the person hasn't changed Model defaults, and Claude Code isn't installed and Codex is ready, each row's first choice is its Fallback column: GPT Astra at high for demanding, GPT Sol at high for the rest. There is no fallback, and the page says so (AC-DEFAULT-04).

**If they choose otherwise**: A person with only Codex is stopped before their first Start and sent to Model defaults to choose a model for each row.

**Evidence**: Today such a person chooses Codex on Documents found and starts (AC-AGENT-03 in Codex support for Kiln). With every shipped first choice on Claude Code, they would otherwise be blocked on every phase until they set four rows by hand. The Fallback column is the Codex choice the stakeholder agreed for each tier.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — make them choose in Model defaults first

**Confidence**: 80% | **Impact**: 🟢 LOW

### PICK-001. Hold a started phase to its model even when the person starts a new session for it?

**Assumption**: **Yes.** Once a phase has started, nobody changes its agent, model or effort: not Kiln, and not the person, even when a stopped phase carries on in a new session because its conversation can't be reopened (AC-PICK-04). To run the phase on something else, the person resets Kiln for the PRD and changes the phase before starting again.

**If they choose otherwise**: The card that starts a new session for a stopped phase offers the model choices, and the phase's row then shows more than one model.

**Evidence**: The stakeholder: "Mid-phase switching is definitely not going to be a thing. Once you start a phase, that's committed to whatever model and agent you started it on" (2026-11-22). His concern was Kiln switching by itself, so a deliberate change by the person at a stop may be outside what he meant. Today a new session uses the latest saved choices (AC-MODEL-03 in Codex support for Kiln), so this removes something a person can do now.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — let the person choose a model when starting a new session for a stopped phase

**Confidence**: 80% | **Impact**: 🟢 LOW

### FALL-001. When the person changed a phase's model, still use its tier's fallback?

**Assumption**: **Yes.** A phase the person changed falls back like any other: when its own choice's account is at or above the threshold, it starts on the fallback Model defaults gives its tier. It has no fallback when that fallback is on the same agent as the choice the person made (AC-FALLBACK-02).

**If they choose otherwise**: A phase the person changed never falls back. It starts on what they chose and waits at a limit.

**Evidence**: The fallback is one switch for the computer, and the stakeholder turned it into a rule about usage, not about which phases: "if you're maybe north of 96% utilized, then instead of using the remaining, it can kick you to the backup or fallback provider" (2026-11-22). A run left overnight is the case it exists for. Against it: a person who chose a model for one phase may want exactly that model, and Kiln never replaces a saved choice silently today. Here it is not silent (AC-FALLBACK-03).

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — a phase the person changed never falls back

**Confidence**: 65% | **Impact**: 🟢 LOW

### FALL-002. Show a one-line heads-up on the next activity when it would start on the fallback?

**Assumption**: **Yes.** Rows that haven't started show their first choice only. The one exception: while the first choice's account reads at or above the threshold, the next activity in line adds a line such as "Or on Codex · GPT-6.2-Sol · high, if Claude is still at or above 95% when it starts" (AC-FALLBACK-03).

**If they choose otherwise**: No row mentions a fallback until an activity has started on one.

**Evidence**: The stakeholder said the plan shows the first choice and "the second choice would be something that Kiln would sort of store privately" (2026-11-22). He also said none of this should be silent, and he reviewed the mockup that shows this line without objecting. We read the two together as: no fallback column in the plan, but a warning when one is about to be used.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — never mention the fallback before it is used

**Confidence**: 70% | **Impact**: 🟢 LOW

### FALL-003. With the fallback on, keep Start unavailable until the fallback's agent is ready too?

**Assumption**: **Yes.** With the fallback on, a PRD can't start while a fallback's agent is not installed, not signed in or missing the method's skills. The reason names the agent and the two ways on: fix the agent, or turn the fallback off in Model defaults (AC-AGENTS-01). During a run, a fallback that can't be used is skipped and the row says why (AC-FALLBACK-02).

**If they choose otherwise**: Start stays available, Documents found warns that the fallback can't be used, and the run waits at a limit as if the fallback were off.

**Evidence**: The mockup of Model defaults the stakeholder reviewed says "Both agents must be ready before Start". Blocking makes the person find out before an unattended run, not hours into it. Against it: the switch is for the whole computer, so a lapsed Codex sign-in blocks every PRD until it is fixed or the switch is turned off.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — warn, and let the run start without a usable fallback

**Confidence**: 75% | **Impact**: 🟢 LOW

### KEEP-001. Leave runs already underway on the one choice they were started with?

**Assumption**: **Yes.** A PRD started before this change keeps its saved agent, model and effort on every activity it has left, shown as a choice the person made; they can change any row or return it to the default. A PRD that hasn't been started takes its rows from the tiers and Model defaults, whatever was last selected for it on Documents found (AC-KEEP-02).

**If they choose otherwise**: Every unfinished PRD moves to the tier choices at its next activity, or every PRD keeps its earlier selection until the person clears it.

**Evidence**: Codex support for Kiln requires that saved PRDs keep working with their settings (AC-COMPAT-01), and a run in progress was started on a choice the person made. A PRD not yet started shows its plan before Start, so its new choices are seen before anything runs, and Kiln can't tell a selection the person made there from the one it filled in.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — corrections: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW
