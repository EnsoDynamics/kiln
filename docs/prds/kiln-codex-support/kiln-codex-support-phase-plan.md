# Phase plan: Codex support for Kiln

**PRD:** [Codex support for Kiln](kiln-codex-support-prd.md) · **Design:** [single technical design](kiln-codex-support-technical-design.md) · **Decisions:** [validated assumptions](kiln-codex-support-assumptions.md) · **Evidence:** [research](kiln-codex-support-research.md)

## Execution order

Seven leaf phases, executed sequentially, with Phase 3 split into 3a and 3b, and 3b into 3b1 and 3b2. This is a plan only: no candidate proof, implementation or release proof ran during phase planning. The PRD remains one delivery; intermediate phases do not establish Codex release support.

| Phase | What it does | Depends on |
|---|---|---|
| [1 — Prove Codex can be audited before integration](phase-1-codex-audit-proof.md) | Exercise real published-method work and manual recovery before relying on the selected Codex execution and audit candidate. | None |
| [2 — Choose an agent and see its models and account](phase-2-codex-agent-selection.md) | Add working agent/model/account controls while preserving existing Claude records and behavior. | 1 (validated compatibility candidate and reusable metadata transport/profile) |
| [3 — Run and recover Codex phases through pull requests](phase-3-codex-session-workflow.md) | Split into 3a saved-conversation workspace checks and 3b execution, output and recovery through pull requests. | 1 (passed unattended/audit proof); 2 (agent selection, metadata, settings and migration) |
| [4 — Wait and resume after a confirmed Codex usage stop](phase-4-codex-usage-recovery.md) | Add bounded recovery for a structured Codex usage refusal, with pinned-contract automation and Doug’s deferred live validation. | 2 (fresh account/usage identity and readings); 3 (durable attempts, checks, resume and wait controls) |
| [5 — Prove the packaged Codex workflow on every platform](phase-5-codex-platform-proof.md) | Demonstrate the installed package, native platform behavior and complete multi-phase workflow before making support claims. | 1 (recorded prerequisite proof); 3 (integrated lifecycle and platform profile); 4 (validated usage recovery implementation; real quota proof deferred to live use) |

Each linked leaf owns its acceptance-criterion scope, exclusions and exact design pointers. No phase is closed at creation.

## Implementation progress

Phases 1 and 2 closed on 2026-10-23; see their leaf closure lines, [prerequisite proof results](kiln-codex-support-proof-results.md) and [agent selection results](kiln-codex-support-selection-results.md). Phase 3a closed on 2026-10-23 with the [production workspace evidence results](kiln-codex-support-workspace-evidence-results.md). Phase 3b1 closed on 2026-10-23 with the protected durable runner and qualified native cleanup; see [conversation runner results](kiln-codex-support-conversation-results.md). Its original full-containment failure remains explicit; Doug approved the bounded native contract and warning under RECOVER-001. Phase 3b2 closed on 2026-10-23 with [workflow integration results](kiln-codex-support-workflow-results.md): normal Codex phase/final-PR execution is enabled with complete evidence, truthful output and recovery. Phase 3's planned children are complete. Phase 4 closed on 2026-10-23 with bounded usage recovery and independent review/hardening. Doug explicitly deferred actual exhaustion/recovery to first live use; the recorded metadata/protocol/process/browser evidence does not claim a native quota pass. Phase 5 is the first open planned leaf, its implementation dependencies are met, and its inherited validation state is in that leaf. Intermediate closure establishes no platform or release support. Doug has not authorized pushing these local implementation commits.

## Sizing decision

The whole delivery does not fit one dependable session: it combines an unproved audit candidate, agent selection and metadata, a persistent multi-process execution/recovery lifecycle, a separate quota-recovery state machine and native-platform release evidence. The seams follow proof dependencies and independently exercisable behavior, rather than separating storage, API and UI layers.

