# Phase 1: Build preflight

**Parent PRD:** [Kiln Build Preflight](kiln-build-preflight-prd.md)
**Technical design:** [Kiln Build Preflight technical design](kiln-build-preflight-technical-design.md) — relevant sections: "When the Preflight Is Due", "The Preflight Session", "Reading the Result", "The Preflight Stop", "Interfaces", "Display Contract" (all but the marker, card and early-merge bullets), "Data Models", "Upgrade", "Changes to Earlier Designs"

## Summary
Before a run starts work, Kiln runs the Enso Method's `build-preflight` skill in a session of its own, shows it as a Preflight row in the plan, goes straight on when the report says ready or gives no report, and stops at Needs you with the report's numbered items when it does not, offering only Check Preflight again and Mark complete.

## Acceptance criteria covered
AC-PREFLIGHT-01, AC-PREFLIGHT-02, AC-PREFLIGHT-03, AC-PREFLIGHT-05, AC-PREFLIGHT-06, AC-PREFLIGHT-08

## Out of scope for this phase
Reading and showing the `**Attended:**` and `**Early merge:**` phase-document lines: the Needs you there marker, the planned-as-needing-you card and the early-merge warning (Phase 2).

## Phase dependencies
None.

## Phase-specific notes
This phase moves the persisted schema to 22 with the preflight state and new kind values only; Phase 2 adds `attended` and `earlyMerge` to the same schema 22 before release. The design's Delivery spend (real preflight sessions against a small fixture repository) belongs to this phase.
