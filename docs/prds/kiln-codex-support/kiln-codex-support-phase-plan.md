# Phase plan: Codex support for Kiln

**PRD:** [Codex support for Kiln](kiln-codex-support-prd.md) · **Design:** [single technical design](kiln-codex-support-technical-design.md) · **Decisions:** [validated assumptions](kiln-codex-support-assumptions.md) · **Evidence:** [research](kiln-codex-support-research.md)

## Execution order

Seven planned leaf phases, executed sequentially, with Phase 3 split into 3a and 3b, and 3b into 3b1 and 3b2, followed by completion Phase 6 added by the delivery audit. The original split was planning only: no candidate proof, implementation or release proof ran during phase planning. The PRD remains one delivery; intermediate phases do not establish Codex release support.

| Phase | What it does | Depends on |
|---|---|---|
| [1 — Prove Codex can be audited before integration](phase-1-codex-audit-proof.md) | Exercise real published-method work and manual recovery before relying on the selected Codex execution and audit candidate. | None |
| [2 — Choose an agent and see its models and account](phase-2-codex-agent-selection.md) | Add working agent/model/account controls while preserving existing Claude records and behavior. | 1 (validated compatibility candidate and reusable metadata transport/profile) |
| [3 — Run and recover Codex phases through pull requests](phase-3-codex-session-workflow.md) | Split into 3a saved-conversation workspace checks and 3b execution, output and recovery through pull requests. | 1 (passed unattended/audit proof); 2 (agent selection, metadata, settings and migration) |
| [4 — Wait and resume after a confirmed Codex usage stop](phase-4-codex-usage-recovery.md) | Add bounded recovery for a structured Codex usage refusal, with pinned-contract automation and Doug’s deferred live validation. | 2 (fresh account/usage identity and readings); 3 (durable attempts, checks, resume and wait controls) |
| [5 — Prove the packaged Codex workflow on macOS](phase-5-codex-platform-proof.md) | Close the missing Mac installed-package and two-phase GitHub workflow proofs, reusing completed evidence; Linux/Windows are best effort and untested. | 1 (recorded prerequisite proof); 3 (integrated lifecycle and platform profile); 4 (validated usage recovery implementation; real quota proof deferred to live use) |
| [6 — Complete Codex agent and account displays](phase-6-codex-agent-account-displays.md) | Added by delivery audit: show the correct agent on Complete and in usage-resume instructions, and explicitly identify unavailable account fields in Documents found and recovery. | 2 (account metadata and summaries); 3b2 (Complete and recovery presentation); 4 (Codex usage-resume path) |

Each linked leaf owns its acceptance-criterion scope, exclusions and exact design pointers. No phase is closed at creation.

## Implementation progress

Phases 1 and 2 closed on 2026-10-23; see their leaf closure lines, [prerequisite proof results](kiln-codex-support-proof-results.md) and [agent selection results](kiln-codex-support-selection-results.md). Phase 3a closed on 2026-10-23 with the [production workspace evidence results](kiln-codex-support-workspace-evidence-results.md). Phase 3b1 closed on 2026-10-23 with the protected durable runner and qualified native cleanup; see [conversation runner results](kiln-codex-support-conversation-results.md). Its original full-containment failure remains explicit; Doug approved the bounded native contract and warning under RECOVER-001. Phase 3b2 closed on 2026-10-23 with [workflow integration results](kiln-codex-support-workflow-results.md): normal Codex phase/final-PR execution is enabled with complete evidence, truthful output and recovery. Phase 3's planned children are complete. Phase 4 closed on 2026-10-23 with bounded usage recovery and independent review/hardening. Doug explicitly deferred actual exhaustion/recovery to first live use; the recorded metadata/protocol/process/browser evidence does not claim a native quota pass. Phase 5 closed on 2026-10-23: the installed Mac package, two actual Codex phases and fresh final conversation reached the expected real GitHub PR, with complete clean audits; the shared proof results and leaf record exact artifact/version and final verification. All seven planned leaves are closed. The whole-PRD delivery audit subsequently added completion Phase 6; see the audit section below for the current handoff before the whole-PRD test audit. Mac runtime is validated; Linux/Windows and actual quota recovery retain only Doug's explicit limits, never a native pass. Doug authorized the disposable proof repository only and has not authorized pushing these local product commits.

