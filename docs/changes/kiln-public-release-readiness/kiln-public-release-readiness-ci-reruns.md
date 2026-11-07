# Kiln public release readiness — CI reruns

**PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)

## Development CI on the release candidate (AC-CI-02)

The release candidate's development CI is the push run of `0277d62`, the last commit that changed a path CI watches: [run 41940340625](https://github.com/EnsoDynamics/kiln/actions/runs/41940340625), 2026-11-04. It ended green on its first attempt; no job or test needed a rerun.

Earlier candidates' push runs were green on their first attempts too: `a951369` before Phase 5 ([run 41831583159](https://github.com/EnsoDynamics/kiln/actions/runs/41831583159)), and `d4e6e20` and `f64ce40`, which the macOS candidate failures listed in the release pull request replaced.

## Candidate checks on the release pull request (AC-CI-03)

Their run and any reruns are listed in the release pull request's description.

## Release of 1.0.0

Release pull request #2 merged to `main` as `e4e9b9c` on 2026-11-05, and [Release run 41950817510](https://github.com/EnsoDynamics/kiln/actions/runs/41950817510) published it on its fifth attempt. The release preflight, Ubuntu checks and Windows build passed on the first attempt. The macOS job failed four times, on a different test each time, and was rerun on the same commit; nothing published until every job passed:

| Attempt | Failure on macOS |
|---|---|
| 1 | `src/live/live-compatibility.integration.test.ts`, "Pause & take over after a restart", attempt exited: the gate held no hook contract. The test killed its controller while it could still be writing the gate, leaving the gate's lock without an owner; fixed on `develop` in `18e246e`. |
| 2 | `src/engine/plan-source-feedback.integration.test.ts`, "keeps completed history … (delivery enabled true)": the Continue button was still disabled when read. |
| 3 | The same restart test as attempt 1, attempt still running. |
| 4 | `src/live/takeover-history.integration.test.ts`, "usable history for delivery_audit … under takeover": a hook timed out at 60 seconds. |
| 5 | None. |

Registry evidence, checked 2026-11-05:

- `@ensodynamics/kiln@1.0.0` is `latest` on npm, shasum `84597e24f0ef0f037df3a7c9750ddfd965a345da`, integrity `sha512-HqqTjsViXdPjJbigLFZpjneESAxjnIov2AuTTpiEf5dAsjy02e/XkWnaiDzpnUP7FfbKPwBYA+uOjAOzvdejoA==`.
- Its SLSA provenance attestation is on the registry, and the publish step recorded it in the Sigstore transparency log (log index 3692647864). `npm audit signatures` in a clean install verifies it.
- The npm tarball's SHA-256, `6d1ba17c7447aff0394c6d1920459714150e970f9938643db724c63dbbe4f46b`, matches `SHA256SUMS` on the [v1.0.0 GitHub Release](https://github.com/EnsoDynamics/kiln/releases/tag/v1.0.0), whose tag points at `e4e9b9c`.
- `npm run test:package` against the tarball downloaded from npm passes all 11 installed-package checks, and the installed `kiln --version` prints `1.0.0`.

Publication is held again (`NPM_PUBLISH_ENABLED=false`) until the next approved release.
