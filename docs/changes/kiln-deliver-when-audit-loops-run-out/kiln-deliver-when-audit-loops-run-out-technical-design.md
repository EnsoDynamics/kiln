# Technical Design: Kiln Deliver When Audit Loops Run Out

**PRD:** [Kiln Deliver When Audit Loops Run Out](kiln-deliver-when-audit-loops-run-out-prd.md) · **Assumptions:** [four open](kiln-deliver-when-audit-loops-run-out-assumptions.md) · **Mockup:** [eight screen states](mockups/kiln-deliver-when-audit-loops-run-out.html)

## Overview

The loop gate gains a third decision beside "start the loop" and "stop": **set the phases aside**. Phases an audit added past the delivery limit are recorded in Kiln's own state as left open, skipped by routing, and reported with the delivery. The one setting **When the loops run out** chooses between setting aside and stopping, for both audits.

The audit report says two things it did not say before, and Kiln acts on both without judging either: how much of each criterion an added phase covers is built, and what kind of item each thing listed for a person is. An item's kind decides whether it stops the run, holds it, or rides to delivery under **For you**. A loop stop gets one page with two answers, Allow and Accept, at either audit. A run delivered with phases left open can be continued on its own feature branch while its pull requests are open.

Everything here is Kiln's. No Enso Method skill changes: both audit skills already leave out a criterion an open completion phase covers, and Kiln writes nothing to the repository that the skills do not already write (principles 1 and 2).

## Existing Code

**Posture: Preserve.** Kiln 1.3.0 is released with audit loop limits.

