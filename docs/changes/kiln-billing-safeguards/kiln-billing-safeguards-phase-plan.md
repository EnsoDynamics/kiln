# Kiln billing safeguards — implementation phase plan

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md)
**Business assumptions:** [Kiln billing safeguards assumptions](kiln-billing-safeguards-assumptions.md)

## Sizing decision

Two original planned phases, executed in order; closing delivery audits added completion Phases 3 and 4 below. This assessment starts from the full PRD, design, assumptions, approved mockup galleries and current implementation; it does not adopt the earlier sizing conclusion.

Claude's passive detector, execution-scoped approval and launch/recovery enforcement form one capability. Its proof spans the real SDK settings boundary, projected authentication inputs, durable authorization, process dispatch and the browser. Keeping that chain together makes Phase 1 independently usable and testable. The common `runProcess` boundary, existing temporary-repository harness, metadata transports and atomic state writer keep this substantial phase within one coherent implementation session. Splitting inspection, persistence or UI into separate phases would leave the safeguard incomplete.

Codex adds a second account contract: pinned app-server credit fields and account/workspace attribution, with different authentication and recovery rules. Carrying that separate real-CLI qualification and browser proof alongside the complete Claude authorization chain exceeds a dependable single-session scope. Phase 2 fits one session because it extends the existing Codex account/usage/account read and the billing presentation and historical snapshots delivered by Phase 1. No provider upgrade or new RPC is needed. The phases retain their own integration and package verification; testing is not deferred to a final phase.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 — Claude billing safeguards](phase-1-claude-billing-safeguards.md) | Show Claude billing, require scoped approval for detected metered access, and enforce it through launches, recovery and restarts. | None |
| [2 — Codex billing visibility](phase-2-codex-billing-visibility.md) | Show the ChatGPT account and attributable workspace credit facts while preserving Codex eligibility and recovery. | 1 (billing view, persisted launch snapshots and shared account UI) |
| [3 — Complete Claude billing context and identity](phase-3-complete-claude-billing-context.md) | Added by delivery audit: prevent approval requests caused by inactive provider settings and show known Claude account or organization details. | 1 (inspection, authority and launch gate); 2 (shared billing panel) |
| [4 — Complete billing continuity, overflow and recovery controls](phase-4-complete-billing-continuity-and-controls.md) | Added by delivery audit: retain approval when unrelated provider settings change, preserve reported paid-overflow information without usage rows, and keep Resume unavailable until billing is eligible. | 1 (approval, account inspection and recovery); 3 (provider-context filtering) |

## Acceptance-criterion ownership

| Owning phase | Criteria |
|---|---|
| 1 | AC-BILL-01, AC-BILL-02, AC-BILL-03, AC-BILL-04, AC-BILL-05, AC-BILL-06, AC-BILL-07, AC-BILL-08; AC-RUN-01, AC-RUN-02, AC-RUN-03, AC-RUN-04, AC-RUN-05, AC-RUN-06, AC-RUN-07 |
| 2 | AC-CODEX-01, AC-CODEX-02, AC-CODEX-03, AC-CODEX-04, AC-CODEX-05 |

AC-BILL-07 and AC-RUN-04–07 also constrain Phase 2's additions; Phase 1 owns them and proves them for its work, and Phase 2 proves them for its additions. Existing Codex behavior remains a regression boundary in Phase 1. No criterion is retired, divided or deferred outside these phases.

## Verification ownership

Use the technical design's **Integration Evidence and Verification → Required implementation evidence** as the proof contract, with this phase allocation:

| Phase | Evidence groups owned |
|---|---|
| 1 | Real passive boundary; Approval/state rules; Dispatch and recovery; Claude Browser states; Claude Release documentation and built-package inspection. |
| 2 | Codex; Codex and agent-switching Browser states, including preservation of Claude behavior; Codex Release documentation and built-package inspection. |
| 3 (completion) | Prove AC-BILL-01–02 in full through the existing real passive boundary, authority/dispatch and browser paths; preserve shared Claude/Codex presentation and the design’s full verification gate. |
| 4 (completion) | Prove AC-BILL-02–03, AC-BILL-05 and AC-RUN-02 in full through account/usage attribution, passive context/authority, dispatch/restart and real-server recovery controls; preserve the newer manual recovery contract and the design's full verification gate. |

Both original planned phases run the design's full verification gate and preserve its explicit limitations. Phase 1's proof does not depend on the new Codex credit fields or screens; Phase 2 consumes the already-tested shared billing structures. The phase sequence requires no production release, paid inference, credit purchase or allowance exhaustion between phases. Closing all planned phases is followed by whole-PRD delivery audit, then test audit under the implementation lifecycle.

