# Phase 3: Complete Claude billing context and identity

**Added by delivery audit:** 2026-10-26, after every planned phase closed. It builds what earlier phases left out of the criteria below.

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md) — Claude Inspection Contract (passive inspection, route and source classification); Approval and Dispatch; Local Interfaces; Integration Evidence and Verification.
**Phase plan:** [Execution order and verification ownership](kiln-billing-safeguards-phase-plan.md)

## Summary
Keep unrelated provider settings from turning Claude subscription use into an API-billing approval request, and show reliably available Claude account or organization information in the billing summary.

## Acceptance criteria covered
AC-BILL-01 (completes it; owned by phase 1), AC-BILL-02 (completes it; owned by phase 1).

## What the audit found missing
- **AC-BILL-01:** The launch/refresh path through `Engine` → `BillingAuthority.refresh` → `src/billing/inspection.ts::classify` treats every nonstandard `AWS_ENDPOINT_URL*` and provider-specific `ANTHROPIC_*_BASE_URL` as effective billing evidence without checking that its provider is selected. Separately, `view/src/components/BillingPanel.svelte::summary`, reached from every billing screen, drops known account identity on the neutral settings route and never renders reliable `orgId`, including when subscription email is unavailable. Preserve the required subscription-email placement and unavailable-email wording; never substitute subscription identity for an unknown API payer.
- **AC-BILL-02:** A complete inventory with `authMethod: claude.ai`, `apiProvider: firstParty` and only an unrelated `AWS_ENDPOINT_URL=https://unrelated-aws.example.test` becomes `metered` / `Anthropic API` / unapproved in `classify`. `BillingAuthority.view.canLaunch`, `Engine.start` and `Engine.runProcess` then demand API approval for subscription use. The same false hold occurs with an inactive provider-specific endpoint. The subscription treatment must remain available when those settings do not affect its route; genuine selected-provider and direct override evidence must still require approval.

## Out of scope for this phase
New providers, API payer inference, changed approval policy, Codex billing changes and other exclusions in the parent PRD.

## Phase dependencies
1 (Claude inspection, billing authority, launch gate and shared billing panel); 2 (the shared panel now includes Codex presentation, which this repair must preserve).

## Audit evidence and verification handoff
The whole-PRD audit at `587f26b` confirmed the classifier output above using synthetic inputs and the existing compiled classifier, then traced its source and server-side launch gates. UI source confirms the identity omissions. The conflict check found no superseding requirement or recorded decision authorizing these deviations; both originate in `4e1dda8` and remain at the audit baseline.

Build and prove the whole two criteria through the existing passive-boundary, real-server and browser paths, following the phase plan's verification ownership and the design's required evidence. The earlier phases retain their Closed lines and explicit proof limits. Once this phase closes, run a fresh whole-PRD delivery audit before the whole-PRD test audit.
