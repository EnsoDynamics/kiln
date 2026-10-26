# Kiln billing safeguards — implementation phase plan

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md)
**Business assumptions:** [Kiln billing safeguards assumptions](kiln-billing-safeguards-assumptions.md)

## Sizing decision

Two original planned phases, executed in order; the closing delivery audit added one completion phase below. This assessment starts from the full PRD, design, assumptions, approved mockup galleries and current implementation; it does not adopt the earlier sizing conclusion.

Claude's passive detector, execution-scoped approval and launch/recovery enforcement form one capability. Its proof spans the real SDK settings boundary, projected authentication inputs, durable authorization, process dispatch and the browser. Keeping that chain together makes Phase 1 independently usable and testable. The common `runProcess` boundary, existing temporary-repository harness, metadata transports and atomic state writer keep this substantial phase within one coherent implementation session. Splitting inspection, persistence or UI into separate phases would leave the safeguard incomplete.

Codex adds a second account contract: pinned app-server credit fields and account/workspace attribution, with different authentication and recovery rules. Carrying that separate real-CLI qualification and browser proof alongside the complete Claude authorization chain exceeds a dependable single-session scope. Phase 2 fits one session because it extends the existing Codex account/usage/account read and the billing presentation and historical snapshots delivered by Phase 1. No provider upgrade or new RPC is needed. The phases retain their own integration and package verification; testing is not deferred to a final phase.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 — Claude billing safeguards](phase-1-claude-billing-safeguards.md) | Show Claude billing, require scoped approval for detected metered access, and enforce it through launches, recovery and restarts. | None |
| [2 — Codex billing visibility](phase-2-codex-billing-visibility.md) | Show the ChatGPT account and attributable workspace credit facts while preserving Codex eligibility and recovery. | 1 (billing view, persisted launch snapshots and shared account UI) |
| [3 — Complete Claude billing context and identity](phase-3-complete-claude-billing-context.md) | Added by delivery audit: prevent approval requests caused by inactive provider settings and show known Claude account or organization details. | 1 (inspection, authority and launch gate); 2 (shared billing panel) |

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
