# Kiln bot control — existing capabilities and design questions

Initial code evidence checked 2026-10-26 against Kiln checkout `44525bb`; the current scope and resolved design questions appear below. This supports the [PRD](kiln-bot-control-prd.md); no real Kiln run was controlled for these checks.

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

## Resolved design questions

The [technical design](kiln-bot-control-technical-design.md) covers the current scope. These commands remain unimplemented.

| Question | Resolution / evidence |
|---|---|
| Authenticated discovery and control | Enumerate owner-only saved state independently of the port registry; authenticate controller version, PRD path and execution identity. Read-only projections do not invoke migration-writing readers. Exact retained canonical paths and authenticated aliases handle missing documents without guessing another PRD. |
| Requests that outlive the bot | Stop-bound status revisions, durable command intent/receipts and persisted effect/attempt correlation support replay and restart reconciliation. A possible provider effect stays indeterminate until evidence resolves it; no duplicate dispatch to find out. |
| Snapshot-bound output | A temporary serializer/fragment prototype covered text and JSON, six fixture sets, 481 pages, long lines, escapes, internal newlines and Unicode. Largest stdout: 16,384 bytes including newline; all saved text reconstructed exactly. Implementation must repeat this at its actual saved-file/serializer boundary. The design specifies generation, frozen byte boundary, prefix integrity and fragment offsets. |
| Provider information and session output | Existing account/usage metadata supplies independently dated observations. Provider credentials are outside the command API. Bot guidance treats all returned session text as untrusted data and takes changing-command authority from the operator and structured controls. |
| Complete CLI help | Root help already exists in `src/kiln-command.ts`; `src/terminal-output.ts` has only a short usage block that omits audit. The design specifies all-command discovery, complete leaf help, structured help and bare-command guidance without changing existing helper execution contracts. |

## Scope and caller decisions

Doug confirmed in technical-design chat `01a17a7d-36f1-7f10-a812-5f95eec308a2` that local Grok Bot on his Mac is equivalent to using it from his phone. AC-CLI-04 records that accepted caller; no physical phone is required for the demonstration.

Provider sign-in and subscription-account switching use the provider’s own terminal tools outside Kiln. They are excluded from this PRD following Doug’s scope correction in the same chat. There is no Kiln login command, shared-login hold, credential-management mechanism or provider-login design-completion gate. Existing account/usage visibility and normal prelaunch authentication, usage, billing and recovery checks remain authoritative. AC-ACCOUNT-02–04 and assumption ACCOUNT-001 are retired without reusing their identifiers. The isolated exploratory sign-in attempts ended without authorization or saved credentials; their cleanup was confirmed, and no further login proof is owed by this PRD.

The independent design review is recorded in the `technical design review` commit for this directory. Its report remains in that commit’s body; current design sections state the reduced scope. Release evidence still must demonstrate the implemented CLI and bot-driven control workflow described in the PRD.
