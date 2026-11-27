# Changelog

What changed in each Kiln release, newest first. Each release's GitHub Release shows its
section, and the newer version notice in Kiln's top bar links here.

Work merged since the last release goes under Unreleased. Preparing a release renames that
section to the new version.

<!-- Kiln 1.0.1, 1.1.5, 1.2.0, 1.2.1 and 1.5.0 were prepared but never published; their changes shipped in 1.0.2, 1.1.6, 1.2.2 and 1.5.1. -->

## [Unreleased]

### Added

- When a test audit plans its test fixes as batches, the phase plan shows a row for each batch
  as soon as the audit ends, so you can see how many fixing sessions are coming. The audit's
  row says how many test gaps it found and how many batches it planned, each batch row names
  its batch and its number of gaps.

### Changed

- A loop is named with its maximum, "loop 1 · max 4", wherever "loop 1 of 4" appeared: the
  phase plan, the status line, `kiln status`, the finished page and each pull request's
  description. The **Audit loops** help now says a run makes only the loops it needs.
- `kiln status` lists the batches of test fixes not yet started, with the new `planned` state.
- Start no longer stops with "What Start would do has changed" when something moved after the
  page loaded. Kiln starts from what it finds, and **Settings for this PRD** says which commit it
  started from and what changed, such as new commits on the base branch.
- Start pauses only when you start from a branch that already exists and that branch got new
  commits, or its worktree changed, after the page loaded. The page says nothing has started
  and what changed, with a **Start anyway** button.
- When Start can't go ahead, a **Can't start** message beside the button says what is wrong and
  what to do, naming the setting or the failed check.
- Pressing Start while Kiln is still checking the base branch now waits for the check.

## [1.5.1] - 2026-11-26

Phases pick their model from their tier, Kiln finds repositories wherever they are checked out, and
a finished run can merge its pull requests and bring your base branch up to date. Kiln 1.5.0 did
not reach npm; its changes ship here.

### Added

- Model tiers. Kiln picks the agent, model and effort for each phase from its phase document's
  `**Model tier:**` line, **demanding**, **standard** or **mechanical**, instead of one choice
  for the whole PRD. A phase without the line is **Not rated** and runs as standard. Each phase
  row shows its tier and the model it will run on, runs on or ran on, and **Change** sets a
  phase that hasn't started; `kiln model` does the same from the command line. The preflight,
  audits and pull request session share one **Audits** choice.
- **Model defaults**, a page holding the first choice and fallback behind each tier and Audits
  for every PRD on this computer, also set with `kiln model-defaults`. A computer with only
  Codex installed needs no setup.
- **Use the fallback when usage is nearly out**, off by default. With it on, an activity about
  to start launches on the other agent when the first choice's account reads at or above a
  threshold, 95% unless changed. The row shows a **Fallback** tag and says which limit read
  what. The fallback spends the other agent's account.
- A phase document's `**Repositories:**` line can name a repository by the path in its remote
  address, such as `acme-labs/admin`, which is the same on every computer. Kiln finds that
  repository's checkout by its `origin`, beside the PRD's repository or in the folders above it
  up to your home folder, without asking the system for access to Desktop, Documents, Downloads
  or other guarded folders. Lines that use folder names keep working as before.
- When Kiln can't find a checkout, or finds more than one, Documents found asks where it is or
  which to use, and Kiln remembers the answer on this computer for every PRD that names that
  repository. **Change** on the row asks again. The terminal says how many repositories need
  locating, and Start waits until each is answered.
- Two repositories with the same name under different organizations get separate worktree
  folders and are shown by their whole path, such as `acme/admin` and `acme-labs/admin`.
- After Start, `kiln add-repository acme-labs/admin` asks for a repository by the path in its
  remote address. When Kiln can't tell where it is, it tells the session where it searched and
  adds nothing, and the phase's next Needs you stop asks you where it is. A phase that comes to
  name such a repository stops before it starts and asks the same way; once answered, Kiln adds
  the repository and starts the phase.
- `kiln locate-repository` answers that question from the command line, and `kiln status`
  lists it with the command to run.
- **Merge with {agent}**: when every phase is done and the pull requests are open, one press
  starts a session that brings the base branch in, resolves conflicts, runs the project's
  checks, waits for GitHub's required checks and merges each pull request in order. The press
  authorizes that delivery only. `kiln merge <PRD-path>` does the same.
