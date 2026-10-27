# Phase 7: Complete Codex account binding and command discovery

**Added by delivery audit:** 2026-10-27, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md)
**Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md) — relevant sections: “Account and Usage Facts”, “CLI and Help Contracts”, “Status, Conversations and Handoff”, “Validation Boundaries”.
**Repository:** kiln

## Summary

Keep Codex usage and recovery facts attached to the account actually observed, make failed readings explicitly unavailable, and finish the existing command inventory and helper error help.

## Acceptance criteria covered

AC-SEE-03 (completes it; owned by phase 1), AC-ACCOUNT-01 (completes it; owned by phase 1), AC-ACT-01 (completes it; owned by phase 1).

## What the audit found missing

- **AC-SEE-03:** `src/agents/codex-metadata.ts::readCodexMetadata` returns an initially dated empty account on missing executable, incompatible version or outer RPC failure without account/usage errors. `AgentInfo.refresh` publishes it; public `accountFacts` marks null-identity/empty usage facts current, and account refresh can report success. Uncorroborated cross-account reads also appear current. Preserve independent observation dates and report failed/unbound facts unavailable or honestly stale through live and retained account/full-status paths.
- **AC-ACCOUNT-01:** The same reader brackets usage with account reads but `codexAccount(after, usage)` and `codexUsagePermission(before, usage, after)` do not compare before/after email/plan. With optional routing IDs absent, A → B can attach A's gauges and positive permission to B. Establish a stable known account context for usage and permission, report unavailable/uncertain facts when that cannot be established, and preserve actual-attempt versus next-account provenance and all existing authority. `codexCredits` already performs corroboration; its check does not protect the other facts.
- **AC-ACT-01:** `src/control/help.ts::commandHelp` omits audit/delivery leaves from root text help, while `prompts/kiln-command-contracts.json` supplies only unspecified “existing helper-specific errors” for `run`/`add-repository`. Complete the required root command tree and useful help meanings against actual syntax/context/refusals. Preserve existing helper execution formats, exits, authority and the five completed audit/delivery JSON-input contracts.

## Phase dependencies

1 (account/status projections and help); 3 (packaged command discovery); 5 (actual-attempt provenance); 6 (independent Claude usage dates/account binding, honest log selection and helper JSON-input help).

## Scope and closeout

These are two small corrections to existing metadata/help surfaces, sized together for one implementation session. No new command, sign-in/account switching, spending permission, delivery authority or product criterion is added. Original ownership and all existing Closed lines remain intact. The [fresh audit](kiln-bot-control-delivery-audit-after-phase-6.md) records entry paths, source history and the reverse conflict check; it found no later replacement, intentional alternative or missing business decision.

Prove each covered criterion as a whole through the design's Account facts, Status/history and Help and input boundaries. Exercise stable known Codex reads, changed email/plan or routing across usage, unavailable identity/corroboration, missing executable, incompatible version, RPC failure and optional usage failure, including live refresh/full status and retained observations. Preserve Claude's same-account/changed-account usage dating, actual-attempt provenance, independently dated recovery and existing launch/recovery gates. Controlled subprocess peers can cover account switches without changing Doug's sign-ins; actual provider metadata evidence must remain accurately scoped.

Exercise built installed root/group/leaf help in text and JSON from unrelated cwd without Git/controller/provider access. Inventory every supported command and verify `run`/`add-repository` syntax, context and refusal meanings against the actual helpers. Retain the five completed audit/delivery payload contracts. Existing provider/Grok evidence is in [release validation](kiln-bot-control-validation.md). Read Phase 6's [Final verification](phase-6-complete-inspection-freshness-help.md#final-verification) and Phase 5's [known baseline failures](phase-5-complete-attempt-account-provenance.md#known-baseline-failures); do not describe their full gates as wholly green.

After this phase closes, repeat whole-PRD delivery audit in a fresh chat. Whole-PRD test audit waits for a current clean delivery audit. Scoped commits follow the implement skill default; publishing new implementation/audit commits requires Doug's explicit authorization, and no production release is authorized. The source authorization and publication boundary are recorded in the fresh audit's “Validation and closeout” and Phase 6's “Audit handoff”.
