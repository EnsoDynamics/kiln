# Test audit: Codex support for Kiln

**Status:** Done 2026-10-23 — all 25 active criteria Adequate; 11 of 11 initial test gaps fixed; nothing to fix or waiting on delivery.
**Last audit:** 2026-10-23, whole PRD, baseline `614c093` plus the audit tests committed with this report. The table identifies that exact pre-commit checked tree.
**PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Target:** Every active criterion Adequate or better. Strong was not requested.

All original leaves and completion Phase 6 are closed. The whole-PRD delivery audit ran at `4085361`; Phase 6 completed its three delivery gaps. This audit found test gaps, no new delivery gap. The staged root README and all predecessor commits were preserved. No product push, new provider inference, proof-repository write, package publication or Enso Method edit is included.

## By criterion

Tests below are unique basenames under `src/`, `view/src/`, or the explicit script path. Code is under `src/` unless a Svelte/view helper, which is under `view/src/`. These files are collected by the normal unit, integration, protocol or package commands and CI. Prior real provider proofs supplement the verified contract/process tests; the proof criteria also refer to the committed reproducible proof drivers and retained artifacts below. Every row is Adequate on independent reading; none has every required part individually red-checked.

| Criterion | Grade | Tests | Code | Checked |
|---|---|---|---|---|
| AC-AGENT-01 — PRD agent choices | Adequate | `agent-selection.integration.test.ts; kiln-run-start.integration.test.ts` | `agents/metadata.ts; engine/engine.ts; DocumentsFound.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-AGENT-02 — Fixed agent after Start (high risk) | Adequate | `codex-workflow.integration.test.ts; codex-displays.integration.test.ts` | `engine/engine.ts; SettingsPanel.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-AGENT-03 — Selected-agent readiness (high risk) | Adequate | `codex-metadata.integration.test.ts; codex-session.integration.test.ts; kiln-command.integration.test.ts` | `agents/codex-metadata.ts; session/codex-session.ts` | 2026-10-23 `614c093` + audit tests |
| AC-MODEL-01 — Reported choices and access refusals (high risk) | Adequate | `codex-metadata.test.ts; agent-selection.integration.test.ts; codex-workflow.integration.test.ts; codex-usage.test.ts` | `agents/codex-metadata.ts; engine/engine.ts` | 2026-10-23 `614c093` + audit tests |
| AC-MODEL-02 — Defaults, restored choices and visible adjustments | Adequate | `codex-metadata.test.ts; agent-selection.integration.test.ts` | `agents/codex-metadata.ts; engine/engine.ts; DocumentsFound.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-MODEL-03 — New versus recorded session choices (high risk) | Adequate | `codex-workflow.integration.test.ts; codex-usage.integration.test.ts; codex-displays.integration.test.ts` | `engine/engine.ts; session/codex-session.ts; engine/snapshot.ts` | 2026-10-23 `614c093` + audit tests |
| AC-WORK-01 — Ordered phase and final PR conversations | Adequate | `codex-workflow.integration.test.ts; engine-helpers.test.ts; pull-request-checks.integration.test.ts` | `engine/engine.ts; session/prompts.ts` | 2026-10-23 `614c093` + audit tests |
| AC-WORK-02 — Assigned workspace and authority (high risk) | Adequate | `codex-session.integration.test.ts; add-repository.integration.test.ts; engine-helpers.test.ts; retained Gate 1 proof` | `session/codex-session.ts; engine/engine.ts; session/prompts.ts` | 2026-10-23 `614c093` + audit tests |
| AC-WORK-03 — Visible, bounded human requests (high risk) | Adequate | `codex-session.integration.test.ts; codex-workflow.integration.test.ts; scripts/proof-run/codex-proof.test.mjs` | `session/codex-work-rpc.ts; session/codex-session.ts; CodexSessionFacts.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-WORK-04 — Independent complete workspace/delivery checks (high risk) | Adequate | `codex-evidence.integration.test.ts; codex-workspace.integration.test.ts; codex-workflow.integration.test.ts` | `session/codex-evidence.ts; engine/engine.ts` | 2026-10-23 `614c093` + audit tests |
| AC-VIEW-01 — Accurate agent and saved session facts | Adequate | `codex-workflow.integration.test.ts; codex-session.integration.test.ts; codex-displays.integration.test.ts; engine-helpers.test.ts` | `engine/snapshot.ts; session/codex-output.ts; OutputRow.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-VIEW-02 — Live and saved native output | Adequate | `codex-output.test.ts; codex-workflow.integration.test.ts; codex-displays.integration.test.ts` | `session/codex-output.ts; SessionOutput.svelte; OutputRow.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-VIEW-03 — Evidence-backed six-step progress | Adequate | `codex-output.test.ts; codex-workflow.integration.test.ts` | `session/codex-output.ts; session/session-output.ts; ProgressSteps.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-VIEW-04 — Existing screens support Codex | Adequate | `codex-displays.integration.test.ts; agent-selection.integration.test.ts; codex-usage.integration.test.ts; view-in-browser.integration.test.ts` | `App.svelte; screens/; components/` | 2026-10-23 `614c093` + audit tests |
| AC-USAGE-01 — Selected account and dynamic allowances | Adequate | `codex-metadata.test.ts; codex-metadata.integration.test.ts; agent-selection.integration.test.ts; codex-usage.integration.test.ts` | `agents/codex-metadata.ts; AccountPanel.svelte; LimitAccount.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-USAGE-02 — Fresh metadata without model turns (high risk) | Adequate | `codex-metadata.integration.test.ts; agent-selection.integration.test.ts; codex-session.integration.test.ts; codex-usage.integration.test.ts` | `agents/metadata.ts; agents/codex-metadata.ts; session/codex-session.ts` | 2026-10-23 `614c093` + audit tests |
| AC-USAGE-03 — Explicit unknowns and stale readings | Adequate | `codex-metadata.test.ts; codex-metadata.integration.test.ts; agent-selection.integration.test.ts; codex-displays.integration.test.ts` | `agents/codex-metadata.ts; agents/metadata.ts; documents-found.ts; AccountPanel.svelte; LimitAccount.svelte` | 2026-10-23 `614c093` + audit tests |
| AC-USAGE-04 — Warnings, sign-in and account provenance | Adequate | `codex-metadata.test.ts; agent-selection.integration.test.ts; codex-usage.integration.test.ts` | `agents/codex-metadata.ts; AccountPanel.svelte; engine/engine.ts` | 2026-10-23 `614c093` + audit tests |
| AC-RECOVER-01 — Limited native cleanup and interrupted recovery (high risk) | Adequate | `codex-session.integration.test.ts; codex-workflow.integration.test.ts; retained native recovery proof` | `session/codex-session.ts; session/codex-background-terminals.ts; platform/` | 2026-10-23 `614c093` + audit tests |
| AC-RECOVER-02 — Same-context manual/explicit recovery (high risk) | Adequate | `codex-recovery-command.integration.test.ts; codex-output.test.ts; codex-workflow.integration.test.ts` | `engine/snapshot.ts; engine/engine.ts; session/prompts.ts` | 2026-10-23 `614c093` + audit tests |
| AC-RECOVER-03 — Bounded evidence-based quota recovery (high risk) | Adequate | `codex-usage.test.ts; codex-usage.integration.test.ts; codex-metadata.integration.test.ts` | `session/codex-usage.ts; agents/codex-metadata.ts; engine/engine.ts` | 2026-10-23 `614c093` + audit tests |
| AC-COMPAT-01 — Legacy and concurrent mixed-provider isolation (high risk) | Adequate | `agent-records.integration.test.ts; record-migration.integration.test.ts; record-migration.test.ts; codex-workflow.integration.test.ts; instance-lock.integration.test.ts` | `state/records.ts; engine/engine.ts; state/instance-lock.ts` | 2026-10-23 `614c093` + audit tests |
| AC-COMPAT-02 — Installed Mac package and explicit platform limits | Adequate | `installed-package.package.test.ts; codex-metadata.integration.test.ts; retained installed proof` | `package.json; agents/codex-metadata.ts; docs/release/kiln-codex-macos-validation.md` | 2026-10-23 `614c093` + audit tests |
| AC-PROOF-02 — Actual cross-repository/addition workspace proof | Adequate | `scripts/proof-run/codex-proof.test.mjs; codex-evidence.integration.test.ts; add-repository.integration.test.ts; retained Gate 1 proof` | `scripts/proof-run/codex-audit-proof.mjs; session/codex-evidence.ts` | 2026-10-23 `614c093` + audit tests |
| AC-PROOF-03 — Actual installed two-phase GitHub workflow | Adequate | `codex-workflow.integration.test.ts; codex-usage.integration.test.ts; installed-package.package.test.ts; retained installed workflow proof` | `scripts/proof-run/codex-packaged-workflow-proof.mjs; docs/release/kiln-codex-macos-validation.md` | 2026-10-23 `614c093` + audit tests |

