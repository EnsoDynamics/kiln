# Kiln billing safeguards — implementation phase plan

**Parent PRD:** [Kiln billing safeguards](kiln-billing-safeguards-prd.md)
**Technical design:** [Kiln billing safeguards technical design](kiln-billing-safeguards-technical-design.md)
**Business assumptions:** [Kiln billing safeguards assumptions](kiln-billing-safeguards-assumptions.md)

## Sizing decision

Two phases, executed in order. This assessment starts from the full PRD, design, assumptions, approved mockup galleries and current implementation; it does not adopt the earlier sizing conclusion.

Claude's passive detector, execution-scoped approval and launch/recovery enforcement form one capability. Its proof spans the real SDK settings boundary, projected authentication inputs, durable authorization, process dispatch and the browser. Keeping that chain together makes Phase 1 independently usable and testable. The common `runProcess` boundary, existing temporary-repository harness, metadata transports and atomic state writer keep this substantial phase within one coherent implementation session. Splitting inspection, persistence or UI into separate phases would leave the safeguard incomplete.

Codex adds a second account contract: pinned app-server credit fields and account/workspace attribution, with different authentication and recovery rules. Carrying that separate real-CLI qualification and browser proof alongside the complete Claude authorization chain exceeds a dependable single-session scope. Phase 2 fits one session because it extends the existing Codex account/usage/account read and the billing presentation and historical snapshots delivered by Phase 1. No provider upgrade or new RPC is needed. The phases retain their own integration and package verification; testing is not deferred to a final phase.

## Execution order

| Phase | What it does | Depends on |
|---|---|---|
| [1 — Claude billing safeguards](phase-1-claude-billing-safeguards.md) | Show Claude billing, require scoped approval for detected metered access, and enforce it through launches, recovery and restarts. | None |
| [2 — Codex billing visibility](phase-2-codex-billing-visibility.md) | Show the ChatGPT account and attributable workspace credit facts while preserving Codex eligibility and recovery. | 1 (billing view, persisted launch snapshots and shared account UI) |

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

Both phases run the design's full verification gate and preserve its explicit limitations. Phase 1's proof does not depend on the new Codex credit fields or screens; Phase 2 consumes the already-tested shared billing structures. The phase sequence requires no production release, paid inference, credit purchase or allowance exhaustion between phases. Closing all planned phases is followed by whole-PRD delivery audit, then test audit under the implementation lifecycle.
