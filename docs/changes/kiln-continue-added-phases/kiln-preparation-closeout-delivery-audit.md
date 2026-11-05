# Kiln Continue Added Phases — whole-PRD delivery audit after preparation completion

**Assessment date:** 2026-10-30 UTC.
**Implementation baseline:** `c292166f85043e67660678e9dc594dbb0ca2d5c3`.
**Scope:** all 18 active criteria and all nine closed implementation leaves (1, 2a, 2b1, 2b2, 3a, 3b, 4, 5 and 6). Split records 2, 2b and 3 are not executable leaves. AC-CONTINUE-02 and AC-CONTINUE-04 are retired into their documented replacement pairs.
**Outcome:** nine criteria are partly implemented; thirteen confirmed missing boundaries are assigned to completion Phases 7 and 8. No criterion is wholly unimplemented. No Waiting on a human action or Changed outside the requirements row was found. Proposed CONTINUE-001/002 retain their declared nonblocking status.

## Fresh assessment and rounds

Twenty-four fresh assessors read the governing PRD, assumptions, single technical design, phase plan and applicable closed leaves from disk, deriving required behavior before reading code. Each assessed up to four criteria; AC-CONTINUE-07 had a dedicated reader in every round. They traced entry points and variants without consulting historical audit/test-audit conclusions or changing implementation/tests. The main assessor reviewed every record, independently traced omitted variants, confirmed each gap, checked siblings and ran requirements conflict checks.

| Round | New confirmed missing boundaries | Scope |
|---|---:|---|
| 1 | 1 | All 18 active criteria; newly closed known-source work. |
| 2 | 7 | All 18, regrouped; historical artifact dependency, browser/lookup failures, split prerequisite and three native-attempt recovery boundaries. |
| 3 | 3 | All 18, regrouped; explicit supplied source, completed split order and later terminal discovery reporting. |
| 4 | 2 | All 18, regrouped; false grant supersession and failed durable-check publication. |

The fourth round still confirmed new gaps. Assessment ended at the delivery-audit skill's four-round limit; this is not a convergence claim. All confirmed gaps go into the two completion leaves together. A fresh whole-PRD delivery audit is required after both close, before test audit.

## Per-criterion assessment

Paths below are repository-relative. Shared engine entry points are `src/kiln-command.ts::underway` → `Engine.prepare`/`decideQuietly`; completed browser mount/reload/button → `POST /api/continuation/check` → `checkCompletedPlanOwned`; Continue → internal journal → `acceptContinuation`; manual controls and ordinary provider return → reconciliation/completion checks.

