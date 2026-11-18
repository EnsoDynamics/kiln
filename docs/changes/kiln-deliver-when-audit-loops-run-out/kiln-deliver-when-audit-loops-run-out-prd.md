# PRD: Kiln Deliver When Audit Loops Run Out

**Source:** Doug's review on 2026-11-18 of a run that stopped at its delivery audit loop limit, and the settings, stop and finished screens he worked through on mockups that day.

**Changes:** [Kiln Audit Loop Limits](../kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md), [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln Method-Neutral Audits](../kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md), [Kiln Completion Audits](../kiln-completion-audits/kiln-completion-audits-prd.md), [Kiln Bot Control](../../prds/kiln-bot-control/kiln-bot-control-prd.md)

**Mockup:** [Open the mockup](mockups/kiln-deliver-when-audit-loops-run-out.html).

**Assumptions:** [Kiln Deliver When Audit Loops Run Out assumptions](kiln-deliver-when-audit-loops-run-out-assumptions.md)

## Summary

When Kiln's closing audits use up their loops, Kiln delivers what is built and says what is left, instead of stopping to ask. One setting, **When the loops run out**, now covers both the delivery audit and the test audit, and its default keeps the run moving. The pull request and the finished page list what was left, and the phases an audit added stay in the plan so the person can continue with them. When Kiln does stop at a loop limit, the page says which loop the run is on and offers two answers: allow more loops, or accept what is left and deliver. An audit also stops a run for a person only for the reasons the Enso Method itself stops for, and for a test only the person can accept; anything else it names for the person is reported with the delivery.

## Business Context

Kiln Audit Loop Limits gave each closing audit a limit on how many times it can send Kiln back for more work. After the last test audit loop the person could choose to deliver or to be asked. After the last delivery audit loop there was no choice: Kiln always stopped, because it never delivered work the delivery audit said was unfinished.

Take the Customer Returns example the mockup uses, a PRD with 14 acceptance criteria. Each delivery audit finds a few more missing parts, and after the last loop the audit reports 11 criteria built, 3 partly built and none unbuilt. Under that rule Kiln stops overnight with nothing delivered, and the person has to read three small gaps and decide before anything moves. Kiln exists so that a person can start a run, leave, and come back to finished work.

Delivering in Kiln means opening a pull request, and a pull request is itself the point where a person reviews. Stopping at the limit and delivering at the limit ask the same question: is what is left worth more work? Delivering asks it with the work in hand and the list of what is left at the top. Nothing is claimed that isn't true: the phases the audit added stay in the plan, open and not started, and no criterion is marked built that isn't.

This needs no change to the Enso Method. Both audit skills already leave out a criterion that an open completion phase covers, so a person working by hand with the same skills can run the test audit while those phases are open and then open the pull request themselves. Kiln Audit Loop Limits kept the test audit waiting until no delivery audit work was outstanding, because building later would undo its results. This PRD reverses that, at a cost: when the person continues with the phases left open, the closing audits run again and the test audit redoes its work on what those phases change.

The same review found the stop page hard to use. It did not say which loop the run was on. It offered two controls for the same number, **Allow N more loops** on the page and the limit in the settings beside it, and they counted differently. It offered a reply box at a stop where the audit had finished and nothing would read the reply.

An audit can also list an item for the person that needs no one, such as an assumption the documents already declare, still waiting to be confirmed, with no work depending on it. Today every item an audit lists keeps the run from delivering, and nothing says what an audit may list. The Enso Method builds on a declared assumption without asking. It ends a session early only for a blocker, meaning something only a person can provide that the remaining work needs, for a business question with no workable answer, or for a critical finding that the next step of the work would cause or worsen; any other critical finding leads the report when the work is done. Run by hand, it names behavior changed outside the requirements and a human action still waiting in the wrap-up, and still opens the closing pull request. Kiln's audits should stop a run for the same reasons, and for a test the test audit skill accepts only when the person names it, and no others. Kiln never merges its own pull request, so the person still records the change or does the action before the work lands.

## Acceptance Criteria

### Choose Once What Happens When Loops Run Out

