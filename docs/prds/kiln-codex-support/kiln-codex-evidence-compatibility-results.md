# Kiln Codex evidence compatibility results

## Defect and scope

Doug reported that a CLI upgrade stranded verification of completed work: the reader required exactly 0.162.1 and rejected ordinary screenshot inspection. This repair serves AC-WORK-04 of **Codex support for Kiln**. It qualifies evidence reading with exactly `codex-cli 0.162.1` and `codex-cli 0.165.0`; new/resumed model execution remains qualified only for 0.162.1. No minimum-version range, version substitution or installed-file patch is used.

The static decoder recognizes literal `functions.view_image` inputs and presentation of their opaque results. Reading an image outside assigned repositories does not imply a mutation. Shell/patch/delegation inventory remains independent; unknown tools and output-derived tool inputs remain inconclusive. The `codex-static-v2` audit profile changes confirmation fingerprints while keeping historical records readable.

## Actual provider evidence

On 2026-10-29T13:25:36.047Z, the installed 0.165.0 executable initialized a private history-only app-server. The probe called only `initialize`, `thread/read`, `thread/turns/list` and archived/unarchived descendant `thread/list`. It read seven completed full-view parent turns and discovered two descendants, without starting or resuming a model turn.

The production reader then audited the entire affected conversation tree and original saved raw files. Result: **complete coverage, 262 policy operations checked, zero findings and zero problems**, with stable before/after raw and normalized frontiers. The original rollout metadata reports CLI 0.162.1; the reading process reports 0.165.0. Original raw source hashes at this check:

| Conversation | SHA-256 |
|---|---|
| `01a18633-9dc7-72f3-b012-3b2b74bd512e` | `7f3d4ae8bd80ea9b6a73b1913fca9e46169224b34931cedd0f6efdd5787a6933` |
| `01a1863f-2bc8-7e52-8984-44c05a12b51a` | `b219d00f7eb16998389846026e98f508ec7464615635449a9851eff409f3bbe0` |
| `01a1864b-29db-74a2-9d5e-b56ddfbb7179` | `5e2bf8b61fbf43a935a66f0356350d7d6b978bd24691a6496bfc4609e0c60182` |

The first repaired read exposed one further codec incompatibility: a windowed `compacted` envelope retained the original raw execution prefix. Its replacement model context is never used as execution evidence. The qualified reader checks its window chain against initial session metadata and requires referenced original starts/contexts, then performs all existing full-history and native-operation checks. Codex can write the current turn context after the snapshot, so validation runs after the original records are indexed. Unknown/legacy compaction shapes and missing original evidence remain inconclusive.

## Regressions and reproduction

- `test/fixtures/codex-audit-proof/image-inspection-wrappers.json` retains four actual parent/reviewer wrapper programs and original raw-line hashes; only the image directory is sanitized.
- `test/fixtures/codex-audit-proof/retained-compaction-0.165.0.json` preserves the observed compaction structure and original raw-line hash. Conversation/turn IDs are mapped to the local fixture, and private retained text, encrypted context and tool definitions are removed.
- The evidence integration suite exercises both reader versions through real process pipes, unknown-version refusal, image inspection beside outside Git writes and unknown mutations, and retained-compaction success/failure cases. Existing frontier, missing-history, child, shell, patch and confirmation regressions remain enabled.
- The decoder proof suite checks exact recorded image inputs, direct/native forms, malformed inputs, result taint and nested mutation inventory.

Run `npm run verify` and `npm run test:package` from this checkout. These use disposable local repositories and packaged entry points. Actual provider proof is read-only: call `auditCodexConversation` with the saved conversation ID, initialized Codex home, exact assigned worktrees and installed executable; inspect the returned report without submitting a controller command. Saved audit output remains private under `/private/tmp/kiln-real-evidence-audit.json` on the validation host.

The dashboard controller and active Kiln installation were left unchanged. No duplicate audit, production deployment or shared-branch push was performed; package tests installed only into disposable temporary prefixes.

## Final validation

