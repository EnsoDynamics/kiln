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
| [2 Automatic delivery-audit cycles](phase-2-delivery-audit-cycles.md) | Run delivery audits, build their completion phases and audit the repairs again, with visible progress, recovery and existing development permissions. | 1 (report admission, snapshots, evidence catalog and durable audit records) |
| [3 Automatic test remediation](phase-3-test-audit-remediation.md) | Continue test remediation automatically and return test-discovered implementation changes through delivery audits before allowing final completion. | 1 (typed test reports and evidence/currentness checks); 2 (activity dispatch, repair loop, recovery, progress and development obligations) |

## Sizing and independently verifiable boundaries

The whole PRD exceeds one coherent implementation run: it combines a new evidence-admission boundary, replacement of the completion/recovery decision across both providers, and a separate test-remediation state machine. The existing engine is approximately 3,100 lines; schema 5, phase-keyed session lookup, provider history, development obligations and browser projections all participate. The cut follows those capabilities rather than separating data, endpoints and UI.

| Phase | Why it fits one coherent session | Proof possible before later phases exist |
|---|---|---|
| 1 | One report-admission capability from real Git/provider inputs through authenticated CLI/HTTP to immutable accepted records; substantial schema, provenance and fingerprint work stays together. | Seed an assigned audit activity in disposable execution state, run actual Claude Code and Codex report producers against it, and submit through the packaged CLI/server. Exercise acceptance, refusal, currentness and crash/retry behavior without automatic scheduling or a new user-facing launch mode. |
| 2 | One delivery-audit workflow built on the already verified admission boundary; activity identity, recovery, progress and development ownership belong with its first real automatic execution. | Run a closed plan through delivery audit, multiple repair rounds and an already-adequate test audit into existing final delivery. Interrupt/recover the workflow, inspect browser/terminal rows and prove old completed history is preserved. |
| 3 | One extension of that workflow for unfinished test evidence; reuse delivery repairs and recovery instead of building a second scheduler. | Exercise real test remediation, independent re-grading, continuations, direct fixes and test-created completion phases, then verify both gates at final completion. |

Phase 1 is deliberately an API slice, independently verifiable rather than a complete unattended feature. Phase 2 includes generic dispatch for both audit kinds and the clean test-audit path; Phase 3 owns the full test-remediation criteria. The entire PRD remains unfinished until all three phases close. No intermediate phase may substitute a passing placeholder, waive the required test gate or weaken report validation to reach Complete.

Combining 1 and 2 would require designing and proving the evidence/provenance boundary while simultaneously replacing execution routing, recovery, development ownership and progress. Combining 2 and 3 would add test batching, retained grades and direct-fix feedback to that same execution rewrite. Those are separate substantial capabilities. Further cuts into schema, providers, UI or tests would create layers or undersized phases rather than useful verification boundaries.

## Criterion ownership

Each of the PRD's 19 current criteria has exactly one owner. Constraints marked “also applies to this phase's work” in later phase documents are re-proved for the new behavior; they do not change ownership. No criterion is retired, split or reworded by this plan.

| Criterion | Owning phase |
|---|---|
| AC-AUDIT-01 | 2 |
| AC-AUDIT-02 | 1 |
| AC-AUDIT-03 | 1 |
| AC-AUDIT-04 | 3 |
| AC-LOOP-01 | 2 |
| AC-LOOP-02 | 2 |
| AC-LOOP-03 | 2 |
| AC-LOOP-04 | 2 |
| AC-TEST-01 | 3 |
| AC-TEST-02 | 3 |
| AC-TEST-03 | 3 |
| AC-TEST-04 | 3 |
| AC-RUN-01 | 2 |
| AC-RUN-07 | 2 |
| AC-RUN-02 | 2 |
| AC-RUN-03 | 1 |
| AC-RUN-04 | 2 |
| AC-RUN-05 | 2 |
| AC-RUN-06 | 2 |

## Sequential verification

1. Phase 1 needs only existing Git workspaces, private state, provider histories and local transport. Its fixture-assigned activities exercise the production admission path; fixtures do not replace real provider evidence. It includes the additive storage/migration mechanics needed by that interface. Execution-wide upgrade adoption belongs to Phase 2.
2. Phase 2 consumes that interface, allocates real activities, unifies all completion entry points and runs the delivery repair cycle. It includes both providers' task-specific prompts/skill loading, minimal clean test-audit dispatch, all activity views, audit-owned development obligations and upgrade/recovery behavior. Its currentness checks reuse Phase 1. It does not wait for Phase 3 to make delivery repairs, crash recovery or the clean two-audit path demonstrable.
3. Phase 3 extends the same dispatcher and views for test continuations and test-discovered repairs. It reuses the existing repair path, checkpoint assignment and authoritative evidence checks, and proves final completion across startup, continuation, Check again and Resume. No dependency points forward, and no production release or infrastructure approval is a prerequisite between phases.

## Verification and closeout

The technical design's **Verification and Criteria Coverage** section is the proof contract for every phase. Use real disposable Git origins/worktrees, the packaged CLI/local server, actual Claude Code and Codex runs and real browser interactions for their respective boundaries. Deterministic fixtures supplement those proofs. Keep proof artifacts and observed limitations with each implementing phase; do not claim runtime validation from this planning document.

Each phase runs appropriate focused checks while iterating and full repository verification before its implementation commit. Reverse replacement pointers in historical requirements/designs land with the phase implementing the replaced behavior, per the PRD and design; this planning commit changes none of those historical documents. After Phase 3, run whole-PRD delivery-audit, implement any completion phases it adds, then whole-PRD test-audit under the method. This paragraph is closing workflow, not additional planned implementation phases.
