# Kiln Model Modes - Assumptions

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

**Last Updated**: 2026-11-26
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Model Modes. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** will be documented in the technical design, `kiln-model-modes-technical-design.md`, once it is written.

---

## Fallback Assumptions

### WHEN-001. Cover "stay off an account I want to spare" with a third fallback setting, For everything, instead of switching an agent off by name?

**Assumption**: **Yes.** The fallback gets a third setting, **For everything, until you change this**. While it is on, every phase, audit and check launches on its row's **fallback**, and nothing launches on a first choice (AC-WHEN-01, AC-WHEN-02). There is **no list of agents to switch on or off**.

**If they choose otherwise**: Model defaults gains a list of agents, each with a switch. Kiln skips a switched-off agent, and each row runs on whichever of its two choices is on an agent still on.

**Example**: With Kiln's own choices and For everything on, a demanding phase launches on **Codex · GPT Astra · high** and a standard phase on **Codex · GPT Sol · high**. Nothing launches on Claude Code.

**Evidence**: On 2026-11-26 you asked for a way to mark which providers are "eligible", so that with Claude near its limit Kiln would still "intelligently use Astra where needed and Sol where needed". You then turned down the layout built on agent checkboxes ("It almost assumes that Claude would always be the first choice") and asked for First choice and Fallback columns with a fallback you can turn on and off. For everything gives your case the same result from those columns. You reviewed the mockup with the three settings and said "I think this is good now."

Against it: it skips **every first choice**, not one agent. If your rows' first choices were spread across both agents, it could not spare just one of them. The same limit holds if a third agent is added later.

**Confirm or Correct**:
- [ ] Correct — a third fallback setting, no agent switches
- [ ] Wrong — add a switch for each agent as well
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later.

### WHEN-002. With For everything on, wait when a fallback can't be used, instead of running on the first choice?

**Assumption**: **Yes.** If the fallback's agent isn't ready, **Start is unavailable** until it is. If the fallback's account hits a usage limit, the run **waits for that account**. Kiln never moves the phase back to its first choice (AC-WHEN-02).

**Depends on**: WHEN-001

**If they choose otherwise**: For everything behaves as the threshold setting does today. When the fallback can't be used, the phase launches on its first choice and its row says why.

**Evidence**: You turn this setting on to keep a run off the first choice's account, so launching there would undo what you asked for without telling you until you looked. The threshold setting goes back to the first choice because its purpose is the opposite one: keeping the run moving.

Against it: a run can sit waiting on the fallback's account while the first choice's account has usage left.

**Confirm or Correct**:
- [ ] Correct — wait, and never run on the first choice
- [ ] Wrong — run on the first choice and say why
- [ ] Wrong — corrections: _______________

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

### MODE-001. With one model chosen, wait at a usage limit instead of falling back?

**Assumption**: **Yes.** One model for everything, and One model for this PRD, have **no fallback**. At a usage limit the run waits and picks up again, as it does today with the fallback off (AC-MODE-03).

**If they choose otherwise**: The one model gets a second pick beside it, its fallback, and the fallback setting applies to it as it does to the tier table.

**Evidence**: Of the screen with one model selected, you said on 2026-11-26 that the agents and fallback section "is kind of irrelevant at that point. It should either be grayed out, or that section should probably be included within the 'recommended for each phase'". The mockup you then reviewed shows one agent, model and effort and the line "At a usage limit a run waits and picks up again."

Against it: a person who runs everything on one model overnight stops at a limit, where the recommended mode would have carried on.

**Confirm or Correct**:
- [ ] Correct — one model waits at a limit
- [ ] Wrong — one model has a fallback model too
- [ ] Wrong — corrections: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

### ROW-001. Put the preflight and the pull request session on one row of their own, at Opus medium with GPT Sol medium as its fallback?

**Assumption**: **Yes.** A new **Preflight and pull request** row holds **Claude Code · Opus · medium**, with **Codex · GPT Sol · medium** as its fallback. Both sessions run on it, and the Audits row keeps Opus at high for the two audits only (AC-ROW-01). On upgrade, a preflight or pull request session that hasn't started moves from high to medium.

**If they choose otherwise**: Either the pull request session stays on the Audits row at high and the new row is for the preflight alone, or the row's fallback is GPT Sol at high, matching the phases' fallbacks.

**Evidence**: On 2026-11-26 you said of the preflight: "I would think that would be Opus 5.5 medium. It's just a preflight check", and that it "probably should" be changeable. Your 2026-11-22 ruling, "for the audits, I guess it should be Opus high effort", named the audits; the team had put the preflight and the pull request session on the same setting. You reviewed the mockup with this row and said "I think this is good now."

Against it: you named only the preflight. The pull request session does more than a check, and you set GPT Sol at high for phases on 2026-11-21.

**Confirm or Correct**:
- [ ] Correct — one row for both, Opus medium and GPT Sol medium
- [ ] Wrong — the pull request session stays with the audits at high
- [ ] Wrong — the row's fallback is GPT Sol at high
- [ ] Wrong — corrections: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

### SAVE-001. Does "this session only" mean this PRD, kept until you undo it?

**Assumption**: **Yes.** The second place to save is **This PRD only**. The PRD keeps the change until you press **Use my defaults here**, including when Kiln is closed and opened again (AC-SAVE-04).

**If they choose otherwise**: The change lasts only while Kiln stays open. The next time Kiln is opened on the PRD, it follows the defaults again.

**Evidence**: You asked on 2026-11-26: "Should we save these as global defaults, or is it for this session only?", with the example of switching Claude off for the few days before a limit resets. Kiln is opened on one PRD at a time, and a PRD's run can outlast one sitting. A change that vanished when Kiln restarted would put the rest of that run back on the account you meant to spare. You reviewed the mockups reading "This PRD only" and said "I think this is good now."

Against it: a second PRD started the next day follows the defaults, so you would set it again there.

**Confirm or Correct**:
- [ ] Correct — this PRD, until I undo it
- [ ] Wrong — only until Kiln is closed
- [ ] Wrong — corrections: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

### SAVE-002. Does a PRD with its own settings ignore later changes to the defaults?

**Assumption**: **Yes.** Saving for this PRD only keeps a copy of **the whole page** for that PRD. A change saved later for every PRD **doesn't reach it** until you press **Use my defaults here** (AC-SAVE-04).

**Depends on**: SAVE-001

**If they choose otherwise**: The PRD keeps only the settings you changed for it, and follows the defaults for everything else. If you later change the Standard row for every PRD, that reaches this PRD too.

**Evidence**: The mockup you reviewed says of such a PRD: "This PRD has its own settings. Every other PRD keeps your defaults." One rule, a PRD follows either its own settings or the defaults, is easier to predict than a mix of the two.

Against it: a PRD that runs for weeks misses a better default until you return it to the defaults.

**Confirm or Correct**:
- [ ] Correct — the PRD keeps its own copy of everything
- [ ] Wrong — only what I changed is its own; the rest follows the defaults
- [ ] Wrong — corrections: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

---

## Validated Assumptions

None yet.
