# PRD: Kiln Deliver When Audit Loops Run Out

**Source:** Doug's review on 2026-11-18 of a run that stopped at its delivery audit loop limit, the settings, stop and finished screens he worked through on mockups that day, and his ruling the same day on the stakeholder review: when an audit finds work, Kiln always does it, and at the limit Kiln moves on instead of auditing again.

**Changes:** [Kiln Audit Loop Limits](../kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md), [Kiln Completion Audits](../kiln-completion-audits/kiln-completion-audits-prd.md), [Kiln Method-Neutral Audits](../kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md), [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md), [Kiln Checks at a Stop](../kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md), [Kiln Bot Control](../../prds/kiln-bot-control/kiln-bot-control-prd.md), [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), [Kiln Development Deployments](../kiln-development-deployments/kiln-development-deployments-prd.md), [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md)

**Mockup:** [Open the mockup](mockups/kiln-deliver-when-audit-loops-run-out.html).

**Assumptions:** [Kiln Deliver When Audit Loops Run Out assumptions](kiln-deliver-when-audit-loops-run-out-assumptions.md)

## Summary

When Kiln's closing audits find work, Kiln does it, and the loop limits decide when to stop looking; only test work found in the very last test session is listed for the person instead. Each loop is an audit's findings being built or fixed. Once a kind of audit has used its last loop, Kiln runs no more audits of that kind and moves on: from the delivery audit to the test audit, and from the test audit to the pull request. Kiln never stops to ask at a limit, so the setting that chose between delivering and stopping, the loop stop page and its answers all go away. Both limits default to 4. The pull request and the finished page say how many loops of each kind ran. An audit also stops a run for a person only for the reasons the Enso Method itself stops for; anything else it names for the person is reported with the delivery.

## Business Context

Kiln Audit Loop Limits gave each closing audit a limit on how many times it can send Kiln back for more work. After the last delivery audit loop, if the audit still found missing parts, Kiln always stopped, because it never delivered work the delivery audit said was unfinished.

Take the Customer Returns example the mockup uses, a PRD with 14 acceptance criteria. Each delivery audit finds a few more missing parts, and after the last loop the audit adds two phases for three partly built criteria. Under that rule Kiln stops overnight with nothing delivered, and the person has to read three small gaps and decide before anything moves. Kiln exists so that a person can start a run, leave, and come back to finished work.

The first answer considered was to deliver at the limit and leave the last audit's phases open in the plan. That leaves work written out and never done, which is the wrong ending: when an audit has found something and said what to do about it, the useful next step is to do it. So every audit's findings are built, and the limit is where Kiln stops looking for more: after the last loop of a kind, no audit of that kind runs again. A run therefore always ends on finished work, and nothing waits in the plan unbuilt.

The cost is that the work of each kind's last loop is not audited again before the pull request opens. The pull request is where a person reviews, the test audit still runs over everything the delivery audit's last loop built, and the limit is the person's own choice of how much checking is enough. Raising both defaults from 3 to 4 keeps the number of delivery audits a run gets where it was, four, while now building what the fourth one finds. The delivery and test audits are recent additions to the method, and four loops of each is generous; a person who wants more sets more.

The same review found the stop page hard to use: it did not say which loop the run was on, offered two controls for the same number, and offered a reply box nothing would read. With no stop at a limit, that page goes away.

An audit can also list an item for the person that needs no one, such as an assumption the documents already declare, still waiting to be confirmed, with no work depending on it. Today every item an audit lists keeps the run from delivering, and nothing says what an audit may list. The Enso Method builds on a declared assumption without asking. It ends a session early only for a blocker, meaning something only a person can provide that the remaining work needs, for a business question with no workable answer, or for a critical finding that the next step of the work would cause or worsen; any other critical finding leads the report when the work is done. Run by hand, it names behavior changed outside the requirements and a human action still waiting in the wrap-up, and still opens the closing pull request. Kiln's audits should stop a run for the same reasons and no others. Kiln never merges its own pull request, so the person still records the change or does the action before the work lands.

This needs no change to the Enso Method. Run by hand, a person does what each audit finds and decides when to stop auditing; Kiln does the same with the person's limits.

## Acceptance Criteria

### Two Limits, Each Defaulting to 4

The person sets one limit for each audit before the run starts, and nothing else: Kiln never stops at a limit, so there is nothing to choose about what happens there.

