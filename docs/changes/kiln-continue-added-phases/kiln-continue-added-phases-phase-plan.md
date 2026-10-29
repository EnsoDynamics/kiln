# Kiln Continue Added Phases — implementation phase plan

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md) · **Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md).

## Implementation order

Build and verify each phase in this order. Phases 1 and 2a are implemented and closed; Phase 2b and Phase 3 remain planned.

| Phase | What it does | Depends on |
|---|---|---|
| [1: Continue added work after handback](phase-1-active-plan-handback.md) | Reconcile an unfinished run's revised plan when control returns, show additions or discrepancies and automatically advance through eligible work. | None. |
| [2: Find added work on completed features](phase-2-completed-feature-discovery.md) | Split into 2a current-plan checks and 2b added-work readiness, both above earlier delivery history. | 1 (retained baselines, plan comparison, coherent-source reading and engine reconciliation). |
| [3: Continue a completed feature safely](phase-3-accepted-feature-continuation.md) | Accept the reviewed plan once, perform authorized preparation in a fresh execution and deliver the remaining work while retaining earlier history. | 1 (revised-plan scheduling and completion invalidation); 2 (bound discovery proposals, readiness and earlier-work reconciliation). |

## Criterion ownership

| Owner | Criteria |
|---|---|
| 1 | AC-HANDBACK-01, AC-HANDBACK-02, AC-HANDBACK-03, AC-HANDBACK-04 |
| 2a | AC-FIND-01, AC-FIND-02, AC-FIND-04, AC-CONTINUE-03 |
| 2b | AC-FIND-03, AC-OFFER-01 |
| 3 | AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-02, AC-CONTINUE-04, AC-CONTINUE-05 |

All 16 criteria have exactly one owner. No labels are retired or rewritten. Later phases reuse earlier behavior and prove it at their added boundaries; failed or incomplete checks must remain distinct from a successful unchanged plan when Phase 3 adds executable controls.

## Sizing decision

The whole change spans active-session reconciliation, completed-feature discovery and a recoverable fresh-execution lifecycle. One session would have to hold source comparison, both providers' handback, permission provenance, cross-repository preparation, engine-owned verification, command replay and historical execution targeting through all their proof cases. These are three independently exercisable capabilities, rather than storage, API and UI layers.

Phase 1 owns four criteria and supplies the shared comparison contracts through a complete handback-to-next-phase path. Its actual-provider and audit/finalization proof belongs in that implementation session. Phase 2 was split during implementation: 2a owns four criteria through an independently useful read-only check across CLI, server and browser, including source reconciliation and legacy recovery. Phase 2b owns the two remaining criteria, adding external-completion classification, preparation extraction and authority evaluation to the readiness result they determine. This keeps historical-source recovery separate from the larger preparation and authorization proof burden. Combining either with its neighbor would mix a complete observation or handback capability with a separate lifecycle and its recovery model.

Phase 3 owns six criteria and is the largest phase. Its single capability is accepting and completing one proposed continuation: target grants, durable acceptance, fresh setup/activation, preparation-only provider turns, engine-owned verification, history and delivery are inseparable parts of that transition. It builds on Phase 2's evaluated bindings and the existing journal, workspace, provider, audit and delivery mechanisms. It is sized as one implementation session with its full proof burden; no safety or testing tail is deferred to a later phase. If implementation exposes a genuine capacity limit, re-split that phase under the normal phase-split rules rather than weaken its completion gate.

## Proof allocation and closeout

The single design's [Validation and Criteria Coverage](kiln-continue-added-phases-technical-design.md#validation-and-criteria-coverage) owns the proof requirements. Each phase runs its assigned boundary proofs and the repository's current required full verification gate before its implementation commit. Deterministic fixtures supplement the required real provider, browser, Git and non-production integration evidence; Phase 1's [validation record](kiln-active-plan-handback-validation.md) contains its completed runtime evidence; later phases must supply their own.

Phase 1 proves active handback, split/append recognition, known-source discrepancies and finalization ordering. Phase 2 proves completed discovery triggers, classification/readiness, original-authority evaluation, failure/currentness feedback and the read-only panel. Phase 3 proves the remaining offer interactions, grants, acceptance/setup/activation replay, historical reads, actual-provider preparation/verification admission and new delivery. Keep all examples and fixtures fictional. Add reverse supersession pointers to earlier PRDs/designs only in the implementation commit that changes their behavior.

Use the existing shared engine command owner; this plan neither creates a second journal nor depends on unfinished work from another PRD. Recheck the current private schema and shared control contracts at implementation time. CONTINUE-001/002 retain their declared proposed status and do not block implementation unless corrected.

After every implementation leaf closes, run whole-PRD delivery audit, then whole-PRD test audit and any completion work they require. Those are this PRD's closeout, not extra planned implementation phases. The next implementation unit is Phase 2b. Phase 2a is closed with evidence in [Completed-plan checks validation](kiln-completed-plan-checks-validation.md). Phase 1 recovery was validated on 2026-10-29; its validation record owns the current evidence and combined integration accounting. An authorized recovery workspace may continue sequential implementation before integration-branch publication; publication remains a separate authorization boundary.
