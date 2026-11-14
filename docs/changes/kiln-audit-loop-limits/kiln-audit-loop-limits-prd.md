# PRD: Kiln Audit Loop Limits

**Source:** Doug's review on 2026-11-13 and 2026-11-14 of a long Kiln run whose closing audits kept sending it back for more work, and the settings and stop screens he worked through on mockups those two days.

**Changes:** [Kiln Method-Neutral Audits](../kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md)

**Mockup:** [Open the mockup](mockups/kiln-audit-loop-limits.html).

## Summary

Kiln gets a limit on how many times its closing audits can send it back for more work before it checks with the person. Before Start, the person sets how many **delivery audit loops** and **test audit loops** Kiln makes on its own, and what happens after the last test audit loop: deliver unless something serious is left, or always stop and ask. When a limit is reached, Kiln stops at Needs you with what the loops did and what is left, and the person can allow more loops, take the audit over, or accept what is left and deliver.

## Business Context

After every planned phase of a PRD is closed, Kiln runs two audits. The **delivery audit** checks that every acceptance criterion is built, and adds phases to the plan for any that are not. The **test audit** checks that the tests would notice if a criterion broke, and saves test fixes for later sessions when there are too many for one. Kiln carries out whatever they find and audits again, with no limit on how many times.

On 2026-11-13 Kiln was building one of its own PRDs. The delivery audit added a phase three times, and then came back clean. The test audit then found 18 criteria with weak tests. Three sessions of test fixes, of roughly two and a half to four hours each, left 11 still to fix, most of them assertions about wording and layout. Nothing had failed, and the run would have gone on for several more sessions without anyone deciding whether the work left was worth it.

Run by hand, the Enso Method has that decision built in: a person starts each fixing session, and can say "accept the remaining Weak rows" instead. Kiln automates the handoff, so nobody is asked. The risk is highest when the PRD itself asks for too much: a criterion that was over-specified keeps producing work, and the person finds out days later.

All of the work the audits ask for comes from the PRD's own acceptance criteria. The limit is not about unexpected work. It is a point at which Kiln asks whether to keep going.

This needs no change to the Enso Method. The test audit skill already lets a person accept weak tests, and takes their words quoted in its prompt.

## Acceptance Criteria

### Set How Many Loops Kiln Makes on Its Own

The person chooses the limits before the run starts, on the same screen as Kiln's other settings. Each setting says what one loop is, because the two kinds of loop are different things.

- [ ] **AC-LOOP-01 — Three settings before Start.** Documents found has an **Audit loops** section with three settings, each with help text that says what it does using the numbers currently chosen:

  | Setting | Values | Default |
  |---|---|---|
  | **Delivery audit loops, at most** | A whole number, 1 or more | 3 |
  | **Test audit loops, at most** | A whole number, 1 or more | 3 |
  | **After the last test audit loop** | **Deliver, unless something serious is left**, or **Always stop and ask me** | Deliver, unless something serious is left |

- [ ] **AC-LOOP-02 — A delivery audit loop is one round of finding and building.** One delivery audit loop is an audit that adds phases to the plan for criteria that are not finished, followed by Kiln building those phases. Phases a test audit adds for a criterion that was never built count the same way. An audit that adds no phase is not a loop, so the delivery audit Kiln repeats after a test fix changed code counts for nothing.
- [ ] **AC-LOOP-03 — A test audit loop is one session of saved test fixes.** A test audit session counts as a loop when the test audit before it saved test work for another session. The first test audit is not a loop, even when it fixes a few gaps itself.
- [ ] **AC-LOOP-04 — Loops are counted from Start, or from when the person last allowed more.** Each count begins at zero when the run starts and again each time the person allows more loops at a stop (AC-STOP-02). A run that is reset begins again with the default settings and both counts at zero.
- [ ] **AC-LOOP-05 — The settings can be changed while Kiln runs.** The person can change all three during a run, as they can model and effort. A change applies from Kiln's next decision about whether to start a loop.
- [ ] **AC-LOOP-06 — A run started before this feature gets the defaults.** A run that began under an earlier Kiln continues with the three defaults, counting only loops made after the upgrade.

### Stop When the Delivery Audit Keeps Finding Unfinished Work

Kiln never delivers work the delivery audit says is unfinished. When the loops are used up and an audit still finds something, the person reads what it found. A criterion that keeps coming back may be asking for too much.

- [ ] **AC-DELIV-01 — Kiln stops when an audit adds phases after the last loop.** With a limit of 3, Kiln builds what the audits add three times. When an audit adds phases a fourth time, Kiln stops at Needs you (AC-STOP-01) instead of building them. The added phases stay in the plan, open and not started.
  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (a report that added phases advances automatically only while delivery audit loops remain)

