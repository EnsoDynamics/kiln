# PRD: Kiln Requirements Stages

**Source:** Doug's request and decisions, 2026-11-22 and 2026-11-23: let Kiln carry the requirements half of the Enso Method as well as the build, from writing the PRD to the phase plan, stopping only where a person's review is worth the wait.

**Changes:** [Kiln v1](../kiln-v1/kiln-v1-prd.md), which starts only from a PRD that is already refined, designed and split into phases. Builds on Kiln Phase Model Tiers (`docs/changes/kiln-phase-model-tiers/` on `develop`), which owns the model shown on every plan row and the Model defaults page.

**Assumptions:** [Kiln Requirements Stages assumptions](kiln-requirements-stages-assumptions.md)

**Review alongside:** the mockups of [the home screen](mockups/kiln-requirements-stages-1-home.html), [the home screen with nothing found](mockups/kiln-requirements-stages-2-home-nothing-found.html), [the home screen from a folder of repositories](mockups/kiln-requirements-stages-3-home-folder-of-repositories.html), [before Start](mockups/kiln-requirements-stages-4-before-start.html), [before Start while the plan is read](mockups/kiln-requirements-stages-5-before-start-reading-the-plan.html), [before Start when the plan can't be read](mockups/kiln-requirements-stages-11-before-start-plan-not-read.html), [running while the PRD is refined](mockups/kiln-requirements-stages-6-running-prd-refinement.html), [running after the method was updated](mockups/kiln-requirements-stages-7-running-after-method-update.html), [Needs you for a requirements stage](mockups/kiln-requirements-stages-13-needs-you-for-a-stage.html), [the early review](mockups/kiln-requirements-stages-8-early-review.html), [the early review again after feedback](mockups/kiln-requirements-stages-12-early-review-after-feedback.html), [the final review and Start](mockups/kiln-requirements-stages-9-final-review-and-start.html), [the final review of a PRD with no phase plan](mockups/kiln-requirements-stages-14-final-review-no-phase-plan.html) and [Model defaults](mockups/kiln-requirements-stages-10-model-defaults.html)

## Summary

Kiln can start from source material instead of a finished set of requirements. It writes the PRD, refines it, writes and refines the technical design and writes the phase plan, each in a fresh agent session using the Enso Method skill for that stage. It waits for the person once, at an early review made from the refined PRD, and always stops at a final review before the build. The person can give feedback at any moment without stopping anything, and the build never starts by itself.

Kiln also gets a home screen that lists what it can work on: source material ready for a PRD, and every PRD under way with the stage it reached. A PRD started by hand can be handed to Kiln at any stage, and every stage can still be run by hand.

## Business Context

Kiln starts today where planning ends. A person writes the PRD, refines it, writes and refines the technical design, makes the stakeholder review and splits the work into phases, each in its own chat, and only then runs `kiln run`. Between those chats the person does little except start the next one. The two refinements each run for hours, so a person who is away when one finishes loses that time. This is the same waiting Kiln removed from the build.

The requirements are also where a person's attention pays most, and reading is a real cost. Kiln therefore asks for one good review, placed where a change is cheapest, and forces no reading anywhere else.

The Enso Method changes often: its stages are split, merged and renamed. Kiln aims to keep working with a method installed after it, without the two being updated together, by following what the method has done rather than holding a list of its skills. That aim stops where protecting against a change would add more complexity than it is worth: an occasional break is accepted and fixed in Kiln when it happens.

Six terms recur below:

- **Source material** is what a PRD is written from, committed in the repository: a brief with its mockups or prototype, a requirements intake record, or a planned PRD in an initiative.
- A **requirements stage** is one step of the Enso Method between source material and the build, such as writing the PRD or refining the design. Each runs in one agent session.
- The **requirements plan** is the list of requirements stages for one PRD, in order, shown before and during the run.
- The **installed method** is the copy of the Enso Method on the computer Kiln runs on. When Claude Code and Codex each have a copy, the plan is read from the copy of the agent that reads it (AC-MODEL-02), and each stage's session uses its own agent's copy.
- The **early review** and the **final review** are the two points where Kiln stops for the person: after the PRD is refined and before any design, and at the end of the requirements, before the build.
- The **shared branch** is the branch new work is cut from, which Kiln calls the base branch today.

## Acceptance Criteria

### Start from source material, or from wherever the work stands

A person points Kiln at what they have, and Kiln works out what comes next. There is no separate mode for requirements.

- [ ] **AC-BEGIN-01 — `kiln run` accepts source material.** `kiln run` followed by a source material folder opens Kiln's browser view on that work, as it does for a PRD folder today. A planned PRD is started from the home screen, or from a terminal by naming its initiative and the PRD.
- [ ] **AC-BEGIN-02 — Kiln starts only from source material it can name.** Kiln starts from the three kinds in the table until a PRD or initiative is written from them (AC-HOME-13), and `kiln run` on source material Kiln started a PRD from opens that run. Otherwise it opens nothing, and says in the terminal either which document is missing or which PRD or initiative was written from the material.

  | Kind | What Kiln looks for |
  |---|---|
  | Brief | The brief file the Enso Method names for a folder under `source-material/` |
  | Intake record | `source-material/{name}/{name}-requirements-intake.md` |
  | Planned PRD | A row with status `planned` in `docs/initiatives/{name}/{name}-initiative-prds.md` |

- [ ] **AC-BEGIN-03 — Source material must be committed on the shared branch.** When the source material is not committed on the shared branch, Kiln says so in the same way, names what to commit and does not start.
- [ ] **AC-BEGIN-04 — A PRD started by hand continues from where it stands.** `kiln run` on a PRD folder whose requirements are not finished shows where the PRD stands, as the home screen does (AC-HOME-04, AC-HOME-13), and Start continues from there. The first session finds the next stage (AC-PLAN-06), so no stage whose result is already in the documents runs again.
- [ ] **AC-BEGIN-05 — A PRD that already has its phase plan starts as it does today.** For a PRD whose phase plan was written before Kiln was pointed at it, Kiln shows today's screen before Start, has no stakeholder review made and adds no stage or stop.
- [ ] **AC-BEGIN-06 — Source material gets its feature branch when the PRD draft starts.** Kiln cuts the feature branch and its worktree from the shared branch as the first stage starts. The branch is named from the source material's folder, or from a planned PRD's directory, and the person can change the name before Start, as today. Once cut, the branch and worktree keep their names, and the run stays with the PRD when the method renames the PRD's folder. Every requirements stage and every build phase lands on that branch, and one pull request closes it.
- [ ] **AC-BEGIN-07 — Before Start shows what Kiln found.** For source material, the screen before Start lists the documents Kiln will write the PRD from, the commit they are at and the feature branch it will cut. Nothing runs until Start.
- [ ] **AC-BEGIN-08 — A PRD started on a branch of its own continues on it.** For a PRD whose documents are on a branch that hasn't merged, such as the branch the method makes for a PRD started by hand, the screen before Start has that branch selected under **Start from**, and every stage and phase lands on it.
  - Replaces in part: AC-FROM-01 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (which branch is selected first; the rest remains).

  Added in refinement.

### See the whole plan before anything runs

A person sees every stage Kiln intends to run before pressing Start, as they see every phase of a build today. The list comes from the installed method, so it is right for the method the person actually has.

- [ ] **AC-PLAN-01 — The requirements plan lists every stage, then the build.** Before Start and while running, the plan shows each requirements stage in order, with the method's name for the skill it runs, followed by one row for the build. The two stops are marked on the stages they follow. Where the method makes no stakeholder review at a stop, the review Kiln has made there (AC-PLAN-08) is a row of its own.
- [ ] **AC-PLAN-02 — The plan comes from the installed method, not from Kiln.** Kiln holds no list of the Enso Method's requirements stages or skills. With an installed method whose stages differ from today's, such as two stages merged into one or a skill renamed, Kiln shows and runs that method's stages with no change to Kiln.
- [ ] **AC-PLAN-03 — The plan is read once and kept until the installed method changes.** Kiln starts reading the plan when the home screen opens or `kiln run` starts, whichever is first. On a metered route needing billing approval, it waits until the person approves billing for a PRD before Start. Kiln reuses it for every PRD, and reads it again when the installed method changes. The screen says the plan was read from the installed method and when that method was last updated, never a version number. **Read again** reads it on request.
- [ ] **AC-PLAN-04 — While the plan is being read, the screen says so.** It shows that Kiln is reading the plan and how long it has taken, and states what holds whatever the plan turns out to be: the wait at the early review, the stop at the final review, and that the build never starts by itself.
- [ ] **AC-PLAN-05 — Start never waits for the plan.** Start works while the plan is being read. When it can't be read, Kiln says so and why, Start still works, and the plan fills in as stages run.
- [ ] **AC-PLAN-06 — Each stage's session decides what runs, and reports it.** Each stage's session finds where the PRD stands with the installed method and runs the next requirements stage, never a step that comes before the PRD is written (Out of Scope). It ends with a report in a form Kiln owns, holding what the table lists. When what it ran or what comes next differs from the plan, Kiln corrects the plan and says what changed.

  | Session | The report says |
  |---|---|
  | Every session | What it ran, in the method's own name; what the method puts next, and which milestone (AC-PLAN-08) that step is expected to reach; which milestones the PRD has now reached; what it did with each message it read |
  | The session that drafted the PRD | The few statements the PRD hangs on, and what it leaves out (AC-NOTE-01) |
  | A session that applied feedback | What changed (AC-EARLY-04) |

- [ ] **AC-PLAN-07 — A method updated during a run changes the plan, not the work done.** When the installed method changes while a PRD is running, Kiln reads the plan again before the next stage starts; a stage already running finishes on the copy it started with. A notice says when the method was updated and what changed in the plan. Finished stages keep their record, and the run carries on.
- [ ] **AC-PLAN-08 — Kiln's stops follow milestones, not stages.** A milestone is a point the PRD has reached, whichever stage or person took it there. Kiln knows the four in the table, never which skill reaches them, and acts on each before any later stage runs, including one reached by hand before Kiln was pointed at the PRD, unless its phase plan was already written (AC-BEGIN-05).

  | Milestone | What Kiln does |
  |---|---|
  | The PRD is refined, and no design work has begun | The early review (AC-EARLY-01, AC-EARLY-05). When no stakeholder review has been made since the PRD was refined, Kiln first has the method make one from it |
  | The design is ready | No stop. The Refining the design row stops applying (AC-MODEL-02) |
  | A stakeholder review was made | Each stop opens the latest review |
  | The requirements are finished: the phase plan is written, or the method puts the build next | Stops at the final review (AC-FINAL-01). When what the latest review is made from changed after it was made, Kiln first has the method refresh it |

### Run each stage in its own session

Each requirements stage runs like a build phase: one fresh session, in the feature's worktree, checked before Kiln moves on.

- [ ] **AC-STAGE-01 — One fresh session for each stage.** Kiln starts a new agent session in the worktree for each requirements stage, and the session uses the installed method to run it.
- [ ] **AC-STAGE-02 — A stage is finished only when its work is on the feature branch.** Kiln acts on the first row of the table that fits, and pushes the branch whenever it moves on.

  | How the stage ends | What Kiln does |
  |---|---|
  | Its session reports the stage finished, with everything it changed committed on the feature branch | Moves on |
  | Its session reports that the method puts a step before the PRD draft next, such as cutting the material into an initiative | **Needs you**, naming that step for the person's own session, with only **Reset Kiln for this PRD** |
  | At Needs you, **Check again** finds everything committed, whether or not the person finished the stage themselves | Moves on; the next session finds where the PRD stands (AC-PLAN-06) |
  | Any other way | **Needs you**, as a phase does |

- [ ] **AC-STAGE-03 — The running screen shows every stage's state.** Each finished stage shows how long it took and the commit it pushed. The running stage shows the skill it is running, its model and how long it has run. The stages still to come are listed after it.
- [ ] **AC-STAGE-04 — A stage session gets what a phase session gets.** Each control and safeguard in the table works for a requirements stage as it does for a phase.

  | Today, for a phase | For a requirements stage |
  |---|---|
  | **Message Claude** | Delivers a message to the running stage's session |
  | **Pause now** | Stops the stage's session so it can be resumed |
  | **Needs you**, with the reply box, the takeover command and **Resume** | The same screen. On **Resume** with everything committed, Kiln goes on and the reply is feedback (AC-TALK-02). With work left, Kiln names what to commit at a review (AC-EARLY-03), and elsewhere resumes the stopped session with the reply |
  | A usage limit reached | The same wait or fallback, by the person's settings |
  | The terminal closed or Ctrl+C | `kiln run` again continues from the stage that was running |
  | Billing checked before each launch, and approved before Start | Covers every session Kiln starts for the requirements, reading the plan (AC-PLAN-03) and applying feedback included |

- [ ] **AC-STAGE-05 — The terminal shows and controls the same things.** `kiln status` shows the requirements stage a PRD is at and either review it is waiting at. Sending feedback, continuing past the early review and starting the build each have a command that does what the screen's control does.
- [ ] **AC-STAGE-06 — The build never starts by itself.** No setting and no command given earlier starts the build; only the person does (AC-FINAL-04, AC-BEGIN-05).

### Show what the PRD hangs on, without waiting

A person can catch a wrong turn minutes after the draft, before hours of refinement are spent on it, and is never made to read anything.

- [ ] **AC-NOTE-01 — The draft's key statements are shown while the refinement runs.** When the PRD is drafted, the running screen shows the key statements and what the PRD leaves out, from the drafting session's report (AC-PLAN-06), marked as not waiting for an answer. When the report gives none, nothing is shown. The run carries on whether or not the person reads them.
- [ ] **AC-NOTE-02 — The early review replaces them.** When the early review is ready, they are no longer shown.

### Give feedback at any time

There is one rule for the person: say it whenever it comes to mind, and never stop anything to say it.

- [ ] **AC-TALK-01 — The running screen takes feedback during every requirements stage.** A message sent while a stage's session is running is delivered to that session, which works it into its stage as the method directs for feedback. The screen shows when the session read it. A message the stage's report (AC-PLAN-06) says was not worked in is applied as AC-TALK-02 says.
- [ ] **AC-TALK-02 — Feedback with no session to read it is applied before the next stage.** When no session is running, or a message can't be delivered to the running one, a fresh session applies the feedback before the next stage starts. The screen shows each message as waiting, read or applied.
- [ ] **AC-TALK-03 — Sending feedback never stops the run.** Feedback does not pause the run or hold back the running stage.
- [ ] **AC-TALK-04 — Feedback reaches every document already written.** The session that applies feedback works on all of the PRD's requirements documents that exist, so a change made after the technical design or the phase plan is written reaches them too. The requirements plan shows the commit that applied it.

### Stop once for an early review

The early review comes after the PRD is refined and before any design work, when a change costs least. It is the one place Kiln waits by default.

- [ ] **AC-EARLY-01 — Kiln has the early review made, opens it and waits.** When the PRD is refined (AC-PLAN-08), Kiln opens the stakeholder review made from it for the person and waits. While it waits, no session runs.
- [ ] **AC-EARLY-02 — The screen says this is the early review.** It says the review comes before the technical design, links to the review, says since when it has been ready, and says the review comes back at the end as the final review.
- [ ] **AC-EARLY-03 — The person answers in one of three ways.** They send feedback, pasted from the review's reply or in their own words. Or they continue to the technical design without feedback. Or they open a session of their own with the command shown, commit their changes and press **Resume** (AC-STAGE-04), which counts as feedback: Kiln has the review refreshed if that session changed what it is made from, then goes on as after feedback (AC-EARLY-04, AC-FINAL-03).
- [ ] **AC-EARLY-04 — One round of feedback, then on.** A fresh session works the feedback into the PRD, its assumptions and its mockups, refreshes the review and shows what changed. Kiln then carries on to the technical design without waiting, unless the person asked, when sending the feedback, to stop there again.
- [ ] **AC-EARLY-05 — One setting turns the wait off.** **Wait for me at the early review** is on by default, is set before Start and can be changed until the PRD's refinement finishes. When it is off, Kiln still has the early review made and carries on to the technical design, and feedback is taken whenever it comes (AC-TALK-02).

### Stop at the final review, and start the build from it

The final review is the last thing in the requirements and the place the build starts. One screen holds the review, the phase plan and the Start button, so there is no screen that only says continue.

- [ ] **AC-FINAL-01 — Kiln always stops before the build.** When the requirements are finished (AC-PLAN-08), Kiln stops at the final review (AC-STAGE-06), and the review it shows reflects the requirements as the last stage left them.
- [ ] **AC-FINAL-02 — The final review, the phase plan and Start are one screen.** The screen links to the refreshed review, which shows only what is still open, as the method makes it. It offers the same three ways to answer as the early review (AC-EARLY-03), and shows the phase plan with each phase's model and **Start the build**, as the screen before Start does for a build today.
- [ ] **AC-FINAL-03 — Feedback here comes back to the same screen.** A fresh session works the feedback into the PRD, the design and the phase plan and refreshes the review. Kiln then shows this screen again with the phase plan as it now stands.
- [ ] **AC-FINAL-04 — Starting the build is how the person says the review is done.** **Start the build** begins the build on the same feature branch, as Start does today. The build goes ahead on any assumption still unconfirmed, and the screen says how many there are.
- [ ] **AC-FINAL-05 — Kiln doesn't ask whether the PRD was refined when it ran the refinements.** Kiln asks for today's confirmation only when it didn't run every refinement the method called for on this PRD.
- [ ] **AC-FINAL-06 — A PRD with no phase plan is built in one session.** When the requirements finish without phase documents, because phase planning found the work fits one session or the method let a small change skip the design and the phase plan, the final review shows one build row for the whole PRD in place of the phase plan, with the model a phase with no rating gets, **Change** and **Start the build** (SCOPE-001). The build is one session on the feature branch, with what a phase session gets (AC-STAGE-04). Kiln then finishes it as it finishes a split PRD, except that no delivery audit runs, as the method skips it.
  - Replaces in part: AC-START-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a PRD whose requirements finished without phase documents, or without a technical design, is built, not stopped; the rest remains).

  Added in refinement.

