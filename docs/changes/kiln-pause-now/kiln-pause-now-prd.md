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

  | Choice | Words beside the button | Button |
  |---|---|---|
  | **Now** | **Stops after the command it is running**, usually within seconds. {Activity} stays open. Then either press Resume when you’re ready, or take the conversation over in your terminal. The paused page gives you the command. | **Pause now** |
  | **After {activity}** | **Lets the phase finish** (or **the audit**). Kiln commits, pushes and runs the completion checks, then waits before starting {next activity}. | **Pause after {activity}** |

- [ ] **AC-PAUSE-02 — Pause now is the existing safe takeover under a new name.** Pressing **Pause now** does exactly what Pause & take over does today (AC-TAKE-01, AC-TAKE-02's release requirement, AC-TAKE-04 and AC-TAKE-05 in Control a live Kiln session): it holds the plan, lets the running command finish, and stops before more work starts, never interrupting a command. It is offered and withheld in the same states as today, with the same reasons reworded to name Pause now; for example, it is unavailable for Codex, during the preflight and final delivery, while a message submission is pending, on an unsupported Claude Code and while disconnected. Wherever Kiln names the action today, in the browser, compatibility notices, `kiln status` and the reset explanation, it says **Pause now**; the uncertain-message recovery offers Pause now. `kiln take-over` keeps its name and behavior.
  - Replaces in part: AC-LIVE-02 and AC-MSG-05 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the action's name and the wording of its unavailable reasons; when it is offered remains).
  - Replaces in part: AC-RESET-02 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (the reset explanation names Pause now).
  - Replaces in part: AC-AGENT-03 and AC-AGENT-04 in `docs/changes/kiln-public-release-readiness/kiln-public-release-readiness-prd.md` (the feature's name in the browser and `kiln status`).

### While Kiln is pausing

Between pressing Pause now and the release, the person needs to know what Kiln is waiting for, that they can walk away, and that they can change their mind until the stop.

- [ ] **AC-PAUSE-03 — The pausing state says what it is waiting for.** From Pause now until the release, wherever Kiln shows the activity (the running overview, the session page, and a stopped page reached before the release), the header shows **Pausing {activity}** beside the phases done, and the pause panel shows the wording below. No terminal command and no "Wait before opening Claude" warning are shown while pausing; the command appears on the paused page once it is safe to use. A separately requested end-of-activity pause stays visible under it, with its **Cancel end-of-phase pause** (or audit) action (AC-LIVE-04).

  | Situation | Panel wording |
  |---|---|
  | A command is running | **Pausing — finishing the command it is running.** Then the command, and: "Kiln starts no more work after it. You can close the lid now: if the computer sleeps first, the pause completes when it wakes, and nothing new starts." (PAUSE-003) |
  | No command is running | **Pausing — Claude isn't running a command; Kiln stops it before its next one.** Then the same lid sentence |
  | 30 seconds or more since the last observed activity | Today's waiting line (AC-TAKE-05), without "There is no automatic cancellation deadline." |
  | Kiln can't establish the stop or the release | The concrete obstacle and its recovery path, as today (AC-TAKE-02, AC-TAKE-05) |

  - Replaces in part: AC-TAKE-02 and AC-TAKE-05, and the pausing rows of AC-LIVE-02 and AC-LIVE-04, in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the pausing state's wording, and showing it until the release on every page; the release requirement and obstacle reporting remain).

- [ ] **AC-PAUSE-04 — A pause can be cancelled until the stop.** Until the stop, **Cancel pause and keep going** withdraws the request: the hold ends without a hand-back, the session carries on in the same attempt as if Pause now had not been pressed, the panel returns to its two choices, and `kiln status` no longer reports the pause. From the stop on, Cancel is not offered; a cancel that arrives after it is refused with "Kiln had already paused. Press Resume once it’s paused to carry on." Cancel is unavailable while disconnected, with the usual reason, and is a browser control only (PAUSE-002). Cancelling never cancels a separately requested end-of-activity pause.
  - Replaces in part: AC-TAKE-01 and AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (a pending Pause now can be withdrawn, ending the hold without a hand-back).

### One paused page, two ways on

After an immediate pause, the person comes back to a page that says plainly where things stand and offers both outcomes with equal weight: let Kiln carry on, or take the conversation over themselves.

- [ ] **AC-PAUSE-05 — An immediate pause reads as Paused, not Needs you.** From the release until the activity runs again or advances, the header shows **Paused in {activity}** in the neutral style of the existing Paused state, not the amber Needs you style, with the phases done and "Paused {time} · {how long ago}", and the terminal summary line says "paused in {activity}" in place of "needs you". The phase plan marks the activity **Paused**. The activity's card shows its circle, an eyebrow, and one sentence: "Kiln stopped after {last command} finished. Nothing is running.", or "Kiln stopped before Claude's next command. Nothing is running." when none had run, followed by the last thing the agent said. The eyebrow is "Paused partway · phase {n} of {total}" for a phase and "Paused partway · {audit name} · round {n}" for an audit. `kiln status` keeps its status values and says "Paused" where it says "Paused for terminal takeover" today (PAUSE-006).
  - Replaces in part: AC-TAKE-03, the "Paused for terminal takeover" row of AC-LIVE-02 and the "Takeover ready" row of AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the Needs you layout and its wording; the facts shown remain).
  - Replaces in part: AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the header and plan states for a pending or completed Pause now).

