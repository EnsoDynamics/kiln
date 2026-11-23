# Technical Design: Kiln Requirements Stages

**PRD:** [Kiln Requirements Stages](kiln-requirements-stages-prd.md) · **Decisions:** [assumptions](kiln-requirements-stages-assumptions.md) · **Design references:** the fifteen mockups the PRD links

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
| How a session reports | A fenced block in its final message, in the form §The report gives, read from the run's recorded result | The preflight already reads its verdict from the final message, for both agents. A report file would be an uncommitted change in the worktree, which AC-STAGE-02 forbids, or a Kiln file committed beside requirements documents the method owns. An audit's submit round-trip exists so Kiln can refuse a report against its signed-off evidence; a requirements report has no evidence to check against, so a report that doesn't read is a Needs you like any unfinished stage |
| The one method name Kiln holds for requirements | The entry skill, `using-the-enso-method`, named in the prompts | AC-PLAN-02 rules out a list of stages. The entry skill is the method's front door, and every other name comes from it at run time. A rename of it is the occasional break the PRD accepts |
| Who pushes after a requirements session | Kiln, with a plain push of the feature branch, after Everything committed passes | The requirements skills never push by default, and a person who finishes a stage by hand only commits (AC-STAGE-02). One rule covers both. A push Git rejects stops at Needs you on the Pushed check; Kiln never forces |
| How a run is kept before the PRD's folder exists (BEGIN-001) | Under the key of what `kiln run` was pointed at, for the life of the run. The record names the PRD directory once it exists, and Kiln finds a run for a path by reading the repository's records | The method doesn't promise the PRD folder shares the source folder's name, and AC-BEGIN-06 keeps the run through a rename. Moving a state directory would move its port, address and token |
| The title before the draft (BEGIN-001) | The first heading of the brief or intake record, without a leading "Brief:" or "Requirements intake:" label; the folder's name in words when it has none. A planned PRD: the initiative's title, a colon, the row's name | AC-HOME-02 asks for a name from the source material itself, and the mockups draw a title, not a folder name |
| Finding the PRD's folder after the draft | The directory the drafting session's report names, accepted only when the feature branch holds a `<folder>-prd.md` there that the base commit doesn't. Later, when that file is gone, Kiln follows the rename Git's rename detection reports for it between the last commit that held it and the branch tip, and Git's answer stands: a report that disagrees is ignored for that field. Only when the file is gone and Git finds no rename does a report's directory count, under the draft's rule; with none, the stage stops (§How a stage ends) | Git settles it, so a wrong report can't point the run at another PRD. Kiln reads history with `--no-renames` everywhere today, so this one read turns rename detection on; a rename Git can't detect (the PRD rewritten as well as moved) leaves the report's directory to be accepted by the draft's rule, a new `<folder>-prd.md` the base commit doesn't hold |
| What source material counts as "written from" (HOME-003) | Kiln's records in the repository (§What it lists, Kiln started a PRD from it), then a PRD or initiative folder of the same name on any local branch or any remote-tracking branch of `origin`, as last fetched. The home screen never fetches. A planned PRD's list is read from the shared branch only | A PRD written on another computer hides its source material after the next fetch, with no network call from a page that must open fast. A planned PRD renamed on an unmerged branch is not yet the initiative's word |
| Where the feature branch is cut from, for a start with no phase plan | The local shared branch's tip, when it holds origin's tip. When it doesn't, Start is unavailable and says to bring the shared branch up to date | The home screen's prompt has the person's session commit source material on the shared branch and stop, so the material is often not pushed. The method cuts a PRD's branch the same way when the commits it needs are only local |
| When a stakeholder review is stale | Its file has no commit, or a later commit on the branch changes or removes a file the PRD directory held at the review's latest commit, the newest commit on the branch that changes the review's file | Git alone decides, so a person's own session is judged the same way as Kiln's. New files don't count, so a phase plan that only adds phase documents starts no session (AC-PLAN-08), while one that rewrites a criterion does |
| Uncertain delivery of feedback | A message whose delivery to the running session settles as uncertain goes back to waiting and takes no hold | AC-TALK-03: feedback never stops the run. Message Claude's delivery-recovery hold stays for the build |
| A method update at a stage boundary | Kiln reads the plan again and waits for it, up to the read's time limit, before launching the next stage | The stage's model comes from what the plan expects next (AC-MODEL-02), and the report in hand came from a session on the old copy. A minute's wait before a stage that runs for hours costs nothing. At Start nothing waits (AC-PLAN-05) |
| How the home screen opens a PRD (HOME-002) | It starts `kiln run` for that PRD as a child process of its own terminal, and the page opens the PRD's address in a new tab. Ctrl+C in that terminal stops the home screen and every Kiln it started, each as its own Ctrl+C would | Kiln has no background service. A Kiln with no terminal has nothing that ends it, and a build nobody can find is worse than a terminal that must stay open, which the README already asks for |
| Keeping the home list current (HOME-002) | The home process reads a cheap fingerprint every 5 seconds (each repository's refs and the status of the folders it lists, the state root's records, each running Kiln's status) and scans again only when it changes | Nothing in Kiln watches files today, and Git's refs are the one place a commit on any branch shows. A scan on every tick would spend Git calls on an idle page |
| The build of a PRD with no phase plan (SCOPE-001) | A plan of one leaf with no file, run through the phase path, judged by a report plus the two Git checks, with no delivery audit allocated | AC-FINAL-06 needs a second way of building. One synthetic leaf keeps every screen, stop, model rule and record that reads phases working, so the second way is one prompt and one check |
| How the one-session build is judged done | Its report says finished, Everything committed, and Pushed | The PRD has no phase document, so no Closed line exists, and the method marks an unsplit build only by its commit's wording, which Kiln doesn't read. Committed and Pushed alone would pass a session that did nothing, since Kiln pushes after every requirements stage. Beaten: the session committing its report as a file, as an audit commits its own. That would keep a crash after a clean finish Done, as v1's AC-DONE-02 has it, at the cost of a second Kiln file beside the method's documents for a narrow window, after the push and before the final message. That case is a Needs you that Mark complete clears |
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

A planned PRD's **start path** is `docs/initiatives/<name>/<directory name>`. No such folder exists; `kiln run` accepts that path as the same thing as `--prd`, and the home screen passes it as `<start path>`.

Kiln resolves the path, finds the run (§Run identity), and takes the first row that fits:

| The path is | Kiln |
|---|---|
| Anything with a started run of its own, unfinished or finished | Opens that run, as today. A record never started, or reset, is not a run: the rows below place the path, and the screen before Start reuses that record |
| A PRD directory holding phase documents | Today's start checks and Documents found. No requirements side exists for this run (AC-BEGIN-05) |
| A PRD directory with no phase documents | The requirements start checks, then the screen before Start in its requirements form, headed by where the documents stand (AC-BEGIN-04) |
| Source material, or a planned PRD, that fits AC-HOME-13's Ready to start row | The requirements start checks, then the screen before Start with What Kiln found (AC-BEGIN-07) |
| Source material or a planned PRD something was written from | Opens the run when Kiln started the PRD; otherwise prints which PRD or initiative was written from it, and exits |
| Anything else under `source-material/` or `docs/initiatives/` | Prints which document is missing, or what to commit (AC-BEGIN-03), and exits; an initiative named without `--prd` lists its planned PRDs instead |

A PRD directory that isn't in the checkout is looked for on the branches that **hold** it. On one, that branch is the start; on several, the terminal lists them and `--branch` picks. For a directory that is in the checkout, the screen before Start has **A branch that already exists** selected with the branch that holds it, the newest when several do (AC-BEGIN-08), and Run Restart's preview reads the documents from its tip. A branch selected this way may still be unavailable, its local copy behind origin's say, and shows its reason as Run Restart allows.

**A branch holds a PRD directory** when all three are true at its tip: the directory exists there; the branch has a commit changing it that the shared branch lacks; and its content there differs from the shared branch's, so a branch merged by squash doesn't hold it. The shared branch here is each of the local shared branch and origin's copy as last fetched, as the paragraph's last sentence says. The branches tested are every local branch and every branch of `origin` as last fetched, `origin/HEAD` aside; Kiln never fetches and never asks the remote for its branches; a remote-tracking ref's commits are already local, so a branch known only as `refs/remotes/origin/<name>` is tested and read like any other. A local branch and origin's copy of it are one name, which holds the PRD when either copy does; the copy read is the local one when it exists, otherwise origin's. Never a candidate: the shared branch, a branch another Kiln run started, and `prd/<name>` where `<name>` is another PRD's directory. "Newest" is the tip with the latest commit date. A hand-made branch that amends another PRD's documents, neither Kiln-started nor named `prd/`, can still be preselected for that PRD; it is a default the person changes. Both tests are made against the local shared branch as well as origin's copy: a branch holds the directory only when neither copy has its commit changing it and its content differs from both, so a branch cut from a local shared branch that already holds the PRD unpushed doesn't hold it.

**Requirements start checks** replace the document rows of today's start checks: the PRD file is committed at the start commit with no uncommitted change under its directory, or the source material's named file is committed in the local shared branch's tip with no uncommitted change under its folder; the checkout is clean; Git, `gh` and `origin` pass as today. The new record's base is the shared branch as `kiln run` reads it from origin when the record is made, and that read is the authority: the home screen's read without a fetch (§What it lists) can differ from it only while the remote-tracking refs are stale. Agent readiness is per needed agent, as Tiers defines it, counting every planned stage row and, when the standing will be unknown (§Rows), its Next stage row, though the first session may pass some planned rows by; Start's reason names each row that needs an agent that isn't ready, and a choice on that row clears it. With no plan, being read or failed, the needed agents are the first choices of the Requirements stages and Refining the design rows, and their fallback choices warn as Tiers' fallback-only agents do. A choice that applies only to a stage a plan or report would name, a remembered one say, is checked at that stage's launch and stops it there, as Tiers has for a choice found unusable at launch. A failure prints in the terminal and nothing opens, as today.

**A method run part-way through** (AC-BEGIN-04). Kiln looks in the PRD's directory in every worktree `git worktree list` shows, the checkout included, for three files: `{folder}-prd-refinement-state.md` whenever present, since it is never committed, and `{folder}-design-refinement-state.md` and `{folder}-pending-feedback-changes.md` when untracked or modified. Each one found fails the start with one line, which for that PRD directory replaces today's uncommitted-changes line and the adopted worktree's line: the PRD refinement is part-way through in <worktree> with its work not committed, so resume it there and let it finish or tell it to stop, which commits what it has; the design refinement has work since its last checkpoint in <worktree>, so resume it there to its next checkpoint or its end; stakeholder feedback is part-way through being applied in <worktree>, so finish that round there and commit it. Then start again. Kiln never copies, commits, moves or deletes these files. A committed design refinement state file or pending-feedback file with no change since doesn't fail the start: the first session resumes it as the method directs (AC-PLAN-06). Review and continue gets the same line as `POST /api/home/open`'s 502 reason.

### Run identity (AC-BEGIN-02, AC-BEGIN-06)

The state directory's key is the start path with `/` replaced by `--`: `source-material--gift-card-balance`, `docs--initiatives--loyalty-program--points-earning` for a planned PRD (its directory name last), or today's `docs--prds--<name>`. The key, the port and the address never change. The address's last part is the start path's last part, so a run from source material stays at `/gift-card-balance` when its PRD lands in `docs/prds/gift-card-balance-lookup/`.

The record gains `origin` and an optional `prdDirectory` (§Data Models). A reset keeps both in the fresh record it writes, as it keeps the record's key and token: they say which work the run is, not how far it got (Run Restart AC-RESET-03). `origin.commit` and `origin.title` are read again at the next Start. Once `prdDirectory` is set, the source material stays written from (AC-HOME-13) and the reset run starts as a PRD on a branch that hasn't merged (AC-BEGIN-08). A reset record with no `prdDirectory`, reset at a step before the PRD draft (§How a stage ends), names nothing written from its material: the material goes back under Ready to start, and its next Start reuses the record. Reset leaves the branch and worktree Kiln cut (AC-RESET-05), so that Start's default branch name is taken and today's name check asks for another. With `prdDirectory` optional, the reset's fresh record and the default workspace folder take their folder name from the start path. To find the run for a path, Kiln reads the records of the repository's state directories and takes the one whose key, `origin.path` or `prdDirectory` is that path. This one lookup serves `kiln run`, every `kiln` command that takes a PRD path, and the home screen. A path that resolves to a record under another key is never given a second record.

### Branch and worktree (AC-BEGIN-06)

Start, not the first session, cuts the feature branch and worktree, through today's setup, so a failed setup is undone as today. The default name is `feature/<source folder name>`, or `feature/<planned PRD's directory name>`, editable before Start under today's name checks and fixed after. A start from source material always cuts a new branch; a PRD started by hand offers Run Restart's two choices. A new branch, for either start, is cut from the local shared branch's tip, so work committed there and not yet pushed is in the worktree.

## The Requirements Plan

### Reading it (AC-PLAN-02 to 05, AC-PLAN-07)

The plan is one file for the computer, `<state root>/requirements-plan.json`, holding plans by agent and method fingerprint (§Data Models). A plan is current while its **method fingerprint** matches: a hash of the name and bytes of every `<skill>/SKILL.md` in the **method folder**: the skills folder the entry skill's `SKILL.md` resolves into once symlinks are followed, in the copy that agent resolves for the repository. The lookup audits use for their skill finds that file, run in the repository's checkout so a copy installed for that project only is the one found; a plugin gives the plugin's skills folder, and a loose skill linked from the method's own repository gives that repository's. A method copied, not linked, into a shared loose folder shares it with other skills, so editing one of them costs one extra plan read; Kiln holds no list of method skills to tell them apart. **Last updated** is the plugin registry's `lastUpdated` when the copy found is the registry's install path, otherwise the newest of those files' modification times: a plugin loaded from a local directory is read from that directory while its registry entry keeps the date it was installed. No version is read or shown.

The fingerprint is computed when the home screen opens (for each repository it lists), when `kiln run` starts, before each requirements session launches, and on **Read again**. When no plan exists for the agent of the Requirements stages choice and that fingerprint, the process that noticed starts a **plan read**: one session of that agent, on the Requirements stages choice, in an empty directory under the state root. Its prompt gives the path of the entry skill's `SKILL.md` in the copy the fingerprint covers, as an audit's prompt pins its skill's path, and tells it to read the method from that folder only and follow it from source material to the build, listing the stages from writing the PRD onward and leaving out every step before it (AC-PLAN-06), and answer with the plan block of §Interfaces. It has a 10-minute limit, no resume and no fallback. It needs no Git repository. Claude Code launches as every session does, which already allows reads outside the directory. For Codex, the launch preparation is given the plan directory as its launch directory and only writable root, with no assigned repositories, and the check that the build skills are enabled for the launch directory is replaced, for a plan read, by the fingerprint's own resolution of the entry skill in the repository's checkout. No done check, Stayed in the workspace or Git evidence runs on a plan read: its only result is the `kiln-plan` block. A lock file beside the plan, created exclusively, lets one process read at a time, and the plan file's `reading` records who holds it, so a dead holder is detected; every Kiln watches the state root for the plan file's name, as Tiers has it watch Model defaults, and republishes when it changes.

- **Billing.** The read's launch runs the billing check. On a metered route it starts only in a PRD's Kiln, once that PRD's billing approval is given; the home screen never starts it there (AC-PLAN-03).
- **Failure.** A read that ends without a valid block, hits its limit or can't launch is saved as the latest failure for its agent and fingerprint, with its reason and time. The screen shows it with Read again (AC-PLAN-05). Kiln doesn't retry by itself until the fingerprint changes, and the driver doesn't wait on a fingerprint whose read failed: it goes on without a new plan, and the PRD keeps showing the plan it last showed, with the failure.
- **While reading.** The snapshot carries the read's start time, and the screen states the three things that hold whatever the plan says (AC-PLAN-04).
- **A method update during a run.** A changed fingerprint found before a launch starts a read, which that launch waits for (§Design Decisions). The new plan is compared by skill name with the plan this PRD last showed, the one its `planFingerprint` names: the notice lists the stages no longer in it, the new ones, and the count before and after, with when the method was updated (AC-PLAN-07). Finished rows keep their record. A PRD replaces its plan only between sessions: while a requirements session runs, the PRD shows the plan `planFingerprint` names, so that session's report sets the cursor (§Rows) against the plan it launched on. A PRD that shows no plan takes one as soon as it is read.

### Rows (AC-PLAN-01, AC-PLAN-06, AC-STAGE-03)

The plan a PRD shows is built on every snapshot from three sources, never stored:

1. **Done rows:** each finished requirements activity that ran a stage or made a review, titled and named by its own report, with its time, commit and model. Feedback applied after a row is listed on that row (AC-TALK-04), or on the latest done row when the session before it ran nothing. An activity whose `ran` lists several skills is one row, titled from the first, with the others named on it, and the notice about passing an entry that didn't run checks every `ran` skill.
2. **The current row:** the running or stopped activity, named by the stage Kiln expected until its report says otherwise.
3. **Planned rows:** the plan's entries from the **cursor** on, less the one the current row already shows; at a stop the entry at the cursor is the `next` row. The cursor is the first entry at or after its last position whose skill is the standing's `next` (§The driver), so a review session's report never moves it. When no entry matches, a row for `next` is inserted at the cursor. The cursor moves only when a stage or feedback report sets the standing, or the plan changes. A report whose `next` reaches `review_made`, at a standing the driver stops at (§How a stage ends), names that stop's review, not a stage. When the entry right after the one that reached the stop reaches `review_made`, that entry becomes the stop's review row in place of Kiln's, with the stop's mark, and the cursor goes past it with nothing inserted and no notice; a later entry of the same skill is never taken, since a method can place its review elsewhere for another PRD. Otherwise Kiln's own row stays the stop's review row, nothing is inserted, and the cursor moves to the entry after the one that reached the stop. "The one that reached the stop" is the plan entry the reporting session ran; when it ran nothing, or nothing in the plan, the stop keeps Kiln's row and the next stage session runs as the `kiln:next` row. That row is done by the stop's review session, or with no session when the review was current; with no plan, no next row is shown and the next stage session runs as the `kiln:next` row. With no stage or feedback report yet, the cursor is at the start.

**When the plan changes**, the cursor moves to the new plan's entry with the key of the row at the cursor. When the new plan has no entry with that key, it moves to the entry after the latest entry before the old cursor whose key the new plan holds, or to the start when none does or the old plan is gone. A row Kiln inserts, and the next row shown with no plan, takes the lowest `<skill>#<n>` that neither the plan nor this PRD's recorded stages use. A per-PRD choice whose key leaves the plan is kept and applies again only to a row with that key.

**While the standing is unknown**, from Start until the first report whenever the record names a `prdDirectory` at Start (a PRD started by hand, or a run reset after its draft), and after a stage finished by hand at Needs you, the files can't tell Kiln which entry is reached (AC-HOME-04) and Kiln holds no list of stages (AC-PLAN-02), so the next session has no expected stage. Its row is Kiln's **Next stage** row, key `kiln:next`, ahead of the planned rows. Before Start, when the standing will be unknown, the plan is headed by `standsAt`, with a line saying the first session finds where the PRD stands and runs its next stage and that the rows before it drop away when it reports; every plan entry follows as a planned row, from the first, each with Change. The next report sets the cursor, counted from its last position (from the start when it has been unknown since Start), and its notice says which stage Kiln continues from. Kiln never marks an entry done from the files. With neither a plan nor a report, the first session also runs as the `kiln:next` row; when a plan arrives while it runs, its entries show as planned from the first until the report sets the cursor.

Whenever a report moves the cursor past an entry that didn't run, names a stage the plan didn't have next, or inserts a row, the snapshot carries a notice saying what changed.

Kiln adds two rows of its own, each on the review skill the plan names. **Early stakeholder review** follows the first row that reaches `prd_refined`, or, when no plan entry does, the done row whose report first gave `prd_refined`, unless the row after it reaches `review_made` or the early review was already held. **Final stakeholder review** is last, unless the row after the first row that reaches `requirements_finished` reaches `review_made`. Each stop is marked on the row it follows. A Kiln row whose review was current when the stop came is done with no session. One **Build** row follows.

With no plan, the screen shows the done and current rows and the next stage from the standing's `next`, unless that `next` names a stop's review, and fills in as stages run (AC-PLAN-05).

## Stage Sessions

### The driver (AC-STAGE-01, AC-STAGE-06, AC-PLAN-08)

While the record's requirements side is open, the engine's loop runs this before it reads any phase plan. The PRD's **standing** is the milestones and `next` of the latest stage or feedback report: none before the first report of a run whose record named no PRD directory at Start, and unknown while §Rows says so.

```
each pass, after the stop, hold, pause and wait checks every activity gets:
    the method's fingerprint changed, and its read hasn't failed → read the plan again; wait for it
    feedback is waiting → run a feedback session; next pass
    standing has requirements_finished:
        the review is missing or stale → run a review session; next pass
        stop at the final review                                   (never passed without the person)
    standing has prd_refined, the PRD directory holds no technical design, and the early review
            is not yet held, the person asked to stop here again, or a refresh was asked at Resume:
        the review is missing or stale → run a review session; next pass
        a refresh was asked at Resume → clear it; record the review as ready; run a stage session
        mark the early review held; record the review as ready
        the wait is on, or the person asked to stop here again → clear that ask; stop at the early review
    run a stage session
```

Kiln never launches a review session straight after one that left the review missing or stale, and never runs a feedback session again for a message a feedback session was already given (§How a stage ends).

**Pause after** is offered while a requirements session runs, as for a phase, and never at a review. A requested pause takes effect before every requirements session the driver would launch, a stage, feedback or review session alike, and is cleared when the driver stops at either review. The pause panel's After wording names the stage and leaves out the completion checks.

An unfinished requirements activity always comes first. A stage held by Pause now, stopped at Needs you with work left, waiting at a usage limit, or interrupted when the terminal closed is resumed by today's paths before the driver runs. Feedback that arrives meanwhile stays `waiting` and is never handed to the resumed session; the feedback session runs on the first pass after that activity ends, finished by its report or by hand at Needs you, so two sessions never work the worktree at once. A reset discards waiting feedback with the rest of the requirements side. An interrupted requirements session is resumed as an interrupted preflight is; only when its conversation can't be reopened is it judged by §How a stage ends, never by Everything committed alone.

A review that a stage session made is judged like any other, by staleness: while it is current, no review session runs.

Nothing in the loop, no setting and no command moves past the final review. Only §Starting the Build does (AC-STAGE-06).

### What a session is told

Each requirements session is a fresh session in the worktree (AC-STAGE-01). Its prompt is one of four files under `prompts/`, with resume and carry-on variants like every other activity's:

| Task | The prompt says |
|---|---|
| Stage | Use the entry skill to find where this work stands, then run the one next requirements stage and stop, without starting the stage after it even where a skill would hand on. Run nothing, and report, when the next step comes before the PRD is written, when the next step is the build, or when the work already stands at a milestone in the **hold list** Kiln gives: `prd_refined` with no design begun, until the early review is held, and always `requirements_finished`. When the record names no PRD directory yet, it adds: if this session writes the PRD, the report carries `draft`, three to six statements the PRD hangs on, each one sentence in the PRD's own words, chosen as the outcomes that would change most of the PRD if wrong, and up to five short items from its Out of Scope, filled from the PRD as written whether or not the method made such a list |
| Review | Make or refresh the stakeholder review with the method's skill for it, from the documents as they stand, and nothing else. Commit the review in the session's last commit, with or after every other change to the PRD directory. End with the report, giving `ran` and `finished` only |
| Feedback | Work these messages into every requirements document that exists, as the method directs for a stakeholder's feedback, then refresh the stakeholder review if one exists, committing it in the session's last commit, then report where the work stands as a stage session does (AC-TALK-04, AC-EARLY-04, AC-FINAL-03) |
| Plan read | §Reading it |

Every prompt names the work (the source material's files and commit, or the planned PRD and its initiative, or the PRD directory), the worktree and the branch. It authorizes committing on that branch, including documents a skill would otherwise leave for the person to commit, and nothing else: no push, no pull request, no other branch, no build. It tells the session never to open anything in a browser, the review it makes included, since Kiln opens it. It says no one can answer questions and that the final message must end with the report. A stage or feedback session's prompt also says that a message arriving mid-session is the person's feedback to work in as the method directs; a review session's says nothing of messages, since it takes none (§Feedback).

A stage session's expected stage, for its row and its model, is the plan's entry at the cursor or, without a plan, the standing's `next`; while the standing is unknown, when there is neither a plan nor a report, or, without a plan, when `next` named a stop's review, or after a session at a stop that ran nothing, or nothing in the plan (§Rows), none: the session runs as the `kiln:next` row (§Rows).

### How a stage ends (AC-STAGE-02, AC-PLAN-06)

When a requirements session ends, Kiln reads the report from its final message and runs Everything committed. The first row that fits:

| What Kiln finds | Kiln |
|---|---|
| A stage or feedback session's valid report whose `next` is a step before the PRD draft | Needs you, naming that step for the person's own session, offering only **Reset Kiln for this PRD** |
| A review session's valid report while the review is still missing or stale (§Design Decisions) | Needs you, with Everything committed and **Review current** as its checks; the second names the file and commit that made the review stale |
| A feedback session's report that gives any message it was given or read `not_worked_in`, or no outcome | Needs you, naming those messages |
| A valid report that gives no PRD directory Kiln accepts, after which Kiln can't place the PRD: the record names no PRD directory and the branch holds a `<folder>-prd.md` the base commit doesn't, or the PRD file the record names is gone and Git finds no rename for it (§Design Decisions) | Needs you: "Kiln can't tell which PRD this session wrote", or, when the record's PRD file is gone, naming that file, with the last message and Everything committed; Check again passes as for a stage finished by hand, leaving the standing unknown |
| A valid report with `finished: true` and everything committed, from a review or feedback session, or from a stage session with either a non-empty `ran` or a standing the driver stops at: `requirements_finished`, or `prd_refined` while the early review's condition in §The driver holds | Pushes the branch, records the row from the report, follows the PRD's folder (§Design Decisions), and goes round the driver |
| Anything else: no report, an invalid one, `finished: false`, uncommitted work, or a report that ran nothing at any other standing | Needs you, as a phase stops, with the session's last message and Everything committed as its one check; for a session that ran nothing, the line "The session ran no stage, and the work stands at no stop Kiln makes" |

A review session's report sets neither the standing nor the cursor: Kiln takes its `ran` and `finished`, and judges the review by Git. A feedback session's report sets both, as a stage session's does.

At each of these Needs you, **Check again** and **Resume** first run its checks: Everything committed and, at a review session's Needs you, Review current. When they pass, Kiln pushes and goes on. If a stage session's valid report said `finished: true` and ran a stage, or a feedback session's valid report said `finished: true`, and only uncommitted work or a message left `not_worked_in` stopped it, Kiln records it from that report as the table's pass row does; any other stage session, and a feedback session with no valid report, makes the standing unknown, so the next stage session finds where the PRD stands. At a feedback session's, a pass marks its messages `applied` with the commit Kiln pushes, as AC-STAGE-02 treats work the person finished themselves. When they don't pass, Resume reopens the stopped session with the reply, as for a phase (AC-STAGE-04), a review session whose work is committed but whose review is still stale included, and that session is judged again by the table when it ends. A reply given when the checks pass becomes feedback.

**A PRD refinement paused.** The method's PRD refinement can pause by its own rule, at its round cap, at a session limit or when a sub-agent fails twice, leaving `{folder}-prd-refinement-state.md` untracked beside the PRD, never to be committed. Its session ends by the table's last row. Everything committed still counts the file, so it passes only once the refinement finishes or is stopped, either of which deletes it. While the file is untracked, the check names it on a line of its own: the PRD refinement is part-way through, and this file is never committed. Resume's guidance asks how to go on (carry on, raise the round cap, or stop, which commits what it has); Check again's says to finish or stop the refinement, never to commit the file. Kiln never commits, moves or deletes it.

A session that ran nothing has nothing to commit and still reports its standing. A report whose `next.kind` is `build` counts `requirements_finished` as reached, by this session when it ran a stage and earlier when it ran nothing. So a stage session that ran nothing is followed by another only when the driver passed a stop or a hold between them (the early review held, or Continue); the table's last row stops it at every other standing, and no further check is made. The usage-limit wait, the terminal closing, Pause now and the restart review need nothing new: they act on activities.

## Feedback (AC-TALK-01 to 04)

Feedback is a list on the record. Each message has an id and a state:

```
waiting → sent → read → applied
   │        │      │
   │        └──────┴→ waiting   (its session ended without `worked_in` for it in a valid report,
   │                             or with no valid report; or a delivery settled as uncertain)
   └→ read                       (given in a feedback session's prompt, once that session starts)
```

A feedback session must give `worked_in` for every message it was given or read. One it reports `not_worked_in`, or gives no outcome, is `waiting` and the session stops at Needs you (§How a stage ends), which settles it, so no message goes to a second feedback session. Any valid stage or feedback report's `worked_in` makes a message `applied` from whatever state it was in before. Delivering a message sets its `sessionId` and clears `readAt`. A feedback session's prompt messages become `read` when it starts, with its `sessionId` and that time; one whose session fails to start stays `waiting`. A feedback session's messages are those with its `sessionId` and a `readAt`, and they are what a pass at its Needs you marks `applied`. A message that goes back to waiting is applied by a feedback session even when its first session may have worked part of it in: applying it again to documents that already carry it changes nothing, while dropping it loses it.

- **Sending** never pauses, holds or stops anything (AC-TALK-03). The route accepts a message whenever the requirements side is open.
- **One route, several ways in.** While the requirements side is open, **Message Claude** (`POST /api/live/message`, `kiln message`) aimed at a requirements session, the feedback box and `kiln feedback` all add the message to this list. A Message Claude message to a requirements session is never an untracked live message: it is delivered only to a stage or feedback session, with its id line, its receipt only makes it `read`, and an uncertain delivery returns it to `waiting` with no delivery-recovery hold and no acknowledgement asked of the person. Message Claude to a build session, the `whole` leaf's included, keeps today's behaviour and hold.
- **A review session takes no live messages.** A message sent while one runs is `waiting`, and the driver's feedback check runs a feedback session before either stop, which applies it, refreshes the review and gives What changed.
- **A stage or feedback session is running and takes live messages** (Claude Code where Message Claude works today): Kiln delivers it at once through Message Claude's path, as the person's literal text after one line naming its id, so the report can give its outcome. Delivered, it is `sent`, shown as sent to the session and not confirmed read. The existing receipt makes it `read`, with the time; a delivery that settles as uncertain returns it to `waiting`. The session's report gives each message it read an outcome, and `worked_in` makes it `applied` with that session's commit.
- **Length.** The feedback box and `kiln feedback` take up to 32 KiB, room for a pasted review reply. A message over 4,000 characters, the live limit, is never delivered live: it is `waiting` for a feedback session. Message Claude and the Needs you reply keep their 4,000.
- **Otherwise** (no session, Codex, a platform without live messages, an uncertain delivery) it is `waiting`, and the driver runs a feedback session after the running or stopped requirements activity ends and before the next stage (§The driver). Its report makes each message `applied`.
- **At a review**, Send feedback is the same route with the stop's own options (§The Two Reviews).

A feedback session is an activity like a stage: it can stop at Needs you, wait at a usage limit and be resumed. Its model: §Models.

## The Two Reviews (AC-NOTE-01, AC-NOTE-02, AC-EARLY-01 to 05, AC-FINAL-01 to 03)

**The draft note.** When a report carries `draft`, Kiln saves its statements and what the PRD leaves out, and the running screen shows them (AC-NOTE-01, AC-NOTE-02). A report without `draft` shows nothing, and a later report never replaces the note. A PRD drafted by hand has no drafting report and shows no note.

**Ready.** A review is ready when the driver reaches its milestone with a current review, whether or not it then stops. Kiln records the kind, the review's file and commit and the time. When it then stops, Kiln opens the review once with the platform's opener, under the rules for opening the view (Kiln v1 §Ports and one Kiln per PRD); when it carries on, with the wait off or after a refresh asked at Resume, it opens nothing, and the view still links the review (AC-EARLY-02, AC-EARLY-05). The view links to it at `<base>/stakeholder-review`, which serves the file from the worktree under a sandboxing content policy: `sandbox allow-scripts allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox`, inline script and style, images from `data:` only, and nothing else. The popups let the review's source links, HTTPS links that open in a new tab, open normally; a window the review opens on Kiln's view is cross-origin to its opaque origin, so its script can read neither the page nor the token in it. The route answers before the view's catch-all and sets this policy in place of the view's security headers, never alongside them. The file is written by an agent from repository content and is served on the origin that holds the PRD's token, so without the sandbox its script could open the view and send any control, Start the build included. Sandboxed, it runs in an opaque origin with no network. The method's template already degrades there: its saved drafts are off when storage throws, and Copy reply falls back to Download reply. While a stop stands, no session runs.

**The three answers** are the same at both stops:

| Answer | Early review | Final review |
|---|---|---|
| Send feedback | A feedback session, then on to the next stage, unless **Stop here again** was ticked, which holds the early review again with what changed | A feedback session, then this stop again, with the phase plan as it now stands |
| Continue | Marks the early review held and goes on | Not offered: **Start the build** is the only way forward |
| A session of their own, then Resume | Kiln runs Everything committed, naming what to commit when it fails. When it passes and the review is now stale, a review session runs: at the early review Resume records a one-time refresh ask (`refreshAsked`) that the driver's early branch answers without stopping again. Then as after feedback | The same, through the final branch's own staleness check |

**The command shown** for a session of their own reopens the conversation of the PRD's latest requirements activity that ran a session: the review session, a feedback session after it, or, when the review needed no refresh, the last stage's session. It is built as Needs you builds its terminal command for that session's agent, with its `cd` into that session's directory, and offered only when the reopen check finds the conversation available; otherwise it is today's fresh-session command in the worktree, for the agent that activity ran on. A plan read is never that session. Resume at the stop reopens nothing: Kiln runs Everything committed and the staleness check only.

**What changed** is the feedback session's `changes`, shown with its commit on the stop it returns to.

**The wait** is the PRD setting `waitAtEarlyReview` (AC-EARLY-05), changeable until a report says `prd_refined`. When it is off, the driver still has the review made, marks the early review held and goes on (AC-EARLY-05).

## Starting the Build (AC-FINAL-04 to 06)

**Start the build** is offered only at the final review. It is one instruction that:

1. Runs today's start checks against the worktree: with phase documents, all of them; with none, that the PRD exists and the tree is clean. A failure is listed on the screen, and the button is unavailable until a reload finds them passing, as after a reset.
2. Asks today's refinement confirmation only when the PRD has reached `prd_refined` or `design_ready` and that milestone is not in `reachedByKiln`: a refinement the method called for ran outside Kiln (AC-FINAL-05).
3. Closes the requirements side and hands the execution to today's loop, with the preflight due as at Start. The plan is read, and its baseline recorded, here for the first time, so feedback that changed the phase plan before this point is never a plan change.

The screen's count of unconfirmed assumptions is today's count (AC-FINAL-04), which includes every entry not yet marked validated, whatever its section, so the screen says "assumptions", not "business assumptions".

**A PRD with no phase plan** (SCOPE-001). When the PRD directory holds no phase documents at Start the build, the plan is one leaf, id `whole`, titled with the PRD's name, with no file and no tier, so it resolves on the Standard row and offers Change like any phase. Its session gets a prompt of its own: build the unsplit PRD with `implement-from-requirements`, commit, push the feature branch, and end with the report. Its check is three rows: the report says finished, Everything committed, Pushed. While the execution's plan is the `whole` leaf, a plan read that finds no phase documents gives that plan, never the "No phase documents" problem it gives today. `whole` has no file, so the record holds no plan baseline while the plan is `whole`; the first plan read that finds phase documents records the first. If phase documents exist when the session ends, the session split the work. Its check is still its three rows, plus an accepted plan read, never today's Closed check, since `whole` is in no document. On a pass, `whole` gets no completion, since a plan read fails on a completed leaf its plan doesn't hold: it stays on record as an earlier activity, and its time counts in the PRD's totals. The plan read accepts each leaf the session Closed as closed outside Kiln, through today's done check for that leaf, shows today's plan-updated notice, and Kiln carries on at the plan's first open leaf as for any split PRD, delivery audit included. A split that Closed no leaf carries on the same way. On a start from an existing branch, a start commit with no phase documents counts as having no leaf Closed at start. Otherwise the record marks the execution `wholeBuild`, and the routing that picks the next audit allocates no delivery audit for it: the test audit and pull request session follow as today. This is a condition of its own, not a closed kind, since a kind with no loop is never closed and closing one reports its loops as used up. At a stop, the person finishes it as they finish a phase, with Mark complete standing in for the report. After a split, Mark complete waives the session's rows and continues in order; it never completes `whole`, and the plan read still judges every leaf.

## Models (AC-MODEL-01 to 06)

Kiln Phase Model Tiers' resolver gains one step and two rows. For a requirements activity that hasn't started, first match wins:

1. Its own entry for this PRD, marked **Changed by you**. Entries are kept by stage key (§Data Models), so each row has its own.
2. The remembered choice for the skill it is expected to run, marked **Saved for every PRD** (AC-MODEL-03).
3. Its Model defaults row: **Refining the design** while the record's span is open (`designSpan`), otherwise **Requirements stages**.

The **span** opens when Kiln launches a stage expected to reach `design_ready` and closes when a report includes `design_ready`. A planned row shows the Refining the design choice when its entry reaches `design_ready`. Plan reads and feedback sessions resolve on Requirements stages. The `kiln:next` row has no expected skill: it resolves at step 1, otherwise at step 3; no remembered choice applies to it, it opens no span, and an unknown standing leaves an open span open. A choice on the `kiln:next` row is removed when a report sets the standing, so it never applies to a later unknown standing. A started activity keeps what it started on, as Tiers has it, so a session that runs a different stage than expected is not relaunched.

The two rows ship as AC-MODEL-02's table gives and behave as Tiers' rows do: families, a fallback column, the same-agent refusal, and Restore. Everything else follows from a requirements session being an activity: the launch decision and the usage fallback, the `selection` stop for a choice that can't be used, needed agents, and billing per agent (AC-MODEL-06).

**A remembered choice that no longer matches** (AC-MODEL-04). When the plan for the reading agent names no stage that runs a remembered skill, the snapshot marks that choice unmatched. A row that the latest plan change introduced carries the note that a saved choice no longer applies, naming the skill. The choice stays in the file and applies again if the skill returns.

## The Home Screen

### Process (AC-HOME-01, AC-HOME-05, AC-HOME-08, AC-HOME-09)

`kiln new`, or `kiln` with no arguments, starts a home process for a **scope**: the repository the command was run in, found from any folder inside it, or, outside a repository, the folder itself with the repositories directly inside it. The process has no engine. It takes a port from the registry and an instance lock, keyed by a state directory for the scope, and serves the same built view at `http://127.0.0.1:<port>/home` under today's local security, with a token of its own. A second `kiln` for the same scope opens the first one's address and exits.

**Opening an item.** Every button on a line posts `POST /api/home/open` for its item. The home server makes sure that item's Kiln is running and answers with its address, which the page opens in a new tab. When the item's instance lock has a live holder, that is all. Otherwise the home process starts `kiln run <start path>` as a child, with a flag that skips only opening the view at launch, since the page opens it, and waits for the child's lock to name a port. The child is an ordinary Kiln: its own lock, port, record and engine, and it still opens the review at a stop (§The Two Reviews). Its terminal lines print in the home's terminal, prefixed with its title. The home screen itself never starts a session or changes a run (AC-HOME-05), apart from the plan read (§Reading it), which belongs to no run. A PRD another terminal's Kiln is running opens there and can't be started twice, because the lock decides.

### What it lists (AC-HOME-02 to 04, AC-HOME-10 to 13)

One scan function per repository returns its items; the home screen merges repositories into one list. It reads:

- **Kiln's records** for the repository, through the bounded, ownership-checked reads `kiln status` uses.
- **The checkout and its worktrees**, for files not yet committed: source material folders, `received/`, and the PRD refinement's state file, which is never committed.
- **Git**, for every local branch and every remote-tracking branch of `origin`: the folders under `source-material/`, `docs/prds/`, `docs/changes/` and `docs/initiatives/`, each PRD directory's file names, phase documents' `**Closed:**` and `**Repositories:**` lines, and the latest commit date. Reads are cached by the ref's commit.

Items are placed by AC-HOME-13's table, first row that fits. The rules the table leaves to the design:

- **Which copy of a PRD is read:** its run's worktree when Kiln has a record; otherwise the branch that holds it (§What `kiln run` accepts), the newest when several do, which the home screen passes to the child Kiln as `--branch`; otherwise the shared branch. A PRD is "only on a branch that hasn't merged" (AC-HOME-13) when a branch holds it and the shared branch has no copy.
- **Kiln started a PRD from it** (AC-HOME-13, first row): a record whose `origin.path` is the item and that is started (`startedAt` set) or names a `prdDirectory`. A record never started, which `kiln run` writes before Start, or reset before the draft, places nothing; the table's other rows place the material. A started record that names no `prdDirectory` yet is an Under way line of its own, titled `origin.title`, with the start path as its path and its stage or Needs you from the record, at the top when it waits for the person.
- **The shared branch, read without a fetch:** the record's base (`settings.baseBranch`, or `settings.bases[<repository>]`) when Kiln has a record; otherwise today's default rule read from the remote-tracking refs as last fetched: `develop` when `refs/remotes/origin/develop` exists, else the branch `refs/remotes/origin/HEAD` points to. With neither, the repository has no shared branch: its source material lines say Kiln can't tell the shared branch and to run `git remote set-head origin --auto`, and no planned PRD is read from it. Source material is committed on the shared branch when the local branch of that name holds it, the read the requirements start checks make; when only `origin/<shared>` holds it, the step left is to bring `<shared>` up to date. `scope.sharedBranch` is set when every repository in the scope has the same one; otherwise the panel's prompt says "the repository's shared branch".
- **The stage a line shows:** from the record when there is one (the current stage, a review and since when, the build's count of phases). Otherwise from which documents exist, in the words of AC-HOME-04. A line is **started by hand** when no record exists.
- **When a planned PRD's build waits** (AC-HOME-02): `buildWaitsFor` names each PRD in its row's Depends on column, as the column writes them, whose own row in the same PRD list, read from the shared branch, doesn't start `in production`; a name that matches no row is still named, and a column of `None…` names nothing. The line reads "Its build waits for X."
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
- `prdDirectory` is asked for once a PRD exists; leaving it out, or naming one Kiln doesn't accept, keeps the report valid. Once the record names a directory, a report's `prdDirectory` is not read while that PRD file is there. `messages` lists every message the session read, with `worked_in` or `not_worked_in`. `worked_in` means the session dealt with the message as the method directs for feedback, which includes sending it to a follow-on PRD, restating an assumption to meet a doubt, or leaving it in a pending change for a chat of its own; `not_worked_in` means it left the message for another session. `draft` is read only from the report that first sets the record's `prdDirectory` (§Design Decisions, finding the PRD's folder), and only when `statements` and `leftOut` are lists of non-empty strings; on any other report, or in any other shape, it is ignored and the report stays valid. `changes` comes from a session that applied feedback.
- A stage or feedback session's block that doesn't parse, has another `kilnReport`, names an unknown milestone or leaves out `ran`, `finished`, `next` or `milestones` is no report. Unknown fields are ignored. The whole-PRD build's report is valid with `kilnReport` 1, a `ran` list and a boolean `finished`; Kiln reads only those, so `next`, `milestones`, `prdDirectory` and every other field are ignored there, present or not. A review session's report is valid on the same three fields.

The plan read's block, info string `kiln-plan`:

```json
{ "kilnPlan": 1,
  "stages": [ { "skill": "prd-writing-standards", "title": "Write the PRD", "reaches": [] } ],
  "reviewSkill": { "skill": "stakeholder-review-package", "title": "Stakeholder review" } }
```

A plan block that doesn't parse, has another `kilnPlan`, has no stages, names an unknown milestone in a `reaches`, or leaves out `reviewSkill` is no plan: the read fails with that reason.

### HTTP (same-origin, token, as today)

| Route | Contract |
|---|---|
| `POST /api/feedback` | `{ text, stopAgain? }`: nonempty text, at most 32 KiB of UTF-8, no NUL or malformed Unicode; 413 over the limit, naming it and that the reply's first part alone carries every answer. Journaled. 409 once the build has started or before Start. `stopAgain` is accepted only at the early review |
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
  standsAt?:      string                                                        where the documents stand, for a record naming a PRD directory at Start, until its first report
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
                    openAssumptions, resumeCommand?, freshSessionCommand }     the view shows resumeCommand when present
                                                                                (§The Two Reviews, the command shown)
  feedback[]:     { id, text, at, state, readAt?, appliedCommit? }
  build?:         { refinementConfirmation: "needed" | "not_needed", checksFailed?: string[], whole?: true }
settings          gains waitAtEarlyReview: { value, canChange }
```

`phases[]`, `activities[]` and the Tiers additions are unchanged. At the final review, `phases[]` and `documents` are filled from the worktree as Documents found fills them today. The `whole` leaf appears in `phases[]` with `tier.value: "not_rated"`.

**Location label** (AC-HOME-01, AC-BEGIN-07). The header names the PRD folder once `prdDirectory` is set, and until then `requirements.origin`'s source folder, or its initiative and planned PRD. The home screen's header names the scope: the repository, or the folder and its count of repositories.

**PRD totals** (AC-STAGE-03). Requirements activities are activities of the PRD's record, so the PRD's totals count them as they count every activity, from the record's `startedAt`, which Start sets for a run from source material. The stops add no timing state: no session runs while one stands, so the time counts as waiting. The header keeps its totals line in the `early_review` and `final_review` states. Plan-read sessions belong to no PRD record, so no PRD counts them.

The home list: `{ scope: { kind, name, sharedBranch?, repositories[] }, plan, underWay[], ready[], notReady[], folded[] }`, each item `{ id, repository, title, path, kind?, line, state?, address?, startedByHand?, alsoChanges[], buildWaitsFor?, lastChanged? }`.

### Command line (AC-STAGE-05, AC-MODEL-05, AC-HOME-01)

```
kiln                                        the home screen for the current scope
kiln new                                    the same
kiln feedback <path> (--text <text> | --file <file>) [--stop-again]   --file up to 32 KiB, read as kiln reply reads one
kiln continue <path>                        today's command, which also continues from the early review to the next stage
kiln start-build <path> [--refinement-confirmed]
kiln settings <path> --wait-at-early-review <on|off>
kiln model <path> --stage <row key or id> (… | --use-default) [--remember]
kiln model-defaults set --row <requirements|refining-design> …
kiln model-defaults remember --skill <name> --agent <id> --model <family or model> [--effort <value>]
kiln model-defaults forget --skill <name>
```

`<path>` is a PRD directory or file, a source material folder, or a planned PRD's start path; `--prd` is `kiln run`'s alone. `feedback`, `start-build` and `--stage` are changing commands: they take the command ID and status token, need a live Kiln, are announced in `features`, and are refused with the route's reason. Because `start-build` is refused anywhere but the final review, and a status token from before the stop doesn't match, no command given earlier can start the build (AC-STAGE-06). `remember` and `forget` are `computer_setting` commands like the rest of `kiln model-defaults`.

`kiln status <path>` gains `requirements`: the rows with their models, the review the run waits at and since when, the feedback list and the build's confirmation need. `state` takes `early_review` and `final_review`, and the inventory counts them with the work waiting for the person. Every new command has an entry in `prompts/kiln-command-contracts.json`: `new` under the start group, the rest under the groups their neighbours are in.

## Data Models

**PRD record**, the next schema version after Kiln Phase Model Tiers' migration. `prdDirectory` becomes optional. New fields, all absent on a run with no requirements side, so the migration adds nothing to existing records:

```
origin?:        { kind: "brief" | "intake" | "planned_prd" | "prd", path, initiative?: { path, row },    path: the start path
                  commit?, title }
requirements?:
  phase:        "stages" | "early_review" | "final_review" | "closed"
  earlyReviewHeld: boolean,  stopAgain?: true,  refreshAsked?: true
  standing?:    { milestones: [ { name, by } ], next?, at } | { unknown: true, at }
                                                                     absent when §The driver gives none
  designSpan:   boolean
  cursor:       number,  planFingerprint?: string
  stages:       [ { activityId, key?, task: "stage" | "review" | "feedback", ran[], reaches[], report? } ]
  draftNote?, review?, notice?                                       as the snapshot shows them
  feedback:     [ { id, text, at, state, sessionId?, readAt?, appliedCommit? } ]
  reachedByKiln: string[]                                            milestones a Kiln session reported reaching itself
wholeBuild?:    true                                                the execution builds the `whole` leaf (§Starting the Build)
settings.waitAtEarlyReview: boolean
settings.modelChoices.stages: { [stage key]: ModelChoice | "default" }
```

A **stage key** is `kiln:early` or `kiln:final` for Kiln's two review rows, `kiln:next` for the Next stage row (§Rows), and `<skill>#<occurrence>` for the method's entries, counting that skill's earlier entries in the method's plan only, so a review the method itself makes never shifts the key of one Kiln adds. A row Kiln inserts, or shows with no plan, takes the lowest free occurrence (§Rows). A review session takes the key of its stop's review row: Kiln's, or the method entry's `<skill>#<n>` when that entry is the row.

Activities gain the kind `requirements`, with keys `req-<id>`, added to the one activity-key classifier, which reads any key it doesn't know as a phase; session records gain the same kind. A reset removes the requirements side with the rest of the PRD's state, and keeps `origin` and `prdDirectory` (§Run identity).

**Requirements plan file**, `<state root>/requirements-plan.json`, owner-only and written atomically:

```
{ schemaVersion: 1,
  plans: { [agentId]: { [fingerprint]: { methodUpdatedAt, readAt, usedAt, stages[], reviewSkill } } },
  reading?: { agentId, fingerprint, startedAt, pid, processStartTime },
  failures: { [agentId]: { [fingerprint]: { reason, at } } } }
```

Plans are kept by fingerprint so two copies of the method, one installed for a single project, never evict each other's plan and start a read each time Kiln moves between them. A plan not used for 30 days is dropped on the next write; a PRD whose `planFingerprint` names a dropped plan gets its notice with the count of stages after the change only.

A plan-read session's output is kept under `<state root>/requirements-plan/<session id>/`, in the files every session keeps.

**Model defaults file** gains the rows `requirements` and `refining_design` and `skills: { [skillName]: FamilyChoice | ModelChoice }`. Restore clears the six rows and leaves `skills`, each of which is forgotten on its own. Its schema version stays 1 when this ships with Tiers' first release of the file, and becomes 2 otherwise, since an older Kiln must refuse a file it would half-read.

**Home state**, `<state root>/home/<8-character hash of the scope's path>/`: the instance lock and the token. Nothing else is saved; the list is always scanned.

## Changes to Earlier Designs

Each line is added to the earlier section, as `Superseded in part by:`, in the commit that builds the change.

- Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Command line (`kiln run` accepts source material, a planned PRD and a PRD with no phase documents; `kiln` alone opens the home screen), §Where a Feature Stands (a run with a requirements side runs the requirements driver before any plan is read), §Ports and one Kiln per PRD (the address's last part is the start path's; the home screen takes a port; a Kiln the home screen starts doesn't open its view at launch; every Kiln opens the stakeholder review at a stop under the same opening rules), §Kiln's State on Disk (the key is the start path; `prdDirectory` is optional), §Worktree and Branch Setup (a start with no phase plan cuts from the local shared branch's tip; a method run part-way through fails the start with its own line in place of the clean-checkout line), §The Done Check (a requirements session's check and Kiln's own push; the whole-PRD build's check), §The Plan Reader (a plan of the one `whole` leaf reads with no phase documents), §Local security (the stakeholder review route sets its own sandboxing policy in place of the view's security headers), §Snapshot (the header names the run's source until the PRD folder exists, and the home screen's names its scope), §Snapshot's Running and waiting time (the PRD's totals count requirements sessions from Start and both review stops as waiting; a plan read counts toward no PRD).
- Replaces in part: `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-technical-design.md`, §Resolving a Choice (requirements activities, the remembered-choice step and two rows), §Model defaults file, §HTTP and §Command line (the rows, `skills`, `--stage`, `remember` and `forget`).
- Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`, §The starting point (an unmerged branch holding the PRD's documents is selected first; a new branch for a start with no phase plan is cut from the local shared branch's tip), §The branch list and the adopted-worktree decision (a refinement or feedback round part-way through in any worktree fails the start with its own line in place of the adopted worktree's), §After Start (Kiln's own push after a requirements session), §Reset, Doing it (the fresh record keeps `origin` and `prdDirectory`).
- Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §One completion decision, and `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §Routing After the Last Loop (an execution marked `wholeBuild` allocates no delivery audit).
- Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`feedback`, `start-build`, `new`; `kiln` with no arguments), §Outstanding-work inventory (runs keyed by a start path; the two review states).
- Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Literal input and admission (Message Claude to a requirements session is tracked as feedback, and carries one line naming its id before the person's text; a review session is never delivered one, and the message waits for a feedback session), §Receipts and correlation (for a requirements session, Received makes the feedback read), §Uncertainty recovery (feedback to a requirements session takes no hold and asks no acknowledgement when its delivery is uncertain; it waits for a feedback session), §Snapshot and browser (a message to a requirements session shows waiting, sent, read or applied in place of its delivery receipts; the end-of-activity pause, for a requirements session, takes effect before every requirements session the driver launches and ends at a review stop).
- Replaces in part: `docs/changes/kiln-pause-now/kiln-pause-now-technical-design.md`, §The Pause Now State (for a requirements session, the After choice names the stage and leaves out the completion checks, and is not offered at a review).
- Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Evaluate, then act (at a requirements activity's Needs you, Resume or Check again that finds everything committed, and at a review session's the review current, pushes and goes on with no already-complete choice, and a reply becomes feedback; §How a stage ends).
- Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Selection and readiness (a plan read checks the entry skill through the fingerprint's resolution, not the build skills for its launch directory), §Unattended execution profile (a plan read's only writable root is its plan directory, with no assigned repositories).

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
- **Expected build spend:** about $60 of agent usage. It covers real sessions on a small fixture repository with a brief of a few paragraphs: a plan read on each agent (AC-PLAN-02, AC-PLAN-03); a stage session that drafts a small PRD and reports, and one continuing a PRD started by hand (AC-PLAN-06, AC-BEGIN-04, AC-NOTE-01); a review session, a feedback session, and one message delivered live to a running stage or feedback session (AC-PLAN-08, AC-TALK-01, AC-TALK-04); and one whole-PRD build of a trivial change through its test audit (AC-FINAL-06). The refinements run for hours on real work, so their stages are proved by the same session path on the small PRD, not at full length.
- **After the build:** once the PRD's audits have closed and its pull request has merged, add the changelog entry under Unreleased (Added: starting from source material, the requirements stages, the two reviews, feedback at any time, the home screen; Changed: `kiln` with no arguments opens the home screen), then release as a minor version: saved records load unchanged and no command is removed. The other three method changes the PRD names are proposed to the method on their own, and nothing here waits for them.

## Criteria Coverage

| Criteria | Covered by |
|---|---|
| AC-BEGIN-01 to 05, AC-BEGIN-08 | §What `kiln run` accepts |
| AC-BEGIN-06 | §Run identity; §Branch and worktree; the folder decisions in §Design Decisions |
| AC-BEGIN-07 | `requirements.origin` and the location label in §Snapshot |
| AC-PLAN-01 | §Rows |
| AC-STAGE-03 | §Rows; §Snapshot, PRD totals |
| AC-PLAN-02 | §What Kiln Knows About the Method; the entry-skill decision |
| AC-PLAN-03, 04, 05, 07 | §Reading it |
| AC-PLAN-06 | §What a session is told; §The report; §Rows |
| AC-PLAN-08 | §The driver; the stale-review decision |
| AC-STAGE-01, 02, 04 | §Stage Sessions; §Feedback, one route (Message Claude); §Existing Code (reused) |
| AC-STAGE-05 | §Command line |
| AC-STAGE-06 | §The driver; §Starting the Build; `start-build` in §Command line |
| AC-NOTE-01 | §What a session is told (the stage prompt's `draft` ask); §The report (`draft`); §The Two Reviews, the draft note |
| AC-NOTE-02 | §The Two Reviews, the draft note |
| AC-TALK-01 to 04 | §Feedback |
| AC-EARLY-01 to 05, AC-FINAL-01 to 03 | §The Two Reviews |
| AC-FINAL-04, 05, 06 | §Starting the Build |
| AC-MODEL-01 to 06 | §Models; the Model defaults and `kiln model` changes in §Interfaces |
| AC-HOME-01, 05, 08, 09 | §Process; §Snapshot, location label (AC-HOME-01) |
| AC-HOME-02, 03, 04, 10, 12, 13 | §What it lists |
| AC-HOME-06, 11 | §Staying current, the panel |
| AC-HOME-07 | §Staying current |
| AC-GUIDE-01 | The README's sections on starting, how Kiln works and choosing models, and the first paragraph of this repository's agent instructions |

## Open Questions

1. **SCOPE-001 is open.** If the answer is that the person builds such a PRD themselves, §Starting the Build loses its last paragraph, the `whole` leaf, `wholeBuild` and the audit-routing change, with the two Design Decisions rows on that build and the whole-PRD build's report rule, and the final review of a PRD with no phase documents ends with a prompt to paste. That run then needs a way to end at its final review, since a run not finished stays Under way on the home screen (AC-HOME-13).
2. **HOME-004 is open.** Either other answer changes only the scan's placement of folders that hold neither a brief nor an intake record, and the panel's line saying they aren't listed.
3. **The brief's file name** is this design's reading of a method change not yet made. If the method sets another name, one constant changes.
4. **Kiln Phase Model Tiers is designed and not built.** This design assumes its contracts as its refined design states them: activities resolved by one resolver, the start line, the launch decision, the Model defaults file and page, and `kiln model`. Its open questions DEF-001 and DEF-002 decide the two new rows' fallback values and nothing else here. Its design names its record schema 25, which the code already uses, so its migration takes the next free version and this design's the one after.
5. **The method's test audit after an unsplit build.** The method says a test audit can be pointed at an unsplit PRD and does not say one follows by default. AC-FINAL-06 has Kiln finish such a PRD as it finishes a split one, so Kiln runs it. Whether the method should say so is for the method.
