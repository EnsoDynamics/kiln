# PRD: Kiln Pause Now

**Source:** Doug's request, 2026-11-19: pause a running build at any moment (to close the laptop on an unreliable connection, say) and resume it later, without losing the ability to pause and take the session over in a terminal.

**Follow-on to:** [Control a live Kiln session](../kiln-live-session-control/kiln-live-session-control-prd.md), which owns the takeover this PRD renames and re-presents.

**Assumptions:** [Kiln Pause Now assumptions](kiln-pause-now-assumptions.md)

**Review alongside:** [Mockup](mockups/kiln-pause-now.html)

## Summary

Give a running Kiln build two pauses, told apart by when they stop: **Pause now**, which stops after the command the session is running, and **Pause after {activity}**, which lets the phase or audit finish first. Pause now replaces **Pause & take over**. Once Kiln has stopped, a calm Paused page offers both ways on, side by side: **Resume**, which carries on in the same conversation, or the command to open that conversation in a terminal and take it over.

## Business Context

Kiln can already stop a session at a safe point and keep its conversation. It calls that **Pause & take over**, though, and lands on an amber Needs you page built around terminal instructions. A person who only wants to stop for an hour, because they are about to close the laptop or are on a shaky hotspot, has to read it as a takeover and work out that Resume is there too. Offering a third, separate "pause and resume" button beside the takeover made the choice harder, not easier.

Whether the person will resume or take over is better decided after the pause, when they know, than before it. So there is one immediate pause, and the paused page holds both outcomes. Nothing about the safe stop changes: Kiln still finishes the running command and never interrupts it.

## Acceptance Criteria

### Two pauses, told apart by when they stop

A person choosing a pause decides one thing: stop now, or let the current phase finish. What happens after an immediate pause is decided later, on the paused page.

- [ ] **AC-PAUSE-01 — The pause panel offers Now and After.** Where Kiln shows the pause choices today (the running overview and the session page, AC-LIVE-01 in Control a live Kiln session), the panel is headed **Pause** and offers two peer choices, with the actual phase number, or audit name and round, in place of {activity}. "When should Kiln pause?" and the "Take over this session" choice go away. Whatever was decided after the pause is never offered as a third choice here (PAUSE-001).
  - Replaces in part: AC-LIVE-03 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the heading, the choice titles, wording and button labels, including its ban on a control labelled "Pause now"; the safe-checkpoint timing and what the end-of-activity pause does remain).
  - Replaces in part: AC-LIVE-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the pause group's heading).

  | Choice | Words beside the button | Button |
  |---|---|---|
  | **Now** | **Stops after the command it is running**, usually within seconds. {Activity} stays open. Then either press Resume when you’re ready, or take the conversation over in your terminal. The paused page gives you the command. | **Pause now** |
  | **After {activity}** | **Lets the phase finish** (or **the audit**). Kiln commits, pushes and runs the completion checks, then waits before starting {next activity}. | **Pause after {activity}** |

