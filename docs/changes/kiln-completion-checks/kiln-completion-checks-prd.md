# PRD: Kiln completion checks

**Follow-on to:** [Kiln multi-repo delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md).

## Summary

Kiln determines whether implementation landed from the assigned repositories and required delivery/audit evidence. It no longer tries to prove that every tool call stayed inside the workspace. Normal parallel work in other checkouts is allowed. The transcript parser repeatedly stops valid work on ordinary tool syntax, asking users to accept a risk the diagnostic does not establish.

Doug directed this removal on 2026-10-31: remove the entire workspace audit, including detected-change warnings, uncertainty acceptance and the phase-advance success banner; keep the separate mandatory Git checks.

## Acceptance criteria

- [ ] **AC-CHECK-01 — Workspace auditing no longer controls execution.** Neither agent's recorded outside changes, unsupported workspace-audit syntax, incomplete confinement evidence nor historical confirmations cause a workspace warning, a failed workspace check or a stop. Failure to authenticate a required test, audit or deployment receipt still fails its independent evidence requirement. This applies to phases, audits, final delivery, interruption recovery, usage recovery and completion accounting. Existing stopped runs can be rechecked without accepting workspace uncertainty.
  - Replaces: AC-OUTSIDE-01 through AC-OUTSIDE-04 and AC-PRS-06 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md`.
  - Replaces in part: AC-SPACE-03, AC-SHOW-01 and AC-PROOF-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (workspace-check behavior only).
  - Replaces in part: AC-WORK-04, AC-RECOVER-02, AC-RECOVER-03 and AC-PROOF-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (workspace auditing only).
  - Replaces in part: AC-VERIFY-02 and AC-COMPAT-01 in `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-prd.md` (workspace checks and confirmation only).
  - Replaces in part: AC-BACK-03 and AC-BACK-04 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (workspace auditing only).
  - Replaces in part: AC-DELIVER-04 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (workspace checks only).
- [ ] **AC-CHECK-02 — Required completion evidence still gates progress.** The assigned worktrees must remain on their intended branch, have all required changes committed and satisfy the existing push, phase-document and final-delivery checks. Required audit reports, authentic test/deployment receipts and currentness, launch permissions, conversation availability and runtime cleanup/ownership requirements remain in force. A successful agent message is still insufficient evidence. Changes in other checkouts cannot substitute for the assigned worktrees' Git evidence.
- [ ] **AC-CHECK-03 — Recovery no longer asks for workspace acceptance.** Remove workspace diagnostics, recovery prompts, warnings and both confirmation controls from every recovery layout and public CLI help. Retired control requests cannot change state. Old saved workspace checks and confirmations do not reappear after restart; unrelated recovery checks and intentional pauses remain.
  - Replaces in part: AC-ACT-03 and AC-ACT-05 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (outside-workspace confirmation control only).
- [ ] **AC-CHECK-04 — Successful verification is reflected in execution state.** After a passing Verify/advance, show the normal completed phase and resulting running, paused or complete state, with no persistent “verified and accepted” success banner. Real failure messages and unsent-reply notices remain.

## Design reference

[Completion and recovery states](mockups/kiln-completion-checks.html) shows the recovery rows and resulting execution state. Existing layout and all unrelated controls remain.
