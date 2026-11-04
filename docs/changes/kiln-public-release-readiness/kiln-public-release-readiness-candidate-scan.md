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

## Candidate scan (AC-REPO-07)

Run on 2026-11-04 against the release candidate's code at `a951369` on `develop` (the commits after it change only this directory), covering all 877 tracked files and the full history of every branch (gitleaks read 426 commits; merge commits add no changes of their own).

- **Secrets:** `gitleaks git` over the history and `gitleaks dir` over the files, with the repository's `.gitleaks.toml`, found nothing. Before that configuration the same scans reported 1,374 generic-API-key matches, every one a false positive: Claude message IDs in recorded proof fixtures, content hashes keyed by image and section names in the billing stakeholder review page, and a phase file name in a test string. The configuration allows exactly those, for that one rule.
- **Client names:** the maintainer's client-terms list matches nothing in the tracked files. It matches 244 commits in the history; none is a credential, so they stay under the decision to keep the history.
- **Personal paths:** the tracked files hold only placeholder home directories in tests, fixtures and one design document (`/home/person`, `/home/me`, `/home/alex`, `C:\Users\alex`, `C:\Users\test`). No maintainer path appears in the files or the history.
- **Package:** `npm pack --dry-run` lists 191 files: `dist/` (compiled JavaScript and the browser view), `prompts/`, `README.md`, `LICENSE` and `package.json`. No source maps, tests, fixtures or documentation beyond the README.

Nothing needed fixing or bringing to Doug.