## Whole-PRD delivery audit — 2026-10-26

Audited requirements and implementation at `587f26b` after both original planned leaves closed, with no uncommitted changes in scope. Three independent assessors read the governing requirements and traced all 20 criteria from their entry points. The main audit confirmed the gaps and ran the requirements/history conflict check. No criterion is superseded, changed outside the requirements, waiting on a human action, or not built yet at this baseline.

| Criteria | Delivery status | Disposition |
|---|---|---|
| AC-BILL-01 | Partly implemented | Inactive provider endpoints count as effective billing overrides; known neutral-route account and organization-only identity is omitted from the billing panel. Phase 3 completes it. |
| AC-BILL-02 | Partly implemented | Unrelated endpoint settings can block confirmed subscription access pending API approval. Phase 3 completes it. |
| AC-BILL-03–08 | Implemented | Traced through passive/usage inspection, execution-scoped authority, protected API, launch gate and billing/usage views. |
| AC-RUN-01–07 | Implemented | Traced all phase, finalization, audit and recovery dispatches, durable holds/provenance, disconnected controls, safe outputs and public documentation. |
| AC-CODEX-01–05 | Implemented | Traced fresh metadata/readiness, workspace-credit attribution, independent recovery authority, launch history, agent switching and disconnected views. |

The false subscription hold was reproduced by invoking the existing compiled classifier with synthetic complete-inventory/first-party-subscription inputs and an unrelated AWS endpoint. This audit changed no implementation or tests and did not rerun or grade the test suites. The phases' implementation evidence and explicit proof limits remain the inputs for the eventual test audit.

Conflict check: no later-built requirement supersedes the two incomplete criteria. Their current implementations originate in `4e1dda8`; the subsequent Codex change preserves them. The design requires provider-relevant context, and no recorded decision asks for unrelated endpoints to force approval or known identity to disappear. These are implementation gaps, not changed product decisions. Phase 3 preserves original criterion ownership and both earlier Closed lines.

Next unit: implement Phase 3 in a fresh chat, then repeat the whole-PRD delivery audit. Run the whole-PRD test audit only after delivery is clean. No release, package publication or push is authorized by this audit.

## Completion phase handoff — 2026-10-26

Phase 3 is closed; its Implementation evidence section records the endpoint-context repair, identity presentation, independent deliverable review/test hardening, full verification gate and installed-package checks. Original criterion ownership and both earlier Closed lines remain unchanged. No acceptance criterion or business decision changed.

Next unit: a fresh whole-PRD `delivery-audit` across all three closed phases. The audit at `b5baca9` is historical evidence of the original gaps, not acceptance of their repair. Only a current clean delivery audit hands off to whole-PRD `test-audit`. Read all three phase documents for evidence and explicit proof limits, and follow the design's Required implementation evidence. Push remains subject to Doug's approval as recorded in Phase 3's Fresh whole-PRD audit handoff.

## Fresh whole-PRD delivery audit — 2026-10-26

Audited all 20 criteria at `2dc96a9`, with no uncommitted requirements or implementation changes. All three existing phases were closed. Three independent assessors read the requirements from disk and traced Claude billing, launch/recovery and Codex billing from their entry points. The main auditor confirmed each finding against source, checked the installed SDK contract for the overflow case, and ran the requirements/history conflict check. Phase 3's endpoint and identity repairs are implemented; its closure and the historical `b5baca9` audit are not substitutes for this assessment.

| Criteria | Delivery status | Disposition |
|---|---|---|
| AC-BILL-01, AC-BILL-04, AC-BILL-06–08 | Implemented | Actual-context inspection, repaired endpoint/identity presentation, reviewed approval commands, unchanged settings and independent usage views are reachable. |
| AC-BILL-02–03 | Partly implemented | A supported usage report with `limits: null` and enabled `extra_usage` loses the overflow fact before attribution and display. Phase 4 completes both criteria. |
| AC-BILL-05 | Partly implemented | Non-endpoint settings for inactive providers still alter the private billing identity and revoke approval for unchanged effective billing. Phase 4 completes it. |
| AC-RUN-02 | Partly implemented | The newer manual phase handoff enables both Resume actions without checking billing eligibility. Server dispatch still refuses unapproved work. Phase 4 completes it. |
| AC-RUN-01, AC-RUN-03–07 | Implemented | Fresh common dispatch gates, retained recovery facts, local completion checks, launch history, disconnected controls, protected outputs and public guidance remain reachable. |
| AC-CODEX-01–05 | Implemented | Fresh required eligibility, attributable workspace credits, independent usage recovery, launch/next identity and disconnected presentation remain reachable. Shared Phase 2 constraints also remain implemented. |

