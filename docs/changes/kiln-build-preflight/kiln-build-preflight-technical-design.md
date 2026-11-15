# Technical Design: Kiln Build Preflight

**PRD:** [Kiln Build Preflight](kiln-build-preflight-prd.md) · **Assumptions:** [none open; RUN-003 sets when it runs](kiln-build-preflight-assumptions.md) · **Mockup:** [kiln-build-preflight.html](mockups/kiln-build-preflight.html)

## Overview

Two independent changes.

1. **The preflight is a new kind of activity.** It sits in the execution's activity history beside phases, audits and final delivery, has its own session, and is shown, stopped, replied to and marked complete through the machinery those activities already use. What is new is when it is due, how its result is read (the opening line of the session's final message, nothing else), and three controls that behave differently at its stop.
2. **Two phase-document lines are read and shown.** The plan reader picks up `**Attended:**` and `**Early merge:**` from each phase document. They reach the screens as display facts only; nothing that orders, starts or stops work reads them.

Kiln decides nothing about what is checked. It never parses an item's meaning, never acts on a reply, and never reads the report's stop lines.

## Existing Code

**Posture: Preserve.** Kiln is released, and the PRD amends eleven earlier PRDs in part only.

- Reuse the activity history, per-activity facts, session records, session launch and resume, the usage-limit wait and interrupted-session recovery for the preflight, keyed by its activity key exactly as an audit's are.
- Reuse the audit row's presentation path (progress row, page header, session detail) for the Preflight row.
- Reuse the Needs you stop, the control journal (`check-again`, `reply`, `waive-and-advance`), the engine's `checking` boundary and the waiver record. No new command, route, lock or journal action.
- Reuse the skill discovery that resolves an audit's skill, and the enabled-skill read agent metadata already makes before Start.
- Reuse the fresh-session launch at a stop that Start again uses, for Check Preflight again.
- Must keep: Kiln's start checks run first and stop Start on their own (PRD, Out of Scope). Every existing stop keeps its recheck-before-Mark-complete rule; only a preflight stop differs. A run with no `build-preflight` skill behaves exactly as today.
- Must keep: Kiln writes nothing into the repository that the skills do not already write. The preflight session may commit what the skill itself commits (a corrected phase document, a recorded authorization); Kiln adds no file.

## Architecture

An extension of the local TypeScript engine, the browser view and the CLI. No new service, store, timer or dependency. Preflight state lives in the execution's private PRD record; the session is an ordinary session record. Persisted schema goes from 21 to 22 (Upgrade, below).

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| What the preflight is | An execution activity of kind `preflight`, key `preflight-<activityId>` | AC-PREFLIGHT-08 asks for a row, header and session detail that work as an audit's do; an activity gets all three, plus stops, waits and waivers, without a parallel path |
| When it runs | A saved `due` mark set by the person's actions listed under When the Preflight Is Due, consumed by the engine loop before anything else it would start or resume | AC-PREFLIGHT-01 ties the preflight to a person's action, not to the plan. A derived rule ("run whenever none is settled") would run again straight after a preflight that left no report |
| How the result is read | The first non-blank line of the session's final assistant message, compared with the two fixed lines | The method fixes those lines so a tool can read them (build-preflight, "The Report"). Kiln keeps no report file and asks the session to submit nothing, so the skill runs under Kiln exactly as it does by hand |
| Check Preflight again | A fresh session under the same activity | AC-PREFLIGHT-03. One row keeps every attempt, as a phase row keeps every session of a phase |
| Mark complete at a preflight stop | Saved from the stop's own items with no rerun | AC-PREFLIGHT-03. A rerun would be a second preflight of several minutes, and the items are the session's words, not a check Kiln can re-evaluate |
| A preflight that cannot be started | A skill that cannot be resolved to one source, or a session that fails to spawn after the launch checks pass, is treated as one that left no report. A failed launch check stops on the preflight's key, as for any activity | AC-PREFLIGHT-06: a preflight never holds up the run unless it reported items. A billing approval stop at Start is common, and skipping the preflight there would defeat AC-PREFLIGHT-01 |
| Live controls on a running preflight | None: no Message Claude, no Pause & take over and no pause after this activity, as final delivery's session has none | AC-TAKE-01's hold lasts until an explicit hand-back, and hand-back serves only phases and audits (AC-BACK-01, both in Kiln Live Session Control). A preflight steered mid-run would need a hand-back it cannot have; Reply at the preflight stop serves the same need. A pause would take effect as soon as the preflight goes on, and the Start that ends it runs another preflight (RUN-003), so it would cost a second preflight and hold nothing |
| Attended and Early merge | Read by the plan reader, carried as display facts | AC-ATTEND-04, RUN-001: the mark is only a heads-up, so no scheduling code may see it |

