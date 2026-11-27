# Technical Design: Kiln Model Modes

**PRD:** [Kiln Model Modes](kiln-model-modes-prd.md) · **Decisions:** [assumptions](kiln-model-modes-assumptions.md) · **Design references:** the seven mockups the PRD links · **Extends:** [Kiln Phase Model Tiers technical design](../kiln-phase-model-tiers/kiln-phase-model-tiers-technical-design.md)

## Overview

Kiln Phase Model Tiers gave every activity one resolver and one launch decision, both reading one settings file. This change keeps both and changes what they read. Four things carry the design:

- **Settings in force.** A PRD's settings are its own when it has them, otherwise Model defaults. Both are the same shape in the same kind of file, read by one reader on every resolution (§Settings in Force).
- **The mode and For everything are resolver steps.** One model for everything replaces the row lookup. For everything makes an activity's fallback its choice. Rows, readiness, billing, waits and stops already follow the resolver's choice, so they need no branch of their own (§Resolving a Choice).
- **A save is a set of changes.** The page holds a draft and sends only what the person changed, to one settings file or two (§Saving).
- **A fifth row.** Every activity that isn't a phase or an audit, the preflight, the pull request session, the merge and the plan push, leaves the Audits row and its per-PRD entry for its own (§Resolving a Choice, §Data Models).

No new service, repository, database or dependency.

## Existing Code

**Posture: Preserve.** Kiln Phase Model Tiers is built and released, and AC-CARRY-01 keeps what people saved.

