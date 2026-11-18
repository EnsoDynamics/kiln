# PRD: Kiln Deliver When Audit Loops Run Out

**Source:** Doug's review on 2026-11-18 of a run that stopped at its delivery audit loop limit, and the settings, stop and finished screens he worked through on mockups that day.

**Changes:** [Kiln Audit Loop Limits](../kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md), [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md)

**Mockup:** [Open the mockup](mockups/kiln-deliver-when-audit-loops-run-out.html).

**Assumptions:** [Kiln Deliver When Audit Loops Run Out assumptions](kiln-deliver-when-audit-loops-run-out-assumptions.md)

## Summary

When Kiln's closing audits use up their loops, Kiln delivers what is built and says what is left, instead of stopping to ask. One setting, **When the loops run out**, now covers both the delivery audit and the test audit, and its default keeps the run moving. The pull request and the finished page list what was left, and the phases an audit added stay in the plan so the person can continue with them. When Kiln does stop at a loop limit, the page says which loop the run is on and offers two answers: allow more loops, or accept what is left and deliver. An audit also holds a run for a person only when delivery cannot go ahead without them; anything else it names for the person is reported with the delivery.

## Business Context

Kiln Audit Loop Limits gave each closing audit a limit on how many times it can send Kiln back for more work. After the last test audit loop the person could choose to deliver or to be asked. After the last delivery audit loop there was no choice: Kiln always stopped, because it never delivered work the delivery audit said was unfinished.

Take the Customer Returns example the mockup uses, a PRD with 14 acceptance criteria. Each delivery audit finds a few more missing parts, and after the last loop the audit reports 11 criteria built, 3 partly built and none unbuilt. Under that rule Kiln stops overnight with nothing delivered, and the person has to read three small gaps and decide before anything moves. Kiln exists so that a person can start a run, leave, and come back to finished work.

Delivering in Kiln means opening a pull request, and a pull request is itself the point where a person reviews. Stopping at the limit and delivering at the limit ask the same question: is what is left worth more work? Delivering asks it with the work in hand and the list of what is left at the top. Nothing is claimed that isn't true: the phases the audit added stay in the plan, open and not started, and no criterion is marked built that isn't.

This needs no change to the Enso Method. Both audit skills already leave out a criterion that an open completion phase covers, so running the test audit and opening a pull request while those phases are open is something a person can do by hand with the same skills.

The same review found the stop page hard to use. It did not say which loop the run was on. It offered two controls for the same number, **Allow N more loops** on the page and the limit in the settings beside it, and they counted differently. It offered a reply box at a stop where the audit had finished and nothing would read the reply.

An audit can also list an item for the person that needs no one, such as an assumption the documents already declare, still waiting to be confirmed, with no work depending on it. Today every item an audit lists holds the run before delivery, and nothing says what an audit may list. The Enso Method builds on a declared assumption without asking, and stops a session for four reasons only: a critical finding, a blocker, an action only a person can take when it is also a blocker, and a business question with no workable answer. Kiln's audits should hold a run for the same reasons and no others.

## Acceptance Criteria

### Choose Once What Happens When Loops Run Out

The person makes one choice for both audits, before the run starts, and the default lets the run finish without them.

- [ ] **AC-CHOICE-01 — One choice covers both audits.** The **Audit loops** settings are the two limits and one choice, **When the loops run out**, wherever the three settings appear today: Documents found, the run's settings and `kiln settings`. The choice does what the table says for both audits. **Deliver, and tell me what is left** is the default, and shows the sentence it gives for the test audit (AC-LOOP-06 in Kiln Audit Loop Limits) as today. A run already going when Kiln is upgraded keeps the choice it had (SET-001).

  | Choice | When loops run out |
  |---|---|
  | **Deliver, and tell me what is left** | Kiln goes on to delivery and reports what is left (AC-GOON-01, AC-LEFT-01). It still stops for something serious: a criterion not built at all (AC-GOON-03), and what the test audit stops for today (AC-TEST-02 in Kiln Audit Loop Limits) |
  | **Always stop and ask me** | Kiln stops at Needs you at either audit's limit and opens no pull request until the person answers (AC-ANSWER-02) |

  - Replaces in part: AC-LOOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the third setting is renamed and covers the delivery audit too)
  - Replaces in part: AC-LOOP-06 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the name of the choice that gives the first sentence)
- [ ] **AC-CHOICE-02 — A change at a stop does not answer the stop.** Changing the choice while Kiln is stopped because loops ran out applies from the next time loops run out. That stop is answered only by the answers on its page (AC-ANSWER-02), and the settings say so.

