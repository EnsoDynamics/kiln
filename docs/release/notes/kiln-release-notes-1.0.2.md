# Kiln 1.0.2

Fixes for live Claude Code sessions that finished their work but never closed. Kiln 1.0.1 was
prepared but not published; its changes are included here.

## Fixed

- **A phase no longer stays on Implementing after Claude has finished.** Kiln waited for a
  report from its own hook that each tool call had finished before it closed a session. When
  that report never came, the session stayed open after Claude's final turn, the phase showed
  Implementing indefinitely, and the run went no further. Kiln now closes a session once Claude
  has given its final result and answered every message, as designed. Reports of finished tool
  calls are still required before you take over a session from the terminal.
- **The report a tool call has finished no longer goes missing.** When two of Kiln's hooks
  reached its lock at the same moment, one could fail and lose that report.
- **A tool call the auto-mode classifier rejects no longer holds the session open.** Kiln now
  treats any rejected tool call as finished, since it never ran.
- **Taking over a long session is no longer refused.** Kiln kept every process a session had
  ever started on its list, even after it ended, so a long session passed the list's limit and
  Pause & take over stayed blocked. Ended processes now leave the list.

## Changed

- **`kiln --version` says when a build is not a release.** A build packed or linked from a local
  checkout now prints `(dev build, <when it was built>)` after the version. Installed releases
  print the plain version, as before.

## Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.2
```

A run stuck on Implementing this way can be stopped and started again with `kiln run` after
upgrading.
