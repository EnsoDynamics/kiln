# Technical Design: Kiln billing safeguards

**PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md) · **Business choices:** [assumptions](kiln-billing-safeguards-assumptions.md) · **Screens:** [Claude](mockups/kiln-billing-safeguards-mockups.html), [Codex](mockups/kiln-codex-billing-mockups.html)

## Overview

Add a local billing inspection before every Kiln-controlled AI launch or resume. Claude launches require approval only for a detected separately billed route. Codex gains account and optional credit presentation while its existing ChatGPT/OpenAI eligibility and usage-recovery rules remain authoritative. Subscription overflow and unavailable optional billing details do not acquire an acknowledgement step.

The engine owns authorization for the current PRD execution; the installed CLI owns authentication and billing. Keep inference on the existing unmodified CLI execution paths. No cloud service, credential store, new provider integration or spending limit is introduced. This design proceeds on BILLING-001 and BILLING-002; their stakeholder validation remains pending. The approved mockups govern presentation.

## Existing Code

**Posture: Preserve.** Preserve existing execution, delivery checks, recovery and saved work except for the explicit billing eligibility additions in the PRD.

- Reuse the engine's single-run command ownership and common process-dispatch boundary for phases, final delivery and completion audits.
- Reuse existing loopback API security, snapshots, selection generations, instance lock, atomic owner-only state and execution ID.
- Reuse installed-CLI metadata transports and process-tree termination; extend their typed metadata, not their authority.
- Preserve Claude's usage rows, including Weekly · Fable; preserve every reported Codex window and existing refusal/retry semantics.
- Keep local completion checks available independently of billing eligibility. Preserve all separate workspace, conversation, model, policy and development-delivery checks.
- Preserve active-run provenance when account readings change. Never infer an old run's payer from today's sign-in.

## Architecture and Decisions

| Decision | Choice and rationale |
|---|---|
| Workload and storage | Extend the existing local TypeScript engine, Hono API and Svelte view. PRD/session JSON owns durable approval and run facts; no second authorization service or database is needed. |
| Inspection context | Use the executable, launch directory, environment snapshot and configuration-affecting arguments of the impending launch. The account card's isolated state-directory reading cannot establish project-specific billing. |
| Claude metadata | Use a prompt-free installed-CLI stream-json control helper for `initialize` and `get_settings`, plus `auth status --json` as described below. Claude resolves its own settings cascade; Kiln does not implement a parallel settings-file merger. |
| Approval | One current Claude approval per execution, bound to the reviewed context by an opaque revision and a private fingerprint. A changed context invalidates it rather than accumulating grants to old contexts. |
| Enforcement | The final dispatch boundary checks fresh readiness and authorization; browser disabled controls and periodic metadata are presentation only. |
| Optional data | Overflow and Codex credits are independent display facts. Their absence never supplies false/zero values and never grants or removes recovery permission. |
| Concurrency | One billing inspection per launch context at a time; identical display refreshes join it. Launch checks wait for older reads to finish, then start a new read. Existing engine serialization excludes conflicting commands. |
| Budget | A Claude inspection has a 30-second total deadline and a 2 MiB cap per control response. Terminate its process tree on timeout/cancellation, force termination after one second if needed, then settle the result. No background inspection may update a newer selection. |

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Account and Usage (billing inspection uses the actual launch context and is awaited), §Starting a phase's session and §Interruptions, sleep and resume (fresh billing eligibility before dispatch); `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Agent boundary (additive billing metadata).

## Claude Inspection Contract

### Read the installed CLI without a model request

The helper runs the installed executable with streaming input/output, verbose output, no session persistence and the same enabled settings sources as normal work. Its input allowlist contains control requests only: initialization and reading settings. It sends no user message, prompt, tool invocation or model request. It cannot approve a CLI request for human input. Such a request is a typed readiness failure with terminal guidance. Metadata helpers are never recorded as AI session runs.

The initialization account supplies `apiProvider`, `apiKeySource`, `tokenSource`, email, organization and subscription type when available. `get_settings` supplies `effective` and per-source `sources`. Read only billing-related fields from these payloads; discard raw responses immediately after extraction. They can contain credentials. Never send raw settings, helper command text, stdout or stderr to snapshots, diagnostic logs, exceptions or fixture recordings.

