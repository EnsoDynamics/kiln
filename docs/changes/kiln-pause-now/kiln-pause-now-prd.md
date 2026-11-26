# PRD: Kiln Pause Now

**Source:** Doug's request, 2026-11-19: pause a running build at any moment (to close the laptop on an unreliable connection, say) and resume it later, without losing the ability to pause and take the session over in a terminal.

**Follow-on to:** [Control a live Kiln session](../kiln-live-session-control/kiln-live-session-control-prd.md), which owns the takeover this PRD renames and re-presents.

**Assumptions:** [Kiln Pause Now assumptions](kiln-pause-now-assumptions.md)

**Review alongside:** [Mockup](mockups/kiln-pause-now.html)

## Summary

Give a running Kiln build two pauses, told apart by when they stop: **Pause now**, which stops after the command the session is running, and **Pause after {activity}**, which lets the phase or audit finish first. Pause now replaces **Pause & take over**. Once Kiln has stopped, a calm Paused page offers both ways on, side by side: **Resume**, which carries on in the same conversation, or the command to open that conversation in a terminal and take it over.

## Business Context

Kiln can already stop a session at a safe point and keep its conversation. It calls that **Pause & take over**, though, and lands on an amber Needs you page built around terminal instructions and completion checks. A person who only wants to stop for an hour, because they are about to close the laptop or are on a shaky hotspot, has to read it as a takeover and work out that Resume is there too. Offering a third, separate "pause and resume" button beside the takeover made the choice harder, not easier.

Whether the person will resume or take over is better decided after the pause, when they know, than before it. So there is one immediate pause, and the paused page holds both outcomes. Nothing about the safe stop changes: Kiln still finishes the running command and never interrupts it.

Two moments recur below. **The stop** is when the agent reaches the safe point and Kiln tells it to start nothing more. **The release** is the later moment, already defined by AC-TAKE-02 in Control a live Kiln session, when the session's processes have ended and its conversation is saved, so it can be resumed or opened in a terminal. Between the two, Kiln is still **pausing**.

## Acceptance Criteria

### Two pauses, told apart by when they stop

A person choosing a pause decides one thing: stop now, or let the current phase finish. What happens after an immediate pause is decided later, on the paused page.

- [ ] **AC-PAUSE-01 — The pause panel offers Now and After.** Where Kiln shows the pause choices today (the running overview and the session page, AC-LIVE-01 in Control a live Kiln session), the panel is headed **Pause** and offers two peer choices, with the actual phase number, or audit name and round, in place of {activity}. "When should Kiln pause?" and the "Take over this session" choice go away. The panel never offers a third pause, such as one that resumes: resuming or taking over is chosen on the paused page (PAUSE-001). On narrow screens Now comes before After.
  - Replaces in part: AC-LIVE-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the heading, the choice titles, wording and button labels, including its ban on a control labelled "Pause now"; the safe-checkpoint timing and what the end-of-activity pause does remain).
  - Replaces in part: AC-LIVE-01 and AC-LIVE-02 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the pause group's heading, and its narrow-screen order).
  - Replaces in part: AC-VIEW-02 and AC-VIEW-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the end-of-phase pause's button label).
  - Superseded in part by: AC-AUDIT-01 in `docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md` (an audit is named by its title and loop, never its round, in the pause panel and the paused eyebrow)

  | Choice | Words beside the button | Button |
  |---|---|---|
  | **Now** | **Stops after the command it is running**, usually within seconds. {Activity} stays open. Then either press Resume when you’re ready, or take the conversation over in your terminal. The paused page gives you the command. | **Pause now** |
  | **After {activity}** | **Lets the phase finish** (or **the audit**). Kiln commits, pushes and runs the completion checks, then waits before starting {next activity}. | **Pause after {activity}** |

