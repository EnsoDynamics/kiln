# Technical Design: Kiln Deliver When Audit Loops Run Out

**PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md) · **Assumptions:** [none open](kiln-deliver-when-audit-loops-run-out-assumptions.md) · **Mockup:** [eight screen states](mockups/kiln-deliver-when-audit-loops-run-out.html)

## Overview

The loop gate gains a third decision beside "start the loop" and "stop": **set the phases aside**. Phases an audit added past the delivery limit are recorded in Kiln's own state as left open, skipped by routing, and reported with the delivery. The one setting **When the loops run out** chooses between setting aside and stopping, for both audits.

The audit report says two things it did not say before, and Kiln acts on both without judging either: how much of each criterion an added phase covers is built, and what kind of item each thing listed for a person is. An item's kind decides whether it stops the run, holds it, or rides to delivery under **For you**. A loop stop gets one page with two answers, Allow and Accept, at either audit. A run delivered with phases left open can be continued on its own feature branch while its pull requests are open.

Everything here is Kiln's. No Enso Method skill changes: both audit skills already leave out a criterion an open completion phase covers, and Kiln writes nothing to the repository that the skills do not already write (principles 1 and 2).

## Existing Code

**Posture: Preserve.** Kiln 1.3.0 is released with audit loop limits.

- Reused: the loop ledger and its `start` epochs; the gate as the one place every decision after an audit passes through; `loop_limit` stops on a finished audit's key and the derived `needs_you` loop stop; the version-2 report and its admission; the outstanding-items ledger, derived from accepted reports; the Accept session and its prompt; the control journal, its receipts and the stop routes; the continuation proposal, acceptance and activation core.
- Reused: the routing reader that already counts a phase skipped under a waived plan problem as closed. A phase set aside rides the same reader, so every router (leaf selection, report validation, the final no-unfinished-leaf check, development-delivery obligations) learns it in one place.
- Kept: test work still saved after the last test loop stops the run under either choice. Mark complete is offered only where a check fails. A `needs_you` report is never accepted. Marking an audit complete settles no item, and a run delivered after one lists every item still open.
- Kept: the default limits, and every stop control this design does not name.

## Settings (AC-CHOICE-01, AC-CHOICE-02)

The third loop setting is renamed where it is stored and exchanged, because its old name says it is about the test audit only:

```
auditLoops:
  deliveryLimit, testLimit              — unchanged
  whenLoopsRunOut: "deliver" | "stop_and_ask"     — default deliver; was afterLastTest
  whenLoopsRunOutSource                 — was afterLastTestSource, same shape
```

`deliver` keeps the sentence the old default gave the test audit, quoted with its source as today. The setting is read fresh at each gate decision. A change at a loop stop therefore applies the next time loops run out, and the stop it was changed at stays until one of its two answers is given (§Loop Stops), which is also why Check again and a restart no longer re-decide a loop stop.

## Report Contract (AC-GOON-03, AC-ITEM-01, AC-ITEM-02, AC-LEFT-01)

The report stays `schemaVersion` 2 with added fields. Kiln does not parse prose or phase documents to learn any of this; the audit states it and the prompt maps the skill's own ending onto it (§Prompts).

```
phaseCriteria: { phase, criterion, built: "partly" | "none" }[]
    — required when completionPhases is non-empty: every criterion each appended phase covers,
      and whether some of it is built or none of it is
acceptedTests?: { criterion, state: "weak" | "missing" | "failing" }[]
    — test audits: every criterion whose tests the person's words have accepted and that is
      still below the audit's target as this report stands
needsYou entry:
  id?            — an outstanding item listed again
  kind           — "critical_next_step" | "critical" | "blocker" | "business_question"
                   | "test_acceptance" | "other"
  problem, action
  waitsOn        — what waits on it; required for every kind but critical and other
  criterion      — required for test_acceptance: the criterion whose test it is
  stuck?: true   — test_acceptance only: the audit marked the row stuck
```

Admission refuses, naming the field, a new report that:

- lists a new item with no `kind`, or relists by `id` an item the ledger holds without one and still gives none;
- gives a stopping or holding kind without `waitsOn`, or `test_acceptance` without `criterion`;
- appends phases without a `phaseCriteria` row for each, or names a phase there that it did not append;
- lists a `critical_next_step` item under any outcome but `needs_you`;
- is a test audit's `passed` report with `changedImplementation` false, the one report that leads straight to delivery, and lists a `blocker`, `business_question` or `test_acceptance` item.