| Criterion | Status | Required parts and reachable trace |
|---|---|---|
| AC-HANDBACK-01 | Implemented | Manual Resume/Verify, unfinished restart, normal/interrupted/wait return, audits/finalization and preparation return/admission reread through `readPlan`. `observePlan`, phase parsing, `addedLeaves`, immutable publication and snapshot/App/terminal notices recognize append/split IDs and remaining leaves. |
| AC-HANDBACK-02 | Implemented | Successful checks/`recordDone` return to `drive` → `nextActivity` → next eligible leaf/audit/delivery. `judgedPhase` handles first-descendant settlement; split parents do not execute. Manual ownership, pause, dependencies, usage/billing, provider selection and repository admission remain gates. |
| AC-HANDBACK-03 | Partly implemented | Active workspaces use ordinary Closed/Committed/Pushed/provenance rules without merge-to-base. Known-source failures/mismatches normally block with safe reconciliation instructions. G1 and G9 leave two source variants unobserved. |
| AC-HANDBACK-04 | Implemented | Reconciliation precedes selection and audit/final acceptance; `requireCurrentAudits`, snapshot/currentness checks and no-open-leaf checks cover revised scope. Earlier receipts remain, external closure needs evidence, split parents skip, and already-complete Resume retains its explicit advance choice. |
| AC-FIND-01 | Implemented | CLI prepare, completed-page mount/reload and explicit check route observe without launching; checks join, expose status/time and retry, and introduce no polling/service. Failure projection and later terminal parity gaps are separately recorded under FIND-04/OFFER-01. |
| AC-FIND-02 | Partly implemented | `discoverCompletedPlan` reads coherent saved shared bytes and fetched configured-base Git objects, compares each to retained history, rechecks movement and exposes source/revision/local-unintegrated/conflict facts. G2 makes the complete enabled-delivery CLI path depend on deleted historical artifacts afterward. |
| AC-FIND-03 | Partly implemented | Parser/accounting count actual ordered new unfinished leaves, exclude parents/gaps/renames/closed work, and separate external verified/unverified and earlier-work rows. External evidence binds scope, every repository, publication/integration and retained Claude/Codex provenance where applicable. Assumptions-only changes invent no leaf. G10 misses an unsafe completed split-order change in that classification. |
| AC-FIND-04 | Partly implemented | Ordinary source/parser/network/movement/legacy/deadline/capacity failures retain earlier evidence and recovery; one 120-second signal covers retained provenance and typed 8 MiB/10,000-phase failures reach HTTP 413. G3, G4 and G13 omit local-browser, repository-lookup and publication failure variants. |
| AC-OFFER-01 | Partly implemented | Complete renders New phases found and the ordered count/IDs/titles/first/readiness panel before single/multiple-repository history. Startup terminal formatting uses the same observation and page address. G11 omits terminal output for later discoveries. |
| AC-OFFER-02 | Partly implemented | Current ready acceptance rechecks proposal identity and starts integrated/preparation work through one journal owner. Not now is local, starts nothing and keeps Show continuation offer; remount restores it. Unchanged success retains completion/time. G12 prevents the target-preparation choice from becoming usable for stable equivalent sources. |
| AC-OFFER-03 | Implemented | Exact documents/leaves/base/prerequisite/source/settings/authority bind the offer; real changes refresh/refuse before setup. Durable command lookup, acceptance/setup/activation linkage, uncertain-write faults and provider dispatch ownership prevent duplicate execution across stale tabs, requests and restarts. |
| AC-CONTINUE-01 | Implemented | `retainExecution` preserves original phase/session/delivery/time/legacy bindings; fresh activation clears current owners and starts new provider conversations. Current-only controls/inventory and exact historical execution/output routes prevent archived resume. Closed-only outside work cannot pass accounting. |
| AC-CONTINUE-03 | Partly implemented | Direct completed identity/scope/closure/dependency/repository changes, reopening and splitting are blocked; versioned normalization preserves harmless formatting/phase-link renames and historical metadata. Original inherited repositories survive migration. G10 omits completed enclosing split order/ownership. |
| AC-CONTINUE-05 | Implemented | Fresh required audits/ledger/session state plus the ordinary drive loop run remaining and audit-added leaves without another Continue. Current whole-PRD manifests, repository evidence and final checks prevent reuse of old audit/PR success; new completion/delivery remains beside archives. |
| AC-CONTINUE-06 | Implemented | Readiness pins current all-repository bases and one committed governing set. `prepareWorkspaces` validates placement/ownership/branch/base/clean state, saves partial progress and rejects collisions without resets. Revalidation around setup and exact fresh document digest precede new provider dispatch. |
| AC-CONTINUE-07 | Partly implemented | Leaf preparation grammar/source/all-repository authority, preparation-only turns, typed submission, existing tracked release/provenance, native checks/checkpoints/output and same-conversation admission are wired for both providers. G5–G8 omit split prerequisites and native recovery/ownership intersections. |
| AC-CONTINUE-08 | Implemented | Fresh billing and restricted/exactly adopted grants preserve current Claude/Codex selection, usage, pause/resume, workspace/new-repository and native permission/sandbox/hook controls. Continue adds no broader production, destructive, spending or delivery authority. |
| AC-CONTINUE-09 | Partly implemented | Exact fresh-run target disclosure/checkbox remains separate from Continue and preferences/setup. Durable pending reservation, replay/adoption and genuine changed-input supersession are wired. G12 falsely supersedes unchanged equivalent sources. |

## Confirmed missing boundaries and sibling checks

### G1 — A new known-source closure is silently accepted

`src/engine/plan-reconciliation.ts::sourceDiscrepancies` detects reopening (`earlier.closed && !phase.closed`) but not open-to-Closed movement. Its active comparison also omits the forward closure mismatch. `Engine.readPlan` then retains that source observation; `nextActivity` can schedule the still-open active leaf, forgetting that a known source just closed it.

