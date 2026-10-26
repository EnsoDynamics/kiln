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
| Inspection context | Use the executable, launch directory, environment snapshot and configuration-affecting arguments of the impending launch. A display-only account reading cannot establish project-specific billing. |
| Claude metadata | Use the existing Agent SDK’s passive settings resolver for bounded billing inventory, plus safe facts from independent required readiness. No Claude session is started for billing inspection. The resolver supplies its own cascade; Kiln does not implement a parallel settings-file merger. |
| Approval | One current Claude approval per execution, bound to the reviewed context by an opaque revision and a private fingerprint. A changed context invalidates it rather than accumulating grants to old contexts. |
| Enforcement | The final dispatch boundary checks fresh readiness and authorization; browser disabled controls and periodic metadata are presentation only. |
| Optional data | Overflow and Codex credits are independent display facts. Their absence never supplies false/zero values and never grants or removes recovery permission. |
| Concurrency | One billing inspection per launch context at a time; identical display refreshes join it. Launch checks wait for older reads to finish, then start a new read. Existing engine serialization excludes conflicting commands. |
| Budget | A passive Claude inspection has a 30-second total deadline including cleanup, a 2 MiB cap on its extracted result and a 4 MiB cumulative stdout/stderr cap per inspection subprocess, enforced while reading bytes. Terminate its process tree on timeout, output overflow or cancellation, force termination after one second if needed, then settle the result. Its deadline is independent of required readiness. No background inspection may update a newer selection. |

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Account and Usage (billing inspection uses the actual launch context and is awaited), §Starting a phase's session and §Interruptions, sleep and resume (fresh billing eligibility before dispatch); `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Agent boundary (additive billing metadata).

## Claude Inspection Contract

### Passive inspection without a model request

The billing inspector does not start a Claude session. For the qualified Claude Code 2.1.307 / existing Agent SDK 0.3.310 contract, use `resolveSettings` with the actual launch directory and enabled settings sources in a bounded disposable inspection process. Extract only the billing fields and source labels defined below. This reuses the existing SDK dependency; inference continues through the installed CLI.

The resolver is a passive inventory of the locally readable settings cascade, not an authoritative report of runtime policy. It reads cached managed settings but does not execute `policyHelper`, refresh server-managed settings, invoke credential helpers, run hooks, or start MCP servers. Its documented operating-system policy readers, `plutil` and `reg.exe`, are permitted. Read `effective` and per-source `sources` only for the defined billing inputs; discard raw results immediately after extraction. Never send raw settings, helper command text, stdout or stderr to snapshots, diagnostic logs, exceptions or fixture recordings.

No full-session inspection profile is qualified for this contract. The billing inspector must not use `initialize`, `get_settings`, `/usage`, `--bare`, or an SDK query to fill inventory gaps. Managed or dynamic policy, host-managed contexts, missing sources, or unknown CLI/SDK contracts leave the affected additional billing facts unavailable. Do not start a trial session or introduce a billing warning, acknowledgement, or unsupported-version blocker. Direct launch-environment evidence and successfully extracted known override evidence remain actionable. An unreadable or incomplete inventory cannot erase a previously detected override or establish a subscription route. Unknown contracts retain direct environment evidence without calling an unqualified resolver.

The inspector receives an immutable snapshot of the impending launch environment. For the qualified ordinary local 2.1.307 profile, project the billing map below in memory onto that snapshot using the readable `effective.env`. Keep per-key provenance from `sources`, with managed > flag > local > project > user precedence, rather than assigning the whole `env` object one source. Values are literal strings: preserve `""` as an override that clears an inherited selection, distinguish it from an absent entry, and never expand shell expressions. The qualified projection supplies classification and fingerprint evidence and is applied to the existing required authentication read, so a project-only API credential is checked in its launch context. It is not applied to the work environment and creates no additional authentication subprocess. A configuration-affecting launch argument that the resolver cannot represent makes that part of the inventory unavailable.

