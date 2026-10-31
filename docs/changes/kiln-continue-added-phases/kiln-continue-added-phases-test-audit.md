# Test audit: Kiln Continue Added Phases

**Status:** 15 to fix (AC-CONTINUE-07, AC-CONTINUE-08, AC-CONTINUE-09, AC-CONTINUE-06, AC-OFFER-03, AC-OFFER-02, AC-HANDBACK-02, AC-HANDBACK-03, AC-CONTINUE-01, AC-CONTINUE-03, AC-FIND-04, AC-OFFER-01, AC-FIND-01, AC-FIND-02, AC-HANDBACK-01); 0 red checks pending; 0 waiting on delivery; 0 accepted. Three criteria are Adequate. Initial assessment complete; remediation not started.
**Last audit:** 2026-10-31 UTC, whole PRD, at `b46e7fb899864de601cf2f9db6d1869411a98418`.
**PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md).
**Requirements:** [single technical design](kiln-continue-added-phases-technical-design.md), [assumptions](kiln-continue-added-phases-assumptions.md), every closed leaf in the [phase plan](kiln-continue-added-phases-phase-plan.md).
**Delivery assessment:** [clean whole-PRD delivery audit after Phase 8](kiln-whole-prd-delivery-audit-after-phase-8.md), implementation `c21e655`.

This is the governing test-audit record for this PRD. Its descriptive filename follows the user's documentation naming instruction. Successor test-audit chats update this file in place rather than creating a second `test-audit.md`.

## Scope and evidence rules

All 18 active criteria are built and assessed. AC-CONTINUE-02 is retired into AC-CONTINUE-06/07; AC-CONTINUE-04 is retired into AC-CONTINUE-08/09. Neither retired label is graded. No active criterion is excluded as person-checked, superseded, not built, or accepted. CONTINUE-001/002 retain their declared proposed status; no product assumption changed.

Three independent fresh readers assessed groups of at most four related criteria, deriving required parts from the PRD/design/assumptions and applicable original/completion leaves before opening tests. The complex preparation criterion had its own assessment. The primary reader confirmed collection, representative assertions, source paths and red-check safety. Counts below use stated observable groups: a group is uncovered if one of its stated variants remains unproved. Implied edges do not reduce Adequate to Weak. No criterion is Strong because every stated part has not been seen to fail under a safe discriminating mutation.

`npm test` collects non-integration `src/**/*.test.ts` and `view/src/**/*.test.ts`. `npm run verify` also builds and collects `src/**/*.integration.test.ts`, plus release and Codex contract checks. `npm run test:package` collects installed-package tests. Native preparation cases are enabled on this macOS checkout and macOS validation, skipped on unsupported platforms; those skips do not certify other profiles. Historical actual-provider proof runs remain valuable delivery evidence, but their opt-in scripts are not collected by these test commands or CI and therefore do not establish a current test-audit grade. In particular, `added-plan-provider-proof.mjs`, `continuation-provider-proof.mjs` and `preparation-provider-proof.mjs` under `scripts/proof-run/` are not invoked by the normal commands, including `test:live-proof`. Deterministic peers prove engine scheduling/storage contracts; they cannot alone prove actual providers obey preparation-only turns or start fresh native conversations.

All Git writes in mapped integration fixtures target generated disposable repositories and local bare origins. HTTP/browser coverage uses the actual local server and Chrome. Native checks execute real project commands under qualified local controls. No production check or actual-provider launch was performed by this audit. No implementation/requirements/test file changed permanently. This is a fresh assessment, not a regrade of remediation.

## By criterion

Test aliases resolve to exact collected names in the next section. Every Checked entry is 2026-10-31 UTC at `b46e7fb`.

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
| AC-CONTINUE-07 — Prepare prerequisites first (high risk) | Weak | 26/42 | E1–E5, R1/R4, M1, P1–P23, C3 | preparation documents/state/permissions/verifier; readiness and engine | `b46e7fb` |
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

Each numbered item is a stated group from the PRD/design/3b and completion leaves 5/6/8. **C** is covered, **U** uncovered. A mixed group is U. The count is 26 C of 42 groups.