## Sizing decision

The whole delivery does not fit one dependable session: it combines an unproved audit candidate, agent selection and metadata, a persistent multi-process execution/recovery lifecycle, a separate quota-recovery state machine and assembled package/workflow release evidence. The seams follow proof dependencies and independently exercisable behavior, rather than separating storage, API and UI layers.

| Phase | Single-session sizing and reason for the boundary |
|---|---|
| 1 | One bounded candidate proof with only the transport, decoder and evidence components needed by the harness. Its actual result determines whether normal execution may be integrated, so it must precede that work. |
| 2 | One read/control workflow from document discovery through saved selection and live metadata, carrying the necessary adapter/schema changes inside the slice. It can be exercised through the real API/browser and metadata calls without work turns. |
| 3 | One execution lifecycle, from Start through checks, output, stop and recovery to final PRs, using the proved candidate and existing engine. Re-sized at implementation: 3a independently checks real saved trees while execution stays gated; 3b1 proves the protected durable runner directly; 3b2 connects only that proved runner to normal execution, output and recovery. No intermediate runner is enabled. |
| 4 | One distinct recovery rule set and its refusal/release verification. Identity, consumed retry evidence and repeated-refusal suppression fit together and can be tested without waiting for the final package proof. |
| 5 | One acceptance/proof pass over the missing installed-package and two-phase GitHub delivery boundaries on the available Mac; reuse completed recovery/output/repository evidence. It changes only compatibility prerequisites/documentation or defects required by these proofs; it is not another feature build. |

The sequential walkthrough leaves Phase 1 independently runnable, Phase 2 able to verify selection without an executor, Phase 3 with both its evidence prerequisite and settings in place, Phase 4 with an existing recoverable conversation, and Phase 5 with every implementation and usage proof it needs. Neighbors retain real boundaries: unknown candidate outcome, metadata versus work execution, ordinary versus quota recovery, and assembled package/workflow evidence.

## Proof prerequisites and closure

The design's **Integration and Verification → Proof gates and tests** and **Open Questions** remain authoritative. Phase documents allocate the obligations; they do not relax them.

| Design obligation | Phase that supplies the evidence | What it blocks until it passes |
|---|---|---|
| Gate 1 / audit candidate runtime proof | 1 | Normal Codex execution integration and automatic phase passage in 3; support claims in 5. A failed result requires correcting the design or surfacing its product consequence, never modifying published method skills to fit the decoder. |
| Gate 2 / faithful recovery and platform runtime proof | 3 supplies Mac implementation/recovery evidence; 5 reuses it and completes Mac package validation. Linux/Windows receive best-effort review and remain untested. | Mac package/recovery acceptance in 5. Linux/Windows native proof is not required for closure and cannot be claimed from metadata/schema inspection. |
| Gate 3 / usage recovery verification | 4 | Initial implementation acceptance uses pinned contracts, live metadata and automated recovery tests. Doug deferred actual refusal/recovery to the first live occurrence on 2026-10-23; no native quota pass is claimed. |
| Gate 4 / assembled workflow | 5 | Release acceptance: installed Mac package and at least two real phases through expected GitHub PRs, plus Claude regression. Reuse completed live/saved output, usage, interruption/manual recovery and cross-repository-addition evidence; repeat only changed or missing boundaries. |

