# PRD: Kiln Audit Loop Limits

**Source:** Doug's review on 2026-11-13 and 2026-11-14 of a long Kiln run whose closing audits kept sending it back for more work, and the settings and stop screens he worked through on mockups those two days.

**Changes:** [Kiln Method-Neutral Audits](../kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md), [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md), [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), [Kiln Completion Audits](../kiln-completion-audits/kiln-completion-audits-prd.md), [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), [Kiln Live Session Control](../kiln-live-session-control/kiln-live-session-control-prd.md), [Kiln Bot Control](../../prds/kiln-bot-control/kiln-bot-control-prd.md), [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md)

**Mockup:** [Open the mockup](mockups/kiln-audit-loop-limits.html).

**Assumptions:** [Kiln Audit Loop Limits assumptions](kiln-audit-loop-limits-assumptions.md)

## Summary

Kiln gets a limit on how many times its closing audits can send it back for more work before it checks with the person. Before Start, the person sets how many **delivery audit loops** and **test audit loops** Kiln makes on its own, and what happens after the last test audit loop: deliver unless something serious is left, or always stop and ask. When a limit is reached, Kiln stops at Needs you with what the loops did and what is left, and the person can allow more loops, take the audit over, or, after the test audit, accept what is left and deliver. On the same screen, a new PRD on Claude Code now starts at Medium effort.

## Business Context

After every planned phase of a PRD is closed, Kiln runs two audits. The **delivery audit** checks that every acceptance criterion is built, and adds phases to the plan for any that are not. The **test audit** checks that the tests would notice if a criterion broke, and saves test fixes for later sessions when there are too many for one. Kiln carries out whatever they find and audits again, with no limit on how many times.

On 2026-11-13 Kiln was building one of its own PRDs. The delivery audit added a phase three times, and then came back clean. The test audit then found 18 criteria with weak tests. Three sessions of test fixes, of roughly two and a half to four hours each, left 11 still to fix, most of them assertions about wording and layout. Nothing had failed, and the run would have gone on for several more sessions without anyone deciding whether the work left was worth it.

Run by hand, the Enso Method has that decision built in: a person starts each fixing session, and can say "accept the remaining Weak rows" instead. Kiln automates the handoff, so nobody is asked. The risk is highest when the PRD itself asks for too much: a criterion that was over-specified keeps producing work, and the person finds out days later.

All of the work the audits ask for comes from the PRD's own acceptance criteria. The limit is not about unexpected work. It is a point at which Kiln asks whether to keep going.

This needs no change to the Enso Method. The test audit skill already accepts Weak rows on a person's own words, said in its chat or quoted in its prompt with where they were said, and accepts a criterion with no test at all, a failing test or a high-risk criterion still weak only when the person names it. So the default setting's own wording, once the person has chosen or kept it on screen, is their acceptance, and Kiln quotes it; Kiln never decides which tests are accepted.

## Acceptance Criteria

### Set How Many Loops Kiln Makes on Its Own

The person chooses the limits before the run starts, on the same screen as Kiln's other settings. Each setting says what one loop is, because the two kinds of loop are different things.

- [ ] **AC-LOOP-01 — Three settings before Start.** Documents found has an **Audit loops** section with three settings, each with help text that says what it does using the numbers currently chosen:
  - Superseded in part by: AC-CHOICE-01 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (two settings instead of three, named Max delivery audit loops and Max test audit loops; both defaults 4).

  | Setting | Values | Default |
  |---|---|---|
  | **Delivery audit loops, at most** | A whole number, 1 or more | 3 |
  | **Test audit loops, at most** | A whole number, 1 or more | 3 |
  | **After the last test audit loop** | **Deliver, unless something serious is left**, or **Always stop and ask me** | Deliver, unless something serious is left |

  - Replaces in part: AC-START-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Documents found gains the three **Audit loops** settings)
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Documents found, the run's settings and the loop stop page gain this change's sections; the rest of each layout remains)

- [ ] **AC-LOOP-02 — A delivery audit loop is one round of building what an audit added.** A delivery audit loop starts each time Kiln starts building phases that an audit, delivery or test, added for unfinished criteria.
  - Superseded by: AC-LAST-02 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (a loop is one run of an audit, not the work on its findings).