## When the Preflight Is Due (AC-PREFLIGHT-01, AC-PREFLIGHT-05)

An execution's preflight is **settled** once one of its preflight activities has `doneAt` and no `no_report` result: it reported ready, or Mark complete finished it at a preflight or launch-check stop before any report was read. So "marked complete" in AC-PREFLIGHT-01 means a Mark complete that finished the preflight: a waived Codex-safety check followed by no report leaves the preflight finished but not settled, and a later Resume runs one (AC-PREFLIGHT-06, Reading the Result).

These entry points set `preflight.due` in the same record write that records the action, with the `trigger` shown (Data Models):

| Entry point | Sets `due` | `trigger` |
|---|---|---|
| **Start** on the first screen, in the browser only, including a Start with every phase closed | Always | `start` |
| **Start** that ends a pause: on the Paused page, `kiln continue` at a pause, or the Folder missing page's Start while the run is paused | Always, in the same write that clears the pause (RUN-003) | `unpause` |
| **Continue with N phases** in the browser, its retry, and a restart that finishes an accepted continuation, all in the write that activates the fresh execution | Always; a fresh execution has no settled preflight | `continue` |
| **Start** from the base branch on the Folder missing page, in the write that activates the fresh execution | Always; a fresh execution has no settled preflight | `start` |
| The restart review's **Resume** in the browser, `kiln continue` while that review is showing, `kiln run <path> --resume` where it skips that review, and **Start** from the existing feature branch on the Folder missing page when the run is not paused | Only while the execution's preflight is not settled and the run would otherwise start or resume work (a restart-review action of start, resume or wait). This includes a run an earlier Kiln started with no preflight. A run held at Needs you gets no restart review, and a Folder missing Start from the existing feature branch leaves it at Needs you, so none of these sets it there. A paused run gets no restart review either, even after a restart: its Start is the row above | `resume` |

`kiln run` itself never presses Start, so on the first screen only the browser's Start sets the mark. Every activation of a fresh execution (Continue's accept, its retry, a restart that finishes an accepted continuation, a Start from the base branch on the Folder missing page) sets `due` inside the one shared activation write, not at each caller, so an activation path added later cannot miss it.

Nothing else sets it: not a phase or audit finishing, not phases an audit or a person adds while the run is underway, not Resume or Reply at a Needs you stop (a Folder missing Start from the existing feature branch that keeps the run at Needs you included), not the end of a usage-limit wait, and no setting.

The engine loop consumes the mark at the first point where it would otherwise launch or resume any session or run preparation, ahead of an interrupted phase session waiting to be resumed and ahead of the plan read that picks the next activity. Start has already set up the worktree by then, so the preflight runs where the build will. At that point Kiln:

1. Resolves the `build-preflight` skill in the session folder. The audit skill's resolver takes a skill name rather than an audit kind, and has three results. **Found:** the agent has an enabled entry named `build-preflight` or `enso-method:build-preflight` (Codex: its enabled metadata entries; Claude Code: its skill list) that resolves to one source. **Absent:** neither name is listed, a result distinct from unresolvable. **Unresolvable:** both names listed on Claude Code; zero or more than one distinct real path among the candidate files, each candidate checked for existence before its real path is taken; or any discovery read failure, which is never read as absent. Audit callers map absent to today's error for a missing audit skill.
2. **Absent:** clears `due` and goes on. No activity is allocated, so no row exists (AC-PREFLIGHT-05).
3. **Found:** allocates the preflight activity, clears `due` in the same write, and launches its session. From here the unfinished activity itself, not the mark, is what the loop finishes before choosing anything else, across a restart included. When the execution's latest preflight activity is still unfinished (running, waiting or stopped), the mark is cleared without allocating another: that activity is the preflight the action asked for.
4. **Unresolvable:** allocates the activity, finishes it at once with outcome `no_report` and the resolution message as its reason, and goes on. A session that fails to spawn after the launch checks pass is finished the same way, with the spawn error as its reason.

A pause requested before a restart never takes effect between a preflight and the activity it came before. Either the restart decision activates it, so the run reopens paused and the Start that ends the pause runs the one preflight (`unpause`), or it stays requested for the interrupted activity that Resume resumes, and takes effect when that activity ends, after the preflight and the activity both.

A usage-limit wait already holding when the mark is set keeps holding, since a preflight would meet the same limit; when it ends, the mark is consumed before the waiting session is resumed. An interrupted preflight session is resumed by the existing interrupted-session recovery. A preflight stopped at Needs you stays stopped across a restart, as any stop does.

