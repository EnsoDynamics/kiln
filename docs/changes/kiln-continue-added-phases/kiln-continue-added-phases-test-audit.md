# Test audit: Kiln Continue Added Phases

**Status:** Audit/remediation chain stopped by Doug on 2026-10-31 UTC. Remaining evidence gaps and the recovery-message limitation are retained below. No further phases, audits or successor chats are planned. Grades, denominators, both prior attempts and all collected evidence are unchanged; this is a user-directed closeout, not a claim that the audit target was met.
**Last audit:** 2026-10-31 UTC, whole PRD; current chat `01a18fba-5b8a-7642-8124-37692cfad927` confirmed a delivery gap at `feb514a` without regrading partial remediation; AC-CONTINUE-07 independently regraded against test-only changes at `f149f48`. Initial unchanged rows retain `b46e7fb`.
**PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md).
**Requirements:** [single technical design](kiln-continue-added-phases-technical-design.md), [assumptions](kiln-continue-added-phases-assumptions.md), every closed leaf in the [phase plan](kiln-continue-added-phases-phase-plan.md).
**Delivery assessment:** [Historical whole-PRD delivery audit after Phase 8](kiln-whole-prd-delivery-audit-after-phase-8.md), implementation `c21e655`; the diagnostic limitation discovered later remains documented. Doug ended further implementation/audit work and authorized development integration and local installation with these limits.

This is the governing test-audit record for this PRD. Its descriptive filename follows the user's documentation naming instruction. No successor audit is scheduled; this file retains the evidence and limitations at closeout.

## Scope and evidence rules

The original assessment covered all 18 active criteria as built. The recovery-diagnostic discovery remains a known AC-CONTINUE-07 limitation; proposed Phase 9 was cancelled by Doug, and its earlier grade/count remain historical evidence. AC-CONTINUE-02 is retired into AC-CONTINUE-06/07; AC-CONTINUE-04 is retired into AC-CONTINUE-08/09. Neither retired label is graded. No active criterion is excluded as person-checked, superseded, not built, or accepted. CONTINUE-001/002 retain their declared proposed status; no product assumption changed.

Three independent fresh readers assessed groups of at most four related criteria, deriving required parts from the PRD/design/assumptions and applicable original/completion leaves before opening tests. The complex preparation criterion had its own assessment. The primary reader confirmed collection, representative assertions, source paths and red-check safety. Counts below use stated observable groups: a group is uncovered if one of its stated variants remains unproved. Implied edges do not reduce Adequate to Weak. No criterion is Strong because every stated part has not been seen to fail under a safe discriminating mutation.

`npm test` collects non-integration `src/**/*.test.ts` and `view/src/**/*.test.ts`. `npm run verify` also builds and collects `src/**/*.integration.test.ts`, plus release and Codex contract checks. `npm run test:package` collects installed-package tests. Native preparation cases are enabled on this macOS checkout and macOS validation, skipped on unsupported platforms; those skips do not certify other profiles. Historical actual-provider proof runs remain valuable delivery evidence, but their opt-in scripts are not collected by these test commands or CI and therefore do not establish a current test-audit grade. In particular, `added-plan-provider-proof.mjs`, `continuation-provider-proof.mjs` and `preparation-provider-proof.mjs` under `scripts/proof-run/` are not invoked by the normal commands, including `test:live-proof`. Deterministic peers prove engine scheduling/storage contracts; they cannot alone prove actual providers obey preparation-only turns or start fresh native conversations.

All Git writes in mapped integration fixtures target generated disposable repositories and local bare origins. HTTP/browser coverage uses the actual local server and Chrome. Native checks execute real project commands under qualified local controls. No production check or actual-provider launch was performed by this audit. The initial assessment changed no implementation, requirements or tests. The first remediation batch adds only two collected test files; implementation, shared fixtures, runner configuration and governing requirements remain unchanged. The clean delivery assessment at `c21e655` remained current through that test-only batch; the newly confirmed Phase 9 delivery gap now requires fresh assessment. One fresh independent reader per remediation batch regraded AC-CONTINUE-07 after deriving its parts from requirements; other grades stand unchanged. The second batch adds one normally collected native-contract integration file only; no shared fixture, implementation, runner, requirements or provider profile changed.

## By criterion

Test aliases resolve to exact collected names in the next section. Checked entries are 2026-10-31 UTC at `b46e7fb`, except the worked AC-CONTINUE-07 row, which names its test commit.

| Criterion | Grade | Stated parts covered | Tests | Code | Checked |
|---|---|---:|---|---|---|
| AC-HANDBACK-01 — Every return reads the revised plan | Weak | 8/10 | H1–H3/H11, P18, B1; provider gap | `engine.ts` readPlan/prepare/judgeEndedSession; `plan-reconciliation.ts` | `b46e7fb` |
| AC-HANDBACK-02 — Added work continues automatically (high risk) | Weak | 10/12 | H1–H5, C3, P14/P24, A1; provider gap | `engine.ts` drive/advancePreparation and existing control gates | `b46e7fb` |
| AC-HANDBACK-03 — Active workspace and discrepancies (high risk) | Weak | 12/14 | H2/H6–H8, S1/S2, P19/P20 | `engine.ts` readPlan; `plan-reconciliation.ts` sourceDiscrepancies | `b46e7fb` |
| AC-HANDBACK-04 — Old completion cannot hide new phases (high risk) | Adequate | 8/8 | H1/H3–H5/H8–H10, A2/A3 | `engine.ts` readPlan/completion/admission; `plan-reading.ts` | `b46e7fb` |
| AC-FIND-01 — Reopening checks for added phases | Weak | 8/10 | D1/D2/D3 | `engine.ts` prepare/checkCompletedPlanOwned; `CompletedPlanCheck.svelte` | `b46e7fb` |
| AC-FIND-02 — Find plans outside the old worktree | Weak | 13/15 | D2/D3/D5/D10/D12, N1, F1 | `completed-plan-discovery.ts`; `completed-plan-sources.ts` | `b46e7fb` |
| AC-FIND-03 — Count actual unfinished work | Adequate | 13/13 | K1–K4, N2/N3; RC-01 | `completed-plan-accounting.ts`; `plan-reconciliation.ts` | `b46e7fb` |
| AC-FIND-04 — Unknown differs from no new work | Weak | 16/23 | D2/D4/D7–D11, F2–F5, K5, S3 | `completed-plan-discovery.ts`; `engine.ts` checkCompletedPlanOwned; browser refresh | `b46e7fb` |
| AC-OFFER-01 — New work is prominent | Weak | 9/12 | D2, K6, R1, F1 | `StateHeader.svelte`, `Complete.svelte`, `CompletedPlanCheck.svelte`; `underway-output.ts` | `b46e7fb` |
| AC-OFFER-02 — One action continues the plan (high risk) | Weak | 5/8 | C1/C4, F5, P25 | `CompletedPlanCheck.svelte`; `engine.ts` acceptContinuation | `b46e7fb` |
| AC-OFFER-03 — Changed proposal needs fresh choice (high risk) | Weak | 7/10 | R2, C1/C2/C4–C7 | `engine.ts` continuationCommand/acceptContinuation; continuation state and journal | `b46e7fb` |
| AC-CONTINUE-01 — Earlier completion stays intact (high risk) | Weak | 7/9 | C1/C4/C5/C8, K2/K7/K8 | `continuation-state.ts`; `engine.ts` activation/history | `b46e7fb` |
| AC-CONTINUE-03 — Ambiguous earlier changes (high risk) | Weak | 9/10 | D6, N2–N4, S4 | `plan-reconciliation.ts` scope comparison | `b46e7fb` |
| AC-CONTINUE-05 — Normal audits and delivery (high risk) | Adequate | 6/6 | C1/C8, P26, A3 | `engine.ts` audit routing/finalization; `continuation-state.ts` | `b46e7fb` |
| AC-CONTINUE-06 — Current delivery base (high risk) | Weak | 9/12 | C1–C3/C6/C7, D5, R3, K4/K9 | continuation readiness/sources/setup; engine activation | `b46e7fb` |
| AC-CONTINUE-07 — Prepare prerequisites first (high risk) | Weak; diagnostic limitation retained | 36/42 | V1–V5, E1–E11, Q1–Q4, R1/R4, M1, P1–P23, C3 | preparation documents/state/permissions/verifier; readiness and engine | `f149f48` |
| AC-CONTINUE-08 — Existing controls govern work (high risk) | Weak | 8/14 | C1/C3/C9/C10, R1, P1/P4/P14/P24/P27–P30 | engine activation/admission; setup; preparation permissions; billing/adapters | `b46e7fb` |
| AC-CONTINUE-09 — Separate early-merge choice (high risk) | Weak | 22/27 | R1, P25/P30–P35, C1/C5, F7 | continuation authority/readiness; engine grant; browser panel | `b46e7fb` |