### Finish the Test Work at the Last Loop

The last session of test fixes is told that it is the last, and what the person chose to happen afterward. Under the default, the tests that are still weak after it are accepted in the person's name, except the kinds the method will only accept when a person names them.

- [ ] **AC-TEST-01 — The last session is told it is the last.** When the test audit session about to start is the last loop allowed, its prompt says so, gives the number of loops, and states the person's choice for **After the last test audit loop** as the person's own decision, with when they chose it.
- [ ] **AC-TEST-02 — Under the default, the prompt carries the person's acceptance of what is left.** When the choice is **Deliver, unless something serious is left**, the last session's prompt says that the person accepts the tests still below the method's target once this session's fixes are done, and that this acceptance does not cover anything the installed test audit skill accepts only when the person names it. Today those are a criterion with no test at all, a failing test, and a high-risk criterion whose tests are still weak. Kiln does not decide which tests are accepted: the session applies the skill's own rules and records each acceptance where the skill says to. When the choice is **Always stop and ask me**, the prompt carries no acceptance.
- [ ] **AC-TEST-03 — What Kiln does after the last session depends on its report.** Under either choice:

  | The last session's report | Kiln |
  |---|---|
  | Nothing left to test | Carries on as it does today after a passing test audit |
  | Lists something a person must decide | Stops at Needs you with those items (AC-STOP-01) |
  | Saved more test work for another session | Stops at Needs you instead of starting that session (AC-STOP-01) |

  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (a report that saved test work advances automatically only while test audit loops remain)
- [ ] **AC-TEST-04 — Tests accepted under the setting are shown, never hidden.** When a last session ran under **Deliver, unless something serious is left**, its row and its detail say that it was the last loop and that remaining tests were accepted under the person's setting, and the final pull request's description says the same and includes that audit's summary.

### Decide at the Stop

A stop for used-up loops is an ordinary Needs you stop: nothing failed. The page gives the person what they need to judge whether the work left matters, and the ways to go on.

- [ ] **AC-STOP-01 — The page says which loops ran and what is left.** The Needs you page is headed **Delivery audit loops used: 3 of 3** or **Test audit loops used: 3 of 3**, with the real numbers. It lists each loop with what it did (the phases built, or the test session) and how long it ran, and shows the latest audit's own summary and each item it listed for a person, as the audit wrote them. Kiln adds no judgment of its own about which items matter.
- [ ] **AC-STOP-02 — The person can allow more loops.** The page has **Allow _N_ more loops**, where N is a whole number the person fills in, 1 or more, starting at 2. Choosing it restarts that count at zero with N as the limit for the rest of the run, and Kiln carries on: at a delivery audit stop it builds the phases the audit added, and at a test audit stop it starts the next test audit session.
- [ ] **AC-STOP-03 — At a test audit stop, the person can accept what the audit listed and deliver.** The page has a button that accepts every item the audit listed. Kiln then starts one test audit session, which is not counted as a loop, whose prompt carries the person's acceptance of each listed item as the audit wrote it, with when they gave it. If that session reports nothing left to test, Kiln carries on to delivery. Otherwise it stops at Needs you. A delivery audit stop has no such button.
- [ ] **AC-STOP-04 — Everything a Needs you stop already offers still works.** Taking over the audit's session, replying to it, checking again and marking the audit complete are available at these stops as at any other.
- [ ] **AC-STOP-05 — A bot can answer the stop from the command line.** `kiln status` reports a loop stop with the same facts as the page and lists the controls available, and allowing more loops and accepting what the audit listed can each be done with a command.

### Show Where the Run Stands

A person looking at a run should see how close it is to a limit without opening anything.

- [ ] **AC-SHOW-01 — Each loop's row says which loop it is.** In the run's list of activity, a phase or test audit session that is part of a loop shows its number and the limit, such as **loop 2 of 3**, and the last one allowed shows **last loop**.

## Out of Scope

- **Answering an item while Kiln keeps running.** An item an audit lists for the person's review is still settled at a stop, as today.
- **An "always deliver" choice** that would accept a criterion with no test, a failing test or a weak high-risk criterion without the person naming it. The method does not allow that, and Kiln does not work around it; AC-STOP-03 lets the person accept those by name at the stop.
- **A limit on time or cost.** The limits count loops only.
- **Starting the test audit while delivery audit work is outstanding.** The test audit cannot judge criteria that are not built, and later building would invalidate its results.
- **Any change to the Enso Method's skills.**
