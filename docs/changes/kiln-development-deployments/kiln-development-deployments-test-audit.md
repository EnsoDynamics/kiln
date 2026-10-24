# Test audit: Kiln development deployments

**Status:** Done — all 19 criteria independently re-graded Adequate; full verification and package checks passed.
**Last audit:** 2026-10-24, whole PRD, baseline `ed773ea` plus this audit’s test changes (uncommitted when graded).
**PRD:** [Kiln development deployments](kiln-development-deployments-prd.md)
**Scope:** All 19 criteria across three closed phases, after delivery audit `362c92b`. No superseded, unbuilt, person-only or delivery-gap rows.

## Baseline and evidence boundary

`VITEST_MAX_WORKERS=4 npm test -- --reporter=verbose --reporter=json`, `npm run test:codex-proof`, and `npm run test:integration -- --reporter=verbose --reporter=json`: 522 unit/render tests, 16 protocol checks and 551 integration tests passed. Two Windows browser-launch tests are skipped on macOS; neither is mapped to these criteria. Integration duration: 195.47 seconds. Per-test baseline results and mutation logs are retained outside the repository in `/tmp/kiln-devdeploy-test-audit/`.

The collected integration suite uses real temporary Git repositories/bare origins, actual private files and concurrent Node processes, authenticated loopback API/CLI, Chrome and native provider-history readers. GitHub failures use the checked-in verified contract, supported by the Phase 1–3 recorded live GitHub/Claude/Codex proofs. Those historical runs supplement the contracts; they are not substituted for missing collected regression assertions. This audit confirmed read-only access to the disposable proof repository and installed Claude/Codex CLIs. It performed no external deployment/merge or production write.

Three independent assessors derived required parts from the PRD, design, assumptions and phases before reading tests. Initial result: 6 Adequate, 13 Weak, none Missing. No product defect was established. All remediation is test-only.

## By criterion

Evidence aliases resolve to files and named tests below. Risk describes the consequence of a silent break, not an observed incident. Every row is Adequate after independent re-grade by a reviewer who authored none of the changes. No Strong claim is made: mutations sample risky behavior; they do not break every required part.

