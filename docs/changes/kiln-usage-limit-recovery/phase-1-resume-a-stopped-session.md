# Phase 1: Resume a stopped session

**Closed:** 2026-10-22

**Parent PRD:** docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md
**Technical design:** docs/changes/kiln-usage-limit-recovery/technical-design.md — relevant sections: "Resume", "Interfaces" (HTTP API, Snapshot), "Data Models", "Screens", "Seam With Multi-Repo Delivery"

## Summary
The Needs you screen gets a Resume button, with an optional note to the session, that picks the stopped session back up inside Kiln and carries on through the plan, instead of the person reopening it by hand in a terminal.

## Acceptance criteria covered
AC-RESUME-01, AC-RESUME-02, AC-RESUME-03, AC-RESUME-04

## Out of scope for this phase
Recognizing a usage limit, the wait, Resume now, the "Resume after a usage limit" setting, the waiting screen and the usage-limit Needs you (Phase 2).

## Phase dependencies
None.

## Phase-specific notes
- Builds on the design's "Resume" with the after-any-other-stop prompt only; the after-a-usage-limit opening, which needs a recorded refusal, comes with Phase 2.
- Moves the record to schema 3 with the fields Resume needs (`person_resume`, `note`). Phase 2 adds the wait and refusal fields within schema 3 if no Kiln release lands between the two phases; if one does, Phase 2 bumps the schema again.
- The screen is `mockups/kiln-screen-needs-you-resume.html`.
