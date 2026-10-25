# Kiln public release readiness review

**Reviewed:** 2026-10-25. **Code baseline:** initial inspection at `a4cf92b962fd4682371d098a9b5a26c41404b1b7`; release hardening committed and pushed as `b6a7460`, followed by the CI repairs described below.

**Decision:** package publication is on hold. Doug subsequently authorized pushing the preparation and updating the standalone website page, while keeping Kiln off the homepage. The website update is live; the first remote CI run exposed additional repairs recorded below. Repository visibility, npm account settings, publishing credentials and release tags remain unchanged.

## Repository and distribution boundaries

Keep one Kiln repository and one npm package. `src/` contains the CLI, engine and local server; `view/` contains its Svelte browser interface; `prompts/` contains the runtime templates. They build and release together, with one user installation command:

```sh
npm install -g @ensodynamics/kiln
```

The Enso Method skills are in `EnsoDynamics/enso-method` (already public). Its website is in `EnsoDynamics/enso-method-website` (private). Disposable `kiln-proof-*` repositories are test resources, not additional product packages. No repository split is needed for the first release.

`EnsoDynamics/kiln` remains private. Making it public will expose its tracked source, requirements, designs, mockups, fixtures, commit metadata and reachable Git history. It will not make sibling repositories public. Ignored `node_modules/`, local session logs, `dist/` and old local `.tgz` files are not tracked.

The npm archive has a narrower boundary: compiled `dist/`, runtime `prompts/`, `package.json`, `README.md` and `LICENSE`. The initial inspected archive had 206 entries; the rebuilt archive with notices has 207 entries, approximately 1.10 MB compressed and 2.86 MB unpacked. It contained no repository requirements documents or recorded session fixtures. Repack after changes; do not upload the older local tarball.

GitHub's default branch is still `main` at `99b8fd4`, before the application and license were added; it does not contain `package.json`. This explains why GitHub currently reports no detected license even though `develop` already has MIT licensing. Integrate the approved release candidate before exposing the default branch to users.

## npm account and license

- Doug confirmed the `ensodynamics` organization and supplied an npm screenshot showing membership on 2026-10-25. `doug-ensodynamics` is the user account; `@ensodynamics` is the package scope. The configured package name is correct.
- An unauthenticated registry lookup returned E404 for `@ensodynamics/kiln`. No public release was found. Local authenticated organization queries returned E401; account permissions and publishing access have not been proved.
- MIT is already declared in `package.json`, with a complete root `LICENSE` naming Enso Dynamics. Creating another MIT license is unnecessary.
- The original archive omitted license notices for bundled fonts and browser libraries. This preparation adds `view/public/kiln-third-party-notices.txt`; Vite copies it into the published `dist/view/` directory. It reproduces the installed license texts for the 12 packages in the browser build's module inventory, including the fonts' OFL-1.1 notices and the JavaScript components' MIT/BSD notices. Recheck the inventory after dependency changes.
- No password or npm token is needed to finish this preparation. The existing workflow uses a short-lived npm token for its initial publish, followed by OIDC trusted publishing. Configure either only at the approved release step; [release instructions](kiln-npm-release-steps.md) cover the sequence.

## Public content and secret review

`gitleaks 8.30.0 git --log-opts=--all` scanned 154 commits and approximately 8.89 MB across the available local branches and remote refs. It reported 1,370 generic-key findings. All were classified: 1,369 Claude `msg_...` message identifiers in recorded fixtures and one `phase-2-refunds.md` fixture filename. No credential was found among those findings. No broad suppression was added.

An additional content check inspected 1,571 historical blobs for the actual local username/path, customer-company names and common personal email domains, finding none of those patterns. The current tracked-file inventory contained no `.env`, `.npmrc`, private-key/credential filenames, archives or database files. Current fixture accounts and home paths use synthetic or sanitized values. References to the maintainer, development decisions, private proof repositories and internal chat identifiers remain in design/proof records; opening the repository makes those records public too.

All 18 tracked PNG screenshots/mockups were reviewed in contact sheets: 16 depict fictional Customer returns examples, and two depict disposable development-delivery proofs. No credential or customer data was apparent in that visual review. Git author metadata uses a GitHub noreply email domain. This is automated text evidence and targeted visual/content inspection, not a guarantee about every private detail. Final public-content approval still covers the retained transcripts, historic records and maintainer metadata that will become visible. Repeat the scan and inspect the actual tarball on the final candidate SHA; commits after this baseline are not covered by this result. Raw scan reports stay outside the repository.

## Release hardening and remaining gates

