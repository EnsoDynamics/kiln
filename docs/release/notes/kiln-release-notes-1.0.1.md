# Kiln 1.0.1

A fix for live Claude Code sessions.

## Fixed

- **A phase no longer stays on Implementing after Claude has finished.** When Claude Code's auto-mode classifier rejected one of a session's tool calls, Kiln kept waiting for that call to finish, so it never closed the session after its last turn. The phase showed Implementing indefinitely and the run went no further. Kiln now treats any rejected tool call as finished, since it never ran, and the phase completes as usual.

## Changed

- **`kiln --version` says when a build is not a release.** A build packed or linked from a local checkout now prints `(dev build, <when it was built>)` after the version. Installed releases print the plain version, as before.

## Upgrade

```sh
npm install -g @ensodynamics/kiln@1.0.1
```

A run that is stuck on Implementing this way can be stopped and started again with `kiln run` after upgrading.
