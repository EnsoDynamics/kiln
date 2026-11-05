# Kiln active-plan handback validation

Scope: Phase 1 of Kiln Continue Added Phases, AC-HANDBACK-01–04. Completed-feature discovery and acceptance belong to Phases 2 and 3.

## Actual provider boundary

On 2026-10-27, `node scripts/proof-run/added-plan-provider-proof.mjs claude_code` and the same command with `codex` passed against the installed authenticated providers, production Engine/local HTTP routes and disposable Git repositories with local bare origins. Each proof retained an accepted pre-edit baseline, opened the same conversation in an independent terminal process, and had the driver append a split parent plus unfinished leaves 2a/2b and close Phase 1 while the terminal process owned control. Fixture writes were driver-authored; these results do not claim provider-authored document changes.

Returning through Resume retained the existing already-complete choice, sent no extra turn/reply, then explicit Verify/advance started one fresh Phase 2a conversation automatically. The snapshot reported exactly 2 new unfinished leaves; the split parent was not executed. Both proof processes stopped cleanly. The scripts emit their disposable root and a retained `proof-result.json`; no client repositories or shared branches are changed.

## Automated evidence

- `src/engine/plan-reconciliation.test.ts`: structural normalization, title/scope/code/link changes and identity-preserving phase renames.
- `src/engine/plan-sources.integration.test.ts`: immutable retained bytes after checkout removal, damaged sidecars, source lag versus changed scope, and missing/escaping/symlinked/oversized/structurally invalid documents.
- `src/engine/added-plan-handback.integration.test.ts`: append and split handback, normal completion and explicit-choice gates, known-source discrepancy/reconciliation, pending pause/restart, unfinished restart, and additions at final-PR acceptance and audit settlement. Uses real temporary worktrees, Git commits/pushes and local bare origins; scripted providers supplement the actual-provider proofs above.
- `src/server/added-plan-browser.integration.test.ts`: actual Chrome at 1200 and 390 pixels, accepted IDs/count/source, recoverable discrepancy, no page-triggered work, no overflow or browser errors. Screenshots for both states were captured and the narrow accepted notice and wide discrepancy inspected.

Deliverable review and test hardening ran in separate fresh-eyes agents. Historical scope recovery and required-source failure handling were fixed and independently rechecked; the hardening pass added uncommitted and committed-but-unpublished external-closure cases. The implementation was then integrated with published live-session-control work, retaining terminal-ownership admission and advancing the private schema to 12. Final `npm run verify` completed its dependency audit (0 blocking high/critical findings), lint, type checks (0 errors/warnings), 626 unit tests and 17 Codex proof checks successfully. The full integration run exercised all 71 files: 826 tests passed, 2 existing tests were skipped, and one development-recovery workflow hit its 60-second fixture deadline, so that command exited 1. A trace then completed all recovery assertions in 82 seconds. After budgeting that one full workflow at 120 seconds, its original two-test file passed with every assertion intact. Across the full run and focused rerun, all 827 applicable integration tests passed. `npm run test:package` also passed all 6 tests.

## Durable contract

Recovery against current develop advances to private schema 13, which adds `planReconciliation`, referencing immutable versioned `plans/<digest>.json` sidecars. The original document bytes, ordered parsed phases, comparison scopes, requirements manifest and known-source observations survive workspace loss. Completion references retain immutable revisions and repository identities for every checked repository, including externally completed work. Existing migration retains the original record bytes and older binaries reject schema 13. A failed observation preserves the accepted pointer and session receipts; the browser displays its recovery instruction. Sidecar bytes and directory metadata are flushed before the record points to them.

An unfinished legacy execution can establish its initial active baseline. Earlier Kiln-owned completions must first match their recorded immutable published phase documents; removed, reopened, split, materially changed or unavailable historical scope blocks acceptance. No earlier provider receipt is invented. New external Closed-only work must pass the ordinary active-workspace committed/published checks; an initially Closed phase can alternatively be proven at the exact clean, published setup base. A missing prior Kiln transcript is never converted to external completion. Completed-feature legacy-baseline recovery remains Phase 2 work.

## Validation environment

The full gate's installed passive-billing contract qualifies Claude Code 2.1.307 with the locked SDK. The machine's default Claude 2.1.311 is intentionally unqualified by that pre-existing billing fixture. Final validation uses the already-installed 2.1.307 executable through an isolated test PATH; the machine's global CLI and billing contract are unchanged. The actual-provider handback proofs also passed with the default CLI.

Broader regression fixtures now include the complete published setup binding for disconnected inspection and retain unrelated shared-checkout edits during restart. Missing required source documents are deliberately blocked under AC-HANDBACK-03's partial replacement of AC-START-02. The usage-reset test holds fixture setup time still, then lets its clock advance normally before observing the same real reset timer; setup no longer consumes the observation window.