Two earlier refusals are lifted. A `passed` report may list a new item of kind `critical` or `other`, and the report that leads straight to delivery may list items of those two kinds; both ride to delivery (§Items for a Person). An item that gives no `waitsOn` and needs none is reported as it stands.

`PersonItem` gains `kind`, `waitsOn` and `stuck`, kept across a relisting by `id` unless the relisting gives a new value, as `criterion` is.

A result accepted by an earlier Kiln has none of these fields. Its phases read as "the audit did not say" (§Phases Left Open) and its outstanding items take a kind at their next relisting.

## Items for a Person (AC-ITEM-01 to AC-ITEM-03)

| Kind | Kiln |
|---|---|
| `critical_next_step` | Arrives only as `needs_you`: the run stops at once, at an item stop |
| `critical` | Rides. Listed first under **For you** at delivery |
| `blocker`, `business_question` | Holds the run |
| `test_acceptance` | Holds the run; once no test loop is left, its stop is a loop stop |
| `other` | Rides. Listed under **For you** at delivery |

**How a hold is measured.** Kiln keeps the measure it has today: the audit that lists or relists an item says, through its outcome, whether the work it leaves depends on it. `completion_phases` or `continue_test` with the item listed means that work does not need it, so the loop runs; `needs_you` means the work cannot go on. Delivery always needs a holding item, which admission enforces on the one report that leads to it. So a holding item stops the run exactly when no other work is left, and the measure is taken again by every later report, including the one from a session Allow or Accept starts. Kiln carries no dependency model of its own, which would be a second source of truth beside the audit's.

The stop for a holding item is therefore always on a `needs_you` report, whose activity is unsettled: Reply reaches the audit's own session, which accounts for the settled item in its next report. A person who marks that audit complete overrides the hold, as today; the items still open are then listed under **For you**.

**Item stops and loop stops.** A `needs_you` test report with no test loop left is a loop stop only when every item of a stopping or holding kind it lists is `test_acceptance`. With any `critical_next_step`, `blocker` or `business_question` item it is an item stop: the page of mockup state 7, with the controls an item stop has while loops are left, and no Allow or Accept. Once that item is settled and the audit reports again, the stop becomes a loop stop if tests are still left. This keeps Allow from ever starting work an item on the same page says cannot go on, and puts a critical finding ahead of the loop question. A loop stop on a finished audit (phases added, test work saved) shows every item its report listed beside its answers; those items do not block the answers, because that report's outcome already said its work does not need them.

Every stop on an audit, and `kiln status`, show each item with its kind, problem, action and what waits on it (§Interfaces).

## Phases Left Open (AC-GOON-01 to AC-GOON-04)

The ledger gains, append-only:

```
leftOpen: { auditKey, phases: string[], at: ISO-8601 UTC,
            cause: "setting" | "accepted", via?: "browser" | "command_line",
            endedAt?: ISO-8601 UTC }[]
```

A leaf at or under a phase in an entry with no `endedAt` is **set aside**. The routing reader counts a set-aside leaf as not to be built in this execution:

- Leaf selection skips it. A phase a person adds during the run is still built in plan order; the existing dependency check stops a leaf that depends on a set-aside one.
- Report validation's no-open-phase rules for `passed` and `continue_test` do not count it, so the test audit and any later delivery audit can end normally with it open. The skills leave its criteria out on their own.
- The final check that no unfinished leaf remains does not count it, and its development-delivery obligations are not asked for.
- It is never done. Its plan row reads not started, with a note that it was left open over the limit. Kiln writes nothing to the repository: no Closed line, no checkbox, no record file.

**Routing after phases are set aside.** A delivery audit whose appended phases are all set aside routes as `passed`, so the test audit follows. A test audit in the same position keeps today's routing for a `completion_phases` test report with nothing built since: a delivery audit first if it changed implementation, then a fresh test audit round, which is not a loop. A test audit may add phases and still have test work unfinished, and its one outcome cannot say both, so counting it as passed could deliver with test work nobody reported; the fresh round asks. Each further round must append a new phase to repeat this, so the number of criteria bounds it.

## The Loop Gate (AC-GOON-01, AC-GOON-03, AC-ITEM-03)

The gate's rows change as follows; rows not listed stand.

