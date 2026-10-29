# Kiln

Kiln runs an [Enso Method](https://github.com/EnsoDynamics/enso-method) phase plan end to end. Given an already-written PRD, technical design and phase plan, it starts a fresh Claude Code or Codex session for each phase, checks in Git that each phase landed, and shows progress in a local web view. The sessions do the implementation, quality gates and Git delivery through the Enso Method skills, unchanged; Kiln owns the order and the visibility. When a phase doesn't land, Kiln hands it back to you with the command to resume that exact session.

The Enso Method works without Kiln. Kiln automates the loop a person otherwise runs by hand.

## Install

Kiln requires Node 22 or later, Git 2.29 or later, the [GitHub CLI](https://cli.github.com/) signed in, and either [Claude Code](https://docs.claude.com/en/docs/claude-code) or Codex signed in with the [Enso Method](https://github.com/EnsoDynamics/enso-method) skills installed. Codex currently requires **codex-cli 0.162.1**, authenticated through ChatGPT; other versions are rejected for model work. Read-only workspace verification also supports 0.165.0 reading retained 0.162.1 histories. See [Codex prerequisites and validation limits](docs/release/kiln-codex-macos-validation.md).

macOS is the natively validated platform. Linux and Windows remain best-effort targets: their native agent, console and sleep behavior is untested, and compatibility issues will be investigated from user reports. Native Windows/Linux proof is not a first-release gate. The [public release readiness review](docs/release/kiln-public-release-readiness-review.md) tracks validation evidence and the remaining publication gates.

From its first release on npm, one command installs the `kiln` command and its browser view:

```
npm install -g @ensodynamics/kiln
```

Until that release, install it from a clone of this repository, exactly as npm will publish it:

```
npm ci
npm pack
npm install -g ./ensodynamics-kiln-1.0.0.tgz
```

## Run

In a repository whose PRD has been refined and split into phases with the Enso Method:

```
kiln run docs/prds/<name>
```

The path is the PRD's directory (`docs/prds/<name>/` or `docs/changes/<name>/`) or the PRD file in it.

1. Kiln checks the documents and opens its browser view on what it found: the phase documents, the base branch and the feature branch it will use.
2. Confirm the PRD has been refined, choose the agent, model and effort, and press **Start**.
3. Kiln runs one session per phase and checks in Git that each phase landed. Work can span several repositories, with a pull request for each. Whole-PRD delivery and test audits run before completion. Keep its terminal open; Ctrl+C interrupts the current session.
4. When a phase doesn't land, **Needs you** shows the session’s message and what remains. Send a reply to let Kiln finish, or copy the command to discuss it in that same conversation in your terminal. Exit the terminal session, then resume in Kiln without repeating the answer. If you finished the entire phase yourself, use **Verify Phase … & advance**. A Resume that finds the phase already complete asks before advancing and preserves any unsent reply.

`kiln run` again, after Ctrl+C or a restart, checks the saved work and opens the phase overview without starting model work. Review completed and planned phases, then press **Resume Kiln**. Unresolved Needs you and intentional pauses retain their existing controls.

For terminal or bot orchestration, `kiln run <PRD-path> --resume` immediately continues an already-started execution with its saved agent, model, effort and branches. It preserves intentional pauses and all recovery/billing/delivery restrictions. It cannot configure or start a brand-new execution; that still uses Documents found and Start. For an already-running controller at the restart overview, use the existing status-bound `kiln continue` command.

By default, work stays on feature branches for review. Before Start or at Needs you, **Allow early merges** lets you approve a named repository and base branch for this run. Kiln may merge there early when a PRD criterion needs deployment or verification; the repository’s existing CI/CD controls deployment. No environment name or non-production declaration is needed. Required checks and reviews still apply, and remaining work ends in a review PR. Other branches, separate release workflows and destructive actions remain unauthorized.

`kiln run` starts or reopens the controller. The browser and documented local CLI can control existing work. Use `kiln status --json` to discover runs, `kiln status <PRD-path> --json` to inspect one, and command-specific `--help` for replies, no-message resume, verification, pause and settings. Help is available without a running controller. Sessions also use helper commands for repository setup, audit evidence and delivery.

Existing-run control commands require a caller-generated command ID and the status token returned by a fresh status read. Keep both when retrying the same instruction; inspect `kiln command-status <PRD-path> --command-id <id> --json` after a lost response. A new intention needs a new ID. Reply accepts a literal UTF-8 file or stdin. A reply or resume that discovers an already-complete phase never advances it: use explicit `verify-and-advance`, acknowledging any retained unsent reply with `--without-sending-reply`. See `kiln reply --help` and `kiln verify-and-advance --help` for complete examples and error handling.

For a running Claude phase or audit, `kiln message <PRD-path>` sends exact text from
`--message-file <path>` or `--message-from-stdin`, preserving outer whitespace. Claude
reads it at its next opportunity; the current tool may finish first. `kiln take-over
<PRD-path>` holds progression and waits for the next safe stopping point. Both require
the same command ID and fresh status-token flags above. Use `kiln handoff` only after
status reports safe release; it reads instructions and never opens a terminal.

`reply` resumes a stopped conversation. `request-pause` lets the entire phase/audit
and its completion checks finish first. These remain separate from live messaging
and takeover. If delivery is uncertain, inspect the message receipt and conversation,
then use `resume` or `verify-and-advance` with `--message-reviewed <receipt-id>` for
each reviewed uncertain message. Review never resends or confirms provider receipt;
only successful explicit hand-back releases the hold. See each command's `--help`.

## Audit document references

Audit snapshots require the PRD, design, assumptions, phases and their local Markdown
links recursively. Links can reach other requirements directories and roadmap contracts.
Missing required targets stop the audit and report the document chain.

For provenance or historical background that does not define requirements or required
evidence, give the inline link the exact title `kiln:reference`:

```markdown
[Original handoff](../../../source-material/handoff/index.md "kiln:reference")
```

Kiln does not traverse that link or require its target. Governing documents and explicit
`Superseded by:` / `Replaces:` pointers remain mandatory, even when a reference-only link
also points to them. Existing files still participate in repository fingerprints, and
reports must still supply all required evidence. No directory is automatically excluded.

## Claude billing

Before Start or Resume, Kiln shows billing for the next Claude run. A confirmed subscription says **Claude subscription**, with the account email directly below it. Billing follows your Claude account settings. If Claude reports that paid overflow is enabled for that same account, Kiln shows a factual notice and links to [Claude usage settings](https://claude.ai/settings/usage); it does not ask for another approval or change your spending limits. Missing overflow details do not mean paid usage is disabled.

An API key, authentication helper, alternate endpoint or provider setting can select access charged separately from a subscription. Kiln shows the detected source and requires **Use API billing for this PRD** (or the named/configured provider) before model work. The unticked choice authorizes only this PRD execution, including later phases and restarts, while its detectable billing context stays the same. Approval and Recheck billing never start or resume work. You can clear approval while no AI session or dispatch is running. A changed provider, credential source, known payer or detectable credential requires approval again; switching away invalidates the old choice.

If you intended subscription use, change the displayed override at its source and recheck. For an inherited environment variable, stop Kiln and restart it from the corrected environment. Kiln never deletes credentials, edits provider settings or silently chooses a different route. A sign-in failure still needs `claude auth login`, followed by recheck; billing approval cannot bypass readiness or add provider support.

When authentication works but additional billing details cannot be established and no override is detected, the neutral **Claude Code settings** summary lets work continue. Unavailable details are not a subscription guarantee. Running screens retain the billing recorded at launch; different fresh readings apply to the next run. Disconnected screens show last-known information with no approval or launch controls.

These checks run before each model-consuming launch or resume, including recovery, audits and final delivery. They inspect settings without making a model request and preserve local completion checks. They detect observable overrides; they are not a per-request billing firewall or a spending cap. A running CLI may reread settings or rotate credentials, and a helper can rotate its secret without Kiln observing it. Kiln does not interrupt an active session over a later settings change and makes no zero-cost guarantee. Set spending limits with [Anthropic](https://console.anthropic.com/settings/limits), [Claude](https://claude.ai/settings/usage), or the configured provider.

## Codex billing

Kiln shows **ChatGPT account**, the reported account email and plan, and “Billing follows your ChatGPT account settings.” Check your [ChatGPT usage and spending settings](https://chatgpt.com/codex/settings/usage). ChatGPT sign-in does not guarantee included-only or zero-extra-cost usage: eligible work may use account or workspace credits under those settings.

When Codex reports attributable workspace credits, Kiln shows each reported bucket separately, as a balance or availability fact. A balance is not a dollar amount or proof that paid usage or auto-reload is enabled, and it does not mean this run is using credits. Missing, stale or unattributable optional credits add no warning or confirmation and do not prevent Start or Resume. Existing usage gauges and Codex's recovery permission, credit and administrative restrictions still apply. Kiln never buys credits, changes spending preferences or redeems usage resets.

Running screens retain the account and credit facts recorded at launch; a different fresh reading is labelled for the next run. Older runs with no saved billing remain unavailable. Disconnected views mark their information last known and disable launch, resume and refresh controls. The launch-time checks and no-spending-cap boundary above apply to Codex too.

Codex requires ChatGPT sign-in and the OpenAI provider before every launch and resume, including after restart. API-key-only or missing authentication requires `codex login`, then refresh Codex information. A different provider requires changing the provider in Codex settings and refreshing; Kiln never rewrites it. Required authentication/configuration errors remain blockers. Claude billing approval never authorizes Codex API-key access.

## Requirements

- [Kiln v1 PRD](docs/prds/kiln-v1/kiln-v1-prd.md): what v1 delivers and its acceptance criteria.

## Design documents

- [Architecture proposal](docs/design/kiln-architecture-proposal.md): principles, v1 scope, the done check, the stop path, and open questions.
- [Interface scenarios](docs/design/kiln-interface-scenarios.md) and the [mockups](docs/design/mockups/): the v1 screens, which are the design of record.
- [Kiln roadmap](docs/kiln-roadmap.md): future feature ideas, with a separate note for each.
- [Future-feature index](docs/design/kiln-after-v1-ideas.md): links to individual idea notes and existing-feature references.

## Development

Node 22 or later and Git 2.29 or later. `npm install`, then `npm run verify`: dependency audit, lint, typecheck, the unit tests, and the integration tests, which build `dist/` first and run real `git` against temporary repositories. `npm run test:package` packs Kiln, installs the tarball globally into a temporary folder and runs that `kiln`. CI requires both on macOS, plus successful builds and package archives on Linux and Windows; Linux/Windows runtime behavior remains unconfirmed. Releases are published to npm by CI from a version tag: [release steps](docs/release/kiln-npm-release-steps.md).

`npm run test:live-proof` is the authenticated live-control provider test tier. It requires macOS, Claude Code 2.1.311 and an already signed-in account, and fails when those prerequisites are unavailable. It creates synthetic disposable conversations and local Git repositories to check literal live input, fresh turn context, natural foreground/background/subagent checkpoint yield and terminal-history hand-back. The normal offline integration suite also checks the packaged hook, real process ownership and a recorded, verified provider message contract; those checks do not claim a fresh model run. This provider tier spends model usage and runs separately from credential-free CI.

## License

Kiln is [MIT licensed](LICENSE), copyright Enso Dynamics. Bundled browser libraries and fonts retain their own licenses; their copyright and license texts are in [Kiln third-party notices](view/public/kiln-third-party-notices.txt), also shipped as `dist/view/kiln-third-party-notices.txt` in the npm package.
