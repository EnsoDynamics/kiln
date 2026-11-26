# Technical Design: Kiln Model Modes

**PRD:** [Kiln Model Modes](kiln-model-modes-prd.md) · **Decisions:** [assumptions](kiln-model-modes-assumptions.md) · **Design references:** the seven mockups the PRD links · **Extends:** [Kiln Phase Model Tiers technical design](../kiln-phase-model-tiers/kiln-phase-model-tiers-technical-design.md)

## Overview

Kiln Phase Model Tiers gave every activity one resolver and one launch decision, both reading one settings file. This change keeps both and changes what they read. Four things carry the design:

- **Settings in force.** A PRD's settings are its own when it has them, otherwise Model defaults. Both are the same shape in the same kind of file, read by one reader on every resolution (§Settings in Force).
- **The mode and For everything are resolver steps.** One model for everything replaces the row lookup. For everything makes an activity's fallback its choice. Rows, readiness, billing, waits and stops already follow the resolver's choice, so they need no branch of their own (§Resolving a Choice).
- **A save is a set of changes.** The page holds a draft and sends only what the person changed, to one settings file or two (§Saving).
- **A fifth row.** The preflight and the pull request session leave the Audits row and its per-PRD entry for their own (§Resolving a Choice, §Data Models).

No new service, repository, database or dependency.

## Existing Code

**Posture: Preserve.** Kiln Phase Model Tiers is built and released, and AC-CARRY-01 keeps what people saved.

- **Reused:** the resolver and its start line; the launch decision with its usage reading, counted limits and fallback launch checks; needed agents, their readiness and billing; the wait before the start; the `selection` stop; the one module behind the page, the routes and `kiln model-defaults`; the atomic write and the watch on the settings file; the omitted-effort rule; `POST /api/model` and `kiln model`; the Model defaults page's row editor.
- **Kept, and not visible from the code alone:**
  - An activity that has started is bound by resolver step 1, before any step this design adds. Nothing here reaches it.
  - A launch keeps the decision it saved. A change of mode, of the fallback setting or of a PRD's own settings made after that reaches the activity only if the launch ends with no response, as a Model defaults change does today.
  - The merge and the push of a plan after delivery are not activities in the PRD's sense. They take the Audits row's choice through the resolver today and keep doing so, steps 4 and 5 below included.
  - An audit's skill, the preflight's skill and whether a preflight is planned are found on the agent of that activity's own choice (Kiln Phase Model Tiers, §Launching, "Skills"). Today one agent, the pull request session's choice, stands in for all three, because they share the Audits row. Once the preflight and the pull request session have a row of their own, the audits' skill is found on the Audits choice's agent and the preflight's on the Preflight and pull request choice's agent.
  - A Kiln that can't read a settings file never falls back to Kiln's shipped choices, or to Model defaults over a PRD's own settings.

## Architecture

### Workload Type and Starting Point

The existing local TypeScript application: the engine, its loopback server, the Svelte view and the `kiln` command line. Patterns come from this repository.

### Storage

Model defaults stays `<state root>/model-defaults.json`, now schema 2. A PRD's own settings are a second file of the same schema, `model-settings.json` in that PRD's state directory, which is outside every repository (AC-SAVE-04). Both are owner-only and written atomically. The PRD record moves to the next schema number, 28 as this is written, for the new per-PRD entry (§Data Models).

### Dependencies