- [ ] **AC-PAUSE-06 — Resume and the terminal sit side by side.** Below that sentence the card shows two peer columns, neither hidden behind a disclosure; on narrow screens **Let Kiln carry on** comes first. The page shows no completion checks and no Check again or Mark complete: the person paused it, so nothing failed (PAUSE-004).

  | Column | Words | Controls |
  |---|---|---|
  | **Let Kiln carry on** | Picks up in the same conversation, where it stopped. Whenever you’re ready; nothing is waiting on you. | An optional **Note for Claude** box, then **Resume {activity}**, which does what **Have Kiln resume** does today, or what **Send reply & resume** does when the note has text (PAUSE-007) |
  | **Or take it over yourself** | Open the same conversation in your terminal. Kiln waits while you work. Below the command: When you’re done, exit Claude and press **Resume**. If you finished {activity} there, Kiln sees that and offers to move on instead. | The copyable `cd <folder> && claude --resume <session-id>` command with a **Copy** button (AC-TAKE-03's command rules), then today's **Session won’t open? Start a fresh one** disclosure |

  Resume keeps every existing rule (AC-BACK-02, AC-BACK-04): it is refused while Claude is open on the conversation, saying so; when its fresh checks find the activity already complete, it offers the existing advance choice in place of resuming, keeping any unsent note, and from there the existing Check again and Mark complete rules apply; launch restrictions still apply. A separately requested end-of-activity pause shows below the columns with its cancel action. Everything else today's takeover page shows outside its hand-back cards stays: the full session output link, and the billing, development delivery and reset panels. Where today's page shows something first, it still does: uncertain messages to acknowledge (AC-MSG-05), and, under the same Paused header, the carry-on and fresh-terminal cards when the saved conversation can't be reopened (AC-CARRY-06 in Kiln Run Restart).
  - Replaces in part: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the reply card becomes the note on Resume).
  - Replaces in part: AC-NEXT-01, AC-NEXT-02 and AC-WAIVE-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (on the page an immediate pause lands on: the arrangement and labels, and no checks section, Check again or Mark complete until Resume finds the work complete; each action's behavior remains).
  - Replaces in part: AC-CASE-01, AC-CARRY-06 and AC-LOOK-01 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (the held page's header, layout and the hold's name).

## Out of Scope

- What the end-of-activity pause does, and when it takes effect. Only its label changes.
- Pause now for Codex sessions, the preflight or final delivery.
- New command-line commands or status values. `kiln take-over` is the command-line Pause now.
- Stopping mid-command. Pause now always lets the running command finish.
- Wording on other pages that refers to ending a takeover, such as the Folder missing page's "End your terminal takeover and take control back" (AC-SAFE-03 in Kiln Missing Worktree Recovery). It keeps its wording.
