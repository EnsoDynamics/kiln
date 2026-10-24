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

The PRD's Depends On names three.

- **The refusal report.** The Agent SDK 0.3.302 bundled with Kiln types `rate_limit_event.rate_limit_info` as `status: allowed | allowed_warning | rejected`, `resetsAt?` (Unix seconds), and `rateLimitType?: five_hour | seven_day | seven_day_opus | seven_day_sonnet | seven_day_overage_included | overage`. The SDK also marks the synthetic assistant message Claude Code writes for a refused request with `error: "rate_limit"`.
- **A reading right after a refusal shows it.** `/usage` reports `session` (5-hour), `weekly_all` and `weekly_scoped` rows ([Account and Usage](../../prds/kiln-v1/technical-design.md#account-and-usage)); the refusal's `rateLimitType` names the same windows differently. Not yet seen: that a reading taken just after a refusal shows that row at 100%.
- **Resuming on another account.** A session's transcript is a local file under the Claude Code configuration directory; nothing seen ties it to the account that wrote it. Not yet seen: `claude -p --resume` of a session started on one account, run while signed in to another.

## Design Decisions

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Account Usage and Recovery (Codex refusal classification, fresh usage identity and bounded automatic attempts; Claude rules retained).

| Decision | Choice | Rationale |
|---|---|---|
| What counts as hitting a usage limit | The latest run's last `rate_limit_event` has `status: "rejected"`, and no model response (v1's definition: a non-`<synthetic>` assistant event) arrived after it in that run | AC-STOP-04 allows only Claude Code's own report; scoping to the latest run and to "nothing after it" is the PRD's run rule, and stops a refusal the session got past from counting |
| Limit to reading row | `five_hour` → `session`; `seven_day` → `weekly_all`; `seven_day_opus` / `seven_day_sonnet` → the `weekly_scoped` row whose model name is Opus / Sonnet; any other or missing type → no row | The PRD's labels come from the reading's rows (AC-LIMIT-01), and "has usage left" is judged on them; a type with no row can only be waited out by its reset time |
| Has usage left | A reading whose call started after the refusal arrived, signed in and with its limits read, in which no row is at 100% except a model-scoped `weekly_scoped` row for another model, never the stopping limit's own row, which blocks whatever its model, since the session it refused needs it: one whose lowercased name is not a hyphen-separated token of the session's `initModel` (`fable` against `claude-opus-5-5`). A surface-scoped row at 100% always blocks. Rows the usage parser drops (an unknown `kind`, a scoped row with no name) don't count, at the cost of at most one refused resume (AC-AUTO-05). A reading with no row for the stopping limit counts as usage left only when its account differs from the refused account (`limitRefusal.account`): that account has no such limit | The PRD's definition, made checkable: "after" uses Kiln's clock on both sides, as v1's sleep rule does, so a reading can't predate the refusal. AC-AUTO-02 resumes on "whichever account" has usage left, and AC-LIMIT-03 expects a reading with no row for the limit. On the refused account a missing row shows nothing (today's `/usage` lists no Opus or Sonnet row), and resuming on it would be refused again and stop at Needs you overnight |
| When readings don't decide | A reading of the refused account can't decide when it has no row for the stopping limit, which is always so when the refusal's type maps to no row (missing, `overage`, `seven_day_overage_included`, any other); a reading of another account decides by [Has usage left](#design-decisions) whatever the type. A failed reading (`error`, `limitsError`, a failed call) decides nothing either. Past `resetsAt`, a reading that fails or can't decide resumes, and one that shows no usage left keeps the wait. With no `resetsAt`, the wait goes to Needs you when its first reading fails or can't decide; once one has decided, later failed readings are ignored | AC-AUTO-02's fallback (can't read, resume at the reset time) and its "nothing to wait for" case; a reader that fails once after a good reading has not left Kiln with nothing to wait for |
| Reading at the reset time | At `resetsAt` plus 60 seconds | The server's window may roll over a little after the stated time; a reading that still shows 100% leaves the 5-minute readings to try again |
| Account a refusal belongs to | `limitRefusal.account` on the refused run: the email and `orgId` (from `claude auth status --json`) of the first reading after the refusal whose `claude auth status` succeeded with an account signed in; a failed reading sets nothing, and once set it never changes. A resumed run records those of the reading [resume](#resume) takes just before it (`run.account`). Two accounts are the same when both match. When either is unknown (no reading succeeded), the accounts count as the same | Claude Code doesn't report the account in the session stream; AC-AUTO-05 needs "the same account" only between those two moments, and both come from readings Kiln took. Kept on the run, not the wait, so the verdict survives the wait being cleared when the resumed run starts and a restart before the verdict. One email can hold a personal plan and a Team seat, so the email alone can't tell them apart. Counting unknown as the same stops the overnight resume-and-wait loop UI-004 exists to prevent, at the cost of a Needs you the person can clear with Resume |
| The setting's default for a PRD already underway | On, as for a new PRD; the migration writes it | UI-003 makes on the default; a PRD underway gets the same behavior as one started after the upgrade, and its settings show it |
| Record version | Schema 3, one above multi-repo delivery's 2; migrated on read | v1's rule that an older Kiln refuses a newer record keeps an older Kiln from treating a wait as a session whose verdict was never recorded |

## Recognizing a Usage Limit

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Account Usage and Recovery (Codex refusal classification, fresh usage identity and bounded automatic attempts; Claude rules retained).

On every run's end, before the verdict, Kiln reads that run's saved events (those that arrived from its `startedAt` to its end, as [The prompts](../../prds/kiln-v1/technical-design.md#the-prompts) counts them) and, when the rule above holds, writes `limitRefusal` on the run in the same write as its end. A run cut off by an interruption is never a usage limit: `interruptedBy` wins, as it does for sleep. A session refused on its very first request is treated like any refused run.

`limitRefusal.label` is written with the run's end from the type, and replaced once by the mapped row's label ("5-hour window", "Weekly", "Weekly · Opus") from the first reading after the refusal that has that row, in one write with `stop.limit.label` when the phase's stop carries one. From the type: `five_hour` "5-hour window", `seven_day` "Weekly", the scoped types "Weekly · Opus" or "Weekly · Sonnet", anything else "A usage limit" (AC-LIMIT-01's table).

## The Wait

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Account Usage and Recovery (Codex refusal classification, fresh usage identity and bounded automatic attempts; Claude rules retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands (the engine loop's verdict and the reconcile), §Interruptions, sleep and resume ("Kiln never resumes one that ended on its own"), §Account and Usage ("Kiln never waits for a reset")

**Starting it.** After a session ends on its own, the engine runs the check as v1 does (the done check, or the pull-request check). A pass is Done. A fail with `limitRefusal` on the latest run, the setting on, and nothing in [Seam With Multi-Repo Delivery](#seam-with-multi-repo-delivery) ruling it out, records `phases.<id>.wait` with the check's results, prints the terminal line, and only then asks for a reading. Any other fail is Needs you as v1, carrying `stop.limit` when the run was refused (AC-LIMIT-01 to 03). Recording any stop that carries `limit` also asks for a reading at once, so the account card shows one taken after the refusal. No other phase starts during a wait, and a pending pause stays pending through it as through Needs you (v1 AC-VIEW-03); the waiting screen shows no pause control, and `POST /api/pause` is refused with 409, as at Needs you.

**While it lasts.** Kiln evaluates every new reading that started after the refusal arrived:

```
(the wait is recorded before its first reading is asked for)
on a reading after the refusal, while no resume's lock is held:
    limitRefusal.account unset, and its auth status succeeded signed in → set it from this reading
    it has usage left                                  → resume
    it shows no usage left                             → wait for the next reading
    it fails or can't decide, past resetsAt            → resume
    it fails or can't decide, no resetsAt, and it is the wait's first reading → Needs you
    otherwise                                          → wait for the next reading
on resetsAt + 60 s (wall clock): take a reading
on a detected sleep:         take a reading; re-arm the reset reading
```

Resuming at the end of a wait is the [resume](#resume) command with `cause: limit_resume`, run by the engine; the wait is cleared when the resumed run starts. Readings are v1's account and usage refresh, so a reading asked for while one runs joins it and the panel and the wait see the same reading; when the one joined started before the refusal, Kiln asks again once it returns, and since `ClaudeInfo` ends a reading before its listeners hear of it, that ask starts a fresh call. While [resume](#resume)'s lock is held, readings update the account card only; the rules above apply again only if the resume ends by the wait starting again. The reset reading is armed from the wall clock and re-armed on every detected sleep, since a Node timer doesn't count time asleep on macOS or Linux, and re-armed until the reset when that is beyond one timer's 24 days (a monthly `overage` window); the 5-minute readings bound any error.

**When the resume is refused again (AC-AUTO-05, UI-004).** When a run with `cause: limit_resume` ends with `limitRefusal`, no model response arrived in that run at all, and its `account` and `limitRefusal.rateLimitType` match the previous run's `limitRefusal` (`account`, `rateLimitType`; a type missing on both counts as equal, an unknown account as the same), the phase goes to Needs you with `stop.limit.refusedAgainAt` set to the run's start; the screen's line reads "Kiln resumed by itself at <time> and the limit refused it again." Any other refused run, a resume the person pressed included, starts a new wait.

**The setting during a wait (AC-AUTO-04).** Switching it off converts the wait into a stop: `kind` `done_check` or `pull_request_check`, the wait's checks and `checkedAt`, `at` now, `limit` from the refusal. Switched off once the end of a wait's resume has begun but before its run starts (its check running, or the check failed), a failure is that stop and nothing is resumed. Switching it on at Needs you changes the setting only.

**Restarts and sleep (AC-AUTO-03).** Ctrl+C or a closed terminal during a wait stops nothing, since no process runs; the wait stays in the record. `kiln run` on a feature with a wait reconciles like a stop: it runs the phase's check, which passes as Done finished by the person, and otherwise starts the wait again, or goes to Needs you when the setting is now off. A restarted wait keeps `since`, `sessionId` and `run`, takes `checks` and `checkedAt` from the reconcile's check, and keeps nothing derived from earlier readings, so with no `resetsAt` the first-reading rule applies again; the refused run keeps its `limitRefusal`, account included. The reconcile's "ended on its own, verdict never recorded" branch gains the same rule, so a Kiln killed between a refused run's end and its verdict waits on restart. Sleep detection keeps running during a wait, and each detected sleep asks for a reading.

**Keep-awake (AC-AUTO-03).** The hold is taken while a session's process runs or a wait is recorded, keep-awake on, and released otherwise, as v1 releases it.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Keep-awake

## Resume

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Resume and stopping (Codex saved identity, original pair, explicit repair and cleanup reconciliation; Claude behavior retained).

**The command.** `resume({ note? })`, reached by `POST /api/resume`, is allowed at a Needs you whose `resumeOffered` is true and during a wait (Resume now, which takes no note), and refused with 409 at every other state. From a press of Resume or Resume now, or the start of the end-of-wait resume, until the resumed run starts or a stop or Done is recorded, Resume, Resume now and Check again are unavailable, as during Check again's own check: `POST /api/resume` and `POST /api/check-again` return 409, and `checking` stays set so the view shows work under way.

```
resume(note?):
    mark checking (held until the run starts or a stop or Done is recorded)
    run the phase's check (done check, or the pull-request check), honoring the confirmation as Check again does
    pass → Done, finished by the person; the note is dropped; carry on as after Check again
    Resume now or the end of a wait, and Stayed in the workspace fails → Needs you with those facts,
           nothing resumed (the wait becomes that stop)
    fail otherwise → refresh the account and usage (awaited, 30 s at most); record the run's account from it when it returns
           resume the session as v1 resumes it, with the prompt below and the cause:
               person_resume (Resume, Resume now) · limit_resume (the end of a wait)
           the phase is Implementing; the stop or wait is cleared when the run starts
```

The session is resumed with v1's command line ([Resuming](../../prds/kiln-v1/technical-design.md#interruptions-sleep-and-resume)), plus multi-repo delivery's flags for a resumed run. A resumed run of any cause (`resume`, `limit_resume`, `person_resume`) that ends without its `init` event can't pick the session up: it is v1's `not_resumable` Needs you, without Resume (AC-RESUME-04).

**Prompts.** This design adds two opening templates and reuses v1's carry-on sentences for the phase and for the pull request, with multi-repo delivery's workspace wording ("worktree" becomes "workspace" for a multi-repository PRD).

After a usage limit (`limit_resume`, and `person_resume` when the stopped run had `limitRefusal`):

> This session stopped at `<time>` because Claude Code's usage limit (`<limit>`) refused its request. Kiln has resumed it on the Claude account signed in now.

After any other stop that ended on its own (`person_resume`):

> This session ended at `<time>` before its work was done, and the person running Kiln has asked Kiln to resume it.

After multi-repo delivery's interrupted Needs you (`interrupted` set), v1's own interrupted or unrecorded opening, with `interrupted.at`.

`<time>` is the stopped run's `endedAt`, in v1's format; `<limit>` is the label's sentence form ([Screens](#screens)), and the parenthesis is left out for a type with no label. A note (AC-RESUME-03) comes first, as its own paragraph: "The person running Kiln says:" followed by the note verbatim, trimmed, and kept in `run.note`. [The outside prompt](#seam-with-multi-repo-delivery) can follow it. A note longer than 4,000 characters is refused (400); an empty one counts as none. With a note, append the shared unattended-reply policy after the carry-on instruction: normally follow the reply and continue without routine approvals; stop with a final answer only for an explicit hold, a substantive question that needs review before action, or a material decision the agent cannot resolve within its authority. Output alone is not acknowledgement by the person. The policy applies equally to phase and pull-request resumes, including outside-workspace repair, without widening authorization. A passing precheck with a note returns `noteSkipped: true`; the browser shows a dismissible notice outside the changing screen so it survives advancement.

**Where Resume is offered (`resumeOffered`).** At a `done_check` or `pull_request_check` stop whose session has at least one run without `spawnError`, and at multi-repo delivery's interrupted Needs you; never at `plan` or `not_resumable` stops, and not when [the seam](#seam-with-multi-repo-delivery) rules it out. The same rule holds after a restart, since it reads only the record.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The prompts (two resume prompts), §HTTP API, §Snapshot ("Needs you fields")

## Interfaces

### Command line

Two terminal lines join v1's phase event lines ([Command line](../../prds/kiln-v1/technical-design.md#command-line-ac-cli-01-ac-cli-02-ac-start-09)), in its format: `<time> <id> <title> waiting · <label> resets <local time>` (the day added when not today; `waiting · <label>` with no reset time; `<time> PR <title> waiting · …` for the pull-request session, as v1's pull-request lines read), printed when a wait starts (when `kiln run` restarts one, its ● line below stands in for it, as for v1's lines), and v1's `resumed`, printed for every resume this design adds. Every wait that turns into Needs you prints v1's `stopped`: the setting switched off, a first reading that fails or can't decide with no reset time, Stayed in the workspace failing at the end of a wait, a refused automatic resume. Ctrl+C during a wait prints "Kiln stopped while phase <id> waited for usage." ("while the pull-request session waited for usage") with the grey line "kiln run checks it and waits again."; `kiln run` that finds a wait prints "● Phase <id> is waiting for usage (<label>, resets <local time>)." ("● The pull-request session is waiting for usage …"; no reset part when there's no reset time). The summary line printed before it ends "phase <id> is waiting for usage" ("the pull request is waiting for usage" for the pull-request session), beside v1's forms (UI-010 item 5).

### HTTP API

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records → Local API and snapshot changes (Codex manual recovery; Claude behavior retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §HTTP API

| Method and path | Change |
|---|---|
| `POST /api/resume` | New: `{ note?: string }` → `200 { ok: true }` once the check has run, as `POST /api/check-again` answers; `409 { reason }` when not offered in this state, while a resume or check is under way ([Resume](#resume)), or for a note during a wait; `400 { reason }` for a note that isn't text or is longer than 4,000 characters |
| `POST /api/settings` | Gains `resumeAfterUsageLimit?: boolean`, accepted at any time, applied at once |

Every new route carries v1's Host, Origin and token checks.

### Snapshot

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records → Local API and snapshot changes (Codex session facts; Claude behavior retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Snapshot

```
Snapshot (changed and added fields only):
  feature: { …, state: … | waiting }
  settings: { …, resumeAfterUsageLimit }
  PhaseView: { …, state: … | waiting }
  limit (shared shape): { label, resetsAt?, resetPassed,
                          account?: { email?, plan?, error?, percent?, at, atLimitUntil? },
                          blockingLimit?: { label, resetsAt? } }
                          (account: built from the reading the Claude account panel holds, when its call started after
                           the refusal; absent before then, and the card reads "Reading the signed-in account…"; email
                           absent when not signed in, error when the auth call failed, each shown as v1's line in place
                           of the account, with no percent and no amber line; percent: the stopping limit's row, absent
                           when the reading has none or its limits failed (limitsError), leaving the account alone;
                           atLimitUntil: that row's resetsAt when percent is 100 and it hasn't passed, which shows the
                           amber line until the view's clock reaches it, AC-LIMIT-03; blockingLimit: on the waiting
                           screen once resetPassed, another row
                           of that reading at 100% that still keeps the account from having usage left, AC-LIMIT-01; of several, the one
                           whose reset is latest, a row with no reset counting as latest, ties in the server's order)
  waiting?: { phaseId, since, limit, sessionId, stoppedAt, finalMessage?, exitCode?, signal?, lastSkill?,
              outputLineCount?, checking?, model, effort?, sessionStartedAt?, sessionEndedAt?, steps?, commits? }
  needsYou: { …, limit?: { …limit, refusedAgainAt? }, resumeOffered }
```

`waiting` carries the ending fields Needs you shows (AC-STOP-02) and Needs you's Full session output fields (`model` to `commits`), with v1's meanings, its commits read from Git when the wait starts, as at a stop; it has no checks, since the waiting screen has no Check again (AC-LIMIT-04). `checking`, on `waiting` and `needsYou`, is held as [Resume](#resume) says. The view computes the countdown from `resetsAt` and recomputes it every 30 seconds; `resetPassed` is set by Kiln too, so a reload agrees. Every time these screens show is rounded to the nearest minute (a reading's `resets_at` carries fractions of a second, the refusal's `resetsAt` whole seconds), so "Resets at 3:00 PM" never sits beside "at 100% until 2:59 PM". The Disconnected view shows a waiting phase as Interrupted and the header as Interrupted in phase <n>, as it does for Implementing.

## Data Models

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk; `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Data Models

```
PrdRecord (schema 3; fields not shown are schema 2's):
  settings: { …, resumeAfterUsageLimit }
  phases.<id>: { …,
     wait?: { since, sessionId, run, checks[], checkedAt },
     stop?: { …, limit?: { rateLimitType?, label, resetsAt?, refusedAgainAt? } } }

SessionRecord (schema 3):
  runs[]: { …, cause: launch | resume | limit_resume | person_resume,
            limitRefusal?: { rateLimitType?, label, resetsAt?, at, account?: { email, orgId } },   (at: the refusing event's arrival time)
            account?: { email, orgId }, note? }
```

`wait.run` is the index of the refused run. The account shown on both screens is never stored: it is the reading Kiln holds in memory, so a reading from before a restart is never shown as current. **Migration from schema 2**, on read: `resumeAfterUsageLimit: true`; nothing else, since no record before this change holds a wait or a refusal. A v1 record is migrated to 2, then to 3.

## Screens

Superseded in part by: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Interfaces and Records → Local API and snapshot changes (agent-specific output and recovery information; Claude behavior retained).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot ("Needs you on screen", the Disconnected rules)

The three drawn screens are built from their mockups' HTML, which is their specification. The rest:

- **The label in a sentence.** The label stands alone only where the limit is shown as a name: the account card's row ("5-hour window 100%") and the terminal lines. Every sentence, headings and the amber line included, uses its sentence form, `<limit>` below: "the 5-hour usage limit", "the weekly usage limit", "the weekly <Model> usage limit" ("the weekly Fable usage limit"), or "a usage limit" for a type with no label.

- **The waiting screen** is shown alone, as Needs you is: no phase plan, no Claude account panel; the Kiln mark leads back to it. Its settings card holds keep-awake, with v1's Disconnected rules, and the new setting. The phase route serves a waiting phase as it serves a stopped one, as Full session output, with the back link reading "Waiting for usage" and the phase pill styled as Paused.
- **Documents found, Running, Paused and Disconnected:** a "Resume after a usage limit" row under keep-awake, in the waiting mockup's wording and checkbox. Keep-awake's subtitle changes from v1's drawn "While a session works" to the waiting mockup's "While a session works or Kiln waits" on every screen that shows it, since a wait counts as working (AC-AUTO-03).
- **No reset time, or a reset that has passed:** with no reset time, the usage-limit Needs you's step 1 reads "Wait for <limit> to reset, then press Resume" and the waiting screen's sentence reads "Kiln resumes this session by itself at the first reading that shows usage left."; once the reset has passed, step 1 reads "<Limit> reset at <time>; press Resume". The waiting card's footer reads "Kiln reads again every 5 minutes and at the reset" with a reset time to come, and "every 5 minutes" otherwise.
- **Needs you after a refused automatic resume:** the usage-limit Needs you mockup with the line from [The Wait](#the-wait) under its heading.
- **Usage-limit Needs you with no Resume** (no transcript, [the seam](#seam-with-multi-repo-delivery)): the limit facts and the signed-in account stay; the two ways forward, which both end in "press Resume", give way to v1's fresh-session hand-back, its step text noting "after the reset, or after switching accounts". A `limit_resume` or `person_resume` that fails without `init` is instead v1's `not_resumable` Needs you, without limit facts (AC-RESUME-04).
- **The pull-request session:** at Needs you, the resume mockup's Resume panel, with "carry on opening the pull request" in place of the phase; waiting, the heading reads "The pull-request session is waiting for <limit> to reset", under v1's pull-request title.
- **Multi-repo delivery's screens** keep its facts by repository; Resume and the limit card sit where these mockups put them.

## Seam With Multi-Repo Delivery

That design asks this one to honor AC-OUTSIDE-01, AC-OUTSIDE-04, AC-PRS-01 and AC-SHOW-01's `Replaces in part:` lines on this PRD ([its seam](../kiln-multi-repo-delivery/technical-design.md#seam-with-usage-limit-recovery)). Here:

- **No wait after work outside the workspace.** The check that decides a wait is multi-repo delivery's done check, Stayed in the workspace included; when that check fails, the stop is Needs you, never a wait. How every resume runs that check: [Resume](#resume). Resume pressed at Needs you does resume (AC-OUTSIDE-04), with the outside prompt below ([Resume](#resume)).
- **Resume after multi-repo delivery's interrupted Needs you**, and on a pull-request session whose check failed for any reason (`resumeOffered`).
- **No transcript, no resume.** When the phase's latest session has no transcript (the snapshot leaves out `resumeCommand`), there is no wait and no Resume or Resume now, and Needs you offers the fresh session. An unreadable transcript keeps both.
- **The outside prompt.** While the confirmation is unticked, the resumed session's first message is the note, then AC-OUTSIDE-02's prompt, then the resume prompt above.

## Testing Approach

**Order.** The PRD proves each Claude Code behavior above before anything is built on it (Depends On). Proof gate 5 tries them for real and saves the output as fixtures. Resume from Needs you, the prompts and `POST /api/resume` (AC-RESUME-01 to 04) rely on none of gate 5's items beyond v1's proven resume, so they can ship first; recognizing a limit, the wait and its screens (AC-AUTO, AC-LIMIT) were planned to wait for items (1) and (2). On 2026-10-22 no account was near a limit, and Doug chose to build them without the recordings: the unit tests build the refusal from the SDK's typed `rate_limit_event` and the synthetic `error: "rate_limit"` message, and the first real limit in live use stands in for items (1) to (3). A behavior that doesn't hold there comes back as the product decision Open Questions names.

- **Proof gate 5 (by hand).** (1) With an account at a limit, `claude -p "Say hi" --output-format stream-json --verbose` saved whole: the `rate_limit_event`, the synthetic assistant message, the `result`, the exit code; then check that the session's transcript file exists under the projects directory, since a session refused on its very first request with no transcript would go to Needs you with no wait. (2) Straight after, `/usage` as Kiln runs it, saved: the stopping row at 100%. (3) Two configuration directories (`CLAUDE_CONFIG_DIR`), each signed in to a different account; a session started in one, its transcript copied to the same project folder in the other, then `claude -p --resume` there: it carries on with its history. Using separate configuration directories leaves the person's own sign-in alone; it stands in for `claude auth login` within one configuration directory, the path the screens tell the person to take.
- **Recognizing a limit:** unit tests over gate 5's recording and gate 1's recordings with events placed into them: a refusal as the last event; a refusal followed by a model response (not a limit); refusals on an earlier run only; an interrupted run with a refusal (not a limit); each `rateLimitType` and a missing one, with their labels.
- **Has usage left and the readings:** unit tests over recorded `/usage` output: the mapped row below and at 100%; another row at 100%; a model-scoped `weekly_scoped` row for another model at 100% (ignored) and a surface-scoped one (blocks); no mapped row on another account (usage left) and on the refused account (doesn't decide); the same email under another `orgId` (another account); a refusal type that maps to no row (doesn't decide on the refused account, decides on another); `error` and `limitsError`; a reading that started before the refusal (ignored, and asked again).
- **The wait and resume in the engine:** against v1's stand-in `claude`, extended to replay a refusal and to record the account a resume ran on, and a stand-in usage reader with scripted readings and a fake clock: wait, then resume at the first reading with usage left; past `resetsAt`, resume at a reading that fails or can't decide and keep waiting at one that shows no usage left; with no reset, Needs you when the first reading fails or can't decide (a type with no row, read on the refused account), again after `kiln run` restarts the wait, a resume when that first reading is of another account with usage left, and a later failed reading ignored; `limitRefusal.account` set only by a reading signed in, and not during a resume's lock; a refused automatic resume on the same account (Needs you, with the line), with the account unknown (Needs you) and on another (a new wait); Stayed in the workspace failing at the end of a wait or at Resume now (Needs you, nothing resumed) and at Resume (resumed, with the outside prompt while the confirmation is unticked); Resume now refused again (a new wait); the setting switched off during a wait (Needs you) and after the end-of-wait check failed (Needs you, nothing resumed) and on at Needs you (nothing starts); Ctrl+C during a wait and `kiln run` (waits again, or Done when the check passes); a sleep during a wait (a reading); a pending pause holding through a wait. Resume at Needs you: the check passing (Done, note dropped), failing (resumed with the note first), a 409 from the press until the run starts, a session with no started run (not offered), and a resume of each cause that reports no `init` (`not_resumable`).
- **Keep-awake:** against the real tool on the running platform: held during a wait, released when it turns into Needs you.
- **Migration:** schema 2 and v1 records read as schema 3 with the setting on.
- **The view:** each of the three mockups rendered from a fixture snapshot and compared with the mockup, as v1 does; the countdown, the no-reset and reset-passed wording at a fixed clock; the account card before a reading, signed out and with `limitsError`; Full session output from a wait; the Disconnected view of a wait.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-AUTO-01 | Recognizing a Usage Limit; The Wait (starting it) |
| AC-AUTO-02 | Design Decisions (has usage left, readings don't decide); The Wait (while it lasts); Resume |
| AC-AUTO-03 | The Wait (restarts and sleep, keep-awake); Screens (keep-awake's subtitle) |
| AC-AUTO-04 | The Wait (the setting); Design Decisions (default for a PRD underway); HTTP API; Data Models (migration); Screens |
| AC-AUTO-05 | The Wait (refused again); Design Decisions (account); Data Models (`limitRefusal.account`) |
| AC-LIMIT-01 to 03 | Recognizing a Usage Limit (label); Resume (Resume now); Snapshot (`limit`); Screens |
| AC-LIMIT-04 | The Wait (starting it: a pending pause); Snapshot (`waiting`, Disconnected); Screens |
| AC-LIMIT-05 | Command line |
| AC-RESUME-01 to 04 | Resume; HTTP API; Snapshot; Screens (no Resume, `not_resumable`); Seam With Multi-Repo Delivery |

## Open Questions

- **Proof gate 5** is open until an account is at a limit in live use (built without it, [Testing Approach](#testing-approach)); `scripts/exploration/proof-gate-5-usage-limit.mjs` records it. Each item that doesn't hold comes back as a product decision (PRD, Depends On): a reading right after a refusal that doesn't show it at 100% (the likely decision: wait for the reset time alone, as [readings that don't decide](#design-decisions) already do); a refusal type with no reading row seen in practice, a weekly Fable limit included, since the SDK's `rateLimitType` names none (that limit then waits for its reset time); `--resume` not carrying a session to another account (Resume now and AC-LIMIT-02's switch line); a refused `claude -p` leaving no transcript, so a session refused on its very first request would get no wait and no Resume.
