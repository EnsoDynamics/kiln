# Technical Design: Kiln Build Preflight

**PRD:** [Kiln Build Preflight](kiln-build-preflight-prd.md) · **Assumptions:** [no open entries](kiln-build-preflight-assumptions.md) · **Mockup:** [kiln-build-preflight.html](mockups/kiln-build-preflight.html)

## Overview

Two independent changes.

1. **The preflight is a new kind of activity.** It sits in the execution's activity history beside phases, audits and final delivery, has its own session, and is shown, stopped, replied to and marked complete through the machinery those activities already use. What is new is when it is due, how its result is read (the opening line of the session's final message, nothing else), and three controls that behave differently at its stop.
2. **Two phase-document lines are read and shown.** The plan reader picks up `**Attended:**` and `**Early merge:**` from each phase document. They reach the screens as display facts only; nothing that orders, starts or stops work reads them.

Kiln decides nothing about what is checked. It never parses an item's meaning, never acts on a reply, and never reads the report's stop lines.

## Existing Code

**Posture: Preserve.** Kiln is released, and the PRD amends five earlier PRDs in part only.

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
| When it runs | A saved `due` mark set at three entry points, consumed by the engine loop before anything else it would start or resume | AC-PREFLIGHT-01 ties the preflight to a person's action, not to the plan. A derived rule ("run whenever none is settled") would run again straight after a preflight that left no report |
| How the result is read | The first non-blank line of the session's final assistant message, compared with the two fixed lines | The method fixes those lines so a tool can read them (build-preflight, "The Report"). Kiln keeps no report file and asks the session to submit nothing, so the skill runs under Kiln exactly as it does by hand |
| Check Preflight again | A fresh session under the same activity | AC-PREFLIGHT-03. One row keeps every attempt, as a phase row keeps every session of a phase |
| Mark complete at a preflight stop | Saved from the stop's own items with no rerun | AC-PREFLIGHT-03. A rerun would be a second preflight of several minutes, and the items are the session's words, not a check Kiln can re-evaluate |
| A preflight that cannot be started for a reason other than a missing skill | Treated as one that left no report | AC-PREFLIGHT-06: a preflight never holds up the run unless it reported items |
| Attended and Early merge | Read by the plan reader, carried as display facts | AC-ATTEND-04, RUN-001: the mark is only a heads-up, so no scheduling code may see it |

## When the Preflight Is Due (AC-PREFLIGHT-01, AC-PREFLIGHT-05)

An execution's preflight is **settled** once one of its preflight activities reported ready or was marked complete. A preflight that left no report is finished but not settled.

Three entry points set `preflight.due` in the same record write that records the action:

| Entry point | Sets `due` |
|---|---|
| **Start**, from the browser or `kiln run` | Always |
| **Continue with N phases**, in the write that activates the fresh execution | Always; a fresh execution has no settled preflight |
| The restart review's **Resume**, and `kiln run <path> --resume` | Only while the execution's preflight is not settled. This includes a run an earlier Kiln started with no preflight |

Nothing else sets it: not a phase or audit finishing, not phases an audit or a person adds while the run is underway, not Resume or Reply at a Needs you stop, not the end of a usage-limit wait, and no setting.

The engine loop consumes the mark at the first point where it would otherwise launch or resume any session or run preparation, ahead of an interrupted phase session waiting to be resumed and ahead of the plan read that picks the next activity. Start has already set up the worktree by then, so the preflight runs where the build will. At that point Kiln:

1. Resolves the `build-preflight` skill in the session folder, by the audit skill's discovery rules under the names `build-preflight` and `enso-method:build-preflight`.
2. **No skill found:** clears `due` and goes on. No activity is allocated, so no row exists (AC-PREFLIGHT-05).
3. **Exactly one source found:** allocates the preflight activity, clears `due` in the same write, and launches its session. From here the unfinished activity itself, not the mark, is what the loop finishes before choosing anything else, across a restart included.
4. **Found but not resolvable to one source, or the discovery read fails:** allocates the activity, finishes it at once with outcome `no_report` and the resolution message as its reason, and goes on.

