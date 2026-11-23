# PRD: Kiln Requirements Stages

**Source:** Doug's request and decisions, 2026-11-22 and 2026-11-23: let Kiln carry the requirements half of the Enso Method as well as the build, from writing the PRD to the phase plan, stopping only where a person's review is worth the wait.

**Changes:** [Kiln v1](../kiln-v1/kiln-v1-prd.md), which starts only from a PRD that is already refined, designed and split into phases. Builds on Kiln Phase Model Tiers (`docs/changes/kiln-phase-model-tiers/`, on its own branch until it merges), which owns the model shown on every plan row and the Model defaults page.

**Assumptions:** [Kiln Requirements Stages assumptions](kiln-requirements-stages-assumptions.md)

**Review alongside:** the mockups of [the home screen](mockups/kiln-requirements-stages-1-home.html), [the home screen with nothing found](mockups/kiln-requirements-stages-2-home-nothing-found.html), [the home screen from a folder of repositories](mockups/kiln-requirements-stages-3-home-folder-of-repositories.html), [before Start](mockups/kiln-requirements-stages-4-before-start.html), [before Start while the plan is read](mockups/kiln-requirements-stages-5-before-start-reading-the-plan.html), [running while the PRD is refined](mockups/kiln-requirements-stages-6-running-prd-refinement.html), [running after the method was updated](mockups/kiln-requirements-stages-7-running-after-method-update.html), [the early review](mockups/kiln-requirements-stages-8-early-review.html) and [the final review and Start](mockups/kiln-requirements-stages-9-final-review-and-start.html)

## Summary

Kiln can start from source material instead of a finished set of requirements. It writes the PRD, refines it, writes and refines the technical design and writes the phase plan, each in a fresh agent session using the Enso Method skill for that stage. It waits for the person once, at an early review made from the refined PRD, and always stops at a final review before the build. The person can give feedback at any moment without stopping anything, and the build never starts by itself.

Kiln also gets a home screen that lists what it can work on: source material ready for a PRD, and every PRD under way with the stage it reached. A PRD started by hand can be handed to Kiln at any stage, and every stage can still be run by hand.

## Business Context

Kiln starts today where planning ends. A person writes the PRD, refines it, writes and refines the technical design, makes the stakeholder review and splits the work into phases, each in its own chat, and only then runs `kiln run`. Between those chats the person does little except start the next one. The two refinements each run for hours, so a person who is away when one finishes loses that time. This is the same waiting Kiln removed from the build.

The requirements are also where a person's attention pays most, and reading is a real cost. Kiln therefore asks for one good review, placed where a change is cheapest, and forces no reading anywhere else.

The Enso Method changes often: its stages are split, merged and renamed. A Kiln installed before such a change must keep working with the method installed after it, and nobody should have to update the two together.

Six terms recur below:

- **Source material** is what a PRD is written from, committed in the repository: a brief with its mockups or prototype, a requirements intake record, or a planned PRD in an initiative.
- A **requirements stage** is one step of the Enso Method between source material and the build, such as writing the PRD or refining the design. Each runs in one agent session.
- The **requirements plan** is the list of requirements stages for one PRD, in order, shown before and during the run.
- The **installed method** is the copy of the Enso Method on the computer Kiln runs on.
- The **early review** and the **final review** are the two points where Kiln stops for the person: after the PRD is refined and before any design, and after the phase plan is written and before the build.
- The **shared branch** is the branch new work is cut from, which Kiln calls the base branch today.

## Acceptance Criteria

### Start from source material, or from wherever the work stands

A person points Kiln at what they have, and Kiln works out what comes next. There is no separate mode for requirements.

