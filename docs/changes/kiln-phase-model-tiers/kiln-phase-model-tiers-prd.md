# PRD: Kiln Phase Model Tiers

**Source:** Doug's request and decisions, 2026-11-22: pick the model for each phase from what the phase's build needs, instead of one model for the whole PRD; show the model on every phase and let the person change it; optionally start a phase on the other agent when usage is nearly out.

**Changes:** [Codex support for Kiln](../../prds/kiln-codex-support/kiln-codex-support-prd.md), which owns choosing an agent, model and effort today.

**Assumptions:** [Kiln Phase Model Tiers assumptions](kiln-phase-model-tiers-assumptions.md)

**Review alongside:** the mockups of [Documents found](mockups/kiln-phase-model-tiers-1-documents-found.html), [the running phase plan](mockups/kiln-phase-model-tiers-2-running.html), [a phase that started on the fallback](mockups/kiln-phase-model-tiers-3-started-on-the-fallback.html) and [Model defaults](mockups/kiln-phase-model-tiers-4-model-defaults.html)

## Summary

Kiln picks the agent, model and effort for each phase from the phase document's `**Model tier:**` line, which rates the phase demanding, standard or mechanical. The phase plan shows that choice on every row, before the run and during it, and the person can change any phase that hasn't started. The models behind each tier are a setting for the whole computer, kept on a page of its own. A second setting on that page, off unless the person turns it on, starts a phase on the other agent when the first choice's account is nearly out of usage.

A phase that has started never changes its agent, model or effort.

## Business Context

Today a person chooses one agent, model and effort for a whole PRD. Phases differ, though. A phase that settles how refunds behave under retries deserves the strongest model available, and a phase that repeats an import already built for three more tables does not. Running everything on one model either overspends on the easy phases or underpowers the hard ones, and the strongest models have the tightest usage limits.

The Enso Method's phase split now rates each phase's build as demanding, standard or mechanical and writes the rating, with its reason, in the phase document. It names no model. Kiln supplies the model, so the rating stays true when models change and each person can map it to the accounts they have.

A long run can also use up one account. Kiln waits for the limit to reset today, which can take hours or days. A person with both Claude Code and Codex can let the next phase start on the other agent instead.

Five terms recur below:

- An **activity** is one row of the run's plan: the preflight, a phase, a delivery audit, a test audit or the final pull request session.
- A **tier** is the rating in a phase document's `**Model tier:**` line.
- A **model choice** is an agent, a model and an effort, such as Claude Code · Opus · medium.
- An activity **starts** when Kiln launches its first session.
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

- [ ] **AC-PICK-01 — Kiln fills in each phase's model from its tier.** A phase that hasn't started and that the person hasn't changed runs on the first choice Model defaults gives its tier (AC-DEFAULT-01). Until the phase starts, that choice follows the documents and the settings as they are now: a change to the phase's tier line or to Model defaults changes it.

- [ ] **AC-PICK-02 — Every row says what it ran on, runs on or will run on.** Wherever Kiln shows the plan, each activity's row shows a model choice, as the table says. The model is named as its agent reports it. The current activity's card shows the same choice and, for a phase, its tier.

  | The activity | Its row shows |
  |---|---|
  | Hasn't started, before Start is pressed | The model choice it will run on |
  | Hasn't started, in a run underway | **Will run on** and that choice |
  | Is running, waiting, paused or stopped partway | **Running on** and the choice it started on |
  | Finished in a session Kiln ran | **Ran on** and that session's recorded agent, model and effort; with several sessions, the latest one's |
  | Was finished without a session Kiln recorded | No model line |

- [ ] **AC-PICK-03 — The person can change any phase that hasn't started.** Each such phase's row offers **Change**, on Documents found before Start and in the run's plan while Kiln works, waits, is paused or is stopped. It opens the agent, model and effort choices Kiln offers today (AC-MODEL-01 in Codex support for Kiln) and a **Use the default** action. A phase the person changed is marked **Changed by you**, runs on that choice whatever its tier or Model defaults later say, and offers **use the default** to return to its tier's choice. The change covers that phase of that PRD only and survives a restart. A saved choice that can no longer be used is explained and holds that phase's start until a valid one is confirmed, as today (AC-MODEL-02 in Codex support for Kiln).
  - Replaces in part: AC-MODEL-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (model and effort are changed for each activity that hasn't started, not once for the PRD's next session).

