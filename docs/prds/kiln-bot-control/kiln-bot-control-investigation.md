# Kiln bot control — existing capabilities and design questions

Checked 2026-10-26 against Kiln checkout `44525bb`. This is evidence for the [PRD](kiln-bot-control-prd.md), not a technical design or a live-account test. No login was initiated and no real run was controlled.

## What already exists

| Finding | Evidence |
|---|---|
| Phone-bot control was recorded on 2026-10-17, under an unscheduled idea rather than the ordered roadmap. | [More terminal commands](../../design/kiln-after-v1-ideas.md#more-terminal-commands) |
| The original design anticipated another local client, while retaining loopback, Host, Origin and token protections. | [Control From Outside the Browser](../kiln-v1/technical-design.md#control-from-outside-the-browser) |
| Browser controls already cover pause/cancel, check again, resume with optional note, runtime settings and outside-workspace confirmation. | `src/server/local-server.ts`, routes for `/api/pause`, `/api/check-again`, `/api/resume`, `/api/settings` and `/api/outside-confirmation` |
| Snapshots carry phase/activity history, stop messages, checks, resume instructions, output references, usage limits and account provenance. | `src/engine/snapshot.ts`, `Snapshot`, `PhaseView`, `SessionIdentityView` |
| PRD file/folder inputs resolve to a main-checkout path plus repository-relative PRD directory; main checkout and worktree share saved state. An execution UUID already exists internally. | `src/prd-location.ts`, `src/state/state-files.ts`, `src/state/new-record.ts` |
| There is a per-user port registry and a process-identity-aware per-PRD lock. This is a discovery starting point, not proof a port still belongs to a run. | `src/state/instance-lock.ts` |
| User-facing status/control commands do not yet exist; run, repository, audit and delivery helpers do. | `src/kiln-command.ts`, command dispatch |
| Claude identity and usage are refreshed; Codex account/usage reads check stable account identity and recovery permission. Some failed refreshes deliberately retain labelled stale facts. | `src/account/claude-account.ts`, `src/agents/metadata.ts`, `src/agents/codex-metadata.ts` |
| Billing safeguards are separately designed, not implemented at this baseline. Their launch checks and approval rules must remain authoritative when delivered. | [Billing safeguards PRD](../../changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md) |

Doug explicitly confirmed in this chat that Grokpod or any other caller already has access to execute terminal commands anywhere on the Mac. The feature therefore requires no transport service or vendor-specific bot SDK.

## Required baseline for this feature

Doug's 2026-10-26 follow-up explicitly places [Clear handoffs on Kiln’s Needs you page](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md) before bot control. That prerequisite is implemented and validated at `7e7b7c8`; see [implementation validation](../../changes/kiln-needs-you-handoff/kiln-needs-you-handoff-validation.md). Its AC-RETURN-02 prevents a manual phase reply/resume from automatically advancing a completed phase. AC-RETURN-01 resumes unfinished work after a terminal discussion without another message, and AC-VERIFY-01 replaces phase “Check again” with Verify and advance. The bot PRD and mockup assume those behaviors rather than the older API semantics in the baseline table.

Outside-workspace confirmation remains required where applicable: the handoff change explicitly retains it in AC-VERIFY-02 and AC-COMPAT-01. Its meaning comes from AC-OUTSIDE-03 in [multi-repository delivery](../../changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), with Codex's narrower evidence rules in AC-WORK-04 of [Codex support](../kiln-codex-support/kiln-codex-support-prd.md). It acknowledges identified work outside the PRD's worktrees; it is not the ordinary act of finishing a phase in a terminal. A missing or unreadable Codex transcript cannot be cleared merely by asserting that work was handled. The CLI must expose the browser's actual eligibility and reviewed evidence, never a generic bypass.

## Per-phase session lookup

Checked source at `1512a41` for Doug's follow-up requesting conversation IDs for any started phase of the specified PRD. `PhaseFacts.sessionIds` retains per-phase Kiln session selectors; `SessionRecord` retains the agent, working directory and launch/resume attempts. For Codex, `SessionRecord.conversation.threadId` is the provider conversation identity, distinct from the local `sessionId`. `sessionIdentity` exposes that as `providerSessionId`, and `codexResumeCommand` uses the thread ID. Current `phaseViews` uses `sessionFor` for each row, so its one-session row summary must not be mistaken for a complete history of every conversation in that phase. AC-SEE-08 requires the proposed CLI to expose all recorded conversations and both identities, with missing evidence made explicit. These commands remain unimplemented; no conversations were opened or messaged during this check.

## Login evidence and limits

Local `claude auth login --help` exposes subscription login and an `--email` option that **pre-populates** the provider login page. That does not prove the resulting account matches the requested email, or that authorization from a phone completes on the Mac. Anthropic's [authentication troubleshooting](https://support.claude.com/en/articles/14552646-troubleshoot-claude-code-installation-and-authentication) discusses remote environments where localhost callbacks prevent completion.

Local `codex login --help` exposes `--device-auth`. OpenAI's [CLI login source](https://github.com/openai/codex/blob/main/codex-rs/cli/src/login.rs) directs headless/remote users to that option. Its presence is evidence for a candidate flow, not a completed proof for Kiln's supported version, workspace policy or shared-login behavior.

## Questions the technical design must resolve

1. **Phone-completable authentication for each provider.** Prove initiation, user authorization on a separate device, any completion input, timeout/cancel, actual identity verification and effective launch credentials. Record provider/CLI versions. Determine how to avoid opening an unattended Mac browser as the only way forward. A local-only result fails the intended remote-login outcome and needs a product decision.
2. **Which runs share a login?** Establish credential/configuration scopes, including launch environment overrides, how to discover every affected local run, and how holds prevent automatic recovery or a new affected controller from racing login. Unknown scope must not be presented as isolated.
3. **Authenticated discovery and control.** Use the approved PRD-path public target; decide internal execution binding across restarts, how new executions differ, and discovery/version compatibility with older installed Kiln instances. Define canonical path lookup for retained records when the original document has moved or disappeared; do not silently select a different PRD. Preserve local-server protections and return partial inventory when a known instance cannot be read.
4. **Requests that outlive the bot.** Define control-context invalidation, operation persistence, restart reconciliation, request deduplication, snapshot-bound output cursors and structured error/exit contracts. Prove the AC-SEE-06 serialized-response cap with long lines, Unicode and JSON escaping; paging must reconstruct the original saved text without gaps or duplicates. A changed stop must reject an old reply; an operation accepted just before a disconnect must remain discoverable without replaying it.
5. **Provider secrets and external output.** Specify protected completion input and redaction of login instructions from persistent logs/history; keep authorization URLs/codes in the explicit login flow. Define the bot-facing integration guide's distinction between operator requests and session output.

The command mockup proposes interface names and payloads for review. These questions determine their implementation; they do not justify silently narrowing the PRD.

## Technical-design investigation, 2026-10-26

The [technical design](kiln-bot-control-technical-design.md) resolves the interfaces and coordination questions against `origin/develop` at `87f59ea`, which contains `eabfca4`. This evidence does not claim that bot commands are implemented.

| Question | Design decision / evidence |
|---|---|
| Authentication initiation/cancellation | Actual installed Claude Code **2.1.307** and **codex-cli 0.162.1** ran in new empty temporary configuration directories. Both returned an HTTPS authorization instruction with piped stdin; both terminated on cancellation and saved no auth file. Claude returned a manual-code prompt; Codex returned a device flow. Codex exited 0 on termination, proving that exit code alone must not establish success. |
| Remote authorization completion | [Anthropic authentication](https://code.claude.com/docs/en/authentication) and [troubleshooting](https://support.claude.com/en/articles/14552646-troubleshoot-claude-code-installation-and-authentication) document manual code return when the authorizing browser cannot reach the CLI callback. Read-only inspection of the installed 2.1.307 login implementation confirms the printed manual URL and stdin code/state handler. [OpenAI authentication](https://learn.chatgpt.com/docs/auth) documents device login and its personal/workspace enablement requirement. Actual completion and effective identity are still the pre-completion gate below. |
| Shared scope | Claude's provider guidance isolates subscription accounts by configuration directory; actual auth status includes config-directory facts. Codex's provider guidance specifies home/store and managed policy. The design binds real paths and effective launch context, conservatively treats unproved backend aliases as shared, and blocks login for unknown live/legacy scope. Every Kiln launch participates in one per-user admission barrier; no daemon or credential roster. |
| Discovery/compatibility | State-root enumeration includes records evicted from the port registry. Authenticated version/execution handshake is authoritative, with last-known/incomplete results for unreachable/legacy records. Retained lookup uses exact recorded canonical paths and authenticated aliases, without guessing relocated PRDs. Read projections do not invoke migration-writing reads. |
| Durable requests | Execution-bound status revisions, durable intent/receipt records correlated with PRD and provider-attempt effects, reconciliation before duplicate admission, and explicit indeterminate outcomes. No exactly-once delivery claim without provider evidence. |
| Output budget | A temporary serializer/fragment prototype covered text and JSON, six fixture sets, 481 pages, long lines, escapes, internal newlines and Unicode. Largest stdout: **16,384 bytes** including newline; all saved text reconstructed exactly. The implementation must repeat this at its own real file/serializer boundary. |
| Secrets | Login supervisor memory owns authorization material; protected completion stdin, sanitized durable receipts and exact-value redaction keep it out of ordinary output/history. Session output remains untrusted data in bot guidance. |
| Help | Source `src/kiln-command.ts` already recognizes root help; `src/terminal-output.ts` contains only a short usage list, omitting audit. The design specifies a shared command/help contract, all-command inventory, complete leaf help, bare-command guidance and structured help; existing helper execution contracts stay intact. |

**Accepted caller:** Doug confirmed in technical-design chat `01a17a7d-36f1-7f10-a812-5f95eec308a2` that local **Grok Bot** on his Mac is equivalent to using it from his phone. AC-CLI-04 now records that decision. The dedicated **Kiln login proof** Grok Bot conversation confirmed normal Mac terminal access, the same installed provider versions, and initiated both isolated login flows. No real Kiln instance was controlled.

**Design review:** Independent `review-technical-design` completed at `160678d`: architecture retained, with recovery, history ownership, partial-write reconciliation, snapshot integrity and capacity contracts corrected. The review report is in that commit’s body. The PRD/mockup now make account-held next-activity Continue explicit.

**Grok Bot feasibility result:** The dedicated local Grok Bot used its normal Mac machine/terminal tool on Darwin arm64, with new empty `CLAUDE_CONFIG_DIR` and `CODEX_HOME` directories under `/private/tmp/kiln-login-proof`; HOME and existing profiles were untouched. Claude 2.1.307 printed its manual-code prompt with browser opening suppressed; Codex 0.162.1 printed a device flow with a 15-minute expiry and file credential storage. Neither provider authorization completed, no test credentials were created, and requested-account matching/new-process credential verification did not run. Grok Bot confirmed termination of both owned login subprocesses and the stdin holder on request. No model turn or real Kiln control was exercised. A retry needs fresh authorization instructions.

**Pre-completion gate:** Complete provider authorization through those remote-capable flows; verify the actual requested account and a new metadata process's effective authentication. Record results here without URLs, codes, raw provider output or credential contents. A provider limitation that prevents completion requires the PRD's product decision before implementation.
