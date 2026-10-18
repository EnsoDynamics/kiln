# Kiln v1 - Business Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE `assumptions-document-writing` SKILL FIRST ⚠️
     It owns this document's format, and most edits here are made by sessions
     doing something else — recording a ruling while building a phase — which is
     exactly how the format drifts. Folding a stakeholder's answers? Load
     `assumptions-document-feedback` as well.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-10-17
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the business assumptions we're making to proceed with Kiln v1. We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

The requirements are in the [Kiln v1 PRD](kiln-v1-prd.md); the screens are the [v1 mockups](../../design/mockups/). **Technical details** are documented in the [technical design](technical-design.md).

---

## Screen Behavior Assumptions

### UI-002. Until the phase is done, does "Keep going" cancel a requested pause, worded as below? — ⏳ PENDING (Ruled 2026-10-17 — we read your words; updated 2026-10-17; 85% confidence)

**We read your words**: your answer settled that a requested pause **can be cancelled until the phase is done**, and the requirements now say so (AC-VIEW-03). What's left is the **wording of the control**, which no mockup draws.

**Assumption**: Pressing **Pause after this phase** turns the button into **"Keep going"**. Pressing Keep going **cancels the pause** and puts the button and its line back as drawn. While the pause is requested, the line beside the button reads:
- **Running**, in the Pause Kiln panel: **"Kiln pauses once phase 2b, Store credit, is done, including its commit and push. Keep going cancels the pause."**
- **Phase detail**, under the button: **"Kiln pauses once phase 2b is done, including its commit and push. Keep going cancels the pause."**

The header **doesn't change** until the pause takes effect: it keeps reading "Implementing phase 2b" until phase 2b is Done and Kiln shows Paused. From then on there is nothing to cancel, and **Start** carries on.

At **Needs you**, which shows no pause controls (UI-006), a pause requested before the stop **still holds** once the phase is Done; Start then carries on.

**Example**: In the Running mockup (fictional sample data), phase 2b, Store credit, is at Deliverable review. Pressing Pause turns the button into "Keep going" with the line above. Pressing Keep going before phase 2b is Done brings back "Pause after this phase", and phase 3 starts after phase 2b as usual.

**Why your 2026-10-17 answer didn't close this**: You wrote: "I don't see why you couldn't change your desire to pause or not after the current phase is done … if you clicked it by accident or change your mind before the phase ended, it seems like you should be able to adjust it." **You're not missing anything**: a requested pause is only a note Kiln reads once the phase is Done, so cancelling it costs nothing. The button wording comes from the alternative this entry listed ("Keep going"); only the line beside it is new.

**Confirm or Correct**:
- [ ] Correct — "Keep going" cancels the pause, with these lines
- [ ] Wrong — corrections to the wording: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟢 LOW

---

### UI-007. Do the Needs you screens nobody drew reuse the drawn layout and change only these lines? — ⏳ PENDING (updated 2026-10-17; 80% confidence)

*Updated 2026-10-17, as built in Phase 5: item 2's line when no time was recorded, and item 3's step numbers, its "phase <n>" in lowercase, and its side column.*

**Assumption**: Four kinds of **Needs you** stop have no mockup. Each **reuses the drawn Needs you layout** and changes **only the lines below**; everything else stays as drawn. This is screen copy: please confirm it or correct the wording.

**1. The pull request isn't open** (the pull-request session ended without opening it):
- Header: **"Needs you · PR · Final pull request · Stopped <time>"**
- Headline: **"The pull-request session ended before it was done."**
- Step 2: **"Open the pull request with Claude, the way you normally would"**, with "Open it however you like. Kiln only looks for an open pull request from <branch> into <base> that isn't a draft, so it doesn't matter who opens it."
- Step 3 text: **"Kiln re-checks GitHub. If the pull request is open and ready for review, the feature is complete."** No mention of pausing, since pausing isn't offered during the pull-request session (AC-PR-05).
- Side column: headed **"Kiln finishes when"**, with one row: **"Pull request open · Not yet · No open pull request from …"**
- Footnote: **"This is the check Kiln runs after the pull-request session."**
- The fresh-session link stays and copies the **pull-request prompt**.

