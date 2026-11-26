# PRD: Kiln Model Modes

**Source:** Doug's requests and decisions, 2026-11-26, after using Kiln Phase Model Tiers: a way to run everything on one model, a way to keep a run off an account he wants to spare, a choice of where a change is saved, a clear way back from Model defaults, and a lighter model for the preflight.

**Changes:** [Kiln Phase Model Tiers](../kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md), which owns Model defaults, the fallback and each activity's model choice today.

**Assumptions:** [Kiln Model Modes assumptions](kiln-model-modes-assumptions.md)

**Review alongside:** the mockups of [Model defaults](mockups/kiln-model-modes-1-model-defaults.html), [one model for everything](mockups/kiln-model-modes-2-one-model-for-everything.html), [the fallback for everything](mockups/kiln-model-modes-3-fallback-for-everything.html), [a PRD with its own settings](mockups/kiln-model-modes-4-saved-for-this-prd-only.html), [Documents found](mockups/kiln-model-modes-5-documents-found.html), [Documents found with one model picked](mockups/kiln-model-modes-6-documents-found-one-model.html) and [other states](mockups/kiln-model-modes-7-other-states.html)

## Summary

Model defaults gains a second way to pick models. Beside the recommended model for each phase, which stays the default, a person can choose one model for everything.

The fallback gains a third setting. Besides never and "when usage is nearly out", it can be used for everything, which keeps a run off an account the person wants to spare while each phase still gets the fallback that fits its tier. The preflight and the pull request session get a row of their own, on a lighter setting than the audits.

Changes on the page are no longer saved as they are made. The person presses Save and chooses whether the change is for every PRD on the computer, which is the default, or for this PRD only. The page also gets a clear way back to the PRD it was opened from.

## Business Context

Kiln Phase Model Tiers lets Kiln pick a model for each phase from the phase's tier. Using it showed four gaps.

- **One model throughout.** A person who wants a whole PRD on one model has to change every phase by hand. That PRD left a single control out on purpose; in use, it is missed.
- **Sparing an account.** A person close to a weekly limit on one account, with days until it resets, wants Kiln to stay off that account now. The fallback only acts once usage reaches its threshold. Moving every phase to its fallback does what they want and keeps the match between tier and model: the stronger fallback for a demanding phase, the lighter one for the rest.
- **Where a change is saved.** Every change on Model defaults applied to every PRD at once and for good, which is wrong for a change meant to last a few days. The page also had no obvious way back. Its only button was Restore Kiln's defaults, so a person couldn't tell whether leaving would keep what they had changed.
- **The preflight's model.** The preflight and the pull request session run on the audits' model at high effort, which is more than a check before the run needs, and neither can be given a setting of its own.

This PRD uses the terms Kiln Phase Model Tiers defines: activity, tier, model choice, start and Model defaults. Two more recur below:

- The **mode** is which of the two ways of picking models is in force: the recommended model for each phase, or one model for everything.
- A PRD's **own settings** are a copy of everything on the Model defaults page, kept for that one PRD.

## Acceptance Criteria

### Choose between a model for each phase and one model for everything

Most people keep the recommended model for each phase. A person who wants one model throughout picks it once, in one place, and sees only the settings that go with the choice they made.

- [ ] **AC-MODE-01 — Model defaults offers two ways to pick models.** The page shows two choices, **Recommended model for each phase** and **One model for everything**. The first is selected until the person saves the other. Each shows its settings only while it is selected: the tier table and the fallback setting (AC-WHEN-01) under the first, and one agent, model family and effort under the second. The settings of the choice that isn't selected are kept, and return when it is selected again.
  - Replaces in part: AC-DEFAULT-02 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (the table and the fallback setting sit inside the recommended choice, beside a second choice; the rest remains).

