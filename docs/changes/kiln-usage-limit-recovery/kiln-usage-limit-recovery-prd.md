# PRD: Kiln usage-limit recovery

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md). Decisions awaiting validation are in [assumptions](assumptions.md); the screens are drawn in [mockups](mockups/).

## Summary

When a Kiln session runs into a Claude usage limit, Kiln no longer stops and waits for the person. It waits for the limit itself, then picks the same session back up, with its full history, and carries on through the rest of the plan. It resumes as soon as the signed-in account has usage left: when the limit resets, or sooner if the person signs in to another Claude account in a terminal. While it waits, the browser view says which limit ran out, when it resets (as a clock time and a countdown), and how to switch accounts to go sooner. Resuming by itself is a setting, on by default.

Any other stop still comes to the person at Needs you, as in v1, but Needs you now offers **Resume**: Kiln picks the stopped session back up and carries on, instead of the person reopening it by hand in a terminal, finishing the phase there, and pressing Check again.

## Business Context

A long plan running overnight or across a day is likely to hit the 5-hour usage limit at some point. In v1, that stop looks like any other: the session's last words, the failed checks, and instructions to finish the phase by hand. Overnight, the plan then sits idle until morning, though the limit reset hours earlier. Kiln exists to remove the babysitting between phases, and a usage limit is the one stop whose way forward is known in advance.

Stopping early on purpose, at a usage threshold, was considered and rejected. It would waste the usage left before the limit, and a session that runs into the limit loses almost nothing: its transcript survives, so resuming it keeps nearly all of its context.

Kiln already notices an account switch made while it runs: it reads the signed-in account and its usage every 5 minutes (Kiln v1, AC-WATCH-09), and the account panel shows the new account. This change uses those readings to decide when to resume.

### Terms used in this PRD

- **Needs you**, the **done check**, the **pull-request session**, **interrupted** and **ended on its own** mean what they mean in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md#terms-used-in-this-prd).
- A **run** is one start of a session's Claude Code process: the first one, or one resume of it. A session resumed twice has had three runs.
- A session **hit a usage limit** when its latest run ended after Claude Code reported, in its structured session output, that a usage limit refused that run's request. A refusal on an earlier run of the same session doesn't count, and neither do the session's own words mentioning a limit.
- The **stopping limit** is the limit Claude Code's refusal names. The signed-in account **has usage left** when a usage reading Kiln took after the refusal shows none of that account's limits at 100%, other than a per-model limit (such as a weekly Fable limit) on a model the session isn't running.

## Acceptance Criteria

### Wait Out a Usage Limit, Then Carry On

When a session hits a usage limit, Kiln waits until the signed-in account has usage left, then resumes the session by itself. Nobody has to be there, and nothing is lost.

- [ ] **AC-AUTO-01 — Kiln waits instead of stopping.** When a phase's session or the pull-request session ends on its own having hit a usage limit, and its done check (or pull-request check) fails, Kiln doesn't stop at Needs you while resuming by itself is on (AC-AUTO-04). The phase and the PRD are **Waiting for usage** (AC-LIMIT-04), and no other phase starts.
  - Replaces in part: AC-STOP-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a session that hit a usage limit waits, rather than stopping at Needs you), AC-WATCH-08 in the same PRD (its "Kiln never waits for a limit to reset") and assumption UI-005 in `docs/prds/kiln-v1/assumptions.md`
- [ ] **AC-AUTO-02 — Kiln resumes as soon as the account has usage left.** Kiln reads the account and its usage when a wait starts, at the stopping limit's reset time, and every 5 minutes while it waits. At the first reading that shows the signed-in account has usage left, whichever account that is, Kiln resumes the session as Resume does (AC-RESUME-02). When Kiln can't read the usage, it resumes at the reset time instead. When the refusal gave no reset time and Kiln can't read the usage either, it goes to Needs you rather than waiting with nothing to wait for.
  - Replaces in part: AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln now resumes a session that ended on its own, when it hit a usage limit)
- [ ] **AC-AUTO-03 — The wait survives sleep and restarts, and keep-awake covers it.** Waiting counts as working for keep-awake, so a computer left on overnight stays awake through the wait. If the computer sleeps anyway, Kiln reads the usage on waking. Ctrl+C or a closed terminal during a wait ends it as it would end a session (Kiln v1, AC-KEEP-02), and `kiln run` on that feature starts the wait again, with a fresh reading.
  - Replaces in part: AC-KEEP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the computer is kept awake during a wait too) and AC-CLI-01 in the same PRD (`kiln run` on a feature that was waiting starts the wait again)
