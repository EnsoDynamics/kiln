# Technical Design: Kiln Phase Model Tiers

**PRD:** [Kiln Phase Model Tiers](kiln-phase-model-tiers-prd.md) · **Decisions:** [validated assumptions](kiln-phase-model-tiers-assumptions.md) · **Design references:** the five mockups the PRD links

## Overview

Kiln stops keeping one agent, model and effort for a PRD. Each activity has a **model choice** that Kiln works out whenever it shows the plan and again when it launches the activity. Three things carry the design:

- **One resolver.** A single function gives every activity its choice, in the order of §Resolving a Choice. The plan rows, the readiness checks, the launch and the bot's status all call it, so they cannot disagree.
- **One start line.** The PRD's term **starts**, recorded as §When an Activity Starts says. Before it, AC-PICK-07; after it, AC-PICK-04.
- **Both agents at once.** §Agents.

Model defaults: §Storage. The usage fallback: §The launch decision.

No new service, repository, database or dependency. The Enso Method skills: the PRD's Out of Scope.

## Existing Code

**Posture: Preserve.** Kiln is released, and AC-KEEP-02 keeps runs already underway as they are.

- **Reused:** the phase document reader and plan read; each agent's adapter, readiness checks and model list; the `selection` stop ("Agent selection and readiness") for a choice an agent doesn't offer; the launch path that Start again and Carry on use, for every new session of an activity that hasn't started; Claude Code's model-response test that usage-limit recovery's "refused again" rule already uses; Claude's billing approval; the instruction journal behind `kiln` commands and browser controls; the state root outside every repository.
- **Switched off:** the PRD-wide agent, model and effort selection, its selection generation, the rule that fixes one agent at Start, and the first-selection pick of the latest GPT Sol. The resolver and Model defaults replace them.
- **Kept, and not visible from the code alone:**
  - Kiln Run Restart's stopped-phase page keeps its own line, *a conversation began* (Claude Code's `init`, a Codex turn accepted). That line still decides which case the page shows and which cards it offers. The start line here decides only which model choice binds and what a resume or reply dispatches.
  - A started activity is resumed exactly as today, including the wait at a usage limit and the reopen check.
  - Billing approval, as §Agents, Billing says.

## Architecture

### Workload Type and Starting Point

The existing local TypeScript application: the engine, its loopback server, the Svelte view and the `kiln` command line. Patterns come from this repository; nothing is seeded from elsewhere.

### Storage

Model defaults lives in one owner-only JSON file at the state root, beside the per-PRD state directories, written atomically like every other Kiln record. It is outside every repository, which is what makes it apply to every PRD in every repository on the computer and survive upgrades (AC-DEFAULT-02). Per-PRD changes and each activity's start live in the PRD record and session records, schema 26.

### Dependencies

Claude Code and Codex, through their existing adapters. No new call is made to either (§Integration Points).

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where a choice comes from | One resolver, in the order of §Resolving a Choice | AC-PICK-01 to 04 and AC-DEFAULT-03 each name a precedence; one function is the only way the row, the launch and the status command stay equal |
| How Kiln tells a session got its first response | One test per agent, shared by the start line and usage-limit recovery's "before any response", so the two lines cannot drift apart. Claude Code: the test that rule already applies, the first `assistant` event that isn't synthetic, top level or subagent. Codex: as §When an Activity Starts lists, which also says where Kiln saves the time | The PRD's terms draw the line at AC-AUTO-05's "refused before the session gets any response", so the start line is that rule's own test, not a second one. Claude Code's `init` and Codex's accepted turn both arrive before the first request, so neither can be the line. Codex makes a new model request after each tool result, so a limit can refuse a turn that has already run commands and changed files, and most of Kiln's Codex turns run a tool before their first message. Counting only messages would leave such a run not started and let it relaunch on another choice, possibly the other agent, over its own changes. Claude Code's test already counts a tool call |
| What a started activity started on | As §When an Activity Starts says | AC-PICK-04: a carry-on session must run on the same version, not on whatever the family alias names by then |
| When Claude Code isn't installed (DEF-003) | Step 4 of §Resolving a Choice, applied at the moment it is resolved. The saved Model defaults are not rewritten, and the fallback switch plays no part | Nothing is saved, so installing Claude Code later restores the first choices with no step by the person. What is installed is independent of how much usage is left, so the switch has no say in it |
| Telling a picked model from a filled-in one on a PRD not yet started (KEEP-001) | A saved choice equal to Kiln's current default (Claude Code · `opus` · medium, or Codex · any GPT Sol version · high) is not kept. Any other saved choice is kept, an earlier default such as Opus at high included | The saved record does not say who set a choice, so the value is the only evidence. The person sees every row before Start and can press Use the default |
| Which account a not-started activity's wait watches | The account the launch decision names on each reading (§A Wait Before the Start) | AC-AGENTS-04 says the wait watches the account the activity will next run on, and the launch decision is what says which that is |
| What a stop on a not-started activity names | History keeps the agent of the session it describes. The reply label, Resume, Start again, the fresh-session command and its prompt name the agent of the activity's current choice. The command that reopens the saved conversation, still gated by the reopen check, is offered only while `model.choice` equals that session's recorded agent, model and effort. After a change, a Model defaults or tier change, or a launch on the fallback, it is withdrawn, and the terminal card gives the fresh-session command. `kiln handoff`'s `resume_command` and `resume_argv` follow the same rule | The page's facts are about a conversation that happened; its controls launch a new session, so they must name where it will run, and a terminal response in the old conversation would start the activity on that session's choice and override the change (AC-AGENTS-04, AC-PICK-07) |
| A no-run session record | It takes the choice of the launch that reuses it | A reused record would otherwise keep the model it was made with and ignore a changed choice |
| Change while a launch of the activity is under way or a process of its own session runs | Unavailable, with the reason, from the moment a launch of the activity saves its decision until that launch ends, and while a process of its session runs, including one adopted after a restart. A process of its session is one Kiln launched or adopted. A person's terminal on that conversation is not one, and a takeover hold alone doesn't make Change unavailable. A change to the PRD's Audits entry: §Resolving a Choice step 2 and `POST /api/model` | That launch would ignore a change made after its decision is saved, and a process that runs could give the session's first response after the change; either way the row would then show a choice the person didn't just pick |
| Telling a model-scoped Codex bucket, and a usage block | As §The launch decision says | The counted-limit definition needs the model a bucket belongs to, and `limitId` is an opaque code. No Codex account reports a model-scoped bucket today (a read on Codex 0.167.2 returns only `codex`), so the rule rests on the schema's description of `normalModelSlug` and one historic named bucket, not a live one. AC-FALLBACK-02 lets only a usage reading send a launch to the fallback |
| Usage read for a launch | Read for that launch, awaited up to the existing 30-second reading limit. An earlier reading is never used | AC-FALLBACK-02 decides on a reading taken first; a stale 97% must not send a launch to the fallback after the limit reset |
| Model defaults across running Kilns | Every resolution reads the file as it is; each running Kiln watches the state root for the file's name, since an atomic write replaces the file rather than changing it, and republishes its page | AC-DEFAULT-03 reaches runs underway, and each PRD is its own Kiln process |
| Model defaults holds only what the person set | As §Model defaults file says | A later release can ship a new default without overwriting anyone's choice |
| Restore Kiln's defaults | Clears the four rows. The fallback switch and threshold stay, except over a file that doesn't parse (§Model defaults file). Refused over a newer schema version (§Model defaults file) | AC-FALLBACK-01: once on, the switch applies until the person turns it off |
| A launch on Claude Code and the Codex wait record | As §A Wait Before the Start says | Otherwise a run alternating agents earns a free Codex attempt on the same reading each time it returns to Codex |
| Commands for Model defaults (CLI-001) | Kept whole, as one `kiln model-defaults` group | Four leaves, listed with `kiln model` under a new **Choose models** help heading, run through the same module as the page, with no controller needed, so the commands don't complicate the command line, the condition CLI-001 set |