Claude Code and Codex, through their existing adapters. No new call is made to either.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where a PRD's own settings live (SAVE-003) | A file in the PRD's state directory, read on every resolution and watched, not a field of the PRD record | AC-CLI-01 saves for one PRD from a terminal with no Kiln running, and AC-PRD-02 changes them before Start and in a run underway. The record belongs to the running Kiln and changes through its instruction journal; a file of its own is written by the page, the Models block and the command through one module, exactly as Model defaults is. It also survives a restart and an upgrade with nothing to migrate |
| What a PRD's own settings hold | Every field, written whole when they are created | AC-SAVE-04 and SAVE-002 call them a copy that later changes to the defaults don't reach. A file holding only differences would follow the defaults for everything else |
| Model defaults still holds only what the person set | Unchanged; the mode, the one model and the fifth row follow the same rule | A later release can ship a new choice without overwriting anyone's |
| Where For everything is applied | In the resolver, as its last step, not in the launch decision | AC-WHEN-02 treats the fallback as the choice in every respect: its agent is checked and billed, a wait watches its account, and a fallback that can't be used stops the run instead of yielding to the first choice. Every one of those already follows the resolver's choice |
| What One model for everything does to the fallback | The activity has no fallback while that mode is in force, so the launch decision takes its existing no-fallback path | AC-MODE-03: no launch on a fallback, no agent needed because a fallback names it, a wait at a limit as with Never |
| The shape of a save | The changes the person made, never the whole page | AC-SAVE-03 puts only what changed into the defaults and into the PRD's own settings. It also means a setting changed elsewhere while the page was open isn't written back over |
| A save for every PRD from a PRD with its own settings (SAVE-004) | One request, checked against both files before either is written, then applied to Model defaults and to the PRD's own settings. A write that fails after the first file was written is a failed save naming the file not written, and the page keeps its draft | A row's first choice and fallback can't share an agent, and the same change can pass in one file and fail in the other; checking both first means neither is half-saved. Applying the same changes twice is harmless, so pressing Save again after a failed second write is safe |
| Model defaults' schema | Raised to 2 on the first write by this version; schema 1 is read without being rewritten | A Kiln from before this change would read a file with a mode or For everything as if neither were set, and launch on the account the person meant to spare. Its existing rule for a newer schema makes it refuse the file instead |
| The fifth row for someone who changed Audits (CARRY-001) | Decided when a schema 1 file is read: if either side of the Audits row was set, the new row takes both of the Audits row's sides. The first write keeps that | The carry-over is one step of reading the old file, so it runs once per file and never touches a file this version wrote |
| The per-PRD entry for the fifth row | Its own entry beside the Audits entry, filled from the Audits entry by the record migration | AC-ROW-01 makes a Change on the Preflight or pull request row reach those two only, and AC-CARRY-01 keeps an Audits change made before the upgrade for them |
| Restore Kiln's defaults | Returns the five rows and the one model to Kiln's choices. The mode, the fallback setting and the threshold stay. It is one of the changes a save carries | The decision it extends kept the switch and threshold, and AC-WHEN-01 leaves that part of AC-FALLBACK-01 standing. The mode is the person's way of picking, not one of the choices Kiln ships |
| Reset | Keeps a PRD's own settings: `model-settings.json` joins the instance lock and the record as what a reset's discard of the PRD's state directory leaves in place | AC-SAVE-04 ends them only through Use my defaults here or AC-PRD-02. SAVE-003 names the costly mistake: settings forgotten without notice send the next phases to the account being spared, while settings kept show on Documents found with a one-press way out |
| The one model until the person picks | Decided when read: Claude Code · Opus · high, or Codex · GPT Sol · high when Claude Code isn't installed. Never saved by itself | AC-MODE-02. Nothing is saved, so installing Claude Code later changes it with no step by the person, as DEF-003 does for the rows |
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

A PRD's own settings that can't be read are an error wherever one of that PRD's choices is resolved, with the file's path, as Model defaults is today. Use my defaults here is the one write allowed over them, and is refused over a newer schema version.

## Resolving a Choice (AC-MODE-02, AC-MODE-03, AC-WHEN-02, AC-ROW-01, AC-SAVE-04)

Steps 1 to 3 are unchanged. Step 2's entry for the preflight and the pull request session is the PRD's new Preflight and pull request entry; the audits keep the Audits entry.

4. **Otherwise**, from the settings in force:
   - `one_model`: the one model, its family resolved as a row side's is.
   - `recommended`: the first choice of the activity's row. A phase's row is its tier's; an audit's is Audits; the preflight's and the pull request session's is Preflight and pull request. The substitution when Claude Code isn't installed is unchanged.

   The activity's **fallback** is none while the mode is `one_model`, whatever step gave its choice. Otherwise it is its row's Fallback column choice in the settings in force, unless that is on the same agent as the choice.

5. **For everything.** While the fallback setting is in force and reads `everything`, an activity with a fallback takes that fallback as its choice. It is tagged **Fallback**, the choice steps 2 to 4 gave is kept as its first choice, and it then has no fallback. An activity with none keeps its choice and is marked as having no fallback.

Step 5 applies over a Changed by you or kept choice too: such a phase on Claude Code launches on its row's Codex fallback, and its entry, its mark and Use the default stay, so its own choice returns when the setting changes. A person who wants a phase on a particular model meanwhile picks one on the fallback's agent, which leaves the phase with no fallback (mockup 7, state B).

Where a choice came from gains two answers, used by the row, the `selection` stop's facts and the saved launch decision: the one model, and this PRD's own settings as distinct from Model defaults. Where to change the preflight's or the pull request session's choice is Change on its own row, or the Preflight and pull request row of the settings in force (AC-ROW-01).

## Launching (AC-MODE-03, AC-WHEN-02, AC-WHEN-03)

The launch decision changes in one line and one record:

```
decide(activity):
    first = the resolver's choice;  fallback = the activity's fallback
    first can't be used, known before launch                     → `selection` stop
    the fallback setting isn't in force as `threshold`, or no fallback → first
    …the usage reading and the fallback's launch checks, unchanged, at the threshold of the settings in force
```