- [ ] **AC-CHOICE-01 — The Audit loops settings are two limits.** The **Audit loops** settings are **Delivery audit loops, at most** and **Test audit loops, at most**, each a whole number of 1 or more with a default of 4, wherever the settings appear today: Documents found, the run's settings and `kiln settings`. The third setting, **After the last test audit loop**, is removed from all three. The test audit limit's help text shows the sentence Kiln gives the test audit's last loop (AC-LAST-04), so starting the run with it on screen is the person's acceptance, as choosing the removed setting was. A run already going when Kiln is upgraded keeps its loop counts, and each of its limits goes up by one, because an earlier Kiln's limit of 3 meant 3 loops and a fourth audit whose findings were not built, which a limit of 4 now covers. Its third setting no longer appears; what it chose decides only whether the last test loop carries the sentence (AC-LAST-04). A run begun before Kiln Audit Loop Limits still counts the loops its saved audit history shows, as AC-LOOP-07 there says, and its limits go from 3 to 4 the same way.
  - Replaces in part: AC-LOOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (two settings instead of three; both defaults 4)
  - Replaces in part: AC-LOOP-06 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the first sentence is shown beside the test audit limit, chosen by starting or keeping a run with it; the second sentence, given by Accept, is no longer offered)
  - Replaces in part: AC-LOOP-07 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (no run runs under Always stop and ask me, and its limits go from 3 to 4; its loops are still counted from its saved audit history)
