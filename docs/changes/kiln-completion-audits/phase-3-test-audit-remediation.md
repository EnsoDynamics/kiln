# Phase 3: Automatic test remediation

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: One completion decision; Audit Report and Local Interface; Current Work and Invalidation; Provider Sessions and Development Delivery; Recovery and Upgrade; Progress and Detail Contract; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically strengthen inadequate test evidence and continue unfinished test-audit work in fresh sessions. Return test-discovered implementation gaps and direct fixes through delivery audits, then reassess test evidence before final completion.

## Acceptance criteria covered
AC-AUDIT-04, AC-TEST-01, AC-TEST-02, AC-TEST-03, AC-TEST-04.

AC-AUDIT-02 (also applies to this phase's work); AC-AUDIT-03 (also applies to this phase's work); AC-RUN-03 (also applies to this phase's work); AC-LOOP-04 (also applies to this phase's work); AC-RUN-01 (also applies to this phase's work); AC-RUN-02 (also applies to this phase's work); AC-RUN-04 (also applies to this phase's work); AC-RUN-05 (also applies to this phase's work); AC-RUN-06 (also applies to this phase's work); AC-RUN-07 (also applies to this phase's work).

## Out of scope for this phase
New product scope, changes to installed method skills, unplanned infrastructure changes and production release authority remain outside this PRD.

## Phase dependencies
1 (typed test reports and evidence/currentness checks); 2 (activity dispatch, repair loop, recovery, progress and development obligations).

## Phase-specific notes
Reuse Phase 2's delivery repair path for test-created completion phases and direct implementation fixes. Re-prove recovery, currentness, progress and retained development obligations for continuations and reassessment; the plan's closeout requires whole-PRD audits after all planned phases close.

## Phase 2b handoff

Phase 2b supplies the automatic clean two-audit path and repeated delivery repairs. Read its recorded verification and installed-provider proof summary before extending it. `src/audit/workflow.ts` owns accepted-result routing/currentness; `Engine.nextActivity` is shared by startup and the execution loop, with final-session recovery returning through that decision. `auditDoneCheck` reconciles the assigned report after process settlement, including a committed report whose submit command never ran. Accepted immutable results remain history when later material content requires fresh gates; unresolved attempts stay correctable in their original activity.

Extend this dispatcher for `continue_test`, same-round continuation identities, retained-grade reassessment and test-discovered fixes. Phase 2b's clean-path selector handles successful delivery/test gates; it does not establish Phase 3's continuation/remediation criteria. Preserve the first snapshot as the append-only plan baseline. Allocate the target before assigning retained obligations; continuation assignments must use `assignAuditObligations` in the same persisted decision, as repair settlement already does. Retain its criterion intersections, requiredMerge and immutable checkpoint origins. The real state-write-failure regression in `audit-development-delivery.integration.test.ts` proves that failed repair settlement retains the stop, rolls back assignments and does not dispatch a repair.

`record.activities` retains observed execution order; `record.nextActivityKey` retains the pending boundary task. Audit storage remains `audit-<activityId>` in the compatible session/facts map; those keys never become phase IDs. The snapshot's `activities` projection drives the familiar list, with phase totals and plan details still in `phases`. Preserve blocked criteria/actions, finished audit output paging, historical completion timestamps, current development authority and note/workspace-repair precedence.

Both providers use task-specific installed audit skills through `prompts/audit-session.txt`; resumed and fresh manual audit recovery receive that full pinned CLI/report contract with current authority. Claude red-check mutation/restoration evidence uses its native Write/Edit tools. Codex's qualified evidence wrapper uses literal tool arguments and `text(result)`; `store/load` and dynamic dispatch are outside that existing static profile and stop as incomplete evidence. Do not weaken that checker to accept rendered success text. Actual Codex 0.162.1 full history represents a settled silent command with explicit `aggregatedOutput: null` and a numeric exit code. The collector normalizes that qualified null to empty output; a missing output field remains unresolved. The sanitized native item is retained in `test/fixtures/codex-audit-proof/silent-command-output-0.162.1.json`.

`audit-workflow.integration.test.ts` runs the real scheduler, authenticated child CLI/server, disposable Git origins and browser controls with deterministic provider histories. Older phase/transport tests explicitly model an already-current audit gate to isolate their original boundaries; they do not prove automatic audits. The installed-package proof runs actual Claude Code and Codex, interrupts/restarts their delivery audit, preserves conversation/activity identity, then requires both accepted audits and final completion. Its final GitHub read uses the repository-owned captured contract; all commits/pushes are to disposable local origins, never external repositories.

## Inherited execution limits

Source: Doug's Phase 2b request in chat `01a1702e-b2ad-76d0-bc15-2b3e9aa7fb1e`, retaining chat `01a16fc4-5167-7153-b30c-28e08d04c0d2`: “no push, merge, production action or external message is authorized.” Doug explicitly requested this existing worktree throughout. Scoped local commits, reviews and non-production verification are authorized. The later “go ahead and push” in chat `01a16ff4-29de-7bf3-b2a1-d199d3a28766` covered only Phase 2a commit `72188c9`; further pushes remain held. Carry these limits and source references into successor prompts.