Under For everything the resolver has already made the fallback the choice, so the decision reads no usage and names it. A fallback that can't be used is then a choice that can't be used: Start is unavailable, or the launch stops, and nothing runs on the first choice. The decision saved on the session records that the fallback was used because of the setting, with the first choice and no limit or threshold. That record is the source for the Fallback tag, the card's reason, the phase detail and the terminal line, which AC-FALLBACK-03 already reads from it.

**Agents.** An agent is needed when the resolver names it for an unfinished activity, or when the fallback setting is in force as `threshold` and an unfinished activity's fallback names it. Under For everything the first choice's agent is therefore not needed for an activity that moved to its fallback, and under one model only that model's agent is needed. The fallback warning and the over-threshold marks in the account panel show only while `threshold` is in force.

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

`restore` is applied first, then the rest. Each side and the one model pass today's checks: the family and effort are in the agent's current list, the model can run in auto mode, and a row's two sides aren't on the same agent once the change is in place.

**The page holds a draft.** Every control on the page, Restore included, changes the draft only. Save sends the fields whose draft value differs from what was loaded, with the target. A mode changed to `one_model` carries the one model the page shows, and a fallback setting changed to `threshold` carries the threshold shown (AC-SAVE-03). When the saved settings change underneath an open page, it reads them again and keeps the person's pending changes over them. The button back to the PRD, the save bar's states, the refusal to leave or to use the defaults with a draft, the line saying where the last save went, and the skipped and in-use marks on the table's columns while the draft reads For everything are view state (mockups 1 to 4, and 7 state A). Over a settings file that can't be read the page has nothing to hold, so Restore, or Use my defaults here, writes at once as Restore does today.

| The PRD the page was opened from | Target | The changes go to |
|---|---|---|
| Follows the defaults | Every PRD | Model defaults |
| Follows the defaults | This PRD only | New own settings: the settings in force as read then, with the changes |
| Has its own settings | This PRD only | Its own settings |
| Has its own settings | Every PRD | Model defaults and its own settings |

**A choice in the Models block** (AC-PRD-02) is the same change sent with no draft and no target: it applies to this PRD's own settings, created as the second row says when there are none. Kiln then compares them with Model defaults as each reads, shipped choices filled in: the mode, every row's two sides, the fallback setting and threshold, and the one model unless the mode is `recommended`. When they are equal the PRD's own settings are removed (SAVE-005). A save from the page never does this: This PRD only always leaves the PRD with its own settings.

**Use my defaults here** removes the PRD's own settings file.

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

A missing field reads as Kiln's choice: `recommended`, the one model as §Design Decisions says, AC-DEFAULT-01's four rows with AC-ROW-01's fifth, and `never` at 95.

A schema 1 file is read as AC-CARRY-01's table says: `enabled: true` is `threshold` with its threshold, anything else is `never`, and the fifth row is carried from a changed Audits row (§Design Decisions). The first write stores schema 2.

### HTTP

| Route | Contract |
|---|---|
| `GET /api/model-defaults` | The settings in force for this PRD: `source`, the PRD's name, the mode, the one model, the five rows and the fallback setting, each choice with its current model name and whether the person set it; each installed agent's families, efforts and readiness, as today. 409 with `{ source, reason, path, canRestore }` when the file in force can't be read |
| `POST /api/model-defaults` | One of `{ save: { target: "every_prd" \| "this_prd", changes: SettingsChange } }`, `{ choose: { mode?, oneModel? } }` for the Models block, `{ useDefaults: true }`. 200 with the GET body; 400 malformed; 422 with the refusal's reason, naming the file that refused when two are written; 409 as the GET. It replaces today's three bodies, which only the page sent |
| `POST /api/model` | `target` also takes `"preflight_pr"`, which sets the PRD's Preflight and pull request entry under the rules `"audits"` follows: never refused for an activity's state, reaching the preflight and the pull request session that have no start, no launch under way and no process running |

The Models block is one component wherever the model lines are today. In the Folder missing setup panel it shows the choice in force without controls, as the lines do now.

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
  audits:    today's fields
  tiers, problem?, revision             revision now covers both files
```

A row that hasn't started under For everything carries `model.choice` as its fallback and `model.fallback` as `{ used: true, forEverything: true, first }` straight from the resolver, before any launch. The Audits line reads the same way. The view shows the Audits line while `mode` is `recommended`, or `audits.changedByYou`.

The planned Preflight row, the preflight's own row, and the planned and allocated pull request rows gain `change` and `useDefault`, each following its own row's state as a Delivery audit row's does.

### Command line

```
kiln model-defaults [--prd <PRD-path>]                        print what the page shows
kiln model-defaults set --row <demanding|standard|mechanical|audits|preflight-pr> …sides, as today… [--prd <PRD-path>]
kiln model-defaults mode (--recommended | --one-model [--agent <claude_code|codex> --model <family> [--effort <value>]]) [--prd <PRD-path>]
kiln model-defaults fallback [--never | --at-threshold | --for-everything | --on | --off] [--threshold <1..100>] [--prd <PRD-path>]
kiln model-defaults restore [--prd <PRD-path>]
kiln model-defaults use-defaults --prd <PRD-path>

