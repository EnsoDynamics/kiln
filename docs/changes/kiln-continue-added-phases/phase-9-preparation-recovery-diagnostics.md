# Phase 9: Complete preparation recovery diagnostics

**Added by test audit:** 2026-10-31, after all original and completion leaves through Phase 8 closed. This completes an existing diagnostic requirement; it adds no new preparation grammar or authority.
**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Readiness and Planned Preparation: Preparation document contract, Preparation authority and Verification of the prepared work.

## Summary

Give the writing session a usable preparation correction that retains known facts and identifies facts still missing, while keeping malformed or contradictory instructions blocked.

## Acceptance criteria covered

AC-CONTINUE-07 (completes it; owned by phase 3b). AC-CONTINUE-08 also applies to this work.

## What the audit found missing

- **AC-CONTINUE-07:** `src/engine/preparation-documents.ts::extractPreparation` retains exact error spans and reconcile/commit/recheck recovery, but opening, operand and repository errors discard known source/revision/repository/destination facts in favor of literal `source`, `revision`, `name` and `Phase 8` examples. Dependency, contradictory-destination, unsupported-subordinate and several verification errors omit a replacement example entirely. Unsupported verification prints a fixed example without preserving valid known check facts. The design's Preparation document contract explicitly requires a replacement example using known values. This requirement and the defective messages both landed in `312bca3`; code/history review and an independent requirements reader found no later supersession or intentional exception.

## Phase dependencies

3b (preparation lifecycle and collected extraction tests); 8 (current preparation/verifier behavior).

## Reproduction and proof boundary

The test audit created `src/engine/preparation-recovery-documents.test.ts` temporarily. Its parameterized test name was `retains known preparation facts in $name recovery without accepting the instruction`, with names `malformed opening`, `unsupported operands`, `missing revision`, `missing source`, `ambiguous repository` and `unknown repository`. All six failed their exact recovery-diagnostic assertion in two runs against unchanged `feb514a` implementation; every case still produced an empty instruction array. Logs: `/private/tmp/kiln-recovery-diagnostics-red.log` and `/private/tmp/kiln-recovery-diagnostics-confirmed-red.log`. Per test-audit's delivery-gap rule, neither the failing file nor the exploratory formatter remains in the repository. A local copy is `/private/tmp/kiln-preparation-recovery-documents-failing.test.ts`; the description below is sufficient to recreate the proof without it.

Use `planSourceFromDocuments` with `docs/catalog/phase-9-lending.md`, a parsed dependency `8.`, a Closed Phase 8, and ordinary notes beginning at line 10. The valid imperative is:

```text
First step: merge Phase 8. Merge the local branch `wt/catalog-access` at `1234567` into this phase's branch before building.

Verify before building: run `npm test`.
```

Vary the opening from `merge` to `integrate`; add unsupported `and push` before `before building`; omit `at` and its revision; omit the source branch value; supply affected repositories `comet` and `lending-api` without naming one; and name `unknown-api` instead. Assert refusal, exact `docs/catalog/phase-9-lending.md:10–10`, retained known branch/revision/destination in the correction, explicit unresolved facts, and reconcile/commit/recheck recovery. Derive the final wording from the requirements; the temporary test's sentence formatting is not a new product requirement.

Walk all extraction failure paths together, including parsed-dependency mismatch, linked-row/amendment destination contradiction, unsupported subordinate instructions and malformed/missing verification. Keep valid known command, argv, directory and timeout facts where applicable. A correction must be valid ordinary prose with the required paragraph structure; do not accidentally combine separate instructions into an unparseable paragraph, infer a missing source or authority, or choose between conflicting destination assertions. Explicitly label unknown facts. Preserve the original parser recognition and rejection decisions, quoted/fenced exclusion, shell/path/timeout restrictions, exact spans and existing authority gates.

Strengthen normally collected parser tests and one actual real-Git discovery/readiness assertion showing the usable blocker reaches the offer without setup/provider launch. Existing extraction/offer fixtures provide this boundary. Every new test needs a discriminating red result or documented safety exception; do not disable safety guards. Review the whole criterion against existing qualified evidence, but leave the unfinished preparation/control test-audit batch to the audit chain; do not pursue Strong or implied permutations here.

## Delivery and audit tail

Implementation requires independent deliverable review, applicable test hardening, `npm run verify` and `npm run test:package`. Freeze sources/build output throughout broad integration, retain existing macOS/provider qualifications, and use generated fictional disposable repositories only. No production effects or wider permission profile is authorized.

After the scoped implementation commit and authorized development-base publication, directly launch a fresh whole-PRD delivery audit using GPT 6.1 Sol/high. A clean assessment then directly resumes test-audit on affected evidence and the coherent AC-CONTINUE-07/08 preparation/control boundary pass. The [canonical test-audit record](kiln-continue-added-phases-test-audit.md) owns both exact prior attempts, Doug's revised direction, remaining groups and unchanged grades. This discovery is not a third partial remediation regrade or an attempt reset. Continue the authorized chain until Done or a genuine user-only stop; one implementation leaf per chat.
