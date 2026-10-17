# Kiln

Kiln runs an [Enso Method](https://github.com/EnsoDynamics/enso-method) phase plan end to end. Given an already-written PRD, technical design and phase plan, it starts a fresh Claude Code session for each phase, checks in Git that each phase landed, and shows progress in a local web view. The sessions do the implementation, quality gates and Git delivery through the Enso Method skills, unchanged; Kiln owns the order and the visibility. When a phase doesn't land, Kiln hands it back to you with the command to resume that exact session.

The Enso Method works without Kiln. Kiln automates the loop a person otherwise runs by hand.

Status: in development. `kiln run <PRD directory>` checks a PRD's documents and phase plan; it doesn't run phases yet.

## Requirements

- [Kiln v1 PRD](docs/prds/kiln-v1/kiln-v1-prd.md): what v1 delivers and its acceptance criteria.

## Design documents

- [Architecture proposal](docs/design/kiln-architecture-proposal.md): principles, v1 scope, the done check, the stop path, and open questions.
- [Interface scenarios](docs/design/kiln-interface-scenarios.md) and the [mockups](docs/design/mockups/): the v1 screens, which are the design of record.
- [Kiln ideas after v1](docs/design/kiln-after-v1-ideas.md): not part of v1; ideas deliberately left out.

## Development

Node 22 or later and Git 2.29 or later. `npm install`, then `npm run verify`: dependency audit, lint, typecheck, the unit tests, and the integration tests, which build `dist/` first and run real `git` against temporary repositories. CI runs the same on macOS, Linux and Windows.
