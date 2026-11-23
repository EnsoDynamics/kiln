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

**Last Updated**: 2026-11-23
**Status**: Validated by the stakeholder on 2026-11-22, except the three entries below

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Phase Model Tiers. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** are documented in the [Technical Design](kiln-phase-model-tiers-technical-design.md).

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or is easy to change later.

### DEF-002. Raise only the audits' fallback to extra high effort, leaving the phases' fallbacks at high? — ⏳ PENDING (Ruled 2026-11-22 — we read your words; 85% confidence)

**Assumption**: **Yes.** The **Audits** fallback is **Codex · GPT Sol · extra high**, one step above the **high** that the Standard and Mechanical fallbacks keep (AC-DEFAULT-01).

**Why your 2026-11-22 answer didn't close this**: You confirmed Opus at high for the audits, then added "I guess for the backup for [Sol], maybe it should be very high effort". We read "the backup" as the **audits' fallback**, since it followed the audits, and "very high" as **extra high**, the effort one step above high. GPT Sol is also the fallback for standard and mechanical phases, which you set at high on 2026-11-21, so those stay at high.

**If they choose otherwise**: Every GPT Sol fallback ships at extra high, standard and mechanical phases included.

**Evidence**: On 2026-11-21 you paired the two efforts: "If I were doing Opus 5.5… medium effort, whereas if I was doing 6.2 [Sol], then I would do high effort". The audits raise Opus one step, medium to high, so one step above high for their GPT Sol fallback keeps that pair even. "Very high" came in your answer to the question about the audits, not the one about phases. Kiln's own skills use "very high" for "above the usual high setting", short of a multi-agent mode; Kiln offers efforts up to max, not Codex's ultra, which delegates to other agents.

Against it: GPT Sol is the fallback on three rows, and "the backup for [Sol]" could mean all three. Max, Codex's "maximum reasoning depth for the hardest problems", is also above high.

**Researched**: 2026-11-22; the stakeholder's 2026-11-22 answer read against the three questions it answered, the 2026-11-21 effort pairing, the tier table as it was shown, the Enso Method's use of "very high", Codex's model list (low to ultra) and Kiln's effort levels (low to max); no ruling between extra high and max, or on the other two GPT Sol fallbacks.

**Confirm or Correct**:
- [ ] Correct — extra high for the audits' fallback only
- [ ] Wrong — extra high wherever GPT Sol is the fallback
- [ ] Wrong — the highest effort, max, not extra high
- [ ] Wrong — corrections: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

### DEF-001. Ship the demanding fallback on GPT Astra at high effort? — ⏳ PENDING (Added 2026-11-22; narrowed 2026-11-23; 70% confidence)

**Assumption**: **Yes.** When a demanding phase falls back, it runs on **Codex · GPT Astra · high** (AC-DEFAULT-01). Your 2026-11-23 reply set mechanical phases to Sonnet at high and said nothing about this half, so it stands as decided.

**If they choose otherwise**: The Demanding fallback ships at **Codex · GPT Astra · extra high**, which thinks harder and uses more of the Codex account when a demanding phase falls back. It changes that row of the AC-DEFAULT-01 table and the shipped defaults.

**Evidence**: GPT Astra at high matches your high for GPT Sol on phases (2026-11-21). Against it: you raised the audits' GPT Sol fallback to "very high effort" (2026-11-22), and may want the demanding fallback raised too.

**Researched**: 2026-11-22; all of the stakeholder's messages, Codex support's PRD and assumptions, the audit-loop-limits PRD and design, both agents' model lists, Anthropic's model-configuration documentation; no ruling on GPT Astra's effort.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — GPT Astra at extra high
- [ ] Wrong — corrections: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

### KEEP-003. When a PRD set up before this change has finished and is continued with added phases, do those phases take their tiers' models, unless the person had picked one? — ⏳ PENDING (Added 2026-11-22 — new question; 90% confidence)

**Assumption**: **Yes.** When a PRD set up before this change has finished and is continued with added phases, those phases are treated like a PRD **not yet started**. A saved choice equal to Kiln's current default (**Claude Code · Opus · medium**, or **Codex · any GPT Sol version · high**) is dropped, so each added phase takes **its tier's model** from Model defaults, and the audits after them take the **Audits** choice. Any other saved choice is kept and marked **Changed by you** on each added phase.

**Depends on**: KEEP-001

**If they choose otherwise**: Every added phase runs on the PRD's **old single choice** and shows Changed by you, whatever its tier; the person presses **Use the default** on each row to get the tiers.

**Evidence**: KEEP-001 keeps the old choice for a PRD "already underway… on everything it has left". A finished PRD has nothing left, and its added phases have run nothing, so moving them undoes no work. A value equal to Kiln's default is not a pick.

Without this, a PRD set up the day before the upgrade would run its added phases on one model, while one set up the day after gets tiers. Against it: Continue Added Phases says continuations "use the existing agent/model settings" (AC-CONTINUE-08), written when one choice covered the whole PRD.