**2. An interrupted session can't be resumed** (AC-KEEP-05):
- Headline unchanged: "Phase <n> ended before it was done."
- Line under it: **"Kiln was interrupted at <time> while this session was working, and couldn't resume it. These are the last lines it wrote."** If Kiln was shut down so abruptly that it recorded no time, it reads **"Kiln was interrupted while this session was working, and couldn't resume it. Its last output was at <time>. These are the last lines it wrote."**
- **No exit code or last-skill row**: AC-KEEP-05 shows when the session was interrupted in place of that list.
- Step 1 becomes **"Start a fresh Claude Code session in the worktree"**: the commands `cd <worktree>` and `claude`, then the fresh-session prompt with a **Copy prompt** button and the note **"Points the new session at <phase doc>."**
- The **"Session can't be opened?"** link is removed, since step 1 already offers the fresh session.
- Steps 2 and 3 and the side column stay as drawn.

**3. The phase plan is broken before the next phase's session starts** (for example, after a pause the plan lists a phase document that no longer exists):
- Headline: **"Phase <n> hasn't started."**
- Line under it: **"Kiln read the phase plan and found the problem shown on the right."**
- **No session ran, so nothing about one appears**: none of AC-STOP-02's list (last message, exit code, last skill seen, last lines of output), no Full session output link, and no step 1 with AC-STOP-05's resume command. Beyond the lines listed here, the screen shows only the plan problem, the fresh-session prompt link and **Check again**.
- With no step 1, the two steps are numbered **1 and 2**. Step 1 is **"Fix the phase plan"**, with **"Kiln only checks that the plan reads: every phase file has its own phase number, every `## Split into` row has a file, and every phase file is listed."**
- Step 2 keeps **"Come back and check again"**, with the text **"Kiln reads the plan again. If it reads, Kiln starts phase <n>, or pauses first if you pressed Pause."** ("the pull request" in place of "phase <n>" when the stop is on it).
- Side column: headed **"Kiln continues when"**, even when the stop is on the pull request, with one row, **"Phase plan reads · Not yet · <problem>"**, for example "Phase plan reads · Not yet · phase-2-refund-routing.md lists 2c, which has no file", and **no footnote** under Check again, since this isn't the check Kiln runs after a phase.

**4. Claude Code couldn't be started** (Kiln couldn't launch `claude` for the session, for example because it isn't installed). When no earlier attempt of that session ever ran:
- Headline unchanged: "Phase <n> ended before it was done."
- Line under it: **"Kiln couldn't start this session. This is the error it got."** (in place of "…These are the last lines it wrote."), followed by the one line Kiln recorded: **"Couldn't start claude in <worktree>: <the error>"**.
- The row under the headline starts with **the error's code** (for example "ENOENT") in place of "exit 1", and has **no last-skill part**, since nothing ran.
- Step 1 is the **fresh session**, as in item 2, and the **"Session can't be opened?"** link is removed. Its prompt is the **phase prompt unchanged**: it leaves out "A previous session stopped partway through this phase…", because nothing ran.
- Steps 2 and 3 and the side column stay as drawn.

When an earlier run of the session did start, so the session has a transcript, and Kiln couldn't start `claude` again to resume it:
- Line under the headline: **"Kiln couldn't restart this session. These are the last lines it wrote, ending with the error it got."** The last of those lines is the one Kiln recorded, "Couldn't start claude in <worktree>: <the error>".
- The row under the headline starts with **the error's code**, as above.
- Step 1 keeps the **resume command**, since the transcript is intact; everything else stays as drawn.

For the **pull-request session**, either way, the header, headline, steps 2 and 3, side column and footnote are item 1's, and the fresh-session prompt is the pull-request prompt.

**Example**: In the drawn Needs you mockups (fictional sample data), the feature branch is `feature/customer-returns` and the base branch is `develop`. If the pull-request session for that feature ended without opening the pull request, the side column would read "Pull request open · Not yet · No open pull request from feature/customer-returns into develop".