Code paths without directories in this table are under `src/engine/`, except browser files under `view/src/` and `src/underway-output.ts`.

## Exact collected test index

Paths are repository-relative. `%s` names refer to every stated parameter variant in the source, subject to its platform marker. This index plus the per-part records identifies current assertions rather than historical validation conclusions.

### Handback and shared sources

- **H1** `src/engine/added-plan-handback.integration.test.ts` — `accepts an append on Verify, keeps the completed-phase choice, and automatically advances`.
- **H2** same file — `blocks a shared-checkout addition until documents are reconciled into the active workspace`.
- **H3** same file — `accepts split leaves at handback, judges the first descendant and preserves a pending pause across restart`.
- **H4** same file — `reconciles before accepting an old final pull request and starts the appended leaf automatically`.
- **H5** same file — `reconciles work appended as an audit settles before selecting another audit or final delivery`.
- **H6** same file — `holds a newly closed known-source phase, then advances automatically after safe reconciliation`.
- **H7** same file — `preserves stopped facts and refuses Resume when a required shared source is incomplete`.
- **H8** same file — `requires committed and published evidence for a newly externally Closed leaf`.
- **H9** same file — `refuses externally Closed work with an unchecked repository (inherited=%s)`.
- **H10** same file — `freezes the just-completed child's checked repository scope before a later parent addition`.
- **H11** same file — `accepts additions on an unfinished restart before selecting the next activity`.
- **H12** same file — `recovers legacy completion scope without adopting a %s historical phase`.
- **S1** `src/engine/plan-reconciliation.test.ts` — `distinguishes forward and reverse known closure changes from unchanged stale copies`.
- **S2** `src/engine/plan-sources.integration.test.ts` — `distinguishes a stale shared closure from new shared work, removal and requirement changes`.
- **S3** `src/engine/plan-reconciliation.test.ts` — `reports actual immutable accounting/proposal writer and reader capacity before any publication`.
- **S4** same file — `ignores emphasis, wrapping, checkbox status and historical closure metadata`.
- **B1** `src/server/added-plan-browser.integration.test.ts` — `shows accepted additions and a recoverable source discrepancy without launching work`.
- Additional original-conversation split coverage: `src/engine/engine.integration.test.ts` — `follows a phase that splits itself: judges its first child, then carries on with the next unclosed leaf`; `src/engine/codex-workflow.integration.test.ts` — `follows a phase’s own split through fresh Codex conversations and the final PR session using real Git`.
- **A1** `src/engine/audit-workflow.integration.test.ts` — `reinspects changed billing between delivery audit, test audit and final delivery`.
- **A2** same file — `retains a failed handback observation when an audit completion read is unavailable`.
- **A3** same file — `automatically reaudits material finalization changes and reuses the existing final pull request`.

### Discovery, accounting and readiness

- **D1** `src/engine/completed-plan-discovery.integration.test.ts` — `kiln run checks completed work before printing a conclusion and starts no session`.
- **D2** same file — `checks page mount, reload and button through the real browser while preserving history and no-launch`.
- **D3** same file — `checks restart, HTTP and repeated reads without work; persists history and joins concurrent requests`.
- **D4** same file — `rejects documents changed during an actual Git read and retains the earlier result`.
- **D5** same file — `selects remote additions over a baseline shared copy and detects divergent scope`.
- **D6** same file — `rejects removed, reopened, split and changed completed identities but permits a formatting rename`.
- **D7** same file — `preserves an earlier successful result after missing sources, invalid plans and failed origin reads`.
- **D8** same file — `does not establish legacy scope from today's checkout when completion evidence is missing or disagrees`.
- **D9** same file — `returns typed capacity through HTTP for %s without faulting mutation ownership or losing earlier evidence` (saved, Git, baseline, baseline publication, accounting, proposal, phases).
- **D10** same file — `reads decoded Markdown extensions from saved/Git sources, refusing missing and unsafe targets`.
- **D11** same file — `keeps a failed newly named repository origin read unknown through HTTP with earlier offer/history retained`.
- **D12** same file — `recovers legacy scope only from recorded immutable completion and survives deletion of old workspace and branch`.
- **K1** `src/engine/completed-plan-accounting.integration.test.ts` — `accounts for seven new leaves and unintegrated external work, then independently verifies integration without launching or rewriting history`.
- **K2** same file — `does not accept Closed-only, mismatched scope, conflicting references or a missing Kiln provenance receipt`.
- **K3** same file — `counts split leaves and numbering gaps, preserves renamed old scope, and does not invent work from assumptions`.
- **K4** same file — `requires every affected repository and preserves earlier results when a required origin becomes unreadable`.
- **K5** same file — `shares one enclosing discovery deadline across multiple real retained Codex scans and preserves earlier HTTP evidence`.
- **K6** same file — `shows distinct external accounting above history in the actual browser at desktop and narrow widths`.
- **K7** same file — `reuses a retained Kiln receipt only while fresh original provider history and immutable scope agree`.
- **K8** same file — `requires retained Claude history without changing its original receipt or session`.
- **K9** same file — `recognizes verified squash integration pairs and refuses unresolved or unrelated pairs`.
- **N1** `src/engine/rename-safe-plans.integration.test.ts` — `compares governing links across saved/Git filenames after immutable v%s migration` (1, 2).
- **N2** same file — `blocks inherited completed repository removal/replacement while allowing parent additions for remaining children`.
- **N3** same file — `rejects completed sibling reordering without changing parent session ownership, while accepting compatible additions`.
- **N4** same file — `keeps continuation ready after a linked rename with retained baseline=%s, preserving history and blocking real changes`.
- **F1** `src/engine/plan-source-feedback.integration.test.ts` — `keeps completed history with removed old artifacts through CLI/page/button discovery (delivery enabled %s)`.
- **F2** same file — `distinguishes new-repository %s failures from positive absence over HTTP`.
- **F3** same file — `projects uncertain completed-check publication as failed everywhere (post-write %s)`.
- **F4** same file — `holds stale offers after browser-local failures and recovers on successful retry at width %s`.
- **F5** same file — `never keeps No new phases found after a browser-local failed unchanged-plan refresh`.
- **F6** same file — `reconciles the explicitly supplied registered worktree through the CLI restart path`.
- **F7** same file — `retains the exact target grant across equivalent saved/base bytes, recheck, restart and Continue`.
- **R1** `src/engine/continuation-readiness.integration.test.ts` — `offers seven phases with local preparation under Continue and requires the existing target grant for develop` (macOS).
- **R2** same file — `binds a stable integrated offer and changes identity when relevant base/settings move`.
- **R3** same file — `does not mistake an earlier unmerged completion receipt for integrated prerequisite work`.
- **R4** same file — `keeps unavailable preparation blocked with exact recovery and no provider work`.

### Accepted continuation

All **C** aliases are in `src/engine/continuation-execution.integration.test.ts`.