| Situation | Gate |
|---|---|
| The next leaf starts a delivery loop and none is left, under `stop_and_ask` | Delivery loop stop, as today |
| The same, under `deliver` | Reads the appending audit's `phaseCriteria`. Every row `partly`: appends a `leftOpen` entry with `cause: "setting"` and decides again. Any row `none`, or no `phaseCriteria` at all (a result from an earlier Kiln, or an audit marked complete with no report): delivery loop stop, whose page names those criteria or says the audit did not say |
| The latest test audit was accepted as `passed` while listing items, and no test loop is left | No stop. Its items are of riding kinds, or it leads to another audit that accounts for them |
| A `needs_you` test report, no test loop left | Loop stop or item stop, by its items' kinds (§Items for a Person) |

The decision stays a pure function of the record, the settings and the effective results. Setting aside and recording the stop are each one record write.

## Loop Stops (AC-ANSWER-01 to AC-ANSWER-05, AC-CHOICE-02)

`PhaseStop.loop.reason` is `phases_added`, `test_work_saved` or `tests_to_accept`. The last replaces `items_listed` and is only ever derived, from a `needs_you` report.

**A loop stop is answered only by its answers.** At every loop stop:

- Check again is not offered, on the page or as a command (`check-again` is listed unavailable with the reason).
- A restart leaves a `loop_limit` stop as it found it, without rerunning the gate.
- `kiln settings` and the page refuse to change the limit the stop is on (`limit_held_by_loop_stop`; an instruction that carries it changes nothing). The other limit and the choice stay editable.
- Reply is offered only when the stopped audit has not finished, which is the `tests_to_accept` stop; `reply` is refused at a `loop_limit` stop, where the audit is settled and nothing would read it. The terminal handoff is unchanged at both.

**Allow up to N more loops** (`allow-more-loops`, `count` ≥ 1) raises that kind's limit to the loops used plus N, appends `allowances: { kind, at, heldAuditKey, count, limit, phases? }` to the ledger, and opens no epoch, so the count is kept and the next loop takes the next number. The first test audit after an allowance at a `tests_to_accept` stop is the loop it allowed, which the allowance now marks in place of the `allowed` epoch. At a delivery stop it also ends every open `leftOpen` entry and records in `phases` every open phase an audit added, the held audit's and any set aside earlier: the loop it starts builds them all in plan order and counts once, since plan order does not allow building later phases over earlier open ones.

**Accept what is left and deliver** (`accept-and-deliver`):

- At a delivery stop, new: one record write appends a `leftOpen` entry for the held audit's phases with `cause: "accepted"`, clears the stop and stamps the receipt, which settles `completed` with outcome `phases_left_open`. No session starts and no sentence is quoted. The gate then goes on as after phases set aside by the setting, criteria not built at all included.
- At a test stop, as today, with two changes. Its sentence names only the `test_acceptance` items, each by its criterion. Its prompt lists every other item the held report listed, with its kind, as not accepted by those words and to be kept open in `needsYou`, so later audits and **For you** still account for them. The session's report is admitted like any other, so a holding item still open makes it `needs_you`, an item stop.

**The page** (mockup states 4, 5, 6 and 8) is drawn from the snapshot (§Interfaces):

- Status line, at every closing audit, running or stopped: the audit and the loops of its kind used, **Delivery audit (after loop 3 of 3)**, and **(before loop 1)** when none has run.
- Heading: **Loop N of M is done.** with what is left: **The audit found more.**, **Test work is left.** or **Tests are left for you to accept.** When the limit was lowered below the loops used, **Loop N is done, over your limit of M.**
- One row per counted loop, then the waiting work as the next loop's row, not started and over the limit. Sessions that are not loops are no longer rows here; they stay in the run's activity list.
- Under the number: the limit it leads to, what the next loop does (the phases it builds, at a delivery stop) and that the rest are spare. At a test stop whose only items are stuck rows, the Go on answer says the session cannot work a stuck row without the person saying how.
- One button, labelled for the chosen answer, calls that answer's route.

## What Was Left and For You (AC-LEFT-01, AC-LEFT-02, AC-ITEM-03)

A delivery's work left is derived at the time it is shown, never stored, from the ledger and the immutable accepted results:

- **Phases left open:** the set-aside leaves, each with the `phaseCriteria` rows of the audit that added it.
- **Tests accepted:** `acceptedTests` of the latest settled test audit's effective report, then the line the pull request session already gets (the sentences its latest carrying session quoted, with that session's report summary).
- **For you:** the items outstanding after the last settled audit, any `critical` first, then the after-delivery actions of the audits. The separate after-delivery list on the finished page is folded into this one, so a person action appears in one place.

