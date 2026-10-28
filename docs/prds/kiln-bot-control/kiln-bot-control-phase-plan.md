# Kiln bot control — implementation phase plan

**Parent PRD:** [Kiln control from a phone-driven bot](kiln-bot-control-prd.md) · **Technical design:** [Kiln bot control](kiln-bot-control-technical-design.md).

## Implementation order

Implementation leaves 1–9 are closed and published; Phase 9 is `29851a2`, with publication/launch record `4853d2b`. The [after-Phase-9 delivery audit](kiln-bot-control-delivery-audit-after-phase-9.md) finds four partly implemented criteria and adds completion Phase 10 for nonregular saved-output handling and required receipt selection. Build it after explicit authorization, then repeat whole-PRD delivery audit; test audit follows only current clean delivery. Phase 9/8/7/6/5 historical non-green gates and separately scoped provider/Grok evidence remain unchanged.

| Phase | What it does | Depends on | Status |
|---|---|---|---|
| [1: Inspect existing work](phase-1-inspect-existing-work.md) | Find existing Kiln work and read its progress, stops, conversations, recovery instructions, accounts and bounded logs through a documented command interface. | None | Closed 2026-10-27 |
| [2: Control existing work safely](phase-2-control-existing-work.md) | Apply existing-run controls with durable retry and restart protection, then demonstrate the complete bot-driven workflow. | 1 (authenticated discovery, execution/session identity, read commands, result/help contracts and bounded logs) | Closed 2026-10-27 |
| [3: Complete activity reporting and command help](phase-3-complete-bot-inspection.md) | Added by delivery audit: retain latest activity after pause/completion and accurately document implemented controls and results. | 1 (inspection and help); 2 (live controls and durable receipts) | Closed 2026-10-27 |
| [4: Complete recovery instructions without a saved conversation](phase-4-complete-no-session-handoff.md) | Added by delivery audit: return available fresh-session instructions when work stops before any conversation is saved. | 1 (handoff/history projections and retained browser instructions) | Closed 2026-10-27 |
| [5: Complete attempt account provenance](phase-5-complete-attempt-account-provenance.md) | Added by delivery audit: keep the last attempt’s account, plan and observation time tied to that attempt when a later launch fails before starting. | 1 (account/status projections); 2 (durable launch admission and failure handling) | Closed 2026-10-27 |
| [6: Complete inspection freshness and helper help](phase-6-complete-inspection-freshness-help.md) | Added by delivery audit: keep usage readings tied to their observation, report unavailable recent logs honestly, and document helper JSON inputs. | 1 (inspection/selection/account projections); 3 (packaged help); 5 (preserved actual-attempt provenance) | Closed and published 2026-10-27 |
| [7: Complete Codex account binding and command discovery](phase-7-complete-codex-binding-help.md) | Added by delivery audit: keep Codex usage/recovery tied to a known account, expose failed reads honestly, and finish root/helper command help. | 1 (account/status/help); 3 (command discovery); 5 (attempt provenance); 6 (preserved freshness and helper payload contracts) | Closed and published 2026-10-27 |
| [8: Complete truthful and stable bot inspection](phase-8-complete-kiln-bot-inspection.md) | Added by delivery audit: complete independently dated/available observations, honest inventory and retained recovery, stable output pages and bounded full-history reads. | 1 (inspection); 2 (resumption/admission); 4 (handoff); 5 (attempt provenance); 6 (Claude usage/output selection); 7 (Codex observations/help) | Closed and published 2026-10-28 (`a8d208e`) |
| [9: Complete truthful inspection and bounded command input](phase-9-complete-kiln-inspection-input.md) | Added by delivery audit: complete session attribution/identity, observation unknowns/dates, bounded audit-sidecar reads, usable recovery history, reused output metadata and expired-input refusal. | 1 (inspection/help/input); 2 (durable admission/recovery); 5–7 (provenance/observations); 8 (guarded/spooled inspection and stable pages) | Closed and published 2026-10-28 (`29851a2`) |
| [10: Complete bounded output and receipt selection](phase-10-complete-kiln-inspection-boundaries.md) | Added by delivery audit: reject nonregular saved output without blocking and require the original command ID before receipt lookup. | 1 (inspection/help/output); 2 (receipts); 8–9 (bounded inspection and stable output) | Planned; launch held |

## Criterion ownership

Phase 1 owns AC-SEE-01–08, AC-ACT-01, AC-ACCOUNT-01 and AC-CLI-01–03. Phase 2 owns AC-ACT-02–05 and AC-CLI-04. All 18 active criteria have exactly one owner; retired AC-ACCOUNT-02–04 stay retired. AC-SEE-03, AC-SEE-07, AC-ACT-01 and AC-CLI-01–03 also constrain Phase 2's additions, as labelled in its phase document. No criteria or product scope changed during planning.