## The Tier Line (AC-TIER-01, AC-TIER-02)

The phase document reader gains one field, read from the first line starting `**Model tier:**` before the first `##` heading, outside a code fence, like the other preamble lines:

```
modelTier: { tier: "demanding" | "standard" | "mechanical", reason: string } | undefined
```

The tier is the first word after the label, compared without regard to case. The reason is the rest of the line after its separator (a hyphen, an em dash or a colon) or, with no separator, the rest of the line after the tier word, trimmed, and may be empty. When a demanding or mechanical line gives no reason, the tag's explanation says that the phase document's Model tier line gives no reason, in place of the reason, followed as usual by "From the phase document's Model tier line." A line whose first word is none of the three, or no line, gives `undefined`, which every reader treats as AC-TIER-01 says. The line can never make a plan fail to read.

The recorded plan keeps the field for each phase (AC-TIER-01). Like the Attended and Early merge lines, it is display data: comparisons of plan structure leave it out, so a plan record saved before Kiln read the line still matches its plan read back from Git.

## Resolving a Choice (AC-PICK-01, AC-PICK-03, AC-PICK-04, AC-DEFAULT-01, AC-DEFAULT-03, AC-DEFAULT-04, AC-OTHER-01, AC-KEEP-02)

```
ModelChoice:  { agentId, model, effort? }      model: the agent's model-list value
FamilyChoice: { agentId, family, effort? }     a Model defaults row side
```

A **family** is what Model defaults stores in place of a version. For Claude Code it is the model list's alias (`fable`, `opus`, `sonnet`), which Claude Code itself resolves to the newest version. For Codex it is the name in `gpt-<version>-<family>` (`sol`, `astra`), resolved to the selectable model of that family with the greatest numeric version. A Codex model outside that pattern can be picked for a phase but is not a family.

The choice of an activity, first match wins:

1. **It has started:** what it started on. Nothing below is consulted.
2. **Its own entry is a choice:** that choice, marked **Changed by you**. A phase's entry is its own; the preflight, every audit and the pull request session share the PRD's one Audits entry. A change to the Audits entry reaches every Audits activity with no start, no launch under way and no process of its session running, whichever control made it (`POST /api/model`).
3. **Its own entry is unset and the PRD has a kept choice** (AC-KEEP-02): the kept choice, marked **Changed by you**.
4. **Otherwise** (the entry is unset, or says "use the default"): the first choice of its Model defaults row. A phase's row is its tier's, with Not rated using Standard; every other activity uses Audits. The family is resolved against the agent's current model list. When that list can't be read, the choice keeps the family and can't be used (§A choice that can't be used). When Claude Code isn't installed and that first choice is on Claude Code, the row's Fallback column choice is used in its place, with the note that Claude Code isn't installed.

The **fallback** of an activity is its Model defaults row's Fallback column choice, resolved the same way, unless it is on the same agent as the choice above, in which case the activity has none.

Because steps 2 to 4 are evaluated every time, a change to a tier line, a row or Model defaults reaches every activity that hasn't started, in this PRD and every other, with nothing to propagate. Step 1 is why none of them reaches a started activity.

**Use the default** writes "use the default" as the row's entry instead of removing it, so a row can leave a kept choice one row at a time.

A phase's entry stays with that phase's id. When a session splits its phase, the child it goes on building keeps what the session started on (step 1), by the existing rule that credits that session's work to the child. Every other child resolves on its own: its own entry, the kept choice, then its own tier line. A change made to the parent before it started doesn't carry over. When a phase is split before it starts, by a person or another chat, the parent is no longer an activity and nothing reads its entry. Each child resolves on its own and offers Change until it starts.

## When an Activity Starts (AC-PICK-02, AC-PICK-04)

When a session's first model response arrives, Kiln saves its time on the session. If the activity has no start yet, the same save records the one that started it: the first of its sessions, in the order they were created, that has a `firstResponseAt`. From then on the activity's row reads **Running on**, its choice is that session's, and it offers no Change.

**Codex's first response** is the first item the model issued in the run, on the parent or a child thread: `item/started` for `reasoning`, `plan`, `commandExecution` from any source but `userShell`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, `collabAgentToolCall`, `webSearch`, `imageView`, `imageGeneration` or `sleep`, or `item/completed` for an `agentMessage` with text. Kiln saves that time once as the run's `codex.firstResponseAt`, and the session's `firstResponseAt` comes from it. Items Codex or Kiln writes itself don't count: `userMessage`, `hookPrompt`, `functionCallOutput`, `subAgentActivity`, `contextCompaction` and the review-mode markers. The one automatic attempt's record is cleared by the attempt's `firstResponseAt`. The sleep rule and the refusal's check for activity after it keep reading `modelActivityAt`, agent messages only, because a tool that finishes after wake doesn't show the model got through.