Order is the PRD's: what was left, then **For you**; when **For you** holds a critical finding it moves first with that finding at its top.

**The pull request.** `pullRequestPromptValues` gains one block, built from those three lists, that the session is told to place word for word at the top of each description; `pull-request-loop-acceptance.txt` moves inside it. The pull request check gains a row, **Pull request says what was left**: each open pull request's description must open with that block, compared ignoring whitespace, and must not open with a stale one when nothing is left. A session that paraphrases or drops it stops at Needs you like any failed final check. Kiln checks rather than writes, as it does for every other delivery fact, because the claim that nothing is hidden is the point of delivering with work left.

**The finished page** is headed **Delivered, with work left** when any of the three lists is non-empty, and shows them with the loops used of each kind (mockup state 2).

## Continuing (AC-LEFT-03)

**Which way.** For an execution that delivered with phases left open, the completed-plan check first reads the state of each of that delivery's pull requests from GitHub. A repository delivered by an early merge counts as merged. All open: the same-branch proposal below. Any merged or closed: today's discovery. A read that fails makes the check `failed`, with retry and no offer, as any failed source read does.

**Same branch.** The proposal's plan is the one in the run's assigned worktree, which must be on the feature branch, clean, and at the head the pull request has. The feature branch is the only place the left-open phase documents exist until a merge, so it is the plan's source of truth; a phase added since delivery counts once it is committed there, and one written only on the delivery base is found by today's discovery after the merge. The plan is compared with the completed execution's baseline by the existing rules. The offer lists the left-open leaves, then any added since, and N counts both.

`ContinuationProposal` gains `mode: "same_branch" | "fresh_base"` (absent on older proposals, read as `fresh_base`), and a same-branch proposal's identity binds each repository's feature head and pull request. Acceptance revalidates those and activates a fresh execution through the shared activation core with the completed execution's repositories, worktrees, branch and settings unchanged: no workspace preparation and no new branch. Its baseline carries each done leaf's receipt, built as a base-branch start from Folder missing builds them. A leaf left open carries none, so in the new execution it is an ordinary open leaf: built in plan order, with no loop counted, because no audit of this execution added it. The fresh execution starts with a preflight, a `start` ledger and empty required audits, which is what makes the loop counts start at zero and the closing audits run again. Its final delivery finds each pull request open and updates it; the check above holds the updated description to the new delivery's work left.

**After a merge or close.** Today's path needs one rule lifted: the completed baseline accepts an open leaf that the completed execution's ledger left open, with no completion row, instead of refusing the baseline because a phase was not closed at delivery. Discovery then classifies it as new unfinished work like any added phase. The awaiting-merge result stays for a delivery with no phase left open.

**The offer** appears under **Delivered, with work left** in place of **New phases found** whenever the delivery left phases open.

## Prompts

- `audit-session.txt`: the contract fields above. The item kinds are defined in the PRD's words, with what is never an item: a declared assumption, a request to confirm or review something, and anything the audit can settle itself. The outcome guidance is rewritten around the kinds: `needs_you` when the audit's remaining work cannot go on without an item, when a critical finding would be caused or worsened by the step Kiln takes next (the prompt names that step for each outcome), or when the report would lead to delivery with a holding item open. A new `{{setAside}}` line names the phases Kiln has left open and says they do not count against a passing report.
- `audit-loop-limits.txt`: the choice's new name.
- `audit-accept.txt`: the sentence names tests only; the other listed items follow, to be kept open.
- A new `pull-request-work-left.txt` for the block in §What Was Left and For You; the pull request prompt says to update an already open pull request's description.

## Interfaces (AC-BOT-01, AC-BOT-02)

**Command line.**

```
kiln settings <prd> [--delivery-audit-loops N] [--test-audit-loops N] [--when-loops-run-out deliver|ask]
kiln allow-more-loops <prd> --loops N --only-if-status-matches <token> --command-id ID
kiln accept-and-deliver <prd> --only-if-status-matches <token> --command-id ID
kiln continue-with-phases <prd> --proposal ID --only-if-status-matches <token> --command-id ID
```

`--after-last-test-audit-loop` is refused with a message naming `--when-loops-run-out`; the settings and status JSON use `when_loops_run_out`, `when_loops_run_out_sentence` and `when_loops_run_out_chosen`. A loud refusal is chosen over an alias because a bot that set the old flag also read the old keys, and a renamed key fails silently.

