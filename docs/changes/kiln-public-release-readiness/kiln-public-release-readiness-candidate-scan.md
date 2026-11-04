# Kiln public release readiness — candidate scan

**PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)

## Remote branches (AC-REPO-05)

Listed on 2026-11-04, before any deletion, against `origin/develop` at `9237508`. "Merged" means the branch tip is an ancestor of `develop`. No branch has an open pull request. Every branch below except `main` and `develop` is to be deleted from GitHub. The two abandoned branches' tips are recorded so they stay recoverable from a local clone's objects.

| Branch | Disposition |
|---|---|
| `main` | Kept |
| `develop` | Kept |
| `feat/resume-overview` | Merged; delete |
| `feature/codex-cleanup-diagnostics` | Merged; delete |
| `feature/codex-compaction-recovery` | Merged; delete |
| `feature/usage-resume-countdown` | Merged; delete |
| `feature/wait-for-subprocesses` | Merged; delete |
| `feature/workspace-uncertainty` | Merged; delete |
| `fix/claude-optional-five-hour-limit` | Merged; delete |
| `wt/early-merge-authorization` | Merged; delete |
| `feature/ui-clarity` | Abandoned, named in the PRD (3 commits not on `develop`, tip `026c96e`); delete, with its local branch and worktree |
| `wt/completiona-kiln-design` | Abandoned, named in the PRD (1 commit not on `develop`, tip `fe4c279`); delete, with its local branch and worktree |

All ten were deleted from GitHub on 2026-11-04, with the two abandoned branches' local worktrees and branches; GitHub now holds only `main` and `develop`.