Launch checks that guard every launch (billing approval, agent selection and readiness, Codex launch settings) guard this one too. The first launch records step 1's result as the activity's `skill`. Every later launch of a fresh preflight session (Check Preflight again, and the launch after Check again or Start again at a launch-check or done-check stop on its key) resolves `build-preflight` again with step 1's resolver and replaces the recorded `skill` with what it finds. Absent or unresolvable at that point finishes the activity as `no_report` with the resolution message as its reason. Reply and interruption recovery resume the existing conversation and resolve nothing. The installed method is not held at one version for a run (PRD, Out of Scope) and plugin install paths are versioned, so a path recorded at the first launch can go stale after an upgrade the person makes to settle an item.

A launch check that fails before a preflight session starts stops on the preflight's key as it would on any unstarted activity; it is never read as no report. The stop, its Check again, its Mark complete and the recheck before it work as at any launch-check stop. A preflight has no completion rows, so each check run at that stop holds only the launch check. Check again clears the stop once the launch check passes, and the loop then launches the still-unfinished preflight with its own prompt. Start again launches it through the same fresh-session path as Check Preflight again, with the preflight prompt and session kind. Mark complete saves the waiver and finishes the preflight, with that `waiverId` in its per-key activity facts, which settles it.

## The Preflight Session

The session uses the run's agent, model and effort, and the same session folder and added directories as an audit session. Its session record has kind `preflight`.

The prompt is a new externalized template, `prompts/preflight-session.txt`. It says to run the installed `build-preflight` skill on the governing PRD (Claude Code invokes the skill; Codex reads the pinned source in full, as the audit prompt has it), to follow the skill exactly, and to end with the skill's report as the final message, its fixed first line first with nothing before it. It lists the assigned worktrees and feature branch and authorizes only what the skill itself does there, plus pushing the assigned feature branch after any commit the skill makes, as the audit prompt authorizes pushes, so a preflight commit reaches the pull request even when final delivery comes next. It says, unconditionally, to leave any uncommitted changes in the worktrees exactly as they are, never stashing, resetting, cleaning or committing them, and to stage and commit only the files the skill itself changes, by path; the preflight can run ahead of an interrupted phase whose work is uncommitted. It gives no pinned CLI and no report path. Every resume of a preflight session (a reply, a sleep interruption, the end of a usage-limit wait) carries a new kind-specific tail, `prompts/resume-carry-on-preflight.txt`, in the place the phase, audit and pull-request tails take today: carry on with the preflight only, run again the checks that failed, and end with the skill's report as the final message, its fixed first line first. On a reply the tail's report rule comes last, after the reply policy, so it governs every final message: an answer, a request to wait and a blocker each open with `Preflight: N items need you` while anything is unsettled, otherwise `Preflight: ready`, and an answer goes inside the item it concerns so it shows on the stop page. A request to wait therefore comes back as an items stop. Without it a resumed session gets the phase tail and may end on a message Kiln reads as no report. The resumed run's final message is read the same way.

The prompt carries neither the branch catch-up sentences nor the adopted-worktree note, and the preflight marks no catch-up as told. The test of whether a conversation has begun, which decides the adopted-worktree note, ignores preflight keys, so the first session after the preflight still gets both.

A preflight's commits are not tracked as a range of their own. Ahead of an interrupted phase they follow that phase's start commit and show among that phase's commits; ahead of a fresh phase they come before its start commit. Both are display only.

## Reading the Result (AC-PREFLIGHT-02, AC-PREFLIGHT-03, AC-PREFLIGHT-06)

When a preflight session's run ends, Kiln reads that run's final assistant message, the same text AC-STOP-02 shows as the last message, and takes its first non-blank line with surrounding whitespace removed.

| First line | Outcome | What Kiln does |
|---|---|---|
| `Preflight: ready` | `ready` | Finishes the activity, settles the preflight, goes on |
| `Preflight: N items need you`, where N is a positive whole number; the singular `1 item needs you` is read the same way. A count of 0 is not this form: the skill never writes it, and only reported items hold up the run (AC-PREFLIGHT-06) | `items` | Stops at Needs you on the preflight's key |
| Anything else, or no final message | `no_report` | Finishes the activity without settling the preflight, goes on |

A run has **ended** only when it exited and Kiln will not resume it. A run cut off by sleep, or refused by a usage limit while **Resume after a usage limit** is on, is handled by the existing recovery and wait, and is read when the resumed run ends. With that setting off, a refused run has ended, so it is `no_report` and the run goes on to meet the limit where it would have today.

