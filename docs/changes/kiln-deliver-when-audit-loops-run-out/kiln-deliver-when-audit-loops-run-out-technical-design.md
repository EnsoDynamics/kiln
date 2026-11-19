# Technical Design: Kiln Deliver When Audit Loops Run Out

**PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md) · **Assumptions:** [TEST-001 open](kiln-deliver-when-audit-loops-run-out-assumptions.md) · **Mockup:** [five screens](mockups/kiln-deliver-when-audit-loops-run-out.html)

## Overview

The loop gate stops being a gate. Kiln still counts loops in the ledger Kiln Audit Loop Limits added, but nothing ever stops for a count: every finding is built, and a kind whose loops are used up is **closed**, which routing reads as "no audit of this kind runs again". Closing happens inside the one routing function, `auditNext`, so the engine's next-step decision and the pull request step's audit currentness check agree on it. The loop stop, its page, Allow, Accept and the third setting are removed.

Two smaller changes ride with it. Each item an audit lists for a person gains a **kind**, and the kind decides whether it stops the run, holds it until the pull request, or goes on and is reported under **For you**. And `kiln status` and two new commands cover the finished page's continuation controls.

Everything here is Kiln's. No Enso Method skill changes (principles 1 and 2): the audits already list items for a person and accept Weak rows on a person's quoted words; Kiln asks for the kind in its own report contract, and decides by its own loop counts when to stop auditing.

## Existing Code

**Posture: Preserve** for everything in Kiln 1.3.0 this design does not name; **removed** for the loop stop machinery below, which this PRD retires.

- Reused: the loop ledger (`epochs`, `loops`, `appendLoop`, `countedLoops`), activity loop rows, the version-2 report and its admission, the outstanding-items ledger (`personItems`), the audit and pull request prompt templates, the continuation check and acceptance core, and the control journal with its receipts.
- Removed: the `loop_limit` stop as something the gate records, `loopStop`, `testHold`, `testDecision`'s stop branch, `needsYouLoopStop`, `holds`, `listedItems`, `applyLoopControl`, `loopControl`, `launchAuditAtStop`, the `allow-more-loops` and `accept-and-deliver` actions and routes, `requestedLaunch` of kind `audit`, `itemsListedStops`, the Accept sentence and `audit-accept.txt`, and `audit-allowed-loops.txt`. A stored `loop_limit` stop is still read, for upgraded runs only (§Upgrade).
- Kept read-only: `acceptances` and `allowed` epochs already in a ledger. No new ones are written; an earlier Accept sentence is still quoted to later test audits by `audit-earlier-acceptances.txt`, because the person's words still stand.
- Kept: a `needs_you` report is never accepted, Reply and Take over at its stop work as today, and Mark complete is offered only where a check fails.

## Settings (AC-CHOICE-01, AC-CHOICE-02)

```
auditLoops:
  deliveryLimit: integer >= 1          — default 4
  testLimit: integer >= 1              — default 4
  lastLoopSentence?:                   — present when the person gave the sentence (AC-LAST-04)
    { sentence: string, at: ISO-8601 UTC, where: "documents_found" | "run_page" | "command_line" }
```

`afterLastTest` and `afterLastTestSource` are gone (§Upgrade maps them). `sentence` holds the words as the help text showed them, so a later Kiln that rewords the help text still quotes what the person saw. At Start, `lastLoopSentence` becomes `{ sentence: <the help text's sentence>, at: <Start time>, where: documents_found }`, because the test audit limit's help text showed the sentence and starting the run with it on screen is the acceptance. No setting or command sets it during a run: a run started without it, which only an upgraded run can be, never gains it. The run's settings panel and `kiln settings` draw the test audit limit's help text from `lastLoopSentence`. With it, they quote the sentence with its where and when. Without it, they say the last test loop carries no acceptance and that Weak rows left are listed under **For you** as not accepted (AC-LAST-04). A continuation copies `Settings` as today, so a continued run carries the sentence with its original where and when.

**When a change applies.** Every routing decision reads the limits fresh, so a change applies at Kiln's next decision whether to run an audit of that kind. Once the pull request session has started, the decisions read `atPullRequest` from the ledger instead (§Loops and the Ledger); the change is still saved to `Settings`, so it carries to a continuation, and the run's settings panel and `kiln settings` say it applies to a continuation.