**Researched**: 2026-11-22; the stakeholder's recorded answers, this PRD and design, Continue Added Phases' PRD and design, the continuation code; no ruling on finished PRDs.

**Confirm or Correct**:
- [ ] Correct — added phases take their tiers unless the person had picked a model
- [ ] Wrong — added phases keep the PRD's old choice
- [ ] Wrong — corrections: _______________

**Confidence**: 90% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| CLI-001 (part) | Changing a not-started phase's model, or a PRD's Audits choice, in a run underway has a command | Answered 2026-11-22 | PRD AC-PICK-05. The stakeholder on bot control, 2026-11-02: "there is no human only thing in here either… the same option needs to be exposed to the CLI interface so that bots can do it as well" |
| CLI-001 | Commands change Model defaults and turn the fallback on or off, so a bot can do both | 2026-11-22 | PRD AC-DEFAULT-05. The stakeholder: "it's probably not critical that the bot be able to change the model defaults or turn on the fallback. But as long as, with the interface, we're not making a kind of a mess to enable that, we might as well stick with the theme of just enabling bots to do whatever." The criterion keeps its `Added in refinement.` line, so the design may narrow or drop it if the commands would complicate the command line. The design keeps it whole, as one `kiln model-defaults` group: Technical Design §Command line |
| DEF-001 (part) | Mechanical phases run on Claude Code · Sonnet at high effort | Answered 2026-11-23 | PRD AC-DEFAULT-01. The stakeholder's review reply, 2026-11-23: "I would use Sonnet at high-level effort rather than medium." |
| DEF-001 (part) | Opus ships at medium effort and GPT Sol at high, including as the Standard and Mechanical fallback | Answered 2026-11-22 | PRD AC-DEFAULT-01. The stakeholder, 2026-11-21: "If I were doing Opus 5.5, then right now, today anyway, I would do medium effort, whereas if I was doing 6.2 [Sol], then I would do high effort". Mechanical's fallback being the same as Standard's: he asked that mechanical be "a lower rung, not just the same exact choices" (2026-11-21), which its Sonnet first choice is, then agreed the tier outline with GPT Sol as Mechanical's fallback, 2026-11-22: "I think it's fine, except for demanding". The Audits fallback's effort is DEF-002 |
| DEF-001 (part) | Demanding phases run on Fable at high effort | 2026-11-22 | PRD AC-DEFAULT-01. The stakeholder: "I guess we'll let the default be high effort for Fable" |
| DEF-002 (part) | The audits, the preflight and the pull request session run on Claude Code · Opus · high | 2026-11-22 | PRD AC-DEFAULT-01, AC-OTHER-01. The stakeholder: "for the audits, I guess it should be Opus high effort" |
| DEF-003 | A person with only Codex can start without opening Model defaults, on the Fallback column's Codex choices | Written up 2026-11-22 | PRD AC-DEFAULT-04. Required by Codex support's promise that a person with only the selected agent installed can start (AC-AGENT-03) |
| DEF-003 (part) | How Kiln substitutes when Claude Code isn't installed | Moved to design 2026-11-22 | A build choice: Technical Design §Design Decisions ("When Claude Code isn't installed") and §Resolving a Choice, step 4 |
| PICK-001 | A started phase keeps its agent, model and effort even when the person starts a new session for it; a session that ended before any response doesn't count as a start | 2026-11-22 | PRD AC-PICK-04, AC-PICK-07. The stakeholder, of the team's decisions: "I agree with all of that" |
| FALL-001 | A phase whose model the person picked by hand falls back like any other when its account is nearly out | 2026-11-22 | PRD AC-FALLBACK-02, AC-FALLBACK-03. The stakeholder: "I agree with all of that" |
| FALL-002 | The next phase or audit shows a one-line heads-up when it would launch on the fallback | 2026-11-22 | PRD AC-FALLBACK-04. The stakeholder: "I agree with all of that" |
| FALL-003 | With the fallback on but its agent not ready, Documents found warns and Start stays available | 2026-11-22 | PRD AC-AGENTS-01, AC-AGENTS-02. The stakeholder: "I agree with all of that" |
| KEEP-001 | A PRD already underway keeps the one model it was set up with; one set up but not yet started moves to the per-phase models unless the person had picked its model | 2026-11-22 | PRD AC-KEEP-02. The stakeholder: "I agree with all of that" |
| KEEP-001 (part) | How Kiln tells a model the person picked from one it filled in, on a PRD not yet started | Moved to design 2026-11-22 | A build choice: Technical Design §Design Decisions ("Telling a picked model from a filled-in one") and §Data Models, migration step 2. PRD AC-KEEP-02 |
| KEEP-002 | The one agent, model and effort choice for a whole PRD goes away; each phase's Change and Model defaults take its place | 2026-11-22 | PRD AC-KEEP-01, Out of Scope. The stakeholder: "I do agree with it… It kind of has to, given this new functionality." He also confirmed the Documents found mockup, which shows the phase plan's Change buttons and the Model defaults link in its place |