For an `items` outcome Kiln keeps the opening line verbatim and extracts the numbered items: the list that follows the opening line, where an item starts at a line beginning with a number and a period and runs until the next such line, and the list ends at the first later paragraph that is neither an item nor an indented continuation. The report's stop lines come after the list and are never extracted (RUN-002). Items keep the session's order. Two identical items are two entries with the same text; that is harmless, since preflight items never enter waiver coverage. An item's text is its lines with the leading `N.` marker and the whitespace after it removed, continuation lines trimmed and joined with single spaces, inline markdown kept; a waiver saves exactly that text. When no numbered item can be found, the stop keeps the opening line and one item saying the items are in the full report.

A preflight has no completion rows; the one part of the done check that applies to it is the Codex safety check. Before reading a preflight run's result, Kiln checks Codex process cleanup and dispatch for the preflight's sessions, as every activity's done check does. A problem stops on the preflight's key with that one check, as a `done_check` stop, not a preflight stop. Like a launch-check stop on that key it offers Check again, Start again and Mark complete, under the existing recheck-before-Mark-complete rule, though Start again is refused while the Codex problem is unresolved, as a Codex safety problem blocks every session Kiln starts for an activity today ("Kiln found a Codex safety problem."); Check again once the problem clears, or Mark complete, is the way on. Check again reruns only that check, and once it passes Kiln reads the report line. Mark complete there waives only that check, then reads the report line as Check again does once the check passes, in the same record write. If the read finishes the preflight (`ready` or `no_report`), the waiver's effect is `completed` and the preflight finishes with that `waiverId` in its per-key activity facts. If it reads `items`, the waiver's effect is `continued` and the preflight stop replaces the `done_check` stop. A waived safety check never settles a preflight by itself, since reported items stop the run before anything else (AC-PREFLIGHT-03). Resume, Reply, carry-on and verify-and-advance are refused there.

A waiver of the Codex-safety check follows the existing coverage rule on a preflight key with no exception: its items name the problem, not the session, and match while every feature head is unchanged. It therefore keeps covering the earlier session's problem, which that check lists again on every later read under the key, and covers the same problem from a later session. A preflight commit changes a head, so the next read stops on that check again and offers Mark complete afresh.

Otherwise, wherever Kiln would run an activity's done check on a preflight key (when a session ends, on recovery from an interruption, when a billing hold is rechecked) it reads the run's result instead. Only the report's first line, `no_report`, or Mark complete at a launch-check or preflight stop finishes a preflight. A preflight run cut off by sleep whose conversation is missing cannot be resumed; it has ended and is read as any ended run is. A first launch Codex rejects before dispatch is a launch-check stop instead.

"Goes on" always means the same thing: the loop continues into its ordinary next-activity choice, which gives the activity the preflight came before.

## The Preflight Stop (AC-PREFLIGHT-03)

An `items` outcome records a stop of a new kind, `preflight`, carrying one failing check, **Preflight**, whose items are the extracted items in the session's order (kind `other`, keyed by item text). The check is marked as the stop's reason, so the page shows no completion checks and the existing "nothing to check yet" rules apply.

The three controls reuse existing journal actions; only their effect at this stop kind is new.

| Control | Journal action | Effect at a preflight stop |
|---|---|---|
| **Check Preflight again** | `check-again` | Launches a fresh preflight session under the same activity through the fresh-session-at-a-stop path, and settles as Start again does: the operation completes with outcome `session_started` and `effects.session: started` once that session's prompt is submitted and it reports its start. It is a starting receipt (below). The new result is read from status, not the receipt, as the first was |
| **Reply** | `reply` | Resumes the stopped preflight session with the person's words and runs no recheck: under `checking`, held until the run starts, it clears the stop in one record write and queues the resume with the reply and the preflight resume tail. It is offered whenever the conversation can be reopened. The browser's Reply button stays disabled while the box is empty, since an empty reply would be sent as `resume`, which this stop refuses. Where the conversation cannot be reopened, Reply is not offered and Check Preflight again stands in; no carry-on session is offered at a preflight stop |
| **Mark complete** | `waive-and-advance` with `--confirm` | Below |

**Check Preflight again and Reply reopen the activity.** Each deletes the activity's `items` result in the same record write that clears the stop, so while the new or resumed session works the row reads as running and `PhaseView.preflight.outcome` is absent; that session's final message sets a fresh result. A `ready` or `no_report` result is final and never cleared.

**Check Preflight again is a starting receipt.** When it is accepted at a preflight items stop, the receipt records `starts_session: true` in its applying checkpoint, before any dispatch. A receipt is starting when its action is in the starting-action set or it carries that field; reconciliation and dispatch observation read that rule, never the action name alone. Such a receipt takes the start-again dispatch path, so an interrupted dispatch settles as `session_started` or, found still applying with no run, `dispatch_not_started`, never `check_interrupted`. A `check-again` at a launch-check stop on the preflight key never carries the field.

