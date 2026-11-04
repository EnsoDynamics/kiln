# Phase 1: Version minimums and tolerant readers

**Closed:** 2026-11-03

**Parent PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)
**Technical design:** [technical design](kiln-public-release-readiness-technical-design.md) — Design Decisions rows Where minimums live, Version comparison, Start checks for versions, Billing gate, Billing recognition, Billing contract identifier, Codex compaction, Codex audit envelopes, Codex tool inputs, PowerShell (Codex on Windows), Compatibility notices, Kiln's own dependencies, Proof scripts; Interfaces (Agent tooling minimums, Version problem wording); Data Models (CompatibilityNotice); Proving Features on Newer Agent Versions (billing column, Codex command evidence, stand-in paragraph); Open Questions 1 and 2.
**Phase plan:** [Execution order](kiln-public-release-readiness-phase-plan.md)

## Summary
Kiln accepts any Claude Code, Codex, Node.js, Git and PowerShell at or above a stated minimum, outside live control. Billing details work on current Claude Code and an approval survives an update, newer Codex histories still yield command receipts, and a real incompatibility is reported as a compatibility notice in the browser view and `kiln status`.

## Acceptance criteria covered
AC-AGENT-02, AC-AGENT-04, AC-AGENT-05, AC-AGENT-07.

AC-AGENT-01 (applies to this phase's work; owned by Phase 2, where the standing guard lands once the last pin is gone).

## Out of scope for this phase
Live control eligibility, live message and takeover hook recognition, live launch arguments, live notices and the standing guard (Phase 2). Help, package, repository and documentation work, including the README requirements (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
- Open Question 1 decides the Claude Code minimum: the passive boundary test against 2.1.311 runs here. If billing fails there, the minimum moves before Phases 2 and 3 state it.
- Mockup state 3 (Codex command evidence notice) is this phase's screen; the Agent compatibility panel and the status `compatibility` field are built here for Phase 2 to reuse.
