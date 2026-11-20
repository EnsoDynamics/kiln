# Technical Design: Kiln Audit Loop Limits

**PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md) · **Assumptions:** [RUN-001, RUN-002, RUN-003](kiln-audit-loop-limits-assumptions.md) · **Mockup:** [four screens](mockups/kiln-audit-loop-limits.html)

## Overview

Kiln gains three run settings, a loop ledger on the PRD record, and one **loop gate** that every decision to start work after an audit passes through. The gate counts loops, holds the run at a **loop stop** when none of the needed kind is left, and hands the test audit the person's own words once no test loop is left. Two new stop controls, **Allow N more loops** and **Accept what is left and deliver**, start work from a loop stop, from the page and the command line. Claude Code's starting effort for a new PRD becomes Medium.

Everything here is Kiln's. The Enso Method's skills are unchanged: the test audit already accepts Weak rows on a person's words quoted in its prompt with where they were said, and Kiln only quotes them (principles 1, 2 and 5).

## Existing Code

**Posture: Preserve.** Kiln is released and in use.

- Reused: `auditNext` and its routing, unchanged (the gate wraps it, never edits it); `effectiveAudit` as the one reading of a report, accepted or marked complete; the report contract, version 2, with one optional field (§Report Contract); stops on a finished audit's key, as the development-owner check already records; the `settings` control and `kiln settings`; the starting-session dispatch `carry-on` and `start-again` use; the audit and pull request prompt templates; `defaultSettings`, which a reset already restores.
- Kept: Mark complete is offered only where a check fails (AC-WAIVE-02); a `needs_you` report is never accepted; an audit marked complete is not rerun (AC-WAIVE-12). The gate holds after any of these rather than changing them (RUN-001).
- Kept: every stop control that exists today behaves as today at a loop stop, except that Check again or Mark complete leaves a held run held (AC-STOP-02).

## Settings (AC-LOOP-01, AC-LOOP-05, AC-LOOP-06, AC-EFFORT-01)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Settings (two limits, default 4, no third setting).

`Settings` (and so `AgentSettings`) gains:

```
auditLoops:
  deliveryLimit: integer >= 1          — default 3
  testLimit: integer >= 1              — default 3
  afterLastTest: "deliver_unless_serious" | "stop_and_ask"   — default deliver_unless_serious
  afterLastTestSource?:                 — what made afterLastTest what it is; set at Start (below)
    { kind: "person", at: ISO-8601 UTC, where: "documents_found" | "run_page" | "command_line" }
    | { kind: "kiln_for_earlier_run" }  — AC-LOOP-07 only
```

