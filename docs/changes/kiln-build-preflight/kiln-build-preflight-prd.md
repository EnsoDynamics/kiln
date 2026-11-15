# PRD: Kiln Build Preflight

**Source:** Doug's review on 2026-11-14 of unattended runs that stopped part-way for a reason he could have cleared in a minute before starting: a sign-in that expired, a machine that could not run the tests, a phase that needed him at a desktop application.

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md)

**Depends on:** the Enso Method release that adds the `build-preflight` skill and the `**Attended:**` line on phase documents. Kiln built from this PRD still runs with an older method (AC-PREFLIGHT-05).

**Mockup:** [Open the mockup](mockups/kiln-build-preflight.html).

**Assumptions:** [Kiln Build Preflight assumptions](kiln-build-preflight-assumptions.md)

## Summary

Before Kiln starts the first phase, it runs the Enso Method's **preflight**: a short check that the access the whole plan needs is working and will last, that this machine can build and test the project, and that nothing in the plan will stop the run without warning. When the preflight is clean, Kiln goes straight on to the first phase, with no pause and no setting to turn it off. When it is not, Kiln stops at Needs you with a short numbered list in which every item is a command to run or a yes-or-no. Kiln also shows, before Start and in the plan, which phases are marked as needing a person there.

## Business Context

Kiln exists so a person can start a build and walk away, often overnight. A run that stops three minutes in, or at two in the morning, for something the person could have fixed before leaving costs the whole night.

Kiln's start checks already confirm the documents, the plan and the tools Kiln itself needs. They do not look at what the build needs: credentials for every phase, how long those credentials last, whether the test suite runs on this machine, or what the design says a person must provide first. Each build session checks its own access when it starts, which finds a problem in phase 6 only when phase 6 begins.

The Enso Method now has a skill for this, `build-preflight`, which a person can run by hand before a build. Its report opens with one of two fixed lines, `Preflight: ready` or `Preflight: N items need you`, and every item it lists is a command or a yes-or-no. It never comments on the requirements. Kiln runs that skill as its first step and shows what it reported; Kiln decides nothing about what is checked.

Some work has no scripted way: a console with no API, a point-and-click setup. The method now plans such work into the earliest phases and marks each of those phase documents with an `**Attended:**` line. Kiln shows that mark so the person knows, before pressing Start, where the run will need them.

## Acceptance Criteria

### Check the Build Before the First Phase

The preflight runs once, at the start, while the person is still there. A clean result costs them nothing; anything else arrives as a short list they can clear.

- [ ] **AC-PREFLIGHT-01 — The preflight is the first thing in the plan.** Documents found lists **Preflight** as the first row of the phase plan, above Phase 1. When a run that has built nothing is started, from the page or the command line, Kiln first runs the method's `build-preflight` skill in a session of its own, and the plan shows that row as running. It always runs: there is no setting for it. A run that is continued after its first phase has started does not run it again.
- [ ] **AC-PREFLIGHT-02 — A clean preflight goes straight on, and its row says what it found.** When the session's report opens `Preflight: ready`, Kiln starts the first phase with no pause and no page of its own. The Preflight row then shows **Ready**, how long it took, and "Nothing to settle" beneath it, as a finished phase's row shows its commit. The stops the report lists are not repeated there: the marked phases already show them (AC-ATTEND-01).
- [ ] **AC-PREFLIGHT-03 — Items stop the run at Needs you.** When the report opens `Preflight: N items need you`, Kiln stops at Needs you before any phase starts. The page's headline is that line, and beneath it are the numbered items as the session wrote them, in the session's order. The page offers what each stop offers, with these meanings:

  | Control | What it does here |
  |---|---|
  | **Check again** | Runs a fresh preflight. A clean one starts the first phase. |
  | **Reply** | Sends the person's answer to a yes-or-no item to the preflight session. |
  | **Mark complete** | Starts the first phase with the items as they are. The Preflight row then shows it was marked complete. |

- AC-PREFLIGHT-04 — retired before the build. It was a setting to turn the preflight off; the preflight always runs.
- [ ] **AC-PREFLIGHT-05 — An older method is not an error.** When the installed method has no `build-preflight` skill, the plan shows no Preflight row and Start begins the first phase as it does today.
- [ ] **AC-PREFLIGHT-06 — A preflight that reports neither line stops as a failed activity.** When the session ends without either opening line, Kiln stops at Needs you as it does for any activity that did not finish, and no phase starts.

### Show Which Phases Need a Person

A phase marked as needing a person is not a surprise if it is shown before the run starts.

- [ ] **AC-ATTEND-01 — Marked phases are shown in the plan.** On Documents found and on the run's phase plan, a phase whose document carries an `**Attended:**` line shows a **Needs you there** marker beside its name. Pointing at the marker or pressing it shows the line's text.
- [ ] **AC-ATTEND-02 — Documents found says where the run will need the person.** Above Start, one line names the marked phases and the unmarked run after them, such as "Phase 1 needs you there. Phases 2 to 9 run without you." With no phase marked, the line is left out.
- [ ] **AC-ATTEND-03 — A stop in a marked phase says so.** When a marked phase stops at Needs you, the page shows "This phase was planned as needing you" with the `**Attended:**` line's text, above the reason Kiln stopped. Kiln never holds a marked phase back: it starts and runs it as it does any other, doing all it can before it reaches the work that needs the person. The marker and this line are only a heads-up.

## Out of Scope

- What the preflight checks and how its items are worded. The `build-preflight` skill owns both.
- Handing a marked phase to a desktop agent. That remains the roadmap's [computer-use handoff idea](../../roadmap/kiln-desktop-computer-use-handoff-idea.md).
- Running Kiln's own start checks differently. They still run first and still stop Start on their own.
- New wording in `kiln status`. A preflight stop is reported as any other stop is.
- Holding the installed method at one version for the length of a run.
