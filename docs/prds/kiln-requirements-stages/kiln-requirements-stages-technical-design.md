# Technical Design: Kiln Requirements Stages

**PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md) · **Decisions:** [assumptions](kiln-requirements-stages-assumptions.md) · **Design references:** the fourteen mockups the PRD links

## Overview

Kiln gains a requirements side in front of the build it already runs. Five things carry the design:

- **A requirements session is an activity.** Each stage, each review Kiln has made and each round of feedback is one activity of the PRD's execution, launched, stopped, resumed and billed by the path every other activity uses. Its model comes from the resolver Kiln Phase Model Tiers builds.
- **The session decides what runs; Kiln decides when to stop.** Every session is pointed at the method's entry skill and ends with a report in a form Kiln owns. Kiln reads four milestones from the reports and holds no list of stages (§What Kiln Knows About the Method).
- **The plan is for showing.** One short session reads the installed method's order once per computer. Nothing that runs depends on it except which model a stage starts on.
- **A run is found by where it started, not by its PRD folder.** A run started from source material keeps the key, address and branch it started with when the PRD's folder appears or is renamed (§Starting).
- **The home screen is a Kiln process with no engine.** It lists what it finds by file names and Git, and starts each PRD's own Kiln as a child of its terminal (§The Home Screen).

No new service, repository, database or dependency. This PRD changes no Enso Method skill.

## Existing Code

**Posture: Preserve.** Kiln is released, and a PRD that already has its phase plan starts and runs exactly as today (AC-BEGIN-05).

- **Reused:** the activity record and its keys; the launch path with its billing check, readiness checks and usage-limit wait; the stop, Needs you, Resume, Check again, Carry on and reset machinery; Message Claude's delivery and receipts; Pause now; the restart review; the Everything committed and Pushed checks; the instruction journal behind browser controls and `kiln` commands; the state root, port registry and instance lock; the `kiln status` inventory and its probe of each running Kiln; the plugin lookup that resolves an audit's skill file; Kiln Phase Model Tiers' resolver, start line, launch decision and Model defaults file.
- **Kept, and not visible from the code alone:**
  - Phases are still judged by Git and the phase document alone. Only requirements sessions and the build of a PRD with no phase plan are judged with a report, because neither leaves a line in a document.
  - Agent sessions push their own work in a build. For requirements sessions Kiln pushes (§How a stage ends).
  - Start checks for a PRD with phase documents, and the rule that its documents are on the base branch on origin, are unchanged.

## Architecture

### Workload Type and Starting Point

The existing local TypeScript application: the engine, its loopback server, the Svelte view and the `kiln` command line. Patterns come from this repository.

### Storage

Everything new is in the state root, outside every repository. Per-PRD facts go in the PRD record. One computer-wide file joins Model defaults there, the requirements plan (§The Requirements Plan). Remembered stage choices live in the Model defaults file. Kiln writes nothing into a repository: every document, and every commit but the push, comes from a session running a method skill.

### Dependencies