### Run each stage on the right model

The design refinement is the longest stage and can use up a subscription's allowance on the most capable model, while the PRD stages are where a mistake costs most. Kiln's defaults follow that, and every one of them can be changed.

- [ ] **AC-MODEL-01 — Every stage row shows its model, with Change.** Each requirements stage shows the agent, model and effort it ran on, runs on or will run on. A stage that hasn't started can be changed from its row, exactly as a phase can, and a stage that has started keeps what it started with.
- [ ] **AC-MODEL-02 — Requirements stages default to the most capable model, and refining the design to one model down.** Model defaults gains the table's two rows, which work like its others and hold the choices shown until the person changes them. Kiln does not work out which family is most capable. A changed row reaches every stage that hasn't started and that the person hasn't changed.

  | Row | Applies to | First choice | Fallback |
  |---|---|---|---|
  | Requirements stages | Every requirements stage not on the row below, and the sessions that read the plan and apply feedback | Claude Code · Fable · high | Codex · GPT Astra · high |
  | Refining the design | From the stage that the plan, or the latest stage's report, expects to make the design ready (AC-PLAN-08), until a report says it is | Claude Code · Opus · high | Codex · GPT Sol · extra high |

  - Replaces in part: AC-DEFAULT-02 in `docs/changes/kiln-phase-model-tiers/kiln-phase-model-tiers-prd.md` (the page shows six rows, not four; the rest remains).
