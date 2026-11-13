# PRD: Kiln PRD Time Totals

**Source:** Doug's request on 2026-11-13: a PRD split into many phases, with its delivery audits and test audits, runs for a long time. Each phase row shows its own running and waiting time, but nothing shows the whole PRD's until it is complete. He asked for both totals in the header, beside the state and the phase count, and chose the drawn treatment (D, a labelled line with no bar) on 2026-11-13.

**Follow-on to:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md)

**Changes:** part of Kiln v1's AC-WATCH-02 (where the header shows the PRD's running and waiting time).

**Mockup:** [The header in every state](mockups/kiln-prd-time-totals.html).

**Assumptions:** [kiln-prd-time-totals-assumptions.md](kiln-prd-time-totals-assumptions.md)

## Summary

Once a PRD has started, the header of every progress screen shows a second line under the state: **PRD total**, the running time and the waiting time of the whole PRD so far, and when the PRD started. The counter that is moving goes up each minute, so the person can see what the PRD has cost so far without adding up the phase rows.

## Business Context

Kiln v1 shows the PRD's running and waiting time only on Complete. Each phase row shows its own times, but a PRD with eight phases and several rounds of delivery audits and test audits can run for a day or more, and the person can't see the whole cost while it runs without adding up every row. That cost is what decides whether to split a PRD differently, pause it, or switch accounts.

The total has to be clearly the PRD's. The state pill names the current phase ("Implementing phase 8"), so a time beside it reads as that phase's. The total therefore sits on its own line under the state row, labelled PRD total.

## Acceptance Criteria

- [ ] **AC-TOTAL-01 — The header shows the PRD's totals once it has started.** From the moment the PRD is started, the header of every progress screen except Phase detail adds a line under the state row: the label "PRD total", the PRD's running time, its waiting time and "since <when the PRD started>". On Complete the line gives the span instead ("Tue 9:02 AM to 7:22 PM"), and the totals leave the state row, which keeps the phase count and when it finished. Not started shows no line, since nothing has run, and Folder missing shows none (missing-worktree recovery AC-GONE-02).
  - Replaces: AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md`, in part (Complete's running time and waiting time on the state row).
- [ ] **AC-TOTAL-02 — The totals cover the whole PRD.** Running time is the recorded execution of every session the PRD has run: its phases, its delivery audits, test audits and repair sessions, and the pull-request session. Waiting time is the rest of the time since the PRD started, including Needs you stops, usage-limit waits, pauses and the gaps between sessions, as Kiln v1 AC-WATCH-02 defines both. The waiting total is therefore more than the phase rows' waiting added together, which count only from each phase's own start. The totals cover the PRD's current execution: after added phases are continued, or a run starts again after a missing folder, they count from that new start (assumption TOTAL-001).
- [ ] **AC-TOTAL-03 — The totals stay current.** While Kiln is connected and the PRD isn't complete, one of the two totals always goes up: running while a session is working, waiting otherwise, including when delivery work reopens a PRD that had finished. The header updates it at least once a minute without a reload. On Complete both are fixed. When the view loses Kiln, both stay at their last-known values, as the phase rows do (live-session control AC-LIVE-02).
- [ ] **AC-TOTAL-04 — The line matches the mockup.** The line's label, order, wording and its hairline above it match this change's mockup, in Kiln's existing style, and it wraps without overlapping at phone width (390 px). Sample names, times and counts are illustrative.

## Out of Scope

- An estimate of the time remaining, or a bar comparing running with waiting. A bar was drawn and dropped: it read as time left.
- Times shown in the terminal (`kiln status`) and on Phase detail, which are unchanged.
- The phase rows' own times (Kiln v1 AC-WATCH-01), which are unchanged.