- [ ] **AC-AUTO-04 — Resuming by itself is a setting, on by default.** "Resume after a usage limit" is one of the PRD's settings, on for a new PRD (UI-003). It is shown and changed beside keep-awake wherever keep-awake is (Documents found and the settings while Kiln works or is paused), and on the waiting screen. It applies at once: switched off during a wait, the phase goes to Needs you. Switched on again later, it applies from the next usage limit; a phase already at Needs you carries on with Resume.
  - Replaces in part: AC-START-06, AC-WATCH-07 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a new setting beside keep-awake), and AC-LOOK-01 in the same PRD (Documents found, Running, Paused and Disconnected gain its row)
- [ ] **AC-AUTO-05 — Kiln stops waiting when the wait didn't free the account.** When the run Kiln starts by itself at the end of a wait (not one started with Resume now) is refused before the session gets any response, by the same limit on the same account, Kiln goes to Needs you instead of waiting again (UI-004), and Needs you says that Kiln resumed by itself at that time and was refused again. A refusal by another limit or on another account starts a new wait, and so does a resumed run that worked and later hits a limit again, so a plan can run through several resets overnight.

### Show What Kiln Is Waiting For

While Kiln waits, the person can see why, until when, and how to go sooner on another account. When a usage-limit stop does come to Needs you, the same facts are there.

- [ ] **AC-LIMIT-01 — The browser says which limit and when it resets.** The waiting screen, and a Needs you whose session hit a usage limit, say the session stopped at a usage limit and show the rows below.

  | What Claude Code's refusal gives | What the screen says |
  |---|---|
  | A limit the account panel has a label for, and its reset time | The limit by that label ("5-hour window", "Weekly", "Weekly · Fable"), and "Resets at 3:40 PM, in 1h 12m", with the day for a later day ("Resets Wed 8:00 AM, in 2d 4h"). The countdown keeps counting while the screen is open. |
  | A limit with no label Kiln knows | "A usage limit", with its reset as above |
  | No reset time | The limit as above, with no reset line |
  | A reset time that has passed | "Reset at 3:40 PM", with no countdown |

  - Replaces in part: AC-STOP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a session that hit a usage limit states its cause, from Claude Code's report rather than from Kiln's reading of the session; every other stop is unchanged)