- **C1** `accepts once from current bases, archives earlier completion and starts a fresh phase conversation`.
- **C2** `holds an accepted workspace when its base moves during setup and requires a new explicit choice`.
- **C3** `prepares every repository from its current base and retains a collision for an exact retry`.
- **C4** `offers Not now and a fresh choice in the real browser, then retains readable legacy delivery history`.
- **C5** `replays accepted work after restart, keeps current inspection scoped and refuses public internal actions`.
- **C6** `recovers actual controller death at the %s boundary without duplicate continuation or provider dispatch` (intent, acceptance, workspace, activation, provider; non-Windows).
- **C7** `fails closed on an uncertain %s write and reconciles its durable outcome on restart` (sidecar, acceptance, workspace-progress, integration-baseline, active-sidecar, activation).
- **C8** `finishes revised-scope audits and audit-added work, then preserves two distinct deliveries after a prior %s` (merge, squash).
- **C9** `requires fresh billing authority and carries no earlier paid approval into the new execution`.
- **C10** `keeps a requested pause across fresh-execution restart and resumes only the next unfinished phase`.
- **C11** `refreshes a moved delivery base without setup or provider dispatch`.

### Preparation

- **E1–E5** `src/engine/preparation-documents.test.ts`, respectively: `extracts the merge, exact source spans, shell-free verification`; `never extracts quoted/fenced preparation or silently ignores unsupported operands`; `retains literal quoted arguments without executing them`; `rejects shell/evaluation command %s`; `checks whole linked plan rows and ignores fenced table examples`.
- **E6–E11** `src/engine/preparation-document-contract.test.ts`, respectively:
  - E6 `retains every prerequisite in a multiple-phase First step without adding a whole-PRD audit dependency`.
  - E7 `keeps a single prerequisite when the First step ends with the whole-PRD test audit`.
  - E8 `requires preparation destinations to agree with %s and identifies its exact span` (dependencies, linked row, linked amendment).
  - E9 `retains verification directory and timeout at the documented boundary: $suffix` (default, explicit directory, 1 second, 86400 seconds).
  - E10 `blocks out-of-range verification timeout %s with its exact instruction and recovery` (0, 86401).
  - E11 `blocks $name verification with a supported replacement and source span` (missing, unsupported prose, unsupported subordinate instruction).
- **Q1–Q4** `src/engine/preparation-offer-contract.integration.test.ts`, respectively:
  - Q1 `refuses an unknown named preparation destination and gives the configured replacement without work`.
  - Q2 `resolves an abbreviated preparation revision to its independent full Git commit` (macOS permission profile).
  - Q3 `refuses an ambiguous seven-character preparation revision using two real Git commit objects`.
  - Q4 `invalidates the bound offer when %s instructions change before Continue` (preparation, verification; macOS permission profile).
- **M1** `src/engine/continuation-preparation-repositories.integration.test.ts` — `requires a valid preparation tuple in every affected repository without requiring PRD files in secondary sources`.

All **P** aliases below are in `src/engine/preparation-execution.integration.test.ts`, normally collected on macOS. They use real Git/native project checks/process inventory and deterministic provider peers; they do not certify another provider profile.

- **P1** `settles preparation, verifies its committed checkpoint and implements in the same conversation once`.
- **P2** `holds dependent implementation when engine check %s` (exit 3, sleep 3).
- **P3** `refuses a forged check claim without independently integrated source`.
- **P4** `holds ordinary Claude preparation on %s process evidence through restart, then retries safely` (alive, inventory, identity, operation, takeover).
- **P5** `holds Codex preparation before native checks while background inventory is unknown, then resumes the same thread`.
- **P6** `requires successful checks for both prepared repositories at one checkpoint`.
- **P7** `reconciles actual controller death at %s without duplicate checks or turns` (verification-intent, verification-process, verified-checkpoint, implementation-intent).
- **P8** `holds unacknowledged verification intent on restart instead of blindly repeating a check`.
- **P9** `recovers a positively known no-launch %s failure through ordinary controls` (environment, output, hooks, spawn, spawn_throw).
- **P10** `retains and recovers native ownership across $mode failure and restart (legacy failed=$legacyFailed)` (inventory, identity, checkpoint_read, checkpoint_changed × false/true).
- **P11** `holds unreconstructible native $mode evidence through Verify and Resume (legacy failed=$legacyFailed)` (legacy_obstacle, unknown_start × false/true).
- **P12** `discovers a real detached native descendant before %s failure and recovers safely` (checkpoint_read, checkpoint_changed).
- **P13** `keeps a damaged successful-check output unresolved rather than reusing or blindly repeating it`.
- **P14** `retains the verified checkpoint across pause/restart and admits implementation once`.
- **P15** `prepares every leaf of an external/carried split prerequisite (carried=%s) across repositories`.
- **P16** `evaluates external/carried two-repository split preparation with Codex controls (carried=%s)`.
- **P17** `rechecks every split prerequisite's source scope after preparation handback`.
- **P18** `reconciles append/split during preparation return before dependent implementation, split=%s`.
- **P19** `holds preparation return on a changed known source and accepts the reconciled plan after recovery`.
- **P20** `rechecks known sources after verification at the final preparation admission hook`.
- **P21** `rechecks retained process owners after native verification before implementation dispatch`.
- **P22** `verifies the exact granted delivery target before admitting implementation`.
- **P23** `invalidates a zero-exit check that mutates source/configuration`.
- **P24** `reuses an allocated zero-run preparation session after a fresh billing hold clears`.
- **P25** `shows the preparation offer, unavailable source, failed check, target grant and continuing states in Chrome`.
- **P26** `runs preparation through revised-scope audits, audit-added implementation and new delivery`.
- **P27** `honors existing Claude tool restrictions before any native project check`.
- **P28** `uses Claude's effective project validation environment without retaining its values`.
- **P29** `enforces Claude's %s hook on the actual native invocation` (deny, malformed, rewrite, timeout).
- **P30** `supersedes a legacy aggregate-only approval after known denied settings, preserving unknown-read retry`.
- **P31** `records an exact pending target grant without setup, adopts it once and replays without dispatch`.
- **P32** `permanently supersedes a target grant when scope moves, even if the earlier scope returns`.
- **P33** `retains irreversible grant decisions after incomplete %s discovery and restart` (candidate, base, fetch, repository, settings, source, provider_settings, permissions_unavailable, unavailable).
- **P34** `faults supersession publication and reconciles durable authority on restart (written=%s)`.
- **P35** `retains pending-grant ownership across pointer publication (written=%s)`.

### Native preparation contract evidence (second remediation batch)

All **V** aliases are normally collected in `src/engine/preparation-native-contract.integration.test.ts` on macOS; deterministic provider peers are scheduling evidence only.

- **V1** `runs a native check in its physical %s directory and retains that cwd` (default, explicit).
- **V2** `refuses a check directory escaping through a real symlink without native or implementation dispatch`.
- **V3** `runs two checks in one preparation item in written order at the same committed checkpoint`.
- **V4** `holds a real signalled project check and retains its incomplete output without implementation`.
- **V5** `holds a missing successful output record across restart without repeating checks or implementation`.

## Required-part assessment

The numbered groups below fix each denominator independently of the implementation. Covered groups map to the aliases above; uncovered groups are carried into To fix. High risk means a silent regression could spend money, lose/history-rewrite work, expand authority or authorize incorrect delivery. It does not assert a current production defect.

### Handback

- **AC-HANDBACK-01:** covered (1) manual Resume reread, (2) Verify/advance reread, (3) unfinished restart reread, (4) original-session additions, (5) separate/manual-source additions, (6) append, (7) split, (8) visible IDs and remaining count. H1–H3/H11, original split tests, B1 and P18 cover these engine/Git/UI outcomes. Uncovered (9) actual Claude manual handback, (10) actual Codex manual handback. Actual-provider proof is opt-in only. Ordinary functional risk; no Strong claim.
- **AC-HANDBACK-02:** covered (1) normal completion checks precede advance, (2) next eligible leaf, (3) audits, (4) delivery, (5) no per-addition Continue/approval/chat, (6) pause, (7) dependency checks, (8) account/usage/billing holds, (9) permissions, (10) stopped control cannot be released by a plan/page edit. H1/H3–H5, P14/P24/P26/P27, A1 and existing usage-limit/pause engine cases pin these. Uncovered (11–12) actual Claude/Codex returned handback automatically continuing. High risk from unintended provider work/spending.
- **AC-HANDBACK-03:** covered (1) active workspace without base merge, (2) committed evidence, (3) pushed evidence, (4) known shared additions, (5) forward/reverse closure changes, (8) explicit registered source, (9) paths/IDs/recovery, (10) block advance/completion, (11) required-source failure, (12) harmless stale source, (13) no import/overwrite/arbitrary-source search, (14) reconcile then automatic continuation. H2/H6–H8, S1/S2, F6, P19/P20 cover them. Uncovered (6) dependency-only change in known other source, (7) material same-ID existing-phase edit there. A changed requirements document in S2 does not prove changed phase semantics. High risk from lost/duplicated work.
- **AC-HANDBACK-04:** all eight covered: reconcile before (1) final audits, (2) delivery, (3) Complete; (4) invalidate stale scope evidence; (5) preserve completed receipts; (6) split parent excluded/first descendant judged; (7) external Closed needs evidence; (8) retain already-complete Resume choice without new-addition approval. H1/H3–H5/H8–H10/H12, A2/A3. High risk. Additional combinations of interrupted/running audits with simultaneous additions remain implied strengthening, not an Adequate gap. Riskiest mutation would disable completion/admission safety checks and is prohibited; see red checks.

