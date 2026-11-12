# PRD: Kiln Checks at a Stop

**Source:** Doug's report on 2026-11-12, after a finished delivery audit stopped at Needs you showing one line under its checks, and three or four once he pressed Check again.

**Follow-on to:** [Kiln Completion Waivers](../kiln-completion-waivers/kiln-completion-waivers-prd.md).

**Mockup:** [Open the interactive mockup](mockups/kiln-checks-at-a-stop.html).

## Summary

When Kiln stops an activity at Needs you, the page shows the activity's full completion checks straight away, without the person pressing **Check again**. The reason Kiln stopped is shown apart from those checks, under its own label. Kiln runs the checks in the background, so the page appears at once and the checks section fills in when they finish.

This is built after [Kiln Run Restart](../kiln-run-restart/kiln-run-restart-prd.md), which reworks the same pages, and builds on that version of them.

## Business Context

Today most stops save only the one check that raised them: an audit's own done check, a launch problem, a plan problem. The section headed as the activity's checks then shows a single row. Pressing **Check again** runs the whole set of completion checks, and the list grows to three or four rows. The person reads the first list as "the checks" when it is really "why Kiln stopped", and has no way to know more rows are waiting behind a button.

The same button press is also what makes **Mark complete** usable (AC-WAIVE-02 in Kiln Completion Waivers). A person who believes the activity is done has to press Check again only to be shown what Kiln could have shown them already.

## Acceptance Criteria

### Show the Full Checks as Soon as Kiln Stops

A person arriving at a stopped activity sees everything Kiln would check, not only the one thing that stopped it.

- [ ] **AC-STOPCHECK-01 — Every stop shows the full completion checks without asking.** When an activity stops at Needs you, Kiln runs the same completion checks **Check again** would run for that stop, and both Needs you pages show their results without the person pressing anything. A stop whose own check already was the full set shows it as today, with no second run. A page opened or reloaded later shows the saved results; Kiln does not run them again for each visit.
  - Replaces in part: AC-NEXT-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (the checks shown before the person checks again are the full set, not only the stop's own).
- [ ] **AC-STOPCHECK-02 — The page never waits for the checks.** The page shows at once, with the reason Kiln stopped (AC-STOPCHECK-03) and everything else it offers. Until the checks finish, the checks section says Kiln is checking, and Check again and Mark complete are unavailable, as AC-WAIVE-06 in Kiln Completion Waivers requires while any check runs. The results appear in place when they finish, without a reload.
- [ ] **AC-STOPCHECK-03 — The reason Kiln stopped is labelled apart from the checks.** The fact that raised the stop shows under the label **Why Kiln stopped**, above the completion checks, at every stop and whether or not the checks have finished. When that fact is also one of the completion checks, it shows in both places.
- [ ] **AC-STOPCHECK-04 — Checking at a stop only shows results.** The automatic check never advances the activity, clears the stop, commits, pushes or starts a session, whatever its results. When every check passes, the section says so and that **Check again** will move Kiln on (STOP-002).
- [ ] **AC-STOPCHECK-05 — A check that cannot finish says so.** When the automatic check cannot finish, the section shows the reason Kiln stopped, the error, and **Check again** to retry, as AC-VERIFY-03 in Kiln Needs You Handoff requires for a recheck. Nothing reads as checked.
- [ ] **AC-STOPCHECK-06 — A phase that built nothing still shows no checks until asked.** Where Kiln Run Restart shows **Nothing to check yet** (AC-CASE-03 there), Kiln runs no automatic check, and the page is as that criterion says.

### Mark Complete Works From What the Page Already Shows

Once the full checks are on the page, pressing Check again only to be allowed to mark the activity complete adds nothing: Mark complete already runs every check again before it saves anything.

- [ ] **AC-STOPCHECK-07 — Mark complete is usable once the automatic check shows a failing check.** When the automatic check finishes with a check still failing, **Mark {activity} complete** is usable at once, with AC-WAIVE-03's sentence, and behaves as AC-WAIVE-04 says, rerunning the checks before it saves. The unusable button and its "Check again first" line then show only while the automatic check has not finished or could not finish (STOP-001).
  - Replaces in part: AC-WAIVE-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a finished automatic check at the stop counts as the check run Mark complete needs).

### Bots See the Same Thing

A bot reading Kiln's status gets what the page shows, so it can act without a recheck of its own.

- [ ] **AC-STOPCHECK-08 — The command line carries the automatic check.** `kiln status` reports the automatic check's results, whether it is still running, and the reason Kiln stopped as its own field. `kiln waive-and-advance --confirm` is accepted wherever AC-STOPCHECK-07 makes the button usable.
  - Replaces in part: AC-WAIVE-05 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (`--confirm` no longer needs a recheck first once the automatic check has finished with a failing check).

## Out of Scope

- Changing which checks an activity must pass, or what any check accepts.
- Checking again on a timer, or when files change, after the automatic check has run.
- The pages Kiln Run Restart adds or changes, beyond AC-STOPCHECK-06.