| Phase | Single-session sizing and reason for the boundary |
|---|---|
| 1 | One bounded candidate proof with only the transport, decoder and evidence components needed by the harness. Its actual result determines whether normal execution may be integrated, so it must precede that work. |
| 2 | One read/control workflow from document discovery through saved selection and live metadata, carrying the necessary adapter/schema changes inside the slice. It can be exercised through the real API/browser and metadata calls without work turns. |
| 3 | One execution lifecycle, from Start through checks, output, stop and recovery to final PRs, using the proved candidate and existing engine. Re-sized at implementation: 3a independently checks real saved trees while execution stays gated; 3b1 proves the protected durable runner directly; 3b2 connects only that proved runner to normal execution, output and recovery. No intermediate runner is enabled. |
| 4 | One distinct recovery rule set and its refusal/release verification. Identity, consumed retry evidence and repeated-refusal suppression fit together and can be tested without waiting for the final package proof. |
| 5 | One acceptance/proof pass over the delivered package and workflow, with platform prerequisites named explicitly. It changes only compatibility prerequisites/documentation or defects required by these proofs; it is not another feature build. |

The sequential walkthrough leaves Phase 1 independently runnable, Phase 2 able to verify selection without an executor, Phase 3 with both its evidence prerequisite and settings in place, Phase 4 with an existing recoverable conversation, and Phase 5 with every implementation and usage proof it needs. Neighbors retain real boundaries: unknown candidate outcome, metadata versus work execution, ordinary versus quota recovery, and assembled native-platform evidence.

## Proof prerequisites and closure

The design's **Integration and Verification → Proof gates and tests** and **Open Questions** remain authoritative. Phase documents allocate the obligations; they do not relax them.

| Design obligation | Phase that supplies the evidence | What it blocks until it passes |
|---|---|---|
| Gate 1 / audit candidate runtime proof | 1 | Normal Codex execution integration and automatic phase passage in 3; support claims in 5. A failed result requires correcting the design or surfacing its product consequence, never modifying published method skills to fit the decoder. |
| Gate 2 / faithful recovery and platform runtime proof | 3 supplies the implementation and recovery evidence; 5 completes the native macOS/Linux/Windows MXC and package matrix. | Final platform support and release acceptance in 5. Metadata or schema inspection cannot replace runtime evidence. |
| Gate 3 / usage recovery verification | 4 | Initial implementation acceptance uses pinned contracts, live metadata and automated recovery tests. Doug deferred actual refusal/recovery to the first live occurrence on 2026-10-23; no native quota pass is claimed. |
| Gate 4 / assembled workflow | 5 | Release acceptance: at least two real phases through expected PRs, live/saved output, usage, interruption and manual recovery, cross-repository addition, plus Claude regression and the package/platform matrix. |

Record future proof outcomes and sanitized evidence references in `kiln-codex-support-proof-results.md` beside this plan; no results file is created before a proof runs. Native test hosts, compatible CLI/PowerShell installations, ChatGPT sign-in, disposable repositories/GitHub PR destinations and natural or approved exhausted-allowance conditions are prerequisites of the affected proof, not permission to mark it passed when unavailable. Do not deliberately burn substantial allowance. A mandatory unrun case leaves its owning phase open and release blocked, except actual quota exhaustion/recovery, which Doug explicitly deferred to live use in PRD AC-PROOF-03 on 2026-10-23. The pinned candidate has no reset-only recovery path; the design's conditional future-profile rule remains intact.

## Acceptance-criterion ownership

AC-PROOF-01 is retired into AC-PROOF-02 (cross-repository/workspace proof, owned by 1) and AC-PROOF-03 (remaining assembled-workflow/platform/usage proof, owned by 5). This separates the existing compound proof obligation without changing product scope. The design citations were updated with those labels; no previous PRD's supersession pointers are changed during planning.

Every other active criterion has exactly one owning leaf. Later leaves mark cross-cutting constraints as “also applies to this phase's work”; those entries do not transfer ownership. No assumptions, runtime findings or method guidance were changed by this plan.
