# Technical Design: Kiln usage-limit recovery

**PRD:** [Kiln usage-limit recovery](kiln-usage-limit-recovery-prd.md) · **Assumptions:** [assumptions.md](assumptions.md) · **Screens:** [mockups](mockups/), the design of record for the three screens drawn · **Changes:** [Kiln v1 technical design](../../prds/kiln-v1/technical-design.md) and [Kiln multi-repo delivery technical design](../kiln-multi-repo-delivery/technical-design.md)

## Overview

When a session's latest run ends refused by a Claude usage limit and its check fails, Kiln records a **wait** on the phase instead of a stop. While the wait lasts, Kiln takes usage readings (at once, at the limit's reset time, every 5 minutes and on waking) and resumes the same session at the first reading that shows the signed-in account has usage left. A new engine command, **resume**, does the same on the person's word: Resume on Needs you and Resume now on the waiting screen. A per-PRD setting turns the waiting off.

The key decisions:

- **A usage limit is recognized only from Claude Code's `rate_limit_event`** with `status: "rejected"` among the latest run's saved events, never from the session's words.
- **The wait lives in Kiln's record on its phase**, beside v1's stop, so it outlasts Ctrl+C, a restart and a sleep, and `kiln run` picks it back up.
- **Every resume, automatic or pressed, is v1's resume** (same session ID, `initModel`, effort, flags) with a new prompt, after the same check v1 runs before resuming.
- **This design is built after Kiln multi-repo delivery** and on top of it: its four-check done check, its record schema 2 and its seam with this change ([Seam With Multi-Repo Delivery](#seam-with-multi-repo-delivery)).

## Existing Code

**Posture: Preserve** (the default; nobody named one). Kiln v1 runs from a local install and PRDs may be underway on it; multi-repo delivery is being built on the same posture.

- **Reused as is:** the session runner and its resume path, sleep detection, the 5-minute account and usage refresh, keep-awake's platform holds, the done and pull-request checks, the HTTP API's security checks.
- **Reused and extended:** the usage parser and its labels (each row keeps its `kind` and whether its name came from `scope.model` or `scope.surface`, and a reading carries the time its call started), the auth-status parser (keeps `orgId`), the engine loop and the reconcile at `kiln run`, the session record's runs (a new `cause` and the refusal), the PRD record (the wait, the setting, schema 3), the snapshot, the prompts (two new templates), the view's Needs you screens.
- **Behavior to keep that the code alone wouldn't say:** a session that ended on its own for any reason other than a usage limit is still never resumed without the person (v1 AC-STOP-01); with the setting off, a usage-limit stop is v1's Needs you plus the limit facts and Resume.

## Claude Code Behaviors This Design Relies On

The PRD's Depends On names three. What is known, and how each is proved before the engine work is built on it ([Testing Approach](#testing-approach)):

- **The refusal report.** The Agent SDK 0.3.302 bundled with Kiln types `rate_limit_event.rate_limit_info` as `status: allowed | allowed_warning | rejected`, `resetsAt?` (Unix seconds), and `rateLimitType?: five_hour | seven_day | seven_day_opus | seven_day_sonnet | seven_day_overage_included | overage`. The SDK also marks the synthetic assistant message Claude Code writes for a refused request with `error: "rate_limit"`. Every saved event so far is `allowed` on `five_hour`; none is a refusal.
- **A reading right after a refusal shows it.** `/usage` reports `session` (5-hour), `weekly_all` and `weekly_scoped` rows ([Account and Usage](../../prds/kiln-v1/technical-design.md#account-and-usage)); the refusal's `rateLimitType` names the same windows differently. Not yet seen: that a reading taken just after a refusal shows that row at 100%.
- **Resuming on another account.** A session's transcript is a local file under the Claude Code configuration directory; nothing seen ties it to the account that wrote it. Not yet seen: `claude -p --resume` of a session started on one account, run while signed in to another.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| What counts as hitting a usage limit | The latest run's last `rate_limit_event` has `status: "rejected"`, and no model response (v1's definition: a non-`<synthetic>` assistant event) arrived after it in that run | AC-STOP-04 allows only Claude Code's own report; scoping to the latest run and to "nothing after it" is the PRD's run rule, and stops a refusal the session got past from counting |
| Limit to reading row | `five_hour` → `session`; `seven_day` → `weekly_all`; `seven_day_opus` / `seven_day_sonnet` → the `weekly_scoped` row whose model name is Opus / Sonnet; any other or missing type → no row | The PRD's labels come from the reading's rows (AC-LIMIT-01), and "has usage left" is judged on them; a type with no row can only be waited out by its reset time |
| Has usage left | A reading whose call started after the refusal arrived, signed in and with its limits read, in which no row is at 100% except a model-scoped `weekly_scoped` row for another model: one whose lowercased name is not a hyphen-separated token of the session's `initModel` (`fable` against `claude-opus-5-5`). A surface-scoped row at 100% always blocks. A reading with no row for the stopping limit counts as usage left only when its account differs from `refusedAccount`: that account has no such limit | The PRD's definition, made checkable: "after" uses Kiln's clock on both sides, as v1's sleep rule does, so a reading can't predate the refusal. AC-AUTO-02 resumes on "whichever account" has usage left, and AC-LIMIT-03 expects a reading with no row for the limit. On the refused account a missing row shows nothing (today's `/usage` lists no Opus or Sonnet row), and resuming on it would be refused again and stop at Needs you overnight |
| When readings don't decide | Readings can't decide when the refusal's type maps to no row (missing, `overage`, `seven_day_overage_included`, any other), since no reading can show that limit freed, or when a reading of `refusedAccount` has no row for the stopping limit; a failed reading (`error`, `limitsError`, a failed call) decides nothing either. The wait then ends at `resetsAt`. With no `resetsAt`: a type that maps to no row is Needs you at once, with no wait recorded; a type that maps to a row records the wait and goes to Needs you only when the first reading after the refusal fails or can't decide. Once one has succeeded, a later failed reading is ignored and Kiln waits for the next | AC-AUTO-02's fallback and its "nothing to wait for" case; a reader that fails once after a good reading has not left Kiln with nothing to wait for |
| Reading at the reset time | At `resetsAt` plus 60 seconds | The server's window may roll over a little after the stated time; a reading that still shows 100% leaves the 5-minute readings to try again |
| Account a refusal belongs to | The email and `orgId` (from `claude auth status --json`) of the first reading taken after the refusal (`wait.refusedAccount`); a resumed run records those of the reading [resume](#resume) takes just before it (`run.account`). Two accounts are the same when both match. When either is unknown (every reading failed), the accounts count as the same | Claude Code doesn't report the account in the session stream; AC-AUTO-05 needs "the same account" only between those two moments, and both come from readings Kiln took. One email can hold a personal plan and a Team seat, so the email alone can't tell them apart. Counting unknown as the same stops the overnight resume-and-wait loop UI-004 exists to prevent, at the cost of a Needs you the person can clear with Resume |
| The setting's default for a PRD already underway | On, as for a new PRD; the migration writes it | UI-003 makes on the default; a PRD underway gets the same behavior as one started after the upgrade, and its settings show it |
| Record version | Schema 3, one above multi-repo delivery's 2; migrated on read | v1's rule that an older Kiln refuses a newer record keeps an older Kiln from treating a wait as a session whose verdict was never recorded |

## Recognizing a Usage Limit

On every run's end, before the verdict, Kiln reads that run's saved events (those that arrived from its `startedAt` to its end, as [The prompts](../../prds/kiln-v1/technical-design.md#the-prompts) counts them) and, when the rule above holds, writes `limitRefusal` on the run in the same write as its end. A run cut off by an interruption is never a usage limit: `interruptedBy` wins, as it does for sleep. A session refused on its very first request is treated like any refused run.

`limitRefusal.label` is written with the run's end from the type, and replaced once by the mapped row's label ("5-hour window", "Weekly", "Weekly · Opus") from the first reading after the refusal that has that row. From the type: `five_hour` "5-hour window", `seven_day` "Weekly", the scoped types "Weekly · Opus" or "Weekly · Sonnet", anything else "A usage limit" (AC-LIMIT-01's table).

## The Wait

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands (the engine loop's verdict and the reconcile), §Interruptions, sleep and resume ("Kiln never resumes one that ended on its own"), §Account and Usage ("Kiln never waits for a reset")

**Starting it.** After a session ends on its own, the engine runs the check as v1 does (the done check, or the pull-request check). A pass is Done. A fail with `limitRefusal` on the latest run, the setting on, and nothing in [Seam With Multi-Repo Delivery](#seam-with-multi-repo-delivery) ruling it out, is Needs you with no wait recorded when the refusal has no `resetsAt` and its type maps to no row; otherwise it records `phases.<id>.wait` with the check's results, prints the terminal line, and only then asks for a reading. Any other fail is Needs you as v1, carrying `stop.limit` when the run was refused (AC-LIMIT-01 to 03). Recording any stop that carries `limit` (the setting off, a refused automatic resume, the setting switched off mid-wait) also asks for a reading at once, so the account card shows one taken after the refusal. No other phase starts during a wait, and a pending pause stays pending through it as through Needs you (v1 AC-VIEW-03); the waiting screen shows no pause control.

**While it lasts.** Kiln evaluates every new reading that started after the refusal arrived:

```
(the wait is already recorded when its first reading is asked for)
on a reading after the refusal:
    wait.refusedAccount ← its email and orgId, if not yet set
    it has usage left → resume
    no resetsAt, and this is the first reading after the refusal, and it failed or can't decide → Needs you
    otherwise (a later failed reading included) → wait for the next reading
on resetsAt + 60 s:          take a reading; when it fails or can't decide → resume
on a detected sleep:         take a reading (and, past resetsAt with it failing or not deciding, resume)
```

Resuming at the end of a wait is the [resume](#resume) command with `cause: limit_resume`, run by the engine; the wait is cleared when the resumed run starts. Readings are v1's account and usage refresh, so a reading asked for while one runs joins it and the account panel and the wait always see the same reading; a reading carries the time its call started, and when the one joined started before the refusal, Kiln asks again once it returns. A reset more than 24 days out (a monthly `overage` window) is beyond one Node timer, which would fire at once, so its timer is re-armed until the reset.

**When the resume is refused again (AC-AUTO-05, UI-004).** When a run with `cause: limit_resume` ends with `limitRefusal`, no model response arrived in that run at all, its `rateLimitType` equals the wait's, and its `account` is the wait's `refusedAccount` (an unknown one counts as the same), the phase goes to Needs you with `stop.limit.refusedAgainAt` set to the run's start; the screen's line reads "Kiln resumed by itself at <time> and the limit refused it again." Any other refused run, a resume the person pressed included, starts a new wait.

**The setting during a wait (AC-AUTO-04).** Switching it off converts the wait into a stop: `kind` `done_check` or `pull_request_check`, the wait's checks and `checkedAt`, `at` now, `limit` from the refusal. Switched off while the end of a wait's check is running, the check finishes and a failure is that stop, with nothing resumed. Switching it on at Needs you changes the setting only.

**Restarts and sleep (AC-AUTO-03).** Ctrl+C or a closed terminal during a wait stops nothing, since no process runs; the wait stays in the record. `kiln run` on a feature with a wait reconciles like a stop: it runs the phase's check, which passes as Done finished by the person, and otherwise starts the wait again (readings from now on; the refusal, label and `refusedAccount` kept), or goes to Needs you when the setting is now off. The reconcile's "ended on its own, verdict never recorded" branch gains the same rule, so a Kiln killed between a refused run's end and its verdict waits on restart. Sleep detection keeps running during a wait, and each detected sleep asks for a reading.

**Keep-awake (AC-AUTO-03).** The hold is taken while a session's process runs or a wait is recorded, keep-awake on, and released otherwise, as v1 releases it.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Keep-awake

## Resume

**The command.** `resume({ note? })`, reached by `POST /api/resume`, is allowed at a Needs you whose `resumeOffered` is true and during a wait (Resume now, which takes no note). It is refused with 409 while a check for Resume or Check again is under way, and at every other state.

```
resume(note?):
    mark checking (Resume and Check again unavailable)
    run the phase's check (done check, or the pull-request check), honoring the confirmation as Check again does
    pass → Done, finished by the person; the note is dropped; carry on as after Check again
    Resume now or the end of a wait, and Stayed in the workspace fails → Needs you with those facts,
           nothing resumed (the wait becomes that stop)
    fail otherwise → refresh the account and usage (awaited, 30 s at most); record the run's account from it when it returns
           resume the session as v1 resumes it, with the prompt below and the cause:
               person_resume (Resume, Resume now) · limit_resume (the end of a wait)
           the phase is Implementing; the stop or wait is cleared when the run starts
```

The session is resumed with v1's command line ([Resuming](../../prds/kiln-v1/technical-design.md#interruptions-sleep-and-resume)), plus multi-repo delivery's flags for a resumed run. A resumed run that can't pick the session up (its stream reports no `init` before it ends) is v1's `not_resumable` Needs you, without Resume (AC-RESUME-04).

**Prompts.** This design adds two opening templates and reuses v1's carry-on sentences for the phase and for the pull request, with multi-repo delivery's workspace wording ("worktree" becomes "workspace" for a multi-repository PRD).

After a usage limit (`limit_resume`, and `person_resume` when the stopped run had `limitRefusal`):

> This session stopped at `<time>` because Claude Code's usage limit (`<label>`) refused its request. Kiln has resumed it on the Claude account signed in now.

After any other stop that ended on its own (`person_resume`):

> This session ended at `<time>` before its work was done, and the person running Kiln has asked Kiln to resume it.

After multi-repo delivery's interrupted Needs you (`interrupted` set), v1's own interrupted or unrecorded opening, with `interrupted.at`.

`<time>` is the stopped run's `endedAt`, in v1's format. A note (AC-RESUME-03) comes first, as its own paragraph: "The person running Kiln says:" followed by the note verbatim, trimmed, and kept in `run.note`. [The outside prompt](#seam-with-multi-repo-delivery) can follow it. A note longer than 4,000 characters is refused (400); an empty one counts as none.

**Where Resume is offered (`resumeOffered`).** At a `done_check` or `pull_request_check` stop whose session has at least one run without `spawnError`, and at multi-repo delivery's interrupted Needs you; never at `plan` or `not_resumable` stops, and not when [the seam](#seam-with-multi-repo-delivery) rules it out. The same rule holds after a restart, since it reads only the record.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The prompts (two resume prompts), §HTTP API, §Snapshot ("Needs you fields")

## Interfaces

### Command line

Two terminal lines join v1's phase event lines ([Command line](../../prds/kiln-v1/technical-design.md#command-line-ac-cli-01-ac-cli-02-ac-start-09)), in its format: `<time> <id> <title> waiting · <label> resets <local time>` (the day added when not today; `waiting · <label>` with no reset time), printed when a wait starts or restarts, and v1's `resumed`, printed for every resume this design adds. A stop after a refused automatic resume prints v1's `stopped`. Ctrl+C during a wait prints "Kiln stopped while phase <id> waited for usage." with the grey line "kiln run checks it and waits again."; `kiln run` that finds a wait prints "● Phase <id> is waiting for usage (<label>, resets <local time>)." (no reset part when there's no reset time).

### HTTP API

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §HTTP API

| Method and path | Change |
|---|---|
| `POST /api/resume` | New: `{ note?: string }` → `200 { ok: true }` once the check has run, as `POST /api/check-again` answers; `409 { reason }` when not offered in this state, while checking, or for a note during a wait; `400 { reason }` for a note that isn't text or is longer than 4,000 characters |
| `POST /api/settings` | Gains `resumeAfterUsageLimit?: boolean`, accepted at any time, applied at once |

Every new route carries v1's Host, Origin and token checks.

### Snapshot

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Snapshot

```
Snapshot (changed and added fields only):
  feature: { …, state: … | waiting }
  settings: { …, resumeAfterUsageLimit }
  PhaseView: { …, state: … | waiting }
  limit (shared shape): { label, resetsAt?, resetPassed,
                          account?: { email, plan?, percent?, at, atLimitUntil? },
                          blockingLimit?: { label, resetsAt? } }
                          (account: built from the reading the Claude account panel holds, when its call started after
                           the refusal, else absent; percent: the stopping limit's row, absent when the reading has none;
                           atLimitUntil: that row's resetsAt when percent is 100 and it hasn't passed, which shows the
                           amber line, AC-LIMIT-03; blockingLimit: on the waiting screen once resetPassed, another row
                           of that reading at 100% that still keeps the account from having usage left, AC-LIMIT-01)
  waiting?: { phaseId, since, limit, sessionId, stoppedAt, finalMessage?, exitCode?, signal?, lastSkill?,
              outputLineCount?, checking? }
  needsYou: { …, limit?: { …limit, refusedAgainAt? }, resumeOffered }
```

`waiting` carries the ending fields Needs you shows (AC-STOP-02), with v1's meanings, and no checks: the waiting screen has no Check again (AC-LIMIT-04). The view computes the countdown from `resetsAt` and recomputes it every 30 seconds; `resetPassed` is set by Kiln too, so a reload agrees. Every time these screens show is rounded to the nearest minute (a reading's `resets_at` carries fractions of a second, the refusal's `resetsAt` whole seconds), so "Resets at 3:00 PM" never sits beside "at 100% until 2:59 PM". The Disconnected view shows a waiting phase as Interrupted and the header as Interrupted in phase <n>, as it does for Implementing.

## Data Models

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Data Models

```
PrdRecord (schema 3; fields not shown are schema 2's):
  settings: { …, resumeAfterUsageLimit }
  phases.<id>: { …,
     wait?: { since, sessionId, run, checks[], checkedAt, refusedAccount?: { email, orgId } },
     stop?: { …, limit?: { rateLimitType?, label, resetsAt?, refusedAgainAt? } } }

SessionRecord (schema 3):
  runs[]: { …, cause: launch | resume | limit_resume | person_resume,
            limitRefusal?: { rateLimitType?, label, resetsAt?, at },   (at: the refusing event's arrival time)
            account?: { email, orgId }, note? }
```

`wait.run` is the index of the refused run. The account shown on both screens is never stored: it is the reading Kiln holds in memory, so a reading from before a restart is never shown as current. **Migration from schema 2**, on read: `resumeAfterUsageLimit: true`; nothing else, since no record before this change holds a wait or a refusal. A v1 record is migrated to 2, then to 3.

## Screens

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot ("Needs you on screen", the Disconnected rules)

The three drawn screens are built from their mockups' HTML, which is their specification. The rest:

- **The waiting screen** is shown alone, as Needs you is: no phase plan, no Claude account panel; the Kiln mark leads back to it. Its settings card holds keep-awake, with v1's Disconnected rules, and the new setting.
- **Documents found, Running, Paused and Disconnected:** a "Resume after a usage limit" row under keep-awake, in the waiting mockup's wording and checkbox.
- **Needs you after a refused automatic resume:** the usage-limit Needs you mockup with the line from [The Wait](#the-wait) under its heading.
- **Usage-limit Needs you with no Resume** (no transcript): the limit facts and the signed-in account stay; the two ways forward, which both end in "press Resume", give way to v1's fresh-session hand-back, its step text noting "after the reset, or after switching accounts".
- **Needs you for a pull-request session:** the resume mockup's Resume panel, with "carry on opening the pull request" in place of the phase.
- **Multi-repo delivery's screens** keep its facts by repository; Resume and the limit card sit where these mockups put them.

## Seam With Multi-Repo Delivery

That design asks this one to honor AC-OUTSIDE-01, AC-OUTSIDE-04, AC-PRS-01 and AC-SHOW-01's `Replaces in part:` lines on this PRD ([its seam](../kiln-multi-repo-delivery/technical-design.md#seam-with-usage-limit-recovery)). Here:

- **No wait after work outside the workspace.** The check that decides a wait is multi-repo delivery's done check, Stayed in the workspace included; when that check fails, the stop is Needs you, never a wait. Every resume (Resume, Resume now, the end of a wait) runs that check first and honors the confirmation as Check again does. Resume now and the end of a wait never go past a Stayed in the workspace failure: it is Needs you, with nothing resumed. Resume pressed at Needs you does resume (AC-OUTSIDE-04), with the outside prompt below ([Resume](#resume)).
- **Resume after multi-repo delivery's interrupted Needs you**, and on a pull-request session whose check failed for any reason (`resumeOffered`).
- **No transcript, no resume.** When the phase's latest session has no transcript (the snapshot leaves out `resumeCommand`), there is no wait and no Resume or Resume now, and Needs you offers the fresh session. An unreadable transcript keeps both.
- **The outside prompt.** While the confirmation is unticked, the resumed session's first message is the note, then AC-OUTSIDE-02's prompt, then the resume prompt above.

## Testing Approach

**Order.** The PRD proves each Claude Code behavior above before anything is built on it (Depends On), and a behavior that doesn't hold comes back as a product decision. Proof gate 5 tries them for real and saves the output as fixtures. Resume from Needs you, the prompts and `POST /api/resume` (AC-RESUME-01 to 04) rely on none of gate 5's items beyond v1's proven resume, so they can ship first; recognizing a limit, the wait and its screens (AC-AUTO, AC-LIMIT) are built once items (1) and (2) are recorded, and the switch-account wording once item (3) is.

- **Proof gate 5 (by hand).** (1) With an account at a limit, `claude -p "Say hi" --output-format stream-json --verbose` saved whole: the `rate_limit_event`, the synthetic assistant message, the `result`, the exit code; then check that the session's transcript file exists under the projects directory, since a session refused on its very first request with no transcript would go to Needs you with no wait. (2) Straight after, `/usage` as Kiln runs it, saved: the stopping row at 100%. (3) Two configuration directories (`CLAUDE_CONFIG_DIR`), each signed in to a different account; a session started in one, its transcript copied to the same project folder in the other, then `claude -p --resume` there: it carries on with its history. Using separate configuration directories leaves the person's own sign-in alone; it stands in for `claude auth login` within one configuration directory, the path the screens tell the person to take.
- **Recognizing a limit:** unit tests over gate 5's recording and gate 1's recordings with events placed into them: a refusal as the last event; a refusal followed by a model response (not a limit); refusals on an earlier run only; an interrupted run with a refusal (not a limit); each `rateLimitType` and a missing one, with their labels.
- **Has usage left and the readings:** unit tests over recorded `/usage` output: the mapped row below and at 100%; another row at 100%; a model-scoped `weekly_scoped` row for another model at 100% (ignored) and a surface-scoped one (blocks); no mapped row on another account (usage left) and on the refused account (doesn't decide); the same email under another `orgId` (another account); a refusal type that maps to no row (doesn't decide); `error` and `limitsError`; a reading that started before the refusal (ignored, and asked again).
- **The wait and resume in the engine:** against v1's stand-in `claude`, extended to replay a refusal and to record the account a resume ran on, and a stand-in usage reader with scripted readings and a fake clock: wait, then resume at the first reading with usage left; resume at `resetsAt` when readings don't decide; with no reset, Needs you with no wait for a type with no row, Needs you when the first reading fails, and a later failed reading ignored; a refused automatic resume on the same account (Needs you, with the line), with the account unknown (Needs you) and on another (a new wait); Stayed in the workspace failing at the end of a wait or at Resume now (Needs you, nothing resumed) and at Resume (resumed, with the outside prompt while the confirmation is unticked); Resume now refused again (a new wait); the setting switched off during a wait (Needs you) and on at Needs you (nothing starts); Ctrl+C during a wait and `kiln run` (waits again, or Done when the check passes); a sleep during a wait (a reading); a pending pause holding through a wait. Resume at Needs you: the check passing (Done, note dropped), failing (resumed with the note first), a 409 while checking, a session with no started run (not offered), and a resume that reports no `init` (`not_resumable`).
- **Keep-awake:** against the real tool on the running platform: held during a wait, released when it turns into Needs you.
- **Migration:** schema 2 and v1 records read as schema 3 with the setting on.
- **The view:** each of the three mockups rendered from a fixture snapshot and compared with the mockup, as v1 does; the countdown and the reset-passed wording at a fixed clock; the Disconnected view of a wait.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-AUTO-01 | Recognizing a Usage Limit; The Wait (starting it) |
| AC-AUTO-02 | Design Decisions (has usage left, readings don't decide); The Wait (while it lasts); Resume |
| AC-AUTO-03 | The Wait (restarts and sleep, keep-awake) |
| AC-AUTO-04 | The Wait (the setting); Design Decisions (default for a PRD underway); HTTP API; Data Models (migration); Screens |
| AC-AUTO-05 | The Wait (refused again); Design Decisions (account) |
| AC-LIMIT-01 to 03 | Recognizing a Usage Limit (label); Resume (Resume now); Snapshot (`limit`); Screens |
| AC-LIMIT-04 | The Wait (starting it: a pending pause); Snapshot (`waiting`, Disconnected); Screens |
| AC-LIMIT-05 | Command line |
| AC-RESUME-01 to 04 | Resume; HTTP API; Snapshot; Seam With Multi-Repo Delivery |

## Open Questions

- **Proof gate 5** is open until an account is at a limit and a second account is signed in to a separate configuration directory: Doug runs it, or hands the moment to the implementing session. Each item that doesn't hold comes back as a product decision (PRD, Depends On): a reading right after a refusal that doesn't show it at 100% (the likely decision: wait for the reset time alone, as [readings that don't decide](#design-decisions) already do); a refusal type with no reading row seen in practice, a weekly Fable limit included, since the SDK's `rateLimitType` names none (that limit then waits for its reset time); `--resume` not carrying a session to another account (Resume now and AC-LIMIT-02's switch line); a refused `claude -p` leaving no transcript, so a session refused on its very first request would get no wait and no Resume.
