# Phase 6: Complete inspection freshness and helper help

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: "CLI and Help Contracts", "Status, Conversations and Handoff", "Output Pages", "Account and Usage Facts", "Validation Boundaries".
**Repository:** kiln

## Summary

Keep usage readings honestly dated, report unavailable recent logs without substituting older work, and supply the JSON input instructions needed to use the existing audit and delivery helpers.

## Acceptance criteria covered

AC-SEE-03 (completes it; owned by phase 1), AC-SEE-06 (completes it; owned by phase 1), AC-ACT-01 (completes it; owned by phase 1), AC-ACCOUNT-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-03:** `src/agents/metadata.ts::AgentInfo.refreshClaudeForLaunch` retains older `limits` but replaces `updatedAt` after an auth-only read. Engine billing inspection reaches this at startup, refresh and launch; `buildSnapshot` forwards the account and `src/control/projection.ts::accountFacts` exposes those old gauges with the new time and `current` state through account/full-status routes. Preserve each usage reading's own date and availability independently of auth readiness, including retained/disconnected observations.
- **AC-ACCOUNT-01:** The same auth-only update can carry account A's usage into account B's freshly read identity, as well as relabel same-account usage as newly read. Keep usage bound to its observed account context, with explicit unavailable/stale information when that binding or freshness cannot be established. Preserve Phase 5's actual-attempt versus next-account separation and existing launch/recovery authority.
- **AC-SEE-06:** `src/control/server.ts`'s logs route discards `readHistory` errors, so a missing/corrupt referenced session can become successful `no_session`. `src/control/history.ts::chooseSession` also substitutes an older readable conversation when the preferred/current or latest saved session is unavailable; live and retained `kiln logs` can silently return that older output. Report unavailable/incomplete default selection when the required session cannot be established. Preserve explicit valid session selection and frozen cursor paging where their execution/session identity is independently established.
- **AC-ACT-01:** `prompts/kiln-command-contracts.json`, emitted by `src/control/help.ts::commandHelp`, describes the JSON-file input to `audit snapshot/submit` and `delivery assess/prepare/evidence` only by an unspecified existing contract. It supplies neither payload fields/value sources nor useful helper-specific error meanings, and examples name a file without showing its required contents. Complete discoverable text/JSON helper help against the actual audit/delivery validators; retain their execution formats, context requirements, exits and authority.

## Phase dependencies

1 (inspection, saved-history selection and account projections); 3 (packaged help contracts); 5 (actual-attempt provenance and independent recovery freshness that must remain intact).

## Scope and closeout

These are three bounded corrections to the existing read/help surface, sized together for one implementation session. No new command, provider sign-in, spending permission, delivery authority or product criterion is added. Original criterion ownership and all existing Closed lines remain intact.

Prove each covered criterion as a whole through the design's Help and input, Status/history, Logs and Account facts boundaries. Exercise same-account auth-only readiness with older gauges, changed-account readiness, optional usage failure, public live and retained freshness, missing/corrupt newest session with and without an older readable conversation, and complete installed helper help without Git/controller/provider access. Preserve exact log fragments/caps and valid explicit selectors/cursors. Existing provider-contract evidence is in [release validation](kiln-bot-control-validation.md); [Phase 5's Known baseline failures](phase-5-complete-attempt-account-provenance.md#known-baseline-failures) records the full gate's existing limits, verified 2026-10-27. Do not claim that gate was completely green.

After this phase closes, repeat whole-PRD delivery audit in a fresh chat. Whole-PRD test audit follows only when delivery is clean. Scoped commits follow the implement skill default. Publishing new implementation or audit commits requires Doug's explicit authorization; no production release is authorized.