### Keep Going When the Delivery Audit Runs Out of Loops

Under the default, a delivery audit that still finds missing parts after its last loop no longer holds the run. What it found is recorded as phases, as always, and left for the person to decide on later.

- [ ] **AC-GOON-01 — Phases added past the limit are left open and the run goes on.** Under **Deliver, and tell me what is left**, when an audit adds phases and no delivery audit loop is left, Kiln builds none of them and goes on with the closing audits and delivery as it would after an audit that found nothing to build. This holds for every audit that adds phases after the limit, including a test audit and a delivery audit run again later.
  - Replaces in part: AC-DELIV-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (Kiln stops instead of building past the limit only under **Always stop and ask me**, or for a criterion not built at all)
- [ ] **AC-GOON-02 — The test audit runs while those phases are open.** Kiln starts the test audit with the phases left open, under the test audit's own limit and rules. The audit skill leaves out the criteria those phases cover, so their tests are not audited.
- [ ] **AC-GOON-03 — A criterion not built at all still stops the run.** When the audit that added the phases says a criterion is not built at all, as opposed to partly built, Kiln stops at Needs you under either choice and the page names those criteria. Kiln takes the distinction from the audit and judges nothing itself.
- [ ] **AC-GOON-04 — Nothing left open is recorded as done.** Kiln writes nothing to the repository to leave a phase open or to record that it was left. The phases keep no Closed line, the plan shows them not started, and their criteria stay unchecked.

### Say What Was Left

A person who comes back to a delivered run sees at once that work was left, what it was, and how to carry on with it.

- [ ] **AC-LEFT-01 — The pull request says what was left, at the top.** When a run delivers with phases left open, each pull request's description opens with what was left: each open phase by number and title, the criteria it covers, and that those criteria's tests were not audited. What the test audit left is reported as today (AC-TEST-03 in Kiln Audit Loop Limits).
- [ ] **AC-LEFT-02 — The finished page says the same.** The finished run's page is headed **Delivered, with work left**, and lists the same phases and criteria with how many loops of each kind the run used. `kiln status` reports the same.
- [ ] **AC-LEFT-03 — The person can continue with the phases left open.** The finished page offers **Continue with N phases** for them as the table says. Either way the loop counts start at zero and the closing audits run again, as for any continued run.

  | When the person continues | Where Kiln builds |
  |---|---|
  | Before the delivery has merged | On the run's feature branch, updating the pull requests already open |
  | After it has merged | As any continuation does today (Kiln Continue Added Phases) |

  - Replaces in part: AC-HANDBACK-04 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (phases left open under AC-GOON-01 do not hold back the final audits or delivery)
  - Replaces in part: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the offer also appears for phases left open at delivery, under the **Delivered, with work left** heading, without waiting for the delivery to merge)

### Stop for a Person Only When Delivery Cannot Go Ahead

An audit can list things for a person. Kiln now says what may be listed, makes each item say why it is there, and holds the run only for the ones delivery cannot go ahead without.

- [ ] **AC-ITEM-01 — An audit lists for a person only what the table allows.** Kiln's instructions to each audit define an item for a person as one of the kinds in the table. They say that a declared assumption, a request to confirm or review something, and anything the audit can settle itself are never items.

  | Kind of item | Holds the run before delivery |
  |---|---|
  | A critical finding | Yes |
  | A blocker: access, a resource or a permission the session cannot get itself, with criterion work that cannot proceed without it | Yes |
  | An action the requirements place before delivery that only a person can take | Yes |
  | A business question whose best answer is below 20% | Yes |
  | A test only the person can accept: a criterion with no test, a failing test, a high-risk criterion still Weak, or a row the audit marked stuck | Yes, as today (AC-TEST-02 in Kiln Audit Loop Limits) |
  | Anything else the audit skill names for the person, such as behavior changed outside the requirements or a human action still waiting | No (AC-ITEM-03, ITEM-001) |

- [ ] **AC-ITEM-02 — Every item says why it is there.** Each item gives its kind, the problem, the action the person takes and, when it holds the run, what cannot go ahead without it. Kiln refuses a report whose item leaves one of these out. The Needs you page and `kiln status` show all of them.
- [ ] **AC-ITEM-03 — An item that does not hold the run is reported with the delivery.** The run goes on through the audits and delivery under either choice. The item stays outstanding and later audits account for it, as today. Each item still open at delivery is listed under **For you** at the top of each pull request's description, after what was left, and on the finished page.
  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (only an item of a kind that holds the run stops it before delivery; an audit that ended normally and lists behavior changed outside the requirements no longer stops)
  - Replaces in part: AC-TEST-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a passing report that lists an item stops the run only for an item of a kind that holds it)

