# Technical Design: Kiln Phase Model Tiers

**PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md) · **Decisions:** [validated assumptions](kiln-phase-model-tiers-assumptions.md) · **Design references:** the five mockups the PRD links

## Overview

Kiln stops keeping one agent, model and effort for a PRD. Each activity has a **model choice** that Kiln works out whenever it shows the plan and again when it launches the activity. Three things carry the design:

- **One resolver.** A single function gives every activity its choice, from what the activity started on, the person's change for this PRD, the phase document's tier and Model defaults, in that order. The plan rows, the readiness checks, the launch and the bot's status all call it, so they cannot disagree.
- **One start line.** An activity starts when one of its sessions gets its first response from the model. Kiln records that moment on the session and the activity. Before it, every resume, reply or end of a wait launches a new session on the current choice; after it, every session of the activity runs on what it started on.
- **Both agents at once.** Kiln keeps readiness, the model list, the account and billing for each agent the run can use, where today it keeps them for one selected agent. Everything Kiln does by agent reads the agent of the activity in hand.

Model defaults is one small file for the whole computer. The usage fallback is one decision made at the launch of an activity that hasn't started, recorded on the session it launches.

No new service, repository, database or dependency. The Enso Method skills are unchanged: Kiln only reads the tier line the phase split already writes.

## Existing Code

**Posture: Preserve.** Kiln is released, and AC-KEEP-02 keeps runs already underway as they are.

- **Reused:** the phase document reader and plan read; each agent's adapter, readiness checks and model list; the `selection` stop ("Agent selection and readiness") for a choice an agent doesn't offer; the launch path that Start again and Carry on use, for every new session of an activity that hasn't started; Claude Code's model-response test that usage-limit recovery's "refused again" rule already uses; Claude's billing approval; the instruction journal behind `kiln` commands and browser controls; the state root outside every repository.
- **Switched off:** the PRD-wide agent, model and effort selection, its selection generation, the rule that fixes one agent at Start, and the first-selection pick of the latest GPT Sol. The resolver and Model defaults replace them.
- **Kept, and not visible from the code alone:**
  - Kiln Run Restart's stopped-phase page keeps its own line, *a conversation began* (Claude Code's `init`, a Codex turn accepted). That line still decides which case the page shows and which cards it offers. The start line here decides only which model choice binds and what a resume or reply dispatches.
  - A started activity is resumed exactly as today, including the wait at a usage limit and the reopen check.
  - Codex needs no billing approval, and Claude's approval belongs to the execution, not to whichever agent ran last.

## Architecture

### Workload Type and Starting Point

The existing local TypeScript application: the engine, its loopback server, the Svelte view and the `kiln` command line. Patterns come from this repository; nothing is seeded from elsewhere.

### Storage

Model defaults lives in one owner-only JSON file at the state root, beside the per-PRD state directories, written atomically like every other Kiln record. It is outside every repository, which is what makes it apply to every PRD in every repository on the computer and survive upgrades (AC-DEFAULT-02). Per-PRD changes and each activity's start live in the PRD record and session records, schema 25.

### Dependencies