- Reused: the loop ledger and its `start` epochs; the gate as the one place every decision after an audit passes through; `loop_limit` stops on a finished audit's key and the derived `needs_you` loop stop; the version-2 report and its admission; the outstanding-items ledger, derived from accepted reports; the Accept session and its prompt; the control journal, its receipts and the stop routes; the continuation proposal, acceptance and activation core.
- Not reused: the waiver closures (`effectivePlan`, `effectiveRecordedClosed` and the engine's own waiver check). They count a waived or skipped leaf as closed, and that reading also feeds the phases-done counts and the continuation baseline's completed phases, where a phase set aside must read not started and never completed. Set aside is a predicate of its own (§Phases Left Open).
- Kept: test work still saved after the last test loop stops the run under either choice. Mark complete is offered only where a check fails. A `needs_you` report is never accepted. Marking an audit complete settles no item, and a run delivered after one lists every item still open.
- Kept: the default limits, and every stop control this design does not name.

## Settings (AC-CHOICE-01, AC-CHOICE-02)

The third loop setting is renamed where it is stored, because its old name says it is about the test audit only. Where it is exchanged, the new name joins the released one (§Interfaces).

```
auditLoops:
  deliveryLimit, testLimit              — unchanged
  whenLoopsRunOut: "deliver" | "stop_and_ask"     — default deliver; was afterLastTest
  whenLoopsRunOutSource                 — was afterLastTestSource, same shape
```

`deliver` keeps the sentence the old default gave the test audit, quoted with its source as today. The setting is read fresh at each gate decision. A change at a loop stop therefore applies the next time loops run out, and the stop it was changed at stays until one of its two answers is given (§Loop Stops), which is also why Check again and a restart no longer re-decide a loop stop. While phases set aside by the setting are left open, the delivery limit's field in the run's settings, and `kiln settings`, say that raising it builds them at Kiln's next decision whether to start a loop (§The Loop Gate, LOOP-002).

## Report Contract (AC-GOON-03, AC-ITEM-01, AC-ITEM-02, AC-LEFT-01)

The report stays `schemaVersion` 2 with added fields. Kiln does not parse prose or phase documents to learn any of this; the audit states it and the prompt maps the skill's own ending onto it (§Prompts).

```
phaseCriteria: { phase, criterion, built: "partly" | "none" }[]
    — required when completionPhases is non-empty: every criterion each appended phase covers,
      and whether some of it is built or none of it is; `built` describes the criterion as the
      audit graded it, not the phase's share of it, so every row naming one criterion agrees
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
- is `needs_you` and lists no item whose kind, as given or kept from the ledger, is `critical_next_step`, `blocker`, `business_question` or `test_acceptance`: items of riding kinds leave the work able to go on, so the report gives the outcome the audit reached, with them listed. The released refusal of a `needs_you` report with an empty `needsYou` stands;
- gives a stopping or holding kind without `waitsOn`, or `test_acceptance` without `criterion`, each judged on the item as it stands after the relisting: a field the relisting leaves out takes the ledger's value, so a relisting by `id` needs only `id`, `problem` and `action`;
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

**How a hold is measured.** Kiln keeps the measure it has today: the audit that lists or relists an item says, through its outcome, whether the work it leaves depends on it. `completion_phases` or `continue_test` with the item listed means that work does not need it, so the loop runs; `needs_you` means the work cannot go on. Delivery always needs a holding item, which admission enforces on the one report that leads to it. So a holding item stops the run exactly when no other work is left, and the measure is taken again by every later report, including the one from a session Allow or Accept starts. Kiln carries no dependency model of its own, which would be a second source of truth beside the audit's. Admission refuses a `needs_you` report with no stopping or holding item (§Report Contract), so every item stop holds something, and an `items_listed` loop stop always has a test for the person to accept, except on a report from before kinds (§Upgrade).

**When the waiting work is set aside.** A `blocker` or `business_question` whose waiting work is only phases Kiln has since set aside no longer waits on anything Kiln will do in this run, so by the PRD's table it is a person's action reported with the delivery. The audit that next accounts for it relists it by `id` as `other`, keeping its problem and action. Without this, the report that leads to delivery could not list it and would have to stop the run for work Kiln has already decided not to do.

The stop for a holding item is therefore always on a `needs_you` report, whose activity is unsettled: Reply reaches the audit's own session, which accounts for the settled item in its next report. A person who marks that audit complete overrides the hold, as today; the items still open are then listed under **For you**.

**Item stops and loop stops.** A `needs_you` test report with no test loop left is a loop stop only when every item of a stopping or holding kind it lists is `test_acceptance`. With any `critical_next_step`, `blocker` or `business_question` item it is an item stop: the page of mockup state 7, with the controls an item stop has while loops are left, and no Allow or Accept. Once that item is settled and the audit reports again, the stop becomes a loop stop if tests are still left. This keeps Allow from ever starting work an item on the same page says cannot go on, and puts a critical finding ahead of the loop question. A loop stop on a finished audit (phases added, test work saved) shows every item its report listed beside its answers; those items do not block the answers, because that report's outcome already said its work does not need them. The one exception is a stop held on a report from before kinds (§Upgrade).

Every stop on an audit, and `kiln status`, show each item with its kind, problem, action and what waits on it (§Interfaces).

## Phases Left Open (AC-GOON-01 to AC-GOON-04)

The ledger gains, append-only:

```
leftOpen: { auditKey, phases: string[], at: ISO-8601 UTC,
            cause: "setting" | "accepted", via?: "browser" | "command_line",
            endedAt?: ISO-8601 UTC }[]
```

A leaf at or under a phase in an entry with no `endedAt` is **set aside**: not to be built in this execution, and not closed. So is a leaf whose Phase dependencies name a set-aside phase, whoever added it. That is derived, transitively, each time the predicate is asked, never stored, and carries no `cause`. Only the ids `dependencyIds` parses count, as the plan start check reads them; prose in the dependencies, or a phase's own, ancestor or descendant id, sets nothing aside. The ids come from the plan the caller holds: a plan it read, an audit snapshot's phase content, or the recorded plan. The recorded plan gains `dependencies?: string[]` per phase, written when the plan is recorded and kept by the order source, and left out of the plan-structure comparison as Attended is, so a plan recorded by an earlier Kiln still matches its baseline. Allow at a delivery stop ends the entries §Loop Stops gives (LOOP-003), and so does a delivery limit raised while no loop stop holds it (§The Loop Gate, LOOP-002), so a dependent of their phases rejoins and is built in plan order in the loop that follows. Accept and the setting set it aside with the phase it depends on, and `{{setAside}}` names it.

One predicate over the ledger and those dependencies answers it, and every place that decides what to build next or whether the work is finished asks it beside the closure checks it asks today:

- Leaf selection skips it, wherever the engine looks for the next open leaf. A phase a person adds during the run with no dependency on a set-aside phase is still built in plan order.
- Report validation's no-open-phase rules for `passed` and `continue_test` do not count it, so the test audit and any later delivery audit can end normally with it open. The skills leave its criteria out on their own.
- The page's next-leaf marker and the terminal summary line's next phase skip it, and the plan's pull request row appears once every leaf is closed or set aside, so a delivered run with phases left open shows its delivery row.
- The final check that no unfinished leaf remains does not count it, and its development-delivery obligations are not asked for. Development-delivery finalization's refusals unless every leaf is closed skip it too.
- It is never done. The phases-done counts on the page, in the terminal summary line and in `kiln status`, and the continuation baseline's completed phases, do not ask this predicate, so it counts as neither done nor waived there. Its plan row reads not started, with a note that it was left open over the limit, or, for a dependent, "left open: depends on Phase N". Kiln writes nothing to the repository: no Closed line, no checkbox, no record file.

**Routing after phases are set aside.** A delivery audit whose appended phases are all set aside routes as `passed`, so the test audit follows. A test audit in the same position keeps today's routing for a `completion_phases` test report with nothing built since: a delivery audit first if it changed implementation, then a fresh test audit round, which is not a loop. A test audit may add phases and still have test work unfinished, and its one outcome cannot say both, so counting it as passed could deliver with test work nobody reported; the fresh round asks. Each further round must append a new phase to repeat this, so the number of criteria bounds it.

## The Loop Gate (AC-GOON-01, AC-GOON-03, AC-ITEM-03)

The gate's rows change as follows; rows not listed stand.

| Situation | Gate |
|---|---|
| The next leaf starts a delivery loop and none is left, under `stop_and_ask` | Delivery loop stop, as today |
| The same, under `deliver` | Reads the appending audit's `phaseCriteria`. Every row `partly`: appends a `leftOpen` entry with `cause: "setting"` and decides again. Any row `none`, or no `phaseCriteria` at all (a result from an earlier Kiln, or an audit marked complete with no report): delivery loop stop, whose page names those criteria or says the audit did not say |
| The latest test audit was accepted as `passed` while listing items, and no test loop is left | No stop. Its items are of riding kinds, or it leads to another audit that accounts for them |
| A `needs_you` test report, no test loop left | Loop stop or item stop, by its items' kinds (§Items for a Person) |
| An open `leftOpen` entry with `cause: "setting"`, and the delivery limit now above the loops used | Ends the entries Allow would end and records the phases as an Allow does (§Loop Stops, LOOP-003), then starts the delivery loop once no audit is running (LOOP-002) |

The decision stays a pure function of the record, the settings and the effective results. Setting aside and recording the stop are each one record write.

## Loop Stops (AC-ANSWER-01 to AC-ANSWER-05, AC-CHOICE-02)

`PhaseStop.loop.reason` keeps its three released values. `phases_added` and `test_work_saved` are stored on a finished audit's key, as today. `items_listed` keeps its released meaning, a test loop stop whose report saved no test work. It now comes only from a `needs_you` test report whose stopping or holding items are all `test_acceptance` (§Items for a Person), or from an Allow whose loop a lowered limit then refuses. It is no longer stored on an accepted `passed` report, which now holds nothing, and the upgrade clears any such stop (§Upgrade). Kiln tells a stop whose audit has finished from one whose audit has not by `auditFinished`, never by the reason. The page heads this stop **Tests are left for you to accept.**

**A loop stop is answered only by its answers.** At every loop stop:

- Check again is not offered, on the page or as a command (`check-again` is listed unavailable with the reason).
- A restart leaves a `loop_limit` stop as it found it, without rerunning the gate.
- `kiln settings` and the page refuse to change the limit the stop is on (`limit_held_by_loop_stop`; an instruction that carries it changes nothing). The other limit and the choice stay editable.
- Reply is offered only at a stop whose audit has not finished; `reply` is refused at a `loop_limit` stop, where the audit is settled and nothing would read it. The terminal handoff is unchanged at both.

**Allow up to N more loops** (`allow-more-loops`, `count` ≥ 1) raises that kind's limit to the loops used plus N in the run's settings, where it stays after the stop (§Continuing), appends `allowances: { kind, at, heldAuditKey, count, limit, phases? }` to the ledger, and opens no epoch, so the count is kept and the next loop takes the next number. The first test audit after an allowance at an `items_listed` stop is the loop it allowed, which the allowance now marks in place of the `allowed` epoch. At a delivery stop it also ends every open `leftOpen` entry with `cause: "setting"`, because those phases were set aside only because no loop was left, and Allow leaves loops. It also ends any `accepted` entry holding a phase that a phase the loop builds depends on, since the dependent cannot be built without it. Other `accepted` entries stay open: the person accepted leaving those phases at an earlier stop, and Continue with N phases offers them after delivery (LOOP-003). Allow records in `phases` every phase the loop will build. The loop builds them in plan order and counts once.

**Accept what is left and deliver** (`accept-and-deliver`):

- At a delivery stop, new: one record write appends a `leftOpen` entry for the held audit's phases with `cause: "accepted"`, clears the stop and stamps the receipt, which settles `completed` with outcome `phases_left_open` and records no session started. No session starts and no sentence is quoted. The gate then goes on as after phases set aside by the setting, criteria not built at all included.
- At a test stop, as today, with two changes. Its sentence names only the `test_acceptance` items, each by its criterion. Its prompt lists every other item the held report listed, with its kind, as not accepted by those words and to be kept open in `needsYou`, so later audits and **For you** still account for them. The session's report is admitted like any other, so a holding item still open makes it `needs_you`, an item stop; with only `critical` or `other` items open it reports `passed` and leads to delivery, where they are listed under **For you**.

**The page** (mockup states 4, 5, 6 and 8) is drawn from the snapshot (§Interfaces):

- Status line, at every closing audit, running or stopped: the audit and the loops of its kind used, **Delivery audit (after loop 3 of 3)**, and **(before loop 1)** when none has run.
- Heading: **Loop N of M is done.** with what is left: **The audit found more.**, **Test work is left.** or **Tests are left for you to accept.** When the limit was lowered below the loops used, **Loop N is done, over your limit of M.**
- One row per counted loop, then the waiting work as the next loop's row, not started and over the limit. Sessions that are not loops are no longer rows here; they stay in the run's activity list.
- Under the number: the limit it leads to, what the next loop does (at a delivery stop, the phases it builds and the accepted phases that stay open) and that the rest are spare, for example **Loop 4 builds Phase 11 and Phase 12. Phase 10 stays open: you accepted leaving it at an earlier stop, and Continue offers it after delivery.** An accepted phase the loop builds because a built phase depends on it is named among the phases it builds, with why: **Phase 10, which you accepted leaving open, is built too: Phase 12 depends on it.** At a test stop whose only items are stuck rows, the Go on answer says the session cannot work a stuck row without the person saying how.
- One button, labelled for the chosen answer, calls that answer's route.

## What Was Left and For You (AC-LEFT-01, AC-LEFT-02, AC-ITEM-03)

A delivery's work left is derived at the time it is shown, never stored, from the ledger and the immutable accepted results:

- **Phases left open:** the set-aside leaves in plan order, each with its adding audit's `phaseCriteria` rows; a leaf set aside only for its dependencies has no rows and names the set-aside phases it depends on. In the block below its line reads, for example, `- Phase 12 — Refund export: depends on Phase 10, left open; no audit assessed its criteria`. The line saying those criteria's tests were not audited counts only the criteria listed. A leaf whose adding audit gave no `phaseCriteria` (a result from an earlier Kiln, or an audit marked complete with no report) lists no criteria: its line reads `- Phase 7 — Title: the audit did not say which criteria it covers or how much is built`, and it adds nothing to the tests-not-audited line.
- **Tests accepted:** `acceptedTests` of the latest settled test audit's effective report, then the line the pull request session already gets (the sentences its latest carrying session quoted, with that session's report summary).
- **For you:** the items outstanding after the last settled audit, any `critical` first, then the `afterDeliveryActions` of the latest settled delivery audit and the latest settled test audit, whatever outcome each reported, each action text once, compared exactly as given, as the finished page does today. Earlier rounds' lists are history. The separate after-delivery list on the finished page is folded into this one, so a person action appears in one place.

Order is the PRD's: what was left, then **For you**; when **For you** holds a critical finding it moves first with that finding at its top.

**The pull request.** `pullRequestPromptValues` gains one block, built from those three lists; `pull-request-loop-acceptance.txt` moves inside it. The block holds a what-was-left part only when phases were left open or tests were accepted below target, and a **For you** part whenever an item or after-delivery action is open; with neither, Kiln builds no block. `pull-request-work-left.txt` wraps the block between two lines, `<!-- kiln:work-left -->` and `<!-- /kiln:work-left -->`, which GitHub stores in the description and does not show, and the session is told to start each description with it word for word. The block reaches both `pull-request-session.txt` and `development-finalization.txt`, which the session gets when delivery authority is set. The **Settled during the build** list carries only settled items; outstanding ones are under **For you**.

The pull request check gains a row, **Pull request says what was left**, run on the open pull request the check already selects in each repository; a repository proven already integrated has no description and no row. Text is normalized by turning every run of whitespace, line breaks included, into one space and trimming both ends. When Kiln built a block, the row passes only when the description, leading whitespace removed, starts with the opening marker, contains it exactly once, and the text between it and the first closing marker after it, normalized, equals the block, normalized. When Kiln built none, the row fails if the description contains the opening marker anywhere. Every repository's description is held to the same block, because the work left belongs to the delivery, not the repository. The check's existing `gh pr list` read adds `body` to the fields it asks for. A session that paraphrases or drops the block stops at Needs you like any failed final check, where Mark complete is offered as for any failed check. This is the first check Kiln makes on a description's content: the lines it prompts for today (settled items, a loop acceptance) are not checked. It is added for this block alone because the claim that nothing is hidden is the point of delivering with work left, and Kiln checks the session's description rather than editing it, so the session stays the one author of the pull request.

**With development deployments on,** the row is a reason inside the development delivery evaluation (Kiln Development Deployments, §One evaluator at every transition). It runs on each repository's remaining review pull request, reading the description from the pull request re-read that evaluation already makes, and holds it to the block by the rules above. A failure names the pull request and the fix, for example `kiln #12: start the description with the work-left block word for word`, and keeps that repository unresolved in `kiln delivery status`, so a finalization session starts to fix it. A checkpoint pull request that has merged is not held to the block. A repository whose work was all delivered or that is unchanged has no review pull request and no row. The PRD repository always has a review pull request when Kiln builds a block, because the audits that produce the block commit there. `development-finalization.txt` tells the session to start each remaining review pull request's description with the block word for word and not to add it to pull requests that have merged.

**The finished page** is headed **Delivered, with work left** only when phases were left open or tests were accepted below target, the two lists AC-LEFT-01 gives, and then shows those lists with the loops used of each kind (mockup state 2). When neither list holds anything, the page keeps the heading it has today (AC-DISPLAY-03 in Kiln Development Deployments, AC-PRS-03 in Kiln Multi-Repo Delivery), even with items open under **For you**, such as a planned production release or behavior changed outside the requirements. **For you** is shown whenever it holds anything, in the place Remaining human actions has today.

## Continuing (AC-LEFT-03)

**Which way.** For an execution that delivered with phases left open, the completed-plan check first reads the state of each of that delivery's pull requests from GitHub. A repository the delivery recorded as already integrated, such as one delivered by an early merge, counts as merged. All open: the same-branch proposal below. Any merged or closed: today's discovery, awaiting merge included. While the PRD repository's delivered work is not in its delivery base and the base's PRD folder is unchanged since the branch forked, the check reports awaiting merge, whether that repository's pull request is still open beside one that merged or was closed unmerged. Once the work is in the base, discovery runs there, accounting for a left-open leaf as below, and another repository's work still on an open pull request is an earlier prerequisite, judged by the rules of AC-CONTINUE-07 in Kiln Continue Added Phases, as for any continuation. A read that fails makes the check `failed`, with retry and no offer, as any failed source read does.

**Same branch.** The proposal's plan is read from the PRD repository's worktree at its HEAD. The feature branch is the only place the left-open phase documents exist until a merge, so it is the plan's source of truth; a phase added since delivery counts once it is committed there. Each repository the completed execution set up is judged by the folder check's predicate (Kiln Missing Worktree Recovery, "The 'run's worktree' predicate"). It must be in place, on the feature branch and clean; untracked files count, ignored files do not. Where it has a pull request, its HEAD must equal origin's feature tip or descend from it, and the pull request's head, read with its state, must equal that tip. Origin is read directly, never through a tracking ref. Commits not yet pushed since delivery, such as a committed added phase, are expected; the first phase session pushes them. Anything else makes the proposal `blocked` with no offer to Continue. The problem names the repository, its saved folder and the fix: commit or remove changes, check out the feature branch, pull when behind, or merge when diverged. A pull request head that differs from origin's tip clears on Check for new phases. Kiln never resets, rebases or force-pushes. A failed read makes the check `failed`, with retry. A missing worktree's problem says Kiln continues only in the run's own worktree and gives the restore commands AC-SETUP-06 shows, built and gated as Folder missing builds them: `git -C <shared checkout> worktree add -f <saved folder> <feature branch>`, after `git -C <shared checkout> fetch origin <feature branch>` when only origin has the branch. The `-f` is needed while git still records the missing folder. When that rule offers no command, the problem gives its reason instead. A folder that holds something else is described with no command, and one Kiln cannot read says what it could not read. Each problem ends "then press Check for new phases". Kiln repairs nothing itself and offers no Folder missing setup for a finished run. A phase that names a repository the completed execution did not set up does not block. The same-branch proposal neither judges nor binds that repository, and acceptance does not set it up. The continued execution adds it on the run's feature branch, in the run's workspace folder, when its phase starts, exactly as AC-ADD-04 in Kiln Multi-Repo Delivery gives. A failure stops that phase at Needs you, and Check again or `kiln run` tries the addition again. The check still reads the shared checkout and the delivery base, as discovery does. A plan document, from the set discovery reads, blocks the proposal (`blocked`) when it differs from its copy at the fork point, either at the delivery base's tip or in the shared checkout's working tree (committed or not), and the feature branch's HEAD does not hold that same normalized copy. The fork point is `merge-base` of the branch and the base. The comparison is per document, not the folder's tree object, so a copy already on the branch, whether merged or cherry-picked, clears it. Its problem names each document and where it was found, and says to commit it on the feature branch or merge the delivery base into it. Kiln does not merge the base into the branch to settle it, and does not continue with only the branch's phases. Documents missing from the delivery base are expected and do not block.

The plan is compared with the completed execution's baseline by the existing rules. Prerequisites are judged on the feature branch, not the delivery base. A carried leaf is `on_feature_branch` when each repository's receipt revision is in that worktree's HEAD. A leaf skipped on a waiver has no work to check and carries on its waiver. In this mode only these count for the first leaf's dependencies and for acceptance. A leaf Closed on the branch without a Kiln receipt is blocked — that covers a left-open phase closed by hand and a phase added already Closed — and the problem says to remove the Closed line so Kiln builds it, or to continue once the pull requests merge, with its External completion evidence. A same-branch proposal has no preparation, so a first open leaf with a preparation instruction blocks with "continue once the pull requests merge". The offer lists the left-open leaves, those set aside for their dependencies included, then any added since, and N counts them all. With nothing left to build, there is no offer.

`ContinuationProposal` gains `mode: "same_branch" | "fresh_base"` (absent on older proposals, read as `fresh_base`). A same-branch proposal's identity binds, per repository, the worktree HEAD, origin's tip and the pull request's number and head, along with the settings digest. Acceptance re-reads these and refuses with `proposal_changed` if any moved. It then activates a fresh execution through the shared activation core. The completed execution's repositories, worktrees, branch, settings and development authorization are kept unchanged. The new execution's repository entries are the completed execution's entries as recorded, not the proposal's repositories, so a repository the plan names that they lack has no entry until its phase adds it. There is no workspace preparation, no new branch or folder, and no integration stamped on receipts whose work is not yet in the delivery base. Development deployments and the person's early-merge grants carry, as a Start from the base branch on the Folder missing page carries them (DEV-001). Acceptance's setup-identity check (a `-continue-<execution id>` feature branch and a fresh canonical workspace per repository) applies to `fresh_base` proposals only; a `same_branch` acceptance is checked against the completed execution's branch and worktrees. The baseline carries the completed execution's receipts as they are. A left-open leaf carries none, so in the new execution it is an ordinary open leaf: built in plan order, with no loop counted, because no audit of this execution added it. The fresh execution starts with a preflight, a `start` ledger and empty required audits, which is what makes the loop counts start at zero and the closing audits run again.

**Loop limits, in either mode.** Allow writes the raised limit into the run's settings, and a continuation copies the run's settings as they stand, on the same branch and from a fresh base alike, so a raised limit carries into the continued execution, where the counts start at zero (LOOP-001): chose 3, used 3, allowed 2, and the continued run has a limit of 5. This keeps AC-LOOP-04 in Kiln Audit Loop Limits, under which the settings carry over unchanged. The finished run's settings show both limits, and a change there before Continue refreshes the offer, because the proposal binds the settings digest.

**Its delivery record.** The completed execution's archived row keeps the deliveries it had when archived. The new execution starts with no pull requests, merged branches or delivery history of its own; its final delivery finds each pull request open and updates it, opens one for any repository added since, and its pull request check records them and holds each description to the new delivery's work left (§What Was Left and For You). Duplicate URLs are removed within each execution's deliveries, as today; nothing is unique across executions. History shows the pull request under the earlier execution as an earlier delivery, and on the current page as this execution's, with no new label. `kiln status` reports only the current execution's pull requests, so nothing is counted twice. Once the pull request merges, the current execution's delivery history counts only the commits of the phases it built and marks the pull request as also containing other commits, the earlier execution's. An added repository's pull request holds only this execution's commits.

**A left-open leaf in accounting.** The baseline already holds a left-open leaf as open, with no completion row. The rule to lift is in accounting, in both modes: a leaf the completed execution left set aside, whether its ledger names it or it depends on one that does (its ledger read with the dependencies in its recorded plan), is judged as if added since delivery, not as unresolved earlier work. Open, it is new unfinished work. Closed by hand, it needs External completion evidence (on the same branch it blocks instead, above). Removed, it is dropped, not counted as lost completed work.

**The offer** appears under **Delivered, with work left** in place of **New phases found** whenever the delivery left phases open.

## Prompts

- `audit-session.txt`: the contract fields above. The item kinds are defined in the PRD's words, with what is never an item: a declared assumption, a request to confirm or review something, and anything the audit can settle itself. An action the requirements place after delivery goes in `afterDeliveryActions` and is never also an item; any other person action that no remaining work needs is an `other` item. The outcome guidance is rewritten around the kinds: `needs_you` when the audit's remaining work cannot go on without an item, when a critical finding would be caused or worsened by the step Kiln takes next (the prompt names that step for each outcome), or when the report would lead to delivery with a holding item open. A new `{{setAside}}` line names the phases Kiln has left open, says they do not count against a passing report, and says to relist as `other` an item whose waiting work is only those phases (§Items for a Person). For `phaseCriteria`, the prompt maps the skill's own status for each criterion an appended phase covers: `none` only when no code does any part of it (the delivery or test audit's Not implemented), and `partly` for every other gap (Partly implemented, or a test audit's criterion broken in a way bigger than the test work left, since broken code still does part of it). The released line asking for `needs_you` when the audit ended normally but lists something for a person is dropped: a critical finding that Kiln's next step would not cause or worsen is listed as `critical`, and the audit reports the outcome it reaches.
- `audit-loop-limits.txt`: the choice's new name.
- `audit-accept.txt`: the sentence names tests only; the other listed items follow, each with its kind, to be kept open. Its last line becomes: Report "passed" when every item in "needsYou" is of kind "critical" or "other", or it is empty, and "needs_you" when any item is of another kind, judging a relisted item by the kind it gives or, when it gives none, the kind listed above.
- A new `pull-request-work-left.txt` for the block in §What Was Left and For You: start each description with the block word for word, including its first and last lines, which are Kiln's markers rather than template comments and are kept; on any later edit, such as adding links or updating an already open pull request, keep the block first and unchanged, and replace any earlier block between the markers instead of adding a second. The pull request prompt says to update an already open pull request's description and, on a same-branch continuation with nothing left, to remove any earlier block, markers included.

## Interfaces (AC-BOT-01, AC-BOT-02)

**Command line.**

```
kiln settings <prd> [--delivery-audit-loops N] [--test-audit-loops N] [--when-loops-run-out deliver|ask]
kiln allow-more-loops <prd> --loops N --only-if-status-matches <token> --command-id ID
kiln accept-and-deliver <prd> --only-if-status-matches <token> --command-id ID
kiln continue-with-phases <prd> --proposal ID --only-if-status-matches <token> --command-id ID
```

`--when-loops-run-out` is the flag help and status name. The released `--after-last-test-audit-loop` stays accepted with the same `deliver|ask` values and sets the same one choice, which now covers both audits, as a run's saved choice does at upgrade (SET-001); help lists it as the older name. The settings and status JSON add `when_loops_run_out` (`deliver | stop_and_ask`), `when_loops_run_out_sentence` and `when_loops_run_out_chosen`, and keep emitting `after_last_test_audit_loop` (`deliver_unless_serious | stop_and_ask`), `after_last_test_audit_loop_sentence` and `after_last_test_audit_loop_chosen` with the same choice, so a bot written against protocol 1 reads the same answer it read before. The control journal's `settings` input accepts either key, never both. Dropping the older names is a breaking change for a later major version, not this one.

`continue-with-phases` is a new public action that reaches the engine path the page's Continue already uses, for either proposal mode, with that route's refusals (`proposal_changed`, `prerequisite_blocked` and the rest) and its receipt, keyed by command id and status token as the page sends them. It takes the proposal the status shows, as the page submits the one it displays. Early-merge authorization and retrying a blocked setup stay in the browser.

Against a controller that does not advertise `deliver_at_loop_limit` (§Interfaces, below the snapshot), the CLI refuses the new command, the new flag and Accept at a delivery stop (`instance_incompatible`). The older flag works against either.

**Control journal.** `settings` takes `when_loops_run_out` or `after_last_test_audit_loop` with `via`, as it took the old field; saved receipts carrying the old field still validate. `accept-and-deliver` at a delivery stop records `via` in the `leftOpen` entry. New outcome `phases_left_open` and refusal `limit_held_by_loop_stop` are declared in `prompts/kiln-command-contracts.json`. That file's `settings` contract and `docs/kiln-command-line-and-bot-control.md` say "Raising a limit starts nothing by itself"; both now name the exception, a raised delivery limit while phases set aside by the setting are left open, which builds them at Kiln's next decision whether to start a loop (§The Loop Gate, LOOP-002).

**HTTP.** The existing settings, allow and accept routes carry the changes; Continue's route is unchanged.

**Snapshot and `kiln status`.** The same objects in both, text and JSON, where `auditLoops` is `audit_loops`:

```
auditLoops:
  settings: { deliveryLimit, testLimit, whenLoopsRunOut, whenLoopsRunOutSource,
              afterLastTest, afterLastTestSource }     — the older two kept, same choice
  delivery, test: { used, limit }
  position?: { audit: "delivery" | "test", afterLoop, limit }     — at a closing audit; afterLoop 0 is "before loop 1"
  stop?:
    kind, reason: "phases_added" | "test_work_saved" | "items_listed", heldAuditKey
    holds                              — false at an items_listed stop, as released
    auditFinished                      — false where the audit has not finished
    lockedLimit: "delivery" | "test"
    heading, loopHelp                  — loopHelp: the line saying what a loop is for this audit
    loops: { number, label, activity, did?, durationMs, observed? }[]
    waiting: { number, limit, what, phases?: { id, title }[] }
    notBuilt?: { criterion, phase }[] | "not_stated"
    audit: { summary?, items: { name, problem, action, kind?, waitsOn?, criterion? }[] }
    afterLastTest?, acceptSentence?, stuckOnly?        — test stops
items?: { id?, kind, problem, action, waitsOn?, criterion?, stopsOrHolds }[]    — at any stop on an audit
delivered?:                            — on a finished run
  workLeft: { phases: { id, title, criteria: { criterion, built }[] | "not_stated", dependsOn?: string[] }[],
                                       — dependsOn: the set-aside phases a dependent depends on; its criteria are []
              acceptedTests: { criterion, state }[], acceptanceLine? }
                                       — the page's Delivered, with work left heading when either list is non-empty
  forYou: { kind?, problem, action }[]
  pullRequests: { repository, number, url }[]
```

Everything released in `audit_loops`, the settings data and the receipts' settings echo keeps its name and meaning; the echo carries the older settings key beside the new one, as the settings JSON does. New fields, values, controls and commands are additions, which protocol-1 readers already tolerate. The controller keeps protocol 1.2 and advertises `deliver_at_loop_limit`, as earlier additions advertised their own feature. `stop.loops` now lists only counted loops, so sessions that are not loops leave it. `stop.heading` is display text and changes with the page. Some stops change class or no longer happen (§Delivery).

`PhaseView` gains `leftOpen?: true`. The stop's `controls` list gives `settings`, `allow-more-loops`, `accept-and-deliver`, `check-again`, `reply` and the handoff with availability and reason; a finished run's gives `continue-with-phases`.

## Upgrade (AC-CHOICE-01)

Schema 24, in the record migration alone:

- `afterLastTest` becomes `whenLoopsRunOut` (`deliver_unless_serious` to `deliver`, `stop_and_ask` unchanged) with its source carried, so a run already going keeps its choice, which now covers both audits. A run begun before audit loop limits keeps `stop_and_ask` and its Kiln-applied source.
- The ledger gains empty `leftOpen` and `allowances`. An existing `allowed` epoch keeps the count it restarted. An Allow recorded before the upgrade as an `allowed` epoch still marks the first test audit after it as the loop it allowed, while no test loop has been counted since; Kiln reads whichever of that epoch and an allowance is later.
- A run stopped at a `loop_limit` stop stays stopped and is answered by its answers; at a delivery stop that now includes Accept. A stored `items_listed` stop on an accepted `passed` report held nothing, so it is cleared and the run carries on as its Check again would have.
- A run stopped on a test audit's `needs_you` report admitted before items had kinds is not re-admitted. An item with no kind, given none and with none in the ledger, counts as neither stopping nor holding, so with no test loop left the stop stays a loop stop with Allow and Accept. Its Accept sentence names every item that has no kind, as the released sentence did, and the Accept prompt lists those items as written. The Accept session's report, like any new report, gives every item a kind.

Schema-23 Kilns refuse schema 24 under the existing newer-schema rule.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Settings (the third setting's stored name, values and reach), §The Loop Ledger (Allow opens no epoch; `allowances` and `leftOpen`), §The Loop Gate (the rows in §The Loop Gate above), §Loop Stops (Check again, Reply, the settings lock, Allow's limit, Accept at a delivery stop, the Accept sentence; `items_listed` keeps its value but is no longer stored on an accepted `passed` report), §Report Contract (item kinds, `phaseCriteria`, `acceptedTests`), §Prompts, §Interfaces and §Display Contract (the stop page and status line).

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Report contract, version 2 and §Admission (the added fields; which items a `passed` report may list; set-aside leaves in the no-open-phase rules; the routing of a delivery audit whose phases are set aside).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (the test audit runs with phases set aside; items of riding kinds do not keep the run from completing) and §Progress and Detail Contract (the left-open plan row; after-delivery actions shown under **For you**).

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Completed feature discovery (pull request state chooses the proposal mode; a leaf left open is accounted as if added since delivery), §Durable proposal and one acceptance (for a same-branch acceptance only: the rule that a delivered branch or worktree is never reset or reused, and the new branch and workspace names) and §Start, interruption and completion (for a same-branch acceptance only: the rule that a new execution cannot extend an old open pull request; it updates the delivered pull requests and records them as its own), §Implemented integrated-prerequisite continuation (Phase 3a) (for a same-branch acceptance only: development deployments and early-merge grants carry rather than starting restricted), §Data Models and Migration (`ContinuationProposal.mode`), and §Interfaces (Continue is also a public command).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`continue-with-phases`; `--when-loops-run-out` beside the older settings flag; `accept-and-deliver` at a delivery stop settles `completed` with no session started). Its §Version compatibility is not changed: the controller keeps protocol 1.2 and advertises a feature, as that section provides.

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Pull Requests (the check's `gh pr list` read adds `body`, and each description is held to the work-left block) and §Screens (AC-SHOW-01) (the finished page's **Delivered, with work left** heading and **For you**).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One evaluator at every transition (finalization and the final evaluation skip set-aside leaves; the work-left block is a requirement on each remaining review pull request's description) and §Display Contract (the **Delivered, with work left** heading).

Kiln Missing Worktree Recovery's folder check predicate and restore commands are used as they stand (§Continuing); nothing in that design is replaced.

## Delivery

- **Expected build spend:** none. Proof uses scripted provider sessions, as the loop limits build did.
- **After the build:** `CHANGELOG.md` entries under Unreleased (`Changed`: delivering when loops run out, the one setting, the loop stop page, what Allow does to the limit, `--when-loops-run-out` and its JSON keys beside the older names; `Added`: `kiln continue-with-phases`). Allow still adds N loops to those the run may make; only the limit it shows and the loop numbering change. A further `Changed` bullet, for bots: a `needs_you` test audit with a blocker, business question or critical next step and no test loop left is now an ordinary Needs you stop, with no `audit_loops.stop`; `allow-more-loops` and `accept-and-deliver` refuse there with `not_at_loop_stop` and its items are in the new `items`. An accepted `passed` test report that lists items no longer stops the run. Under the default **When the loops run out**, a delivery audit whose added criteria are all partly built no longer stops. At a loop stop, `check-again` and `reply` are not offered and `kiln settings` refuses the limit the stop is on (`limit_held_by_loop_stop`). `docs/kiln-command-line-and-bot-control.md` and `prompts/kiln-command-contracts.json` document the added fields. Then the usual release steps.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions writing version-2 reports, the packaged CLI against the local server, the real browser view, and recorded GitHub pull request reads.

| Criteria | Design | Named proof |
|---|---|---|
| AC-CHOICE-01 | Settings; Upgrade | The three settings on Documents found, the run's settings and `kiln settings`; the default delivers at both audits; a schema-23 run under each old value keeps it; a stored `items_listed` stop on an accepted `passed` report is cleared at upgrade |
| AC-CHOICE-02 | Settings; Loop Stops | Changing the choice at a delivery loop stop, then restarting, leaves the stop; the next time loops run out the new choice applies |
| AC-GOON-01, AC-GOON-04 | Phases Left Open; Gate; Settings | A fourth audit's partly built phases are set aside and the run reaches delivery; the same for phases a test audit adds and for a later delivery audit's; the repository shows no Closed line or checked criterion, the plan rows read not started, and the phases-done count leaves them out; a phase added on the branch that depends on a set-aside phase is set aside with it, listed with no criteria rows, and built after Allow; prose in Phase dependencies sets nothing aside; a plan recorded by an earlier Kiln still matches its baseline; the next-leaf marker skips a set-aside leaf and a delivered run with phases left open shows its delivery row; development-delivery finalization completes with a set-aside leaf open; raising the delivery limit by `kiln settings` while the test audit runs with phases set aside by the setting and by an Accept lets the test audit finish, then ends the setting's entry and builds its phases and a dependent as one loop in plan order, keeping the accepted phases open, and the settings and `kiln settings` say so beside the limit while phases set aside by the setting are left open |
| AC-GOON-02 | Phases Left Open | A test audit's `passed` and `continue_test` reports are admitted with set-aside leaves open, and refused with any other open leaf |
| AC-GOON-03 | Report Contract; Gate | A `none` row stops under `deliver` and the page names the criterion; a result with no `phaseCriteria` stops and says the audit did not say, and once accepted its phases read "the audit did not say" in the work left and add nothing to the tests-not-audited line; a report that appends phases without the field is refused |
| AC-LEFT-01 | What Was Left; Prompts | The prompt block for each kind of work left, in both prompts that carry it; in one repository of two, the pull request check fails a description that drops or rewords the block, puts text before the opening marker, or carries the opening marker twice, and, with nothing left, one that still carries an earlier block; an already integrated repository has no row; with development deployments on, a review pull request missing the block keeps its repository unresolved, and a merged checkpoint pull request is not checked |
| AC-LEFT-02 | What Was Left; Interfaces | The finished page and `kiln status` for mockup state 2; a run delivered with only **For you** items keeps today's heading and shows them |
| AC-LEFT-03 | Continuing | With every pull request open, Continue builds the left-open phases and one added on the branch in the same worktree, counts no loop for them, runs both audits again from zero and updates the pull requests; history then shows each pull request under both executions and `kiln status` lists it once; a left-open phase naming a repository the run lacks is added at its phase start on the feature branch and gets its own pull request with the block; a limit raised by Allow is the continued run's limit; a phase committed only on the delivery base, or uncommitted in the shared checkout, blocks with the document and its source named; a mockup-only change on the base does not block; a PRD edit on the base blocks until merged or cherry-picked onto the branch; a phase committed on a branch the shared checkout does not have checked out does not block; a missing worktree blocks with the restore command; a worktree ahead of origin by unpushed commits is accepted, and one behind, diverged, dirty or on another branch blocks, as does a pull request head that differs from origin's tip; a first open leaf with a preparation instruction blocks; a moved worktree HEAD, origin tip, pull request head or settings digest refuses acceptance with `proposal_changed`; development deployments and early-merge grants carry; a repository recorded as already integrated counts as merged; a fresh-base continuation also keeps a raised limit; after a merge, a left-open leaf removed from the plan is dropped and one closed by hand needs External completion evidence; a leaf skipped on a waiver carries; a left-open leaf closed by hand blocks; with one merged, today's path offers them from the delivery base; with the PRD repository's pull request closed unmerged, or still open beside another repository's merged one, the check reports awaiting merge; a failed pull request read offers nothing |
| AC-ITEM-01 | Items; Report Contract | Each kind once: `critical_next_step` stops at once; a blocker listed with `completion_phases` lets the loop run and stops at the report that would deliver; a blocker whose phases are set aside is relisted as `other` and reaches delivery; `critical` and `other` reach delivery; each refusal in §Report Contract, including a `needs_you` report listing only `critical` or `other` items |
| AC-ITEM-02 | Report Contract; Interfaces | An item with no kind, and a blocker with no `waitsOn`, are refused; a relisting by `id` that gives only `id`, `problem` and `action` is admitted, keeping the ledger's kind, `waitsOn` and `criterion`; the stop page and status show kind, problem, action and what waits |
| AC-ITEM-03 | Items; What Was Left | A run delivers with an `other` item open under each choice and lists it under **For you** after what was left; a `critical` item moves **For you** first; a later audit that omits the item is refused; after-delivery actions of a delivery audit whose phases were set aside are listed, and an action both closing audits give is listed once |
| AC-ANSWER-01 | Loop Stops; Interfaces | Status line before loop 1 and after loop 3; headings for each reason and for a lowered limit; loop rows and the waiting row for mockup states 4 and 6 |
| AC-ANSWER-02 | Loop Stops; Upgrade | Allow 2 after 3 loops makes the limit 5 and starts loop 4; Accept at a delivery stop leaves the phases open with no session; Accept at a test stop quotes tests only and keeps other items open; Allow at a later delivery stop builds the phases the setting set aside as one loop, keeps open the phases accepted at an earlier stop, and ends an accepted entry, naming it on the page, when a phase the loop builds depends on one of its phases; an Accept session at a test stop whose report lists only `critical` or `other` items reports `passed` and delivers, with them under **For you**; an `allowed` epoch recorded before the upgrade still marks the first test audit after it as the allowed loop; Accept at a delivery stop records no session started; a pre-kinds `needs_you` test stop stays a loop stop and Accept names every kind-less item |
| AC-ANSWER-03 | Loop Stops | The text under the number for both audits, with the accepted phases that stay open at a delivery stop, and the stuck-row line |
| AC-ANSWER-04 | Loop Stops | The stop's limit is text on the page and refused by `kiln settings`; the other limit and the choice change; Check again is unavailable in both places |
| AC-ANSWER-05 | Loop Stops | No Reply and a refused `reply` at a `loop_limit` stop; Reply offered at an `items_listed` stop; an `items_listed` stop comes only from a `needs_you` test report whose stopping or holding items are all `test_acceptance`, and an accepted `passed` report listing items does not stop; an item stop with no test loop left has an item stop's controls |
| AC-BOT-01 | Interfaces | Each command and each refusal through the packaged CLI; `continue-with-phases` for both proposal modes, its receipt keyed by command id and status token; controls with availability and reason; an older controller refused; `--after-last-test-audit-loop` still sets the choice and the older JSON keys still read it |
| AC-BOT-02 | Interfaces | Status text and JSON for a loop stop, an item stop and a finished run with work left; a protocol-1 reader sees every released `audit_loops` field and value; the receipts' settings echo carries both settings keys; a `settings` instruction carrying both keys is refused |

## Open Questions

None.
