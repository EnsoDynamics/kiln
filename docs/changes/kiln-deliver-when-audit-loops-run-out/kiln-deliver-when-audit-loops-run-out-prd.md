# PRD: Kiln Deliver When Audit Loops Run Out

**Source:** Doug's review on 2026-11-18 of a run that stopped at its delivery audit loop limit, the settings, stop and finished screens he worked through on mockups that day, and his ruling the same day on the stakeholder review: when an audit finds work, Kiln always does it, and at the limit Kiln moves on instead of auditing again. His review of the stakeholder review package on 2026-11-19 made a loop one run of an audit, removed the acceptance sentence and the exception for the last test loop's leftover work, renamed the settings, and ruled out special handling for runs already under way when Kiln is upgraded.

**Changes:** [Kiln Audit Loop Limits](../kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md), [Kiln Completion Audits](../kiln-completion-audits/kiln-completion-audits-prd.md), [Kiln Method-Neutral Audits](../kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md), [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md), [Kiln Checks at a Stop](../kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md), [Kiln Bot Control](../../prds/kiln-bot-control/kiln-bot-control-prd.md), [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), [Kiln Development Deployments](../kiln-development-deployments/kiln-development-deployments-prd.md), [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md)

**Mockup:** [Open the mockup](mockups/kiln-deliver-when-audit-loops-run-out.html).

**Assumptions:** [Kiln Deliver When Audit Loops Run Out assumptions](kiln-deliver-when-audit-loops-run-out-assumptions.md)

## Summary

When Kiln's closing audits find work, Kiln does it, and the loop limits decide when to stop looking. Each loop is one run of an audit; building what it found is not a loop. Once a kind of audit has used its last loop and Kiln has done what that run found, Kiln runs no more audits of that kind and moves on: from the delivery audit to the test audit, and from the test audit to the pull request. Kiln never stops to ask at a limit, so the setting that chose between delivering and stopping, the loop stop page and its answers, all released in Kiln 1.3.0, go away, and so does the sentence accepting Weak test rows. Both limits default to 4. The pull request and the finished page say how many loops of each kind ran and list what is left for the person. An audit also stops a run for a person only for the reasons any Kiln session stops for; anything else it names for the person is reported with the delivery.

## Business Context

Kiln Audit Loop Limits, released in Kiln 1.3.0, gave each closing audit a limit on how many times it can send Kiln back for more work. After the last delivery audit loop, if the audit still found missing parts, Kiln always stopped, because it never delivered work the delivery audit said was unfinished.

Take the Customer Returns example the mockup uses, a PRD with 14 acceptance criteria. Each delivery audit finds a few more missing parts, and after the last loop the audit adds two phases for three partly built criteria. Under that rule Kiln stops overnight with nothing delivered, and the person has to read three small gaps and decide before anything moves. Kiln exists so that a person can start a run, leave, and come back to finished work.

The first answer considered was to deliver at the limit and leave the last audit's phases open in the plan. That leaves work written out and never done, which is the wrong ending: when an audit has found something and said what to do about it, the useful next step is to do it. So every audit's findings are built, and the limit is where Kiln stops looking for more: after the last loop of a kind, no audit of that kind runs again. A run therefore always ends on finished work, and nothing waits in the plan unbuilt.

The cost is that the work of each kind's last loop is not audited again before the pull request opens. The pull request is where a person reviews, the test audit still runs over everything the delivery audit's last loop built, and the limit is the person's own choice of how much checking is enough. Raising both defaults from 3 to 4 keeps the number of delivery audits a run gets where it was, four, while now building what the fourth one finds. Kiln 1.3.0 counted a loop as the work on an audit's findings; a loop is now simply one run of the audit, which is what a person sees. The delivery and test audits are recent additions to the method, and four loops of each is generous; a person who wants more sets more.

The same review found the stop page hard to use: it did not say which loop the run was on, offered two controls for the same number, and offered a reply box nothing would read. With no stop at a limit, that page goes away.

Any Kiln session that cannot finish its work, for a blocker or anything else, already stops the run at Needs you. An audit is different: it finishes and reports, and it can list an item for the person that needs no one, such as an assumption the documents already declare, still waiting to be confirmed, with no work depending on it. Today every item an audit lists keeps the run from delivering, and nothing says what an audit may list. The Enso Method builds on a declared assumption without asking. It ends a session early only for a blocker, meaning something only a person can provide that the remaining work needs, for a business question with no workable answer, or for a critical finding that the next step of the work would cause or worsen; any other critical finding leads the report when the work is done. Run by hand, it names behavior changed outside the requirements and a human action still waiting in the wrap-up, and still opens the closing pull request. Kiln's audits should stop a run for the same reasons as any other session and no others. Kiln never merges its own pull request, so the person still records the change or does the action before the work lands.

