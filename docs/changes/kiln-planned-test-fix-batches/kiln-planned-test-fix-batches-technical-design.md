# Technical Design: Kiln Planned Test Fix Batches

**PRD:** [Kiln Planned Test Fix Batches](kiln-planned-test-fix-batches-prd.md) · **Mockup:** [four states](mockups/kiln-planned-test-fix-batches.html)

## Overview

A test audit that saves test work now tells Kiln how it cut that work: its report lists the batches it planned, one for each later session, and each session of test fixes lists the batches it leaves. Kiln saves that list with the audit's result, shows a row for each batch that has not started, and names each session by the batch it took. Nothing about when a session starts changes. Kiln still starts one session of test fixes after another while the latest result says test work is saved, and a report with no list reads exactly as today.

The second change is wording. Every place Kiln writes a loop's name or a count of loops says the limit is a maximum, and all of that wording moves into the one names module the page already imports, so "loop _n_ of _limit_" has a single place to be removed from.

Everything here is Kiln's. The Enso Method's test audit already plans the batches and records them for a person running it by hand (enso-method `a2f730f`, `skills/test-audit/SKILL.md`, "Bounding Each Chat"). Kiln asks for the same plan in its own report, in its own words, and reads no file the method writes (principles 1 and 2).

## Existing Code

**Posture: Preserve.** Nobody stated one, so this is the default: Kiln is released, and its behavior is a constraint wherever this design does not name a change.

- Reused: the version-2 audit report and its admission; the audit prompt template; the effective result of an audit (accepted, or counted at a waiver); the loop ledger and the limits in force; the names module of Kiln After Delivery; the audit prompt's forecast of the step after each outcome; the plan's row states.
- Kept: routing. `auditNext`, the allocation of a session of test fixes and its requirement of a settled predecessor, the loop count and what closes a kind are untouched. No batch changes whether or when a session starts.
- Kept: Kiln never reads `test-audit.md` or any other record the installed skill keeps (Kiln Method-Neutral Audits, AC-NEUTRAL-01).
- Kept: "Round" and "Continuation" appear in no name a person reads; `round` and `continuation_index` stay in JSON as identifiers.
- Kept: an audit the ledger did not count as a loop names no loop (AC-BATCH-03).
- Kept: the phase count beside the status line counts phases only. A batch row is never counted in it.

## Architecture

A change inside the existing Kiln command-line tool and its local page: the report contract, one optional field on the saved record, the names module and the surfaces that print names. No new service, store, dependency or command.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| How Kiln learns the plan | An optional `fixBatches` list on the audit's own report | The report is the one contract between an audit session and Kiln, and it holds outcomes, never method records. A report without the field is already valid, which is AC-BATCH-05 |
| What a batch carries | The IDs of its criteria; Kiln counts them | A session copies the IDs from the plan it wrote instead of counting them, and a count Kiln makes cannot disagree with the list. `raised` already carries criterion IDs |
| Who numbers the batches | Kiln, from each session's place in its chain | The report lists only what is left. A session's number then never depends on a session reporting it. While the chain's first result listed batches it equals the number the method keeps, since a closing fixing chat leaves the remaining lines their numbers |
| Where the plan is kept | Copied onto the audit activity in the write that records its result | A name is built from the record alone, which is what lets the page import the names module and lets every caller name an audit without opening the audit store |
| When rows that have not started show | While the forecast of Kiln's next test step is a session of test fixes of that chain | AC-BATCH-04 removes them when a new test audit is due. The audit prompt's forecast already applies that rule; the rule moves out of its prose into the step function of §Reading the Plan, so the page and the prompt cannot disagree |
| _N_ once the test fixes have ended | The plan's last count | The rows that ran keep saying how many batches were planned. What the batches never started held is under **For you** or in the next test audit's plan |
| Where the wording lives | One module for row names, status-line text and loops used | AC-MAX-01 says the old wording appears nowhere. One source makes that a single check |
| A pull request described in the old words | No special handling | The existing **Pull request description** row already sends a session to rewrite a block that no longer matches (§Upgrade) |

## The Fix Plan in the Report (AC-BATCH-01, AC-BATCH-05)

Replaces in part: `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-technical-design.md`, §Report contract, version 2 (`fixBatches`) and §Admission (its checks, in step 1).

```
fixBatches?: { criteria: string[] }[]
```

| On | Means |
|---|---|
| A test audit's `continue_test` report | The test work it saved, as the batches it planned, in the order they will be worked. Each batch is the work of one later session, and `criteria` are the IDs of the acceptance criteria in it |
| A session of test fixes' `continue_test` report | The batches left after its own, in order, as it leaves them |
| Absent or `[]` | The session planned no batches |