### Discovery and offers

- **AC-FIND-01:** covered CLI repeat, page open, reload, button, success feedback, failure feedback, successful time, no implementation (D1–D3). Uncovered checking feedback while pending and absence of idle/clock/SSE-triggered discovery. Existing tests wait until checking ends; they cannot detect missing transient copy or extra automatic requests.
- **AC-FIND-02:** covered saved shared bytes, latest configured base, source path, exact revision, dirty additions/not-ready, missing old workspace, missing old branch, conflict explanation/withholding, stale shared + newer base selection, local-only readiness block, required decoded/local document set, equivalent saved/base rename, no checkout/index changes (D2/D3/D5/D10/D12, N1, F1). Uncovered explicit exclusion of arbitrary unregistered branches and remote base movement during extraction/publication. Saved-source movement in D4 proves a different input.
- **AC-FIND-03:** all thirteen covered: baseline identity; ordered actual unfinished leaves; exclude split parent; numbering gaps; filename rename; carried completed exclusion; verified external separation; unverified external separation; unresolved earlier separation; assumptions invent no phase; assumptions reopen no completed phase; inherited repository scope; split order/first-descendant ownership. K1–K4/K7–K9, N2/N3. RC-01 confirms the exact ordered array assertion fails. Other stated parts have not all been red-checked, so Adequate.
- **AC-FIND-04:** covered invalid/missing/conflicting plans; repository-read failures; saved-input movement; old history; earlier-result count label; earlier successful timestamp; retry; no false successful zero; missing/mismatching historical baseline; browser transport/malformed JSON/non-success-without-check; uncertain publication; one enclosing deadline (D2/D4/D5/D7–D11, F2–F5, K5, S3). Seven uncovered groups: unreadable saved-file I/O; remote revision movement; legacy baseline restore action rendered on page; shutdown cancellation; accepted exact 8 MiB boundary; accepted exact 10,000-phase boundary; first rejected 10,001-phase case. Existing generated over-phase test totals 10,002, and over-byte tests do not prove exactly-at-limit acceptance. Expand per-resource byte limits if remediation needs finer accounting; do not lower this grade by implied-only edges.
- **AC-OFFER-01:** covered prominent panel/history order, added count, ID, title, first phase, readiness, earlier/current distinction, terminal same discovery, page direction (D2, K6, R1, F1). Uncovered exact feature-header text; full multi-row order/completeness in browser and terminal; multiple-repository offer/history presentation. Engine array assertions do not catch a reversed/truncated rendered list.
- **AC-OFFER-02:** covered ready Continue, proposal recheck, Not now no-launch, visible Show continuation offer, unchanged completed-page no-new wording (C1/C4, F5, P25). Uncovered dismiss→reopen flow, dismiss→recheck flow returning to the offer, and unchanged-page exact successful time. The existing Show action proves a return path before recheck, not that it remains usable after every requested refresh. Recheck currently preserves the same proposal's local dismissal; this read assessment does not assert a delivery gap from the PRD's permissive “can show” wording. Prove the required return flow without silently strengthening that wording into an automatic-reveal requirement. High risk because Continue starts provider work.
- **AC-OFFER-03:** covered moved base, moved settings, refreshed explanation/second choice, identical command replay, same-proposal other-command replay, restart, interrupted acceptance/workspace/activation/provider boundaries (R2, C1/C2/C4–C7/C11). Uncovered changed governing bytes after render, changed eligible-leaf set after render, and genuinely stale second tab after a newer different proposal/execution. Prerequisite source/evidence movement should be included in this bound-proposal batch. High risk. Do not mutate admission/idempotency/authority guards for red checks.

### Continued execution

- **AC-CONTINUE-01:** covered phase results, sessions, links, times, overall activation, no completed reruns, external evidence (C1/C4/C5/C8, K2/K7/K8). Uncovered actual Claude/Codex fresh conversation admission: deterministic peers prove engine associations; only uncollected `continuation-provider-proof.mjs` proves the actual boundary. High risk from history loss or resuming earlier work.
- **AC-CONTINUE-03:** covered removed/reused/reopened/materially edited identity, inherited repository change, split/order change, rename, formatting/unchanged historical metadata, affected-ID explanation/no rerun (D6, N2–N4, S4). Uncovered dependency-only completed-leaf change. High risk because prior completion could be carried into incompatible work.
- **AC-CONTINUE-05:** all six covered: automatic remaining leaves, audit-added leaves, revised whole-PRD audits, rejection of old audit sufficiency, rejection of old PR sufficiency, separate new and prior delivery (C1/C8, P26, A3). Real Git/storage plus deterministic provider/GitHub peers reach the engine's audit/scheduling/delivery-record boundary. High risk. Riskiest red mutation would bypass current-audit delivery admission, prohibited under the skill. Adequate, not Strong.
- **AC-CONTINUE-06:** covered current PRD base, coherent committed docs, all-repository prerequisite verification, next eligible leaf, unrelated files, occupied-path preservation, no manual old-state deletion, partial setup retry, once-only activation/dispatch (C1–C3/C6/C7, D5, R3, K4/K9). Uncovered current secondary-base independent oracle and actual Claude/Codex fresh admission. C3 compares prepared HEAD with the implementation-generated proposal and seeds the secondary at its initial tip; an independently advanced secondary bare-origin head must be asserted directly. Ordinary setup's separately tested remote helper is a different path from continuation's `completed-plan-sources.ts`. High risk.
- **AC-CONTINUE-08:** covered Claude fresh billing/no paid-approval carryover, Claude pause/restart, workspace protection, restricted fresh grants, assigned-feature preparation without extra human quotation, Claude command/hook restrictions, all-repository setup, no broader merge/production/spending grant (C1/C3/C9/C10, R1, P1/P4/P14/P24/P27–P31). Six uncovered groups: nondefault selected Claude model/effort preserved; corresponding Codex selection; Codex fresh billing/account restrictions; Codex pause/resume; actual Codex native current policy/sandbox/approval controls; changed provider policy rechecked at preparation launch and final successful-check admission for both providers. Generic ordinary-workflow adapter/settings tests never enter fresh continuation activation. High risk.

### AC-CONTINUE-07: preparation part map

Each numbered item is a stated group from the PRD/design/3b and completion leaves 5/6/8. **C** is covered, **U** uncovered. A mixed group is U. The count is 36 C of 42 groups after the second bounded remediation batch; the first regrade was 33/42.

