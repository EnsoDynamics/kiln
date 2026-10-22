# Phase 2: Wait out a usage limit

**Parent PRD:** docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md
**Technical design:** docs/changes/kiln-usage-limit-recovery/technical-design.md — relevant sections: "Claude Code Behaviors This Design Relies On", "Design Decisions", "Recognizing a Usage Limit", "The Wait", "Resume" (Resume now, the after-a-usage-limit prompt), "Interfaces", "Data Models", "Screens", "Testing Approach" (proof gate 5)

## Summary
When a session hits a Claude usage limit, Kiln waits instead of stopping, shows what it is waiting for and how to switch accounts, and resumes the session by itself once the signed-in account has usage left, with a per-PRD setting to turn this off.

## Acceptance criteria covered
AC-AUTO-01, AC-AUTO-02, AC-AUTO-03, AC-AUTO-04, AC-AUTO-05, AC-LIMIT-01, AC-LIMIT-02, AC-LIMIT-03, AC-LIMIT-04, AC-LIMIT-05

## Out of scope for this phase
Resume on Needs you and its note (Phase 1, which this phase reuses).

## Phase dependencies
1 (the resume command, its lock and its prompts). Proof gate 5 items 1 and 2 recorded as fixtures (the design's "Testing Approach"): they need a Claude account that is at a usage limit, so a person runs them or hands the moment to this phase's session. Item 3 gates only the switch-account wording.

## Phase-specific notes
- The screens are `mockups/kiln-screen-waiting-for-usage.html` and `mockups/kiln-screen-needs-you-usage-limit.html`.
