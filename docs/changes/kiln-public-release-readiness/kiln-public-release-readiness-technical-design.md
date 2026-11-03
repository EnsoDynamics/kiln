# Technical Design: Kiln public release readiness

**PRD:** [kiln-public-release-readiness-prd.md](kiln-public-release-readiness-prd.md)
**Assumptions:** [kiln-public-release-readiness-assumptions.md](kiln-public-release-readiness-assumptions.md)

## Overview

Most of this change is content and configuration: package metadata, repository files, help layout, release notes, documentation and a few test fixes. The one architectural change is how Kiln decides whether it can use an agent feature. Today three features are gated on an exact version (billing inventory on Claude Code 2.1.307 with Agent SDK 0.3.310, live control on Claude Code 2.1.311, PowerShell evidence on 7.5.2) and one parser rejects any new field (Codex compaction). This design replaces every exact gate with two things:

1. **A minimum version**, held in one module, checked at start and accepted for every version above it.
2. **Contract recognition at runtime.** Each feature checks the specific information it reads. When that information is missing or changed, the feature is marked unavailable with a compatibility notice naming the feature and agent version, and the rest of the run carries on. Information Kiln doesn't read is ignored.

Proof that billing and live control work on newer Claude Code comes from recorded contract fixtures captured on the newest Claude Code during implementation, replayed through the real adapters, plus mutation tests that show each recognition check turns the feature off rather than failing the run. No release-time test run on the newest agents is required (AC-AGENT-06 retired).

## Existing Code

