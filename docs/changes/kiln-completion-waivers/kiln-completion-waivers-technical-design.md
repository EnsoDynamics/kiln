# Technical Design: Kiln completion waivers

**PRD:** [Kiln completion waivers](kiln-completion-waivers-prd.md) · **Assumptions:** [all validated 2026-11-02](kiln-completion-waivers-assumptions.md) · **Mockup:** [kiln-completion-waivers.html](mockups/kiln-completion-waivers.html)

## Overview

A waiver is a saved, append-only record that one stopped activity was accepted despite named failing items. Three changes carry the whole feature:

1. **Checks report items.** Every failing check lists each failing item with a stable identity and what it was checked against, so a waiver can name exactly what it skipped and later checks can recognize the same item.
2. **One coverage rule.** Before any caller reads a check's result to decide what happens next, one function marks each failing item that an unexpired waiver covers. A check whose failing items are all covered is met, and shows **Waived**.
3. **Mark complete is evaluate-then-act.** It reruns the stop's own check under the engine's existing exclusive checking boundary, compares the failing items with the check run the button was offered on, and only on an exact match saves the waiver, with any completion it grants, in one record write.

Everything else is routing that already exists, taught to read waivers: the phase plan treats a waived Closed line as closed, the audit scheduler treats a waived audit as its report allows, and a waived plan or audit-readiness problem makes the loop take its normal next step instead of stopping.

## Existing Code

**Posture: Preserve.** Every check keeps what it accepts (PRD, Out of Scope); this design changes what checks report and how their results are read.

- Reuse the single engine owner, its `checking` boundary and the control journal's admission, receipts, status tokens and crash reconciliation for the new action. No second lock or journal.
- Reuse the hand-back design's evaluate-then-act shape (`kiln-needs-you-handoff` §Evaluate, then act): Mark complete is a third intent beside Verify and Resume.
- Reuse the atomic private record write. A waiver and the completion it grants are one write; a failed write restores memory and advances nothing, as completion acceptance does today.
- Reuse `auditNext`, admission and snapshots unchanged in what they accept; they gain an effective-result accessor and an effective plan.
- Must keep: a plain **Passed** always means the check passed; AC-WAIVE-01; a waiver is never development evidence, so no deployment, verification or merge fact is written from one.

## Architecture

An extension of the local TypeScript engine, browser view and CLI. No new service, store, queue or timer. Waivers live in the execution's private PRD record beside phase facts; audit-waiver results live in the existing immutable audit store. Persisted schema goes from 18 to 19 (Upgrade, below).

## Failing Items (AC-WAIVE-11)

A check result gains a list of its failing items. `facts` stays the display list; for a failing check each failing item is one fact line, in the same order.

```
CheckResult (extended):
  name, passed, facts           — as today
  items?: CheckItem[]           — every failing item; absent or empty when passed
  waived?: true                 — passed only because every failing item is covered

CheckItem:
  kind: phase_closed | repository_work | development_requirement | known_problem | other
  subject: string     — phase id | repository name | "<checkpointId>/<requirementId>" | failure text | item key
  text: string        — the failure text shown as its fact line
  against: string     — canonical fingerprint of what it was checked against (table below)
  waiver?: WaiverRef  — set by the coverage rule: {waiverId, activityKey, at, via, account, by?}
```

Item kind, identity and fingerprint follow AC-WAIVE-09's table row for row:

| Kind | Produced by | Match key | `against` | Coverage ends when |
|---|---|---|---|---|
| `phase_closed` | **Phase doc closed** | kind + phase id | the phase id, valid only while that id is a leaf of the current plan | AC-WAIVE-09 |
| `repository_work` | **Everything committed**, **Pushed**, and any final-delivery reason that a repository has uncommitted or unpushed work | kind + repository | feature-head SHA and a digest of `git status --porcelain --untracked-files=all`, the tracked changes' binary diff against HEAD and each untracked file's content blob | AC-WAIVE-09 |
| `development_requirement` | **Required development delivery verified**, and final delivery's per-checkpoint reasons | kind + `checkpointId/requirementId` (including `requiredMerge`); a checkpoint's unresolved prerequisite is `dependentId/prerequisite:prerequisiteId` | checkpoint id and its merge result revision (or `unmerged`); for a prerequisite item, the prerequisite's, since that is what the item asserts, so the dependent's own merge under the waiver does not end it | the checkpoint (for a prerequisite item, the prerequisite) is superseded, or its merge revision changes; a superseded dependent has a new id, so a new key |
| `other` (assessment) | **Required development delivery verified**, when the owner has no assessment bound to its current documents | check name + the fact text, which names the phase or audit; final delivery judges a phase's item under that phase's check before carrying the uncovered ones into its own | `documents:` and the owner's `documentsDigest` (plus `:` and its `requirementManifestDigest` for an audit), the same binding a current assessment must equal, so a commit elsewhere never ends it | AC-WAIVE-09 |
| `known_problem` | **Phase plan reads**, **Completion audit readiness** | kind + failure text, under either check | the failure text | AC-WAIVE-09 |
| `other` | every other check | check name + item key (a repository name where the check is per repository, otherwise the fact text); for a launch check (**Billing approval**, **Agent selection and readiness**, **Codex launch settings**, **Preparation permissions**) the item key also names the stopped activity | every set-up repository's feature head, as `name=sha` pairs in repository order | AC-WAIVE-09 |