**The floor.** A limit is refused below its kind's **floor**, as a field error on the page and `invalid_input` on the command line, with the floor in the message. The floor is the loops of that kind used, plus one while the latest audit of that kind was allocated as an audit, not as a loop, and has either not settled or settled with findings not yet counted as a loop. That audit ran because a loop was left, so its findings take that loop; without the extra one, lowering a limit while an audit runs would make its findings a loop past the limit. The snapshot and `kiln status` give the floor, so the page can set the field's minimum.

## Loops and the Ledger (AC-LAST-01, AC-LAST-02)

The ledger keeps its shape, loses `itemsListedStops`, and gains one field:

```
AuditLoopLedger:
  epochs, loops                        — unchanged; no `allowed` epoch is written any more
  acceptances                          — read-only (Existing Code)
  atPullRequest?: { at, deliveryLimit, testLimit }   — the limits frozen at the pull request session (below)
```

A kind is **closed** when its loops used reach its limit (from `atPullRequest` when present). A kind has at least one loop, so before its first loop a kind is never closed.

`atPullRequest` is written once, in the write that starts the run's first pull request session, and never rewritten; a later start of that session keeps it. An upgraded run already past that point gets it from the migration or the ledger rebuild (§Upgrade). When the pull request step's **Current completion audits** row sends the run back to the audits, as it does today when the pull request session's own commits leave an audit no longer current, those audits route on the frozen limits. A kind closed under `atPullRequest` stays closed, so the row asks only for an audit of a kind that still has a loop under the frozen limits, and that audit's findings use one of those loops as usual. A limit changed in this period applies only to a continuation (§Settings, "When a change applies").

**What counts as a loop.** The gate's `deliveryDecision` becomes `loopDecision(leaf)` and never returns a stop:

| The next leaf, or the next audit `auditNext` asks for | Loop |
|---|---|
| A leaf at or under phases a **delivery** audit appended | The delivery loop for that audit: counted when its first leaf launches, joined by the rest |
| A leaf at or under phases a **test** audit appended | A test loop, counted the same way. The one exception: when that audit is itself a counted test loop (a session of test fixes) and no test loop is left, its phases join that loop (AC-LAST-03) |
| A test continuation (`continue_test`) | A test loop, counted in `allocateAudit`'s write as today |
| A fresh delivery or test audit | Not a loop |

A loop's kind is the kind of the audit whose report it acts on; that is the change from Kiln Audit Loop Limits, where a test audit's phases were a delivery loop. Loops already recorded keep the kind they were recorded with.

Findings are always built (AC-LAST-01). The floor means an audit only runs with a loop left for its findings, so in a run started on this Kiln, `loopDecision` always finds one. A run upgraded with more loops counted than its new limit can have findings and no loop left (§Upgrade); those are counted anyway, as that kind's last loop, `last: true`, with the number they reach.

**When a count starts.** As today: a `start` epoch per kind at the first Start, at a continuation's activation and at a base-branch Start from the Folder missing page; nothing else opens one (AC-LAST-02).

## Routing After the Last Loop (AC-LAST-03, AC-CHOICE-02)

`AdmissionContext` gains `closed: { delivery: boolean; test: boolean }`, which the engine fills from the ledger and limits. `auditNext` applies it in two places and is otherwise unchanged:

- **Delivery closed.** Wherever `auditNext` would return `delivery_audit` because the latest delivery audit did not pass, is not current, or a test audit changed implementation, it goes on as if that delivery audit had passed and were current.
- **Test closed.** `test_audit` and `continue_test` become `final_delivery`. So does `delivery_audit`, unless the latest delivery audit's own result is not a pass: an open delivery chain finishes first, as when a raised delivery limit has reopened delivery after its last loop (below).

The second rule is what makes the test audit's last loop the end: after it, Kiln opens the pull request even when that loop built phases or changed implementation and delivery loops are left. This is the cost the PRD's Business Context accepts: the work of each kind's last loop is not audited again before the pull request.

Because the closing is inside `auditNext`, the pull request step's **Current completion audits** row, which also asks `auditNext`, does not send a finished run back to an audit of a closed kind.

Walking the cases the PRD names:

| Situation | `auditNext` with closure |
|---|---|
| Delivery loop 4 of 4 built | Delivery closed: the test audit |
| A test audit's phases built, delivery loops used up | Delivery closed, so no delivery audit after them; the test audit again while a test loop is left |
| A session of test fixes that is the last test loop reports `continue_test` | Test closed: the pull request; the saved work is not started (§The Last Test Loop) |
| The same session reports `completion_phases` | `loopDecision` joins its phases to that loop; once built, the pull request |
| The delivery limit raised after its last loop, test audit under way | That activity finishes first (a pending audit always runs first); delivery is open again and its latest result is not a pass, so a delivery audit runs; then the test audit while a test loop is left, otherwise the pull request |
| The test limit raised after its last loop | Test open again: whatever `auditNext` asks today, a continuation for saved work or a fresh round when the work changed. A last loop whose session passed on current work leaves nothing for a test audit, so nothing runs |
| Either raised after the pull request session started | `atPullRequest` still closes it; the change waits for a continuation |

## The Last Test Loop (AC-LAST-04, AC-LAST-05)

`audit-loop-limits.txt` is rewritten and fills the audit prompt's `{{loops}}` slot in two cases, read from the ledger as the prompt is built (and rebuilt the same way after a restart):

- **The session of the test audit's last loop**, a continuation counted with `last: true`: no more test audit loops follow and no session of test fixes follows this one. Then exactly one of:
  - with `lastLoopSentence`: "I accept the remaining Weak rows after the last test audit loop.", quoted as the person's words with where and when, as today's default was, and recorded in the session's `carried`;
  - without it: no acceptance was given, so every Weak row still left is listed as an item of kind `test`.

  In both, each test the sentence does not accept (a criterion with no test, a failing test, a high-risk criterion still Weak, a stuck row) is listed as an item of kind `test` with its `criterion`, and saved test work is listed the same way, one item per criterion it covers, with what is left.
- **A fresh test audit whose findings will be the last loop** (test loops used are one below the limit): if it adds phases, Kiln builds them and no test audit runs after; so each test row those phases will not fix is listed as an item of kind `test`. If it saves test work, one session of test fixes follows, and it is the last.

A last loop that only builds phases has no audit session, so it carries no sentence. Admission refuses a `continue_test` report while no test loop is left unless it lists at least one `test` item; that is the only way Kiln learns which criteria saved work covers (AC-LAST-03).

Kiln marks nothing built and closes nothing itself (AC-LAST-05): a criterion's state comes only from its sessions' commits, and unaccepted tests reach **For you** as `test` items (§Items for a Person).

## Items for a Person (AC-ITEM-01 to AC-ITEM-03)

### Report contract

The report stays `schemaVersion` 2; each `needsYou` entry gains two fields:

```
needsYou entry:
  id?, problem, action, criterion?     — unchanged
  kind: "critical_next_step" | "critical" | "blocker" | "business_question" | "test" | "other"
  waitsOn?: string                     — what waits on it
```

`PersonItem` gains `kind` and `waitsOn`, kept across a relisting by `id` unless the relisting gives a new value, as `criterion` is. So a relisting needs only `id`, `problem` and `action`.

Admission refuses, naming the entry:

- an entry whose kind, as given or kept from the ledger, is missing;
- a `critical_next_step`, `blocker` or `business_question` item without `waitsOn`;
- a `critical_next_step` item under any outcome but `needs_you`;
- a `needs_you` report with no `critical_next_step`, `blocker` or `business_question` item: an audit whose items let the work go on reports the outcome it reached;
- a `continue_test` report while no test loop is left that lists no `test` item (§The Last Test Loop).

Two released refusals are lifted: a `passed` report may list new items, and a test audit that changed only tests may list items. Every other item is admitted as it stands.

### What each kind does

| Kind | Effect | How Kiln applies it |
|---|---|---|
| `critical_next_step` | Stops | Arrives only on a `needs_you` report, which is the ordinary Needs you stop |
| `blocker`, `business_question` | Holds | See below |
| `critical`, `test`, `other` | Goes on | Stays outstanding; later audits account for it by id as today; listed under **For you** at delivery |

**How a hold is measured.** As today, the audit says through its outcome whether the work it leaves needs the item: `completion_phases` or `continue_test` with a holding item listed means that work does not, so Kiln builds it; `needs_you` means it does. Kiln keeps no dependency model of its own, which would be a second judge beside the audit. Delivery always needs a holding item, so Kiln checks once more before delivery, because with closed kinds no audit may run between the last build and the pull request:

**The hold stop.** The hold check runs at every arrival at `final_delivery`, before anything that can complete the run (the pull request precheck on a pull request an earlier session opened, and the pull request step's own check), so a holding item listed by an audit the run was sent back to stops the run rather than completing it. While an outstanding item no waiver covers is `blocker`, `business_question` or has no kind (from before kinds, §Upgrade), Kiln neither starts the pull request session nor completes the run. The stop is a launch-check stop on the pull request step, recorded and rechecked as the **Completion audit readiness** stop is (`selection` kind), with one failing row, **Nothing holds the run**. It is not a known-problem check, so no waiver matches it by its text. The row is built with one `other` item per holding item: `subject` and `against` are the item's ledger id (`item-<n>`), and `text` is its kind's words, problem, action and what waits on it. Because `against` names the item rather than the feature heads, a waiver still covers it after the pull request session commits and a send-back returns the run here. The row passes when a waiver covers every item. When a later arrival brings a holding item no waiver covers, the row fails again on that item alone: earlier waived items keep their **Waived** tag, and the new waiver saves only the uncovered items. Matching by ledger id is safe because ids are never reused within an execution, and a new execution starts with no waivers and an empty ledger.

A pull request session can have run already, when its check sent the run back to the audits. Either way the stop is rechecked and waived without a session: whenever a failing row is **Nothing holds the run**, the offer is **Continue in normal order** with effect `continued`, never Mark final delivery complete, so waiving it can never complete the run. The offer and the waiver's effect follow the row, not whether the step has run.

- **Check again** reruns routing, on the limits that apply, and the hold check, and clears the stop when nothing holds. Before the pull request session has started, an audit runs only where a raised limit reopens a kind with work for it, such as saved test work, and that audit can then settle the item. After it has started, the limits are `atPullRequest`, so a raised limit reopens nothing, and only an audit of a kind with a frozen loop left can settle the item. With both kinds closed and nothing to audit, no audit can settle it.
- **Continue in normal order** is the way on without one: the person provides what each item asks outside Kiln, then waives the row with effect `continued`. Kiln records no settlement, because only an audit's report settles an item (Method-Neutral Audits AC-NEUTRAL-03). The waived items hold nothing again, the pull request session starts, and they are listed under **For you** as still open, each with its **Waived** tag naming the pull request step, the time and the source (Completion Waivers AC-WAIVE-10).
- Reply and Take over are not offered: the stop belongs to no session, even when an earlier pull request session ran.

The page is mockup screen 5 with the pull request step's lead.

The audit prompt names the step each outcome leads to (§Prompts), so an audit with nothing left to build and a holding item open reports `needs_you` itself; the hold stop catches the cases it cannot foresee: a blocker listed beside phases that turn out to be the last work, or a limit lowered after it reported.

### For you

**For you** is every item outstanding at delivery, `critical_next_step` and `critical` items first, then the rest in listing order. Each item is one line, built by Kiln and copied word for word into each pull request's description, the finished page and `kiln status` (§What a Delivered Run Says): its kind's words, a colon, its problem, then its action. The words are **Critical finding** for `critical_next_step` and `critical`, **Blocker** for `blocker`, **Business question** for `business_question`, and **Test not accepted** for `test`. An `other` item, or one with no kind (§Upgrade), has no words: it opens with its problem, which carries whatever the audit called it. On the finished page the kind's words are bold. An item waived at the hold stop shows its **Waived** tag, from the latest waiver of a **Nothing holds the run** item whose subject is the item's id. Settled items stay under **Settled during the build**, as today.

## What a Delivered Run Says (AC-LEFT-01, AC-LEFT-02)

**The pull request description.** `pull-request-person-items.txt` is rewritten to open each description with, in order and word for word:

1. `## For you`, when any item is outstanding (above);
2. `## Closing audits`: "Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops.", from the ledger and `atPullRequest`, then today's last-loop line from `pull-request-loop-acceptance.txt` when a session carried a sentence;
3. **Settled during the build**, as today.

This is an instruction in the pull request prompt, as the settled items are today; Kiln does not read the description back. Each pull request of a multi-repository run gets the same block.

**The finished page and `kiln status`.** A delivered run shows a **Closing audits** list with each kind's loops used and limit, and **For you**, beside the delivery facts shown today (mockup screen 3). The heading is unchanged. Both read the ledger and `atPullRequest`, so they keep showing what the run had at delivery after a later settings change.

## The Status Line (AC-STOP-05)

During the closing audits the status line names the kind and where it stands, from a `position` the snapshot derives from the current or stopped activity and the ledger:

| The activity | `position` | Status line |
|---|---|---|
| An audit allocated as an audit, no loop of its kind yet | `{ audit, afterLoop: 0, limit }` | **Delivery audit (before loop 1)** |
| The same, after loops | `{ audit, afterLoop: N, limit }` | **Delivery audit (after loop 2 of 4)** |
| A leaf or session that is part of a loop | `{ audit, loop: N, limit, last }` | **Delivery audit loop 3 of 4**, or **… · last loop** |
| The hold stop | The latest audit's position | As the row above it |

`limit` is the current one (or `atPullRequest`'s), and `last` is true when no loop of that kind is left after this one, so a raise during the last loop drops **last loop** at once. A session of test fixes reads as a loop, not an audit. The activity rows keep their loop labels from the ledger, as today.

## Removed Controls (AC-STOP-04)

Kiln never records a loop stop. The loop stop page, **Allow _N_ more loops** and **Accept what is left and deliver** are removed from the page. `kiln allow-more-loops` and `kiln accept-and-deliver` stay in the CLI only to refuse, exit code 2, `removed_command`: "Kiln no longer stops at a loop limit. Change the limits with kiln settings." The control journal refuses either action from an older script with the same code and reason. The `settings` input `after_last_test_audit_loop` and the flag `--after-last-test-audit-loop` are refused the same way, saying the setting was removed and the last test loop carries the sentence when the run was started with it. The CLI refuses both commands and the flag before it reads any other flag or looks up the controller, so the refusal needs no `--command-id` and is the same whatever the controller's version.

## Interfaces (AC-BOT-01, AC-BOT-02)

**Command line.**

```
kiln settings <prd> [--delivery-audit-loops N] [--test-audit-loops N]   (with the existing flags)
kiln check-for-new-phases <prd>
kiln continue-with-phases <prd> --proposal ID --only-if-status-matches <token> --command-id ID
```

- `kiln settings` refuses a limit below the floor, shows the test audit limit's help text from `lastLoopSentence` (both §Settings) and, after the pull request session has started, says the change applies to a continuation.
- `check-for-new-phases` runs the finished page's check through a new `POST /api/control/v1/continuation/check`, which calls the same engine check as the page's `POST /api/continuation/check`, takes no inputs and keeps no receipt. It needs a live controller and is refused unless the run is finished and idle (`wrong_activity`, `busy`).
- `continue-with-phases` makes the internal `continuation-accept` action public under this name, with that action's refusals (`proposal_changed` and the rest) and its receipt, keyed by command ID and status token as the page sends them. A proposal that still needs **Authorize early merges** is refused with that reason; the authorization stays in the browser.

**Status and snapshot.** Both carry the same objects, text and JSON (`audit_loops` in JSON):

```
auditLoops:
  settings: { deliveryLimit, testLimit, lastLoopSentence: { sentence, at, where } | null }
  delivery, test: { used, limit, closed, floor }
  frozen?: { at }                      — the pull request session started; changes apply to a continuation
  position?: { audit: "delivery" | "test", loop?, afterLoop?, limit, last }   — §The Status Line
items?: { id?, kind, problem, action, waitsOn?, criterion?, effect: "stops" | "holds" | "goes_on" }[]
                                       — at a Needs you stop on an audit, and at the hold stop
delivered?:                            — on a finished run
  loops: { delivery: { used, limit }, test: { used, limit } }
  forYou: items, same shape
  pullRequests: { repository, number, url }[]
continuation?:                         — on a finished run, from the view the page reads
  check: { status, attemptedAt?, lastSuccessfulAt?, errors }
  proposal?: { id, readiness, phases, problems }
```

`kiln status` text prints the position line, a stop's items with their kind and what waits, a finished run's loop line and **For you**, and the continuation offer. Its controls list gives `settings`, `check-for-new-phases`, `continue-with-phases` and the handoff, each with availability and reason.

**Compatibility.** The controller advertises a `loop_limits_move_on` feature and stops advertising `audit_loops`. The CLI refuses `check-for-new-phases`, `continue-with-phases` and the `kiln settings` flags `--delivery-audit-loops` and `--test-audit-loops` against a controller without it (`instance_incompatible`, "This controller does not support the new audit loop limits. Restart it with updated Kiln."), in place of today's `audit_loops` check. The other `kiln settings` flags reach an older controller as before. The removed commands and flag are refused whatever the controller's version (§Removed Controls). `kiln status` renders the new loop lines only when the controller advertises `loop_limits_move_on`. A run still under a 1.3.0 controller keeps that controller's own page until it is restarted with updated Kiln (§Upgrade). Released `audit_loops` fields that described the removed setting and stop (`after_last_test_audit_loop*`, `stop`) are removed rather than kept with a meaning they no longer have (§Delivery).

## Prompts

- `audit-session.txt`: the two entry fields; the six kinds, in the PRD's words, with what is never an item (a declared assumption, a request to confirm or review, anything the audit can settle itself); a new `{{nextSteps}}` slot naming the step each outcome leads to, from routing with the current limits ("completion_phases: Kiln builds your phases as delivery audit loop 3 of 4, then runs the delivery audit again"; "passed: Kiln opens the pull request"). The outcome guidance becomes: `needs_you` when the work this report leaves cannot go on without an item, when a critical finding would be caused or worsened by that next step, or when nothing is left to build and a holding item is open before the pull request. The released line asking for `needs_you` whenever the audit ends normally but lists something is dropped, as is the rule that a test audit changing only tests lists nothing.
- `audit-loop-limits.txt`: rewritten (§The Last Test Loop).
- `pull-request-person-items.txt`: rewritten (§What a Delivered Run Says). `pull-request-loop-acceptance.txt` unchanged.
- `audit-accept.txt` and `audit-allowed-loops.txt`: deleted. `audit-earlier-acceptances.txt`: unchanged, reached only by upgraded runs.

## Upgrade (AC-CHOICE-01, AC-CHOICE-03)

Schema 24, in the record migration:

- Both limits go up by one, on every record. On a started run that is the PRD's rule: a limit of 3 meant three loops and a fourth audit whose findings were not built, which a limit of 4 now covers. A record not yet started gets the same, so its draft settings keep the same meaning on the screen the person will see. A run that Kiln Audit Loop Limits' migration set to 3 and 3 reaches 4 and 4 the same way, so the schema-22 step writes its own literal values (3, 3 and its `afterLastTest`), not the new defaults: read through the new defaults, a schema-21 record would reach 4 at step 22 and 5 at step 24.
- `afterLastTest: deliver_unless_serious` with a person's source becomes `lastLoopSentence` with the released sentence and that source's time and place. A record not yet started gets `lastLoopSentence` at Start, as a new one does. `stop_and_ask`, and the `kiln_for_earlier_run` source, give none.
- `itemsListedStops` is dropped. `acceptances`, epochs and loops stay as recorded.
- A record whose pull request step already has a session gets `atPullRequest`, whether or not the run is complete. Its limits are the record's own limits after the raise above, and its `at` is the `createdAt` of the record's `pr` activity, written when that session first launched. A run started without a ledger gets it when the engine rebuilds the ledger. Kiln 1.3.0 kept no snapshot of the limits, so the record's own limits are the best record of what held.
- A `needs_you` stop on an audit, whose report was admitted before kinds, is marked `kindsNeeded`. The marker lives on the stop.

In the engine:

- **A stored `loop_limit` stop** is shown as a Needs you stop with one line, "Kiln no longer stops at a loop limit. Check again to go on.", and Check again only. Its recheck, which Check again and `kiln run` both reach, always clears it, and routing then goes on: waiting phases are built and saved test work continued as that kind's next loop, the last under the raised limit, and an `items_listed` stop goes on to a delivery audit. Kiln 1.3.0 admitted a passing test report with items only when it changed implementation, so `auditNext` asks for a delivery audit after it. That fresh delivery audit is not a loop (§Loops and the Ledger). It must account for each outstanding item, and admission refuses a relisting whose kind is missing, so each item comes back with its kind and Kiln handles it by that kind (AC-CHOICE-03).
- **A `kindsNeeded` stop.** Its recheck submits the report again, and admission refuses it for missing kinds. When `resumeOffered` holds, Kiln then resumes the audit's own session as Resume does (`person_resume`, no note), on the audit recovery prompt, which now carries the kinds contract beside the refusal (`resume-audit-refusal.txt`), so the session gives each item its kind and submits again, and Kiln then handles each item by its kind (AC-CHOICE-03). Check again does this after its recheck. At `kiln run`, the start decision does it in place of returning `needs_you`: it returns `resume`, so the restart review offers Resume and Continue re-decides. When the run starts, the stop is deleted, and the marker with it, so this happens once; a later refusal is an ordinary stop. When `resumeOffered` is false (no transcript, a takeover held, Codex history gone), the stop stays an ordinary Needs you stop. It shows the refusal and offers what an audit stop whose conversation can't be reopened offers today: Check again, Mark complete, and the terminal recovery instructions. Kiln starts no fresh audit session.
- **Items with no kind** stay outstanding until an audit relists them, which must give a kind. Delivery comes first only when the delivery kind is closed at the upgrade, which happens only when a person lowered its limit below the loops already used. Then the items hold the run at the hold stop: under the earlier Kiln they kept the run from delivering, and Kiln cannot sort them itself.

Schema-23 Kilns refuse schema 24 under the existing newer-schema rule.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Settings (two limits, default 4, `lastLoopSentence`), §The Loop Ledger (a test audit's phases are a test loop; no `allowed` epoch or acceptance is written; `itemsListedStops` removed; `atPullRequest`), §The Loop Gate (it never stops; closing is in `auditNext`), §Loop Stops (removed), §Report Contract (item kinds), §Prompts, §Interfaces and §Display Contract (no loop stop page; the status line position) and §Upgrade (schema 24).

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Report contract, version 2 (`kind` and `waitsOn` on `needsYou` entries) and §Admission (the refusals and lifted refusals in §Items for a Person).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (no audit of a closed kind runs; a holding item stops the run before the pull request; items that go on do not keep the run from completing) and §Progress and Detail Contract (the status line names the audit and loop).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`check-for-new-phases` and `continue-with-phases` added; `allow-more-loops`, `accept-and-deliver` and the third loop setting refused as removed) and §Local API and Integration Points (`POST /api/control/v1/continuation/check`).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Durable proposal and one acceptance (`continuation-accept` becomes the public `continue-with-phases` action; the grant action stays browser-only).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Snapshot (`auditLoops` position and floor, `items`, `delivered`, `continuation`).

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Pull Requests (each description opens with **For you** and **Closing audits**) and §Screens (AC-SHOW-01) (the finished page's **Closing audits** and **For you**).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §Display Contract (the Complete screen also shows the loops used of each kind).

## Delivery

- **Expected build spend:** none. Proof uses scripted provider sessions, as the loop limits build did.
- **After the build:** `CHANGELOG.md` under Unreleased. `Changed`: whatever an audit finds is built, and after a kind's last loop Kiln moves on; both limits default to 4 and running runs gain one; the status line names the loop; only some items stop the run, and the rest are listed under **For you**. `Removed`: the loop stop page, Allow and Accept, `kiln allow-more-loops`, `kiln accept-and-deliver`, **After the last test audit loop**, `--after-last-test-audit-loop` and the `audit_loops` status fields for them. `Added`: `kiln check-for-new-phases`, `kiln continue-with-phases`. Removing commands and status fields is an incompatible change to the command line, so under the repository's release rules this release is a major version. Then the usual release steps.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions writing version-2 reports, the packaged CLI against the local server, and the real browser view. No paid model calls.

| Criteria | Design | Named proof |
|---|---|---|
| AC-CHOICE-01 | Settings; Upgrade | Two settings with default 4 on Documents found, the run's settings and `kiln settings`; the help text shows the sentence; on the run's settings panel and `kiln settings`, the help text quotes the sentence with its where and when, and on an upgraded run without it says the last test loop carries no acceptance; Start records `lastLoopSentence`; a schema-23 run under each old choice migrates to limits +1 and the right `lastLoopSentence`; a schema-21 record reaches 4 and 4; an upgraded run caught mid pull request step reports `frozen`, and a raise after the upgrade reopens nothing; an upgraded finished run keeps its **Closing audits** limits after a settings change |
| AC-CHOICE-02 | Settings; Routing | A limit below the floor is refused on both surfaces, including while an audit of that kind runs; raising delivery after its last loop while a test audit runs lets it finish, then runs a delivery audit, then the test audit only while a test loop is left; raising test after its last loop runs a continuation for saved work; after the pull request session starts, a raise runs nothing, `atPullRequest` survives a second pull request session, an audit the run is sent back to uses a frozen loop, and a continuation carries the raise |
| AC-CHOICE-03 | Upgrade | Stored `phases_added`, `test_work_saved` and `items_listed` stops each go on at Check again and at `kiln run`, the `items_listed` stop to a delivery audit that relists its items with kinds; kind-less items reach the hold stop only when delivery was closed at the upgrade; a `kindsNeeded` `needs_you` stop resumes its audit session with the refusal, at Check again and at `kiln run` (where the restart review offers Resume), once, and is then handled by kind; with no conversation to reopen it stays an ordinary Needs you stop with Check again, Mark complete and the terminal recovery instructions, and no fresh audit session starts |
| AC-LAST-01, AC-LAST-02 | Loops and the Ledger | A delivery audit's phases split into leaves are one delivery loop; a test audit's phases are a test loop; a continuation is a test loop; a fresh audit is not; an upgraded run past its limit builds waiting phases as its last loop |
| AC-LAST-03 | Routing | Each row of the routing table, and the pull request step's audit check passing after both kinds close |
| AC-LAST-04, AC-LAST-05 | The Last Test Loop | The last loop's prompt with and without `lastLoopSentence`, the prompt of the audit whose findings will be the last loop, a phases-only last loop carrying nothing, a `continue_test` last-loop report with no `test` item refused |
| AC-LEFT-01, AC-LEFT-02 | What a Delivered Run Says | The pull request prompt's block in order, with and without **For you**, in both repositories of a two-repository run; the finished page and status for mockup screen 3, unchanged by a later settings change |
| AC-ITEM-01 | Items | Each kind once: `critical_next_step` stops; a blocker beside `completion_phases` lets the build run and reaches the hold stop; Check again there stays stopped with both kinds closed; Continue in normal order there starts the pull request session with the item under **For you** as still open with its **Waived** tag, not under **Settled during the build**, and does not stop on it again; a later arrival with a new holding item stops again on that item alone, while the earlier waived items keep their **Waived** tag; a hold stop on `pr` after a pull request session's check sent the run back to the audits offers Continue in normal order, not Mark final delivery complete, and neither waiving it nor an earlier pull request that passes completes the run; a send-back after the pull request session started routes on the frozen limits, and a holding item listed by that audit stops the run rather than completing it, with Check again after a raised limit still stopped; `critical`, `test` and `other` reach delivery |
| AC-ITEM-02 | Report contract | Each refusal; a relisting by id keeps kind, `waitsOn` and criterion; mockup screen 5 from a scripted blocker; status shows the same |
| AC-ITEM-03 | Items; What a Delivered Run Says | `critical_next_step` and `critical` items are first under **For you**; each item's line, with its kind's words, is built once and is the same in the pull request description, the finished page and `kiln status`; a test audit that changed only tests delivers with an `other` item open |
| AC-STOP-04 | Removed Controls | The two commands and the removed setting refused through the packaged CLI and the journal with the message, the CLI's refusal given with no `--command-id`; no limit ever records a stop |
| AC-STOP-05 | The Status Line | Each row of its table, a raise during the last loop dropping **last loop**, the position kept at a Needs you stop |
| AC-BOT-01, AC-BOT-02 | Interfaces | Both new commands and their refusals; controls with availability; both new commands and the two loop flags refused against a controller without `loop_limits_move_on` and accepted against the new one; status text and JSON for a loop in progress, a Needs you stop with items, the hold stop, and a finished run with a continuation offer |

## Open Questions

- TEST-001 is open with the stakeholder. If they choose the alternative, `test` items join the holding kinds for the hold stop only: a run whose test loops are used up stops there with each such test listed, and Continue in normal order is how the person accepts them. Nothing else changes.