`continue-with-phases` is a new public action that reaches the engine path the page's Continue already uses, for either proposal mode, with that route's refusals (`proposal_changed`, `prerequisite_blocked` and the rest). It takes the proposal the status shows, as the page submits the one it displays. Early-merge authorization and retrying a blocked setup stay in the browser.

The controller advertises a `deliver_at_loop_limit` feature; the CLI refuses the new command, the new flag and Accept at a delivery stop against a controller without it (`instance_incompatible`).

**Control journal.** `settings` takes `when_loops_run_out` with `via`, as it took the old field; saved receipts carrying the old field still validate. `accept-and-deliver` at a delivery stop records `via` in the `leftOpen` entry. New outcome `phases_left_open` and refusal `limit_held_by_loop_stop` are declared in `prompts/kiln-command-contracts.json`.

**HTTP.** The existing settings, allow and accept routes carry the changes; Continue's route is unchanged.

**Snapshot and `kiln status`.** The same objects in both, text and JSON:

```
auditLoops:
  settings: { deliveryLimit, testLimit, whenLoopsRunOut, whenLoopsRunOutSource }
  delivery, test: { used, limit }
  position?: { audit: "delivery" | "test", afterLoop, limit }     — at a closing audit; afterLoop 0 is "before loop 1"
  stop?:
    kind, reason, heldAuditKey
    auditFinished                      — false at a tests_to_accept stop
    lockedLimit: "delivery" | "test"
    heading, loopHelp                  — loopHelp: the line saying what a loop is for this audit
    loops: { number, did, durationMs, observed? }[]
    waiting: { number, limit, what, phases?: { id, title }[] }
    notBuilt?: { criterion, phase }[] | "not_stated"
    audit: { summary }
    acceptSentence?, stuckOnly?        — test stops
items?: { id?, kind, problem, action, waitsOn?, criterion?, stopsOrHolds }[]    — at any stop on an audit
delivered?:                            — on a finished run
  workLeft: { phases: { id, title, criteria: { criterion, built }[] }[],
              acceptedTests: { criterion, state }[], acceptanceLine? }
  forYou: { kind?, problem, action }[]
  pullRequests: { repository, number, url }[]
```

`PhaseView` gains `leftOpen?: true`. The stop's `controls` list gives `settings`, `allow-more-loops`, `accept-and-deliver`, `check-again`, `reply` and the handoff with availability and reason; a finished run's gives `continue-with-phases`.

## Upgrade (AC-CHOICE-01)

Schema 24, in the record migration alone:

- `afterLastTest` becomes `whenLoopsRunOut` (`deliver_unless_serious` to `deliver`, `stop_and_ask` unchanged) with its source carried, so a run already going keeps its choice, which now covers both audits. A run begun before audit loop limits keeps `stop_and_ask` and its Kiln-applied source.
- The ledger gains empty `leftOpen` and `allowances`. An existing `allowed` epoch keeps the count it restarted.
- A run stopped at a `loop_limit` stop stays stopped and is answered by its answers; at a delivery stop that now includes Accept. A stored `items_listed` stop on an accepted `passed` report held nothing, so it is cleared and the run carries on as its Check again would have.

Schema-23 Kilns refuse schema 24 under the existing newer-schema rule.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Settings (the third setting's stored name, values and reach), §The Loop Ledger (Allow opens no epoch; `allowances` and `leftOpen`), §The Loop Gate (the rows in §The Loop Gate above), §Loop Stops (Check again, Reply, the settings lock, Allow's limit, Accept at a delivery stop, the Accept sentence), §Report Contract (item kinds, `phaseCriteria`, `acceptedTests`), §Prompts, §Interfaces and §Display Contract (the stop page and status line).

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Report contract, version 2 and §Admission (the added fields; which items a `passed` report may list; set-aside leaves in the no-open-phase rules; the routing of a delivery audit whose phases are set aside).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (the test audit runs with phases set aside; items of riding kinds do not keep the run from completing) and §Progress and Detail Contract (the left-open plan row; after-delivery actions shown under **For you**).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Completed feature discovery (pull request state chooses the proposal mode; the baseline accepts a leaf left open), §Durable proposal and one acceptance and §Start, interruption and completion (a same-branch acceptance reuses the delivered branch, worktrees and pull requests), and §Interfaces (Continue is also a public command).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`continue-with-phases`; the renamed settings flag).

## Delivery

