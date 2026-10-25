# Phase 3: Automatic test remediation

**Closed:** 2026-10-25

**Parent PRD:** [docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md](kiln-completion-audits-prd.md)
**Technical design:** [docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md](kiln-completion-audits-technical-design.md) — relevant sections: One completion decision; Audit Report and Local Interface; Current Work and Invalidation; Provider Sessions and Development Delivery; Recovery and Upgrade; Progress and Detail Contract; Verification and Criteria Coverage.
**Plan:** [Kiln automatic completion audits — implementation plan](kiln-completion-audits-implementation-plan.md)

## Summary
Automatically strengthen inadequate test evidence and continue unfinished test-audit work in fresh sessions. Return test-discovered implementation gaps and direct fixes through delivery audits, then reassess test evidence before final completion.

## Acceptance criteria covered
AC-AUDIT-04, AC-TEST-01, AC-TEST-02, AC-TEST-03, AC-TEST-04.

AC-AUDIT-02 (also applies to this phase's work); AC-AUDIT-03 (also applies to this phase's work); AC-RUN-03 (also applies to this phase's work); AC-LOOP-04 (also applies to this phase's work); AC-RUN-01 (also applies to this phase's work); AC-RUN-02 (also applies to this phase's work); AC-RUN-04 (also applies to this phase's work); AC-RUN-05 (also applies to this phase's work); AC-RUN-06 (also applies to this phase's work); AC-RUN-07 (also applies to this phase's work).

## Out of scope for this phase
New product scope, changes to installed method skills, unplanned infrastructure changes and production release authority remain outside this PRD.

## Phase dependencies
1 (typed test reports and evidence/currentness checks); 2 (activity dispatch, repair loop, recovery, progress and development obligations).

## Phase-specific notes
Reuse Phase 2's delivery repair path for test-created completion phases and direct implementation fixes. Re-prove recovery, currentness, progress and retained development obligations for continuations and reassessment; the plan's closeout requires whole-PRD audits after all planned phases close.

## Phase 2b handoff

Phase 2b supplies the automatic clean two-audit path and repeated delivery repairs. Read its recorded verification and installed-provider proof summary before extending it. `src/audit/workflow.ts` owns accepted-result routing/currentness; `Engine.nextActivity` is shared by startup and the execution loop, with final-session recovery returning through that decision. `auditDoneCheck` reconciles the assigned report after process settlement, including a committed report whose submit command never ran. Accepted immutable results remain history when later material content requires fresh gates; unresolved attempts stay correctable in their original activity.

Extend this dispatcher for `continue_test`, same-round continuation identities, retained-grade reassessment and test-discovered fixes. Phase 2b's clean-path selector handles successful delivery/test gates; it does not establish Phase 3's continuation/remediation criteria. Preserve the first snapshot as the append-only plan baseline. Allocate the target before assigning retained obligations; continuation assignments must use `assignAuditObligations` in the same persisted decision, as repair settlement already does. Retain its criterion intersections, requiredMerge and immutable checkpoint origins. The real state-write-failure regression in `audit-development-delivery.integration.test.ts` proves that failed repair settlement retains the stop, rolls back assignments and does not dispatch a repair.

`record.activities` retains observed execution order; `record.nextActivityKey` retains the pending boundary task. Audit storage remains `audit-<activityId>` in the compatible session/facts map; those keys never become phase IDs. The snapshot's `activities` projection drives the familiar list, with phase totals and plan details still in `phases`. Preserve blocked criteria/actions, finished audit output paging, historical completion timestamps, current development authority and note/workspace-repair precedence.

Both providers use task-specific installed audit skills through `prompts/audit-session.txt`; resumed and fresh manual audit recovery receive that full pinned CLI/report contract with current authority. Claude red-check mutation/restoration evidence uses its native Write/Edit tools. Codex's qualified evidence wrapper uses literal tool arguments and `text(result)`; `store/load` and dynamic dispatch are outside that existing static profile and stop as incomplete evidence. Do not weaken that checker to accept rendered success text. Actual Codex 0.162.1 full history represents a settled silent command with explicit `aggregatedOutput: null` and a numeric exit code. The collector normalizes that qualified null to empty output; a missing output field remains unresolved. The sanitized native item is retained in `test/fixtures/codex-audit-proof/silent-command-output-0.162.1.json`.

`audit-workflow.integration.test.ts` runs the real scheduler, authenticated child CLI/server, disposable Git origins and browser controls with deterministic provider histories. Older phase/transport tests explicitly model an already-current audit gate to isolate their original boundaries; they do not prove automatic audits. The installed-package proof runs actual Claude Code and Codex, interrupts/restarts their delivery audit, preserves conversation/activity identity, then requires both accepted audits and final completion. Its final GitHub read uses the repository-owned captured contract; all commits/pushes are to disposable local origins, never external repositories.