The helper inherits the launch environment. Read `effective.env` as Claude's resolved settings input, retaining each relevant key's source from the returned layers, including managed and flag sources. Evaluate ordinary settings-env precedence with the installed version's verified contract; preserve the documented inherited-environment exceptions instead of assuming every settings entry wins. Preserve an observable override even when another metadata field claims subscription access. Do not call `resolveSettings()` as the authority: its documented omission of `policyHelper` would miss a managed source.

Authentication readiness is distinct from billing completeness. Run `auth status --json` in the same directory with the billing-related effective environment applied to that **inspection subprocess only**, because `auth status` can omit a project's `env` block that headless initialization loads. No environment is removed or rewritten for the real work process. The two reads must agree on available account/provider/source facts; a demonstrated account change requires one fresh inspection, then a readiness failure if it is still unstable. `loggedIn: false`, an unreadable required authentication result, or an initialization error that establishes unusable authentication is actionable readiness failure. A credential's presence is not proof the remote service will accept it; actual provider refusal retains existing handling.

When the optional control/settings read is unsupported or fails but authentication readiness succeeds, keep the direct launch-environment evidence and any successfully extracted override evidence. Without concrete override evidence, use the neutral `settings` route under BILLING-002. With concrete evidence, require approval even if other fields failed. An internal exception is not an optional-field absence: emit a sanitized diagnostic code and do not classify it as a subscription. A malformed optional field is omitted with a diagnostic; a failed required auth read remains blocking.

The helper deadline covers initialization, settings inspection, authentication corroboration and the single consistency retry. Deadline exhaustion settles each component as unavailable or failed according to its role, rather than leaving Checking indefinitely. Stop/cancel invalidates the entire result and never dispatches work.

### Route and source classification

Classification produces `subscription`, `metered`, or `settings`; readiness failures are a separate result. No plan label or email alone establishes a subscription route.

| Evidence | Result |
|---|---|
| First-party subscription authentication, consistent CLI account metadata, no detected override | `subscription`; reported identity and plan; overflow remains independent |
| Effective `ANTHROPIC_API_KEY`, `apiKeySource` identifying API access, or `api_key`/`api_key_helper` authentication | `metered`, direct Anthropic API unless endpoint/provider evidence says otherwise |
| Effective `ANTHROPIC_AUTH_TOKEN`, alternate API endpoint, selected third-party/cloud gateway provider, or configured API helper | `metered`; name the provider only when known, otherwise “configured provider” |
| Long-lived Claude subscription OAuth source with no separate-billing evidence | Subscription only when the CLI establishes that route; otherwise `settings`. Do not treat all `oauth_token` values as subscription proof: a custom authorization header can produce that category. |
| Successful authentication, incomplete route metadata, no detected override | `settings`, normal neutral summary; no acknowledgement |
| Existing provider/model/policy incompatibility | Preserve that blocker regardless of billing approval |

The inspection recognizes the provider-selection flags and endpoint/credential names supported by the installed Claude profile: direct Anthropic, Bedrock/Mantle, Vertex/Anthropic Google Cloud, Foundry, Anthropic AWS and gateway sources as reported by the CLI. Detection does not add support for any of them. Include the relevant `CLAUDE_CODE_USE_*`, `ANTHROPIC_*` routing/credential inputs and provider endpoint overrides; do not interpret every unrelated Anthropic setting as billing. Keep the field map next to its verified CLI contract fixtures, with explicit tests for additions. A nonempty custom endpoint is override evidence; a standard endpoint is not independently evidence of separate billing.

For settings sources, show a safe label such as “project settings · ANTHROPIC_API_KEY” or “Claude Code apiKeyHelper.” Do not show the setting's value, raw helper command, URL user information/query, or unknown provider-supplied prose. A CLI source unknown to Kiln can be described as a configured source without copying it verbatim. Use a first-party API payer identity only when the CLI ties it to that API context; subscription email is not an API payer fallback.