- [ ] **AC-MODEL-03 — A changed stage can be remembered for every PRD.** When changing a stage, the person can tick **Use this for {skill} on every PRD**, naming the skill the method names for that stage. Kiln remembers the choice against that skill and applies it to each stage the plan or the latest report says runs it, on every PRD on the computer.
- [ ] **AC-MODEL-04 — A remembered choice that no longer matches falls back, and says so.** When no stage in the plan runs the skill a remembered choice was saved against, the choice is not applied. A stage that replaced it runs on its row's default (AC-MODEL-02), and its row says a saved choice no longer applies, with Change beside it.
- [ ] **AC-MODEL-05 — Stage models can be changed from a terminal.** A stage's model, either requirements row of Model defaults and a remembered choice can each be set by a command.
- [ ] **AC-MODEL-06 — Requirements stages follow the rules a phase follows for its model.** A choice that can't be used stops the run and nothing runs in its place, and the fallback to the other agent applies to a stage that hasn't started, as Kiln Phase Model Tiers states for a phase.

### A home screen for everything Kiln can work on

A person opens Kiln without knowing a folder name and sees what is ready, what is under way and what is waiting for them.

- [ ] **AC-HOME-01 — `kiln new`, or `kiln` with nothing named, opens the home screen.** It opens Kiln's browser view on the home screen for where the command was run.
- [ ] **AC-HOME-02 — Ready to start lists source material nothing was written from yet.** Each item shows a name taken from the source material itself, which of the three kinds it is (AC-BEGIN-02) and where it is, with **Review and start**, which opens the screen before Start. A planned PRD is ready to start whatever it depends on, and its line says when its build has to wait for another PRD.
- [ ] **AC-HOME-03 — Not ready yet says why.** Each line names the one step left: committing the source material on the shared branch, or writing the intake record for material brought in.
- [ ] **AC-HOME-04 — Under way lists every unfinished PRD, at the stage it reached.** Each line says the stage reached; where the documents can't tell two stages apart, such as a PRD drafted or refined, it names the documents that exist. It also says whether the PRD was started by hand. Under way comes first, with anything waiting for the person at the top.
- [ ] **AC-HOME-13 — Each item is listed in one place, read from file names and Git.** Kiln reads only its own record of the PRDs it has run, the checkout and its worktrees, and Git on every branch, never the wording of commit subjects. It places each item by the first row that fits. A planned PRD's name is the directory its row gives.

  | What Kiln finds | Where it is listed |
  |---|---|
  | Any folder under `source-material/` or planned PRD with a PRD or an initiative written from it: Kiln started a PRD from it, or a PRD or initiative folder of its name exists on any branch | Not listed; what was written from it is placed below |
  | Source material not committed on the shared branch, or a folder holding the method's `received/` folder and no intake record (HOME-004) | Not ready yet |
  | Any other source material | Ready to start |
  | Any other folder under `source-material/` (HOME-004) | Not listed |
  | A PRD with a Kiln run not finished, a phase not yet built, the method's file for a refinement in progress or for feedback not yet applied, or documents only on a branch that hasn't merged | Under way |
  | A PRD with every phase built, or that Kiln built in one session (AC-FINAL-06) | Not listed |
  | Any other PRD | The folded group at the end (AC-HOME-12) |

  Added in refinement.