- **Posture: Preserve.** Kiln is published from `develop` to real users' projects; billing, live control and Codex evidence behavior are constraints except where this PRD changes them.
- **Reused:** the billing route rule (subscription only with complete inventory, `claude.ai` authentication and the first-party provider), the passive settings worker and its bounded process, the live gate, checkpoint hook and replayed-message receipts, `supportedCodexVersion`, the command contract reference (`prompts/kiln-command-contracts.json`), `scripts/release.mjs` `checkRelease`, and the CI `full` scope.
- **Kept:** the checkpoint hook fails closed whenever a takeover is held; a billing reading Kiln does not fully recognise shows **Claude Code settings**, never **Claude subscription** (AC-BILL-02); Codex history that Kiln can't read completely leaves audit evidence inconclusive, as today.
- **Kept:** recorded fixtures named for the version that produced them (for example `claude-2.1.311-message-contract.json`) stay as historical evidence and are not renamed.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where minimums live | One module of agent tooling minimums (Claude Code 2.1.311, Codex 0.162.1, Node.js 22.15, Git 2.29, PowerShell 7.5.2) with one version-comparison function. `CODEX_MIN_VERSION` moves into it. | AC-AGENT-05 needs start checks, the README and every gate to state the same numbers. One source makes the README test and the standing guard below possible. |
| Standing guard against new exact pins | A unit test scans `src/` and `scripts/` (excluding tests, stand-ins and `test/fixtures/`) for agent tooling version literals outside the minimums module and fails on any it finds. | AC-AGENT-01 applies to every future feature. A test catches the regression at the commit that introduces it; a review note would not. |
| Version comparison | Numeric `major.minor.patch` comparison; build metadata ignored; a version Kiln cannot parse counts as unrecognised, not as below minimum. | The output format of `--version` is itself agent information Kiln reads (AC-AGENT-07). An unparseable version must not be reported as "too old". |
| Start checks for versions | `kiln run`'s start checks add Node.js (from the running process), Git, and each installed agent (Claude Code, Codex). Any below its minimum is a start problem naming the minimum and the update command. An agent that isn't installed stays as today: not a start problem. An unparseable agent version is not a start problem; the agent's features apply their own recognition. | AC-AGENT-05 says the start checks report every one of these. Blocking on an installed but outdated agent avoids Kiln later selecting it and failing mid-phase. |
| Billing gate | The settings worker runs whenever Claude Code reports a parseable version at or above the minimum and the installed Agent SDK provides the settings resolver. The CLI and SDK version numbers no longer decide anything else. | AC-AGENT-02 and PUB-003. The existing route rule already demands complete, recognised inventory plus a recognised subscription from `claude auth status --json`, which is Claude Code's own view of the effective credential. The version pin added nothing that rule doesn't already check. |
| Billing recognition | Inventory is complete only when the resolver result has the expected shape (a source list and an effective settings object), every source tier is one Kiln knows, and every billing field Kiln reads has the expected type. Unknown fields are ignored. Any failure records a diagnostic and leaves inventory incomplete, which yields **Claude Code settings**. | This is the existing extraction rule. It is stated here because it is now the only gate. |
| Billing contract identifier | `BILLING_CONTRACT` becomes a revision of Kiln's detection rules (`claude-settings-v4`), with no agent or SDK version in it. | The identifier is part of the billing fingerprint and of every approval. With an agent version in it, each automatic Claude Code update would silently void approvals. Moving from v3 voids existing metered approvals once; people re-approve on their next run. |
| Live control eligibility | Offered on macOS for Claude Code at or above the minimum. The attempt records the actual version as its profile (`claude-code-<version>/darwin`) for diagnostics; the profile is never compared for equality. | AC-AGENT-03. |
| Live message recognition | Each attempt's message contract starts **unproven** and becomes **recognised** on the first sent message that Claude echoes back as a replayed `user` event with the same UUID and exactly the sent text, and that a later `assistant` or `result` event lists as consumed. It becomes **unrecognised** when an echo for a sent UUID carries different text, or when a turn ends naming consumption in a form Kiln can't read. Unrecognised turns messaging off for the rest of the attempt; the message concerned keeps its existing **Delivery uncertain** receipt. | These are the exact fields messaging depends on. The literal `text_not_typed` flag can't be observed directly; verbatim echo is the observable proof that the text arrived literally. |
| Takeover hook recognition | The checkpoint hook needs `session_id`, `hook_event_name`, `tool_use_id` and `tool_name` (on `PreToolUse`), and needs `PostToolBatch` to fire after admitted tools resolve. When no takeover is held and the input is in a form Kiln doesn't recognise, the hook records the contract as unrecognised in the gate and lets the tool proceed. While a takeover is held, any failure still denies. The engine also marks the contract unrecognised when a tool call in the stream settles without a matching `PreToolUse` observation. Unrecognised turns takeover off for the attempt and cancels a takeover not yet reached, with a reason. | Today an unrecognised hook input fails the hook, and with `onFailure: block` that blocks every tool and stalls the run. AC-AGENT-04 requires the run to keep working. Failing closed while held keeps the existing safety guarantee. |
| Live launch arguments | If Claude Code exits before its first event, rejecting one of the live control arguments (`--replay-user-messages` or the hook settings), Kiln records live control as unrecognised for that Claude Code version and relaunches the same attempt once without them. | A removed flag is a changed contract for one feature, not a reason to fail the phase. The relaunch is recorded and reported, not silent. |
| Codex compaction | The parser requires the fields it reads and checks their values as today, and ignores any other fields. | AC-AGENT-07. The snapshot never substitutes for original execution records, so an unread field can't hide evidence. |
| PowerShell evidence | Any PowerShell at or above 7.5.2 is accepted. An AST node or alias inventory Kiln doesn't recognise leaves the evidence inconclusive, as a parse failure does today. | AC-AGENT-01. Recognition is already per node; the version equality added nothing. |
| Compatibility notices | A recognition failure in any feature above writes one notice to the PRD record, shown in the browser view and in `kiln status` (summary and `--json`). Billing writes none; it follows AC-BILL-02. | AC-AGENT-04 requires the feature and agent version to be visible in both places. |
| Kiln's own dependencies | Runtime dependencies use caret ranges (`acorn` moves from `8.19.0` to `^8.19.0`). The `@anthropic-ai/claude-code` development dependency is pinned to the minimum, 2.1.311, for the passive boundary test, which also accepts a path to another Claude Code so implementation can run it on the newest one. | AC-AGENT-01 allows a test to pin a dependency to replay a contract, provided that isn't the only proof for newer versions. |
| Proof scripts | Proof and exploration scripts accept any version at or above the minimum and record the actual version in their output and in any fixture they write. | AC-AGENT-01 names proof tools. |
| Text help | Each command contract gains a `group`. Top-level text help prints the start line, the status line, then the commands of each group in a fixed order, with every command in the `kiln-sessions` group collapsed into one line, and a closing sentence pointing bots at `kiln --help --json`. The `guidance` paragraph moves out of text help and stays in the JSON. A test fails above 40 lines. | AC-HELP-01 and 02. Text help and JSON help keep one source. JSON help gains the field and loses nothing. |
| `--version` | Handled in `cli.ts` before command routing, printing the version from Kiln's own `package.json`. | AC-HELP-03: no controller, Git or sign-in may be needed. |
| Usage errors | Each command's usage error prints only that command's `usage` line from its contract. | AC-HELP-04. |
| Source maps | The production build (`tsconfig.build.json`) and the view build emit no source maps. Development type-checking keeps them. | AC-PKG-02. |
| Clean builds | `npm run build` removes `dist/` first with a cross-platform Node step. | AC-PKG-03. Windows CI packs too, so the step can't be a shell `rm`. |
| Release notes | One Markdown file per version, `docs/release/notes/kiln-release-notes-<version>.md`. `checkRelease` reads it at the candidate commit and rejects a missing or empty file, so the pre-push hook, the CI candidate preflight and the release preflight all enforce it before the platform checks. The release job publishes with `--notes-file` instead of `--generate-notes`. | AC-NOTES-01 and 02. `checkRelease` is already the shared check run before the expensive jobs. Reading from Git objects matches what the hook checks. |
| Release rehearsal | `workflow_dispatch` on the release workflow gains a `rehearse` input. A rehearsal runs the preflight on any branch, including the notes check, forces publication off, and skips the platform checks and the publish job. | AC-NOTES-01 needs a run that stops before publishing; AC-CI-03 needs the platform checks to run only once, last. |
| Test ports | Tests that listen get a port from the operating system: a test helper binds port 0, reads the assigned port, releases it, and passes it (as a one-port range where Kiln takes a range). | AC-CI-01. The fixed ranges and ports in the integration tests are the known collisions. |