1. **C** ordinary normalized merge tuple, wrapping/emphasis and exact source spans — E1.
2. **C** quoted preparation ignored — E2.
3. **C** fenced preparation ignored — E2.
4. **C** multiple-prerequisite First step grammar — E6 pins both ordered IDs and the exact retained spans.
5. **C** trailing whole-PRD test-audit phrase does not invent a dependency ID — E6/E7 pin multi- and single-prerequisite results.
6. **C** parsed-dependency mismatch rejects — E2.
7. **C** available local unpushed source matches pinned revision — R1/M1.
8. **C** abbreviated revision resolves to full immutable ID; ambiguous abbreviation refuses — Q2/Q3 use an independently captured real Git SHA and two real colliding seven-character commit prefixes.
9. **C** sole-repository inference and explicit multi-repository bindings — E1/M1.
10. **C** tuple required in each affected repository; secondary source need not contain PRD — M1/P16.
11. **C** assigned-feature destination uses Continue authority — R1/P1.
12. **C** configured delivery destination needs exact current grant and verified integration — R1/P22.
13. **C** unknown named destination refuses — Q1 pins the exact target/replacement, blocked prerequisite, unchanged Git state and zero provider work.
14. **C** dependency/preparation/linked-row/amendment destination agreement — E8 tests matching explicit destinations and each contradictory location with exact span/recovery; E5 retains fenced-row exclusion.
15. **U — diagnostic limitation retained; Phase 9 cancelled** complete malformed/missing/contradictory blocker facts, exact spans and recoverable replacement instructions. E8/E10/E11 now pin destination/verification errors, exact spans and ordinary-prose recovery. Still missing complete malformed First-step opening, unsupported merge operands and missing/ambiguous repository/fact diagnostics; E2/E5 cover subsets.
16. **C** direct quoted argv preserved without expansion — E1/E3.
17. **C** shell operators/redirection/substitution/assignment/inline evaluation rejected — E4.
18. **C** explicit/default check directories and physical symlink-escape refusal — V1 pins the actual physical cwd through retained `pwd -P` output and invocation metadata; V2 commits a real escaping directory symlink during preparation after valid-source acceptance, then pins native checkpoint refusal, zero attempts and no implementation dispatch. E9 retains parsed definitions.
19. **C** default timeout 1800, minimum 1/0, maximum 86400/86401 — E9/E10 pin all five values, retained argv/span and exact rejection/recovery.
20. **C** missing/unsupported verification prose — E11 pins missing, unsupported Verify syntax and unsupported subordinate instructions with empty checks and supported replacement/recovery; R1 separately proves missing executable.
21. **C** preparation/verification instruction movement invalidates bound offer — Q4 changes each instruction in committed/published real Git after discovery, then asserts refreshed offer, stale-accept 409, unchanged completed identity/time and zero launch.
22. **C** unavailable source has specific recovery and no launch — R4.
23. **C** occupied workspace stops safely, preserves user bytes, retry — C3.
24. **U** actual Claude performs merge/commit/submission in preparation-only turn; P1's controller performs those effects.
25. **U** actual Codex complete preparation/native verification/implementation; P5 stops at cleanup and P16 is readiness.
26. **C** submission while provider runs cannot start native check/extra turn — P1/P3/P6 fixture assertions.
27. **C** ordinary/takeover Claude owned work settles before check and final dispatch — P4/P21.
28. **C** unknown Codex background inventory holds and same-thread recovery — P5; no actual native Codex verifier inferred.
29. **C** all repositories integrated; sequential real checks at one checkpoint; provider claim insufficient — P1/P3/P6/P15 retain the existing paths. V3 closes the first regrade's corrected ordering gap: one item has two real native checks, an external fixture-owned dependency marker requires first completion before the second starts, both exact outputs/check indices are retained, receipt times do not overlap and both receipts name the verified committed checkpoint.
30. **U** complete prepared-source eligibility: clean/committed/no conflicts, correct branch/HEAD/index, tracked/nonignored fingerprint.
31. **U** complete movement variants for executable bytes/environment/settings before and after checks/admission; P23 and source-ref movement test prove subsets.
32. **C** unsuccessful native outcomes — P2/P7/P9/P13 retain failure/timeout/spawn/ambiguous/damaged-output coverage. V4 adds an actual project SIGTERM, retained partial output and failed native result with no implementation. V5 deletes a successful output file during a pause, restarts, and pins unresolved recovery with the same single attempt and no repeat or implementation.
33. **C** durable intent/attempt precedes process; replay duplicates neither check nor turn — P7/P8.
34. **C** ambiguous launch/legacy unknown ownership holds through Verify/Resume — P8/P11.
35. **C** positively known no-launch failure recovers through ordinary controls — P9.
36. **C** inventory/identity refresh recovers after release — P10.
37. **C** native ownership survives checkpoint/source-read failure and restart, including scanner-found detached descendant — P10/P12.
38. **C** successful receipt reuse requires retained output/checkpoint; damaged output holds; unchanged pause/restart reuses — P13/P14.
39. **U** complete native permission variants at launch/admission for both providers: Claude ask/current-turn deny, unsupported hook kinds/async-once and Codex policy/environment/native sandbox; P27–P30 prove subsets.
40. **C** engine admits one same-conversation implementation turn after success through replay/pause/crash — P1/P7/P14. Actual-provider requirement remains U in 24/25.
41. **C** external/carried split descendants/repositories/Closed state; split owner first descendant gets implementation — P15–P17.
42. **C** returned preparation and final admission reconcile append/split and known sources — P18–P20.

### AC-CONTINUE-09: separate target authority part map

All 27 groups are stated; 22 covered. High risk because a delivery-base merge can trigger CI/CD before completion. The read assessment found these behaviors implemented; the five uncovered groups are evidence gaps.

1. **C** exact repository/branch action before Continue — P25 at desktop/narrow widths.
2. **U** this new panel's explicit existing-CI/CD-before-PRD-finishes warning. Other-screen wording tests do not prove it.
3. **C** fresh proposed execution only; no old authority transfer — R1/P31/C1.
4. **C** saved preferences unchanged — full settings equality in P31.
5. **C** grant starts no setup/provider work — P31/P25.
6. **C** separate later Continue action — P25.
7. **U** continuation-handler refusal matrix: malformed/stale execution/revision, wrong repository/branch, environment-qualified target, incomplete/unreadable scope. Generic active-run grant handler tests exercise another path.
8. **U** grant request under a current explicit denial refuses. P30 supersedes an existing legacy approval but does not attempt the denied new grant.
9. **C** identical grant command replay — P31/P35/F7.
10. **C** different command IDs reuse target approval without increment — P31.
11. **U** conflicting reuse of a grant command ID refuses. C5 proves acceptance ID conflicts, not grant conflicts.
12. **C** grant-only refresh does not invalidate approval — P31/F7.
13. **C** reserve/adopt exact single fresh UUID/grants — P31/F7.
14. **C** immutable non-grant scope excludes observation times and grant revisions — P31/F7.
15. **C** changed documents supersede — P32/P33(candidate).
16. **C** changed base supersedes — P33(base/fetch).
17. **C** changed identity supersedes — P33(repository).
18. **C** changed settings supersede — P33(settings).
19. **C** changed pinned source supersedes — P33(source).
20. **C** changed provider settings supersede — P33(provider_settings)/P30.
21. **C** positive movement plus incomplete observation remains irreversible through restoration/restart/replay — P32/P33.
22. **C** unknown unchanged source/permission read invents no movement or work — P33(unavailable/permissions_unavailable)/P30.
23. **C** equivalent saved/base bytes retain exact grant through recheck/restart/Continue — F7, including missing sidecar failure observations.
24. **C** uncertain pointer publication faults, restart reconciles — P35.
25. **C** uncertain supersession publication cannot revive approval — P34.
26. **C** post-adoption replay resolves original operation, no dispatch/current-grant change — P31.
27. **U** multiple independent required targets/grants/adoption. Current continuation fixtures use one target; generic multi-repository Start tests do not prove pending continuation authority.

## Red checks

The audit cap is about ten existing-evidence checks. The initial assessment ran one safe existing-evidence check. The first remediation batch added the safe diagnostic/result checks below; new-test checks do not consume the existing-evidence cap. No check remains unfinished. Only Adequate rows need sampling; Weak rows go to remediation. Safety restrictions take precedence over high-risk mutation coverage.

| Check | Criterion and intentional break | Exact mapped run and result | Restoration |
|---|---|---|---|
| RC-01 | AC-FIND-03: reverse only the display/result `added` array in `discoverCompletedPlan`; proposal, accounting and admission guards unchanged | K3 alone under integration config, `--maxWorkers=1`: twice failed the exact ordered-ID assertion at line 67, expected `[9b,9a,10,11,12,13,14]`, received reverse. Each run took about 2.4 seconds. After restore, the same named test passed (2.44 seconds). | Original copied outside repo before edit; mutated SHA-256 checked before restore; restored byte-identical and marker RESTORED appended. No mutation committed. |

