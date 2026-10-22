# Phase 1: One workspace across repositories, through to a pull request in each

**Parent PRD:** docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md
**Technical design:** docs/changes/kiln-multi-repo-delivery/technical-design.md — relevant sections: "Claude Code Behaviors This Design Relies On" ("Per-repository instructions", "Write limits"), "The PRD's Repositories", "The Workspace", "Adding a Repository", "Sessions", "The Done Check" (Committed and Pushed), "The Pull Requests", "Interfaces", "Data Models", "Screens"

## Summary
Kiln delivers a PRD whose phase documents name other repositories beside the PRD's own: it checks each one before Start, makes the feature branch and a worktree of every repository in one workspace folder, runs each phase's session across them, judges Committed and Pushed in every repository, and ends with one pull request in each repository that changed, linked to the others. A session that finds it needs a repository nobody named asks Kiln for it with `kiln add-repository` and carries on.

## Acceptance criteria covered
AC-REPO-01, AC-REPO-02, AC-REPO-03, AC-SPACE-01, AC-SPACE-02, AC-SPACE-04, AC-SPACE-05, AC-ADD-01, AC-ADD-02, AC-ADD-03, AC-ADD-04, AC-CHECK-01, AC-CHECK-02, AC-PRS-02, AC-PRS-03, AC-PRS-04, AC-PRS-05, AC-SHOW-01

## Out of scope for this phase
The fourth check, Stayed in the workspace, with its confirmation, its Needs you screen, its prompt, its place in the pull-request check and in interruptions, and the `--disallowedTools PowerShell` launch flag (Phase 2); AC-SPACE-03 proved as a whole (Phase 2); real runs and Windows (Phase 3).

## Phase dependencies
None.

## Phase-specific notes
- A one-repository PRD keeps v1's behavior throughout this phase, a schema 1 record included (the schema 2 migration is built here). Phase 2 proves AC-SPACE-03 once its done-check row exists.
- Human decision this phase needs: the technical design's first Open Question, whether Documents found tells the person that sessions don't follow each repository's `.claude/settings.json` or hooks. The line isn't drawn and isn't in AC-REPO-03, so Doug rules on it before this phase closes.
- The design's second Open Question, which prompts carry the CLAUDE.md sentence, is this phase's call: decide it while building the prompts and record the choice in the design.
- Each v1 technical design section this phase's work replaces gets its `Superseded in part by:` line in the feature commit (design, end of "Design Decisions").