The person makes one choice for both audits, before the run starts, and the default lets the run finish without them. A **loop stop** is a stop at Needs you because an audit left something that only another loop or the person's acceptance can settle, and no loop of that kind is left: phases it added, test work it saved, or a test only the person can accept (AC-ITEM-01).

- [ ] **AC-CHOICE-01 — One choice covers both audits.** The **Audit loops** settings are the two limits and one choice, **When the loops run out**, wherever the three settings appear today: Documents found, the run's settings and `kiln settings`. The choice does what the table says for both audits. **Deliver, and tell me what is left** is the default, and shows the sentence it gives for the test audit (AC-LOOP-06 in Kiln Audit Loop Limits) as today. A run already going when Kiln is upgraded keeps the choice it had.

  | Choice | When loops run out |
  |---|---|
  | **Deliver, and tell me what is left** | Kiln goes on to delivery and reports what is left (AC-GOON-01, AC-LEFT-01). It still stops for something serious: a criterion not built at all (AC-GOON-03), an item that stops or holds the run (AC-ITEM-01), and test work still saved after the last test audit loop (AC-TEST-02 in Kiln Audit Loop Limits) |
  | **Always stop and ask me** | Kiln stops at Needs you at either audit's limit and opens no pull request until the person answers (AC-ANSWER-02) |

  - Replaces in part: AC-LOOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the third setting and its default option are renamed, and the setting covers the delivery audit too)
  - Replaces in part: AC-LOOP-06 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the default option's new name, in the first sentence's row)
  - Replaces in part: AC-TEST-01 and AC-STOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the setting's new name, and in AC-TEST-01 its default option's; otherwise unchanged)
- [ ] **AC-CHOICE-02 — A change at a stop does not answer the stop.** Changing the choice at a loop stop applies from the next time loops run out. That stop is answered only by the answers on its page (AC-ANSWER-02), and the settings say so.
  - Replaces in part: AC-LOOP-05 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a change to the choice at a loop stop applies from the next time loops run out, and does not answer that stop)

### Keep Going When the Delivery Audit Runs Out of Loops

Under the default, a delivery audit that still finds missing parts after its last loop no longer stops the run. What it found is recorded as phases, as always, and left for the person to decide on later.

- [ ] **AC-GOON-01 — Phases added past the limit are left open and the run goes on.** Under **Deliver, and tell me what is left**, when an audit adds phases and no delivery audit loop is left, Kiln builds none of them and goes on with the closing audits and delivery as it would after an audit that found nothing to build. A phase whose Phase dependencies name a phase left open is left open with it, whoever added it. This applies to every audit that adds phases after the limit, including a test audit and a delivery audit run again later.
  - Replaces in part: AC-DELIV-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (Kiln stops instead of building past the limit only under **Always stop and ask me**, or for a criterion not built at all)
  - Replaces in part: AC-HANDBACK-04 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (phases left open under this criterion do not delay the closing audits or delivery)
  - Replaces in part: AC-HANDBACK-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (a phase left open is not an eligible leaf for the rest of the run)
  - Replaces in part: AC-TEST-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (a criterion covered by a phase left open may remain partly built or not built at delivery, listed as what was left)
  - Replaces in part: AC-PR-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the pull request session also starts with phases left open)
  - Replaces in part: AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (phases left open need not satisfy their completion checks, and need no development verification)
- [ ] **AC-GOON-02 — The test audit runs while those phases are open.** Kiln starts the test audit with the phases left open, under the test audit's own limit and rules. The audit skill leaves out the criteria those phases cover, so their tests are not audited.
  - Replaces in part: AC-TEST-01 and AC-LOOP-03 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the test audit also starts after a delivery audit whose phases are left open under AC-GOON-01)
  - Replaces in part: AC-NEUTRAL-04 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (a passing or test-continuation report may leave open the phases left open under AC-GOON-01)
- [ ] **AC-GOON-03 — A criterion not built at all still stops the run.** When an audit adds phases past the limit and says a criterion is not built at all, as opposed to partly built, Kiln stops at Needs you under either choice and the page names those criteria. Kiln takes the distinction from the audit and judges nothing itself.
- [ ] **AC-GOON-04 — Nothing left open is recorded as done.** Kiln writes nothing to the repository to leave a phase open or to record that it was left. The phases keep no Closed line, the plan shows them not started, and their criteria stay unchecked.