- [ ] **AC-PAUSE-02 — Pause now is the existing safe takeover under a new name.** Pressing **Pause now** does exactly what Pause & take over does today (AC-TAKE-01, AC-TAKE-02's release requirement, AC-TAKE-04 and AC-TAKE-05 in Control a live Kiln session): it holds the plan, lets the running command finish, and stops before more work starts, never interrupting a command. It is offered and withheld in the same states, with the same reasons, reworded to name Pause now: unavailable for Codex, during the preflight and final delivery, while a message submission is pending, and on an unsupported Claude Code. Every page that offers Pause & take over today, the uncertain-message recovery included, offers Pause now instead. `kiln take-over` and its status output are unchanged.
  - Replaces in part: AC-LIVE-02 and AC-MSG-05 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the action's name and the wording of its unavailable reasons; when it is offered remains).

### While Kiln is pausing

Between pressing Pause now and the stop, the person needs to know what Kiln is waiting for, that they can walk away, and that they can change their mind.

- [ ] **AC-PAUSE-03 — The pausing state says what it is waiting for.** The header shows **Pausing {activity}**. The pause panel says **Pausing — finishing the command it is running.**, names the command running now, and says: "Kiln starts no more work after it. You can close the lid now: if the computer sleeps first, the pause completes when it wakes, and nothing new starts." The existing line saying how long since the last observed activity stays (AC-TAKE-05). No terminal command and no "Wait before opening Claude" warning are shown while pausing; the command appears on the paused page once it is safe to use (PAUSE-003).
  - Replaces in part: AC-TAKE-02 and AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the pausing state's wording; the release requirement remains).

- [ ] **AC-PAUSE-04 — A pause can be cancelled until it lands.** While pausing, **Cancel pause and keep going** withdraws the request: the session carries on in the same attempt, as if Pause now had not been pressed, and the panel returns to its two choices. Once Kiln has stopped the session, Cancel is no longer offered; a cancel that arrives after the stop is refused with "Kiln had already paused. Press Resume to carry on." and the page shows Paused. Cancel is a browser control only (PAUSE-002). Cancelling never cancels a separately requested end-of-activity pause.
  - Replaces in part: AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (a takeover request could not be withdrawn before it landed).

### One paused page, two ways on

After an immediate pause, the person comes back to a page that says plainly where things stand and offers both outcomes with equal weight: let Kiln carry on, or take the conversation over themselves.

- [ ] **AC-PAUSE-05 — An immediate pause reads as Paused, not Needs you.** Once Kiln has released the session, the header shows **Paused in {activity}** in the neutral style of the existing Paused state, not the amber Needs you style, with the phases done and "Paused {time} · {how long ago}". The phase plan marks the activity **Paused**. The activity's card shows its circle, "Paused partway · {activity} of {total}" above its title, and one sentence: "Kiln stopped after {last command} finished. Nothing is running.", followed by the last thing the agent said.
  - Replaces in part: AC-TAKE-03 and the "Paused for terminal takeover" rows of AC-LIVE-02 and AC-LIVE-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the Needs you layout and its heading; the facts shown remain).

- [ ] **AC-PAUSE-06 — Resume and the terminal sit side by side.** Below that sentence the card shows two peer columns, neither hidden behind a disclosure:

  | Column | Words | Controls |
  |---|---|---|
  | **Let Kiln carry on** | Picks up in the same conversation, where it stopped. | **Resume {activity}**, which does what **Have Kiln resume** does today |
  | **Or take it over yourself** | Open the same conversation in your terminal. Kiln waits while you work. Below the command: When you’re done, exit Claude and come back. **Resume** hands it back to Kiln; if you finished the {phase or audit} there, check it instead. | The copyable `cd <folder> && claude --resume <session-id>` command with a **Copy** button (AC-TAKE-03's command rules), then **Check {activity} again**, which does what Check again does today |

  Resume and Check again keep every existing rule: Resume is refused while Claude is open on the conversation, offers the advance choice when fresh checks find the work already complete, and keeps launch restrictions (AC-BACK-02, AC-BACK-04); a recheck that still fails shows its results and Mark complete beneath it, as on today's hand-back page (AC-NEXT-02, AC-WAIVE-02). Where today's page shows something first, it still does: uncertain messages to acknowledge (AC-MSG-05), and the carry-on and fresh-terminal cards when the saved conversation can't be reopened (AC-CARRY-06 in Kiln Run Restart).
  - Replaces in part: AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md`, and AC-NEXT-01 and AC-NEXT-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (the arrangement and labels on the page an immediate pause lands on; each action's behavior remains).

## Out of Scope

- What the end-of-activity pause does, and when it takes effect. Only its label changes.
- Pause now for Codex sessions, the preflight or final delivery.
- New command-line commands or status values. `kiln take-over` is the command-line Pause now.
- Stopping mid-command. Pause now always lets the running command finish.