`defaultSettings` returns the defaults, so a first `kiln run` and a reset both get them (AC-LOOP-04's reset clause). Before Start the three values ride in the Documents found draft like the other settings. At Start, `afterLastTestSource` becomes `{ person, at: <Start time>, where: documents_found }` whichever value was showing, because choosing or keeping it on that screen is the person's choice. A later change of `afterLastTest` on the run's page or with `kiln settings` sets a new source with that time, and `where` from the instruction's `via` (§Interfaces): `run_page` for `browser`, `command_line` for `command_line`. Changing only a limit leaves the source alone. A value outside these ranges is a field error on the page and `invalid_input` on the command line; nothing is clamped.

The settings are read fresh at each gate decision, never cached on a loop (AC-LOOP-05).

**Effort.** `defaultSettings` gives Claude Code `medium` instead of `high`. Codex's first-selection default (`high`) and the existing rule that replaces an effort the chosen model does not support are unchanged, and a saved choice is never rewritten.

## The Loop Ledger (AC-LOOP-02 to AC-LOOP-04, AC-SHOW-01)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Loops and the Ledger (a loop is one run of an audit, counted when the audit is allocated; no `allowed` epoch, acceptance or `itemsListedStops`; `atPullRequest`).

`PrdRecord` gains `auditLoops`, append-only like `waivers`:

```
AuditLoopLedger:
  epochs: { kind: "delivery" | "test", at: ISO-8601 UTC, cause: "start" | "allowed" | "upgrade", limit?: integer,
            heldAuditKey?: string }[]   — cause allowed: the held audit key of the stop it cleared
  loops: AuditLoop[]
  acceptances: Acceptance[]
  itemsListedStops: string[]   — audit keys of each `items_listed` stop on an accepted report (§Loop Stops)

AuditLoop:
  kind: "delivery" | "test"
  number: integer          — 1-based within its epoch
  limitAtStart: integer    — the limit in force when it started
  last: boolean            — number >= limitAtStart (past it only for a loop decided on before the limit was lowered); false on an `observed` loop (§Upgrade)
  startedAt: ISO-8601 UTC
  sourceAuditId: string    — the audit whose report this loop acts on
  activityKeys: string[]   — delivery: the leaves built in the loop; test: the audit activity
  sessionId?: string       — test: the session that is the loop
  firstAttempt?: integer   — test: the activity's `attempts.length` when the loop started
  observed?: true          — reconstructed at upgrade (§Upgrade)

Acceptance:                — one per Accept the person gave (AC-STOP-02)
  at, via: "browser" | "command_line", heldAuditKey, sentence, items: { id?, name, problem, action }[]
  activityKey?: string     — the test audit it started; unused while absent. Set in the write that commits
                             the Accept session: `allocateAudit`'s for a new activity, the launch's
                             `started()` at a `needs_you` stop; never by `completeAuditAtOnce`
  sessionId?, firstAttempt? — as on AuditLoop, for the session the Accept started
```

**Item ids.** An `Acceptance.items` entry's `id` is the item's id in the outstanding-items ledger (`personItems`) when Accept is pressed. For an accepted held report it comes from that ledger through the report: an entry relisted by id keeps its id, and new entries take the ledger's ids in listing order. For a `needs_you` held report only an entry's own `id` counts: the report was never accepted and the ledger reads only accepted reports, so an item new there has none.

**Which loop a session belongs to.** An audit activity's `attempts` and `sessionIds` only grow, and one activity can hold more than one loop: a `needs_you` test activity continued by Allow is the loop that wrote that report and then the loop Allow started. So each test loop, and each `Acceptance` that starts a session, records `sessionId` and `firstAttempt` no later than the launch's `started()` write, before its process starts; no report from the new session can precede them. A loop owns the activity's sessions from its `sessionId`, and its attempts from `firstAttempt`, up to the next such marker on that activity. Reply resumes the stopped session and Check again re-reads its report, so both land in the loop they continue. A session's own `Acceptance` is the one that starts it: for a launch from the Accept control, the control's own; for any other launch, including a relaunch after a restart, the `Acceptance` on that activity whose `sessionId` is absent or names the activity's last session record with no run, which `launchSession` reuses. Every other used `Acceptance`, one on the same activity included, is earlier. The session with an own `Acceptance` gets `audit-accept.txt`.

**What starts a loop.** The count of a kind is the number of `loops` of that kind after its latest epoch. An epoch opens when a new execution begins (both kinds): at the first Start, and at each activation of a fresh execution (below); at **Allow N more loops** (that kind); and once at upgrade (§Upgrade). Start after a pause, and a Start from the run's existing feature branch on the Folder missing page (Kiln Missing Worktree Recovery AC-SETUP-05), keep the execution and open none.

- **Delivery (AC-LOOP-02):** the first time Kiln launches a leaf at or under a phase that an audit's effective result appended (`effectiveAudit(...).completionPhases()`), for an audit with no loop yet. One audit's phases, however many and however split, are one loop; later leaves of the same set join its `activityKeys`. Phases appended by a test audit count the same way.
- **Test (AC-LOOP-03):** Kiln starts a test audit session and the latest settled test audit before it counts as `continue_test`, whether the new one is a continuation or a fresh round after a delivery audit in between; or the person's **Allow N more loops** starts a session at a stop whose report saved no test work (§Loop Stops). No other test audit session is a loop, including the session an unused `Acceptance` lets through, even when it continues saved test work (§Loop Stops, AC-STOP-02).

A loop is appended in the same record write that commits Kiln to it, so a crash cannot start a loop without counting it: for a delivery loop, the write that launches its first leaf; for a test loop, the write in which `allocateAudit` adds an activity that will be launched (a pending activity resumed after a restart is already counted). For a session on an unsettled activity (Allow or Accept at a `needs_you` stop), the launch's `started()` writes the whole control in the write that clears the stop: the epoch, limit and loop for Allow; the `Acceptance` with its `activityKey` for Accept. A crash before that write leaves only the stop; after it, a counted pending activity that Kiln relaunches. `completeAuditAtOnce` calls `allocateAudit` without a loop and is never counted, because no session runs (AC-LOOP-03); it doesn't use up an unused `Acceptance` either.

**A continued run starts its own ledger (AC-LOOP-04, RUN-003).** Accepting **Continue with N phases** activates a fresh execution through `activateExecution`, which assembles the new record with empty audit state. That same record write gives it a new ledger holding one `start` epoch per kind at the new record's `startedAt` and nothing else. The old execution's ledger is archived with the rest of its record, so its rows keep their loop labels in history and none of its loops is counted again. The three settings come across with the rest of `Settings`, which `newAcceptance` already copies, `afterLastTestSource` included, so the continued run quotes the choice where and when the person made it. The same activation core serves a base-branch start from the Folder missing page, which is a Start too (Kiln Missing Worktree Recovery AC-SETUP-04), and opens the same epochs.

## The Loop Gate (AC-LOOP-05, AC-DELIV-01, AC-TEST-02)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Routing After the Last Loop (the gate is removed; closing a kind is in `auditNext`).

The gate runs inside the engine's `nextActivity`, after the pending-audit check and before it runs the next leaf or asks `auditNext` for the next audit or final delivery, on the record as it is now. It acts on the first row that fits:

| Situation | Gate |
|---|---|
| The next leaf starts a delivery loop (above) | A delivery loop is left: count it and run the leaf. None left: **delivery loop stop** on the audit that appended it; the phases stay open and unstarted |
| The latest settled test audit's effective result appended phases | Handled by the row above when its phases come up |
| No test loop is left, and the latest settled test audit, with no later delivery audit, counts as `continue_test` | **Test loop stop** on that audit, unless an unused acceptance names it (Accept below), even when `changedImplementation` would route to a delivery audit first |
| No test loop is left, and the latest settled test audit, with no later delivery audit, was accepted (not marked complete) as `passed` while still listing `needsYou` items, and its key is not in `itemsListedStops` | **Test loop stop** with those items, which holds nothing (§Loop Stops), unless an unused acceptance names it |
| `auditNext` asks for a test audit that would be a test loop | Left: count it and allocate. None left: **test loop stop** on the predecessor, unless an unused acceptance names it (§Loop Stops) |
| Otherwise | As today |

A `needs_you` test report is already a `done_check` stop with a failing **Audit work resolved** check. While no test loop is left it is also a test loop stop, a **`needs_you` loop stop** (§Loop Stops, `loopStopOf`), so it gets the loop page and controls; Mark complete stays offered there, as at any failing check. Marking it complete settles those items, so the counted `passed` result goes on as today: AC-STOP-02 holds a run only for added phases or saved test work, which is why the `passed`-with-items row above reads only an accepted report.

The gate's decision is a pure function of the record, settings and effective results. The engine's `nextActivity` applies it and writes the loop or the stop. `forecastNext` asks it about the activity it forecasts, treating the stopped audit as settled with `countedOutcome`, and never writes or rebuilds the ledger. So Check again, `kiln run`, a restart and a changed setting all reach the same decision; nothing is remembered between decisions except the ledger.

## Loop Stops (AC-STOP-01, AC-STOP-02, RUN-001)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Removed Controls (there is no loop stop).

`StopKind` gains `"loop_limit"`, and `PhaseStop` gains:

```
loop?: { kind: "delivery" | "test"; reason: "phases_added" | "test_work_saved" | "items_listed"; heldAuditKey: string }
      — stored only on a loop_limit stop; a needs_you loop stop derives it (loopStopOf)
```

A hold on an accepted or marked-complete report (`phases_added` or `test_work_saved`) is a `loop_limit` stop on the held audit's key, which is already done; the development-owner check records stops on a finished audit's key the same way, so `stoppedPhaseKey`, the status and the activity row need nothing new. An `items_listed` stop on an accepted `passed` report is a `loop_limit` stop the same way, but it holds nothing (AC-STOP-02): it gets the loop page and controls, and Check again clears it (below); the write that records it also appends the audit's key to `itemsListedStops`. `recordStop(key, "loop_limit", [], loop)`, which gains the `loop` parameter, saves `checks: []`, a finished run with `origin: "stop"`, and `loop`. A hold's one reason row, **Audit loop left**, is added by `needsYouView` from `stop.loop`, only for a holding `loop_limit` stop, as it adds the Billing approval row; it is never a stored check, so it is never waivable. `markCompleteOffer` tests for a holding `loop_limit` stop right after its nothing-waiting-or-running check and returns `{ offered: false, reason }` with no `awaitingRecheck`, so the page shows no disabled button (mockup screen 2). At an `items_listed` `loop_limit` stop it takes today's path, which, with no failing check and no recheck run, refuses with "No check has run since … stopped." and no `awaitingRecheck`, as at any stop with no failing check. The reason reads "Kiln is holding because no delivery audit loop is left, not because a check failed. Allow more loops, or raise the limit and Check again."; at a test stop, "Kiln is holding because no test audit loop is left, not because a check failed. Allow more loops, raise the limit and Check again, or accept what is left and deliver."

**`needs_you` loop stops.** `PhaseStop.loop` is stored only on a `loop_limit` stop. For a `done_check` stop on a test audit whose latest recorded attempt is an admitted, unrefused report whose own outcome is `needs_you`, and which appended no phases, the engine's `loopStopOf(key)` derives `{ kind: "test", reason: "items_listed", heldAuditKey: key }` from the ledger and current settings whenever no test loop is left. The snapshot, `kiln status`, control availability and the `not_at_loop_stop` refusals all read it, so a limit raised or lowered at that stop changes the page and controls at once; the status token already includes the settings, so a control offered from a stale page is refused. With no ledger (a rebuild that failed), `loopStopOf` finds no loop stop, and Check again at that stop retries the rebuild as a gate decision would. A `needs_you` loop stop gets no **Audit loop left** row. Every other unresolved attempt also carries `nextAction: needs_you` (a refused or missing report, or an admitted `passed` or `continue_test` report stopped only by a failing repository or development check), so `loopStopOf` reads the report's own outcome instead: such a stop stays the ordinary failing-check stop, as RUN-001 describes. A `needs_you` test report that also appended phases is not a loop stop: it fits AC-TEST-02's first row, so it stays the ordinary Needs you stop a delivery audit's `needs_you` report with phases gets. Marking it complete counts it as passed and keeps the phases it appended (`assignAuditObligations` lets any marked-complete audit own them), so they reach the delivery loop gate, and Mark complete's forecast reads those phases from the latest admitted (unrefused) report.

**Reply and Take over** treat a `loop_limit` stop as a `done_check` stop on a finished audit (`resumeOffered`, the carry-on offer and the takeover target). At a hold (`phases_added` or `test_work_saved`), both reach the held audit's conversation exactly as at a development-owner stop today; afterwards the gate decides as for any other step. Neither counts as a loop. After a takeover of a test audit whose report is a `needs_you` loop stop, Verify cannot pass, so the takeover would stay and the browser would show the hand-back page. So a Verify that ends at a `needs_you` loop stop completes the hand-back (it has already required the conversation's return) and clears `liveControl`, as a Verify that accepts a holding stop's report does; the page then shows the loop page. Allow or Accept given there before Verify first requires the same return (the carry-on ownership check for a hold whose conversation can't be reopened) and clears `liveControl` before dispatch, so the session it starts is Kiln's own; until the return is possible it fails with `takeover_pending` or `terminal_in_use` and starts nothing.