1. **C** ordinary normalized merge tuple, wrapping/emphasis and exact source spans — E1.
2. **C** quoted preparation ignored — E2.
3. **C** fenced preparation ignored — E2.
4. **U** multiple-prerequisite First step grammar.
5. **U** trailing whole-PRD test-audit phrase does not invent a dependency ID.
6. **C** parsed-dependency mismatch rejects — E2.
7. **C** available local unpushed source matches pinned revision — R1/M1.
8. **U** abbreviated revision resolves to full immutable ID; ambiguous abbreviation refuses.
9. **C** sole-repository inference and explicit multi-repository bindings — E1/M1.
10. **C** tuple required in each affected repository; secondary source need not contain PRD — M1/P16.
11. **C** assigned-feature destination uses Continue authority — R1/P1.
12. **C** configured delivery destination needs exact current grant and verified integration — R1/P22.
13. **U** unknown named destination refuses.
14. **U** complete dependency/preparation/linked-row/amendment destination agreement (E5 covers linked table only).
15. **U** complete malformed/missing/contradictory blocker facts, exact spans and recoverable replacement instructions (E2/E5 cover subsets).
16. **C** direct quoted argv preserved without expansion — E1/E3.
17. **C** shell operators/redirection/substitution/assignment/inline evaluation rejected — E4.
18. **U** explicit/default check directories and physical symlink-escape refusal.
19. **U** default timeout 1800, minimum 1/0, maximum 86400/86401.
20. **U** missing/unsupported verification prose (R1 proves missing executable, a different boundary).
21. **U** preparation/verification instruction movement invalidates bound offer.
22. **C** unavailable source has specific recovery and no launch — R4.
23. **C** occupied workspace stops safely, preserves user bytes, retry — C3.
24. **U** actual Claude performs merge/commit/submission in preparation-only turn; P1's controller performs those effects.
25. **U** actual Codex complete preparation/native verification/implementation; P5 stops at cleanup and P16 is readiness.
26. **C** submission while provider runs cannot start native check/extra turn — P1/P3/P6 fixture assertions.
27. **C** ordinary/takeover Claude owned work settles before check and final dispatch — P4/P21.
28. **C** unknown Codex background inventory holds and same-thread recovery — P5; no actual native Codex verifier inferred.
29. **C** all repositories integrated; sequential real checks at one checkpoint; provider claim insufficient — P1/P3/P6/P15.
30. **U** complete prepared-source eligibility: clean/committed/no conflicts, correct branch/HEAD/index, tracked/nonignored fingerprint.
31. **U** complete movement variants for executable bytes/environment/settings before and after checks/admission; P23 and source-ref movement test prove subsets.
32. **U** all unsuccessful native outcomes: signal and missing-output-record variants unproved despite P2/P7/P9/P13 failure coverage.
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

The audit cap is about ten existing-evidence checks. This chat ran one safe check; it did not exhaust the cap or leave checks unfinished. Only Adequate rows need sampling; Weak rows go to remediation. Safety restrictions take precedence over high-risk mutation coverage.

| Check | Criterion and intentional break | Exact mapped run and result | Restoration |
|---|---|---|---|
| RC-01 | AC-FIND-03: reverse only the display/result `added` array in `discoverCompletedPlan`; proposal, accounting and admission guards unchanged | K3 alone under integration config, `--maxWorkers=1`: twice failed the exact ordered-ID assertion at line 67, expected `[9b,9a,10,11,12,13,14]`, received reverse. Each run took about 2.4 seconds. After restore, the same named test passed (2.44 seconds). | Original copied outside repo before edit; mutated SHA-256 checked before restore; restored byte-identical and marker RESTORED appended. No mutation committed. |

RC-01 logs: `/private/tmp/kiln-continuep-redcheck-find03-{1,2}.log`; restore passed in the named Vitest run. The shared session marker names the original backup and checksum.

- **AC-HANDBACK-04:** red check not possible for the riskiest stale-finalization part without disabling reconciliation/completion admission, a safety guard deciding whether provider/delivery work starts. Keep read grade capped at Adequate.
- **AC-CONTINUE-05:** red check not possible for the riskiest stale-audit acceptance part without bypassing current-audit delivery admission, also a prohibited safety guard. Keep Adequate.

No green mutation, widening, unexplained failing mapped test or unrestored source remains. One passing restoration run is required evidence; the many tests excluded by `-t` in this targeted run are intentional selection, not permanently skipped evidence.

## To fix, in order

### Missing

None. Every active criterion has some collected evidence.

### Failing mapped tests

None confirmed. Deliberate RC-01 failures were restored and passed.

### Red checks still to run

None. The two high-risk guard prohibitions above are explicit exceptions, not deferred mutation tasks. The only other Adequate row, FIND-03, received RC-01. All remaining rows are Weak and go to remediation before additional mutation coverage.

### Weak

Order: high risk, most uncovered stated groups, then shared setup; ordinary reporting rows follow. This is a test-remediation queue, not an implementation phase plan. Each successor takes one coherent bounded batch; unchanged grades stand until affected evidence changes.