Admission checks the field's own shape with the other contract fields and refuses with `invalid_report` when it is present at all on a delivery audit's report, `[]` included, as `changedImplementation` is; is not a list of batches each with at least one non-empty criterion ID; names a criterion more than once anywhere in the list, in two batches or twice in one; or is non-empty with an outcome other than `continue_test`. A criterion named twice would make the audit's number of gaps differ from the sum of its batches' (AC-BATCH-02).

Kiln never refuses a test audit's or a session of test fixes' report because the field is absent or empty, and compares the list with nothing: not the list before it, not `raised`, not a file in the repository. Whether a session of test fixes made progress is still decided by the existing rules.

**The prompt.** `prompts/audit-session.txt` describes the field in the report's own terms: on a `continue_test` report, when the skill left the remaining test work as a list of batches, one for each later session, list them in that order with the criteria in each, leaving out a batch this session worked; omit the field with any other outcome, and when the skill planned none. The outcome rule is in the prompt because the published skill cuts batches whenever rows are left to fix, including when the audit also appends completion phases or stops for a person, and admission refuses the field on those reports. It names no file or marker of the method. The contract summary a refusal quotes, and `kiln audit status` returns, names the field too.

## The Fix Plan on the Record

```
AuditActivity (a test audit, or a session of test fixes):
  testWork?:
    batches: { criteria: string[] }[]     — its report's fixBatches; [] when it listed none
    changedImplementation: boolean        — as its effective result counts it
```

`testWork` is written in the same record write that gives the activity an effective result counting `continue_test`: an accepted report, or the valid report of an audit marked complete. An activity whose effective result counts anything else has none, and neither does one marked complete with no usable report. It is a copy of facts in an immutable result, written only where that result is recorded.

## Reading the Plan (AC-BATCH-01 to AC-BATCH-05)

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Progress and Detail Contract (rows for batches of test fixes that have not started follow the plan leaves that have not started).

A **chain** is a test audit and the sessions of test fixes that follow it without another test audit between them: on the record, the test audit activities of one `round`, the audit at `continuationIndex` 1 and the session at place _k_ at `continuationIndex` _k_ + 1, as the names module already reads them. A delivery audit may run between two of its sessions, when the test kind is closed. One pure function reads a chain from the record, and the rows, the status line and `kiln status` all take their batch facts from it.

- **Which sessions are batches.** The session at place _k_ in the chain, counted from 1, is batch _k_ when the result before it in the chain listed at least one batch. It took the first one listed, and that batch's number of criteria is its number of gaps for good. Otherwise it is a session with no batch and reads as today (AC-BATCH-05).
- **What the audit found.** A test audit whose own result lists at least one batch found the sum of their criteria and planned that many batches. These two numbers come from the audit's own result and never change, whatever later sessions re-cut.
- **_N_.** Take the latest activity of the chain that has `testWork`: _N_ is its place in the chain (0 for the audit) plus the batches it lists. Every batch row of the chain reads that _N_, so a session that re-cuts what it left changes _N_ on every row, the finished ones included.
- **Rows that have not started.** The batches the chain's latest result lists, less the first once a later session of the chain has been allocated, numbered on from the latest session. They show while the chain is **open**:
  1. the latest activity of the chain that has an effective result has `testWork`, so that result counts `continue_test`; and
  2. no later test audit has been allocated; and
  3. that result does not lead to a new test audit: it reported `changedImplementation` true while both the delivery kind and the test kind still have a loop left. This is the rule `nextStepsForecast` writes as prose today (its `recheck` and `afterDelivery` steps). It becomes one exported pure function of the forecast's existing input (the kind, whether the session is one of test fixes, the closed kinds and, for a delivery audit, whether the latest settled test result counts `continue_test`), the outcome and `changedImplementation`, that returns the steps in order; the forecast words its result and the chain reading tests it, with the closed kinds from `closedKinds` on the record. Here and in the Next rule below, the latest audit means the latest audit activity of either kind with an effective result, a session of test fixes included.

  When any of the three stops holding, the rows are gone at the next reading of the record. Nothing is deleted. The work they held is what the existing rules already carry: listed as test items under **For you**, or found again by the next test audit.

