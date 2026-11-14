# Kiln npm release setup and operation

Kiln is one repository (`EnsoDynamics/kiln`) and one npm package (`@ensodynamics/kiln`). The package contains the CLI, browser interface, fonts and prompts. There are no separate operating-system installers.

**Every push to `main` is a production release.** Doug decided this on 2026-11-08: “every main push should be a real production release on NPM.” There is no separate publication switch; work that should not ship yet stays on `develop`. To stop releases in an emergency, disable the Release workflow in GitHub Actions.

## Workflows and artifacts

| Event | Checks | Distribution |
| --- | --- | --- |
| Push to develop, or PR targeting another development branch | Ubuntu full verification, including integration tests, and installed-package checks against the built archive; no macOS/Windows jobs | No publication or retained development archive |
| PR targeting main | Cheap package/version/registry preflight, Ubuntu checks, full macOS verification and installed-package tests, Windows build/pack | Candidate archive and checksum retained seven days |
| Push to main, or manual Release retry on main | Cheap version/publishing preflight, then the same full candidate checks once | npm package, version tag and GitHub Release |

Release preflight precedes every expensive platform job. It rejects inconsistent package/lockfile versions, a version that has not advanced from the previous main commit, an existing version tag, a version already present on npm, a version without written release notes, and registry failures. The initial main scaffold has no package, so the first unpublished `1.0.0` is valid. Preflight also checks public repository visibility and authentication. Token mode checks the intended npm identity; trusted mode exchanges the actual GitHub OIDC identity with npm before verification starts. Authentication checks cannot prove that the eventual package write will succeed; scoped permissions and direct-publish permission must also be configured correctly.

Ubuntu builds the archive once and produces `SHA256SUMS`. macOS verifies that checksum, installs the downloaded archive and runs the installed-package suite against it. Publishing downloads and checks that same archive without rebuilding. Candidate archives are release builds, so their `kiln --version` prints the plain version; any other build adds `(dev build, <built>)`. To rerun the installed-package checks against a candidate or published archive, set `KILN_RELEASE_BUILD=true` beside `KILN_PACKAGE_TARBALL`, as the macOS job does. `actions/upload-artifact` retains the candidate for seven days; after publication, the GitHub Release keeps the archive and checksum with its release notes. Tags created by this workflow trigger no duplicate verification run.

Development CI runs all of `npm run verify` and installed-package checks on Ubuntu only. One job runs `npm run verify:development`, everything but the integration suite, and four parallel jobs each run a quarter of the integration files (`npm run test:integration -- --shard=N/4`), since the whole suite is about 100 minutes of test time; test and hook deadlines stay unchanged. Main candidates retain the full macOS integration and installed-package suite, sharded the same way, and Windows build/pack checks. Run relevant local checks before delivery; CI provides the full development gate without requiring expensive macOS runners on each development push. Native Windows/Linux agent, console, sleep and desktop behavior remains best effort, not a first-release proof gate.

## Local version gate

Install the tracked pre-push gate from the shared checkout:

```sh
npm run hooks:install
```

The installer preserves other Git hooks and refuses an unrelated pre-push hook or custom `core.hooksPath`. A parallel-session worktree requires explicit `npm run hooks:install -- --from-worktree` to install a gate from that worktree for the shared repository. Keep that worktree until the changes are landed, then reinstall from the shared checkout before removing it. GitHub runs the authoritative checks even when a local hook is absent.

The gate validates committed package metadata for branch pushes. For main and version tags it also checks release-version advancement and the npm registry. It reads the exact Git objects being pushed: editing the working-tree version without committing it does not satisfy the gate. It never changes a commit. Normal development pushes do not require a new version for every commit.

Before a release merge, run:

```sh
npm run release:prepare
```

This refreshes main and tags, reads npm, and updates both package files when a patch increase is needed. It retains the first unpublished `1.0.0`, and retains an intentional version greater than the main/registry baseline. Repeating the default command does not increase an already-prepared version again. A local version behind the release baseline fails and asks for an updated checkout. An intentional larger release can use `npm run release:prepare -- minor` or `-- major`, or an explicit version change in both package files. Preparation creates no commit or tag; review and commit the version files with the release candidate.

Every release needs written notes, kept in one `CHANGELOG.md` at the repository root, newest release first. Work that changes what a Kiln user sees adds its lines under `## [Unreleased]` when it merges to `develop`, under `Added`, `Changed`, `Fixed` or `Removed`. `npm run release:prepare` renames that section to `## [<version>] - <date>` and opens a new empty Unreleased above it, so the version is chosen only when the release is prepared; it refuses when Unreleased is empty and the version has no section yet. Commit `CHANGELOG.md` with the package files. The local gate, the CI candidate preflight on the release pull request and the release preflight all reject a version whose section is missing or empty, before the platform checks start. The release publishes that section as its GitHub Release notes, and the newer version notice in Kiln's top bar links to the whole changelog on `main`.

## GitHub and npm configuration

Repository: `EnsoDynamics/kiln`. npm organization/scope: `ensodynamics` / `@ensodynamics`. npm account: `doug-ensodynamics`; organization membership is confirmed. Configure these repository Actions values:

| Name | Kind | Preparation value |
| --- | --- | --- |
| `NPM_AUTH_MODE` | Variable | `token` for the initial publication; `trusted` after OIDC setup |
| `NPM_TOKEN` | Secret | Restricted initial-publication granular token; never an npm password |

