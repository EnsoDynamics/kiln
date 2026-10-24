# Phase 3: Complete delivery recovery guidance

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