**Evidence**: Both Needs you mockups draw a phase that failed the three-part check after its session ended. The PRD asks for the other four cases (AC-PR-02, AC-KEEP-05, AC-STOP-07, and AC-STOP-02 with AC-STOP-06) but no screen shows them. When Claude Code never started there are **no last lines and nothing to resume**, so the drawn "These are the last lines it wrote" and the resume command would both be untrue. When only the restart failed, the earlier run's lines and transcript are real, so both stay.

Each variant **changes as little drawn copy as possible**, and every sentence states something Kiln **recorded or checked**, never a guessed cause (AC-STOP-04). "Kiln finishes when" replaces "Kiln continues when" because **nothing runs after the pull request**. The alternative is to draw these four screens before they're built; it lost because the drawn layout already fits each, and only wording changes.

**Confirm or Correct**:
- [ ] Correct — use the drawn layout with these lines
- [ ] Wrong — draw these four screens before they're built
- [ ] Wrong — corrections to the wording: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

---

### UI-010. Is the screen and terminal copy nobody drew worded and colored as below? — ⏳ PENDING (updated 2026-10-17; 75% confidence)

*Updated 2026-10-17: item 13 added in Phase 5.*

**Assumption**: Thirteen small pieces of copy have no mockup, or have only one case drawn. This is screen copy: please confirm it or correct the wording.

**1. The `subagent` label** in session output uses **the same grey as the `tool` label**.

**2. Full session output for a stopped phase** (the Phase detail layout, AC-WATCH-10):
- The step where the session stopped keeps the **current-step drawing without the spinner**, as the Disconnected screen draws the interrupted step.
- The back link reads **"Needs you"** (in place of "All phases") and returns to the Needs you screen.

**3. The line Kiln prints** when Ctrl+C stops it with **no phase session working** (a closed terminal has nowhere to print). The first sentence is in the normal color and the second in grey, like the drawn "Interrupted phase 2b, Store credit." line:

| When Kiln stops | It prints |
|---|---|
| The pull-request session working | "Interrupted the pull-request session. Its session and uncommitted work are kept." |
| At Needs you | "Kiln stopped. Phase 2b still needs you; kiln run checks it again." |
| While checking a phase | "Kiln stopped while checking phase 2b. kiln run checks it again." |
| While checking the pull request | "Kiln stopped while checking the pull request. kiln run checks it again." |
| Paused | "Kiln stopped while paused before phase 3." |
| Paused before the pull request | "Kiln stopped while paused before the pull request." |
| Complete | "Kiln stopped. Customer returns is complete." |
| On Documents found | "Kiln stopped. Nothing was started." |
| During setup | "Kiln stopped before phase 1 started. kiln run picks it back up." |

**4. The grey busy notes** that replace a drawn note while Kiln works, with its button unavailable:
- **Under Start on Documents found** (drawn as "Confirm refinement to start."): while Kiln sets up the worktree after Start, **"Setting up the worktree…"**; while it checks the base branch on `origin`, **"Checking develop on origin…"**, naming the chosen base branch. When both apply, the note shows **setting up**.
- **Under Check again on Needs you** (drawn as "Checked 1:21 PM."): while the check runs, which can take up to 2 minutes when `origin` doesn't answer, **"Checking…"**

**5. What Kiln prints on `kiln run` for a feature already underway** (AC-START-09). The terminal mockup draws one case, a resumed session; every case keeps its two lines and colors:
- The **summary line**: "Customer returns  ·  2 of 5 phases done  ·  phase 2b was interrupted" (drawn). Its last part says where Kiln left the feature: **"phase 2b was interrupted"**, **"phase 2b needs you"**, **"paused before phase 3"**, **"phase 3 is next"** (between phases, or a session recorded but never launched) or **"complete"**.
- The **● line** says what Kiln does next, then **"Opened <address>"**, with no closing period, as drawn:

| What Kiln does next | The ● line starts |
|---|---|
| Starts a phase | "Starting phase 3, Returns dashboard." |
| Resumes a phase's session | "Resuming phase 2b’s session 7c1e9f2a." (drawn) |
| Resumes the pull-request session | "Resuming the pull-request session 7c1e9f2a." |
| Starts the pull-request session | "Starting the pull-request session." |
| Stops at Needs you | "Phase 2b needs you." (**"still needs you"** when it was already stopped and its check failed again) |
| Needs you for the pull request | "The pull request needs you." |
| Stops at a broken phase plan | "Phase 3 hasn’t started: the phase plan doesn’t read." |
| Paused | "Paused before phase 3. Press Start phase 3 to go on." |
| Complete | "Pull request #218 is ready for review." |

When the check on an earlier phase passed first, the line begins **"Phase 2b is done."**, or **"Phase 2b is done, finished by you."** when that phase was stopped at Needs you. Paused before the pull request reads "Paused before the pull request. Press Start the pull request to go on." (UI-008).

**6. During the pull-request session**, copy that offers a pause or names a phase changes, since pausing isn't offered then (AC-PR-05):
- Running's near-limit note reads **"Close to the limit."** alone (drawn: "Close to the limit. Pause after this phase to switch accounts.").
- The Kiln panel reads **"interrupts the pull-request session"** (drawn: "Ctrl+C there interrupts the current phase").
- The Ctrl+C line at Needs you for the pull request (item 3) reads **"Kiln stopped. The pull request still needs you; kiln run checks it again."**

**7. When Claude Code isn't signed in**, the account shows one amber line in place of the email and plan: **"Not signed in to Claude Code. Run `claude auth login`."** On Documents found it replaces the account line (drawn: "alex@acme-shop.dev · Max plan") and the usage line is left out; on Running and Paused it replaces the Claude account panel's email, plan and limits. **Start isn't held by it**: a session that then fails comes to **Needs you** like any other stop.

**8. A time that isn't today carries its day**, wherever Kiln shows a time: Stopped, Ran … to …, Finished, last seen, Checked, and the session-output time column on Phase detail and Full session output ("11:44:02"), where old times appear. The terminal's times need no day, since its lines are printed as they happen. Today's times stay as drawn ("11:52 AM").
- Yesterday: **"Yesterday 11:52 PM"**, lowercase after a word ("Stopped yesterday 11:52 PM")
- Within the last week: the weekday, **"Mon 9:17 AM"**
- Earlier: the date, **"Oct 12, 9:17 AM"**

In "Ran … to …", each end follows the rule on its own, and a day shared by both ends is given once: "Yesterday 11:20 PM to 12:40 AM", "Mon 9:17 to 10:09 AM".

**9. Field messages on Documents found** for a field left empty or a branch name Git won't accept. Each is one amber line under its field and **holds Start**, like the drawn field messages:
- Worktree left empty: **"Enter a worktree path."**
- Feature branch left empty: **"Enter a branch name."**
- Feature branch not a valid branch name: **"That isn't a valid branch name."**
- Base branch empty (origin names no default branch and has no `develop`): **"Choose a base branch."**

**10. What `kiln run` prints when a start check fails** for a reason other than missing documents. It keeps the drawn missing-documents frame: the first line is an amber **✗** and **"Can't start Gift cards."** in the normal color; then **one line per problem**, indented four spaces in the lighter grey of the drawn "the technical design", stating the fact and where Kiln looked; then **"Nothing was started."**, indented two spaces in grey, as drawn.

| Problem | Its line |
|---|---|
| A phase to implement cites no acceptance criteria | "docs/prds/gift-cards/phase-3-returns.md cites no acceptance criteria." |
| Uncommitted changes in the checkout | "The checkout has uncommitted changes: 3 files." |
| A dependency on a later phase | "phase-2-refunds.md depends on phase 3, which comes later in the plan." |
| A dependency on a phase with no document | "phase-2-refunds.md depends on phase 5, which has no phase document." |
| A plan that doesn't read | "phase-2-refunds.md lists 2c, which has no file." |
| `gh` not signed in | "gh isn't signed in to github.com. Run gh auth login." |
| `origin` not on GitHub | "origin isn't on GitHub: <url>" |
| A tool missing | "gh isn't on the PATH." (likewise `claude` and `git`) |

When documents are also missing, the drawn lines come first and these follow, before the drawn closing line.

