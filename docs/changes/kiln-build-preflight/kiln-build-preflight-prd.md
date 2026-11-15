# PRD: Kiln Build Preflight

**Source:** A review on 2026-11-14 of unattended runs that stopped part-way for a reason the person could have cleared in a minute before starting: a sign-in that expired, a machine that could not run the tests, a phase that needed them at a desktop application.

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md), [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md), [Kiln Run Restart](../kiln-run-restart/kiln-run-restart-prd.md), [Kiln Development Deployments](../kiln-development-deployments/kiln-development-deployments-prd.md), [Kiln Completion Audits](../kiln-completion-audits/kiln-completion-audits-prd.md), [Kiln Checks at a Stop](../kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md), [Kiln Bot Control](../../prds/kiln-bot-control/kiln-bot-control-prd.md), [Kiln Usage-Limit Recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md), [Kiln Missing Worktree Recovery](../kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md), [Kiln Live Session Control](../kiln-live-session-control/kiln-live-session-control-prd.md)

**Depends on:** the Enso Method release that adds the `build-preflight` skill and the `**Attended:**` line on phase documents. Kiln built from this PRD still runs with an older method (AC-PREFLIGHT-05).

**Mockup:** [Open the mockup](mockups/kiln-build-preflight.html).

**Assumptions:** [Kiln Build Preflight assumptions](kiln-build-preflight-assumptions.md)

## Summary

Before Kiln starts building, it runs the Enso Method's **preflight**: a check, often several minutes long because it runs the project's tests, that the access the whole plan needs is working and will last, that this machine can build and test the project, and that nothing in the plan will stop the run without warning. When the preflight is clean, Kiln goes straight on, with no pause and no setting to turn it off. When it is not, Kiln stops at Needs you with a short numbered list of items the person can each settle in one step, such as a command to run or a yes-or-no. Kiln also marks, in the plan before Start, each phase planned as needing a person there.

## Business Context

Kiln exists so a person can start a build and walk away, often overnight. A run that stops three minutes in, or at two in the morning, for something the person could have fixed before leaving costs the whole night.

Kiln's start checks already confirm the documents, the plan and the tools Kiln itself needs. They do not look at what the build needs: credentials for every phase, how long those credentials last, whether the test suite runs on this machine, or what the design says a person must provide first. Each build session checks its own access when it starts, which finds a problem in phase 6 only when phase 6 begins.

The Enso Method now has a skill for this, `build-preflight`, which a person can run by hand before a build. It may refresh a sign-in or install a missing tool itself. Its report opens with one of two fixed lines, `Preflight: ready` or `Preflight: N items need you`; it lists each item as something the person can settle in one step, and then each place the build will stop. It never comments on the requirements. Kiln runs that skill as its first step and shows what it reported; Kiln decides nothing about what is checked.

Some work has no scripted way: a console with no API, a point-and-click setup. The method now plans such work into the earliest phases and marks each of those phase documents with an `**Attended:**` line. Kiln shows that mark so the person knows, before pressing Start, where the run will need them.

## Acceptance Criteria

### Check the Build Before the Run Starts Work

The preflight runs once, at the start, while the person is still there. A clean result costs them nothing; anything else arrives as a short list they can clear.

