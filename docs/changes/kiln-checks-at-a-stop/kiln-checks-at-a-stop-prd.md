# PRD: Kiln Checks at a Stop

**Source:** Doug's report on 2026-11-12, after a finished delivery audit stopped at Needs you showing one line under its checks, and three or four once he pressed Check again.

**Follow-on to:** [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md).

**Mockup:** [Open the interactive mockup](mockups/kiln-checks-at-a-stop.html).

## Summary

When Kiln stops an activity at Needs you, the page shows the activity's completion checks straight away, without the person pressing **Check again**. The reason Kiln stopped is shown apart from those checks, under its own label. Kiln runs the checks in the background, so the page appears at once and the checks section fills in when they finish.

This is built after [Kiln Run Restart](../kiln-run-restart/kiln-run-restart-prd.md), which reworks the same pages, and builds on that version of them.

## Business Context

Many stops save only the one check that raised them: an audit's own done check, a launch problem, a plan problem. The section headed as the activity's checks then shows a single row. Pressing **Check again** runs the activity's completion checks as well, and the list grows to three or four rows. The person reads the first list as "the checks" when it is really "why Kiln stopped", and has no way to know more rows are waiting behind a button.

The same button press is also what makes **Mark complete** usable (AC-WAIVE-02 in Kiln Completion Waivers). A person who believes the activity is done has to press Check again only to be shown what Kiln could have shown them already.

## Acceptance Criteria

### Show the Full Checks as Soon as Kiln Stops

A person arriving at a stopped activity sees everything Kiln would check, not only the one thing that stopped it.

- [ ] **AC-STOPCHECK-01 — Every stop shows the activity's completion checks without asking.** When an activity stops at Needs you, or is held there for billing approval, Kiln runs the **automatic check**: the activity's own completion checks, as the table says, and nothing else. It never reruns the condition that raised the stop, so it reads no launch, billing or agent settings, starts no Codex probe, rereads no plan, adds no repository and stops no process. Both Needs you pages show its results without the person pressing anything. Kiln runs it once per stop: a page opened or reloaded later shows the saved results. If Kiln is stopped or restarted before it finishes, Kiln runs it once when it next shows the stop.

  | The stopped activity | The automatic check |
  |---|---|
  | A phase that has run | The phase's done check |
  | An audit that has run | The audit's done check |
  | Final delivery | The final-delivery check |
  | Any of these whose stop was raised by that same check | None; the stop already holds the full set, shown as today |
  | An activity that has not started, or is already complete | None; only **Why Kiln stopped** shows (AC-STOPCHECK-03) |

  - Replaces in part: AC-NEXT-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (the checks shown before the person checks again are the activity's completion checks, with the time the automatic check ran, not only the stop's own row "when Kiln stopped").
- [ ] **AC-STOPCHECK-02 — The page never waits for the checks, and neither does the person.** The page shows at once, with the reason Kiln stopped (AC-STOPCHECK-03) and everything else it offers. Until the automatic check finishes, the checks section says Kiln is checking, and Check again is unavailable. Replying, resuming and starting the activity again stay available, and using one ends the automatic check with no results. The results appear in place when it finishes, without a reload.
  - Replaces in part: AC-WAIVE-06 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` and AC-VERIFY-04 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (the automatic check does not make replying or resuming wait; a check the person asked for still does).
- [ ] **AC-STOPCHECK-03 — The reason Kiln stopped is labelled apart from the checks.** Under the label **Why Kiln stopped**, above the completion checks, the page shows the failing fact Kiln saved when it stopped, with that time. It is Kiln's own recorded fact, never an inferred cause (AC-STOP-04 in Kiln v1 is unaffected), it shows whether or not the checks have finished, and it does not change when the person checks again. When the completion checks themselves raised the stop, it says the activity did not pass its completion checks and the rows are not repeated. On Kiln Run Restart's stopped-phase pages it is the row AC-CASE-03 there keeps beside **Nothing to check yet**.
- [ ] **AC-STOPCHECK-04 — The automatic check only shows results.** It never advances the activity, clears the stop or changes anything, whatever its results. When every check passes, the section says so and that **Check again** will have Kiln carry on, which then does what Check again does today (STOP-002).
- [ ] **AC-STOPCHECK-05 — A check that cannot finish says so.** When the automatic check cannot finish, the section shows the error and **Check again** to retry, as AC-VERIFY-03 in Kiln Needs You Handoff requires for a recheck. Nothing reads as checked.
- [ ] **AC-STOPCHECK-06 — A phase that built nothing still shows no checks until asked.** Where Kiln Run Restart shows **Nothing to check yet** (AC-CASE-03 there), Kiln runs no automatic check, and the page is as that criterion says.

### Mark Complete Works From What the Page Already Shows

Once the completion checks are on the page, pressing Check again only to be allowed to mark the activity complete adds nothing: Mark complete already runs every check again before it saves anything.

- [ ] **AC-STOPCHECK-07 — Mark complete is usable once the page shows a finished check with a failure.** When the stop holds a finished run of the completion checks with a check still failing, whether the automatic check or the stop's own full set, **Mark {activity} complete** is usable at once, with AC-WAIVE-03's sentence, and behaves as AC-WAIVE-04 says, rerunning the checks before it saves. As AC-WAIVE-02 says, the block is hidden while a check runs. The unusable button and its "Check again first" line show only after a check that could not finish, and at a stop with no automatic check (STOP-001).
  - Replaces in part: AC-WAIVE-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a finished run of the completion checks at the stop counts as the check run Mark complete needs, with no recheck by the person).

### Bots See the Same Thing

A bot reading Kiln's status gets what the page shows, so it can act without a recheck of its own.

- [ ] **AC-STOPCHECK-08 — The command line carries the automatic check.** `kiln status` reports the automatic check's results, whether it is still running, and the reason Kiln stopped as its own field. `kiln waive-and-advance --confirm` is accepted wherever AC-STOPCHECK-07 makes the button usable.

## Out of Scope

- Changing which checks an activity must pass, or what any check accepts.
- Checking again on a timer, or when files change, after the automatic check has run.
- What Kiln Run Restart's pages offer and do, beyond AC-STOPCHECK-03 and AC-STOPCHECK-06.
