# Kiln agent instructions

These instructions apply only to this repository.

Engineering standards: commercesong-engineering-standards

## The Enso Method stands alone

Kiln is an optional add-on that drives the implementation half of the Enso Method.
Everything Kiln does, a person can do by hand with the same skills in any coding agent.
Check both rules before proposing or building a change to how Kiln orders, stops, audits
or hands off work, and before proposing a change to an Enso Method skill because of
something seen in a Kiln run:

- The method has no step that depends on Kiln, and Kiln writes nothing into the
  repository that the skills don't already write.
- A skill change is proposed on its own, and only when it also improves running the
  method by hand. A need that only Kiln has is met in Kiln.

These are principles 1 and 2 of the
[Kiln architecture proposal](docs/design/kiln-architecture-proposal.md); its Principles
section holds the rest. Read only that section: the remainder is the v1 proposal from
autumn 2026, kept as history, and later PRDs under `docs/changes/` replaced parts of it.

## The changelog

`CHANGELOG.md` is the one record of what changed in each release, and each GitHub Release
shows its section. Work that changes what a Kiln user sees adds a short entry under
`## [Unreleased]` when it merges to `develop`, under `Added`, `Changed`, `Fixed` or
`Removed`, written for users rather than for someone reading the diff. Internal refactors,
tests, CI and documentation-only changes get no entry. Never write a version number for
unreleased work: `npm run release:prepare` turns Unreleased into the version's section.

## Preparing a release

When Doug asks to prepare Kiln for release, include version preparation without
requiring him to request a version bump separately. Read
[Kiln npm release setup and operation](docs/release/kiln-npm-release-steps.md)
and inspect the changes since the last release, starting from `CHANGELOG.md`'s
Unreleased section, before choosing the version:

- **Patch** (`1.0.0` → `1.0.1`): compatible fixes and small improvements that do
  not add public functionality. Run `npm run release:prepare`.
- **Minor** (`1.0.0` → `1.1.0`): new functionality that preserves existing CLI,
  configuration, saved-data and other supported public behavior. Run
  `npm run release:prepare -- minor`.
- **Major** (`1.0.0` → `2.0.0`): incompatible changes to supported public behavior.
  Explain the breaking change and migration impact before running
  `npm run release:prepare -- major`. Do not release a breaking change as a patch.

Honor an explicit version choice from Doug. Otherwise choose the appropriate
increment from the actual changes and state the choice and reason. Patch numbers
can exceed 99; their size alone is never a reason to increment minor or major.

The default command preserves an already-prepared higher version and the first
unpublished `1.0.0`. Explicit `patch`, `minor` and `major` arguments always bump
the current version, so inspect existing preparation before using them and do
not repeat them for the same candidate. If a suitable version is already
prepared, use the default command to validate/retain it. If it is too low for
the intended release, choose the correct target intentionally and keep both
package files consistent, as described in the release guide.

Review changes to `package.json` and `package-lock.json` together and include
them in the release candidate under the session's commit authorization. Run
the release guide's required verification, including `npm run test:release`,
before delivery. Do not bump the version for every development commit.

Ensure the local pre-push gate is installed with `npm run hooks:install`,
following the guide's worktree rules. The hook checks committed Git objects;
it does not increment versions or rewrite commits. GitHub's early release
preflight remains authoritative and runs before expensive platform checks.
Never bypass either gate to force a release through.

A request to **prepare** a release does not authorize merging to `main`,
changing repository visibility, creating release tags
or publishing to npm. Follow the release guide and Doug's explicit release
authorization. Publication goes through GitHub Actions.
