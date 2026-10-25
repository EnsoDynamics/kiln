# Kiln npm release steps

Kiln is one repository (`EnsoDynamics/kiln`) and one npm package (`@ensodynamics/kiln`). The package contains the CLI, local browser interface, fonts and prompt templates. The Enso Method skills and website live in separate repositories.

**Release is on hold.** The [public release readiness review](kiln-public-release-readiness-review.md) records the current blockers and evidence. A successful local pack is packaging evidence, not release approval. Do not change visibility, install publishing credentials, push a release tag or publish until Doug explicitly approves the release.

## Established setup

- Doug confirmed the `ensodynamics` npm organization on 2026-10-25 and supplied an npm account screenshot showing membership. `doug-ensodynamics` is the login; the package scope is `@ensodynamics`.
- `package.json` names `@ensodynamics/kiln` at `1.0.0`, sets public package access and declares MIT. The root `LICENSE` already contains the MIT license, copyright Enso Dynamics.
- GitHub repository visibility is still private. The default `main` branch predates the application and its license; release preparation is on `develop`.
- `.github/workflows/release.yml` publishes from a pushed `v*.*.*` tag only after its three-platform CI jobs pass. It checks that the tag matches the package version and the commit is contained in `main`, then runs `npm publish --provenance`.
- No public `@ensodynamics/kiln` version was returned by the registry on 2026-10-25. The local npm login returned E401, so authenticated organization permissions remain unverified.

## Finish preparation before approving release

1. After the CI repairs are reviewed and an integration-branch push is authorized, require a passing CI run on that exact candidate. Keep automated macOS/Linux/Windows checks enabled, including the package installation tier; local macOS evidence does not imply the remote runners passed.
2. Rerun the full and production-only dependency audits on the final candidate. The preparation update to `fast-uri@3.1.9` clears the finding identified in the readiness review.
3. Apply the confirmed platform policy: macOS is natively validated; Windows and Linux are best effort. Doug waived native Windows/Linux release proofs on 2026-10-25. The PRD, design, PLAT-002, README and prepared website copy reflect that decision; do not claim native Windows/Linux execution was tested.
4. Review and validate the prepared website source changes covering explicit development delivery, whole-PRD completion audits, the pinned Codex CLI prerequisite and platform policy. Doug authorized deployment of the standalone page on 2026-10-25. Keep it unlisted and `noindex`, with no homepage/navigation links or sitemap entry; package publication does not lift that restriction.
5. Review the complete repository and all reachable history for credentials, private content and third-party material. Review screenshots and retained provider fixtures as well as text. Regenerate and inspect the exact release tarball. Preserve the bundled library and font notices in `dist/view/kiln-third-party-notices.txt`.
6. Preserve the publication hold. MIT/public-source intent is confirmed under REL-001; Doug reiterated on 2026-10-25 that publication needs his separate explicit authorization.
7. Stage and review preparation changes. Commit or push only under the applicable authorization. Record the final candidate SHA and repeat the content and package checks after any further code change.

Useful local checks:

```sh
npm ci
npm run verify
npm run test:package
npm pack --json
npm publish --dry-run
```

`npm run test:package` builds, packs, installs into a temporary prefix and runs that installed executable. A publish dry run does not prove npm write access or OIDC configuration. Run build/pack commands sequentially when they share `dist/`.

## After explicit release approval: GitHub and initial npm access

Making a repository public exposes its tracked files, documentation, fixtures and Git history. `.gitignore` does not hide tracked or historical content. npm can publish a public package from private source, but this release's provenance requires a public repository; the MIT/public-source plan also calls for it. See [npm trusted publishing and provenance](https://docs.npmjs.com/trusted-publishers/).

Use this setup during step 3 of the release sequence below, after the approved candidate is on `main`, CI has passed and the public-content review is complete:

1. Make `EnsoDynamics/kiln` public through GitHub settings. Do not make the website repository or disposable proof repositories public.
2. Sign in to npm as the account that administers `ensodynamics`, with 2FA enabled. Confirm package publishing rights within that organization. No npm password belongs in GitHub Actions or this repository.
3. The existing workflow uses `NPM_TOKEN` for the first publication, because trusted publisher configuration is attached to an existing package. Immediately before that first release, create a short-lived granular token restricted to the `@ensodynamics` package scope with package read/write access and the 2FA bypass needed for the current unattended publish step. Give it no organization administration permissions. Confirm the current npm token policy when creating it; npm is restricting bypass tokens.
4. Store the token directly as the repository Actions secret `NPM_TOKEN`, without printing it or writing it into a tracked file. Do not create or store it during preparation.

## After explicit release approval: release the selected version

1. Integrate only the reviewed release candidate into `main`, using normal repository review and protection rules. Preserve any other session's unmerged work. Push only under the release authorization.
2. Wait for CI to pass on that exact `main` SHA, including installation of the packed package on all three runners.
3. Complete the GitHub visibility and initial npm access setup above. Confirm `main` displays the reviewed README and MIT license.
4. Confirm the npm version is still unpublished and `package.json` has the intended version. Create and push the matching annotated tag (for the current version, `v1.0.0`). A tag push triggers publication; this is the release boundary.
5. Follow the Release workflow to its final result. It repeats the CI checks and publishes through GitHub Actions, never from a laptop.
6. In an isolated temporary installation, check the exact published version:

   ```sh
   npm view @ensodynamics/kiln@1.0.0 version dist.integrity dist.attestations
   npm install --global --prefix <temporary-folder> @ensodynamics/kiln@1.0.0
   ```

   Run that prefix's installed `kiln --help`, verify its browser assets and notices, and confirm npm's provenance links to the approved repository and workflow.
7. After the package installs and the repository is public, verify the standalone Enso Method Kiln page's installation command and links. Its copy was deployed separately during preparation. Preserve `noindex` and its exclusion from the homepage, navigation and sitemap unless Doug separately authorizes discoverability changes.

## Replace the initial token with trusted publishing

[Current npm documentation](https://docs.npmjs.com/trusted-publishers/) requires npm CLI 11.5.1 or later and Node 22.14.0 or higher. The publish job uses Node 24 and npm 11.

Configure the package's trusted publisher immediately before the next release:

- Provider: GitHub Actions.
- Organization: `EnsoDynamics`.
- Repository: `kiln`.
- Workflow filename: `release.yml`.
- Environment: none, matching the existing workflow.
- Allow direct `npm publish`, matching the existing workflow.

A newly created trusted publisher must complete its first successful publish within two days or it expires. For the next approved release, remove the first-publish token from npm and the GitHub repository secret, configure token restrictions to require 2FA and disallow traditional tokens, then publish within that window. The workflow already grants `id-token: write` for OIDC. Verify provenance and record the successful OIDC release.
