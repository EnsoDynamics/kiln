# Kiln Codex prerequisites and macOS validation

Codex uses the same Kiln package and `kiln run <PRD directory>` command as Claude Code. Choose the agent on Documents found before Start. The choice then stays fixed for that PRD; model and effort changes apply to future conversations. A resumed conversation keeps its own recorded settings.

## Prerequisites

- Node.js 22 or later, Git 2.29 or later, and GitHub CLI signed in with access to the PRD's repositories.
- **codex-cli 0.162.1**, signed in through ChatGPT using `codex login` in a terminal before launching Kiln. No Codex desktop app is required. API-key-only authentication is outside this delivery. Other CLI versions are rejected before work and require their own qualification.
- Enabled, readable published Enso Method implementation, deliverable review, test hardening, refactor pass and their dependencies in every assigned launch directory. Kiln checks installed paths; the proof does not modify those skills.
- An available model catalogue with the selected model/effort. First Codex selection uses the latest reported GPT Sol at High; catalogue presence does not guarantee account entitlement. Refusal remains visible without substituting another model.
- The workspace-write/on-request/automatic-review profile must be allowed by local and managed settings. Kiln checks the effective profile and does not bypass policy or grant a source checkout merely to write linked Git metadata. Human questions stop at Needs you.

Only the selected agent needs to be installed and ready. Existing saved Claude work remains Claude work and does not require Codex.

## Validation scope and recovery limits

Required native validation for this delivery is **macOS only** on Doug's available Mac. Linux and Windows remain intended targets with best-effort compatibility, explicitly untested at runtime. Existing readiness, parser, protection and cleanup checks remain enabled. Windows requires the explicit MXC profile and qualified PowerShell; macOS parser fixtures do not establish native Windows execution, junction/UNC handling or sandbox enforcement. Do not infer validation of another Codex version or operating system from the Mac result.

Ctrl+C stops the conversation and the tracked commands Kiln can identify. Independently detached programs may survive; check background servers or jobs before resuming. A known cleanup failure remains visible and prevents automatic continuation. Saved output is separate from authoritative workspace evidence: missing or undecodable evidence cannot be confirmed into a passing check.

Actual quota exhaustion/recovery is deferred to Doug's first live occurrence under his recorded 2026-10-23 decision. Verified pinned contracts, real metadata and automated recovery tests establish initial implementation evidence only. Actual refusal, changed-account inference recovery and native repeated-refusal suppression remain unproved; do not burn allowance to manufacture those cases.

## Reproducing the remaining assembled proof

The [Phase 5 scope](../prds/kiln-codex-support/phase-5-codex-platform-proof.md) and [shared proof results](../prds/kiln-codex-support/kiln-codex-support-proof-results.md) are authoritative for completion. Reuse recorded Mac interruption/restart/original-pair, manual terminal and repository-addition proofs; this driver targets the missing installed-entry-point and actual-GitHub boundaries.

```text
npm run test:package
node scripts/proof-run/codex-packaged-workflow-proof.mjs seed EnsoDynamics/kiln-proof-codex-<unique-name>
```

`seed` initializes a disposable local repository containing the committed two-phase greeting fixture, packs this checkout and installs the tarball into an owner-only temporary folder. It runs the installed help command and records the exact installed path in `packaged-proof.json`. It performs no GitHub writes. The fixture deliberately has no deployment or CI workflows.

**Before the network proof, obtain separate authorization** to create the named private disposable GitHub repository, publish its seed on `main`, and let Kiln's sessions push only its assigned feature branch and open its final pull request. Doug's standing restriction is “do not push without separate authorization” (source chat `01a1689e-dbff-7f61-9231-139a95505c95`). Permission for this fixture does not authorize a Kiln product push or release.

After that authorization, from the seeded local repository create the private GitHub repository and publish its `main` seed. Then run:

```text
node scripts/proof-run/codex-packaged-workflow-proof.mjs run <owned-folder-from-seed>
```

`run` uses the installed `kiln` executable with real Codex, real Git and real `gh`; no Engine import or PR peer. It selects Codex through the normal authenticated local API, observes two sequential phases, and requires Complete with one open, ready-for-review GitHub PR whose head matches the pushed worktree. It reruns the fixture's tests, requires a clean worktree, and verifies `main` still equals the seed. It never merges, deploys, publishes a package or pushes product commits.

Raw terminal output, snapshots, account facts and local API state stay owner-only in the retained folder. Commit only sanitized thread IDs, hashes, PR links and summarized outcomes. If the proof stops at Needs you, retain its state and use that installed Kiln command's normal recovery path; do not overwrite the failure or call it a pass. The driver stops its CLI through the native Ctrl+C path on exit and reports a stop timeout explicitly.
