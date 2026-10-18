# Kiln npm release steps

How `@ensodynamics/kiln` gets to npm. The package is ready: `package.json` is at `1.0.0`, `npm publish --dry-run` passes, and CI installs the packed tarball and runs that `kiln` on macOS, Linux and Windows (`npm run test:package`). Publishing is done by [`.github/workflows/release.yml`](../../.github/workflows/release.yml) when a version tag is pushed on `main`, never from a laptop (technical design, "Package and Distribution"). That workflow runs CI's checks on all three operating systems, confirms the tag matches `package.json`'s version and is on `main`, then runs `npm publish --provenance`.

Steps 1 to 4 are one-time setup; 5 to 7 are each release.

## Before the first release

These must hold first. Each is a pending human action in the [Kiln v1 PRD](../prds/kiln-v1/kiln-v1-prd.md):

- The proof run (AC-PROOF-01, AC-PROOF-02) held on Windows and on macOS or Linux, and the Windows and Linux checks are recorded: [Kiln proof run steps](../design/kiln-proof-run-steps.md), results in [Kiln proof run results](../design/kiln-proof-run-results.md).
- Assumption **REL-001** ([assumptions](../prds/kiln-v1/assumptions.md)) is confirmed: Kiln is MIT-licensed and released from a public repository. If it is corrected, change `license` in `package.json` and `LICENSE` to match before tagging, and if the repository stays private, remove `--provenance` from the release workflow's publish step; npm refuses provenance from a private repository.

## One-time setup

1. **Create the npm organization.** Sign in at npmjs.com with the account that will own Kiln (two-factor authentication on), then Add Organization → name `ensodynamics` → the free plan (public packages). The package name `@ensodynamics/kiln` needs it; the unscoped `kiln` is taken.

2. **Make `EnsoDynamics/kiln` public** (REL-001):

   ```
   gh repo edit EnsoDynamics/kiln --visibility public --accept-visibility-change-consequences
   ```

   A `gitleaks git` scan of the whole history on 2026-10-18 found no secrets: all 1,097 hits were Claude API message IDs (`msg_…`) in the recorded session fixtures under `test/fixtures/`.

3. **Give the workflow a token for the first publish.** npm's trusted publishing can only be set up on a package that already exists, so the first publish uses a token. On npmjs.com: Access Tokens → Generate New Token → Granular Access Token, named `kiln-first-release`, expiring in 7 days, Packages and scopes **Read and write** for the `@ensodynamics` scope (organization `ensodynamics`), and tick "Bypass two-factor authentication": without it the workflow's publish fails asking for a one-time password. The token needs no organization permissions. Then:

   ```
   gh secret set NPM_TOKEN --repo EnsoDynamics/kiln
   ```

   and paste the token when asked.

4. Nothing else: the workflow file is already on `develop` and reaches `main` with step 5.

## Each release

5. **Bring `main` up to `develop`** and let CI pass on it:

   ```
   git checkout main && git pull --ff-only
   git merge --ff-only develop
   git push origin main
   gh run list --repo EnsoDynamics/kiln --workflow CI --commit "$(git rev-parse HEAD)"
   gh run watch --repo EnsoDynamics/kiln <the run's ID>
   ```

   The run is listed a few seconds after the push.

   For a later release, first set the new version on `develop` (`npm version <x.y.z> --no-git-tag-version`, commit, push).

6. **Tag the release on `main`** and watch the release workflow:

   ```
   git tag -a v1.0.0 -m "Kiln 1.0.0"
   git push origin v1.0.0
   gh run list --repo EnsoDynamics/kiln --workflow Release --commit "$(git rev-parse HEAD)"
   gh run watch --repo EnsoDynamics/kiln <the run's ID>
   ```

   The tag must be `v` plus `package.json`'s version, or the workflow stops before publishing.

7. **Check it installs:**

   ```
   npm view @ensodynamics/kiln version
   npm install -g @ensodynamics/kiln
   kiln --help
   ```

   npmjs.com's page for the package shows a "Provenance" section linking to the workflow run.

## After the first release: switch to trusted publishing

A trusted-publisher setup expires unless it publishes within 2 days of being created, so do this just before the second release, not straight after the first:

1. On npmjs.com, `@ensodynamics/kiln` → Settings → Trusted Publisher → GitHub Actions: organization `EnsoDynamics`, repository `kiln`, workflow `release.yml`, no environment.
2. `gh secret delete NPM_TOKEN --repo EnsoDynamics/kiln`, and delete the `kiln-first-release` token on npmjs.com if it hasn't expired.
3. In the package's settings, choose "Require two-factor authentication and disallow tokens".
4. Release as in steps 5 to 7 within 2 days. The workflow needs no change: with no token, npm authenticates through GitHub's OIDC token, and provenance is recorded automatically.