### Paid overflow and account attribution

Extend the existing Claude usage read to retain `usage_report.rate_limits.extra_usage.is_enabled` only when it is a boolean. `true` produces the approved factual notice; `false` has no extra notice; missing/unreadable is unavailable. Spending fields are not needed for this PRD.

Bracket the usage read with account identities. Attach overflow to a billing summary only when the available stable account/organization identifiers agree across those reads and with the inspected subscription account. Otherwise omit the overflow notice. Keep the usage gauges' independent availability and existing labels; do not hide them because overflow is absent. The launch gate does not wait for a fresh optional usage call: it may include the latest successfully attributed overflow reading from the current refresh interval (at most five minutes old). Running provenance records that reading's own timestamp.

## Codex Account and Credit Contract

Continue the existing 30-second metadata call, before/after account reads, configuration checks and launch-time validation. Extend the account result with optional credit observations from `account/rateLimits/read`, without adding an RPC method or changing dispatch permission.

For the pinned 0.162.1 contract, each `RateLimitSnapshot.credits` may contain `balance: string | null`, `hasCredits: boolean` and `unlimited: boolean`. Prefer `rateLimitsByLimitId`; inspect the legacy `rateLimits` only when the map is absent, as with existing usage rows. Never confuse `rateLimitResetCredits` with spendable credits. Never consume either kind.

Credit observations retain their bucket ID, reading time and stable usage account identity, corroborated by available workspace routing and consistent before/after ChatGPT account metadata. A mismatch or missing stable attribution omits the observation. Label a balance as workspace credits only when the verified provider contract establishes workspace scope; otherwise identify it as reported credits for the named account/bucket without inventing scope. Preserve separate conflicting observations rather than summing balances or selecting an arbitrary bucket. A strictly numeric balance string is displayable as reported, not converted to dollars. `hasCredits` can supply a factual availability label when there is no usable balance. Do not present `unlimited` as unlimited model usage or a spending guarantee.

Missing/malformed optional credit fields add no warning badge or readiness blocker. Do not retain old credits as current after any refresh failure or identity change; a disconnected view can show its last snapshot labelled last known. A credit balance never changes `ordinaryUsageAllowed`, administrative blocks, consumed automatic-resume evidence or manual-recovery rules. API-key-only auth and non-OpenAI providers remain blocked with their existing remedy.

Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Readings and identity and §Local API and snapshot changes (additive account billing summary and optional credits only). §Classification and bounded release is unchanged.

## Approval and Dispatch

### Context identity and invalidation

A Claude billing context contains the detected route/provider, effective credential-source identity, known payer identity, effective endpoint identity, supported detection-contract version, and detectable credential/configuration changes. Compute a canonical HMAC-SHA-256 fingerprint with a random execution-local key. The key and fingerprints remain private in owner-only PRD state; browser responses receive neither. Raw credentials are used only transiently when already present in the launch environment or CLI settings response, then discarded. Never open Claude credential files/keychains or execute a helper independently to extract its output.

For direct environment/settings credentials, include the value in the private HMAC input, detecting replacement without persisting it. For a helper, include the effective helper definition and source, plus a nonsecret payer/source identifier when reported. For external/provider-managed credentials that the CLI does not expose, use only observable configuration and reported identity. The same unchanged helper may rotate its secret without exposing that change: this is an explicit detection limit under AC-RUN-04, not a claim of credential continuity. CLI version/contract changes invalidate approval conservatively.

Use one current context and one approval for an execution. On any successful observed transition away from that metered context, clear its approval durably before publishing the new reading. Returning to the earlier context requires a new click. A failed read is not evidence that a previously detected override disappeared: retain its minimal source evidence and require reinspection before removing it. Switching agent before Start, changing execution ID, or clearing approval invalidates the grant and all outstanding browser revisions. An expired/missing reading never becomes approval merely because a stored fingerprint exists.

The directory selects which configuration to inspect; it is not by itself a billing identity. Equivalent effective source/provider/payer/credential context across phases can reuse approval. A different effective source, including a different project-local source, is a changed context. Reinspect the actual post-setup worktree and every later launch directory; a pre-setup preview cannot authorize a changed post-setup context.

