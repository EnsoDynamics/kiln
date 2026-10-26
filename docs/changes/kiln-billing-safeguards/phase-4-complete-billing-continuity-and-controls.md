# Phase 4: Complete billing continuity, overflow and recovery controls

**Closed:** 2026-10-26

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


## Implementation evidence

Overflow parsing now retains the separately reported boolean before handling absent/null usage meters. Account bracketing and launch-summary freshness/identity checks still decide attribution. A supported `SDKUsageReport` can therefore show enabled paid usage without fabricating usage gauges or requiring approval. Missing/disabled overflow remains non-blocking; the existing usage error still reports unavailable meters independently.

One provider-relevance rule now covers provider-specific endpoints, credentials, resource/workspace/project settings, skip-auth inputs, cloud credential context and helpers in both the effective and inherited private identity. Known provider metadata resolves relevance; otherwise active qualified selectors identify candidates. A partial raw cascade cannot clear inherited active candidates, and an explicitly configured but unnamed provider retains potentially relevant observable context. Direct credentials, source/payer/contract changes and selected-provider changes remain detectable. Detection contract v3 invalidates grants created under an earlier detector. Launch environments and provider settings remain unchanged.

Manual phase recovery keeps its recorded target and draft contract. Both reply-and-resume and no-reply Resume now disable and guard submission while billing is ineligible; Verify and explicit already-complete advancement remain independently available. Approval and recheck still start no work; final dispatch continues to perform fresh server-side authorization.

| Criteria completed | Evidence |
|---|---|
| AC-BILL-02 | The retained classification/readiness and real-server portfolio covers subscription, detected metered access, neutral optional failure, sign-out and unchanged provider readiness. The new no-meters browser flow shows the enabled notice and usage-settings link without approval or invented gauges, then records the attributed subscription fact at launch. Existing subscription Start/Resume, direct-override zero-dispatch and optional-failure tests remain in the full gate. |
| AC-BILL-03 | `src/account/claude-account.test.ts` covers absent/null/empty meters with true/false/missing/non-boolean overflow. `src/account/claude-info.integration.test.ts` proves account/usage/account attribution with null rows and rejects an account switch. Existing engine cases reject stale, mismatched, unattributed and missing overflow while preserving independent usage readings. `src/server/billing-browser.integration.test.ts` checks notice/link/no-checkbox, missing/disabled omission and launch provenance through the protected real server and Chrome. |
| AC-BILL-05 | `src/billing/inspection.test.ts` and `authority.test.ts` cover provider-specific and unrelated cloud/helper identity, partial inherited candidates, unnamed configured providers, credential/source/provider/payer/version changes, one execution, clear and A→B→A invalidation. Real SDK/installed-auth project/local probes in `passive-boundary.integration.test.ts` prove inactive settings/helpers do not change first-party API identity while selected direct credentials still do. Real temporary-Git engine cases retain the grant through restart and phases. The hardened `audit-workflow.integration.test.ts` uses genuine audit routing, asserts zero dispatch before one approval, then checks approved metered billing on delivery audit, test audit and final delivery, with approval removed on completion. |
| AC-RUN-02 | Existing common-dispatch cases retain conversation, checks, files, hold and restart state, require explicit continuation, and prove zero dispatch before authorization. New real-server Chrome cases at 360 and 1280 pixels disable both manual Resume controls with an unsent draft, retain it after Verify, keep Resume disabled after recheck, enable it after approval without dispatch, and accept completed work through both Verify and explicit advance with approval cleared. The newer target-bound requests, already-complete choice and independent server gate are preserved. |

Independent deliverable review found and fixed a conservative partial-context edge case and its qualified-selector whitelist; rereview found no outstanding finding. Independent test hardening added the genuine audit-routing approval proof. The reviewed code, tests and retained portfolio prove the four whole criteria, subject to the earlier explicit external-boundary limits.

Validation on 2026-10-26: the full `npm run verify` at `eabfca4` passed dependency audit, lint, TypeScript/Svelte, 620 units and 17 Codex protocol proofs. Integration completed all 61 files in 1283.23 seconds: 727 passed, two existing skips and one timer-sensitive failure in the unchanged usage-recovery test “takes a reading a minute after the limit’s reset time.” That test computes reset before harness setup, leaving only 4–5 seconds to arm a future callback; shared-machine load reached roughly 34. Independent triage confirmed its clock, scheduler, harness and scripted readings are unchanged by this phase. The exact unchanged case passes alone with one worker in 5.75 seconds, without changing assertions, deadlines or skip policy.

The worktree then integrated the separate output-preview fix `87f59ea`. Its affected requalification passes: build, lint, TypeScript/Svelte, all 621 units, both new multiline-preview browser cases, all 20 billing engine/browser cases, and all four installed-package checks. The reported full run used frozen runtime sources with no overlapping builds. Its one pre-existing timing failure and isolated recheck are reported separately rather than calling the original command green.

The real passive boundary remains qualified on macOS with Claude Code 2.1.307 and Agent SDK 0.3.310. Null-meter handling is verified against the installed SDK declaration and deterministic process/browser cases; an actual live account lacking meters was not induced. Native Linux/Windows metadata, native managed-host behavior, unavailable external-provider acceptance, paid-use/billing entitlement, unobserved helper rotations and unavailable runtime policy remain unproved exactly as in the earlier phases. No paid inference, credit purchase, allowance exhaustion, production change, release or package publication was used.

## Fresh whole-PRD audit handoff

After this leaf closes, the next unit is a fresh whole-PRD `delivery-audit` across all four phases, then `test-audit` only after a current clean delivery audit. Read every Markdown document in this directory, the design's Required implementation evidence and the newer Manual Phase Recovery contract. The audits recorded in the phase plan are historical baselines, not acceptance of these repairs. Preserve every prior proof limit. No acceptance criterion, assumption or supersession contract changed in this implementation.

Scoped implementation commits are authorized by the implement skill; pushing remains held by Doug's restriction: “Do not push without Doug's approval.” Original source chat: `01a1798c-ffcd-7d62-8283-d671b281a8e5`; carried through audit chat `01a17a53-efeb-7c81-98f1-126d6394ec43` into implementation chat `01a17a5c-fd98-7932-9655-7cc9d93ca222`. A successor worktree must start from the implementation commit after its approved landing. No release, publication or production change is authorized.
