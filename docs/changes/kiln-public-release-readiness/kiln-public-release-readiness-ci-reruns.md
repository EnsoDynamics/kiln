# Kiln public release readiness — CI reruns

**PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)

## Development CI on the release candidate (AC-CI-02)

The release candidate's development CI is the push run of `0277d62`, the last commit that changed a path CI watches: [run 41940340625](https://github.com/EnsoDynamics/kiln/actions/runs/41940340625), 2026-11-04. It ended green on its first attempt; no job or test needed a rerun.

Earlier candidates' push runs were green on their first attempts too: `a951369` before Phase 5 ([run 41831583159](https://github.com/EnsoDynamics/kiln/actions/runs/41831583159)), and `d4e6e20` and `f64ce40`, which the macOS candidate failures listed in the release pull request replaced.

## Candidate checks on the release pull request (AC-CI-03)

Their run and any reruns are listed in the release pull request's description.