**Retired:** AC-PROOF-01 was split into AC-PROOF-02 and AC-PROOF-03; it is not graded. No active criterion is unbuilt, person-checked, superseded, changed outside requirements or waiting on delivery.

## Initial gaps and remediation

The assessors read requirements, design and assumptions before opening tests. The least-proven required part made 11 criteria Weak; the other 14 read Adequate. No criterion was Missing.

| Initial Weak criterion | Required part that could break unnoticed | Added boundary evidence |
|---|---|---|
| AC-AGENT-02 | Codex Settings could display Claude or omit its fixed-agent explanation | Built browser asserts Codex fixed wording and separate next versus recorded settings |
| AC-MODEL-01 | Account/model refusal could be hidden or substitute another model | Schema-validated unauthorized terminal contract through actual Engine/private process/browser; exact pair, one original thread and visible error |
| AC-MODEL-02 | Effort adjustment could be saved without its visible explanation | Chooser selects Ultra then Luna; asserts Low, exact supported controls and visible change notice before any Start |
| AC-MODEL-03 | Refused resumed settings lacked end-to-end same-conversation assertions | Restart/resume with changed future effort retains original local/provider IDs and High, then shows the refusal with no new thread |
| AC-WORK-03 | Saved stopped question could be missing from Needs you | Engine/Chrome asserts full question payload, durable request, one dispatch and retained edits |
| AC-VIEW-01 | Codex output row label and exact detail facts could be wrong | Built live/saved output pins Codex versus historical Claude labels, IDs, original model/effort and start time |
| AC-VIEW-02 | Native error/result content could disappear during normalization | Exact timestamped error, success/failure result/status/exit and final-message reader assertions plus rendered output rows |
| AC-VIEW-03 | Test hardening or Refactor pass could be mapped to another step | Reads every resolved method skill and asserts its distinct observed step without inferred completion |
| AC-VIEW-04 | Paused Codex could show Claude account/login guidance | Running/Paused/Phase detail/Disconnected Chrome matrix pins account, settings, login and disabled disconnected controls at 360/1280 pixels |
| AC-RECOVER-02 | Copyable command could omit or alter saved thread/model/effort/home | Executes native command against a disposable capturing executable; asserts literal cwd/args/home, absent effort and exact PowerShell serialization |
| AC-COMPAT-01 | Claude and Codex had never run concurrently in the same repository | Overlapping process/Engine runs in two PRD worktrees pin independent markers, settings, agent/session facts, output and recorded identity |