- [ ] **AC-CHOICE-02 — A limit changed during a run applies at Kiln's next decision.** The person can change either limit during a run, on the page or with `kiln settings`. A change applies from Kiln's next decision whether to run an audit of that kind. A limit cannot be set below the loops of that kind already used plus those the latest audit or session of that kind has been told it will have and has not yet used: the loop its findings take and, when it was told a test audit follows, the loop after that. So what a session was told stays true, and work an audit has already reported is still done (AC-LAST-01). Raising the delivery audit limit after its last loop, before the pull request session starts, runs a delivery audit wherever that limit set from the start would, once any test audit under way ends: on phases the last delivery loop built that no delivery audit has checked, or, while a test audit loop is left, on work changed since the latest delivery audit. Otherwise the raise changes nothing. After that delivery audit, the test audit runs again only while a test audit loop is left, and otherwise Kiln goes on to the pull request. Raising the test audit limit after its last loop, before the pull request session starts, runs the test audit again wherever it has work, as that limit set from the start would: the test work the last loop saved, or work changed since the latest test audit. A last loop whose session of test fixes passed, on work unchanged since, leaves the test audit nothing to do, and Kiln goes on to the pull request. An acceptance a last loop already gave stands, and the new last loop carries the sentence again. Once the pull request session has started, a change applies only to a continuation, whose settings carry over as today.
  - Replaces in part: AC-LOOP-05 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (two settings; a limit cannot be set below the loops already used and those the latest audit or session of that kind was told it will have; a raise after a kind's last loop runs that audit again wherever it has work, until the pull request session starts)
- [ ] **AC-CHOICE-03 — A run stopped at a loop limit when Kiln is upgraded goes on under the new rule.** A run that an earlier Kiln stopped at a loop stop goes on when the person presses Check again or runs `kiln run`, without asking. Where work is waiting (added phases or saved test work), its limit has gone up by one (AC-CHOICE-01), so Kiln does that work as that kind's last loop (AC-LAST-01, AC-LAST-04) and moves on. Where the stop was for items a test audit listed, with no work waiting, Kiln handles each item by its kind (AC-ITEM-01): it goes on, or stops again for one that stops or holds the run.

### Do What Every Audit Finds, Then Move On

A loop is an audit's findings being done. Kiln does them, audits again while loops are left, and moves on when they run out.

- [ ] **AC-LAST-01 — Every audit's findings are done.** When a delivery audit adds phases, Kiln builds them. When a test audit adds phases or saves test work, Kiln builds or fixes them. This holds whatever the loop counts are: a finding is never left in the plan because no loop is left. The one exception is test work saved by the session of the test audit's last loop, which is listed under **For you** instead (AC-LAST-03).
  - Replaces: AC-DELIV-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md`
  - Replaces in part: AC-TEST-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a report that adds phases or saves test work never stops the run because no loop is left)
- [ ] **AC-LAST-02 — Each kind of loop is the work on that audit's own findings.** A **delivery audit loop** is building the phases a delivery audit added. A **test audit loop** is the work on one test audit's report: building the phases it added, if any, then one session of test fixes if it saved test work, even when a delivery audit runs first because that report changed implementation. Each count starts and carries over as today (AC-LOOP-04 in Kiln Audit Loop Limits), apart from Allow, which no longer exists.
  - Replaces in part: AC-LOOP-02 and AC-LOOP-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (phases a test audit adds are a test audit loop; a session started by Allow no longer exists)
  - Replaces in part: AC-LOOP-04 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a count never starts again during a run)
- [ ] **AC-LAST-03 — After a kind's last loop, no audit of that kind runs again.** Once a kind has used its last loop, Kiln runs no further audit of that kind in this run and goes on as it would after that audit passed: after the delivery audit, to the test audit; after the test audit, to the pull request. A delivery audit that would have followed a test audit's phases does not run once no delivery audit loop is left. A session of test fixes also reports, like an audit. When the test audit's last loop's session reports, Kiln builds any phases it added, with no audit after them, as part of that loop. Test work it saves is not started; the criteria it covers are listed under **For you** with what the report says is left (AC-ITEM-03, TEST-001).
  - Replaces in part: AC-TEST-01 and AC-LOOP-03 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the test audit also starts after the delivery audit's last loop, with no delivery audit after it)
  - Replaces in part: AC-TEST-03, AC-RUN-03 and AC-AUDIT-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (after a kind's last loop no audit of that kind runs again: a test audit's phases are followed by a delivery audit only while a delivery audit loop is left, and the pull request session starts without a current audit of a closed kind)
  - Replaces in part: AC-NEUTRAL-06 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (after a test audit changes implementation, a fresh delivery audit runs only while a delivery audit loop is left, and a fresh test audit only while a test audit loop is left)
  - Replaces in part: AC-CONTINUE-05 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (in a continuation, the work of a kind's last loop is not audited again)
  - Replaces in part: AC-WAIVE-12 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (work added by phases a marked-complete audit appended is audited afresh only while a loop of that kind is left)
- [ ] **AC-LAST-04 — The test audit's last loop is told it is the last.** The session of the test audit's last loop is told no more test loops follow, and carries the sentence shown beside the test audit limit, "I accept the remaining Weak rows after the last test audit loop.", quoted as the person's words with where and when the run was started with it, as today's default does (AC-TEST-01 and AC-TEST-03 in Kiln Audit Loop Limits). It carries the sentence only when the person gave it: the run, or the run it continues, was started with the sentence shown beside the test audit limit, or its person chose the removed setting's **Deliver, unless something serious is left**. Otherwise, as for a run whose person chose **Always stop and ask me** or a run begun before Kiln Audit Loop Limits, the last loop carries no sentence, and the Weak rows still left are listed under **For you** as not accepted (TEST-001). A last loop with no session of test fixes, only phases to build, carries no sentence.
  - Replaces in part: AC-TEST-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the sentence comes from the test audit limit, not the removed setting; no session runs under Always stop and ask me)
- [ ] **AC-LAST-05 — Nothing is recorded as done that isn't.** Kiln marks no criterion built and closes no phase that its own sessions did not. A test the last loop's sentence does not accept is reported, not hidden (AC-ITEM-01, TEST-001).

### Say How Many Loops Ran

A person who comes back to a delivered run sees how much checking it got, without a warning.

- [ ] **AC-LEFT-01 — The pull request says how many loops ran.** Each pull request's description opens with **For you** (AC-ITEM-03), when it lists anything, and then says how many loops of each kind the run used and whether that was the limit, such as "Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops." It keeps today's line for the test audit's last loop (AC-TEST-03 in Kiln Audit Loop Limits), and **For you** lists the tests that sentence did not accept. With a pull request already open, including one opened outside Kiln, Kiln completes the run only after a pull request session in this run has written this run's **For you** and loop counts into its description, or when the person marks final delivery complete. When an out-of-date description is all that stops final delivery, Check again starts that session, and the person can mark final delivery complete without checking again first.
  - Replaces in part: AC-TEST-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the loop counts are added beside its line)
  - Replaces in part: AC-PR-01 in `docs/prds/kiln-v1/kiln-v1-prd.md`, AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` and AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (a pull request already open is completed only after a pull request session in this run has written its **For you** and loop counts into the description, or when the person marks final delivery complete)
  - Replaces in part: AC-WAIVE-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` and AC-STOPCHECK-02 in `docs/changes/kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md` (where the only failing check at final delivery is the pull request description, Check again there starts the pull request session, so **Mark final delivery complete** can be pressed on the check that stopped Kiln, without Check again first, and the line saying what Check again runs is left out)
- [ ] **AC-LEFT-02 — The finished page and `kiln status` say the same.** A delivered run's finished page and `kiln status` show the loops of each kind used and whether that was the limit, beside the delivery facts they show today. The heading is unchanged.
  - Replaces in part: AC-PR-04 in `docs/prds/kiln-v1/kiln-v1-prd.md`, AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` and AC-DISPLAY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (the Complete screen also shows the loops used of each kind and **For you**)
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Complete also shows the loops of each kind used and **For you**; the rest of its layout remains)

