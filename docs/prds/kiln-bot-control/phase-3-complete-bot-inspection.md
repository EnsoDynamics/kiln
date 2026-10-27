# Phase 3: Complete activity reporting and command help

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
