# Kiln development deployments — Implementation phase plan

**PRD:** [Kiln development deployments](kiln-development-deployments-prd.md)
**Technical design:** [Kiln development deployments](kiln-development-deployments-technical-design.md)
**Assumptions:** [AUTH-001 pending; AUTH-002 validated](kiln-development-deployments-assumptions.md)

## Implementation order

| Phase | What it does | Depends on |
|---|---|---|
| [1 Authorized development delivery](phase-1-authorized-development-delivery.md) | Let an execution approve concrete targets, deliver and verify required work, recover interruptions, continue building and finish with accurate results for every repository. | None |
| [2 Remembered targets and execution grants](phase-2-remembered-targets-grants.md) | Let people explicitly reuse saved targets and authorize missing targets while stopped, including recovery of earlier work. | 1 (execution authorization, delivery interface, current phase/final evaluator and repository results) |
| [3 Complete delivery recovery guidance](phase-3-delivery-recovery-guidance.md) | Added by delivery audit: carry current authority into terminal recovery of an existing conversation and make resumed finalization guidance reflect remaining work. | 1 (delivery authority, completion evaluator and recovery display); 2 (first-grant activation) |

Each row is one implementation phase. Both original planned phases are implemented and closed. [Phase 2 proof results](kiln-development-authorization-proof-results.md) record remembered choices, execution grants and real provider activation recovery. [Phase 1 proof results](kiln-development-delivery-proof-results.md) record its delivery interface, evidence and verification. The whole-PRD delivery audit added completion Phase 3. Completion Phase 3 is now closed; its document records the recovery proofs and final verification gates. The [whole-PRD test audit](kiln-development-deployments-test-audit.md) closed all 13 initial Weak coverage gaps and independently graded all 19 criteria Adequate. Its report records final verification and publication approval; no further implementation phase was needed.

## Sizing and implementation baseline

Sized against `fc27712` on 2026-10-24, after design refinement/consolidation `e4f7ba5` and `6226bf4`. The whole change exceeds one coherent run: it combines a complete initially authorized delivery workflow with permission reuse and activation of already-running restricted executions. Phase 1 is substantial but one capability: final remaining-work accounting uses the checkpoint coverage, Git evidence, repository iteration and recovery transitions already needed for safe continuation. Phase 2 adds explicit permission reuse and extension, including concurrent preference storage and historical assessment recovery; those workflows can be built and proved after initial authorization works end to end.

The pre-implementation seam review merged the original checkpoint and final-completion slices: a phase that enables delivery but deliberately cannot finish a valid execution cannot prove its completion/recovery criteria. Do not restore that boundary to reduce the criterion count. If implementation reveals genuine sizing pressure, re-split the remaining work under phase-split rather than planning a knowingly incomplete endpoint.

The inspected implementation has schema 4 in `src/state/records.ts`, atomic private storage in `src/state/state-files.ts`, authenticated settings/Start routes in `src/server/local-server.ts`, and workspace discovery in `src/add-repository-command.ts`. Phase 1 extends these through the browser, running engine and delivery command; a persisted authorization model alone is not its endpoint.

`src/engine/checks.ts` currently checks Closed/Committed/Pushed/workspace evidence and final open PRs or conservative feature-tip ancestry. `src/engine/engine.ts` has completion short-circuits in prepare/decide and several resume/check paths. Phase 1 integrates checkpoint obligations and final remaining-work decisions at those transitions, including enabled-execution completion short-circuits. Do not reuse the restricted ancestry predicate as proof of squash/rebase delivery.

`src/session/prompts.ts` and `prompts/` currently carry the delivery restrictions. Claude tool evidence in `src/session/transcripts.ts` lacks retained call/result identity and result timestamps required by this design; `src/session/codex-evidence.ts` currently projects workspace-audit evidence. Phase 1 must extend authoritative evidence, not infer delivery from ordinary output. `src/engine/snapshot.ts`, `view/src/screens/`, and `src/terminal-output.ts` are the presentation paths; the existing final screen already distinguishes conservative prior integration, which Phase 1 must preserve for restricted executions.

## Criterion ownership and proof allocation

Each PRD criterion has one owner in the phase documents. Later documents explicitly mark recurring constraints as “also applies”; those repetitions confer no second ownership. Every phase runs `npm run verify` before its implementation commit, plus its real boundary proofs from the design's **Verification and Criteria Coverage**. Planning does not claim those proofs have run.

