# Phase 2: Automatic delivery-audit cycles

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: Architecture and Scheduling; Acceptance checks; Provider Sessions and Development Delivery; Recovery and Upgrade; Progress and Detail Contract; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically audit completed plans, implement delivery-audit completion phases and audit the repaired work again. Show the activity sequence and preserve its progress, permissions and required development evidence through interruptions and upgrades.

## Acceptance criteria covered
AC-AUDIT-01, AC-LOOP-01, AC-LOOP-02, AC-LOOP-03, AC-LOOP-04, AC-RUN-01, AC-RUN-02, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07.

AC-AUDIT-02 (also applies to this phase's work); AC-AUDIT-03 (also applies to this phase's work); AC-RUN-03 (also applies to this phase's work).

## Out of scope for this phase
Test-remediation batching/continuations, retained-grade reassessment after remediation and test-discovered implementation repair routing (Phase 3).

## Phase dependencies
1 (report admission, snapshots, evidence catalog and durable audit records).

## Phase-specific notes
Include generic dispatch and prompts for both audit kinds and exercise the clean, already-adequate test-audit path before final delivery. Phase 3 owns the full test-remediation criteria. Introduce activity-aware UI, recovery, upgrade adoption and development ownership here with the first automatic audit workflow; do not postpone those safety boundaries to a later phase. Use the plan's sequential verification boundary and retain the existing recovery-authority behavior identified in the investigation.

## Phase 1 interface handoff

Phase 1 supplies authenticated `kiln audit status|snapshot|submit`, durable audit activity/session storage and report admission in `src/audit/`; the portable types are in `src/audit/contracts.ts`. The engine method serializes admission with delivery commands and persists before returning. It does not schedule an activity or project audit rows into the UI yet.

Allocate an activity with a pinned installed skill path/digest, unique report path and assigned session IDs, and issue its initial snapshot before provider work starts. Later snapshots retain that first plan as the append-only completion-phase baseline. Audit-added phase origin-marker lines carry the owning activity ID. The actual-provider proof script demonstrates allocation without adding a manual launch mode.

The evidence collector supports actual Claude `SubagentHandback` results and Codex's encrypted task linkage, with owned-turn/parent/receiver validation. Independent assessment envelopes and verification IDs are parsed in `src/audit/provider-evidence.ts`; phase-specific prompts must use that contract. Test mappings declare checkout or immutable artifact runtime; artifact checks consume retained current-artifact development observations and exact configured verification commands. Phase 2 owns integration with the existing development-obligation refresh and dispatch described above.

Call `auditCurrentness` before consuming a gate. It preserves delivery validity for changed classified tests, invalidates both gates on configuration/implementation changes, and verifies the latest accepted portable report and method-record bytes. Unresolved attempts (including valid blocked outcomes) remain correctable in the same activity; an accepted settled result is immutable, and identical retries recover it before the revision check.

Read [Phase 1 verification](phase-1-audit-evidence-interface.md#verification) and the retained [provider proof summary](kiln-audit-interface-provider-proof.json). These prove the admission boundary; this phase must still prove automatic scheduling, recovery, activity display and audit-owned development obligations.
