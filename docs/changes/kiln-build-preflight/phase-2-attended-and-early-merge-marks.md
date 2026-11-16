# Phase 2: Attended and early-merge marks

**Closed:** 2026-11-15

**Parent PRD:** [Kiln Build Preflight](kiln-build-preflight-prd.md)
**Technical design:** [Kiln Build Preflight technical design](kiln-build-preflight-technical-design.md) — relevant sections: "Phase Document Lines", "Interfaces" (`attended`, `earlyMerge`), "Display Contract" (Needs you there marker, planned-as-needing-you card, early-merge warning), "Upgrade"

## Summary
Kiln reads each phase document's `**Attended:**` and `**Early merge:**` lines and shows them as a heads-up only: a Needs you there marker beside a marked phase in the plan, a card at the top of Needs you when a marked phase stops, and a warning beneath Allow early merges naming the phases that would stop the run while the box is off.

## Acceptance criteria covered
AC-ATTEND-01, AC-ATTEND-03, AC-ATTEND-04, AC-ATTEND-05

## Out of scope for this phase
Everything about the preflight itself (Phase 1).

## Phase dependencies
1 (the schema 23 migration these recorded-plan fields join).