An interrupted preflight session is resumed by the existing interrupted-session recovery. A preflight stopped at Needs you stays stopped across a restart, as any stop does.

Launch checks that guard every launch (billing approval, agent selection and readiness, Codex launch settings) guard this one too, and stop on the preflight's key as they would on any unstarted activity.

## The Preflight Session

The session uses the run's agent, model and effort, and the same session folder and added directories as an audit session. Its session record has kind `preflight`.

The prompt is a new externalized template, `prompts/preflight-session.txt`. It says to run the installed `build-preflight` skill on the governing PRD (Claude Code invokes the skill; Codex reads the pinned source in full, as the audit prompt has it), to follow the skill exactly, and to end with the skill's report as the final message, its fixed first line first with nothing before it. It lists the assigned worktrees and feature branch and authorizes only what the skill itself does there. It gives no pinned CLI and no report path. When the person replies, the session is resumed with their words under the existing reply policy, and the resumed session's final message is read the same way.

## Reading the Result (AC-PREFLIGHT-02, AC-PREFLIGHT-03, AC-PREFLIGHT-06)

When a preflight session's run ends, Kiln reads that run's final assistant message, the same text AC-STOP-02 shows as the last message, and takes its first non-blank line with surrounding whitespace removed.

| First line | Outcome | What Kiln does |
|---|---|---|
| `Preflight: ready` | `ready` | Finishes the activity, settles the preflight, goes on |
| `Preflight: N items need you`, where N is a whole number; the singular `1 item needs you` is read the same way | `items` | Stops at Needs you on the preflight's key |
| Anything else, or no final message | `no_report` | Finishes the activity without settling the preflight, goes on |

A run has **ended** only when it exited and Kiln will not resume it. A run cut off by sleep, or refused by a usage limit while **Resume after a usage limit** is on, is handled by the existing recovery and wait, and is read when the resumed run ends. With that setting off, a refused run has ended, so it is `no_report` and the run goes on to meet the limit where it would have today.

For an `items` outcome Kiln keeps the opening line verbatim and extracts the numbered items: the list that follows the opening line, where an item starts at a line beginning with a number and a period and runs until the next such line, and the list ends at the first later paragraph that is neither an item nor an indented continuation. The report's stop lines come after the list and are never extracted (RUN-002). When no numbered item can be found, the stop keeps the opening line and one item saying the items are in the full report.

"Goes on" always means the same thing: the loop continues into its ordinary next-activity choice, which gives the activity the preflight came before.

## The Preflight Stop (AC-PREFLIGHT-03)

An `items` outcome records a stop of a new kind, `preflight`, carrying one failing check, **Preflight**, whose items are the extracted items in the session's order (kind `other`, keyed by item text). The check is marked as the stop's reason, so the page shows no completion checks and the existing "nothing to check yet" rules apply.

The three controls reuse existing journal actions; only their effect at this stop kind is new.

| Control | Journal action | Effect at a preflight stop |
|---|---|---|
| **Check Preflight again** | `check-again` | Launches a fresh preflight session under the same activity through the fresh-session-at-a-stop path. Its result is read as the first was |
| **Reply** | `reply` | Resumes the stopped preflight session with the person's words, as a reply resumes any stopped session. The evaluation Resume makes first re-reads the saved result and launches nothing |
| **Mark complete** | `waive-and-advance` with `--confirm` | Below |

**Mark complete.** The offer predicate gains one branch: at a `preflight` stop it is offered as soon as the stop exists, with no recheck required, under the label **Mark complete** and no heading. The request still carries the stop's check-run id and the status token, so a page that has not seen a newer result is refused as stale. The act skips the rerun step: under the `checking` boundary it saves a waiver whose items and checks are the stop's own, with `activityKind: preflight` and `effect: completed`, finishes the activity with that `waiverId`, settles the preflight and clears the stop, in one record write. The offer's sentence is built from the same preview data as today and names the forecast next activity.

