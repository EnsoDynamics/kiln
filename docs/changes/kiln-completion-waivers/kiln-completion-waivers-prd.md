# PRD: Kiln completion waivers

**Follow-on to:** [Kiln development deployments](../kiln-development-deployments/kiln-development-deployments-prd.md).
**Source:** Doug's request, 2026-11-01, raised while Kiln refused a correct phase of another project.
**Assumptions:** [kiln-completion-waivers-assumptions.md](kiln-completion-waivers-assumptions.md)
**Business validation, 2026-11-01:** Doug directed that any failing step can be waived at any activity, that a waiver also counts at final delivery, and that bots must be able to waive through the command line (WAIVE-001 to 003). A refinement run then reopened WAIVE-001 to exclude some checks; that reopening was withdrawn on 2026-11-02, and Doug's ruling stands with no exceptions: "To be clear, we should be able to waive anything." On 2026-11-01 he also directed a plain button with no reason asked, since a person who has confirmed the work is done should not have to explain Kiln's cryptic refusals, and asked for resuming and checking to sit in separate places, with Mark complete offered only after a recheck still fails. On 2026-11-02 he ruled that an audit marked complete counts as passed: Kiln follows its report when it left a valid one, and otherwise moves on rather than running it again, with a warning (AC-WAIVE-12); he confirmed that ruling after seeing the mockup's no-report state. The same day he confirmed WAIVE-004, and ruled that waiving an unreadable plan or audit state carries forward like any other waiver: Kiln follows its normal order with a warning rather than stopping again (AC-WAIVE-04). He approved the mockup on 2026-11-01; it governs the arrangement and wording of the Needs you page and the after-waiver displays.

## Summary

When Kiln refuses to continue but the work is done, the person, or a bot acting for them, can mark it complete with one click or one command, with no explanation required, after asking Kiln to check again. Kiln saves that as a waiver and advances. The activity then shows as complete, with the waived checks marked as waived, never as passed. This works at any stopped activity: an implementation phase, the delivery audit, the test audit or final delivery, from the browser or the `kiln` command line.

## Business Context

Kiln advances only when its completion checks pass. Those checks are mechanical and occasionally wrong: on 2026-11-01 a phase of another project was correctly deployed and running, but Kiln's evidence matcher could not accept it, and the phase could not advance. The only action, **Verify Phase 3 & advance**, rechecks and advances only if everything passes, so the person had no way to continue short of editing Kiln's saved state.

A mechanical check will always meet a case it gets wrong, at any step. The person must never be stuck behind one, and must be able to push the run along from a bot (`kiln-bot-control`) as easily as from the browser. A plain pass still always means the checks passed, and a waiver is always visible as a waiver.

## Terms

- **Waiver:** a saved record that an activity was accepted despite named failing items.
- **Stopped activity:** an implementation phase, delivery audit, test audit or final delivery that Kiln has stopped at Needs you because a completion check failed.
- **Check:** one named completion check, shown as one row, such as **Pushed** or **Required development delivery verified**. Kiln runs them all together in a check run, and counts such as "3 of 4 passed" count checks.
- **Failing item:** one thing a check found wrong, shown as its own line under the check: a phase document's missing Closed line, one repository's uncommitted or unpushed work, one development-delivery requirement or a checkpoint's unresolved prerequisite, or any other fact the check reports. A waiver is recorded item by item.
- **Hand-back page:** the Needs you page Kiln shows when a phase, or an audit under live takeover, stops with a saved conversation to hand back. Every other stopped activity, including final delivery and audits without live takeover, uses the **standard Needs you page**, which lists its checks in a side panel under "Kiln finishes when" or "Kiln continues when", with **Check again** below them.

## Acceptance Criteria

### Resuming and checking are separate choices

Handing work back to Claude and asking Kiln to confirm the work is done are different moments, so they sit in different places on the Needs you page. The hand-back page is rearranged to match; the standard Needs you page already keeps them apart and keeps its layout.