- [ ] **AC-BEGIN-01 — `kiln run` accepts source material.** `kiln run` followed by a source material folder opens Kiln's browser view on that work, as it does for a PRD folder today. A planned PRD is started from the home screen, or from a terminal by naming its initiative and the PRD.
- [ ] **AC-BEGIN-02 — Kiln starts only from source material it can name.** Kiln starts from the three kinds in the table. Anything else under `source-material/` is not started, and Kiln says which of the documents is missing.

  | Kind | What Kiln looks for |
  |---|---|
  | Brief | The brief file the Enso Method names for a folder under `source-material/` |
  | Intake record | `source-material/{name}/{name}-requirements-intake.md` |
  | Planned PRD | A row with status `planned` in `docs/initiatives/{name}/{name}-initiative-prds.md` |

- [ ] **AC-BEGIN-03 — Source material must be committed on the shared branch.** When the source material is not committed on the shared branch, Kiln says so, names what to commit and does not start.
- [ ] **AC-BEGIN-04 — A PRD started by hand continues from the stage it reached.** `kiln run` on a PRD folder whose requirements are not finished shows which requirements stages are done and which is next, and Start continues from the next one. Kiln does not run again a stage whose result is already in the documents.
- [ ] **AC-BEGIN-05 — A PRD that already has its phase plan starts as it does today.** Kiln adds no requirements stage and no review stop to a PRD whose phase plan was written before Kiln was pointed at it (REVIEW-001).
- [ ] **AC-BEGIN-06 — The feature branch and worktree are cut when the PRD draft starts.** Kiln cuts them from the shared branch as the first stage starts. The branch is named from the source material's folder, or from a planned PRD's directory (BEGIN-001). Every requirements stage and every build phase lands on that branch, and one pull request closes it.
- [ ] **AC-BEGIN-07 — Before Start shows what Kiln found.** For source material, the screen before Start lists the documents Kiln will write the PRD from, the commit they are at and the feature branch it will cut. Nothing runs until Start.

### See the whole plan before anything runs

A person sees every stage Kiln intends to run before pressing Start, as they see every phase of a build today. The list comes from the installed method, so it is right for the method the person actually has.

- [ ] **AC-PLAN-01 — The requirements plan lists every stage, then the build.** Before Start and while running, the plan shows each requirements stage in order, with the method's name for the skill it runs, followed by one row for the build. The two stops are marked on the stages they follow.
- [ ] **AC-PLAN-02 — The plan comes from the installed method, not from Kiln.** Kiln holds no list of the Enso Method's requirements stages or skills. With an installed method whose stages differ from today's, such as two stages merged into one or a skill renamed, Kiln shows and runs that method's stages with no change to Kiln.
- [ ] **AC-PLAN-03 — The plan is read once and kept until the installed method changes.** Reading the plan starts when the home screen opens or `kiln run` starts, whichever is first. Kiln reuses what it read for every PRD until the installed method changes, and then reads it again. The screen says the plan was read from the installed method and when that method was last updated. It shows no version number, because the method has none. **Read again** reads it on request.
- [ ] **AC-PLAN-04 — While the plan is being read, the screen says so.** It shows that Kiln is reading the plan and how long it has taken, and states what holds whatever the plan turns out to be: the wait at the early review, the stop at the final review, and that the build never starts by itself.
- [ ] **AC-PLAN-05 — A plan that can't be read doesn't block Start.** Kiln says the plan could not be read and why. Start still works, and the plan fills in as stages run.
- [ ] **AC-PLAN-06 — What runs is decided at each stage, and the plan follows.** Each stage's session finds where the PRD stands, runs the next stage, and reports what it ran and what the method puts next. When that differs from the plan, Kiln corrects the plan and says what changed.
- [ ] **AC-PLAN-07 — A method updated during a run changes the plan, not the work done.** When the installed method changes while a PRD is running, Kiln reads the plan again before the next stage starts. A notice says when the method was updated and what changed in the plan. Finished stages keep their record, and the run carries on.

### Run each stage in its own session

Each requirements stage runs like a build phase: one fresh session, in the feature's worktree, checked before Kiln moves on.

