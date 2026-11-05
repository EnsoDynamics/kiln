# Phase 3b: Continue through planned preparation

**Closed:** 2026-10-30

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Readiness and Planned Preparation; Continuation Acceptance and Recovery; Interfaces; Data Models and Migration; Validation and Criteria Coverage.
**Parent phase:** [Phase 3](phase-3-accepted-feature-continuation.md)

## Summary
Kiln can continue a plan whose first unfinished phase must prepare earlier work. It performs the authorized preparation and independently checks the prepared code before allowing dependent implementation; delivery-target permission remains a separate choice.

## Acceptance criteria covered
AC-CONTINUE-07, AC-CONTINUE-09; AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-05, AC-CONTINUE-06 and AC-CONTINUE-08 also apply to this phase's work.

## Out of scope for this phase
Everything outside the parent PRD. No later implementation leaf is reserved for target-grant adoption, preparation, verification, replay or actual-provider proof.

## Phase dependencies
3a (recoverable acceptance, fresh execution, history and delivery); 2b2 (preparation bindings and readiness).

## Phase-specific notes
Own pending target-grant creation, no-launch behavior, refresh/replay/supersession and exact adoption at Continue; preparation-only provider turns; engine-owned verification attempts/checkpoints/process recovery; and one implementation admission in that same conversation. Prove both actual providers' complete preparation-to-verification-to-implementation path, source/configuration movement, failed/timeout checks, forged check claims and all replay boundaries. Complete the seven-state browser proof and revised-scope delivery proof for this workflow. All safety gates land with the path they admit; complete remaining reverse supersession pointers as the changed behavior lands.

## Inherited from Phase 2b2
Read [preparation-readiness validation](kiln-preparation-readiness-validation.md) and the design's implemented readiness boundary. Schema 16's immutable proposal binds candidate bytes, base vector, preparation source/check spans and settings. `PreparationBinding.valid` is read-time evidence only, never integration, project-check, target-grant or execution-admission proof. Revalidate at each execution boundary and preserve distinct external accounting while preparation remains pending.

Doug explicitly approved the existing-controls permission model in chat `01a18a26-f6dd-7ab2-88de-6523bc42f0fa`: “Yes, that's the right model. Update the design and implementation to use the existing controls, remove the extra conversation permission check, and continue with the rest of the work.” Continue authorizes ordinary preparation within the assigned working branch. The existing checkbox grants early merges to its exact repository/delivery target for the fresh execution. Original-conversation permission sources and human-authorship proof are removed from this track. Existing explicit restrictions, billing and destructive-operation boundaries remain. Prove both providers' actual preparation/verification/implementation path and target-grant adoption/replay rather than restoring an original-message permission gate.

Named feature destinations are accepted only when they identify the assigned fresh branch; the old completed run's settings cannot identify it before fresh identity allocation. The ordinary “this phase's branch” preparation form avoids that ambiguity. Current read-only proposal checking deliberately blocks unknown named destinations. Required verification remains engine-owned at the prepared checkpoint; readiness parsing never executes a command.

## Inherited from Phase 3a

Read the design's **Implemented integrated-prerequisite continuation (Phase 3a)** and [Integrated continuation validation](kiln-integrated-continuation-validation.md). Schema 17 now supplies private continuation accept/retry journal actions, immutable archives, exact historical reads, current-only inspection, a durable command identity index/sequence, recoverable fresh setup and restricted fresh activation. The public bot action allowlist is unchanged. Acceptance freezes the entire bound proposal; `PreparationBinding.valid` still authorizes no execution-time effect.

The ordinary integrated path is in `continuation-state.ts`, `continuation-setup.ts` and the engine's **Continuation Acceptance and Recovery** methods. Extend this one owner; do not add a parallel dispatch journal. Every effect-authorizing metadata publication, including partial setup progress and final active sidecar/baseline, faults mutations on an uncertain write. Recovery must preserve that behavior while adding pending authority, preparation and verifier stages. Historical completion references retain independently verified source/base mappings so prior squash/rebase deliveries remain usable on later continuations; they never become provider receipts or current target grants.

The inherited boundary deliberately rejects `preparation_available` acceptance with `preparation_unverified`. Phase 3b removes that refusal only with complete pending-grant adoption, authorized preparation, engine-owned checkpoint verification and one dependent implementation admission in the same provider conversation. Copy the real Git/Chrome/controller-death and installed-provider proof patterns; add the complete preparation path for both actual providers. Continue to preserve earlier archives, current billing/model controls, exact replay and fresh required audits/delivery. No additional original-message permission gate belongs here.

## Implementation and validation

Implemented the entire leaf without another split. Schema 18, pending exact-target authority, preparation-only turns, engine-owned native verification and same-conversation implementation admission are described in the design's **Implemented planned-preparation continuation (Phase 3b)**. [Planned preparation validation](kiln-planned-preparation-validation.md) records both actual providers, Git/Chrome/process-recovery evidence, the complete revised-scope delivery fixture, review/hardening and passing full/package gates. All implementation leaves are closed; the next owned unit is fresh whole-PRD delivery audit, followed by test audit and any required completion work, per the parent phase plan.