| Item | Current disposition |
| --- | --- |
| Original CI failures | [Baseline CI 40217352716](https://github.com/EnsoDynamics/kiln/actions/runs/40217352716) failed on all three runners. The recorded causes have repairs below. The authorized [first repair run 40233059420](https://github.com/EnsoDynamics/kiln/actions/runs/40233059420) exposed an additional Windows proof-policy path comparison defect and two browser-test disconnect races; Follow-up `aa5eacf` passed macOS CI including package installation; Linux then exposed two 20-second session-start waits while four process-heavy files shared a two-CPU runner. The integration pool also respects available CPU parallelism, retaining every deadline and assertion. The superseded Windows runtime run exposed shared audit-root and fixture defects; those were repaired, with a real-filesystem regression failing before normalization and passing afterward. The subsequent platform-policy clarification limits Linux/Windows CI to required build-and-pack checks. A passing follow-up run on the final candidate remains the required gate. Use that candidate's GitHub check status as the remote result, rather than treating the first repair run as passing. |
| Browser authorization test | The real-Chrome test clicked Start while a base-change snapshot could still leave the button disabled, or reconfirmed while target saving disabled its fieldset. It now waits for the actual enabled browser controls, retaining all assertions that changed/unconfirmed targets grant nothing. Remote CI also exposed disconnect tests closing the server before the separately fetched output or pending fonts arrived. They now wait for the actual output/font readiness before intentionally disconnecting, retaining the saved-output and browser-error assertions. These were synchronization defects in the tests, not evidence that ordinary Chrome use was broken. |
| Process cleanup | Test teardown previously called `Engine.close()`, which releases watchers but does not stop working sessions/helpers. It now awaits `Engine.stop()` for every harness engine. Real helper cancellation/timeout also waits for child closure, with a one-second graceful shutdown then process-group kill. Real-process regression tests prove delayed and ignored shutdown cannot leave a child writing after the helper promise resolves. The in-process CLI test helper also stops in `finally` when assertions fail; audit checks rejected by cancellation return the existing stopping verdict instead of failing stop. Added focused regressions for both boundaries. |
| Windows fixtures | Migration fixtures now use native path constructors; Codex skill fixture identities use native resolved paths and POSIX command quoting is tested with an explicit POSIX platform; Bash transcript fixtures quote/normalize Windows paths and preserve valid JSON. Expectations and authorization assertions remain intact. The Windows proof-policy adapter also now normalizes its workspace roots with the same case comparison used by the production workspace audit. This fixes its false outside-workspace findings without changing assertions. These are compatibility fixes, not a native Windows agent proof. |
| Dependencies | Updated all declared compatible ranges, including Claude Agent SDK `0.3.310`, Hono `4.13.14`, Vite `8.3.5` and TypeScript ESLint `8.72.0`; upgraded ESLint/rules to major 10 with supported peers. The new error-cause lint rule is satisfied by preserving original caught errors. Both full and runtime audits must remain clean on the final lockfile. |
| Intentional older majors | Node type definitions remain on Node 22, matching the supported runtime. TypeScript is updated to supported `6.0.3`; TypeScript ESLint requires `<6.1.0` and Svelte Check supports major 6, so TypeScript 7 is not a compatible upgrade. Patched Ajv `6.15.0` remains because ESLint still requires Ajv 6; runtime MCP dependencies use Ajv 8. None is retained to ignore a vulnerability. |
| CI action runtime | Updated official checkout/setup-node actions from major 4 to current major 7, whose action manifests use Node 24. Keep Node 22 for product verification and Node 24/npm 11 for publication. |
| Native platform decision | Doug explicitly confirmed on 2026-10-25: only his Mac is available; Windows users can report issues for subsequent fixes. macOS is the required native validation platform. Windows/Linux remain best effort and their native agent, console, sleep and desktop proofs are not release gates. PRD AC-INSTALL-03/AC-PROOF-01, the design, PLAT-002, phase notes and public copy follow that ruling. Doug further clarified that macOS runtime/installation tests and Linux/Windows builds/packs must pass; Linux/Windows runtime tests are outside this release validation. CI now follows that exact boundary, with every applicable job required. |
| Website | Local `enso-method-website/scripts/kiln-page.mjs` now explains approved development merges/deployments, whole-PRD audits, Codex `0.162.1` and macOS validation. It remains `noindex` and unlisted. Doug authorized the standalone page deployment, completed in website commit `11e3287` and [production workflow 40233466398](https://github.com/EnsoDynamics/enso-method-website/actions/runs/40233466398). HTTP checks confirm the homepage contains no Kiln text/link and the sitemap excludes the page. |
| Final publication approval and access | MIT/public-source intent is confirmed in REL-001, and the npm organization exists. npm publishing permissions, registry installation/provenance and visibility change remain unperformed. No Kiln release tag, npm publication or repository visibility change is authorized. The standalone website update was authorized separately and does not lift the package release hold. |

## Local preparation changes

The follow-up fixes normalize completion-audit workspace roots before checking provider writes, so directory aliases and Windows casing do not reject legitimate in-workspace mutations. A real Git/directory-link regression also proves a separate checkout remains rejected. Shared provider fixtures preserve isolated environment paths, execute their recorded POSIX programs through a real POSIX shell, quote native paths, and match native separators in CLI/report paths. These repairs retain the original audit assertions and no runtime validation is claimed for Linux/Windows.

- Updated the README for Claude Code and Codex, multi-repository delivery, whole-PRD completion audits, explicit development authorization and current platform validation limits.
- Updated the package description to include both agents.
- Patched `fast-uri` to `3.1.9`, updated supported direct/transitive dependency versions and preserved existing platform lock metadata. Corrected stale lockfile root metadata from `0.1.0`/`UNLICENSED` to the existing package version `1.0.0`/`MIT`. Both full and runtime-only audits report zero vulnerabilities.
- Added the browser dependency/font notices using the installed packages' original license texts and an inventory of Vite's module graph.
- Replaced stale release-ready claims with evidence-based preparation gates and a separate, approval-held publication sequence. Recorded the confirmed npm organization.

## Validation recorded in this review

The first full run after the dependency/tooling updates exposed three timeouts with 18 available workers, a leaked in-process CLI server and an audit cancellation rejection. One stalled test worker was terminated; that run failed. Those are failed evidence, not a passing gate. The CLI test helper now always stops in `finally`, all four audit-check entry paths share the stopping-only cancellation boundary, and the integration pool is bounded to four files without raising any test deadline. The two initially timed-out files passed independently (11 tests, 35.66 seconds). A capped full run then passed 675 integration tests with two skips. The final shared-boundary revision passes five focused cases, including exact ordinary-error propagation. The final reviewed `npm run verify` passes with 552 unit/component tests, 17 decoder/contract tests and 680 integration tests, with two existing integration skips; the added alias-root regression was observed failing before the production fix and passing afterward. The six focused audit/Codex/outside-workspace/resume files pass 150 tests.

| Check | Result |
| --- | --- |
| ESLint | Pass. |
| TypeScript and Svelte checks | Pass on compiler `6.0.3`; no errors or warnings. |
| Workflow validation | `actionlint` passes for both CI and Release workflows. |
| Independent review and test hardening | Final reviews clean. Shared audit cancellation covers all four entry paths, and ordinary errors retain their original identity. |
| Live SDK metadata smoke | Updated SDK obtains 13 models from the installed Claude CLI with no prompt and only a control response; no model turn or usage. |
| Website | All 55 tests, TypeScript/Vite build and lint pass on temporary Node `22.23.3`, meeting its `>=22.18.0` requirement. The system Node installation was not changed. |
| Default unit/component suite | 552 tests pass across 38 files on macOS, Node `22.16.0`. |
| Codex decoder/contract proof suite | 17 tests pass. These are local contract checks, not a new live-agent proof. |
| Installed package suite | Four final checks pass on the reviewed source and upgraded toolchain: local pack, temporary global install, runtime decoder, help and local browser startup. Agent/GitHub test peers are used; this does not prove real agent or GitHub publishing behavior. |
| Full and runtime-only npm audit | Zero vulnerabilities after updating `fast-uri` to `3.1.9`. |
| Clean lockfile installation | Fresh temporary `npm ci` passes, including TypeScript `6.0.3` and `fast-uri@3.1.9`; existing platform lock metadata is preserved. |
| Full verification command | Final reviewed `npm run verify` passes with TypeScript `6.0.3`: audit, ESLint 10, TypeScript/Svelte, 552 unit/component tests, 17 decoder contracts, build and integration suite. |
| Integration suite | 680 pass and two existing skips across 53 files on the final reviewed source, using at most four concurrent files, further bounded by available CPU parallelism. No deadline or behavior assertion was weakened. |
| Final pack, notice inclusion and archive scan | Rebuilt archive has 207 entries; license notices match source byte for byte, and requirements/test fixtures/tests are excluded. Gitleaks directory scan reports no leaks. Final installed-package checks pass; the exact final tarball scan is clean and its notices match source byte for byte. |
| npm publish dry run | Pass with `--dry-run --ignore-scripts` on the rebuilt archive; no publication occurred. |
| Public npm installation, provenance and first publish | Not run; publication is on hold. |

## Standalone website copy deployed

The separate website repository's `scripts/kiln-page.mjs` is deployed in commit `11e3287`. It now describes explicit development target authorization, whole-PRD delivery/test audits, the Codex `0.162.1` prerequisite and macOS validation with best-effort Windows/Linux support. The metadata describes review pull requests without promising exactly one. Its existing metadata-length tests remain unchanged. Kiln's page remains `noindex` and unlisted, with the correct `npm install -g @ensodynamics/kiln` command. The production workflow passed build, tests, private development deployment and production deployment. Direct HTTP inspection confirms the live copy and install command, `noindex`, no homepage mention/link, and no sitemap entry. No indexing/navigation change occurred.

## Release order

Complete the authorized CI repairs, require passing remote CI, and finish the final public-content review; align README and website claims; validate the exact package and candidate SHA. Then obtain the single release approval. Under that approval, integrate the reviewed candidate into `main`, make the Kiln repository public, configure initial npm publication access, require green CI, push the version tag and verify the registry install/provenance. The standalone site copy is already deployed. Retain its unlisted/noindex status and homepage/navigation/sitemap exclusions unless Doug separately authorizes discoverability changes. The detailed commands and credential boundaries are in [Kiln npm release steps](kiln-npm-release-steps.md).