`kiln waive-and-advance` without `--confirm` stays what it is everywhere: the stop's recheck, which here is Check Preflight again.

A preflight's items are never passed through the waiver coverage rule, and no later check reads them. A waiver settles the preflight, which is why none runs again in that execution.

The hand-back page and terminal takeover are not offered at a preflight stop; the page is the mockup's state 2. While a preflight session is running, live messages and takeover work as for any running session.

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
    outcome?: ready | items | no_report      — absent while it has not finished
    found?: string                           — "Nothing to settle" | "Ended without a report"
  }

Snapshot.preflight?: {
  planned?: { before: <phase id | audit key | "pr"> | "end" }
}

DocumentsFound.plan.phases[] (extended):
  attended?: string
  earlyMerge?: string

Snapshot.needsYou (extended):
  attended?: string                          — the stopped phase's Attended text
  preflight?: { headline: string; items: string[]; nextActivity: { kind, key, title } }
```

`Snapshot.preflight.planned` is present whenever a preflight would be allocated by the next Start, Continue or Resume, or is due and not yet allocated, and the skill was found. `before` is the activity the loop would choose next: the first leaf the run would build, the next audit, or final delivery; `end` only on a page that has no row for that activity. Skill presence before Start comes from the enabled-skill read agent metadata already makes, which gains an optional-skill fact for `build-preflight`; a missing optional skill is never a readiness blocker.

In the `kiln status` JSON a preflight is one more activity kind. A preflight stop is reported as any stop, and a preflight marked complete as a waived audit is (PRD, Out of Scope).

## Display Contract

Build arrangement and wording from the approved mockup; the numbers are its states.

- **Preflight row (1, 3, 5; AC-PREFLIGHT-08).** Circle `PF`, title **Preflight**, no file line. Before it is allocated, a planned row at `preflight.planned.before` on Documents found, the restart review and the Continue offer's plan. Once allocated it is an activity row in execution order, which places it above the activity it came before; a second preflight after a later Resume is a second row. It does not count in "N of M done". Finished rows show duration and a **Found** line from `preflight.found`. Pills: **Ready** in the done look; **No report** in the warning look; a stop and a waived completion as any activity shows them (AC-WAIVE-10). The row links to its session detail whenever it has a session.
- **Header.** While the preflight is the current activity the header names it **Preflight**, through the same activity-name path audits use; the terminal uses the same name and order.
- **Preflight Needs you page (2; AC-PREFLIGHT-03).** Headline is `needsYou.preflight.headline` verbatim. Items render in order with inline code. The line under the headline and the sentence under the controls name `nextActivity`. Reply box, then **Check Preflight again** and **Mark complete** side by side under no heading. No check rows, no stop lines.
- **Needs you there marker (1, 3; AC-ATTEND-01).** A button beside the phase name wherever a phase row is drawn on Documents found and the phase plan. Hover, keyboard focus or a press shows `attended` and the line saying where it came from; a press toggles it, so it works without a pointer.
- **Planned-as-needing-you card (4; AC-ATTEND-03).** When `needsYou.attended` is present, the first card of the main column on the standard Needs you page and on the hand-back page, above how the session ended.
- **Early-merge warning (6; AC-ATTEND-05).** Inside the Allow early merges block on Documents found, directly beneath the checkbox, shown when the box is off and at least one leaf the run will build (not closed, and at or after the start point) has `earlyMerge`. It names each such phase. The branch it names is the line's text up to its first comma, as written. It is derived in the view from the plan and the saved setting, so ticking the box removes it with no server round trip beyond the existing save.

## Data Models

```
PrdRecord.preflight?: {
  due?: { trigger: start | continue | resume, at: ISO-8601 }
  activities: PreflightActivity[]
}