- **Reused:** the resolver and its start line; the launch decision with its usage reading, counted limits and fallback launch checks; needed agents, their readiness and billing; the wait before the start; the `selection` stop; the one module behind the page, the routes and `kiln model-defaults`; the atomic write of the settings file (the watch on it becomes a read of both files' revision once a second, §Snapshot); the omitted-effort rule; `POST /api/model` and `kiln model`; the Model defaults page's row editor.
- **Kept, and not visible from the code alone:**
  - An activity that has started is bound by resolver step 1, before any step this design adds. Nothing here reaches it.
  - A launch keeps the decision it saved. A change of mode, of the fallback setting or of a PRD's own settings made after that reaches the activity only if the launch ends with no response, as a Model defaults change does today.
  - A Kiln that can't read a settings file never falls back to Kiln's shipped choices, or to Model defaults over a PRD's own settings.

## Architecture

### Workload Type and Starting Point

The existing local TypeScript application: the engine, its loopback server, the Svelte view and the `kiln` command line. Patterns come from this repository.

### Storage

Model defaults stays `<state root>/model-defaults.json`, now schema 2. A PRD's own settings are a second file of the same schema, `model-settings.json` in that PRD's state directory, which is outside every repository (AC-SAVE-04). Both are owner-only and written atomically. A reset discards `model-settings.json` with the rest of the PRD's state, as Kiln Run Restart's AC-RESET-03 and AC-RESET-04 forget its settings for the PRD (AC-SAVE-04, SAVE-007); the discard already removes every file but the instance lock, the record and the reset receipts, so reset is unchanged. The PRD record moves to the next schema number, 28 as this is written, for the new per-PRD entry (§Data Models).

### Dependencies

Claude Code and Codex, through their existing adapters. No new call is made to either.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where a PRD's own settings live (SAVE-003) | A file in the PRD's state directory, read on every resolution and watched, not a field of the PRD record | AC-CLI-01 saves for one PRD from a terminal with no Kiln running, and AC-PRD-02 changes them before Start and in a run underway. The record belongs to the running Kiln and changes through its instruction journal; a file of its own is written by the page, the Models block and the command through one module, exactly as Model defaults is. It also survives a restart and an upgrade with nothing to migrate |
| What a PRD's own settings hold | A copy of what Model defaults holds, the fields the person set, as read when they are created, with the change applied. That read includes the schema 1 read (§Settings files). A field neither file holds reads as §Settings files says. Nothing the person later sets, changes or restores in Model defaults reaches the PRD's file, except a save for every PRD made from this PRD's own page, which applies to both files (§Saving, the table's fourth row; SAVE-004) | AC-SAVE-04 and SAVE-002: the person's later changes to the defaults never reach the copy. SAVE-006: a field the person never set still follows Kiln's current choice, so a release's new row choice reaches it and installing Claude Code still changes the one model until it is picked. Holding only the fields the person set also keeps `set` and the command line's "Kiln's default" true, and lets SAVE-005's comparison find the two equal after an upgrade or once Claude Code is installed |
| Model defaults still holds only what the person set | Unchanged; the mode, the one model and the fifth row follow the same rule | A later release can ship a new choice without overwriting anyone's |
| Where For everything is applied | In the resolver, as its last step, not in the launch decision | AC-WHEN-02 treats the fallback as the choice in every respect: its agent is checked and billed, a wait watches its account, and a fallback that can't be used stops the run instead of yielding to the first choice. Every one of those already follows the resolver's choice |
| What One model for everything does to the fallback | The activity has no fallback while that mode is in force, so the launch decision takes its existing no-fallback path | AC-MODE-03: no launch on a fallback, no agent needed because a fallback names it, a wait at a limit as with Never |
| The shape of a save | The changes the person made, never the whole page | AC-SAVE-03 puts only what changed into the defaults and into the PRD's own settings. It also means a setting changed elsewhere while the page was open isn't written back over |
| Browser Back and Forward with a draft on Model defaults | The draft is kept in page memory and shown again when Model defaults reopens (§Saving, "Leaving with a draft") | AC-SAVE-02 never loses a change silently. The view is routed in the page, and the browser's history event arrives after the address has already changed, so that move can't be refused the way the button back and the Kiln mark are |
| A save for every PRD from a PRD with its own settings (SAVE-004) | One request, checked against both files before either is written, then applied to Model defaults and to the PRD's own settings. A write that fails after the first file was written is a failed save naming the file not written, and the page keeps its draft | A row's first choice and fallback can't share an agent, and the same change can pass in one file and fail in the other; checking both first means neither is half-saved. Applying the same changes twice is harmless, so pressing Save again after a failed second write is safe |
| Model defaults' schema | Raised to 2 on the first write by this version; schema 1 is read without being rewritten | A Kiln from before this change would read a file with a mode or For everything as if neither were set, and launch on the account the person meant to spare. Its existing rule for a newer schema makes it refuse the file instead |
| The fifth row for someone who changed Audits (CARRY-001) | Decided when a schema 1 file is read: if either side of the Audits row was set, the new row takes both of the Audits row's sides. The first write keeps that | The carry-over is one step of reading the old file, so it runs once per file and never touches a file this version wrote |
| The per-PRD entry for the fifth row | Its own entry beside the Audits entry, filled from the Audits entry by the record migration | AC-ROW-01 makes a Change on the Preflight or pull request row reach those two only, and AC-CARRY-01 keeps an Audits change made before the upgrade for them |
| Restore Kiln's defaults | Returns the mode, the five rows, the one model and the fallback setting to Kiln's choices (§Settings files; SAVE-008). It clears every field from each file the save writes, in either file, so saved for this PRD only it empties the PRD's own settings, which remain. Saved for every PRD from a PRD with its own settings, it removes that PRD's own settings file, which would otherwise hold exactly what Model defaults then holds, and the PRD follows the restored defaults (SAVE-008). It is one of the changes a save carries (§Saving, "The page holds a draft") | AC-SAVE-03: Restore, saved for every PRD, restores all of the defaults, and the page places it at its foot, outside both modes (mockups 1 to 4). Clearing the fields rather than writing Kiln's values keeps the file holding only what the person set |
| The one model until the person picks | Decided when read: Claude Code · Opus · high, or Codex · GPT Sol · high when Claude Code isn't installed. Never saved by itself, in either file: a mode changed to `one_model` carries the one model shown, which saves it with the mode (AC-SAVE-03) | AC-MODE-02. Until the person saves it, installing Claude Code later changes it with no step by the person, as it changes the rows' Codex substitution (Kiln Phase Model Tiers AC-DEFAULT-04) |
| `kiln model-defaults` for one PRD | The same commands with `--prd <PRD-path>`, with no controller and no safety flags | AC-CLI-01 asks for an option, not a second set. They change a settings file, not a run, as the commands for the defaults do |
| The fallback in command and status output | `use` is added, and `enabled` stays, true unless the setting is Never | A bot written against `enabled` keeps reading whether a fallback can be used at all |

## Settings in Force (AC-MODE-01, AC-WHEN-01, AC-SAVE-04, AC-SAVE-05)

```
ModelSettings:
  mode:      "recommended" | "one_model"
  oneModel:  FamilyChoice
  rows:      demanding, standard, mechanical, audits, preflight_pr: each { first: FamilyChoice, fallback: FamilyChoice }
  fallback:  { use: "never" | "threshold" | "everything", threshold: 1..100 }
```

A PRD **has its own settings** when `model-settings.json` exists in its state directory. Its settings in force are that file's; otherwise they are Model defaults'. One function returns them with their source, `"prd"` or `"defaults"`, and everything below reads through it: the resolver, the launch decision, needed agents, the heads-up, the snapshot, `kiln status` resolving a choice with Kiln not running (AC-PICK-07), and the commands. The fallback setting **is in force** only while the mode is `recommended`.

Both modes' settings stay in the file whichever is selected, which is how each returns when it is selected again (AC-MODE-01).

A PRD's own settings that can't be read are an error wherever one of that PRD's choices is resolved, with the file's path, as Model defaults is today. While the settings in force can't be read, whichever file they are, a choice changed for this PRD or kept by it can't be used either, where before this change it launched: the unread file may say the fallback is used for everything, which wins over such a choice (§Resolving a Choice, step 5), so launching it could run on the account the person is sparing. Its row and stop keep the choice and its Changed by you mark, give the file's reason, and name no place to change the choice, since changing it is not the remedy. Use my defaults here is the one write allowed over them, and is refused over a newer schema version.

