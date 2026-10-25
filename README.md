# Kiln

Kiln runs an [Enso Method](https://github.com/EnsoDynamics/enso-method) phase plan end to end. Given an already-written PRD, technical design and phase plan, it starts a fresh Claude Code or Codex session for each phase, checks in Git that each phase landed, and shows progress in a local web view. The sessions do the implementation, quality gates and Git delivery through the Enso Method skills, unchanged; Kiln owns the order and the visibility. When a phase doesn't land, Kiln hands it back to you with the command to resume that exact session.

The Enso Method works without Kiln. Kiln automates the loop a person otherwise runs by hand.

## Install

Kiln requires Node 22 or later, Git 2.29 or later, the [GitHub CLI](https://cli.github.com/) signed in, and either [Claude Code](https://docs.claude.com/en/docs/claude-code) or Codex signed in with the [Enso Method](https://github.com/EnsoDynamics/enso-method) skills installed. Codex currently requires **codex-cli 0.162.1**, authenticated through ChatGPT; other versions are rejected. See [Codex prerequisites and validation limits](docs/release/kiln-codex-macos-validation.md).

macOS is the natively validated platform. Linux and Windows remain best-effort targets: their native agent, console and sleep behavior is untested, and compatibility issues will be investigated from user reports. Native Windows/Linux proof is not a first-release gate. The [public release readiness review](docs/release/kiln-public-release-readiness-review.md) tracks validation evidence and the remaining publication gates.

From its first release on npm, one command installs the `kiln` command and its browser view:

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
2. Confirm the PRD has been refined, choose the agent, model and effort, and press **Start**.
3. Kiln runs one session per phase and checks in Git that each phase landed. Work can span several repositories, with a pull request for each. Whole-PRD delivery and test audits run before completion. Keep its terminal open; Ctrl+C interrupts the current session.
4. When a phase doesn't land, the view shows **Needs you** with what's missing and a command that reopens that exact session. Finish the phase there or any other way, then press **Check again** and Kiln carries on.

`kiln run` again, after Ctrl+C or a restart, picks the feature up wherever it stopped.

By default, work stays on feature branches for review. Before Start, you can separately authorize exact development targets: Kiln may then merge and deploy to those approved development environments. Production deployments and destructive actions remain unauthorized. Review the delivery authority shown on Documents found before starting.

`kiln run` is the user entry point; the browser view provides the controls. Sessions also use helper commands for repository setup, audit evidence and delivery. `kiln --help` shows the usage.

## Requirements

- [Kiln v1 PRD](docs/prds/kiln-v1/kiln-v1-prd.md): what v1 delivers and its acceptance criteria.

## Design documents

- [Architecture proposal](docs/design/kiln-architecture-proposal.md): principles, v1 scope, the done check, the stop path, and open questions.
- [Interface scenarios](docs/design/kiln-interface-scenarios.md) and the [mockups](docs/design/mockups/): the v1 screens, which are the design of record.
- [Kiln roadmap](docs/kiln-roadmap.md): what comes after v1, in order.
- [Kiln ideas after v1](docs/design/kiln-after-v1-ideas.md): not part of v1; ideas deliberately left out.

## Development

Node 22 or later and Git 2.29 or later. `npm install`, then `npm run verify`: dependency audit, lint, typecheck, the unit tests, and the integration tests, which build `dist/` first and run real `git` against temporary repositories. `npm run test:package` packs Kiln, installs the tarball globally into a temporary folder and runs that `kiln`. CI requires both on macOS, plus successful builds and package archives on Linux and Windows; Linux/Windows runtime behavior remains unconfirmed. Releases are published to npm by CI from a version tag: [release steps](docs/release/kiln-npm-release-steps.md).

## License

Kiln is [MIT licensed](LICENSE), copyright Enso Dynamics. Bundled browser libraries and fonts retain their own licenses; their copyright and license texts are in [Kiln third-party notices](view/public/kiln-third-party-notices.txt), also shipped as `dist/view/kiln-third-party-notices.txt` in the npm package.