## Inherited execution limits

Source: Doug's Phase 2b request in chat `01a1702e-b2ad-76d0-bc15-2b3e9aa7fb1e`, retaining chat `01a16fc4-5167-7153-b30c-28e08d04c0d2`: “no push, merge, production action or external message is authorized.” Doug explicitly requested this existing worktree throughout. Scoped local commits, reviews and non-production verification are authorized. The later “go ahead and push” in chat `01a16ff4-29de-7bf3-b2a1-d199d3a28766` covered only Phase 2a commit `72188c9`; further pushes remain held. Carry these limits and source references into successor prompts.


## Closing-audit handoff

The implementation uses the existing serialized dispatcher for same-round fresh test continuations. Each allocation persists the new identity, initial snapshot, next activity and criterion-intersected retained development assignments together. Accepted continuation reports account for every remaining Missing/Weak criterion. A subsequent unfinished report needs changed grades, code/test evidence or newly uncovered source-bound parts; changing finding prose, task wording or local part IDs is not progress.

After a direct test implementation fix or test-created completion phase, delivery currentness requires a fresh whole-PRD delivery audit, followed by a new test round. The new test activity receives both the latest delivery report and the latest immutable test report. It deliberately reassesses every current row with new observed runs and independent assessors; historical grades remain context. Earlier test-audit.md revisions remain immutable history and only the latest gate checks the current shared record.

Audit-owned development obligations keep immutable checkpoint origins and requiredMerge/deployment/verification requirements. The new allocator test induces a real filesystem save failure after assignment, proves complete rollback and then checks the persisted immediate continuation's identity and intersected obligations. Existing first-grant/current-authority recovery remains in force.

The installed Codex proof exposed genuine empty followup_task acknowledgements in authoritative 0.162.1 history. The collector resolves these only through the same parent's earlier owned, successful spawn and its observed canonical task name. Encrypted message equality, verified parent/child frontiers and owned/completed turn checks remain mandatory. Unsupported or ambiguous receivers remain unqualified. The checker also qualifies the observed non-executing functions.wait envelope for yielded exec cells with exact typed fields, while independently covering the original wrapper and every native command. Captured actual wait input, negative envelope/receiver regressions and independent provenance reviews cover these compatibility fixes; no rendered-success shortcut was added.

All planned leaves must close before the plan's whole-PRD delivery audit, then test audit. Phase 3's completion does not substitute for those independent closing audits. Read this phase's final verification record and retained provider summary before auditing. The source execution limits above remain unchanged; this chat's explicit local-commit authorization is in `01a170de-d58f-73e1-a497-2dea881149f8`. No new publication authority is implied by closing this leaf.


## Implementation and verification record

The dispatcher now allocates fresh test continuations in the original round, with visible continuation numbering in the existing browser activity rows and terminal events. A saved batch must name every remaining Missing/Weak criterion once. Unchanged grades, source/test mappings and uncovered required parts stop rather than launch an endless sequence; paraphrasing findings does not qualify as progress. Test-created completion phases use ordinary implementation checks, and both those repairs and direct test fixes return through fresh delivery and whole-test reassessment.

Deliverable review fixed the no-progress comparison and the post-delivery human-action exception. Test hardening added multi-criterion omitted/duplicate/exact batch accounting, existing-open-PR and already-integrated startup/Check again/Resume gates, real browser continuation details, and actual allocator/save rollback with retained obligations. Narrow provenance reviews confirmed the empty-follow-up and yielded-wait support without admitting dynamic wrappers, unknown fields or uncovered executable work. No in-scope review finding remains.

### Criteria evidence

| Criteria | Executed boundary |
|---|---|
| AC-AUDIT-04 | Real scheduler/CLI/server/Git fixtures with existing review PRs and current work in the intended base still require delivery and test gates at startup, Check again and Resume; finalization reuses existing delivery evidence without a duplicate final session. |
| AC-TEST-01 | Actual installed Claude Code and Codex skills assess a typeof-only test as Weak, strengthen the real assertion in a fresh continuation, observe two real red failures and exact restoration, and obtain independent Adequate re-grades. Adequate is sufficient; no optional Strong requirement was added. |
| AC-TEST-02 | Fresh provider conversation, same round and incremented continuation identity, immutable accepted history, saved next batch, pause/restart continuity and no-progress refusal. Two-criterion reports refuse omitted/duplicate remaining keys and accept the exact set. |
| AC-TEST-03 | Test-created completion phase and direct source fix each run a new delivery round and then a new whole-test assessment with both prior reports supplied as context. Original phase identities and Closed lines remain intact. |
| AC-TEST-04 | Existing report-policy refusal cases remain gates; pending human work passes only when the governing requirement puts it beyond delivery. Unfinished Weak/Missing work cannot disappear from the continuation batch or pass final completion. |
| Inherited AC-AUDIT-02/03, AC-RUN-03/04/05 | Native provider evidence and currentness remain authoritative. Real checkpoint allocation/save rollback retains exact criterion intersections, immutable origins, requiredMerge and evidence requirements. Both installed providers retain assigned skills, settings, workspace and activity identity. |
| Inherited AC-LOOP-04, AC-RUN-01/02/06/07 | Existing stop, upgrade, usage, pause and activity tests remain gates. New continuation browser/terminal, restart and existing-delivery entry-point checks run through the shared decision with immediate dispatch; actual provider interruptions preserve conversation identity. |

