# Phase 5: Complete attempt account provenance

**Closed:** 2026-10-27

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "Account and Usage Facts", "Status, Conversations and Handoff", "Validation Boundaries".

## Summary

Keep the last attempt’s reported account, plan and observation time tied to that attempt when a later launch fails before starting.

## Acceptance criteria covered

AC-SEE-03 (completes it; owned by phase 1), AC-ACCOUNT-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-ACCOUNT-01:** `src/control/projection.ts::accountFacts`, reached by `kiln account`, full status and authenticated account/status routes, falls back to global `record.billing.lastLaunch` instead of the selected saved attempt’s provenance. `Engine.runProcess` saves a new inspection there before its durable dispatch checkpoint and before the next attempt exists. A checkpoint failure leaves the prior actual attempt intact but can relabel it with the next account/plan. The prior attempt’s `SessionRun.billing` remains available. Return only correlated attempt facts; missing reliable provenance must remain explicitly unavailable.
- **AC-SEE-03:** The same `accountFacts` path can return an existing Claude `lastRun.account` with a newer prelaunch `lastLaunch.observedAt`. Retain the reported account fact’s own observation time rather than borrowing another reading’s timestamp.

## Phase dependencies

1 (account/status projections); 2 (durable launch admission, correlated attempts and failure handling).

## Scope and closeout

Prove both criteria as a whole through the technical design’s Account facts and Status/history boundaries. Include first Claude launch, resumed Claude attempts, Codex provenance, unavailable facts and next-account separation; exercise a later predispatch failure after the global reading changes, with no new attempt, through the public live and retained interfaces. Existing billing, provider dispatch and delivery authority remain governed by their requirements. This phase adds no account management or new spending authority.

After this phase closes, repeat whole-PRD delivery audit, then whole-PRD test audit only when delivery is clean. Implementation commits follow the implement skill default. Publication of new commits remains held for Doug’s explicit authorization; no production release is authorized.

## Implementation and validation

The public last-attempt projection now uses the selected saved run’s own billing observation for Claude and its per-attempt account provenance for Codex, including that observation’s timestamp. It never borrows execution-level `billing.lastLaunch`. A newer conversation with no recorded attempt does not displace the last actual attempt. An older Claude run with only an undated `AccountIdentity` and no saved billing exposes unavailable provenance rather than borrowing identity, plan or time from a nearby reading.

Incomplete saved history cannot establish which attempt was last. Missing/corrupt records now make last/original provenance explicitly unavailable, with `state_unavailable` and exit 4 through live account/refresh, full status and retained CLI reads. Independently known next-account facts remain available; if the live browser projection fails, cached facts retain their dates and stale labels. Account and full-status reads share this partial-result behavior.

Codex recovery observations now retain their own optional observation date and stale flag in metadata. A failed usage refresh can retain dated old gauges while reporting newly observed recovery uncertainty at its actual reading time. An identity-read failure marks retained recovery permission stale at its original date. This separates display freshness without changing any launch/recovery authorization. If corrupt session history also prevents reading controls, status returns the explicit error, a null status token and unavailable controls instead of losing its partial account result.

The required failure exercise exposed an unhandled dispatch-checkpoint exception. The predispatch boundary now reports that write failure and records that no provider started, retaining the journal’s blocking fault and public inspection. No new attempt is created. The account-refresh exercise also exposed bodyless POSTs rejected because the Node HTTP adapter supplies an empty body stream. Refresh now checks for bytes with a bounded read, retaining rejection of supplied inputs.

The account-provenance integration tests run the real engine, disposable Git origins, private state, authenticated loopback HTTP and the built CLI from an unrelated directory. Provider subprocess peers implement the repository’s verified contracts; only the checkpoint disk failure is injected. They cover first Claude launch, a successful resume on another account, a third account saved globally before checkpoint failure, unchanged saved attempt count and account/plan/time, public account/full-status route parity, independent current identity/usage observations, text output and pure disconnected reads. Codex launch/resume/original provenance, distinct next-account identity, provider window IDs/durations/percentages/resets and recovery permission retain their own dates. Legacy missing provenance and a newer conversation without attempts are explicit cases. The existing inspection fixture now supplies dated per-attempt billing and asserts its exact time instead of relying on undated identity plus unrelated global billing.