### First remediation batch (2026-10-31 UTC)

| Check | Safe intentional break | Exact mapped evidence and result | Restoration |
|---|---|---|---|
| RC-02 | Drop the first prerequisite from the extracted result metadata, leaving parsing/dependency rejection guards unchanged. | E6/E7 fail the ordered prerequisite assertions twice; each also failed alone. | Original outside repository, last mutated SHA-256 checked, byte-identical restore; all 14 E6–E11 cases green afterward. |
| RC-03 | Add one only to emitted diagnostic line numbers; rejection decisions, command/timeout/destination guards unchanged. | Each of E8's three variants, E10's two variants and E11's three variants failed its exact diagnostic/span assertion twice in individual named runs. This proves diagnostic specificity, not that bypassing a refusal is safe. | Original outside repository; checksum matched before byte-identical restore and green 14-case run. |
| RC-04 | Replace the unknown-target diagnostic's reported target with `wrong-target`, preserving the refusal. | Q1 failed the exact named-target/recovery assertion twice alone. | Checksum-checked byte-identical restore. |
| RC-05 | Replace only the unresolved-revision diagnostic's reported pin with `wrong-revision`, preserving Git resolution/refusal. | Q3 failed the exact ambiguous-pin/recovery assertion twice alone. | Checksum-checked byte-identical restore. |
| RC-06 | Replace the final returned proposal's full source-revision metadata with forty zeroes, after all source/permission evaluation. No source/authority/admission guard changed. | Q2 failed its independently captured full-SHA assertion twice alone; readiness still reached the mapped result. | Checksum-checked byte-identical restore; all five Q cases green together afterward (14.01 seconds). |

Red-check logs: `/private/tmp/kiln-continuep-redcheck-{grammar,diagnostics,unknown-target,ambiguous-pin,full-pin}-*.log`. Backups, last hashes and RESTORED entries are in shared session marker `.agent-sessions/2026-10-31-codex-continuep-test-audit.log`. Neither source file has a permanent diff.

**red check not possible: safety exceptions.** E9's directory/timeout values and E10's refusal boundaries cannot be broken by changing configuration or path/timeout safety guards under Step 3. RC-03 red-checks their diagnostic spans only; it does not claim their guards were disabled. E8/Q1/Q3 refusal decisions likewise retain their safety guards; diagnostic failures prove required blocker detail. Q4's actual rejection decision cannot be red-checked without bypassing stale-proposal admission, a guard deciding whether setup/provider work starts. These are safety exceptions, not unfinished red checks, and do not support Strong. The new positive/result assertions and restored normal runs still support the independent read grade.

RC-01 logs: `/private/tmp/kiln-continuep-redcheck-find03-{1,2}.log`; restore passed in the named Vitest run. The shared session marker names the original backup and checksum.

- **AC-HANDBACK-04:** red check not possible for the riskiest stale-finalization part without disabling reconciliation/completion admission, a safety guard deciding whether provider/delivery work starts. Keep read grade capped at Adequate.
- **AC-CONTINUE-05:** red check not possible for the riskiest stale-audit acceptance part without bypassing current-audit delivery admission, also a prohibited safety guard. Keep Adequate.

No green mutation, widening, unexplained failing mapped test or unrestored source remains. One passing restoration run is required evidence; the many tests excluded by `-t` in this targeted run are intentional selection, not permanently skipped evidence.

### Second remediation batch (2026-10-31 UTC)

| Check | Safe intentional break | Exact mapped evidence and result | Restoration |
|---|---|---|---|
| RC-07 | Replace only completed attempts' retained directory metadata after native checks finish; actual invocation/cwd and containment guards unchanged. | Each V1 default/explicit case fails its exact retained-directory assertion twice alone. Actual `pwd -P` output still supplies an independent physical-cwd oracle. | Original copied outside repository; last mutated SHA-256 matched before byte-identical restore. |
| RC-08 | Reverse only the settled receipt array after both native checks finish, leaving actual execution, checks and admission unchanged. | V3 fails its exact ordered receipt assertion twice alone. Both real checks still complete. An earlier check-index increment was too broad: schema validation rejected the record before an assertion, so it was not counted; it was restored before this narrower check. | Checksum-checked byte-identical restore. |
| RC-09 | Replace only the symlink-containment refusal's diagnostic prefix; physical containment refusal unchanged. | V2 fails the exact blocker assertion twice alone. | Checksum-checked byte-identical restore. |
| RC-10 | Replace only the failed native result's reason wording; signal, exit status and unsuccessful outcome unchanged. | V4 fails its exact failed-receipt assertion twice alone after actual project SIGTERM. | Checksum-checked byte-identical restore. |
| RC-11 | Replace only the missing-output recovery reason; output validity/reuse refusal and no-repeat behavior unchanged. | V5 fails its exact unresolved-receipt/recovery assertion twice alone. | Checksum-checked byte-identical restore. |

The entire six-case V1–V5 file passed together after restoration. New checks do not consume the existing-evidence red-check cap. Logs: `/private/tmp/kiln-native-redcheck-{cwd,order,escape,signal,missing-output}-*.log`; checksum/backups/RESTORED entries are in `.agent-sessions/2026-10-31-codex-continuep-native-test-audit.log` in the shared checkout. The verifier has no permanent diff.

**red check not possible: safety exceptions.** Physical directory selection/containment, whether required checks run before implementation, signal-failure admission and output-validity/reuse guards decide where/whether native/provider work writes. Step 3 prohibits disabling those guards. RC-07/08 prove retained result specificity; RC-09–11 prove blocker/recovery specificity. They do not claim to disable those safety decisions or establish Strong. The real successful/negative boundary cases and independent read support the covered groups.

The initial outer-sandbox test run could not read process inventory and was stopped; it is not evidence. The first symlink fixture was already unsafe in the identified source, so discovery correctly blocked it before native verification. The final fixture starts from valid source, then commits the physical escape during preparation to reach the intended native checkpoint; no product code or assertion was weakened.

## Retained coverage gaps at closeout

### Missing

None. Every active criterion has some collected evidence.

### Failing mapped tests

Six exploratory recovery-diagnostic cases confirmed missing implementation and were removed under the delivery-gap rule; their exact reproduction is retained in Phase 9. No committed mapped test was found failing. Deliberate RC-01–RC-11 assertion failures were restored; the exact mapped tests passed afterward. The initial dependency-destination fixture used unsupported dependency grammar; changing it to the documented parenthetical annotation resolved that test-input error without changing implementation or assertions.

### Red checks still to run

None. The explicit guard/configuration prohibitions above are safety exceptions, not deferred mutation tasks. The only other Adequate row, FIND-03, received RC-01. The remaining Weak rows are retained as coverage limits; no additional mutation or remediation work is planned.

### Weak

This historical ordering records the uncovered groups. Doug ended the remediation queue; these are limitations, with no scheduled work or successors. Their evidence grades remain unchanged.