**No other control at a preflight stop.** `resume`, `carry-on`, `start-again` and `verify-and-advance` are refused there with "At a preflight stop, use Check Preflight again, Reply or Mark complete." Offering Reply and offering Resume are separate decisions at this stop kind, and only `reply` passes the reopen check. A launch-check or done-check stop on the preflight key is not a preflight stop and keeps its own controls, Start again included.

**Mark complete.** The offer predicate gains one branch: at a `preflight` stop it is offered as soon as the stop exists, with no recheck required, under the label **Mark complete** and no heading. The request still carries the stop's check-run id and the status token, so a page that has not seen a newer result is refused as stale. The act skips the rerun step: under the `checking` boundary it saves a waiver whose items and checks are the stop's own check's, never read from the activity's `result`, with `activityKind: preflight` and `effect: completed`, finishes the activity with that `waiverId` in its per-key activity facts, settles the preflight and clears the stop, in one record write. The sentence under the controls is the preflight's own, not the generic one about skipping failing checks: "Check Preflight again runs a fresh preflight. Mark complete {starts|resumes} {nextActivity} with the items as they are, and the Preflight row shows it was marked complete." The verb follows the Needs you page's rule (Display Contract). The row and `kiln status` label stay AC-WAIVE-10's ("Complete · 1 check waived"), since the stop carries one check, Preflight.

The `check-again` entry in `prompts/kiln-command-contracts.json` gains that settlement sentence for a preflight stop; `completion_checks_failed` and `still_stopped` apply only to stops that rerun completion checks.

At a preflight stop, `kiln waive-and-advance` without `--confirm` returns the Mark complete offer and its sentence and reruns or launches nothing, since Mark complete is offered at once there.

A preflight's items are never passed through the waiver coverage rule, and no later check reads them. Mark complete at a preflight stop settles the preflight, so a later Resume runs none; a Start or Continue still does (When the Preflight Is Due).

The hand-back page and terminal takeover are not offered at a preflight stop, nor is the work handed outside Kiln (Display Contract); the page is the mockup's state 2. A preflight session has no live controls and no pause. While it runs, its session detail offers neither Message Claude nor Pause & take over, the running page shows no pause panel, and `request-pause` is refused with "Pause after this activity isn't offered during the preflight." Each disabled live action shows its unavailable reason, as for final delivery, and Reset's reason does not suggest pausing after the current activity. A person who wants to steer it waits for its result and uses Reply at the preflight stop. No takeover hold, uncertain-message hold or hand-back page can therefore exist on a preflight's key.

## Phase Document Lines (AC-ATTEND-01, AC-ATTEND-05)

The plan reader reads two more lines from a phase document's preamble, the lines before its first `##` heading, where `phase-split` writes them beside **Repositories**:

```
PhaseDocument, PlannedPhase, recorded plan phase (each gains):
  attended?: string     — the text after `**Attended:**`, trimmed
  earlyMerge?: string   — the text after `**Early merge:**`, trimmed
```

A line with no text after it still marks the phase, with empty text. Neither line can make a plan fail to read, and neither joins the start checks.

## Interfaces

No new HTTP route or command. The snapshot and the `kiln status` JSON gain:

```
PhaseView (extended):
  kind: … | preflight
  attended?: string                          — on any phase row whose document carries the line, closed or not
  preflight?: {
    outcome?: ready | items | no_report      — absent when no report has been read (running, or marked complete before a session reported)
    found?: string                           — "Nothing to settle" | "Ended without a report"
    reason?: string                          — why a no_report preflight launched no session for its last attempt
  }

Snapshot.preflight?: {
  planned?: { before: <phase id | audit key | "pr"> | "end" }
}

DocumentsFound.plan.phases[] (extended):
  attended?: string
  earlyMerge?: string

Snapshot.needsYou (extended):
  attended?: string                          — the stopped phase's Attended text
  preflight?: { headline: string; items: string[]; nextActivity: { kind, key?, title } }
```

`Snapshot.preflight.planned` is present whenever a preflight would be allocated by the next Start, Continue or Resume, or is due and not yet allocated, and the skill was found.

`planned.before`, `needsYou.preflight.nextActivity` and the Paused page's next activity come from one derivation, read from the record alone: the preflight's recorded `before`; else the pending audit; else the first open leaf; else final delivery, when the audit policy is `legacy_complete` and the run completed; else the step after the last settled audit (the delivery audit, the test audit, or final delivery `pr`). An audit not yet allocated has no key, so `nextActivity` omits `key` and `planned.before` is `end`; `end` also on a page that has no row for that activity. The result is a display prediction: the preflight can commit, so the activity Kiln actually starts after it may differ.

