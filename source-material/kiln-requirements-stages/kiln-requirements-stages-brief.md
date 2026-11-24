# Brief: Kiln runs the requirements stages

Source material for a PRD. Nothing here is a requirement until the PRD states it.

## What this is

Kiln starts today where planning ends. A person writes the PRD, refines it, writes and
refines the technical design, makes the stakeholder review and splits the work into
phases, each in its own chat, and only then runs `kiln run`. Between those chats the
person does little except paste the next prompt. That is the same babysitting Kiln
removed from the build.

This change lets Kiln carry those stages too. Given source material for one PRD, Kiln
runs each requirements stage in a fresh session, in the method's order, and stops where a
person's judgment is worth the wait. It stays optional. Every stage is an Enso Method
skill that a person can still run by hand, and a PRD started by hand can be handed to
Kiln at any stage.

## The stages Kiln runs

1. Write the PRD (`prd-writing-standards`)
2. Refine the PRD (`autonomous-prd-refinement`)
3. Early stakeholder review, made from the refined PRD (`stakeholder-review-package`)
4. Technical design (`technical-design-writing-standards`)
5. Design review (`review-technical-design`)
6. Refine the design (`autonomous-design-refinement`)
7. Phase plan (`phase-split`)
8. Final stakeholder review, the same page refreshed (`stakeholder-review-package`)

The phase plan comes before the final review on purpose. It takes a few minutes, it can
split a compound criterion in the PRD, and putting it first makes the final review the
last thing in the requirements and the place the build starts from. Kiln always stops
there. The final review, the phase plan and the Start button are one screen, with the
same ways to give feedback as the early review, so there is no separate screen that only
says continue. The build never starts by itself.

Everything before stage 1 stays manual: gathering source material, `requirements-intake`
for raw material, and `initiative-breakdown` for anything bigger than one PRD.

## Where a person comes in

The requirements half is where attention pays most, and reading is a real cost. The
design aims for one good review, placed where it is cheapest, and no forced reading
anywhere else.

- **After the PRD is drafted, a short note and no wait.** The few statements the PRD
  hangs on, and what is left out, are shown while the refinement runs. Nothing waits on
  it. It is the same shape as the stakeholder review's "What we're building", and the
  review replaces it when it is ready.
- **After the PRD is refined, Kiln makes the early stakeholder review, opens it and
  waits.** Waiting here spends nothing, and no design work is done on requirements that
  may change. The person gives feedback or continues. The screen says plainly that this
  is the early review, before any design.
- **One round.** After feedback is worked in, Kiln carries on to the technical design
  without asking for a second read, unless the person asked to see it again.
- **A setting at Start turns the early wait off**, for overnight runs and for several
  PRDs at once. Kiln still makes the early review, carries on, and takes feedback
  whenever it comes.
- **Kiln always stops at the final review.** It shows only what is still open. Feedback
  given there is worked into the PRD, the design and the phase plan, and the person
  comes back to the same screen. Starting the build is how the person says the review is
  done.

## Giving feedback

One rule for the person: say it any time, and never stop anything to say it.

- While a session is running, Kiln delivers the message to that session, which reads it
  at its next opportunity. This is the existing Message Claude.
- Where a live message isn't available, or no session is running, Kiln applies the
  feedback in a fresh session before the next stage starts.
- At the review stop, the person can paste the reply the review produces, write in their
  own words, or open a session of their own and press Resume when done, as at Needs you
  today.
- Feedback that changes what the PRD says goes through `assumptions-document-feedback`,
  which already carries a changed answer into a design that exists.

## Starting: a home screen

`kiln new`, or `kiln` with no PRD named, opens a home screen for the repository. It
lists what Kiln found, by reading file names and Git only:

- **Ready to start.** Source material committed on the shared branch with no PRD yet.
  Each kind is a file the method names, so Kiln tells them apart by file name alone:
  - an intake record, `source-material/{name}/{name}-requirements-intake.md`;
  - a planned PRD, a row with status `planned` in
    `docs/initiatives/{name}/{name}-initiative-prds.md`. Its Depends on gates its build,
    not its writing, so it is ready to start whatever it depends on;
  - a brief. The method does not name a file for one today. This screen depends on the
    method change below that does.
- **Not ready yet**, with the reason: a folder under `source-material/` holding neither
  a brief nor an intake record, or source material that isn't committed. Kiln cannot
  tell what the files in such a folder are, and does not guess.
- **Under way.** Every PRD with the stage it reached, whether Kiln or a person took it
  there. Kiln continues from that stage. The method's entry skill already defines how a
  stage is read from the documents and commit subjects.

When what the person wants isn't listed, the screen explains what source material is and
gives a short prompt to paste into their own agent session. That session brings the
material into the repository and commits it, and the item then appears as ready. This
step is a conversation, so it stays in the person's own session. The prompt is short
because it points at the method and holds no procedure of its own.

Kiln has no box for typing a brief. A paragraph is not enough to write a PRD from, and
the screen should say what is: several paragraphs on what is wanted and why, with
mockups or a prototype for anything that has a screen.

`kiln run <folder>` keeps working, for a PRD folder at any stage and for a source
material folder.

