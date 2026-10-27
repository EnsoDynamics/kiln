# Kiln bot control — implementation phase plan

**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md) · **Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md).

## Implementation order

Build and verify each phase in this order before starting the next. Both implementation phases closed on 2026-10-27, including Phase 2’s required Grok Bot demonstration. Integration/push remains held; whole-PRD delivery and test audits follow integration.

| Phase | What it does | Depends on | Status |
|---|---|---|---|
| [1: Inspect existing work](phase-1-inspect-existing-work.md) | Find existing Kiln work and read its progress, stops, conversations, recovery instructions, accounts and bounded logs through a documented command interface. | None | Closed 2026-10-27 |
| [2: Control existing work safely](phase-2-control-existing-work.md) | Apply existing-run controls with durable retry and restart protection, then demonstrate the complete bot-driven workflow. | 1 (authenticated discovery, execution/session identity, read commands, result/help contracts and bounded logs) | Closed 2026-10-27 |

## Criterion ownership

Phase 1 owns AC-SEE-01–08, AC-ACT-01, AC-ACCOUNT-01 and AC-CLI-01–03. Phase 2 owns AC-ACT-02–05 and AC-CLI-04. All 18 active criteria have exactly one owner; retired AC-ACCOUNT-02–04 stay retired. AC-SEE-03, AC-SEE-07, AC-ACT-01 and AC-CLI-01–03 also constrain Phase 2's additions, as labelled in its phase document. No criteria or product scope changed during planning.

## Sizing decision

Two phases are needed because read-only inspection and durable run control have distinct implementation and proof boundaries. Existing snapshots, account readers, provider history and handoff support make the read surface one coherent build; snapshot-bound log paging remains in that phase rather than paying for a separate session. Its proof includes the actual saved files, final serializers, installed package and authenticated loopback discovery.

The second phase carries one coupled control capability: all entry points share admission, receipts, dispatch correlation and reconciliation, with provider/process/write-failure and concurrency evidence. Splitting storage, API or browser wiring into separate phases would leave an unproved partial control mechanism. This phase can consume the first phase's complete read interface and prove the final workflow without any later build. Each phase is sized for one implementation chat; neither relies on parallel implementation or a later validation-only phase.

## Validation and closeout

Use the technical design's [Validation Boundaries](kiln-bot-control-technical-design.md#validation-boundaries), assigned by each phase's notes. The design-stage serializer experiment is not implementation proof. Complete the repository's normal verification gate for each implementation commit. After both leaves close, run whole-PRD delivery audit, then test audit; those audits are closeout of this PRD, not additional planned implementation phases.
