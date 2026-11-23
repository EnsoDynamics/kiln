# PRD: Kiln Phase Model Tiers

**Source:** Doug's request and decisions, 2026-11-21 and 2026-11-22: pick the model for each phase from what the phase's build needs, instead of one model for the whole PRD; show the model on every phase and let the person change it; optionally start a phase on the other agent when usage is nearly out.

**Changes:** [Codex support for Kiln](../../prds/kiln-codex-support/kiln-codex-support-prd.md), which owns choosing an agent, model and effort today.

**Assumptions:** [Kiln Phase Model Tiers assumptions](kiln-phase-model-tiers-assumptions.md)

**Review alongside:** the mockups of [Documents found](mockups/kiln-phase-model-tiers-1-documents-found.html), [the running phase plan](mockups/kiln-phase-model-tiers-2-running.html), [a phase that started on the fallback](mockups/kiln-phase-model-tiers-3-started-on-the-fallback.html), [Model defaults](mockups/kiln-phase-model-tiers-4-model-defaults.html) and [other states](mockups/kiln-phase-model-tiers-5-other-states.html)

## Summary

Kiln picks the agent, model and effort for each phase from the phase document's `**Model tier:**` line, which rates the phase demanding, standard or mechanical. The phase plan shows that choice on every row, before the run and during it, and the person can change any phase that hasn't started. The models behind each tier are a setting for the whole computer, kept on a page of its own. A second setting on that page, off unless the person turns it on, starts the next phase, audit or other session of the run on the other agent when the first choice's account is nearly out of usage.

A phase that has started never changes its agent, model or effort.

## Business Context

Today a person chooses one agent, model and effort for a whole PRD. Phases differ, though. A phase that settles how refunds behave under retries deserves the strongest model available, and a phase that repeats an import already built for three more tables does not. Running everything on one model either overspends on the easy phases or underpowers the hard ones, and the strongest models have the tightest usage limits.

The Enso Method's phase split now rates each phase's build as demanding, standard or mechanical and writes the rating, with its reason, in the phase document. It names no model. Kiln supplies the model, so the rating stays true when models change and each person can map it to the accounts they have.

A long run can also use up one account. Kiln waits for the limit to reset today, which can take hours or days. A person with both Claude Code and Codex can let the next phase, audit or other session of the run start on the other agent instead.

Five terms recur below:

- An **activity** is one row of the run's plan: the preflight, a phase, a delivery audit, a test audit or the final pull request session; an activity belongs to one run, so a phase run again in a fresh run (a PRD continued with added phases, or started again from its base branch) is a new activity.
- A **tier** is the rating in a phase document's `**Model tier:**` line.
- A **model choice** is an agent, a model and an effort, such as Claude Code · Opus · medium.
- An activity **starts** when one of its sessions gets its first response from the model, the line Kiln Usage-Limit Recovery draws for a run "refused before the session gets any response" (AC-AUTO-05). A session that ends before any response, because the agent didn't run or the account refused the model or was at a limit, leaves the activity not started, whatever the agent had reported by then.
- **Model defaults** is the page of settings that apply to every PRD on the computer.

## Acceptance Criteria

### See each phase's tier in the plan

A person looking at the plan can see how each phase was rated, and can find out why without the reason crowding the page.

- [ ] **AC-TIER-01 — Kiln reads the tier from the phase document.** For each phase that has no child phases, Kiln reads the `**Model tier:**` line above the document's first `##` heading: the tier, and the reason written after it. A phase whose document has no such line, or whose line names none of the three tiers, is **Not rated** and is treated as standard everywhere below. Kiln reads the line each time it reads the plan, so a phase added or split during the run gets its own, and Kiln never writes or changes the line.

- [ ] **AC-TIER-02 — Every phase row shows its tier, with the explanation one step away.** Wherever Kiln shows the phase plan, before the run and during it, each phase with no child phases shows a tag reading **Demanding**, **Standard**, **Mechanical** or **Not rated**, closed or not. Each tag has an information control. Pointing at it, pressing it or reaching it by keyboard shows the explanation in the table; nothing of the explanation shows otherwise. Rows that aren't phases carry no tag.

  | Tag | The explanation says |
  |---|---|
  | Demanding, Mechanical | Why the phase got this tier, in the line's own words, and that it comes from the phase document's Model tier line |
  | Standard | That each phase document rates how capable a model its build needs, that standard is the usual rating, and that the model for it is set in Model defaults |
  | Not rated | That the phase document has no Model tier line, so Kiln treats the phase as standard |