### Make a Loop Stop Easy to Answer

Kiln still stops when loops run out under **Always stop and ask me**, or when something serious is left. The page then says where the run is and asks one question with two answers.

- [ ] **AC-ANSWER-01 — The page says which loop the run is on.** A loop stop's page names the loop in three places, and says in one line what a loop is for that audit.

  | Part of the page | What it shows |
  |---|---|
  | Status line | The audit and the loop it followed, such as **Delivery audit (after loop 3 of 3)** |
  | Heading | The last loop done and that work is left, such as **Loop 3 of 3 is done. The audit found more.** |
  | The loops | One row per loop, in order, with what it did and how long it ran; then the work that is waiting, as the next loop's row, marked as not started and over the limit |

  - Replaces in part: AC-STOP-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the heading and the list of loops)
- [ ] **AC-ANSWER-02 — One decision, two answers.** Every loop stop offers the two answers in the table, and one button that carries out the one chosen.

  | Answer | What Kiln does |
  |---|---|
  | Go on, with **Allow up to N more loops**, N a whole number of 1 or more, filled in as 2 | Raises that kind's limit to the loops used plus N and starts the next loop. The count is kept, so the next loop is numbered after the last |
  | **Accept what is left and deliver** | At a delivery audit stop, leaves the added phases open and goes on as AC-GOON-01 says, including any criterion the page names as not built at all. At a test audit stop, as today (AC-STOP-02 in Kiln Audit Loop Limits) |

  - Replaces in part: AC-STOP-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (Allow raises the limit instead of setting it to N and restarting the count; Accept is also offered at a delivery audit stop)
  - Replaces in part: AC-LOOP-04 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (a count no longer starts again when the person allows more loops)
- [ ] **AC-ANSWER-03 — The page says what the number buys.** Under the number, the page gives the limit it leads to and what each loop is for. At a delivery audit stop it names the phases the next loop builds and says the loops after it are spare, in case a later audit finds more.
- [ ] **AC-ANSWER-04 — The loop count is set in one place.** While Kiln is stopped at a loop stop, the run's settings on the page show that kind's limit and loops used as text, not as a field. The page offers no **Check again** at a stop that holds the run, since nothing on the page could change its result. The other limit and the choice stay editable.
  - Replaces in part: AC-STOP-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (on the page, a held run's limit is raised only by Allow, and Check again is not offered there)
- [ ] **AC-ANSWER-05 — No reply box where nothing would read it.** At a loop stop on an audit that has finished, the page offers no Reply. That is every delivery audit stop, and a test audit stop whose audit saved test work or listed items. The audit's session can still be opened in a terminal. A stop on an audit that has not finished keeps Reply, as at any Needs you stop.
  - Replaces in part: AC-STOP-02 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (Reply is no longer offered at a loop stop that holds a finished audit's report)

### A Bot Can Do the Same

Everything this PRD changes on the page can also be done from the command line.

- [ ] **AC-BOT-01 — The command line matches the page.**

  | On the page | From the command line |
  |---|---|
  | Choose **When the loops run out** (AC-CHOICE-01) | `kiln settings` |
  | Allow up to N more loops (AC-ANSWER-02) | The existing stop command taking N, which now raises the limit |
  | Accept what is left and deliver at a delivery audit stop (AC-ANSWER-02) | The existing Accept stop command, no longer refused there |
  | See which loop the run is on, the phases left open and, on a finished run, what was left (AC-ANSWER-01, AC-LEFT-02) | `kiln status` |
  | See each item for a person with its kind and what waits on it (AC-ITEM-02, AC-ITEM-03) | `kiln status` |

  - Replaces in part: AC-STOP-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the choice's name and reach, what the Allow command does to the limit, and Accept at a delivery audit stop)

## Out of Scope

- **Answering an item while Kiln keeps running.** An item that holds the run is still settled at a stop, as today.
- **A note sent with more loops, or choosing which added phases to build.** The answers are all or none. A person who wants something narrower opens the audit's session in a terminal.
- **A separate choice for each audit.** One choice covers both.
- **The default limits.** Both stay at 3.
- **Any change to the Enso Method's skills.**