| Billing-map group | Keys |
|---|---|
| Direct credentials | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` |
| Provider selectors | `CLAUDE_CODE_USE_` followed by `BEDROCK`, `FOUNDRY`, `ANTHROPIC_AWS`, `ANTHROPIC_GOOGLE_CLOUD`, `MANTLE`, or `VERTEX` |
| Endpoints | `ANTHROPIC_BASE_URL`; `ANTHROPIC_` followed by `BEDROCK`, `FOUNDRY`, `AWS`, `GOOGLE_CLOUD`, `BEDROCK_MANTLE`, or `VERTEX`, then `_BASE_URL`; `AWS_ENDPOINT_URL`, `AWS_ENDPOINT_URL_BEDROCK`, `AWS_ENDPOINT_URL_BEDROCK_RUNTIME` |
| Provider credentials and selectors | `AWS_BEARER_TOKEN_BEDROCK`, `ANTHROPIC_FOUNDRY_API_KEY`, `ANTHROPIC_FOUNDRY_AUTH_TOKEN`, `ANTHROPIC_AWS_API_KEY`, `ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_VERTEX_PROJECT_ID`, `ANTHROPIC_AWS_WORKSPACE_ID`, `ANTHROPIC_GOOGLE_CLOUD_PROJECT`, `ANTHROPIC_GOOGLE_CLOUD_LOCATION`, `ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID` |
| Cloud credential context | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `AWS_ROLE_ARN`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`, `CLOUD_ML_REGION` |
| Profile/federation context | `ANTHROPIC_PROFILE`, `ANTHROPIC_CONFIG_DIR`, `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_IDENTITY_TOKEN_FILE` |
| Custom authentication/routing | `ANTHROPIC_CUSTOM_HEADERS`; `CLAUDE_CODE_SKIP_` followed by `BEDROCK`, `FOUNDRY`, `ANTHROPIC_AWS`, `ANTHROPIC_GOOGLE_CLOUD`, `MANTLE`, or `VERTEX`, then `_AUTH` |

Retain `apiKeyHelper`, `awsCredentialExport`, `awsAuthRefresh` and `gcpAuthRefresh` as settings-source evidence; do not invent environment variables for them or invoke helpers separately to obtain credentials. Apply cloud credential/context entries only to the relevant selected provider's classification and fingerprint: their presence alone does not select that provider. A nonempty named Anthropic profile, or both federation rule and organization identifiers, is separately billed credential-selection evidence. Custom headers are inspected only for credential, organization/tenant or routing effects; unrelated headers are not billing evidence. Keep values private under AC-RUN-06.

The ordinary projection is ineligible for desktop entrypoints (`claude-desktop`, `claude-desktop-3p`, `local-agent`), `CLAUDE_CODE_ENVIRONMENT_KIND=byoc`, `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`, `CLAUDE_CODE_HOST_AUTH_ENV_VAR`, or `ANTHROPIC_UNIX_SOCKET`. Host-launched sessions preserve inherited keys and can filter settings-sourced provider/auth inputs beyond the raw cascade. Do not guess those effects. An unqualified profile or incomplete managed-policy reading leaves projection unavailable, preserving concrete launch-environment and safely extracted override evidence under the optional-inspection rule below. It never bypasses required authentication or mandatory policy. The raw cascade is partial evidence in these contexts, not a certified effective environment.