This needs no change to the Enso Method. Run by hand, a person does what each audit finds and decides when to stop auditing; Kiln does the same with the person's limits.

## Acceptance Criteria

### Two Limits, Each Defaulting to 4

The person sets one limit for each audit before the run starts, and nothing else: Kiln never stops at a limit, so there is nothing to choose about what happens there.

- [ ] **AC-CHOICE-01 — The Audit loops settings are two limits.** The **Audit loops** settings are **Max delivery audit loops** and **Max test audit loops**, each a whole number of 1 or more with a default of 4, wherever the settings appear today: Documents found, the run's settings and `kiln settings`. Each limit is the most runs of that audit a run makes (AC-LAST-02). The third setting Kiln 1.3.0 released, **After the last test audit loop**, is removed from all three, and no sentence accepting Weak test rows is shown or given to any session.
  - Replaces in part: AC-LOOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (two settings instead of three, named Max delivery audit loops and Max test audit loops; both defaults 4)
  - Replaces: AC-LOOP-06 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (neither acceptance sentence is offered)
  - Replaces in part: AC-LOOP-07 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (no run stops and asks at a limit)
- [ ] **AC-CHOICE-02 — A limit changed during a run applies at Kiln's next decision.** The person can change either limit during a run, on the page or with `kiln settings`. A change applies from Kiln's next decision whether to run an audit of that kind. A limit cannot be set below the runs of that audit already made, the one under way included. Raising a limit after that kind's last loop, before the pull request session starts, runs that audit again once the work under way ends, when there is work it has not checked: phases built or changes made since its latest run. After that delivery audit and its phases, the test audit runs again only while a test audit loop is left, and otherwise Kiln goes on to the pull request. With nothing unchecked, the raise changes nothing. Once the pull request session has started, a change applies only to a continuation, whose settings carry over as today.
  - Replaces in part: AC-LOOP-05 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (two settings; a limit cannot be set below the runs of that audit already made; a raise after a kind's last loop runs that audit again where there is work it has not checked, until the pull request session starts)
### Do What Every Audit Finds, Then Move On

A loop is one run of an audit. Kiln does whatever each run finds, runs the audit again while loops are left, and moves on when they run out.

- [ ] **AC-LAST-01 — Every audit's findings are done.** When a delivery audit adds phases, Kiln builds them. When a test audit adds phases or saves test work, Kiln builds the phases and works through the test work in as many sessions of test fixes as it takes. This holds whatever the loop counts are: a finding is never left in the plan because no loop is left. A session of test fixes that raises none of the rows it took ends that work, and the rows left are listed under **For you** (AC-ITEM-03, TEST-001).
  - Replaces: AC-DELIV-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md`
  - Replaces in part: AC-TEST-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a report that adds phases or saves test work never stops the run because no loop is left; its test work is done in as many sessions as it takes)
- [ ] **AC-LAST-02 — A loop is one run of an audit.** **Delivery audit loop _n_** is the run's _n_th delivery audit, and **test audit loop _n_** its _n_th test audit, including a delivery audit that runs again because a test audit's work changed implementation. Building the phases an audit added and the sessions of test fixes are the work on that loop's findings, not loops. Each count starts and carries over as today (AC-LOOP-04 in Kiln Audit Loop Limits), apart from Allow, which no longer exists.
  - Replaces: AC-LOOP-02 and AC-LOOP-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a loop is one run of an audit, not the work on its findings; a session started by Allow no longer exists)
  - Replaces in part: AC-LOOP-04 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a count never starts again during a run)
- [ ] **AC-LAST-03 — After a kind's last loop, no audit of that kind runs again.** Once a kind's last loop has run and Kiln has done what it found, Kiln runs no further audit of that kind in this run and goes on as it would after that audit passed: after the delivery audit, to the test audit; after the test audit, to the pull request, once a delivery audit has checked any phases or changes the test audit's work made, while a delivery audit loop is left. A delivery audit that would have followed a test audit's phases does not run once no delivery audit loop is left. The work on the last loop's findings is not audited again.
  - Replaces in part: AC-TEST-01 and AC-LOOP-03 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the test audit also starts after the delivery audit's last loop, with no delivery audit after it)
  - Replaces in part: AC-TEST-03, AC-RUN-03 and AC-AUDIT-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (after a kind's last loop no audit of that kind runs again: a test audit's phases are followed by a delivery audit only while a delivery audit loop is left, and the pull request session starts without a current audit of a closed kind)
  - Replaces in part: AC-NEUTRAL-06 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (after a test audit changes implementation, a fresh delivery audit runs only while a delivery audit loop is left, and a fresh test audit only while a test audit loop is left)
  - Replaces in part: AC-CONTINUE-05 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (in a continuation, the work of a kind's last loop is not audited again)
  - Replaces in part: AC-WAIVE-12 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (work added by phases a marked-complete audit appended is audited afresh only while a loop of that kind is left)
- [ ] **AC-LAST-05 — Nothing is recorded as done that isn't.** Kiln marks no criterion built and closes no phase that its own sessions did not. A test row still missing, failing or Weak once the last test audit's work is done is reported, not hidden (AC-ITEM-01, TEST-001).

### Say How Many Loops Ran

A person who comes back to a delivered run sees how much checking it got, without a warning.

- [ ] **AC-LEFT-01 — The pull request says how many loops ran.** Each pull request's description opens with **For you** (AC-ITEM-03), when it lists anything, and then says how many loops of each kind the run used and whether that was the limit, such as "Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops." Kiln 1.3.0's line quoting the acceptance sentence for the test audit's last loop is removed; **For you** lists each test row left (TEST-001). With a pull request already open, including one opened outside Kiln, Kiln completes the run only after a pull request session in this run has written this run's **For you** and loop counts into its description, or when the person marks final delivery complete. When an out-of-date description is all that stops final delivery, Check again starts that session, and the person can mark final delivery complete without checking again first.
  - Replaces in part: AC-TEST-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (its line is replaced by the loop counts)
  - Replaces in part: AC-PR-01 in `docs/prds/kiln-v1/kiln-v1-prd.md`, AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` and AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (a pull request already open is completed only after a pull request session in this run has written its **For you** and loop counts into the description, or when the person marks final delivery complete)
  - Replaces in part: AC-WAIVE-02 and AC-WAIVE-05 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` and AC-STOPCHECK-02 in `docs/changes/kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md` (where the only failing check at final delivery is the pull request description, Check again there starts the pull request session, so **Mark final delivery complete** can be pressed on the check that stopped Kiln, without Check again first, and the line saying what Check again runs is left out; `kiln waive-and-advance` without `--confirm` does what Check again does there)
  - Replaces in part: AC-PR-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a pull request found already open no longer completes without a session, so its row and terminal lines show the session that wrote its description)
  - Superseded in part by: AC-MAX-01 in `docs/changes/kiln-planned-test-fix-batches/kiln-planned-test-fix-batches-prd.md` (the wording of the loops used; where they are shown remains)
- [ ] **AC-LEFT-02 — The finished page and `kiln status` say the same.** A delivered run's finished page and `kiln status` show the loops of each kind used and whether that was the limit, beside the delivery facts they show today. The heading is unchanged.
  - Replaces in part: AC-PR-04 in `docs/prds/kiln-v1/kiln-v1-prd.md`, AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` and AC-DISPLAY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the Complete screen also shows the loops used of each kind and **For you**)
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Complete also shows the loops of each kind used and **For you**; the rest of its layout remains)
  - Superseded in part by: AC-MAX-01 in `docs/changes/kiln-planned-test-fix-batches/kiln-planned-test-fix-batches-prd.md` (the wording of the loops used; where they are shown remains)

