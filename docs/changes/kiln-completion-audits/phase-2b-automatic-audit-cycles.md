# Phase 2b: Automatic audit cycles and progress

**Parent PRD:** [Kiln automatic completion audits](kiln-completion-audits-prd.md)
**Technical design:** [Single governing design](kiln-completion-audits-technical-design.md)
**Plan:** [Implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically audit completed plans, implement delivery-audit completion phases and audit repairs again, with visible progress and durable recovery through final delivery.

## Acceptance criteria covered
AC-AUDIT-01, AC-LOOP-01, AC-LOOP-02, AC-LOOP-03, AC-LOOP-04, AC-RUN-01, AC-RUN-02, AC-RUN-04, AC-RUN-06, AC-RUN-07.

AC-AUDIT-02, AC-AUDIT-03, AC-RUN-03 and AC-RUN-05 also apply to this work; their ownership stays with Phases 1 and 2a.

## Out of scope
Test-remediation batching/continuations, retained-grade reassessment and test-discovered implementation repair routing (3).

## Phase dependencies
1 (report admission/currentness); 2a (audit development ownership, scope and retained obligations).

## Phase-specific notes
Include generic dispatch and task-specific prompts for both audit kinds and the clean already-adequate test-audit path before final delivery. Integrate 2a's retained-obligation assignments at allocation/repair routing in the same persisted decision; do not postpone authority, recovery or development checks. Follow every scheduling, recovery, upgrade, display and verification contract in the single technical design. Preserve phase identities, original Closed lines, installed method skills and existing delivery checks.

## Inherited requirements conflict check
The Phase 2 conflict review in chat `01a16ff4-29de-7bf3-b2a1-d199d3a28766` read all five earlier applicable PRDs and found only intended changes. Before implementing the progress projection, add narrow Replaces-in-part links for v1 AC-WATCH-01 (execution order around audit-added phases), AC-WATCH-02 (current audit activity header) and AC-VIEW-03 (pause at audit boundaries), plus matching reverse links when built. Existing declared reverse links still belong with their implemented criteria. Preserve development/Codex recovery authority and note/workspace-repair precedence.

## Phase 1 interface handoff

Phase 1 supplies authenticated `kiln audit status|snapshot|submit`, durable audit activity/session storage and report admission in `src/audit/`; the portable types are in `src/audit/contracts.ts`. The engine method serializes admission with delivery commands and persists before returning. It does not schedule an activity or project audit rows into the UI yet.

Allocate an activity with a pinned installed skill path/digest, unique report path and assigned session IDs, and issue its initial snapshot before provider work starts. Later snapshots retain that first plan as the append-only completion-phase baseline. Audit-added phase origin-marker lines carry the owning activity ID. The actual-provider proof script demonstrates allocation without adding a manual launch mode.

The evidence collector supports actual Claude `SubagentHandback` results and Codex's encrypted task linkage, with owned-turn/parent/receiver validation. Independent assessment envelopes and verification IDs are parsed in `src/audit/provider-evidence.ts`; phase-specific prompts must use that contract. Test mappings declare checkout or immutable artifact runtime; artifact checks consume retained current-artifact development observations and exact configured verification commands. Phase 2 owns integration with the existing development-obligation refresh and dispatch described above.

Call `auditCurrentness` before consuming a gate. It preserves delivery validity for changed classified tests, invalidates both gates on configuration/implementation changes, and verifies the latest accepted portable report and method-record bytes. Unresolved attempts (including valid blocked outcomes) remain correctable in the same activity; an accepted settled result is immutable, and identical retries recover it before the revision check.

Read [Phase 1 verification](phase-1-audit-evidence-interface.md#verification) and the retained [provider proof summary](kiln-audit-interface-provider-proof.json). These prove the admission boundary; this phase must still prove automatic scheduling, recovery, activity display and audit-owned development obligations.

## Phase 2a interface handoff

- Development records use schema 7. Legacy assessments/checkpoints normalize to phase owners; audit owners carry no phaseId. Preserve Phase 1's schema-6 audit evidence and the existing pre-migration bytes.
- `ownerDocuments` supplies audit document/manifest digests; `ownerDeliveryCheck` checks that owner plus retained merge, deployment, verification and synchronization obligations. Existing `phaseDeliveryCheck` delegates to it. Final repository evaluation still checks all retained checkpoints, including finished audit origins.
- The delivery CLI/status/API now carry the owner. Audit assessments use exact whole-manifest keys and `requirementManifestDigest`; prepare/evidence requests identify the active audit owner even for an inherited checkpoint. The engine resolves audit storage keys as `audit-<activityId>`; do not feed those keys to phase parsing or fabricate implementation phases. Audit sessions keep Phase 1's activityId and storage layout.
- `assignAuditObligations` is an internal allocator operation, not an exposed provider command. It consumes the accepted source audit and matching open completion phase or immediate test continuation, intersects criteria per requirement, retains requiredMerge and all evidence requirements, and increments the delivery-ledger revision only for changed assignments. Allocate the target first, refresh the recorded plan, then call it and persist activity/assignment/next-work facts in one serialized decision with rollback. No scheduling call site exists yet.
- The engine's audit-submit API refreshes retained development observations and adds `ownerDeliveryCheck` to admission. Scheduling/recovery must use the same check before consuming a gate, including an accepted report whose execution gained its first grant later. An idempotent report retry itself is not that gate check.
- `orderedRecoveryOwners` retains original phase order while inserting audits and repair origins from session history/accepted reports. First-grant recovery works with an audit or repair-phase stop and persists `stoppedOwner` and ordered owners; old phase recovery fields remain compatible. `auditRecoveryTask`, the shared resume template and manual recovery projection preserve the pinned audit task/report and current authority. Automatic audit settlement/resume remains this phase's work: the existing phase-only done-check routes have deliberately not been promoted into an audit scheduler by 2a.
- Phase 2a's recorded verification section and installed-package proof summary cover the ownership interface. This phase still owes automatic allocation, task-specific skill launch, repeated repair rounds, both actual providers, restart/usage/pause behavior and activity/browser/terminal sequences under the governing design. No Phase 2a fixture result or earlier empty audit commit substitutes for those proofs.

## Inherited execution limits
Source: Doug's request in chat `01a16ff4-29de-7bf3-b2a1-d199d3a28766`, carrying chat `01a16fc4-5167-7153-b30c-28e08d04c0d2`: “no push, merge, production action or external message is authorized.” Scoped local commits, reviews and non-production verification are authorized. Carry these limits, with their source, into successor prompts; use the explicitly requested existing worktree. Disposable local-origin test repositories are verification fixtures.
