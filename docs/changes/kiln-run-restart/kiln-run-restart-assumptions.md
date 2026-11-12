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
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Run Restart](kiln-run-restart-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

---

## Command-Line Assumptions

### CTRL-001. Should reset stay in the browser for now, with no reset command for bots? — ⏳ PENDING (Added 2026-11-11 — new question; 78% confidence)

**Assumption**: **Yes: for now reset is done only in the browser.** A bot that asks what it can do is told that reset is done in the browser, and how to open it. Setting up a run from the command line **is not planned anywhere yet**; a reset command would fit best alongside it, if it is ever planned.

A reset puts the PRD back at the **first screen**, where the branch, agent and settings are chosen and Start is pressed. That screen is in the browser view, which **opens only on the computer Kiln runs on, or one tunnelled to it**, never on a phone.

So a reset sent from the phone **gets nothing running**. It permanently forgets the PRD's **waivers, audit results and record of earlier deliveries**, and nothing moves until someone is at a computer that can open the browser view.

**If they choose otherwise**: AC-RESET-06 changes. Instead of listing reset as done in the browser, the command line gets a **reset command** that first lists what goes and what stays, as the browser does, so a bot can reset from the phone. The PRD then **waits at the first screen** until someone opens the browser.

**Evidence**:
- **The closest Doug has come**, on 2026-11-07 at his desk: "if we can just run some commands to sort of reset things and I can try running it again without the early merges on, then isn't that better". He wanted the reset in order to **set the run up again differently**, and that setup is the browser step; a reset command would have left him at the same browser screen.
- **For browser only**, Doug on 2026-10-11: "we'll just have the web interface control all of it, at least for a first version". That predates the bot commands; six days later he widened it: "any action the browser view offers should later be possible from outside it".
- No ruling by Doug on resetting from a bot or the phone was found. Bot control keeps new-run setup in the browser, and no PRD, roadmap item or idea note plans to change that.

**Confirm or Correct**:
- [ ] Correct — browser only for now; the command line says where to find it
- [ ] Wrong — give bots a reset command now; the PRD then waits at the first screen
- [ ] Wrong — different approach: _______________

**Researched**: 2026-11-12, third pass, found one supporting quote; no avenue reachable on this machine is left. Tried: assumptions tables of Kiln v1, bot control, live session control, completion waivers and two recovery PRDs; the command guide, command contracts, control code and git history; confirm flags in comparable tools; the 2026-11-07 conversation in full; Doug's messages on bots, phone, command line and reset in every Codex and Claude chat on this machine (this pass: before 2026-10-15); the bot's saved state; how the browser view can be reached; whether any PRD, roadmap item or idea note plans command-line run setup. Not stored here: the bot chat platform's own message history after 2026-10-03.

**Confidence**: 78% | **Impact**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| RERUN-001 | A Kiln-run new session is offered only when the phase's conversation can't be reopened, not at every stop | Written up 2026-11-11 | The concept Doug worked through on 2026-11-11 has no new-session button at a stop whose conversation can be reopened, and the stop pages keep one way forward per state. PRD AC-CARRY-01, which limits it to the reasons in AC-CARRY-02's table. |
| UI-001 | A phase that built nothing shows "Nothing to check yet" in place of its checks, and Mark complete stays reachable through Check Phase N anyway | Answered 2026-11-11 | The **Nothing to check yet** form, with Check Phase N anyway, is from the concept mockup Doug worked through on 2026-11-11. Doug, 2026-11-02, on completion waivers: "To be clear, we should be able to waive anything." On 2026-11-01 he asked for Mark complete to be offered only after a recheck still fails. PRD AC-CASE-03. |
| CTRL-001 (part) | The two buttons that start a session also have commands, with the buttons' effect, eligibility and limits | Answered 2026-11-11 | Doug, 2026-11-02: "there is no human only thing in here either… the same option needs to be exposed to the CLI interface so that bots can do it as well." Bot control gives every command its browser counterpart's effect and eligibility. PRD AC-CARRY-04; the command names are left to the design. |