### Command sequence

1. A display inspection publishes a safe billing view and opaque `readingId`, tied internally to execution ID, selection generation, exact launch context and inspected fingerprint. Use a random nonce per published reading; it survives only in the current process.
2. Approve takes that reading ID, performs a fresh inspection, compares it to what the user saw, and atomically saves approval only if it still matches and readiness permits the route. Different timestamps alone do not make an unchanged context stale. A changed context returns a conflict with the new view and an unticked choice.
3. Approving and refreshing never dispatch work or release an automatic wait. Clearing is allowed only without an active AI process or dispatch in progress.
4. Start, Resume, automatic recovery, wake/restart recovery, each phase, finalization and audit session pass a fresh inspection at the common dispatch boundary. The engine holds its existing command ownership through inspection, durable authorization/provenance writes and spawn. It uses the exact inspected environment snapshot; no asynchronous setup/configuration work is inserted after the final check.
5. The gate permits subscription/settings routes after readiness passes, or metered routes with a matching saved approval. It persists the launch billing snapshot before releasing the prompt. A write failure starts no model work. A detected changed/unapproved metered route holds at Needs you once execution is underway and keeps Start unavailable before execution.

This is a launch-time observation. Claude may reread settings or rotate credentials after inspection; Kiln does not intercept individual requests, pin settings with a new overlay, or interrupt running work over a billing change. Document that boundary prominently enough to avoid a spending-cap claim.

### Holds and recovery

A durable billing hold belongs to the existing execution and activity/session being continued. It records the pending action (`launch` or `resume`), activity identity, optional saved session ID, safe reason and observed billing summary. It does not replace failed completion checks, refusal facts, pause state or saved notes. A held initial launch has no fabricated started run. A held resume retains the same conversation and original model/effort.

Use the existing Needs you presentation, with a billing-specific reason. After approval or changing settings and rechecking, an explicit continuation action is required; use Resume for an existing resumable conversation and the existing retry/check control when no run exists. Reconstruct that action from the activity/session record after restart, not a saved closure or prompt. Completion checks run first and can finish work without billing approval; any new AI work they cause returns through the gate. Other failed preconditions still prevent continuation.

If automatic usage recovery encounters a billing hold, suspend automatic dispatch and its release listener while retaining the refusal/recovery facts. Approval alone does not restart that listener. An explicit continuation re-evaluates the existing usage and recovery rules. Missing optional billing metadata cannot create this hold. Codex retains its own no-new-approval behavior and recovery eligibility exactly.

Replaces in part: `docs/changes/kiln-usage-limit-recovery/technical-design.md`, §The Wait and §Resume (billing eligibility and explicit continuation after a billing hold); `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Recovery and Upgrade (AI audit dispatch also checks billing; accepted local evidence stays usable).

## Local Interfaces

All routes retain the loopback Host, Origin and `X-Kiln-Token` protections. Approval is not accepted from model output, prompt text, settings files or an unauthenticated browser. Request bodies are bounded to 4 KiB, strictly typed and reject unknown fields. Existing successful command conventions remain.

| Interface | Contract |
|---|---|
| `POST /api/metadata/refresh` | Existing request. Also refresh the selected agent's billing preview for the next actual launch context. No approval and no work dispatch. |
| `POST /api/billing/approval` | `{ executionId, selectionGeneration, readingId, approved: true }`. Freshly recheck then persist the reviewed Claude context; return `200 { ok: true, billing }`. No Codex approval route. |
| `POST /api/billing/clear` | `{ executionId, selectionGeneration, readingId }`. Clear current approval and invalidate outstanding revisions; `200 { ok: true, billing }`. Idempotent for the same already-cleared current context. |
| `POST /api/start`, `POST /api/resume`, automatic engine dispatch | No new client approval Boolean. All use the server's current durable grant and a fresh launch inspection. A queued work command that later meets a billing hold publishes Needs you rather than reporting a model attempt. |
| Snapshot/SSE | Add `billing: { next?, lastLaunch?, hold? }`. Each view carries agent, context label, route, safe identity/source/provider, reading timestamps, freshness, optional overflow/credit facts, approval status, `readingId`, and allowed controls. The server derives allowed controls from all readiness/recovery conditions. |

Billing command errors use `{ ok: false, code, reason, billing? }`: `400 invalid_request`; `403 unauthorized` (existing protections); `409 stale_billing_reading`, `execution_changed`, `billing_busy`, `billing_approval_required`, or `readiness_failed`; `500 billing_state_write_failed`. A sanitized code describes inspection timeout/unsupported control in optional details; it is not automatically a 409 unless required readiness or detected-override authorization fails. No raw CLI error is included. Duplicate approval of the same still-current context is idempotent after rechecking it. Concurrent requests either join a read-only refresh or return `billing_busy`; they never enqueue an unbounded list of approvals.

The view renders billing text beside the account, with email immediately below the subscription/ChatGPT label. Active/latest run facts use `lastLaunch`; newer facts are explicitly for the next run. For older runs without saved billing, say unavailable, never backfill. Disconnection freezes the last snapshot, labels it last known and disables run/resume/refresh/approval controls. Usage bars remain separate. The terminal emits one safe billing-hold line with the existing browser address and required action; it never prompts for secrets.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §HTTP API and §Snapshot; `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Local API and snapshot changes (billing fields and controls only).