- **Exit Kiln** on a finished run's page closes Kiln without Ctrl+C, leaving pull requests,
  branches, worktrees and records as they are. `kiln exit <PRD-path>` does the same.
- A finished run whose pull request hasn't merged says it is waiting to merge, with
  **Merged it yourself? Check now**. Once Kiln sees the merge it checks for new phases
  itself, and the header reads **Merged** or **New phases found**. `kiln status` shows these
  states and controls.
- Once the delivery has merged, Kiln brings your checkout's base branch up to date with
  GitHub, fast-forward only. If the checkout has uncommitted changes or commits of its own,
  Kiln leaves it as it is, and the Merged card says how many commits it is behind and the
  command to run.

### Changed

- The PRD-wide agent and model choice is replaced by per-phase choices. A PRD's saved choice is
  kept on its phases as **Changed by you**, except Kiln's old default on a PRD not yet started.
- Documents found shows each repository's address path and the folder its checkout is in, and
  its passed check reads "Repositories found on this computer". A full remote address or a
  path on one computer on a `**Repositories:**` line is now refused with the name to use.
- A finished PRD whose documents gained phases afterwards offers one **Continue**, which
  pushes the plan before building them, in place of reconciling the documents.
  `kiln continue-with-phases` pushes too.
- Closing audits are named **Delivery audit** and **Test audit** with **Loop n of limit**, and
  the sessions fixing a test audit's findings read **Fixing tests**. "Round" and
  "Continuation" no longer appear.

### Fixed

- Stopping Kiln while it was still checking a branch for an open pull request no longer leaves
  a `gh` command running after Kiln exits.

- A finished run whose pull request hasn't merged no longer shows "Plan needs reconciliation".

- When a restarted run's setup can't be finished and Kiln returns to Documents found, Ctrl+C
  no longer leaves that setup's `claude` account and skill reads running after Kiln exits.
- Kiln no longer refuses a PRD whose retired criterion names the criteria that replaced it,
  such as `AC-X-03 — retired, split into AC-X-09 and AC-X-10`. Starting from a branch with
  such a PRD failed with "doesn't have this PRD's documents", and its audits could not start.
  When Kiln can't read a PRD's acceptance criteria, Documents found now says that and why,
  instead of saying the documents are missing.
- Fable no longer goes missing from Claude Code's models when Kiln reads them before Claude
  Code has loaded its model catalog. Kiln left Fable out of the Model list, and phases set to
  Fable said "Claude Code doesn't offer Fable on this account" until the next read, five
  minutes later.

## [1.4.0] - 2026-11-21

### Added

- **Pause now** and **Pause after {activity}** replace **Pause & take over**. Pause now stops
  after the command the session is running, never interrupting it, and Cancel undoes it until
  that stop. While Kiln is pausing, the page says what it is waiting for and that you can close
  the lid. Once stopped, a calm **Paused** page offers both ways on, side by side: **Resume**,
  which carries on in the same conversation, or the command to take that conversation over in
  your terminal. Pause after lets the current phase or audit finish first.
- `kiln check-for-new-phases` checks a finished run for new phases, as the finished page's
  **Check for new phases** button does, and `kiln continue-with-phases` continues the run with
  the phases it offers. `kiln status` shows the offer, with its phases, whether it is ready and
  its proposal ID.
- `kiln status` lists `kiln handoff` among its controls, with whether it can open the run's
  session in a terminal and why not, even when Kiln isn't running.

### Changed

- A loop is now one run of an audit, and the settings are **Max delivery audit loops** and
  **Max test audit loops**, both 4 by default. Kiln builds whatever each audit finds, and once a
  kind of audit has used its last loop it moves on instead of stopping to ask: from the delivery
  audit to the test audit, and from the test audit to the pull request. The run's page says
  which loop is running, such as **Delivery audit loop 2 of 4**.
- An audit now stops the run only for what the work cannot go on without: a critical finding
  the next step would make worse stops it at once, and a blocker or a business question with no
  workable answer holds it before the pull request until you provide what it asks and press
  **Continue anyway**. Everything else an audit lists for you is reported with the delivery.
  Each item says its kind, the problem, what to do and what waits on it.
- Each pull request's description now opens with **For you**, listing what is left for you,
  and **Closing audits**, saying how many loops of each audit the run used, such as "Delivery
  audit: 4 of 4 loops. Test audit: 2 of 4 loops." The finished page and `kiln status` show the
  same. The **Remaining human actions** card is gone; those actions are listed under **For you**.