| Criterion | Grade / risk | Tests and required observations | Implementation | Checked |
|---|---|---|---|---|
| AC-PERMIT-01 — Development deployments are optional. | Adequate / high | A, B, C; default unchecked; old executions restricted; atomic enabled Start | `src/state/records.ts`; `src/engine/engine.ts`; `view/src/components/DevelopmentDelivery.svelte` | 2026-10-24 `ed773ea` + audit tests |
| AC-PERMIT-02 — The person approves concrete targets. | Adequate / high | A, B; empty/unconfirmed/changed targets; real browser environment and base edits require reconfirmation | `src/engine/development-delivery.ts`; `view/src/screens/DocumentsFound.svelte`; `view/src/components/DevelopmentDelivery.svelte` | 2026-10-24 `ed773ea` + audit tests |
| AC-PERMIT-03 — Remembered choices stay within the project. | Adequate / high | B, D, E; visible exact storage group/targets before explicit reuse; origin/checkout isolation; two-process stale-revision race; active grants unchanged | `src/state/development-preferences.ts`; `src/engine/engine.ts`; `view/src/components/DevelopmentDelivery.svelte` | 2026-10-24 `ed773ea` + audit tests |
| AC-PERMIT-04 — Permission survives without silently growing. | Adequate / high | A, F; atomic Start/restart; actual addRepository after enabled Start preserves grants; exact missing-target refusal after reopen | `src/engine/engine.ts`; `src/engine/development-delivery.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-PERMIT-05 — The person can authorize a missing target for this execution. | Adequate / high | B, D, G; exact Needs you grant and reconfirmation; persistence/rollback/idempotency; notes/settings confer nothing; prior assessment recovery with history retained and future scope refused | `src/engine/engine.ts`; `src/engine/development-delivery.ts`; `view/src/components/DevelopmentDelivery.svelte` | 2026-10-24 `ed773ea` + audit tests |
| AC-DEV-01 — Required development delivery can happen before the end. | Adequate / high | A, F, G, H; criterion-required checkpoint preparation before closure; CLI/engine intent; documented verification; historical recovery allowed; final-remainder merge refused | `src/engine/development-delivery.ts`; `src/engine/engine.ts`; `src/session/prompts.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DEV-02 — Normal checks and protections still apply. | Adequate / high | G, H; current checks, later failed status/local result, required review, pending queue; no intent on refusal; source head pinned when accepted | `src/engine/development-delivery.ts`; `prompts/development-authority.txt` | 2026-10-24 `ed773ea` + audit tests |
| AC-DEV-03 — Deployment and verification have their own outcomes. | Adequate / high | H, I; separate merge/deployment/verification; wrong immutable artifact, typed artifact/environment mismatch, skipped job, early verification, missing result and late deadline rejected; inspectable failure retained | `src/engine/development-delivery.ts`; `src/session/transcripts.ts`; `src/session/codex-evidence.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DEV-04 — The permission has a clear boundary. | Adequate / high | A, G, J; both-provider emitted authority explicitly forbids production/destruction/unrelated infrastructure or data/other checkouts/self-grants/override; real workspace and protected-provider checks retained | `src/session/prompts.ts`; `prompts/development-authority.txt`; `src/engine/checks.ts`; `src/session/codex-session.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DELIVER-01 — Later phases continue safely. | Adequate / high | A, H; real merge/squash/rebase, same-branch synchronization and accumulated ancestry; later commits require new current-head review; original merge identities retained | `src/engine/development-delivery.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DELIVER-02 — Further delivery neither duplicates nor loses work. | Adequate / high | A, G, H; appropriate open PR reuse; new remainder PR; closed-unmerged/pending refused; deleted branch recreation plus missing/unrelated remote tip refused with history intact | `src/engine/development-delivery.ts`; `src/engine/engine.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DELIVER-03 — Each repository keeps its own delivery result. | Adequate / high | K; two real repositories, failed/changed prerequisite, restoration and exact dependency artifact; reciprocal delivery links/order and later review link each independently required | `src/engine/development-delivery.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DELIVER-04 — Completion accounts for all the remaining work. | Adequate / normal | H, L; four final-result rows; actual equal-tree/no-provenance; draft/base/fork/list/detail head-state rejection; all-delivered engine creates no final session; links-only task and final-remainder refusal | `src/engine/development-delivery.ts`; `src/engine/engine.ts`; `src/session/prompts.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-RECOVERY-01 — Every continuation uses the saved scope. | Adequate / high | A, D, M; both provider launch/fresh/finalization and manual/sleep/usage/interrupt resumes; current authority after first grant; reply/repair precedence; browser terminal handoff | `src/session/prompts.ts`; `src/engine/snapshot.ts`; `src/engine/engine.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-RECOVERY-02 — Interrupted delivery is checked before it is repeated. | Adequate / high | A, H, K; prepared merge/deploy/verify/synchronize reconciliation; acceptance before local save; unknown outcomes never repeated; confirmed failure retry; corrected/split obligations survive restart | `src/engine/development-delivery.ts`; `src/engine/engine.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-RECOVERY-03 — Completion checks mean the same thing everywhere. | Adequate / high | D, H, L; same evaluator across checks; completedAt reopen with new pushed head stops; same final conversation receives reply despite stale PR; repaired review completes without rewriting history | `src/engine/engine.ts`; `src/engine/development-delivery.ts` | 2026-10-24 `ed773ea` + audit tests |
| AC-DISPLAY-01 — The effective permission stays visible. | Adequate / normal | B, C, N, O; actual Start controls and running single/multi settings show exact grants and shared-environment risk; restricted copy retained | `view/src/screens/DocumentsFound.svelte`; `view/src/components/SettingsPanel.svelte`; `view/src/components/DevelopmentDelivery.svelte` | 2026-10-24 `ed773ea` + audit tests |
| AC-DISPLAY-02 — Progress distinguishes delivery from verification. | Adequate / normal | H, N, O, P; observed activities rendered independently of Push/Follow-up; PhaseDetail/NeedsYou/Waiting retain pending, merged, deploy, verify and failure facts; terminal stages distinct | `src/engine/snapshot.ts`; `src/kiln-command.ts`; `view/src/components/CurrentPhase.svelte`; `view/src/components/DevelopmentDelivery.svelte` | 2026-10-24 `ed773ea` + audit tests |
| AC-DISPLAY-03 — Completion shows delivered work and work awaiting review. | Adequate / normal | H, L, N, O; Complete renders delivered/mixed/review identities and links; no invented finalization row; real row renamed; agent/history/workspace remain; browser SSE transitions | `src/engine/snapshot.ts`; `src/underway-output.ts`; `view/src/screens/Complete.svelte`; `view/src/components/PhasePlan.svelte` | 2026-10-24 `ed773ea` + audit tests |

