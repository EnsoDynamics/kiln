# Kiln public release readiness — CI reruns

**PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)

## Development CI on the release candidate (AC-CI-02)

The release candidate's development CI is the push run of `f64ce40`, the last commit that changed a path CI watches: [run 41914078101](https://github.com/EnsoDynamics/kiln/actions/runs/41914078101), 2026-11-04. It ended green on its first attempt; no job or test needed a rerun.

Before Phase 5 the candidate was `a951369`, whose push run, [run 41831583159](https://github.com/EnsoDynamics/kiln/actions/runs/41831583159), was also green on its first attempt.

## Candidate checks on the release pull request (AC-CI-03)

Their run and any reruns are listed in the release pull request's description.