1. **AC-CONTINUE-07 (26/42, high risk):** fill the sixteen U groups above. Smallest approach: focused extraction/readiness boundary matrix; real native checkpoint/permission cases; normally collected supported actual Claude/Codex preparation proof. Reuse generated disposable repositories, qualified versions and existing scripts. A script merely run manually again does not close its normal-collection gap.
2. **AC-CONTINUE-08 (8/14, high risk):** assert nondefault per-provider selections at fresh launch; Codex billing/pause; native current policy/sandbox; changed policy after a successful check and before implementation admission. Real provider/policy boundary evidence must accompany deterministic control fixtures.
3. **AC-CONTINUE-09 (22/27, high risk):** pin panel CI/CD disclosure; real HTTP continuation-specific invalid/stale/wrong/environment/incomplete-scope and denied-permission refusals; conflicting grant command ID; two independent required targets retained across restart and adopted together under the exact reserved execution. Assert unchanged settings/workspaces and zero work until separate Continue.
4. **AC-CONTINUE-06 (9/12, high risk):** independently advance secondary origin, pin proposal and prepared HEAD to captured external SHA; collect both actual-provider fresh admissions. Share setup with CONTINUE-01 where practical.
5. **AC-OFFER-03 (7/10, high risk):** real-Git/HTTP changed governing bytes and eligible sets/prerequisite evidence after render; two genuine stale tabs after a different accepted scope/execution. Assert refreshed rows/reason and no extra execution/dispatch. Do not weaken admission guards to red-check.
6. **AC-OFFER-02 (5/8, high risk):** extend actual Chrome Not now test through reload/recheck and return, with zero work until Continue; unchanged page exact last-success datetime. Preserve the requirement's actual wording about returnability.
7. **AC-HANDBACK-02 (10/12, high risk):** collect actual Claude/Codex handback-to-next-leaf proof normally. Same fixture can cover HANDBACK-01.
8. **AC-HANDBACK-03 (12/14, high risk):** parameterize real-Git known-source discrepancy/reconcile with dependency-only and material same-ID phase changes; assert affected phase, no advancement, then committed/pushed reconcile and automatic continuation.
9. **AC-CONTINUE-01 (7/9, high risk):** collect actual Claude/Codex fresh-conversation proof with immutable earlier history; reuse CONTINUE-06 proof.
10. **AC-CONTINUE-03 (9/10, high risk):** change completed dependency only; assert affected ID, blocked/no rerun, unchanged earlier receipts. Share scope-comparison setup with HANDBACK-03.
11. **AC-FIND-04 (16/23):** actual saved-file I/O failure, remote movement, shutdown cancellation, browser legacy restore action, exact-limit/first-over-limit cases. No additional production access needed.
12. **AC-OFFER-01 (9/12):** exact header, complete ordered multi-row browser/terminal list, multi-repository history/offer page.
13. **AC-FIND-01 (8/10):** hold actual browser response, assert pending feedback/disabled action; count requests during idle/clock/SSE reconnection without adding arbitrary sleeps.
14. **AC-FIND-02 (13/15):** unrelated divergent branch must not be read/selected; move real origin revision mid-read, assert source_changed/earlier-result and no offer. Share movement setup with FIND-04.
15. **AC-HANDBACK-01 (8/10):** collect both actual-provider manual-return append/split/remaining-count proof; share with HANDBACK-02.
No row has a remediation attempt yet. Do not mark rows tried/stuck merely because this initial assessment found a gap. Two later independent below-target regrades follow the skill's stuck rule.

### Strong, if asked

High-risk AC-HANDBACK-04 and AC-CONTINUE-05 are Adequate. More exhaustive implied-state combinations and safe value-only mutations can strengthen their evidence, but forbidden admission/permission guard mutations must never be used. This is optional strengthening after mandatory Weak rows, not current remediation work.

## Waiting

None. No criterion is waiting on delivery or a missing non-production counterpart. The provider proofs have existing disposable environments; normal collection/coverage is test work, not a request for production resources.

## Accepted

None. No user acceptance of a Weak/high-risk row was given or inferred.

## Next bounded batch and completion chain

The initial audit closes without remediation because the gap queue exceeds three rows. Required successor: **test-audit on this whole PRD**, taking **AC-CONTINUE-07 preparation evidence** as its first bounded batch. Derive the smallest coherent part set from the U list; share provider setup only when it remains a dependable single-session batch. A row may remain Weak while a bounded portion is strengthened, but record the exact remaining parts and independent regrade honestly. Do not split test remediation into implementation phase documents.

Each new/strengthened test must first fail for the requirement it pins, without breaking forbidden safety guards; restore all changes made for red checks. A fresh assessor regrades the worked row. Test/code edits require full `npm run verify` and `npm run test:package` with implementation/build output frozen throughout broad integration. Keep current provider/profile limits; this audit certifies no new platform or detached/remote-effect containment.

No redundant baseline suite was run here: the clean delivery audit just ran both gates on unchanged implementation, and test-audit assumes that baseline. Only RC-01's named test ran twice broken and once restored. This document-only output does not invalidate that clean delivery assessment.

If a new required test exposes a delivery defect, confirm it and use test-audit's conflict/shipped-behavior check. Small authorized implementation fixes get deliverable review, independent regrade and a fresh clean whole-PRD delivery audit before affected test reassessment; larger missing implementation gets a completion leaf and its own implementation chat, then fresh delivery audit, then affected test reassessment. Requirements changes also require fresh delivery assessment. One implementation leaf per chat. Test-only and audit-record-only edits retain the existing clean delivery assessment.

Continue scoped commits/publication and direct successor launches under the carried user authorization until Done: every active criterion at least Adequate or explicitly accepted by Doug, no pending required red check, no delivery wait, every planned implementation leaf closed and a current clean whole-PRD delivery audit. No acceptance is currently available for automatic inference, and high-risk rows require explicit named acceptance if Doug chooses that route.