## Evidence index

- **A:** `src/engine/development-delivery.integration.test.ts`: “keeps an old execution restricted…”, “atomically retains exact Start authority…”, “keeps a repository added after authorized Start restricted across restart…”, “preserves every excluded permission in %s launch, fresh, finalization and resume prompts”, retained-assessment/split/corrected-checkpoint cases and three real source-continuation variants.
- **B:** `src/server/development-grants-browser.integration.test.ts`: real documents-only product/API/web flow, saved-group display, explicit reuse, environment/base reconfirmation, Start and execution-only grant with changed-environment reconfirmation and current terminal handoff.
- **C:** `view/src/screens/development-delivery-screens.test.ts`: initial off-by-default and concrete-target DocumentsFound render tests.
- **D:** `src/engine/development-grants.integration.test.ts`: explicit reuse and revision conflicts, active authority/preferences separation, exact grants/rollback/restart, earlier/stopped assessment order, unstarted recovery and finalization activation, notes granting nothing, terminal/current finalization handoff.
- **E:** `src/state/development-preferences.test.ts` and `.integration.test.ts`: canonical origins/real checkout separation, corrupt files, exact targets and a two-process compare-and-swap race.
- **F:** `src/server/development-delivery.integration.test.ts`: authenticates every delivery route through the real CLI, atomic revision persistence, failed Start save prevents grants/dispatch.
- **G:** `src/engine/development-activation-boundaries.integration.test.ts`: prior prerequisite probes, assigned ancestor obligations, future-scope refusal, historical finalization checkpoint versus final remainder, required tests/review before proceed.
- **H:** `src/engine/development-evidence.integration.test.ts`: recovered merge/squash/rebase and synchronization; separate evidence outcomes; wrong artifact/environment/job/timing; uncertain closed/unmerged; latest checks/review/queue; retained facts on unavailable source; current activity; exact final PR cases; deleted/recreated remote; real equal-tree provenance; typed mismatch; confirmed failure retry; late evidence deadline. New tests assert intended values and refusal facts, not merely non-null output.
- **I:** `src/session/delivery-command-evidence.integration.test.ts`: Claude/Codex authoritative command identity, completed result, missing/failed/ambiguous result and retained raw evidence. Existing `codex-evidence.integration.test.ts` and `codex-session.integration.test.ts` cover protected native histories.
- **J:** `src/engine/outside-workspace.integration.test.ts`, `src/session/codex-session.integration.test.ts`, `src/session/codex-evidence.integration.test.ts`: real workspace protection and provider refusals, supplemented by the enabled authority matrix in A. No test attempts an actual destructive/production action.
- **K:** `src/engine/development-dependencies.integration.test.ts`: “blocks dependent verification on failed or changed prerequisites…” now independently removes each reciprocal link, order wording and earlier delivery’s later-review link before restoring; “does not replay an old changed-artifact command probe…” retains restoration boundaries.
- **L:** `src/engine/development-recovery.integration.test.ts`: “resumes only description repair…” now completes, pushes new source, reopens from disk, retains historical times/merge, preserves the note in the original finalization session despite stale review head, then completes on corrected evidence; “completes delivered work without inventing a finalization session or row”.
- **M:** `src/engine/engine-helpers.test.ts`, A/D and `src/server/development-grants-browser.integration.test.ts`: both-provider recovery prompts, exact scope, reply/repair precedence, current terminal handoff and finalization task.
- **N:** `view/src/screens/development-delivery-screens.test.ts`: ongoing single/multi settings, four observed activity labels independent of Push/Follow-up, PhaseDetail/NeedsYou/Waiting pending-versus-confirmed outcomes, all-delivered and mixed Complete rendering with actual links, identity/history/workspace retention.
- **O:** `src/server/development-display-browser.integration.test.ts`: “renders saved authority and observed activity, then distinct merged and review results from a live snapshot update”; actual Chrome, built bundle, CSP and SSE. Engine truth is independently covered by H/K/L; this is a rendering contract fixture.
- **P:** `src/terminal-output.test.ts`: separate Merge, Deployment and Verification event lines pin exact repository, environment and outcome. H covers final delivered/review terminal links and current phase counts.