The home screen covers one repository: the whole repository the command was run in, not
only the folder below where it was run. Requirements live in one repository even when
the build changes several, so a PRD that crosses repositories appears once, under the
repository that holds its documents, and says which others it changes. Run from a folder
that is not a repository but holds several, the home screen looks in each repository
directly inside it and shows the same three sections as one list. Each line names its
repository, a row of repository filters narrows the list, and work waiting for the
person comes first.

## Branches

Source material is committed on the shared branch, by the person or their session. Kiln
cuts the feature branch and its worktree when the PRD draft starts. The requirements and
the build both land on that branch, and one pull request closes it, so Kiln still pushes
only to feature branches.

## A method change must not break Kiln

The method changes often. Splitting, merging or renaming its requirements skills, such
as folding the design draft, design review and design refinement into two, must not
break a Kiln that was installed before the change, and must not need Kiln and the method
updated together. The completion audits already work this way: Kiln checks the outcome
and the installed skill owns the procedure.

The agreed approach, drawn on the screens. Its mechanics are for the PRD and the
technical design:

- Kiln holds no list of requirements skills. Each session is told to use the method's
  entry skill to find where the PRD stands, run the next stage and stop, and it runs
  whatever version is installed.
- Each session ends with a small report in a form Kiln owns, as an audit does: what it
  ran, in the method's own name for it, and which milestone the PRD has now reached.
- Kiln knows milestones, not stages: the PRD is refined, the design is ready, the phase
  plan is written, a stakeholder review was made. Its two stops hang off those.
- The person still sees the whole plan before Start, as with the phase plan. A short
  session reads the installed method's own map and lists the stages and the skill each
  runs. Kiln keeps that list until the installed method changes, shows where it came
  from, and corrects it when a stage's session reports a different next stage. The list
  is for showing. What actually runs is decided by each session, so a wrong or unreadable
  list delays nothing.
- The method has no version numbers: whatever is installed is the latest. Kiln tells
  that the installed method changed from the installed files themselves, and the screens
  say when it was last updated, never a version.
- The eight stages listed above are therefore today's method, not a list Kiln depends on.
- Reading the plan starts when the home screen opens, so the wait is rarely seen.
- The home screen reads a PRD's place from which documents exist, not from the wording
  of commit subjects.

## A model for each stage

One model for every requirements stage is not enough. The design refinement is the
longest stage and follows two passes by the most capable model, so it is normally run on
a cheaper one, and running it on the most capable model can use up a subscription's
allowance. The PRD stages are where a mistake costs most, so they stay on the most
capable model.

Each stage row shows the model it will run on, with Change, exactly as a phase row does.
There is one default for requirements stages on the Model defaults page. Changing a
stage can be remembered for that stage on every PRD. A remembered choice is matched to
the skill the method names for the stage. When the method renames or merges that stage,
the choice no longer matches, the stage runs on the default, and the screen says so.

## What the Enso Method needs

Each of these helps someone running the method by hand, and is proposed on its own. The
method gains no step that depends on Kiln.

- `prd-writing-standards` ends a draft by stating the few things the PRD hangs on and
  what it leaves out, and says plainly that it is not waiting for an answer.
- The storage convention says where a plain brief and its mockups live under
  `source-material/`. Today it places intake records, handoff packages and initiative
  briefs, and the refinement already looks there for a brief.
- The entry skill can be asked to bring source material in and stop, so the prompt on
  the home screen can stay a pointer.
- The method's order puts the final stakeholder review after the phase plan. Today it is
  the other way round, and `phase-split` can change a criterion after the review was
  made, which leaves the review stale.

## Not part of this

- Running `requirements-intake` or `initiative-breakdown`.
- Running a whole roadmap of PRDs, or several PRDs at once from one Kiln.
- Starting the build without a person.
- Notifications when the review is ready. That is its own roadmap idea, and this change
  makes it more useful.

## Still to settle in the PRD

- What `autonomous-prd-refinement` and `autonomous-design-refinement` do with a message
  that arrives mid-run, and whether either skill needs a line for it.
- The name a piece of work shows before its PRD has a title, and how the feature branch
  is named from it.
- Whether Kiln ships with any stage on a cheaper model, or every stage starts on the
  default until the person changes it. Shipping one would need the method to say which
  stages don't need the most capable model, which also helps someone running it by hand.
- What the home screen shows for a PRD another Kiln is already running.
- How the README and this repository's agent instructions describe Kiln once it is no
  longer only the implementation half.

## Screens

Nine screens were drawn on a design canvas, on top of the per-phase models version of the
Start and running screens. Their sources are in `design-canvas-sources/` in this folder,
one file per screen, placed by `canvas.json`:

- 1. Home (`Main`), 2. Home with nothing found (`HomeEmpty`), 2b. Home from a folder of
  repositories (`HomeFolder`).
- 3. Before Start, with the plan read from the method and a model on every stage
  (`AltBeforeStart`), and 3a. the same screen while Kiln reads the plan (`AltReading`).
- 4. Running, while the PRD is refined (`Refining`), and 4b. running after the method
  was updated part way through (`AltRunning`).
- 5. The early review, before the design (`YourReview`).
- 6. The final review with the phase plan and the Start button (`ReadyToBuild`).