A fictional in-memory probe against compiled exports produced: active open/previous known open/current known Closed → `[]`; reverse reopening → `["1"]`; unchanged stale shared open → `[]`. The missing case changes remaining work, unlike an unchanged older shared copy. Siblings checked: new absent closed phase, scope/dependency edits, removal, reopening and unchanged metadata. This does not itself accept an outside completion without evidence; it ignores the newer completion claim. **AC-HANDBACK-03; Phase 7.**

### G2 — Enabled historical delivery still requires old execution artifacts

Completed CLI startup first discovers from shared/base sources, then `Engine.decideQuietly` calls `readPlan`, `unresolvedDeliveryLeaf` and `pullRequestCheck` for a historically completed development-enabled run. `development-delivery.ts::evaluateRepositories` requires the historical worktree and its exact pushed feature ref, including a repeated end check. Deleting that ref alone can fail reconciliation despite retained delivered evidence, clear `developmentDelivery.currentComplete`, and change the page to Needs you. Later `prepare` skips discovery and `checkCompletedPlan`/continuation admission refuse it as unfinished.

The restricted-delivery sibling returns directly through `currentlyComplete`; the new discovery readers themselves do not require the old workspace. Check the complete entry path, including both missing old ref and missing old worktree, while preserving genuinely required historical/current prerequisite evidence. **AC-FIND-02; Phase 7.**

### G3 — Browser-local failed checks leave stale success executable

`view/src/components/CompletedPlanCheck.svelte::refresh` records fetch rejection, invalid JSON or non-success responses without `answer.check` only in local `error`. `earlier` depends exclusively on engine status. After `pending` clears, prior unchanged state can still headline No new phases found, and prior ready state can reenable Continue/target controls with current-looking counts/readiness/source.

Engine-returned failed observations correctly label earlier information; failures before an engine observation, generic admission/read errors and local transport/response failures are the missing siblings. Retry/history remain available. **AC-FIND-04; Phase 7.**

### G4 — Repository lookup failures become successful blocked observations

`repositories.ts::findRepository` turns failed parent listing, failed `rev-parse --show-toplevel` and failed `remote get-url origin` into ordinary lookup problems. `evaluateContinuationReadiness` and `accountCompletedLeaves` push these problems and continue. Discovery consequently publishes blocked success, advances `lastSuccessfulAt` and loses unknown/earlier classification.

A read-only call using an unavailable Git executable against an actual valid checkout returned “isn’t a Git checkout,” confirming loss of helper-failure evidence. The adjacent `originBranches` failure now throws correctly; existing-repository base reads also propagate failure. Preserve positive known absence/misconfiguration separately from unreadable data, unavailable helpers and interrupted reads. **AC-FIND-04; Phase 7.**

### G5 — Split-parent preparation cannot bind its completed leaves

`extractPreparation` accepts dependency `8` and First step: merge Phase 8. Source validation in `evaluateContinuationReadiness` then requires parent `8.closed`; its preparation eligibility matches binding/dependency IDs only against accounting leaves `8a`/`8b`. A valid split parent normally has no Closed marker. Adding that marker cannot fix exact leaf matching. The final dependency loop already expands parent descendants for integrated work.

A compiled parser/extractor probe returned no plan/extraction problems, dependency/binding `8`, closed leaves `8a`/`8b`, no exact leaf matches and parent Closed false. Both carried and external split prerequisites, every affected repository, runtime pending exemptions and completion receipt publication need the same coherent treatment. Exact-ID uses in `readPlan`, `unresolvedDeliveryLeaf` and `advancePreparation` are affected siblings. **AC-CONTINUE-07; Phase 8.**

### G6 — Known prelaunch native failures cannot recover

`verifyPreparation` saves a running attempt before `executeCheck` repeats environment projection, creates output and reads sandbox/hooks. Those operations precede its main try block. A known no-launch error can leave a running attempt without PID/start identity; spawn failure has a related no-PID outcome. Both subsequent verification and explicit `Engine.resumeSession` call `reconcilePreparationAttempt`, which always rejects missing identity. Correcting the originating environment/output/hook problem cannot recover within the activity.