- [ ] **AC-LOOP-03 — A test audit loop is one session of test fixes after an audit.** A test audit session is a loop when Kiln starts it to continue test work a test audit saved, even with a delivery audit run in between, or, when the person chooses **Allow _N_ more loops** at a stop whose report saved none, to fix what that report listed (AC-STOP-02). No other test audit session is a loop, even one that fixes gaps itself.
  - Superseded by: AC-LAST-02 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (a loop is one run of an audit, not the work on its findings).
- [ ] **AC-LOOP-04 — Loops are counted from when the run starts, or from when the person last allowed more.** Each count starts at zero when a run starts: at the first Start on Documents found, at **Continue with _N_ phases** (RUN-003), and at a Start from the base branch on the Folder missing page (AC-SETUP-04 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md`); and again when the person chooses **Allow _N_ more loops** of that kind (AC-STOP-02). Starting again after a pause, or from the run's existing feature branch (AC-SETUP-05 there), keeps both counts. At **Continue with _N_ phases**, the three settings carry over unchanged, and the earlier run's loops are not counted again. Resetting a run restores the default settings and both counts to zero.
  - Superseded in part by: AC-LAST-02 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (a count never starts again during a run).
- [ ] **AC-LOOP-05 — Kiln never starts a loop past its limit, and the limits can change while it runs.** Kiln starts a loop only while one of that kind is left under the current limit. The person can change all three settings during a run, and a change applies from Kiln's next decision whether to start a loop.
  - Replaces in part: AC-WATCH-07 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the three loop settings are shown with the run's settings and can change during a run)
  - Superseded in part by: AC-CHOICE-02 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (two settings; a limit cannot be set below the runs of that audit already made; a raise after a kind's last loop runs that audit again where there is work it has not checked, until the pull request session starts).
- [ ] **AC-LOOP-06 — Kiln quotes only two sentences as the person's words.** Each sentence is shown beside the choice that gives it, and whenever Kiln quotes one it says where and when the person chose it:
  - Superseded by: AC-CHOICE-01 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (neither acceptance sentence is offered).

  | Sentence | Where the person chose it |
  |---|---|
  | "I accept the remaining Weak rows after the last test audit loop." | **Deliver, unless something serious is left**, chosen or kept on Documents found, or chosen later on the run's page or with `kiln settings` |
  | "I accept the remaining Weak rows, and AC-REFUND-04, AC-APPROVAL-01 and AC-RETURNS-03.", naming each item the audit listed, if it listed any: a row by its criterion's ID, anything else in the audit's words | **Accept what is left and deliver**, pressed at a test audit stop or given with its stop command (AC-STOP-02, AC-STOP-03) |

- [ ] **AC-LOOP-07 — A run begun before this feature runs under Always stop and ask me.** A run begun under an earlier Kiln never showed the setting, so it runs under **Always stop and ask me**, with both limits at 3, until the person chooses, and counts the loops it has already made, as its saved audit history shows them (RUN-002).
  - Superseded in part by: AC-CHOICE-01 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (no run stops and asks at a limit).

### Stop When the Delivery Audit Keeps Finding Unfinished Work

Kiln never delivers work the delivery audit says is unfinished. When the loops are used up and an audit still finds something, the person reads what it found. A criterion that keeps coming back may be asking for too much.

- [ ] **AC-DELIV-01 — Kiln stops instead of building past the limit.** When an audit adds phases and no delivery audit loop is left, Kiln stops at Needs you (AC-STOP-01) instead of building them; they stay in the plan, open and not started.
  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (a report that added phases advances automatically only while delivery audit loops remain)
  - Replaces in part: AC-LOOP-02, AC-LOOP-03 and AC-TEST-03 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (phases an audit adds are built only while a delivery audit loop is left; otherwise Kiln stops at Needs you)
  - Replaces in part: AC-RUN-07 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (a loop stop whose report added phases or saved test work, when no loop of the needed kind is left, also holds continuation)
  - Replaces in part: AC-CONTINUE-05 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (completion phases audits add after a continuation are built only while a delivery audit loop is left)
  - Replaces in part: AC-WAIVE-12 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (completion phases that an audit marked complete with no usable report already appended run first only while a delivery audit loop is left; otherwise Kiln stops at Needs you)
  - Superseded by: AC-LAST-01 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md`

### Finish the Test Work at the Last Loop

The last session of test fixes, and any test audit after it, is told no more loops follow. Under the default, it carries the person's acceptance of the remaining Weak tests, and anything else left stops the run, except unfinished criteria, which go back to building, or stop if no delivery audit loop is left (AC-TEST-02).

- [ ] **AC-TEST-01 — Sessions with no loop after them are told so.** The prompt of the last test audit loop, and of every test audit session Kiln starts once no test loop is left, says no more test loops follow, gives the limit, and carries the **After the last test audit loop** choice as the table says: the person's, or, for a run begun before this feature, the one Kiln applied (AC-LOOP-07).

  | The choice | The prompt also carries |
  |---|---|
  | **Deliver, unless something serious is left** | The default's sentence (AC-LOOP-06), quoted word for word as the person's |
  | **Always stop and ask me** | Nothing from this setting |

- [ ] **AC-TEST-02 — Once no test loop is left, every test audit report is handled alike.** When a test audit session reports and no test loop is left, Kiln acts on the first row that fits, under either choice and whether or not that session was a loop.

  | The report | Kiln |
  |---|---|
  | Adds phases, whatever else it lists | As after a delivery audit that added them, including any stop it asks for (AC-LOOP-02, AC-DELIV-01) |
  | Passed: saves no test work and lists nothing a person must decide or do before delivery | Carries on as it does today after a passing test audit |
  | Lists something a person must decide or do before delivery | Stops at Needs you with those items |
  | Saves test work for another session | Stops at Needs you instead of going on |

  - Replaces in part: AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (once no test audit loop is left, a test audit report that saved test work, or passed while still listing an item a person must decide or do before delivery, stops at Needs you instead of advancing)
  - Replaces in part: AC-TEST-02 and AC-RUN-07 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (test audit continuations start only while a test audit loop is left; once none is left, saved test work stops at Needs you, and that loop stop holds continuation; a passing report that still lists items for a person stops at Needs you until Check again)
  - Superseded in part by: AC-LAST-01 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (a report that adds phases or saves test work never stops the run because no loop is left; its test work is done in as many sessions as it takes)
  - Superseded in part by: AC-ITEM-03 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (once no test loop is left, only an item that stops or holds the run under AC-ITEM-01 stops it)
- [ ] **AC-TEST-03 — The last loop is shown, never hidden.** The last test audit loop's row and detail say it was the last, and those of each session whose prompt quoted the default's sentence (AC-TEST-01) or an Accept sentence (AC-STOP-02) say which sentence it carried. The pull request session gets a line saying the same, with the latest such session's summary, to include word for word, as for settled items.

### Decide at the Stop

A **loop stop** is a stop under AC-DELIV-01 or AC-TEST-02, because no loop of that kind is left. It is an ordinary Needs you stop: nothing failed. The page gives the person what they need to judge whether the work left matters, and the ways to go on.

- [ ] **AC-STOP-01 — The page says which loops ran and what is left.** A loop stop's page shows the following, with no judgment of Kiln's own about which items matter:
  - Superseded by: AC-STOP-04 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (there is no loop stop).

  | Part of the page | What it shows |
  |---|---|
  | Heading | **Delivery audit loops used: 3 of 3** or **Test audit loops used: 3 of 3**, with the loops counted and the current limit |
  | The loops | Each loop in the current count, and any audit session since, with what it did and how long it ran |
  | What the audit found | The latest audit's own summary, and each item it listed for a person, as the audit wrote them |
  | At a test audit stop | The person's **After the last test audit loop** choice |

- [ ] **AC-STOP-02 — The person chooses how the run goes on.** At a loop stop, a report that adds phases or saves test work holds the run there until a loop of that kind is left or the person accepts, even when the audit is marked complete (RUN-001). Each control does what the table says:
  - Superseded by: AC-STOP-04 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (there is no loop stop; Allow and Accept are removed).

  | Control | What Kiln does | Counted as a loop |
  |---|---|---|
  | **Allow _N_ more loops**, N a whole number of 1 or more, filled in as 2 | Sets that kind's limit to N, restarts its count (AC-LOOP-04), and starts the next loop of that kind (AC-LOOP-02, AC-LOOP-03) | Yes |
  | **Accept what is left and deliver**, at a test audit stop only | Starts one test audit session that fixes nothing; its report is handled as AC-TEST-02 says | No |
  | Take over the audit's session | As at any Needs you stop | No |
  | Reply, with the person's own words | As at any Needs you stop. The page doesn't offer it at a stop for listed items, because that audit has finished and nothing would read the reply | No |
  | Check again, or Mark the audit complete | As at any Needs you stop, except that a held run stays held. Mark the audit complete is offered only where a check fails, as at any Needs you stop, so not at a stop that holds an accepted report | No |
  | Raise a limit in the settings (AC-LOOP-05) | Starts nothing by itself; the loop the held report asks for starts at the next Check again or `kiln run` | Yes, once it starts |

  Accept's prompt quotes its sentence, naming every listed item, as the person's (AC-LOOP-06), then each item as the audit wrote it, and asks the session to record what those words accept and to list by name every row or item they do not; Kiln does not sort the items. Kiln also quotes each Accept sentence the person gave to any later test audit it starts before delivering.
  - Replaces in part: AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` and AC-WAIVE-12 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (when no loop of that kind is left, a passing Check again, or an audit marked complete, holds the run at a loop stop instead of starting the loop its report asks for)
  - Replaces in part: AC-STOP-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Allow _N_ more loops and Accept what is left and deliver also start a session after a stop)
  - Replaces in part: AC-VIEW-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Allow _N_ more loops and Accept what is left and deliver join the browser view's controls)
  - Replaces in part: AC-BACK-03 and AC-BACK-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (at a takeover audit's loop stop that holds, because its report added phases or saved test work, a passing Check again does not advance, and the next work waits for a loop or an Accept)
- [ ] **AC-STOP-03 — A bot can do everything the page does.** Everything this PRD adds to the page for a run that has started can also be done from the command line:
  - Superseded in part by: AC-STOP-04 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (the loop stop page and its two stop commands are removed, and `kiln status` no longer shows the removed setting; `kiln settings` sets the two limits).

  | On the page | From the command line |
  |---|---|
  | Change any of the three loop settings during a run (AC-LOOP-05) | `kiln settings`, beside `--keep-awake` |
  | See the loop counts, the limits and the setting chosen (AC-SHOW-01) | `kiln status` |
  | See a loop stop's page (AC-STOP-01) | `kiln status`, which also lists the controls available at the stop |
  | Allow _N_ more loops (AC-STOP-02) | A stop command taking N, beside the existing stop commands |
  | Accept what is left and deliver (AC-STOP-02) | A stop command beside them |

  Settings chosen before Start stay in the browser, as every other setting for a run not yet started does.
  - Replaces in part: AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (two more commands join the controls for a run already started; the runtime-preferences control also sets the three loop settings)

### Show Where the Run Stands

A person looking at a run should see how close it is to a limit without opening anything.

- [ ] **AC-SHOW-01 — Each loop's row says which loop it is.** In the run's list of activity, a phase or test audit session that is part of a loop shows its number and the limit, such as **loop 2 of 3**, and the last one allowed shows **last loop**.
  - Replaces in part: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (completion-phase and test audit rows that are part of a loop also show its number and the limit, or **last loop**)

### Start Claude Code at Medium Effort

A change to the same settings panel, made with this PRD because it touches the same screen: Medium is enough for most Enso Method sessions on Claude Code, and the person can still choose more.

- [ ] **AC-EFFORT-01 — A new PRD on Claude Code starts at Medium effort.** On Documents found, a PRD whose settings have not been saved yet starts with Claude Code at **Medium** effort instead of High. A PRD on Codex still starts at High (AC-MODEL-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md`), and a PRD whose settings were already saved keeps the effort it has.
  - Replaces in part: AC-START-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the starting effort for Claude Code only)
  - Replaces in part: validated assumption UI-004 in `docs/prds/kiln-v1/assumptions.md` (Claude Code's starting effort is Medium)

## Out of Scope

- **Answering an item while Kiln keeps running.** An item an audit lists for the person's review is still settled at a stop, as today.
- **An "always deliver" choice** that would accept a criterion with no test, a failing test or a weak high-risk criterion without the person naming it. The method does not allow that, and Kiln does not work around it; once an audit has listed them, the person can accept them by name at the stop (AC-STOP-02).
- **A limit on time or cost.** The limits count loops only.
- **Starting the test audit while delivery audit work is outstanding.** The test audit cannot judge criteria that are not built, and later building would invalidate its results.
- **Any change to the Enso Method's skills.**