Skill presence before Start comes from the enabled-skill read agent metadata already makes, which gains an optional-skill fact for `build-preflight` decided by the same found test as step 1 of When the Preflight Is Due; a missing optional skill is never a readiness blocker.

In the `kiln status` JSON a preflight is one more activity kind. A preflight stop is reported as any stop, and a preflight marked complete as a waived audit is (PRD, Out of Scope).

## Display Contract

Build arrangement and wording from the approved mockup; the numbers are its states.

- **Preflight row (1, 3, 5; AC-PREFLIGHT-08).** Circle `PF`, title **Preflight**, no file line. Before it is allocated, a planned row with state `planned` at `preflight.planned.before` on Documents found, the Paused page (the restart review included, which is the Paused page in its "Ready to resume" form) and the Continue offer's plan. A planned row is never the Paused page's next activity: the heading and Start button keep naming the activity after it ("Start Phase 3"), by the derivation under Interfaces. Once allocated it is an activity row in execution order, which places it above the activity it came before; a preflight with `before` recorded sits directly above that activity's row instead. A second preflight after a later Resume is a second row. It does not count in "N of M done". Finished rows show duration and a **Found** line from `preflight.found`, which comes from `outcome` and is absent when there is none. The pill comes from the activity's waiver facts as any activity's does (AC-WAIVE-10): a waived completion shows "Complete · 1 check waived", and a stop shows as any activity's. Otherwise **Ready** in the done look and **No report** in the warning look. A preflight whose Codex-safety check was waived and whose report then read as `no_report` shows **No report** with "1 check waived" beside it. A `no_report` row whose last attempt launched no session (it has `preflight.reason`) shows **No report**, the Found line "Ended without a report" and beneath it a **Why** line carrying `preflight.reason` verbatim. The row links to its session detail only when it has a session.
- **Preflight as the next activity.** When the execution's latest preflight is allocated and unfinished, the restart review's `activityKey` is its key and the page says "Next: the preflight", as it does for the pull request. A launch-check or done-check stop on a preflight key takes its headline from the existing per-kind copy through the shared key classifier ("The preflight hasn't started." for a launch check); there is no preflight-specific copy.
- **Header.** While the preflight is the current activity the header names it **Preflight**, through the same activity-name path audits use.
- **Terminal.** The terminal prints the preflight as an audit titled **Preflight** with id `PF`: its started, resumed, interrupted and waiting lines are an audit's, and an items result prints the standard stopped line. Ready prints "complete · Ready". No report prints "complete · No report", with No report in amber and `preflight.reason`, when present, on an amber note line beneath. A waived completion prints the audit's "complete · 1 check waived …" suffix.
- **Preflight Needs you page (2; AC-PREFLIGHT-03).** Headline is `needsYou.preflight.headline` verbatim. Items render in order with inline code. The line under the headline opens with "Nothing has been built." only when no leaf in the effective plan is closed and the execution has run no activity besides preflights; the rest of it names `nextActivity`, with the verb "resumes" when the preflight has `before` recorded and "starts" otherwise. The sentence under the controls (The Preflight Stop, Mark complete) uses the same verb. Reply box, then **Check Preflight again** and **Mark complete** side by side under no heading. No check rows, no stop lines.
- **No pick-up outside Kiln.** On any stop on a preflight key, Needs you draws no **Pick it up yourself** card and no fresh-prompt link, so a preflight is never continued outside Kiln, where its report would go unread. `freshSessionPrompt` is the preflight session prompt (`prompts/preflight-session.txt`), so `kiln status` gives a correct prompt, and `resumeCommand` is built as for any session.
- **Needs you there marker (1, 3; AC-ATTEND-01).** A button beside the phase name wherever a phase row is drawn on Documents found and the phase plan. Hover, keyboard focus or a press shows `attended` and the line saying where it came from; a press toggles it, so it works without a pointer.
- **Planned-as-needing-you card (4; AC-ATTEND-03).** When `needsYou.attended` is present, always the first card of the main column on every Needs you layout, the hand-back page included, above the card that carries the headline. At a stop that is only Kiln's record, the order is this card, the headline card, then Mark complete, which stays the first control under the headline (AC-WAIVE-02).
- **Early-merge warning (6; AC-ATTEND-05).** Inside the Allow early merges block on Documents found, directly beneath the checkbox, shown when the box is off and at least one leaf the run will build (not closed, and at or after the start point) has `earlyMerge`. It names each such phase. The branch it names is the line's text up to its first comma, as written. It is derived in the view from the plan and the saved setting, so ticking the box removes it with no server round trip beyond the existing save.

