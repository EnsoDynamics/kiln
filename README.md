# Kiln

Kiln runs an [Enso Method](https://github.com/EnsoDynamics/enso-method) phase plan end to end. Given an already-written PRD, technical design and phase plan, it starts a fresh Claude Code session for each phase, checks in Git that each phase landed, and shows progress in a local web view. The sessions do the implementation, quality gates and Git delivery through the Enso Method skills, unchanged; Kiln owns the order and the visibility. When a phase doesn't land, Kiln hands it back to you with the command to resume that exact session.

The Enso Method works without Kiln. Kiln automates the loop a person otherwise runs by hand.

Status: design stage. There is no runner code yet.

## Requirements

- [Kiln v1 PRD](docs/prds/kiln-v1/kiln-v1-prd.md): what v1 delivers and its acceptance criteria.

## Design documents

- [Architecture proposal](docs/design/kiln-architecture-proposal.md): principles, v1 scope, the done check, the stop path, and open questions.
- [Interface scenarios](docs/design/kiln-interface-scenarios.md): the screens, and which ones are in v1.
- [Kiln ideas after v1](docs/design/kiln-after-v1-ideas.md): not part of v1. Parallel phases, the Codex desktop handoff, and other ideas deliberately left out.
- [Computer-use preflight prompt](docs/design/kiln-computer-use-preflight-prompt.md): after v1. The check that finds phases needing native desktop control before a run starts.