The complete pre-rebase `npm run verify` passed dependency audit, lint, type checks, 643 unit tests and 18 decoder proof tests. Its 95-file integration invocation took 2,910.10 seconds: 1,076 tests passed and two were skipped; three passive-Claude failures came from an unfinished dependency postinstall, and two browser teardown hooks timed out. Running the pinned development CLI's normal postinstall corrected the dependency setup. All three affected suites then passed serially (20 tests); the single billing browser case also passed unchanged on both the original shared checkout and the repair. No test assertion, skip or timeout was weakened.

After rebasing cleanly onto `aa64983`, lint, TypeScript/Svelte checks and all 643 unit tests passed again. The relevant Codex evidence/workspace integration suites passed all 50 tests, the decoder proof suite passed all 18 tests, and the installed-package suite passed all eight tests (111.72 seconds), including import of the packaged evidence reader and its dependencies. The entire 95-file suite was not repeated after the rebase; the affected boundaries and package were rechecked.

Independent deliverable review found no actionable issue. Test hardening added regressions for context written after the compaction snapshot and for legacy-profile confirmation rejection.

## Delivery authorization

Doug authorized landing on `develop` and local installation in chat `01a187cd-9607-7141-8563-3631b137f4dd` on 2026-10-29: “All right, go ahead and push it and land it on develop and then install it so I can use it.” This does not authorize production deployment or changes to the affected dashboard controller.

## Workspace uncertainty recovery — 2026-10-30

Doug reported Consulting Prospect Intelligence Phase 2 blocked after normal closure/commit/push. All twelve errors were recorded visual-review subagent wrappers using `store`/`load` for notes beside literal screenshot reads. The decoder now inspects storage arguments and propagates loaded data as opaque, without executing provider JavaScript. Known operations before an unknown helper remain included in outside-change findings.

A read-only replay through the built production reader against the original three-conversation tree (`01a18d50-27c0-7922-95bf-780f38bdd64a`) completed with 169 checked policy operations, zero findings and zero problems. No model turn or saved Kiln execution was changed. The original case now passes without an uncertainty acknowledgment.

AC-WORK-04 and its technical design are amended for explicit human acceptance of interpretation uncertainty on readable, stable, stopped conversation trees. Acceptance has separate persisted fingerprints; unknown history remains inconclusive in the audit record. Missing/corrupt sources, active work and unstable/partial scans remain blockers. Tests cover recorded wrappers, nested unknown dispatch/data taint, separate known outside findings, restart/history/child/multiple-session invalidation, clear/reaccept, normal completion checks and paused advancement, CLI receipts and both browser recovery layouts at 390px.

Deliverable review and test hardening ran independently; review fixes preserve active-work/source blockers, visible known findings, accepted-uncertainty wording after recheck, and findings from partial wrapper decoding.

Validation: 687 unit tests, dependency audit, lint, type checks, build, 14 release checks and 18 Codex proof checks pass. The full integration run completed 1,227 cases (1,213 passed, 11 failed, 3 skipped) in 1,962 seconds. It had started before review fixes were frozen and retained older transformed modules; its four failed files also exposed an uninstalled pinned native Claude executable because dependencies initially skipped install scripts. After rebuilding that dependency, a fresh final run of all four failed files passed all 135 tests. The five-file focused recovery run also passed 141 tests before the added diagnostic-cap case; the final evidence-reader run passed all 55 cases. No assertions were weakened or failures skipped.

## Develop integration and local installation — 2026-10-31 UTC

Merged `feature/workspace-uncertainty` at `cf59857` onto the published `develop` revision `5ef7af8`. The merged tree passed `npm run verify`: dependency checks, lint, TypeScript/Svelte checks, 707 unit tests, 14 release checks, 18 Codex proof checks, and all 110 integration files (1,343 tests passed; three skipped). Source and build hashes remained unchanged throughout the full run. The exact installation archive also passed all eight `test:package` cases; focused recovery integration passed all 71 cases.

The merged production reader replayed the original affected conversation tree with 169 checked operations, zero findings and zero problems. Installed the tested archive locally and restarted the stopped controller without launching model work. All 301 packaged files matched the installed copy; the controller served the matching browser bundle containing “Accept workspace uncertainty.” The affected execution now shows Phase 2 complete and is paused for resume review with no working sessions. No further phases or audits were launched.