### Say What Was Left

A person who comes back to a delivered run sees at once that work was left, what it was, and how to carry on with it.

- [ ] **AC-LEFT-01 — The pull request says what was left, at the top.** When a run delivers with work left, each pull request's description opens with what was left, as the table says, in the order AC-ITEM-03 gives.

  | Work left | What the description says |
  |---|---|
  | Phases left open (AC-GOON-01) | Each phase by number and title, and each criterion it covers, marked partly built or not built at all, with a line saying those criteria's tests were not audited; a phase left open because it depends on one is listed with that phase, its criteria not assessed by an audit |
  | Tests the person accepted while still Weak, missing or failing | Each criterion whose tests were accepted, then the line AC-TEST-03 in Kiln Audit Loop Limits gives, with its summary word for word |

  - Replaces in part: AC-TEST-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (its line moves to the top, after a list of the criteria whose tests were accepted; what the line says is unchanged)
  - Replaces in part: AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the pull request check also confirms each description opens with what was left)
- [ ] **AC-LEFT-02 — The finished page says the same.** When a run delivers with work left, its finished page is headed **Delivered, with work left** and lists what AC-LEFT-01 lists, with how many loops of each kind the run used. `kiln status` reports the same.
  - Replaces in part: AC-PR-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the phase plan also shows phases left open, as not started)
  - Replaces in part: AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a delivery with work left is headed **Delivered, with work left**; the delivery facts shown are unchanged)
  - Replaces in part: AC-DISPLAY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (a delivery with work left is headed **Delivered, with work left**; the delivery facts shown are unchanged)