Confirmation used the exact TypeScript sources transpiled only in memory, with synthetic inputs and no provider calls or file writes. For first-party API access, changing only an inactive `ANTHROPIC_FOUNDRY_RESOURCE` changed `approved` and `canLaunch` from true to false without changing the route, provider or displayed sources. For usage parsing, an enabled overflow fact survived `limits: []` but disappeared with `limits: null`; installed Agent SDK 0.3.310's `SDKUsageReport` explicitly permits null rows when a server predates usage meters, independently of `extra_usage`. The UI finding is source-confirmed through `PhaseHandoff`, `resumeOffered`, snapshot construction and the final server gate. This audit changed no implementation or tests, ran no test suite, and did not grade the proof portfolio.

Conflict check: no later-built criterion supersedes these missing behaviors. Broad provider-context fingerprinting originates in `4e1dda8`, which also added overflow extraction after the usage-parser early return inherited from `61921fe6`; Phase 3 narrows endpoints without changing approval or overflow policy. The later `7e7b7c8` handoff explicitly retains billing eligibility in AC-RETURN-01 and AC-COMPAT-01; its supersession changes only manual Resume's already-complete choice. Verify/advance remain independent of billing approval. These are missing implementation parts, not changed product decisions; no pointer repair or business assumption is needed. No criterion is wholly superseded, changed outside the requirements, or waiting on a human action at this baseline.

One completion phase holds the three gaps: they share the existing billing observation/approval/recovery flow, require no new provider or service, and fit one implementation session with its full verification gate. Original criterion ownership and all three Closed lines remain unchanged. Next unit: implement Phase 4 in a fresh chat, repeat whole-PRD delivery audit, then run whole-PRD test audit only after delivery is clean. Earlier native-platform, unavailable-provider and paid-use proof limits remain as recorded; no inference, release or publication was authorized by this audit.


## Completion Phase 4 handoff — 2026-10-26

Phase 4 is closed. Its Implementation evidence records the overflow-without-meters repair, provider-relevant approval continuity with conservative partial-inventory handling, billing-disabled manual Resume controls, whole-four-criterion proof, independent deliverable review and test hardening, full verification outcome with one unchanged timer test's isolated passing recheck, and final integrated package checks. The earlier ownership, Closed lines, business assumptions and explicit proof limits remain unchanged.

Next unit: a fresh whole-PRD `delivery-audit` across all four phases, followed by `test-audit` only after a current clean delivery audit. The `2dc96a9` audit is a historical baseline and does not establish that these repairs are complete. Read every Markdown document in this directory, Phase 4's Fresh whole-PRD audit handoff, the design's Required implementation evidence and its newer Manual Phase Recovery supersession. Implementation commits follow the skill default; no push, release, publication or production change is authorized without the corresponding approval recorded in Phase 4.


## Current whole-PRD delivery audit — Phase 4 baseline, 2026-10-26

**Outcome:** All 20 criteria are Implemented at `8a3c12a1020ffd7d56d0f56687dbd8c3ccf051ee`. All four phases were closed, and the requirements and implementation were clean at assessment. Three independent assessors derived required parts from the governing documents before opening code and traced their assigned criteria from current entry points; the main auditor cross-checked the implementation. No delivery gap or completion phase remains. Earlier audit sections are historical baselines.