- [ ] **AC-MODE-02 — One model runs everything that hasn't started.** While One model for everything is in force, every activity that hasn't started and that the person hasn't changed runs on that one agent, model and effort: every phase whatever its tier, both audits, the preflight and the pull request session. The model is a family, resolved to its newest version as AC-DEFAULT-01 says. Until the person picks, the choice is Claude Code · Opus · high. Each phase still shows its tier, and Change and Use the default work as AC-PICK-03 says, the default being the one model.
  - Replaces in part: AC-PICK-01 and AC-OTHER-01 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (while one model is in force, an activity the person hasn't changed runs on that model, not on its tier's or its row's first choice; the rest remains).

- [ ] **AC-MODE-03 — One model has no fallback.** While One model for everything is in force, Kiln launches no activity on a fallback, whatever the fallback setting says. At a usage limit the run waits and picks up again, as it does with the fallback set to Never.
  - Replaces in part: AC-FALLBACK-02 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (while one model is in force, no launch goes to a fallback; the rest remains).

### Use the fallback never, when usage is nearly out, or for everything

The fallback was a switch with a threshold. It becomes three settings in one place. The third is how a person keeps a run off an account they want to spare, without giving up the model that fits each phase.

- [ ] **AC-WHEN-01 — The fallback has three settings.** Under the tier table, **Use the fallback** offers **Never**, **When the first choice's usage reaches** a threshold, and **For everything, until you change this**. Never is selected until the person saves another. Never and the threshold setting behave as the switch's off and on do today, and the threshold keeps the limits AC-FALLBACK-01 gives it.
  - Replaces in part: AC-FALLBACK-01 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (three settings in place of a switch, shown inside the recommended choice; the rest remains).

- [ ] **AC-WHEN-02 — For everything launches each activity on its fallback.** While that setting is in force, Kiln launches each activity that hasn't started as the table says, without reading usage first. An activity's fallback is the one AC-FALLBACK-02 gives it.

  | The activity | Kiln launches it on |
  |---|---|
  | Has a fallback | The fallback |
  | Has none, because its fallback is on the same agent as its own choice | Its own choice, and its row says it has no fallback |

  Kiln never sends such a launch to the first choice because the fallback can't be used. The fallback's agent is the one the activity will run on, so before Start it is checked and billed as AC-AGENTS-01 and AC-AGENTS-02 say for such an agent, and at a usage limit on its account the run waits for that account.
  - Replaces in part: AC-FALLBACK-02 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (with For everything in force, a launch goes to the fallback whatever usage reads, and a fallback that can't be used makes the run wait or keeps Start unavailable, where the threshold setting launches on the first choice; the rest remains).
  - Replaces in part: AC-AGENTS-01 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (with For everything in force, the agent an activity will run on is its fallback's, and its first choice's agent isn't needed for it; the rest remains).

- [ ] **AC-WHEN-03 — Every place that shows a model shows the fallback while it is used for everything.** Wherever Kiln shows the plan, an activity that hasn't started and will launch on its fallback shows that fallback as its model choice, with a **Fallback** tag, and AC-FALLBACK-04's warning line isn't shown. On Model defaults, the First choice column is marked as skipped and the Fallback column as in use. An activity that started this way shows what AC-FALLBACK-03 says, and its card gives the reason as the fallback being used for everything, in place of a limit reading.
  - Replaces in part: AC-PICK-02, AC-FALLBACK-03 and AC-FALLBACK-04 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (with For everything in force, a row that hasn't started shows its fallback, the started activity's card gives that setting as its reason, and the warning line isn't shown; the rest remains).

### Give the preflight and the pull request session their own model

The preflight checks access before the run, and the pull request session closes it. Neither checks the whole PRD the way an audit does, so they no longer share the audits' setting.

- [ ] **AC-ROW-01 — The preflight and the pull request session share a row of their own.** Model defaults has a fifth row, **Preflight and pull request**, changed like the others, and both activities run on it. Until the person changes it, it holds the choices in the table. The Audits row now covers the delivery audit and the test audit only. A person changes the row's choice for one PRD with **Change** on the Preflight row or the pull request row while that activity hasn't started. The change reaches both, and is marked and undone as AC-PICK-03 says.

  | Row | First choice | Fallback |
  |---|---|---|
  | Preflight and pull request | Claude Code · Opus · medium | Codex · GPT Sol · medium |

  - Replaces in part: AC-DEFAULT-01, AC-DEFAULT-02 and AC-OTHER-01 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (a fifth row holds the preflight's and the pull request session's choice, which no longer come from the Audits row, and their rows offer Change; the rest remains).

### Save a change on purpose, for every PRD or for this one

A person changing a setting should know that it was saved, where it applies, and how to get back. Some changes are meant for every PRD from now on. Others are meant for the PRD in hand.

- [ ] **AC-SAVE-01 — Nothing on the page takes effect until Save.** Every change to the settings on the Model defaults page, Restore Kiln's defaults included, is held on the page until the person presses **Save**. A bar at the foot of the page always shows **Save changes for**, with **Every PRD on this computer** and **This PRD only**, and Save. Every PRD on this computer is selected unless AC-SAVE-04 says otherwise. Save is unavailable until something has changed, and **Discard** returns the page to what was last saved.
  - Replaces in part: AC-DEFAULT-02 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (a change is kept when the person saves it, not as it is made; the rest remains).

- [ ] **AC-SAVE-02 — The page has a way back that never loses a change silently.** At the top of the page, a button named for the PRD the page was opened from returns to that PRD. With unsaved changes, pressing it leaves the person on the page, and the save bar tells them to save or discard the changes first.

- [ ] **AC-SAVE-03 — A change saved for every PRD is a default.** It is kept as AC-DEFAULT-02 says and reaches what AC-DEFAULT-03 says, except a PRD that has its own settings.

- [ ] **AC-SAVE-04 — A change saved for this PRD only gives the PRD its own settings.** The PRD keeps its own copy of everything on the page: the mode, the one model, the rows and the fallback setting. Its activities that haven't started follow that copy, and nothing saved later for every PRD reaches them. Other PRDs and the defaults are unchanged. The copy is kept across restarts and upgrades, with Kiln's own record of the PRD and outside the repository, so it adds no file to commit or ignore (SAVE-001). Opened from that PRD, the page is titled for the PRD, says the PRD has its own settings and that every other PRD keeps the defaults, has This PRD only selected, and offers **Use my defaults here**, which removes the copy at once.
  - Replaces in part: AC-DEFAULT-03 and AC-FALLBACK-01 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (a PRD can hold its own settings, the fallback setting among them, and a change to the defaults doesn't reach such a PRD; the rest remains).

### Pick the way models are chosen where the PRD starts

The choice between the two modes is offered where the person starts a PRD and where they watch it run, so one model for a PRD is one step and not a visit to another page.

- [ ] **AC-PRD-01 — Documents found and the run's settings show the two choices.** In place of the line saying the models are chosen for each phase, the Models block shows both choices, with the one in force for this PRD selected. **Recommended model for each phase** carries one line saying when the fallback is used, with its threshold when it has one, and the **Model defaults** link. The other reads **One model for this PRD** and, while selected, shows its agent, model and effort. The block says so when the PRD has its own settings. The Audits line stays while the recommended choice is in force.
  - Replaces in part: AC-DEFAULT-02, AC-FALLBACK-01 and AC-KEEP-01 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (the two choices replace the line saying models are chosen for each phase and the line saying whether the fallback is on, and Documents found again offers one model for the PRD, as one of two choices; the rest remains).

- [ ] **AC-PRD-02 — A choice made there is this PRD's own, at once.** Selecting the choice that isn't in force, or changing the one model's agent, model or effort, takes effect without a Save and gives the PRD its own settings as AC-SAVE-04 says. In a run underway it reaches the activities that haven't started.

### Do the same from a terminal

Whatever a person can set in the browser, a person or a bot can set with a command.

- [ ] **AC-CLI-01 — Everything the page saves has a command.** Commands set the mode and its one model, the fallback's three settings and the Preflight and pull request row, for every PRD or for one PRD, and remove a PRD's own settings. The command that prints Model defaults shows all of these and, for a PRD, whether it has its own settings. Each has the same effect and limits as the page. The change AC-ROW-01 allows for one PRD has a command as AC-PICK-05 says. The commands that exist today keep their meaning: turning the fallback on selects the threshold setting, and turning it off selects Never.
  - Replaces in part: AC-DEFAULT-05 and AC-PICK-05 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (the commands also cover the mode, the third fallback setting, the fifth row and one PRD's own settings; the rest remains).

### Keep what people already set

Nobody's saved settings change meaning when they upgrade.

- [ ] **AC-CARRY-01 — Settings saved before this change keep their meaning.** After the upgrade, the mode is the recommended model for each phase, no PRD has its own settings, and what was saved reads as the table says. An activity that has started is untouched (AC-PICK-04).

  | Saved before this change | After it |
  |---|---|
  | A row's first choice or fallback | Kept |
  | The fallback on, with its threshold | When the first choice's usage reaches that threshold |
  | The fallback off, or never set | Never |
  | Nothing for the preflight or the pull request session | The new row at Kiln's choices (AC-ROW-01) |
  | An Audits choice the person changed for one PRD | Kept for that PRD's audits, and for its preflight and pull request session that haven't started |

### Explain it where people install Kiln

- [ ] **AC-GUIDE-01 — The public guide covers the new settings.** Kiln's installation and usage documentation says how to choose one model for everything or for one PRD, what the three fallback settings do and what For everything is for, that the preflight and the pull request session have a row of their own, and that a change is saved for every PRD or for one PRD, in the browser and from a terminal.

## Out of Scope

- Switching an agent off by name. For everything covers sparing an account while every first choice is on it.
- A setting that lapses on its own, such as one that lasts until a usage limit resets.
- A fallback for the one model.
- A third agent, or more than one fallback for a row.
- Changing the models Kiln ships for the three tiers and the audits.