- [ ] **AC-LIMIT-02 — The person sees how to carry on.** The waiting screen says Kiln resumes by itself once the signed-in account has usage left, and shows how to go sooner: sign in to another account in a terminal, then press Resume now, which resumes on whichever account is signed in without waiting for the next reading. A Needs you whose session hit a usage limit gives two choices instead: wait for the reset, then press Resume; or switch accounts, then press Resume. Both screens show the command to switch accounts, `claude auth login`, with `claude auth login --email <address>` as the form that fills in another account's email, as copyable text.
- [ ] **AC-LIMIT-03 — The person sees which account Kiln last read.** Both screens show the signed-in account from Kiln's latest reading (email and plan) and its percent used of the stopping limit, or the account alone when the reading has no row for that limit, and update both at each reading. When that limit reads 100% and that account's reset time for it hasn't passed, an amber line beside Resume or Resume now says so, naming the limit by its label: "This account's 5-hour window is at 100% until 3:40 PM." Neither button is ever held by it.
  - Replaces in part: AC-WATCH-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` and validated assumption UI-001 in `docs/prds/kiln-v1/assumptions.md` (the account and the stopping limit also show on these two screens, amber at 100%)
- [ ] **AC-LIMIT-04 — Waiting is a screen and a state of its own.** While Kiln waits, the browser shows only the waiting screen, as it shows only Needs you at a stop: the header's state reads **Waiting for usage**, styled as Paused is rather than amber, since nothing is needed from the person. The screen shows the facts above (AC-LIMIT-01 to 03), how the session ended (Kiln v1, AC-STOP-02), and the keep-awake and "Resume after a usage limit" settings. It doesn't offer Check again or the terminal hand-back: to finish the phase by hand, the person switches resuming by itself off, which brings Needs you. When the view loses Kiln during a wait, the Disconnected view shows the phase as Interrupted, as for any phase in progress.
  - Replaces in part: AC-WATCH-02 and AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a new state and its screen)
- [ ] **AC-LIMIT-05 — The terminal says when Kiln waits and resumes.** The terminal prints one line when a wait starts, naming the phase, the limit and its reset time, and one when Kiln resumes.
  - Replaces in part: AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (two more lines)

### Resume a Stopped Session From the Browser

When a session stops before its phase is done for any other reason, the person can tell Kiln to pick that same session back up instead of finishing the phase by hand. Kiln then carries on through the plan without further help.

- [ ] **AC-RESUME-01 — Needs you offers Resume.** The Needs you screen offers Resume whenever the stopped session ended on its own: a phase that failed the done check, or a pull-request session with no pull request open (UI-001). It is not offered where there is no session to pick up: a broken-plan stop, a session whose first run never started (Claude Code couldn't be launched), or an interrupted session that already couldn't be resumed (Kiln v1, AC-KEEP-05). Resume is offered the same way after a restart of `kiln run`.
  - Replaces in part: AC-VIEW-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Resume joins the browser view's controls) and AC-LOOK-01 in the same PRD (Needs you matches this change's mockups where they differ from v1's)
- [ ] **AC-RESUME-02 — Resume checks first, then picks up the same session.** Pressing Resume, Resume now while waiting, or Kiln resuming by itself, runs the done check (or, for the pull-request session, its pull-request check) first. If it passes, Kiln continues exactly as after a passing Check again (Kiln v1, AC-STOP-07). Otherwise Kiln resumes that same session, with its full history, using whichever Claude account is signed in at that moment, and tells it why the session stopped (at a usage limit, when it hit one; otherwise before the phase was done) and to carry on with the phase. The phase shows as Implementing again, and from there Kiln continues as it does after any session. Beside Resume, Needs you tells the person to close the session first if they opened it in a terminal. While a check for Resume or Check again is under way, neither can be pressed again.
  - Replaces in part: AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the person can ask Kiln to resume a session that ended on its own) and AC-STOP-08 in the same PRD (Resume is a third way, after Check again and `kiln run`, for a session to start after a stop)
- [ ] **AC-RESUME-03 — The person can tell the session something first.** Beside Resume on Needs you is an optional note. When the person writes one, the session gets it in the person's own words, ahead of the instruction to carry on (UI-002). When it is empty, the session gets the instruction alone. When Resume's check passes and no session is resumed, the note is discarded. Resume now, and Kiln resuming by itself, send no note.
- [ ] **AC-RESUME-04 — A session that can't be picked up comes back to the person.** When Kiln can't pick the session up (its transcript is gone, for example), whether the person pressed Resume or Resume now or Kiln resumed by itself, the phase returns to Needs you as an interrupted session that can't be resumed does (Kiln v1, AC-KEEP-05): its last lines of output, the fresh-session prompt, and no Resume.

## Out of Scope

- **Pausing before a limit is reached.** Kiln v1's near-limit note and Pause after this phase stay as they are.
- **Switching accounts from Kiln.** Signing in stays a `claude auth login` the person runs in a terminal; Kiln only notices it.
- **A setting shared by every PRD.** Kiln's settings belong to one PRD each; "Resume after a usage limit" is on for every new PRD, and is changed per PRD like keep-awake.

## Depends On

Three Claude Code behaviors the criteria rely on haven't been seen yet; the technical design proves them before anything is built on them. If one doesn't hold, it comes back as a product decision rather than a quiet change to the criteria.

- **The refusal report.** Claude Code's stream-json output carries a `rate_limit_event` whose status says whether a request was allowed or refused, which limit it concerns and when that limit resets. Every saved event so far reports a request allowed, on the 5-hour window; none is a refusal, and none names a per-model weekly limit such as Fable.
- **A reading right after a refusal shows it.** A usage reading taken just after a refusal shows the refusing limit at 100%, and every limit a refusal can name maps to a row of the reading (the saved events say `five_hour` where the reading says `session`). If it doesn't, a reading can't show that the account has usage left, and the likely decision is to wait for the reset time alone.
- **Resuming on another account.** `claude -p --resume` of a session started under one Claude account, run after `claude auth login` to another, picks the session up with its history on the new account.