When the plan does not read, **Phase doc closed** judges the launched leaf against the order source Normal Order uses, as §Coverage judges its leaf validity. If the leaf's own document reads, the row reports its Closed line ("Closed line in …" or "No Closed line in …") as a `phase_closed` item keyed by the phase; if it does not, the row fails with the plan problem as its fact, still a `phase_closed` item keyed by that phase, because a Closed-line item matches by the phase whatever its text. The plan problem itself is always the **Phase plan reads** `known_problem` item, and the done check still fails while the plan does not read, so what it accepts is unchanged. Under a waived plan problem, a phase Kiln launches that writes its Closed line therefore completes, with the plan warning; one that does not stops once on its own "No Closed line" item, a problem Kiln has not stopped on before, and waiving that stop gives it `closedByWaiver` like any other Closed waiver.

Producers that stop at their first problem change to collect every problem, without changing what passes: the development-delivery owner check (one item per unresolved obligation and per unresolved prerequisite), final delivery's repository evaluation (every reason per repository, not the first), and any other producer whose facts carry only the first failure. A check that is one judgment stays one item: **Audit result recorded** names the one report and its first refusal reason, and **Phase plan reads** carries its joined problem text, because its match key is that text. A producer with no structured subject emits `other` items keyed by fact text; there is no failing check without items.

A plan that reads with structural problems, or that the retained baseline cannot reconcile, is a failing **Phase plan reads** row in every check run, including the hand-back evaluation and the audit done check. Resume still never dispatches on such a plan: at a hand-back stop it is refused as `check_unavailable`, as before, while Verify and Mark complete see the failing row. Only an unavailable read (`PlanRead.unavailable`: a missing worktree or directory, an I/O error) is a check that could not finish. What fails is unchanged; a structural problem is reported as a failing item, so it can be waived (AC-WAIVE-02).

## Check Runs and When Mark Complete Is Offered (AC-WAIVE-02)

A stop records the identity of its latest check run:

```
PhaseStop (extended):
  run: { id: uuid, at: ISO-8601, origin: stop | recheck, finished: boolean }
```

`recordStop` writes `origin: stop`. Every recheck of the stop (Check again, Verify, the rerun inside Mark complete, `kiln run` on a stopped activity, the evaluation inside Resume) writes a new run with `origin: recheck`; a recheck that could not finish (`CompletionCheckUnavailable`, an unavailable plan read) writes `finished: false` and keeps the earlier rows labelled with their own time, as today. The run id joins the control fingerprint, so a new run changes the status token and a token issued before it no longer matches.