### See and change the model for every phase

Nothing about the model is hidden or decided silently. Every row says what it ran on, is running on or will run on, and the person can change whatever hasn't started.

- [ ] **AC-PICK-01 — Kiln fills in each phase's model from its tier.** A phase that hasn't started and that the person hasn't changed runs on the first choice Model defaults gives its tier (AC-DEFAULT-01), or, when Claude Code isn't installed, on the choice AC-DEFAULT-04 gives. Until the phase starts, that choice follows the documents and the settings as they are now: a change to the phase's tier line or to Model defaults changes it. An agent that isn't ready for any other reason is handled by AC-AGENTS-01.
  - Replaces in part: AC-RUN-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (each phase's session runs on that phase's own model choice, not the model and effort in the PRD's settings; the rest remains).
  - Replaces in part: AC-WORK-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex runs the activities whose choice is on Codex, not every phase and the final session of a PRD that chose Codex; the rest remains).

- [ ] **AC-PICK-02 — Every row says what it ran on, runs on or will run on.** Wherever Kiln shows the plan, each activity's row shows a model choice, as the table says. The model is named as its agent reports it. The current activity's card shows the same choice and, for a phase, its tier.

  | The activity | Its row shows |
  |---|---|
  | Hasn't started, before Start is pressed | The model choice it will run on |
  | Hasn't started, in a run underway | **Will run on** and that choice |
  | Has started, and is running, waiting, paused or stopped | **Running on** and the choice it started on |
  | Was finished, and a session of it got a response from the model | **Ran on** and that session's recorded agent, model and effort; with several such sessions, the latest one's |
  | Was finished, and no session of it got a response from the model | **No model recorded**, in place of a model choice |

  In a run underway, the plan also shows a planned row for each audit still due and one for the pull request session, each until Kiln allocates that activity.
  - Replaces in part: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (in a run underway, a planned Delivery audit, Test audit and pull request row each show before Kiln allocates that activity, and the allocated activity's row takes its place, where AC-RUN-01 added the final-session row only after the required audits; the rest remains).

- [ ] **AC-PICK-03 — The person can change any phase that hasn't started.** On Documents found before Start, and in the run's plan while Kiln works, waits, is paused or is stopped, each phase that hasn't started offers **Change**, with the agent, model and effort choices Kiln offers today (AC-MODEL-01 in Codex support for Kiln). A changed phase covers that phase of that PRD only. It is marked **Changed by you**, keeps its choice whatever its tier or Model defaults later say, including across a restart, and, until it starts, offers **Use the default** to return to its tier's choice.
  - Replaces in part: AC-MODEL-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (model and effort are changed for each activity that hasn't started, not once for the PRD's next session).

- [ ] **AC-PICK-04 — A started activity keeps its agent, model and effort.** Every session of an activity that has started runs on what it started on: a resume after a usage limit, a resume from Paused or Needs you, and a new session that carries the phase on when its conversation can't be reopened (PICK-001). Neither Model defaults, the tier line nor the fallback setting changes it, and its row offers no Change. A usage limit partway means waiting and resuming the same session, as today. When a session splits its phase, the child phase it goes on building belongs to that session and shows what it ran on.
  - Replaces in part: AC-MODEL-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (a new session for an activity already started uses what the activity started on, not the latest saved choices).

- [ ] **AC-PICK-05 — A phase's model can be changed from a terminal.** In a run underway, every change AC-PICK-03 and AC-OTHER-01 allow, including a return to the default, has a command. Like the other commands that change a run, it takes a command ID and the status token and is listed among the controls `kiln status` reports. It is refused for a phase that has started, and a change to the Audits choice reaches only activities that haven't started.
  - Replaces in part: AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (more commands join the controls for a run already started, and run detail lists them).

- [ ] **AC-PICK-06 — A choice that can't be used stops the run, and nothing runs in its place.** When an activity that hasn't started can't run on its choice, or on the fallback AC-FALLBACK-02 picked, the run stops there as the table says, and Kiln runs nothing else instead (AC-MODEL-01 in Codex support for Kiln). Needs you names the choice, where it came from (Model defaults, a change for this PRD, or the fallback) and where to change it (AC-PICK-03, AC-OTHER-01, Model defaults).

  | What went wrong | What the person sees | The run goes on |
  |---|---|---|
  | The agent doesn't offer the model or effort, known before launch | Kiln doesn't launch it, and explains the choice as today (AC-MODEL-02 in Codex support for Kiln) | Once the choice is one the agent offers |
  | The agent didn't run, or the account refused the model before it responded | Today's stop; for a phase, its stopped-phase page (AC-CASE-01 in Kiln Run Restart) | When the person launches it again there (AC-PICK-07) |

  - Replaces in part: AC-MODEL-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the stop applies to each activity's own choice, including one Kiln filled in from Model defaults, and to the fallback).

  Added in refinement.

- [ ] **AC-PICK-07 — An activity that hasn't started goes on in a new session.** An activity that hasn't started has no conversation to pick up. Wherever Kiln, the person or a bot would resume or reply to one of its sessions, including when a usage-limit wait ends, Kiln launches it in a new session on its current choice (AC-FALLBACK-02) and gives that session any reply. If its choice changes during such a wait, it launches once the new choice's account has usage. Wherever Kiln, or `kiln handoff`, offers a command that opens one of an activity's sessions in a terminal, it reopens that session only while the activity's current choice is the one the session ran on; otherwise it is the command for a fresh session on its current choice's agent.
  - Replaces in part: AC-AUTO-02, AC-RESUME-02 and AC-RESUME-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (for an activity that hasn't started, the end of a wait, Resume and Resume now launch a new session on its current choice, the person's reply goes to that new session, not the same session with its history, and once its choice changes during a wait, the wait ends when the new choice's account has usage, not the signed-in account; the rest remains).
  - Replaces in part: AC-CARRY-01 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (for a phase that hasn't started, the first row's reply and resume launch a new session on its current choice; the rest remains).
  - Replaces in part: AC-ACT-02, AC-SEE-05 and AC-SEE-08 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (for an activity that hasn't started, `kiln reply` and `kiln resume` launch a new session on its current choice, and `kiln handoff` returns the command that reopens its saved conversation only while its current choice is the one that session ran on, and when `kiln handoff` returns no reopen command because the choice changed, it says so and returns the fresh-session instructions; the rest remains).
  - Replaces in part: AC-MODEL-03, AC-RECOVER-02 and AC-RECOVER-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (for an activity that hasn't started, Resume, a reply and the end of a usage wait launch a new session on its current choice, which a change or the fallback may have moved to another model or agent, not the saved conversation with its original settings, and the Codex resume command is offered only while its current choice is the one that session ran on, otherwise the fresh-session command for its current choice's agent; the rest remains).
  - Replaces in part: AC-REPLY-01, AC-TERMINAL-01 and AC-RETURN-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (for a phase that hasn't started, the reply and Resume launch a new session on its current choice and give it the reply, not the same saved conversation, and the terminal choice offers the command that reopens the saved conversation only while the phase's current choice is the one that session ran on, otherwise the fresh-session command for the current choice's agent; the rest remains).
  - Replaces in part: AC-NEXT-01 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (for a phase that hasn't started, the terminal card is **Start a fresh session in your terminal** also while its current choice isn't the one its saved conversation ran on; the rest remains).
  - Replaces in part: AC-TAKE-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (for an activity that hasn't started, the paused page's command that reopens the saved conversation is offered only while its current choice is the one that session ran on, otherwise the fresh-session command for its current choice's agent; the rest remains).
  - Replaces in part: AC-STOP-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (for an activity that hasn't started, Claude Code's copyable command that reopens its session is offered only while its current choice is the one that session ran on, otherwise the command for a fresh session on its current choice's agent; the rest remains).
  - Replaces in part: AC-PAUSE-06 in `docs/changes/kiln-pause-now/kiln-pause-now-prd.md` (for an activity that hasn't started, **Resume {activity}** launches a new session on its current choice and gives it any note, and the column no longer says it picks up the same conversation; the take-over column offers the command that reopens the saved conversation only while its current choice is the one that session ran on, otherwise the fresh-session command for its current choice's agent; the rest remains).

  Added in refinement.

### Set the models once, for every PRD

Most people never need to touch this. It sits on a page of its own, reached by a link, and holds the model behind each tier.

- [ ] **AC-DEFAULT-01 — Kiln comes with a choice for each tier.** Until the person changes them, Model defaults holds the choices in the table. Each names a model family, and Kiln uses the newest version of that family its agent offers when Kiln launches the activity (DEF-001, DEF-002).

  | Row | First choice | Fallback |
  |---|---|---|
  | Demanding | Claude Code · Fable · high | Codex · GPT Astra · high |
  | Standard, and Not rated | Claude Code · Opus · medium | Codex · GPT Sol · high |
  | Mechanical | Claude Code · Sonnet · medium | Codex · GPT Sol · high |
  | Audits (AC-OTHER-01) | Claude Code · Opus · high | Codex · GPT Sol · extra high |

- [ ] **AC-DEFAULT-02 — Model defaults is a page of its own, out of the way.** Documents found's delivery panel and the run's settings each show one line saying the models are chosen for each phase, with a **Model defaults** link; the table itself appears only on that page. The page shows the four rows with their first choice and fallback, a **Change** on each that opens the agent, model family and effort choices, and **Restore Kiln's defaults**. A row can't be saved with its first choice and fallback on the same agent. What the person sets is kept for every PRD in every repository on the computer, across restarts and upgrades.
  - Replaces in part: AC-MODEL-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Model defaults offers model families, each resolved at launch to the newest version its agent offers, rather than the agent's reported model names; the rest remains).

- [ ] **AC-DEFAULT-03 — A changed default reaches everything that hasn't started.** A change on the page applies from then on to every activity that hasn't started, in every PRD, including runs underway. It never changes an activity that has started (AC-PICK-04) or a phase the person changed (AC-PICK-03).

- [ ] **AC-DEFAULT-04 — A computer with only Codex needs no setup.** On a computer where Claude Code isn't installed and Codex is ready, a person who has never opened Model defaults can start a PRD. Each activity whose first choice is on Claude Code runs on its row's Codex choice from the Fallback column, and the plan shows that choice with a short note that Claude Code isn't installed.

- [ ] **AC-DEFAULT-05 — Model defaults can be changed from a terminal.** A command prints Model defaults, and commands set each row's first choice and fallback, restore Kiln's defaults, and turn the fallback on or off and set its threshold, with the same effect and limits as the page (CLI-001).
  - Replaces in part: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (commands that print and change Model defaults, which apply to every PRD and not to one run, join the supported commands; the rest remains).

  Added in refinement.

### Audits and the other sessions have one setting

Audits check the whole PRD, so they have no tier. They and the run's other sessions share one choice.

- [ ] **AC-OTHER-01 — Every activity that isn't a phase runs on the Audits choice.** The preflight, each delivery audit round, each test audit session and the final pull request session are each an activity of their own and run on Model defaults' **Audits** first choice (DEF-002). A person can change that choice for one PRD in Documents found's delivery panel, in the run's settings, or with **Change** on a Delivery audit or Test audit row that hasn't started. The change reaches all of this PRD's such activities that haven't started, and is marked and undone as AC-PICK-03 says.
  - Replaces in part: AC-RUN-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (audit sessions run on the Audits choice, not on one setting chosen for the execution).

### Start on the other agent when usage is nearly out

A person with both agents can keep a run moving when one account is nearly used up. It is off until they turn it on, it is decided only when an activity is about to launch, never partway through one, and Kiln always says when it happened.

- [ ] **AC-FALLBACK-01 — The fallback is one switch for the whole computer, off by default.** Model defaults has a switch, "Use the fallback when usage is nearly out", and a threshold: a whole-number percent from 1 to 100, 95 until the person changes it. Once on, it applies to every PRD on the computer, including runs underway, until the person turns it off; no PRD has a switch of its own. Documents found's delivery panel and the run's settings say whether it is on and, when it is, its threshold, and link to Model defaults.
  - Replaces in part: AC-COMPAT-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (with the fallback on, an activity of a PRD saved before agent selection can launch on Codex; such a PRD still doesn't require Codex; the rest remains).

- [ ] **AC-FALLBACK-02 — Kiln decides only as it launches an activity that hasn't started.** With the switch on, each time Kiln launches an activity that hasn't started, it first reads both agents' usage and applies the table. Each launch is decided on its own, so the next activity returns to its first choice once that account is back under the threshold. Nothing but a usage reading sends an activity to the fallback: not a refused model, a sign-in problem or an error. The fallback for any row is the one Model defaults gives its tier, or gives Audits; a row has none when that fallback is on the same agent as the row's own choice (FALL-001).

  | The first choice's account | The fallback | Kiln launches it on |
  |---|---|---|
  | Every counted limit reads below the threshold, or its usage can't be read | Any | The first choice |
  | A counted limit reads at or above the threshold | Its agent is ready and offers its model and effort, any billing approval it needs has been given, and none of its counted limits reads at or above the threshold | The fallback |
  | A counted limit reads at or above the threshold | Anything else | The first choice, and its row says why the fallback wasn't used |

  A **counted limit** is any usage window the account reports, whenever it resets, except a window the agent reports as belonging to a model other than the one about to run.

- [ ] **AC-FALLBACK-03 — An activity that started on the fallback says so.** Its row shows **Running on** and then **Ran on** with the fallback's agent, model and effort and a **Fallback** tag. While it is the current activity, its card says that it started on the fallback, which limit read what against which threshold when it began, what the first choice was, and that it finishes on the agent it started on. Its phase detail keeps those facts afterwards, and the terminal prints one line when an activity starts on the fallback.

- [ ] **AC-FALLBACK-04 — The next activity warns when it would launch on the fallback.** While AC-FALLBACK-02, applied to the latest readings, would launch the next activity on the fallback, that activity's row adds one line naming that fallback and saying it launches there only if that is still so when Kiln launches it (FALL-002).

### Both agents can take part in one PRD

One PRD's activities can now run on different agents. Kiln checks, bills and reports each agent the run can use, and everything it does differently by agent follows the activity in hand.

- [ ] **AC-AGENTS-01 — Kiln checks every agent the run can use before Start.** The existing readiness checks (AC-AGENT-03 in Codex support for Kiln) run for each agent an activity not yet finished will run on (AC-PICK-01), and, with the fallback on, for each agent a fallback names. What an agent that isn't ready does to Start depends on why it is needed. A person whose activities all run on one agent, with the fallback off, needs only that agent.

  | The agent that isn't ready | Before Start |
  |---|---|
  | An activity will run on it | Start is unavailable. The reason names the agent, what to do about it, and the activities that need it |
  | Only a fallback names it | Start stays available. Where Documents found reports the fallback, a warning names the agent, what is wrong with it, what fixes it, and that the run will wait at a usage limit as if the fallback were off (FALL-003) |
  - Replaces in part: AC-AGENT-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (readiness follows every agent the run can use, not one agent selected for the PRD).
  - Replaces in part: AC-AGENT-05 in `docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-prd.md` (an agent below its minimum matters when an activity will run on it or a fallback names it, not only when it is selected for the PRD; the rest remains).

- [ ] **AC-AGENTS-02 — Billing is shown and approved for each agent the run can use.** Documents found shows the billing summary for each agent AC-AGENTS-01 checks, and the existing approval rules (Kiln Billing Safeguards) apply to each. A missing approval counts as an agent that isn't ready, with the effect on Start that AC-AGENTS-01's table gives. The check before every launch uses the agent of the activity about to launch. During a run, each agent's billing summary shows what was recorded at that agent's own latest launch.
  - Replaces in part: AC-CODEX-05, AC-RUN-02 and AC-RUN-05 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (before Start the summary covers each agent the run can use, not one selected agent; during a run, in the account panel too, each agent's summary shows what was recorded at that agent's own latest launch, not at the current or most recent run's launch; an unapproved metered route on an agent that only a fallback names leaves Start available, with that fallback unused until approved; the rest remains).

- [ ] **AC-AGENTS-03 — The account panel shows each agent's account.** Wherever Kiln shows account and usage, it shows them for the current activity's agent as today, marked as in use, and also for any other agent AC-AGENTS-01 checks. Both are read on the existing schedule (AC-USAGE-02 in Codex support for Kiln). With the fallback on, a limit at or above the threshold is marked as above it.
  - Replaces in part: AC-USAGE-01 and AC-USAGE-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (account and usage are read and shown for every agent the run can use, not only one selected agent's; the rest remains).

- [ ] **AC-AGENTS-04 — What Kiln does by agent follows the activity.** Output labels, recovery commands and the controls offered follow the activity's agent, not one agent for the PRD, and a usage-limit wait watches the account the activity will next run on.
  - Replaces in part: AC-PREFLIGHT-05 in `docs/changes/kiln-build-preflight/kiln-build-preflight-prd.md` (the agent whose installed method is checked is the preflight's own agent, from its Audits choice, not one agent for the run; the rest remains).

### Replace the one choice for the whole PRD

The single agent, model and effort choice goes away, and runs already underway are left as they are.

- [ ] **AC-KEEP-01 — The plan replaces the PRD-wide choice.** Documents found no longer offers one agent, model and effort for the PRD (KEEP-002), and the run's settings no longer offer the next session's model and effort or say the agent is fixed for the PRD. The plan's rows and the lines in AC-DEFAULT-02, AC-OTHER-01 and AC-FALLBACK-01 take their place.
  - Replaces in part: AC-AGENT-01, AC-AGENT-02, AC-MODEL-02, AC-VIEW-01 and AC-VIEW-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the agent, model and effort are chosen for each activity; nothing fixes one agent for the PRD or pre-selects one model for it, settings name no selected agent, and recovery instructions and output follow each activity's agent).
  - Replaces in part: AC-START-06, AC-VIEW-08 and AC-WATCH-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Documents found no longer starts the PRD on one model, the latest Opus, a change during a run reaches each phase that hasn't started through its row, not every later session at once, and the run's settings no longer show the model and effort for the next session; the rest remains).
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Documents found and the run's settings drop Agent, Model and Effort for the model lines and links, and phase rows gain the tier tag and model choice, as this change's mockups draw them; the rest of the layout remains).
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Documents found drops Agent, Model and Effort for the model lines and links, and phase rows gain the tier tag and model choice, as this change's mockups draw them; the rest of the layout remains).
  - Replaces in part: AC-SETUP-01 and AC-LOOK-01 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (the Folder missing setup panel shows Documents found's model lines and links in place of Agent, Model and Effort and "Agent fixed for this PRD."; the rest remains).
  - Replaces in part: AC-EFFORT-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a new PRD no longer starts on one effort for every session; each activity's effort comes from its row; the rest remains).

- [ ] **AC-KEEP-02 — A choice saved before this change is kept, except Kiln's current default on a PRD not yet started.** A PRD saved before this change gets its rows that haven't started as the table says (KEEP-001). A kept choice is marked **Changed by you** on each row, and the person can change it or return it to the default one row at a time.

  | Before this change, the PRD | Its activities that haven't started |
  |---|---|
  | Had an activity that had started | Keep its saved agent, model and effort |
  | Had none, and its saved choice is still one Kiln fills in: Claude Code · Opus · medium, or Codex · any GPT Sol version · high | Take their choices from the tiers and Model defaults |
  | Had none, with any other saved choice | Keep it |

  When such a PRD has finished and is continued with added phases, its activities that haven't started follow the "Had none" rows (KEEP-003).

  - Replaces in part: AC-EFFORT-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a PRD whose settings were already saved keeps its effort only as the table says; the rest remains).
  - Replaces in part: AC-CONTINUE-08 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (when a PRD saved before this change is continued, its activities that haven't started take their choices from their tiers and Model defaults, keeping its earlier saved choice only when that isn't Kiln's current default; the rest remains).

### Explain it where people install Kiln

- [ ] **AC-GUIDE-01 — The public guide covers tiers, defaults and the fallback.** Kiln's installation and usage documentation says where the tier comes from, how to change a phase's model and the defaults, in the browser and from a terminal, and what the fallback does: that it is off by default, is decided only when an activity is about to launch, and spends the other agent's account.

## Out of Scope

- Changing the Enso Method. The phase split already writes the tier line; Kiln only reads it.
- Kiln rating a phase itself, or judging whether a tier is right.
- Switching agent or model partway through an activity (AC-PICK-04).
- One control that sets every phase of a PRD at once (KEEP-002). A person who wants one model throughout changes each phase, or sets it in Model defaults for every PRD.
- A fallback on the same agent, such as a lighter model on the same account.
- Limits on spending. The fallback changes which account an activity uses, not how much it may use.