Fresh-eyes test hardening additionally checks public failed-usage refresh behavior, retained usage dates/values with stale labels and recovery uncertainty, literal Codex account/plan expectations, invocation-bounded UTC collection times and disconnected controls/token. Missing and corrupt later session records are exercised live and retained without promoting an older readable account or mutating saved state.

Actual read-only provider checks on 2026-10-27 used the existing sign-ins and Kiln’s unchanged metadata readers. Claude Code 2.1.311 returned identity, plan and session/weekly/scoped-weekly usage at `2026-10-27T15:51:28.399Z`. Codex CLI 0.162.1 returned identity, plan and its reported usage bucket at `2026-10-27T15:51:14.376Z`, with no readiness blockers. No sign-in change or model turn was made. These reads verify provider metadata contracts; changed-account and disk-failure scenarios use disposable deterministic peers, not changes to Doug’s accounts. Earlier provider/Grok workflow proof and its limits remain in [release validation](kiln-bot-control-validation.md).

Independent deliverable review is clean after fixing incomplete-history handling and independent recovery freshness. Fresh-eyes test hardening grades both complete criteria adequate and its requested public failure/freshness assertions are implemented. The final full `npm run verify` completed on upstream baseline `efee56d` plus Phase 5: dependency audit has zero blocking findings; lint and TypeScript/Svelte checks pass; 624 unit tests and 17 provider-contract checks pass; integration has 808 passes, two existing skips and the two baseline failures below across 68 files (1,248.91 seconds). All five Phase 5 account-provenance regressions pass in that complete run. The full gate is explicitly not entirely green. The isolated test PATH uses the existing qualified Claude Code 2.1.307 binary for billing qualification without changing Doug’s default installation. Final log: `/private/tmp/kiln-botcontrol-ph5-final-verify.log`.

All six `npm run test:package` checks pass against the packed, installed artifact from unrelated directories (49.72 seconds). Log: `/private/tmp/kiln-botcontrol-ph5-package.log`. The integrated baseline preserves upstream live-session dispatch/ownership protections; no production release or publication occurred in this phase.

## Known baseline failures

The final full verification run reported two failures outside Phase 5’s changed behavior. The usage-limit test `takes a reading a minute after the limit's reset time` starts its five-second timer budget before fixture setup. It passes alone on Phase 5 and upstream `efee56d`; unchanged upstream production code reproduces the timeout when a six-second delay is inserted only into the disposable archive’s fixture setup, with the original assertion preserved. The live-takeover test `replays durable completion evidence after restart and rejects completion changed during final ownership checks` also fails on upstream `efee56d` (expected `check_unavailable`, received `ok: true`) and passes on an isolated Phase 5 rerun. Neither test or its production path was changed to make this phase pass.

Baseline/current comparison logs are under `/private/tmp/kiln-botcontrol-ph5-{baseline,current}-timer.log`, `/private/tmp/kiln-botcontrol-ph5-baseline-slow-setup.log` and `/private/tmp/kiln-botcontrol-ph5-{baseline,current}-takeover.log`. The baseline is a disposable `git archive`, not another checkout or clone. These are machine-local diagnostics; the result and limits above are the durable evidence. The fresh audit must distinguish these existing failures from Phase 5 regressions and must not claim a completely green full gate.

## Audit handoff

The prior delivery audit is a historical gap baseline. After Phase 5 closes, run a fresh whole-PRD delivery audit in a separate chat; only a clean delivery audit proceeds to the whole-PRD test audit. Scoped commits are authorized by the implementation skill. Publishing Phase 5 commits remains held for Doug’s explicit authorization, and no production release is authorized.