- [ ] **AC-PICK-04 — A started activity keeps its agent, model and effort.** From the moment an activity starts, every session of it runs on the agent, model and effort it started on: a resume after a usage limit, a resume from Paused or Needs you, and a new session that carries the phase on when its conversation can't be reopened (PICK-001). No change to Model defaults, to the tier line or to the fallback setting alters it, and its row offers no Change. An activity that reaches a usage limit partway waits and resumes the same session, as today. A phase that a session splits and goes on building belongs to that session, and shows what the session ran on.
  - Replaces in part: AC-MODEL-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (a new session for an activity already started uses what the activity started on, not the latest saved choices).

### Set the models once, for every PRD

Most people never need to touch this. It sits on a page of its own, reached by a link, and holds the model behind each tier.

- [ ] **AC-DEFAULT-01 — Kiln comes with a choice for each tier.** Until the person changes them, Model defaults holds the choices in the table. Each names a model family, and Kiln uses the newest version of that family its agent offers at the moment the activity starts (DEF-001, DEF-002).

  | Row | First choice | Fallback |
  |---|---|---|
  | Demanding | Claude Code · Fable · high | Codex · GPT Astra · high |
  | Standard, and Not rated | Claude Code · Opus · medium | Codex · GPT Sol · high |
  | Mechanical | Claude Code · Sonnet · high | Codex · GPT Sol · high |
  | Audits (AC-OTHER-01) | Claude Code · Opus · medium | Codex · GPT Sol · high |

- [ ] **AC-DEFAULT-02 — Model defaults is a page of its own, out of the way.** Documents found's delivery panel and the run's settings each show one line, "Models: Chosen for each phase", with a **Model defaults** link; the table itself appears only on that page. The page shows the four rows with their first choice and fallback, a **Change** on each that opens the agent, model family and effort choices, and **Restore Kiln's defaults**. A row's fallback is always on the other agent from its first choice. What the person sets is kept for every PRD in every repository on the computer, across restarts and upgrades.

- [ ] **AC-DEFAULT-03 — A changed default reaches everything that hasn't started.** A change on the page applies from then on to every activity that hasn't started, in every PRD, including runs underway. It never changes an activity that has started (AC-PICK-04) or a phase the person changed (AC-PICK-03).

- [ ] **AC-DEFAULT-04 — A computer with only Codex needs no setup.** While the person hasn't changed Model defaults, and Claude Code isn't installed and Codex is ready, Kiln uses the Fallback column as the first choices and has no fallback. Model defaults and Documents found say so (DEF-003).

### Audits and the other sessions have one setting

Audits check the whole PRD, so they have no tier. They and the run's other sessions share one choice.

- [ ] **AC-OTHER-01 — Every activity that isn't a phase runs on the Audits choice.** The preflight, each delivery audit round, each test audit session and the final pull request session run on the **Audits** first choice from Model defaults (DEF-002). Each round or session is an activity of its own: it takes the choice as it stands when it starts, and keeps it (AC-PICK-04). A person can change the choice for one PRD, in Documents found's delivery panel, in the run's settings, or with **Change** on a Delivery audit or Test audit row that hasn't started. That changes the one choice for all of this PRD's such activities that haven't started, and is marked and undone as a changed phase is (AC-PICK-03).
  - Replaces in part: AC-RUN-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (audit sessions run on the Audits choice, not on one setting chosen for the execution).

### Start on the other agent when usage is nearly out

A person with both agents can keep a run moving when one account is nearly used up. It is off until they turn it on, it is decided only as an activity starts, and Kiln always says when it happened.

- [ ] **AC-FALLBACK-01 — The fallback is one switch for the whole computer, off by default.** Model defaults has a switch, "Use the fallback when usage is nearly out", and a threshold: a whole-number percent, 95 until the person changes it. Once on, it applies to every PRD on the computer, including runs underway, until the person turns it off; no PRD has a switch of its own. Documents found's delivery panel and the run's settings say whether it is on, with its threshold, and link to Model defaults.

- [ ] **AC-FALLBACK-02 — Kiln decides as each activity starts, and only then.** With the switch on, just before an activity starts Kiln reads both agents' usage and applies the table. Each start is decided on its own, so the next activity returns to its first choice once that account is back under the threshold. Nothing but a usage reading sends an activity to the fallback: not a refused model, a sign-in problem or an error. The fallback for any row is the one Model defaults gives its tier, or gives Audits; a row has none when that fallback is on the same agent as the row's own choice (FALL-001).

  | The first choice's account | The fallback | The activity starts on |
  |---|---|---|
  | Every counted limit reads below the threshold, or its usage can't be read | Any | The first choice |
  | A counted limit reads at or above the threshold | Its agent is ready, any billing approval it needs has been given, and none of its counted limits reads at or above the threshold | The fallback |
  | A counted limit reads at or above the threshold | Anything else | The first choice, and its row says why the fallback wasn't used |

  A **counted limit** is any usage window the account reports, whenever it resets, except a window the agent reports as belonging to a model other than the one about to run.