| Criterion | Delivery status | Reachable implementation |
|---|---|---|
| AC-BILL-01 | Implemented | Engine display/dispatch inspection → passive inventory and required authentication → `classify` → authority/snapshot → `BillingPanel`; provider-relevant sources and reliable non-metered identity are retained without API-payer substitution. |
| AC-BILL-02 | Implemented | Classification, independent readiness, initial Start and common dispatch implement every billing case; optional absence stays neutral and detected overrides require approval. |
| AC-BILL-03 | Implemented | `parseUsage` retains boolean overflow independently of absent/null meters; `readAccount` brackets identity, the engine checks matching subscription/freshness, and the panel renders the factual amber notice/link without approval. |
| AC-BILL-04 | Implemented | Protected approval endpoint → `BillingAuthority.command` validates execution/generation/reading, reinspects and saves the reviewed context; exact direct/named/configured-provider choices precede model dispatch. |
| AC-BILL-05 | Implemented | Execution-local HMAC authority persists across phases/audits/resumes/restart, uses effective-provider context, invalidates changed or abandoned contexts, supports idle clear and removes approval on completion. |
| AC-BILL-06 | Implemented | Passive inspection and in-memory authentication projection preserve the work environment/settings; source-change guidance, recheck and approval remain separate from dispatch. |
| AC-BILL-07 | Implemented | Existing Claude and arbitrary Codex usage rows remain independent of text-only billing; unavailable optional metadata creates no meter or fabricated progress. |
| AC-BILL-08 | Implemented | Shared summary places subscription email or unavailable wording directly below its label; running views use the persisted launch account. |
| AC-RUN-01 | Implemented | Phase, audit, final-delivery and all resume paths converge on fresh common dispatch checks; bounded passive inspection, pending UI and independent readiness remain in force. |
| AC-RUN-02 | Implemented | Start and both manual Resume controls reflect billing eligibility; durable Needs you holds retain sessions/evidence, and approval/recheck cannot dispatch. Verify and explicit advance stay independently available. |
| AC-RUN-03 | Implemented | Usage, sleep, restart, manual and Resume-now paths reach fresh gates; billing holds suspend automatic release while retaining refusal facts, and explicit continuation rechecks recovery rules. |
| AC-RUN-04 | Implemented | Local completion evaluation remains independent; resulting AI work returns through dispatch. Public guidance states launch-time detection, active-session behavior and no spending-cap/zero-cost guarantee. |
| AC-RUN-05 | Implemented | Claude/Codex launch summaries persist before work; panel separates historical launch from changed next readings, disables disconnected actions and labels last-known facts; terminal holds direct users to the browser. |
| AC-RUN-06 | Implemented | Typed safe summaries exclude private HMAC material and raw credentials; bounded metadata suppresses raw errors, protected commands use sanitized failures and owner-only state, and installed CLI/auth/provider restrictions remain authoritative. |
| AC-RUN-07 | Implemented | npm-facing root README covers every billing choice and boundary with provider settings links; both referenced mockup galleries cover the new presentations and controls. |
| AC-CODEX-01 | Implemented | Selected metadata → `codexBillingView` → panel renders ChatGPT label/email/plan, unavailable wording, neutral billing sentence and usage dashboard link. |
| AC-CODEX-02 | Implemented | Account/usage/account corroboration and workspace routing attach scoped bucket credits; freshness/identity filters omit unreliable data without warning, approval or permission inference. |
| AC-CODEX-03 | Implemented | Every `runCodexSession` invokes fresh `prepareCodexLaunch`; required ChatGPT/OpenAI, version/model/policy/profile checks precede `turn/start`, and Claude approval is rejected for Codex. |
| AC-CODEX-04 | Implemented | Existing refreshes, provider window names/durations and independent usage-recovery permission remain intact; optional credits do not authorize automatic recovery or change spending settings. |
| AC-CODEX-05 | Implemented | Agent selection invalidates obsolete metadata; durable run facts, next-reading comparison and disconnected rendering preserve account/credit attribution and credential protection across views. |

No criterion is wholly superseded, Changed outside the requirements, Waiting on a human action, or Not built yet. The design's partial supersession to the newer Manual Phase Recovery contract was followed: manual Resume retains its explicit already-complete choice and billing eligibility, while Verify/advance can accept completed work without billing approval. BILLING-001 and BILLING-002 remain implementable assumptions, not approval holds.

This delivery audit changed only audit/status documents. It ran no test suite, provider call or paid inference and does not grade the proof portfolio. Read Phase 4's Implementation evidence and Fresh whole-PRD audit handoff together with the design's Required implementation evidence for the test audit. Preserve the reported full verification outcome and separate unchanged timer-sensitive failure/recheck; do not call that original command green. Native Linux/Windows metadata, managed-host behavior, unavailable external-provider acceptance, paid-use entitlement, live missing-meter/unavailable-credit conditions and unobservable helper/policy limits remain exactly as previously recorded.

### Whole-PRD test-audit handoff

Next unit: `test-audit` across all 20 criteria and all four phases, including the shared Codex constraints. This clean delivery result covers requirements and implementation at `8a3c12a`; audit-record-only edits do not invalidate it. Any later requirements or implementation change requires a fresh whole-PRD delivery audit before the affected test rows can close. No implementation or test work is included in this audit commit.

Read every Markdown document in this directory, follow the technical design's Required implementation evidence and supersession links, and independently assess the existing evidence and explicit limitations. The phase plan's earlier audits are historical; the section above is the current delivery baseline. No new completion phase is needed before test audit.

Doug's restriction remains: “Do not push without Doug's approval.” Source: chat `01a1798c-ffcd-7d62-8283-d671b281a8e5`, carried through Phase 4 chat `01a17a5c-fd98-7932-9655-7cc9d93ca222` into this audit chat `01a17a99-8769-7103-873f-c813783fdd63`. Doug's separate authorization in the Phase 4 chat to commit/push that implementation and launch its delivery audit was fulfilled by the published `8a3c12a` and this assessment; it does not authorize pushing this audit commit or launching test audit. Scoped audit commits follow the skill default. No release, publication, paid inference or production change is authorized.