kiln model <PRD-path> (--phase <id> | --audits | --preflight-pr) (… | --use-default)
```

Without `--prd` a command reads or changes Model defaults and no PRD's own settings. With it, the command reads the settings in force for that PRD, or saves for that PRD only, creating its own settings when it has none. A save for every PRD from a PRD with its own settings is therefore two commands (AC-CLI-01). `--on` is `--at-threshold` and `--off` is `--never`.

`--prd` needs Kiln's record of the PRD, the limit the page has: it exists only for a PRD Kiln has opened. Without one the command is refused and says to open the PRD with `kiln run`.

`mode` and `use-defaults` join the `models` group in `prompts/kiln-command-contracts.json` with the `computer_setting` side effect, and the **Choose models** heading lists them. `kiln model --preflight-pr` follows `--audits` in every respect. The printed fallback, and `data.fallback` in `kiln account`, carry `use` beside `enabled`.

## Data Models

**PRD record, next schema (28).** `settings.modelChoices` gains:

```
preflightPr?: ModelChoice | "default"     the preflight's and the pull request session's entry
```

The migration copies the Audits entry into it, a choice or `"default"` alike, so those two activities resolve after the upgrade as they did before it (AC-CARRY-01's last row). A continuation carries the entry forward with the others.

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
  - §Design Decisions, "Restore Kiln's defaults" (five rows and the one model; held in the page's draft until saved) and "Commands for Model defaults" (two more leaves, and `--prd`).
  - §Resolving a Choice (step 4 reads the settings in force and the mode; step 5; the preflight and the pull request session have their own row and entry; no fallback under one model).
  - §When an Activity Starts, "Planned rows" and "The planned Preflight row" (the Preflight and pull request rows show their own row's choice and offer Change).
  - §The launch decision and "The heads-up" (the decision runs its usage reading only while the threshold setting is in force; a launch on a fallback used for everything records the setting, not a limit).
  - §Agents (an agent is needed for a fallback only while the threshold setting is in force).
  - §HTTP, §Snapshot and §Command line (the routes, fields and commands in §Interfaces; the page saves on Save, not on Done).
  - §Data Models (the Preflight and pull request entry; `launch`; a continuation acceptance's format version).
- Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`
  - §Design Decisions, "How reset discards" (a PRD's own settings file is kept with the instance lock and the reset receipts).

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
| AC-ROW-01 | The fifth row and its entry (§Resolving a Choice, §Data Models); `POST /api/model`; the row `change` fields |
| AC-SAVE-01, AC-SAVE-02 | §Saving, "The page holds a draft" |
| AC-SAVE-03 | The save table's first and fourth rows; the SAVE-004 decision; Restore |
| AC-SAVE-04 | The own-settings file (§Storage, §Settings in Force); the Reset decision; `launch.ownSettings` |
| AC-SAVE-05 | `source` in the GET and §Snapshot; `useDefaults` |
| AC-PRD-01 | `settings.models` in §Snapshot; the Models block |
| AC-PRD-02 | §Saving, "A choice in the Models block"; `choose` |
| AC-CLI-01 | §Command line |
| AC-CARRY-01 | The schema 1 read; the CARRY-001 decision; the record migration |
| AC-GUIDE-01 | The README's sections on choosing models and the usage fallback, and the command-line guide, gain the two modes, the three fallback settings, the fifth row and saving for one PRD |

## Open Questions

1. **Four assumptions are still open,** each built at its proposed answer. The other answer changes one place:
   - SAVE-003: a PRD's own settings would end when Kiln stops. Kiln would remove the file as it starts; nothing else changes.
   - SAVE-004: a save for every PRD from a PRD with its own settings would send the whole page to Model defaults and remove the PRD's own settings. That is the fourth row of §Saving's table.
   - SAVE-005: the comparison after a choice in the Models block is removed.
   - CARRY-001: the carry-over step of the schema 1 read is removed.
2. **The PRD doesn't say what Restore Kiln's defaults does to the mode and the fallback setting.** The design leaves both as they are (§Design Decisions). If Restore should also return to the recommended choice and Never, it is a change to what `restore` resets, in one place.
3. **The PRD doesn't mention a reset.** The design keeps a PRD's own settings across one (§Design Decisions). The other answer deletes the file with the rest of the PRD's state.
4. **The merge and the push of a plan after delivery follow one model and For everything,** because they resolve through the Audits row (§Existing Code). The PRD's lists name neither.
