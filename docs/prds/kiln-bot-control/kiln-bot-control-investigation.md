# Kiln bot control — existing capabilities and design questions

Checked 2026-10-26 against Kiln checkout `44525bb`. This is evidence for the [PRD](kiln-bot-control-prd.md), not a technical design or a live-account test. No login was initiated and no real run was controlled.

## What already exists

| Finding | Evidence |
|---|---|
| Phone-bot control was recorded on 2026-10-17, under an unscheduled idea rather than the ordered roadmap. | [More terminal commands](../../design/kiln-after-v1-ideas.md#more-terminal-commands) |
| The original design anticipated another local client, while retaining loopback, Host, Origin and token protections. | [Control From Outside the Browser](../kiln-v1/technical-design.md#control-from-outside-the-browser) |
| Browser controls already cover pause/cancel, check again, resume with optional note, runtime settings and outside-workspace confirmation. | `src/server/local-server.ts`, routes for `/api/pause`, `/api/check-again`, `/api/resume`, `/api/settings` and `/api/outside-confirmation` |
| Snapshots carry phase/activity history, stop messages, checks, resume instructions, output references, usage limits and account provenance. | `src/engine/snapshot.ts`, `Snapshot`, `PhaseView`, `SessionIdentityView` |
| There is a per-user port registry and a process-identity-aware per-PRD lock. This is a discovery starting point, not proof a port still belongs to a run. | `src/state/instance-lock.ts` |
| User-facing status/control commands do not yet exist; run, repository, audit and delivery helpers do. | `src/kiln-command.ts`, command dispatch |
| Claude identity and usage are refreshed; Codex account/usage reads check stable account identity and recovery permission. Some failed refreshes deliberately retain labelled stale facts. | `src/account/claude-account.ts`, `src/agents/metadata.ts`, `src/agents/codex-metadata.ts` |
| Billing safeguards are separately designed, not implemented at this baseline. Their launch checks and approval rules must remain authoritative when delivered. | [Billing safeguards PRD](../../changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md) |

Doug explicitly confirmed in this chat that Grokpod or any other caller already has access to execute terminal commands anywhere on the Mac. The feature therefore requires no transport service or vendor-specific bot SDK.

## Login evidence and limits

Local `claude auth login --help` exposes subscription login and an `--email` option that **pre-populates** the provider login page. That does not prove the resulting account matches the requested email, or that authorization from a phone completes on the Mac. Anthropic's [authentication troubleshooting](https://support.claude.com/en/articles/14552646-troubleshoot-claude-code-installation-and-authentication) discusses remote environments where localhost callbacks prevent completion.

Local `codex login --help` exposes `--device-auth`. OpenAI's [CLI login source](https://github.com/openai/codex/blob/main/codex-rs/cli/src/login.rs) directs headless/remote users to that option. Its presence is evidence for a candidate flow, not a completed proof for Kiln's supported version, workspace policy or shared-login behavior.

## Questions the technical design must resolve

1. **Phone-completable authentication for each provider.** Prove initiation, user authorization on a separate device, any completion input, timeout/cancel, actual identity verification and effective launch credentials. Record provider/CLI versions. Determine how to avoid opening an unattended Mac browser as the only way forward. A local-only result fails the intended remote-login outcome and needs a product decision.
2. **Which runs share a login?** Establish credential/configuration scopes, including launch environment overrides, how to discover every affected local run, and how holds prevent automatic recovery or a new affected controller from racing login. Unknown scope must not be presented as isolated.
3. **Authenticated discovery and control.** Decide stable run identity across restarts, how new executions differ, and discovery/version compatibility with older installed Kiln instances. Preserve local-server protections and return partial inventory when a known instance cannot be read.
4. **Requests that outlive the bot.** Define control-context invalidation, operation persistence, restart reconciliation, request deduplication, bounded output paging and structured error/exit contracts. A changed stop must reject an old reply; an operation accepted just before a disconnect must remain discoverable without replaying it.
5. **Provider secrets and external output.** Specify protected completion input and redaction of login instructions from persistent logs/history; keep authorization URLs/codes in the explicit login flow. Define the bot-facing integration guide's distinction between operator requests and session output.

The command mockup proposes interface names and payloads for review. These questions determine their implementation; they do not justify silently narrowing the PRD.