## Persistent Data and Upgrade

Use the next supported record schema, **8 against the current schema 7 baseline**. Reconcile that number with the integration branch before implementation if another feature has advanced it; do not overwrite a migration.

| Record | New data |
|---|---|
| PRD billing state | `version`, execution-local random fingerprint key, monotonic authorization revision, optional current safe context/fingerprint, optional approval `{ executionId, contextFingerprint, approvedAt, contractVersion }`, optional durable billing hold |
| Run billing snapshot | `agentId`, observed-at time, route/provider/source, reliable account/organization/plan, optional attributed overflow/credit facts with their own timestamps, approval status at dispatch; no key, digest, raw settings or secrets |
| In-memory reading | Random `readingId`, selection generation, execution/context identity, fresh inspection result and private fingerprint; discarded on selection changes, restart and clear |

Use the existing atomic JSON writer and owner-only state permissions. The PRD record is the sole authority for approval; a run snapshot is historical evidence, never a reusable grant. A schema migration adds empty billing authority and no historical billing assertions, preserving existing execution IDs, sessions, waits, audit evidence and completed status. The first subsequent model dispatch inspects afresh and can ask for API approval. No migration performs a provider call.

A new execution gets a new identity/key and empty approval. A completed execution cannot dispatch new work under its old approval; any future re-execution flow must explicitly create a new execution ID. Existing APIs do not acquire a reset/re-run feature from this change. Clear approval and remove obsolete current-context fingerprints at execution completion; historical safe run snapshots remain with existing records. Storage is bounded by one grant/context/hold plus one small snapshot per existing run, not an ever-growing poll history.

All PRD/session readers reject a newer unsupported schema before writing. Backups and rollback use the existing owner-controlled state model; do not downgrade schema numbers or run an older Kiln over the upgraded records. A billing schema/record corruption is a state error, never an implied grant or a newly manufactured execution ID.

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Kiln's State on Disk; `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Persisted schema 4; `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §Authorization and Persistence (additive billing authorization only; development authority is unchanged).

## Integration Evidence and Verification

Read-only design probes on 2026-10-25 used Claude Code 2.1.307 and generated schemas from codex-cli 0.162.1. The CLI control probe sent only `initialize` and `get_settings` in disposable configuration directories with synthetic invalid credentials; it sent no prompt. It observed a project-settings API key in initialization `apiKeySource`, an `apiKeyHelper` source, and an authorization-header source plus effective endpoint settings. The same project-env API key was absent from `auth status` run without the effective environment. Generated Codex schema establishes optional `RateLimitSnapshot.credits`; it does not prove every account supplies a balance.