- [ ] **AC-HOME-05 — Each PRD opens in a Kiln of its own.** **Review and start**, **Review and continue** and **Open** each show the PRD in its own Kiln, at the PRD's own address, as `kiln run` would. The home screen stays open and starts nothing itself. Each Under way line shows its Kiln's state: working, waiting for the person, paused or not running. When a running Kiln's state can't be read, the line gives the address and says its state could not be read.
  - Replaces in part: AC-MULTI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a PRD opened from the home screen needs no terminal of its own; the rest remains).
- [ ] **AC-HOME-06 — The screen explains how to bring source material in.** A panel says what source material is, that other folders under `source-material/` are not listed (HOME-004), how much is enough, and that bringing it in is a conversation held in the person's own agent session. It gives a short prompt to paste there, with a copy button. The prompt names the Enso Method and asks the session to bring the material into `source-material/`, commit it on the shared branch and stop. The panel says the item then appears under Ready to start and Kiln takes it from the PRD on.
- [ ] **AC-HOME-07 — The list keeps itself current.** Source material committed while the home screen is open appears under Ready to start without the person reloading.
- [ ] **AC-HOME-08 — In a repository, the home screen covers the whole repository.** It lists the same items wherever in the repository the command was run.
- [ ] **AC-HOME-09 — In a folder of repositories, it covers each repository directly inside.** Run from a folder that is not a repository, the home screen shows one list across the repositories directly inside it. Each line names its repository, a row of filters narrows the list to one repository, and repositories with nothing found are named.
- [ ] **AC-HOME-10 — A PRD that changes several repositories is listed once.** It appears under the repository that holds its documents and names the others it changes.
- [ ] **AC-HOME-11 — With nothing found, the screen leads with bringing source material in.** The panel of AC-HOME-06 is the main content, with what a brief, raw material and something bigger than one PRD each become.
- [ ] **AC-HOME-12 — PRDs with nothing showing live work are folded away at the end.** The folded group holds the PRDs AC-HOME-13 puts there and says Kiln can't tell from the files whether they were built by hand or left unfinished (HOME-001). Opened, it lists them newest change first, each with the stage its documents reached and the date they last changed, and each opens like a PRD under way.

  Added in refinement.