- [ ] **AC-PREFLIGHT-01 — The preflight comes before anything else the run does.** Kiln runs the method's `build-preflight` skill, in a session of its own and before any other activity of the run, each time a person presses **Start** or **Continue with N phases**, even with every phase already closed, including a Start that ends a pause (RUN-003) and a Start on the Folder missing page that starts again from the base branch, and each time a run is resumed, with **Resume**, `kiln run <path> --resume` or a Start on the Folder missing page that carries on from the existing feature branch, before its preflight has reported ready or been marked complete. Beyond those and its own stop's controls (AC-PREFLIGHT-03), it never runs, so phases added while the run is underway get none, and no setting turns it off.
  - Replaces in part: AC-VIEW-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a Start that ends a pause runs a preflight before the next activity)
  - Replaces in part: AC-SETUP-04 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (a Start from the base branch runs a preflight before the remaining plan)
  - Replaces in part: AC-SETUP-05 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (a Start from the existing feature branch runs a preflight first when it ends a pause, or when the run's preflight has not reported ready or been marked complete and the run is not held in Needs you)
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Resume and `kiln run <path> --resume` first run a preflight while none has reported ready or been marked complete, a run an earlier Kiln started included)
  - Replaces in part: AC-OFFER-02, AC-CONTINUE-06 and AC-CONTINUE-07 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (Continue runs a preflight before the first added phase or its preparation)
  - Replaces in part: AC-FROM-02 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (Start runs a preflight first, a Start with every phase closed included)
  - Replaces in part: AC-AUDIT-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (when the plan is already closed at Start, a preflight comes before the delivery audit)
- [ ] **AC-PREFLIGHT-08 — The preflight shows as a row in the plan.** Documents found and the run's phase plan show a **Preflight** row just above the activity it comes before: Phase 1 on a new branch, the first open phase on a branch with closed phases, the first added phase after Continue. When every phase is closed, the row follows the closed phases on Documents found and sits above the delivery audit in the run's plan. Its row, the page header while it is the current activity, and its session detail work as an audit's do (AC-RUN-01 in Kiln Completion Audits), except that it has no live controls and no pause while it runs, as final delivery's session has none. Opening the row shows its full report.
  - Replaces in part: AC-WATCH-01, AC-WATCH-02 and AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the Preflight row in the plan, the header naming the preflight while it runs, and both drawn on screens the mockups predate)
  - Replaces in part: AC-LIVE-02 and AC-BOT-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (a running preflight offers neither Message Claude, Pause & take over nor a pause, in the browser or by command, and shows why, as final delivery does)
- [ ] **AC-PREFLIGHT-02 — A clean preflight goes straight on, and its row says what it found.** When the session's report opens `Preflight: ready`, Kiln goes on to the activity the preflight came before, with no pause and no page of its own. The Preflight row then shows **Ready**, how long it took, and "Nothing to settle" beneath it, as a finished phase's row shows its commit. The row does not repeat the stops the report lists; opening it shows them in the full report.
- [ ] **AC-PREFLIGHT-03 — Items stop the run at Needs you.** When the report opens `Preflight: N items need you`, Kiln stops at Needs you before anything else in the run starts. The page's headline is that line; beneath it are the numbered items as the session wrote them, in the session's order. The page does not repeat the stops the report lists. Its controls, each also a command, do this here:

  | Control | Command | What it does here |
  |---|---|---|
  | **Check Preflight again** | `kiln check-again` | Runs a fresh preflight session. |
  | **Reply** | `kiln reply` | Resumes the preflight session with the person's words, as Reply resumes any stopped session. Kiln passes the words on and acts on none of them itself. |
  | **Mark complete** | `kiln waive-and-advance --confirm` | Goes on to the activity the preflight came before, with the items as they are. It sits beside Check Preflight again under no heading, shows though the page has no completion checks, can be pressed at once and reruns nothing. Kiln saves the items as the waiver, and the Preflight row shows it was marked complete (AC-WAIVE-10). |

  The page offers no other control, and the matching commands are refused with a reason naming these three. A sentence beneath the controls says what Mark complete waives, what it starts and how the row will show (AC-WAIVE-03). After Check Preflight again or Reply, Kiln reads the new report's opening line as it read the first (AC-PREFLIGHT-02, AC-PREFLIGHT-03, AC-PREFLIGHT-06).
  - Replaces in part: AC-WAIVE-02, AC-WAIVE-03, AC-WAIVE-04 and AC-WAIVE-08 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (at a preflight stop: Mark complete's label, heading, placement and when it shows and can be pressed; where its sentence sits; the rerun before saving; each waived item saved as the session wrote it, with no check or checked-against value)
  - Replaces in part: AC-STOP-02, AC-STOP-03, AC-STOP-05, AC-STOP-06 and AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a preflight stop shows the headline and items instead of how the session ended and the check rows; at a preflight stop, Check again runs a fresh preflight session in place of the done check, and the page offers no command to reopen the session and no prompt for a fresh one, since a preflight continued outside Kiln leaves its report unread)
  - Replaces in part: AC-STOPCHECK-01 in `docs/changes/kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md` (a preflight stop shows no saved check rows)
  - Replaces in part: AC-ACT-02 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (`kiln reply` also resumes a stopped preflight session)

