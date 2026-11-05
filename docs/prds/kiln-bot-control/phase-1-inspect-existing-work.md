# Phase 1: Inspect existing work

**Closed:** 2026-10-27

**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "Discovery, Ownership and Paths", "CLI and Help Contracts", "Status, Conversations and Handoff", "Output Pages", "Account and Usage Facts", "Durable Data and Evolution", "Local API and Integration Points", "Validation Boundaries".

## Summary
Let a caller find existing Kiln work from any directory and inspect its progress, complete stop messages, saved conversations, terminal recovery instructions, account facts and bounded output pages through documented text and JSON commands.

## Acceptance criteria covered
AC-SEE-01, AC-SEE-02, AC-SEE-03, AC-SEE-04, AC-SEE-05, AC-SEE-06, AC-SEE-07, AC-SEE-08, AC-ACT-01, AC-ACCOUNT-01, AC-CLI-01, AC-CLI-02, AC-CLI-03.

## Out of scope for this phase
New run-changing commands, durable mutation receipts and crash reconciliation, and the complete bot-driven control demonstration (Phase 2). The PRD's exclusions apply throughout.

## Phase dependencies
None. The PRD's implemented Needs you handoff prerequisite remains the baseline.

## Phase-specific notes
AC-SEE-03, AC-SEE-07, AC-ACT-01 and AC-CLI-01–03 are cross-cutting: this phase proves them for its read/help surface; Phase 2 proves them for the controls it adds. Describe planned controls in help without advertising them as executable before their durable admission path exists; never substitute legacy mutation calls. Follow the design's validation rows for Help and input, Discovery and saved state, Status/history, Logs and Account facts; the Complete workflow row belongs to Phase 2.

## Validation

The implementation is in the dedicated Phase 1 worktree; shared-branch delivery is held for Doug's explicit push authorization. This phase adds no run-changing command path.

| Boundary | Evidence |
|---|---|
| Help and installed command | Root, group and leaf text/JSON help from an unrelated directory without tools/controller access; an independent complete command-tree expectation and parsed examples. The installed-tarball gate passes 5 tests, including inspection and structured legacy/new help outside the source checkout. |
| Discovery, paths and ownership | Actual private state, two simultaneous loopback controllers in different repositories, real Git worktree/file aliases and paths with spaces; empty, old unfinished, completed-open/closed, corrupt/unsupported records, unsafe permissions and symlink rejection. Reads preserve saved bytes. Old protocol, reused-port identity and partial timeout cases are covered by the inspection integration suite. |
| Status and history | Exact browser stop/check/recovery projection, requested/effective model, nested phase and audit identity/rounds, independently dated account/usage facts, complete histories larger than a log page, unknown/missing/unowned records and deadline incompleteness. Historical/offline instructions and active handoff refusal start no work. |
| Output | Actual saved JSONL and both final serializers: complete fragment reconstruction across escapes, control characters, internal newlines and Unicode; an exact 16,384-byte page; empty/missing/malformed/partial records, invalid UTF-8, append/prefix-change/cursor binding and oversized metadata. |
| Real provider observations | On 2026-10-27, existing account readers returned Claude and Codex identity/plan/usage facts. Claude Code was 2.1.311; Codex was 0.162.1. Codex's independent readiness blocker remained explicit; no inference or sign-in change was attempted. |
| Real saved provider history | A temporary synthetic three-phase execution imported the committed actual Claude phase capture and three existing disposable Codex conversations through read-only `thread/read`. Full CLI history retained four conversations, two in one phase, and 12 actual Codex turns. All three selected Codex handoffs matched their provider IDs, retained instructions and confirmed history availability; Kiln selectors differed from provider IDs. No provider turn started. This proves history/lookup boundaries, not Phase 2's bot-control demonstration. |
| Reviews | Independent deliverable review and delta review completed; historical recovery, ownership completeness and legacy-help findings fixed. Fresh-eyes test hardening strengthened the evidence above. |
| Repository gate | Full `npm run verify` passes: dependency audit (zero blocking findings), lint, typecheck/Svelte checks, 623 unit tests, 17 provider-contract checks and 762 integration tests (2 existing skips), with 63 integration files completing in 354 seconds. The final inspection matrix passes 15 tests. The installed-package gate passes 5 tests. The passive billing qualification uses the existing Claude 2.1.307 binary on an isolated test PATH, matching its committed contract; Doug's global 2.1.311 installation is unchanged. The pre-implementation archive reproduced the three qualification failures with 2.1.311. Snapshot-cache writes are batched at the existing 100 ms cadence and flushed on close; the affected audit and browser checks pass. |

## Delivery boundary

The complete Grok Bot workflow, durable command receipts, stop-bound status tokens, shared browser/CLI/automatic admission and crash reconciliation remain Phase 2's assigned work. Its inherited notes identify the implemented read/help contracts; no natural-continuation work is parked outside that phase.