1. **AC-CONTINUE-08 (8/14, high risk):** assert nondefault per-provider selections at fresh launch; Codex billing/pause; native current policy/sandbox; changed policy after a successful check and before implementation admission. Real provider/policy boundary evidence must accompany deterministic control fixtures.
2. **AC-CONTINUE-09 (22/27, high risk):** pin panel CI/CD disclosure; real HTTP continuation-specific invalid/stale/wrong/environment/incomplete-scope and denied-permission refusals; conflicting grant command ID; two independent required targets retained across restart and adopted together under the exact reserved execution. Assert unchanged settings/workspaces and zero work until separate Continue.
3. **AC-CONTINUE-06 (9/12, high risk):** independently advance secondary origin, pin proposal and prepared HEAD to captured external SHA; collect both actual-provider fresh admissions. Share setup with CONTINUE-01 where practical.
4. **AC-OFFER-03 (7/10, high risk):** real-Git/HTTP changed governing bytes and eligible sets/prerequisite evidence after render; two genuine stale tabs after a different accepted scope/execution. Assert refreshed rows/reason and no extra execution/dispatch. Do not weaken admission guards to red-check.
5. **AC-OFFER-02 (5/8, high risk):** extend actual Chrome Not now test through reload/recheck and return, with zero work until Continue; unchanged page exact last-success datetime. Preserve the requirement's actual wording about returnability.
6. **AC-HANDBACK-02 (10/12, high risk):** collect actual Claude/Codex handback-to-next-leaf proof normally. Same fixture can cover HANDBACK-01.
7. **AC-HANDBACK-03 (12/14, high risk):** parameterize real-Git known-source discrepancy/reconcile with dependency-only and material same-ID phase changes; assert affected phase, no advancement, then committed/pushed reconcile and automatic continuation.
8. **AC-CONTINUE-01 (7/9, high risk):** collect actual Claude/Codex fresh-conversation proof with immutable earlier history; reuse CONTINUE-06 proof.
9. **AC-CONTINUE-03 (9/10, high risk):** change completed dependency only; assert affected ID, blocked/no rerun, unchanged earlier receipts. Share scope-comparison setup with HANDBACK-03.
10. **AC-FIND-04 (16/23):** actual saved-file I/O failure, remote movement, shutdown cancellation, browser legacy restore action, exact-limit/first-over-limit cases. No additional production access needed.
11. **AC-OFFER-01 (9/12):** exact header, complete ordered multi-row browser/terminal list, multi-repository history/offer page.
12. **AC-FIND-01 (8/10):** hold actual browser response, assert pending feedback/disabled action; count requests during idle/clock/SSE reconnection without adding arbitrary sleeps.
13. **AC-FIND-02 (13/15):** unrelated divergent branch must not be read/selected; move real origin revision mid-read, assert source_changed/earlier-result and no offer. Share movement setup with FIND-04.
14. **AC-HANDBACK-01 (8/10):** collect both actual-provider manual-return append/split/remaining-count proof; share with HANDBACK-02.
Only AC-CONTINUE-07 has remediation attempts (two), preserved in the implementation-limitation history below. All other rows retain the initial assessment and have no remediation attempt. Do not count the initial assessment or an unchanged grade carried forward as a failed attempt.

### Strong, if asked

High-risk AC-HANDBACK-04 and AC-CONTINUE-05 are Adequate. More exhaustive implied-state combinations and safe value-only mutations can strengthen their evidence, but forbidden admission/permission guard mutations must never be used. This was optional strengthening under the former audit plan; no strengthening work is scheduled.

## Retained implementation limitation

**AC-CONTINUE-07:** some malformed or contradictory preparation instructions show generic replacement values or no usable replacement example. Existing refusals and exact error locations remain in place. [The cancelled Phase 9 record](phase-9-preparation-recovery-diagnostics.md) preserves reproduction details; this wording gap is not scheduled for implementation. The separate provider/source/configuration/permissions evidence gaps also remain documented, without claiming a demonstrated unsafe-launch defect.

### Preserved preparation remediation history

**AC-CONTINUE-07 (36/42, high risk; second-attempt stuck state followed by new direction):** six U groups remain: **15, 24, 25, 30, 31, 39**. Remaining work is the complete extraction diagnostic matrix, source eligibility and movement matrix, native permission variants, and normally collected supported actual Claude/Codex preparation proof; this work reached the stuck rule and is now authorized only under Doug's revised approach below. Reuse generated disposable repositories, qualified versions and existing scripts. A manually rerun opt-in script does not close its normal-collection gap. **tried 2026-10-31:** eight groups closed by E6–E11/Q1–Q4; independent fresh assessor still found the nine named groups incomplete, including the corrected prior ordering overcount in group 29. This is the first below-target remediation regrade, not stuck. **tried 2026-10-31 (second):** V1–V5 close native directory/symlink, within-item sequential-check and signal/missing-output groups 18/29/32. Independent fresh regrade remains Weak, 36/42; complete diagnostics, actual Claude/Codex paths, complete source eligibility, movement and permissions remain unproved. **stuck:** the second below-target remediation regrade triggers the skill's stop rule. No successor works this row until Doug directs a different approach, clarifies its requirement or explicitly accepts this named high-risk row. No acceptance has been given. Doug subsequently directed the revised approach below, authorizing further work under that approach without erasing either attempt.

The current discovery adds no remediation attempt: the coherent pass was interrupted by confirmed missing implementation before regrade. AC-CONTINUE-08 remains unchanged at 8/14 with no remediation attempt.

## User-directed closeout

Doug ended the audit/remediation chain in this chat, `01a18fba-5b8a-7642-8124-37692cfad927`, on 2026-10-31 UTC:

> Okay, so let's stop doing the audits at this point then. If there are any remaining gaps that are anything that's even worth documenting, then I guess let's document them and let's not launch any more phases or audits. So let's wrap the whole thing up and commit, push, and merge to develop and then install the thing so that I can use it locally.

This later instruction supersedes every earlier next-phase, audit, regrade and successor-launch directive below and in linked records. Phase 9 is cancelled without being implemented; leaves through Phase 8 retain their original Closed lines. Remaining Weak evidence and the diagnostic limitation are documented rather than upgraded or silently treated as proven. The track has no remaining planned implementation/audit child. Scoped documentation publication to develop and local packaged installation are authorized in this chat; main/release, public npm publication and unrelated work remain outside scope.

The material limits are: actual Claude/Codex workflows have historical disposable proof but are not all collected in the regular provider tier; preparation source/configuration/permission and continuation authority/replay variants are not exhaustively pinned; some known-source/dependency and discovery/offer UI/limit variants remain unproved; and malformed preparation recovery messages can omit known facts. Exact criterion/test details and both prior attempts remain above/below. No further acceptance, review or audit gate is requested.

### Final delivery state

Local installation is complete: the existing npm-global package was updated from the exact archive below, `~/.local/bin/kiln` resolves through its existing symlink to `~/.npm-global/lib/node_modules/@ensodynamics/kiln/dist/cli.js`, all 301 archive files match the installed files byte-for-byte, and root help plus `preparation submit --help --json` pass. Version remains `1.0.0`; this is local development installation, with no main merge, public release or npm publication. Install/smoke logs are `/private/tmp/kiln-closeout-global-install.log` and `/private/tmp/kiln-closeout-installed-{help.txt,preparation-help.json}`.

Publication remains blocked. After Doug's explicit current-chat closeout instruction, automatic approval review again rejected `git push origin HEAD:develop`, stating that the approval was only in an untrusted transcript and trusted authorization for that exact shared-branch push was absent. No alternate route was attempted. Scoped documentation commits remain local pending resolution of that enforcement event. Remote development integration was not claimed, and the divergent shared checkout/unrelated unpublished `d86331f` remains untouched. The audit/phase chain is stopped regardless of publication state; no successor is prepared for launch.

### Local installation verification at closeout

`npm run build` passed with unchanged implementation. The exact archive built by `scripts/pack-release.mjs` is `/private/tmp/kiln-closeout-local-install/ensodynamics-kiln-1.0.0.tgz`, SHA-256 `7eeace5efff78890795b674799bc1779fa9888fc241e0c3a66320acf060fa9a3`. `KILN_PACKAGE_TARBALL=<that archive> npm run test:package` passed all eight installed-package cases in 29.33 seconds. Logs: `/private/tmp/kiln-closeout-local-build.log` and `/private/tmp/kiln-closeout-package.log`. This verifies the local installation candidate; it is not another audit or a new claim about the remaining coverage gaps. All closeout repo edits are documentation-only; the prior full verification evidence remains above/in the historical record.

## Historical diagnostic discovery and revised approach

The sections below preserve what the audit established and previously planned. Their implementation/audit/successor instructions were superseded by Doug's closeout above.

### Confirmed recovery-diagnostic delivery gap (2026-10-31 UTC)

Current chat `01a18fba-5b8a-7642-8124-37692cfad927` read the full canonical record and revised direction before work. Requirements and history checks plus independent assessor `boundary_assessor` confirmed that design Preparation document contract requires ordinary-prose replacements using known values; `extractPreparation` emits generic values or no replacement across multiple error paths. The requirement and messages both originated in `312bca3`; no intentional exception or superseding requirement was found.

