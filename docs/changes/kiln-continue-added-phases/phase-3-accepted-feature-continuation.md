# Phase 3: Continue a completed feature safely

**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — relevant sections: Readiness and Planned Preparation; Continuation Acceptance and Recovery; Interfaces; Data Models and Migration; Integration Points; Validation and Criteria Coverage.

## Summary
Accepting the displayed additional plan starts a fresh execution from current delivery bases while preserving earlier delivery history. Kiln performs authorized prerequisite preparation and its independent checks before implementation, then completes the revised plan through normal audits and delivery.

## Acceptance criteria covered
AC-OFFER-02, AC-OFFER-03, AC-CONTINUE-01, AC-CONTINUE-02, AC-CONTINUE-04, AC-CONTINUE-05.

## Out of scope for this phase
Everything outside the parent PRD; no later implementation phase is reserved for unfinished acceptance, permission, recovery or verification behavior.

## Phase dependencies
1 (active-run revised-plan scheduling and completion invalidation); 2 (completed-feature discovery, bound proposals, readiness and earlier-work reconciliation).

## Phase-specific notes
Own the remaining continuation/grant/preparation/replay/history proof rows and complete the seven-state browser coverage, both actual providers' preparation-to-implementation proofs and revised-scope delivery proof. Read-only extraction from Phase 2 is reused; all mutation, engine-owned verification and crash recovery needed to admit implementation land together here. Complete reverse supersession pointers as the changed behaviors land.

## Phase 2b2 handoff

Read the design's implemented readiness boundary and [preparation-readiness validation](kiln-preparation-readiness-validation.md). Schema 16 retains `completedPlanCheck.result.proposal`, with immutable sidecar reads in `continuation-readiness.ts`; its ID excludes check times and binds candidate bytes, base vector, preparation source/check spans and settings. A ready read-only offer starts no work. `PreparationBinding.valid` means its read-time checks passed, never that integration, project checks, a target grant or execution admission already happened. Revalidate at the Phase 3 boundaries. Preserve distinct external accounting while preparation remains pending.

Doug explicitly approved the existing-controls permission model in chat `01a18a26-f6dd-7ab2-88de-6523bc42f0fa`: “Yes, that's the right model. Update the design and implementation to use the existing controls, remove the extra conversation permission check, and continue with the rest of the work.” Continue authorizes ordinary preparation within the assigned working branch. The existing checkbox grants early merges to its exact repository/delivery target for the fresh execution. Original-conversation permission sources and human-authorship proof are removed from this track. Existing explicit restrictions, billing and destructive-operation boundaries remain. Phase 3 must prove both providers' actual preparation/verification/implementation path and target-grant adoption/replay, rather than restore an original-message permission gate.

Named feature destinations are accepted only when they identify the assigned fresh branch; the old completed run's settings cannot identify it before fresh identity allocation. The ordinary “this phase's branch” preparation form avoids that ambiguity. Current read-only proposal checking deliberately blocks unknown named destinations. Required verification is still engine-owned at the prepared checkpoint; readiness parsing never executes a command.