- [ ] **AC-NEXT-01 — Resume sits with the terminal choice.** On the hand-back page, **Resume {activity} in Kiln** becomes **Have Kiln resume {activity}** and moves into the terminal card, after its instructions, introduced by "Got it back on track? Exit Claude Code, then:" (the agent's name as recorded), offered as before (AC-RETURN-01/02). Where it is not offered, the card's existing resume-unavailable note takes its place, and nothing else on the page points to resuming. The card's title becomes **Talk it through in your terminal**, or stays **Start a fresh session in your terminal** when the saved conversation can't be opened. The **Back from your terminal?** section and its two subheadings go away; the rest of the page stays as AC-PAGE-02 has it.
- [ ] **AC-NEXT-02 — Checking has its own section.** On the hand-back page, below the two cards, **Is {activity} already done?** shows the completion checks, each with its facts, and when they were checked ("when Kiln stopped" until the person checks again), with **Check {activity} again**. That button replaces **Verify {activity} & advance** with the same behavior (AC-VERIFY-01 to 04). When a recheck still fails, the section says how many checks fail and, where AC-NEXT-01 offers resuming, points to Have Kiln resume for unfinished work.
- [ ] **AC-WAIVE-01 — Checking never waives anything.** Check again on either page, resuming, and `kiln resume`, `kiln verify-and-advance` and `kiln check-again` on the command line never create a waiver. Kiln never creates a waiver on its own, during recovery, or when a later check passes.

### Mark complete when Kiln's check is wrong

When the person has checked again and Kiln still refuses, they can mark the activity complete, at any step, whatever check failed.

- [ ] **AC-WAIVE-02 — Offered when a recheck still fails.** At any stopped activity, once a check run after the stop has failed, a **Mark {activity} complete** button appears below the checks under the heading "{Activity} is done, and Kiln's check is wrong?": in the **Is {activity} already done?** section of the hand-back page, or below **Check again** in the side panel of the standard Needs you page. It does not appear before a recheck, while a check is running, after a check that could not finish, or when every check passed. It is offered whatever check failed, recovery and safety checks and Current completion audits included. AC-WAIVE-04 gives the one other heading and label, for a **Phase plan reads** or **Completion audit readiness** stop on an activity that has not started.
- [ ] **AC-WAIVE-11 — Every failing item is listed.** Each check lists every item it finds failing, one per line, instead of stopping at the first. This changes what a check reports, never what it accepts.
- [ ] **AC-WAIVE-03 — One click marks it complete, with no explanation asked.** The button waives every failing item in the latest check run, with no partial selection, confirmation panel or reason field. The sentence above it says what Kiln waives, what it does next and how the activity will show (AC-WAIVE-10). When a failing item is a repository's uncommitted or unpushed work, it adds that this work will be missing from the final pull request and, where resuming is offered, that resuming the activity can push it instead.
- [ ] **AC-WAIVE-04 — Kiln checks again before saving, and waives only what it showed.** Submitting reruns every completion check and compares the result with the latest check run since the stop, the one Mark complete was offered on:

  | Result of the rerun | What happens |
  |---|---|
  | The same failing items, with the same failure text | Kiln saves the waiver and advances under the existing next-activity and requested-pause rules |
  | Everything passes | Kiln advances as Check again would, and saves no waiver |
  | Any other change: an item newly fails, newly passes or changes its failure text | No waiver is saved and nothing advances; the new results become the latest check run, and the caller sees which item changed |
  | The check run cannot finish | Nothing is saved or advanced, and the error shows (as AC-VERIFY-03) |

  Advancing marks the waived activity complete, whether or not it ran. A **Phase plan reads** or **Completion audit readiness** stop can also sit on an activity that has not started, or on one already complete; what the waiver does to the stopped activity then depends on its state:

  | The stopped activity | Waiving it |
  |---|---|
  | Has not started, such as the next phase or final delivery | Completes nothing. The heading reads "Kiln can't work out the next step, and you want it to carry on?" and the button **Continue in normal order** |
  | Ran, and is not complete | Marks it complete, as for any other check |
  | Is already complete, such as the last audit | Leaves it as it was, its currentness included |

  Like any waiver, these carry forward (AC-WAIVE-09): while a waived problem stands, Kiln does not stop on it again, under either check, but follows its normal order. A problem Kiln has not stopped on before still stops it once.

  | Waived problem | Kiln goes on to |
  |---|---|
  | Phase plan reads | The next uncompleted phase in plan order whose own document reads, ignoring a broken dependency, taking the order from the plan as far as it reads, otherwise the plan Kiln last read. A phase whose start fails on the waived problem, such as a repository Kiln cannot add, is skipped, and counts as closed wherever an audit checks for open phases (AC-NEUTRAL-04). When no phase is left, the completion audits |
  | Completion audit readiness | The step Kiln would normally take, judged from its saved audit record; where that record cannot tell, the next of delivery audit, test audit, final delivery. An audit that cannot start on the waived problem counts as marked complete with no report (AC-WAIVE-12) |

  Each activity Kiln reaches or skips this way carries a warning marker, "plan problem waived: Kiln followed its normal order" or "audit problem waived: Kiln followed its normal order", beside its status wherever AC-WAIVE-10 shows that status, and as a field on the activity in the `kiln status` JSON. A skipped phase is not built; the delivery audit judges the requirements, not the plan, so it can still find what that phase was meant to build.

- [ ] **AC-WAIVE-05 — Bots can mark complete through the command line.** `kiln waive-and-advance <PRD-path>` is the command-line form of this page's two steps. Both forms follow bot control's contracts for changing commands (AC-ACT-01, AC-ACT-04, AC-ACT-05, AC-CLI-01/02).

  | Form | What it does |
  |---|---|
  | Without `--confirm` | The stop's existing recheck (`kiln verify-and-advance` at a hand-back stop, `kiln check-again` otherwise), taking that recheck's own inputs and advancing when every check passes. When a check still fails, its outcome also lists what Mark complete would waive and do next (AC-WAIVE-03). |
  | With `--confirm` | Mark complete (AC-WAIVE-04), accepted only where the button would be offered (AC-WAIVE-02) |

  No reason is required. An optional `--by <name>` records who asked, for example a bot's name.
- [ ] **AC-WAIVE-06 — Competing actions wait.** While a check or a waiver is in progress, Check again, resuming, reply and a second waiver are unavailable from the browser and the command line, as AC-VERIFY-04 requires for the existing actions. A disconnected page cannot submit one.
- **AC-WAIVE-07 — Retired 2026-11-01.** Waivers are offered only at Needs you, when no Kiln agent is working (AC-WAIVE-02).

### A waiver is recorded and never reads as verified

Anyone looking later, in the browser, the terminal or a bot, must be able to tell the activity was completed on a waiver and which checks it skipped. These criteria also say how long a waiver keeps counting.

- [ ] **AC-WAIVE-08 — The waiver is saved with everything needed to audit it.** Kiln saves, with the execution, before advancing: when, where it came from (browser or command line, with the local account name and any `--by` name), each waived item with its check, its failure text and what it was checked against (AC-WAIVE-09), and an identity for the check run it rests on. The record survives restarts and is never edited or deleted by Kiln.
- [ ] **AC-WAIVE-09 — A waiver covers only the items it named, while they are unchanged.** A waived item counts as met wherever Kiln asks for it again (audits: AC-WAIVE-12): choosing the next activity, a later activity's checks, and the PRD's final completion checks. Across activities, an item matches by its table row and that row's Matched by, so a phase's unpushed work in a repository is the same item as final delivery's. Once what the item was checked against changes, it needs its own passing check or its own waiver; the PRD is never asked to waive the same unchanged item twice. A waiver ending never reopens a completed activity.

  | Waived item | Matched by | Checked against | The waiver ends when |
  |---|---|---|---|
  | A phase document's missing Closed line | The phase | That phase, as a leaf of the plan | The phase is split or leaves the plan |
  | A repository's uncommitted or unpushed work | The repository | That repository's feature head and uncommitted changes | Either changes |
  | A development-delivery requirement, or a checkpoint's unresolved prerequisite | The checkpoint and requirement | Its checkpoint and requirement, at the merge revision checked | The checkpoint is replaced or its merge revision changes |
  | A Phase plan reads or Completion audit readiness problem | Its failure text, under either check | The phase plan, or the saved completion audit state | Its failure text changes |
  | Any other item, such as a pull request's at final delivery | Its check and the item | Every repository's feature head | Any feature head changes |

  A checkpoint resolved only by waiving its failing requirements also counts as resolved for the checkpoints that depend on it (WAIVE-004). A waiver is never evidence of a deployment or verification.
- [ ] **AC-WAIVE-10 — A completed activity says which checks were waived.** A check met only through a waiver, of its own items (this activity's or carried from an earlier one) or of an audit it relies on (AC-WAIVE-12), shows **Waived**, never **Passed** or **Verified**. Each covered item carries its own **Waived** tag with the activity, time and source of its waiver, also within a check that still fails. An activity that completes with a waived check shows as **Complete**, with "N check(s) waived" beside it, in the progress row and detail, the Complete screen, the terminal summary, `kiln status` and its JSON, and check counts report waived checks separately (for example `3 passed · 1 waived`). A check that later passes on its own shows as passed, and the waiver stays in the history beside it.
- [ ] **AC-WAIVE-12 — A waived audit counts as its report allows.** Wherever Kiln chooses what comes next, Current completion audits included, an audit marked complete counts as the table says from the moment of its waiver, and its currentness is measured from then as an accepted audit's is (AC-NEUTRAL-06, not AC-WAIVE-09), never sending the person back to the same audit.

  | Audit report | The audit counts as |
  |---|---|
  | Accepted | What its outcome says, a waived **Audit evidence is current** counted as current |
  | Valid, not accepted: it needs a person (**Audit work resolved**) or a repository or delivery check failed | Accepted, with needing a person counted as passed |
  | None usable: marked complete with no report, or with one Kiln could not read or refused, such as a test continuation that made no progress or a report its plan disagrees with | Passed, and Kiln moves on: delivery audit to test audit, test audit to final delivery as having changed only tests. Completion phases it already appended still run first, and the work they add is audited afresh, as after any audit that appended phases |

  With no usable report, a warning marker, "no audit report: Kiln couldn't tell what this audit found", sits beside the audit's waived label wherever AC-WAIVE-10 shows it, and in the `kiln status` JSON as a field on the audit; the sentence above Mark complete (AC-WAIVE-03) says so first.

Replaces in part:

- In `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md`:
  - AC-DEV-03 and AC-DELIVER-04 (failed required development evidence, and the final requirements that every repository qualifies and all development verification is satisfied, give way to a waiver under AC-WAIVE-04 and AC-WAIVE-09).
  - AC-DELIVER-03 (a prerequisite checkpoint resolved only by waiver counts as resolved for its dependents, WAIVE-004 under AC-WAIVE-09).
- In `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md`:
  - AC-PAGE-02, AC-TERMINAL-01, AC-VERIFY-01 and AC-RETURN-01 (the hand-back page's arrangement and action names under AC-NEXT-01/02, and Mark complete after a failed recheck; every action's behavior remains).
  - AC-VERIFY-02 (the rows list every failing item and tag waived ones, and counts report waived checks separately, AC-WAIVE-10/11).
- In `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md`:
  - AC-BACK-01 (the hand-back pair is split into Have Kiln resume and Check again under AC-NEXT-01/02).
  - AC-BACK-03 (a takeover audit's Verify becomes Check again under AC-NEXT-02, and a failed recheck offers Mark complete, even with no usable report, AC-WAIVE-02/12).
  - AC-BACK-04 and AC-MSG-05 (Mark complete is also an advance that releases the takeover hold and an acknowledged uncertain-message hold; the acknowledgement still comes first, AC-WAIVE-02/04).
- AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (its routine controls also include `kiln waive-and-advance`).
- In `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md`:
  - AC-AUDIT-01 and AC-TEST-01 (an audit that cannot start on a waived audit-readiness problem, or whose launch check was waived before it ran, counts as marked complete with no report, so it may never run, AC-WAIVE-02/04/12).
  - AC-AUDIT-03 (a stopped audit can advance on a waiver without an accepted report, AC-WAIVE-12).
  - AC-AUDIT-04 (Current completion audits can be waived at final delivery, AC-WAIVE-02/12).
  - AC-LOOP-03 (a delivery audit marked complete is not repeated for the work it covered, even with no usable report, AC-WAIVE-12).
  - AC-TEST-03 (a test audit marked complete counts as complete even when Kiln cannot tell whether it left a delivery gap, AC-WAIVE-12).
  - AC-TEST-04 (final delivery can follow a test audit marked complete with blockers unresolved, AC-WAIVE-12).
  - AC-RUN-03 (final delivery can complete on a waived **Audit evidence is current**).
- In `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md`:
  - AC-NEUTRAL-03 (an audit stopped at Needs you, with or without a readable report, can be marked complete and then counts as AC-WAIVE-12 says).
  - AC-NEUTRAL-04 (a phase skipped under a waived plan problem counts as closed, AC-WAIVE-04; an audit whose report the plan disagrees with can be marked complete, and then counts as having no usable report, AC-WAIVE-12).
  - AC-NEUTRAL-05 (a test continuation refused for making no progress can be marked complete, and then counts as passed instead of starting another session, AC-WAIVE-12).
  - AC-NEUTRAL-06 (a waived audit stays current as an accepted one, and a no-report test audit counts as having changed only tests, AC-WAIVE-12).
  - AC-NEUTRAL-07 (an audit whose repository checks failed counts as accepted once waived, AC-WAIVE-12).
  - AC-NEUTRAL-08 (a missing audit skill can be waived, and Kiln then follows its normal order, AC-WAIVE-04).
- In `docs/prds/kiln-v1/kiln-v1-prd.md`:
  - AC-RUN-01 (a leaf whose missing Closed line was waived counts as done when choosing the next phase, and under a waived plan problem Kiln skips phases, AC-WAIVE-04/09).
  - AC-RUN-07 (a waiver can also complete a phase, not only the done check, AC-WAIVE-04).
  - AC-STOP-07 (a broken-plan stop can be waived, and Kiln then follows its normal order, AC-WAIVE-04).
  - AC-STOP-08 (Mark complete and `kiln waive-and-advance --confirm` are another way for work to start after a stop, AC-WAIVE-04/05).
  - AC-DONE-01 (Closed, Committed and Pushed can be waived).
  - AC-WATCH-01 (a phase completed on a waiver, without passing the done check, is listed as complete with "N check(s) waived" beside it, AC-WAIVE-10).
  - AC-VIEW-02 (Mark complete joins the browser view's controls, AC-WAIVE-02).
  - AC-LOOK-01 (Needs you, the progress rows and Complete follow this change's mockup where waivers alter them; unaffected layout remains).
- In `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md`:
  - AC-ADD-04 (a repository Kiln cannot add can be waived, and the phase needing it is skipped, AC-WAIVE-04).
  - AC-PRS-05 (a repository's pull-request check can be waived).
  - AC-SHOW-01 (Mark complete on the standard Needs you page and the waived markers follow this change's mockup; unaffected layout remains).
- AC-CHECK-02 in `docs/changes/kiln-completion-checks/kiln-completion-checks-prd.md` (any of the evidence it keeps in force can be waived).
- In `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md`:
  - AC-CONTINUE-01 (a phase completed on a waived Closed line, or skipped under a waived plan problem, counts as completed and is not rerun, AC-WAIVE-04/09).
  - AC-CONTINUE-07 (a phase stopped because its preparation cannot complete can be marked complete without its dependent implementation, AC-WAIVE-02/04).
  - AC-HANDBACK-04 (a phase completed outside Kiln can also be accepted on a waiver, not only on existing completion evidence, AC-WAIVE-02/09).
- In `docs/prds/kiln-codex-support/kiln-codex-support-prd.md`:
  - AC-AGENT-03 (an activity stopped before launch by agent selection and readiness can be marked complete without starting a session; later launches still require readiness, AC-WAIVE-02/04/09).
  - AC-RECOVER-01 (a known cleanup failure can be waived like any failing check).
- In `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md`:
  - AC-RUN-02 and AC-CODEX-03 (a launch held for billing approval, or for a failed Codex sign-in or readiness check, on an activity that has not run, can be marked complete without launching it; the waiver never makes a later launch eligible, AC-WAIVE-02/04/09).

## Mockup

[Open the interactive mockup](mockups/kiln-completion-waivers.html). Its sample phase, checkpoint ids and revisions are modelled on the 2026-11-01 case and are illustrative; the preview controls are not Kiln controls.

| State to inspect | Criteria illustrated |
|---|---|
| Kiln stopped: resume, or check again | AC-NEXT-01/02, AC-WAIVE-01 |
| Checked again, still failing: Mark complete offered | AC-WAIVE-02/03 |
| Mark complete clicked, but results changed | AC-WAIVE-04/06/11 |
| Several kinds of failure, including Closed and Pushed | AC-WAIVE-02/03 |
| A bot doing it through the command line | AC-WAIVE-05 |
| After marking complete: phase detail, delivery panel and `kiln status` | AC-WAIVE-08/09/10 |
| Final delivery on the standard Needs you page, which audits without live takeover also use | AC-WAIVE-02/03/09/10/11 |
| Final delivery while an audit is also required | AC-WAIVE-02/03 |
| After final delivery is marked complete: Complete screen and terminal summary | AC-WAIVE-10 |
| A delivery audit with no usable report: Mark complete, then the test audit runs | AC-WAIVE-02/03/10/12 |

## Out of Scope

- Waiving ahead of a check, in bulk across activities, or for anything other than a stopped activity's failing items.
- Committing, pushing or merging work on the caller's behalf to make a waived check true.
- Changing what Kiln's checks accept; that is separate work in each check's own design.
