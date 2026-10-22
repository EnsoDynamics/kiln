# Phase 4: Complete the fresh-session prompt after an addition, and three messages

**Added by delivery audit:** 2026-10-22, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md
**Technical design:** docs/changes/kiln-multi-repo-delivery/technical-design.md — relevant sections: "Found beside the PRD's repository (AC-REPO-02)", "In the engine (AC-ADD-01, AC-ADD-02, AC-ADD-03)", "Named after Start (AC-ADD-04)", "Sessions" (Working directory, Fresh-session prompt and resume command)

## Summary
When a one-repository PRD's session adds a repository and then stops, the prompt for picking the phase up by hand names the added repository and its worktree too. The terminal prints the "added" line when `kiln run` retries an addition and it succeeds. Two failure messages give the reason the PRD asks for.

## Acceptance criteria covered
AC-SPACE-04 (completes it; owned by phase 1), AC-ADD-03 (completes it; owned by phase 1), AC-ADD-02 (completes it; owned by phase 1), AC-REPO-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-SPACE-04:** a one-repository PRD whose session added a repository mid-phase and then stopped at Needs you gets the one-repository fresh-session prompt. That prompt names only the PRD's worktree, not the workspace or the added repository's worktree. `Engine.phasePromptValues` (`src/engine/engine.ts`) picks the workspace form by `folder !== this.worktreePath`, and that session's `workingDirectory` is the PRD's worktree. It is reached from `snapshot.ts:needsYouView` → `freshSessionPrompt`. The resume command in this case is already right.
- **AC-ADD-03:** the `<time> <phase id> <title> added <repository>` line isn't printed when `kiln run` retries an AC-ADD-04 addition and it succeeds. `Engine.decide` sets `quiet`, and `Engine.emit` drops every event while quiet. The path is `decideQuietly` → `recheckStop` (plan stop) → `addNamedRepositories` → `finishAdd`, and the ● line that follows doesn't mention the addition.
- **AC-ADD-02:** when a failed add left Kiln's own branch and the retry can't reach origin, the session is told "That branch already exists in <name>…" instead of the failed check's words, "Couldn’t reach origin: …". In `Engine.addOne`, `isOwnBranchAt` returns false with no origin listing, so check 2 refuses on Kiln's own branch.
- **AC-REPO-02:** a named repository whose origin isn't on GitHub fails with `<name>: origin isn’t on GitHub: <url>`, which doesn't name the folder Kiln looked in. The PRD asks for both. The message is in `repositories.ts:findRepository`, and the design's table row ("Found beside the PRD's repository", On GitHub) gives the same wording. Correct the row with the code.

## Phase dependencies
1 (the workspace, `kiln add-repository`, the start checks and Needs you's prompts); 2 (Needs you's resume and fresh-session paths as Stayed in the workspace left them)
