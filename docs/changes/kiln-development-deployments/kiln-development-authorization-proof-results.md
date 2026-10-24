# Kiln remembered targets and execution grants — Phase 2 proof results

**Execution date:** 2026-10-24 UTC.
**Scope:** [Phase 2 — Remembered targets and execution grants](phase-2-remembered-targets-grants.md), AC-PERMIT-03 and AC-PERMIT-05, with the recurring Phase 1 authorization, evidence, recovery and display constraints.

## Real browser, API and private storage

`development-grants-browser.integration.test.ts` drives actual Chrome against the authenticated loopback server and real temporary Git repositories: a documents-only requirements repository plus API and web repositories. It selects and confirms both exact development targets, saves their displayed requirements-repository storage group, explicitly chooses reuse, presses Start and observes only API/web grants. A separate Needs you grant adds another exact API environment without resuming or creating a product-repository grant.

`development-grants.integration.test.ts` exercises different PRDs sharing the requirements repository, an initially unselected saved choice, explicit matching-target reuse, a changed base remaining unchecked, stale save/reuse revisions, active-execution settings refusal, malformed/mismatched grants, atomic-write failure rollback, restart idempotency and notes conferring no authority. Earlier completed and stopped leaves require assessments in plan order; Check again invents none and future scope is refused. Historical phase/session/push facts remain unchanged.

`development-preferences.test.ts` covers canonical origin and real-checkout isolation and names corrupt/newer preference files. `development-preferences.integration.test.ts` races two actual Node processes against the private file: exactly one revision-0 save wins and the other is refused, with the winner's exact targets retained. Preferences live outside repositories and have a separate atomic revision from execution authorization.

## Real provider recovery and inherited GitHub evidence

The kept `scripts/proof-run/development-activation-proof.mjs` runner creates new private local workspaces/state and reads the inherited explicitly non-production repository `EnsoDynamics/kiln-proof-development-delivery-20261024`. It does not modify the Phase 1 proof workspaces or write to GitHub. The controlled fixture retains the actual historical merge and source-synchronization identities, while omitting the earlier verification result and using an outdated assessment digest. Its stopped provider conversation first runs with disabled authority, then receives an explicit authenticated Needs you grant and resumes the same conversation under the saved exact target.

| Provider | Recovery session | Independently reread historical delivery | Result |
|---|---|---|---|
| Claude Code 2.1.307 | `6737844a-5bc9-4bd4-b5b0-24925cf0a720` | [PR #1](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/1), squash result `4419f87f2fef5181165784cdff001a0164ad7bc6`, [Actions artifact run 40114023462](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/actions/runs/40114023462) | Earlier/stopped assessments passed; the direct provider command downloaded the immutable artifact and checked its actual bytes. |
| Codex CLI 0.162.1 | `df052334-73e2-4c24-a03f-86d6bc83a321` | [PR #2](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/2), squash result `c4629d82253c15e9d58190c9ba477a54e179e4f1`, [Actions artifact run 40115555488](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/actions/runs/40115555488) | The same CLI/evidence contract passed using native authoritative command/result identity and the actual downloaded artifact. |

Both runs retained the historical `doneAt`, session list, pushed SHA and commit count, reused the single confirmed merge and existing deployment, refused a future leaf assessment, and retained the exact grant after restart. An identical retry with the original authorization revision was idempotent. The stopped implementation leaf deliberately remained open; current assessments did not manufacture closure or start the future phase. Raw execution records, authoritative provider histories and evidence digests remain in private proof state outside the repository.

The evidence reader can refuse a changing live Codex log as inconclusive. A stable subsequent reconciliation preserves and reuses the same command evidence; no retry of a remotely accepted merge/deployment is needed. The runner permits a normal subsequent Resume solely for a still-missing stopped-leaf assessment after that reconciliation.

## Verification and review

`VITEST_MAX_WORKERS=4 npm run verify` passed: dependency audit (zero blocking high/critical findings), lint, TypeScript/Svelte checks, 520 unit/render tests, 16 Codex proof checks, and 548 integration tests (two pre-existing suite skips). The four-worker run exercises the full suite while reducing contention from model-discovery helper processes during temporary-fixture cleanup. `npm run test:package` passed all four packed-installation checks. The explicit null/scalar corrupt-preference cases also passed their focused validation after the reader was tightened.

Independent deliverable review and test hardening were performed. All material findings were corrected and their focused regression checks passed, including earlier dependency probes, ancestor-origin split obligations, stale preference refresh/display, first-session recovery startup, future-leaf dispatch prevention, and historical finalization recovery retaining required checks/review and the final-remainder merge refusal. Preferences changed by another PRD leave active authority unchanged across reopen; execution-only grants leave the preference file byte-for-byte unchanged.
