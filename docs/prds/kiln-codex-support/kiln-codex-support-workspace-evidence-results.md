# Codex support for Kiln — Workspace evidence results

**Superseded in part by:** [AC-WORK-04, workspace evidence recovery amendment of 2026-10-30](kiln-codex-support-prd.md#workspace-evidence-recovery-amendment--2026-10-30). Historical unknown-evidence confirmation restrictions below describe the original delivery; the amended PRD and technical design govern explicit acknowledgment now.

**Recorded:** 2026-10-23 UTC. **Scope:** [Phase 3a — Audit Codex conversation workspace evidence](phase-3a-codex-workspace-evidence.md).

## Production check contracts

`src/session/codex-evidence.ts` scans complete saved conversation trees without a model turn. The evidence-only private RPC allowlist excludes work methods. Full turn pages are limited to 100 entries and all cursors are exhausted; archived/unarchived discovery is unioned with references and saved spawn IDs. Raw records and normalized pages are indexed temporarily on owner-only disk instead of retaining histories in memory. Temporary indexes are deleted after the check; Kiln persists compact frontiers and findings only.

The pinned static-dataflow decoder is the unchanged qualified Phase 1 implementation, now a production module with Acorn as a runtime dependency. The token-usage and inter-agent communication metadata envelopes already present in the original proof have explicit verified field/type contracts; they are not treated as executable inputs. Unknown wrappers or raw envelopes, unsupported or compacted history, missing records/children, unsettled turns/commands and source/tree changes remain inconclusive. No confirmation overrides unknown evidence. Default shell selection comes from authoritative recorded context; an override requires matching native argv. Native PowerShell bodies pass through the fixed non-executing AST helper, with literal operations interpreted by the reader. The actual parser host is `pwsh` 7.5.2; native Windows enforcement is not established by this macOS parser test.

Engine done and pull-request checks read fresh evidence for every recorded Codex session. A common two-minute phase-check signal bounds the scan, each RPC is bounded to 30 seconds, and reads are serial (below the design's four-call concurrency maximum). Additional memory/complexity bounds fail visibly: 16 MiB per raw/transport record, 4,096 threads, 100,000 cursors and 200 findings/problems. Wrapper bounds remain those of the qualified grammar. No partially read scan can pass.

`PhaseFacts.codexAudits` holds checked source identities, hashes, normalized frontiers, completeness and findings by local session ID. `codexConfirmations` records exact per-session fingerprints. The existing Claude timestamp confirmation path stays intact. An old Codex confirmation cannot cover a new record, newly discovered child, altered source, changed assigned roots or missing evidence, even when the new record has an old timestamp. Snapshot reads display the last check; completion always scans again.

## Real saved-conversation proof

The built production reader read the same provider-owned Phase 1 tree through the installed `codex-cli 0.162.1`, without starting or resuming a work turn. It obtained complete coverage of **117 operations across five conversations**, with **no evidence problems** and exactly the original deliberately planted `outside-sentinel/manual-audit-marker.txt` finding. The raw decoder grammar was not broadened and no method skill was edited. This independently matches the [prerequisite proof's negative control](kiln-codex-support-proof-results.md).

Real process-pipe fixtures and temporary Git repositories exercise pagination, archive relocation, descendant/reference union, inherited history ownership, corrupt/truncated/compacted/missing evidence, changing frontiers, timeout, conservative failed/missing-result effects and confirmation persistence/invalidation. Actual `System.Management.Automation.Language.Parser.ParseInput` tests interpret file writes, moves, redirection, locations and Git options without performing those operations, and reject unsupported syntax. Native drive/UNC strings are parser/path-semantic tests on macOS, not native Windows root enforcement proof. Parser success cases require the pinned version; a different installed version exercises the real refusal path, and the unrun success cases remain visibly skipped for that host. Phase 5 must provision the qualified parser on each native proof host.

## Continuation ownership

[Phase 3b](phase-3b-codex-conversation-workflow.md) owns production conversation creation, attempt lifecycle/profile enforcement, live output, explicit repair dispatch, and final workflow integration. Codex Start remains gated. [Phase 4](phase-4-codex-usage-recovery.md) retains actual usage refusal/recovery; [Phase 5](phase-5-codex-platform-proof.md) retains native platform, installed-package and assembled release proof. Intermediate audit closure makes no execution or release support claim.

## Validation and review

Final `npm run verify`: no blocking dependency findings; ESLint and TypeScript/Svelte pass; 474 unit tests, 13 prerequisite-proof tests and 388 integration tests pass, with two existing skips (integration 82.44 seconds). Independent deliverable review is clean after fixing raw native-command ownership and conservative PowerShell command/alias/parameter interpretation. Test hardening strengthens fresh reads through actual phase and pull-request Check again, plus positive append/remove/create interpretation. The final reviewed build again matches all 117 operations and the single original negative-control finding in the provider-owned proof tree, with no evidence problems.

The installed-package decoder executes with its shipped Acorn dependency and the helper is present. The existing package browser asset-count assertion fails against the favicon already in baseline `59de3ed`; [Phase 5](phase-5-codex-platform-proof.md#inherited-package-verification-failure) records it. No whole package or native-platform pass is claimed here.