Claude Code and Codex through their existing adapters, Git, and the installed Enso Method. The home screen reads Git and Kiln's own records only.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| How a session reports | A fenced block in its final message, in the form §The report gives, read from the run's recorded result | The preflight already reads its verdict there, for both agents. A file would be an uncommitted change in the worktree, which AC-STAGE-02 forbids, or a file in the repository the method doesn't write. A command would need the session to reach outside its sandbox |
| The one method name Kiln holds for requirements | The entry skill, `using-the-enso-method`, named in the prompts | AC-PLAN-02 rules out a list of stages. The entry skill is the method's front door, and every other name comes from it at run time. A rename of it is the occasional break the PRD accepts |
| Who pushes after a requirements session | Kiln, with a plain push of the feature branch, after Everything committed passes | The requirements skills never push by default, and a person who finishes a stage by hand only commits (AC-STAGE-02). One rule covers both. A push Git rejects stops at Needs you on the Pushed check; Kiln never forces |
| How a run is kept before the PRD's folder exists (BEGIN-001) | Under the key of what `kiln run` was pointed at, for the life of the run. The record names the PRD directory once it exists, and Kiln finds a run for a path by reading the repository's records | The method doesn't promise the PRD folder shares the source folder's name, and AC-BEGIN-06 keeps the run through a rename. Moving a state directory would move its port, address and token |
| The title before the draft (BEGIN-001) | The first heading of the brief or intake record, without a leading "Brief:" or "Requirements intake:" label; the folder's name in words when it has none. A planned PRD: the initiative's title, a colon, the row's name | AC-HOME-02 asks for a name from the source material itself, and the mockups draw a title, not a folder name |
| Finding the PRD's folder after the draft | The directory the drafting session's report names, accepted only when the feature branch holds a `<folder>-prd.md` there that the base commit doesn't. Later, when that file is gone, Kiln follows the rename Git reports for it | Git settles it, so a wrong report can't point the run at another PRD. Rename detection is what Kiln already uses for phase files |
| What source material counts as "written from" (HOME-003) | Kiln's records in the repository, then a PRD or initiative folder of the same name on any local branch or any remote-tracking branch of `origin`, as last fetched. The home screen never fetches. A planned PRD's list is read from the shared branch only | A PRD written on another computer hides its source material after the next fetch, with no network call from a page that must open fast. A planned PRD renamed on an unmerged branch is not yet the initiative's word |
| Where the feature branch is cut from, for a start with no phase plan | The local shared branch's tip, when it holds origin's tip. When it doesn't, Start is unavailable and says to bring the shared branch up to date | The home screen's prompt has the person's session commit source material on the shared branch and stop, so the material is often not pushed. The method cuts a PRD's branch the same way when the commits it needs are only local |
| When a stakeholder review is stale | Its file has no commit, or a later commit on the branch changes or removes a file the PRD directory held at the review's latest commit | Git alone decides, so a person's own session is judged the same way as Kiln's. New files don't count, so a phase plan that only adds phase documents starts no session (AC-PLAN-08), while one that rewrites a criterion does |
| Uncertain delivery of feedback | A message whose delivery to the running session isn't confirmed stays waiting and takes no hold | AC-TALK-03: feedback never stops the run. Message Claude's delivery-recovery hold stays for the build |
| A method update at a stage boundary | Kiln reads the plan again and waits for it, up to the read's time limit, before launching the next stage | The stage's model comes from what the plan expects next (AC-MODEL-02), and the report in hand came from a session on the old copy. A minute's wait before a stage that runs for hours costs nothing. At Start nothing waits (AC-PLAN-05) |
| How the home screen opens a PRD (HOME-002) | It starts `kiln run` for that PRD as a child process of its own terminal, and the page opens the PRD's address in a new tab. Ctrl+C in that terminal stops the home screen and every Kiln it started, each as its own Ctrl+C would | Kiln has no background service. A Kiln with no terminal has nothing that ends it, and a build nobody can find is worse than a terminal that must stay open, which the README already asks for |
| Keeping the home list current (HOME-002) | The home process reads a cheap fingerprint every 5 seconds (each repository's refs and the status of the folders it lists, the state root's records, each running Kiln's status) and scans again only when it changes | Nothing in Kiln watches files today, and Git's refs are the one place a commit on any branch shows. A scan on every tick would spend Git calls on an idle page |
| The build of a PRD with no phase plan (SCOPE-001) | A plan of one leaf with no file, run through the phase path, judged by a report plus the two Git checks, with the delivery audit kind closed from the start | AC-FINAL-06 needs a second way of building. One synthetic leaf keeps every screen, stop, model rule and record that reads phases working, so the second way is one prompt and one check |
| Form of a remembered stage choice | The model's family when it has one, as a Model defaults row stores it, otherwise the exact model | A choice kept for every PRD must not pin last year's version (AC-MODEL-03) |

## What Kiln Knows About the Method

**Four milestones** (AC-PLAN-08), the whole vocabulary of every report and plan entry:

```
prd_refined            the PRD is refined
design_ready           the technical design is ready to plan phases from
review_made            a stakeholder review was made
requirements_finished  the phase plan is written, or the method puts the build next
```

**Files read by name**, as Kiln already reads `<folder>-prd.md`, the technical design, `phase-*.md` and the `**Closed:**` line:

| File | Read for |
|---|---|
| `source-material/{name}/{name}-brief.md` | A brief (AC-BEGIN-02). The name is the one the method change in §Delivery sets |
| `source-material/{name}/{name}-requirements-intake.md`, `source-material/{name}/received/` | An intake record; an intake not finished |
| `docs/initiatives/{name}/{name}-initiative-prds.md`, and the PRD contracts file its rows link | Planned PRDs: each row with status `planned`, its name, its Depends on, and its directory from the linked scope entry's `**PRD directory, when written:**` line |
| `{folder}-stakeholder-review.html` in the PRD directory | The review each stop opens |
| `{folder}-prd-refinement-state.md`, `{folder}-design-refinement-state.md`, `{folder}-pending-feedback-changes.md` | Under way on the home screen (AC-HOME-13) |

A planned row whose directory line can't be read is still listed and started, named from its row; it is matched to a written PRD only through Kiln's own record.

Everything else Kiln learns from a session's report: the name of every stage, the order, which stage reaches which milestone, and the skill that makes a stakeholder review.

## Starting

### What `kiln run` accepts (AC-BEGIN-01 to 05, AC-BEGIN-08)

```
kiln run <PRD directory or PRD file> [--branch <name>]
kiln run source-material/<name>
kiln run docs/initiatives/<name> --prd <planned PRD's directory name>
```

Kiln resolves the path, finds the run (§Run identity), and takes the first row that fits:

| The path is | Kiln |
|---|---|
| Anything with an unfinished or finished run of its own | Opens that run, as today |
| A PRD directory holding phase documents | Today's start checks and Documents found. No requirements side exists for this run (AC-BEGIN-05) |
| A PRD directory with no phase documents | The requirements start checks, then the screen before Start in its requirements form, headed by where the documents stand (AC-BEGIN-04) |
| Source material, or a planned PRD, that fits AC-HOME-13's Ready to start row | The requirements start checks, then the screen before Start with What Kiln found (AC-BEGIN-07) |
| Source material or a planned PRD something was written from | Opens the run when Kiln started the PRD; otherwise prints which PRD or initiative was written from it, and exits |
| Anything else under `source-material/` or `docs/initiatives/` | Prints which document is missing, or what to commit (AC-BEGIN-03), and exits |

A PRD directory that isn't in the checkout is looked for on local and remote-tracking branches. On one unmerged branch, that branch is the start; on several, the terminal lists them and `--branch` picks. Whenever the PRD's documents are on a branch that hasn't merged into the shared branch, the screen before Start has **A branch that already exists** selected with that branch (AC-BEGIN-08), and Run Restart's preview reads the documents from its tip.

**Requirements start checks** replace the document rows of today's start checks: the PRD file exists, or the source material's named file does and is committed in the local shared branch's tip with no uncommitted change under its folder; the checkout is clean; Git, `gh` and `origin` pass as today. Agent readiness is per needed agent, as Tiers defines it, counting every planned stage row. A failure prints in the terminal and nothing opens, as today.

### Run identity (AC-BEGIN-02, AC-BEGIN-06)

The state directory's key is the start path with `/` replaced by `--`: `source-material--gift-card-balance`, `docs--initiatives--loyalty-program--points-earning` for a planned PRD (its directory name last), or today's `docs--prds--<name>`. The key, the port and the address never change. The address's last part is the start path's last part, so a run from source material stays at `/gift-card-balance` when its PRD lands in `docs/prds/gift-card-balance-lookup/`.

The record gains `origin` and an optional `prdDirectory` (§Data Models). To find the run for a path, Kiln reads the records of the repository's state directories and takes the one whose key, `origin.path` or `prdDirectory` is that path. This one lookup serves `kiln run`, every `kiln` command that takes a PRD path, and the home screen. A path that resolves to a record under another key is never given a second record.

### Branch and worktree (AC-BEGIN-06)

Start, not the first session, cuts the feature branch and worktree, through today's setup, so a failed setup is undone as today. The default name is `feature/<source folder name>`, or `feature/<planned PRD's directory name>`, editable before Start under today's name checks and fixed after. A start from source material always cuts a new branch; a PRD started by hand offers Run Restart's two choices.

## The Requirements Plan

### Reading it (AC-PLAN-02 to 05, AC-PLAN-07)

The plan is one file for the computer, `<state root>/requirements-plan.json`, holding one plan per agent (§Data Models). A plan is current while its **method fingerprint** matches: a hash of the name and bytes of every `SKILL.md` beside the entry skill in the copy that agent resolves, found by the lookup audits use for their skill. **Last updated** is the plugin registry's `lastUpdated` for a registered plugin, otherwise the newest of those files' modification times. No version is read or shown.

The fingerprint is computed when the home screen opens, when `kiln run` starts, before each requirements session launches, and on **Read again**. When no current plan exists for the agent of the Requirements stages choice, the process that noticed starts a **plan read**: one session of that agent, on the Requirements stages choice, in an empty directory under the state root, told to load the entry skill, follow the method from source material to the build, and answer with the plan block of §Interfaces. It has a 10-minute limit, no resume and no fallback. A lock file beside the plan lets one process read at a time; every Kiln watches the state root for the plan file's name, as Tiers has it watch Model defaults, and republishes when it changes.

- **Billing.** The read's launch runs the billing check. On a metered route it starts only in a PRD's Kiln, once that PRD's billing approval is given; the home screen never starts it there (AC-PLAN-03).
- **Failure.** A read that ends without a valid block, hits its limit or can't launch is saved as the latest failure with its reason and time. The screen shows it with Read again (AC-PLAN-05). Kiln doesn't retry by itself until the fingerprint changes.
- **While reading.** The snapshot carries the read's start time, and the screen states the three things that hold whatever the plan says (AC-PLAN-04).
- **A method update during a run.** A changed fingerprint found before a launch starts a read, which that launch waits for (§Design Decisions). The new plan is compared with the old by skill name: the notice lists the stages no longer in it, the new ones, and the count before and after, with when the method was updated (AC-PLAN-07). Finished rows keep their record.

### Rows (AC-PLAN-01, AC-PLAN-06, AC-STAGE-03)

The plan a PRD shows is built on every snapshot from three sources, never stored:

1. **Done rows:** each finished requirements activity that ran a stage or made a review, titled and named by its own report, with its time, commit and model. Feedback applied after a row is listed on that row (AC-TALK-04).
2. **The current row:** the running or stopped activity, named by the stage Kiln expected until its report says otherwise.
3. **Planned rows:** the plan's entries after the **cursor**. The cursor is the first entry at or after its last position whose skill is the latest report's `next`. When no entry matches, a row for `next` is inserted at the cursor. With no report yet, the cursor is at the start.

Whenever a report moves the cursor past an entry that didn't run, names a stage the plan didn't have next, or inserts a row, the snapshot carries a notice saying what changed. For a PRD started by hand, the first report's notice says which stage Kiln continues from.

Kiln adds two rows of its own, each on the review skill the plan names. **Early stakeholder review** follows the first row that reaches `prd_refined`, unless the row after it reaches `review_made` or the early review was already held. **Final stakeholder review** is last, unless the last entry reaches `review_made`. Each stop is marked on the row it follows. A Kiln row whose review was current when the stop came is done with no session. One **Build** row follows.

With no plan, the screen shows the done and current rows and the next stage from the latest report, and fills in as stages run (AC-PLAN-05).

## Stage Sessions

### The driver (AC-STAGE-01, AC-STAGE-06, AC-PLAN-08)

While the record's requirements side is open, the engine's loop runs this before it reads any phase plan. The PRD's **standing** is the milestones of the latest report, or unknown when a stage was finished by hand at Needs you since.

```
each pass, after the stop, hold, pause and wait checks every activity gets:
    the method's fingerprint changed → read the plan again; wait for it
    feedback is waiting → run a feedback session; next pass
    standing has requirements_finished:
        the review is missing or stale → run a review session; next pass
        stop at the final review                                   (never passed without the person)
    standing has prd_refined, the PRD directory holds no technical design, and the early review
            is not yet held or the person asked to stop here again:
        the review is missing or stale → run a review session; next pass
        mark the early review held; record the review as ready
        the wait is on, or the person asked to stop here again → clear that ask; stop at the early review
    run a stage session
```

Nothing in the loop, no setting and no command moves past the final review. Only §Starting the Build does (AC-STAGE-06).

### What a session is told

Each requirements session is a fresh session in the worktree (AC-STAGE-01). Its prompt is one of four files under `prompts/`, with resume and carry-on variants like every other activity's:

| Task | The prompt says |
|---|---|
| Stage | Use the entry skill to find where this work stands, then run the one next requirements stage and stop, without starting the stage after it even where a skill would hand on. Run nothing, and report, when the next step comes before the PRD is written, when the next step is the build, or when the work already stands at a milestone in the **hold list** Kiln gives: `prd_refined` with no design begun, until the early review is held, and always `requirements_finished` |
| Review | Make or refresh the stakeholder review with the method's skill for it, from the documents as they stand, and nothing else |
| Feedback | Work these messages into every requirements document that exists, as the method directs for a stakeholder's feedback, then refresh the stakeholder review if one exists (AC-TALK-04, AC-EARLY-04, AC-FINAL-03) |
| Plan read | §Reading it |

Every prompt names the work (the source material's files and commit, or the planned PRD and its initiative, or the PRD directory), the worktree and the branch. It authorizes committing on that branch, including documents a skill would otherwise leave for the person to commit, and nothing else: no push, no pull request, no other branch, no build. It says no one can answer questions, that a message arriving mid-session is the person's feedback to work in as the method directs, and that the final message must end with the report.

A stage session's expected stage, for its row and its model, is the plan's entry at the cursor or, without a plan, the latest report's `next`.

### How a stage ends (AC-STAGE-02, AC-PLAN-06)

When a requirements session ends, Kiln reads the report from its final message and runs Everything committed. The first row that fits:

| What Kiln finds | Kiln |
|---|---|
| A valid report with `finished: true`, and everything committed | Pushes the branch, records the row from the report, follows the PRD's folder (§Design Decisions), and goes round the driver |
| A valid report whose `next` is a step before the PRD draft | Needs you, naming that step for the person's own session, offering only **Reset Kiln for this PRD** |
| Anything else: no report, an invalid one, `finished: false`, or uncommitted work | Needs you, as a phase stops, with the session's last message and Everything committed as its one check |

At that Needs you, **Check again** and **Resume** first run Everything committed. When it passes, Kiln pushes and goes on; a stage finished without a report makes the standing unknown, so the next stage session finds where the PRD stands. When it doesn't pass, Resume reopens the stopped session with the reply, as for a phase (AC-STAGE-04). A reply given when the check passes becomes feedback.

A session that ran nothing has nothing to commit and still reports its standing. The usage-limit wait, the terminal closing, Pause now and the restart review need nothing new: they act on activities.

## Feedback (AC-TALK-01 to 04)

Feedback is a list on the record. Each message has an id and a state:

```
waiting → sent → read → applied
                   └→ waiting      (the stage's report says it was not worked in, or names no outcome for it)
```

- **Sending** never pauses, holds or stops anything (AC-TALK-03). The route accepts a message whenever the requirements side is open.
- **A session is running and takes live messages** (Claude Code where Message Claude works today): Kiln delivers it at once, prefixed with its id, through Message Claude's path. The existing receipt makes it `read`, with the time. The session's report gives each message it read an outcome, and `worked_in` makes it `applied` with that session's commit.
- **Otherwise** (no session, Codex, a platform without live messages, an unconfirmed delivery) it stays `waiting`, and the driver runs a feedback session before the next stage. Its report makes each message `applied`.
- **At a review**, Send feedback is the same route with the stop's own options (§The Two Reviews).

A feedback session is an activity like a stage: it can stop at Needs you, wait at a usage limit and be resumed. It runs on the Requirements stages choice.

## The Two Reviews (AC-NOTE-01, AC-NOTE-02, AC-EARLY-01 to 05, AC-FINAL-01 to 03)

**The draft note.** When a report carries `draft`, Kiln saves its statements and what the PRD leaves out, and the running screen shows them, marked as not waiting, until the early review is ready. A report without `draft` shows nothing.

**Ready.** A review is ready when the driver reaches its milestone with a current review, whether or not it then stops. Kiln records the kind, the review's file and commit and the time, and opens the review once with the platform's opener, under the rules for opening the view. The view links to it at `<base>/stakeholder-review`, which serves the file from the worktree with a content policy that allows the page's own inline script and style and no network. While a stop stands, no session runs.

**The three answers** are the same at both stops:

| Answer | Early review | Final review |
|---|---|---|
| Send feedback | A feedback session, then on to the next stage, unless **Stop here again** was ticked, which holds the early review again with what changed | A feedback session, then this stop again, with the phase plan as it now stands |
| Continue | Marks the early review held and goes on | Not offered: **Start the build** is the only way forward |
| A session of their own, then Resume | Kiln runs Everything committed, naming what to commit when it fails. When it passes and the review is now stale, a review session runs. Then as after feedback | The same |

**What changed** is the feedback session's `changes`, shown with its commit on the stop it returns to.

**The wait** is the PRD setting `waitAtEarlyReview`, on by default, set before Start and changeable until a report says `prd_refined`. When it is off, the driver still has the review made, marks the early review held and goes on (AC-EARLY-05).

## Starting the Build (AC-FINAL-04 to 06)

**Start the build** is offered only at the final review. It is one instruction that:

1. Runs today's start checks against the worktree: with phase documents, all of them; with none, that the PRD exists and the tree is clean. A failure is listed on the screen, and the button is unavailable until a reload finds them passing, as after a reset.
2. Asks today's refinement confirmation only when the PRD has reached `prd_refined` or `design_ready` and no Kiln session reported reaching that milestone itself (AC-FINAL-05).
3. Closes the requirements side and hands the execution to today's loop, with the preflight due as at Start. The plan is read, and its baseline recorded, here for the first time, so feedback that changed the phase plan before this point is never a plan change.

The screen's count of unconfirmed assumptions is today's count (AC-FINAL-04).

**A PRD with no phase plan** (SCOPE-001). When the PRD directory holds no phase documents at Start the build, the plan is one leaf, id `whole`, titled with the PRD's name, with no file and no tier, so it resolves on the Standard row and offers Change like any phase. Its session gets a prompt of its own: build the unsplit PRD with `implement-from-requirements`, commit, push the feature branch, and end with the report. Its check is three rows: the report says finished, Everything committed, Pushed. If phase documents exist when the session ends, the session split the work: Kiln reads the plan and carries on as for any split PRD, delivery audit included. Otherwise the delivery audit kind is closed for the execution, and the test audit and pull request session follow as today. At a stop, the person finishes it as they finish a phase, with Mark complete standing in for the report.

## Models (AC-MODEL-01 to 06)

Kiln Phase Model Tiers' resolver gains one step and two rows. For a requirements activity that hasn't started, first match wins:

1. Its own entry for this PRD, marked **Changed by you**. Entries are kept by skill name and its occurrence in the PRD's plan, so each row has its own.
2. The remembered choice for the skill it is expected to run, marked **Saved for every PRD** (AC-MODEL-03).
3. Its Model defaults row: **Refining the design** when the PRD is in that span, otherwise **Requirements stages**.

The **span** opens when Kiln launches a stage expected to reach `design_ready` and closes when a report includes `design_ready`. A planned row shows the Refining the design choice when its entry reaches `design_ready`. Plan reads and feedback sessions resolve at step 3 on Requirements stages. A started activity keeps what it started on, as Tiers has it, so a session that runs a different stage than expected is not relaunched.

The two rows ship as AC-MODEL-02's table gives and behave as Tiers' rows do: families, a fallback column, the same-agent refusal, and Restore. Everything else follows from a requirements session being an activity: the launch decision and the usage fallback, the `selection` stop for a choice that can't be used, needed agents, and billing per agent (AC-MODEL-06).

**A remembered choice that no longer matches** (AC-MODEL-04). When the plan for the reading agent names no stage that runs a remembered skill, the snapshot marks that choice unmatched. A row that the latest plan change introduced carries the note that a saved choice no longer applies, naming the skill. The choice stays in the file and applies again if the skill returns.

## The Home Screen

### Process (AC-HOME-01, AC-HOME-05, AC-HOME-08, AC-HOME-09)

`kiln new`, or `kiln` with no arguments, starts a home process for a **scope**: the repository the command was run in, found from any folder inside it, or, outside a repository, the folder itself with the repositories directly inside it. The process has no engine. It takes a port from the registry and an instance lock, keyed by a state directory for the scope, and serves the same built view at `http://127.0.0.1:<port>/home` under today's local security, with a token of its own. A second `kiln` for the same scope opens the first one's address and exits.

**Opening an item.** Every button on a line posts `POST /api/home/open` for its item. The home server makes sure that item's Kiln is running and answers with its address, which the page opens in a new tab. When the item's instance lock has a live holder, that is all. Otherwise the home process starts `kiln run <start path>` as a child, with the browser not opened, and waits for the child's lock to name a port. The child is an ordinary Kiln: its own lock, port, record and engine. Its terminal lines print in the home's terminal, prefixed with its title. The home screen itself never starts a session or changes a run (AC-HOME-05). A PRD another terminal's Kiln is running opens there and can't be started twice, because the lock decides.

### What it lists (AC-HOME-02 to 04, AC-HOME-10 to 13)

One scan function per repository returns its items; the home screen merges repositories into one list. It reads:

- **Kiln's records** for the repository, through the bounded, ownership-checked reads `kiln status` uses.
- **The checkout and its worktrees**, for files not yet committed: source material folders, `received/`, and the PRD refinement's state file, which is never committed.
- **Git**, for every local branch and every remote-tracking branch of `origin`: the folders under `source-material/`, `docs/prds/`, `docs/changes/` and `docs/initiatives/`, each PRD directory's file names, phase documents' `**Closed:**` and `**Repositories:**` lines, and the latest commit date. Reads are cached by the ref's commit.

Items are placed by AC-HOME-13's table, first row that fits. The rules the table leaves to the design:

- **Which copy of a PRD is read:** its run's worktree when Kiln has a record; otherwise the unmerged branch that holds it, the one with the newest commit when several do; otherwise the shared branch.
- **The stage a line shows:** from the record when there is one (the current stage, a review and since when, the build's count of phases). Otherwise from which documents exist, in the words of AC-HOME-04. A line is **started by hand** when no record exists.
- **A line's state** is its Kiln's, read as `kiln status` reads it: working, waiting for the person, paused, not running, or, when a live Kiln doesn't answer, its address and that its state could not be read.
- **Order:** Under way first, lines waiting for the person on top (a review, Needs you), then by latest change.
- **Several repositories:** a PRD's other repositories come from its record or its phase documents' `**Repositories:**` lines (AC-HOME-10). Filters and the repositories with nothing found are computed in the view from the one list.

### Staying current (AC-HOME-07)

The page holds one event stream to the home server. The server sends the list on connect and after every scan the fingerprint triggers (§Design Decisions). The plan read the home screen may start (§Reading it) is the only session it ever launches.

The panel's prompt and its copy (AC-HOME-06, AC-HOME-11) are view text, with the shared branch's name filled in.

## Interfaces

### The report

The last fenced block in a session's final message whose info string is `kiln-report`:

```json
{
  "kilnReport": 1,
  "ran": [ { "skill": "autonomous-prd-refinement", "title": "Refine the PRD" } ],
  "finished": true,
  "next": { "kind": "requirements", "skill": "technical-design-writing-standards",
            "title": "Technical design", "reaches": [] },
  "milestones": [ { "name": "prd_refined", "by": "this_session" } ],
  "prdDirectory": "docs/prds/gift-card-balance-lookup",
  "messages": [ { "id": "m-3", "outcome": "worked_in" } ],
  "draft": { "statements": ["…"], "leftOut": ["…"] },
  "changes": ["…"]
}
```

- `ran` is empty when the session ran nothing. `next.kind` is `requirements`, `before_prd` or `build`; `skill` and `title` are the method's own words. `reaches` and `milestones[].name` use only the four milestones; `by` is `this_session` or `earlier`.
- `prdDirectory` is required once a PRD exists. `messages` lists every message the session read, with `worked_in` or `not_worked_in`. `draft` comes from the session that drafted the PRD, `changes` from one that applied feedback.
- A block that doesn't parse, has another `kilnReport`, names an unknown milestone or leaves out `ran`, `finished`, `next` or `milestones` is no report. Unknown fields are ignored. The whole-PRD build's report uses `ran` and `finished` only.

The plan read's block, info string `kiln-plan`:

```json
{ "kilnPlan": 1,
  "stages": [ { "skill": "prd-writing-standards", "title": "Write the PRD", "reaches": [] } ],
  "reviewSkill": { "skill": "stakeholder-review-package", "title": "Stakeholder review" } }
```

### HTTP (same-origin, token, as today)

| Route | Contract |
|---|---|
| `POST /api/feedback` | `{ text, stopAgain? }`. Journaled. 409 once the build has started or before Start. `stopAgain` is accepted only at the early review |
| `POST /api/review/continue` | Journaled. 409 unless the run is at the early review |
| `POST /api/build/start` | `{ refinementConfirmed? }`. Journaled. 409 unless the run is at the final review; 409 with the failures when the start checks fail; 400 when the confirmation is needed and absent |
| `POST /api/requirements-plan/read` | Starts a plan read. 409 while one runs, or while billing approval is needed and not given |
| `POST /api/settings` | Gains `waitAtEarlyReview`. 409 once a report says `prd_refined` |
| `POST /api/model` | `target` gains `{ stage: <row key> }`, and `remember?: true` saves the choice for the row's skill in Model defaults. Refusals as for a phase |
| `GET`, `POST /api/model-defaults` | Rows gain `requirements` and `refining_design`. The body gains `skills[]`; `POST` gains `{ remember: { skill, choice } }` and `{ forget: { skill } }` |
| `GET <base>/stakeholder-review` | The review file from the worktree, 404 when there is none |
| `POST /api/resume`, `POST /api/check-again` | Unchanged routes; at a review stop they follow §The Two Reviews |

The home server's routes: `GET /home` and the view's assets; `GET /api/home/events`, a stream of the home list; `POST /api/home/open`, `{ item }`, which answers `{ address }`, or 502 with why the Kiln couldn't be started; `POST /api/requirements-plan/read`.

### Snapshot

```
feature.state     gains "early_review" and "final_review"
requirements?:    present while the record has a requirements side
  origin:         { kind, title, files[], commit, committedAt }                what Kiln found (AC-BEGIN-07)
  standsAt?:      string                                                        where the documents stand, for a PRD started by hand
  plan:           { status: "reading" | "read" | "failed" | "none", agent, methodUpdatedAt?, readAt?,
                    readingSince?, failure?: { reason, at }, canReadAgain }
  rows[]:         { key, id, title, skill?, state: "done" | "running" | "needs_you" | "waiting" | "next" | "planned",
                    addedByKiln?: "early" | "final", stop?: "early" | "final", noSession?: true,
                    reaches[], timing?, pushedSha?, activityId?, feedback[]: { sentAt, appliedAt?, commit? },
                    savedChoiceUnmatched?: { skill }, model }                   model: as Tiers gives every activity,
                                                                                with from: "model_defaults" | "saved" | "changed"
  notice?:        { at, methodUpdatedAt?, changes: string[] }
  draftNote?:     { statements[], leftOut[] }
  review?:        { kind: "early" | "final", file, readySince, refreshedAt?, whatChanged?: { items[], commit },
                    openAssumptions, resumeCommand? }
  feedback[]:     { id, text, at, state, readAt?, appliedCommit? }
  build?:         { refinementConfirmation: "needed" | "not_needed", checksFailed?: string[], whole?: true }
settings          gains waitAtEarlyReview: { value, canChange }
```

`phases[]`, `activities[]` and the Tiers additions are unchanged. At the final review, `phases[]` and `documents` are filled from the worktree as Documents found fills them today. The `whole` leaf appears in `phases[]` with `tier.value: "not_rated"`.

The home list: `{ scope: { kind, name, sharedBranch?, repositories[] }, plan, underWay[], ready[], notReady[], folded[] }`, each item `{ id, repository, title, path, kind?, line, state?, address?, startedByHand?, alsoChanges[], buildWaitsFor?, lastChanged? }`.

### Command line (AC-STAGE-05, AC-MODEL-05, AC-HOME-01)

```
kiln                                        the home screen for the current scope
kiln new                                    the same
kiln feedback <path> (--text <text> | --file <file>) [--stop-again]
kiln continue <path>                        at the early review, continues to the next stage (today's command)
kiln start-build <path> [--refinement-confirmed]
kiln settings <path> --wait-at-early-review <on|off>
kiln model <path> --stage <row key or id> (… | --use-default) [--remember]
kiln model-defaults set --row <requirements|refining-design> …
kiln model-defaults remember --skill <name> --agent <id> --model <family or model> [--effort <value>]
kiln model-defaults forget --skill <name>
```

`<path>` is anything `kiln run` accepts. `feedback`, `start-build` and `--stage` are changing commands: they take the command ID and status token, need a live Kiln, are announced in `features`, and are refused with the route's reason. Because `start-build` is refused anywhere but the final review, and a status token from before the stop doesn't match, no command given earlier can start the build (AC-STAGE-06). `remember` and `forget` are `computer_setting` commands like the rest of `kiln model-defaults`.

`kiln status <path>` gains `requirements`: the rows with their models, the review the run waits at and since when, the feedback list and the build's confirmation need. `state` takes `early_review` and `final_review`, and the inventory counts them with the work waiting for the person. Every new command has an entry in `prompts/kiln-command-contracts.json`: `new` under the start group, the rest under the groups their neighbours are in.

## Data Models

**PRD record**, the next schema version after Kiln Phase Model Tiers' migration. `prdDirectory` becomes optional. New fields, all absent on a run with no requirements side, so the migration adds nothing to existing records:

```
origin?:        { kind: "brief" | "intake" | "planned_prd" | "prd", path, initiative?: { path, row },
                  commit?, title }
requirements?:
  phase:        "stages" | "early_review" | "final_review" | "closed"
  earlyReviewHeld: boolean,  stopAgain?: true
  standing?:    { milestones: [ { name, by } ], next?, at }        absent when unknown
  designSpan:   boolean
  cursor:       number,  planFingerprint?: string
  stages:       [ { activityId, task: "stage" | "review" | "feedback", ran[], reaches[], report? } ]
  draftNote?, review?, notice?                                       as the snapshot shows them
  feedback:     [ { id, text, at, state, sessionId?, readAt?, appliedCommit? } ]
  reachedByKiln: string[]                                            milestones a Kiln session reported reaching itself
settings.waitAtEarlyReview: boolean
settings.modelChoices.stages: { [skill#occurrence]: ModelChoice | "default" }
```

Activities gain the kind `requirements`, with keys `req-<id>`; session records gain the same kind. A reset removes the requirements side with the rest of the PRD's state.

**Requirements plan file**, `<state root>/requirements-plan.json`, owner-only and written atomically:

```
{ schemaVersion: 1,
  plans: { [agentId]: { fingerprint, methodUpdatedAt, readAt, stages[], reviewSkill, previous?: { stages[] } } },
  reading?: { agentId, startedAt, pid, processStartTime },
  lastFailure?: { agentId, fingerprint, reason, at } }
```

A plan-read session's output is kept under `<state root>/requirements-plan/<session id>/`, in the files every session keeps.

**Model defaults file** gains the rows `requirements` and `refining_design` and `skills: { [skillName]: FamilyChoice | ModelChoice }`. Its schema version stays 1 when this ships with Tiers' first release of the file, and becomes 2 otherwise, since an older Kiln must refuse a file it would half-read.

**Home state**, `<state root>/home/<8-character hash of the scope's path>/`: the instance lock and the token. Nothing else is saved; the list is always scanned.

## Changes to Earlier Designs

Each line is added to the earlier section, as `Superseded in part by:`, in the commit that builds the change.

- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Command line (`kiln run` accepts source material, a planned PRD and a PRD with no phase documents; `kiln` alone opens the home screen), §Where a Feature Stands (a run with a requirements side runs the requirements driver before any plan is read), §Ports and one Kiln per PRD (the address's last part is the start path's, and the home screen takes a port), §Kiln's State on Disk (the key is the start path; `prdDirectory` is optional), §Worktree and Branch Setup (a start with no phase plan cuts from the local shared branch's tip), §The Done Check (a requirements session's check and Kiln's own push; the whole-PRD build's check).
- Replaces in part: `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-technical-design.md`, §Resolving a Choice (requirements activities, the remembered-choice step and two rows), §Model defaults file, §HTTP and §Command line (the rows, `skills`, `--stage`, `remember` and `forget`).
- Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`, §The starting point (an unmerged branch holding the PRD's documents is selected first).
- Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision (a PRD built from a plan of the one `whole` leaf gets no delivery audit).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`feedback`, `start-build`, `new`; `kiln` with no arguments), §Outstanding-work inventory (runs keyed by a start path; the two review states).
- Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Uncertainty recovery (feedback to a requirements session takes no hold when its delivery is uncertain).

## Integration Points

- Launches Claude Code and Codex sessions through the existing adapters, each told to use the installed Enso Method's entry skill.
- Reads the installed method's files only to fingerprint them and date them.
- Reads Git in each listed repository, and never fetches for the home screen. Pushes the feature branch after a requirements session.
- Reads the files §What Kiln Knows About the Method lists, which the Enso Method's skills write.

## Delivery

- **Before the build:**
  - The Enso Method names where a plain brief lives under `source-material/`, which this design takes to be `source-material/{name}/{name}-brief.md`. The method's maintainer proposes and lands it there as a change of its own. Kiln looks for that name whichever copy of the method is installed.
  - Kiln Phase Model Tiers is built and merged to `develop`, and `develop` is merged into this branch. This design extends its resolver, start line, launch decision and Model defaults, none of which exists in the code yet.
  - Claude Code and Codex both installed and signed in on the build computer, each with the Enso Method installed, provided by whoever starts the build.
- **Expected build spend:** about $60 of agent usage. It covers real sessions on a small fixture repository with a brief of a few paragraphs: a plan read on each agent (AC-PLAN-02, AC-PLAN-03); a stage session that drafts a small PRD and reports, and one continuing a PRD started by hand (AC-PLAN-06, AC-BEGIN-04, AC-NOTE-01); a review session and a feedback session, with one message delivered live (AC-PLAN-08, AC-TALK-01, AC-TALK-04); and one whole-PRD build of a trivial change through its test audit (AC-FINAL-06). The refinements run for hours on real work, so their stages are proved by the same session path on the small PRD, not at full length.
- **After the build:** once the PRD's audits have closed and its pull request has merged, add the changelog entry under Unreleased (Added: starting from source material, the requirements stages, the two reviews, feedback at any time, the home screen; Changed: `kiln` with no arguments opens the home screen), then release as a minor version: saved records load unchanged and no command is removed. The other three method changes the PRD names are proposed to the method on their own, and nothing here waits for them.

## Criteria Coverage

| Criteria | Covered by |
|---|---|
| AC-BEGIN-01 to 05, AC-BEGIN-08 | §What `kiln run` accepts |
| AC-BEGIN-06 | §Run identity; §Branch and worktree; the folder decisions in §Design Decisions |
| AC-BEGIN-07 | `requirements.origin` in §Snapshot |
| AC-PLAN-01, AC-STAGE-03 | §Rows |
| AC-PLAN-02 | §What Kiln Knows About the Method; the entry-skill decision |
| AC-PLAN-03, 04, 05, 07 | §Reading it |
| AC-PLAN-06 | §What a session is told; §The report; §Rows |
| AC-PLAN-08 | §The driver; the stale-review decision |
| AC-STAGE-01, 02, 04 | §Stage Sessions; §Existing Code (reused) |
| AC-STAGE-05 | §Command line |
| AC-STAGE-06 | §The driver; §Starting the Build; `start-build` in §Command line |
| AC-NOTE-01, 02 | §The Two Reviews, the draft note |
| AC-TALK-01 to 04 | §Feedback |
| AC-EARLY-01 to 05, AC-FINAL-01 to 03 | §The Two Reviews |
| AC-FINAL-04, 05, 06 | §Starting the Build |
| AC-MODEL-01 to 06 | §Models; the Model defaults and `kiln model` changes in §Interfaces |
| AC-HOME-01, 05, 08, 09 | §Process |
| AC-HOME-02, 03, 04, 10, 12, 13 | §What it lists |
| AC-HOME-06, 11 | §Staying current, the panel |
| AC-HOME-07 | §Staying current |
| AC-GUIDE-01 | The README's sections on starting, how Kiln works and choosing models, and the first paragraph of this repository's agent instructions |

## Open Questions

1. **SCOPE-001 is open.** If the answer is that the person builds such a PRD themselves, §Starting the Build loses its last paragraph, the `whole` leaf and the completion-audits change, and the final review of a PRD with no phase documents ends with a prompt to paste.
2. **HOME-004 is open.** Either other answer changes only the scan's placement of folders that hold neither a brief nor an intake record.
3. **AC-FINAL-06 needs a `Replaces in part:` line** for AC-AUDIT-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (a PRD built in one session with no phase plan gets no delivery audit). The PRD carries none, and the design refinement adds it.
4. **The brief's file name** is this design's reading of a method change not yet made. If the method sets another name, one constant changes.
5. **Kiln Phase Model Tiers is designed and not built.** This design assumes its contracts as its refined design states them: activities resolved by one resolver, the start line, the launch decision, the Model defaults file and page, and `kiln model`. Its open questions DEF-001 and DEF-002 decide the two new rows' fallback values and nothing else here.
6. **The method's test audit after an unsplit build.** The method says a test audit can be pointed at an unsplit PRD and does not say one follows by default. AC-FINAL-06 has Kiln finish such a PRD as it finishes a split one, so Kiln runs it. Whether the method should say so is for the method.