- A pull request that is already open, including one you opened yourself, no longer completes
  the run on its own: Kiln runs a pull request session that writes this run's **For you** and
  **Closing audits** into its description first. When an out-of-date description is all that
  stops final delivery, Check again starts that session, and you can mark final delivery complete
  without checking again first.
- `kiln run` now says "Checking where things stand…" in the terminal while it checks the
  work at startup. Rechecking a phase that needs you can take half a minute, and
  before, the terminal showed nothing while it did. The line disappears once Kiln has its answer.
- Buttons that take a while, such as Resume, Start, Send reply & continue, Check again, Mark
  complete and Reset, now show they are working. The pressed button keeps its full color and
  shows a spinner. A short line beneath it says what Kiln is doing, for example launching a new
  Claude Code or Codex session, and after 8 seconds it also shows how long it has been waiting.
  Before, the button just faded, which looked like the page had hung.

### Fixed

- While the preflight runs, its card is now headed "Preflight check" with PF in its circle.
  Before, the circle overflowed with the preflight's internal id, and the card listed a phase's
  build steps (Build, Deliverable review and so on), which the preflight doesn't have.

### Removed

- The loop stop page, with **Allow N more loops** and **Accept what is left and deliver**, and
  the commands `kiln allow-more-loops` and `kiln accept-and-deliver`, which now refuse with a
  message saying to change the limits with `kiln settings`.
- The **After the last test audit loop** setting and its `--after-last-test-audit-loop` flag,
  the sentence accepting Weak test rows, and the `kiln status` fields that described them. Test
  rows still missing, failing or Weak after the last test audit's work are listed under **For you**.

## [1.3.0] - 2026-11-16

### Added

- Audit loop limits. Before Start, Documents found has an **Audit loops** section: how many
  times the delivery audit and the test audit can send Kiln back for more work on its own (3 of
  each by default), and what happens after the last test audit loop: deliver unless something
  serious is left, or always stop and ask. When a limit is reached Kiln stops at Needs you with
  what the loops did and what the audit found, and you can **Allow N more loops**, take the audit
  over, or, after the test audit, **Accept what is left and deliver**. The limits can be changed
  while Kiln runs, from the page or with `kiln settings`, and `kiln allow-more-loops` and
  `kiln accept-and-deliver` do the same from the command line. A run already under way when
  Kiln is updated counts the loops it has made and stops and asks after the last one.
- Build preflight. Before a run starts work, Kiln runs the Enso Method's `build-preflight`
  skill in a session of its own, after each Start, Continue or Resume, to check that the access
  the plan needs is working, that this machine can build and test the project, and that nothing
  planned will stop the run without warning. It shows as a **Preflight** row in the plan. A clean
  preflight goes straight on, and its row says **Ready**. When it finds things to settle, Kiln
  stops at Needs you with the numbered items and the command that reopens the session in a
  terminal; **Check Preflight again** (`kiln check-again`) runs a fresh one, and **Mark complete**
  (`kiln waive-and-advance --confirm`) goes on with the items as they are. A method without the
  skill runs as before, and a preflight that ends without a report shows **No report** and the
  run goes on. The preflight changes nothing in the repository.
- Phases planned as needing a person. A phase whose document has an `**Attended:**` line shows a
  **Needs you there** marker beside its name on Documents found and in the phase plan, and a stop
  in that phase opens with a card saying so. Such a phase runs like any other.
- Documents found warns, beneath **Allow early merges**, when a phase this run will build has an
  `**Early merge:**` line and early merges are off, naming each phase where the run would stop.

### Changed

- A new PRD on Claude Code now starts at **Medium** effort instead of High. Codex still starts
  at High, and a PRD whose settings were already saved keeps its effort.
- A development build now names the commit it was built from, and when, with the time zone:
  `kiln --version` prints `1.2.2 · dev c363f8f · built Nov 14, 12:55 PM EST`, and the browser's
  top bar shows the same beside the version, in the browser's time zone. A build made from a
  checkout with uncommitted changes adds `(modified)`. Release builds still show the version alone.
- At Needs you, the rows saved when Kiln stopped are now labelled **Why Kiln stopped**, with any
  passing ones under **Also checked when Kiln stopped**, and the page says when **Check again**
  will run all of the activity's completion checks. Once those checks have run, the rows are
  labelled **Completion checks**.