| Owner | Proof assignment |
|---|---|
| 1 | Real browser Start/settings and loopback API/CLI: default off, explicit non-production identity, changed/unconfirmed target refusal, schema 1–4 migration, atomic execution grants, restart and late-repository denial. |
| 1 | Actual disposable non-production GitHub PR/deployment checks and real Claude Code **and** Codex sessions using the delivery command and authoritative command results; required checks/review, pending queue, skipped required job, wrong artifact/environment and missing-result failures. |
| 1 | Real temporary Git repositories/bare origins: merge/squash/rebase, base synchronization, later head/new PR, deleted remote branch and name collision; corrected checkpoint coverage retains failed obligations. |
| 1 | Interrupt before/after remote acceptance and local save for merge/deploy/verify/synchronize; restart, sleep/usage/manual recovery, Check again, document edits, split/re-split and descendant-specific obligations. Use captured/verified contracts for provider shapes; controlled failure injection supplements real integrations. |
| 1 | Browser/terminal checkpoint activity, failure and recovery evidence, including existing Follow-up and running/waiting displays; no success inferred from a prepared intent or historical Push. |
| 1 | Two repositories with a dependency, one failing prerequisite and a changed current artifact before unfinished verification; retain other deliveries and verify links/order. Exercise all four PRD final-result rows, all-delivered/no final session, current-head PR coverage, zero-delta provenance, reopening, manual work and reply-preserving prechecks. Prove browser/terminal mixed summaries. |
| 2 | Real browser/API preference reuse with a documents-only product repository and separate API/web targets, same-group different PRDs, different groups/checkouts/origins, stale revisions and concurrent saves. Prove active executions never change through preferences. |
| 2 | Real browser/API Needs you grant and idempotent restart, then both providers recovering a previously restricted execution: assess earlier/stopped leaves, reuse confirmed delivery, retain historical timestamps, reject future scope, and demonstrate notes/Resume/settings cannot grant. |

## Implementation boundaries

All application changes are in Kiln. Disposable proof repositories/environments are test resources, not extra application deliverables or grants to modify unrelated shared systems. Establish the documented non-production proof targets and required access at the start of Phase 1; missing access is an explicit unproved boundary, never a fixture-only pass or a reason to close the phase.

Phase 1 must prove complete executions with initially approved targets, including every final-result row, multi-repository order and current-work reconciliation. It cannot close with valid final cases blocked only because their evaluator is deferred. Missing or failed evidence still remains unresolved under the design. Phase 2 must apply the same evaluator to newly authorized work and must not defer its safety fixes to the earlier closed phase.

The PRD's **Relationship to Earlier Requirements** and the design's **Supersession Boundary** govern every implementation commit: add reciprocal supersession pointers only for behavior that commit actually implements. No reverse links, historical mockup rewrites, application code or published-skill changes belong to this planning commit. AUTH-001 remains provisional; AUTH-002 is validated.

## Whole-PRD delivery audit — 2026-10-24

Audited baseline: `886f31f`, including Phase 1 `787b23e` and Phase 2 `886f31f`, with both original phases closed. No implementation files had uncommitted changes; the unrelated staged root README change was excluded. Independent readers derived requirements from the governing documents and traced all 19 current criteria from their user/system entry points. The main auditor confirmed every gap and checked conflicting requirements/history. Sixteen criteria are Implemented; AC-DELIVER-04, AC-RECOVERY-01 and AC-DISPLAY-03 are Partly implemented. [Completion Phase 3](phase-3-delivery-recovery-guidance.md) records their missing parts and completes them without changing original ownership or closure history.

No criterion is Not implemented, Changed outside the requirements, Superseded, or Waiting on a human action. AUTH-001 remains the existing provisional grouping assumption, not an approval hold. The conflict check found no later-built replacement for these three criteria: prior recovery requirements point into this PRD, while the affected terminal/manual and finalization-copy paths predate its implementation. This is a code-path delivery audit; no tests were run or graded. The existing Phase 1/2 proof results retain their claims and limits. The whole-PRD test audit follows completion Phase 3, in a fresh chat.

## Whole-PRD test audit — 2026-10-24

The [test audit](kiln-development-deployments-test-audit.md) covers all 19 criteria after completion Phase 3 at `ed773ea`. Three independent assessors found 13 Weak and 6 Adequate criteria; test-only remediation and independent re-grade brought all 19 to Adequate. Twenty-eight repeated-red/restored-green mutation cycles demonstrate the sampled regressions; authorization and write-dispatch guards were never weakened. No implementation defect or planned successor phase remains. Doug approved committing and pushing the audit on 2026-10-24; the publication hold is lifted.