## Remediation and mutation checks

Thirteen initial Weak criteria received the missing required-path assertions: target confirmation and disclosure; actual late repository addition; excluded authority; artifact identity; remote branch collision; reciprocal links/order; equal-tree provenance and review identity; historical completion/reply; rendered settings/progress/completion. No production implementation changed.

The first wrong-artifact mutation stayed green: an unrelated workflow SHA made verification fail independently of source containment. The fixture was corrected so deployment and workflow both name the same unrelated artifact, with a valid divergent compare response; the test also pins the deployment rejection and absence of successful deployment evidence. This is a test-quality finding, not a product bug. The corrected mutation failed the phase-completion assertion twice and passed after restoration. Widened checks of environment, required job, verification timing and deployment-job association also failed the intended assertions twice and passed after restoration.

Mutations are serial in this isolated worktree. Before each, the original is copied outside the repository and recorded in the shared session marker; restoration verifies the mutated checksum and byte equality against the backup. Each counted red must fail the relevant assertion twice and pass after restoration. No authorization, credentials, environment selection or side-effect dispatch guard is weakened. Read-only completion/evidence predicates, returned facts and display/prompt text are eligible.

A second-red browser run initially timed out before reaching its saved-group assertion: the new base-reconfirmation sequence checked persisted state before the browser received its save acknowledgement. The test now waits for the row controls to re-enable before clicking the next repository. Both repeated mutation runs then failed the exact disclosure assertion, and restoration passed. The interrupted first final-suite attempt is not counted as final verification.

Thirty mutation/restoration events were recorded, all restored. Twenty-eight cycles produced the intended assertion failure twice and passed after restoration: 26 distinct behavior mutations, a repeated remote-branch mutation after replacing the fixture with a true orphan root, and one artifact-reader reachability probe. The two superseded attempts were the masked artifact test and the browser timing failure above. No crash, timeout, import error or skipped test counts as a successful red check.

