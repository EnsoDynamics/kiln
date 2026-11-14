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

`Settings` (and so `AgentSettings`) gains:

```
auditLoops:
  deliveryLimit: integer >= 1          — default 3
  testLimit: integer >= 1              — default 3
  afterLastTest: "deliver_unless_serious" | "stop_and_ask"   — default deliver_unless_serious
  afterLastTestSource:                  — what made afterLastTest what it is
    { kind: "person", at: ISO-8601 UTC, where: "documents_found" | "run_page" | "command_line" }
    | { kind: "kiln_for_earlier_run" }  — AC-LOOP-07 only
```

`defaultSettings` returns the defaults, so a first `kiln run` and a reset both get them (AC-LOOP-04's reset clause). Before Start the three values ride in the Documents found draft like the other settings. At Start, `afterLastTestSource` becomes `{ person, at: <Start time>, where: documents_found }` whichever value was showing, because choosing or keeping it on that screen is the person's choice. A later change of `afterLastTest` on the run's page or with `kiln settings` sets a new source with that time, and `where` from the instruction's `via` (§Interfaces): `run_page` for `browser`, `command_line` for `command_line`. Changing only a limit leaves the source alone. A value outside the table is a field error on the page and `invalid_input` on the command line; nothing is clamped.

The settings are read fresh at each gate decision, never cached on a loop, which is all AC-LOOP-05 needs: a change while a session runs applies at the next decision.

**Effort.** `defaultSettings` gives Claude Code `medium` instead of `high`. Codex's first-selection default (`high`) and the existing rule that replaces an effort the chosen model does not support are unchanged, and a saved choice is never rewritten.

## The Loop Ledger (AC-LOOP-02 to AC-LOOP-04, AC-SHOW-01)

`PrdRecord` gains `auditLoops`, append-only like `waivers`:

```
AuditLoopLedger:
  epochs: { kind: "delivery" | "test", at: ISO-8601 UTC, cause: "start" | "allowed" | "upgrade", limit?: integer,
            heldStopKey?: string }[]   — cause allowed: the held audit key of the stop it cleared
  loops: AuditLoop[]
  acceptances: Acceptance[]

AuditLoop:
  kind: "delivery" | "test"
  number: integer          — 1-based within its epoch
  limitAtStart: integer    — the limit in force when it started
  last: boolean            — number == limitAtStart
  startedAt: ISO-8601 UTC
  sourceAuditId: string    — the audit whose report this loop acts on
  activityKeys: string[]   — delivery: the leaves built in the loop; test: the audit activity
  sessionId?: string       — test: the session that is the loop
  observed?: true          — reconstructed at upgrade (§Upgrade)

Acceptance:                — one per Accept the person gave (AC-STOP-02)
  at, via: "browser" | "command_line", stopActivityKey, sentence, items: { name, problem, action }[]
  activityKey?: string     — the test audit it started; unused while absent. Set in the write that commits
                             the Accept session: `allocateAudit`'s for a new activity, the launch's
                             `started()` at a `needs_you` stop; never by `completeAuditAtOnce`
```

**What starts a loop.** The count of a kind is the number of `loops` of that kind after its latest epoch. An epoch opens at Start (both kinds), at **Allow N more loops** (that kind), and once at upgrade (§Upgrade).

**A continued run starts its own ledger (AC-LOOP-04, RUN-003).** Accepting **Continue with N phases** activates a fresh execution through `activateExecution`, which assembles the new record with empty audit state. That same record write gives it a new ledger holding one `start` epoch per kind at the new record's `startedAt` and nothing else. The old execution's ledger is archived with the rest of its record, so its rows keep their loop labels in history and none of its loops is counted again. The three settings come across with the rest of `Settings`, which `newAcceptance` already copies, `afterLastTestSource` included, so the continued run quotes the choice where and when the person made it. The same activation core serves a base-branch start from the Folder missing page, which is a Start too (Kiln Missing Worktree Recovery AC-SETUP-04), and opens the same epochs.

- **Delivery (AC-LOOP-02):** the first time Kiln launches a leaf at or under a phase that an audit's effective result appended (`effectiveAudit(...).completionPhases()`), for an audit with no loop yet. One audit's phases, however many and however split, are one loop; later leaves of the same set join its `activityKeys`. Phases appended by a test audit count the same way.
- **Test (AC-LOOP-03):** Kiln starts a test audit session and the latest settled test audit before it counts as `continue_test`, whether the new one is a continuation or a fresh round after a delivery audit in between; or the person's **Allow N more loops** starts a session at a stop whose report saved no test work (§Loop Stops). No other test audit session is a loop.

A loop is appended in the same record write that commits Kiln to it, so a crash cannot start a loop without counting it: for a delivery loop, the write that launches its first leaf; for a test loop, the write in which `allocateAudit` adds an activity that will be launched (a pending activity resumed after a restart is already counted). For a session on an unsettled activity (Allow or Accept at a `needs_you` stop), the launch's `started()` writes the whole control in the write that clears the stop: the epoch, limit and loop for Allow; the `Acceptance` with its `activityKey` for Accept. A crash before that write leaves only the stop; after it, a counted pending activity that Kiln relaunches. `completeAuditAtOnce` calls `allocateAudit` without a loop and is never counted, because no session runs (AC-LOOP-03); it doesn't use up an unused `Acceptance` either.

## The Loop Gate (AC-LOOP-05, AC-DELIV-01, AC-TEST-02)

The gate runs inside the engine's `nextActivity`, after the pending-audit check and before it runs the next leaf or asks `auditNext` for the next audit or final delivery, on the record as it is now. It acts on the first row that fits:

| Situation | Gate |
|---|---|
| The next leaf starts a delivery loop (above) | A delivery loop is left: count it and run the leaf. None left: **delivery loop stop** on the audit that appended it; the phases stay open and unstarted |
| The latest settled test audit's effective result appended phases | Handled by the row above when its phases come up |
| No test loop is left, and the latest settled test audit, with no later delivery audit, counts as `continue_test` | **Test loop stop** on that audit, unless an unused acceptance names it (Accept below), even when `changedImplementation` would route to a delivery audit first |
| No test loop is left, and that test audit's report was accepted (not marked complete) as `passed` while still listing `needsYou` items | **Test loop stop** with those items, unless an unused acceptance names it |
| `auditNext` asks for a test audit that would be a test loop | Left: count it and allocate. None left: **test loop stop** on the predecessor, unless it is the session an unused acceptance started (§Loop Stops) |
| Otherwise | As today |

A `needs_you` test report is already a stop with a failing **Audit work resolved** check. When no test loop is left at that moment, the stop is also marked as a test loop stop (`PhaseStop.loop`, below), so it gets the loop page and controls; Mark complete stays offered there, as at any failing check. Marking it complete settles those items, so the counted `passed` result goes on as today: AC-STOP-02 holds a run only for added phases or saved test work, which is why the `passed`-with-items row above reads only an accepted report.

Because the gate reads only the record, settings and effective results, Check again, `kiln run`, a restart and a changed setting all reach the same decision; nothing is remembered between decisions except the ledger.

## Loop Stops (AC-STOP-01, AC-STOP-02, RUN-001)

`StopKind` gains `"loop_limit"`, and `PhaseStop` gains:

```
loop?: { kind: "delivery" | "test"; reason: "phases_added" | "test_work_saved" | "items_listed"; heldAuditKey: string }
```

A hold on an accepted or marked-complete report (`phases_added`, `test_work_saved`, or `items_listed` from an accepted `passed` report) is a `loop_limit` stop on the held audit's key, which is already done; the development-owner check records stops on a finished audit's key the same way, so `stoppedPhaseKey`, the status and the activity row need nothing new. Its one reason row, **Audit loop left**, is added by `needsYouView` from `stop.loop`, only for a `loop_limit` stop, as it adds the Billing approval row; it is never stored in `stop.checks` or `stop.run`, so it is never waivable and Mark complete is not offered, matching the mockup's delivery stop. There `markCompleteOffer`'s refusal reason says Kiln is holding because no loop of that kind is left, not that every check passed. An `items_listed` stop from a `needs_you` report stays a `done_check` stop with `loop` set and gets no such row.

**Reply and Take over** treat a `loop_limit` stop as a `done_check` stop on a finished audit (`resumeOffered`, the carry-on offer and the takeover target), so they reach the held audit's conversation exactly as at a development-owner stop today; afterwards the gate decides as for any other step. Neither counts as a loop.

**Check again** on a `loop_limit` stop, and the recheck that Reply runs first, reruns the gate in a `recheckStop` branch of its own: if a loop of that kind is now left (a raised limit), the stop clears and the loop starts; otherwise it stays, with a new check run. A **Mark complete** at a `done_check` loop stop completes the audit as AC-WAIVE-12 says and then reaches the gate like any other step, which holds again when its counted result added phases or saved test work and no loop of that kind is left. That is RUN-001's assumption, built as the open entry states it; it needs no special case.

**Which session a stop control starts.** A `needs_you` report is never accepted, so its activity is unsettled and can take a new report: Allow and Accept at that stop start a new audit session on the stopped activity. `requestedLaunch` gains `kind: "audit"`, which `launchAtStop` handles in a branch of its own the way `runAuditSession` starts an audit: it records the start commits, emits the audit's `started` event and launches the activity's kind with `auditPrompt(activity)`, saving the control in `started()` (§The Loop Ledger), with no `startedAs`. `auditPrompt` fills `{{loops}}` from the ledger as `started()` will save it, so a relaunch after a restart rebuilds the same prompt. Reply at that stop keeps its own path, resuming the same conversation. A held report that was accepted has a settled activity, which refuses any further report (`result_conflict`): there, Allow and Accept allocate a new test audit activity, a continuation when the held report saved test work and a new round otherwise.

The exception is a held test report accepted with `changedImplementation: true`: every `items_listed` stop on an accepted `passed` report, and a `test_work_saved` stop whose `continue_test` report also changed implementation. A test audit allocated straight after it would vouch for the chain back to the last delivery audit, since `untouchedBetweenAudits` sees only test changes between them, and `auditNext` would skip the delivery audit the implementation change requires. So at such a stop Allow and Accept allocate no test audit. Each records its epoch or `Acceptance`, clears the stop, and lets the gate ask `auditNext`, which returns `delivery_audit` (AC-NEUTRAL-06). That delivery audit is not a loop; if it appends phases, they pass through the delivery loop row as usual. Once it passes, the test audit `auditNext` asks for, a new round, is the session the control started: it carries the Allow's prompt or the Accept prompt, and an Allow's is counted as a test loop while an Accept's is not. Kiln recognises it because the epoch with `cause: allowed` (its `heldStopKey`), or the unused `Acceptance` (its `stopActivityKey`), names the held stop, and the first test audit allocated after it is that session.

**Allow N more loops** (`allow-more-loops`, `count` ≥ 1):

1. Sets that kind's limit to N in settings and opens an epoch with `cause: allowed` naming the stop's held audit.
2. A `loop_limit` stop clears and the gate starts the loop the held report asks for.
3. A test loop stop whose report saved no test work (`items_listed`) starts a test audit session as above, after the delivery audit when the report changed implementation, with the loop prompt (§Prompts), counted as a test loop.

**Accept what is left and deliver** (`accept-and-deliver`), offered only at a test loop stop:

1. Builds the Accept sentence from the stop's listed items (§Prompts) and appends an `Acceptance`.
2. Starts a test audit session as above, with the Accept prompt. At a `test_work_saved` stop whose report did not change implementation, that is a continuation of the held audit, which `allocateAudit` admits because the held audit is the latest test audit and counts as `continue_test`; when the report changed implementation, it is the new round after the delivery audit. Either way the gate lets it through because the acceptance names that stop, and the acceptance is used once the session is committed (its `activityKey`). It is not a loop.
3. Its report is gated like any other, which is AC-TEST-02 since no test loop is left. A continuation's `continue_test` must change work other than Markdown beside the PRD (`validate-report`), which an Accept session that fixes nothing cannot, so the Accept prompt has it report `passed` when its words accept everything left, and `needs_you` naming each row or item they do not; a `continue_test` it writes anyway is refused at admission, visibly, like any invalid report.

Take over and Reply are unchanged. Allow and Accept never catch the branch up and take no `--leave-branch-as-is`: run restart's AC-CURRENT-01 covers a stopped phase's session, and a loop stop is on a finished audit whose page has no catch-up offer, so both stay out of the engine's catch-up actions. Both new actions refuse (`not_at_loop_stop`) anywhere else, and Accept refuses at a delivery loop stop.

## Report Contract (AC-LOOP-06)

The Accept sentence names a row by its criterion's ID. Kiln does not parse prose to find one, so each `needsYou` entry in the version-2 report gains an optional `criterion` (the acceptance criterion's ID when the item is that criterion's test row). The audit prompt asks for it; admission checks only that it is a non-empty string when present. Older readers already ignore unknown fields. An item without `criterion` is named in the audit's words: its `problem`.

## Prompts (AC-LOOP-06, AC-TEST-01, AC-TEST-03, AC-STOP-02)

Three templates join `prompts/`, filled into a new `{{loops}}` slot of `audit-session.txt` (empty when nothing applies), in the order listed, with the Allow note below last. Every session Allow or Accept starts, at any stop, builds from `auditPrompt`, so this slot reaches it:

- **`audit-loop-limits.txt`**, for a test audit session that is the last test loop, or that Kiln starts once no test loop is left (including an Accept session): no more test audit loops follow; the limit; the **After the last test audit loop** choice, with "applied by Kiln because this run began before the setting existed" when the source is `kiln_for_earlier_run`. Under `deliver_unless_serious` it quotes, word for word as the person's, "I accept the remaining Weak rows after the last test audit loop.", with where and when (`afterLastTestSource`). Under `stop_and_ask` it carries nothing more from the setting.
- **`audit-earlier-acceptances.txt`**, for every test audit session before delivery whenever a used `Acceptance` (one with `activityKey`) exists other than the session's own, including a non-last loop after Allow: quotes each such sentence as the person's, with its page or command line and time.
- **`audit-accept.txt`**, for the Accept session: quotes its sentence as the person's, with where and when; lists each item as the audit wrote it; says to fix nothing, record what those words accept, and list by name every row or item they do not accept as a `needsYou` item, reporting `passed` only when nothing is left (§Loop Stops). Kiln sorts nothing.

The Allow session at an `items_listed` stop gets a short note in the same slot: the person allowed more test audit loops to fix what the previous report listed, followed by that report's items.

**The Accept sentence.** "I accept the remaining Weak rows, and A, B and C." with each item's `criterion` or `problem`, joined with commas and a final "and"; with no listed items, "I accept the remaining Weak rows." It is built once, stored on the `Acceptance`, and shown, quoted and returned by status from there.

**What a session carried.** The session record gains `carried?: { sentence, source }[]`, written at launch with the prompt: every sentence its prompt quotes, the setting's, each earlier `Acceptance`'s and its own Accept's. The pull request prompt gains `pull-request-loop-acceptance.txt` when any session carried a sentence: one line naming the latest such session, its sentence and its report's `summary`, to include word for word, beside the settled items.

## Interfaces (AC-STOP-03)

**Control journal.** `settings` takes `delivery_audit_loops`, `test_audit_loops` and `after_last_test_audit_loop` (`deliver_unless_serious | stop_and_ask`) beside `keep_awake`; the receipt's `settings` echo includes them, and the receipt validator accepts a receipt saved before them without the new fields. The two new commands get entries in `prompts/kiln-command-contracts.json` beside the existing stop commands. New actions `allow-more-loops` (`{ count }`) and `accept-and-deliver` (`{ via }`) join `STARTING_ACTIONS`, since each can start a session, and settle like `start-again`. `accept-and-deliver`, and a `settings` instruction that carries `after_last_test_audit_loop`, take `via: "browser" | "command_line"`, as `waive-and-advance` does, because the receipt's `source` is `caller` for both the page and the CLI and cannot say where the person was. The page's routes set `browser`. The control route sets `command_line` and refuses a `via` from the caller. The CLI's local instruction check skips these, as it does for `waive-and-advance`. Saved `settings` receipts without the new field still validate. Kiln records `browser` as `where: run_page` for a settings change and as `Acceptance.via: "browser"` for an Accept, matching `WaiverSource`. `allow-more-loops` takes no `via`, since it quotes no sentence. The controller advertises an `audit_loops` feature; the CLI refuses with `instance_incompatible` against a controller without it.

**Command line.**

```
kiln settings <prd> [--delivery-audit-loops N] [--test-audit-loops N]
                    [--after-last-test-audit-loop deliver|ask]   (with the existing flags)
kiln allow-more-loops <prd> --loops N --only-if-status-matches <token> [--command-id ID]
kiln accept-and-deliver <prd> --only-if-status-matches <token> [--command-id ID]
```

`kiln settings` with no flags prints all of them. As today, there is no command-line form before Start.

**HTTP.** `POST /api/settings` accepts `auditLoops` (partial) and routes a started run's change through the `settings` control, as `keepAwake` does, setting `via: "browser"` when the change carries `afterLastTest`; before Start it is a draft field. The two new actions use the control route like the other stop actions.

**Snapshot and `kiln status`.** Both gain:

```
auditLoops:
  settings: { deliveryLimit, testLimit, afterLastTest, afterLastTestSource }
  delivery: { used, limit }
  test: { used, limit }
  stop?:                       — at a loop stop
    kind, heading              — "Delivery audit loops used: 3 of 3"
    loops: { label, activity, did, durationMs }[]   — each loop in the current count, then each audit session since
    audit: { summary, items: { name, problem, action }[] }   — the latest audit, as it wrote them
    afterLastTest?             — test stops only
    acceptSentence?            — test stops only, the sentence Accept would quote
```

The stop's `controls` list adds the two actions with availability and reason. `kiln status` text prints the counts on one line, and at a loop stop the heading, the loops, the audit's summary and items and the available controls.

## Display Contract (AC-LOOP-01, AC-STOP-01, AC-SHOW-01, AC-TEST-03)

- **Documents found and the run's settings panel:** the **Audit loops** section of mockup screens 0 and 1, help text computed from the values shown; Effort's help line as screen 0.
- **Activity rows:** `PhaseView` gains `loop?: { number, limit, last }` from the ledger (the limit in force when the loop started). A loop's rows read **loop N of M**, or **last loop** when `last`. A row whose session carried a sentence says which one, and its detail quotes it.
- **Needs you:** a stop with `loop` set renders mockup screens 2 and 3 from `auditLoops.stop`, with no ranking or judgment of Kiln's. A `loop_limit` stop shows the **Audit loop left** row and Mark complete's refusal reason (§Loop Stops). **Allow more loops** takes N, filled in as 2.

## Upgrade (AC-LOOP-07, RUN-002)

Schema 22, in two steps, because `migrateRecord` sees only the record while the audit history lives in the audit store and session records:

- **Record migration** (`migrateRecord`, run once when a schema-21 record is read). **Not started:** the defaults, as for a new record; the person sees the panel before Start. **Started:** limits 3 and 3, `afterLastTest: stop_and_ask` with `afterLastTestSource: kiln_for_earlier_run`, and no `auditLoops` ledger yet.
- **Ledger reconstruction**, by the Engine constructor right after `activityHistory` rebuilds `record.activities` from the state directory, so a run sitting at a stop shows its counts before any decision: a started record with no ledger gets one rebuilt from its own execution's saved audit history, never an archived execution's (RUN-002), with one `upgrade` epoch per kind at the run's `startedAt`, each loop `observed`, stored by the constructor's closing save:
  - a delivery loop for each audit whose effective result appended phases of which at least one leaf has a session or is done;
  - a test loop for each test audit activity whose latest settled test predecessor counts as `continue_test`, numbered in activity order.

  Leaves at or under an appended phase come from `record.plan`. If the rebuild throws, the ledger stays absent and the first gate decision retries it; if that retry fails too, the run stops visibly on the error. It never guesses a count.

Only a record carried over from schema 21 lacks a ledger: Start and `activateExecution` write their `start` epochs in the write that begins the execution, so a continued run's fresh record is never mistaken for an upgraded one, even when the finished run it continues was a schema-21 record. A continuation already activated before the upgrade is rebuilt from its own execution only.

A run already past a limit stops at its next gate decision, right after the restart that brought it to the new Kiln. Schema-21 Kilns refuse schema 22 under the existing newer-schema rule; there is no downgrade path.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Admission (`nextAction` and the advance on `completion_phases` and `continue_test` now pass through the loop gate) and §Report contract, version 2 (`needsYou` entries take an optional `criterion`).

Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Audits Marked Complete (appended phases of a waived audit run first only while a delivery loop is left; a counted `continue_test` continues only while a test loop is left).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Start, interruption and completion (completion phases audits add after a continuation pass through the loop gate) and §Data Models and Migration (the fresh execution also starts its loop ledger with a `start` epoch per kind; the loop settings carry with the other settings).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API (`POST /api/check-again` at a loop stop starts nothing the gate refuses) and §Account and Usage, Effort (Claude Code defaults to `medium`).

## Delivery

- **After the build:** a `CHANGELOG.md` entry under Unreleased (`Added`: audit loop limits; `Changed`: Claude Code starts at Medium effort); release through the usual release steps.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions writing version-2 reports, the packaged CLI against the local server, and the real browser view. No paid model calls.

| Criteria | Design | Named proof |
|---|---|---|
| AC-LOOP-01, AC-EFFORT-01 | Settings; Display | Documents found shows the three settings with defaults and live help text; a new Claude Code PRD shows Medium, a Codex one High, a saved PRD keeps its effort |
| AC-LOOP-02, AC-LOOP-03 | Loop Ledger | Phases from one delivery audit, split into leaves, are one loop; phases a test audit appended count as a delivery loop; a continuation and a fresh round after a delivery audit following `continue_test` are test loops; a test audit after a passing one, an Accept session, and an audit completed at once under a waived readiness problem are not; an Allow at a `needs_you` stop interrupted before its launch's `started()` leaves only the stop, and after it a counted pending activity that relaunches |
| AC-LOOP-04, AC-LOOP-05, RUN-003 | Ledger epochs; Gate | Allow restarts the count; reset returns defaults and zero counts; lowering a limit mid-session stops at the next decision; raising it during a hold starts the loop at Check again and at `kiln run`; a run that used both limits and is continued with **Continue with N phases** starts both counts at zero with its three settings and their source unchanged, builds its first audit-added phases without a stop, and its archived rows keep their loop labels |
| AC-LOOP-06 | Settings; Prompts | The sentence and its source in each prompt that quotes it, for a Documents found choice, a page change and a `kiln settings` change; the Accept sentence with criterion IDs and audit-worded items; after an Accept and then an Allow, a non-last test loop's prompt quotes the earlier Acceptance and its session's `carried` lists it |
| AC-LOOP-07, RUN-002 | Upgrade | A schema-21 started run with three continuations stops at its first decision; its prompts carry the Kiln-applied choice; a not-started record gets the defaults; a schema-21 finished run continued after the upgrade gets `start` epochs, not a reconstructed ledger; an upgraded run sitting at a stop shows its rebuilt counts in status before any Check again |
| AC-DELIV-01 | Gate; Loop Stops | The fourth audit's phases stay open and unstarted at a delivery loop stop with no Mark complete offered |
| AC-TEST-01 | Prompts | Last-loop and post-limit prompts under both choices, including a fresh test round after the limit |
| AC-TEST-02 | Gate | Each table row once no test loop is left: phases added, passed, `passed` with items, `needs_you`, `continue_test` with and without `changedImplementation` |
| AC-TEST-03 | Prompts; Display | Rows and details for the last loop and for sessions carrying each sentence; the pull request prompt line |
| AC-STOP-01 | Snapshot; Display | Both stop pages match mockup screens 2 and 3 from a scripted run |
| AC-STOP-02, RUN-001 | Loop Stops | Each control at each stop reason; Check again and Mark complete leave a held run held; Accept's prompt and its report's routing; Allow and Accept after a `changedImplementation` report (an accepted `passed` report with items, and a `continue_test`) run a delivery audit first, then start their session as the next test round; at a `needs_you` loop stop, Allow and Accept launch a new audit session on the stopped activity whose prompt carries the `{{loops}}` text, and a restart before it starts relaunches with the same prompt; neither offers a branch catch-up; at a `loop_limit` stop Mark complete's refusal reason names the missing loop and the page shows **Audit loop left**, which a `needs_you` loop stop does not |
| AC-STOP-03 | Interfaces | Every control and view through the CLI, with stale token, wrong stop and incompatible controller refusals; a `via` sent by a caller to the control route is refused; an **After the last test audit loop** change and an Accept from the page record `run_page` and `browser`, and from the CLI record `command_line`; a `settings` receipt saved without `via` still loads |
| AC-SHOW-01 | Display | **loop 2 of 3** and **last loop** on phase and test audit rows |

## Open Questions

- RUN-001 is open with the stakeholder. If they choose the alternative, Mark complete on an audit stopped by a failing check, whose report added phases or saved test work while no loop of that kind is left, also opens one loop of that kind, and the stop page says so beside the button; the gate and ledger are unchanged.
- RUN-002 is the project team's decision, open to the stakeholder's correction. If they choose the alternative, §Upgrade's ledger reconstruction is dropped: a started schema-21 record gets one `upgrade` epoch per kind and no loops, so its counts start at zero.
- RUN-003 is open with the stakeholder. If they choose the alternative, `activateExecution` copies the ledger forward into the continued execution with no `start` epoch, so a continued run that had used its loops stops at the first phases or test work an audit adds; the gate is unchanged.
