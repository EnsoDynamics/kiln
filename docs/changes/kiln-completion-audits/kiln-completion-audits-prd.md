# PRD: Kiln automatic completion audits

**Source:** Doug’s request, 2026-10-24, Codex conversation `01a16f65-e5ac-70b1-9b0e-7722fb5c98cf`, including his confirmation to include delivery and test audits.

## Summary

Kiln must check that a finished phase plan actually delivers its PRD before declaring the work ready. After implementing the planned phases, it runs the Enso Method’s delivery audit, automatically implements any completion phases the audit adds, and repeats the delivery audit until no implementation gaps remain. It then runs the method’s test audit and fixes inadequate test coverage. Missing implementation discovered there returns to the build-and-audit loop.

Only after those checks finish does Kiln perform final delivery: opening or reusing the required review pull requests, or confirming work already delivered under its existing rules. This is one bounded change to Kiln’s unattended completion workflow, for both Claude Code and Codex.

## Business Context

Kiln currently checks phase closure, committed and pushed work, workspace boundaries and any required development-delivery evidence. When no phase remains, it goes directly to final delivery. Those checks establish that sessions finished their assigned work; they do not independently establish that all of the PRD’s acceptance criteria were delivered or adequately tested.

The Enso Method now calls for a whole-PRD delivery audit and then a whole-PRD test audit. Both can discover missing implementation and add completion phases. The current method hands completed repair phases to the test audit once a delivery audit has run; Doug’s requested Kiln behavior adds a fresh delivery audit after repairs. The [investigation](kiln-completion-audits-investigation.md) records the code and method sources behind these findings.

## Acceptance Criteria

### Check the whole PRD before final delivery

Completing a phase plan starts the independent checks. A ready pull request, or work already merged, cannot substitute for those checks.

- [ ] **AC-AUDIT-01 — Every completed plan gets a delivery audit.** Once all implementation phases satisfy Kiln’s existing completion checks, Kiln starts a fresh session running `delivery-audit` on the whole governing PRD, across its repositories. This happens automatically before final delivery, including when the plan was already closed when the execution started.
  - Replaces in part: AC-PR-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the immediate transition from a closed phase plan to completion or the final pull-request session).
- [ ] **AC-AUDIT-02 — The audit checks the requirements still in force.** The audit covers every applicable acceptance criterion and follows the method’s rules for superseded criteria, partially superseded criteria, pending human actions and behavior changed outside the requirements. It checks reachable behavior across the whole PRD, including criteria that cross phases or repositories. It does not infer requirements from the implementation or weaken them to obtain a pass.
- [ ] **AC-AUDIT-03 — Audit outcomes are inspectable and current.** Kiln retains each audit’s scope, checked work, outcome, findings and resulting next action. It verifies that the required audit record exists and agrees with the current plan and work before advancing; a successful process exit, a success message, a phase’s Closed line or an old audit-completion commit alone is insufficient. Missing, unreadable or contradictory results produce Needs you with the concrete problem.
- [ ] **AC-AUDIT-04 — Existing delivery evidence cannot skip the audits.** Startup, continuation, Check again and Resume all require successful current audits before final completion, even when review pull requests are already open or the current work is already in its intended base. Existing final repository and development-verification checks still apply after the audits.
  - Replaces in part: AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (startup, Check again and Resume completing immediately when repository delivery checks pass).
  - Replaces in part: AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (all phases and final repository evidence being sufficient for completion).

### Build what the audits find missing

A completion phase is ordinary implementation work added by an audit to finish an existing acceptance criterion. Kiln carries that work forward automatically without requiring a person to copy a continuation prompt.

- [ ] **AC-LOOP-01 — Confirmed gaps become completion phases.** The delivery-audit session follows the method to confirm gaps and record completion phases at the end of the plan, with their audit origin, affected criterion labels, missing behavior and dependencies. Original phase identities and Closed lines remain intact. Completion phases add no new product scope, and the audit session does not implement its own findings.
- [ ] **AC-LOOP-02 — Kiln implements the updated plan automatically.** After an audit adds completion phases, Kiln reads the updated plan and implements its unfinished phases that have no child phases in order through fresh `implement-from-requirements` sessions. Completion phases receive the same review, test hardening, refactor pass, repository discovery and completion checks as other phases. A completion phase split during implementation is followed through its children before the next audit.
- [ ] **AC-LOOP-03 — Repairs are audited again.** After all open completion phases pass their completion checks, Kiln runs another whole-PRD delivery audit in a fresh session. It repeats this build-and-audit cycle whenever more gaps are found, and proceeds to the test audit only when no implementation gap or open implementation phase remains. A prior audit’s existence never skips this repeat check.
- [ ] **AC-LOOP-04 — A blocker is visible rather than treated as success.** A missing permission, unavailable required evidence, critical finding or decision the agent cannot resolve within its authority stops at Needs you. Kiln shows the affected criteria and the action needed. A session that ends without completing its assigned audit or producing an actionable continuation is a stop, not an automatic rerun of the same failed session. Normal usage-limit recovery remains available.

### Prove the finished behavior with tests

The test audit asks whether the tests would notice if an acceptance criterion broke. Test improvements remain test-audit work; missing implementation returns to the phase plan.

