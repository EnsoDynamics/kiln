# PRD: Kiln Checks at a Stop

**Source:** Doug's report on 2026-11-12, after a finished delivery audit stopped at Needs you showing one line under its checks, and three or four once he pressed Check again.

**Follow-on to:** [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md).

**Mockup:** [Open the interactive mockup](mockups/kiln-checks-at-a-stop.html).

## Summary

At a Needs you stop, the rows Kiln saved when it stopped are labelled **Why Kiln stopped**, and the page says that **Check again** runs the activity's full completion checks. Once the person has checked again, the rows are labelled as the completion checks. Nothing about when Kiln checks, or what it checks, changes.

This is built after [Kiln Run Restart](../kiln-run-restart/kiln-run-restart-prd.md), which reworks the same pages, and builds on that version of them.

## Business Context

Many stops save only the one check that raised them: an audit's own done check, a launch problem, a plan problem. The page shows that row where the activity's checks go, so it reads as "the checks" when it is really "why Kiln stopped". Pressing **Check again** runs the activity's completion checks as well, and the list grows from one row to three or four with no warning that more were waiting.

Running the full checks automatically at every stop was considered on 2026-11-12 and set aside: it saves one click, at the cost of a background check at every stop. Mark complete already shows before a recheck, unusable, with "Check again first" (AC-WAIVE-02 in Kiln Completion Waivers), and stays that way.

## Acceptance Criteria

### Say What the Rows Are

A person reading a stopped activity's page can tell whether they are looking at the reason Kiln stopped or at the results of its completion checks, and knows what Check again will add.

- [ ] **AC-STOPCHECK-01 — Rows saved at the stop are labelled Why Kiln stopped.** On both Needs you pages, until a check the person asked for has finished, the rows show under the label **Why Kiln stopped**, with the time Kiln stopped. This holds whether the stop saved one row or the full set.
  - Replaces in part: AC-NEXT-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (how the rows are labelled before the person checks again).
- [ ] **AC-STOPCHECK-02 — The page says what Check again will run.** While the rows are labelled Why Kiln stopped, a line by **Check again** reads "Check again runs all of {activity}'s completion checks."
- [ ] **AC-STOPCHECK-03 — After a check, the rows are labelled as the completion checks.** Once a check the person asked for has finished, the rows show under the label **Completion checks**, with the time they were checked, and AC-STOPCHECK-02's line no longer shows. A check that could not finish keeps the earlier rows and their label (AC-VERIFY-03 in Kiln Needs You Handoff).
- [ ] **AC-STOPCHECK-04 — A phase that built nothing uses the same label.** Where Kiln Run Restart shows **Nothing to check yet** (AC-CASE-03 there), the row it keeps for the stop's own reason carries the **Why Kiln stopped** label, and AC-STOPCHECK-02's line is left out, since that page has its own button and line.

## Out of Scope

- Running any check the person did not ask for.
- When Mark complete can be pressed (AC-WAIVE-02 in Kiln Completion Waivers).
- What `kiln status` reports.
