# Kiln integrated continuation validation

**Scope:** Phase 3a of Kiln Continue Added Phases. Preparation-dependent acceptance, target-grant adoption and engine-owned preparation verification remain Phase 3b.
**Validation date:** 2026-10-30 UTC.
**Gate state:** Complete. Phase 3a is closed with the final uninterrupted verification and package gates passing.

## Boundary evidence

| Criteria | Evidence |
|---|---|
| AC-OFFER-02 / AC-OFFER-03 | Real Chrome at 1200 and 390 pixels exercises Not now, visible return, stale-base rejection and a separate fresh choice. Engine integration checks changed settings, duplicate IDs, replay and base movement during accepted setup. |
| AC-CONTINUE-01 | Two full continuation cycles retain original completion times, earlier phase/session associations and distinct delivery links. Both ordinary merge and prior squash integration are covered. Legacy final-session output is read with an explicit historical execution, including paging beyond 200 lines; default current output refuses that old session. |
| AC-CONTINUE-05 | Seven added phases run, a delivery audit adds Phase 16, that completion leaf runs without another Continue, delivery/test audits pass and a new PR is recorded. A second continuation adds Phase 17 and records a separate PR after new audits; the earlier three accepted audit activities cannot finish it. |
| AC-CONTINUE-06 | Real Git current-base setup in two repositories preserves unrelated untracked shared work and occupied user files. Partial collision retry retains the same execution; changed-base retry stays held and requires a new explicit choice. |
| AC-CONTINUE-08 | New execution clears seeded old target grants and paid approval while preserving them in its archive. Billing still blocks dispatch; settings cannot change during setup. Pause survives restart and starts only the next unfinished phase. Both installed providers retain selected model/effort but use fresh conversations. |

The checked-in portfolio is `src/engine/continuation-execution.integration.test.ts` with inherited readiness/accounting/inspection coverage. Git, worktrees, HTTP, CLI audit handoffs, Chrome and controller termination are real; scripted provider/GitHub responses make costly external workflow outcomes deterministic. Installed-provider admission is separately proved below.

## Actual providers

`node scripts/proof-run/continuation-provider-proof.mjs claude_code` and the same command with `codex` use the production engine and authenticated HTTP acceptance against disposable local origins. Providers are instructed only to converse; the driver owns every fixture write. Each begins an earlier actual conversation, retains its completed execution, publishes another phase, accepts the displayed proposal and observes a distinct provider conversation with one launch. Exact replay starts no second turn; old history remains one run. Fresh provider/model/effort selection and successful new response are asserted, and the earlier conversation marker is absent.

The strict successful observations used Claude Code 2.1.307 / Opus high and Codex 0.162.1 / GPT 6.1 Sol high. This proves fresh integrated-prerequisite admission; it does not claim Phase 3b's preparation-to-verification-to-implementation proof.

## Durability and review

Real controller termination covers command intent, durable acceptance, partial setup, active-record publication before aliases are rebuilt and an actually dispatched provider. Restart preserves one accepted identity and never duplicates a conversation. Lost durability acknowledgements are injected after real writes of initial acceptance sidecar, acceptance record, workspace-progress record, integrated baseline, active acceptance sidecar and activation record. Mutations fault until restart reconciles disk.

Independent deliverable review found and resolved alias rotation/recovery, retained squash integration coverage, settings admission during setup, historical delivery links, historical output paging and complete metadata fault ownership. Final source review found no remaining material issue. Test hardening strengthened seeded prior-authority isolation, immediate pre-settings stale-offer rejection and changed-base interrupted setup. Browser screenshots were inspected at both supported widths without clipping.

## Repository gates and delivery

Final `npm run verify` passed uninterrupted: dependency audit, lint, type checking (zero errors/warnings), 665 unit tests, 14 release checks, 18 Codex contract checks, and 106 integration files with 1,178 passing cases and two existing skips (1,412.64 seconds). `npm run test:package` passed all eight cases (28.62 seconds). All source/test hashes remained frozen through the final run. Both actual providers passed the separate strict fresh-conversation proof; direct retained-session checks also confirmed the selected provider/model/high effort.

The first broad diagnostic was intentionally stopped after an obsolete Phase 2 browser assertion rejected the newly present disabled Continue button. Its corrected test asserts exactly one disabled Continue action and zero provider calls at both widths, and passed independently before the complete fresh gate. That interrupted run is not counted as complete verification. Earlier focused failures were fixture metadata/identity or authority-consistency mistakes, corrected before the final portfolio; no failing assertion was removed or skipped to make the gate pass.

Independent deliverable review and test hardening are complete. No required human action remains for this leaf. The finished Phase 1–2b2 prefix was already published as `1e4accd`; the scoped implementation commit carries this record and is integrated by a normal fast-forward develop push. Phase 3b owns the remaining planned preparation workflow and the whole-PRD audits follow all implementation leaves.