- AC-PREFLIGHT-04 — retired before the build. It was a setting to turn the preflight off; there is none (AC-PREFLIGHT-01).
- [ ] **AC-PREFLIGHT-05 — An older method is not an error.** When the run's agent finds no `build-preflight` skill in the installed method, the plan shows no Preflight row and the run starts as it does today.
- [ ] **AC-PREFLIGHT-06 — A preflight with no report does not hold up the run.** When the session ends without either opening line, Kiln goes on to the activity the preflight came before, as after a clean preflight. The Preflight row shows **No report** as a warning where a clean row shows Ready, with "Ended without a report" beneath it, and opening the row shows how the session ended (AC-STOP-02 in Kiln v1); when no session ran, the row says why instead. A session Kiln will resume after a usage limit has not ended.
  - Replaces in part: AC-AUTO-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a preflight session that hits a usage limit waits too, not only a phase or pull-request session)
- AC-PREFLIGHT-07 — retired before the build. It showed the report's stops on the items page; the phase markers are the only heads-up (AC-ATTEND-01, RUN-002).

### Show Which Phases Need a Person

A phase marked as needing a person is not a surprise if it is shown before the run starts.

- [ ] **AC-ATTEND-01 — Marked phases are shown in the plan.** On Documents found and on the run's phase plan, a phase whose document carries an `**Attended:**` line shows a **Needs you there** marker beside its name, closed or not. Pointing at the marker or pressing it shows the line's text.
  - Replaces in part: AC-WATCH-01 and AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the Needs you there marker beside a marked phase's name)
- AC-ATTEND-02 — retired before the build. It was a line above Start naming where the run would need the person; the markers do that job (AC-ATTEND-01, RUN-002).
- [ ] **AC-ATTEND-05 — Documents found says when an early merge would stop the run.** When a phase this run will build carries an `**Early merge:**` line and **Allow early merges** is off, a warning directly beneath that checkbox, set apart from the text around it, names each such phase and says the run will stop there until early merges are allowed. Ticking the box removes the warning.
  - Replaces in part: AC-PERMIT-01 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (what Documents found shows beside Allow early merges)
- [ ] **AC-ATTEND-03 — A stop in a marked phase says so.** When a marked phase stops at Needs you, a card at the top of the page's main column, above how the session ended, says the phase was planned as needing the person and gives the `**Attended:**` line's text.
  - Replaces in part: AC-CASE-04 and AC-LOOK-01 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (in a marked phase, this card comes first, above the latest launch's card)
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the card on both Needs you screens)
- [ ] **AC-ATTEND-04 — A marked phase runs like any other.** Kiln starts and runs a marked phase with the same session and instructions as any other phase, and never holds it back or pauses before it. The marker and AC-ATTEND-03's card are only a heads-up (RUN-001).

## Out of Scope

- What the preflight checks and how its items are worded. The `build-preflight` skill owns both.
- Handing a marked phase to a desktop agent. That remains the roadmap's [computer-use handoff idea](../../roadmap/kiln-desktop-computer-use-handoff-idea.md).
- Running Kiln's own start checks differently. They still run first and still stop Start on their own.
- New wording in `kiln status`. A preflight stop is reported as any other stop is, and a preflight marked complete as a waived audit is.
- Holding the installed method at one version for the length of a run.
