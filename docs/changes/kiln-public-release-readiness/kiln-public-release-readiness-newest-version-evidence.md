# Kiln public release readiness — newest agent version evidence

Implementation evidence recorded under the technical design's "Proving Features on Newer Agent Versions". These runs are not a release gate (PUB-001).

## Billing details (AC-AGENT-02, Open Questions 1 and 2)

Recorded 2026-11-03 on macOS with `src/billing/passive-boundary.integration.test.ts`, no model call made.

| Run | Claude Code | Agent SDK | Result |
|---|---|---|---|
| Minimum, as CI runs it | 2.1.311 (pinned development dependency) | 0.3.310 (lockfile) | All 6 tests pass: real resolver cascade, complete inventory, projected credential confirmed by `claude auth status --json`, helper, hook and MCP canaries untouched. |
| Newest | 2.1.318 (`KILN_PASSIVE_BOUNDARY_CLAUDE` set to the installed CLI) | 0.3.318 (newest in `^0.3.310`, installed for the run) | All 6 tests pass with the same assertions. The SDK 0.3.318 declarations still state that the `policyHelper` subprocess is not executed. |

Open Question 1 is settled: billing details work at 2.1.311, so the Claude Code minimum stays 2.1.311. Open Question 2 is settled: the resolver on SDK 0.3.318 started no Claude Code and ran no hook, helper or `policyHelper`.