**11. The line under each started progress step** on Phase detail. A step not yet started keeps its drawn line ("Starts when the session calls the test-hardening skill"). A started step shows one line, with **the time it started and what Kiln saw** on the right:

| Step | Its line | Right side |
|---|---|---|
| Build, Deliverable review, Test hardening, Refactor pass | **"<skill> skill started"**, as drawn: "implement-from-requirements skill started" | the time and **"skill call"**, as drawn: "10:58 · skill call" |
| Commit | **"first git commit seen"** | the time and **"Bash call"** |
| Push | **"git push seen"** | the time and **"Bash call"** |

**This changes one drawn line.** The mockup's Deliverable review reads "deliverable-review skill started; its reviewer subagent is reading the changed files". Kiln shows **"deliverable-review skill started; its reviewer subagent is working"**, and adds that clause **only while** the session is running, Deliverable review is the current step, and the reviewer the session started in that step hasn't finished yet. Otherwise the line is "deliverable-review skill started".

**12. A phase already closed before Start** on Documents found. A phase can be done by hand before Kiln starts, so its document is already marked closed. The phase plan still lists **every phase in order**; a closed one shows the word **"closed" in green** beside its title, where a split phase shows "split into 2a and 2b". The count above the list counts only the phases **left to implement** and adds the closed ones after it:
- None closed: "5 phases to implement, in this order" (drawn)
- Some closed: **"4 phases to implement, in this order · 1 already closed"**
- One left: **"1 phase to implement · 4 already closed"**
- All closed: **"No phases left to implement · all 5 already closed"**

**13. A phase stopped at Needs you in the phase plan**, which shows only on the Disconnected layout (UI-006). Its number sits in an **amber-outlined circle**, as an Interrupted phase's does, and its pill is **amber with the warning mark, reading "Needs you"**, as the header's Needs you pill is drawn.

**Example**: The lines above use the mockups' fictional sample data (item 10 uses the terminal mockup's **Gift cards**): the feature **Customer returns**, stopped at **phase 2b, Store credit**, with **phase 3, Returns dashboard**, next and pull request **#218** at the end. Had the Needs you mockup's stop at 11:52 AM been looked at the next morning, its header would read "Needs you · Phase 2b · Store credit · Stopped yesterday 11:52 AM". Had phase 1, Return intake, been finished by hand before Start, Documents found would list it as "1 Return intake closed" and read "4 phases to implement, in this order · 1 already closed".

**Evidence**: **Amber means "needs you"**, red is Kiln's accent and **green means done**, so grey is the one color that says nothing extra; a subagent's tool calls already read like `tool` lines. The Needs you screen has **no phase plan** (UI-006), so an "All phases" link would lead to no drawn screen.

Each terminal line **states only what Kiln recorded** and reuses drawn copy where it can ("Nothing was started." is in the terminal mockup). The Needs you line says **"checks it again"** because that is what `kiln run` does for a stopped phase (AC-CLI-01). The alternative is to print nothing unless a phase session was working; it lost because the person then gets no word on where Kiln left the feature.

The **busy notes** take the place of the drawn note under Start or Check again and say only what Kiln is doing, so the person knows why the button is unavailable while Kiln works.

The **underway lines** keep the drawn resume case's form: the summary says where Kiln left the feature and the ● line says what it does next, from Kiln's own record and checks, never a guessed cause (AC-STOP-04).

The **pull-request lines** drop only the words that would offer a pause the screen doesn't have or name a phase that isn't running; the rest stays as drawn.

The **not-signed-in line** works like the model-list message (UI-011): amber, and Start isn't held, because Kiln never waits (UI-005). The person may sign in before the session starts; if they don't, the session's own ending, shown word for word at Needs you (AC-STOP-02), says why.

**Days on times** matter because a feature can run overnight or sit at Needs you for days, and "Stopped 11:52 AM" seen the next morning would read as today. Always showing the date was the alternative; it lost because the drawn times carry none, and most times a person sees are today's.

The **start-check lines** reuse the drawn frame so every failure reads the same way, and each names the file, count or address Kiln checked, so the person can fix it without guessing what Kiln meant (AC-START-02).