A PRD with its own settings needs nothing from Model defaults: its choices, fallbacks, page and commands read its own file, and Model defaults that can't be read change none of them; only a save for every PRD from its page is refused (§Saving).

## Resolving a Choice (AC-MODE-02, AC-MODE-03, AC-WHEN-02, AC-ROW-01, AC-SAVE-04)

Steps 1 and 3 are unchanged. Step 2 reads the entry of the activity's kind: an audit's is the Audits entry; every other activity that isn't a phase, the preflight, the pull request session, the merge and the plan push, reads the PRD's new Preflight and pull request entry.

4. **Otherwise**, from the settings in force:
   - `one_model`: the one model, its family resolved as a row side's is.
   - `recommended`: the first choice of the activity's row. A phase's row is its tier's; an audit's is Audits; every other activity that isn't a phase (step 2) is Preflight and pull request. The substitution when Claude Code isn't installed is unchanged.

   The activity's **fallback** is none while the mode is `one_model`, whatever step gave its choice. Otherwise it is its row's Fallback column choice in the settings in force, unless that is on the same agent as the choice.

5. **For everything.** While the fallback setting is in force and reads `everything`, an activity with a fallback takes that fallback as its choice. It is tagged **Fallback**, the choice steps 2 to 4 gave is kept as its first choice, and it then has no fallback. An activity with none keeps its choice and is marked as having no fallback.

Step 5 applies over a Changed by you or kept choice too: such a phase on Claude Code launches on its row's Codex fallback, and its entry, its mark and Use the default stay, so its own choice returns when the setting changes. A person who wants a phase on a particular model meanwhile picks one on the fallback's agent, which leaves the phase with no fallback (mockup 7, state B).

Where a choice came from gains two answers, used by the row, the `selection` stop's facts and the saved launch decision: the one model, and this PRD's own settings as distinct from Model defaults. Each new source reads as the table says, giving the choice, where it came from and where to change it (AC-PICK-06 in the Tiers PRD); `<Row>` is the row's name and `<where>` is "Model defaults" or "this PRD's own settings". Whenever `<where>` is this PRD's own settings, every row's where-to-change line reads "in Model defaults, opened from this PRD's page" where it names Model defaults, as the last row's always does.

| Source | "from …" | Where to change |
|---|---|---|
| One model | "the one model in `<where>`" | "Change the one model in Model defaults." A phase or a preflight or pull request activity adds today's ", or on its row in the phase plan." |
| For everything | "the `<Row>` row's Fallback column in `<where>`, used for everything" | "Change that row's fallback, or the fallback setting, in Model defaults." |
| Threshold fallback | "The fallback, from the `<Row>` row's Fallback column in `<where>`." | Today's wording |
| Own settings, recommended | "this PRD's own settings (`<Row>` row)" | "Change the `<Row>` row in Model defaults, opened from this PRD's page." |

Under For everything, a Changed by you first choice doesn't change the source: the fallback still comes from the row (step 5). The row names gain Preflight and pull request. No stop names the Models block, which isn't on the stop pages.

The `selection` stop and the readiness stop for the preflight, the pull request session, the merge and a plan push name the Preflight and pull request row as their subject, not the Audits row. Where to change the choice of the preflight or the pull request session is Change on the Preflight row or the pull request row, or that row of the settings in force (AC-ROW-01). The merge and a plan push run only once the run is complete, when no row offers Change and the model command is refused. Their stops name only the Preflight and pull request row in Model defaults, which shows this PRD's own settings when opened from its page, where This PRD only saves. A merge or plan push whose choice is a change for this PRD names that change, and says it can't be changed once the run is complete.

Wherever Kiln explains the Audits row, in the Models block and on Model defaults, it reads "The delivery audit and the test audit. Not a tier: they check the whole PRD." (mockup 1).

## Launching (AC-MODE-03, AC-WHEN-02, AC-WHEN-03, AC-ROW-01)

The launch decision changes in one line and one record:

```
decide(activity):
    first = the resolver's choice;  fallback = the activity's fallback
    first can't be used, known before launch                     → `selection` stop
    the fallback setting isn't in force as `threshold`, or no fallback → first
    …the usage reading and the fallback's launch checks, unchanged, at the threshold of the settings in force
```

Under For everything the resolver has already made the fallback the choice, so the decision reads no usage and names it. A fallback that can't be used is then a choice that can't be used: Start is unavailable, or the launch stops, and nothing runs on the first choice. The decision saved on the session records that the fallback was used because of the setting, with the first choice and no limit or threshold. That record is the source for the Fallback tag, the card's reason, the phase detail and the terminal line, which AC-FALLBACK-03 already reads from it. The merge and a plan push take no launch decision, so a session of theirs that launches on its fallback under For everything saves the same record from the resolver's choice. Its card, its phase detail and the terminal line read it as any activity's do; a merge or push row shows no model line, and so no tag.