## Data Models

```
PrdRecord.preflight?: {
  due?: { trigger: start | unpause | continue | resume, at: ISO-8601 }   — per the entry-point table
  activities: PreflightActivity[]
}

PreflightActivity:
  activityId, sequence, createdAt, trigger
  before?: <activity key>                    — set at allocation when the mark is consumed ahead of an interrupted or waiting session
  skill?: { name, path, digest }             — replaced at each fresh session's launch; absent when it could not be resolved
  result?: {                                 — only what a session's run produced; absent when Kiln marked the preflight complete before any report was read. An items result is deleted when Check Preflight again or Reply clears the stop; ready and no_report are final
    outcome: ready | items | no_report
    at: ISO-8601
    sessionId?, run?                         — the run whose final message was read
    headline?: string                        — the opening line, for items
    items?: string[]
    reason?: string                          — for no_report when its last attempt launched no session
  }

ExecutionActivity.kind: … | preflight
StopKind:               … | preflight
SessionRecord.kind:     … | preflight
Waiver.activityKind:    … | preflight
```

Per-activity facts (session ids, `doneAt`, `stop`, `wait`, `waiverId`) live under the preflight's key in the record's activity facts, as an audit's do; the `waiverId` there is the one record that a waiver finished the preflight, as for every activity. Every reader in the engine, control layer and view that tells a key's kind apart uses one shared key classifier (phase, audit, preflight, final delivery), with no local prefix test that falls through to "phase", so plan-leaf scans, phase counts, continuation accounting, waiver facts and completed-plan discovery never see a preflight as a phase, and a later activity kind is added in one place. Session time counts toward time totals as an audit session's does. Reset clears preflight state with the rest of the execution.

Timestamps are UTC ISO 8601.

## Upgrade

Schema 22 is additive: `preflight`, the new kind values, and `attended` and `earlyMerge` on the recorded plan. A schema-21 record migrates with no preflight state, so its preflight is not settled and the next Resume runs one (AC-PREFLIGHT-01). Schema-21 readers refuse schema 22 under the existing newer-schema rule.

## Integration Points

- Runs the Enso Method's `build-preflight` skill through the selected agent, Claude Code or Codex, and reads that session's final message.
- Reads the agent's enabled-skill list, which both agents' metadata reads already provide.
- Reads `**Attended:**` and `**Early merge:**` as `phase-split` writes them.

