# Phase 3: Complete Claude billing context and identity

**Closed:** 2026-10-26

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

## Implementation evidence

Provider-specific endpoints now contribute route/source and private approval-context evidence only for the selected provider. Trustworthy reported provider metadata resolves selection; without a named provider, active selectors retain their concrete evidence without guessing precedence. Direct `ANTHROPIC_BASE_URL`, credentials, authentication helpers and selected-provider evidence remain actionable. Inactive endpoints remain in the unmodified work environment but do not relabel direct API access or invalidate its approval. Detection contract v2 conservatively invalidates grants recorded under v1.

The shared billing summary renders known neutral-route email and Claude organization identity, including organization-only subscription readings. Subscription email or its unavailable wording remains directly below the subscription label. Metered summaries retain unavailable-payer wording and never substitute the subscription identity. Current, historical and disconnected summaries use the same renderer; Codex presentation is preserved.

| Criteria completed | Evidence |
|---|---|
| AC-BILL-01 | `src/billing/inspection.test.ts` covers all nine provider-specific endpoint keys through complete/partial inventory, source/identity exclusion, selected providers, inactive selectors, direct overrides and reliable identity. `src/billing/passive-boundary.integration.test.ts` exercises disposable project/local settings through the real SDK and installed Claude 2.1.307 authentication read with a synthetic API key; unrelated endpoints retain first-party API classification. Subscription readiness is scripted beside that real contract, with no model call. |
| AC-BILL-02 | `src/engine/billing.integration.test.ts` proves subscription Start, restart and saved-conversation Resume without approval despite unrelated endpoints. Selected-provider endpoints still block zero-dispatch Start, keep approval across an inactive endpoint change, and invalidate approval when the selected endpoint changes. Existing approval, overflow, readiness and recovery proofs remain in the full gate. |
| Shared presentation | `src/server/billing-browser.integration.test.ts` uses the real protected loopback server and Chrome at 360 and 1280 pixels for neutral account identity, organization-only subscriptions, unavailable-email placement and direct-override approval without payer substitution. Existing Claude controls/history/disconnection and Codex browser cases pass in the focused portfolio. Screenshots were inspected for clipping and identity readability. |

Independent deliverable review and test hardening found no gaps; both criteria have adequate evidence without deliberate-break checks. Final validation on 2026-10-26: `npm run verify` passes with zero blocking dependency findings, ESLint, TypeScript/Svelte checks, 615 unit tests, 17 Codex protocol proofs, and 716 passing integration tests plus two existing platform skips (718 total; integration duration 352.78 seconds). All four installed-package checks pass, including shipped billing guidance, passive worker and fixture/private-state exclusion. Runtime sources were frozen for the full gate and no concurrent build ran. This phase makes no native Linux/Windows metadata claim, external-provider acceptance claim, inference/billing-entitlement proof, or hidden-helper-rotation guarantee. The earlier phases' explicit limits remain. No paid inference, credit purchase, production release or package publication is part of this evidence.

## Fresh whole-PRD audit handoff

Once this phase closes, the next unit is a fresh whole-PRD `delivery-audit`, then `test-audit` only after delivery is clean. Re-read all three closed phases and the design's Required implementation evidence; the prior audit at `b5baca9` does not establish that its repairs are complete. Implementation commits follow the skill default. Doug's restriction remains: “Do not push without Doug's approval.” Source: chat `01a1798c-ffcd-7d62-8283-d671b281a8e5`, carried into implementation chat `01a179e2-22d4-7831-b54d-1c3beb3fcb66`.
