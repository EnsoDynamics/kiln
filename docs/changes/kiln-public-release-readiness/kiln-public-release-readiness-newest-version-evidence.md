# Kiln public release readiness — newest agent version evidence

Implementation evidence recorded under the technical design's "Proving Features on Newer Agent Versions". These runs are not a release gate (PUB-001).

## Billing details (AC-AGENT-02, Open Questions 1 and 2)

Recorded 2026-11-03 on macOS with `src/billing/passive-boundary.integration.test.ts`, no model call made.

| Run | Claude Code | Agent SDK | Result |
|---|---|---|---|
| Minimum, as CI runs it | 2.1.311 (pinned development dependency) | 0.3.310 (lockfile) | All 6 tests pass: real resolver cascade, complete inventory, projected credential confirmed by `claude auth status --json`, helper, hook and MCP canaries untouched. |
| Newest | 2.1.318 (`KILN_PASSIVE_BOUNDARY_CLAUDE` set to the installed CLI) | 0.3.318 (newest in `^0.3.310`, installed for the run) | All 6 tests pass with the same assertions. The SDK 0.3.318 declarations still state that the `policyHelper` subprocess is not executed. |

Open Question 1 is settled: billing details work at 2.1.311, so the Claude Code minimum stays 2.1.311. Open Question 2 is settled: the resolver on SDK 0.3.318 started no Claude Code and ran no hook, helper or `policyHelper`.

## Live control (AC-AGENT-03)

Recorded 2026-11-04 on macOS with `npm run test:live-proof`, real Claude conversations in disposable folders. Under `npm run`, `claude` resolves to the development dependency pinned at the minimum, so the newest run names the installed CLI with `KILN_LIVE_PROOF_CLAUDE`.

| Run | Claude Code | Result |
|---|---|---|
| Minimum | 2.1.311 (pinned development dependency) | All 7 live control proofs pass: literal messages in text and tool modes, and safe takeover in foreground, failed, background, agent and background-agent modes. Recorded the hook contract fixture `claude-2.1.311-hook-contract.json`; the existing message contract fixture was kept. |
| Newest | 2.1.318 (`KILN_LIVE_PROOF_CLAUDE` set to the installed CLI) | All 7 pass with the same assertions: each message, including its leading slash command and file reference, reaches Claude and is replayed as its exact text, the file reference's contents never appear in the conversation, every receipt correlates, and the checkpoint hook's input is recognised (no unrecognised contract). Recorded `claude-2.1.318-message-contract.json` and `claude-2.1.318-hook-contract.json`, which CI replays beside the 2.1.311 fixtures. |

The tier's phase handoff proof runs `claude` from PATH, so it ran on 2.1.311 both times, and failed both times before any live control was involved: its seeded PRD has no acceptance criteria for Kiln's completion checks to read.