Every later session of a started activity (a carry-on when the conversation can't be reopened) is created on what the activity started on, whatever the resolver's later steps would say: the agent, its effort and, for Claude Code, the concrete model ID from that session's `init`. Like a resume, its launch skips the model-list and effort checks; agent readiness, billing approval and Codex launch settings still run, on that choice. When the account no longer serves that model, the launch fails before any response and stops as §A choice that can't be used says for a choice found at launch. No newer version runs in its place (AC-PICK-04).

Kiln's saved start is a record of what it has seen, not proof that nothing happened. A session's first response is the earliest found in Kiln's saved events (Claude Code) or its runs' `codex.firstResponseAt` (Codex), or in the agent's own history: Claude Code's saved conversation file, or the Codex thread's turns. Both are read with the same test. A saved start is only ever added, never removed. For an activity with no saved start, Kiln reads its sessions' histories at four points: on load; when it observes the exit of a process it adopted after a restart; at each reading of a wait; and at dispatch, Change and the launch decision, once the session's last process is known to have ended. Only after that read does the activity count as not started. A finished activity with no saved start has no history read, on load or after: once finished, its choice binds nothing, so its row reads Kiln's saved record, **Ran on** when a session's saved events show a response, otherwise **No model recorded**. When the history exists but can't be read, the start is unknown. Kiln launches nothing for the activity. Its row is as the table below shows. A stop gives that reason with Check again. The next read that succeeds settles it. A history Kiln can't reach counts as unreadable, including a Codex session's when Codex isn't installed. A missing Claude Code file, or a Codex thread Codex reports it doesn't have, means no response was given. The read on load runs in the startup step, before Kiln serves the page or launches anything, including when the folder is missing. A read after an adopted process exits counts as part of that process: Change stays unavailable, with that process's reason, until the read ends. A start found only in a Codex thread's history is saved as the session's `firstResponseAt` with the first passing item's own time: its `startedAtMs`, or `completedAtMs` for an `agentMessage`. When the item has no time, Kiln saves its turn's `startedAt`, and when the turn has none either, the time of the read. That time only marks that the session got a response: which session started the activity is decided by the order the sessions were created, as above, never by comparing these times.

A response given while the person has the conversation open in a terminal counts like any other, so the activity has started and Resume reopens that conversation. What it started on is the session's recorded agent, model and effort, with Claude Code's concrete model taken from its own run's `init`. A terminal session may run on another model, and that does not change it. A Change made while the person may have that conversation open stays available. Pause now's hold doesn't withdraw it, because the activity is paused (AC-PICK-03). The Change's own history read refuses it if the terminal has already answered. After a Change, the command that reopens the old conversation is offered as AC-PICK-07 says. If the person answers there anyway, the activity starts on that session's recorded choice. The row shows **Running on** with that choice from the next read, at the latest the hand-back's dispatch, and Resume reopens that conversation. Kiln launches nothing in the meantime, because the hold stands.

What a row shows follows from whether the activity has a start and whether it has finished:

| The activity | Row |
|---|---|
| No start, not finished, no session launching or running | The resolver's choice: plain before Start is pressed, **Will run on** in a run underway |
| Start unknown (a history exists but can't be read) | **Will run on** and the resolver's choice; Change and Use the default unavailable, with the reopen check's reason |
| No start, and one of its sessions is launching (its launch decision is saved and the launch hasn't ended) or its process runs | **Will run on** and that session's recorded agent, model and effort, with the **Fallback** tag when its saved decision used the fallback, and **Changed by you** and the note that Claude Code isn't installed when the decision says so; Change unavailable, with the reason |
| Has a start, not finished | **Running on** and what it started on, with **Changed by you** when the decision of the session that started it says so |
| Finished, and a session of it got a response | **Ran on** and the latest such session's recorded agent, model and effort, with the **Fallback** tag and **Changed by you** from the decision of the session that started it |
| Finished, and no session of it got a response | **No model recorded** |

When that launch ends with no response, the row returns to the resolver's choice: the next launch decides again (AC-FALLBACK-02).

A phase the person completes after its only launch failed before any response therefore shows No model recorded: no session did the work.

**A phase finished in an earlier execution.** In a continued PRD, or one started again from its base branch after Folder missing, a phase finished in an earlier execution has no facts in this one. Its row follows the table above over that phase's sessions in the retained earlier executions. Each execution's phases are matched by phase id through that execution's plan, as `GET /api/executions/:id` does. The row shows **Ran on** with the latest such session's recorded agent, model and effort when one got a response, otherwise **No model recorded**, whether or not the person finished it. A phase closed outside Kiln has no sessions and shows No model recorded. Kiln reads each retained execution once per process, on load and at each activation, and keeps the result in memory; archives never change, so nothing is saved. When an archive can't be read, the rows it would decide show **No model recorded** with the read's reason, "Historical execution is unavailable or damaged."

**A phase started but not finished in an earlier execution.** An activity belongs to one execution. When a fresh execution runs a phase again (a Start from the base branch after Folder missing, or a continuation), the phase is a new activity with no sessions: it resolves as any activity with no start (§Resolving a Choice), shows the resolver's choice and offers Change. The earlier execution's sessions stay in its archive. Their first responses never give the new activity a start, and the history reads above cover only the current execution's sessions. Its earlier work is left on the old branch, so nothing is carried on: AC-PICK-04's carry-on applies within an execution. A Start from the existing feature branch keeps the execution, so a started phase resumes on what it started on.

**Planned rows.** In a run underway, after the last row the plan shows one planned row for each audit kind the record's routing still expects (in the order Kiln allocates them: Delivery audit unless that kind is closed, then Test audit unless closed), then one for the pull request session. When both kinds are closed, only the pull request row shows. Each reads **Will run on** with the Audits choice. Delivery audit and Test audit rows offer Change, which changes this PRD's Audits choice (AC-OTHER-01). The pull request row does not. When Kiln allocates the activity, its row takes the planned row's place. A planned row has no steps, timing or details, and the phase count leaves it out. Documents found before Start shows none of the Delivery audit, Test audit or pull request rows. The heads-up can sit on a planned row.

**The planned Preflight row.** While `preflight.planned` is present, the Preflight row shows the Audits choice as an activity with no start: plain before Start and on the Continue offer's plan (Continue counts as Start for this row's form, though not for §Agents' checks), and **Will run on** in a run underway. On the Continue offer's plan it shows the choice the continuation will resolve, with the `kept` test of §Data Models applied. Every other row there is finished, and the offer panel's list of added phases is not a plan row. It offers no Change or Use the default. The Audits line in Documents found's delivery panel or the run's settings changes it (AC-OTHER-01). The heads-up can sit on it when it is next. When Kiln allocates the preflight, its activity row takes this row's place.

## Launching (AC-PICK-06, AC-PICK-07, AC-FALLBACK-02 to 04)

### The launch decision

Every launch of an activity that hasn't started runs one decision, immediately before the existing launch checks. Its first step stops the activity with the `selection` stop when the first choice has a problem known before launch (§A choice that can't be used), before any usage is read: the fallback never replaces a first choice that can't be used (AC-PICK-06), since AC-FALLBACK-02 lets only a usage reading send a launch to the fallback.

```
decide(activity):
    first = the resolver's choice;  fallback = the activity's fallback
    first can't be used, known before launch            → `selection` stop; nothing below runs
    switch off, or no fallback                          → first
    read both agents' usage for this launch
    first's usage unreadable, or every counted limit below the threshold
                                                        → first
    fallback's launch checks pass, usage readable with no counted limit at or above the threshold
                                                        → fallback, recording the limit, its percent and the threshold
    otherwise                                           → first, recording the limit, its percent, the threshold
                                                          and why the fallback wasn't used
```

A **counted limit** is every window in the account's reading except one the agent scopes to a model other than the one about to run. Claude Code scopes a weekly window by model name, and the window belongs to the model about to run when that name is one of the hyphen-separated parts of its ID. Codex scopes a bucket to the model its `normalModelSlug` names or, without one, to the model in the list read with the usage whose display name or ID equals its `limitName`, ignoring case. The bucket belongs to the model about to run when that model is the one it names. A bucket's `limitId` is an opaque code and never identifies a model. A bucket that names no model counts, including `codex`, the legacy single bucket, and a name matching no listed model. This scoping serves only this decision: Codex's refusal and release rules are unchanged.

Codex's ordinary-usage permission is part of the reading. When Codex reports ordinary usage blocked for usage, the account counts as having a limit at or above the threshold, whatever its windows read, in both the first choice's test and the fallback's, and the recorded limit is "ordinary usage blocked", with no percent. An administrative block is not a usage reading, so it never sends the first choice to the fallback (AC-FALLBACK-02), but a fallback blocked that way is not used. When Codex doesn't report permission, the windows decide. A Codex window with no percent can't be read, and only that window. The first choice's usage reads when Codex reports usage blocked or at least one counted window reads a percent. The fallback's usage reads only when it isn't blocked and every counted window reads a percent. A failed reading, or a plan account's reading with no windows or no rate limits, can't be read for either agent. A Claude Code account with no plan has no plan limits. When its reading reports no plan and no rate limits, its usage reads with no counted limit, so as the fallback it passes the usage test and is used once its billing approval and other launch checks pass. As the first choice it launches on the first choice, as before. A no-plan reading needs no email or organization to bind it, since it attributes no windows. It still fails when sign-in, plan, auth method, provider or key source change during the reading. Codex has no account without plan limits: an API-key sign-in is a readiness problem. Claude Code's readings never keep a window without a percent.

In a wait, a Codex choice the activity's one-attempt record has used up counts as blocked for usage in both tests (§A Wait Before the Start). The record matches only a reading in which Codex reports ordinary usage allowed, so the recorded limit is "one automatic attempt used", with no percent, not "ordinary usage blocked". When the record is why the fallback wasn't used, the "fallback wasn't used" reason says the same. In a wait, a Codex fallback whose reading names no stable account isn't used either, since no attempt could be saved for it (§A Wait Before the Start).

The recorded limit is one limit. A usage block or a used-up attempt comes first, with no percent. Otherwise it is the counted limit with the highest percent. On a tie, it is the one that resets latest, an unknown reset counting as latest, and then the first in the reading's order. When the fallback's own limit is why it wasn't used, the "fallback wasn't used" reason names that limit by the same rule.

**The fallback's launch checks.** The fallback is used only when every check its launch would run on its agent passes, read for this launch. The agent is ready: sign-in, version, and the Enso Method skills every session needs, which covers phases and the pull request. Its model list offers the model and effort, and on Claude Code the model can run in auto mode. Claude Code's billing approval has been given. The activity's own skill (delivery-audit, test-audit or build-preflight) resolves on that agent. On Codex, the launch-settings check passes. For a prerequisite-preparation turn, the preparation-permissions read passes. On Codex, the launch-settings check is the same reading that supplies the agent's usage, models and skills. These checks run only when a counted limit on the first choice's account reads at or above the threshold. When one fails, the launch stays on the first choice, and the reason recorded names that check. A check that fails between the decision and the launch stops the activity as §A choice that can't be used says for a choice found at launch. A fallback whose agent's model list can't be read fails the model-list check: the launch stays on the first choice, with that list's message as the reason the fallback wasn't used. It gives no heads-up and doesn't block Start; before Start it gives the fallback warning (§Agents).

**Skills.** An audit or preflight resolves its skill when it is allocated, against the agent of the resolver's choice, as today. An audit skill that doesn't resolve stops the run on the readiness check. An absent build-preflight skill means no preflight is allocated. Each launch of an activity that hasn't started resolves the skill again, against the agent the decision named, and saves it on the activity, replacing one resolved for the other agent. When that agent is the first choice's and the skill doesn't resolve, today's outcome applies: the audit stops on the readiness check, and the preflight ends as No report. A skill missing on the fallback's agent never ends a preflight as No report. It keeps the launch on the first choice.

The decision's result is saved on the session before its process starts. It is the source for the Fallback tag, the card's facts, the phase detail, the "fallback wasn't used" note and the terminal line, which prints when the activity starts on the fallback, not when it is merely launched. The row shows the "fallback wasn't used" note while the activity is current and its row shows the choice that decision kept (Will run on during the launch, then Running on). When that launch ends with no response, the note goes with the decision, and the next launch decides again. A Ran on row drops it, and the activity's phase detail keeps it, as it keeps a fallback's facts (AC-FALLBACK-03). Where the recorded limit is a usage block or a used-up attempt, the card and phase detail give its label ("ordinary usage blocked", "one automatic attempt used") in place of a percent.

Launch settings and billing for the launch run after the decision, against the agent it named, as the skill lookup does.

**The heads-up (AC-FALLBACK-04).** The heads-up goes on the activity Kiln will launch next. That is the current activity when it has no start and no session of it is launching or running: it is waiting, stopped or in Needs you, or it is next while the run is paused or before Start. Otherwise it is the first activity after it, in the page's order, that has no start. A planned row, the planned Preflight row included, counts here as an activity with no start. A started activity never carries it, and neither does one whose launch has saved its decision. Nor does one whose start is unknown. When the current activity's start is unknown, or the search for the first activity after it reaches one whose start is unknown, no row carries the heads-up: Kiln can't yet say which activity it will launch next. The read that settles the start settles the heads-up. The snapshot runs the same decision for that activity against the latest scheduled readings, without reading anything, and gives that row `model.forecast` while the result is the fallback. Its run of the decision takes the skill lists from the latest readings and leaves out Codex's launch-settings check and the preparation-permissions read, which need a launch. The latest readings list only the build-preflight skill among the activity skills, so the heads-up checks that one and not the audits' skills; an audit whose skill is missing on the fallback's agent may carry the heads-up and then launch on its first choice, as the line's "only if" allows. No other row carries it. On a waiting row the line shows only until the next reading, since a reading whose decision names the fallback ends the wait.

### A choice that can't be used

- **Known before launch** (an activity that hasn't started)**:** the resolver's choice names a model or effort the agent's list doesn't offer, a family with no single newest model, a Claude Code model the list marks as unable to run in auto mode (today's message: '<Model> can't run unattended on this account; it needs auto mode.'), Model defaults can't be read, or the agent's model list can't be read. Before Start, the row carries the message and Start is unavailable. At a launch, the activity stops with the existing `selection` stop, whose facts name the choice, where it came from (Model defaults, a change for this PRD) and where to change it. Check again resolves again. A choice on an agent whose list can't be read shows the family's name ("Opus", "GPT Sol"), or a changed phase's model as saved, with `problem` set to that agent's `agents[].modelListError`, today's message. Change offers no choices on that agent, and `POST /api/model` refuses one with that message as a 422. Check again and the agent refresh read the list again. A started activity is unaffected (§When an Activity Starts).
- **Found at launch:** the agent didn't run, or the account refused the model before it responded. Today's stop and stopped-phase page apply unchanged. The stop's facts add the choice, where it came from (including the fallback, from the saved decision) and where to change it. For a started activity the facts name what it started on and give no place to change it.

In both, no session is launched on anything else.

### An activity that hasn't started goes on in a new session

At the one place the engine dispatches a session for an activity, an activity with no start, once the read in §When an Activity Starts has settled that, is launched, never resumed, whatever asked: the person's Resume or reply, `kiln resume` or `kiln reply`, Kiln's own resume after an interruption, or the end of a wait. The launch runs the decision above, so it uses the current choice. With a reply, the new session gets the carry-on prompt carrying the reply, the last recorded message if there is one, and the phase's work; without one, the ordinary prompt for the activity.

Resume and reply are offered at such a stop under Start again's limits (a session running, Kiln busy, a billing restriction), not under the reopen check, since nothing is reopened. Their receipts settle `started`, as Start again's and Carry on's do.

### A Wait Before the Start (AC-PICK-07, AC-AGENTS-04)

An activity refused by a usage limit before any response waits as today when "Resume after a usage limit" is on. It needs no saved conversation to wait. Each reading taken after the refusal runs the launch decision:

| The decision names | The wait |
|---|---|
| The fallback | Ends now: the activity launches on the fallback, whose account the decision has just found under the threshold. The reading runs the decision without reads first; when that names the fallback, the full decision, with the launch-only checks, runs before the wait ends, so a launch ending it isn't sent back to the refused choice |
| The choice it was refused on | Watches that account under today's release rules for its agent |
| A different choice (the person changed it, or Model defaults changed) | Watches that choice's account. On Claude Code it ends once a reading shows no counted limit at 100%, or can't be read, since the refusal says nothing about another choice. A limit at 100% keeps the wait, with a reading at that limit's reset. On Codex it follows today's release rules on that choice's account, bounded by the activity's one-attempt record |

A reading whose decision finds the first choice can't be used (§A choice that can't be used, known before launch) ends the wait. The activity stops with the `selection` stop, as at a launch. A launch at the end of a wait runs the existing launch checks, so an agent that isn't ready, or a refusal at launch, stops as §A choice that can't be used says for one found at launch. With "Resume after a usage limit" off there is no wait.

A launch made at the end of a wait records the refused run it follows. For Claude Code, if that launch is refused in turn before any response, by the same limit on the same account, the activity goes to Needs you: AC-AUTO-05's rule applied across the two sessions. For Codex, the one-attempt rule of the Codex support design's §Classification and bounded release applies across them instead: a repeat refusal starts a new wait, and an unchanged reading buys no further attempt.

While the activity hasn't started, that rule's record is the activity's own. Every automatic launch on Codex that ends a wait saves its attempt there before the session's process starts. That holds whichever agent's refusal began the wait, and whether the decision named the fallback, the refused choice or a changed one. When the activity has no record yet, that launch creates it. The attempt's fingerprint is the model, effort, account and generation, with no conversation, since each launch makes a new one. The account is the one the launch's Codex reading names. A launch that ends a wait on Codex needs that reading to name a stable account under the release rule's existing test. Without one, no attempt can be saved, so no wait ends on that Codex choice: as a fallback the decision doesn't name it, and as the first choice the reading can't release it, so the wait stops at Needs you, as today's release rule does for a Codex reading it can't use. Each reading during the wait reads the record. A Codex choice whose fingerprint matches the saved attempt counts as blocked for that reading, so the decision doesn't name it as the fallback and no wait ends on it. A reading changes the record only through a different stable account, or a blocked-to-allowed change on the same account. A change to the Codex model or effort allows one attempt on the new choice. An activity's first launch ends no wait and saves no attempt. A launch on Claude Code, and a launch the person asks for (Resume, a reply, `kiln resume`, `kiln reply`), is not bounded by the record and leaves it as it is, so a later automatic Codex launch is still bounded by it. When the activity starts, on either agent, the record is removed, and a later refusal uses the started session's own record. While the record exists, the Codex wait reason the snapshot shows reads it.

## Agents (AC-AGENTS-01 to 04, AC-KEEP-01)

Kiln keeps one reader per installed agent, each holding what the single reader holds today: readiness problems, the model list, the account and usage reading. Whether an agent is installed is read when Kiln starts and at each refresh.

An agent is **needed** when the resolver names it for an activity not yet finished, or when the fallback switch is on and an unfinished activity's fallback names it. Activities Kiln hasn't allocated yet count too: every leaf phase not finished, the preflight while `preflight.planned` is present or an allocated preflight hasn't finished, and the audits and the pull request session until the pull request session finishes, all on the Audits choice. Start's reason names the activities by their plan rows: the preflight when planned, the phases, then the audit kinds and pull request session that "Planned rows" lists. Before Start both audit kinds are open, so it names the delivery audit, the test audit and the pull request session.

Needed agents are read on the existing schedule and before each launch, for readiness, account, usage and billing. An agent that isn't needed is not read for these and can block nothing.

An agent that isn't installed is needed by the same rule. Because DEF-003 substitutes only a Model defaults first choice (§Resolving a Choice step 4), a missing Claude Code is still needed by a Changed by you or kept choice, or by a Model defaults Fallback column that names it. A missing Codex is needed by any choice or fallback that names it. Each entry's `neededBy` decides Start as AC-AGENTS-01's table says.

Every installed agent's model list is read when Kiln starts and at each refresh, whether or not the agent is needed, and the snapshot carries it in `agents[].models`. `GET /api/model-defaults` and `kiln model-defaults` read the lists, and each installed agent's readiness, on demand through the same module. An agent that isn't signed in still returns a list, its own built-in one. The editor shows that list with the agent's readiness problem beside it, and saves are checked against it. The list is read again once a refresh finds the agent signed in.

- **Before Start:** an agent some activity resolves to that isn't ready makes Start unavailable, with the agent, the remedy and the activities that need it. An agent only a fallback names gives the warning and leaves Start available; at launch the decision then stays on the first choice. For this warning, an agent whose model list can't be read counts as not ready, and the warning gives that list's message as what is wrong.
- **Continue:** Continue Added Phases' offer is not Start for this check. It gates on its proposal's readiness as today, not on agents, and shows no billing summary. Once the continuation is activated, the needed agents are counted over its plan as above, each activity resolved after the `kept` test of §Data Models. Each launch checks the agent of the activity about to launch, so an added phase on an agent that isn't ready stops at its launch as §A choice that can't be used says for one found at launch, naming the agent and the remedy, and an unapproved Claude Code metered route holds that launch at Needs you (Billing Safeguards AC-RUN-02), the fresh execution having a new billing state.
- **Billing:** each needed agent's billing summary is shown. Codex's is presentation only (its ChatGPT account, plan and credits, from that agent's account reading). Only Claude Code has a billing reading and an approval. Each agent's summary at launch is saved under that agent, so each agent's billing shows its own last launch. Claude's approval stays one approval per execution, keyed to the reading's identity fingerprint as today, and is asked for only when a needed activity or fallback is on Claude Code; a missing approval counts as that agent not being ready. A change in the set of needed agents discards no reading and clears no approval, and no approval is cleared because an activity ran on the other agent. While Claude Code is not needed, its reading is not refreshed, not shown and blocks nothing; when it becomes needed, it is read again and its billing shows as pending until that reading returns. Start, approval and each launch read billing fresh, as today.
- **Account panel:** the snapshot carries each needed agent's account, marks the one the current activity runs on as in use, and, with the fallback on, marks each limit at or above the threshold.
- **By agent:** output labels, recovery commands, live-control eligibility, prerequisite-preparation checks, the audit and preflight skill lookups (§The launch decision, "Skills"), and the handoff and account facts `kiln status` reports take the agent from the activity's session, or from its current choice when it has none.

`kiln account` and the account in full status also report every other needed agent (§Command line).

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

Every write re-reads the file, applies one change and replaces it atomically. A save sets one or both sides of one row. It is refused when, with the saved sides in place, the row's first choice and fallback would be on the same agent; the reason names the agent and says to change both sides in one save. It is also refused when a given side's family or effort isn't in that agent's current model list (an omitted effort: §Command line) or its model can't run in auto mode, when that list can't be read, or when the threshold isn't a whole number from 1 to 100. A file that doesn't parse, including one whose rows, agents or threshold don't fit schema 1, or that has a newer schema version, is an error wherever a choice is resolved, with the file's path. Kiln never falls back to its shipped defaults over it. `GET /api/model-defaults` answers 409 with `{ reason, path, canRestore }`. The page shows that reason in place of the table. `kiln model-defaults` prints it and exits 4 with `state_unavailable`. Every save is refused. Restore is the one write allowed over a file that doesn't parse: it writes a new file with every row at its default and the fallback off at 95, and the page and command say the fallback is now off. Over a newer schema version, Restore is refused too, with "written by a newer Kiln; update Kiln", and `canRestore` is false.

### HTTP (same-origin, token, as today)

| Route | Contract |
|---|---|
| `GET /api/model-defaults` | The four rows with each side's agent, family, effort, current model name and whether the person set it; the switch and threshold; each installed agent's families and efforts; each agent's readiness. 409 when the file can't be read (§Model defaults file) |
| `POST /api/model-defaults` | One of `{ set: { row, first?: FamilyChoice, fallback?: FamilyChoice } }` (at least one side), `{ restore: true }`, `{ fallback: { enabled?, threshold? } }`. 200 with the GET body; 400 malformed; 422 with the refusal's reason; 409 with the GET's 409 body while the file can't be read, except a restore over a file that doesn't parse (§Model defaults file) |
| `POST /api/model` | `{ target: { phase } \| "audits", choice: ModelChoice \| "default" }`. Before Start it is applied directly. In a run underway it goes through the instruction journal, as other browser controls do. 409 for `{ phase }` when the phase has started, its start is unknown (with the reopen check's reason), a launch of it is under way, a process of its session runs, or the phase is finished, whether or not it started ("Phase <id> is finished; there is nothing to change."). `"audits"` is never refused for an activity's state: it sets the PRD's Audits entry, which reaches each activity with no start, no launch under way and no process running. One that is launching or running keeps its saved decision and takes the new choice only if it ends with no response; one whose start is unknown takes it only if the next read finds no start. 400 malformed, an empty effort included; 422 when the agent's list doesn't offer the model or effort, an omitted effort can't be filled (§Command line), the model can't run in auto mode, the agent's model list can't be read (§A choice that can't be used), or `phase` isn't a phase Kiln builds (below the table) |
| `POST /api/settings` | Loses `agentId`, `model`, `effort` and `selectionGeneration` |
| `POST /api/billing/approval`, `POST /api/billing/clear` | Lose `selectionGeneration`: the execution ID and `readingId` bind a request to its reading. Claude Code only (§Agents, Billing) |
| `POST /api/metadata/refresh` | Reads every installed agent's model list, and every needed agent's readiness, account, usage and billing; returns `settings` and `agents[]` in place of `billing` |
| `POST /api/start` | 409 with the reason while a needed-by-an-activity agent isn't ready or a choice can't be used |

`POST /api/model` answers 422 when `phase` isn't a phase with no child phases in the current plan, a split parent included, with "<id> isn't a phase Kiln builds in this plan. Phases: <leaf ids in plan order>." In a run underway the route checks the phase, the model and the effort before journaling the instruction, as `POST /api/settings` checks the loop limits, so these come back as 422 rather than as the journal's 409.

The Model defaults page is a client route of the PRD's view, `<base>/model-defaults`, so "Back" returns to the PRD it was opened from. The model lines (Models with the Model defaults link, the Audits line, the fallback line) are one component in Documents found's delivery panel, the run's settings and the Folder missing setup panel; the setup panel shows them without Change, since nothing changes until the run is set up again. Needs you, the stopped-phase page and the waiting page show no phase plan, so each carries a Models card: every row that offers Change, the stopped or waiting activity's first (mockup 5, state E), then the model lines; it is left out once the run is complete. The Model defaults page reads the file again whenever `settings.models.revision`, the file's stat, changes. On the page, each side has its own Change. Done saves every open editor in that row in one request, carrying only the sides opened, so moving a row to the other agent means opening both sides and pressing Done once. A refused save keeps the editors open with the reason beside them.

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
    problem?: string                                        a choice that can't be used, or, on a No model recorded row,
                                                            why earlier history couldn't be read
    fallback?: { used: boolean, limit: { agent, label, percent? }, threshold, first?: choice, reason?: string }
    forecast?: { choice, limit: { agent, label, percent? }, threshold }

settings.models:  { tiers: { demanding, standard, mechanical, notRated },
                    audits: { choice, changedByYou, change },
                    fallback: { enabled, threshold, warning?: { agent, problem, remedy } } }

agents[]:  { agentId, agent, installed, pending, readinessErrors?, neededBy: { activities: string[], fallbackOnly: boolean },
             models?, modelListError?, account?: (today's account view, plus inUse and overThreshold per limit),
             billing? }
           models: each { value, displayName, efforts (none for a model that takes no effort), defaultEffort?, needsAutoMode? }, for Change's editor
           one entry per installed agent, plus one per needed agent that isn't installed (installed: false, no models, account or billing,
           readinessErrors naming the install remedy: today's Codex message, and for Claude Code "Claude Code is not on PATH.
           Install Claude Code <min> or later and sign in."); models for every installed one, readinessErrors and account for a
           needed agent, billing for each needed agent: Claude Code's as today, Codex's as today's Codex view (canApprove
           and canClear false); each entry's lastLaunch is that agent's own
```

`settings.models.fallback.warning` is present while the fallback is on and the agent whose `neededBy.fallbackOnly` is true isn't ready, and is read from that agent's `agents[]` entry. It names one agent: every unfinished activity runs on one of Kiln's two agents, so at most one is needed only by a fallback.

`settings.models.tiers` gives, for each tier, the number of phases with no child phases in the current plan that carry it, closed or not, as the plan's tags show them. Documents found's delivery panel prints them under "Chosen for each phase" in that order, leaving out a tier with none ("1 demanding, 2 standard, 1 mechanical, 1 not rated."). The run's settings line shows no counts.

`settings` loses `agent`, `agentId`, `agentFixed`, `selectionGeneration`, `model`, `effort`, `effortLevels`, `efforts` and `choiceNotice`, and the top-level `models`, `account` and `billing` move into `agents[]`. The current activity's card and a stop's session facts keep their recorded agent, model and effort, and the card gains the activity's `tier` and `fallback`. While the activity has no start, `model.choice` is as §When an Activity Starts' row table says. The `current` card takes `model.choice` until its session exists and that session's recorded choice after, so the two agree while the session launches or runs; once it ends with no response, the row returns to the resolver's choice and the card's facts keep describing the session.

At a stop on an activity that hasn't started, the snapshot's reply label, fresh-session command and prompt are built for the agent of `model.choice`, and its resume command is present only while `model.choice` equals the session's recorded choice (§Design Decisions, "What a stop on a not-started activity names"); the stopped-phase facts keep the agent of the session they describe.

Start unknown adds no state: `model.state` is `will_run_on` and `change` is `{ available: false, reason }`, with the reopen check's reason.

`activities[]` carries each planned row (§When an Activity Starts, "Planned rows") with its `kind`, label and `state: "planned"`, and no `activityId`, timing or session details. Its `model` is that of an activity with no start; `phases[]` doesn't carry it.

`preflight.planned` becomes `{ before, model }`, where `model` is that of an activity with no start, without `change` or `useDefault`.

`settings.models.audits.change` isn't limited by any activity's state. A Delivery audit or Test audit row's `model.change` follows that row's own state, as a phase's does; the change it makes is the PRD's Audits entry.

### Command line

`kiln model` is a changing command: it takes `--command-id` and `--only-if-status-matches`, is listed among `kiln status`'s controls, and for `--phase` is refused with the reason when `POST /api/model` would answer 409, with the same reasons and exit 3. An id that isn't a phase with no child phases in the current plan is refused with `target_not_found` and exit 2, giving the same reason as the 422. `--audits` is never refused for an activity's state. It is announced in the controller's `features` list, like the other changing commands added after the first release, so a newer client refuses it against an older running Kiln.

Among `kiln status`'s controls, `model` is one entry. It is available in a run underway that isn't complete, whatever any activity's state, because `--audits` is never refused for one. Like `settings`, it isn't withdrawn while Kiln drives an activity, only while setup, a plan read, an instruction or billing is busy, with today's reason "Kiln is checking, dispatching or reconciling an instruction." Before Start its reason is "No run is underway. Change models on Documents found.", and once the run is complete "The run is complete; no activity is left to change." Whether a given phase can be changed is read from that activity's `model.change` in the same reply. With the controller disconnected it is listed unavailable with today's "Controller is disconnected; no executable controls."

```
kiln model <PRD-path> (--phase <id> | --audits)
                      (--agent <claude_code|codex> --model <value> [--effort <value>] | --use-default)
```

`kiln status <PRD-path>` gives each activity its `tier` and `model` as the snapshot does, so a bot can read the values it may send: each `progress` row, which lists the activities Kiln has allocated, and `plan_models`, every row of the plan the page shows, the phases Kiln hasn't allocated and the planned rows included, each with `id`, `title`, `kind`, `planned`, `tier` and `model` (its `change` and `useDefault` included).

`kiln status` keeps its top-level `agent`, `model` and `requested_model`. They describe the activity status reports in `activity`, which is the current activity, or the next one when none is current. With a session, they are that session's recorded agent, model and effort, as today. Without one, they are that activity's `model.choice` from the snapshot. When no activity is current or next, they are `null`. A status read with the controller stopped takes these values, and each activity's `tier` and `model`, from the last snapshot the controller saved, under the reply's existing stale marking. It never reads a model list. With no saved snapshot, an activity's `model` and these fields are `null`. `effective_model` is unchanged.

`kiln account`, and the account in full status, keep today's fields for the agent of the activity status reports, and `agent` names it, or is `null` when no activity is current or next. `other_agents[]` adds, for each other needed agent, `agent`, `next_attempt`, `usage`, `recovery` and `billing` in today's shapes. With the fallback on, each usage row carries `over_threshold` from the snapshot's mark, and `data.fallback` gives `{ enabled, threshold }`. Billing loses `selectionGeneration`. Today's `billing` fields and each `other_agents[].billing` read that agent's own `lastLaunch`. `--refresh` reads every needed agent, and `provider_unavailable` names each agent whose account or usage couldn't be read. When `agent` is `null`, no agent takes today's fields: `next_attempt`, `usage`, `recovery` and `billing` read unavailable, with the reason that no activity is current or next, and every needed agent is listed in `other_agents[]`. `last_attempt` and `original_attempt` describe the newest session, as today. Once every activity has finished, no agent is needed and `other_agents[]` is empty.

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

An omitted effort is filled by one rule for `kiln model`, each side of `kiln model-defaults set`, `POST /api/model` and `POST /api/model-defaults`. A model that takes no effort saves none, and an effort given for it is refused. For a model that takes effort, Kiln saves the default effort its agent reports for that model, when the model's list of efforts includes it; for a family, that is the newest version's. Otherwise the save is refused with "Choose an effort for <Model>; no supported default was reported." Claude Code reports no default, so a Claude Code choice that takes effort names its effort. An empty effort is refused as malformed. No save leaves a model that takes effort without one.

All accept `--json` and `--help` under the existing result, exit and help contracts. Each command has an entry in `prompts/kiln-command-contracts.json`, in a new group `models` whose top-level help heading is **Choose models**, printed after **Message, pause or take over**. The heading lists `model`, `model-defaults` and the three `model-defaults` subcommands, each by its full name. `kiln model` is a `change` command, available on a compatible live controller. `kiln model-defaults` is a `read` command that takes no PRD path and needs no controller, and `set`, `restore` and `fallback` take a new side effect, `computer_setting`: they change a setting on this computer, so the client asks for neither safety flag and runs them without a PRD path or a controller. `kiln model-defaults --help` lists its subcommands, as the helper groups' help does.

## Data Models

**PRD record, schema 26.** (Schema 25 is Kiln After Delivery's change, which development builds already write, so this change takes 26.) `settings` loses `agentId`, `selectionGeneration` and `agentChoices`, and gains:

```
settings.modelChoices:
  phases: { [phaseId]: ModelChoice | "default" }
  audits?: ModelChoice | "default"
  kept?:  ModelChoice                    written only by the schema 26 migration
```

Each activity's facts gain `startedSessionId?`, the session whose response started it, and `codexUsageRecovery?`: while the activity hasn't started, the one-automatic-attempt record (§A Wait Before the Start), in the same shape as a session's `codex.usageRecovery`, with a fingerprint that leaves out the conversation. A reset builds new settings, so it returns a PRD's changes to the defaults as it does its other settings.

**Session record.**

```
firstResponseAt?: ISO-8601 UTC
runs[].codex.firstResponseAt?: ISO-8601 UTC    the first item the model issued in that Codex run
launch?:  { from: "model_defaults" | "changed", claudeCodeMissing?: true,
            fallback?: { used: boolean, limit: { agentId, label, percent? }, threshold,
                         first?: ModelChoice, reason?: string } }
relaunchOf?: { sessionId, run }          the refused run a launch at the end of a wait follows
```

`limit.label` is the window's name, "ordinary usage blocked" or "one automatic attempt used"; `percent` is present only for a window. Which limit is recorded follows §The launch decision's rule for the recorded limit.

**Billing state.** `billing.lastLaunch` becomes `{ [agentId]: BillingSummary }`, written by each agent's launch. `version` stays 1, because the schema 26 record guards it.

**Migration to schema 26** runs on load, as earlier ones do, and reads the PRD's saved sessions:

1. For each session with no `firstResponseAt`, derive it once from what is already saved, by the same test: for Claude Code, the first saved event that is a model response; for Codex, the first saved item notification that passes the same test. Each activity's `startedSessionId` is as §When an Activity Starts says. An activity's sessions run one after another, so this is also the earliest. The same derivation, with the agent's own history, then runs on every load for the sessions of an unfinished activity with no start (§When an Activity Starts). Step 1 also covers the sessions each retained earlier execution lists, so those rows read a saved `firstResponseAt`.
2. Apply AC-KEEP-02's table to the saved selected agent's choice. A choice with no model (no saved entry, or Codex's empty entry left when Kiln couldn't pin the latest GPT Sol) is no choice and sets nothing: Start and every launch refuse it, so no activity ran on it. Otherwise: an activity that started sets `kept` to it; no started activity and a choice equal to Kiln's current default sets nothing; any other choice sets `kept`. Whether an activity had started is decided here from saved evidence only, by step 1's derivation. The agent's own history is read after the migration, and the migration runs once. A start found later only in an agent's history still binds that activity (§When an Activity Starts); only the PRD's other activities that haven't started may then take their choices from the tiers, and the person sees every row before it starts and can change it.
3. `billing.lastLaunch`, when present, becomes `{ [its agentId]: it }`.
4. Remove the three retired fields.

**A continuation of a PRD whose settings carry `kept`** (AC-KEEP-02, KEEP-003): when Continue Added Phases builds the new execution's settings from the finished one's, `kept` is dropped if it equals Kiln's current default, by the KEEP-001 decision's test, and kept otherwise, before any of its activities resolves. Once it is dropped, the added phases take their tiers, and the audits, preflight and pull request session the Audits row. The per-phase entries and the Audits entry carry over as they are.

**Settings saved outside the PRD record.** A continuation acceptance holds the settings it gives the new execution. An acceptance saved before schema 26 is converted when read, before anything uses it. The conversion is migration step 2 with no activity taken as started: KEEP-003's "Had none" rows apply, so `kept` is set only when the saved choice has a model and isn't Kiln's current default. Step 4 then removes the retired fields. A Folder missing start intent is not converted: every Start rebuilds settings from the PRD record and the panel, and a failed intent seeds the panel with no model, so its retired fields are ignored. Neither file changes its `formatVersion`, because an older Kiln refuses the schema 26 record before it can reach them.

An older Kiln refuses a schema 26 record, as with every earlier schema change.

## Changes to Earlier Designs

Each line is added to the earlier section, as `Superseded in part by:`, in the commit that builds the change.

- Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Overview and §Agent boundary (the agent is per activity, not per PRD), §Selection and readiness (readiness for every needed agent; no agent fixed at Start), §Models and Settings (choices resolved per activity; no first-selection GPT Sol pick), §Local API and snapshot changes, §Persisted schema 4 (PRD settings), §Resume and stopping (an activity that hasn't started is launched in a new session on its current choice, not resumed, and the `codex resume` command is offered only while its current choice is the one that session ran on), §Readings and identity (every needed agent is read on the schedule, not only the selected one), §Classification and bounded release (for an activity that hasn't started, the one automatic attempt launches a new session on its current choice instead of resuming the original conversation, and while the activity hasn't started its one-attempt record lives on the activity, with a fingerprint that leaves out the conversation, and is removed when the activity starts; a repeat refusal is before model activity only when the attempt's run has no first response, and any item the model issued counts, a tool call included, not only an agent message).
- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Starting a phase's session (each session's model and effort come from its activity's choice, not the settings), §The prompts (for an activity that hasn't started, the `claude --resume` command is offered only while its current choice is the one that session ran on), §Snapshot and §Account and Usage (settings and each phase's model; one account).
- Replaces in part: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait and §Resume (an activity that hasn't started is launched, not resumed, and its wait watches the launch decision's account).
- Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`, §Starting a Session at a Stop (Resume and reply on an activity that hasn't started launch a new session), and §Command line (a fifth help group, `models`, headed **Choose models** and printed after **Message, pause or take over**).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Scope and concurrency (`kiln model` is a new bot mutation that selects models for activities that haven't started), §Command grammar (`kiln model`, and `kiln model-defaults`, whose changing commands take a new side effect, `computer_setting`, with no PRD path, controller or safety flags; `reply` and `resume` settle `started` for an activity that hasn't started), §Status, Conversations and Handoff and §Account and Usage Facts (with no session, status's agent and requested model are the reported activity's `model.choice`; handoff facts follow the activity's agent, and `resume_command` and `resume_argv` for an activity that hasn't started are present only while its current choice is the one that session ran on; account facts cover every needed agent, the activity's in today's fields and the others in `other_agents[]`).
- Replaces in part: `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-technical-design.md`, §Context identity and invalidation and §Local Interfaces (billing per needed agent, Codex's summary presentation only; `lastLaunch` kept per agent; no invalidation by an agent switch).
- Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Provider Sessions and Development Delivery (audit sessions run on the Audits choice, with the skill looked up for the launching agent).
- Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Progress and Detail Contract (in a run underway, planned Delivery audit, Test audit and pull request rows come before allocation, and each allocated row takes the planned row's place).
- Replaces in part: `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Settings (Effort: no PRD-wide default effort).
- Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §The Setup Panel (the panel is treated as AC-KEEP-01 treats Documents found: the model lines and links replace Agent, Model and Effort, and a start from the panel keeps the PRD's per-phase changes; a saved start intent's settings never reach a record, and a failed intent seeds no model, §Data Models).
- Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Evaluate, then act, §Reply and Agent Integration and §Needs you Layout (for a phase that hasn't started, reply and Resume launch a new session on its current choice and give it the reply, instead of queueing the same conversation with its recorded model and effort, and, in §Needs you Layout, the terminal choice offers the resume command only while the phase's current choice is the one that session ran on, otherwise the fresh-session command for the current choice's agent).
- Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Display Contract (for a phase that hasn't started, the hand-back page's terminal card is **Start a fresh session in your terminal** also while its current choice isn't the one its saved conversation ran on).
- Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Terminal Ownership and Hand-back (for an activity that hasn't started, the paused page's `claude --resume` command is shown only while its current choice is the one that session ran on, otherwise the fresh-session command for its current choice's agent).
- Replaces in part: `docs/changes/kiln-pause-now/kiln-pause-now-technical-design.md`, §The Paused Page (for an activity that hasn't started, **Resume {activity}** launches a new session on its current choice and gives it any note, instead of calling the takeover resume of the same conversation, and the terminal column's released command reopens the saved conversation only while its current choice is the one that session ran on, otherwise it is the fresh-session command for its current choice's agent).
- Replaces in part: `docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-technical-design.md`, §Design Decisions (start checks for versions: an agent below its minimum is shown on Documents found when an activity will run on it or a fallback names it, not when it is selected).
- Replaces in part: `docs/changes/kiln-build-preflight/kiln-build-preflight-technical-design.md`, §The Preflight Session, §Interfaces and §Display Contract (the preflight runs on the Audits choice, not the run's agent, model and effort; skill presence before Start is read for the preflight's own agent; `preflight.planned` gains `model`, and the planned Preflight row shows the Audits choice).
- Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Data Models and Migration and §Implemented integrated-prerequisite continuation (Phase 3a) (the agent and model choices carry forward except a kept choice equal to Kiln's current default, which the fresh execution drops; the current plan's rows for phases finished in an earlier execution read each retained execution once per process, so the current execution's first read is no longer independent of how many archives it has; a continuation acceptance saved before schema 26 is converted when read, §Data Models).
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
| AC-PICK-02 | §When an Activity Starts, including "A phase finished in an earlier execution", "Planned rows" and "The planned Preflight row"; `model.state` in §Snapshot |
| AC-PICK-04 | §When an Activity Starts, including "A phase started but not finished in an earlier execution"; resolver step 1; first-response decision |
| AC-PICK-05 | `kiln model`, `kiln status` in §Command line |
| AC-PICK-06 | §A choice that can't be used |
| AC-PICK-07 | §An activity that hasn't started goes on in a new session; §A Wait Before the Start; the "What a stop on a not-started activity names" decision and the stop's commands in §Snapshot |
| AC-DEFAULT-01, AC-DEFAULT-02, AC-DEFAULT-03 | §Model defaults file; families and step 4 in §Resolving a Choice; the page route and `GET`/`POST /api/model-defaults`; `settings.models.tiers` for the delivery panel's line |
| AC-DEFAULT-04 | Resolver step 4; the DEF-003 decision |
| AC-DEFAULT-05 | `kiln model-defaults` in §Command line |
| AC-OTHER-01 | The Audits entry and row in §Resolving a Choice; `settings.models.audits` |
| AC-FALLBACK-01 | `fallback` in §Model defaults file; `settings.models.fallback` |
| AC-FALLBACK-02, AC-FALLBACK-03, AC-FALLBACK-04 | §The launch decision; `launch` on the session record; `fallback` and `forecast` in §Snapshot |
| AC-AGENTS-01 to AC-AGENTS-04 | §Agents; `agents[]` in §Snapshot; `kiln account` in §Command line; §A Wait Before the Start |
| AC-KEEP-01 | §Existing Code (switched off); the fields removed in §HTTP and §Snapshot |
| AC-KEEP-02 | Migration step 2; the KEEP-001 decision; resolver step 3; a continuation of a PRD carrying `kept`, and a continuation acceptance saved before schema 26 (§Data Models) |
| AC-GUIDE-01 | The README's sections on how Kiln works, billing and driving Kiln from a terminal, and the command-line guide, gain tiers, Model defaults, the two commands and the fallback |

## Open Questions

1. **DEF-001 and DEF-002 are still open** (GPT Astra at high for the demanding fallback, and whether only the Audits fallback gets extra high). The shipped defaults are one table of data, so either answer changes a value and nothing in this design.
2. **KEEP-003 is still open** (when a PRD set up before this change has finished and is continued, its added phases take their tiers unless the person had picked its model). The other answer removes the step that drops `kept` when a continuation is set up, and has an acceptance saved before schema 26 keep any saved choice with a model (§Data Models).
