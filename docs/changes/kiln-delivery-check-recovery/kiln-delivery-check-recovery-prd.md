# PRD: Kiln delivery check recovery

**Follow-on to:** [Kiln development deployments](../kiln-development-deployments/kiln-development-deployments-prd.md)
**Source:** Product owner feedback, 2026-11-10: autonomous progress matters more than rigid bookkeeping; correct agent-created checks without requiring human babysitting.

## Summary

Let the implementing agent correct a mistaken deployment or verification check and continue through the existing delivery workflow. A correction must not require a new operator approval screen, an unrelated source-code change, or a manual completion waiver.

## Why this change

Kiln exists to finish planned phases without a person supervising each transition. Its checks should catch concrete unfinished work, not turn its own inability to recognize a result into an obligation for the person. An agent once selected an environment value by its position in a response; the provider reordered that response. Kiln then refused a corrected lookup, leaving authorized deployment recovery blocked.

The agent already decides what to build, what to test and how to define the initial verification method. Kiln should trust it to repair that method too. Requiring Kiln to prove that two arbitrary verification commands mean exactly the same thing adds complexity without a dependable guarantee. Known deployment failures, failed required tests and missing permission still matter. A corrected check is not, by itself, evidence that the work succeeded.

This change applies that philosophy to delivery-check recovery. It does not replace all completion checks with the agent's final prose or redesign unrelated completion gates. Tests should reproduce the failed recovery and demonstrate that real failures remain failures, using the existing test boundaries rather than new cloud infrastructure or an elaborate equivalence simulator.

## Acceptance criteria

### Let the agent correct its own checking mistake

The agent should resolve a bad lookup or a mistaken workflow check as ordinary implementation work, without making the person interpret internal evidence formats.

- [ ] **AC-RECOVER-01 — A mistaken check can be replaced.** The active agent can replace a delivery checkpoint with corrected command, field or workflow matchers, including when the source revision has not changed. The replacement retains the original target, source work, acceptance criteria, prerequisite obligations, required pre-merge checks and review requirements, and each evidence requirement's identity, purpose and source document. Kiln does not demand semantic equivalence between the original and corrected matcher. The agent explains the correction in its delivery assessment and uses the project's documented verification method.
  - Replaces in part: AC-RECOVERY-02 in [Kiln development deployments](../kiln-development-deployments/kiln-development-deployments-prd.md), for recovery blocked by an incorrect evidence matcher; actual operation reconciliation remains required.
- [ ] **AC-RECOVER-02 — Correction does not claim success.** The old attempt and its failures remain in history. The replacement must satisfy its own merge, deployment and verification checks before completion. Evidence accepted under the old matcher is not automatically accepted under the new one. A failed or missing result remains unfinished work; replacing the check grants no new deployment authority.
- [ ] **AC-RECOVER-03 — Recovery works in an existing run.** A run stopped on an incorrect check can use the correction after upgrade and normal resume. The agent receives usable correction instructions through the existing delivery interface. A correction neither starts a new agent session nor performs a remote side effect itself; subsequent authorized preparation and execution use the ordinary workflow. Reopening the run preserves both attempts and the replacement relationship.

### Show the work that still needs doing

Historical failures should explain how the run arrived here, not appear as separate outstanding work after a replacement takes over.

- [ ] **AC-RECOVER-04 — Outstanding checks follow the replacement.** Completion checks report the current replacement's unmet obligations rather than repeating superseded attempts as independent blockers. Required work is still blocked until the replacement satisfies it. Historical attempts remain inspectable and unchanged.
  - Replaces in part: AC-DISPLAY-02 in [Kiln development deployments](../kiln-development-deployments/kiln-development-deployments-prd.md), for presentation of superseded delivery failures.

## Out of scope

New correction approval screens; automatic operator waivers; broader deployment permissions; treating unfinished runtime tests as complete; changes to the separate linked-document recovery feature; publishing or upgrading a running installation in this change.