### Stop for a Person Only When the Work Cannot Go On

An audit can list things for a person. Kiln now says what may be listed, makes each item say why it is there, and stops the run only for the ones the work cannot go on without.

- [ ] **AC-ITEM-01 — An audit lists for a person only what the table allows.** Kiln's instructions to each audit define an item for a person as one of the kinds in the table, and say that a declared assumption, a request to confirm or review something, and anything the audit can settle itself are never items. Kiln handles each kind as the table says, and opens no pull request while an item stops or holds the run. An item **holds the run** while work Kiln will still do in this run needs it, delivery included: Kiln goes on with the work that does not need it and stops at Needs you once none is left, as AC-NEUTRAL-03 in Kiln Method-Neutral Audits does for an item today. At that stop the person can provide what each item asks outside Kiln and carry on: Kiln records each item as waived, never as settled, and goes on to deliver as when nothing holds the run, instead of marking delivery complete. Each item stays listed under **For you** as still open, marked **Waived**. Kiln does not stop on a waived item again.

  | Kind of item | What Kiln does |
  |---|---|
  | A critical finding that Kiln's next step would cause or worsen | Stops at Needs you at once |
  | Any other critical finding | Goes on, and reports it first (AC-ITEM-03) |
  | A blocker: access, a resource, a permission or an action that only a person can provide and that work Kiln will still do needs | Holds the run |
  | A business question whose best answer is below 20% | Holds the run |
  | A test only the person can accept: a criterion with no test, a failing test, a high-risk criterion still Weak, or a row the audit marked stuck | Goes on: later test audit loops may fix it, and one still open at delivery is reported (AC-ITEM-03, TEST-001) |
  | Anything else the audit skill names for the person, such as behavior changed outside the requirements or a human action that no work Kiln will still do needs | Goes on, and reports it with the delivery (AC-ITEM-03) |

  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (only a critical finding that Kiln's next step would cause or worsen stops at once; a blocker or a business question whose best answer is below 20% holds the run while work that does not need it goes on)
  - Replaces in part: AC-WAIVE-02 and AC-WAIVE-04 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (where an item holds the run, the offer is **Continue in normal order**, which goes on to deliver as when nothing holds the run and never itself completes the run, even after a pull request session has run)
- [ ] **AC-ITEM-02 — Every item says why it is there.** Each item gives its kind, the problem, the action the person takes and, when its kind stops or holds the run, what waits on it. Kiln refuses a report where an item gives no kind or, if it stops or holds the run, leaves out any of the rest; any other item is reported as it stands. The Needs you page and `kiln status` show all of them.
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
- [ ] **AC-STOP-05 — The run's page says which loop it is on.** During the closing audits, the status line names the kind and where it stands, as each loop's activity row already does (AC-SHOW-01 in Kiln Audit Loop Limits), and keeps it at a Needs you stop. `kiln status` reports the same.

  | While | The status line says, for example |
  |---|---|
  | An audit runs, before any loop of its kind | **Delivery audit (before loop 1)** |
  | An audit runs after a loop | **Delivery audit (after loop 2 of 4)** |
  | A loop runs | **Delivery audit loop 3 of 4**, or **Delivery audit loop 4 of 4 · last loop** |

  - Replaces in part: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the header's current audit activity also names the loop and where it stands)
  - Replaces in part: AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (at a Needs you stop during the closing audits, the header keeps the loop position)

### A Bot Can Do the Same

Every control on these screens that a person can press has a command a bot can run, as the controls Kiln already has do.

- [ ] **AC-BOT-01 — Every control on these screens has a command.** Each control in the table can be used from the command line, and `kiln status` lists each among the controls with whether it is available and why not, as it does for the existing commands. Settings chosen before Start, and **Authorize early merges** before a continuation, stay in the browser, as today.

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

Retired labels, not reused: AC-GOON-01 to AC-GOON-04, AC-LEFT-03 and AC-ANSWER-01 to AC-ANSWER-05, from the earlier draft that left the last audit's phases open and stopped to ask at a limit.

## Out of Scope

- **A stop or question at a loop limit.** The limits are the person's control; a person who wants more checking sets higher limits, before Start or during the run.
- **Auditing again after a kind's last loop.** The pull request is where that work is reviewed.
- **Answering an item while Kiln keeps running.** An item that stops or holds the run is still answered at a stop, as today.
- **A separate default for each audit.** Both default to 4.
- **Any change to the Enso Method's skills.**