**Where the rows sit, and their state.** Rows that have not started sit after every row of the plan's phases that has not started, completion phases included, and before the plan's pull request, Merge and Push rows. That is the order they will run in: phases a delivery audit adds are built before any further test fixes. A planned Preflight row that would sit last (its `before` is `end`) sits above the first of them instead. Each is `planned`, as a phase that has not started is. The first reads **Next** only while the run is paused, no allocated activity is unfinished, no phase is left to build, and the step function, applied to the latest audit of either kind with an effective result, puts a session of test fixes first. After a delivery audit that added phases while a delivery loop is left, that is another delivery audit, so the first batch stays **Planned**. Once that audit passes, or the delivery kind is closed, the batch reads **Next**. Like the existing forecasts, this reads the record only. It cannot see a change to the work that makes Kiln audit again first. The mockup's second state draws the waiting batch as Next while the first batch runs; AC-BATCH-01 governs, so it reads **Planned** there, as a phase behind a running phase does. A row that has not started has no session, timing, details or link, and no control acts on it.

## Names (AC-BATCH-03, AC-MAX-01)

Replaces in part: `docs/changes/kiln-after-delivery/kiln-after-delivery-technical-design.md`, §Closing-Audit Names (the line beneath an audit, the name of a batch, and the status-line and loops-used text joining the module).

Replaces in part: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §The Status Line (the wording, and `batch` in `position`) and §What a Delivered Run Says (the **Closing audits** sentence).

| Activity | Title | Line | In a sentence | Status line while it runs |
|---|---|---|---|---|
| A delivery audit | Delivery audit | Loop _n_ · max _limit_ | delivery audit loop _n_ | Delivery audit loop _n_ · max _limit_ |
| A test audit | Test audit | Loop _n_ · max _limit_ | test audit loop _n_ | Test audit loop _n_ · max _limit_ |
| A test audit that planned batches | Test audit | Loop _n_ · max _limit_ · found _G_ test gaps and planned them as _B_ batches | test audit loop _n_ | Test audit loop _n_ · max _limit_ |
| A batch of test fixes | Fixing tests | Batch _k_ of _N_ from test audit loop _n_ · _g_ gaps | fixing tests, batch _k_ of _N_ from test audit loop _n_ | Fixing tests · batch _k_ of _N_ from test audit loop _n_ |
| A session of test fixes with no batch | Fixing tests | From test audit loop _n_ · session _k_ | fixing tests from test audit loop _n_, session _k_ | Fixing tests from test audit loop _n_ |

- A count of one is singular: 1 test gap, 1 batch, 1 gap, 1 loop.
- An audit the ledger did not count names no loop. Its line is what it found and planned alone ("Found 13 test gaps and planned them as 1 batch"), or nothing. Its batches read "Batch _k_ of _N_ from test audit · _g_ gaps", and its sessions "From test audit · session _k_", as today.
- At a Needs you stop the status line names the latest loop counted, as today, in the audit rows' form: **Test audit loop 4 · max 4**.
- The loops a run used read "Delivery audit: 4 loops (max 4). Test audit: 1 loop (max 4)." in the block each pull request description opens with and in `kiln status`. The finished page's **Closing audits** list shows the same two values, "4 loops (max 4)", beside each audit's name.
- While a run is under way, `kiln status` prints its count line as "Audit loops: delivery 2 (max 4) · test 0 (max 4)".

One module gives all of it: the row name, the status-line text and the loops-used text. The page's own copy of the status-line text, the finished page's own wording of loops used and the command line's own count line are replaced by it. Every surface Kiln After Delivery listed for an audit's name takes the new line with no change of its own: the plan row, the session page's heading, the terminal's audit lines, the live-control, pause and paused-partway labels, the "was marked complete" row, the `kiln status` rows and waiver labels, and the "listed by" and "settled by" names. A test audit's found-and-planned clause goes wherever its line does, on surfaces that join title and line in one heading too; a line written before the audit has a result, such as the terminal's line when it starts, names the loop alone.

On the Paused screen, a batch that has not started and reads **Next** gives the heading its sentence form, "Next: fixing tests, batch 2 of 3 from test audit loop 1", in place of the name and title the heading joins for other rows. The start button and the model line keep the name, "Start fixing tests". Allocated audit rows read as they do today.

## Settings Help (AC-MAX-02)