## Interfaces

### Agent tooling minimums

```
AgentToolingMinimums:
  claudeCode: "2.1.311"
  codex: "0.162.1"
  node: "22.15.0"
  git: "2.29.0"
  powershell: "7.5.2"        # Codex on Windows only

compareToMinimum(tool, versionOutput) -> { state: "supported" | "below_minimum" | "unrecognised", version?: string }
```

Each tool's `--version` output format (for example `2.1.317 (Claude Code)`, `codex-cli 0.166.0`, `git version 2.39.5 (Apple Git-154)`) is parsed by the module.

### Start check problem wording

```
Claude Code 2.1.300 is older than Kiln supports. Install Claude Code 2.1.311 or later: claude update
Git 2.25.1 is older than Kiln supports. Install Git 2.29 or later.
```

One line per tool, in the existing start-failure list.

### Top-level text help (shape, at most 40 lines)

```
Kiln runs an Enso Method phase plan with Claude Code or Codex.

Start:        kiln run <PRD-path>
See work:     kiln status

Answer a stopped phase
  <commands in this group> — <purpose>
Pause and take over
  ...
<further groups>

Used by Kiln's sessions: <count> helper commands (kiln <command> --help for each).
Bots and scripts: kiln --help --json lists every command with full metadata.
```

Command contract addition: `group: "start" | "inspect" | "answer" | "live" | "repository" | "kiln-sessions"`. The implementer assigns groups so that people-facing commands appear by task. A test checks that every contract has a group.

## Data Models

```
CompatibilityNotice:                     # PRD record, compatibility[]; latest per (feature, agentVersion)
  feature: "live_messages" | "takeover" | "codex_history" | "powershell_evidence"
  agentId: "claude_code" | "codex"
  agentVersion: string                   # as reported by the agent, or "unrecognised"
  detail: string                         # which needed field or event was missing or changed; never user text or values
  attemptId?: string
  observedAt: string

SessionRun.live (existing):
  profile: "claude-code-<version>/darwin"   # new attempts; older values stay as saved
  messageContract: "unproven" | "recognised" | "unrecognised"      # new
  hookContract: "unproven" | "recognised" | "unrecognised"         # new

Gate state (existing) adds:
  contract?: { state: "unrecognised"; detail: string; at: string }  # written by the checkpoint hook
```

These fields are additive and optional. Records without them read as before. The implementer decides whether that warrants a `SCHEMA_VERSION` increase under the record's existing migration rules.

## Integration Points

- **Claude Code CLI:** `--version`, `auth status --json`, stream-json output with `--replay-user-messages`, and hooks supplied through `--settings`. Every field read from these is checked by its feature as above.
- **Claude Agent SDK:** the settings resolver, in the existing disposable worker. Users' installs resolve the newest matching 0.3.x, not Kiln's lockfile, so the shape check is what protects newer SDKs.
- **Codex CLI:** `--version` and retained rollout history (compaction).
- **GitHub:** repository description, website and topics; branch deletion; `.github` issue forms and pull request template; Actions release workflow.
- **`enso-method-website` repository:** the Kiln page source (`scripts/kiln-page.mjs`) states the same minimums and platform support (AC-SYNC-01, 02). Deploying it stays out of scope.
- **npm:** package metadata only. Publication stays out of scope.

## Repository, Package and Documentation Changes

These criteria need content rather than design. What they must contain is in the PRD, so only where things go and how they are proved is recorded here.

