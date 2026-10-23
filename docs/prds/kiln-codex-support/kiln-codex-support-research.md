# Codex support for Kiln — Research and remaining proof questions

**Checked:** 2026-10-22 (local date); recorded 2026-10-23 UTC.
**Kiln baseline:** `1dfeab9`, including multi-repository delivery and usage-limit recovery.
**Installed Codex:** `codex-cli 0.162.1` on macOS.

This is evidence for the [PRD](kiln-codex-support-prd.md), not a technical design or a claim that Kiln already runs Codex.

## What Kiln Already Does

| Area | Observed implementation | Implication for Codex |
|---|---|---|
| Agent execution | `src/session/claude-session.ts` starts Claude in streaming, unattended mode; interrupt and resume use Claude's protocol. | A second agent needs its own session lifecycle and error handling. |
| Models and effort | `src/account/model-list.ts` queries the Claude Agent SDK; `ModelEffortEditor.svelte` has five fixed effort buttons. | Reuse the settings concept, but Codex choices must not be filtered through Claude aliases or five fixed levels. |
| Settings | `SettingsPanel.svelte` lets model and effort change for future sessions; the agent label is fixed text. Sessions retain their own choices. | One agent before Start is a small conceptual extension. Mid-PRD agent switching also affects recovery and account identity. |
| Account and limits | `src/account/claude-account.ts` uses Claude auth status and local `/usage`; `claude-info.ts` refreshes every five minutes. | The same account panel can serve Codex with different source data and window labels. |
| Progress | `src/session/session-output.ts` recognizes Claude Skill, Agent and Bash events. | Codex skills, tools and child-agent output need separate evidence rules; matching text by guess is insufficient. |
| Completion and workspace | Git/document checks are separate from agent claims. `outside-workspace.ts` reads Claude transcripts, including children, for edits and mutating Git operations. | The Git checks are reusable; the transcript-backed workspace check is a substantial compatibility requirement. |
| Recovery | Session records, transcript lookup, manual commands and prompts assume Claude. Usage recovery correlates structured refusals with account readings. | Preserve actual Codex conversation identity and distinguish quota exhaustion from transient errors. |
| Startup | `src/start-checks.ts` currently requires `claude` before the browser opens. | A Codex-only installation must be able to reach agent selection. |

Sources: [Kiln v1](../kiln-v1/kiln-v1-prd.md), [multi-repository delivery](../../changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), [usage-limit recovery](../../changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md), and the implementation paths above at the recorded baseline. The existing [ideas document](../../design/kiln-after-v1-ideas.md) already identifies headless Codex and account-limit display as future capabilities; its assumption of both five-hour and weekly windows is not universally true in the live reading below.

## What Was Queried for Real

A temporary read-only process started the installed `codex app-server --listen stdio://`, completed initialization, and called `model/list`, `account/read` with no forced token refresh, `account/rateLimits/read`, and `skills/list` for the Kiln checkout. No thread or model turn was started. The process was then terminated. The first attempt inside the execution sandbox timed out; the same metadata-only probe succeeded with normal host access.

- **Model catalogue:** seven picker-visible models, with no further page. The returned default was `gpt-6.1-sol`, displayed as GPT-6.1-Sol, with default effort `low`. Six effort levels were offered for it: `low`, `medium`, `high`, `xhigh`, `max`, `ultra`. Luna entries stopped at `max`; other defaults included `medium`. These are observed values, not a list to hard-code or proof of inference entitlement.
- **Account:** ChatGPT authentication, an account email present and a reported plan. No identity or credential value is retained in these documents.
- **Limits:** the response included `rateLimitsByLimitId` and a `codex` allowance whose primary window was 10,080 minutes, with percent-used and reset fields present. Its secondary window was absent. This establishes that primary does not necessarily mean five-hour and that a second window cannot be assumed.
- **Skills:** the installed catalogue exposed enabled `enso-method:implement-from-requirements`, `enso-method:deliverable-review`, `enso-method:test-hardening` and `enso-method:refactor-pass`. Discovery proves availability here, not successful execution in a Kiln workspace.

The CLI also generated its own JSON Schema with `codex app-server generate-json-schema`. The generated definitions include thread start/resume, turn start/interruption, supported reasoning efforts, account limits, approval policy/reviewer controls, and distinct `usageLimitExceeded` and `rateLimitExceeded` error variants. A type's presence does not prove every server emits it in every failure case.

## Official Integration Surface

OpenAI documents app-server model discovery, account/limit reads, thread start/resume, streaming activity and approval handling. It returns model-specific efforts and defaults, and quota windows with durations and reset times. This is a credible integration path, not a final architecture choice. See [Codex App Server](https://learn.chatgpt.com/docs/app-server).

The installed CLI's schema is the version-specific check against those docs. Other supported routes can be evaluated during design; [OpenAI's integration overview](https://developers.openai.com/blog/codex-as-a-platform) distinguishes noninteractive execution, SDK workflows and app-server clients. No desktop automation capability is inferred from these interfaces.

## Questions the Technical Design Must Resolve and Prove

1. **Unattended authority.** Select a supported permission configuration that allows the authorized workspace work, tests and Git delivery without blanket approval. Demonstrate that command/file approvals, questions and connected-tool prompts cannot strand a session. Account or organization restrictions must remain effective.
2. **Persistent conversation identity.** Save the ID before work can begin, recover it after a crash, resume through Kiln and the terminal, and preserve model/effort and history. Check the installed version's history storage and pagination; do not copy Claude's transcript paths or assume a caller-chosen conversation ID.
3. **Workspace evidence.** Establish complete enough records for the existing Stayed in the workspace check, including children, shell commands, file changes and work after manual resume. Prove repository additions during a phase work within permissions on macOS, Linux and Windows. Unavailable evidence cannot become an automatic pass.
4. **Progress and children.** Determine which events prove the method's steps and which child messages can be followed. Keep unobserved progress distinct from failed work. Display-only omissions must not weaken the workspace-evidence requirement.
5. **Usage refusal and release.** Capture a real exhausted-allowance response, identify the applicable account and allowance, and demonstrate a resume after reset. Distinguish transient rate errors and administrative/credit restrictions. Prove the bounded reset-only attempt when readings are unavailable, and account-change recovery; do not infer applicability from the names primary/secondary or scrape an assistant's prose.
6. **Compatibility and platforms.** Establish supported Codex versions, behavior when capabilities are missing, process-tree cleanup and interruption on all supported platforms, and persistence compatibility with existing Claude PRDs. Confirm the installed method skills are usable in the actual workspace, including multi-repository starts.

These are technical proof obligations for requirements already stated, not deferred product scope or work completed by the metadata probe.