Keep genuinely ambiguous launch outcomes held; the missing behavior is durable distinction and normal recovery for positively known no-launch failure. **AC-CONTINUE-07; Phase 8.**

### G7 — Native inventory obstacles cannot be retried

Native `reconcilePreparationAttempt` immediately rejects retained gate obstacles/process observations without reobserving inventory. Once `LiveOwnedProcesses` closes, a supported transient inventory/identity failure cannot clear through Verify/restart/Resume. Provider `requirePreparationRelease` already retries `captureOwnedProcesses` for the corresponding retained versioned state.

Refresh supported recoverable observations; retain unknown identities, surviving owners and legacy obstacles that cannot be reconstructed. Do not clear holds by assumption or signal unrelated work. **AC-CONTINUE-07; Phase 8.**

### G8 — Checkpoint failure erases unresolved native ownership

`executeCheck` can record `outcome: unresolved` after ownership reconciliation fails. The following checkpoint catch/mismatch in `verifyPreparation` unconditionally overwrites that with failed. Subsequent verifier/explicit Resume cleanup selects only running/unresolved attempts, so a known unsettled native attempt can be skipped after simultaneous source/configuration movement.

Both a throwing checkpoint read and a changed checkpoint ID have this outcome-loss sibling. Preserve process uncertainty independently of ordinary failed-check/source results; later provider release does not cover the separate native attempt's retained owners. **AC-CONTINUE-07; Phase 8.**

### G9 — Explicit CLI worktree source is discarded

`prd-location.ts::resolvePrdPath` resolves the supplied PRD path and returns its registered `checkoutRoot`. `kiln-command.ts::makeEngine` passes only the main checkout into engine paths. Active `readPlan` reads active/main/previous source paths, so a restart explicitly naming another registered worktree can ignore its added plan and provide no mismatch/recovery instructions. Inspection aliases do not add plan-source observations.

This finding concerns an explicitly supplied, Git-resolved source, not a request to scan arbitrary remote branches or all worktrees. **AC-HANDBACK-03; Phase 7.**

### G10 — Completed split reordering changes historical ownership undetected

Parent split order participates in the parent's digest, but `completedScopeProblems` visits only old leaves and `completedPhaseScopeUnchanged` checks their direct digest plus inherited repository subset. Reordering existing completed children in their parent therefore leaves both carried with no earlier-work problem; accounting/readiness do not repair that omission.

A compiled fictional probe changed parent order `2a,2b` to `2b,2a`: parent scope changed, child scopes did not, `completedScopeProblems` returned `[]`, and `judgedPhase(parent 2)` changed from `2a` to `2b`. The earlier splitting session can thus be reassociated with another completed leaf. Preserve the completed order/ownership boundary without forbidding compatible additions or ordinary unfinished splits; this is not a blanket requirement to compare all ancestor prose. **AC-CONTINUE-03 / AC-FIND-03; Phase 7.**

### G11 — Later browser discoveries do not reach the terminal

`checkCompletedPlanOwned` publishes snapshot changes but no terminal discovery event. `makeEngine`'s change listener only requests delivery history; `formatDecisionLine` formats completed discovery once at startup. A later page/reload/button check can find additions while the foreground terminal has no new count/order/first/readiness or page direction. Active handback's `plan_updated` event is a working sibling, not a completed-discovery notification.

Use the same retained observation for every supported discovery trigger; retain no-launch and no background polling. **AC-OFFER-01; Phase 7.**

### G12 — An unchanged alternative source invalidates a new grant

`discoverCompletedPlan` emits `{kind: candidate, digest: local.digest}` whenever local semantics differ from the historical baseline, including before candidate selection and at final reread. Equivalent revised saved/base scope correctly selects the remote candidate, even when harmless formatting or rename/link spelling makes exact digests differ; that selected remote set is correctly integrated.

After saving a target grant, `grantContinuationTarget` immediately rechecks. The unchanged unselected local digest is compared against the approved remote `candidateDigest` by `changesContinuationScope`, permanently superseding the newly saved grant. Every new grant repeats this false movement, blocking Continue despite stable inputs.