### Stop for a Person Only When the Work Cannot Go On

Any Kiln session that cannot finish already stops the run. An audit can also list things for a person. Kiln now says what may be listed, makes each item say why it is there, and stops the run only for the ones the work cannot go on without.

- [ ] **AC-ITEM-01 — An audit lists for a person only what the table allows.** Kiln's instructions to each audit define an item for a person as one of the kinds in the table, the reasons any Kiln session stops for and the things it reports, and say that a declared assumption, a request to confirm or review something, and anything the audit can settle itself are never items. Kiln handles each kind as the table says, and opens no pull request while an item stops or holds the run. An item **holds the run** while work Kiln will still do in this run needs it, delivery included: Kiln goes on with the work that does not need it and stops at Needs you once none is left, as AC-NEUTRAL-03 in Kiln Method-Neutral Audits does for an item today. At that stop the person can provide what each item asks outside Kiln and carry on with **Continue anyway**, which Kiln never does by itself: Kiln records each item as waived, never as settled, and goes on to deliver as when nothing holds the run, instead of marking delivery complete. Each item stays listed under **For you** as still open, marked **Waived**. Kiln does not stop on a waived item again.

  | Kind of item | What Kiln does |
  |---|---|
  | A critical finding that Kiln's next step would cause or worsen | Stops at Needs you at once |
  | Any other critical finding | Goes on, and reports it first (AC-ITEM-03) |
  | A blocker: access, a resource, a permission or an action that only a person can provide and that work Kiln will still do needs | Holds the run |
  | A business question whose best answer is below 20% | Holds the run |
  | A test the audit cannot settle on its own: a criterion with no test, a failing test, a high-risk criterion still Weak, a row the audit marked stuck, or, once the test work ends, any row still missing, failing or Weak | Goes on: later test audit work may fix it, and one still open at delivery is reported (AC-ITEM-03, TEST-001) |
  | Anything else the audit skill names for the person, such as behavior changed outside the requirements or a human action that no work Kiln will still do needs | Goes on, and reports it with the delivery (AC-ITEM-03) |

  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (only a critical finding that Kiln's next step would cause or worsen stops at once; a blocker or a business question whose best answer is below 20% holds the run while work that does not need it goes on; an item waived at the hold stop does not stop the run again; marking an audit complete with a valid report is the person's answer at its stop, so each item its report listed counts as waived, and the items its report settled are settled, in place of carrying every outstanding item to the next audit)
  - Replaces in part: AC-WAIVE-02 and AC-WAIVE-04 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (where an item holds the run, the offer is **Continue anyway**, which goes on to deliver as when nothing holds the run and never marks final delivery complete, even after a pull request session has run; where every repository is already merged or delivered early, that delivery completes the run)
  - Replaces in part: AC-WAIVE-09 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (an item waived where it holds the run is matched by the item itself and stays waived for the rest of the run, even after the feature heads change)