Completion Phase 3 completes AC-SEE-02, AC-ACT-01 and AC-CLI-01; Phase 1 retains ownership and its Closed line. Completion Phase 4 completes AC-SEE-05; Phase 1 retains ownership and its Closed line. Completion Phase 5 completes AC-SEE-03 and AC-ACCOUNT-01; Phase 1 retains ownership and its Closed line. Completion Phase 6 completes AC-SEE-03, AC-SEE-06, AC-ACT-01 and AC-ACCOUNT-01; Phase 1 retains ownership and its Closed line. Completion Phase 7 completes AC-SEE-03, AC-ACCOUNT-01 and AC-ACT-01; Phase 1 retains ownership and its Closed line. Completion Phase 8 completes AC-SEE-01, AC-SEE-03, AC-SEE-04, AC-SEE-05, AC-SEE-06, AC-SEE-08, AC-ACCOUNT-01 and AC-CLI-01; Phase 1 retains ownership and its Closed line. Completion Phase 9 completes AC-SEE-02, AC-SEE-03, AC-SEE-04, AC-SEE-05, AC-SEE-06, AC-SEE-08, AC-ACCOUNT-01, AC-CLI-01 and AC-CLI-02 (owned by Phase 1), and AC-ACT-02 (owned by Phase 2). Completion Phase 10 completes AC-SEE-01, AC-SEE-06, AC-SEE-08 and AC-CLI-01; Phase 1 retains ownership. Original ownership and every Closed line remain intact. No completion phase adds scope.

## Sizing decision

Two phases are needed because read-only inspection and durable run control have distinct implementation and proof boundaries. Existing snapshots, account readers, provider history and handoff support make the read surface one coherent build; snapshot-bound log paging remains in that phase rather than paying for a separate session. Its proof includes the actual saved files, final serializers, installed package and authenticated loopback discovery.

The second phase carries one coupled control capability: all entry points share admission, receipts, dispatch correlation and reconciliation, with provider/process/write-failure and concurrency evidence. Splitting storage, API or browser wiring into separate phases would leave an unproved partial control mechanism. This phase can consume the first phase's complete read interface and prove the final workflow without any later build. Each phase is sized for one implementation chat; neither relies on parallel implementation or a later validation-only phase.

## Validation and closeout

Use the technical design's [Validation Boundaries](kiln-bot-control-technical-design.md#validation-boundaries), assigned by each phase's notes. The design-stage serializer experiment is not implementation proof. Complete the repository's normal verification gate for each implementation commit. After all implementation leaves close, run whole-PRD delivery audit, then test audit; those audits are closeout of this PRD, not additional planned implementation phases.

Completion Phase 4 is published at `8a2975d`; Phase 5 at `2fe5777`; Phase 6 at `572424a`, with publication handoff `6ced34a`. The audit after Phase 6 confirms the repaired Claude usage dating/binding, unavailable-log selection and five helper JSON-input contracts; Phase 7 completes its remaining Codex metadata and general command-help gaps. No new dispatch capability, account management or authority is added. Phase 7 is closed and published; the after-Phase-7 audit and its next completion phase are recorded below. Scoped commits follow their skills' defaults. Doug's Phase 6 publication/fresh-audit authorization is recorded in its Audit handoff; Doug's Phase 7 publication/fresh-audit authorization is recorded in Phase 7's Audit handoff and publication boundary; publishing the fresh audit's commits still requires explicit authorization. No production release is authorized.


## After-Phase-7 audit and next implementation

Phase 7 was published as `42aecba`, with publication/fresh-audit authorization recorded in `a5c444d`. The [current delivery audit](kiln-bot-control-delivery-audit-after-phase-7.md) records the confirmed missing parts, bounded local reproductions, four assessment rounds and reverse conflict checks. Phase 8 groups the existing inspection corrections in one session, preserving provider authority, pure retained reads, helper contracts and other tracks' ownership. After it closes, repeat whole-PRD delivery audit in a fresh chat; test audit still waits for current clean delivery.

The audit documents commit under the skill default. Doug subsequently authorized this audit's publication and the Phase 8 implementation chat; the audit's Publication boundary preserves his actual instruction and source chat. The audit was published, and Phase 8 launched from published `origin/develop` in its own fresh worktree. Publishing new implementation/later-audit commits and production release remain held.

## Phase 8 local completion