| Criteria sampled | Deliberate regression | Result |
|---|---|---|
| AC-PERMIT-01 | Display the default checkbox checked while saved authority stays disabled | Exact rendered unchecked assertion fails twice; restored passes |
| AC-PERMIT-03 | Replace only the displayed saved group with an incorrect identity; rebuild the browser bundle | Actual Chrome disclosure assertion fails twice after readiness correction; restored passes |
| AC-PERMIT-04 | Remove exact missing-target identity from the refusal message, preserving refusal | Added-repository exact refusal assertion fails twice; restored passes |
| AC-DEV-01/02 | Corrupt prepared source-head metadata after existing checks/review pass | Pinned-head assertion fails twice; restored passes; authorization guards untouched |
| AC-DEV-04; AC-RECOVERY-01 | Remove the explicit prohibited-action sentence from the emitted prompt | Both-provider prompt matrix fails twice; restored passes |
| AC-DEV-03 | Accept divergent artifact containment or mismatched typed result; omit environment/job association/required-job checks; substitute completion time for verification start | Each mapped phase/evidence assertion fails twice; restored passes; all functions only read provider evidence |
| AC-DELIVER-01; AC-RECOVERY-02 | Corrupt independently recovered merge source identity | Real-Git accepted-merge recovery assertions fail twice; restored passes |
| AC-DELIVER-02 | Omit the read-only remote-tip refusal | Deleted/true-orphan recreated branch refusal assertions fail twice; restored passes |
| AC-DELIVER-03 | Omit reciprocal delivered link, dependency order, or earlier delivery’s later-review link check | Each completion assertion fails twice; restored passes |
| AC-DELIVER-04 | Treat equal trees as unchanged without provenance; ignore list PR identity or reread state/head | Each selected completion assertion fails twice; restored passes |
| AC-RECOVERY-03 | Skip enabled completedAt reconciliation | Reopen reports complete instead of Needs you; assertion fails twice; restored passes |
| AC-RECOVERY-01; AC-DELIVER-04; AC-DISPLAY-03 | Substitute old PR-opening carry-on task | Finalization task assertion fails twice; restored passes |
| AC-DISPLAY-01 | Omit saved authority from ongoing SettingsPanel rendering | Single/multi settings assertions fail twice; restored passes |
| AC-DISPLAY-02 | Replace observed activity label; label pending intent observed; omit terminal delivery stage | Rendered activity/pending/terminal assertions fail twice; restored passes |
| AC-DISPLAY-03 | Omit development delivery section from Complete | Delivered/mixed identity and link assertions fail twice; restored passes |

**Red check not possible for executable authorization boundaries:** AC-PERMIT-02/05 exact-confirmation invalidation and AC-PERMIT-01/03/04 grant/default/filter enforcement decide whether/where external writes are authorized. The audit safety rule prohibits weakening those guards. The real browser/API/private-state tests exercise them normally; safe display/refusal samples above are additional evidence, not a claim that those guards were fault-injected. Similarly AC-DEV-01/02/04 scope, review and side-effect-dispatch guards remain intact. These rows are capped at Adequate.

## To fix, in order

None after independent re-grade. No implementation gap or unavailable test environment was found.

**Strong, if requested:** prioritize high-risk authorization (AC-PERMIT-01–05, AC-DEV-04) and delivery/evidence/recovery (AC-DEV-01–03, AC-DELIVER-01–03, AC-RECOVERY-01–03). Remaining work would fault-test every required part and additional edges, including direct restricted-authority assertions on each older schema version; safety-prohibited guard mutations remain excluded. This is optional assurance, not planned successor work.

## Waiting

No criterion waits on delivery or an external resource.

## Final verification

`VITEST_MAX_WORKERS=4 npm run verify` exited 0: dependency audit found zero blocking findings; lint and TypeScript/Svelte checks passed; 536 unit/render tests, 16 Codex protocol checks and 566 integration tests passed. The two inherited Windows browser-launch skips remain unrelated to this PRD. Integration duration: 277.71 seconds; whole verification: 302.01 seconds wall time. All temporary production mutations were restored before this run.

`VITEST_MAX_WORKERS=4 npm run test:package` exited 0: all 4 package checks passed (8.63 seconds test duration; 8.95 seconds wall time). Final diff/whitespace checks and a scan of changed files for common secret formats passed. The shared checkout’s staged README edit is excluded; only the eight test files, this report and the phase-plan audit closure belong to this commit.

## Publication

Publication remains held by Doug’s instruction in source chat `01a16f61-34a0-7020-9e7d-f1fcdcb2b8d0`: “Commit under the skill default; hold publication for approval.”