- [ ] **AC-FALLBACK-03 — An activity that started on the fallback says so.** Its row shows **Running on** and then **Ran on** with the fallback's agent, model and effort and a **Fallback** tag. While it is the current activity, its card says that it started on the fallback, which limit read what against which threshold when it began, what the first choice was, and that it finishes on the agent it started on. Its phase detail keeps those facts afterwards, and the terminal prints one line when an activity starts on the fallback. Rows that haven't started keep showing their first choice. While the first choice's latest reading is at or above the threshold, the next activity in line adds one line naming the fallback it would start on if that is still so (FALL-002).

### Both agents can take part in one PRD

One PRD's activities can now run on different agents. Kiln checks, bills and reports each agent the run can use, and everything it does differently by agent follows the activity in hand.

- [ ] **AC-AGENTS-01 — Kiln checks every agent the run can use before Start.** The existing readiness checks (AC-AGENT-03 in Codex support for Kiln) run for each agent that the first choice of an activity not yet finished names, and, with the fallback on, for each agent a fallback names. An agent that isn't ready makes Start unavailable; the reason names the agent, what to do about it, and the activities that need it or that the fallback needs it (FALL-003). A person whose activities all name one agent, with the fallback off, needs only that agent.
  - Replaces in part: AC-AGENT-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (readiness follows every agent the run can use, not one agent selected for the PRD).

- [ ] **AC-AGENTS-02 — Billing is shown and approved for each agent the run can use.** Documents found shows the billing summary for each agent AC-AGENTS-01 checks, and the existing approval rules apply to each (Kiln Billing Safeguards). The check before every launch uses the agent of the activity about to launch.
  - Replaces in part: AC-CODEX-05 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` (before Start the summary covers each agent the run can use, not one selected agent).

- [ ] **AC-AGENTS-03 — The account panel shows each agent's account.** Wherever Kiln shows account and usage, it shows them for the current activity's agent as today, marked as in use, and also for any other agent AC-AGENTS-01 checks. Both are read on the existing schedule (AC-USAGE-02 in Codex support for Kiln). With the fallback on, a limit at or above the threshold is marked as above it.
  - Replaces in part: AC-USAGE-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the panel can show both agents' accounts, not only one selected agent's).

- [ ] **AC-AGENTS-04 — What Kiln does by agent follows the activity.** Everything Kiln does differently for Claude Code and Codex today follows the agent the activity started on: its output labels, its recovery commands, which controls are offered, and whose account a usage-limit wait watches.

### Replace the one choice for the whole PRD

The single agent, model and effort choice goes away, and runs already underway are left as they are.

- [ ] **AC-KEEP-01 — The plan replaces the PRD-wide choice.** Documents found no longer offers one agent, model and effort for the PRD, and the run's settings no longer offer the next session's model and effort or say the agent is fixed for the PRD. The plan's rows and the lines in AC-DEFAULT-02, AC-OTHER-01 and AC-FALLBACK-01 take their place. Resuming a conversation still never moves it to the other agent.
  - Replaces in part: AC-AGENT-01, AC-AGENT-02, AC-MODEL-02 and AC-VIEW-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the agent, model and effort are chosen for each activity; nothing fixes one agent for the PRD or pre-selects one model for it).

- [ ] **AC-KEEP-02 — A run already underway keeps the choice it was started with.** A PRD started before this change keeps its saved agent, model and effort for every activity it has left, shown on each row as a choice the person made, which they can change or return to the default one row at a time. A PRD not yet started takes its rows from the tiers and Model defaults (KEEP-001).

### Explain it where people install Kiln

- [ ] **AC-GUIDE-01 — The public guide covers tiers, defaults and the fallback.** Kiln's installation and usage documentation says where the tier comes from, how to change a phase's model and the defaults, and what the fallback does: that it is off by default, is decided only as an activity starts, and spends the other agent's account.

## Out of Scope

- Changing the Enso Method. The phase split already writes the tier line; Kiln only reads it.
- Kiln rating a phase itself, or judging whether a tier is right.
- Switching agent or model partway through an activity (AC-PICK-04).
- One control that sets every phase of a PRD at once. A person who wants one model throughout sets it in Model defaults.
- New command-line commands for changing a phase's model, Model defaults or the fallback (CLI-001). `kiln run --resume` continues with the saved choices and settings.
- A fallback on the same agent, such as a lighter model on the same account.
- Limits on spending. The fallback changes which account an activity uses, not how much it may use.