Phase 8 is closed locally on 2026-10-28. Its [Final verification](phase-8-complete-kiln-bot-inspection.md#final-verification) records full-gate failures and exact published-baseline comparisons, independent deliverable review/test hardening, bounded real-controller proof and installed-package/provider metadata evidence. No original criterion ownership, supersession or earlier Closed line changes. Publication is held under the authorization quoted in Phase 8; its fresh-audit continuation is valid only after authorized publication and shared-checkout fast-forward. Whole-PRD delivery audit is the next planned closeout, followed by test audit only when delivery is clean.

## Phase 8 publication and fresh audit authorization

Phase 8 implementation `a8d208e` is published on 2026-10-28. Doug authorized its publication and a fresh whole-PRD delivery audit chat using GPT-6.1 Sol with high reasoning; the exact instruction and source chat are recorded in [Phase 8](phase-8-complete-kiln-bot-inspection.md#phase-8-publication-authorization). This supersedes the Phase 8 publication hold above. Publication of later audit/implementation commits and production release remain held. Test audit still waits for clean whole-PRD delivery.

## After-Phase-8 audit and next implementation

The [after-Phase-8 delivery audit](kiln-bot-control-delivery-audit-after-phase-8.md) checks published `f11ecd9` across all 18 active criteria and all eight closed phases. Four full rounds confirmed 3, 5, 4 and 1 missing-part records, grouped into eight families; the fourth still found an ordinary-recovery availability variant and assessment ended at the four-round limit. Ten criteria remain partly implemented. Phase 9 groups the existing inspection/result/input corrections in one session, preserving original ownership, all Closed lines, partial supersessions and other tracks' work.

Scoped audit documents commit locally under the skill default. The audit's Publication boundary preserves Doug's exact Phase 8 publication/audit-launch instruction and source chat. This audit's publication, launching Phase 9 and later publication/release remain held for explicit authorization. After Phase 9 closes, repeat whole-PRD delivery audit in a fresh chat; whole-PRD test audit follows only clean delivery. The audit records the continuation scope and publication prerequisites; the prepared machine-specific prompt accompanies its commit.

## Audit publication and Phase 9 launch authorization

Doug authorized publication of the after-Phase-8 audit (rebased as `9fa8b04`) and launch of a fresh chat implementing Phase 9 on 2026-10-28. The [audit authorization record](kiln-bot-control-delivery-audit-after-phase-8.md#audit-publication-and-phase-9-launch-authorization) preserves his exact instruction and source chat. This supersedes the audit-publication and Phase 9 launch holds above. The successor starts from published `origin/develop` after shared-checkout fast-forward. Scoped implementation commits follow the skill default; publication of future implementation/later-audit commits and production release remain held.


## Phase 9 local completion

Phase 9 is closed locally on 2026-10-28. Its [Implementation, Covered-criterion evidence and Final verification](phase-9-complete-kiln-inspection-input.md#final-verification) record the completed repairs, independent reviews/hardening, complete non-green verification gate, exact baseline comparisons, unchanged focused reruns and passing installed-package gate. Original criterion ownership, every earlier Closed line and all partial supersessions remain intact. Scoped commits follow the implement skill default; publishing this implementation/later-audit commits and production release remain held under the exact authorization carried in Phase 9.

After authorized publication and shared-checkout fast-forward, use Phase 9's prepared fresh-chat continuation for a whole-PRD delivery audit. It creates a new worktree and preserves these proof/authority limits; it does not reuse this implementation worktree. Whole-PRD test audit follows only current clean delivery. Other tracks remain independently owned.


## Phase 9 publication and fresh delivery-audit authorization

Doug authorized publication of Phase 9 implementation `29851a2`, its scoped handoff record and launch of the next planned fresh whole-PRD delivery audit on 2026-10-28. Phase 9's [publication and launch authorization](phase-9-complete-kiln-inspection-input.md#phase-9-publication-and-delivery-audit-launch-authorization) preserves his exact instructions and source chat. This supersedes the earlier Phase 9 publication and successor-launch holds. The successor starts from published `origin/develop` after shared-checkout fast-forward, in a fresh worktree. Scoped audit commits follow the skill default; future audit/implementation publication and production release remain held. Test audit waits for current clean delivery; all historical proof limits and other tracks' ownership remain intact.

## After-Phase-9 delivery audit and next implementation

The [after-Phase-9 whole-PRD delivery audit](kiln-bot-control-delivery-audit-after-phase-9.md) checks published `4853d2b`, all nine closed implementation leaves and all 18 active criteria. Two full assessment rounds confirmed two missing-part families and no additional family in the second round. Four criteria remain partly implemented: nonregular saved output can block logs, inventory and full status, and missing command-status ID can select the literal `undefined`. Completion [Phase 10](phase-10-complete-kiln-inspection-boundaries.md) carries those existing obligations; original ownership, Closed lines, partial supersessions and all historical gate limits remain intact.

Scoped audit documents commit under the skill default and remain local. The audit's Publication boundary preserves Doug's exact instruction and source chat: it authorized Phase 9 publication and this audit launch. Publishing this audit, launching Phase 10, future implementation/audit publication and production release remain held. After authorized completion/publication, repeat whole-PRD delivery audit in a fresh chat/worktree, then test audit only when delivery is clean. Other tracks remain independently owned.
