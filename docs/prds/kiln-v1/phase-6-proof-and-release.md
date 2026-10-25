# Phase 6: macOS proof, best-effort compatibility, and the npm release

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "Package and Distribution", "Windows", "Testing Approach" ("Keep-awake on Linux desktops", "Windows", "The release")

## Summary
Kiln takes a small real feature of three to five phases from `kiln run` to a pull request ready for review, on macOS, through a self-split phase, a stop finished by hand and a Ctrl+C that `kiln run` resumes. The release workflow then publishes it to npm as one package installed with one command.

## Acceptance criteria covered
AC-INSTALL-01, AC-PROOF-01, AC-PROOF-02, AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
Anything in docs/design/kiln-after-v1-ideas.md.

## Phase dependencies
5 (the complete browser view and its controls)

## Phase-specific notes
- Current release decision, 2026-10-25: macOS is the required native validation platform; Windows/Linux native proof and desktop checks are best effort and do not block release (AC-INSTALL-03 and PLAT-002). The older Windows check instructions below remain reproducibility guidance, not current release gates. Automated CI compatibility jobs remain enabled.
- The `ensodynamics` npm organization and MIT/public-source intent are confirmed. Publishing, release tags and repository visibility changes remain explicitly unauthorized until Doug approves the final candidate.
- Human action this phase needs: explicit publication approval after the macOS evidence and final candidate have been reviewed. No Windows/Linux test host is required.
- Each Windows piece the design marks untried that doesn't hold comes back as a product decision (PRD, "Depends On").
- State on 2026-10-18: the package, the release workflow and every prepared step are built and pushed, and the macOS rehearsal held ([Kiln proof run results](../../design/kiln-proof-run-results.md)). The three small fixes the delivery audit of phases 1 to 5 carried forward below (from Phases 4 and 5) are built, on develop, ahead of the release's publish step. What remains is the human actions in the PRD's "Pending human actions", and the Windows and macOS checks carried forward from Phase 3, which are part of the proof run. The phase gets its Closed line once the results document records the proof run (parts B to E of [Kiln proof run steps](../../design/kiln-proof-run-steps.md)) as held; anything that didn't hold comes back as a product decision first.

## Carried forward from Phase 3
- The Windows Ctrl+C path was built but never run on Windows: CI can't send a console Ctrl+C. In the Windows proof run, press Ctrl+C mid-session and check the run reads `interruptedBy: sigint`, no `claude` or `node` process is left, and the next `kiln run` resumes the session. Watch for cmd.exe, which runs npm's `claude.cmd` shim, asking "Terminate batch job (Y/N)?": if that holds the process, the stop takes its full 30-second wait before `taskkill` ends the tree, which is a product decision under AC-KEEP-02.
- Sleep handling was built without proof gate 1's sleep recordings (Doug made them optional on 2026-10-17). On macOS, and on Windows as part of its sleep check, sleep the computer mid-session once: the run should read `interruptedBy: sleep` and be resumed when the session didn't get a model response after waking, and should end on its own when it did.

## Carried forward from Phase 4
Found by the delivery audit of phases 1 to 5 on 2026-10-18, at e11baf4.
- AC-LOOK-03, titles word for word: `headingText` in `src/plan/markdown-sections.ts` strips trailing `#` characters even when no space comes before them (`(.*?)\s*#*\s*$`), so a phase titled "Port to C#" shows as "Port to C" on every screen and in the terminal. Only a closing sequence of `#` that follows a space is dropped (CommonMark); a `#` that is part of the last word stays.

## Carried forward from Phase 5
Found by the same delivery audit.
- AC-WATCH-01, a phase's Details shows its commits: a Needs you row in the phase plan, drawn only on the Disconnected layout (UI-006), has no Commits line. `phaseViews` in `src/engine/snapshot.ts` fills `details.commitCount` and `latestCommit` only from `facts.commitCount` and `facts.pushedSha`, which `recordDone` in `src/engine/engine.ts` writes at Done, so `detailRows` in `view/src/lib/progress.ts` drops the line. For the stopped row, take them from the commits Kiln already reads for the stop (`engine.stoppedCommits`, via `refreshStoppedCommits`).
- AC-LOOK-01, the screens match the mockups: the Kiln panel's green tick circle on Running, Paused and Complete is 22px overall where the mockups draw 24px. The mockup's 22px box with a 1px border has no `box-sizing`, so it renders at 24px; `.tick` in `view/src/components/KilnPanel.svelte` adds `box-sizing: border-box`. Match the mockup's rendered size.

## Inherited from Phase 5
- The browser view is complete. `src/server/view-in-browser.integration.test.ts` renders each drawn screen in a real headless Chrome (found automatically on all three CI runners, or `CHROME_PATH`) from the mockups' sample data in `src/test-support/sample-snapshots.ts`, under Kiln's Content Security Policy. Run it with `KILN_SCREENSHOTS=<folder>` to write each screen beside its mockup as PNGs; on Windows that is the quick check that the screens match there too (AC-INSTALL-03). Headless Chrome doesn't fetch the mockups' Google Fonts, so a mockup's headings fall back to a system serif in its screenshot; the view's bundled fonts are the right ones.
- Proof gate 3 (the stop path) is `scripts/exploration/proof-gate-3-stop-path.mjs`, with its result in `docs/design/kiln-proof-gate-3-results.md`. It satisfies the start checks' "origin on GitHub" with a stand-in `git` that answers `git remote get-url origin`, so it can't open a pull request. AC-PROOF-01 needs a real GitHub-hosted repository, with `gh` signed in to an account that can open pull requests on it, because Kiln confirms the pull request on GitHub (AC-PR-02).