- An item an audit lists for a person while Kiln carries on now reads **for your review**
  instead of **waiting for you**, since Kiln keeps working and nothing waits on it yet.
- A long fresh-session prompt at Needs you and on the hand-back page now scrolls inside a box
  of fixed height, so the copy button below it stays in view.
- **Early merges allowed** now shows one line per merge target, counting merges that landed,
  need attention, are waiting or were waived, with a link to the latest. Each merge that needs
  attention shows its reason under that line; the rest of each merge's evidence sits under
  **Merge details**. A merge replaced by a later one is no longer counted.
- When a field above holds **Start** on Documents found, the line under **Start** now says which
  field and why, or how many fields need fixing, and says **Not connected to Kiln.** when the
  page has lost Kiln. Before, Start was greyed out with nothing beside it.

### Fixed

- **Starting again from the Folder missing page now ends a pause for good.** When the run's
  folder went missing while Kiln was paused, pressing Start with the run's existing branch
  paused the run again straight away, before anything ran. Now the run goes on, beginning with
  a fresh preflight.
- A finished feature whose pull request hasn't merged no longer shows **Plan needs
  reconciliation**; it stays **Complete** and says Kiln checks for new phases once it merges.
- **Audits with early merges on no longer stop on "needs a current development-delivery
  assessment".** The audit session was never told to record that assessment, so its report
  was refused until a person marked the audit complete.
- **Mark complete keeps the phases an audit added while asking you something.** When an audit
  added completion phases and also listed something for you to decide, marking it complete
  failed with "Repair obligations require the accepted audit's matching open completion phase."
  It now completes, and Kiln builds the phases it added.
- **A phase split midway no longer stops Kiln once it is done.** When a phase's own session
  split it and built the first sub-phase, a later phase's edits to the shared PRD or design
  could stop Kiln on that sub-phase with "Phase N needs a current development-delivery
  assessment", though it had passed its checks when it finished. When Kiln has no record of the
  documents such a phase was finished against, it now reads them from the commit its session
  finished on, so later edits to the shared documents no longer reopen it.
- **A stop that is only Kiln's record says so.** When a finished phase stops Kiln only because
  its delivery assessment no longer matches the documents, Needs you says the phase is done,
  names the session that built it, and leads with **Mark complete**, instead of saying no Kiln
  session ran it and offering a prompt to pick it up yourself.

## [1.2.2] - 2026-11-14

The header shows the whole PRD's time, the top bar says when a newer Kiln is on npm, and a
stopped run can carry on, start again or be reset. Kiln 1.2.0 and 1.2.1 did not reach npm;
their changes ship here.

### Added

- **A stopped phase says what happened and how to get going again.** When a phase's session
  stops, the Needs you page names the case: the agent couldn't launch, the session ended
  having built nothing, or it stopped partway. It then offers the button that fits. **Start
  Phase N again** relaunches a phase that never began. **Send reply & continue** has Kiln
  carry on in a new session that is told what was already done, used when the earlier
  conversation can't be reopened; the card says why and offers **Check again** once the cause
  is cleared. A phase that built nothing shows **Nothing to check yet** instead of failing
  completion checks. A held phase can carry on the same way, and `kiln carry-on` and
  `kiln start-again` give bots the same controls.
- **Kiln can be reset for a PRD.** A **Reset** line at the bottom of every screen, or
  `kiln reset`, has Kiln forget its progress on the PRD and return to Documents found, as if it
  had never run it. It asks first, saying what goes and what stays, waits until no session is
  working, and touches nothing in git: branches, worktrees and pull requests stay as they are.
- **Kiln can start on a branch that already exists.** Documents found asks where to start
  from: a new feature branch, as before, or an existing branch, such as one where some phases
  were built by hand or Kiln's own branch from before a reset. Kiln reads the phase plan from
  that branch, starts at its first open phase, adds to the branch and never rewrites it. When
  the branch has no commits of its own yet, Kiln offers to bring it up to date with the base
  branch first, at the start or at a stop. Several repositories can share the one branch name.

- **The header shows the PRD's total time.** Once a PRD has started, every progress screen
  adds a **PRD total** line under the state: the running time and waiting time of the whole
  PRD so far, and when it started. Running time covers every session the PRD has run, its
  phases, audits, repairs and pull-request session; waiting time is the rest, including
  Needs you stops, usage-limit waits and pauses. The moving total goes up each minute, and
  the totals keep accumulating when added phases are continued or a run starts again after a
  missing folder. On Complete the line gives the span the PRD ran.
