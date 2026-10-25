# Kiln automatic completion audits — implementation plan

**Parent PRD:** [Kiln automatic completion audits](kiln-completion-audits-prd.md)
**Technical design:** [Single governing design](kiln-completion-audits-technical-design.md)
**Assumptions:** [Validated upgrade policy](kiln-completion-audits-assumptions.md#upgrade-001)
**Baseline:** Read the investigation's [Reconciliation with current development code](kiln-completion-audits-investigation.md#reconciliation-with-current-development-code) before changing the base. Planning used requirements HEAD `61f44da`, whose code outside this change directory matches development `390f994`.

## Execution order

Implement one phase at a time, in this order. Each linked document is one implementation session's scope; the PRD and technical design remain whole.

| Phase | What it does | Depends on |
|---|---|---|
| [1 Audit evidence interface](phase-1-audit-evidence-interface.md) | Accept or refuse whole-PRD audit reports through the packaged CLI and local server, using retained provider evidence and current repository content. | None |
| [2 Automatic delivery-audit cycles](phase-2-delivery-audit-cycles.md) | Split into 2a audit development delivery and 2b automatic cycles/progress. | 1 (report admission, snapshots, evidence catalog and durable audit records) |
| [3 Automatic test remediation](phase-3-test-audit-remediation.md) | Continue test remediation automatically and return test-discovered implementation changes through delivery audits before allowing final completion. | 1 (typed test reports and evidence/currentness checks); 2 (activity dispatch, repair loop, recovery, progress and development obligations) |
| [4 Show remaining human actions at completion](phase-4-completion-human-actions.md) | Added by delivery audit: disclose allowed remaining human actions on the completed-execution screen. | 3 (permitted human-action conclusions); 2b (completion activity projection and screen) |

## Sizing and independently verifiable boundaries

The whole PRD exceeds one coherent implementation run: it combines a new evidence-admission boundary, replacement of the completion/recovery decision across both providers, and a separate test-remediation state machine. The existing engine is approximately 3,100 lines; schema 5, phase-keyed session lookup, provider history, development obligations and browser projections all participate. The cut follows those capabilities rather than separating data, endpoints and UI.

| Phase | Why it fits one coherent session | Proof possible before later phases exist |
|---|---|---|
| 1 | One report-admission capability from real Git/provider inputs through authenticated CLI/HTTP to immutable accepted records; substantial schema, provenance and fingerprint work stays together. | Seed an assigned audit activity in disposable execution state, run actual Claude Code and Codex report producers against it, and submit through the packaged CLI/server. Exercise acceptance, refusal, currentness and crash/retry behavior without automatic scheduling or a new user-facing launch mode. |
| 2 (split) | 2a proves the audit development interface; 2b builds the automatic workflow on that preserved authority boundary. | 2a exercises assigned audits through CLI/HTTP and retained development evidence. 2b runs a closed plan through multiple repair rounds and a clean test audit into final delivery, including both providers, browser progress, interruptions and upgrades. |
| 3 | One extension of that workflow for unfinished test evidence; reuse delivery repairs and recovery instead of building a second scheduler. | Exercise real test remediation, independent re-grading, continuations, direct fixes and test-created completion phases, then verify both gates at final completion. |

Phase 1 is deliberately an API slice, independently verifiable rather than a complete unattended feature. Phase 2 includes generic dispatch for both audit kinds and the clean test-audit path; Phase 3 owns the full test-remediation criteria. The entire PRD remains unfinished until all planned leaves close. No intermediate phase may substitute a passing placeholder, waive the required test gate or weaken report validation to reach Complete.

Combining 1 and 2 would require designing and proving the evidence/provenance boundary while simultaneously replacing execution routing, recovery, development ownership and progress. Combining 2 and 3 would add test batching, retained grades and direct-fix feedback to that same execution rewrite. Those are separate substantial capabilities. Further cuts into schema, providers, UI or tests would create layers or undersized phases rather than useful verification boundaries.

## Criterion ownership

Each of the PRD's 19 current criteria has exactly one owner. Constraints marked “also applies to this phase's work” in later phase documents are re-proved for the new behavior; they do not change ownership. No criterion is retired, split or reworded by this plan.

| Criterion | Owning phase |
|---|---|
| AC-AUDIT-01 | 2b |
| AC-AUDIT-02 | 1 |
| AC-AUDIT-03 | 1 |
| AC-AUDIT-04 | 3 |
| AC-LOOP-01 | 2b |
| AC-LOOP-02 | 2b |
| AC-LOOP-03 | 2b |
| AC-LOOP-04 | 2b |
| AC-TEST-01 | 3 |
| AC-TEST-02 | 3 |
| AC-TEST-03 | 3 |
| AC-TEST-04 | 3 |
| AC-RUN-01 | 2b |
| AC-RUN-07 | 2b |
| AC-RUN-02 | 2b |
| AC-RUN-03 | 1 |
| AC-RUN-04 | 2b |
| AC-RUN-05 | 2a |
| AC-RUN-06 | 2b |

## Sequential verification

1. Phase 1 needs only existing Git workspaces, private state, provider histories and local transport. Its fixture-assigned activities exercise the production admission path; fixtures do not replace real provider evidence. It includes the additive storage/migration mechanics needed by that interface. Execution-wide upgrade adoption belongs to Phase 2.
2. Phase 2 consumes that interface, allocates real activities, unifies all completion entry points and runs the delivery repair cycle. It includes both providers' task-specific prompts/skill loading, minimal clean test-audit dispatch, all activity views, audit-owned development obligations and upgrade/recovery behavior. Its currentness checks reuse Phase 1. It does not wait for Phase 3 to make delivery repairs, crash recovery or the clean two-audit path demonstrable.
3. Phase 3 extends the same dispatcher and views for test continuations and test-discovered repairs. It reuses the existing repair path, checkpoint assignment and authoritative evidence checks, and proves final completion across startup, continuation, Check again and Resume. No dependency points forward, and no production release or infrastructure approval is a prerequisite between phases.

## Verification and closeout

The technical design's **Verification and Criteria Coverage** section is the proof contract for every phase. Use real disposable Git origins/worktrees, the packaged CLI/local server, actual Claude Code and Codex runs and real browser interactions for their respective boundaries. Deterministic fixtures supplement those proofs. Keep proof artifacts and observed limitations with each implementing phase; do not claim runtime validation from this planning document.

Each phase runs appropriate focused checks while iterating and full repository verification before its implementation commit. Reverse replacement pointers in historical requirements/designs land with the phase implementing the replaced behavior, per the PRD and design; this planning commit changes none of those historical documents. After Phase 3, run whole-PRD delivery-audit, implement any completion phases it adds, then whole-PRD test-audit under the method. This paragraph is closing workflow, not additional planned implementation phases.

## Phase 2 sizing update

Phase 2 now has two leaves; its split record owns their ordering and dependencies. Criterion AC-RUN-05 is owned by 2a; the other Phase 2 criteria are owned by 2b. Original Phases 1 and 3 and all PRD criteria remain unchanged. Phase 2a proves the development interface with assigned audit activities; Phase 2b proves the full automatic workflow, both actual providers and browser progress.

## Whole-PRD delivery audit — 2026-10-25

**Checked baseline:** `03a5f16e9bddb298ec99430455b8fe9205771219`, clean assigned worktree. All original planned leaves (1, 2a, 2b, 3) were closed. Scope was all 19 current PRD criteria; none is superseded or excluded. Three independent assessors derived required behavior from the governing requirements before tracing production entry points. Phase 3's closing handoff, verification record and retained provider proof were read as context, not substitutes for code tracing.

**Result:** 18 Implemented; AC-TEST-04 Partly implemented. The confirmed missing part and conflict-check evidence live in [Phase 4](phase-4-completion-human-actions.md#what-the-audit-found-missing). No criterion was classified as Changed outside the requirements, Waiting on a human action or Not built yet at this baseline. Original ownership and Closed lines remain unchanged.

| Criteria checked | Reachable production path | Status at baseline |
|---|---|---|
| AC-AUDIT-01, AC-AUDIT-04, AC-LOOP-02, AC-LOOP-03 | `Engine.decideQuietly` / `drive` / recovery → `nextActivity` → `auditNext`; normal phase sessions and repeated delivery/test gates; `pullRequestCheck` → `requireCurrentAudits`. | Implemented |
| AC-AUDIT-02, AC-AUDIT-03, AC-LOOP-01, AC-LOOP-04 | Packaged audit CLI → authenticated local server → serialized `Engine.auditCommand` → `submitAudit` / `validateReport`; whole-manifest source/evidence checks, append-only completion phases, immutable `AuditStore` records and concrete stopped checks. | Implemented |
| AC-TEST-01, AC-TEST-02, AC-TEST-03 | `auditNext` → `allocateAudit` / `auditPrompt` / provider launch; `validateReport` observed runs/red checks/re-grading and exact remaining batches; `submitAudit` progress checks; repairs/source changes return through delivery currentness. | Implemented |
| AC-TEST-04 | `validateReport` / `submitAudit` / final currentness gates and `activityViews` → audit detail; completion-screen disclosure remains Phase 4's gap. | Partly implemented |
| AC-RUN-01, AC-RUN-07 | `activityHistory` / `activityViews` → familiar browser rows/detail and terminal audit events; serialized `drive` proceeds directly after each successful activity. | Implemented |
| AC-RUN-02, AC-RUN-04, AC-RUN-06 | Persisted allocation/session identity, completion-first recovery and boundary pauses; `resolveAuditSkill` and both provider launch/history collectors; `migrateRecord` / legacy-complete reconciliation. | Implemented |
| AC-RUN-03, AC-RUN-05 | `captureSnapshot` / `compareSnapshots` / `auditCurrentness`; audit-owned development commands, `assignAuditObligations`, `ownerDeliveryCheck` and final `evaluateRepositories`. | Implemented |

This audit changes documents only. It neither implements the finding nor grades test evidence; no application suites were rerun. Next: implement the sole completion phase in a fresh chat, then run whole-PRD `test-audit`, retaining Phase 3's verification/environment record and the inherited publication hold. The local audit commit records completion of this audit, not completion of the PRD.