## Changes to Earlier Designs

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does (a due preflight comes before whatever Start or Resume would otherwise start or resume) and §The Plan Reader (two more preamble lines).

Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Check Runs and When Mark Complete Is Offered (offered at a preflight stop without a recheck), §Mark Complete (no rerun at a preflight stop; the waiver is saved from the stop's items) and §Display Contract (label, placement and sentence at a preflight stop).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Start, interruption and completion (an accepted continuation's fresh execution starts with a preflight).

Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`, §Start and §After Start (a preflight precedes the first activity, a start with every phase closed included).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §Display Contract (the warning beneath Allow early merges).

Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §Start (AC-SETUP-04, 05, AC-SAFE-01 to 04) (both starting points set the preflight's `due` mark as When the Preflight Is Due lists).

Replaces in part: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait (a preflight session waits too, and its run is read for its result instead of a done check).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Activity identity and order (activity kind `preflight` and its `preflight-<activityId>` key).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (at a preflight stop only `check-again`, `reply` and `waive-and-advance` are accepted) and §Operations, dispatch and crash reconciliation (`check-again` at a preflight stop launches a session and settles as `session_started`).

Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Local Interfaces and §Bot Extension (a running preflight offers no message, takeover or pause, and `request-pause` is refused with its reason).

Each earlier section gets its `Superseded in part by:` line in the commit that builds the change.

## Delivery

- **Before the build:** the Enso Method release that carries `build-preflight` and the `**Attended:**` line is installed for the agent on the build machine. Whoever starts the build confirms it.
- **Expected build spend:** about $10, for a handful of real preflight sessions against a small fixture repository, proving that a real session's final message opens with a line Kiln reads (AC-PREFLIGHT-02, AC-PREFLIGHT-03) and that a reply reaches it. Everything else runs on the scripted stand-in sessions.
- **After the build:** add the `CHANGELOG.md` entry under Unreleased when the work merges to `develop`; publish through the repository's publish gate; release by the release guide.

## Verification and Criteria Coverage

Real temporary Git repositories, the packaged CLI against the local server, and the real browser view; scripted stand-in sessions whose final messages are the three result forms. Crash points: after `due` is saved, after allocation, after the result is read, after the waiver write.

| Criteria | Design | Named proof |
|---|---|---|
| AC-PREFLIGHT-01 | When the Preflight Is Due | A preflight session is the first session after Start, after a Start that ends a pause (Paused page, `kiln continue`, and the Folder missing page), the preflight already settled included, after Continue, after a Start from the base branch on the Folder missing page, after Start with every phase closed (before the delivery audit), after a Folder missing Start from the existing feature branch before the preflight is settled, after `kiln continue` at the restart review and after a `kiln run <path> --resume` that skips it, each before the preflight is settled, and after Resume with an interrupted phase session waiting; none after Resume once ready or marked complete; none after a Folder missing Start from the existing feature branch that leaves the run at Needs you; none after Resume or Reply at a Needs you stop; one after Resume following no report; none when an audit appends phases; no second preflight when a restart finds one stopped at Needs you and it is then checked again; a pause requested during a phase, then a restart with that phase's session interrupted, then Resume gives the preflight, then the phase resumed, then the pause; no setting exists |
| AC-PREFLIGHT-02 | Reading the Result; Display Contract; The Preflight Session | A ready result launches the next activity with no stop; the row shows Ready, duration and Nothing to settle, and no stop lines; a preflight that commits pushes the feature branch before the next activity starts |
| AC-PREFLIGHT-03 | The Preflight Stop | Items stop before anything else; headline and items verbatim and in order; each control from the browser and the CLI; Mark complete usable at once, launching nothing, saving the items as the waiver, each item's text without its `N.` marker and with continuation lines joined; the line under the headline and the sentence under the controls say "resumes" when the preflight has `before` recorded and "starts" otherwise, and open with "Nothing has been built." only while no leaf is closed and no activity besides preflights has run; `kiln waive-and-advance` without `--confirm` returns the offer and launches nothing; a Check Preflight again receipt settles as `session_started` at the fresh session's start, and one interrupted while still applying with no run settles as `dispatch_not_started`; `resume`, `carry-on`, `start-again` and `verify-and-advance` at a preflight stop are refused with the reason naming the three controls, while a launch-check stop on the preflight key still offers Start again; a stale page refused; a reply delivered to a real session, whose resumed final message is read as a fresh result; Reply resumes with no recheck, and its browser button is disabled while the box is empty; no Pick it up yourself card (so no resume command) or fresh-prompt link on any stop on a preflight key, while `kiln status` gives `fresh_session_instructions` carrying the preflight prompt; no phase is classified as a preflight or a preflight as a phase by any shared key reader |
| AC-PREFLIGHT-05 | When the Preflight Is Due; Interfaces | With the skill absent, for each agent: no row before or after Start, and the first session is the phase's |
| AC-PREFLIGHT-06 | Reading the Result | A session ending with neither line, with no final message, with a failed spawn and with an unresumable sleep interruption each go on with a No report row; a usage-limit wait and a resumable sleep interruption are resumed and read afterwards; a billing-hold recheck never finishes a preflight; a preflight run ending with unresolved Codex process cleanup stops on that one check, refuses Resume and Reply, and its report is read once Check again passes; a failed launch check stops on the preflight's key and, after Check again, launches the preflight; a Check Preflight again whose skill no longer resolves ends the activity as No report with the resolution message; a preflight that could not be resolved or spawned shows No report, "Ended without a report" and a Why line with its reason, and is not a link |
| AC-PREFLIGHT-08 | Display Contract; Interfaces; The Preflight Stop | Row position on a new branch, a branch with closed phases, after Continue and with every phase closed; a preflight before a resumed interrupted phase sits directly above that phase's row; header while current; the terminal's started, stopped, Ready, No report (with its reason line) and waived lines; session detail shows the full report, and while the session runs offers neither Message Claude, Pause & take over nor a pause panel, each disabled action showing its reason, and `request-pause` is refused with its reason |
| AC-ATTEND-01 | Phase Document Lines; Display Contract | Marker on open and closed marked phases on both screens; text shown on hover, focus and press |
| AC-ATTEND-03 | Display Contract | The card on the standard and hand-back pages for a marked phase, absent for an unmarked one |
| AC-ATTEND-04 | Design Decisions | A marked and an unmarked phase launch with identical prompts and options, and the loop never pauses before the marked one |
| AC-ATTEND-05 | Phase Document Lines; Display Contract | Warning names each open phase with the line while the box is off; absent when ticked, when the only such phase is closed, and when no phase has the line |

## Open Questions

None.
