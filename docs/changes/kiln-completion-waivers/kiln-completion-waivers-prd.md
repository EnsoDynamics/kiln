# PRD: Kiln completion waivers

**Follow-on to:** [Kiln development deployments](../kiln-development-deployments/kiln-development-deployments-prd.md).
**Source:** Doug's request, 2026-11-01, raised while Kiln refused a correct phase of another project.
**Assumptions:** [kiln-completion-waivers-assumptions.md](kiln-completion-waivers-assumptions.md)
**Business validation, 2026-11-01:** Doug directed that any failing step can be waived at any activity, that a waiver also counts at final delivery, and that bots must be able to waive through the command line (WAIVE-001 to 003). He then directed a plain button with no reason asked, since a person who has confirmed the work is done should not have to explain Kiln's cryptic refusals, and asked for resuming and checking to sit in separate places, with Mark complete offered only after a recheck still fails.

## Summary

When Kiln refuses to continue but the work is done, the person, or a bot acting for them, can mark it complete with one click or one command, with no explanation required, after asking Kiln to check again. Kiln saves that as a waiver and advances. The activity then shows as complete, with the waived checks marked as waived, never as passed. This works at any stopped activity: an implementation phase, the delivery audit, the test audit or final delivery, from the browser or the `kiln` command line.

## Business Context

Kiln advances only when its completion checks pass. Those checks are mechanical and occasionally wrong: on 2026-11-01 a phase of another project was correctly deployed and running, but Kiln's evidence matcher could not accept it, and the phase could not advance. The only action, **Verify Phase 3 & advance**, rechecks and advances only if everything passes, so the person had no way to continue short of editing Kiln's saved state.

A mechanical check will always meet a case it gets wrong, at any step. The person must never be stuck behind one, and must be able to push the run along from a bot (`kiln-bot-control`) as easily as from the browser. A plain pass still always means the checks passed, and a waiver is always visible as a waiver.

## Terms

- **Waiver:** a saved record that an activity was accepted despite named failing completion requirements.
- **Stopped activity:** an implementation phase, delivery audit, test audit or final delivery that Kiln has stopped at Needs you because a completion check failed.

## Acceptance Criteria

### Resuming and checking are separate choices

Handing work back to Claude and asking Kiln to confirm the work is done are different moments, so they sit in different places on the Needs you page.

- [ ] **AC-NEXT-01 — Resume sits with the terminal choice.** **Resume {activity} in Kiln** becomes **Have Kiln resume {activity}** and moves into the terminal card, after its instructions, introduced by "Got it back on track? Exit Claude Code, then:" (the agent's name as recorded). Its behavior is unchanged (AC-RETURN-01/02 in [Clear handoffs on Kiln's Needs you page](../kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md)). The terminal card's title becomes **Talk it through in your terminal**.
- [ ] **AC-NEXT-02 — Checking has its own section.** Below the two cards, **Is {activity} already done?** shows the completion checks, each with its fact, and when they were checked ("when Kiln stopped" until the person checks again), with **Check {activity} again**. That button replaces **Verify {activity} & advance** with the same behavior (AC-VERIFY-01 to 04): if every check passes, Kiln closes out the activity and moves to the next step. When a recheck still fails, the section says how many checks fail and points to Have Kiln resume for unfinished work.
- [ ] **AC-WAIVE-01 — Checking never waives anything.** Check again, Have Kiln resume, and `kiln resume` and `kiln verify-and-advance` on the command line, never create a waiver. Kiln never creates a waiver on its own, during recovery, or when a later check passes.

### Mark complete when Kiln's check is wrong

When the person has checked again and Kiln still refuses, they can mark the activity complete, whatever the step and whatever failed.

