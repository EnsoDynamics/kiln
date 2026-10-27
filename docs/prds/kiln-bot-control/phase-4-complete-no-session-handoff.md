# Phase 4: Complete recovery instructions without a saved conversation

**Closed:** 2026-10-27

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criterion below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "Status, Conversations and Handoff", "CLI and Help Contracts", "Validation Boundaries".

## Summary

Return the fresh-session instructions Kiln already offers when work stops before any conversation has been saved.

## Acceptance criteria covered

AC-SEE-05 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-05:** `src/control/projection.ts::handoffProjection`, reached by `kiln handoff <PRD-path>` and the authenticated handoff route, returns early when no saved conversation exists. A first prelaunch plan/selection stop can still have a fresh command/prompt in `src/engine/snapshot.ts::needsYouView`; the handoff response omits those instructions and their working directory. Preserve available live/cached recovery instructions while explaining that no conversation can be resumed. Keep explicit historical selection and the documented latest-saved-conversation fallback intact.

## Out of scope for this phase

New recovery actions, changes to conversation-selection policy, provider sign-in or other product scope. Reading instructions must continue to start no work.

## Phase dependencies

1 (handoff/history projections and retained browser instructions).

## Scope and closeout

Prove AC-SEE-05 as a whole through the design's Status/history validation boundary, including live and disconnected no-conversation recovery and existing selected-conversation behavior. After this phase closes, repeat whole-PRD delivery audit, then whole-PRD test audit only when delivery is clean.

## Implementation and validation

The no-conversation handoff now returns the exact fresh command and prompt from the live or retained browser snapshot, with its working directory. It explicitly reports no saved session and null resume instructions. Disconnected multi-repository recovery uses the retained workspace root; single-repository recovery uses the retained worktree. Reads start no work. Explicit historical selection and the documented latest-saved-conversation fallback remain unchanged.

Real disposable Git/state/HTTP tests cover a first plan stop and a first multi-repository selection stop, both provider command formats, live and disconnected instructions, and built CLI execution from an unrelated directory. They assert exact browser command/prompt parity, independently expected cwd, zero model launches, unchanged saved state, invalid explicit selectors and absent cached instructions. The historical test now also proves that a later stop with no conversation still defaults to the latest saved conversation while explicit earlier selection retains that earlier phase's instructions, live and offline. Existing saved-provider evidence remains in [Phase 1](phase-1-inspect-existing-work.md) and [release validation](kiln-bot-control-validation.md); this phase changes no provider dispatch boundary.

Independent deliverable review is clean. Fresh-eyes test hardening identified the multi-repository cwd and latest-saved fallback gaps; both were strengthened and the reassessment is adequate. Focused hardened regressions pass; final lint and TypeScript/Svelte checks pass with zero errors or warnings.

`npm run verify` passes: zero blocking dependency findings, lint, TypeScript/Svelte, 624 unit tests, 17 provider-contract checks and 784 integration tests with two existing skips across 64 files (806.40 seconds). The integration run overlapped another session's suite. The gate uses the existing qualified Claude Code 2.1.307 binary on an isolated PATH without changing the default installation. Machine-local log: `/private/tmp/kiln-botcontrol-ph4-verify.log`.

All six `npm run test:package` checks pass against the packed and installed artifact from unrelated directories (15.19 seconds). Machine-local log: `/private/tmp/kiln-botcontrol-ph4-package.log`. The worktree was brought current with subsequent upstream documentation-only commits before commit; they change no application or test code.

The final complete inspection suite passes all 21 tests after hardening; log: `/private/tmp/kiln-botcontrol-ph4-inspection.log`. Final independent source review includes the strengthened tests and closeout documents and is clean.

## Audit handoff

Phase 4 closed every implementation leaf planned at that time. Its predecessor delivery audit remains a historical gap baseline. Phase 4 was published as `8a2975d` under Doug’s explicit authorization in source chat `01a17da6-1eee-7712-b06b-8321a2007d35`: “Go ahead and push and then launch a new chat, also using GPT 6.1 Sol High Effort to continue with the next step.” Its earlier publication hold is satisfied. The fresh audit confirms AC-SEE-05 is implemented and records a separate account-provenance repair in Phase 5. Publishing new audit/implementation commits still requires Doug’s explicit authorization. No production release is authorized.
