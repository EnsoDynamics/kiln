# Kiln 1.0.0

The first public release of Kiln.

Kiln builds a PRD you already planned with the [Enso Method](https://github.com/EnsoDynamics/enso-method), one phase after another, with nobody sitting in the loop. Every phase gets a fresh Claude Code or Codex session. Git confirms the phase landed before the next one starts. When the last phase closes, delivery and test audits check the whole PRD, and the work waits for you as pull requests. A local browser view shows each session live, and you come back when it's done or when a phase genuinely needs you.

## Install

```sh
npm install -g @ensodynamics/kiln
kiln --help
```

Then, from the root of a repository whose PRD has been planned and split into phases:

```sh
kiln run docs/prds/<name>
```

## Requirements

- Node.js 22.15 or later and Git 2.29 or later.
- GitHub CLI signed in to github.com, with the repository's `origin` on GitHub.
- Claude Code 2.1.311 or later, or Codex 0.162.1 or later signed in through ChatGPT, with the Enso Method skills installed in it. Codex on Windows also needs PowerShell 7.5.2 or later.
- macOS is validated. Linux and Windows are best effort.

Kiln accepts every agent version at or above these minimums. When a newer Claude Code or Codex changes what live messaging, takeover or Codex command evidence relies on, that feature turns off with a compatibility notice and the rest of the run carries on.

## Reporting problems

Open an issue at [github.com/EnsoDynamics/kiln/issues](https://github.com/EnsoDynamics/kiln/issues). Report a suspected security vulnerability privately, as [SECURITY.md](https://github.com/EnsoDynamics/kiln/blob/main/SECURITY.md) describes, not in a public issue.

More at [ensomethod.org/kiln](https://ensomethod.org/kiln/).
