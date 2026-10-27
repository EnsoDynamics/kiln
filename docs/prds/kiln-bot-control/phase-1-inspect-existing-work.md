# Phase 1: Inspect existing work

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