Claude Code and Codex, through their existing adapters. No new call is made to either: the model lists, readiness and usage readings are the ones Kiln already reads.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where a choice comes from | One resolver, in the order of §Resolving a Choice | AC-PICK-01 to 04 and AC-DEFAULT-03 each name a precedence; one function is the only way the row, the launch and the status command stay equal |
| How Kiln tells a session got its first response | One test per agent, shared by the start line and usage-limit recovery's "before any response", so the two lines cannot drift apart. Claude Code: the test that rule already applies, the first `assistant` event that isn't synthetic, top level or subagent. Codex: the first item the model issued in the run, on the parent or a child thread, as §When an Activity Starts lists, saved once as the run's `codex.firstResponseAt`, which both the start line and the one automatic attempt read. Kiln saves the time on the session when it arrives | The PRD's terms draw the line at AC-AUTO-05's "refused before the session gets any response", so the start line is that rule's own test, not a second one. Claude Code's `init` and Codex's accepted turn both arrive before the first request, so neither can be the line. Codex makes a new model request after each tool result, so a limit can refuse a turn that has already run commands and changed files, and most of Kiln's Codex turns run a tool before their first message. Counting only messages would leave such a run not started and let it relaunch on another choice, possibly the other agent, over its own changes. Claude Code's test already counts a tool call |
| What a started activity started on | The agent, model and effort of the session whose response started it, with Claude Code's concrete model as that session's `init` reported it | AC-PICK-04: a carry-on session must run on the same version, not on whatever the family alias names by then |
| When Claude Code isn't installed (DEF-003) | A row whose resolved first choice is on Claude Code resolves to Model defaults' Fallback column choice for that row, at the moment it is resolved. The saved Model defaults are not rewritten, and the fallback switch plays no part | Nothing is saved, so installing Claude Code later restores the first choices with no step by the person. What is installed is independent of how much usage is left, so the switch has no say in it |
| Telling a picked model from a filled-in one on a PRD not yet started (KEEP-001) | A saved choice equal to Kiln's current default (Claude Code · `opus` · medium, or Codex · any GPT Sol version · high) is not kept. Any other saved choice is kept, an earlier default such as Opus at high included | The saved record does not say who set a choice, so the value is the only evidence. The person sees every row before Start and can press Use the default |
| Which account a not-started activity's wait watches | The account the launch decision names on each reading: the fallback's when the decision would use it, otherwise the current choice's (§A Wait Before the Start) | AC-AGENTS-04 says the wait watches the account the activity will next run on, and the launch decision is what says which that is |
| What a stop on a not-started activity names | History keeps the agent of the session it describes. The reply label, Resume, Start again and the terminal command name the agent of the activity's current choice | The page's facts are about a conversation that happened; its controls launch a new session, so they must name where it will run (AC-AGENTS-04, AC-PICK-07) |
| A no-run session record | It takes the choice of the launch that reuses it | A reused record would otherwise keep the model it was made with and ignore a changed choice |
| Change while a launch of the activity is under way or a process of its own session runs | Unavailable, with the reason, from the moment a launch of the activity saves its decision until that launch ends, and while a process of its session runs, including one adopted after a restart | That launch would ignore a change made after its decision is saved, and a process that runs could give the session's first response after the change; either way the row would then show a choice the person didn't just pick |
| Telling a model-scoped Codex bucket, and a usage block | By `normalModelSlug`, then `limitName` against the model list read with the usage; a usage block counts as at or above the threshold, an administrative block only disqualifies the fallback (§The launch decision) | The counted-limit definition needs the model a bucket belongs to, and `limitId` is an opaque code. No Codex account reports a model-scoped bucket today (a read on Codex 0.167.2 returns only `codex`), so the rule rests on the schema's description of `normalModelSlug` and one historic named bucket, not a live one. AC-FALLBACK-02 lets only a usage reading send a launch to the fallback |
| Usage read for a launch | Read for that launch, awaited up to the existing 30-second reading limit. An earlier reading is never used | AC-FALLBACK-02 decides on a reading taken first; a stale 97% must not send a launch to the fallback after the limit reset |
| Model defaults across running Kilns | Every resolution reads the file as it is; each running Kiln watches the state root for the file's name, since an atomic write replaces the file rather than changing it, and republishes its page | AC-DEFAULT-03 reaches runs underway, and each PRD is its own Kiln process |
| Model defaults holds only what the person set | A row side the person never set reads Kiln's shipped default | A later release can ship a new default without overwriting anyone's choice |
| Restore Kiln's defaults | Clears the four rows. The fallback switch and threshold stay | AC-FALLBACK-01: once on, the switch applies until the person turns it off |
| A launch on Claude Code and the Codex wait record | Leaves the activity's Codex one-attempt record as it is | Otherwise a run alternating agents earns a free Codex attempt on the same reading each time it returns to Codex |
| Commands for Model defaults (CLI-001) | Kept whole, as one `kiln model-defaults` group | Four leaves beside the existing groups, run through the same module as the page, with no controller needed. That meets the stakeholder's condition of not complicating the command line, so AC-DEFAULT-05 is not narrowed |

## The Tier Line (AC-TIER-01, AC-TIER-02)

The phase document reader gains one field, read from the first line starting `**Model tier:**` before the first `##` heading, outside a code fence, like the other preamble lines:

```
modelTier: { tier: "demanding" | "standard" | "mechanical", reason: string } | undefined
```

The tier is the first word after the label, compared without regard to case. The reason is the rest of the line after its separator (a dash or colon), trimmed, and may be empty. A line whose first word is none of the three, or no line, gives `undefined`, which every reader treats as **Not rated** and resolves as standard. The line can never make a plan fail to read.

The recorded plan keeps the field for each phase, so it is read with every plan read and a phase added or split during the run gets its own. Kiln never writes it.

## Resolving a Choice (AC-PICK-01, AC-PICK-03, AC-PICK-04, AC-DEFAULT-01, AC-DEFAULT-03, AC-DEFAULT-04, AC-OTHER-01, AC-KEEP-02)

```
ModelChoice:  { agentId, model, effort? }      model: the agent's model-list value
FamilyChoice: { agentId, family, effort? }     a Model defaults row side
```

