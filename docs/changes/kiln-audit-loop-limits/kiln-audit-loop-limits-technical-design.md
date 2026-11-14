# Technical Design: Kiln Audit Loop Limits

**PRD:** [Kiln Audit Loop Limits](kiln-audit-loop-limits-prd.md) · **Assumptions:** [RUN-001, RUN-002](kiln-audit-loop-limits-assumptions.md) · **Mockup:** [four screens](mockups/kiln-audit-loop-limits.html)

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

`defaultSettings` returns the defaults, so a first `kiln run` and a reset both get them (AC-LOOP-04's reset clause). Before Start the three values ride in the Documents found draft like the other settings. At Start, `afterLastTestSource` becomes `{ person, at: <Start time>, where: documents_found }` whichever value was showing, because choosing or keeping it on that screen is the person's choice. A later change of `afterLastTest` on the run's page or with `kiln settings` sets a new source with that time and entry point; changing only a limit leaves the source alone. A value outside the table is a field error on the page and `invalid_input` on the command line; nothing is clamped.

The settings are read fresh at each gate decision, never cached on a loop, which is all AC-LOOP-05 needs: a change while a session runs applies at the next decision.

**Effort.** `defaultSettings` gives Claude Code `medium` instead of `high`. Codex's first-selection default (`high`) and the existing rule that replaces an effort the chosen model does not support are unchanged, and a saved choice is never rewritten.

## The Loop Ledger (AC-LOOP-02 to AC-LOOP-04, AC-SHOW-01)

`PrdRecord` gains `auditLoops`, append-only like `waivers`:

```
AuditLoopLedger:
  epochs: { kind: "delivery" | "test", at: ISO-8601 UTC, cause: "start" | "allowed" | "upgrade", limit?: integer }[]
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
  at, via: "page" | "command_line", stopActivityKey, sentence, items: { name, problem, action }[]
```

**What starts a loop.** The count of a kind is the number of `loops` of that kind after its latest epoch. An epoch opens at Start (both kinds) and at **Allow N more loops** (that kind).

- **Delivery (AC-LOOP-02):** the first time Kiln launches a leaf at or under a phase that an audit's effective result appended (`effectiveAudit(...).completionPhases()`), for an audit with no loop yet. One audit's phases, however many and however split, are one loop; later leaves of the same set join its `activityKeys`. Phases appended by a test audit count the same way.
- **Test (AC-LOOP-03):** Kiln starts a test audit session and the latest settled test audit before it counts as `continue_test`, whether the new one is a continuation or a fresh round after a delivery audit in between; or the person's **Allow N more loops** starts a session at a stop whose report saved no test work (§Loop Stops). No other test audit session is a loop.

The loop is appended in the same record write that launches its first session, so a crash cannot start a loop without counting it.

## The Loop Gate (AC-LOOP-05, AC-DELIV-01, AC-TEST-02)

The engine's `nextActivity` already decides every next step: resume a pending audit, run the next leaf, or ask `auditNext` for the next audit or final delivery. The gate runs inside it, after the pending-audit check, on the record as it is now. It acts on the first row that fits:

| Situation | Gate |
|---|---|
| The next leaf starts a delivery loop (above) | A delivery loop is left: count it and run the leaf. None left: **delivery loop stop** on the audit that appended it; the phases stay open and unstarted |
| The latest settled test audit's effective result appended phases | Handled by the row above when its phases come up |
| No test loop is left, and the latest settled test audit, with no later delivery audit, counts as `continue_test` | **Test loop stop** on that audit, unless an unused acceptance names it (Accept below), even when `changedImplementation` would route to a delivery audit first |
| No test loop is left, and that test audit is accepted as `passed` while still listing `needsYou` items | **Test loop stop** with those items |
| `auditNext` asks for a test audit that would be a test loop | Left: count it and allocate. None left: **test loop stop** on the predecessor |
| Otherwise | As today |

A `needs_you` test report is already a stop with a failing **Audit work resolved** check. When no test loop is left at that moment, the stop is also marked as a test loop stop (`PhaseStop.loop`, below), so it gets the loop page and controls; Mark complete stays offered there, as at any failing check.

Because the gate reads only the record, settings and effective results, Check again, `kiln run`, a restart and a changed setting all reach the same decision; nothing is remembered between decisions except the ledger.

## Loop Stops (AC-STOP-01, AC-STOP-02, RUN-001)

`StopKind` gains `"loop_limit"`, and `PhaseStop` gains:

```
loop?: { kind: "delivery" | "test"; reason: "phases_added" | "test_work_saved" | "items_listed"; heldAuditKey: string }
```

A hold on an accepted or marked-complete report (`phases_added`, `test_work_saved`, or `items_listed` from a `passed` report) is a `loop_limit` stop on the held audit's key. It has no failing check, so Mark complete is not offered, matching the mockup's delivery stop. An `items_listed` stop from a `needs_you` report stays a `done_check` stop with `loop` set.

**Check again** on a `loop_limit` stop reruns the gate: if a loop of that kind is now left (a raised limit), the stop clears and the loop starts; otherwise it stays, with a new check run. A **Mark complete** at a loop stop completes the audit as AC-WAIVE-12 says and then reaches the gate like any other step, which holds again when its counted result needs a loop that is not left. That is RUN-001's assumption, built as the open entry states it; it needs no special case.

**Allow N more loops** (`allow-more-loops`, `count` ≥ 1):

1. Sets that kind's limit to N in settings and opens an epoch with `cause: allowed`.
2. A `loop_limit` stop clears and the gate starts the loop the held report asks for.
3. A test loop stop whose report saved no test work (`items_listed`) starts a new session of the stopped test audit activity, through the same path as `start-again`, with the loop prompt (§Prompts), counted as a test loop.

**Accept what is left and deliver** (`accept-and-deliver`), offered only at a test loop stop:

1. Builds the Accept sentence from the stop's listed items (§Prompts) and appends an `Acceptance`.
2. At an `items_listed` stop, starts a new session of the stopped activity with the Accept prompt. At a `test_work_saved` stop, allocates a test continuation of the held audit with that prompt; the gate lets it through because the acceptance names that stop. Neither is a loop.
3. Its report is gated like any other, which is AC-TEST-02 since no test loop is left.

Take over and Reply are unchanged. Both new actions refuse (`not_at_loop_stop`) anywhere else, and Accept refuses at a delivery loop stop.

## Report Contract (AC-LOOP-06)

The Accept sentence names a row by its criterion's ID. Kiln does not parse prose to find one, so each `needsYou` entry in the version-2 report gains an optional `criterion` (the acceptance criterion's ID when the item is that criterion's test row). The audit prompt asks for it; admission checks only that it is a non-empty string when present. Older readers already ignore unknown fields. An item without `criterion` is named in the audit's words: its `problem`.

## Prompts (AC-LOOP-06, AC-TEST-01, AC-TEST-03, AC-STOP-02)

Two templates join `prompts/`, filled into a new `{{loops}}` slot of `audit-session.txt` (empty when nothing applies):

- **`audit-loop-limits.txt`**, for a test audit session that is the last test loop, or that Kiln starts once no test loop is left (including an Accept session): no more test audit loops follow; the limit; the **After the last test audit loop** choice, with "applied by Kiln because this run began before the setting existed" when the source is `kiln_for_earlier_run`. Under `deliver_unless_serious` it quotes, word for word as the person's, "I accept the remaining Weak rows after the last test audit loop.", with where and when (`afterLastTestSource`). Under `stop_and_ask` it carries nothing more from the setting. It then quotes every earlier `Acceptance`, each with its page or command line and time.
- **`audit-accept.txt`**, for the Accept session: quotes its sentence as the person's, with where and when; lists each item as the audit wrote it; says to fix nothing, record what those words accept, and list by name every row or item they do not accept. Kiln sorts nothing.

The Allow session at an `items_listed` stop gets a short note in the same slot: the person allowed more test audit loops to fix what the previous report listed, followed by that report's items.

**The Accept sentence.** "I accept the remaining Weak rows, and A, B and C." with each item's `criterion` or `problem`, joined with commas and a final "and"; with no listed items, "I accept the remaining Weak rows." It is built once, stored on the `Acceptance`, and shown, quoted and returned by status from there.

**What a session carried.** The session record gains `carried?: { sentence, source }[]`, written at launch with the prompt. The pull request prompt gains `pull-request-loop-acceptance.txt` when any session carried a sentence: one line naming the latest such session, its sentence and its report's `summary`, to include word for word, beside the settled items.

## Interfaces (AC-STOP-03)

**Control journal.** `settings` takes `delivery_audit_loops`, `test_audit_loops` and `after_last_test_audit_loop` (`deliver_unless_serious | stop_and_ask`) beside `keep_awake`; the receipt's `settings` echo includes them. New actions `allow-more-loops` (`{ count }`) and `accept-and-deliver` (`{}`) join `STARTING_ACTIONS`, since each can start a session, and settle like `start-again`. The controller advertises an `audit_loops` feature; the CLI refuses with `instance_incompatible` against a controller without it.

**Command line.**

```
kiln settings <prd> [--delivery-audit-loops N] [--test-audit-loops N]
                    [--after-last-test-audit-loop deliver|ask]   (with the existing flags)
kiln allow-more-loops <prd> --loops N --only-if-status-matches <token> [--command-id ID]
kiln accept-and-deliver <prd> --only-if-status-matches <token> [--command-id ID]
```

`kiln settings` with no flags prints all of them. As today, there is no command-line form before Start.

**HTTP.** `POST /api/settings` accepts `auditLoops` (partial) and routes a started run's change through the `settings` control, as `keepAwake` does; before Start it is a draft field. The two new actions use the control route like the other stop actions.

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
- **Needs you:** a stop with `loop` set renders mockup screens 2 and 3 from `auditLoops.stop`, with no ranking or judgment of Kiln's. **Allow more loops** takes N, filled in as 2.

## Upgrade (AC-LOOP-07, RUN-002)

Schema 22. Migration, run once when a schema-21 record is read:

- **Not started:** the defaults, as for a new record; the person sees the panel before Start.
- **Started:** limits 3 and 3, `afterLastTest: stop_and_ask` with `afterLastTestSource: kiln_for_earlier_run`, and a ledger rebuilt from saved audit history (RUN-002) in one `start` epoch, each loop `observed`:
  - a delivery loop for each audit whose effective result appended phases of which at least one leaf has a session or is done;
  - a test loop for each test audit activity whose latest settled test predecessor counts as `continue_test`.

A run already past a limit stops at its next gate decision, right after the restart that brought it to the new Kiln. Schema-21 Kilns refuse schema 22 under the existing newer-schema rule; there is no downgrade path.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Admission (`nextAction` and the advance on `completion_phases` and `continue_test` now pass through the loop gate) and §Report contract, version 2 (`needsYou` entries take an optional `criterion`).

Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Audits Marked Complete (appended phases of a waived audit run first only while a delivery loop is left; a counted `continue_test` continues only while a test loop is left).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API (`POST /api/check-again` at a loop stop starts nothing the gate refuses) and §Account and Usage, Effort (Claude Code defaults to `medium`).

## Delivery

- **After the build:** a `CHANGELOG.md` entry under Unreleased (`Added`: audit loop limits; `Changed`: Claude Code starts at Medium effort); release through the usual release steps.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions writing version-2 reports, the packaged CLI against the local server, and the real browser view. No paid model calls.

| Criteria | Design | Named proof |
|---|---|---|
| AC-LOOP-01, AC-EFFORT-01 | Settings; Display | Documents found shows the three settings with defaults and live help text; a new Claude Code PRD shows Medium, a Codex one High, a saved PRD keeps its effort |
| AC-LOOP-02, AC-LOOP-03 | Loop Ledger | Phases from one delivery audit, split into leaves, are one loop; phases a test audit appended count as a delivery loop; a continuation and a fresh round after a delivery audit following `continue_test` are test loops; a test audit after a passing one, and an Accept session, are not |
| AC-LOOP-04, AC-LOOP-05 | Ledger epochs; Gate | Allow restarts the count; reset returns defaults and zero counts; lowering a limit mid-session stops at the next decision; raising it during a hold starts the loop at Check again and at `kiln run` |
| AC-LOOP-06 | Settings; Prompts | The sentence and its source in each prompt that quotes it, for a Documents found choice, a page change and a `kiln settings` change; the Accept sentence with criterion IDs and audit-worded items |
| AC-LOOP-07 | Upgrade | A schema-21 started run with three continuations stops at its first decision; its prompts carry the Kiln-applied choice; a not-started record gets the defaults |
| AC-DELIV-01 | Gate; Loop Stops | The fourth audit's phases stay open and unstarted at a delivery loop stop with no Mark complete offered |
| AC-TEST-01 | Prompts | Last-loop and post-limit prompts under both choices, including a fresh test round after the limit |
| AC-TEST-02 | Gate | Each table row once no test loop is left: phases added, passed, `passed` with items, `needs_you`, `continue_test` with and without `changedImplementation` |
| AC-TEST-03 | Prompts; Display | Rows and details for the last loop and for sessions carrying each sentence; the pull request prompt line |
| AC-STOP-01 | Snapshot; Display | Both stop pages match mockup screens 2 and 3 from a scripted run |
| AC-STOP-02, RUN-001 | Loop Stops | Each control at each stop reason; Check again and Mark complete leave a held run held; Accept's prompt and its report's routing |
| AC-STOP-03 | Interfaces | Every control and view through the CLI, with stale token, wrong stop and incompatible controller refusals |
| AC-SHOW-01 | Display | **loop 2 of 3** and **last loop** on phase and test audit rows |

## Open Questions

- RUN-001 is open with the stakeholder. If they choose the alternative, Mark complete at a loop stop also opens one loop of that kind, and the stop page says so beside the button; the gate and ledger are unchanged.
