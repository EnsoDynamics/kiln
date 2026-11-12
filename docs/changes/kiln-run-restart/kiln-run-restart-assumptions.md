# Kiln Run Restart - Assumptions

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

**Last Updated**: 2026-11-12
**Status**: No open assumptions. Every entry has been answered or written up; see Validated Assumptions.

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Run Restart](kiln-run-restart-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| RERUN-001 | A Kiln-run new session is offered only when the phase's conversation can't be reopened, not at every stop | Written up 2026-11-11 | The concept Doug worked through on 2026-11-11 has no new-session button at a stop whose conversation can be reopened, and the stop pages keep one way forward per state. PRD AC-CARRY-01, which limits it to the reasons in AC-CARRY-02's table. |
| UI-001 | A phase that built nothing shows "Nothing to check yet" in place of its checks, and Mark complete stays reachable through Check Phase N anyway | Answered 2026-11-11 | The **Nothing to check yet** form, with Check Phase N anyway, is from the concept mockup Doug worked through on 2026-11-11. Doug, 2026-11-02, on completion waivers: "To be clear, we should be able to waive anything." On 2026-11-01 he asked for Mark complete to be offered only after a recheck still fails. PRD AC-CASE-03. |
| CTRL-001 | Bots get a reset command with the browser button's effect and eligibility, and no extra confirming step; its help states plainly that reset can't be undone, what Kiln forgets, and that nothing runs until someone presses Start in the browser | Corrected 2026-11-12 | Doug, in chat, 2026-11-12: "Let's allow the bot to do it and to address the downside in the CLI help for it. It should, you know, clearly mention the risk/downside in the help text, but allow it." Corrects the proposal that reset stay browser only. PRD AC-RESET-06. |
| CTRL-001 (part) | The two buttons that start a session also have commands, with the buttons' effect, eligibility and limits | Answered 2026-11-11 | Doug, 2026-11-02: "there is no human only thing in here either… the same option needs to be exposed to the CLI interface so that bots can do it as well." Bot control gives every command its browser counterpart's effect and eligibility. PRD AC-CARRY-04; the command names are left to the design. |