- [ ] **AC-WAIVE-02 — Offered when a recheck still fails.** In the **Is {activity} already done?** section of any stopped activity, once a check run after the stop has failed, a **Mark {activity} complete** button appears below the checks under the heading "{Activity} is done, and Kiln's check is wrong?". Every failing completion requirement can be waived, including Closed, Committed, Pushed, workspace, development delivery and audit checks. It does not appear before a recheck, while a check is running, after a check that could not finish, or when every requirement passed.
- [ ] **AC-WAIVE-03 — One click marks it complete, with no explanation asked.** The button waives every requirement shown as failing in that check; there is no partial selection, confirmation panel or reason field. The sentence above it says that Kiln skips the N failing checks, records them as waived, never as passed, moves to the next step, and that the activity will show as "Complete · N checks waived". When Committed or Pushed is failing, it adds that work not committed and pushed will be missing from the final pull request, and that Have Kiln resume can push it instead.
- [ ] **AC-WAIVE-04 — Kiln checks again before saving, and waives only what it showed.** Submitting reruns all completion checks first. If the failing requirements are exactly those shown, Kiln saves the waiver and advances, following the existing next-activity and requested-pause rules. If everything now passes, Kiln advances as though the checks had passed and saves no waiver. If any requirement newly fails, newly passes, or changes failure text, nothing is saved, the new results replace the old, and the caller sees what changed. If the check cannot finish, nothing is saved or advanced and the error shows (as AC-VERIFY-03).
- [ ] **AC-WAIVE-05 — Bots can mark complete through the command line.** `kiln waive-and-advance <PRD-path>` does the same as the button. Without `--confirm` it checks again and lists what would be waived, saving nothing; that check is the recheck AC-WAIVE-02 requires. With `--confirm` and the status token from that listing or `kiln status`, it saves and advances; a stale token is refused as AC-ACT-04 requires. No reason is required. An optional `--by <name>` records who asked, for example a bot's name. It follows bot control's text/JSON, operation and help contracts (AC-ACT-01, AC-ACT-05, AC-CLI-01/02).
- [ ] **AC-WAIVE-06 — Competing actions wait.** While a check or a waiver is in progress, Check again, Have Kiln resume, reply and a second waiver are unavailable from the browser and the command line, as AC-VERIFY-04 requires for the existing actions. A disconnected page cannot submit one.
- **AC-WAIVE-07 — Retired 2026-11-01.** A waiver is offered only at Needs you (AC-WAIVE-02, AC-WAIVE-05), when no Kiln agent is working, so a separate guard added nothing.

### A waiver is recorded and never reads as verified

Anyone looking later, in the browser, the terminal or a bot, must be able to tell the activity was completed on a waiver and which checks it skipped.

- [ ] **AC-WAIVE-08 — The waiver is saved with everything needed to audit it.** Kiln saves, with the execution, before advancing: when, where it came from (browser or command line, with the local account name and any `--by` name), each waived requirement with its failure text, the revision each was checked against where one applies (the feature head, or the merge revision for development delivery), and an identity for the check it rests on. The record survives restarts and is never edited or deleted by Kiln.
- [ ] **AC-WAIVE-09 — It covers only what it named.** A waived requirement counts toward its activity's completion and the PRD's final completion checks only while the activity and what it was checked against are unchanged: the same checkpoint, requirement and merge revision for development delivery, the same feature head for the other checks. A replaced checkpoint, new work, or any other requirement that fails later needs its own passing check or its own waiver; the PRD is never asked to waive the same unchanged item twice. A waiver is not evidence: it never satisfies another checkpoint's prerequisite or verification, and it never commits, pushes or merges anything.
- [ ] **AC-WAIVE-10 — A waived activity is complete, and says which checks were waived.** The activity shows as **Complete** like any other, with "N check(s) waived" beside it, in the progress row and detail, the Complete screen, the terminal summary, `kiln status` and its JSON. Each waived requirement itself shows **Waived**, with the date and source, never **Passed** or **Verified**, and requirement counts report waived items separately (for example `3 passed · 1 waived`). A check that later passes on its own shows as passed, and the waiver stays in the history beside it.

Replaces in part:

- AC-DEV-03 and AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (failed required development evidence, and the final requirement that all development verification is satisfied, give way to a waiver under AC-WAIVE-04 and AC-WAIVE-09).
- AC-PAGE-02, AC-TERMINAL-01 and AC-VERIFY-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the page's arrangement and action names under AC-NEXT-01/02, and Mark complete after a failed recheck; every action's behavior remains).
- AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the hand-back pair is split into Have Kiln resume and Check again under AC-NEXT-01/02).
- AC-ACT-02 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (the command line also offers `kiln waive-and-advance`).
- AC-AUDIT-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` and AC-NEUTRAL-03 in `docs/changes/kiln-method-neutral-audits/kiln-method-neutral-audits-prd.md` (a stopped audit can also advance on a waiver).
- AC-DONE-01 and AC-DONE-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Closed, Committed and Pushed can be waived).

## Mockup

[Open the interactive mockup](mockups/kiln-completion-waivers.html). Its sample phase, checkpoint ids and revisions are modelled on the 2026-11-01 case and are illustrative; the preview controls are not Kiln controls.

| State to inspect | Criteria illustrated |
|---|---|
| Kiln stopped: resume, or check again | AC-NEXT-01/02, AC-WAIVE-01 |
| Checked again, still failing: Mark complete offered | AC-WAIVE-02/03 |
| Mark complete clicked, but results changed | AC-WAIVE-04/06 |
| Several kinds of failure, including Closed and Pushed | AC-WAIVE-02/03 |
| A bot doing it through the command line | AC-WAIVE-05 |
| After marking complete: phase detail, delivery panel and `kiln status` | AC-WAIVE-08/09/10 |

## Out of Scope

- Waiving ahead of a check, in bulk across activities, or for anything other than a stopped activity's failed completion requirements.
- Committing, pushing or merging work on the caller's behalf to make a waived check true.
- Changing what Kiln's checks accept; that is separate work in each check's own design.
