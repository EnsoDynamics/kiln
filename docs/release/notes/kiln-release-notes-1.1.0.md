# Kiln 1.1.0

Kiln now recovers a run whose worktree has gone missing, instead of reporting a stale status
for a folder that no longer exists.

## Added

- **A Folder missing page.** When a saved run's worktree is deleted, moved or replaced, Kiln
  stops and says so, in the terminal and in the browser, before checking or starting anything.
  It shows which folder is gone, what it can still find about the branch and the plan, and
  what it couldn't check.
- **Set the run up again.** The page offers the same settings as a first Start. Start a fresh
  execution from the base branch, or make a new worktree on the existing feature branch and
  carry on from the first unfinished phase, resuming an interrupted session where it can.
  Nothing changes until you press Start, and any work that would be left behind is named first.
- **A folder put back by hand is found.** Restore the folder yourself and Check again picks
  the run back up.

## Fixed

- **`kiln status` no longer fails on old saved records** that can't affect the work it reports.
- **A repeated check name no longer blanks the Needs you page.**
- **Every stop that needs a person now prints a line in the terminal**, including one raised
  before the browser view is ready.

## Changed

- **Every push to `main` is now a release.** The separate publication setting is gone. This
  affects Kiln's own release process only.

## Upgrade

```sh
npm install -g @ensodynamics/kiln@1.1.0
```