Official [Claude authentication commands](https://code.claude.com/docs/en/cli-reference), [environment behavior](https://code.claude.com/docs/en/env-vars), [settings precedence](https://code.claude.com/docs/en/settings), and [Codex app-server](https://learn.chatgpt.com/docs/app-server) inform the contracts. Installed SDK declarations identify `get_settings` and the limitation of `resolveSettings`. These interfaces are version-sensitive: implementation must commit small sanitized contract fixtures and record the tested CLI versions, rather than claim all future releases expose the same fields. Raw responses are never fixtures.

### Required implementation evidence

- **Real metadata boundary:** run the installed CLI in disposable user/project/local configurations with synthetic credentials and no prompt. Cover environment override, project/local precedence, empty override, custom authorization header, endpoint, helper and helper definition change; corroborated signed-in account; unsupported/failed settings call; required auth failure; timeout and cleanup. Assert the helper sends no user/model requests. Verify managed-source parsing with generated/recorded contract evidence if a real managed test host is unavailable, explicitly naming that limit.
- **Approval/state rules:** deterministic tests for stale browser clicks, source/provider/payer/credential changes, context A→B→A, unknown-field retention, restart, new execution, clear, write failure and schema migration. Secret canaries must not appear in any snapshot, HTTP error, log, approval record or sanitized fixture. Verify HMAC changes without storing the canary.
- **Dispatch and recovery:** real temporary repositories and existing process harnesses demonstrate zero model dispatch before approval, every phase/finalization/audit launch and resume path gated, changed post-setup settings held, concurrent approval/clear/start serialized, no premature run or cleared wait on refusal, crash/restart retains a hold, and approval alone cannot dispatch. Pair these deterministic cases with the real installed-CLI metadata contract proof; a scripted process alone is insufficient.
- **Codex:** regenerate the pinned schema; read live metadata without starting a turn; verify account/usage/account attribution and credits parsing. Cover missing/contradictory buckets, balance versus reset credits, API-only/provider rejection and unchanged automatic-recovery permission. Keep actual unavailable balance, paid-use and exhausted-account conditions explicitly unproved; do not buy credits or exhaust allowance for this feature.
- **Browser:** render the approved Claude and Codex states through the real local server. Exercise click/recheck/stale-click/clear and disconnect behavior, account-email placement, run versus next identity, Fable and all Codex usage rows. No warning/checkbox for missing optional credits or overflow. No new usage bar.
- **Release documentation:** update root installation/usage guidance for the launch-time boundary, Claude metered approval, account-managed overflow/credits and Codex restrictions. Inspect the built npm package to ensure guidance is available and private fixtures/state are excluded. This is verification, not authorization to publish.

The existing full verification suite remains the implementation commit gate. This design-only change uses document/link/coverage checks and an independent technical review; it does not claim product behavior has been implemented or end-to-end billing proven. Native Linux/Windows metadata parity and provider configurations unavailable on the Mac remain explicit test limitations, consistent with the existing platform support decisions.

## Acceptance Criteria Coverage

| Criteria | Design sections |
|---|---|
| AC-BILL-01–02, AC-BILL-06, AC-BILL-08 | Claude Inspection Contract; Local Interfaces |
| AC-BILL-03, AC-BILL-07 | Paid overflow and account attribution; Local Interfaces; browser evidence |
| AC-BILL-04–05 | Approval and Dispatch; Persistent Data and Upgrade |
| AC-RUN-01–04 | Architecture and Decisions; Claude Inspection Contract; Approval and Dispatch |
| AC-RUN-05–06 | Local Interfaces; Persistent Data and Upgrade; secret-canary evidence |
| AC-RUN-07 | Release documentation evidence; approved mockups |
| AC-CODEX-01–05 | Codex Account and Credit Contract; Local Interfaces; Persistent Data and Upgrade; Codex/browser evidence |

## Open Questions

No unresolved product decision blocks this draft; BILLING-001 and BILLING-002 remain implementable pending assumptions. The installed-CLI integration must pass the required metadata proof before its detector is accepted. In particular, corroborate effective-environment auth checks and settings provenance under managed policy and the supported launch platforms. A failed proof requires a design correction, not a new warning/waiver or silent expansion of supported providers. Credentials rotated behind an unchanged helper remain outside detectable-change guarantees.
