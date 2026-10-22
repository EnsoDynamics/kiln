# Phase 2: Stop a session that works outside the workspace

**Parent PRD:** docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md
**Technical design:** docs/changes/kiln-multi-repo-delivery/technical-design.md — relevant sections: "Claude Code Behaviors This Design Relies On" ("Transcripts", "Subagent worktrees", "Shell tools"), "Sessions" (Flags), "The Done Check" ("Stayed in the workspace"), "The Pull Requests" (the check), "Interfaces" (HTTP API, Snapshot), "Data Models", "Screens", "Seam With Usage-Limit Recovery"

## Summary
Kiln reads each session's Claude Code transcript, its subagents' included, and when it shows the session editing files or changing Git state in a checkout outside the workspace, such as a repository's own checkout, the phase stops at Needs you instead of going on. Needs you names each change and where, gives a prompt to bring the work into the workspace, and clears once the person ticks that they have dealt with it. This applies to one-repository PRDs as well.

## Acceptance criteria covered
AC-OUTSIDE-01, AC-OUTSIDE-02, AC-OUTSIDE-03, AC-OUTSIDE-04, AC-PRS-06, AC-SPACE-03, AC-SHOW-01 (also applies to this phase's work)

## Out of scope for this phase
Usage-limit recovery's own resume points: that change isn't built, so this phase builds only what the design's "Seam With Usage-Limit Recovery" leaves to Kiln today. Real runs and Windows (Phase 3).

## Phase dependencies
1 (the workspace and its repositories, the per-repository done and pull-request checks, `kiln add-repository` for the prompt's add-first line, and Needs you facts named by repository)

## Phase-specific notes
- `--disallowedTools PowerShell` on every launch, resumed runs included (design, "Sessions" Flags), is built here: it exists so every shell command is one this check reads.
- Each v1 technical design section this phase's work replaces gets its `Superseded in part by:` line in the feature commit.
