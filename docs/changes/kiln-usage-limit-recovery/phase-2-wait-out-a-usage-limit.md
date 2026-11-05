# Phase 2: Wait out a usage limit

**Closed:** 2026-10-22

**Parent PRD:** docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md
**Technical design:** docs/changes/kiln-usage-limit-recovery/technical-design.md — relevant sections: "Claude Code Behaviors This Design Relies On", "Design Decisions", "Recognizing a Usage Limit", "The Wait", "Resume" (Resume now, the after-a-usage-limit prompt), "Interfaces", "Data Models", "Screens", "Testing Approach" (proof gate 5)

## Summary
When a session hits a Claude usage limit, Kiln waits instead of stopping, shows what it is waiting for and how to switch accounts, and resumes the session by itself once the signed-in account has usage left, with a per-PRD setting to turn this off.

## Acceptance criteria covered
AC-AUTO-01, AC-AUTO-02, AC-AUTO-03, AC-AUTO-04, AC-AUTO-05, AC-LIMIT-01, AC-LIMIT-02, AC-LIMIT-03, AC-LIMIT-04, AC-LIMIT-05

## Out of scope for this phase
Resume on Needs you and its note (Phase 1, which this phase reuses).

## Phase dependencies
1 (the resume command, its lock and its prompts). Proof gate 5 no longer gates the build: on 2026-10-22 no account was near a limit, and Doug chose to build against the SDK's typed refusal and prove it in live use afterwards (the design's "Testing Approach").

## Phase-specific notes
- The screens are `mockups/kiln-screen-waiting-for-usage.html` and `mockups/kiln-screen-needs-you-usage-limit.html`.

## Carried forward from Phase 1
- Phase 1 built the design's resume command for Resume at Needs you only: `Engine.resume()` runs the stop's check, then `resumeSession(phaseKey, person)` resumes with cause `person_resume`, holding `checking` from the press until the run starts and clearing the stop there. It did not build the design's account refresh before resuming (awaited, 30 s at most) or `run.account`; this phase adds both, with `limit_resume`, the after-a-usage-limit opening, Resume now (no note) and the end-of-wait resume through the same path.
- Schema 3 is in place with no migrated fields; `resumeAfterUsageLimit: true` for an existing record is this phase's to add to `migrateRecord`.

## Pending human actions
- Proof gate 5, in live use after this phase ships: the first real usage limit a Kiln session hits is the proof of items 1 and 2; if Kiln doesn't wait or resume as the PRD says, Doug brings it back. `node scripts/exploration/proof-gate-5-usage-limit.mjs --capture`, run while an account is at a limit, records the fixtures (`--switch-account` records item 3).