Replaces in part: `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Display Contract (what the **Audit loops** help text says a loop and a limit are).

Both forms of the help text, on Documents found and in the run's settings panel, carry the mockup's two sentences, word for word: "Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make." The sentences they replace go: every sentence saying that each run of an audit is one loop, the per-limit ones included, "These set how many loops of each Kiln makes", and "After the last one, Kiln moves on without auditing again.", which each limit's own line now says and which, after the new sentences, would read as the last audit rather than the last loop. The intro of each form then reads:

| Form | Intro |
|---|---|
| The settings panel (short) | Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make. |
| Documents found (full) | After the planned phases close, two audits check the work. Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make. |

The full form keeps its opening sentence first, because the loop sentences speak of audits it introduces. Each limit's full line keeps its first sentence, saying what that audit checks, and ends with the line below.

Each limit's own line stops reading as a promise to reach its number: "If a run reaches loop 4, Kiln builds the phases from it and goes on to the test audit.", and for the test limit, "If a run reaches loop 4, Kiln finishes the work from it and opens the pull request, after a delivery audit if one is left."

The two `kiln settings` flag descriptions in `prompts/kiln-command-contracts.json` keep "the most … audits the run makes", and each gains "A loop is one audit plus the work it finds." after its name. The `audit_loops` description there ends "A loop is one run of an audit; Kiln never stops at a limit.", which becomes "A loop is one audit plus the work it finds, and each limit is the most loops of that audit a run makes; Kiln never stops at a limit." The **Audit loop limits** section of `docs/kiln-command-line-and-bot-control.md` opens with the mockup's two sentences in place of "A loop is one run of an audit.", and its `kiln status` example reads `Delivery audit loop 2 · max 4`. What the ledger counts does not change: one loop for each audit Kiln allocates.

## Interfaces (AC-BOT-01)

Replaces in part: `docs/changes/kiln-after-delivery/kiln-after-delivery-technical-design.md`, §Interfaces (`fixing` gains `batch`; rows for batches that have not started).

Replaces in part: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Interfaces (`position` gains `batch`; the wording of the position, count and loops-used lines).

The snapshot and `kiln status` carry the same objects; JSON keys are snake case as today.

```
A row of the snapshot's activities, and of kiln status progress:
  fixing?:
    loop?: number        — the test audit loop that started its chain, when counted
    session: number      — its place in the chain, from 1
    batch?:              — present on a batch
      number: integer    — k
      of: integer        — N, the plan's current count
      gaps: integer

A batch that has not started, in the same lists:
  key (id in the snapshot): "audit-batch-<the test audit's activity ID>-<number>"
  kind: "test_audit"
  state: "planned"       — new in kiln status progress; in the snapshot, "planned" or "next"
  title, line and fixing as §Names

audit loops position:
  { audit, loop, limit, fixing?: true, batch?: { number, of } }