The **empty-field and branch-name lines** take the drawn field messages' form, a few words saying what to do, and hold Start for the same reason: Start would fail.

The **closed-phase count** says how many phases Kiln will actually run, since it never starts a phase that is already closed, while the list still shows the whole plan. **Green means done**, so the closed mark reads as finished work. Leaving closed phases out of the list was the alternative; it lost because the person couldn't then tell that Kiln had seen them.

The **progress-step lines** keep the drawn form and say only what Kiln saw and when. The drawn reviewer clause says **what the reviewer is doing** ("reading the changed files"), which Kiln can't know without interpreting the session, and Kiln never reads meaning into a session (AC-STOP-04). That a reviewer was started and hasn't finished is something Kiln does see, so **"is working"** keeps the drawn clause's place without claiming more. The alternative is to drop the clause altogether; it lost because the person watching a long review would then see no sign it is still going.

**Confirm or Correct**:
- [ ] Correct — use this copy and coloring
- [ ] Wrong — print nothing when Ctrl+C finds no phase session working
- [ ] Wrong — leave the reviewer clause out of the Deliverable review line
- [ ] Wrong — corrections to the wording or colors: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟢 LOW

---

### UI-011. Do the Model and Effort fields look and read as below when a model limits effort, the model list can't be read, or the saved model is no longer listed?

**Assumption**: Four cases on the **Model** and **Effort** fields have no mockup. Each keeps the drawn layout, **all five Effort buttons included**. This is screen copy: please confirm it or correct the wording.

**1. Effort levels the chosen model doesn't support** are drawn as **disabled buttons**, dimmed like the disabled **Change** button. If the saved effort isn't one of them, Kiln moves it to the **highest supported level below it**, or the lowest supported level when none is below.

**2. A model with no effort setting** has all five buttons disabled and is shown **on its own** wherever model and effort appear: **"Haiku 4.5"**, not "Haiku 4.5 · high effort".

**3. When Claude Code's model list can't be read**, the Model field shows **only the saved model** and one amber line under it: **"Couldn't load Claude Code's models: <the error>"**. **Start isn't held by it**, like the keep-awake message and unlike the other field messages, which hold Start.

**4. A saved model no longer in Claude Code's list** (for example after switching accounts) **stays selected**, named by its short name as saved (**"opus"**), with **no message**. A session that can't use it ends, and the phase comes to **Needs you** like any other stop.

**Example**: In the Running mockup (fictional sample data), the settings panel reads "Opus 5.5 · high effort". Choosing a model that stops at high would leave **Extra high** and **Max** dimmed; choosing Haiku 4.5, if it took no effort setting, would make the panel read **"Haiku 4.5"**.

**Evidence**: Claude Code quietly runs an effort a model doesn't support at high, or at no effort, without saying so. Dimming those levels keeps the screen honest about what each phase ran with.

Every other field message holds Start because **Start would fail**. Here the session **can still run** on the saved model, so holding Start would stop work for no reason. The alternative is to show only the levels the model supports; it lost because it changes the drawn five-button layout.

An unlisted saved model gets no message because Kiln **can't tell** whether the account may still use it; the session itself is the reliable test, and its ending is shown word for word at Needs you (AC-STOP-02).

**Confirm or Correct**:
- [ ] Correct — keep five buttons with unsupported ones dimmed; show a model with no effort on its own; the model-list message doesn't hold Start; an unlisted saved model stays selected with no message
- [ ] Wrong — show only the effort levels the chosen model supports
- [ ] Wrong — corrections to the wording or look: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟢 LOW

---

### UI-012. When Kiln can't open the browser, does the terminal give the address and say why, worded as below? — ⏳ PENDING (Added 2026-10-17 — new question; 80% confidence)

**Assumption**: The terminal mockup draws only the case where the browser opens ("● Opened <address>. Review it there and press Start."). When it **can't be opened** (for example a Linux machine with no `xdg-open`), Kiln **doesn't claim it opened**. It prints the address in the drawn line's place, then **one amber ✗ line saying why**, then the drawn grey line:

- **"● Kiln’s view is at <address>. Review it there and press Start."**
- **"✗ Couldn’t open the browser: <the reason>. Open <address> yourself."**

