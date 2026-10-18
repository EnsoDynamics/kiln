# Phase 6: Proof on a real feature, the Windows checks, and the npm release

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "Package and Distribution", "Windows", "Testing Approach" ("Keep-awake on Linux desktops", "Windows", "The release")

## Summary
Kiln takes a small real feature of three to five phases from `kiln run` to a pull request ready for review, on Windows and on macOS or Linux, through a self-split phase, a stop finished by hand and a Ctrl+C that `kiln run` resumes. The release workflow then publishes it to npm as one package installed with one command.

## Acceptance criteria covered
AC-INSTALL-01, AC-PROOF-01, AC-PROOF-02, AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
Anything in docs/design/kiln-after-v1-ideas.md.

## Phase dependencies
5 (the complete browser view and its controls)

## Phase-specific notes
- Human actions this phase needs: Doug creates the `ensodynamics` organization on npm before the first publish (PRD, "Pending human actions"); a person on Windows runs proof gate 1's session, interrupt, resume and sleep checks, the keep-awake check and AC-PROOF-01; the manual keep-awake check on Ubuntu GNOME and KDE, recording PLAT-001.
- Each Windows piece the design marks untried that doesn't hold comes back as a product decision (PRD, "Depends On").

## Carried forward from Phase 3
- The Windows Ctrl+C path was built but never run on Windows: CI can't send a console Ctrl+C. In the Windows proof run, press Ctrl+C mid-session and check the run reads `interruptedBy: sigint`, no `claude` or `node` process is left, and the next `kiln run` resumes the session. Watch for cmd.exe, which runs npm's `claude.cmd` shim, asking "Terminate batch job (Y/N)?": if that holds the process, the stop takes its full 30-second wait before `taskkill` ends the tree, which is a product decision under AC-KEEP-02.
- Sleep handling was built without proof gate 1's sleep recordings (Doug made them optional on 2026-10-17). On macOS, and on Windows as part of its sleep check, sleep the computer mid-session once: the run should read `interruptedBy: sleep` and be resumed when the session didn't get a model response after waking, and should end on its own when it did.

## Inherited from Phase 5
- The browser view is complete. `src/server/view-in-browser.integration.test.ts` renders each drawn screen in a real headless Chrome (found automatically on all three CI runners, or `CHROME_PATH`) from the mockups' sample data in `src/test-support/sample-snapshots.ts`, under Kiln's Content Security Policy. Run it with `KILN_SCREENSHOTS=<folder>` to write each screen beside its mockup as PNGs; on Windows that is the quick check that the screens match there too (AC-INSTALL-03). Headless Chrome doesn't fetch the mockups' Google Fonts, so a mockup's headings fall back to a system serif in its screenshot; the view's bundled fonts are the right ones.
- Proof gate 3 (the stop path) is `scripts/exploration/proof-gate-3-stop-path.mjs`, with its result in `docs/design/kiln-proof-gate-3-results.md`. It satisfies the start checks' "origin on GitHub" with a stand-in `git` that answers `git remote get-url origin`, so it can't open a pull request. AC-PROOF-01 needs a real GitHub-hosted repository, with `gh` signed in to an account that can open pull requests on it, because Kiln confirms the pull request on GitHub (AC-PR-02).