At a stored `items_listed` stop (a `loop_limit` stop on an accepted `passed` report), which holds nothing, the check Reply runs first clears the stop, as it clears a development-owner stop whose check now passes. So Reply resumes no conversation there and the run carries on as after Check again; its note is not delivered, as at any stop whose check clears. So the page offers no Reply at a stored `items_listed` stop (AC-STOP-02); at a `needs_you` loop stop, whose audit has not finished, it offers Reply as at any Needs you stop, and a person who wants the audit's conversation uses Take over; a `reply` command sent there behaves as above.

**Check again** on a `loop_limit` stop, and the recheck that Reply runs first, reruns the gate in a `recheckStop` branch of its own, ahead of its final `doneCheck` fallback. At a hold: if a loop of that kind is now left (a raised limit), the stop clears and the loop starts; otherwise the stop stays and `updateStop(key, [], false)` saves a new finished `recheck` run, with no completion rows rerun. At an `items_listed` stop on an accepted `passed` report, which holds nothing, Check again (or `kiln run`) clears the stop whatever the limits, and the run carries on as it does today: the gate finds the audit's key in `itemsListedStops` and does not stop on it again, `auditNext` returns the delivery audit, since that report changed implementation (one that changed none lists no items, Accept step 3), and then a new test round, which is not a loop and takes no Allow note, because only an epoch with `cause: allowed` naming the held audit marks a round as one. `recheckRunsCompletion` returns false for `loop_limit`, so the page never says Check again runs the audit's completion checks. A held Check again settles `completion_checks_failed` with the hold reason.