A compiled fictional probe confirmed local differs from baseline, local/remote semantic equality, unequal exact digests and `changesContinuationScope` returning true for that unchanged local observation. Compare observed source inputs against their applicable approved inputs without weakening genuine movement/supersession, incomplete-read holds or grant-only identity preservation. **AC-CONTINUE-09 / AC-OFFER-02; Phase 7.**

### G13 — Failed durable publication still exposes successful check state

`checkCompletedPlanOwned` installs the successful result/new timestamp on `record.completedPlanCheck` before `save`. On save error it faults mutation ownership, but leaves that successful state installed; `finally` calls `changed()` and snapshot/inspection readers expose it. The request fails while other readers can see current success/ready data. A local requesting-tab failure fix alone would not correct the shared snapshot.

Preserve uncertain-write mutation faults and restart reconciliation. Current success must not be published from an unacknowledged durable check write; retain honest earlier/unknown state and a concrete recovery. Sidecar publication errors and pre-admission refusals are related failure-projection siblings. **AC-FIND-04; Phase 7.**

## Requirements conflict check and disposition

Independent reverse checks shortlisted all ten other PRDs by title/summary and read relevant current criteria/supersession chains in v1, multi-repo delivery, development deployments, bot control, completion audits, live control, Needs-you handoff, Codex support, billing and usage recovery. None deliberately permits these missing boundaries or supersedes the affected criteria.

Existing requirements reinforce safe first-descendant ownership, honest failure/currentness, retained tracked ownership and recoverable handback. Equivalent-source grant preservation and uncertain-write nonpublication are explicit in this design. The existing adapter/profile and downstream-effect limits remain in force. No business rule/value needs a new assumption; no intentional shipped alternative is being reverted.

All thirteen gaps fit two coherent completion leaves: [Phase 7](phase-7-plan-source-reconciliation.md) completes source observation/comparison and its presentation/authority consequences; [Phase 8](phase-8-preparation-splits-verifier-recovery.md) completes preparation dependency and native-attempt recovery. Neither contains new product scope, refactor work or test-only remediation. Original owners stay closed, and historical audit/recovery/merge records remain intact.

## Audit-session validation

`npm run verify` exited zero in 2,120.62 seconds: dependency audit had zero blocking high/critical findings; lint and TypeScript/Svelte checks passed with zero errors/warnings; 690 unit tests, 14 release checks, 18 Codex contract checks and all 107 integration files passed (1,265 passing cases, three inherited/platform skips). Integration took 2,089.96 seconds. `npm run test:package` then exited zero with all eight cases passing in 31.69 seconds.

All 526 source fingerprints stayed unchanged throughout verification and packaging. The initial freeze baseline was taken before the required build, so the outer wrapper reported two stale pre-build browser-artifact differences after the successful verify command. The separately retained integration build manifest covers all 266 files, their hashes, membership and modification times; its final comparison found no changes. Its latest build write was `2026-10-30T19:56:17.134698Z`, during the required build immediately before Vitest launched at `19:56:17 UTC`. Package prepack ran only after integration ended. The stale pre-build comparison is not represented as a product-test failure or as an uninterrupted green wrapper.

The preliminary sandboxed command stopped at npm registry DNS resolution before test execution; the properly permitted full command above supplied the completed gate. No test assertion or implementation was changed. Plan parsing confirms only leaves 7 and 8 are open; all 18 unique assessment rows, nine partial rows, thirteen gap entries and local document links passed validation. Staged scope/secret and whitespace checks are completed at the commit boundary.

Logs and exact exit/time records are `/private/tmp/kiln-delivery3-verify.log`, `kiln-delivery3-verify-result.json`, `kiln-delivery3-test-package.log` and `kiln-delivery3-test-package-result.json`. Source, original pre-build, actual integration-build and final integration freeze records share that prefix. These are baseline execution gates, not a test-quality grade; this audit performs no implementation repair.

## Completion and handoff

Build Phase 7, then Phase 8, each through implement-from-requirements in its own fresh chat. After both close, repeat fresh whole-PRD delivery audit before whole-PRD test audit. Continue the authorized completion/re-audit chain until clean. Every successor uses GPT 6.1 Sol/high, the retained assigned checkout and safe development-base publication restrictions; no main/release or production action is authorized.