- **Package metadata (AC-PKG-01):** `homepage`, `bugs`, `author` and `keywords` in `package.json`. The existing package manifest test asserts them, and asserts no `.map` file and no `sourceMappingURL` in the packed file list and JavaScript (AC-PKG-02).
- **README and minimums (AC-AGENT-05, AC-SYNC-01, 02):** a unit test reads the README's requirements table and development instructions and fails if a version there differs from the minimums module or lacks "or later". The live control description and the `test:live-proof` tier read "Claude Code 2.1.311 or later". The website page is checked by hand once and the result recorded in the candidate scan file.
- **CONTRIBUTING, SECURITY, issue forms, pull request template (AC-REPO-01 to 03):** `CONTRIBUTING.md` and `SECURITY.md` at the root, bug report and feedback forms under `.github/ISSUE_TEMPLATE/`, and `.github/pull_request_template.md`. The README links CONTRIBUTING.
- **GitHub settings and branches (AC-REPO-04, 05):** set with `gh`. Before deleting anything, the implementer writes the remote branch list with each branch's disposition (merged, equivalent, abandoned, kept) to the candidate scan file, deletes only branches the PRD names or that are verified merged or equivalent, and stops for Doug on any other.
- **Release guide (AC-REPO-06):** `docs/release/kiln-npm-release-steps.md` and `kiln-public-release-readiness-review.md` lose the token's two-factor setting, expiry and vault record, and gain the one-line description and where release notes go (AC-NOTES-02).
- **Candidate scan (AC-REPO-07):** a secret scanner over every tracked file and the full history, plus a pattern scan for client names, personal paths and private credentials. The client name list stays outside this repository, which is going public. Results go to `kiln-public-release-readiness-candidate-scan.md` in this change's directory, with matches described, not quoted.
- **CI evidence (AC-CI-02, 03):** reruns and their failures are listed in `kiln-public-release-readiness-ci-reruns.md` in this change's directory. The candidate checks start once, by opening the release pull request into `main` after everything else is met.

## Proving AC-AGENT-02 and AC-AGENT-03 on Newer Versions

| Evidence | Billing (AC-AGENT-02) | Live control (AC-AGENT-03) |
|----------|-----------------------|----------------------------|
| Gate tests (unit) | A version above the minimum with recognised inventory and `claude.ai` authentication gives **Claude subscription**. The same reading with an unknown source tier, a malformed field or an unknown authentication method gives **Claude Code settings**. | Eligibility is true for the minimum and any later version on macOS, and false below the minimum. The profile records the actual version. |
| Real boundary at the minimum (CI) | The passive boundary integration test runs the real SDK resolver against the pinned Claude Code 2.1.311, confirming billing details at the minimum (AC-AGENT-05). | The existing contract replay of the 2.1.311 fixture through the real session adapter. |
| Newest version, recorded during implementation | The same passive boundary test, run once against the newest installed Claude Code (2.1.317 or later). The result is recorded in this change's directory. No model call is made. | The live proof scripts (`npm run test:live-proof`) run once against the newest installed Claude Code. They write a new message contract fixture and a hook contract fixture, named with that version, which CI then replays through the real adapter beside the 2.1.311 fixture. |
| Mutation tests (CI) | The resolver result missing its source list, with an extra unknown field (still recognised), and with a non-string billing value. | Stand-in providers that drop the echo, alter the echoed text, omit `tool_use_id` from hook input, never fire `PostToolBatch`, and reject `--replay-user-messages`. Each turns its feature off with a compatibility notice while the phase completes. |

The recorded newest-version runs are implementation evidence, not a release gate. Doug's own test of the published release covers anything later (PUB-001).

## Open Questions

1. **PUB-003 is pending.** This design assumes it is confirmed. If Doug rules "keep the neutral summary on untested versions", billing would need a list of verified versions at or above the minimum, which is a version gate of the kind AC-AGENT-01 forbids. That ruling would need a PRD change, not only a design change.
2. **Billing at 2.1.311.** AC-AGENT-05 sets the Claude Code minimum on the assumption that billing details also work there. The passive boundary test on 2.1.311 settles it. If it fails, the minimum becomes the oldest version on which both billing and live control pass, and AC-AGENT-05 and the README change with it.
3. **Literal input on newer Claude Code.** Verbatim echo is the only observable signal that a live message was taken literally. The newest-version live proof must confirm that the echo still reflects literal handling (the fixture's leading slash command and file reference were not expanded). If a version could expand the text while still echoing it verbatim, that would be a risk Kiln can't detect. It would then go to the assumptions document for Doug, in the same way as PUB-003.
4. **Rehearsal dispatch.** GitHub only lists `workflow_dispatch` for a workflow present on the default branch. The implementer confirms that the rehearsal can be dispatched on `develop` before `main` has the new workflow. If it can't, a rehearsal job in the CI workflow, triggered by dispatch, is the same check in a different place.