- [ ] **AC-TEST-01 — The test audit runs and fixes its findings.** After a delivery audit finds no implementation gaps, Kiln starts a fresh `test-audit` session on the whole PRD. It follows the method’s assessment, real-resource testing, red-check, remediation and independent re-grading rules, aiming for at least Adequate evidence for each applicable built criterion. Strong evidence is not required unless the governing requirements already require it.
- [ ] **AC-TEST-02 — Test work continues across sessions.** If test remediation requires another session, Kiln starts a fresh test-audit continuation from the saved audit record until the work is complete or genuinely blocked. Test-only remediation does not become an implementation phase. Completed evidence can be retained where the method’s re-audit rules permit it.
- [ ] **AC-TEST-03 — Test-discovered implementation gaps return to building.** If a test audit adds completion phases, Kiln builds them under AC-LOOP-02, repeats the delivery audit under AC-LOOP-03, then returns to the test audit. If the test audit makes a small implementation fix directly, Kiln likewise obtains a fresh delivery audit before final completion and rechecks the affected test evidence. A known delivery gap cannot be hidden under a completed test-audit status.
- [ ] **AC-TEST-04 — Final completion has no unresolved audit blocker.** No applicable criterion remains Missing, Weak, waiting on delivery, or blocked on evidence required to verify the PRD. Fully superseded criteria are excluded with their replacement pointers. Behavior changed outside the requirements requires a recorded human decision before completion; the audit does not revert it automatically. A pending human action may remain only when the governing requirements place it after Kiln’s delivery boundary, such as a later production release; Kiln lists it without claiming it happened.

### Keep the unattended run understandable and recoverable

The existing progress list continues naturally from implementation into audits and any further work they require. The person sees familiar rows and controls, without having to start each next activity. Restarting must preserve that progress and the execution’s existing permissions.

- [ ] **AC-RUN-01 — Audits appear alongside phases in the familiar progress list.** Delivery-audit and test-audit activities appear as successive rows in the existing progress list, using the same visual treatment, status presentation and session-detail interactions as implementation rows. They are labeled “Delivery audit” and “Test audit,” never labeled or numbered as implementation phases. Repeat audits and added completion phases appear in execution order, with rounds distinguishable. The terminal follows the same naming and order. Session output and findings remain inspectable; finished implementation rows do not imply the execution is complete.
  - Replaces in part: AC-PR-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the finished plan followed immediately by final delivery, without audit activity).
- [ ] **AC-RUN-07 — Each next activity starts without a manual handoff.** Once the current activity passes its required checks, Kiln immediately proceeds to the next eligible audit, completion phase, test-remediation continuation or final-delivery activity. No confirmation, additional Start action, copied prompt, scheduled delay or default pause is introduced between these activities. Only an explicitly requested pause, an existing interruption or usage-limit wait, or a genuine blocker under AC-LOOP-04 may hold continuation.
- [ ] **AC-RUN-02 — Recovery resumes the right work.** Pauses, interruptions, usage-limit waits, application restarts, Resume and Check again retain the current audit round, continuation, added phases and their results. Pause after the current activity works at audit-session boundaries as well as implementation-phase boundaries. Recovery checks whether an interrupted activity already completed before resuming it and never starts competing sessions, duplicates completion phases or opens duplicate final pull requests.
- [ ] **AC-RUN-03 — Later changes invalidate affected conclusions.** Changes to requirements, implementation or tests after an audit cause the affected audit conclusions to be reassessed before completion. An implementation change requires another delivery audit and reassessment of affected test evidence; changed test evidence requires test reassessment. Recording audit outcomes, updating phase status or editing final-delivery descriptions alone does not create an endless audit cycle. Kiln cannot declare completion using results for earlier, materially different work.
- [ ] **AC-RUN-04 — Audit sessions inherit the execution’s limits.** Both supported agents use the selected execution settings and the assigned workspace. Audit sessions may commit and push their in-scope records, tests and permitted fixes on the execution’s feature branches, including the method’s empty audit record commit when appropriate. They retain existing workspace, repository, development-target and production restrictions. Missing required skills or inability to run them is Needs you; neither agent silently skips an audit.
- [ ] **AC-RUN-05 — Required development delivery can still precede the audits.** Previously authorized development delivery remains available when building or verifying the PRD requires it, including during audit remediation. Audit completion grants no new merge or deployment permission. Final delivery includes work added by audits and retains existing rules for remaining review pull requests, already integrated work, cross-repository links and required development evidence.
- [ ] **AC-RUN-06 — Upgrades preserve completed history.** New and unfinished saved executions adopt the audit checks before they next complete, without interrupting an already running session. An upgrade does not reopen completed executions solely because historical audits are absent, or claim those audits ran. Existing reconciliation of current work and delivery evidence still applies: if it returns an execution to unfinished work, the new audit checks apply before that execution completes again.
  - Confirmed by Doug on 2026-10-24: [UPGRADE-001](kiln-completion-audits-assumptions.md#upgrade-001).

## Out of Scope

- Changing the Enso Method’s skills or requiring the repeated delivery audit outside Kiln.
- Adding new product requirements to the PRD being audited, or auditing unrelated work.
- Adding support for executing PRDs without a phase plan.
- Production release authority, automatic merging merely to finish, or bypassing existing checks and protections.
- Implementation code, technical design and phase sizing in this requirements-writing task.

The replacement lines above take effect when implemented. Matching reverse links belong in the implementation commit; earlier PRDs remain historical requirements until then.
