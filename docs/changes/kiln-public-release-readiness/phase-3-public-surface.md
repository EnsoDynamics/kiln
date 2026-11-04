# Phase 3: Public surface

**Parent PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)
**Technical design:** [technical design](kiln-public-release-readiness-technical-design.md) — Design Decisions rows Text help, `--version`, Usage errors, Source maps, Clean builds, Release notes, Run that stops before publishing; Interfaces (Top-level text help); Integration Points (GitHub, `enso-method-website` repository, npm); Repository, Package and Documentation Changes (all bullets except Candidate scan and CI evidence).
**Phase plan:** [Execution order](kiln-public-release-readiness-phase-plan.md)
**Repositories:** kiln, enso-method-website

## Summary
A person typing `kiln --help` sees a one-screen guide and `kiln --version` works; the npm package carries its homepage, issue link, author and keywords and no source maps; the repository gains its contribution, security and issue files, live branches only and a release guide free of credential details; the README and the website's Kiln page state the minimums the code enforces; and every release needs written notes.

## Acceptance criteria covered
AC-HELP-01, AC-HELP-02, AC-HELP-03, AC-HELP-04, AC-PKG-01, AC-PKG-02, AC-PKG-03, AC-REPO-01, AC-REPO-02, AC-REPO-03, AC-REPO-04, AC-REPO-05, AC-REPO-06, AC-SYNC-01, AC-SYNC-02, AC-NOTES-01, AC-NOTES-02.

## Out of scope for this phase
Test port fixes, the candidate scan, green candidate CI and the candidate checks (Phase 4). Deploying the website page (PRD Out of Scope).

## Phase dependencies
1 (the minimums module the README test and website state); 2 (live messaging true on every supported Claude Code, for AC-SYNC-02).

## Phase-specific notes
- AC-NOTES-01's proof by the release pull request's checks lands with that run in Phase 4; this phase proves the workflow definition and the preflight.
- Branch deletion (AC-REPO-05) stops for Doug on any branch the PRD doesn't name or that isn't verified merged or equivalent.