Publication uses a scoped npm token kept in the maintainer's password manager until trusted publishing replaces it. The token permits direct package publication under the `@ensodynamics` scope only, with no organization-administration permission and no access to unrelated scopes. Its value goes directly to GitHub Secrets without chat, command-argument, log or tracked-file exposure. Confirm npm's live token policy when issuing one. [npm token configuration](https://docs.npmjs.com/creating-and-viewing-access-tokens/) and [registry API](https://api-docs.npmjs.com/) describe the current requirements.

Before arming publication, check the token's real npm identity and its selected package/scope permissions. A dry-run pack does not prove publishing access. A missing, expired or wrong-account token fails preflight before the platform checks. Renew an expired bootstrap token before release rather than discovering it after verification.

## First approved release

1. Finish the final candidate's content/history and exact-package review, including third-party notices. Obtain Doug's explicit publication approval. Keep the website unlisted/noindex unless separately authorized.
2. Prepare and commit the release version. Run local full verification and installed-package checks; review the candidate PR's full checks.
3. Under the explicit release approval, make the Kiln repository public for npm provenance, and confirm initial npm access. Do not make sibling or proof repositories public.
4. Merge the approved candidate to main. Release preflight runs first, followed by one full candidate verification. Only then does Actions publish the checked archive with provenance and create `v<version>` and its GitHub Release. Do not push a release tag manually.
5. Check the public registry version, integrity and provenance; install that exact version in a disposable prefix and run its installed help/browser checks. Record the candidate SHA and registry evidence. No public install or provenance verification is claimed before this step.

A workflow rerun after a pre-publication infrastructure failure can use GitHub's normal rerun controls, or manually dispatch Release on main. A version already on npm is always rejected. If npm succeeded but GitHub Release creation failed, use the retained archive/checksum to finish the matching GitHub Release under the same release authorization; do not republish or change that version. If the artifact expired, recover the identical npm tarball and verify its registry integrity before attaching it.

## Move to trusted publishing

Configure OIDC after the initial package exists, close to the next approved release. npm trusted publisher setup currently requires its first successful publication within two days; an unvalidated connection then expires. The workflow uses Node 24 and npm 11, satisfying npm's Node 22.14+/npm 11.5.1+ requirement.

Use GitHub Actions, organization `EnsoDynamics`, repository `kiln`, workflow filename `release.yml`, and no environment name. Explicitly allow direct `npm publish`; staged-only authorization cannot satisfy the automated release. Set `NPM_AUTH_MODE=trusted`. Both preflight and publishing have `id-token: write`; preflight proves the workflow identity can exchange with npm and the publish job obtains its own fresh credentials. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and its [OIDC exchange contract](https://api-docs.npmjs.com/#tag/registry.npmjs.org/operation/exchangeOidcToken).

After a successful trusted release, revoke the bootstrap token, remove `NPM_TOKEN` from GitHub, and restrict conventional publishing tokens in npm.

## Preparation evidence and remaining human actions

Prepared on 2026-10-29 against `4f009d4`. Doug explicitly approved the bootstrap token. Its live details confirm read/write on `@ensodynamics` only and no organization permissions. It is kept in the maintainer's password manager; a read-back authenticated as `doug-ensodynamics`, then its value was sent directly to GitHub Actions secret `NPM_TOKEN` without being printed. GitHub lists the saved secret and the variables `NPM_AUTH_MODE=token`, `NPM_PUBLISH_ENABLED=false`.

The local gate is installed in the repository's shared Git hooks using the retained release-preparation worktree. On landing this preparation, reinstall it from the updated shared checkout before removing that worktree.

| Check | Evidence |
| --- | --- |
| Release/version/hook/auth/workflow policy | `npm run test:release`: 14 pass, including real rejected Git pushes, explicit worktree installation, registry failure contracts and dependency/routing checks on the actual YAML |
| Final archive installation | The final archive from `scripts/pack-release.mjs` passes all eight installed-package checks through `KILN_PACKAGE_TARBALL`; 67.66 seconds |
| Audit, lint, types and unit suite | Dependency audit: no blocking high/critical findings; ESLint passes; TypeScript/Svelte: no errors/warnings; all 643 unit/component tests pass |
| Decoder/contract proofs | 18 pass in the full verification invocation |
| Full integration invocation | 1,094 pass, two existing platform skips, one pre-existing failure; 3,401.93 seconds |
| Pre-existing failure isolation | The completion-audit browser case times out waiting for its provider marker at `src/engine/audit-workflow.integration.test.ts:275`. The same failure reproduces on a pristine git-archive export of pre-change `4f009d4`, as well as on the preparation checkout. Product runtime code is unchanged by this preparation. A final release still requires a green candidate. |
| Workflow and diff validation | `actionlint` and `git diff --check` pass; independent deliverable review and test hardening completed |
| Live external reads | npm still reports `1.0.0` unused; GitHub secret/variable presence and the real npm account identity were checked |
| Publication boundaries | No main merge, visibility change, release tag or npm publication performed. Live GitHub artifact transfer, first publish and OIDC trust remain unproved until the approved workflow runs. |

Doug approved the first publication on 2026-11-05, and Kiln 1.0.0 was published that day from `e4e9b9c`; its release run, reruns and registry evidence are in [Kiln public release readiness — CI reruns](../changes/kiln-public-release-readiness/kiln-public-release-readiness-ci-reruns.md). Ongoing credentials use OIDC after the one-time trusted-publisher setup becomes possible; the bootstrap token is not a recurring rotation scheme.
