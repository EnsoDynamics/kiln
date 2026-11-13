# Technical Design: Kiln Newer Version Notice

**PRD:** [Kiln Newer Version Notice](kiln-newer-version-notice-prd.md)

## The Check (AC-NEWER-01, AC-NEWER-02, AC-NEWER-04)

The view can't ask npm itself: its Content-Security-Policy allows only Kiln's own origin (`connect-src 'self'`), and keeping it that way keeps AC-INSTALL-02's promise about what the page loads. So the `kiln` process asks, and the view reads the answer from the local server.

`src/newer-version.ts` exports `newerKilnVersion(running, build, options)`, which returns a promise of the newer version or `undefined`:

- `build` is what `dist/build-info.json` records (`readBuildInfo`). Anything other than `{ kind: "release" }` returns `undefined` without a request, so development builds and Kiln run from source never ask npm.
- It sends `GET https://registry.npmjs.org/@ensodynamics/kiln/latest` with `Accept: application/json` and no other headers Kiln sets, aborted after 3 seconds (`AbortSignal.timeout`). The `latest` document is the version npm's `latest` dist-tag points at, so a prerelease never counts.
- It answers the `version` field only when both it and the running version are plain `major.minor.patch` and it is strictly greater, compared number by number. Any failure, a non-200 answer, unreadable JSON or a version it can't read answers `undefined`. Nothing is logged: the notice is optional, and AC-NEWER-02 asks for no error.
- Tests pass `registry` (a base URL) and `timeoutMs`.

The check runs once per `kiln` process: `serveAndOpen` in `kiln-command.ts` starts it before starting the local server and passes the promise as `LocalServerOptions.newerVersion`. Nothing awaits it there, so the server, the browser and the terminal are not held up.

## The Route

`GET /api/newer-version` answers `{ "latest": "1.2.0" }` or `{ "latest": null }`. It is behind the same token check as every other `/api/` route. It awaits the promise, which settles within the 3-second timeout, so a view that loads before npm answers gets the answer when it arrives. With no `newerVersion` option, as in tests that don't give one, it answers `null`.

## The View (AC-NEWER-03)

`App.svelte` asks for `/api/newer-version` once on mount, with the page's token, and passes `latest` to `TopBar`. A failed request leaves it undefined. `TopBar` shows the pill only when `latest` is set, and owns the panel's open state: the pill toggles it; Escape and a pointer press outside the pill and panel close it. The panel uses the existing `CopyButton` (compact) for the command. The link opens the GitHub release tag in a new tab. Colors come from `theme.css` (`--amber`, `--amber-border`, `--panel`, `--deep`), as the mockup draws.

## Tests

- `src/newer-version.test.ts`: against a real local HTTP server standing in for the registry. A newer, equal, older and prerelease `latest`; a development build, which must make no request; a 500, unreadable JSON and a server slower than the timeout, each answering `undefined`. The request's path and headers are asserted, for AC-NEWER-04.
- An integration test asks the real npm registry, so the URL and the document's shape are proved against npm itself.
- `local-server` integration: the route answers the promise's value and refuses a request without the token.
- `TopBar.test.ts`: no pill without `latest`; with it, the pill's text, and the panel's text, command and link once opened.
