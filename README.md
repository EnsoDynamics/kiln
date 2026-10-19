# Kiln

Kiln runs an [Enso Method](https://github.com/EnsoDynamics/enso-method) phase plan end to end. Given an already-written PRD, technical design and phase plan, it starts a fresh Claude Code session for each phase, checks in Git that each phase landed, and shows progress in a local web view. The sessions do the implementation, quality gates and Git delivery through the Enso Method skills, unchanged; Kiln owns the order and the visibility. When a phase doesn't land, Kiln hands it back to you with the command to resume that exact session.

The Enso Method works without Kiln. Kiln automates the loop a person otherwise runs by hand.

## Install

Kiln runs on macOS, Linux and Windows, with Node 22 or later, Git 2.29 or later, [Claude Code](https://docs.claude.com/en/docs/claude-code) signed in with the [Enso Method](https://github.com/EnsoDynamics/enso-method) skills installed, and the [GitHub CLI](https://cli.github.com/) signed in. From its first release on npm, one command installs the `kiln` command and its browser view:

```
npm install -g @ensodynamics/kiln
```

Until that release, install it from a clone of this repository, exactly as npm will publish it:

```
npm ci
npm pack
npm install -g ./ensodynamics-kiln-1.0.0.tgz
```

## Run

In a repository whose PRD has been refined and split into phases with the Enso Method:

```
kiln run docs/prds/<name>
```

The path is the PRD's directory (`docs/prds/<name>/` or `docs/changes/<name>/`) or the PRD file in it.

1. Kiln checks the documents and opens its browser view on what it found: the phase documents, the base branch and the feature branch it will use.
2. Confirm the PRD has been refined, choose the model and effort, and press **Start**.
3. Kiln runs one Claude Code session per phase, checks in Git that each phase landed, and carries the feature to one pull request. Keep its terminal open; Ctrl+C interrupts the current phase.
4. When a phase doesn't land, the view shows **Needs you** with what's missing and a command that reopens that exact session. Finish the phase there or any other way, then press **Check again** and Kiln carries on.

`kiln run` again, after Ctrl+C or a restart, picks the feature up wherever it stopped.

`kiln run` is the only command; everything else happens in the browser view. `kiln --help` shows the usage.

## Requirements

- [Kiln v1 PRD](docs/prds/kiln-v1/kiln-v1-prd.md): what v1 delivers and its acceptance criteria.

## Design documents

- [Architecture proposal](docs/design/kiln-architecture-proposal.md): principles, v1 scope, the done check, the stop path, and open questions.
- [Interface scenarios](docs/design/kiln-interface-scenarios.md) and the [mockups](docs/design/mockups/): the v1 screens, which are the design of record.
- [Kiln ideas after v1](docs/design/kiln-after-v1-ideas.md): not part of v1; ideas deliberately left out.

## Development

Node 22 or later and Git 2.29 or later. `npm install`, then `npm run verify`: dependency audit, lint, typecheck, the unit tests, and the integration tests, which build `dist/` first and run real `git` against temporary repositories. `npm run test:package` packs Kiln, installs the tarball globally into a temporary folder and runs that `kiln`. CI runs both on macOS, Linux and Windows. Releases are published to npm by CI from a version tag: [release steps](docs/release/kiln-npm-release-steps.md).
