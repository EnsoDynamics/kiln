# Phase 3: Complete delivery recovery guidance

**Closed:** 2026-10-24

**Added by delivery audit:** 2026-10-24, after both planned phases closed. It builds the missing parts confirmed in the whole-PRD audit at `886f31f`.
**Parent PRD:** [Kiln development deployments](kiln-development-deployments-prd.md)
**Technical design:** [Kiln development deployments](kiln-development-deployments-technical-design.md) — One authority statement everywhere; One evaluator at every transition; Display Contract.
**Phase plan:** [Implementation order and whole-PRD audit](kiln-development-deployments-phase-plan.md).
**Repositories:** kiln

## Summary
Give an existing conversation the execution's current authority when the person recovers it in a terminal, and keep resumed finalization instructions and recovery explanations aligned with the remaining delivery work.

## Acceptance criteria covered
AC-DELIVER-04 (completes it; owned by Phase 1), AC-RECOVERY-01 (completes it; owned by Phase 1), AC-DISPLAY-03 (completes it; owned by Phase 1).

## What the audit found missing
- **AC-DELIVER-04:** `src/session/prompts.ts::resumePrompt` always selects `prompts/resume-carry-on-pull-request.txt` for a finalization resume, telling it to carry on opening PRs even when enabled delivery has only evidence, synchronization or description-link work left; `Engine.resumeSession` reaches this path for both providers, including an older restricted finalization conversation activated by a grant.
- **AC-RECOVERY-01:** `src/engine/snapshot.ts::needsYouView` supplies only the provider resume command for an existing conversation, and `view/src/screens/NeedsYou.svelte` renders that manual terminal recovery path without a current-authority/task handoff; after a first Needs you grant, the reopened conversation retains its old restricted instructions. The authority-bearing fresh-session fallback does not repair the existing-conversation path.
- **AC-DISPLAY-03:** `view/src/lib/progress.ts::needsYouCopy` unconditionally describes finalization Resume as continuing to open PRs; the enabled recovery explanation must reflect delivered work and the actual remaining task when no open review PR is required.

## Phase dependencies
1 (shared completion evaluator, delivery authority and recovery presentation); 2 (first-grant activation of previously restricted conversations).

## Phase-specific notes
These gaps share recovery prompt/presentation code and fit one implementation session. Preserve restricted execution behavior, user-reply precedence, both providers' identity/workspace protections, historical facts and the final-review merge prohibition. Prove each whole criterion, including an existing restricted conversation receiving its first grant and then following the displayed terminal recovery path, and enabled finalization resumed with only evidence or links outstanding. The existing proof results identify reusable disposable resources; this phase grants no new external writes.

The audit's conflict check read all five PRDs and relevant history: older recovery rules are partly superseded by this PRD, and no later-built criterion replaces these requirements. The omissions are inherited paths missed during implementation, not a deliberate product change. No assumption or supersession edit is needed.

After this completion phase closes, hand off to the whole-PRD `test-audit` in a separate fresh chat. Do not run that audit inside the completion build. The two original phases retain their Closed lines and criterion ownership.


## Completion evidence

The existing-conversation terminal path now displays a copyable recovery prompt beside the provider's original resume command. It uses the same saved-authority block and remaining-task templates as unattended recovery. A first Needs you grant therefore replaces the older conversation's blanket restriction only for the exact approved targets. Workspace repair guidance remains before authority; user replies remain first in unattended Resume. Enabled finalization reads current delivery status and handles outstanding evidence, assigned-branch synchronization, review work only where it remains, and description links. Restricted instructions retain their previous task.

`development-grants.integration.test.ts` proves the restricted-to-first-grant terminal handoff, unchanged resume command/session history, restart persistence, and the original finalization conversation receiving current authority and task on Resume. `engine-helpers.test.ts` covers both providers and interruption/usage/manual resume variants with reply/repair precedence. The real Chrome grant test reads the displayed handoff after granting another exact environment; progress tests cover enabled finalization and outside-workspace recovery copy.

`development-recovery.integration.test.ts` uses real synchronized Git source and the captured GitHub contract: every source change is delivered and the merged PR's missing description reference is the sole failed completion check. Resume reaches the same finalization conversation with the current authority and remaining-task instructions. Repairing that reference lets Check again complete with its historical delivery, no review PR and no further provider call. Existing delivery/activation tests retain the four final-result rows, required checks/review and final-remainder merge refusal.

### Real provider and browser handoff proof — 2026-10-24

The kept `scripts/proof-run/development-activation-proof.mjs` accepts `--terminal-recovery` (run with Node's `--experimental-strip-types` for its source browser helper). It starts a restricted conversation, grants the inherited disposable target through the authenticated API, reads the actual Chrome-displayed command and recovery prompt, checks the original conversation identity, and sends the displayed prompt into that same conversation through its native structured provider adapter. It does not automate the interactive terminal UI itself; command generation is unchanged. The prompt and browser captures remain in private proof state.

| Provider | Original conversation | Result |
|---|---|---|
| Claude Code 2.1.307 | `9d1ed869-872c-40de-9daf-1c58380605da` | Displayed handoff recovered earlier/stopped assessments and actual immutable artifact verification; one original merge retained, no repeated deployment, future leaf refused, historical facts preserved, restart/idempotent grant passed. |
| Codex CLI 0.162.1 | Thread `01a16f65-a2f0-7943-8cbf-44de89cfa3d7`, session `741e213c-6769-44c0-9909-6f384b5c70a6` | The same browser handoff, authoritative command-result evidence, history/scope and restart checks passed in the original protected conversation. |

These runs read the existing explicitly non-production `EnsoDynamics/kiln-proof-development-delivery-20261024` repository and its previously deployed Actions artifacts. No GitHub writes or new deployment occurred. The actual [Claude delivery PR #1](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/1) and [Codex delivery PR #2](https://github.com/EnsoDynamics/kiln-proof-development-delivery-20261024/pull/2) remain the independently reread history recorded by the Phase 1/2 proofs.

Independent deliverable review found no implementation findings and inspected the 1280px recovery screen with no concrete layout defect. Test hardening added the links-only Engine regression above. After closure, the next planned unit remains the whole-PRD test audit in a separate fresh chat; that audit has not run in this build session.


### Final verification gate

`VITEST_MAX_WORKERS=4 npm run verify` passed after hardening: dependency audit (zero blocking high/critical findings), lint, TypeScript/Svelte checks, 522 unit/render tests, 16 Codex protocol checks, and 551 integration tests (two inherited platform skips). The integration tier took 180.34 seconds with four workers. `npm run test:package` passed all four packed-installation checks, including packaging the external prompt templates. No unresolved in-scope finding or new business assumption remains.