### Explain it where people install Kiln

- [ ] **AC-GUIDE-01 — The public guide covers the requirements stages.** The README says Kiln can start from source material, what source material is and how to bring it in, where Kiln waits and stops, how to give feedback, and how stage models are chosen. It no longer says Kiln starts only where planning ends, and this repository's agent instructions no longer describe Kiln as driving only the implementation half.

## Out of Scope

- Running `requirements-intake` or `initiative-breakdown`. Gathering source material, sorting raw material and cutting an initiative stay with the person and their own session.
- Running a whole roadmap of PRDs, or several PRDs in one Kiln.
- A notification when a review is ready.
- A box in Kiln for typing a brief, and dropping a folder onto the page.
- Rewriting Kiln's public positioning, including its tagline and its "walk away" step. It is revisited once this is built; AC-GUIDE-01 adds to the README around it.
- Changes to the Enso Method. This work changes no skill, and each method change below is proposed to the method on its own. One is needed first: the method naming where a brief lives under `source-material/`, which AC-BEGIN-02 relies on. It goes to the technical design's Delivery section, "Before the build", and Kiln looks for the file name it sets, whichever copy of the method is installed. Nothing here waits for the other three: the PRD draft ending with its key statements, the entry skill bringing source material in on request, and the final stakeholder review coming after the phase plan.