PreflightActivity:
  activityId, sequence, createdAt, trigger
  skill?: { name, path, digest }             — absent when it could not be resolved
  result?: {
    outcome: ready | items | no_report
    at: ISO-8601
    sessionId?, run?                         — the run whose final message was read
    headline?: string                        — the opening line, for items
    items?: string[]
    reason?: string                          — for no_report with no session
    waiverId?: string                        — marked complete
  }

ExecutionActivity.kind: … | preflight
StopKind:               … | preflight
SessionRecord.kind:     … | preflight
Waiver.activityKind:    … | preflight
```

Per-activity facts (session ids, `doneAt`, `stop`, `wait`, `waiverId`) live under the preflight's key in the record's activity facts, as an audit's do. Every reader that treats `audit-*` and `pr` keys as activities that are not phases treats `preflight-*` the same: plan-leaf scans, phase counts, continuation accounting and completed-plan discovery never see a preflight as a phase. Session time counts toward time totals as an audit session's does. Reset clears preflight state with the rest of the execution.

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

Each earlier section gets its `Superseded in part by:` line in the commit that builds the change.

## Delivery

- **Before the build:** the Enso Method release that carries `build-preflight` and the `**Attended:**` line is installed for the agent on the build machine. Whoever starts the build confirms it.
- **Expected build spend:** about $10, for a handful of real preflight sessions against a small fixture repository, proving that a real session's final message opens with a line Kiln reads (AC-PREFLIGHT-02, AC-PREFLIGHT-03) and that a reply reaches it. Everything else runs on the scripted stand-in sessions.
- **After the build:** add the `CHANGELOG.md` entry under Unreleased when the work merges to `develop`; publish through the repository's publish gate; release by the release guide.

## Verification and Criteria Coverage

Real temporary Git repositories, the packaged CLI against the local server, and the real browser view; scripted stand-in sessions whose final messages are the three result forms. Crash points: after `due` is saved, after allocation, after the result is read, after the waiver write.

| Criteria | Design | Named proof |
|---|---|---|
| AC-PREFLIGHT-01 | When the Preflight Is Due | A preflight session is the first session after Start, after Continue, after Start with every phase closed (before the delivery audit), and after Resume with an interrupted phase session waiting; none after Resume once ready or marked complete; one after Resume following no report; none when an audit appends phases; no setting exists |
| AC-PREFLIGHT-02 | Reading the Result; Display Contract | A ready result launches the next activity with no stop; the row shows Ready, duration and Nothing to settle, and no stop lines |
| AC-PREFLIGHT-03 | The Preflight Stop | Items stop before anything else; headline and items verbatim and in order; each control from the browser and the CLI; Mark complete usable at once, launching nothing, saving the items as the waiver; a stale page refused; a reply delivered to a real session |
| AC-PREFLIGHT-05 | When the Preflight Is Due; Interfaces | With the skill absent, for each agent: no row before or after Start, and the first session is the phase's |
| AC-PREFLIGHT-06 | Reading the Result | A session ending with neither line, with no final message, and with a failed launch each go on with a No report row; a usage-limit wait and a sleep interruption are resumed and read afterwards |
| AC-PREFLIGHT-08 | Display Contract; Interfaces | Row position on a new branch, a branch with closed phases, after Continue and with every phase closed; header while current; session detail shows the full report |
| AC-ATTEND-01 | Phase Document Lines; Display Contract | Marker on open and closed marked phases on both screens; text shown on hover, focus and press |
| AC-ATTEND-03 | Display Contract | The card on the standard and hand-back pages for a marked phase, absent for an unmarked one |
| AC-ATTEND-04 | Design Decisions | A marked and an unmarked phase launch with identical prompts and options, and the loop never pauses before the marked one |
| AC-ATTEND-05 | Phase Document Lines; Display Contract | Warning names each open phase with the line while the box is off; absent when ticked, when the only such phase is closed, and when no phase has the line |

## Open Questions

None.