### Installed-provider evidence

[Retained provider summary](kiln-test-remediation-provider-proof.json) was generated by re-reading every accepted immutable result, portable report, final method record, checked snapshot, red command outcome, conversation identity and final clean local-origin repository. Raw provider histories, failed attempts and fixture repositories remain private under its recorded roots. Each provider reached final completion after a Weak report, a fresh same-round continuation, a changed test blob and an independently assessed Adequate report.

The Codex fixture first stopped on genuine unsupported follow-up/wait history. Normal Resume retained its original activity and conversation while the installed reader was corrected. A later provider edit to test-audit.md after admission was correctly rejected by currentness. The fixture restored only the exact retained accepted record bytes, committed/pushed that record solely to its disposable local bare origin, and normal Check again completed. No checked source, tests, portable report or command evidence changed in that restoration. The launch prompt now explicitly requires final records before submission and leaves closing remarks in the provider response.

The Claude proof additionally needed an explicit interrupt of a first-batch process that had emitted its final result but remained alive. Its accepted work was reconciled before automatic continuation. Both providers also underwent the planned continuation interruption/restart in the same provider conversation. The deterministic scheduler tests separately prove the clean immediate path without an interruption. Final GitHub evaluation in these proofs uses the captured repository-owned read contract; no external PR, merge or production operation occurred.

### Verification environment notes

The complete six-worker run before the final wait compatibility change passed 638 integration tests with two existing host-conditional skips. On final source, an Eastern near-midnight run exposed the existing usage-reset fixture's same-day-only regular expression: the application correctly included the next day's name. Verification uses UTC to avoid that fixture assumption without changing its assertion. The existing retired-model browser case has an asynchronous Refresh/Check again race. It failed in full runs and alone, passed unchanged alone on both current source and an extracted `9936a80` source archive, then failed on the unchanged predecessor in a bounded repeat (`/tmp/kiln-ph3-browser-baseline-repeat-1.log`). This proves the failure predates this work. No unrelated assertion or timeout was modified. The redundant three-worker repeat was stopped after reproducing that same known failure; the completed final-source UTC run below remains the full gate.


### Final commit gate

Final source validation on macOS:

- Dependency audit: zero blocking high/critical findings.
- ESLint and TypeScript/Svelte checks pass; zero TypeScript/Svelte errors or warnings.
- `npm test -- --maxWorkers=3`: all 546 tests pass.
- `npm run test:codex-proof`: all 17 supported provider-contract checks pass, including the captured native wait form and refused unknown/executable variants.
- Focused real-history suite: all 30 checks pass. Continuation/admission/owner/browser checks also ran through the complete integration gate.
- `TZ=UTC npm run test:integration -- --maxWorkers=6 --reporter=dot`: 638 pass, two existing host-conditional skips and the one confirmed pre-existing retired-model browser race above (641 total). All tests covering Phase 3 pass. The earlier same-day time-fixture failure is absent under UTC.
- `npm run test:package`: all four installed-package checks pass on final source/prompts.
- Actual installed Claude Code and Codex proofs: accepted Weak report, fresh same-round test remediation, real red checks, independent Adequate re-grade, identity-preserving recovery and final completion. The retained summary explicitly records the compatibility and accepted-record recovery steps and each package digest.

Deliverable review, final full review, narrow compatibility reviews and test hardening are complete with no remaining in-scope finding. The pre-existing browser test failure is excluded under the method's existing-failure rule, not hidden or fixed in this phase. No product criterion, report policy or provenance check was waived.

Only Phase 3 is closed here. All planned leaves are now closed; the next work in this same track is the independent whole-PRD delivery audit, followed by the method's test audit. No whole-PRD completion audit has been performed by this implementation chat. This delivery remains scoped local commits in the explicitly assigned existing worktree; pushes, merges, production actions and external messages remain unauthorized.