- **The top bar says when a newer Kiln is on npm.** Kiln asks the npm registry once when it
  starts, without holding up the page. When npm's latest release is newer than the running
  Kiln, an amber **v<version> available** pill appears beside the version. It opens the
  install command with a Copy button and a link to this changelog. A development build
  never asks, and a Kiln newer than npm's shows nothing. The request names only Kiln's own
  package, and if npm can't be reached nothing is shown.

## [1.1.6] - 2026-11-12

A finished phase or completion audit stays finished while later work builds, and a stopped
conversation on a Linux machine can be resumed again. Kiln 1.1.5 did not reach npm; its
changes ship here.

### Fixed

- **A finished phase is no longer reopened by a later phase's edits.** Each phase's
  development-delivery decision was tied to the PRD, the technical design and the phase
  document together. A later phase that edited the shared PRD or design made every earlier
  decision out of date, so Kiln went back to Phase 1 and stopped at Needs you. A finished
  phase's decision, and a check you waived on it, now hold until that phase's own document
  changes or the phase is reopened. Split phases and the accounting after the last phase
  follow the same rule.
- **`kiln delivery` works beside a set-aside copy of the saved state.** A renamed copy of a
  PRD's saved state in the same folder made `kiln delivery`, `kiln audit`,
  `kiln preparation` and `kiln add-repository` refuse, because two records claimed the same
  workspace. A session then could not record its delivery decision and the phase stopped at
  Needs you. These commands now ignore a copy whose folder name doesn't match its PRD,
  prefer the record a running Kiln holds, and name the conflicting folders when they still
  refuse.
- **A finished audit is no longer reopened by the phases it added.** A completion audit's
  development-delivery decision was tied to the PRD, the technical design and the phase
  documents as they stood. The completion phases an audit adds edit those documents, so the
  audit's own decision went out of date and Kiln stopped at Needs you, asking for a decision
  that a finished audit can no longer record. A finished audit now keeps the documents its
  check passed against.
- **Resume is offered again on Linux.** Kiln judged every folder under Claude Code's
  history before offering to resume a conversation and refused if any of them was
  group-writable, which Claude Code's own folders are under a common Linux setup. The
  stopped page then said conversation recovery was unavailable. Kiln now judges only the
  history root, the conversation's own folder and its file, and says which path it refused
  and why.

### Changed

- **The top bar shows the Kiln version.** The version of the Kiln serving the page appears
  beside the Kiln mark.

### Upgrade

A run picks up the new rule when it is started with 1.1.6. A phase that finished under an
earlier version is bound to its own document the next time its completion check passes, so
it may stop at Needs you once more; record its delivery decision or choose **Mark complete**
and it stays finished after that. An audit that finished under an earlier version is bound the
same way: choose **Mark complete** once and it stays finished.

```sh
npm install -g @ensodynamics/kiln@1.1.6
```

## [1.1.4] - 2026-11-11

A clean audit no longer stops a run on a question that is already waiting for you.

### Fixed

- **Open questions ride along instead of stopping the run.** When an audit leaves you
  something to decide, for example test rows that stayed below Adequate, every later audit
  must list that item again until it is settled. A delivery audit that found nothing left to
  build had no way to do that and still pass, so Kiln stopped at Needs you on the earlier
  question even though the test audit that comes next did not depend on it. A passing audit
  can now list an outstanding item again by its id, and Kiln goes on to the next audit with
  the item still shown as waiting for you. A passing audit still cannot add a new item.
- **Delivery still waits for every answer.** A test audit that changed only tests leads to
  final delivery, so it passes only once every item is settled; otherwise it stops at Needs
  you as before. A test audit that changed implementation goes back to a delivery audit and
  can carry open items with it.
- **`kiln help` matches.** The audit submission contract it shows, the audit session's
  instructions and Kiln's requirements now state the same rule.

### Upgrade

A run already stopped at Needs you this way stays stopped until you answer, because a result
Kiln recorded doesn't change. Runs started on 1.1.4 or later get the new behavior.

```sh
npm install -g @ensodynamics/kiln@1.1.4
```

## [1.1.3] - 2026-11-11

Installing a new Kiln no longer breaks runs that are still going.

