# Phase 4: Complete billing continuity, overflow and recovery controls

**Added by delivery audit:** 2026-10-26, after every planned phase closed. It builds what earlier phases left out of the criteria below.

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md) — Claude Inspection Contract; Paid overflow and account attribution; Context identity and invalidation; Holds and recovery; Local Interfaces; Required implementation evidence.
**Phase plan:** [Execution order and verification ownership](kiln-billing-safeguards-phase-plan.md)

## Summary
Keep valid billing approval when unrelated provider settings change, show reliably reported enabled paid overflow even when usage meters are unavailable, and make manual Resume controls reflect billing eligibility.

## Acceptance criteria covered
AC-BILL-02 (completes it; owned by phase 1), AC-BILL-03 (completes it; owned by phase 1), AC-BILL-05 (completes it; owned by phase 1), AC-RUN-02 (completes it; owned by phase 1).

## What the audit found missing
- **AC-BILL-02 and AC-BILL-03:** Account refresh → `src/account/claude-account.ts::parseUsage` returns at absent/null `rate_limits.limits` before extracting a valid `extra_usage.is_enabled`. `readAccount` therefore never attributes the enabled overflow fact, and `Engine` → `BillingPanel` cannot show the required notice. Agent SDK 0.3.310's `SDKUsageReport` explicitly supports `limits: null` for a server without usage rows while separately supplying `extra_usage`; this finding concerns that supported shape, not invented malformed metadata.
- **AC-BILL-05:** Launch/refresh → `src/billing/inspection.ts::classify` retains non-endpoint context for inactive providers in `privateEnv`, and retains unrelated cloud context/helpers whenever any provider is selected. `src/billing/authority.ts::refresh` then revokes approval on the changed fingerprint. A confirmed first-party API context loses approval when only `ANTHROPIC_FOUNDRY_RESOURCE` changes. Apply effective-provider relevance consistently to the observable context while preserving detection of genuine credential/source/provider/payer changes and conservative treatment of incomplete inspection.
- **AC-RUN-02:** Needs you → `view/src/screens/PhaseHandoff.svelte` computes `busy` without billing eligibility and enables both reply-and-resume and no-reply Resume while `snapshot.billing.canLaunch` is false. `Engine.resumeOffered` checks resumable history, not billing eligibility. The older `NeedsYou` controls include the billing condition; the new screen omits it. The server's final `runProcess` gate still blocks unapproved model work. Keep Verify and explicit completion acceptance available independently of billing approval.

## Out of scope for this phase
New providers, changed approval duration, payer inference, changed paid-overflow policy, new Codex billing behavior, and other exclusions in the parent PRD. This phase does not implement arbitrary malformed-provider-output support or change manual recovery's explicit already-complete choice.

## Phase dependencies
1 (approval authority, account inspection and recovery); 3 (provider-context filtering). The integrated baseline also includes the newer [Manual Phase Recovery contract](../kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md#manual-phase-recovery); preserve its target-bound requests, unsent replies and separate Verify/advance behavior.

## Audit evidence and verification handoff
The phase plan's Fresh whole-PRD delivery audit section records the `2dc96a9` baseline, source traces, two in-memory reproductions and conflict check. The three gaps fit one session in the existing billing flow. Build and prove each whole criterion above, not just its missing branch, using the design's Required implementation evidence and the prior phases' real passive-boundary, account-attribution, authority/dispatch and protected-browser portfolio. Preserve Phase 3's repaired endpoint and identity behavior and the earlier explicit proof limits.

After this phase closes, run a fresh whole-PRD delivery audit; only a current clean result hands off to whole-PRD test audit. Doug's restriction remains: “Do not push without Doug's approval.” Source: chat `01a1798c-ffcd-7d62-8283-d671b281a8e5`, carried through implementation chat `01a179e2-22d4-7831-b54d-1c3beb3fcb66` into audit chat `01a17a53-efeb-7c81-98f1-126d6394ec43`. Audit commits follow the skill default; no release, publication or production change is authorized.