**Agents.** An agent is needed when the resolver names it for an unfinished activity, or when the fallback setting is in force as `threshold` and an unfinished activity's fallback names it. Under For everything the first choice's agent is therefore not needed for an activity that moved to its fallback, and under one model only that model's agent is needed. The fallback warning and the over-threshold marks in the account panel show only while `threshold` is in force.

**Skills and checks on an agent** (AC-ROW-01). Each reader follows its own activity's row (Kiln Phase Model Tiers, §Launching, "Skills"). The audits' skill, and the stop that says it is missing, follow the Audits choice. The preflight's skill and the check for a planned preflight follow the Preflight and pull request choice. Finding a completed plan, a preparation turn's permission read before its phase is known, and the billing check that names no activity follow the pull request session's choice, which is the new row's. Each is checked again on the activity's own agent when it launches.

**The heads-up** is given only while `threshold` is in force (AC-WHEN-03).

**A wait before the start** is unchanged. Under For everything the choice an activity was refused on is its fallback, so the wait watches that account under today's rules. A change of mode or fallback setting during a wait is the existing "a different choice" case.

## Saving (AC-SAVE-01 to AC-SAVE-05, AC-PRD-02)

```
SettingsChange (at least one field):
  restore?:   true
  mode?:      "recommended" | "one_model"
  oneModel?:  FamilyChoice
  rows?:      { [row]: { first?: FamilyChoice, fallback?: FamilyChoice } }
  fallback?:  { use?: "never" | "threshold" | "everything", threshold?: 1..100 }
```

`restore` clears the mode, the one model, every row and the fallback setting from the file it is applied to (SAVE-008). It is applied first, then the rest. Each side and the one model pass today's checks: the family and effort are in the agent's current list, the model can run in auto mode, and a row's two sides aren't on the same agent once the change is in place.

**The page holds a draft.** The draft's arithmetic, what the page shows and which fields a save sends, is one module with no file access, `src/models/settings-change.ts`, which the page runs in the browser and the commands run in Node; applying a change to a settings file, with its checks, is `saveSettings` in `src/models/model-defaults-edit.ts`, behind the route and the commands alike. Every control on the page, Restore included, changes the draft only. A row's Change still opens its editors and Done puts the row's opened sides into the draft together, so a row can move to the other agent; a threshold that isn't a whole-number percent from 1 to 100 is refused on the page and never enters the draft. Save sends the fields whose draft value differs from the draft's base, with the target. The base is what was loaded until the person presses Restore. Restore puts `restore` in the draft, drops the changes made before it, and makes the base Kiln's choices, the settings as an empty file reads now, so the page shows Kiln's choices and a later change is one that differs from them. With Restore pending, each file the save writes is cleared before the fields are applied, so it ends as the page showed it, under every row of the table below. Restore is a change while Model defaults or this PRD's own settings hold any field, and, with Every PRD selected, while this PRD has its own settings at all, even a copy holding no field, because that save removes them and the PRD follows the defaults again (SAVE-008); otherwise Restore alone leaves Save unavailable. `restoreChanges` in the same module decides it from the GET's `source` and `holdsSettings` and the selected target. A mode changed to `one_model` carries the one model the page shows, and a fallback setting changed to `threshold` carries the threshold shown (AC-SAVE-03). The button back to the PRD, the save bar's states, the refusal to leave or to use the defaults with a draft, the line saying where the last save went, and the skipped and in-use marks on the table's columns while the draft reads For everything are view state (mockups 1 to 4, and 7 state A).

| The PRD the page was opened from | Target | The changes go to |
|---|---|---|
| Follows the defaults | Every PRD | Model defaults |
| Follows the defaults | This PRD only | New own settings: what Model defaults holds as read then, with the changes |
| Has its own settings | This PRD only | Its own settings |
| Has its own settings | Every PRD | Model defaults and its own settings |

When the saved settings change underneath an open page, it reads them again and keeps the person's pending changes over them. The draft holds only the fields the person changed, applied over the latest read. While Restore is pending the base is Kiln's choices as last read, so a re-read changes the page only where those change, such as the one model once Claude Code is installed, and in whether Restore is still a change. Fields they didn't touch take the new values, and a change that now equals what was read stops being a change. When the PRD gains or loses its own settings, the title and the own-settings notice follow the new source at once. The selected target follows only while there is no draft. With a draft it stays as the person last saw it, so a save never goes to every PRD unless they selected it. Both targets stay valid after either switch (the table's rows 2 and 4).

**Leaving with a draft** (AC-SAVE-02). The Kiln mark in the top bar leads to the same place as the button back, and refuses the same way, with the same message. Browser Back and Forward can't be refused, so the draft is kept in page memory, as the live composer's message is. Reopening Model defaults shows it again under its save bar. While there is a draft, reloading or closing the tab, or leaving Kiln's address, brings up the browser's leave-page prompt (`beforeunload`).