No implementation change was necessary. Failure fixtures explicitly prove handling of verified protocol shapes, not actual entitlement refusal or exhausted-account inference. Fresh assessors re-graded all 11 touched criteria.

## To fix, in order

None. Independent re-grade and the complete final verification meet the Adequate target for all 25 active criteria.

**Strong, if asked:** the high-risk rows remain Adequate. Prioritize authority/readiness, workspace evidence, original-session recovery, bounded quota attempts and preservation/isolation of existing work. Strong requires red checks for every required part plus implied edge/error cases; the present sampled checks do not establish it.

## Waiting

None. The following user-approved validation limits are preserved rather than converted into new blockers:

- Actual exhausted-allowance refusal/recovery, changed-account inference and native repeated-refusal suppression remain unproved until Doug's first live occurrence. The pinned 0.162.1 scalar error has no structured reset-only path; no speculative reset or allowance burning was added.
- Native Linux/Windows runtime, root/junction/UNC enforcement and cleanup/resume remain explicitly untested. Mac runtime, recorded parser/path contracts and best-effort compatibility evidence satisfy this delivery's approved scope.
- RECOVER-001 covers the conversation and tracked commands. Independently detached programs may survive; the warning and known-cleanup-failure stop remain in force.

## Real-boundary evidence retained