- [ ] **AC-STAGE-01 — One fresh session for each stage.** Kiln starts a new agent session in the worktree for each requirements stage, and the session uses the installed method to run it.
- [ ] **AC-STAGE-02 — A stage is finished only when its work is on the feature branch.** Kiln moves on when the stage's session has reported it finished and the stage's documents are committed on the feature branch. Kiln then pushes the branch. A stage that ends any other way stops the run at **Needs you**, as a phase does.
- [ ] **AC-STAGE-03 — The running screen shows every stage's state.** Each finished stage shows how long it took and the commit it pushed. The running stage shows the skill it is running, its model and how long it has run. The stages still to come are listed after it.
- [ ] **AC-STAGE-04 — A stage session gets what a phase session gets.** Each control and safeguard in the table works for a requirements stage as it does for a phase.

  | Today, for a phase | For a requirements stage |
  |---|---|
  | **Message Claude** | Delivers a message to the running stage's session |
  | **Pause now** | Stops the stage's session so it can be resumed |
  | **Needs you**, with the reply box, the takeover command and **Resume** | The same screen, for a stage |
  | A usage limit reached | The same wait or fallback, by the person's settings |
  | The terminal closed or Ctrl+C | `kiln run` again continues from the stage that was running |
  | Billing shown and approved before Start | Covers the requirements stages too |

- [ ] **AC-STAGE-05 — The terminal shows and controls the same things.** `kiln status` shows the requirements stage a PRD is at and either review it is waiting at. Sending feedback, continuing past the early review and starting the build each have a command that does what the screen's control does.
- [ ] **AC-STAGE-06 — The build never starts by itself.** When the last requirements stage finishes, Kiln is at the final review. No setting and no command given earlier makes Kiln go on to the build without the person starting it there.

### Show what the PRD hangs on, without waiting

A person can catch a wrong turn minutes after the draft, before hours of refinement are spent on it, and is never made to read anything.

- [ ] **AC-NOTE-01 — The draft's key statements are shown while the refinement runs.** When the PRD is drafted, the running screen shows the few statements the PRD hangs on and what it leaves out, as the draft's session reported them, marked as not waiting for an answer. The run carries on whether or not the person reads them.
- [ ] **AC-NOTE-02 — The early review replaces them.** When the early review is ready, the key statements are no longer shown.

### Give feedback at any time

There is one rule for the person: say it whenever it comes to mind, and never stop anything to say it.

- [ ] **AC-TALK-01 — The running screen takes feedback during every requirements stage.** A message sent while a stage's session is running is delivered to that session, and the screen shows when the session read it.
- [ ] **AC-TALK-02 — Feedback with no session to read it is applied before the next stage.** When no session is running, or a message can't be delivered to the running one, a fresh session applies the feedback before the next stage starts. The screen shows each message as waiting, read or applied.
- [ ] **AC-TALK-03 — Sending feedback never stops the run.** Feedback does not pause the run or hold back the running stage.
- [ ] **AC-TALK-04 — Feedback reaches every document already written.** The session that applies feedback works on all of the PRD's requirements documents that exist, so a change made after the technical design or the phase plan is written reaches them too. The plan shows the commit that applied it.

### Stop once for an early review

The early review comes after the PRD is refined and before any design work, when a change costs least. It is the one place Kiln waits by default.

- [ ] **AC-EARLY-01 — Kiln makes the early review, opens it and waits.** When the PRD is refined, Kiln has the stakeholder review made from it, opens it for the person and waits. While it waits, no session runs.
- [ ] **AC-EARLY-02 — The screen says this is the early review.** It says the review comes before the technical design, links to the review, says since when it has been ready, and says the review comes back at the end as the final review.
- [ ] **AC-EARLY-03 — The person answers in one of three ways.** They send feedback, pasted from the review's reply or in their own words. Or they continue to the technical design without feedback. Or they open a session of their own with the command shown and press **Resume** when done, as at Needs you.
- [ ] **AC-EARLY-04 — One round of feedback, then on.** A fresh session works the feedback into the PRD, its assumptions and its mockups, refreshes the review and shows what changed. Kiln then carries on to the technical design without waiting, unless the person asked, when sending the feedback, to stop there again.
- [ ] **AC-EARLY-05 — One setting turns the wait off.** **Wait for me at the early review** is on by default, is set before Start and can be changed until the PRD's refinement finishes. When it is off, Kiln still has the early review made and carries on to the technical design, and feedback is taken whenever it comes (AC-TALK-02).