**A settings file that can't be read** gives the page nothing to hold. Over Model defaults, Restore writes at once and leaves every field at Kiln's choice, with today's notice. Over the PRD's own settings it offers only Use my defaults here, which removes the file at once. Restore and every save are refused there, because rewriting the file from Kiln's choices would quietly end settings such as For everything for this PRD. Model defaults that can't be read refuse every write that copies or changes them, Restore excepted as today, and nothing else. Creating a PRD's own settings copies them, so the table's second row, a choice in the Models block on a PRD with none and a `--prd` command on a PRD with none are refused with Model defaults' 409, Model defaults being the file in force. The fourth row is refused before either file is written, with Model defaults' reason, unless the changes include Restore and Restore is allowed over that file as today. The third row and a choice in the Models block on a PRD with its own settings are written as usual.

**A choice in the Models block** (AC-PRD-02) is the same change sent with no draft and no target: it applies to this PRD's own settings, created as the second row says when there are none. Kiln then compares them with Model defaults as each reads, shipped choices filled in. Both files are filled in the same way when read, so only values count, not whether a file holds a field. The comparison covers the mode, every row's two sides, the fallback setting and threshold, and the one model unless the mode is `recommended`. When they are equal the PRD's own settings are removed (SAVE-005). Model defaults that can't be read are equal to nothing, so the PRD keeps its own settings; Kiln never moves a PRD onto a file it can't read. A save from the page never does this: This PRD only always leaves the PRD with its own settings.

Only a person's own action on one of the block's controls sends the choice: selecting a choice, or picking an agent, model or effort in the one model's editor. What the editor changes on its own never writes, neither filling in an effort or first model when it renders nor following a change to an agent's model list; the block shows that adjustment but leaves the PRD's settings as they are, and a choice that can no longer be used shows its problem (§Snapshot `oneModel.problem`). The shared editor therefore reports a person's change separately from its own adjustment, through a second callback, `onpick`, which only its control handlers call. The Change editors and the rows on Model defaults keep using its existing callback into their own drafts, which wait for Done, and are unchanged. The one model's editor on Model defaults has no Done, so it takes `onpick` into the page's draft: an adjustment the editor makes on its own must not become an unsaved change the person never made, which the button back would then refuse to leave (AC-SAVE-02).

**Use my defaults here** removes the PRD's own settings file, whether or not Model defaults can be read; the page and the Models block then show Model defaults' error, as for any PRD following them.

Nothing is propagated after any of these. Every resolution reads the files, the running Kiln watches both and republishes its page, and an activity that hasn't started takes the new choice on its next resolution.

## Interfaces

### Settings files

`<state root>/model-defaults.json` and `<PRD state directory>/model-settings.json`:

```json
{
  "schemaVersion": 2,
  "mode": "one_model",
  "oneModel": { "agentId": "claude_code", "family": "opus", "effort": "high" },
  "rows": { "preflight_pr": { "first": { "agentId": "claude_code", "family": "opus", "effort": "medium" } } },
  "fallback": { "use": "threshold", "threshold": 90 }
}
```

A missing field, in either file, reads as Kiln's choice: `recommended`, the one model as §Design Decisions says, AC-DEFAULT-01's four rows with AC-ROW-01's fifth, and `never` at 95. The reader reports, for every field, whether the file holds it, not only for each row's two sides.

A schema 1 file is read as AC-CARRY-01's table says: `enabled: true` is `threshold` with its threshold, anything else is `never`, and the fifth row is carried from a changed Audits row (§Design Decisions). The first write stores schema 2.

### HTTP

| Route | Contract |
|---|---|
| `GET /api/model-defaults` | The settings in force for this PRD: `source`, the PRD's name, the mode, the one model, the five rows and the fallback setting, each choice with its current model name and whether the person set it (for `source: "prd"`, whether the PRD's own settings hold it); each installed agent's families, efforts and readiness, as today. 409 with `{ source, reason, path, canRestore }` when the file in force can't be read. `canRestore` says whether the page's one write is allowed: Restore for `source: "defaults"`, Use my defaults here for `source: "prd"` (§Saving). It is false over a newer schema version or a file that can't be stat'd, as today. For Restore in the draft (§Saving), `kilnChoices`: the settings as an empty file reads now, shipped rows with today's Codex substitution and the one model decided when read; and `holdsSettings`: whether Model defaults or this PRD's own settings hold any field. `holdsSettings` is true while Model defaults can't be read, so Restore saved for every PRD can rewrite it |
| `POST /api/model-defaults` | One of `{ save: { target: "every_prd" \| "this_prd", changes: SettingsChange } }`, `{ choose: { mode?, oneModel? } }` for the Models block, `{ useDefaults: true }`. 200 with the GET body; 400 malformed; 422 with the refusal's reason, naming the file that refused when two are written; 409 as the GET; 500 with the reason when the second of two writes failed, naming the file not written (§Design Decisions). A save for every PRD from a PRD with its own settings while Model defaults can't be read is 422, its reason naming that file; with no own settings Model defaults is the file in force, so it is 409. `useDefaults` over Model defaults that can't be read removes the file, then answers 409 as the GET. It replaces today's three bodies, which only the page sent |
| `POST /api/model` | `target` also takes `"preflight_pr"`, which sets the PRD's Preflight and pull request entry under the rules `"audits"` follows: never refused for an activity's state, reaching each activity on that row that has no start, no launch under way and no process running, and refused once the run is complete ("The run is complete; no activity is left to change.") |

