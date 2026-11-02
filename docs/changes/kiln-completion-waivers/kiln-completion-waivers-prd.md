# PRD: Kiln completion waivers

**Follow-on to:** [Kiln development deployments](../kiln-development-deployments/kiln-development-deployments-prd.md).
**Source:** Doug's request, 2026-11-01, raised while Kiln refused a correct phase of another project.
**Assumptions:** [kiln-completion-waivers-assumptions.md](kiln-completion-waivers-assumptions.md)
**Business validation, 2026-11-01:** Doug directed that any failing step can be waived at any activity, that a waiver also counts at final delivery, and that bots must be able to waive through the command line (WAIVE-001 to 003). A refinement run then reopened WAIVE-001 to exclude some checks; that reopening was withdrawn on 2026-11-02, and Doug's ruling stands with no exceptions: "To be clear, we should be able to waive anything." On 2026-11-01 he also directed a plain button with no reason asked, since a person who has confirmed the work is done should not have to explain Kiln's cryptic refusals, and asked for resuming and checking to sit in separate places, with Mark complete offered only after a recheck still fails. On 2026-11-02 he ruled that an audit marked complete with no usable report moves on rather than running again, with a warning (AC-WAIVE-12). He approved the mockup on 2026-11-01; it governs the arrangement and wording of the Needs you page and the after-waiver displays.

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

- [ ] **AC-WAIVE-02 — Offered when a recheck still fails.** At any stopped activity, once a check run after the stop has failed, a **Mark {activity} complete** button appears below the checks under the heading "{Activity} is done, and Kiln's check is wrong?": in the **Is {activity} already done?** section of the hand-back page, or below **Check again** in the side panel of the standard Needs you page. It does not appear before a recheck, while a check is running, after a check that could not finish, or when every check passed. It is offered whatever check failed, recovery and safety checks and Current completion audits included.
- [ ] **AC-WAIVE-11 — Every failing item is listed.** Each check lists every item it finds failing, one per line, instead of stopping at the first. This changes what a check reports, never what it accepts.
- [ ] **AC-WAIVE-03 — One click marks it complete, with no explanation asked.** The button waives every failing item in the latest check run, with no partial selection, confirmation panel or reason field. The sentence above it says what Kiln waives, what it does next and how the activity will show (AC-WAIVE-10). When a failing item is a repository's uncommitted or unpushed work, it adds that this work will be missing from the final pull request and, where resuming is offered, that resuming the activity can push it instead.
- [ ] **AC-WAIVE-04 — Kiln checks again before saving, and waives only what it showed.** Submitting reruns every completion check and compares the result with the latest check run since the stop, the one Mark complete was offered on:

  | Result of the rerun | What happens |
  |---|---|
  | The same failing items, with the same failure text | Kiln saves the waiver and advances under the existing next-activity and requested-pause rules |
  | Everything passes | Kiln advances as Check again would, and saves no waiver |
  | Any other change: an item newly fails, newly passes or changes its failure text | Nothing is saved; the new results replace the old, and the caller sees which item changed |
  | The check run cannot finish | Nothing is saved or advanced, and the error shows (as AC-VERIFY-03) |

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
  | Any other item, such as a pull request's at final delivery | Its check and the item | Every repository's feature head | Any feature head changes |

  A checkpoint resolved only by waiving its failing requirements also counts as resolved for the checkpoints that depend on it (WAIVE-004). A waiver is never evidence of a deployment or verification.
- [ ] **AC-WAIVE-10 — A completed activity says which checks were waived.** A check met only through a waiver, of its own items (this activity's or carried from an earlier one) or of an audit it relies on (AC-WAIVE-12), shows **Waived**, never **Passed** or **Verified**. Each covered item carries its own **Waived** tag with the activity, time and source of its waiver, also within a check that still fails. An activity that completes with a waived check shows as **Complete**, with "N check(s) waived" beside it, in the progress row and detail, the Complete screen, the terminal summary, `kiln status` and its JSON, and check counts report waived checks separately (for example `3 passed · 1 waived`). A check that later passes on its own shows as passed, and the waiver stays in the history beside it.
- [ ] **AC-WAIVE-12 — A waived audit counts as its report allows.** Wherever Kiln chooses what comes next, Current completion audits included, an audit marked complete counts as the table says and stays current as an accepted audit does (AC-NEUTRAL-06, not AC-WAIVE-09), never sending the person back to the same audit.

  | Audit report | The audit counts as |
  |---|---|
  | Accepted | What its outcome says, a waived **Audit evidence is current** counted as current |
  | Valid, not accepted: it needs a person (**Audit work resolved**) or a repository or delivery check failed | Accepted, with needing a person counted as passed |
  | None usable (**Audit result recorded** waived) | Passed, and Kiln moves on (Doug's ruling, 2026-11-02): delivery audit to test audit, test audit to final delivery as having changed only tests |

  With no usable report, the waived label (AC-WAIVE-10) adds a warning marker, "no audit report: Kiln couldn't tell what this audit found", and the sentence above Mark complete (AC-WAIVE-03) says so first.

Replaces in part:

- AC-DEV-03 and AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (failed required development evidence, and the final requirements that every repository qualifies and all development verification is satisfied, give way to a waiver under AC-WAIVE-04 and AC-WAIVE-09).
- AC-PAGE-02, AC-TERMINAL-01, AC-VERIFY-01 and AC-RETURN-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the hand-back page's arrangement and action names under AC-NEXT-01/02, and Mark complete after a failed recheck; every action's behavior remains).
- AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the hand-back pair is split into Have Kiln resume and Check again under AC-NEXT-01/02).
- AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (its routine controls also include `kiln waive-and-advance`).
- AC-AUDIT-03 and AC-AUDIT-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` and AC-NEUTRAL-03, AC-NEUTRAL-06 and AC-NEUTRAL-07 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (a stopped audit can also advance on a waiver, its report used even when not accepted, and then counts, and stays current, as AC-WAIVE-12 says).
- AC-DONE-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Closed, Committed and Pushed can be waived).

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