- [ ] **AC-ITEM-02 — Every item says why it is there.** Each item gives its kind, the problem, the action the person takes and, when its kind stops or holds the run, what waits on it. Kiln refuses a report where an item gives no kind or, if it stops or holds the run, leaves out any of the rest; any other item is reported as it stands. The Needs you page and `kiln status` show all of them. The page opens **Kiln needs you for one thing** (or for _N_ things) whichever step listed them, and the status line names that step.
  - Replaces in part: AC-NEUTRAL-01 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (the report also gives each item's kind and, for an item that stops or holds the run, what waits on it)
- [ ] **AC-ITEM-03 — Any other item is reported with the delivery.** For an item that neither stops nor holds the run, the run goes on through the audits and delivery. The item stays outstanding and later audits account for it, as today. Each item still open at delivery is listed under **For you** in each pull request's description and on the finished page, followed by the actions the requirements place after Kiln's delivery; when it lists a critical finding, **For you** comes first, with that finding at its top.
  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (only an item that stops or holds the run under AC-ITEM-01 stops it, a test audit that changed only tests no longer waits for every item to be settled, and actions placed after Kiln's delivery are listed under **For you**, in the pull request description as well as at Complete)
  - Replaces in part: AC-TEST-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (behavior changed outside the requirements and a pending human action not holding the run no longer keep it from completing)
  - Replaces in part: AC-TEST-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (once no test loop is left, only an item that stops or holds the run under AC-ITEM-01 stops it)

### No Stop at a Loop Limit

With nothing to decide at a limit, the loop stop and its controls go away, and the run's page says where the run is instead.

- [ ] **AC-STOP-04 — There is no loop stop.** Kiln never stops at Needs you because a loop limit is reached. The loop stop page, **Allow _N_ more loops**, **Accept what is left and deliver**, and their commands `kiln allow-more-loops` and `kiln accept-and-deliver` are removed; a command given by an earlier script is refused with a message saying the limits are now changed with `kiln settings`.
  - Replaces: AC-STOP-01 and AC-STOP-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md`
  - Replaces in part: AC-STOP-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the loop stop page and its two stop commands are removed, and `kiln status` no longer shows the removed setting; `kiln settings` sets the two limits)
- [ ] **AC-STOP-05 — The run's page says which loop it is on.** During the closing audits, the status line names what is running: an audit with its loop and the limit, or a phase or session of test fixes as for any other work. At a Needs you stop it keeps the latest audit's loop. `kiln status` reports the same. It never adds a mark for the last loop; the numbers show it.
  - Superseded in part by: AC-MAX-01 in `docs/changes/kiln-planned-test-fix-batches/kiln-planned-test-fix-batches-prd.md` (the wording of each status line, and a session of test fixes named by its batch; what the status line names, and when, remains)

  | While | The status line says, for example |
  |---|---|
  | An audit runs | **Delivery audit loop 2 of 4** |
  | Kiln builds a phase an audit added | **Building Phase 10** |
  | Kiln fixes tests a test audit found | **Fixing tests from test audit loop 2 of 4** |
  | Kiln is stopped at Needs you | **Test audit loop 4 of 4** |

  - Replaces in part: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the header's current audit activity also names the loop and where it stands)
  - Replaces in part: AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (at a Needs you stop during the closing audits, the header keeps the loop position)
  - Superseded in part by: AC-PAUSE-03 and AC-PAUSE-05 in `docs/changes/kiln-pause-now/kiln-pause-now-prd.md` (the header while an audit is pausing or paused under Pause now).

### A Bot Can Do the Same

Every control on these screens that a person can press has a command a bot can run, as the controls Kiln already has do.

- [ ] **AC-BOT-01 — Every control on these screens has a command.** Each control in the table can be used from the command line, and `kiln status` lists each among the controls with whether it is available and why not, as it does for the existing commands. Settings chosen before Start, and **Authorize early merges** before a continuation, stay in the browser, as today.
  - Superseded in part by: AC-BOT-01 in `docs/changes/kiln-after-delivery/kiln-after-delivery-prd.md` (the command that continues with the offered phases also pushes this PRD's documents first, as Continue does, and `kiln check-for-new-phases` does what the card's Check now does).

  | On the page | From the command line |
  |---|---|
  | Change either limit during a run (AC-CHOICE-02) | `kiln settings` |
  | **Check for new phases** on the finished page (AC-FIND-01 in Kiln Continue Added Phases) | `kiln check-for-new-phases`, which checks as the button does |
  | **Continue with N phases** on a finished run where new phases were found (AC-OFFER-01 in Kiln Continue Added Phases) | A new command that continues with the phases the page offers |
  | Open an audit's session in a terminal | `kiln handoff`, as today |

  - Replaces in part: AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (two more commands join the controls: checking a finished run for new phases, and continuing it with the phases its page offers)
- [ ] **AC-BOT-02 — The command line shows what the page shows.** `kiln status` reports everything these screens show, in text and in its JSON form.

  | On the page | In `kiln status` |
  |---|---|
  | Which loop the run is on (AC-STOP-05) | The same |
  | On a finished run, the loops used of each kind and each pull request's address (AC-LEFT-02) | The same |
  | Each item for a person, with its kind, the problem, the action and what waits on it (AC-ITEM-02, AC-ITEM-03) | The same |
  | The offer to continue, when new phases were found: its phases, whether it is ready, and its problems | The same, with the latest check's status and time |

Retired labels, not reused: AC-GOON-01 to AC-GOON-04, AC-LEFT-03, AC-ANSWER-01 to AC-ANSWER-05, AC-CHOICE-03 (a run stopped at a loop stop when Kiln is upgraded: no special handling, ruling 2026-11-19) and AC-LAST-04 (the acceptance sentence for the last test loop: removed, ruling 2026-11-19).

## Out of Scope

- **A stop or question at a loop limit.** The limits are the person's control; a person who wants more checking sets higher limits, before Start or during the run.
- **Auditing again after a kind's last loop.** The pull request is where that work is reviewed.
- **Answering an item while Kiln keeps running.** An item that stops or holds the run is still answered at a stop, as today.
- **A separate default for each audit.** (AC-CHOICE-01)
- **Special handling for runs already under way when Kiln is upgraded.** Only runs started after the upgrade matter (ruling 2026-11-19).
- **Accepting Weak test rows.** Rows left after the last test audit's work are listed, not accepted (ruling 2026-11-19).
- **Any change to the Enso Method's skills.**