For a feature already underway, the ● line ends at what Kiln does next, with no "Opened <address>", and the same ✗ line follows it.

**Example**: In the terminal mockup (fictional sample data), had the browser failed to open for Customer returns, the lines would read "● Kiln’s view is at http://127.0.0.1:4700/customer-returns. Review it there and press Start." then "✗ Couldn’t open the browser: xdg-open isn’t on the PATH. Open http://127.0.0.1:4700/customer-returns yourself."

**Evidence**: "Opened" would be untrue when nothing opened. The ✗ line reuses the **amber ✗** of the drawn start-check failure, since amber marks what needs the person. Kiln carries on either way: the view is served, and the person can open the address themselves. The alternative was to print the drawn line regardless; it lost because the terminal would say something Kiln didn't do.

**Confirm or Correct**:
- [ ] Correct — use this wording
- [ ] Wrong — print the drawn "Opened" line regardless
- [ ] Wrong — corrections to the wording: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟢 LOW

---

## Workflow Assumptions

### WORK-001. Does a draft pull request count as open?

**Assumption**: **No.** "Open" in AC-PR-02 means **open and ready for review**, so a **draft pull request fails** Kiln's pull-request check. The pull-request session opens its pull request **ready for review**, and if a draft from the feature branch is already open, it **marks that one ready** instead of opening another.

If the check still finds a draft, Kiln goes to **Needs you** with the fact **"#<n> is a draft"**. The person marks it **Ready for review** on GitHub, then presses **Check again**.

**Example**: The Complete mockup (fictional sample data) shows pull request **#218** from `feature/customer-returns` into `develop`. Had #218 been opened as a draft, Kiln would stop at Needs you showing "#218 is a draft" instead of reaching Complete.

**Evidence**: Kiln stops at **"PR ready for review"** (AC-PR-03), GitHub's own term for a pull request that isn't a draft, and Complete says **"Human review is next."** A draft can't be merged and doesn't ask code owners for review, so a feature left as a draft would sit unseen. No Enso Method skill opens drafts, and GitHub's command-line tool doesn't by default; a draft would come from the person's own instructions to Claude Code.

The alternative is to count a draft as open, so someone who prefers drafts still reaches Complete. It lost because Complete would then say review is next when nobody has been asked to review.

**Confirm or Correct**:
- [ ] Correct — a draft fails the check; the session opens it ready for review, or marks an existing draft ready
- [ ] Wrong — a draft counts as open
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟡 MEDIUM

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| UI-001 | A usage limit turns amber at 80% used, on Running and Paused only | 2026-10-17 | PRD AC-WATCH-08; Technical Design, Account and Usage |
| UI-003 | A feature branch name already taken is flagged beside its field and holds Start | 2026-10-17 | PRD AC-START-07; Technical Design, Worktree and Branch Setup. Deleting the old branch yourself frees the name |
| UI-004 | A new PRD starts on the latest Opus at high effort; the list offers the account's models | 2026-10-17 | PRD AC-START-06; Technical Design, Account and Usage |
| UI-005 | Kiln never waits for a usage limit to reset; a limit stop is a Needs you like any other | 2026-10-17 | PRD AC-WATCH-08; Technical Design, Account and Usage |
| UI-006 | At Needs you the browser shows only the Needs you screen; the plan's Needs you row shows only on Disconnected | 2026-10-17 | Technical Design, HTTP API |
| UI-008 | A pause pressed during the last phase holds before the pull-request session | 2026-10-17 | Technical Design, engine loop and Snapshot |
| UI-009 | Change edits model and effort in place, each choice and keep-awake saved at once | 2026-10-17 | Technical Design, Snapshot (Settings and each phase's model) |
| PLAT-001 | Outside GNOME on Linux, keep-awake may also block a sleep chosen from the menu; screens keep "Stops idle sleep only" | 2026-10-17 | Technical Design, Keep-awake |
| PLAT-002 | Windows is in v1, not a later release (decided over the proposed deferral) | 2026-10-17 | PRD AC-INSTALL-03; Technical Design, Windows |
