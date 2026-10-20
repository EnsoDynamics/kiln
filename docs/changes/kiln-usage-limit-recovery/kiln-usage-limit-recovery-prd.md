# PRD: Kiln usage-limit recovery

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md). Decisions awaiting validation are in [assumptions](assumptions.md); the screens are drawn in [mockups](mockups/).

## Summary

When a Kiln session stops before its phase is done, the person can press **Resume** on the Needs you screen. Kiln picks the same session back up, with its full history, and carries on through the rest of the plan as if it had never stopped. Today the only way forward is to reopen the session by hand in a terminal, finish the phase there, and come back to press Check again.

When the stop was a Claude usage limit, Needs you says so plainly: which limit ran out and when it resets, as a clock time and a countdown. It gives the two ways forward: wait for the reset, or sign in to another Claude account in a terminal (with the command to do it). Either way, Resume carries on from there.

## Business Context

A long plan running overnight or across a day is likely to hit the 5-hour usage limit at some point. In v1, that stop looks like any other: the session's last words, the failed checks, and instructions to finish the phase by hand. The person has to read Claude Code's message to work out what happened, then do the babysitting Kiln exists to remove: open a terminal, resume the session, tell it to continue, watch it finish, and press Check again.

Stopping early on purpose, at a usage threshold, was considered and rejected. It would waste the usage left before the limit, and a session that runs into the limit loses almost nothing: its transcript survives, so resuming it keeps nearly all of its context. What matters is that recovery afterwards is one button.

Kiln already notices an account switch made while it runs: it reads the signed-in account and its usage every 5 minutes (Kiln v1, AC-WATCH-09), and the account panel shows the new account. This change relies on that and adds nothing to it.

### Terms used in this PRD

- **Needs you**, the **done check**, the **pull-request session**, **interrupted** and **ended on its own** mean what they mean in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md#terms-used-in-this-prd).
- A **usage-limit stop** is a Needs you whose session ended after Claude Code reported, in its structured session output, that a usage limit refused the session's request. Claude Code's report names the limit (the 5-hour window, the weekly limit, or a per-model weekly limit) and when it resets. A session whose own words mention a limit, without that report, is an ordinary stop.

## Acceptance Criteria

### Resume a Stopped Session From the Browser

When a session stops before its phase is done, the person can tell Kiln to pick that same session back up instead of finishing the phase by hand. Kiln then carries on through the plan without further help.

- [ ] **AC-RESUME-01 — Needs you offers Resume.** The Needs you screen offers Resume whenever the stopped session ended on its own: a phase that failed the done check, or a pull-request session with no pull request open. It is not offered at a broken-plan stop, or when an interrupted session already couldn't be resumed (Kiln v1, AC-KEEP-05). Resume is offered the same way after a restart of `kiln run` (UI-001).
  - Replaces in part: AC-VIEW-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Resume joins the browser view's controls)
- [ ] **AC-RESUME-02 — Resume checks first, then picks up the same session.** Pressing Resume runs the done check (or, for the pull-request session, its pull-request check) first. If it passes, the phase is Done, finished by the person, exactly as Check again would mark it. Otherwise Kiln resumes that same session, with its full history, using whichever Claude account is signed in at that moment, and tells it the session stopped before the phase was done and to carry on with the phase. The phase shows as Implementing again, and from there Kiln continues as it does after any session: the done check, then the next phase, a pause if one is waiting, or Needs you again.
  - Replaces in part: AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln still never resumes a session that ended on its own by itself; the person can now ask it to) and AC-STOP-08 in the same PRD (Resume is a third way, after Check again and `kiln run`, for a session to start after a stop)
- [ ] **AC-RESUME-03 — The person can tell the session something first.** Beside Resume is an optional note. When the person writes one, it is sent to the session, in the person's own words, together with the instruction to carry on (UI-002). When it is empty, the session gets the instruction alone.
- [ ] **AC-RESUME-04 — A session that can't be picked up comes back to the person.** When Resume can't pick the session up (its transcript is gone, for example), the phase returns to Needs you as an interrupted session that can't be resumed does (Kiln v1, AC-KEEP-05): its last lines of output, the fresh-session prompt, and no Resume.

### Say Plainly When a Usage Limit Stopped the Session

A usage limit is the one stop with a known way forward, and Claude Code reports it in a form Kiln can read without guessing. Needs you shows that report instead of leaving the person to work it out from the session's last words.

- [ ] **AC-LIMIT-01 — A usage-limit stop says which limit and when it resets.** At a usage-limit stop, Needs you says the phase stopped at a usage limit, names the limit with the label the account panel uses ("5-hour window", "Weekly", "Weekly · Fable"), and gives its reset as a clock time and a countdown, for example "Resets at 3:40 PM, in 1h 12m". A reset on a later day carries its day ("Resets Wed 8:00 AM, in 2d 4h"). Once the reset time has passed, it says the limit reset at that time. Everything Kiln v1 shows at Needs you is still shown, the session's last message included (AC-STOP-02, AC-STOP-03).
  - Replaces in part: AC-STOP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a usage-limit stop states its cause, from Claude Code's report rather than from Kiln's reading of the session; every other stop is unchanged)
- [ ] **AC-LIMIT-02 — The person sees the two ways forward.** A usage-limit stop gives two choices before Resume: wait for the reset, then press Resume; or switch to another Claude account now, then press Resume. The switch choice shows the command to run in another terminal, `claude auth login`, with `claude auth login --email <address>` as the form that fills in another account's email, as copyable text.
- [ ] **AC-LIMIT-03 — The person sees which account Resume will use.** A usage-limit stop shows the account signed in now (email and plan) and its percent used of the limit that stopped the session, and updates both when the account changes, within Kiln v1's 5-minute refresh (AC-WATCH-09). When that limit still reads 100% on the signed-in account and its reset time hasn't passed, an amber line beside Resume says so: "This account is still at its 5-hour limit until 3:40 PM." Resume is never held by it.

## Out of Scope

- **Resuming on its own when a limit resets.** Kiln still never waits for a limit to reset (Kiln v1, UI-005). Watching the reset time and resuming automatically is a later item on the [Kiln roadmap](../../kiln-roadmap.md).
- **Pausing before a limit is reached.** Kiln v1's near-limit note and Pause after this phase stay as they are.
- **The terminal's Needs you lines.** They stay as in Kiln v1; the cause and the reset time are shown in the browser view.
- **Switching accounts from Kiln.** Signing in stays a `claude auth login` the person runs in a terminal.