The view sends `choose` only from a person's action on the Models block (§Saving), never on render or on a republished snapshot. On Model defaults, the account line under One model for everything takes its account from the snapshot's account panel, for the agent the draft shows; the GET carries no account data.

The Models block is one component wherever the model lines are today. Documents found's delivery panel and the run's settings, on the running and paused pages, offer the two choices and Use my defaults here (AC-PRD-01, AC-PRD-02). Two places show the choice in force without those controls: the Models card on Needs you, the stopped-phase page and the waiting page, and the Folder missing setup panel. The Models card still offers each row's Change and the Audits line's Change, as today, and lists the planned Preflight row (`preflight.planned` in the snapshot) and the planned or allocated pull request row like phases. In every view, a row of kind `preflight` or `final_delivery` that carries `model.change` targets `"preflight_pr"`, whatever phase id it also carries: in the phase plan, on the Models card and on Documents found's Preflight row. At a preflight stop the card therefore also offers the pull request row's Change, which reaches every activity on the Preflight and pull request row that hasn't started (AC-ROW-01). Before Start, Documents found shows no pull request row, and no Preflight row where the build-preflight skill isn't found; in that case, until the run is underway, the row's choice for this PRD is changed only through This PRD only on Model defaults (AC-SAVE-04). The Folder missing panel drops the Audits Change as well, as the lines do now. Where the block shows the choice in force, it says when this PRD has its own settings and links to Model defaults, where This PRD only saves a different choice. While the fallback setting reads Never, the Recommended choice's fallback line is today's off line, "Wait for the limit. No fallback is switched on.", with the Model defaults link.

### Snapshot

```
phases[], activities[]  model:
  from?:        "model_defaults" | "changed" | "one_model"
  noFallback?:  true                    For everything is in force and the activity has none
  fallback?:    { used, forEverything?: true, limit?, threshold?, first?, reason? }
                                        limit and threshold are absent when forEverything is set

settings.models:
  source:    "defaults" | "prd"
  mode:      "recommended" | "one_model"
  oneModel:  { agentId, agent, family, familyName, modelName?, effort?, problem? }
  fallback:  { use, threshold, enabled, warning? }
  audits:    today's fields, and noFallback?
  tiers, problem?, revision

mergeAgent:  the agent the merge session runs on, engine.agentOf(MERGE_KEY)
```

`mergeAgent` is what Merge with {agent} names wherever it is quoted: the finished page's button and merge line, Documents found's line on what Kiln may do, and the run's settings. Before the press there is no merge row, so the view reads the agent from here; once the merge has a session, the view names that session's agent. It never names the agent in use (AC-ROW-01).

A row or Audits line with `noFallback` says why in one line. While its choice is Changed by you or kept (`from: "changed"`): "No fallback: the model you picked is on the same agent as its fallback." While Claude Code isn't installed and it runs on its row's Codex choice (`claudeCodeMissing`): "No fallback: Claude Code isn't installed, so this already runs on its Codex choice.", in place of the usual note that it runs on Codex. A Model defaults row can't put both sides on one agent, so there is no third case.

`revision` is both files' stat keys, with `missing` for an absent file, so creating or removing the PRD's own settings changes it. The running Kiln reads `revision` once a second and republishes when it changed, which is how it notices Model defaults and the PRD's own `model-settings.json` created, changed or removed. This replaces the folder watch Kiln Phase Model Tiers used for Model defaults. A folder watch loses events while the computer is busy; on macOS it reports events written in the same moment under one name, and the PRD record is saved beside `model-settings.json` constantly; and watching a second folder there made stopping Kiln up to a second slower. A page or command that saves a settings file through the running Kiln still republishes at once.

A row that hasn't started under For everything carries `model.choice` as its fallback and `model.fallback` as `{ used: true, forEverything: true, first }` straight from the resolver, before any launch. The Audits line reads the same way. The view shows the Audits line while `mode` is `recommended`, or `audits.changedByYou`.

The planned Preflight row, the preflight's own row, and the planned and allocated pull request rows gain `change` and `useDefault`, each following its own row's state as a Delivery audit row's does; once the run is complete, none of them carries `change` (the finished page's planned Preflight row for the next run included), and neither do the merge and plan push rows.