### Stop at the final review, and start the build from it

The final review is the last thing in the requirements and the place the build starts. One screen holds the review, the phase plan and the Start button, so there is no screen that only says continue.

- [ ] **AC-FINAL-01 — Kiln always stops before the build.** Once the phase plan is written and the stakeholder review has been refreshed after the design, Kiln stops and waits, whichever order the installed method runs those two in. No setting turns this stop off.
- [ ] **AC-FINAL-02 — The final review, the phase plan and Start are one screen.** The screen links to the refreshed review, offers the same three ways to answer as the early review, and shows the phase plan with each phase's model and **Start the build**, as the screen before Start does for a build today.
- [ ] **AC-FINAL-03 — Feedback here comes back to the same screen.** A fresh session works the feedback into the PRD, the design and the phase plan and refreshes the review. Kiln then shows this screen again with the phase plan as it now stands.
- [ ] **AC-FINAL-04 — Starting the build is how the person says the review is done.** **Start the build** begins the build on the same feature branch, as Start does today. The build goes ahead on any assumption still unconfirmed, and the screen says how many there are.
- [ ] **AC-FINAL-05 — Kiln doesn't ask whether the PRD was refined when it ran the refinements.** The confirmation Kiln asks for today is shown only when Kiln did not run both refinements for this PRD.

### Run each stage on the right model

One model for every requirements stage is not enough. The design refinement is the longest stage and can use up a subscription's allowance on the most capable model, while the PRD stages are where a mistake costs most.

- [ ] **AC-MODEL-01 — Every stage row shows its model, with Change.** Each requirements stage shows the agent, model and effort it ran on, runs on or will run on. A stage that hasn't started can be changed from its row, exactly as a phase can, and a stage that has started keeps what it started with.
- [ ] **AC-MODEL-02 — One default covers every requirements stage.** Model defaults has one choice for requirements stages. Kiln comes with it set to the choice it ships for demanding phases (MODEL-001). Changing it reaches every stage that hasn't started and has no choice of its own.
- [ ] **AC-MODEL-03 — A changed stage can be remembered for every PRD.** When changing a stage, the person can tick **Use this for {stage} on every PRD**. Kiln remembers the choice against the skill the method names for that stage and applies it to that stage on every PRD on the computer.
- [ ] **AC-MODEL-04 — A remembered choice that no longer matches falls back, and says so.** When no stage in the plan runs the skill a remembered choice was saved against, the choice is not applied. A stage that replaced it runs on the default, and its row says a saved choice no longer applies, with Change beside it.
- [ ] **AC-MODEL-05 — Stage models can be changed from a terminal.** A stage's model, the default for requirements stages and a remembered choice can each be set by a command.
- [ ] **AC-MODEL-06 — Requirements stages follow the rules a phase follows for its model.** A choice that can't be used stops the run and nothing runs in its place, and the fallback to the other agent applies to a stage that hasn't started, as Kiln Phase Model Tiers states for a phase.

### A home screen for everything Kiln can work on

A person opens Kiln without knowing a folder name and sees what is ready, what is under way and what is waiting for them.

