# Phase 4: Green release candidate

**Parent PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)
**Technical design:** [technical design](kiln-public-release-readiness-technical-design.md) — Design Decisions rows Test ports, Run that stops before publishing; Repository, Package and Documentation Changes (Candidate scan, CI evidence).
**Phase plan:** [Execution order](kiln-public-release-readiness-phase-plan.md)

## Summary
Tests that listen on network ports get them from the operating system, the release candidate's development CI ends green with every rerun recorded, the candidate's files and history are scanned, and the full macOS and Windows candidate checks run once on the release pull request into `main`.

## Acceptance criteria covered
AC-CI-01, AC-CI-02, AC-REPO-07, AC-CI-03.

## Out of scope for this phase
The release act: merging to `main`, enabling publication, publishing, tags, visibility and branch protection (PRD Out of Scope).

## Phase dependencies
1, 2 and 3 (AC-CI-03 starts the candidate checks only after every other criterion is met).

## Phase-specific notes
- Develop CI was last red at `1b8cc28` (2026-11-03), with no run after it.
- This phase opens the release pull request into `main` itself once every other criterion is met, and never merges it; the repository's `AGENTS.md` governs everything after it.
- The candidate scan stops for Doug only on a real concern (AC-REPO-07); otherwise it records a clean result and moves on.