A **Mark complete** at a stop on an audit with a failing check, a `needs_you` loop stop included, completes the audit as AC-WAIVE-12 says and then reaches the gate like any other step, which holds again when its counted result added phases or saved test work and no loop of that kind is left. That is RUN-001's assumption, built as the open entry states it; routing needs no special case, and only the offer's wording forecasts the hold. When the gate would hold, the offer's `nextActivity` (bots' `next_activity`) is `{ kind: "loop_stop", key: <stopped audit key>, title: "Delivery audit loop stop" | "Test audit loop stop" }`, and its `next` reads "counts the audit as its report says, then stops at Needs you because no delivery audit loop is left to build the phases it added" ("as passed" with no report, as today), or for a test hold "… because no test audit loop is left to continue its test work". With no ledger, `next` stays "moves to the next step".

**Which session a stop control starts.** A `needs_you` report is never accepted, so its activity is unsettled and can take a new report: Allow and Accept at that stop start a new audit session on the stopped activity. `requestedLaunch` gains `kind: "audit"`, which `launchAtStop` handles in a branch of its own the way `runAuditSession` starts an audit: it records the start commits, emits the audit's `started` event and launches the activity's kind with `auditPrompt(activity)`, saving the control in `started()` (§The Loop Ledger), with no `startedAs`. `auditPrompt` fills `{{loops}}` from the ledger as `started()` will save it, so a relaunch after a restart rebuilds the same prompt. Reply at that stop keeps its own path, resuming the same conversation. A report at the stop that was accepted or marked complete has a settled activity, which refuses any further report (`result_conflict`); so does every delivery loop stop. At those stops neither control starts anything itself. In one record write it saves its epoch and limit (Allow) or its `Acceptance` (Accept), clears the `loop_limit` stop and stamps `controlApplied` with its operation ID, as Mark complete saves its waiver. Once the receipt settles, the gate starts what the record now asks for: the appended leaf, with the delivery loop counted in the write that launches it; the continuation `auditNext` asks for after a `test_work_saved` report, counted (Allow) or let through and marked used (Accept) in `allocateAudit`'s write; or, when the stop's report changed implementation, the delivery audit first (below).

When the stop's test report was accepted with `changedImplementation: true` (every `items_listed` stop on an accepted `passed` report, and a `test_work_saved` stop whose `continue_test` report also changed implementation), a test audit allocated straight after it would vouch for the chain back to the last delivery audit, since `untouchedBetweenAudits` sees only test changes between them, and `auditNext` would skip the delivery audit the implementation change requires. So there the gate, once the control's receipt settles, asks `auditNext`, which returns `delivery_audit` (AC-NEUTRAL-06). That delivery audit is not a loop; if it appends phases, they pass through the delivery loop row as usual. Once it passes, the test audit `auditNext` asks for, a new round, is the session the control started: it carries the Allow's prompt or the Accept prompt, and an Allow's is counted as a test loop while an Accept's is not. Kiln recognises it because the epoch with `cause: allowed` (its `heldAuditKey`), or the unused `Acceptance` (its `heldAuditKey`), names the held stop, and the first test audit allocated after it is that session.

**Allow N more loops** (`allow-more-loops`, `count` ≥ 1):

1. Sets that kind's limit to N in settings and opens an epoch with `cause: allowed` naming the stop's held audit.
2. At a `loop_limit` stop, as above.
3. A test loop stop whose report saved no test work (`items_listed`) gets a test audit session with the loop prompt (§Prompts), counted as a test loop, as above.

**Accept what is left and deliver** (`accept-and-deliver`), offered only at a test loop stop:

1. Builds the Accept sentence from the stop's listed items (§Prompts) and appends an `Acceptance`.
2. Leads to a test audit session with the Accept prompt, as above. At a `test_work_saved` stop whose report did not change implementation, that is a continuation of the held audit, which `allocateAudit` admits because the held audit is the latest test audit and counts as `continue_test`; when the report changed implementation, it is the new round after the delivery audit. Either way the gate lets it through because the acceptance names that stop, and the acceptance is marked used (its `activityKey`) in the write that commits the session (§The Loop Ledger). It is not a loop.
3. Its report is gated like any other, which is AC-TEST-02 since no test loop is left. A continuation's `continue_test` must change work other than Markdown beside the PRD (`validate-report`), which an Accept session that fixes nothing cannot. A `passed` report that changed no implementation must already have an empty `needsYou` and account for every outstanding item by id in `needsYou` or `settled`, so the Accept prompt has it settle each outstanding item its words accept and report `passed` only when they accept everything left, and `needs_you` otherwise (§Prompts). A `continue_test` it writes anyway, or a `passed` report that leaves an outstanding item out, is refused at admission, visibly, like any invalid report.

