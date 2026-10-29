# Kiln completed-plan checks validation

**Scope:** Phase 2a — Check current plans on completed features, of [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md). Validation date: 2026-10-29. The checks implement AC-FIND-01, AC-FIND-02, AC-FIND-04 and AC-CONTINUE-03; classification/preparation/readiness remains Phase 2b, and acceptance/execution remains Phase 3.

## Boundary evidence

`src/engine/completed-plan-discovery.integration.test.ts` uses disposable repositories and actual bare Git origins, the real engine, authenticated HTTP, actual `runKilnCommand`, and headless Chrome. Its fictional catalog/lending fixture proves shared local additions, immutable delivery-base reads, stale shared copies, divergent sources, legacy completion recovery after deleting an old workspace/branch, required-source errors, persistence and concurrent request joining. Discovery starts no provider sessions and performs no checkout, reset, merge or push. This phase adds no provider execution path; actual preparation/provider proof belongs to the later phases.

The browser proof exercises mount, reload and manual retry at 1200 and 390 pixels, checks displayed source/revision and exact successful time, and preserves the historical delivery link across successful and failed checks. A failed origin read keeps the prior result and time explicitly labelled earlier, shows an unknown current count and leaves retry available. Screenshots are inspected for clipping and settled success/failure feedback.

Completed identity removal, reopening, material edits and splitting must return a blocked observation naming the earlier phase. Equivalent formatting and a filename rename do not reopen it. Legacy split recovery follows recursive first-leaf ownership. A scheduled mutation after a real Git read proves moving inputs cannot publish a fresh result; only scheduling is intercepted, not Git results.

## Independent review and hardening

Fresh-eyes deliverable review found nested-split legacy receipt lookup and a blocked CLI path printing a misleading zero. Both were corrected, with regression assertions. Independent test hardening identified missing browser provenance/history assertions, weak blocked-state assertions, missing completed-leaf split coverage and the moving-source boundary. The existing tests were strengthened accordingly. The harness uses real audit routing for these no-launch fixtures.

Older Complete mockup coordinate tests retain comparison of historical content after removing the newly required check panel only for the legacy drawing comparison; the actual panel is covered through the real browser/Git test. The existing completed-run CLI regression now asserts a current-plan limitation for its still-unfinished shared/base documents while retaining delivery-history backfill and unchanged provider-call assertions. These are explicit changes under FIND-01/02/04, not weaker completion assertions.

## Verification status

- Dependency audit: zero blocking high/critical findings. Lint, TypeScript and Svelte checks passed; Svelte reported zero warnings/errors. All 653 unit tests, 14 release checks and 18 Codex proof checks passed.
- The full `npm run verify` invocation exercised all 101 integration files: 1,133 passed, six failed and two existing skips. Its exit code was 1. Two failures were legacy Complete coordinates shifted by the new panel; one was the legacy CLI waiting for unconditional PR-ready output. Three hardened tests loaded cached pre-review source during the in-progress run and exposed the already-corrected nested-split lookup and CLI wording. The final log confirms the old wording in the failing output.
- After that run ended, the final build and a fresh invocation of all three affected files passed all 99 tests. Across the full run and fresh rechecks, all 1,139 applicable integration cases are accounted for, with two existing skips. This is combined evidence, not a claim that one uninterrupted `verify` invocation exited zero. No assertions or deadlines were weakened to obtain these results.
- The eight source-only hardening cases also passed separately against fresh source. The ten-case completed-discovery file passed in the final three-file run, including the real CLI and browser assertions. Desktop and narrow success/failure screenshots were inspected; settled mobile success is explicitly captured.
- All eight installed-package tests passed. Final unit rerun also passed all 653 tests.

Local validation logs: `/tmp/kiln-phase2a-verify.log`, `/tmp/kiln-phase2a-source-hardened.log`, `/tmp/kiln-phase2a-final-rechecks.log`, `/tmp/kiln-phase2a-package.log`. Browser captures: `/tmp/kiln-completed-discovery-{1200,390}.png` and `/tmp/kiln-completed-discovery-failed-{1200,390}.png`. Qualified isolated Codex 0.162.1 and the repository's pinned Claude 2.1.307 were used by existing proof gates; global installations were not modified.