Six exploratory parser cases, named and reproduced in Phase 9, failed their exact recovery assertion twice against unchanged implementation (`feb514a`), while every refusal remained intact. Logs are `/private/tmp/kiln-recovery-diagnostics-{red,confirmed-red}.log`. An exploratory three-message formatter made those six cases and the 24 existing parser cases pass, but the independent case walk showed it did not complete the common diagnostic contract. It was removed rather than committed as a partial fix. Final product code is byte-identical to HEAD, and the failing test was removed under the delivery-gap rule; its local copy and complete self-contained reproduction are in Phase 9. No permanent source, test, shared fixture, runner, requirement or provider-profile change was made. No broad suite was run for this documentation-only result. This is a delivery finding, not a red-check mutation, partial regrade, third attempt, acceptance or attempt reset.

The complete recovery contract needs one bounded implementation/review pass across extraction, verification and readiness presentation rather than continued test-only remediation over known missing behavior. Phase 9 owns only that existing requirement. Independent document review confirmed the bounded existing scope, preserved attempts and unchanged rows; local Markdown links and conflict-marker checks passed. All 17 other criterion rows were compared byte-for-byte with HEAD. Its fresh delivery audit must establish current clean coverage before the preparation/control audit resumes; unchanged criterion grades and both exact attempts remain intact.

### Historical publication enforcement stop (2026-10-31 UTC)

Scoped documentation was committed in `4010e74`. Automatic approval review rejected `git push origin HEAD:develop`, first because it found no trusted exact authorization and then, after direct `read_thread` verification of Doug's actual source-chat approvals, because it treated those transcript/tool approvals as untrusted. The verified messages were `01a18e5e-c173-7a03-b218-ad132fed7594` in `01a18e16-9c76-7633-a756-e9da8eb564f8` and `01a18e84-8a35-7c72-8b3a-f82ca5300fd3` in `01a18e5f-d4b8-7840-940f-0eaceee86860`. Read-only checks confirmed origin is `https://github.com/EnsoDynamics/kiln.git`, remote develop is `feb514a`, and the proposed publication is a fast-forward containing only this chat's scoped documentation.

No alternate push or indirect execution was attempted. This is a real enforcement stop, not a voluntary publication hold or an audit acceptance. Doug subsequently gave explicit current-chat authorization to commit/push/integrate to develop and install locally in the closeout quote above, supporting another normal push attempt; the final delivery state above records that automatic review still rejected it. His later direction also cancelled the prepared Phase 9 successor; it must never be launched. The shared checkout's unrelated unpublished `d86331f` remains outside this scope.

### Doug's revised direction after the second regrade

On 2026-10-31 UTC in source chat `01a18f8e-e1b4-7701-8938-59a51eceaa15`, Doug answered the stuck-row question:

> I don't really understand the options well enough to advise you. So I would say that you should rethink the entire situation, try to zoom out and come up with the best plan. And whatever you think is the plan that you are the most highly confident in, please proceed with that. Ultimately, we just want to be able to ensure that we can test this stuff to the best of our ability, but we don't need to get crazy with it. If you're really spinning your wheels on just test coverage here, then maybe what we've done is good enough.

This is direction to use a different approach, not explicit acceptance of this named high-risk row. It releases the stuck hold for the approach below; it does not reset either regrade or let the audit silently count unproved parts as covered.

**Revised approach:** stop the repeated tiny preparation batches. Take the remaining six preparation groups together with overlapping existing-controls evidence as one coherent boundary pass. Reuse the already implemented disposable proof flows, prioritize unsafe-launch/authority and lost-evidence regressions, and cover the stated cases without expanding implied permutations or pursuing Strong. In particular, `preparation-provider-proof.mjs` already performs actual Claude/Codex preparation, native verification and same-conversation implementation, with selected model/effort assertions. Collect those flows through the existing regular authenticated provider test tier (`test:live-proof`), keeping its current qualified profile and core `verify` free of authenticated provider calls; a fresh manual script run alone remains insufficient collected-test evidence. Add targeted normal native tests for the remaining source/configuration/permission boundaries and document-parser blockers using existing isolated fixtures. Do not regrade AC-CONTINUE-07 after another deliberately partial micro-batch; complete the coherent pass, independently regrade the worked criteria, and report any material evidence limit plainly. Preserve existing denominators and unchanged grades. Any further below-target result retains its history and needs honest disposition under the skill; Doug has not accepted gaps.

Each new/strengthened test must first fail for the requirement it pins, without breaking forbidden safety guards; restore all changes made for red checks. A fresh assessor regrades the worked row. Test/code edits require full `npm run verify` and `npm run test:package` with implementation/build output frozen throughout broad integration. Keep current provider/profile limits; this audit certifies no new platform or detached/remote-effect containment.

No redundant baseline suite was run before remediation. The first batch added 14 extraction cases and five real-Git offer cases, all passing after restoration. Full commit gates: `npm run verify` passed: zero blocking high/critical dependency findings; lint and TypeScript/Svelte checks passed with zero errors/warnings; 705 unit/component cases, 14 release cases and 18 Codex contract cases passed; all 109 integration files passed (1329 cases, three inherited/platform skips) in 2020.86 seconds. `npm run test:package` then passed all eight installed-package cases in 30.88 seconds. Logs: `/private/tmp/kiln-continuep-verify.log` and `/private/tmp/kiln-continuep-test-package.log`. Source freeze manifest `/private/tmp/kiln-continuep-source-freeze.json` covers implementation, tests, scripts, prompts, view and package/runner inputs; all 464 source and 266 build hashes matched after broad integration; all source hashes also matched after package prepack rebuilt the output. No mutation or build edit overlapped broad integration. That test-only output retained the then-current clean delivery assessment.

Second-batch full commit gates at `f149f48`: the restored V1–V5 file passed all six cases together in 59.51 seconds. `npm run verify` passed: zero blocking high/critical dependency findings; lint and TypeScript/Svelte checks passed with zero errors/warnings; 705 unit/component cases, 14 release cases, 18 Codex contract cases; all 110 integration files passed (1335 cases, three inherited/platform skips) in 2137.58 seconds. Overall verify took 2165.97 seconds. `npm run test:package` passed all eight installed-package cases in 31.47 seconds (31.84-second command wall time). Logs: `/private/tmp/kiln-native-restored.log`, `/private/tmp/kiln-native-verify.log`, `/private/tmp/kiln-native-package.log`. All 530 source hashes and 266 build hashes matched after broad integration; no mutation or source/build edit overlapped that run. Source/build manifests: `/private/tmp/kiln-native-{source,build}-freeze.json`.

The temporary gate helper's extra post-package assertion initially rejected a browser asset hash/name and index change. Both test commands had already passed. This was a cross-environment comparison: local Vitest code sets `NODE_ENV=test`, and package `npm pack` inherits it into prepack. A controlled `NODE_ENV=test npm run build` reproduced all 266 package-prepack hashes exactly; an ordinary build with NODE_ENV unset restored all 266 integration-build hashes exactly. All 530 source hashes still matched. Logs: `/private/tmp/kiln-native-{test-env,production}-build.log`; package-build manifest `/private/tmp/kiln-native-package-build.json`. The helper's overstrict comparison was explained, not treated as a product/test failure or silently suppressed. No implementation, governing requirement or shared test setup changed in that batch; the clean delivery assessment remained current until the later Phase 9 gap discovery.


If a new required test exposes a delivery defect, confirm it and use test-audit's conflict/shipped-behavior check. Small authorized implementation fixes get deliverable review, independent regrade and a fresh clean whole-PRD delivery audit before affected test reassessment; larger missing implementation gets a completion leaf and its own implementation chat, then fresh delivery audit, then affected test reassessment. Requirements changes also require fresh delivery assessment. One implementation leaf per chat. Test-only and audit-record-only edits retain the existing clean delivery assessment.

Historical pre-closeout target (superseded by the user-directed closeout): every active criterion at least Adequate or explicitly accepted by Doug, no pending required red check, no delivery wait, every planned implementation leaf closed and a current clean whole-PRD delivery audit. The recorded evidence is unchanged; no claim that this historical target was reached is made.
