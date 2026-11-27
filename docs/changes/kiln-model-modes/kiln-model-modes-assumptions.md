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

**Last Updated**: 2026-11-27
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with Kiln Model Modes. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry before the Technical Assumptions section is a business assumption.

**Technical details** are documented in the [Technical Design](kiln-model-modes-technical-design.md).

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from what stakeholders have said or from the entries above, or is easy to change later. The stakeholder review shows them in an optional closing section.

### SAVE-003. Does a change saved for one PRD still apply after Kiln stops, restarts or is upgraded? — ⏳ PENDING (Added 2026-11-26 — new question; 90% confidence)

**Assumption**: Yes: a PRD's own settings, what you save for that PRD only, **stay until the PRD goes back to your defaults**, with **Use my defaults here** or a reset of Kiln for the PRD (SAVE-007), including after **Ctrl+C, a closed terminal, a restart of the computer and an upgrade of Kiln**. They are kept by Kiln **outside the repository**, so there is nothing to commit or add to a gitignore.

**Depends on**: SAVE-001

**If they choose otherwise**: A PRD's own settings would end when Kiln stops. After a restart the PRD would follow the defaults again, so a run picked up after it would go back to the account the person meant to spare.

**Evidence**: On 2026-11-26 you asked whether a change for this PRD is "just in memory, and if you hit Control C, it's gone? That might be acceptable", because of the file: "is it in the git ignore or whatever? For that reason, it seems like it might be easier to just have it be ephemeral" (18:22 UTC). Kiln already keeps a folder for each PRD outside every repository, so that file never arises. When we proposed this at 18:24, you replied "I think we're in good shape now" (18:32) without choosing.

The case you raised it for lasts days: "it's going to be a few days before it resets" (13:38 UTC). Of the **20 PRD runs** Kiln has recorded on this computer, **12 spanned more than a day**, and each of Kiln's 12 releases from 4 to 21 November meant a stop and restart to upgrade. Everything else Kiln keeps for one PRD, such as a phase's model changed with Change, already survives a restart.