- **Expected build spend:** none. Proof uses scripted provider sessions, as the loop limits build did.
- **After the build:** `CHANGELOG.md` entries under Unreleased (`Changed`: delivering when loops run out, the one setting, the loop stop page, what Allow does to the limit, the renamed `kiln settings` flag and JSON keys; `Added`: `kiln continue-with-phases`). The renamed flag and keys, and Allow's new meaning, change a released command surface, which the release's version choice has to weigh. Then the usual release steps.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions writing version-2 reports, the packaged CLI against the local server, the real browser view, and recorded GitHub pull request reads.

| Criteria | Design | Named proof |
|---|---|---|
| AC-CHOICE-01 | Settings; Upgrade | The three settings on Documents found, the run's settings and `kiln settings`; the default delivers at both audits; a schema-23 run under each old value keeps it |
| AC-CHOICE-02 | Settings; Loop Stops | Changing the choice at a delivery loop stop, then restarting, leaves the stop; the next time loops run out the new choice applies |
| AC-GOON-01, AC-GOON-04 | Phases Left Open; Gate | A fourth audit's partly built phases are set aside and the run reaches delivery; the same for phases a test audit adds and for a later delivery audit's; the repository shows no Closed line or checked criterion and the plan rows read not started |
| AC-GOON-02 | Phases Left Open | A test audit's `passed` and `continue_test` reports are admitted with set-aside leaves open, and refused with any other open leaf |
| AC-GOON-03 | Report Contract; Gate | A `none` row stops under `deliver` and the page names the criterion; a result with no `phaseCriteria` stops and says the audit did not say; a report that appends phases without the field is refused |
| AC-LEFT-01 | What Was Left | The prompt block for each kind of work left; a description that drops or rewords it fails the pull request check, in one repository of two |
| AC-LEFT-02 | What Was Left; Interfaces | The finished page and `kiln status` for mockup state 2 |
| AC-LEFT-03 | Continuing | With every pull request open, Continue builds the left-open phases and one added on the branch in the same worktree, counts no loop for them, runs both audits again from zero and updates the pull requests; with one merged, today's path offers them from the delivery base; a failed pull request read offers nothing |
| AC-ITEM-01 | Items; Report Contract | Each kind once: `critical_next_step` stops at once; a blocker listed with `completion_phases` lets the loop run and stops at the report that would deliver; `critical` and `other` reach delivery; each refusal in §Report Contract |
| AC-ITEM-02 | Report Contract; Interfaces | An item with no kind, and a blocker with no `waitsOn`, are refused; the stop page and status show kind, problem, action and what waits |
| AC-ITEM-03 | Items; What Was Left | A run delivers with an `other` item open under each choice and lists it under **For you** after what was left; a `critical` item moves **For you** first; a later audit that omits the item is refused |
| AC-ANSWER-01 | Loop Stops; Interfaces | Status line before loop 1 and after loop 3; headings for each reason and for a lowered limit; loop rows and the waiting row for mockup states 4 and 6 |
| AC-ANSWER-02 | Loop Stops | Allow 2 after 3 loops makes the limit 5 and starts loop 4; Accept at a delivery stop leaves the phases open with no session; Accept at a test stop quotes tests only and keeps other items open; Allow after phases were set aside builds them all as one loop |
| AC-ANSWER-03 | Loop Stops | The text under the number for both audits, and the stuck-row line |
| AC-ANSWER-04 | Loop Stops | The stop's limit is text on the page and refused by `kiln settings`; the other limit and the choice change; Check again is unavailable in both places |
| AC-ANSWER-05 | Loop Stops | No Reply and a refused `reply` at a `loop_limit` stop; Reply offered at a `tests_to_accept` stop; an item stop with no test loop left has an item stop's controls |
| AC-BOT-01 | Interfaces | Each command and each refusal through the packaged CLI; `continue-with-phases` for both proposal modes; controls with availability and reason; an older controller refused |
| AC-BOT-02 | Interfaces | Status text and JSON for a loop stop, an item stop and a finished run with work left |

## Open Questions

- The same-branch continuation records its delivery as the new execution's, beside the completed one, with the same pull request numbers. Kiln Continue Added Phases AC-CONTINUE-05 was written when a new delivery always meant new pull requests, and the conflict check should confirm that reading.
- The PRD does not say where a phase added after delivery must be written while the pull requests are open. This design counts it once it is committed on the feature branch. If the person expects one written on the delivery base to count too, the same-branch proposal would first have to bring the branch up to date, which the run-restart catch-up could do.