Record future proof outcomes and sanitized evidence references in `kiln-codex-support-proof-results.md` beside this plan; no results file is created before a proof runs. The available Mac, compatible CLI, ChatGPT sign-in and disposable repositories/GitHub PR destinations are prerequisites of the remaining workflow proof. Linux/Windows hosts are unavailable: compatibility is best effort and native behavior stays explicitly untested, without blocking closure or requiring host provisioning. Do not deliberately burn substantial allowance. A mandatory unrun case leaves its owning phase open and release blocked, except actual quota exhaustion/recovery deferred to live use and Linux/Windows runtime proof excluded from this delivery’s gate by Doug’s 2026-10-23 PRD decisions. The pinned candidate has no reset-only recovery path; the design's conditional future-profile rule remains intact.

## Acceptance-criterion ownership

AC-PROOF-01 is retired into AC-PROOF-02 (cross-repository/workspace proof, owned by 1) and AC-PROOF-03 (remaining assembled-workflow/platform/usage proof, owned by 5). This separates the existing compound proof obligation without changing product scope. The design citations were updated with those labels; no previous PRD's supersession pointers are changed during planning.

Every other active criterion has exactly one owning leaf. Later leaves mark cross-cutting constraints as “also applies to this phase's work”; those entries do not transfer ownership. Completion Phase 6 completes three criteria without transferring their original ownership. No assumptions or method guidance were changed by this plan or audit.

## Whole-PRD delivery audit — 2026-10-23

Audited implementation baseline: `676461a`, with all seven planned leaves closed and no uncommitted implementation changes. Independent readers derived required behavior from the governing documents and traced every active criterion from its user or system entry point. The main auditor confirmed each gap and the conflict check against all other PRDs. Of 25 active criteria, 22 are Implemented and three are Partly implemented: AC-VIEW-01, AC-VIEW-04 and AC-USAGE-03. Their exact missing parts are recorded in [completion Phase 6](phase-6-codex-agent-account-displays.md). AC-PROOF-01 remains retired into AC-PROOF-02/03; no active criterion is unbuilt, superseded, changed outside the requirements or waiting on a current human action.

The retained prerequisite artifacts confirm complete coverage of 117 operations with the deliberate outside-workspace marker detected. The assembled installed-package artifacts confirm two phases and a fresh final Codex conversation, 91 completely audited operations with no findings/problems, and the expected actual GitHub PR. Installed decoder and tarball hashes match the shared proof results and current baseline. Earlier real interruption, original-pair resume, terminal recovery and repository-addition evidence remains applicable. This audit traced delivered behavior and inspected retained artifacts; it did not rerun tests or grade their evidence. The whole-PRD test audit follows the completion build.

The approved Mac-only runtime scope, deferred real quota exhaustion/recovery and bounded native cleanup contract remain unchanged. Existing Claude catalogue naming and the existing saved-output/phase-route design are preserved rather than treated as new product gaps. The [Phase 5 final handoff](phase-5-codex-platform-proof.md#final-validation-and-audit-handoff--2026-10-23) and [shared proof results](kiln-codex-support-proof-results.md) retain validation details and explicit limits.

**Completion build:** Phase 6 closed on 2026-10-23, completing the three recorded presentation gaps without changing their original owners or the approved validation limits. Its implementation/test-audit handoff records whole-criterion evidence, review/hardening and the independently reproduced pre-existing dependency-audit failure.

## Whole-PRD test audit — 2026-10-23

[Test audit results](test-audit.md): all 25 active criteria are Adequate after fixing 11 initial test-evidence gaps. Independent re-grading and 16 distinct safe deliberate-regression checks confirm the strengthened evidence. Final lint/types, 492 unit tests, 16 protocol proofs, 459 integration tests with two existing skips at four workers, and four installed-package tests pass. The report retains the initial CLI fixture teardown failure and complete passing repeat, plus the unchanged pre-existing dependency-audit failure. No product implementation, requirements, approved validation limit or method guidance changed.

**Next unit:** none for this PRD. Delivery audit, completion Phase 6 and the whole-PRD test audit are complete; no build or audit successor is owed. Product commits remain local under Doug's no-push restriction; the disposable-proof authorization grants no product delivery authority.