**A wrong guess costs more one way.** Kept when you wanted it forgotten: Documents found, where you start the PRD, says it has its own settings, and one click on Use my defaults here ends them. Forgotten when you wanted it kept: after a restart the remaining phases launch on the account you meant to spare, and nothing warns you.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 90% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-26; research agreed with the answer above (75% → 90%); avenues: the stakeholder's words in the drafting chat, how every other choice Kiln keeps for one PRD behaves across a restart, Kiln's run records on this computer, per-project settings in Claude Code, Codex and VS Code; no untried avenue remains (Kiln doesn't record how often it was restarted, and has no email or meeting archive)

---

### SAVE-004. When you save for every PRD from a PRD that has its own settings, does only what you changed go to every PRD? — ⏳ PENDING (Added 2026-11-26 — new question; 70% confidence)

**Assumption**: Yes: you always open Model defaults from a PRD, and when that PRD has its own settings, the page shows them. If you change something there and save **for every PRD**, **only what you changed** goes into your defaults, and into this PRD's own settings too. **Everything else** in the PRD's own settings stays **this PRD's only**. Restore Kiln's defaults, saved for every PRD, still restores all of your defaults.

It is the **one case** where a change to your defaults reaches a PRD with its own settings; every other change leaves such a PRD alone (SAVE-002). So you can't make a PRD's own settings everyone's defaults in one go from its page.

**Depends on**: SAVE-002

**If they choose otherwise**: Saving for every PRD would make the whole page, as shown, the defaults, and the PRD would lose its own settings and follow those defaults.

**Example**: Customer returns has its own settings with the fallback set to For everything, which runs every phase on its fallback to spare an account. From its page you change the first choice for demanding phases and save for every PRD. Every PRD that follows your defaults gets the new choice, Customer returns gets it too, and only Customer returns keeps For everything.

**Evidence**: You asked that a change meant for a few days not last: "I kind of don't want that to be permanent. I want it to be for this session only" (2026-11-26, 13:38 UTC). Saving the whole page would make one PRD's temporary settings, such as For everything, every PRD's default.

Kiln already works this way for one PRD: a phase's model changed with Change outlasts any change to the defaults and ends only when undone, and the defaults hold only what you set, one change at a time. VS Code and Claude Code also save each change where you choose; Word's "Set As Default" saves a whole dialog, but as a button of its own.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 70% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-26; research reached the answer above on its own (70%); avenues: the stakeholder's words in the drafting chat, how Kiln Phase Model Tiers keeps one PRD's changes and the defaults, Kiln's other change documents, VS Code, Safari, Claude Code's /permissions, JetBrains and Word; untried avenues remain (Claude Code's own documentation for /permissions, cloud consoles, a test with a second user), none expected to change it

---

### SAVE-005. When a choice on Documents found makes a PRD's settings the same as your defaults again, does the PRD go back to following them? — ⏳ PENDING (Added 2026-11-26 — new question; 65% confidence)

**Assumption**: Yes. On Documents found, where you start a PRD, or in the run's settings, a choice such as **One model for this PRD** gives the PRD its own settings at once. A later choice there that makes them **the same as your defaults again**, such as **Recommended model for each phase**, returns the PRD to **following your defaults**, as Use my defaults here would, and later changes to your defaults reach it.

If its own settings still differ in **anything else**, such as For everything saved earlier for this PRD only, they **stay**, and only the choice you made changes.

**Depends on**: SAVE-002

**If they choose otherwise**: Switching back to Recommended would keep the PRD's own settings, then a copy of the defaults, so later changes to the defaults would not reach it until Use my defaults here.

**Example**: A PRD that follows your defaults is switched to One model, and the models part of Documents found says "This PRD has its own settings." Switched back to Recommended, that line goes. When For everything is later saved for every PRD, this PRD gets it.

**Evidence**: Of a change for a few days you said "I kind of don't want that to be permanent" (2026-11-26, 13:38 UTC), and you wanted the UI "as simple and intuitive as possible" (13:14 UTC). Keeping its own settings would show "This PRD has its own settings" just after you picked the default, and a later For everything saved for every PRD would quietly miss this PRD. One order of events still misses it: a PRD already on One model when For everything is saved for every PRD keeps its own settings when switched back to Recommended, since they then differ from your defaults, and runs on the account you meant to spare until Use my defaults here, though Documents found does say it has its own settings.

Against it: at 18:19 UTC you agreed to a list saying choices on Documents found apply "as that PRD's own settings", and that such a PRD is kept apart "until you return it to the defaults". That point was about applying without a Save; picking Recommended in the same block is itself a return to the defaults. Kiln's undo for one phase's model sits on that phase's row, and VS Code and Discord ("Use Category Default") likewise drop a setting set back to its default.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 65% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-26; the answer above is research's, and replaced the earlier one, keeping the PRD's own settings until Use my defaults here (now about 25%); avenues: the stakeholder's words in the drafting chat and ten other Kiln chats, how Kiln Phase Model Tiers undoes one phase's change, VS Code, Chrome and Discord; an untried avenue remains: how Figma and Slack treat an override set back to its default

---

### SAVE-006. When a Kiln update changes the model Kiln recommends for a row you never changed, does a PRD with its own settings get the new model too? — ⏳ PENDING (Added 2026-11-27 — new question; 85% confidence)

**Assumption**: Yes, the same as every PRD that follows your defaults. A PRD's own settings keep **only what you set**: what you saved for that PRD, and what you had set in your defaults when it got them. A row **you never changed** takes **Kiln's recommended model as it is now**. **What you saved for this PRD only still never changes.**

The **one model** Kiln suggests works the same way: until you pick one, installing Claude Code changes it, in a PRD with its own settings too.

**Depends on**: SAVE-002

**If they choose otherwise**: A PRD's own settings would fix Kiln's recommended models as they were when the PRD got them, until Use my defaults here.

**Example**: Customer returns has its own settings, with a model you chose for its demanding phases. A Kiln update recommends a newer model for mechanical phases, a row you never changed. Customer returns' mechanical phases start on the new model, as every other PRD's do, and its demanding phases keep the one you chose.

**Evidence**: Kiln Phase Model Tiers keeps **only what you set** in your defaults, so a release can ship a new recommended model **without overwriting anyone's choice**. When you confirmed SAVE-002, the later changes to the defaults that don't reach the PRD were yours, and they still don't.

Against it: a release that swaps a row's recommended models between Claude Code and Codex would, under For everything, launch that PRD on the account you meant to spare. Every PRD that follows your defaults has the same exposure, and the changelog announces such a change.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

---

### SAVE-007. Does resetting Kiln for a PRD also forget the settings saved for that PRD only? — ⏳ PENDING (Added 2026-11-27 — new question; 75% confidence)

**Assumption**: Yes. **Reset Kiln for this PRD forgets the PRD's own settings** along with everything else it forgets, and the PRD **follows your defaults again**. Documents found shows this before you press Start, so you can choose again there.

**Depends on**: SAVE-001, SAVE-003

**If they choose otherwise**: A reset would keep the PRD's own settings. The confirmation would list them under what stays, and Documents found would show them after the reset.

**Evidence**: You described reset as "deletes any state that Kiln was holding on to... as if you were running Kiln for the first time" (2026-11-12 04:00 UTC). The released reset already lists "Its settings for the PRD" under what Kiln forgets. You wanted the PRD's own settings to be temporary: "I kind of don't want that to be permanent" (2026-11-26 13:38 UTC).

Against it: SAVE-003 keeps them across a restart because losing them silently sends phases to the account being spared, but after a reset nothing runs until you press Start on Documents found, which shows the choice in force.

**A wrong guess costs little either way.** Forgotten when you wanted them kept: Documents found shows the defaults before Start, and choosing One model again takes one click. Kept when you wanted them gone: one click on Use my defaults here.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

**Researched**: 2026-11-27; research reached the answer above on its own (75%); avenues: the stakeholder's words in the reset and model-modes drafting chats, the released reset criteria and code, Kiln Phase Model Tiers' reset rule, one web search; no untried avenue remains (Kiln has no email or meeting archive)

---

### ROW-002. Do the merge session and Continue's push session run on the Preflight and pull request row, not the Audits row? — ⏳ PENDING (Added 2026-11-27 — new question; 85% confidence)

**Assumption**: Yes. The merge session after delivery and the session that pushes the plan when you press Continue both run on the **Preflight and pull request** row (Claude Code · Opus · medium, with Codex · GPT Sol · medium as its fallback), and the **Audits row runs only the delivery audit and the test audit** (AC-ROW-01). After the upgrade, a merge or push session that hasn't started moves from Opus high to medium, unless the Audits row was changed for every PRD (AC-CARRY-01) or for this PRD.

**Depends on**: ROW-001

**If they choose otherwise**: Both sessions would stay on the Audits row, at Opus high with GPT Sol extra high as the fallback, and a change to the Audits row would also change them.

**Evidence**: On 2026-11-26 you said of the preflight "It's just a preflight check… is there any real reason it needs to be high?" (13:18 UTC), and agreed that the pull request session drops to medium with it ("Everything else sounds good", 18:22 UTC). Your ruling for the audits, "for the audits, I guess it should be Opus high effort" (2026-11-22), named the audits. Neither session checks the whole PRD, which is the reason AC-ROW-01 gives. On 2026-11-26 a merge at Opus medium resolved conflicts across Kiln's engine and finished.

Against it: a merge can resolve code conflicts and fix failing checks, which is more than opening a pull request, and you haven't spoken about the merge's model.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 85% | **Impact**: 🟢 LOW

**Researched**: 2026-11-27; research reached the answer above on its own (85%); avenues: the stakeholder's words in the Model Modes drafting, PRD refinement and design chats and a keyword search of the stakeholder's messages in every chat, the After Delivery and Phase Model Tiers PRDs and Kiln Phase Model Tiers' DEF-002, the merge, push, pull request and preflight prompts, the resolver, Kiln's two recorded merge sessions; untried: no plan-push session has run yet, Codex session logs

---

### SAVE-008. Does Restore Kiln's defaults also put the mode and the fallback back to Kiln's choices? — ⏳ PENDING (Added 2026-11-27 — new question; 70% confidence)

**Assumption**: Yes. **Restore Kiln's defaults resets the whole page**: the way models are picked goes back to **Recommended model for each phase**, the five rows and the one model go back to Kiln's choices, and **Use the fallback** goes back to **Never**, with its threshold at 95. Like every other change on the page, it takes effect only **when you press Save**, for every PRD or for this PRD only.

**If they choose otherwise**: Restore would return only the rows and the one model to Kiln's choices, leaving the mode and the fallback setting as they are, as it does today.

**Evidence**: Recommended model for each phase and Never are what the page starts on until you save something else (AC-MODE-01, AC-WHEN-01). Restore sits at the foot of the page, outside both choices, and shows under One model for everything too (mockups 1 to 4), and a restore button at the foot of a settings page commonly resets every setting on it. When Kiln restores over a settings file it can't read, it already writes every row at its default and the fallback off at 95. Your only words about the button, on 2026-11-26 (13:14 UTC), were about it being the page's one obvious button: "The only obvious button is this 'Restore' at the bottom, but that's not what I want to do."

Against it: Restore today keeps the fallback switch and its threshold, a choice made while Kiln Phase Model Tiers was designed, with no ruling from you found. Of the fallback you said on 2026-11-22 (21:25 UTC) "that is basically a global setting… that's how it's set from that point forward", though that was about how long it lasts. The command that restores Kiln's defaults would now also turn the fallback off.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 70% | **Impact**: 🟢 LOW

**Researched**: 2026-11-27; the answer above is research's, and replaced the design's earlier one, which left the mode and the fallback setting as they were; avenues: the stakeholder's words in the Model Modes drafting and refinement chats and every Kiln Phase Model Tiers chat, the Tiers PRD, design and review page, this PRD's history, mockups 1 to 4, the code, one web search; untried: the Tiers build chats beyond keyword hits, how specific products' restore buttons behave

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| WHEN-001 | A third fallback setting, For everything, stands in for switching an agent off by name | 2026-11-26 | Confirmed in chat. In the PRD: AC-WHEN-01, AC-WHEN-02 and Out of Scope |
| WHEN-002 | With For everything on, a run waits when a fallback can't be used and never runs on the first choice | 2026-11-26 | Confirmed in chat. In the PRD: AC-WHEN-02 |
| MODE-001 | One model has no fallback; at a usage limit the run waits | 2026-11-26 | Confirmed in chat. In the PRD: AC-MODE-03 |
| ROW-001 | The preflight and the pull request session share one row, Opus medium with GPT Sol medium as its fallback | 2026-11-26 | Confirmed in chat. In the PRD: AC-ROW-01 |
| SAVE-001 | "This session only" means this PRD: the change applies to it until Use my defaults here, and adds nothing to the repository | 2026-11-26 | Confirmed in chat. Whether it survives Kiln stopping and starting again was not confirmed: SAVE-003. In the PRD: AC-SAVE-04, AC-SAVE-05 |
| SAVE-002 | A PRD with its own settings keeps a copy of the whole page, and later changes to the defaults don't reach it | 2026-11-26 | Confirmed in chat. In the PRD: AC-SAVE-04 |
| CARRY-001 | If the Audits row was changed for every PRD before the upgrade, the new Preflight and pull request row starts from its first choice and fallback | Answered 2026-11-27 | Kiln Phase Model Tiers AC-DEFAULT-02 keeps what the person sets across upgrades, and the Audits row was where they set the preflight's and the pull request session's model. In the PRD: AC-CARRY-01 |
