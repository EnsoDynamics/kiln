# Kiln development deployments — Business assumptions

<!-- EDITING THIS FILE? Load assumptions-document-writing before editing, and
     assumptions-document-feedback when recording stakeholder answers.
     Assumption IDs are permanent. Keep one Last Updated line; remove superseded
     entry text, which version control retains. -->

**Last Updated:** 2026-10-24
**Status:** Draft — pending business validation

These are the business assumptions used in the [development-deployments PRD](kiln-development-deployments-prd.md). Work proceeds on them unless corrected.

### AUTH-001. Does the repository holding the PRD define the project?

**Assumption:** A remembered development-deployment choice applies to future PRDs in **the same PRD repository**. It is visible before Start and applies only to the **same approved repository, branch and environment targets**; additional or changed targets need confirmation.

**Evidence:** In the source conversation `01a16dea-9c95-7511-9d65-7bb51eb0f49e` on 2026-10-24, Doug said the choice “really depends on the project” and approved proceeding with the proposed option. Neither that conversation nor the existing PRDs and assumptions defines the boundary of a remembered project choice.

The [multi-repository PRD](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), AC-PRS-05, already distinguishes the repository holding the PRD from its other participating repositories. Using that boundary favors reuse across related PRDs without inventing a new project grouping. A separate named grouping could cover several PRD repositories, but no source asks for that capability.

**Confirm or Correct:**

- [ ] Correct as stated
- [ ] Wrong — correct project boundary: _______________

**Confidence:** 70% | **Impact if Wrong:** 🟡 MEDIUM — remembered preferences would need a different project boundary.

### AUTH-002. Can the person add an approved target to the current execution?

**Assumption:** When Needs you identifies an uncovered target, the person can **explicitly authorize that named repository, base branch and non-production environment for the current execution**. Kiln retains the grant across later sessions and restarts under the same checks and authority boundaries as approval before Start. It does not change future executions’ preferences.

**Evidence:** In the same source conversation, Doug described granting development-merge permission to the stopped session and wanted to avoid losing unattended hours to that permission stop. [Multi-repository delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), AC-SPACE-02, permits repositories to be added during execution. Neither source specifies how a new target grant becomes retained Kiln authorization.

The proposed rule completes that existing recovery path. Requiring a new execution would interrupt ongoing work; accepting Resume or vague instructions as approval would weaken the explicit-target boundary Doug approved. The interaction used to record explicit approval is left to technical design.

**Confirm or Correct:**

- [ ] Correct as stated
- [ ] Wrong — correct handling of a newly needed target: _______________

**Confidence:** 85% | **Impact if Wrong:** 🟡 MEDIUM — authorization and recovery behavior would need revision.