### Fixed

- **A run keeps its own version.** Each installed version of Kiln now runs from its own
  private copy in `kiln-installs`, beside Kiln's state folder. When `npm install -g` puts a
  newer Kiln in place, a run that is still going carries on with the prompts, hooks, helper
  scripts, browser view and `kiln` command of the version it started on. Commands started
  after the install use the new version. Before, a run could read the newer version's files
  partway through and crash, for example with `Prompt placeholder {{outstanding}} has no
  value.`
- **No half-installed copies.** A `kiln` command started while npm is still installing Kiln
  stops with a message to run it again once the install finishes. It never runs from a
  partial copy.
- **Old copies are cleaned up.** A version's copy is removed once no Kiln process is using it
  and it hasn't been used for seven days. The installed version and any copy a run is still
  going on are never removed.

The first `kiln` command after installing a new version takes a few seconds longer while its
copy is made. A Kiln linked from a local checkout with `npm link` still runs from its own
files. On Windows, a bare `kiln add-repository` typed by an agent reaches the newly installed
version.

### Upgrade

This protects runs started on 1.1.3 or later. Runs started on an earlier version are not
protected, so let them finish before installing this one.

```sh
npm install -g @ensodynamics/kiln@1.1.3
```

## [1.1.2] - 2026-11-10

A link in the requirements that Kiln can't follow no longer stops a run.

### Fixed

- **Broken links don't block a run.** A local Markdown link to a file that isn't in the
  repository, is outside it, is reached through a symbolic link or isn't a file used to stop
  Kiln before a phase started, with a message about the phase plan. Kiln now starts the work
  anyway. A run already stopped on such a link continues on its next Check again.
- **The agent is told.** Each phase session's prompt names the links Kiln couldn't follow and
  asks the agent to find the document if the phase needs it.
- **Documents found lists them once.** A neutral **Linked documents** item shows each link Kiln
  didn't follow and the document that holds it. It isn't a failed check, and Start stays
  available.

The PRD's own documents (the PRD, technical design, assumptions and phase documents) and the
`Superseded by:` / `Replaces:` pointers written in them still stop a run when missing, as before.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.2
```

## [1.1.1] - 2026-11-10

A delivery or test audit that adds completion phases no longer stops the whole run over a
question those phases don't depend on.

### Fixed

- **Added phases get built while a person answers.** An audit that appends completion phases
  can now also list items for a person. When the added work doesn't depend on them, Kiln builds
  it; when it does, the audit stops at Needs you as before.
- **Nothing left for a person goes missing.** Kiln keeps each open item and lists it in every
  later audit's prompt. Each later audit must settle it, saying how, or list it again, and Kiln
  refuses a report that leaves one out. Open items show on the audit's row and detail page, and
  settled ones appear once on the settling audit's page and in the final pull request.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.1
```

## [1.1.0] - 2026-11-08

Kiln now recovers a run whose worktree has gone missing, instead of reporting a stale status
for a folder that no longer exists.

### Added

- **A Folder missing page.** When a saved run's worktree is deleted, moved or replaced, Kiln
  stops and says so, in the terminal and in the browser, before checking or starting anything.
  It shows which folder is gone, what it can still find about the branch and the plan, and
  what it couldn't check.
- **Set the run up again.** The page offers the same settings as a first Start. Start a fresh
  execution from the base branch, or make a new worktree on the existing feature branch and
  carry on from the first unfinished phase, resuming an interrupted session where it can.
  Nothing changes until you press Start, and any work that would be left behind is named first.
- **A folder put back by hand is found.** Restore the folder yourself and Check again picks
  the run back up.

### Fixed

- **`kiln status` no longer fails on old saved records** that can't affect the work it reports.
- **A repeated check name no longer blanks the Needs you page.**
- **Every stop that needs a person now prints a line in the terminal**, including one raised
  before the browser view is ready.

### Changed

- **Every push to `main` is now a release.** The separate publication setting is gone. This
  affects Kiln's own release process only.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.0