This map is versioned with the CLI contract fixtures. Its projection rules follow the [settings environment contract](https://code.claude.com/docs/en/settings-reference#env), [environment reference](https://code.claude.com/docs/en/env-vars), and [authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence). Qualify changes against the installed CLI before adding them; an unrelated `ANTHROPIC_*` or `CLAUDE_CODE_USE_*` name is not automatically billing evidence.

Authentication, model, skill, provider and mandatory-policy readiness checks remain independent and authoritative. Consume safe authentication facts from the required readiness result, including `apiProvider`, `apiKeySource`, authentication method, email, organization and subscription type when available. The billing inventory neither replaces those checks nor treats partial settings as their successful result. For the qualified ordinary local contract, supply the projected billing environment to the existing required `auth status --json` read; otherwise retain that readiness path’s existing environment and policy behavior. An unavailable projection never becomes a fabricated one. The billing inventory adds no authentication subprocess merely to populate optional billing fields. A real required-readiness failure retains its specific actionable failure, including sign-in guidance for `loggedIn: false`; billing approval cannot bypass it. A credential’s presence is not proof the remote service will accept it; actual provider refusal retains existing handling. Work-process settings and policy enforcement are unchanged.

When passive settings inspection is unsupported, incomplete or fails but authentication readiness succeeds, keep direct launch-environment evidence and any successfully extracted override evidence. Without concrete override evidence, use the neutral `settings` route under BILLING-002. With concrete evidence, require approval even if other fields failed. An internal exception is not an optional-field absence: emit a sanitized diagnostic code and do not classify it as a subscription. A malformed optional field is omitted with a diagnostic. Missing runtime-policy information never certifies that the local cascade is complete.

The passive-inspection deadline covers settings resolution, extraction and cleanup. Required readiness retains its independent timing and result: an optional timeout cannot consume its budget or become a sign-in failure. Timeout or output overflow settles the inventory as unavailable with a sanitized diagnostic code and no retained raw output, rather than leaving Checking indefinitely. Stop/cancel invalidates the entire result and never dispatches work. Inspection processes are never recorded as AI session runs.

### Route and source classification

Classification produces `subscription`, `metered`, or `settings`; readiness failures are a separate result. No plan label or email alone establishes a subscription route.

| Evidence | Result |
|---|---|
| First-party subscription authentication, consistent CLI account metadata and qualified ordinary inventory, no detected override | `subscription`; reported identity and plan; overflow remains independent |
| Detected `ANTHROPIC_API_KEY`, `apiKeySource` identifying API access, or `api_key`/`api_key_helper` authentication | `metered`, direct Anthropic API unless endpoint/provider evidence says otherwise |
| Detected `ANTHROPIC_AUTH_TOKEN`, alternate API endpoint, selected third-party/cloud gateway provider, or configured API helper | `metered`; name the provider only when known, otherwise “configured provider” |
| Long-lived Claude subscription OAuth source with no separate-billing evidence | Subscription only when the CLI establishes that route; otherwise `settings`. Do not treat all `oauth_token` values as subscription proof: a custom authorization header can produce that category. |
| Successful authentication, incomplete route metadata, no detected override | `settings`, normal neutral summary; no acknowledgement |
| Existing provider/model/policy incompatibility | Preserve that blocker regardless of billing approval |

The billing map identifies override evidence, not additional provider support. Resolve the selected provider from trustworthy CLI metadata; conflicting selectors without such metadata use “configured provider” rather than a guessed precedence. A nonempty custom endpoint is override evidence; a standard endpoint is not independently evidence of separate billing.

For settings sources, show a safe label such as “project settings · ANTHROPIC_API_KEY” or “Claude Code apiKeyHelper.” Do not show the setting's value, raw helper command, URL user information/query, or unknown provider-supplied prose. A CLI source unknown to Kiln can be described as a configured source without copying it verbatim. Use a first-party API payer identity only when the CLI ties it to that API context; subscription email is not an API payer fallback.

### Paid overflow and account attribution

Extend the existing Claude usage read to retain `usage_report.rate_limits.extra_usage.is_enabled` only when it is a boolean. `true` produces the approved factual notice; `false` has no extra notice; missing/unreadable is unavailable. Spending fields are not needed for this PRD.

Bracket the usage read with account identities. Attach overflow to a billing summary only when the available stable account/organization identifiers agree across those reads and with the inspected subscription account. Otherwise omit the overflow notice. Keep the usage gauges' independent availability and existing labels; do not hide them because overflow is absent. The launch gate does not wait for a fresh optional usage call: it may include the latest successfully attributed overflow reading from the current refresh interval (at most five minutes old). Running provenance records that reading's own timestamp.

## Codex Account and Credit Contract

Continue the existing 30-second metadata call, before/after account reads, configuration checks and launch-time validation. Extend the account result with optional credit observations from `account/rateLimits/read`, without adding an RPC method or changing dispatch permission.

For the pinned 0.162.1 contract, each `RateLimitSnapshot.credits` may contain `balance: string | null`, `hasCredits: boolean` and `unlimited: boolean`. Prefer `rateLimitsByLimitId`; inspect the legacy `rateLimits` only when the map is absent, as with existing usage rows. Never confuse `rateLimitResetCredits` with spendable credits. Never consume either kind.

Credit observations retain their bucket ID, reading time and stable usage account identity, corroborated by available workspace routing and consistent before/after ChatGPT account metadata. A mismatch or missing stable attribution omits the observation. The pinned credits shape matches the official app-server contract, which defines `credits` as remaining workspace credit details. Label these observations as workspace credits, attached to the corroborated account/workspace and bucket; do not reinterpret them as a personal balance. A future incompatible or scope-unknown contract omits optional credits until qualified. Preserve separate conflicting observations rather than summing balances or selecting an arbitrary bucket. A strictly numeric balance string is displayable as reported, not converted to dollars. `hasCredits` can supply a factual availability label when there is no usable balance. Do not present `unlimited` as unlimited model usage or a spending guarantee.

Missing/malformed optional credit fields add no warning badge or readiness blocker. Do not retain old credits as current after any refresh failure or identity change; a disconnected view can show its last snapshot labelled last known. A credit balance never changes `ordinaryUsageAllowed`, administrative blocks, consumed automatic-resume evidence or manual-recovery rules. API-key-only auth and non-OpenAI providers remain blocked with their existing remedy.

Replaces in part: `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Readings and identity and §Local API and snapshot changes (additive account billing summary and optional credits only). §Classification and bounded release is unchanged.

## Approval and Dispatch

### Context identity and invalidation

A Claude billing context contains the detected route/provider, effective credential-source identity, known payer identity, effective endpoint identity, supported detection-contract version, and detectable credential/configuration changes. Compute a canonical HMAC-SHA-256 fingerprint with a random execution-local key. The key and fingerprints remain private in owner-only PRD state; browser responses receive neither. Raw credentials are used only transiently when already present in the launch environment or passive settings result, then discarded. Never open Claude credential files/keychains or execute a helper independently to extract its output.

For direct environment/settings credentials, include the value in the private HMAC input, detecting replacement without persisting it. For a helper, include the effective helper definition and source, plus a nonsecret payer/source identifier when reported. For external/provider-managed credentials that the CLI does not expose, use only observable configuration and reported identity. The same unchanged helper may rotate its secret without exposing that change: this is an explicit detection limit under AC-RUN-04, not a claim of credential continuity. CLI/SDK version or detection-contract changes invalidate approval conservatively. Fingerprints cover observable configuration and reported identity; they do not certify unobserved helper output or remotely changing policy.

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

Superseded in part by: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Manual Phase Recovery (manual phase Resume requires an explicit already-complete choice; Verify acceptance still needs no billing approval).

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

Billing command errors use `{ ok: false, code, reason, billing? }`: `400 invalid_request`; `403 unauthorized` (existing protections); `409 stale_billing_reading`, `execution_changed`, `billing_busy`, `billing_approval_required`, or `readiness_failed`; `500 billing_state_write_failed`. A sanitized code describes inspection timeout/unsupported inventory contract in optional details; it is not automatically a 409 unless required readiness or detected-override authorization fails. No raw CLI error is included. Duplicate approval of the same still-current context is idempotent after rechecking it. Concurrent requests either join a read-only refresh or return `billing_busy`; they never enqueue an unbounded list of approvals.

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

The qualified passive profile is Claude Code 2.1.307 with Agent SDK 0.3.310. A disposable configuration probe of the real SDK resolver detected a project API key, helper definition and startup hook without executing the customization canary. Installed SDK declarations establish that the resolver does not spawn the CLI and omits dynamic `policyHelper` execution. Full runtime-policy visibility is therefore unavailable through this contract. A project-only `auth status` canary executed no customization; it does not establish universal managed-startup safety. A separate synthetic project-env probe established that the existing authentication read can recognize an API key when given the qualified projection. This connection changes the existing required read’s inputs, without adding a billing-only authentication call.

Generated codex-cli 0.162.1 schemas establish optional `RateLimitSnapshot.credits`; they do not prove every account supplies a balance. A metadata-only macOS qualification on 2026-10-26 corroborated both account reads and workspace routing with the usage identity and observed a credit balance string and boolean fields. The sanitized `test/fixtures/billing/codex-credit-contract-0.162.1.json` records shapes and attribution results only; it does not prove spendability, paid-use behavior, or unavailable-balance/exhausted-account conditions. Official app-server field notes establish workspace scope. Official [Claude authentication commands](https://code.claude.com/docs/en/cli-reference), [environment behavior](https://code.claude.com/docs/en/env-vars), [settings precedence](https://code.claude.com/docs/en/settings), and [Codex app-server](https://learn.chatgpt.com/docs/app-server) inform the contracts. Implementation must commit small sanitized contract fixtures and record the tested CLI/SDK versions. Raw responses are never fixtures.

### Required implementation evidence

- **Real passive boundary:** run the existing SDK resolver in disposable user/project/local configurations with synthetic credentials. Cover environment override, project/local precedence, empty override, custom authorization header, endpoint, helper and helper-definition change, source attribution, and the qualified in-memory projection. Assert no session-control/SDK-query process and untouched hook/helper/MCP canaries. Managed-helper presence must yield partial inventory without execution; verify this with generated/recorded contract evidence when no real managed test host is available and name that limit. Unknown contracts retain inherited evidence without running unqualified inspection. Cover failed inventory, timeout, cancellation, result and cumulative-output bounds, cleanup, and successful independent readiness after optional failure. No optional failure changes required-readiness results, clears known override evidence, or claims subscription access. Verify that a project-only API credential reaches the existing required authentication read through the qualified projection, while unqualified managed/host contexts retain existing readiness behavior. Corroborate reported identity through the independent readiness contract without adding billing-only authentication calls.
- **Approval/state rules:** deterministic tests for stale browser clicks, source/provider/payer/credential changes, context A→B→A, unknown-field retention, restart, new execution, clear, write failure and schema migration. Secret canaries must not appear in any snapshot, HTTP error, log, approval record or sanitized fixture. Verify HMAC changes without storing the canary.
- **Dispatch and recovery:** real temporary repositories and existing process harnesses demonstrate zero model dispatch before approval, every phase/finalization/audit launch and resume path gated, changed post-setup settings held, concurrent approval/clear/start serialized, no premature run or cleared wait on refusal, crash/restart retains a hold, and approval alone cannot dispatch. Pair these deterministic cases with the real SDK passive-inventory proof and existing installed-CLI readiness evidence; a scripted process alone is insufficient.
- **Codex:** regenerate the pinned schema; read live metadata without starting a turn; verify account/usage/account attribution and credits parsing. Cover missing/contradictory buckets, balance versus reset credits, API-only/provider rejection and unchanged automatic-recovery permission. Keep actual unavailable balance, paid-use and exhausted-account conditions explicitly unproved; do not buy credits or exhaust allowance for this feature.
- **Browser:** render the approved Claude and Codex states through the real local server. Exercise click/recheck/stale-click/clear and disconnect behavior, account-email placement, run versus next identity, Fable and all Codex usage rows. No warning/checkbox for missing optional credits or overflow. No new usage bar.
- **Release documentation:** update root installation/usage guidance for the launch-time boundary, Claude metered approval, account-managed overflow/credits and Codex restrictions. Inspect the built npm package to ensure guidance is available and private fixtures/state are excluded. This is verification, not authorization to publish.

The existing full verification suite remains the implementation commit gate. Native Linux/Windows metadata parity and provider configurations unavailable on the Mac remain explicit test limitations, consistent with the existing platform support decisions.

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

BILLING-001 and BILLING-002 remain pending, implementable business assumptions. No unresolved technical design decision remains. The passive inspection decision in §Passive inspection without a model request settles managed-startup safety by leaving unavailable runtime-policy metadata unavailable while preserving concrete override evidence and independent mandatory readiness.

Implementation must pass the required passive-inventory, source-provenance, projection and platform proofs before accepting the detector. A failed proof requires a design correction, not a new warning/waiver or silent expansion of supported providers. Credentials rotated behind an unchanged helper and runtime policy absent from passive inventory remain outside detectable-change guarantees.