[Shared proof results](kiln-codex-support-proof-results.md), [Phase 5 final handoff](phase-5-codex-platform-proof.md#final-validation-and-audit-handoff--2026-10-23), [Phase 6 handoff](phase-6-codex-agent-account-displays.md#implementation-and-whole-prd-test-audit-handoff--2026-10-23) and the [phase plan audit](kiln-codex-support-phase-plan.md#whole-prd-delivery-audit--2026-10-23) remain applicable.

Gate 1's unchanged published-method work and terminal recovery cover five owning conversations, 117 operations and exactly the deliberate outside marker, including actual mid-conversation repository addition and child delivery. The installed Mac proof covers distinct Phase 1, Phase 2 and final PR conversations, seven owning parent/child histories, 91 operations, clean complete audits and the expected actual ready GitHub PR. Its final head is `0b27d19451970a00557517b4efd2839348c06b2f`. The reviewer inspected retained `packaged-workflow-result.json` and installed revision artifacts. Reproducible drivers remain committed; this audit performs no new inference/network-write proof.

## Baseline and final verification

Preflight: `develop`, fast-forward-only pull already current, no live peer marker, only the explicitly preserved staged root README. Fresh Codex metadata has no readiness blockers and returns seven models without a model turn; read-only GitHub access succeeds.

Baseline commands/results:

- `npm test -- --reporter=json --outputFile=/tmp/kiln-codex-test-audit/unit.json`: 490 pass, 1.35 seconds.
- `npm run test:codex-proof`: 16 pass, 3.11 seconds including build.
- `npm run test:integration -- --maxWorkers=4 --reporter=json --outputFile=/tmp/kiln-codex-test-audit/integration.json`: 453 pass, two existing skips, 148.29 seconds including build.
- `npm run test:package -- --reporter=json --outputFile=/tmp/kiln-codex-test-audit/package.json`: four pass, 9.33 seconds.
- `npm run lint` and `npm run typecheck`: pass; zero Svelte errors/warnings.

The bounded four-worker integration invocation preserves Phase 5's execution distinction. Default-concurrency timing failures are not reclassified as product changes or hidden with relaxed deadlines.

`npm run audit` reproduces the pre-existing high-severity `body-parser@2.3.0` GHSA-27r3-jxmh-p828 failure recorded in Phase 6. Dependency files are unchanged. This is outside the Codex criteria; no dependency suppression/fix is included and no all-green `npm run verify` is claimed.

The first final type check found an exact-optional-property error in the new command fixture. An absent effort is now deleted rather than assigned `undefined`; type checking then passes with zero Svelte errors/warnings, and both command tests pass again.

The first complete final integration run had 458 passes, two existing Windows-browser skips and one `afterEach` cleanup failure in the unchanged CLI test `Ctrl+C and a closed terminal > prints nothing when the terminal closed, and records it as the cause`. Exit 129, absence of interruption text and the saved `sighup` assertions all completed; `rmSync` then failed `ENOTEMPTY`. Independent investigation found the recreated sandbox held only `scenario.json.helpers.jsonl` from the Claude model-list helper started by the test's final `h.reopenFromDisk()`. Closing aborts metadata synchronously but teardown can delete the sandbox before the helper settles. That test, helper, Engine close and cleanup code are unchanged. This is a fixture teardown race, not a failed criterion behavior; no assertion was weakened and no unrelated runtime/harness change was included. The complete integration repeat passes with the same four workers and unchanged assertions.

Final successful verification:

- `npm run lint`: pass.
- `npm run typecheck`: pass after the fixture correction; zero TypeScript/Svelte errors or warnings.
- `npm test -- --reporter=json --outputFile=/tmp/kiln-codex-test-audit/final-unit.json`: 492 pass.
- `npm run test:codex-proof`: 16 pass.
- `npm run test:integration -- --maxWorkers=4 --reporter=json --outputFile=/tmp/kiln-codex-test-audit/final-integration-repeat.json`: 459 pass, zero fail, two unchanged Windows-browser skips; 170.06 seconds including build.
- `npm run test:package -- --reporter=json --outputFile=/tmp/kiln-codex-test-audit/final-package.json`: four pass, 9.17 seconds; temporary installation only.
- The native command file also passes both tests separately after the optional-field correction.

The initial unsuccessful combined run remains recorded above. The passing complete repeat, rather than a selected-test retry alone, is the final integration gate.

## Deliberate regression checks

Sixteen distinct safe mutations each produced a criterion assertion failure on two runs, then passed after byte-identical restoration. Request visibility and mixed-provider checks were repeated after their fixture setup was made deterministic. Each file was copied outside the repository before mutation; the session marker records REDCHECK, checksum and RESTORED. No temporary implementation mutation remains.

| Mutation | Mapped criterion(s) | Observed assertion failure |
|---|---|---|
| Replace normalized error payload with `{}` | AC-VIEW-02 | Exact timestamped stderr/error content differs |
| Replace aggregated command output | AC-VIEW-02 | Expected result text/status/exit tuple differs |
| Map Test hardening to Build | AC-VIEW-03 | Exact distinct skill-to-step sequence differs |
| Render an empty JSON question payload | AC-WORK-03 | Needs you question object lacks the actual question |
| Replace displayed saved terminal error | AC-MODEL-01/03 | Saved error output omits model-access refusal |
| Mislabel Claude session facts as another agent | AC-COMPAT-01 | Concurrent Claude PRD's reported agent differs |
| Substitute a thread in the copyable command | AC-RECOVER-02 | Captured literal argv differs from saved context |
| Hardcode Claude in Settings | AC-AGENT-02 | Codex fixed-agent label differs |
| Label Codex output as Claude | AC-VIEW-01 | Exact saved/live source labels differ |
| Show Claude login on Codex Paused | AC-VIEW-04 | Scoped paused account switch guidance differs |
| Hide effort-adjustment explanation | AC-MODEL-02 | Rendered explanation missing after valid choice update |
| Alter detached-process warning | AC-RECOVER-01 | Ctrl+C guidance omits the explicit native limitation |
| Corrupt returned refusal model provenance | AC-RECOVER-03 | Exact structured refusal facts differ |
| Double the metadata interval | AC-USAGE-02 | Public pending-read state false at the five-minute boundary |
| Corrupt reported outside-change detail, preserving verdict | AC-WORK-04 / AC-PROOF-02 | Child's actual outside path missing from report |
| Corrupt incompatible-version remedy wording | AC-AGENT-03 | Actual adapter blocker omits incompatibility explanation |

The first interval mutation only produced a polling timeout, so it was restored and **not counted**. The scheduler test now asserts a read has started at the exact five-minute boundary before awaiting real process results; the repeat failed on that assertion twice and returned green after restoration. A timeout alone was never accepted as red evidence.

**Red check not possible: AC-WORK-02's riskiest authority enforcement** requires changing writable-root/permission/configuration guards, which the audit forbids. No such guard was changed. For other high-risk criteria only the safe reported/persisted/presentation parts above were broken; authentication, metadata work-dispatch allowlists, workspace passage, cleanup continuation, model fallback and usage-release/retry guards were preserved. These limits cap the rows at Adequate; they do not create a Strong claim.

Per-test JSON, TAP output, mutation/restore runs and final command logs are local temporary evidence under `/tmp/kiln-codex-test-audit/`; the durable test cases, criterion map and exact outcomes are retained in this commit.

## Closure and handoff

The whole-PRD delivery audit has run, all planned leaves and completion Phase 6 are closed, all 25 active criteria now meet the test-evidence target, and no row waits on delivery. This PRD's track is complete under the approved validation limits. No successor build or audit chat is required, and no continuation prompt is owed. The repository's general future roadmap items are separate work, not children of this PRD.

The commit covers only this audit's tests, this map and the phase plan's final audit status. Root README remains staged and excluded; all local predecessor commits remain. Doug's source-chat restrictions remain in force: no product push without separate authorization, and no Enso Method repository modification or commit. No release/deploy/publish action follows this audit automatically.
