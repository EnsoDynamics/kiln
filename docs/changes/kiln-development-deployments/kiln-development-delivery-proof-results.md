# Kiln authorized development delivery — Phase 1 proof results

**Execution date:** 2026-10-24 UTC.
**Scope:** [Phase 1 — Authorized development delivery](phase-1-authorized-development-delivery.md). Remembered choices and Needs you grants/activation remain Phase 2.

## Real provider and GitHub boundary

Disposable proof resources are in `EnsoDynamics/kiln-proof-development-delivery-20261024`. Its `main` branch and `kiln-disposable-development` environment are explicitly non-production. No Kiln implementation branch was pushed or landed as part of these proofs.

| Provider | Recorded execution | Source and confirmed result | Actual result |
|---|---|---|---|
| Claude Code 2.1.307 | Session `ed97dabc-faf4-426b-815c-fb7b034615af`; [merged PR #1](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/1); [Actions run 40114023462](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/actions/runs/40114023462) | Source `acb1aedb2af055d875a4b4bcbd2485c593c4a341`; squash result `4419f87f2fef5181165784cdff001a0164ad7bc6` | Actual Claude provider process used the delivery CLI, pinned merge, waited for Actions, downloaded the deployed artifact and verified its bytes through an authoritative Bash result, then synchronized/pushed the same source branch. Phase and all-delivered evaluator checks passed. |
| Codex CLI 0.162.1 | Session `48185583-41e4-443f-a111-a582b02cb077`; [merged PR #2](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/2); [Actions run 40115555488](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/actions/runs/40115555488) | Source `c3214c8f772975992587a6c63a3ecdb197fe0796`; squash result `c4629d82253c15e9d58190c9ba477a54e179e4f1` | Actual Codex provider used the same CLI/evidence contract. Native command result identity/output passed authoritative audit, downloaded artifact bytes were verified, and the full engine returned `complete` without creating a final session. |

The workflow runs its required check, deploys an immutable Actions artifact containing the revision/environment, then downloads and checks that artifact in its verification job. A later successful disposable deployment marked both earlier deployment records inactive. Fresh GitHub/provider reconciliation still passed both historical deliveries, retaining their original verification times and artifacts. The browser's evidence inspector showed the actual inactive/success status history.

Later manual work on Claude's assigned source branch produced current head `5973a821162e845b29c445983df057500c7bd714`. [Open review PR #3](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/3) and merged PR #1 carry reciprocal links and the PRD reference. Fresh reconciliation classified the repository as **mixed**, retained PR #1, required PR #3's exact current head, and the full engine returned `complete`. PR #3 remains open: finalization did not merge the remainder.

A separate read-only policy probe against that actual open PR required human review and confirmed refusal. Requiring an unpassed check likewise refused preparation. The private fixture's account cannot configure GitHub branch protection; no administrator override was used. Pending/blocked policies, queue acceptance, failing latest checks, skipped jobs, unavailable sources and wrong artifact/environment cases supplement the live boundary with the captured GitHub contract and controlled failure injection.

## Browser and retained state

Using the actual built CLI/server and browser:

- Before Start, the option was off. Enabling it identified the canonical repository and base. Start with no confirmed target was refused; changing the named environment cleared confirmation. Reconfirming the exact disposable target permitted Start, and reopening retained the same execution grant. Closed documents without a current delivery assessment remained Needs you.
- The completed Codex execution showed **Development delivered**, separate merge/deployment/verification facts and raw-evidence inspection, original agent/phase history, and no invented final-session row.
- The Claude continuation showed **Development delivered; review remaining**, the historical merged PR and current open review PR, actual commit/line counts and retained workspace.

[All-delivered browser capture](proof/kiln-development-delivery-complete.png) · [Mixed delivery/review browser capture](proof/kiln-development-delivery-mixed-review.png).

## Acceptance evidence

The following tests use real temporary Git repositories/bare origins and, where applicable, the actual loopback HTTP server and CLI. GitHub failure responses replay a contract captured from the live disposable repository; provider-history failure cases use the real verified history shapes beside the live provider runs above.

| Phase 1 criteria | Evidence |
|---|---|
| AC-PERMIT-01, AC-PERMIT-02, AC-PERMIT-04 | Live browser Start/reopen; schema 1–4 migration tests; `development-delivery.integration.test.ts` and server `development-delivery.integration.test.ts`: exact confirmations, stale/wrong execution, atomic grants/write failure, saved scope and late-target refusal. |
| AC-DEV-01, AC-DEV-02, AC-DEV-04 | Both live providers/GitHub; live review/check refusal; latest local failure, later failed check run, legacy failed status, pending/blocked policy and closed-unmerged merge tests. Final review work stays open. |
| AC-DEV-03 | Independent deployment/job/artifact evidence, wrong environment, skipped required job, verification-start ordering, unrelated workflow deployment job, missing/ambiguous result, deadline and transient-source tests. Closed alone never passes. |
| AC-DELIVER-01, AC-DELIVER-02 | `development-evidence.integration.test.ts`: real merge/squash/rebase through intent/reconciliation, source synchronization and coverage, later pushed head/new PR, stale review-head rejection. Existing workspace/add-repository tests retain collision protections; source-continuation tests recreate a deleted remote feature branch. |
| AC-DELIVER-03 | `development-dependencies.integration.test.ts`: two real repositories, failed prerequisite, changed current artifact before unfinished verification, later-phase restoration, remote acceptance before local save, retained earlier deployment/job verification, reciprocal PR links/order and no stale command-probe replay. |
| AC-DELIVER-04 | Real all-delivered/no-final-session and mixed executions; no-early-delivery open review, unresolved/unknown evidence and exact-head tests. Zero-delta/source provenance is evaluated from retained source/merge identities, not file equality. |
| AC-RECOVERY-01 | Launch/fresh/finalization and every resume cause tested with one saved scope, including reply precedence and unchanged restricted prompts. Both actual providers used the same authority/CLI contract. |
| AC-RECOVERY-02, AC-RECOVERY-03 | Engine restart/Check again/resume paths share the evaluator; integration tests cover saved-intent recovery, unknown/no-repeat, confirmed failure retry, corrected checkpoint obligations, document digest invalidation, split ownership/order, persistence rollback and late results. Live reopen/manual-work completion above also passed. |
| AC-DISPLAY-01, AC-DISPLAY-02, AC-DISPLAY-03 | Actual browser Start/recovery/completion above; `development-delivery-screens.test.ts`, progress tests and engine activity tests: intents remain pending, actual merge/deploy/verification activity, further implementation, six original steps, Follow-up/timing, historical Done reopened as Needs you, separate terminal outcomes and merged/review links. Historical restricted screen drawings retain their layout/copy. |

## Verification gates

`npm run verify` passed: dependency audit (zero blocking high/critical findings), lint, TypeScript/Svelte checks, 518 unit/render tests, 16 Codex proof checks, and 533 integration tests (two suite skips). `npm run test:package` passed all four packed-package checks. Independent deliverable review and test hardening were performed; all material findings were corrected before commit. The kept `scripts/proof-run/development-delivery-*` resources reproduce the provider/CLI/GitHub flow and later-work/reopen/policy proofs in the explicitly disposable fixture. Raw private execution/provider logs stay outside the repository.