A recheck reruns the check that raised the stop and keeps the stop, with the new run, while that check still fails; it clears the stop only when the check passes. A **Phase plan reads** stop reruns the condition that raised it: the plan read, then the named-repository add for the next leaf, then, when the stop is on the activation-recovery leaf, whether that leaf is still in the plan; it keeps the stop with the new run while any of these fails. One exception stands as today: at final delivery, a Check again whose only failing check is **Current completion audits** clears the stop, and Kiln runs the required audit. A **Completion audit readiness** stop reruns the scheduling decision and, when the next step is an audit, its skill resolution, without allocating an activity; a **Preparation permissions** stop on an activity that has not run reruns the preparation permission read; an **Agent selection and readiness** stop reruns selection, as today. A development check that stops an already-complete activity (the delivery check on a closed leaf before scheduling, or a finished audit's owner check inside the next-activity choice) reruns only that check, after delivery reconciliation, not the activity's whole done check; when it passes, the stop clears and the activity's facts are not rewritten, and a facts entry the stop itself created (no sessions, no completion) is removed, as a cleared plan stop's is.

A launch check (**Billing approval**, **Agent selection and readiness**, **Codex launch settings**, **Preparation permissions**) can stop an activity before it runs. A recheck reruns the launch check first; when it passes, the stop clears and the loop launches, as today. When it still fails, the same check run also runs the activity's own completion check (the done check for a phase, the audit done check for an audit, the final-delivery check for final delivery) and saves those rows beside the launch check. A billing hold's check is a saved **Billing approval** row rather than one the snapshot appends. A billing hold carries its own run and rows, `BillingHold.run` (the shape of `PhaseStop.run`) and `BillingHold.checks`, never a separate stop: placing the hold saves the retained stop's or wait's rows plus the **Billing approval** row, with `origin: stop`, and leaves the retained stop unchanged. While a hold names the activity, its run and rows govern Mark complete and the snapshot, which reads them rather than appending a row. Each recheck replaces the hold's rows and run (`finished: false` when it could not finish, beside the stop that branch already writes), and releasing the hold removes both. Mark complete then waives every unmet item in that run, a phase's Closed line included, and completes the activity without launching it; the effective plan marks the phase `closedByWaiver`, so Kiln never picks it again, and an unstarted audit's missing report counts as AC-WAIVE-12's "none usable". The waived launch item never stands in for a later launch: its item key names the activity it stopped, which the waiver completes, so no later launch raises the same item, and billing approval, agent selection and launch settings still govern every later launch (AC-WAIVE-09's "covers only the items it named"). This applies only to a stop whose activity has not run (its latest session has no run). When it has run (a billing hold with `action: resume`, or a **Preparation permissions** stop saved as `done_check`), the recheck is the activity's completion check, as today, and a pass completes the activity and releases its hold. The launch item is then not part of the check run: Mark complete never waives it, and its preview counts only the run's rows. The hold's `checks` then hold only the run's rows, and the **Billing approval** row is shown beside them from the hold's billing state, outside the run, never saved in `checks` and never waivable; only for an activity that has not run is it a saved row inside the run. Check again and Verify never relaunch or resume a session. Mark complete on a failing completion check completes the activity through the same write a passing Verify uses, which releases that activity's hold; nothing is launched, so no billing approval is needed. Otherwise the hold is released only by billing approval or Resume, as today, and billing approval and preparation permissions still govern every later launch and resume.

For a **Codex launch settings** stop, the launch check is a launch-settings probe. The recheck reruns agent selection and the Codex launch preparation with the options the next launch would use; a failure there is an **Agent selection and readiness** row. It then starts a short-lived Codex app-server, sends `thread/start` with the launch's thread parameters, `ephemeral: true` and no provider fallback, compares the returned settings exactly as a launch does apart from the durable-identity requirement (an ephemeral thread never has one), and closes the server. It never sends `turn/start`, so nothing is dispatched, billed or saved to Codex history. When the comparison passes, the stop clears and the loop launches as today, where the full comparison, durable identity included, runs again. When it fails, the stop keeps a failing **Codex launch settings** row with the new message, plus the activity's completion rows. `thread/start` does start configured MCP servers inside the probe's process tree, some in their own process group; the probe inventories that tree just before closing and ends all of it with the launch's own cleanup. The build proved this with Codex 0.166.0 (`scripts/proof-run/codex-launch-probe-proof.mjs`): only `initialize` and `thread/start` were sent, no thread was saved to history, and no process was left behind. A probe that cannot finish (Codex does not start, asks for a human answer, passes its deadline or is aborted) is a recheck that could not finish.

Mark complete is offered, from one predicate used by the snapshot, the CLI and the server, exactly when: the activity holds a Needs you stop; its latest run has `origin: recheck` and `finished: true`; at least one check in it is not met; and no check, waiver, dispatch or billing write is in progress. Its heading and label are AC-WAIVE-02's, except for a **Phase plan reads** or **Completion audit readiness** stop on an activity that has not started (no session has run for it and it has no completion), where they are AC-WAIVE-04's. When the only condition missing is a finished recheck (the latest run is the stop's own or could not finish, and nothing is in progress) and the stop's rows hold an unmet check or there is no run yet, the refusal carries `awaitingRecheck: { label, heading }`, and both pages show that heading and the button disabled with the check-again-first line (AC-WAIVE-02). The CLI's refusal and `kiln status` are unchanged.

## The Waiver Record (AC-WAIVE-08)

```
PrdRecord.waivers: Waiver[]      — append-only; Kiln never edits or removes an entry

Waiver:
  waiverId: uuid
  at: ISO-8601 (UTC)
  activityKey: string            — the stop's key: a phase id, audit-<activityId> or pr
  activityKind: implementation | delivery_audit | test_audit | final_delivery
  effect: completed | continued  — continued for a plan or readiness stop on an activity that had not started, or any stop on one already complete
  source: { via: browser | command_line, account: string, by?: string }
  operationId: string            — the control receipt that applied it
  checkRun: { id, at }           — the run it was offered on; the rerun's id is in the receipt
  items: { check, kind, subject, text, against }[]  — from the rerun, every unmet item
  checks: CheckResult[]          — the rerun's full marked results, kept because completion deletes the stop
  audit?: { report: accepted | valid | none, countedOutcome, countedChangedImplementation?, resultRef }
```

`account` is the operating-system user name of the Kiln controller process, read when the waiver is saved; the control journal records no user, so the waiver is the only place it is kept. `via` comes from the entry point that admitted the instruction: `browser` for the local server's route, `command_line` for the control server the CLI calls. `--by` is optional text of 1 to 64 printable characters, stored verbatim and shown beside the source. The waiver, the activity's completion facts and any audit-waiver result are one atomic record write, made before the next activity is chosen.

## Coverage (AC-WAIVE-09, AC-WAIVE-10)

`applyWaivers(record, plan, checks)` is the only place coverage is decided. For each failing item it finds the latest waiver item with the same match key whose `against` equals the item's current `against`, and sets `item.waiver`. A check whose failing items are all covered gets `passed: true, waived: true`; one with some uncovered items stays failing, with its covered items tagged. Covered items are excluded from comparisons and counts as "failing".

Every check result that decides what happens next passes through it before `passed` is read: the done check, the audit done check, final delivery's check (both the pull-request and development-delivery forms), the closed-leaf development check before scheduling, finished audit owners' development checks inside `nextActivity`, activation-recovery checks, and the plan-read and audit-readiness decisions below. Display and receipts read the same marked results, so the browser, terminal and status JSON cannot disagree.

Two derived views carry coverage into routing:

- **Effective plan.** The plan as read, with each leaf whose `phase_closed` item is covered marked `closedByWaiver`, and each phase skipped under a plan waiver marked `skippedByWaiver`. Both marks are derived on every read, never written into the recorded plan, which each successful read replaces: `closedByWaiver` from the waivers, `skippedByWaiver` from the skipped phase's own facts (Normal Order). `nextLeaf`, recorded-plan leaf scans, final delivery's "Phase N is still open" and audit admission's no-open-phase routing rule (AC-NEUTRAL-04) treat both marks as closed. Audit admission's original-phase immutability rule keeps comparing the documents' own Closed lines, which a waiver never writes. While the plan does not read, a `phase_closed` item's leaf validity is judged against the order source Normal Order uses; once the plan reads, coverage follows AC-WAIVE-09.
- **Development dependency resolution (WAIVE-004).** One coverage-aware predicate, *checkpoint resolved*, replaces the satisfied test wherever a prerequisite is judged: the operation gate that refuses work while a prerequisite is unresolved (which also orders merges), prerequisite-artifact binding for a dependent's verification, the owner check's prerequisite items, and final delivery's checkpoint scan. A checkpoint is resolved when it is satisfied as today, or when each obligation the owner check would report failing (`requiredMerge` and each requirement other than `current_artifact`) is covered by an unexpired `development_requirement` waiver item and its own prerequisites are resolved the same way. Delivery operations run in the engine against the live record, so a waiver saved at Needs you governs a later session's operations, and a dependent can be merged, deployed and verified once its prerequisite is resolved by waiver. Each dependent's own obligations still need evidence or their own waiver. A dependent's own prerequisite item, waived directly, counts as met wherever Kiln asks that question again for that dependent (its owner check, final delivery's checkpoint scan and its operation gate), but never makes the prerequisite resolved for other dependents, and artifact binding still refuses, so the dependent's verification needs its own waiver. Binding is unchanged: a dependent's verification binds to the prerequisite's recorded deployment and current-artifact probe, so when the waived item was that deployment, binding refuses and the dependent's verification needs its own waiver. No operation, deployment or verification fact is written from a waiver, and prerequisite restoration still needs real evidence.
- **Continuation executions.** A continuation carries waived closure through the plan baseline, its one channel for carried completion. Wherever a baseline is retained or derived (each plan read, completed-plan discovery), its leaf scans read the effective plan: a leaf `closedByWaiver` or `skippedByWaiver` counts as closed. Its completion receipt records the `waiverId` and, per repository, `pushedSha`, or else `waivedHead`. Completed-plan discovery reads the plan at final delivery's `pushedSha`, otherwise the merged feature commit, otherwise the `pr` entry's `waivedHead` from the local repository; a `waivedHead` commit that no longer exists stays `baseline_unavailable`. Accounting carries such a leaf as completed while its scope is unchanged, whether or not its document has since gained a Closed line, and the fresh execution never rebuilds it or asks again. A skipped leaf stays unbuilt; the continuation's fresh delivery audit judges the requirements and can still find what it was meant to build. Continuation readiness still requires each carried revision to be integrated in the delivery base, so unpushed waived work needs explicit preparation; that is a separate requirement, not the waived item asked for again. No waiver record carries: head- or document-bound items (`repository_work`, `development_requirement`, `other`) and waived audits bind the old execution's branches, ledger and audit state, which the fresh execution re-establishes with its own checks (AC-CONTINUE-05).

A waiver ending never reopens a completed activity: coverage is read only when a check is run, and completed activities are not rechecked by this feature. For executions with development delivery, the ledger's current-completion fact is set from the marked result, so a final delivery completed on a waiver reads **Complete**, and final completion's existing reopen-time reconciliation applies coverage like any other check; a changed feature head that ends a waiver is new work, which already invalidates current completion today.

An activity can complete normally on a carried waiver, with no waiver of its own. When a completing check run has any check marked `waived`, the full marked run is saved as `completionChecks` on that activity's phase facts (for final delivery, on the `pr` entry), in the same record write that sets `doneAt`: the phase and audit completion write, and final delivery's completion, which now receives the run's checks. An activity with a waiver of its own already holds the run in that waiver's `checks`, so `completionChecks` is not written. **Current completion audits**, which adds no row on a pass, adds a met row marked `waived` when it is met only because an audit's effective result is a waiver result, its item tagged with that audit's waiver.

## Mark Complete (AC-WAIVE-03, AC-WAIVE-04)

Under the exclusive checking boundary, held from admission until the record write or refusal:

1. Refuse unless the offered predicate holds and the request's `checkRunId` is the stop's latest run (`mark_complete_not_offered`, `stale_check_run`).
2. Rerun the stop's own check as Check again would, recording the result as a new run, but without Check again's routing to the completion audits. A rerun whose only failing check is **Current completion audits**, when the offered run failed another check too, is a `check_results_changed` outcome and keeps the stop; Mark complete is then offered on that run like any other (AC-WAIVE-02), and a Check again instead routes to the audits.
3. Decide:

| Rerun | Effect |
|---|---|
| Could not finish | As AC-WAIVE-04; outcome `check_unavailable` |
| Every check met, including a launch-check stop whose launch check now passes | Accept as Check again does (a launch-check stop clears and the loop launches); no waiver; outcome `checks_passed` |
| Uncovered failing items equal the offered run's, compared as sets of (check, match key, text) | Save the waiver from the rerun's items with the completion, then advance as AC-WAIVE-04; outcome `marked_complete` (`continued` for a stop on an activity that has not started or is already complete, below) |
| Any other difference | As AC-WAIVE-04; outcome `check_results_changed` with `changes[]` naming each item that newly fails, newly passes or changed text |

**At a hand-back stop under live takeover, or with uncertain messages awaiting review.** Mark complete admits exactly as Verify does: it applies `reviewed_receipt_ids` first, then requires the takeover return (every uncertain message reviewed, takeover released, no terminal on the conversation, history readable; otherwise `message_review_required` or `takeover_pending`). It stops a live Codex process and records the takeover material before the rerun. A `marked_complete` or `checks_passed` write compares that material again and requires the return once more before the record write. Every advancing outcome (`marked_complete`, `checks_passed`, `continued`) resolves the acknowledged message hold and releases `liveControl` in that same write; nothing else does.

**A preserved unsent reply.** While one exists for the stop's target, Mark complete is refused at admission with `unsent_reply_acknowledgement_required` unless `without_sending_reply` is set, whatever the rerun would find. Every advancing outcome marks those replies acknowledged.

Completion on a waiver, by activity kind:

- **Implementation phase.** `doneAt`, `finishedByPerson: true` and `waiverId` on the phase facts. A repository whose Pushed item was met records `pushedSha` as today; one whose work was waived records `waivedHead` instead, never `pushedSha`, so later prior-integration and delivery-history checks do not treat it as pushed work, and delivery history shows that range as waived.
- **A phase stopped on preparation** (**Prerequisite preparation**, **Prepared checkpoint**, **Preparation recovery**, **Preparation permissions**). Completed like any implementation phase. `record.preparation` stays as it was: the stage does not advance, no verified checkpoint is recorded and no prerequisite completion receipt is written, because a waiver is never evidence (AC-WAIVE-09). Every read that holds or labels work on preparation, preparation advancement and the pause decision included, skips a preparation whose phase has `doneAt`. Plan reconciliation and the delivery check still skip the bound prerequisite leaves without demanding evidence, so nothing is blocked again; those leaves stay without receipts, and a later continuation accounts for them as not verified.
- **Audit.** Below, "Audits Marked Complete".
- **Final delivery.** `complete()` with whatever pull requests and merged branches the rerun found (possibly none), plus `waiverId`, and per repository `pushedSha`, or `waivedHead` where its repository work was waived, on the `pr` entry. Delivery summaries list waived items as waived, never delivered.
- **A stop on an activity that has not started, or is already complete.** A **Phase plan reads** or **Completion audit readiness** stop can sit on either kind (the next phase or final delivery; a settled audit). A development check can stop an already-complete activity: a closed leaf, whether Kiln ran it or not, or a finished audit; its label stays **Mark {activity} complete**, and its rerun is that check alone (§Check Runs). The waiver is saved with `effect: continued` and the stop cleared; outcome `continued`. An unstarted activity gets no completion; a completed one keeps its facts as they were, including the accepted snapshot its currentness is measured from. The loop then follows "Normal Order Under a Waived Problem". A plan or readiness stop on an activity that ran and is not complete, and a launch-check stop on an unstarted activity (§Check Runs), are marked complete like any other, with `effect: completed`.

The sentence above the button comes from the offered predicate's preview, the same data the CLI prints: the count of failing checks, that they will show as **Waived**, the next activity Kiln would choose with the waiver in place, and the activity's resulting label. It adds the missing-from-the-final-pull-request clause (AC-WAIVE-03) when any item is `repository_work`, and for an audit without a usable report, the no-report warning first.

The next activity is a forecast computed inside the offered predicate from the saved record and the latest run, never by the live next-activity choice, the audit scheduler or audit allocation, so offering Mark complete writes nothing. For a phase, it is the first leaf of the recorded plan not closed, closed or skipped by waiver, or done, counting the stopped phase as closed; with none left, the completion audits. For an audit, any open completion phase it appended, otherwise the step its counted outcome gives (AC-WAIVE-12). For final delivery, Complete. For a **Continue in normal order** stop or a stop on an already-complete activity, there is none. The browser sentence names Complete and audit kinds and otherwise says "moves to the next step", as the mockup does; the CLI names the phase. Kiln's actual choice after the write is still made by the next-activity choice.

## Audits Marked Complete (AC-WAIVE-12)

An audit waiver stores an audit-waiver result in the audit store, referenced by the waiver and by `activity.waivedResult`:

```
AuditWaiverResult:
  activityId, waiverId
  report: accepted | valid | none
  reportBytes?, reportDigest?        — when accepted or valid
  countedOutcome: passed | completion_phases | continue_test
  countedChangedImplementation?: boolean   — test audits
  snapshotRef                        — a work snapshot captured during the rerun
```

An audit Kiln completes at once under a waived readiness problem (§Normal Order) gets its own audit-waiver result on its own `waivedResult`, with the originating `waiverId`, `report: none`, and as `snapshotRef` the initial snapshot captured when Kiln allocates and completes it. It has no resolved skill, so `AuditActivity.skill` is optional for it. The originating waiver's `audit` field is absent, because a readiness waiver never completes the activity it stopped. Currentness and display read each audit's own `waivedResult`.

| Report at the waiver | Counted as |
|---|---|
| Accepted | Its own outcome and `changedImplementation` |
| Valid, not accepted (the rerun's latest attempt passed report validation; it failed on **Audit work resolved**, repository checks or development checks) | Its outcome, with `needs_you` counted as `passed`; `changedImplementation` from the report |
| None usable (missing, unreadable, or refused by report validation, including a no-progress continuation and a plan that disagrees with the report) | `passed`; a test audit counts `changedImplementation: false`. Warning as AC-WAIVE-12 |

One accessor, `effectiveAudit(activity)`, returns the accepted result or the waiver result, and every reader of an audit's accepted result reads it instead: scheduling (`auditNext`, `untouchedBetweenAudits`, `requireCurrentAudits`), currentness, admission of a test continuation's predecessor (so a waived `continue_test` can be continued rather than refused at allocation), the audit's completion and its assignment of development obligations to appended completion phases, the next audit's prompt history, and the display. With no usable report, the appended phases are those the current plan holds beyond the audit's initial snapshot. Currentness for a waived audit is measured from `snapshotRef`, as an accepted audit's is from its accepted snapshot; this is what makes a waived **Audit evidence is current** count as current, and what keeps Kiln from sending the person back to the same audit. Completion phases the audit already appended are open leaves, so they run first; once they change the work, the waived audit is no longer current and the next delivery audit is a fresh round, as after any audit that appended phases.

## Normal Order Under a Waived Problem (AC-WAIVE-04)

A waived `known_problem` carries forward while its text is unchanged, whichever of the two checks raises it again, so a plan problem that resurfaces at audit allocation is covered too. Where Kiln would otherwise stop on a covered problem, it marks the activity it reaches or skips with `waiverWarning: { kind: plan | audit, waiverId }` on that activity's phase facts and goes on. A problem text no waiver covers stops Kiln as today, once, and can then be waived.

- **Phase plan reads.** When the plan does not read and its problem text is covered, take plan order from the readable phases the parser already returns; when none read, from the plan Kiln last recorded. Apply the effective-plan closures. Take the next leaf in plan order that is not closed, closed by waiver, skipped or done and whose own document reads; dependencies are not consulted. A leaf whose own document does not read cannot start on the waived problem, so it is recorded `skippedByWaiver` like a phase whose start fails on it, and counts as closed wherever an audit or final delivery checks for open phases. When that leaf's start fails with a problem whose text a waiver covers, such as a repository Kiln cannot add, record `skippedByWaiver: waiverId` on that phase's facts and take the next. With no leaf left, go on to the completion audits. An unavailable read (a missing worktree, an I/O error) is a check that could not finish: it stops, and Mark complete is not offered for it. A covered activation-recovery problem ("The activation-recovery phase is missing from the current plan.") lifts the recovery gate, the rule that no future leaf can overtake the recovery leaf, wherever it applies, the next-leaf choice included: Kiln takes the next leaf in normal order, and the leaf it reaches carries the plan warning marker. Unmet recovery obligations are not waived by this; they stop Kiln as their own failing development checks (the closed-leaf delivery check, the audit done check and final delivery).
- **Completion audit readiness.** When `auditNext` or audit allocation fails with covered text, take the step the saved audit record gives (AC-WAIVE-04): the scheduler's own decision from the last settled audits' effective results, read without the step that failed, so a `continue_test` outcome gives a test continuation and completion phases an audit gave run before a fresh delivery audit. Only where the record cannot tell, because reading it is what fails, take the next of delivery audit, test audit, final delivery after the last settled audit. When the step is an audit that cannot be started for that covered reason, allocate its activity without a session and complete it at once on the same waiver with `report: none`, so it carries both warnings and counts as passed. While a waived plan problem stops the documents from reading, audit allocation and work snapshots read the phases Normal Order uses, so the audits can run.

A skipped phase is not built and its document is not closed, but it counts as closed as AC-WAIVE-04 has it, so audits can pass.

## Interfaces

### Local HTTP

`POST /api/mark-complete` with `{ checkRunId, target?, reviewedReceiptIds?, withoutSendingReply? }`, submitted as the `waive-and-advance` action through the same control journal as `/api/check-again` and `/api/resume`, with the page's command id. A live `target` becomes the `live_target` input. It requires the `X-Kiln-Status` header and never substitutes the current token or the live target for it; the token is matched together with the target, and its fingerprint already covers the live target, takeover state and message review states, so a page that has missed a newer check run or lost its connection is refused as stale rather than waiving what it did not show. Response `{ ok, outcome: marked_complete | continued | checks_passed | check_results_changed | check_unavailable, waiverId?, changes?: [{ check, subject, change: newly_failing | newly_passing | text_changed, before?, after? }], reason? }`. A rerun that could not finish answers `503` with outcome `check_unavailable` and the error, after the journal settles its receipt (exit 4 on the command line). Refusals: `409 busy | stale_check_run | mark_complete_not_offered`, and the admission refusals in §Mark Complete (`message_review_required`, `takeover_pending`, `unsent_reply_acknowledgement_required`). A failure after admission that saved nothing (a snapshot, Git or audit-store read failing during the act) answers `500 mark_complete_failed`; the record is restored and the stop stays. A receipt left `applying` by a crash settles at restart as `not_applied` when no waiver carries its operation id, since the waiver, the completion and the receipt's outcome are one write.

### Command line (AC-WAIVE-05)

`kiln waive-and-advance <PRD-path> [--confirm] [--by <name>] --only-if-status-matches <token> --command-id <id> [--json]`, following the bot-control grammar, result object, exits and receipts.

| Form | Behavior |
|---|---|
| Without `--confirm` | Journaled as the stop's recheck, not as `waive-and-advance`: the control route picks the action before admission, as `/api/check-again` does (`verify-and-advance` while a hand-back recovery target exists, `check-again` otherwise); a command id that already has a receipt keeps that receipt's action. The receipt, its rules and `command-status` are that action's, unchanged, and it takes that action's inputs (including `--without-sending-reply`); `--by` is `invalid_input`. A pass advances as that action does. When the receipt settles as `completion_checks_failed`, its settled result and `kiln status` carry the stop's `mark_complete` preview (below) with a `next_argv` that repeats the command with `--confirm`, the new status token and a placeholder for a new command id; the CLI prints it when the receipt settles within its existing wait, otherwise `command-status` shows it |
| With `--confirm` | The journal's one new action, `waive-and-advance`, which always means Mark complete. The control route fills in `check_run_id` and `live_target` from the guarded status; `by` is 1 to 64 printable characters, checked at admission and part of the canonical input, like `check_run_id`. Accepts `--message-reviewed <receipt-id>` (repeatable) and `--without-sending-reply`; the controller supplies `live_target` as it does for `verify-and-advance`, and every journal rule keyed on `verify-and-advance` (review before acting, the unsent-reply refusal, acknowledgement on an advancing outcome, uncertain plan effect) applies to this action too. Refused with `mark_complete_not_offered` (exit 3) where the button would not be offered, including before any recheck since the stop |

A `waive-and-advance` receipt's outcomes are the HTTP outcomes above; `plan` effect is `advanced` only for `marked_complete`, `checks_passed` and `continued`. `kiln waive-and-advance` joins AC-ACT-03's routine controls and the help listing.

### Snapshot and `kiln status`

The snapshot and the status JSON carry, from the same marked results:

- per check: `state: passed | waived | failed`, and per item `{ text, waived?: { waiver_id, activity, at, via, account, by } }`;
- per check run: `counts: { passed, waived, failed }`;
- per activity: `waived_checks: N`, `waivers[]` (id, at, source, items), `warnings[]` with `plan_problem_waived`, `audit_problem_waived` and `no_audit_report` on an audit whose `waivedResult.report` is `none`;
- per stop: `mark_complete: { offered, label, check_run_id, items[], next_activity: { kind: phase | audit | final_delivery | complete, key, title } | null, resulting_label, sentence, next_argv }`, or `{ offered: false, reason }`.

## Display Contract

Superseded in part by: [Kiln Run Restart technical design](../kiln-run-restart/kiln-run-restart-technical-design.md), §A Stopped Phase's Facts, Nothing to check yet (no checks shown for a phase that built nothing until asked; the sentence above Mark complete).

Build arrangement and wording from the approved mockup.

- **Hand-back page (AC-NEXT-01/02).** The card title "Open the conversation in your terminal" becomes **Talk it through in your terminal**, or stays **Start a fresh session in your terminal** when the saved conversation cannot be opened.
- **Standard Needs you page.** Layout unchanged; Mark complete sits below **Check again** in the side panel.
- **Mark complete block.** Heading as AC-WAIVE-02, the preview sentence, and the button. Before a recheck, from `awaitingRecheck`, the heading, the button disabled and the check-again-first line in place of the sentence. While the rerun runs the button reads **Checking…** and competing controls are disabled. A `check_results_changed` result replaces the rows and highlights the changed items, and the button is offered again at once on that new run (new `check_run_id` and status token), as the mockup's changed state shows; it is disabled only while a rerun is in flight. An error shows by the button.
- **Waived everywhere (AC-WAIVE-10).** A completed activity reads **Complete · N check(s) waived** in the progress row and detail, the Complete screen, the terminal summary and `kiln status`; counts read `3 passed · 1 waived` wherever the hand-back page's "N of M requirements passed" or a check count appears. Implementation rows gain the waived completion's check list in their detail, read from the activity's own waiver's `checks`, otherwise from its `completionChecks`, for every activity kind, with N and the `3 passed · 1 waived` counts taken from that same run. Warning markers: AC-WAIVE-04, AC-WAIVE-12. A `continued` waiver on an already-complete activity counts on that activity: its waived development check reads **Waived** in the row and detail, from waivers whose `activityKey` matches, and the preview's resulting label says so; a **Continue in normal order** waiver adds no count, and only the warning markers on the activities Kiln reaches show it. An audit completed at once under a readiness waiver reads **Complete · 1 check waived**: its one row is the carried **Completion audit readiness** row, read from the originating waiver's `checks` and tagged with that waiver, and both warning markers sit beside it.

## Competing Actions (AC-WAIVE-06)

Mark complete takes the engine's `checking` boundary and the control journal's admission, so Check again, Verify, Resume, reply and a second Mark complete are refused as `busy` from the browser and the command line until it settles, exactly as AC-VERIFY-04 does for the existing actions. The view disables every submission while disconnected, and the server, not the view, is the lock.

## Upgrade

Schema 19 is additive: `waivers`, `PhaseStop.run`, `CheckResult.items`/`waived`, and on phase facts (final delivery's being the `pr` entry's) `waiverId`, `completionChecks`, `waivedHead`, `skippedByWaiver` and `waiverWarning`, plus `waivedResult` on the audit activity, whose `skill` becomes optional (§Audits Marked Complete). `closedByWaiver` is derived and never saved. A saved billing hold gains `run: { id: new, at: hold.at, origin: stop, finished: true }` and `checks` built as the snapshot builds them today. Migration gives a saved stop `run: { id: new, at: checkedAt, origin: stop, finished: true }`, so Mark complete is offered only after a fresh recheck, whose producers emit items. Saved check rows without items display as before. Schema-18 readers refuse schema 19 under the existing newer-schema rule; there is no downgrade path that drops waivers.

## Earlier Design Boundaries

Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Evaluate, then act (a third intent, Mark complete, after a failed Verify) and §Needs you Layout (hand-back arrangement and action names under AC-NEXT-01/02).

Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Terminal Ownership and Hand-back (the hand-back pair becomes Have Kiln resume and Check again).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (adds `waive-and-advance`) and §Manual phase outcomes (a completion requirement can be waived, through `waive-and-advance` only).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (a waived audit routes by its counted outcome).

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Admission (the no-open-phase routing rule counts phases closed or skipped by waiver as closed; a waived attempt counts as AC-WAIVE-12 says) and §Snapshots and currentness (a waived audit's baseline is its waiver snapshot).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One evaluator at every transition (waived obligations are met, a checkpoint resolved by waivers satisfies its dependents, final evaluation reads coverage).

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Done Check, §The Pull Requests and §Named after Start (AC-ADD-04) (waivable checks, `waivedHead`, skipping a phase whose repository cannot be added).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §The Done Check and §Where a Feature Stands: what `kiln run` does (waivable Closed, Committed and Pushed; a waived plan stop follows normal order).

Replaces in part: `docs/changes/kiln-completion-checks/kiln-completion-checks-technical-design.md`, §Completion and recovery (the evidence it keeps in force can be waived).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Retained baseline and §Completed feature discovery (a leaf closed or skipped by waiver counts as closed and carries its `waiverId` and `waivedHead`).

Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Resume and stopping (a known cleanup failure is waivable like any failing check).

Each earlier section gets its `Superseded in part by:` line in the implementation commit that builds the change.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the packaged CLI against the local server, and the real browser view; deterministic provider fixtures for sessions. Crash points: after admission, after the rerun, after the record write, before the next dispatch.

| Criteria | Design | Named proof |
|---|---|---|
| AC-NEXT-01, AC-NEXT-02 | Display Contract | Hand-back page with and without Resume offered, before and after a failed recheck |
| AC-WAIVE-01 | Existing Code; Mark Complete | Check again, Verify, Resume and their CLI forms, and restart recovery leave `waivers` empty |
| AC-WAIVE-02 | Check Runs | Shown unusable with the check-again-first line before a recheck (`awaitingRecheck`); not offered before a recheck, while checking, after an unavailable recheck, when all pass; offered for Codex cleanup, preparation and Current completion audits, after a recheck of a Completion audit readiness or Preparation permissions stop, after a recheck of a Phase plan reads stop raised by a missing activation-recovery phase, and for a structurally broken plan at a hand-back stop; a Codex launch settings probe with a real Codex install dispatches no turn, leaves no thread or process behind, and keeps a failing row |
| AC-WAIVE-03, AC-WAIVE-11 | Failing Items; Mark Complete | Several failing repositories and obligations each listed and each waived; repository-work sentence |
| AC-WAIVE-04 | Mark Complete; Normal Order | All four rerun rows, with Mark complete offered again at once on the new run after `check_results_changed`; a broken plan with a skipped phase; under a waived plan problem, a later phase that writes its Closed line completing with the plan warning and one that does not stopping once on its own "No Closed line" item; a waived missing activation-recovery phase lifting the recovery gate, with the next leaf carrying the plan warning; a missing audit skill completing that audit with no report; a billing hold and a selection stop on an unstarted phase marked complete with Closed waived, and the phase not relaunched; a billing hold on a phase that already ran, rechecked as its done check, with the Billing approval item never waived; a preparation stop marked complete with `record.preparation` unchanged |
| AC-WAIVE-05 | Command line | Both forms, stale token, missing recheck refusal, `--by`, retry with the same command id |
| AC-WAIVE-06 | Competing Actions | Concurrent browser and CLI actions during a rerun are `busy`; disconnected page cannot submit |
| AC-WAIVE-08 | Waiver Record; Upgrade | Record survives restart; crash between rerun and write saves nothing |
| AC-WAIVE-09 | Coverage | Phase unpushed waiver met at final delivery with an unchanged head and failing after a new commit; checkpoint dependency; a dependent's prerequisite item waived directly, met at that dependent's owner check, final delivery's checkpoint scan and operation gate, while another dependent of the same prerequisite still stops and the dependent's artifact binding still refuses; split phase ends a Closed waiver; a waived assessment met after a later phase's push and at final delivery, and failing once the phase's document changes; a continuation discovering the plan at final delivery's `waivedHead` |
| AC-WAIVE-10 | Snapshot; Display Contract | Every listed surface shows Waived and the count split, and Passed once a later check passes; a phase completed on a carried waiver and a final delivery met on a waived audit (its Current completion audits row Waived) show Complete · N waived with their check list from `completionChecks` after restart |
| AC-WAIVE-12 | Audits Marked Complete | Each report row; a no-report delivery audit followed by a test audit; appended phases running first and a fresh delivery round after them |

## Open Questions

None.