A **family** is what Model defaults stores in place of a version. For Claude Code it is the model list's alias (`fable`, `opus`, `sonnet`), which Claude Code itself resolves to the newest version. For Codex it is the name in `gpt-<version>-<family>` (`sol`, `astra`), resolved to the selectable model of that family with the greatest numeric version. A Codex model outside that pattern can be picked for a phase but is not a family.

The choice of an activity, first match wins:

1. **It has started:** what it started on. Nothing below is consulted.
2. **Its own entry is a choice:** that choice, marked **Changed by you**. A phase's entry is its own; the preflight, every audit and the pull request session share the PRD's one Audits entry.
3. **Its own entry is unset and the PRD has a kept choice** (AC-KEEP-02): the kept choice, marked **Changed by you**.
4. **Otherwise** (the entry is unset, or says "use the default"): the first choice of its Model defaults row. A phase's row is its tier's, with Not rated using Standard; every other activity uses Audits. The family is resolved against the agent's current model list. When Claude Code isn't installed and that first choice is on Claude Code, the row's Fallback column choice is used in its place, with the note that Claude Code isn't installed.

The **fallback** of an activity is its Model defaults row's Fallback column choice, resolved the same way, unless it is on the same agent as the choice above, in which case the activity has none.

Because steps 2 to 4 are evaluated every time, a change to a tier line, a row or Model defaults reaches every activity that hasn't started, in this PRD and every other, with nothing to propagate. Step 1 is why none of them reaches a started activity.

**Use the default** writes "use the default" as the row's entry instead of removing it, so a row can leave a kept choice one row at a time.

**A child phase a session goes on building** after it splits its phase reads its start from the phase Kiln launched, by the existing rule that credits that session's work to the child.

## When an Activity Starts (AC-PICK-02, AC-PICK-04)

When a session's first model response arrives, Kiln saves its time on the session. If the activity has no start yet, the same save records that session as the one that started it. From then on the activity's row reads **Running on**, its choice is that session's, and it offers no Change.

**Codex's first response** is the first item the model issued in the run, on the parent or a child thread: `item/started` for `reasoning`, `plan`, `commandExecution` from any source but `userShell`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, `collabAgentToolCall`, `webSearch`, `imageView`, `imageGeneration` or `sleep`, or `item/completed` for an `agentMessage` with text. Kiln saves that time once as the run's `codex.firstResponseAt`, and the session's `firstResponseAt` comes from it. Items Codex or Kiln writes itself don't count: `userMessage`, `hookPrompt`, `functionCallOutput`, `subAgentActivity`, `contextCompaction` and the review-mode markers. The one automatic attempt's record is cleared by the attempt's `firstResponseAt`. The sleep rule and the refusal's check for activity after it keep reading `modelActivityAt`, agent messages only, because a tool that finishes after wake doesn't show the model got through.

