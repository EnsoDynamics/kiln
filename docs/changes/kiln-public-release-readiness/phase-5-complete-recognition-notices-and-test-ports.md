# Phase 5: Complete billing recognition, compatibility notices and test ports

**Closed:** 2026-11-04

**Added by delivery audit:** 2026-11-04, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln public release readiness](kiln-public-release-readiness-prd.md)
**Technical design:** [technical design](kiln-public-release-readiness-technical-design.md) — Design Decisions rows Billing recognition, Version comparison, Takeover hook recognition, Compatibility notices, Test ports; Repository, Package and Documentation Changes (CI evidence).
**Phase plan:** [Execution order](kiln-public-release-readiness-phase-plan.md)

## Summary
Billing settings in a shape Kiln doesn't recognise show **Claude Code settings**, never **Claude subscription**. Live control turned off by an unreadable Claude Code version, or by a hook problem first seen after Kiln restarts, is named in the Agent compatibility panel and `kiln status` like every other incompatibility. The last tests on fixed ports get ports from the operating system.

## Acceptance criteria covered
AC-AGENT-02 (completes it; owned by phase 1), AC-AGENT-04 (completes it; owned by phase 1), AC-CI-01 (completes it; owned by phase 4)

## What the audit found missing
- **AC-AGENT-02:** `extractInventory` in `src/billing/contract.ts` tests `input.effective` only for truthiness and reads `effective`, `effective.env`, a tier's `settings` and `settings.env` through `object()`, which turns any non-object into `{}`. A resolver result whose `effective` or `effective.env` is an array, string or number therefore stays `complete: true`, and with claude.ai first-party sign-in shows **Claude subscription** (Billing recognition row: "an effective settings object", "every billing field Kiln reads has the expected type"). Reached from the settings worker through `resolveInventory` → `readInventory` → `classify`.
- **AC-AGENT-04, unreadable version:** the live control launch block in `Engine.runProcess` (`src/engine/engine.ts`, around lines 3639–3663) leaves `live` unset when `claude --version` fails or `compareToMinimum` reports `unrecognised`, and writes no `live_messages` or `takeover` notice. The Version comparison row asks for both, with `agentVersion` `unrecognised`, so the panel and `kiln status` name the feature and version. `src/live/takeover.integration.test.ts` ("refuses it before any hold when the version is unrecognised") asserts the no-notice behaviour and changes with it.
- **AC-AGENT-04, after a restart:** `observeHookContract` runs only from the launching controller's `onLiveEvent` and `onLiveExit` (`engine.ts:3706-3707`). When Kiln restarts on an attempt whose checkpoint hook wrote `gate.contract`, whether the Claude process is still running or has exited (`decideQuietly`'s recovered branches, `observeRecoveredLive`, `reconcileTakeoverOnce`), no `takeover` notice reaches the record and the run keeps `hookContract: "unproven"`. So the panel and `kiln status` never name it once the attempt ends, and the next attempt on that version launches with the hook again (Compatibility notices row).
- **AC-CI-01:** `src/state/instance-lock.integration.test.ts` still listens on fixed ports: "refuses to move the address…" listens on a port from Kiln's default range 4700–4799, and "skips ports in use when assigning…" passes `{ first: 4790, last: 4791 }` and listens there. Commit `a951369` kept it on purpose to prove Kiln's own range, which no requirement records. `scripts/proof-run/phase-handoff-provider-proof.mjs:73`, run by `npm run test:live-proof`, scans the fixed range 41940–41958 with `isPortFree` before `startLocalServer` (Test ports row).

## Phase dependencies
1 (billing inventory, compatibility notices); 2 (live control launch, checkpoint hook, recovered attempts); 4 (OS-assigned test ports, `src/test-support/os-ports.ts`).

## Phase-specific notes
- This phase changes product code after the candidate checks ran on release pull request #2, so the release candidate becomes this phase's last commit. AC-CI-02 and AC-CI-03 hold again only once that candidate's development CI and pull request #2's next candidate run end green, recorded as the technical design's CI evidence bullet says (`kiln-public-release-readiness-ci-reruns.md`, the pull request description). The candidate scan is repeated only if the fix touches files other than code and tests.
- Every push to `develop` reruns the candidate checks on pull request #2. Push only when Doug says so.

## Outcome
- AC-AGENT-02: `extractInventory` requires the resolver result, `effective` and every source entry to be objects, and `effective.env`, a tier's `settings` and `settings.env` to be objects when present; anything else leaves inventory incomplete (`src/billing/inspection.test.ts`).
- AC-AGENT-04: an unreadable or failing `claude --version` writes a **Message Claude** and a **Pause & take over** notice giving `unrecognised`, shown as the attempt's live reasons, in the panel and in `kiln status`. A `gate.contract` the checkpoint hook wrote while no controller watched is read when Kiln restarts, from `decideQuietly` for an exited attempt and on each recovered-attempt check for a running one (`src/live/live-compatibility.integration.test.ts`, `src/live/takeover.integration.test.ts`).
- AC-CI-01: both instance lock tests take their ports from the operating system, and the handoff proof listens on port 0. Its disposable PRD also gained the `## Acceptance Criteria` heading the audit snapshot requires, without which `npm run test:live-proof` already failed before this phase; it passed on Claude Code 2.1.318.
- AC-CI-02 and AC-CI-03 on the new candidate `f64ce40`: development CI green on its first attempt, recorded in [kiln-public-release-readiness-ci-reruns.md](kiln-public-release-readiness-ci-reruns.md); the candidate checks on release pull request #2 green after one macOS rerun, recorded with every earlier failure in the pull request's description. Two of those failures were fixed on `develop` (`ecb5d84`, `f64ce40`) and the macOS job limit raised to 60 minutes (`d4e6e20`).
