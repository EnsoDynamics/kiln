# Codex support for Kiln — Agent selection results

**Recorded:** 2026-10-23 UTC. **Scope:** [Phase 2 — Choose an agent and see its models and account](phase-2-codex-agent-selection.md).

The selection slice is implemented; Codex work dispatch stays gated. Metadata readiness does not establish execution entitlement, AC-AGENT-03 completion, platform support or release readiness.

## Delivered contracts

- `AgentInfo` in `src/agents/metadata.ts` owns the selected agent's catalogue, readiness and account snapshot. A selection generation excludes late reads and stale editors, persists across restarts, and changes only on agent selection. Refresh runs at five-minute intervals and before a new conversation; direct Claude identity changes reload its catalogue too.
- The Codex 0.162.1 adapter uses a fresh bounded private stdio process for metadata. Its explicit method allowlist cannot start a thread or turn. It reads paginated selectable models, account/allowances, provider/hooks configuration, managed requirements and enabled, readable method skills for each requested launch directory. Known incompatible configuration becomes an actionable blocker. Full launch-profile verification, including Windows MXC, stays with Phase 3.
- First Codex selection uses the unique latest numeric GPT Sol with High. Dynamic advertised effort strings, including Ultra, reach the API and UI. Per-agent saved pairs remain authoritative; unavailable catalogues and invalid saved pairs block a new conversation without substitution. An explicit model change uses an advertised effort default when needed, with a visible notice; otherwise a person must choose.
- Schema 4 stores `agentId`, `selectionGeneration` and `agentChoices`; the choice map replaces top-level next-session model/effort. Schemas 1–3 become Claude records without requiring Codex or rewriting historical account facts. Local conversation keys, output paths, waits and existing recovery remain intact. Future schemas and unknown agents fail with an update message, including session/output reads.
- `POST /api/settings` requires the selected agent and generation for pair edits. `POST /api/metadata/refresh` refreshes without work. Pending/invalid selections and the explicit Codex execution gate refuse Start before allocation. Directory-dependent checks run again after setup. A between-phase readiness failure records a distinct `selection` stop: Needs you offers model/effort editing, terminal sign-in, metadata refresh and Check again, with no invented session or Resume.
- Allowance rows retain reported identifiers, distinguish primary/secondary windows, show unknown fields and local reset times, warn at 80%, and identify account-wide usage. A failed lookup alone is not a readiness blocker. Retained allowances require a matching account context without conflicting stable identities and keep their original successful timestamp plus stale indication.

## Evidence and limits

The production metadata adapter was run against the installed `codex-cli 0.162.1` on macOS with existing ChatGPT authentication, including the final provider/hooks inspection: seven selectable models; GPT-6.1-Sol advertised low, medium, high, xhigh, max and ultra; account and plan available; one reported allowance window; no readiness blockers. No conversation or model turn was created. The sanitized `test/fixtures/codex-metadata/model-list-0.162.1.json` retains the actual model-list wire result and provenance, without account data.

Real child-process fixtures exercise metadata pagination, delays/failures, incompatible versions/auth/configuration and skill checks. Real local Git repositories, owner-only JSON state, the loopback API and Chrome exercise selection, stale generations across restart, catalogue/account changes, cross-PRD isolation, and between-phase repair. These fixtures complement the live metadata read; they do not prove inference access or later execution/recovery paths.

Browser inspection covered normal, unknown and stale account states at 1280 and 360 pixels, and the repaired selection stop at both widths. No overflow or browser errors remained. Independent deliverable review's one Medium finding (no browser repair path between phases) was fixed and re-reviewed. Test hardening strengthened the five-minute scheduler, exact account/window/reset display and failed-usage account-change checks. It also caught contradictory routing/usage identities retaining old allowances; that defect is fixed. A shutdown regression exposed deferred Claude SDK spawning after abort; the spawn guard and real SDK regression prevent it.

Full `npm run verify` passed dependency audit, ESLint, TypeScript/Svelte checks, 474 unit tests, all 13 prerequisite-proof tests and 312 integration tests (two existing skips). The strengthened passive timer test also passes; a manual refresh cannot substitute for its scheduled read. Normal Codex execution and platform/release proof remain with the existing planned owners below.

## Continuation ownership

[Phase 3](phase-3-codex-session-workflow.md) consumes the selection contracts and supplies the production executor, profile enforcement, durable conversation/attempt records, complete evidence reader, output and recovery through pull requests. [Phase 4](phase-4-codex-usage-recovery.md) supplies confirmed structured refusal and account-identity recovery proof. [Phase 5](phase-5-codex-platform-proof.md) owns the native platform/package matrix and assembled workflow release proof. The prerequisite [Phase 1 evidence obligations](kiln-codex-support-proof-results.md) remain in force.

## Delivery authorization

Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95` says: “do not push without separate authorization.” It also says: “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Those restrictions were explicitly carried into implementing chat `01a16939-f6e3-7ba3-a4af-1a1c8f5aea6c` and remain in force. Phase 2 is committed locally by the implementation skill's normal scoped-commit default; it does not authorize pushing, publishing or changing Enso Method guidance. The unrelated staged root `README.md` is excluded.
