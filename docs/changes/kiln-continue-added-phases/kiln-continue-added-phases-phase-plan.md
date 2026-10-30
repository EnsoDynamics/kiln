# Kiln Continue Added Phases — implementation phase plan

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md) · **Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md).

## Implementation order

Build and verify each phase in this order. Phases 1, 2a, 2b1, 2b2, 3a and 3b are implemented and closed. The next owned unit is a fresh whole-PRD delivery audit, followed by test audit and any completion work they require.

| Phase | What it does | Depends on |
|---|---|---|
| [1: Continue added work after handback](phase-1-active-plan-handback.md) | Reconcile an unfinished run's revised plan when control returns, show additions or discrepancies and automatically advance through eligible work. | None. |
| [2: Find added work on completed features](phase-2-completed-feature-discovery.md) | Split into 2a current-plan checks and 2b added-work readiness, both above earlier delivery history. | 1 (retained baselines, plan comparison, coherent-source reading and engine reconciliation). |
| [3: Continue a completed feature safely](phase-3-accepted-feature-continuation.md) | Split into 3a continuation with integrated prerequisites and 3b continuation through planned preparation, both preserving earlier history and normal delivery. | 1 (revised-plan scheduling and completion invalidation); 2 (bound discovery proposals, readiness and earlier-work reconciliation). |

## Criterion ownership

| Owner | Criteria |
|---|---|
| 1 | AC-HANDBACK-01, AC-HANDBACK-02, AC-HANDBACK-03, AC-HANDBACK-04 |
| 2a | AC-FIND-01, AC-FIND-02, AC-FIND-04, AC-CONTINUE-03 |
| 2b1 | AC-FIND-03 |
| 2b2 | AC-OFFER-01 |
| 3a | AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-05, AC-CONTINUE-06, AC-CONTINUE-08 |
| 3b | AC-CONTINUE-07, AC-CONTINUE-09 |

All 18 active criteria have exactly one owner. Compound AC-CONTINUE-02 was retired into AC-CONTINUE-06/07, and AC-CONTINUE-04 into AC-CONTINUE-08/09; the replacement pairs preserve the original combined intent. Phase 3a owns the cross-cutting offer, replay, history, current-base, delivery and control constraints; Phase 3b lists those constraints as also applying to its preparation workflow and proves them at that boundary. Failed or incomplete checks remain distinct from a successful unchanged plan.

## Sizing decision

The whole change spans active-session reconciliation, completed-feature discovery and a recoverable fresh-execution lifecycle. One session would have to hold source comparison, both providers' handback, permission provenance, cross-repository preparation, engine-owned verification, command replay and historical execution targeting through all their proof cases. These are three independently exercisable capabilities, rather than storage, API and UI layers.

Phase 1 owns four criteria and supplies the shared comparison contracts through a complete handback-to-next-phase path. Its actual-provider and audit/finalization proof belongs in that implementation session. Phase 2 was split during implementation: 2a owns four criteria through an independently useful read-only check across CLI, server and browser, including source reconciliation and legacy recovery. Phase 2b is further split: 2b1 owns external-completion accounting across the read-only CLI/browser path (AC-FIND-03); 2b2 owns preparation extraction, existing-control authorization evaluation and the bound readiness offer (AC-OFFER-01). The latter builds on the former’s complete classifications. This separates independently verifiable completion/integration accounting from the new preparation readiness capability, without separating storage, logic and presentation into layers.

Phase 3 is split at a business-workflow seam: 3a continues a plan with integrated, verified prerequisites through fresh setup, history, audits and delivery; 3b adds planned prerequisite preparation and its exact target grants, preparation-only provider turn and engine-owned verification. At the split decision, the code had no internal continuation journal actions, execution archive or preparation runner. Holding all new lifecycle and process-verification states with their actual-provider/browser/crash proofs in one session is beyond a dependable coherent run. Each child keeps its full replay, safety, review and testing tail; 3a never accepts a preparation-dependent proposal before 3b supplies the complete gate. A grant-only slice was rejected because it could not prove the original compound control criterion independently.

## Proof allocation and closeout

The single design's [Validation and Criteria Coverage](kiln-continue-added-phases-technical-design.md#validation-and-criteria-coverage) owns the proof requirements. Each phase runs its assigned boundary proofs and the repository's current required full verification gate before its implementation commit. Deterministic fixtures supplement the required real provider, browser, Git and non-production integration evidence; Phase 1's [validation record](kiln-active-plan-handback-validation.md) contains its completed runtime evidence; later phases must supply their own.

Phase 1 proves active handback, split/append recognition, known-source discrepancies and finalization ordering. Phase 2a proves completed discovery triggers and source failure/currentness feedback. Phase 2b1 proves complete classification, external-completion/integration evidence and its read-only presentation. Phase 2b2 proves preparation/readiness, existing-control authorization evaluation and the full offer panel. Phase 3a proves the remaining offer interactions, acceptance/setup/activation replay, historical reads, both providers' fresh-session admission and new delivery for integrated prerequisites. Phase 3b proves target grants/adoption/replay, both actual providers' preparation/verification admission, the complete seven-state browser set and new delivery for the preparation workflow. Keep all examples and fixtures fictional. Add reverse supersession pointers to earlier PRDs/designs only in the implementation commit that changes their behavior.

Use the existing shared engine command owner; this plan neither creates a second journal nor depends on unfinished work from another PRD. Recheck the current private schema and shared control contracts at implementation time. CONTINUE-001/002 retain their declared proposed status and do not block implementation unless corrected.

After all implementation leaves close, run whole-PRD delivery audit, then whole-PRD test audit and any completion work they require. Those are this PRD's closeout, not extra planned implementation phases. There is no remaining planned implementation leaf. Phase 3b is closed with evidence in [Planned preparation validation](kiln-planned-preparation-validation.md); Phase 3a is closed with evidence in [Integrated continuation validation](kiln-integrated-continuation-validation.md); Phase 2b2 is closed with evidence in [Preparation readiness validation](kiln-preparation-readiness-validation.md); Phase 2b1 is closed with evidence in [External-completion accounting validation](kiln-external-completion-accounting-validation.md). Phase 2a is closed with evidence in [Completed-plan checks validation](kiln-completed-plan-checks-validation.md). Phase 1 recovery was validated on 2026-10-29; its validation record owns the current evidence and combined integration accounting. An authorized recovery workspace may continue sequential implementation before integration-branch publication; publication remains a separate authorization boundary.