```

- A batch has not started while its row's state is `planned`, has finished when it is `complete`, and has started in every other state. That is AC-BOT-01's "whether it has started or finished".
- A row that has not started names no activity. Its key reads as an audit's to the shared key classifier, so nothing takes it for a phase, and, like the planned Preflight row's `preflight-planned`, it is never resolved to an audit activity: its title, line and `fixing` come from the chain reading, not from the lookup by key that names an allocated row. No command takes it.
- `kiln status` progress lists batches that have not started after every row reached, in batch order. Phases that have not started stay out of it, as today; AC-BOT-01 asks for the batches.
- `kiln status` text prints the same rows in the progress block, a batch that has not started with the word "planned", then the position and count lines of §Names.
- A test audit's found and planned numbers reach a bot in its row's line, as a person reads them. No structured field carries them: the batch rows carry each batch's own facts, which is what AC-BOT-01 asks for.
- In `prompts/kiln-command-contracts.json`, the `audit_loops` description's position gains `batch {number, of}`.
- No command or flag is added, so there is no new controller feature to advertise.

## Upgrade

- **No schema version change.** `testWork` is optional, and a record without it has no plan. A test audit accepted before the upgrade has none, so its chain reads as sessions (AC-BATCH-05), and so does a session whose prompt was written before the upgrade.
- **Wording.** Everything Kiln words when it reads the record changes at once. Text saved as text does not: terminal lines already printed, and the block saved on a pull request session's record.
- **A pull request opened in the old words.** For a run not yet complete, the **Pull request description** row compares the block Kiln would write now with the block its latest pull request session was given. After the upgrade they differ in the **Closing audits** sentence, so the row fails and one more pull request session rewrites the description. A completed run is not checked again: its description on GitHub keeps the old sentence while the finished page shows the new one.
- **A controller still running an older Kiln** keeps wording its own rows and page until it is restarted. The updated command line words the position, count and loops-used lines itself.

## Delivery

- **Before the build:** the build machine's installed Enso Method is at or after `a2f730f`, so a real test audit plans batches.
- **Expected build spend:** about $10 of agent usage, for one real test audit session with each agent on a small fixture repository whose tests leave gaps. It proves the one thing scripted sessions cannot: that a session following the published skill writes `fixBatches` matching the batches its own record lists (AC-BATCH-01). One batch is enough, and a small fixture usually plans one. The fixture's criteria are all built and only weakly tested, so the audit cannot end `completion_phases`. Order, several batches and re-cuts are proved on scripted sessions, like everything else.
- **After the build:** `CHANGELOG.md` under Unreleased when the work merges to `develop`. `Added`: a row for each batch of test fixes a test audit planned, shown as soon as the audit ends. `Changed`: a loop is named with its maximum ("loop 1 · max 4") wherever "loop 1 of 4" appeared, and `kiln status` lists batches not yet started with the new `planned` state. Update `docs/kiln-command-line-and-bot-control.md`. Then the usual publish gate and release steps; this is new functionality with no removal, so a minor version by the repository's release rules.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions, the packaged command line against the local server, and the real browser view.

| Criteria | Design | Named proof |
|---|---|---|
| AC-BATCH-01 | The Fix Plan in the Report; Reading the Plan | A test audit accepted with two batches shows both rows before any session starts, in order, each Planned; a waiting batch behind a running one reads Planned, and Next when the run is paused before it; with completion phases a delivery audit added still to build, the batch rows sit after their rows, the first stays Planned while another delivery audit is due, and a planned Preflight row sits above them; neither row is counted in phases done; a test audit report with `fixBatches` and `completion_phases` or `needs_you` is refused; the forecast's text is unchanged by the step function it now words; the real session of §Delivery |
| AC-BATCH-02 | Names | 13 gaps in 1 batch and 31 in 2, with the singular forms; a report naming a criterion in two batches, or twice in one, is refused; a delivery audit's report carrying the field, `[]` included, is refused; the line is unchanged after a later session re-cuts |
| AC-BATCH-03 | Names | Each row of the table on the plan row, the session page, the terminal and `kiln status`; an audit not counted as a loop names none, in its own row and its batches'; the Paused screen with a batch at Next reads its sentence form and "Start fixing tests"; a test audit's started terminal line names the loop alone |
| AC-BATCH-04 | Reading the Plan | A session that leaves three batches where one was left changes _N_ on every row, the finished one included; rows are removed when a session reports `passed`, when it adds phases, when it is marked complete with no report, and when it reports `changedImplementation` with both kinds open; they stay through a delivery audit when the test kind is closed, and return when a limit lowered to its floor closes it; a finished batch keeps its _N_ after the rows go |
| AC-BATCH-05 | The Fix Plan in the Report; Upgrade | A `continue_test` report with no field, and with `[]`, is accepted and each session reads "session _k_"; a session after a plan's last batch reads "session _k_"; a version-1 result and a pre-upgrade record read the same; no report is refused for a missing plan |
| AC-MAX-01 | Names | Each row of the PRD's table; a search of every rendered surface (the plan, status line, session page, terminal, Needs you, finished page, pull request block and `kiln status`) finds no "loop _n_ of _limit_", while "Batch _k_ of _N_" keeps "of" |
| AC-MAX-02 | Settings Help | Both help forms, each intro exactly as its table row, and each limit's line at several values; the two flag descriptions, the `audit_loops` description and the command-line document |
| AC-BOT-01 | Interfaces | Text and JSON for a plan with a finished, a running and a waiting batch: number, count, gaps and state for each, the waiting batch listed after every row reached; the position with its batch, and the `audit_loops` description naming it |
| Upgrade (no criterion) | Upgrade | A run with an open pull request described in the old words starts one pull request session and then completes; a completed run starts none |

## Open Questions

- **Kiln Phase Model Tiers is being built on its own branch, not yet merged**, and its "Planned rows" (§When an Activity Starts, built in its Phase 1) adds a planned row for each audit kind routing still expects, then the pull request row. Whichever of the two merges second merges the two kinds of row in the order they will run: a planned Delivery audit row sits above the batches when a delivery audit comes first (§Where the rows sit), the batches stand in for the planned Test audit row while their chain is open, since the next test activity is then a batch and not a new test audit, and the planned pull request row comes after them. It also gives each batch row the Audits choice with **Will run on**, as that design gives any audit not yet allocated. Nothing in either PRD conflicts; the order of the two merges decides who writes the lines.
- **A plan lost partway.** A session of test fixes that reports `continue_test` with no list, after a plan that had more batches, leaves the next session reading "session _k_" and the finished rows reading the smaller _N_. AC-BATCH-05 requires Kiln not to refuse, so this is how a missing plan shows. If it turns out to happen with the published skill, the fix is in the prompt's wording, not in admission.