- [ ] **AC-HOME-01 — `kiln new`, or `kiln` with nothing named, opens the home screen.** It opens Kiln's browser view on the home screen for where the command was run.
- [ ] **AC-HOME-02 — Ready to start lists source material with no PRD yet.** Each item shows its name, which of the three kinds it is (AC-BEGIN-02) and where it is, with **Review and start**, which opens the screen before Start. A planned PRD is ready to start whatever it depends on, and its line says when its build has to wait for another PRD.
- [ ] **AC-HOME-03 — Not ready yet says why.** A folder under `source-material/` that Kiln can't start from is listed with the reason from the table.

  | What Kiln found | What the line says |
  |---|---|
  | A folder holding neither a brief nor an intake record | Which two documents Kiln starts from, and that neither is there |
  | Source material that is not committed on the shared branch | That it exists only in the working copy, and to commit it |

- [ ] **AC-HOME-04 — Under way lists every unfinished PRD with the stage it reached.** A PRD is under way when its requirements stop short of a phase plan, when its phase plan has a phase not yet built, or when Kiln has a run for it that hasn't finished. A PRD with no phase plan and no Kiln run, whose documents last changed more than 30 days ago, is listed under a collapsed **Older** heading instead, because Kiln can't tell a small PRD built by hand from one left unfinished (HOME-001). Each line says the stage reached, whether it is running, not running or waiting for the person, and whether it was started by hand. Opening one shows its screen, and nothing starts without the person.
- [ ] **AC-HOME-05 — A PRD another Kiln is running says so.** Its line says it is running and gives the address of the Kiln that is running it. It can't be started a second time (HOME-002).
- [ ] **AC-HOME-06 — The screen explains how to bring source material in.** A panel says what source material is, how much is enough, and that bringing it in is a conversation held in the person's own agent session. It gives a short prompt to paste there, with a copy button. The prompt names the Enso Method and asks the session to bring the material into `source-material/`, commit it on the shared branch and stop. Kiln has no box for typing a brief.
- [ ] **AC-HOME-07 — The list keeps itself current.** Source material committed while the home screen is open appears under Ready to start without the person reloading.
- [ ] **AC-HOME-08 — In a repository, the home screen covers the whole repository.** It lists the same items wherever in the repository the command was run.
- [ ] **AC-HOME-09 — In a folder of repositories, it covers each repository directly inside.** Run from a folder that is not a repository, the home screen shows one list across the repositories directly inside it. Each line names its repository, a row of filters narrows the list to one repository, repositories with nothing found are named, and Under way comes first with anything waiting for the person at the top.
- [ ] **AC-HOME-10 — A PRD that changes several repositories is listed once.** It appears under the repository that holds its documents and names the others it changes.
- [ ] **AC-HOME-11 — With nothing found, the screen leads with bringing source material in.** The panel of AC-HOME-06 is the main content, with what a brief, raw material and something bigger than one PRD each become.

### Explain it where people install Kiln

- [ ] **AC-GUIDE-01 — The public guide covers the requirements stages.** The README says Kiln can start from source material, what source material is and how to bring it in, where Kiln waits and stops, how to give feedback, and how stage models are chosen. It no longer says Kiln starts only where planning ends, and this repository's agent instructions no longer describe Kiln as driving only the implementation half.

## Out of Scope

- Running `requirements-intake` or `initiative-breakdown`. Gathering source material, sorting raw material and cutting an initiative stay with the person and their own session.
- Running a whole roadmap of PRDs, or several PRDs from one Kiln.
- A notification when a review is ready.
- A box in Kiln for typing a brief, and dropping a folder onto the page.
- A terminal command that prints the home screen's list. `kiln run` and `kiln status` cover starting and following work from a terminal.
- Changes to the Enso Method. Kiln works with the installed method as it is. The method naming where a brief lives under `source-material/`, which AC-BEGIN-02 relies on, goes to the technical design's Delivery section, "Before the build". Three other method changes that would help are proposed to the method on their own and nothing here waits for them: the PRD draft ending with its key statements, the entry skill bringing source material in on request, and the final stakeholder review coming after the phase plan.