### Command line

```
kiln model-defaults [--prd <PRD-path>]                        print what the page shows
kiln model-defaults set --row <demanding|standard|mechanical|audits|preflight-pr> …sides, as today… [--prd <PRD-path>]
kiln model-defaults mode (--recommended | --one-model [--agent <claude_code|codex> --model <family> [--effort <value>]]) [--prd <PRD-path>]
kiln model-defaults one-model --agent <claude_code|codex> --model <family> [--effort <value>] [--prd <PRD-path>]
kiln model-defaults fallback [--never | --at-threshold | --for-everything | --on | --off] [--threshold <1..100>] [--prd <PRD-path>]
kiln model-defaults restore [--prd <PRD-path>]
kiln model-defaults use-defaults --prd <PRD-path>

kiln model <PRD-path> (--phase <id> | --audits | --preflight-pr) (… | --use-default)
```

Without `--prd` a command reads or changes Model defaults and no PRD's own settings. With it, the command reads the settings in force for that PRD, or saves for that PRD only, creating its own settings when it has none. A save for every PRD from a PRD with its own settings is therefore two commands (AC-CLI-01). `--on` is `--at-threshold` and `--off` is `--never`. `mode --one-model` without `--agent` and `--model` saves the one model it would print, decided when read, as the page's mode change carries the one model shown; `--agent` or `--model` without the other is refused as malformed. `one-model` saves the one model alone and leaves the mode as it is, as the page saves a one model edited under Recommended (AC-CLI-01); it needs `--agent` and `--model`. `restore` does what the page's Restore does (§Design Decisions, "Restore Kiln's defaults"), and its help says it turns the fallback off.

A save with `--prd` is the page's This PRD only save, not a choice in the Models block: it always leaves the PRD with its own settings, even when they end up the same as Model defaults, and never removes them (§Saving). A PRD returns to following the defaults only through `use-defaults`. No command makes the Models block's choice; AC-CLI-01 covers what Model defaults saves.

`--prd` needs Kiln's record of the PRD, the limit the page has: it exists only for a PRD Kiln has opened. Without one the command is refused and says to open the PRD with `kiln run`.

Over a PRD's own settings that can't be read, every command with `--prd` but `use-defaults` fails with the file's path, `restore --prd` included as the page's Restore is (§Saving), and its error names `kiln model-defaults use-defaults --prd <PRD-path>` as the next step. While Model defaults can't be read, every `--prd` command on a PRD with no settings of its own, `restore --prd` included as row 2 of §Saving's table is refused, fails with Model defaults' path and reason, and names `kiln model-defaults restore` as the next step where Restore is allowed over that file. `use-defaults` on a PRD with its own settings removes the file, then reports Model defaults' error the same way. A `--prd` command on a PRD with its own settings works as usual (§Settings in Force).

`fallback --at-threshold` without `--threshold` saves the threshold the command would print, as the page's change to the threshold setting carries the threshold shown.

Each command's result carries `source`, `defaults` or `prd`, and `path`, the settings file in force; with `--prd` it also carries `prd_path`. The printed text leads with whose settings they are: "Model defaults, for every PRD on this computer", or for a PRD that it has its own settings or that it follows Model defaults; then how Kiln picks a model, and the settings of both modes, because both are kept: the five rows, the fallback setting in the page's words, and the one model. The mode in force prints first, so under one model the one model leads and the rows follow under a line saying they are kept and not used.

`mode`, `one-model` and `use-defaults` join the `models` group in `prompts/kiln-command-contracts.json` with the `computer_setting` side effect, and the **Choose models** heading lists them. `kiln model --preflight-pr` follows `--audits` in every respect. The printed fallback, and `data.fallback` in `kiln account`, carry `use` beside `enabled`.

## Data Models

**PRD record, next schema (28).** `settings.modelChoices` gains:

```
preflightPr?: ModelChoice | "default"     the preflight's, the pull request session's, the merge's and the plan push's entry
```