Every later session of a started activity (a carry-on when the conversation can't be reopened) is created on what the activity started on, whatever the resolver's later steps would say: the agent, its effort and, for Claude Code, the concrete model ID from that session's `init`. Like a resume, its launch skips the model-list and effort checks; agent readiness, billing approval and Codex launch settings still run, on that choice. When the account no longer serves that model, the launch fails before any response and stops as §A choice that can't be used says for a choice found at launch. The stop's facts name the model it started on, and no newer version runs in its place (AC-PICK-04).

Kiln's saved start is a record of what it has seen, not proof that nothing happened. A session's first response is the earliest found in Kiln's saved events (Claude Code) or its runs' `codex.firstResponseAt` (Codex), or in the agent's own history: Claude Code's saved conversation file, or the Codex thread's turns. Both are read with the same test. A saved start is only ever added, never removed. For an activity with no saved start, Kiln reads its sessions' histories at four points: on load; when it observes the exit of a process it adopted after a restart; at each reading of a wait; and at dispatch, Change and the launch decision, once the session's last process is known to have ended. Only after that read does the activity count as not started. When the history exists but can't be read, the start is unknown: Kiln launches nothing, and the stop gives the reopen check's reason with Check again. A missing Claude Code file means no response was given.

A response given while the person has the conversation open in a terminal counts like any other, so the activity has started and Resume reopens that conversation. What it started on is the session's recorded agent, model and effort, with Claude Code's concrete model taken from its own run's `init`. A terminal session may run on another model, and that does not change it.

What a row shows follows from whether the activity has a start and whether it has finished:

| The activity | Row |
|---|---|
| No start, not finished, no session launching or running | The resolver's choice: plain before Start is pressed, **Will run on** in a run underway |
| No start, and one of its sessions is launching (its launch decision is saved and the launch hasn't ended) or its process runs | **Will run on** and that session's recorded agent, model and effort, with the **Fallback** tag when its saved decision used the fallback; no Change |
| Has a start, not finished | **Running on** and what it started on |
| Finished, and a session of it got a response | **Ran on** and the latest such session's recorded agent, model and effort |
| Finished, and no session of it got a response | **No model recorded** |

When that launch ends with no response, the row returns to the resolver's choice: the next launch decides again (AC-FALLBACK-02).

A phase the person completes after its only launch failed before any response therefore shows No model recorded: no session did the work.

## Launching (AC-PICK-06, AC-PICK-07, AC-FALLBACK-02 to 04)

### The launch decision

Every launch of an activity that hasn't started runs one decision, immediately before the existing launch checks:

```
decide(activity):
    first = the resolver's choice;  fallback = the activity's fallback
    switch off, or no fallback                          → first
    read both agents' usage for this launch
    first's usage unreadable, or every counted limit below the threshold
                                                        → first
    fallback's agent ready, offers its model and effort, has any billing approval it
      needs, usage readable with no counted limit at or above the threshold
                                                        → fallback, recording the limit, its percent and the threshold
    otherwise                                           → first, recording the limit, its percent, the threshold
                                                          and why the fallback wasn't used
```

A **counted limit** is every window in the account's reading except one the agent scopes to a model other than the one about to run. Claude Code scopes a weekly window by model name, and the window belongs to the model about to run when that name is one of the hyphen-separated parts of its ID. Codex scopes a bucket to the model its `normalModelSlug` names or, without one, to the model in the list read with the usage whose display name or ID equals its `limitName`, ignoring case. The bucket belongs to the model about to run when that model is the one it names. A bucket's `limitId` is an opaque code and never identifies a model. A bucket that names no model counts, including `codex`, the legacy single bucket, and a name matching no listed model. This scoping serves only this decision: Codex's refusal and release rules are unchanged. Readiness, model-list membership and billing in the fallback's test are the same checks a launch on that agent would run, so a fallback the decision names is one the launch checks will pass.

Codex's ordinary-usage permission is part of the reading. When Codex reports ordinary usage blocked for usage, the account counts as having a limit at or above the threshold, whatever its windows read, in both the first choice's test and the fallback's, and the recorded limit is "ordinary usage blocked", with no percent. An administrative block is not a usage reading, so it never sends the first choice to the fallback (AC-FALLBACK-02), but a fallback blocked that way is not used. When Codex doesn't report permission, the windows decide. A Codex window with no percent can't be read, and only that window. The first choice's usage reads when Codex reports usage blocked or at least one counted window reads a percent. The fallback's usage reads only when it isn't blocked and every counted window reads a percent. A failed reading, or one with no windows, can't be read for either agent. Claude Code's readings never keep a window without a percent.

The decision's result is saved on the session before its process starts. It is the source for the Fallback tag, the card's facts, the phase detail, the "fallback wasn't used" note and the terminal line, which prints when the activity starts on the fallback, not when it is merely launched. Where the recorded limit is a usage block, the card and phase detail say "ordinary usage blocked" in place of a percent.

Skill resolution, launch settings and billing for the launch run after the decision, against the agent it named.

**The heads-up (AC-FALLBACK-04).** The snapshot runs the same decision for the next activity against the latest scheduled readings, without reading anything, and adds the line while its result is the fallback.

### A choice that can't be used

- **Known before launch** (an activity that hasn't started)**:** the resolver's choice names a model or effort the agent's list doesn't offer, a family with no single newest model, a Claude Code model the list marks as unable to run in auto mode (today's message: '<Model> can't run unattended on this account; it needs auto mode.'), or Model defaults can't be read. Before Start, the row carries the message and Start is unavailable. At a launch, the activity stops with the existing `selection` stop, whose facts name the choice, where it came from (Model defaults, a change for this PRD) and where to change it. Check again resolves again.
- **Found at launch:** the agent didn't run, or the account refused the model before it responded. Today's stop and stopped-phase page apply unchanged. The stop's facts add the choice, where it came from (including the fallback, from the saved decision) and where to change it. For a started activity the facts name what it started on and give no place to change it.

In both, no session is launched on anything else.

### An activity that hasn't started goes on in a new session

At the one place the engine dispatches a session for an activity, an activity with no start, once the read in §When an Activity Starts has settled that, is launched, never resumed, whatever asked: the person's Resume or reply, `kiln resume` or `kiln reply`, Kiln's own resume after an interruption, or the end of a wait. The launch runs the decision above, so it uses the current choice. With a reply, the new session gets the carry-on prompt carrying the reply, the last recorded message if there is one, and the phase's work; without one, the ordinary prompt for the activity.

Resume and reply are offered at such a stop under Start again's limits (a session running, Kiln busy, a billing restriction), not under the reopen check, since nothing is reopened. Their receipts settle `started`, as Start again's and Carry on's do.

### A Wait Before the Start (AC-PICK-07, AC-AGENTS-04)

An activity refused by a usage limit before any response waits as today when "Resume after a usage limit" is on. It needs no saved conversation to wait. Each reading taken after the refusal runs the launch decision:

| The decision names | The wait |
|---|---|
| The fallback | Ends now: the activity launches on the fallback, whose account the decision has just found under the threshold |
| The choice it was refused on | Watches that account under today's release rules for its agent |
| A different choice (the person changed it, or Model defaults changed) | Ends once that choice's account has usage: no counted limit at 100% for Claude Code, ordinary usage not blocked for Codex. The refusal is evidence about the refused account and model only |

A launch made at the end of a wait records the refused run it follows. For Claude Code, if that launch is refused in turn before any response, by the same limit on the same account, the activity goes to Needs you: AC-AUTO-05's rule applied across the two sessions. For Codex, the one-attempt rule of the Codex support design's §Classification and bounded release applies across them instead: a repeat refusal starts a new wait, and an unchanged reading buys no further attempt.

While the activity hasn't started, that rule's record is the activity's own. Each reading during the wait, and the launch that ends it, read and update it, and the launch saves its attempt there before the session's process starts. The attempt's fingerprint is the model, effort, account and generation, with no conversation, since each launch makes a new one. A reading changes it only through a different stable account or a blocked-to-allowed change on the same account. A change to the Codex model or effort allows one attempt on the new choice. A launch on Claude Code leaves the record as it is, so a later Codex launch is still bounded by it. When the activity starts, on either agent, the record is removed, and a later refusal uses the started session's own record. While it exists, the Codex wait reason the snapshot shows reads it.

## Agents (AC-AGENTS-01 to 04, AC-KEEP-01)

Kiln keeps one reader per installed agent, each holding what the single reader holds today: readiness problems, the model list, the account and usage reading. Whether an agent is installed is read when Kiln starts and at each refresh.

An agent is **needed** when the resolver names it for an activity not yet finished, when the fallback switch is on and an activity's fallback names it, or while the person has it open in an editor or on the Model defaults page. Needed agents are read on the existing schedule and before each launch. An agent that isn't needed is not read and can block nothing.

- **Before Start:** an agent some activity resolves to that isn't ready makes Start unavailable, with the agent, the remedy and the activities that need it. An agent only a fallback names gives the warning and leaves Start available; at launch the decision then stays on the first choice.
- **Billing:** each needed agent has its own billing summary. Claude's approval stays one approval per execution and is asked for only when a needed activity or fallback is on Claude Code; a missing approval counts as that agent not being ready. No approval is cleared because an activity ran on the other agent. The check at each launch reads the launching agent's billing.
- **Account panel:** the snapshot carries each needed agent's account, marks the one the current activity runs on as in use, and, with the fallback on, marks each limit at or above the threshold.
- **By agent:** output labels, recovery commands, live-control eligibility, prerequisite-preparation checks, the audit and preflight skill lookups, and the handoff and account facts `kiln status` reports take the agent from the activity's session, or from its current choice when it has none.

## Interfaces

### Model defaults file

`<state root>/model-defaults.json`:

```json
{
  "schemaVersion": 1,
  "rows": {
    "standard": { "first": { "agentId": "claude_code", "family": "opus", "effort": "high" } }
  },
  "fallback": { "enabled": true, "threshold": 90 }
}
```

`rows` holds `demanding`, `standard`, `mechanical` and `audits`, each with optional `first` and `fallback`; a missing side is Kiln's shipped default (AC-DEFAULT-01's table). A missing `fallback` is off at 95. A missing file is all defaults.

Every write re-reads the file, applies one change and replaces it atomically. A save sets one or both sides of one row. It is refused when, with the saved sides in place, the row's first choice and fallback would be on the same agent; the reason names the agent and says to change both sides in one save. It is also refused when a given side's family or effort isn't in that agent's current model list or its model can't run in auto mode, when that list can't be read, or when the threshold isn't a whole number from 1 to 100. A file that doesn't parse, or has a newer schema version, is an error wherever a choice is resolved, with the file's path. Kiln never falls back to its shipped defaults over a file it can't read.

### HTTP (same-origin, token, as today)

| Route | Contract |
|---|---|
| `GET /api/model-defaults` | The four rows with each side's agent, family, effort, current model name and whether the person set it; the switch and threshold; each installed agent's families and efforts; each agent's readiness |
| `POST /api/model-defaults` | One of `{ set: { row, first?: FamilyChoice, fallback?: FamilyChoice } }` (at least one side), `{ restore: true }`, `{ fallback: { enabled?, threshold? } }`. 200 with the GET body; 400 malformed; 422 with the refusal's reason |
| `POST /api/model` | `{ target: { phase } \| "audits", choice: ModelChoice \| "default" }`. Before Start it is applied directly. In a run underway it goes through the instruction journal, as other browser controls do. 409 when the activity has started, a launch of it is under way or a process of its session runs; 422 when the agent's list doesn't offer the model or effort, or the model can't run in auto mode |
| `POST /api/settings` | Loses `agentId`, `model`, `effort` and `selectionGeneration` |
| `POST /api/billing/approval`, `POST /api/billing/clear` | Lose `selectionGeneration`: the execution ID and `readingId` bind a request to its reading. A reading is discarded when the set of needed agents changes, in place of a selection change |
| `POST /api/metadata/refresh` | Refreshes every needed agent; returns `settings` and `agents[]` in place of `billing` |
| `POST /api/start` | 409 with the reason while a needed-by-an-activity agent isn't ready or a choice can't be used |

The Model defaults page is a client route of the PRD's view, `<base>/model-defaults`, so "Back" returns to the PRD it was opened from. On the page, each side has its own Change. Done saves every open editor in that row in one request, carrying only the sides opened, so moving a row to the other agent means opening both sides and pressing Done once. A refused save keeps the editors open with the reason beside them.

### Snapshot

```
phases[], activities[]  each gain:
  tier?:  { value: "demanding" | "standard" | "mechanical" | "not_rated", reason?: string }     phases with no child phases
  model:
    state: "will_run_on" | "running_on" | "ran_on" | "none_recorded"
    choice?: { agentId, agent, model, modelName, effort? }
    from?: "model_defaults" | "changed"
    claudeCodeMissing?: true
    change?: { available: boolean, reason?: string }        where Change is offered
    useDefault?: true                                       where Use the default is offered
    problem?: string                                        a choice that can't be used
    fallback?: { used: boolean, limit: { agent, label, percent? }, threshold, first?: choice, reason?: string }
    forecast?: { choice, limit: { agent, label, percent? }, threshold }

settings.models:  { tiers: { demanding, standard, mechanical, notRated },
                    audits: { choice, changedByYou, change },
                    fallback: { enabled, threshold, warning?: { agent, problem, remedy } } }

agents[]:  { agentId, agent, installed, pending, readinessErrors, neededBy: { activities: string[], fallbackOnly: boolean },
             models?, modelListError?, account?: (today's account view, plus inUse and overThreshold per limit),
             billing }
```

`settings` loses `agent`, `agentId`, `agentFixed`, `selectionGeneration`, `model`, `effort`, `effortLevels`, `efforts` and `choiceNotice`, and the top-level `models`, `account` and `billing` move into `agents[]`. The current activity's card and a stop's session facts keep their recorded agent, model and effort, and the card gains the activity's `tier` and `fallback`. While the activity has no start, `model.choice` is the recorded choice of its session that is launching (its decision saved, the launch not ended) or whose process runs, otherwise the resolver's, as §When an Activity Starts' row table says. The `current` card takes `model.choice` until its session exists and that session's recorded choice after, so the two agree while the session launches or runs; once it ends with no response, the row returns to the resolver's choice and the card's facts keep describing the session.

At a stop on an activity that hasn't started, the snapshot's reply label, the terminal command and the fresh-session prompt are built for the agent of `model.choice`; the stopped-phase facts keep the agent of the session they describe.

### Command line

`kiln model` is a changing command: it takes `--command-id` and `--only-if-status-matches`, is listed among `kiln status`'s controls, and is refused with the reason when `POST /api/model` would answer 409: the activity has started, a launch of it is under way, or a process of its session runs. It is announced in the controller's `features` list, like the other changing commands added after the first release, so a newer client refuses it against an older running Kiln.

```
kiln model <PRD-path> (--phase <id> | --audits)
                      (--agent <claude_code|codex> --model <value> [--effort <value>] | --use-default)
```

`kiln status <PRD-path>` gives each activity its `tier` and `model` as the snapshot does, so a bot can read the values it may send.

`kiln status` keeps its top-level `agent`, `model` and `requested_model`. They describe the activity status reports in `activity`, which is the current activity, or the next one when none is current. With a session, they are that session's recorded agent, model and effort, as today. Without one, they are that activity's `model.choice` from the snapshot. When no activity is current or next, they are `null`. A status read with the controller stopped takes these values, and each activity's `tier` and `model`, from the last snapshot the controller saved, under the reply's existing stale marking. It never reads a model list. With no saved snapshot, an activity's `model` and these fields are `null`. `effective_model` is unchanged.

`kiln model-defaults` changes a computer setting, not a run, so its commands take neither safety flag and need no running Kiln. They call the same module as the page, with the same refusals.

```
kiln model-defaults                                          print the rows, the switch and the threshold
kiln model-defaults set --row <demanding|standard|mechanical|audits>
                        [--first-agent <claude_code|codex> --first-model <family> [--first-effort <value>]]
                        [--fallback-agent <claude_code|codex> --fallback-model <family> [--fallback-effort <value>]]
kiln model-defaults restore
kiln model-defaults fallback [--on | --off] [--threshold <1..100>]
```

`set` takes at least one side; a side's agent and model go together.

All accept `--json` and `--help` under the existing result, exit and help contracts.

## Data Models

**PRD record, schema 25.** `settings` loses `agentId`, `selectionGeneration` and `agentChoices`, and gains:

```
settings.modelChoices:
  phases: { [phaseId]: ModelChoice | "default" }
  audits?: ModelChoice | "default"
  kept?:  ModelChoice                    written only by the schema 25 migration
```

Each activity's facts gain `startedSessionId?`, the session whose response started it, and `codexUsageRecovery?`: while the activity hasn't started, the one-automatic-attempt record (§A Wait Before the Start), in the same shape as a session's `codex.usageRecovery`, with a fingerprint that leaves out the conversation; removed when the activity starts. A reset builds new settings, so it returns a PRD's changes to the defaults as it does its other settings.

**Session record.**

```
firstResponseAt?: ISO-8601 UTC
runs[].codex.firstResponseAt?: ISO-8601 UTC    the first item the model issued in that Codex run
launch?:  { from: "model_defaults" | "changed", claudeCodeMissing?: true,
            fallback?: { used: boolean, limit: { agentId, label, percent? }, threshold,
                         first?: ModelChoice, reason?: string } }
relaunchOf?: { sessionId, run }          the refused run a launch at the end of a wait follows
```

**Migration to schema 25** runs on load, as earlier ones do, and reads the PRD's saved sessions:

1. For each session with no `firstResponseAt`, derive it once from what is already saved, by the same test: for Claude Code, the first saved event that is a model response; for Codex, the first saved item notification that passes the same test. Each activity's `startedSessionId` is its earliest such session. The same derivation, with the agent's own history, then runs on every load for the sessions of an unfinished activity with no start (§When an Activity Starts).
2. Apply AC-KEEP-02's table to the saved selected agent's choice. A choice with no model (no saved entry, or Codex's empty entry left when Kiln couldn't pin the latest GPT Sol) is no choice and sets nothing: Start and every launch refuse it, so no activity ran on it. Otherwise: an activity that started sets `kept` to it; no started activity and a choice equal to Kiln's current default sets nothing; any other choice sets `kept`.
3. Remove the three retired fields.

An older Kiln refuses a schema 25 record, as with every earlier schema change.

## Changes to Earlier Designs

Each line is added to the earlier section, as `Superseded in part by:`, in the commit that builds the change.

- Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Overview and §Agent boundary (the agent is per activity, not per PRD), §Selection and readiness (readiness for every needed agent; no agent fixed at Start), §Models and Settings (choices resolved per activity; no first-selection GPT Sol pick), §Local API and snapshot changes, §Persisted schema 4 (PRD settings), §Readings and identity (every needed agent is read on the schedule, not only the selected one), §Classification and bounded release (for an activity that hasn't started, the one automatic attempt launches a new session on its current choice instead of resuming the original conversation, and while the activity hasn't started its one-attempt record lives on the activity, with a fingerprint that leaves out the conversation, and is removed when the activity starts; a repeat refusal is before model activity only when the attempt's run has no first response, and any item the model issued counts, a tool call included, not only an agent message).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot and §Account and Usage (settings and each phase's model; one account).
- Replaces in part: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait and §Resume (an activity that hasn't started is launched, not resumed, and its wait watches the launch decision's account).
- Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`, §Starting a Session at a Stop (Resume and reply on an activity that hasn't started launch a new session).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`kiln model` and `kiln model-defaults`; `reply` and `resume` settle `started` for an activity that hasn't started), §Status, Conversations and Handoff and §Account and Usage Facts (with no session, status's agent and requested model are the reported activity's `model.choice`; handoff and account facts follow the activity's agent).
- Replaces in part: `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-technical-design.md`, §Context identity and invalidation and §Local Interfaces (billing per needed agent; no invalidation by an agent switch).
- Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Provider Sessions and Development Delivery (audit sessions run on the Audits choice, with the skill looked up for the launching agent).
- Replaces in part: `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Settings (Effort: no PRD-wide default effort).
- Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §The Setup Panel (the panel is treated as AC-KEEP-01 treats Documents found: the model lines and links replace Agent, Model and Effort, and a start from the panel keeps the PRD's per-phase changes).
- Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Evaluate, then act and §Reply and Agent Integration (for a phase that hasn't started, reply and Resume launch a new session on its current choice and give it the reply, instead of queueing the same conversation with its recorded model and effort).
- Replaces in part: `docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-technical-design.md`, §Design Decisions (start checks for versions: an agent below its minimum is shown on Documents found when an activity will run on it or a fallback names it, not when it is selected).
- Replaces in part: `docs/changes/kiln-build-preflight/kiln-build-preflight-technical-design.md`, §The Preflight Session and §Interfaces (the preflight runs on the Audits choice, not the run's agent, model and effort, and skill presence before Start is read for the preflight's own agent).
- Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Screens (AC-SHOW-01) (Documents found's Agent, Model and Effort give way to the model lines and links, and phase rows gain the tier tag and model choice).

## Integration Points

- Reads each phase document's `**Model tier:**` line, written by the Enso Method's phase split.
- Reads each agent's model list, readiness and usage through the existing metadata calls; makes no model request to decide anything.
- Launches Claude Code and Codex sessions through their existing adapters with the decided model and effort.

## Delivery

- **Before the build:** Claude Code and Codex both installed and signed in on the build computer, provided by whoever starts the build, because the proofs below launch real sessions on each.
- **Expected build spend:** about $15 of agent usage, for short disposable Claude Code and Codex sessions proving that a first response starts an activity and a refusal before one doesn't, and that a carry-on of a started Claude Code activity launches on the concrete model ID it started on (AC-PICK-04, AC-PICK-06), that a not-started activity goes on in a new session on a changed choice, on the other agent included (AC-PICK-07), that each family resolves to the newest version its agent offers (AC-DEFAULT-01), and that a launch decided for the fallback starts and reports there (AC-FALLBACK-02, AC-FALLBACK-03). An account can't be brought to 95% on demand, so the fallback proofs supply the usage reading at the reader's boundary and run the session for real. That gap is stated in the evidence: no live reading at the threshold.
- **After the build:** once the PRD's audits have closed and its pull request has merged, add the changelog entry under Unreleased (Added: model tiers, Model defaults and the fallback; Changed: no PRD-wide model choice), then release as a minor version: saved records migrate on load, and no command or flag is removed.

## Criteria Coverage

| Criterion | Covered by |
|---|---|
| AC-TIER-01, AC-TIER-02 | §The Tier Line; `tier` in §Snapshot |
| AC-PICK-01, AC-PICK-03 | §Resolving a Choice; `POST /api/model` |
| AC-PICK-02 | §When an Activity Starts; `model.state` in §Snapshot |
| AC-PICK-04 | §When an Activity Starts; resolver step 1; first-response decision |
| AC-PICK-05 | `kiln model`, `kiln status` in §Command line |
| AC-PICK-06 | §A choice that can't be used |
| AC-PICK-07 | §An activity that hasn't started goes on in a new session; §A Wait Before the Start |
| AC-DEFAULT-01, AC-DEFAULT-02, AC-DEFAULT-03 | §Model defaults file; families and step 4 in §Resolving a Choice; the page route and `GET`/`POST /api/model-defaults` |
| AC-DEFAULT-04 | Resolver step 4; the DEF-003 decision |
| AC-DEFAULT-05 | `kiln model-defaults` in §Command line |
| AC-OTHER-01 | The Audits entry and row in §Resolving a Choice; `settings.models.audits` |
| AC-FALLBACK-01 | `fallback` in §Model defaults file; `settings.models.fallback` |
| AC-FALLBACK-02, AC-FALLBACK-03, AC-FALLBACK-04 | §The launch decision; `launch` on the session record; `fallback` and `forecast` in §Snapshot |
| AC-AGENTS-01 to AC-AGENTS-04 | §Agents; `agents[]` in §Snapshot; §A Wait Before the Start |
| AC-KEEP-01 | §Existing Code (switched off); the fields removed in §HTTP and §Snapshot |
| AC-KEEP-02 | Migration step 2; the KEEP-001 decision; resolver step 3 |
| AC-GUIDE-01 | The README's sections on how Kiln works, billing and driving Kiln from a terminal, and the command-line guide, gain tiers, Model defaults, the two commands and the fallback |

## Open Questions

1. **DEF-001 and DEF-002 are still open** (Sonnet at medium, GPT Astra at high, and whether only the Audits fallback gets extra high). The shipped defaults are one table of data, so either answer changes a value and nothing in this design.