- [ ] **AC-LEFT-03 — The person can continue with the phases still open.** When phases were left open, the finished page offers **Continue with N phases**, counting any phase added since delivery, and Kiln builds them where the table says. Either way the loop counts start at zero and the closing audits run again, as for any continued run (AC-LOOP-04 and its assumption RUN-003 in Kiln Audit Loop Limits). A limit raised by Allow stays raised in the continued run (LOOP-001).

  | When the person continues | Where Kiln builds |
  |---|---|
  | While every pull request of the delivery is still open | On the run's feature branch, updating those pull requests |
  | Once any of them has merged or closed | As any continuation does today (AC-CONTINUE-06 in Kiln Continue Added Phases) |

  While every pull request is still open, the plan is the one on the run's feature branch. A phase written only on the delivery base or in the shared checkout is shown as not ready, naming each document and where it was found, with the step to commit it on the feature branch, and Kiln offers no Continue until the sources agree (AC-FIND-02 in Kiln Continue Added Phases). A run continued on its feature branch keeps the development deployments and early-merge permissions the person gave it, and Kiln does not ask for them again (DEV-001).

  - Replaces in part: AC-CONTINUE-06 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (a continuation with phases left open at delivery builds where the table says; on the run's feature branch it reads the plan from that branch rather than from one committed on the delivery base, departing from assumption CONTINUE-002 in Kiln Continue Added Phases; and the readiness example there for an open, unmerged pull request does not apply to it)
  - Replaces in part: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the offer also appears for phases left open at delivery, under the **Delivered, with work left** heading instead of **New phases found**)
  - Replaces in part: AC-FIND-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (while every pull request of the delivery is open, the plan is read from the run's feature branch)
  - Replaces in part: AC-FIND-03 and AC-CONTINUE-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (a finished run's plan may hold phases left open at delivery; they count as unfinished work to continue, beside phases added since)
  - Replaces in part: AC-CONTINUE-05 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (a continuation on the run's feature branch records its delivery beside the earlier one, with the same pull requests, which it updates)
  - Replaces in part: AC-CONTINUE-09 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (a continuation on the run's feature branch keeps the early-merge permissions the run had rather than authorizing only a fresh run, DEV-001)

### Stop for a Person Only When the Work Cannot Go On

An audit can list things for a person. Kiln now says what may be listed, makes each item say why it is there, and stops the run only for the ones the work cannot go on without.

- [ ] **AC-ITEM-01 — An audit lists for a person only what the table allows.** Kiln's instructions to each audit define an item for a person as one of the kinds in the table, and say that a declared assumption, a request to confirm or review something, and anything the audit can settle itself are never items. Kiln handles each kind as the table says, and opens no pull request while an item stops or holds the run. An item **holds the run** while work Kiln will still do in this run needs it, delivery included: Kiln goes on with the work that does not need it and stops at Needs you once none is left, as AC-NEUTRAL-03 in Kiln Method-Neutral Audits does for an item today.

  | Kind of item | What Kiln does |
  |---|---|
  | A critical finding that Kiln's next step would cause or worsen | Stops at Needs you at once |
  | Any other critical finding | Goes on, and reports it first (AC-ITEM-03) |
  | A blocker: access, a resource, a permission or an action that only a person can provide and that work Kiln will still do needs | Holds the run |
  | A business question whose best answer is below 20% | Holds the run |
  | A test only the person can accept: a criterion with no test, a failing test, a high-risk criterion still Weak, or a row the audit marked stuck | Holds the run; once no test audit loop is left, its stop is a loop stop |
  | Anything else the audit skill names for the person, such as behavior changed outside the requirements or a human action that no work Kiln will still do needs | Goes on, and reports it with the delivery (AC-ITEM-03) |

  - Replaces in part: AC-LOOP-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (only a critical finding that Kiln's next step would cause or worsen stops at once, and other critical findings are reported; a missing permission or a decision the audit cannot make holds the run instead)
- [ ] **AC-ITEM-02 — Every item says why it is there.** Each item gives its kind, the problem, the action the person takes and, when its kind stops or holds the run, what waits on it. Kiln refuses a report where an item gives no kind or, if it stops or holds the run, leaves out any of the rest; any other item is reported as it stands. The Needs you page and `kiln status` show all of them.
  - Replaces in part: AC-NEUTRAL-01 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (the report also gives each item's kind and, for an item that stops or holds the run, what waits on it; whether each criterion its added phases cover is partly built or not built at all; and the tests accepted while still Weak, missing or failing)
- [ ] **AC-ITEM-03 — Any other item is reported with the delivery.** For an item that neither stops nor holds the run, the run goes on through the audits and delivery under either choice. The item stays outstanding and later audits account for it, as today. Each item still open at delivery is listed under **For you** in each pull request's description and on the finished page, after what was left; when it lists a critical finding, **For you** comes first, with that finding at its top.
  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (only an item that stops or holds the run under AC-ITEM-01 stops it, and a test audit that changed only tests no longer waits for every item to be settled)
  - Replaces in part: AC-TEST-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (behavior changed outside the requirements, and a pending human action not holding the run, no longer keep it from completing)
  - Replaces in part: AC-TEST-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (once no test loop is left, only an item that stops or holds the run under AC-ITEM-01 stops it, and a stop is a loop stop only as defined above)

### Make a Loop Stop Easy to Answer

At a loop stop, the page says where the run is and asks one question with two answers.

- [ ] **AC-ANSWER-01 — The page says which loop the run is on.** A loop stop's page names the loop in the three places the table gives, and says in one line what a loop is for that audit. The status line names the loop at every closing audit.

  | Part of the page | What it shows |
  |---|---|
  | Status line | The audit and the loop it followed, such as **Delivery audit (after loop 3 of 3)**, or **(before loop 1)** when no loop has run |
  | Heading | The last loop done and that work is left, such as **Loop 3 of 3 is done. The audit found more.** |
  | The loops | One row per loop, in order, with what it did and how long it ran; then the work that is waiting, as the next loop's row, marked as not started and over the limit |

  - Replaces in part: AC-STOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the heading and the list of loops)
- [ ] **AC-ANSWER-02 — One decision, two answers.** Every loop stop offers the two answers in the table, and one button that carries out the one chosen.

  | Answer | What Kiln does |
  |---|---|
  | Go on, with **Allow up to N more loops**, N a whole number of 1 or more, filled in as 2 | Raises that kind's limit to the loops used plus N and starts the next loop. The count is kept, so the next loop is numbered after the last |
  | **Accept what is left and deliver** | At a delivery audit stop, leaves the added phases open and goes on as AC-GOON-01 says, including any criterion the page names as not built at all. At a test audit stop, as today (AC-STOP-02 in Kiln Audit Loop Limits), its sentence naming only the listed tests |

  - Replaces in part: AC-STOP-02 and AC-LOOP-06 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (Allow raises the limit instead of setting it to N and restarting the count; Accept is also offered at a delivery audit stop and names only tests)
  - Replaces in part: AC-LOOP-04 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a count no longer starts again when the person allows more loops)
- [ ] **AC-ANSWER-03 — The page says what the number buys.** Under the number, the page gives the limit it leads to and what each loop is for. At a delivery audit stop it names the phases the next loop builds and says the loops after it are spare, in case a later audit finds more.
- [ ] **AC-ANSWER-04 — The limit is raised in one place.** At a loop stop, that kind's limit is raised only by Allow (AC-ANSWER-02). The run's settings on the page show that limit and the loops used as text, not as a field, and `kiln settings` refuses to change it. Check again is not offered there, on the page or from the command line. The other limit and the choice stay editable in both places.
  - Replaces in part: AC-STOP-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (at a loop stop, the limit it stopped on is raised only by Allow, and Check again is not offered)
  - Replaces in part: AC-LOOP-05 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (at a loop stop, that kind's limit cannot be changed in the settings)
- [ ] **AC-ANSWER-05 — No reply box where nothing would read it.** A loop stop whose audit has finished offers no Reply. The audit's session can still be opened in a terminal.
  - Replaces in part: AC-STOP-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (Reply is no longer offered at any loop stop whose audit has finished)

### A Bot Can Do the Same

Every control on these screens that a person can press has a command a bot can run, as the controls Kiln already has do.

- [ ] **AC-BOT-01 — Every control on these screens has a command.** Each control in the table can be used from the command line, and `kiln status` lists each among the controls with whether it is available and why not, as it does for the existing commands. Settings chosen before Start stay in the browser, as today.

  | On the page | From the command line |
  |---|---|
  | Change either limit or **When the loops run out** during a run (AC-CHOICE-01), apart from the limit a loop stop is on (AC-ANSWER-04) | `kiln settings` |
  | Go on with **Allow up to N more loops** (AC-ANSWER-02) | `kiln allow-more-loops`, taking N, which does what Allow does |
  | **Accept what is left and deliver**, at a delivery audit stop or a test audit stop (AC-ANSWER-02) | `kiln accept-and-deliver`, no longer refused at a delivery audit stop |
  | **Continue with N phases** on the finished page (AC-LEFT-03) | A new command that continues with the phases the page offers, here and on a finished run where new phases were found |
  | Open the audit's session in a terminal | `kiln handoff`, as today |

  - Replaces in part: AC-STOP-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the choice's name and reach, what the Allow command does to the limit, Accept at a delivery audit stop, and `kiln settings` at a loop stop)
  - Replaces in part: AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (one more command joins the controls: continuing a finished run with the phases its page offers)
- [ ] **AC-BOT-02 — The command line shows what the page shows.** `kiln status` reports everything these screens show, in text and in its JSON form.

  | On the page | In `kiln status` |
  |---|---|
  | Which loop the run is on, and at a loop stop the loops that ran and the work waiting (AC-ANSWER-01) | The same, with the answers available there |
  | On a finished run, what was left and each pull request's address (AC-LEFT-01, AC-LEFT-02) | The same |
  | Each item for a person, with its kind, the problem, the action and what waits on it (AC-ITEM-02, AC-ITEM-03) | The same |

## Out of Scope

- **Answering an item while Kiln keeps running.** An item that stops or holds the run is still settled at a stop, as today.
- **A note sent with more loops, or choosing which added phases to build.** The answers are all or none. A person who wants something narrower opens the audit's session in a terminal.
- **A separate choice for each audit.** One choice covers both.
- **Continuing on the open branch when no phase was left open.** When a run delivered with nothing left open and a person adds a phase while every pull request is still open, Kiln does what it does today (AC-CONTINUE-06 in Kiln Continue Added Phases) and does not extend the open pull requests.
- **The default limits.** Both stay at 3.
- **Any change to the Enso Method's skills.**