```

## [1.0.3] - 2026-11-08

Fixes for runs with early merges and development deployments turned on, where phases stopped
again and again on development evidence they could not or no longer needed to provide.

### Fixed

- **Phases already Closed before a run starts no longer stop it.** With early merges on, a fresh
  run stopped on every phase that was Closed before Start with "Phase N needs a current
  development-delivery assessment", and each had to be marked complete by hand. Only a Kiln
  session writes that assessment, so such a phase could never pass. A phase Closed before the
  run, that the run never touched, now owes no development evidence, as with early merges off.
- **Marking a phase complete now lasts past later commits.** A waived "needs a current
  development-delivery assessment" item stopped matching as soon as any repository got a new
  commit, so the waived phase stopped the run again when the next phase pushed its work, and
  again at final delivery. The waiver now holds until that phase's own documents change.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.3
```

Waivers saved by earlier versions were recorded against the repositories' commits, so a phase
waived before upgrading may stop once more; marking it complete again records a waiver that
lasts.

## [1.0.2] - 2026-11-07

Fixes for live Claude Code sessions that finished their work but never closed. Kiln 1.0.1 was
prepared but not published; its changes are included here.

### Fixed

- **A phase no longer stays on Implementing after Claude has finished.** Kiln waited for a
  report from its own hook that each tool call had finished before it closed a session. When
  that report never came, the session stayed open after Claude's final turn, the phase showed
  Implementing indefinitely, and the run went no further. Kiln now closes a session once Claude
  has given its final result and answered every message, as designed. Reports of finished tool
  calls are still required before you take over a session from the terminal.
- **The report a tool call has finished no longer goes missing.** When two of Kiln's hooks
  reached its lock at the same moment, one could fail and lose that report.
- **A tool call the auto-mode classifier rejects no longer holds the session open.** Kiln now
  treats any rejected tool call as finished, since it never ran.
- **Taking over a long session is no longer refused.** Kiln kept every process a session had
  ever started on its list, even after it ended, so a long session passed the list's limit and
  Pause & take over stayed blocked. Ended processes now leave the list.

### Changed

- **Over SSH, `kiln run` says how to reach the view instead of reporting an error.** Kiln no
  longer tries to open a browser on a remote machine. It prints the view's address with an
  example `ssh -N -L` command for opening it from your own computer through a tunnel to the same
  port. On a machine with no way to open a browser, it says to open the address yourself. Only
  an attempt to open the browser that fails is still reported as an error.
- **`KILN_PORT_RANGE` is a supported setting.** Set `KILN_PORT_RANGE=<first>-<last>` to give a
  machine its own block of ports, for example when several machines are tunnelled to one
  computer. A value that isn't two ports from 1024 to 65535, first no greater than last, stops
  `kiln run` with a message instead of quietly using 4700-4799.
- **`kiln --version` says when a build is not a release.** A build packed or linked from a local
  checkout now prints `(dev build, <when it was built>)` after the version. Installed releases
  print the plain version, as before.

### Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.2
```

A run stuck on Implementing this way can be stopped and started again with `kiln run` after
upgrading.

## [1.0.0] - 2026-11-05

The first public release of Kiln.

Kiln builds a PRD you already planned with the [Enso Method](https://github.com/EnsoDynamics/enso-method), one phase after another, with nobody sitting in the loop. Every phase gets a fresh Claude Code or Codex session. Git confirms the phase landed before the next one starts. When the last phase closes, delivery and test audits check the whole PRD, and the work waits for you as pull requests. A local browser view shows each session live, and you come back when it's done or when a phase genuinely needs you.

### Install

```sh
npm install -g @ensodynamics/kiln
kiln --help
```

Then, from the root of a repository whose PRD has been planned and split into phases:

```sh
kiln run docs/prds/<name>
```

### Requirements

- Node.js 22.15 or later and Git 2.29 or later.
- GitHub CLI signed in to github.com, with the repository's `origin` on GitHub.
- Claude Code 2.1.311 or later, or Codex 0.162.1 or later signed in through ChatGPT, with the Enso Method skills installed in it. Codex on Windows also needs PowerShell 7.5.2 or later.
- macOS is validated. Linux and Windows are best effort.

Kiln accepts every agent version at or above these minimums. When a newer Claude Code or Codex changes what live messaging, takeover or Codex command evidence relies on, that feature turns off with a compatibility notice and the rest of the run carries on.

### Reporting problems

Open an issue at [github.com/EnsoDynamics/kiln/issues](https://github.com/EnsoDynamics/kiln/issues). Report a suspected security vulnerability privately, as [SECURITY.md](https://github.com/EnsoDynamics/kiln/blob/main/SECURITY.md) describes, not in a public issue.

More at [ensomethod.org/kiln](https://ensomethod.org/kiln/).