Take over and Reply are unchanged. Allow and Accept never catch the branch up and take no `--leave-branch-as-is`: run restart's AC-CURRENT-01 covers a stopped phase's session, and a loop stop is on a finished audit whose page has no catch-up offer, so both stay out of the engine's catch-up actions. Both new actions refuse (`not_at_loop_stop`) anywhere else, and Accept refuses at a delivery loop stop.

## Report Contract (AC-LOOP-06)

The Accept sentence names a row by its criterion's ID. Kiln does not parse prose to find one, so each `needsYou` entry in the version-2 report gains an optional `criterion` (the acceptance criterion's ID when the item is that criterion's test row). The audit prompt's `needsYou` line and `REPORT_FIELDS` name `criterion?`; admission checks only that it is a non-empty string when present. Older readers already ignore unknown fields.

An item relisted by id need not repeat it, so `PersonItem` gains `criterion?`, set from the entry that first lists the item and replaced only when a relisting gives one (`entry.criterion ?? item.criterion`); `SettledPersonItem` inherits it. `outstandingLines` adds `; criterion AC-X` after "listed by …", so the audit can repeat it.

## Prompts (AC-LOOP-06, AC-TEST-01, AC-TEST-03, AC-STOP-02)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Prompts (no loop-limit or acceptance text; `{{nextSteps}}`).

Four templates join `prompts/`. Three fill a new `{{loops}}` slot of `audit-session.txt` (empty when nothing applies), in the order listed, with the Allow note below last; the fourth, `pull-request-loop-acceptance.txt`, serves the pull request session (**What a session carried**, below). Every session Allow or Accept starts, at any stop, builds from `auditPrompt`, so this slot reaches it:

- **`audit-loop-limits.txt`**, for a test audit session that is the last test loop, or that Kiln starts once no test loop is left (including an Accept session): no more test audit loops follow; the limit; the **After the last test audit loop** choice, with "applied by Kiln because this run began before the setting existed" when the source is `kiln_for_earlier_run`. Under `deliver_unless_serious` it quotes, word for word as the person's, "I accept the remaining Weak rows after the last test audit loop.", with where and when (`afterLastTestSource`). Under `stop_and_ask` it carries nothing more from the setting.
- **`audit-earlier-acceptances.txt`**, for every test audit session before delivery whenever a used `Acceptance` (one with `activityKey`) exists other than the session's own (§The Loop Ledger, "Which loop a session belongs to"), including a non-last loop after Allow: quotes each such sentence as the person's, with its page or command line and time.
- **`audit-accept.txt`**, for the session whose own `Acceptance` it is (§The Loop Ledger): quotes its sentence as the person's, with where and when; lists each item as the audit wrote it, with the id beside each item still in the session's outstanding list (`{{outstanding}}`); and says to fix nothing, to record what those words accept, and to list by name, as a `needsYou` item, every row or item they do not accept. The words accept only the Weak rows and the items they name; a row the test audit grades Missing, a failing test, or a weak high-risk criterion the audit did not list as an item is not accepted by them. So the session is to:
  - put each outstanding item the words accept in `settled`, with its id and a `how` quoting the sentence with where and when;
  - put every outstanding item the words do not accept, including any a later audit added, in `needsYou` with its id;
  - leave out an accepted item with no id, since the sentence names it and the pull request line carries it;
  - put every other row or item the words do not accept, one with no id included, in `needsYou` without an id, naming it (a row by its criterion's ID, also given as `criterion`);
  - report `passed` only when `needsYou` is empty, and `needs_you` otherwise (§Loop Stops).

  Kiln sorts nothing. Accepted outstanding items then reach "Settled during the build" through the existing pull request person-items block.

The Allow session at an `items_listed` stop gets a short note in the same slot: the person allowed more test audit loops to fix what the previous report listed, followed by that report's items.

**The Accept sentence.** "I accept the remaining Weak rows, and A, B and C." naming each item by the entry's `criterion`, then the outstanding item's (by its id), then its `problem`, joined with commas and a final "and"; with no listed items, "I accept the remaining Weak rows." It is built once, stored on the `Acceptance`, and shown, quoted and returned by status from there.

**What a session carried.** The session record gains `carried?: { sentence, source }[]`, written at launch with the prompt: every sentence its prompt quotes, the setting's, each earlier `Acceptance`'s and its own Accept's. `pull-request-loop-acceptance.txt` is filled from the latest session, by `createdAt`, in the current execution whose `carried` is non-empty. It quotes every sentence in that session's `carried`, each as the person's with where and when, and adds the `summary` of that session's activity's accepted report, leaving it out when the activity has none (marked complete). `pullRequestPromptValues` gains a `loopAcceptance` value beside `personItemsForDelivery`; `pullRequestSessionPrompt` appends it after the person-items block in both the pull request and development-finalization paths.

## Interfaces (AC-STOP-03)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Interfaces (no loop stop commands; the two limits, `check-for-new-phases` and `continue-with-phases`).

**Control journal.** `settings` takes `delivery_audit_loops`, `test_audit_loops` and `after_last_test_audit_loop` (`deliver_unless_serious | stop_and_ask`) beside `keep_awake`; the receipt's `settings` echo includes them, and the receipt validator accepts a receipt saved before them without the new fields. New actions `allow-more-loops` (`{ count }`) and `accept-and-deliver` (`{ via }`) join `STARTING_ACTIONS`, so a session either one dispatches settles `started`, never `resumed`. At a `needs_you` stop each dispatches the new audit session under its own receipt, as `carry-on` does (`controlDispatch`, `requestedLaunch` of kind `audit`), and settles `session_started` or `dispatch_not_started`. At every other loop stop it dispatches nothing. Its one record write stamps `controlApplied` with `loops_allowed` or `acceptance_recorded`, and the receipt settles `completed` with session `not_started` and plan `not_advanced`, as `continue` does. Only then does the deferred kick run the gate, which starts the session under Kiln's automatic receipt; the control never sets `controlDispatch`. After a restart, a receipt that `controlApplied` names settles with that outcome. One still `applying` with its stop in place saved nothing and settles `failed`, `not_applied`, as an interrupted Mark complete does. The two outcome names stay out of the plan-advanced outcome list and are declared in the two new commands' entries in `prompts/kiln-command-contracts.json`, beside the existing stop commands. `accept-and-deliver`, and a `settings` instruction that carries `after_last_test_audit_loop`, take `via: "browser" | "command_line"`, as `waive-and-advance` does, because the receipt's `source` is `caller` for both the page and the CLI and cannot say where the person was. The page's routes set `browser`. The control route sets `command_line` and refuses a `via` from the caller. The CLI's local instruction check skips these, as it does for `waive-and-advance`. Saved `settings` receipts without the new field still validate. Kiln records `browser` as `where: run_page` for a settings change and as `Acceptance.via: "browser"` for an Accept, matching `WaiverSource`. `allow-more-loops` takes no `via`, since it quotes no sentence. The controller advertises an `audit_loops` feature; the CLI refuses with `instance_incompatible` against a controller without it.

**Command line.**

```
kiln settings <prd> [--delivery-audit-loops N] [--test-audit-loops N]
                    [--after-last-test-audit-loop deliver|ask]   (with the existing flags)
kiln allow-more-loops <prd> --loops N --only-if-status-matches <token> [--command-id ID]
kiln accept-and-deliver <prd> --only-if-status-matches <token> [--command-id ID]
```

`kiln settings` with no flags prints all of them, leading with the **After the last test audit loop** choice in words, the sentence Deliver gives and where and when it was chosen; its JSON adds `after_last_test_audit_loop_sentence` (null under `stop_and_ask`) and `after_last_test_audit_loop_chosen` (AC-LOOP-06). `kiln status` gives the choice the same words. As today, there is no command-line form before Start. `--command-id` is required, as on every changing command; the brackets above mark it as the caller's own ID, not an optional flag.

**HTTP.** `POST /api/settings` accepts `auditLoops` (partial) and routes a started run's change through the `settings` control, as `keepAwake` does, setting `via: "browser"` when the change carries `afterLastTest`; before Start it is a draft field. The two new actions get page routes of their own, as Mark complete has `POST /api/mark-complete`, which submit to the control journal with the page's status token and command ID, `accept-and-deliver`'s with `via: "browser"`; the CLI reaches both through the control route.

**Snapshot and `kiln status`.** Both gain:

```
auditLoops:
  settings: { deliveryLimit, testLimit, afterLastTest, afterLastTestSource }
  delivery: { used, limit }
  test: { used, limit }
  stop?:                       — at a loop stop
    kind, heading              — "Delivery audit loops used: 3 of 3"
    loops: { label, activity, did, durationMs, observed? }[]   — each loop in the current count, then each audit session since;
                                                      durationMs, did and observed as for an activity's loop (§Display Contract)
    audit: { summary, items: { name, problem, action }[] }   — the latest audit, as it wrote them
    afterLastTest?             — test stops only
    acceptSentence?            — test stops only, the sentence Accept would quote
```

The stop's `controls` list adds the two actions with availability and reason. Mark complete's offer `nextActivity` gains kind `loop_stop` (§Loop Stops). `kiln status` text prints the counts on one line, and at a loop stop the heading, the loops, the audit's summary and items and the available controls.

## Display Contract (AC-LOOP-01, AC-STOP-01, AC-SHOW-01, AC-TEST-03)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §The Status Line (no loop stop page; the status line names the loop).

- **Documents found and the run's settings panel:** the **Audit loops** section of mockup screens 0 and 1, help text computed from the values shown; Effort's help line as screen 0.
- **Activity rows:** `PhaseView` gains `loops?: { number, limit, last, sessionId?, observed? }[]` (`sessionId` on test loops, `observed` copied from the ledger loop) from the ledger (each with the limit in force when it started), one per loop the activity holds (§The Loop Ledger, "Which loop a session belongs to"). The row reads by the latest: **loop N of M**, or **last loop** when `last`. The detail lists each loop with its time, `runTiming` over its own sessions' runs, and what it did: its latest attempt holding a report, as the outcome in words, then that report's `summary`, absent when it left none. A delivery loop names the phases it built. A row whose session carried a sentence says which one, and its detail quotes it. A loop with `observed` adds "counted from this run's history when Kiln was upgraded" to its entry in the detail, and to its line on a stop page (§Upgrade).
- **Needs you:** a loop stop (a `loop_limit` stop, or a `needs_you` loop stop by `loopStopOf`) renders mockup screens 2 and 3 from `auditLoops.stop`, with no ranking or judgment of Kiln's. A holding `loop_limit` stop shows the **Audit loop left** row and Mark complete's refusal reason (§Loop Stops). **Allow _N_ more loops** takes N, filled in as 2. A session an `Acceptance` started (§The Loop Ledger, "Which loop a session belongs to") is a line of its own, **Accept session**, with its own sessions' time and what it did, never part of the loop or audit session before it on the same activity.

## Upgrade (AC-LOOP-07, RUN-002)

Superseded in part by: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Upgrade (schema 24 rebuilds the loops as audit runs).

Schema 22, in two steps, because `migrateRecord` sees only the record while the audit history lives in the audit store and session records:

- **Record migration** (`migrateRecord`, run once when a schema-21 record is read). **Not started:** the defaults, as for a new record; the person sees the panel before Start. **Started:** limits 3 and 3, `afterLastTest: stop_and_ask` with `afterLastTestSource: kiln_for_earlier_run`, and no `auditLoops` ledger yet.
- **Ledger reconstruction**, by the Engine constructor right after `activityHistory` rebuilds `record.activities` from the state directory, so a run sitting at a stop shows its counts before any decision: a started record with no ledger gets one rebuilt from its own execution's saved audit history, never an archived execution's (RUN-002), with one `upgrade` epoch per kind at the run's `startedAt`, each loop `observed`, stored by the constructor's closing save:
  - a delivery loop for each audit whose effective result appended phases of which at least one leaf has a session or is done;
  - a test loop for each test audit activity whose latest settled test predecessor counts as `continue_test`, and whose session ran or which is still pending; one `completeAuditAtOnce` settled with no session is not a loop (AC-LOOP-03).

  Observed loops take `limitAtStart` 3, the migrated limit, numbered per kind in activity order. `last` is false on every observed loop: no limit allowed it and its prompt never said no loop follows (AC-TEST-01, AC-TEST-03). So rows read **loop N of 3**, past the limit too (**loop 4 of 3**), and the stop heading counts them all (**Test audit loops used: 5 of 3**), never clamped. An observed loop's detail and stop-page line: §Display Contract.

  Leaves at or under an appended phase come from `record.plan`. If the rebuild throws, the ledger stays absent and the first gate decision retries it; if that retry fails too, the run stops visibly on the error. It never guesses a count.

Only a record carried over from schema 21 lacks a ledger: Start and `activateExecution` write their `start` epochs in the write that begins the execution, so a continued run's fresh record is never mistaken for an upgraded one, even when the finished run it continues was a schema-21 record. A continuation already activated before the upgrade is rebuilt from its own execution only.

A run already past a limit stops at its next gate decision, right after the restart that brought it to the new Kiln. Schema-21 Kilns refuse schema 22 under the existing newer-schema rule; there is no downgrade path.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Admission (`nextAction` and the advance on `completion_phases` and `continue_test` now pass through the loop gate) and §Report contract, version 2 (`needsYou` entries take an optional `criterion`, which the outstanding-items ledger keeps across relisting).

Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Audits Marked Complete (appended phases of a waived audit run first only while a delivery loop is left; a counted `continue_test` continues only while a test loop is left).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Start, interruption and completion (completion phases audits add after a continuation pass through the loop gate) and §Data Models and Migration (the fresh execution also starts its loop ledger with a `start` epoch per kind; the loop settings carry with the other settings).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (two more changing commands, `allow-more-loops` and `accept-and-deliver`, whose receipts settle `started`; `kiln settings` takes the three loop settings).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API (`POST /api/settings` takes `auditLoops`, changeable after Start; two new stop routes; `POST /api/check-again` at a loop stop starts nothing the gate refuses), §Snapshot (`auditLoops`) and §Account and Usage, Effort (Claude Code defaults to `medium`).

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Screens (AC-SHOW-01) (Documents found and the run's settings gain the **Audit loops** section, and a loop stop gets its own page; the rest of each layout remains).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (completion phases an audit appended and a saved test continuation start only through the loop gate while a loop of that kind is left; otherwise the run holds at a loop stop, beside pause, interruption, usage wait and blocker; once no test loop is left, a passing test report that still lists items stops the run at Needs you until Check again) and §Progress and Detail Contract (completion-phase and test audit rows that are part of a loop also show **loop N of M** or **last loop**, and the loop in their detail).

Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Activity-specific evaluate, then act (at a takeover audit's loop stop that holds (phases added or test work saved), Verify or explicit advance accepts the report but the run holds there; the next work waits for Allow N more loops, a raised limit and Check again, or Accept what is left and deliver).

## Delivery

- **After the build:** a `CHANGELOG.md` entry under Unreleased (`Added`: audit loop limits; `Changed`: Claude Code starts at Medium effort); release through the usual release steps.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions writing version-2 reports, the packaged CLI against the local server, and the real browser view. No paid model calls.

| Criteria | Design | Named proof |
|---|---|---|
| AC-LOOP-01, AC-EFFORT-01 | Settings; Display | Documents found shows the three settings with defaults and live help text; a new Claude Code PRD shows Medium, a Codex one High, a saved PRD keeps its effort |
| AC-LOOP-02, AC-LOOP-03 | Loop Ledger | Phases from one delivery audit, split into leaves, are one loop; phases a test audit appended count as a delivery loop; a continuation and a fresh round after a delivery audit following `continue_test` are test loops; a test audit after a passing one, an Accept session, and an audit completed at once under a waived readiness problem are not; an Allow at a `needs_you` stop interrupted before its launch's `started()` leaves only the stop, and after it a counted pending activity that relaunches |
| AC-LOOP-04, AC-LOOP-05, RUN-003 | Ledger epochs; Gate | Allow restarts the count; reset returns defaults and zero counts; lowering a limit mid-session stops at the next decision; raising it during a `phases_added` or `test_work_saved` hold starts the loop at Check again and at `kiln run`; Start after a pause, and a Start from the run's existing feature branch on the Folder missing page, keep both counts, while a base-branch Start there starts both at zero; a run that used both limits and is continued with **Continue with N phases** starts both counts at zero with its three settings and their source unchanged, builds its first audit-added phases without a stop, and its archived rows keep their loop labels |
| AC-LOOP-06 | Settings; Prompts | The sentence and its source in each prompt that quotes it, for a Documents found choice, a page change and a `kiln settings` change; the Accept sentence with criterion IDs and audit-worded items, including a criterion given only on an item's first listing and carried through a relisting by id; after an Accept and then an Allow, a non-last test loop's prompt quotes the earlier Acceptance and its session's `carried` lists it |
| AC-LOOP-07, RUN-002 | Upgrade | A schema-21 started run with three continuations stops at its first decision; its prompts carry the Kiln-applied choice; a not-started record gets the defaults; a schema-21 finished run continued after the upgrade gets `start` epochs, not a reconstructed ledger; an upgraded run sitting at a stop shows its rebuilt counts in status before any Check again; an upgraded run with 5 test continuations reads **Test audit loops used: 5 of 3**, its rows **loop 4 of 3** and **loop 5 of 3** with the upgrade annotation, and none **last loop** |
| AC-DELIV-01 | Gate; Loop Stops | The fourth audit's phases stay open and unstarted at a delivery loop stop with no Mark complete offered |
| AC-TEST-01 | Prompts | Last-loop and post-limit prompts under both choices, including a fresh test round after the limit |
| AC-TEST-02 | Gate | Each table row once no test loop is left: phases added, passed, `passed` with items, `needs_you`, `continue_test` with and without `changedImplementation` |
| AC-TEST-03 | Prompts; Display | Rows and details for the last loop and for sessions carrying each sentence; the pull request prompt quotes both sentences a session carried (the setting's and its Accept's) with its report's summary, in the pull request and development-finalization paths |
| AC-STOP-01 | Snapshot; Display | Both stop pages match mockup screens 2 and 3 from a scripted run; a `needs_you` test activity continued by Allow lists both its loops on the stop page, each with its own time and summary |
| AC-STOP-02, RUN-001 | Loop Stops | Each control at each stop reason; Check again and Mark complete leave a held run held; Accept's prompt and its report's routing; an Accept session's `passed` report settling each accepted outstanding item by id is admitted and those items reach "Settled during the build", and one leaving an accepted id out is refused; Allow and Accept after a `changedImplementation` report (an accepted `passed` report with items, and a `continue_test`) run a delivery audit first, then start their session as the next test round; at a `needs_you` loop stop, Allow and Accept launch a new audit session on the stopped activity whose prompt carries the `{{loops}}` text, and a restart before it starts relaunches with the same prompt; neither offers a branch catch-up; at a holding `loop_limit` stop Mark complete's refusal reason names the missing loop with no disabled button and the page shows **Audit loop left**, which a `needs_you` loop stop does not; at an `items_listed` stop on an accepted `passed` report, with the limits unchanged, the page shows the loop page with Allow and Accept, no **Audit loop left** row and no disabled Mark complete, and Check again or `kiln run` clears the stop, runs the delivery audit, then a test round not counted as a loop, and never stops on that audit again; the page offers no Reply there, and a `reply` command clears the stop the same way, resumes no conversation, and the run carries on (delivery audit, then an uncounted test round); a `loop_limit` stop stores no check rows, and a held Check again there saves a new `recheck` run, settles `completion_checks_failed` with the hold reason, and the page never says it runs completion checks; at a failing-check stop whose audit added phases with no delivery loop left, Mark complete's offer forecasts the loop stop in `next` and `next_activity`, and with no ledger reads "moves to the next step"; raising or lowering the test limit at a `needs_you` stop shows or removes the loop page and controls without a Check again, and a control from the stale page is refused |
| AC-STOP-03 | Interfaces | Every control and view through the CLI, with stale token, wrong stop and incompatible controller refusals; a `via` sent by a caller to the control route is refused; an **After the last test audit loop** change and an Accept from the page record `run_page` and `browser`, and from the CLI record `command_line`; a `settings` receipt saved without `via` still loads; at a `loop_limit` stop Allow and Accept settle `completed` with session `not_started`, and the gate then starts the session under an automatic receipt; an interrupted Allow or Accept whose stop is still in place settles `not_applied` |
| AC-SHOW-01 | Display | **loop 2 of 3** and **last loop** on phase and test audit rows; a `needs_you` test activity continued by Allow of 2 reads **loop 1 of 2** on its row, and its detail shows **last loop** then **loop 1 of 2**, each with its own time and summary |

## Open Questions

- RUN-001 is open with the stakeholder. If they choose the alternative, Mark complete on an audit stopped by a failing check, whose report added phases or saved test work while no loop of that kind is left, also sets that kind's limit to one more than the loops counted since its latest epoch, in the waiver's record write, and the stop page says so beside the button. The gate then finds a loop left, as for a raised limit (AC-LOOP-05), and that loop is the last; no epoch opens, so the gate and ledger are unchanged. The offer's `next` then reads "…and allows one more delivery audit loop to build the phases it added" (or test audit loop, to continue its test work) instead of forecasting a stop.
- RUN-002 is the project team's decision, open to the stakeholder's correction. If they choose the alternative, §Upgrade's ledger reconstruction is dropped: a started schema-21 record gets one `upgrade` epoch per kind and no loops, so its counts start at zero.
- RUN-003 is open with the stakeholder. If they choose the alternative, `activateExecution` copies the ledger forward into the continued execution with no `start` epoch, so a continued run that had used its loops stops at the first phases or test work an audit adds; the gate is unchanged.