- [ ] **AC-PAUSE-02 — Pause now is the existing safe takeover under a new name.** Pressing **Pause now** does exactly what Pause & take over does today (AC-TAKE-01, AC-TAKE-02's release requirement, AC-TAKE-04 and AC-TAKE-05 in Control a live Kiln session): it holds the plan, lets the running command finish, and stops before more work starts, never interrupting a command. It is offered and withheld in the same states as today, with the same reasons reworded to name Pause now; for example, it is unavailable for Codex, during the preflight and final delivery, while a message submission is pending, on an unsupported Claude Code and while disconnected. Wherever Kiln names the action today, in the browser, compatibility notices, `kiln status` and the reset explanation, it says **Pause now**; the uncertain-message recovery offers Pause now. `kiln take-over` keeps its name and behavior.
  - Replaces in part: AC-LIVE-02 and AC-MSG-05 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the action's name and the wording of its unavailable reasons; when it is offered remains).
  - Replaces in part: AC-RESET-02 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (the reset explanation names Pause now).
  - Replaces in part: AC-AGENT-03 and AC-AGENT-04 in `docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-prd.md` (the action's name in the browser, for AC-AGENT-03; the feature's name in the incompatibility report in the browser and `kiln status`, for AC-AGENT-04).
  - Replaces in part: AC-PREFLIGHT-08 in `docs/changes/kiln-build-preflight/kiln-build-preflight-prd.md` (the reason shown during the preflight names Pause now).
  - Superseded in part by: AC-MERGE-05 in `docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md` (Pause now is also withheld while a merge or push session runs, with a reason naming Pause now)

### While Kiln is pausing

Between pressing Pause now and the release, the person needs to know what Kiln is waiting for, that they can walk away, and that they can change their mind until the stop.

- [ ] **AC-PAUSE-03 — The pausing state says what it is waiting for.** From Pause now until the release, wherever Kiln shows the activity (the running overview, the session page, and a stopped page reached before the release), the header shows **Pausing {activity}** beside the phases done, and the pause panel shows the wording below. In the header, {activity} names the activity the way the running header names it at that time, so an audit keeps whatever loop or round wording its running header shows. No terminal command and no "Wait before opening Claude" warning are shown while pausing; the command appears on the paused page once it is safe to use. If `kiln run` restarts while pausing, its summary says "pausing in {activity}" in place of "needs you" and its ● line reads "{Activity} is pausing. Kiln finishes the pause on its own." A separately requested end-of-activity pause stays visible under it, with its **Cancel end-of-phase pause** (or audit) action (AC-LIVE-04).

  | Situation | Panel wording |
  |---|---|
  | A command is running | **Pausing — finishing the command it is running.** Then the command, and: "Kiln starts no more work after it. You can close the lid now: if the computer sleeps first, the pause completes when it wakes, and nothing new starts." (PAUSE-003) |
  | No command is running, the stop hasn't happened, the session hasn't ended, and Claude isn't waiting only on processes it started | **Pausing — Claude isn't running a command; Kiln stops it before its next one.** Then the same lid sentence |
  | No command or process Claude started is running, and the stop has happened or the session has ended | **Pausing — Claude has stopped; Kiln is checking nothing is still running.** Then the same lid sentence |
  | No command is running but a process Claude started still is, such as a dev server, and either the stop has happened, the session has ended, or Claude has finished its turn and is waiting only on such processes | **Pausing — waiting for a process Claude started to end:** then each such process on its own line, as {command} (process {pid}), the command alone when Kiln has no process number for it, or "process {pid}" alone when its command can't be read. Then: "Kiln won't stop it for you; if it's a server that keeps running, stop it and the pause completes." (PAUSE-010) |
  | Kiln can't establish the stop or the release | In place of whichever row above would apply, the concrete obstacle and its recovery path, as today (AC-TAKE-02, AC-TAKE-05) |
  | In addition, from 30 seconds after the last observed activity | Today's waiting line (AC-TAKE-05) below whichever row above applies, without "There is no automatic cancellation deadline." |

  - Replaces in part: AC-TAKE-02 and AC-TAKE-05, and the pausing rows of AC-LIVE-02 and AC-LIVE-04, in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the pausing state's wording, and showing it until the release on every page; the release requirement and obstacle reporting remain).
  - Replaces in part: AC-STOP-05 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (the header while an audit is pausing under Pause now).
  - Replaces in part: AC-START-09 and AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (on a restart while Pause now is pausing, the summary says "pausing in {activity}", not "needs you", and the ● line says Kiln finishes the pause on its own).

- [ ] **AC-PAUSE-04 — A pause can be cancelled until the stop.** Until the stop, **Cancel pause and keep going** withdraws the request: the hold ends without a hand-back, the session carries on in the same attempt as if Pause now had not been pressed, the panel returns to its two choices, and `kiln status` no longer reports the pause. From the stop on, Cancel is not offered; a cancel that arrives after it is refused with "Kiln had already paused. Press Resume once it’s paused to carry on." Cancel is unavailable while disconnected, with the usual reason, and is a browser control only (PAUSE-002). Cancelling never cancels a separately requested end-of-activity pause.
  - Replaces in part: AC-TAKE-01 and AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (a pending Pause now can be withdrawn, ending the hold without a hand-back).

### One paused page, two ways on

After an immediate pause, the person comes back to a page that says plainly where things stand and offers both outcomes with equal weight: let Kiln carry on, or take the conversation over themselves.

- [ ] **AC-PAUSE-05 — An immediate pause reads as Paused, not Needs you.** From the release until the activity runs again or advances, Kiln shows the activity as Paused, in the neutral style of the existing Paused state and not the amber Needs you style, as the table says. A pause for an uncertain message keeps today's terminal lines.
  - Superseded in part by: AC-AUDIT-01 in `docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md` (an audit is named by its title and loop, never its round, in the pause panel and the paused eyebrow)

  | Where | What it shows |
  |---|---|
  | Header | **Paused in {activity}**, with {activity} named as in AC-PAUSE-03's header, the phases done and "Paused {time} · {how long ago}" |
  | Phase plan | The activity marked **Paused** |
  | The activity's card | Its circle, an eyebrow, and one sentence: "Kiln stopped after {last command} finished. Nothing is running.", or "Kiln stopped before Claude's next command. Nothing is running." when none had run, or "The session ended on its own. Nothing is running." for a session from an earlier Kiln that Kiln couldn't stop, followed by the last thing the agent said. The eyebrow is "Paused partway · phase {n} of {total}" for a phase and "Paused partway · {audit name} · round {n}" for an audit |
  | `kiln run`'s terminal output | The activity's line, printed when the pause completes rather than when Claude's session exits, reads "paused · at {address}" in the normal colour rather than the amber "stopped · waiting for you" (PAUSE-009) |
  | `kiln run` after a restart | The summary line says "paused in {activity}" in place of "needs you", and the ● line reads "Paused in {activity}. Press Resume {activity} to go on." in place of "{Activity} still needs you." |
  | `kiln status` | Keeps its status values and says "Paused" where it says "Paused for terminal takeover" today (PAUSE-006) |

  - Replaces in part: AC-TAKE-03, the "Paused for terminal takeover" row of AC-LIVE-02 and the "Takeover ready" row of AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the Needs you layout and its wording; the facts shown remain).
  - Replaces in part: AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the header for a pending or completed Pause now).
  - Replaces in part: AC-WATCH-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an activity paused by Pause now is marked Paused in the phase plan, not Needs you).
  - Replaces in part: AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (after an immediate pause, how far the feature has got says "paused in {activity}", not "needs you", the ● line says to press Resume {activity}, and the activity's line reads "paused" and prints when the pause completes).
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (on reopening, an activity paused by Pause now shows as Paused rather than Needs you; it still waits for Resume).
  - Replaces in part: AC-STOP-05 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (the header while an audit is paused by Pause now).

- [ ] **AC-PAUSE-06 — Resume and the terminal sit side by side.** Below the card's sentence and the last thing the agent said (AC-PAUSE-05), the card shows two peer columns, neither hidden behind a disclosure; on narrow screens **Let Kiln carry on** comes first. The page shows no completion checks and no Check again or Mark complete: the person paused it, so nothing failed (PAUSE-004).

  | Column | Words | Controls |
  |---|---|---|
  | **Let Kiln carry on** | Picks up in the same conversation, where it stopped. Whenever you’re ready; nothing is waiting on you. | An optional **Note for Claude** box, then **Resume {activity}**, which does what **Have Kiln resume** does today, or what **Send reply & resume** does when the note has text (PAUSE-007) |
  | **Or take it over yourself** | Open the same conversation in your terminal. Kiln waits while you work. Below the command: When you’re done, exit Claude and press **Resume**. If you finished {activity} there, Kiln sees that and offers to move on instead. Changed the plan? Ask Claude to record those decisions in the requirements before you exit. No special handoff phrase is needed (PAUSE-008). | The copyable `cd <folder> && claude --resume <session-id>` command with a **Copy** button (AC-TAKE-03's command rules), then today's **Session won’t open? Start a fresh one** disclosure |

  Resume keeps every existing rule (AC-BACK-02, AC-BACK-04): it is refused while Claude is open on the conversation, saying so; when its fresh checks find the activity already complete, it offers the existing advance choice in place of resuming, keeping any unsent note, and from there the existing Check again and Mark complete rules apply; launch restrictions still apply. A separately requested end-of-activity pause shows below the columns with its cancel action. Everything else today's takeover page shows outside its hand-back cards stays: the full session output link, and the billing, development delivery and reset panels. Where today's page shows something first, it still does: uncertain messages to acknowledge (AC-MSG-05), and, under the same Paused header, the carry-on and fresh-terminal cards when the saved conversation can't be reopened (AC-CARRY-06 in Kiln Run Restart).
  - Replaces in part: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the reply card becomes the note on Resume).
  - Replaces in part: AC-NEXT-01, AC-NEXT-02 and AC-WAIVE-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (on the page an immediate pause lands on: the arrangement and labels, and no checks section, Check again or Mark complete until Resume finds the work complete; each action's behavior remains).
  - Replaces in part: AC-CASE-01, AC-CARRY-06 and AC-LOOK-01 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (the held page's header, layout and the hold's name).
  - Replaces in part: AC-BACK-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (on the page an immediate pause lands on, no completion checks show until Resume finds the work complete; the checks themselves remain).
  - Replaces in part: AC-VERIFY-02 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (on the page an immediate pause lands on, no requirement rows show until Resume finds the work complete).
  - Replaces in part: AC-REPLY-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (on the page an immediate pause lands on, the reply is an optional note on Resume {activity}, not a separate Send reply & resume; delivery order remains).
  - Replaces in part: AC-STOPCHECK-01 and AC-STOPCHECK-02 in `docs/changes/kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md` (the page an immediate pause lands on shows no saved rows and no Check again line until Resume finds the work complete).
  - Superseded in part by: AC-PICK-07 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (for an activity that hasn't started, **Resume {activity}** launches a new session on its current choice and gives it any note, and the column no longer says it picks up the same conversation; the take-over column offers the command that reopens the saved conversation only while its current choice is the one that session ran on, otherwise the fresh-session command for its current choice's agent; the rest remains).

## Out of Scope

- What the end-of-activity pause does, and when it takes effect. Only its label changes.
- Pause now for Codex sessions, the preflight or final delivery.
- New command-line commands or status values. `kiln take-over` is the command-line Pause now.
- Stopping mid-command (AC-PAUSE-02).
- Wording on other pages that refers to ending a takeover, such as the Folder missing page's "End your terminal takeover and take control back" (AC-SAFE-03 in Kiln Missing Worktree Recovery). It keeps its wording.