Multi-cycle audit scenarios use 120-second workflow budgets; only the three-audit marker and full account-recovery waits use 60 seconds. Traces showed accepted audit progression beyond the earlier 20-second wait, while all five plan reconciliations together took 544 ms. Independent hardening review checked that all conditions/assertions and single-step, browser-rendering, timer and shutdown deadlines remained intact. The development-recovery scenario similarly includes initial delivery, description repair, historical reopening and later review; its trace reached the initial assertions at 57 seconds and all remaining assertions by 82 seconds. The final gate used `VITEST_MAX_WORKERS=2`; the timeout-only recovery correction was validated in its original file at one worker. Full-run and focused-rerun results are recorded separately above.

## Current-code recovery — 2026-10-29

Recovery is validated against develop `6fcc057`, preserving retained commit `5c8f484` and both merge parents. Current private schema 13 avoids collision with published live-control schema 12. The recovered implementation retains the current optional-provenance document contract, terminal-ownership admission, audit failure/interrupt semantics and repository completion checks. Earlier evidence above remains historical.

Independent deliverable review found and recovery fixed an audit rollback hiding a persisted plan observation, unchecked direct/inherited repositories on externally Closed leaves, the schema collision, and shutdown falling through into another asynchronous plan read. Those fixes were independently rechecked. Test hardening graded all four handback criteria adequate; subsequent browser-helper and workflow-budget corrections were independently assessed without further findings.

### Current verification

- Dependency audit: 0 blocking high/critical findings. Final lint and type checks passed with 0 errors/warnings; all 653 unit tests passed.
- All 14 release checks and 18 Codex proof checks passed. All 8 installed-package tests passed, including the runtime Markdown parser dependency.
- All 100 current integration files are accounted for: 1,129 applicable cases passed across the complete verification set and focused rechecks; 2 existing cases remain skipped. This is combined evidence, not a claim that one uninterrupted `verify` command exited zero.
- Current real-browser handback/source-discrepancy coverage passed, including desktop/narrow rendering and no page-triggered implementation. The previously failing schema migration, interrupted final session, message-order recovery, browser billing and remote-merge evidence cases passed.
- Both actual-provider handback scripts passed again against the final compiled build. Claude Code and isolated qualified Codex 0.162.1 preserved the manually resumed conversation, retained the already-complete choice without another turn, and automatically started exactly one Phase 2a session after explicit Verify/advance. The split parent was not executed, the notice counted two unfinished leaves, and both processes stopped cleanly. Document changes remained driver-authored; this is not provider-authored editing evidence. Logs: `/tmp/kiln-continuep-claude-current-proof.log` and `/tmp/kiln-continuep-codex-current-proof.log`.

### Integration accounting and resolved validation failures

The inherited runner disappeared without a final summary; its partial log is excluded from closure evidence. A preliminary overlapping build invalidated browser assets and that run was cancelled. The stable application build was then held unchanged throughout the completed verification set. Its SHA-256 digest is `7a7d9228879da958766eb0f189d074b9824249ac619c21ed00f2b78e059925bb`.

The complete-file manifest (`/tmp/kiln-continuep-gate-manifest.json`) retained 26 completed passing files, containing 702 cases. The large-history case separately passed on unchanged develop and recovery with its original 48 MiB child heap and five-second read deadlines (44.89 and 51.66 seconds respectively for the complete tests); no history code or deadline changed.

A real test-owned Chrome exit exposed a pre-existing helper defect: pending DevTools requests could wait forever after disconnect, and a signal exit could leave teardown waiting for an already emitted process event. One poisoned Codex worker was cancelled after cascading cleanup/port failures; every failed or interrupted file was rerun in full. The helper now rejects disconnected requests and retains process closure from launch. Its new real-Chrome signal-exit regression failed before the fix and passed after it, including pending evaluation rejection, observed process exit and repeated cleanup. The complete fresh Codex-workflow, billing-browser and agent-selection files passed. No product assertion or operational deadline was weakened.

The 73-file remainder finished with 425 passed cases, two existing skips and one aggregate 60-second browser audit-workflow timeout. That workflow performs both audits, pause/restart and final delivery. A diagnostic completed every unchanged assertion in 65.44 seconds; only its complete-workflow test budget was set to 120 seconds. The original test then passed (20.25 seconds); all individual fixture, browser, request, ownership and shutdown waits stayed intact. A separate two-check audit handback workflow similarly completed its unchanged diagnostic assertions in about 67 seconds and now has a 120-second aggregate budget; its Resume sibling remains at 60 seconds. Both budget changes were independently reviewed. Temporary diagnostic tests were removed.

The resulting count is 702 retained passes + 1 isolated history pass + 425 remainder passes + 1 corrected original workflow pass = 1,129 applicable integration passes. The manifest reports no missing or unexpected integration files, and the application artifact digest remained unchanged. Session-local logs are `/tmp/kiln-continuep-integration-stable.log`, `/tmp/kiln-continuep-integration-remainder.log`, `/tmp/kiln-continuep-history-recovery-isolated.log`, `/tmp/kiln-continuep-audit-browser-budget-fixed.log` and `/tmp/kiln-continuep-final-gate.log`.

### Continuation

Phase 1 recovery has no remaining implementation or validation finding. Phase 2 continues from the recovered local committed baseline under the existing authorization. Integration publication remains held for Doug's explicit authorization; it does not block sequential implementation of Phases 2–3 or the required closing audits.
