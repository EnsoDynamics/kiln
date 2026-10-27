# Phase 3: Complete activity reporting and command help

**Closed:** 2026-10-27

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "CLI and Help Contracts", "Status, Conversations and Handoff", "Validation Boundaries".
**Repository:** kiln

## Summary

Report the latest observed activity after a run pauses or completes, and make the shipped command reference accurately describe the implemented controls and their results.

## Acceptance criteria covered

AC-SEE-02 (completes it; owned by phase 1), AC-ACT-01 (completes it; owned by phase 1), AC-CLI-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-02:** `src/control/projection.ts::statusProjection` derives `last_activity` from current/wait/stop and otherwise reports `record.startedAt`. `buildSnapshot` exposes `current` only while implementing, and `Engine.activatePause`/`complete` clear it. Consequently `kiln status <PRD-path>` and inventory rows lose later saved activity after pause/completion, including in disconnected cached status. Preserve the actual latest observed activity and its time across these states; a run start must not stand in for known later activity.
- **AC-ACT-01:** `prompts/kiln-command-contracts.json`, rendered directly by `src/control/help.ts::commandHelp`, still says status tokens are null, controls are planned, and changing forms are unavailable. It also omits durable-control error meanings and the receipt query's operation/effects/outcome fields. The built root/leaf text and JSON reference must describe the currently implemented surface, including where values come from and how to interpret results.
- **AC-CLI-01:** The same packaged reference omits command-specific stable identifiers such as `stale_status_token`, `busy`, `command_id_conflict`, `operation_indeterminate`, `unsent_reply_acknowledgement_required` and receipt lookup errors, and contradicts actual token/control availability. Complete the documented JSON/result/error/exit contract for both mutation and receipt-query commands.

## Phase dependencies

1 (status projection and packaged help); 2 (implemented controls, status tokens and durable receipt results).

## Scope and closeout

These are completion gaps in existing requirements. No new controls, account workflow or product scope is added. Prove each covered criterion as a whole through its existing design validation boundaries, retaining the current controls and provider protections. After this phase closes, run a fresh whole-PRD delivery audit, then the whole-PRD test audit.

## Implementation and validation

AC-SEE-02 now derives the latest dated observation from saved session attempts, output, skills and run transitions, independently of the transient current view. The inspection cache retains that observation; disconnected reads retain its date and stale label. Unreadable activity is explicit and makes inventory incomplete with exit 4 rather than reporting aggregate success.

AC-ACT-01 and AC-CLI-01 now have truthful packaged text/JSON help for live controls, status tokens, command IDs, durable receipt states, outcomes, separate reply/session/plan effects, unsent reply acknowledgement, command-specific errors and exits. Every listed bot-control error has a meaning. Existing command execution, provider protections and delivery authority are unchanged.

- Real engine completion/pause tests prove the current view clears while the later transition remains observable. The 18-test inspection suite exercises live detail/inventory, later saved output, disconnected cache/text reads, pure filesystem reads and explicit incomplete activity/inventory. Existing tests cover the rest of AC-SEE-02's plan, activity, model and completion facts.
- All six installed-tarball tests pass on the final files (13.33 seconds). They run root/leaf text and JSON help from an unrelated directory with no tools/controller, independently assert supported controls, stable errors and receipt distinctions, and retain the existing parsed-example and legacy-helper checks. Final lint and TypeScript/Svelte checks also pass.
- Independent deliverable review and its fix confirmation are clean. It found and the implementation fixed missing read-error meanings and swallowed disconnected-inventory errors. Fresh-eyes test hardening found adequate evidence for all three covered criteria; no additional tests were warranted.
- `npm run verify` passes: zero blocking dependency findings; lint; TypeScript/Svelte with zero errors/warnings; 624 unit tests; 17 provider-contract checks; 781 integration tests with two existing skips across 64 files, 461.53 seconds. The final inventory fix additionally passes the 18-test inspection suite. The gate uses the existing qualified Claude Code 2.1.307 binary on an isolated PATH for billing qualification, preserving the default installed version.

Machine-local logs: `/private/tmp/kiln-botcontrol-ph3-verify.log`, `/private/tmp/kiln-botcontrol-ph3-inspection.log`, and `/private/tmp/kiln-botcontrol-ph3-package.log`. Provider and Grok workflow evidence remains in [the prior validation record](kiln-bot-control-validation.md); this phase changes no provider dispatch boundary and does not claim a new bot demonstration.

## Audit handoff

All implementation leaves are closed. The prior delivery audit remains a historical gap baseline, not proof of these repairs. Run a fresh whole-PRD delivery audit, then whole-PRD test audit only after delivery is clean. Phase 3 commits locally under the implementation skill default; publishing it to the shared branch requires Doug's explicit push authorization.