The migration copies the Audits entry into it, a choice or `"default"` alike, so those activities resolve after the upgrade as they did before it (AC-CARRY-01's last row). A continuation carries the entry forward with the others.

**Session record.**

```
launch.from:        gains "one_model"
launch.ownSettings?: true                 the settings in force were the PRD's own
launch.fallback:    gains forEverything?: true;  limit and threshold become optional
```

**A continuation acceptance** holds the settings it gives the new execution. One saved before this schema gets the same copy when read. An acceptance has no schema number of its own to tell which it is, so its `formatVersion` becomes 2 for those written from now on, and 1 is still read.

An older Kiln refuses the newer record, as with every earlier schema change, and refuses a schema 2 settings file (§Design Decisions).

## Changes to Earlier Designs

The line is added to each earlier section, as `Superseded in part by:`, in the commit that builds the change.

- Replaces in part: `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-technical-design.md`
  - §Storage and §Model defaults file (schema 2; a second file of the same schema for one PRD's own settings; the mode, the one model, a fifth row, and a three-way fallback setting in place of the switch).
  - §Design Decisions, "Restore Kiln's defaults" (the mode, five rows, the one model and the fallback setting, which it returns to Never at 95; held in the page's draft until saved), "Commands for Model defaults" (two more leaves, and `--prd`) and "Model defaults across running Kilns" (a read of both files' revision once a second, in place of a watch on the state root).
  - §Resolving a Choice (step 4 reads the settings in force and the mode; step 5; every activity that isn't a phase or an audit, the merge and the plan push included, has its own row and entry; no fallback under one model).
  - §When an Activity Starts, "Planned rows" and "The planned Preflight row" (the Preflight and pull request rows show their own row's choice and offer Change).
  - §The launch decision and "The heads-up" (the decision runs its usage reading only while the threshold setting is in force; a launch on a fallback used for everything records the setting, not a limit).
  - §Agents (an agent is needed for a fallback only while the threshold setting is in force).
  - §HTTP, §Snapshot and §Command line (the routes, fields and commands in §Interfaces; the page saves on Save, not on Done).
  - §Data Models (the Preflight and pull request entry; `launch`; a continuation acceptance's format version).

## Delivery

- **Before the build:** Claude Code and Codex both installed and signed in on the build computer, provided by whoever starts the build, for the proofs below.
- **Expected build spend:** about $2 of agent usage, for two short disposable sessions: a phase whose first choice is on Claude Code starts on its Codex fallback while For everything is in force and reports there (AC-WHEN-02, AC-WHEN-03), and a phase starts on the one model (AC-MODE-02). Everything else is settings read from real files and proved without a model call.
- **After the build:** once the PRD's audits have closed and its pull request has merged, add the changelog entry under Unreleased (Added: one model for everything, the fallback for everything, settings for one PRD, the Preflight and pull request row; Changed: Model defaults saves on Save). The entry says to restart any Kiln still running the earlier version, which refuses a settings file this version has written. Release as a minor version: saved records and settings migrate when read, and no command or flag is removed.

## Criteria Coverage

| Criterion | Covered by |
|---|---|
| AC-MODE-01 | §Settings in Force; `mode` and `oneModel` in §Settings files and §Snapshot |
| AC-MODE-02 | Resolver step 4; the one-model decision; where a choice came from |
| AC-MODE-03 | No fallback under one model (§Resolving a Choice); §Launching, Agents |
| AC-WHEN-01 | `fallback.use` in §Settings files; the schema 1 read |
| AC-WHEN-02 | Resolver step 5; §Launching |
| AC-WHEN-03 | `model.fallback` and `noFallback` in §Snapshot; the saved decision; the heads-up |
| AC-ROW-01 | The fifth row and its entry, and the stops that name it (§Resolving a Choice, §Data Models); the agent each skill and check follows (§Launching); `POST /api/model`; the row `change` fields and their `"preflight_pr"` target, the Models card included (§HTTP) |
| AC-SAVE-01, AC-SAVE-02 | §Saving, "The page holds a draft" and "Leaving with a draft"; the Back and Forward decision |
| AC-SAVE-03 | The save table's first and fourth rows; the SAVE-004 decision; the Restore decision and `restore` (§Saving) |
| AC-SAVE-04 | The own-settings file and its discard by a reset (§Storage, §Settings in Force); `launch.ownSettings` |
| AC-SAVE-05 | `source` in the GET and §Snapshot; `useDefaults` |
| AC-PRD-01 | `settings.models` in §Snapshot; the Models block |
| AC-PRD-02 | §Saving, "A choice in the Models block"; `choose` |
| AC-CLI-01 | §Command line |
| AC-CARRY-01 | The schema 1 read; the CARRY-001 decision; the record migration |
| AC-GUIDE-01 | The README's sections on choosing models and the usage fallback, and the command-line guide, gain the two modes, the three fallback settings, the fifth row and saving for one PRD |

## Open Questions

1. **Six assumptions are still open,** each built at its proposed answer. The other answer changes one place:
   - SAVE-003: a PRD's own settings would end when Kiln stops. Kiln would remove the file as it starts; nothing else changes.
   - SAVE-004: a save for every PRD from a PRD with its own settings would send the whole page to Model defaults and remove the PRD's own settings. That is the fourth row of §Saving's table. On the command line the same save becomes the command without `--prd` followed by `use-defaults --prd`, and the two-command note in §Command line and AC-CLI-01 changes to say so.
   - SAVE-005: the comparison after a choice in the Models block is removed.
   - SAVE-006: creating a PRD's own settings would copy the filled-in values for fields the person never set, so a release's new choice doesn't reach a PRD with its own settings. That is one line in creating them.
   - ROW-002: the merge and the plan push would stay on the Audits row and entry: one branch in the row lookup.
   - SAVE-008: `restore` would reset only the rows and the one model, leaving the mode and the fallback setting as they are.
