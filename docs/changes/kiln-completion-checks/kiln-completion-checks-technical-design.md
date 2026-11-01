# Technical design: Kiln completion checks

**PRD:** [Kiln completion checks](kiln-completion-checks-prd.md).

## Existing code

Preserve the existing controller, Git evaluators, runtime ownership, permissions, provider identities and audit/delivery receipt admission. Remove only the workspace-confinement audit and its presentation/control surfaces. The unchanged phase prompts still direct agents to their assigned worktrees and branch.

## Completion and recovery

Completion evaluators have no workspace-history predicate. Phase closure, clean assigned worktrees, correct branch and matching pushed heads remain mandatory. Final delivery keeps its existing PR or verified integration rules and current audit requirements. Interruptions and usage waits retain conversation availability, cleanup and permission safeguards without scanning for outside changes. Completion accounting validates retained scope-bound Git receipts without requiring a confinement scan of historic provider conversations.

Required test, audit and deployment evidence remains authenticated against provider-owned history. Receipt projection may ignore unsupported unrelated calls; it must never manufacture a required command, successful result or mutation from an undecodable input. Unknown unrelated calls and observed outside changes do not invalidate otherwise authentic receipts. Source ownership, stable/readable history, exact command/result correlation and required evidence/currentness remain enforced.

Codex full-history forks may retain an ancestor’s context-window chain before their own compaction. Authenticate copied session metadata and compaction records against their original ancestor sources, resolve referenced turns to their owning conversation, and validate each sequential window transition. A child’s new file identity does not replace the inherited window lineage. Missing sources, altered copies, unrelated metadata and broken transitions remain unavailable evidence. Provider-recorded retained delegation messages are context only; they cannot supply command or assessment receipts. Stale audit checks name the assigned files and repository metadata that differ from the checked snapshot, excluding portable audit records and normalized status-only changes by the same rules used for currentness. They state that the audit must capture current work and reassess it before resubmitting; no snapshot or report is automatically accepted or rewritten.

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Stayed in the workspace, §The Done Check, §Seam With Usage-Limit Recovery; `docs/prds/kiln-codex-support/kiln-codex-support-technical-design.md`, §Authoritative evidence and §Workspace uncertainty acknowledgment; `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Completion Evidence and Errors; `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Provider Sessions and Development Delivery and §Recovery and Upgrade; `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md` (workspace predicates only); `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md` (workspace predicates only).

## Interfaces and saved records

Remove outside-workspace facts, prompts and acceptance controls from snapshots, both recovery layouts and public CLI help. Remove the confirmation endpoints and public command. Legacy saved control receipts remain readable; new retired requests are refused without changing state. Old phase facts can be loaded but confinement audits/confirmations are discarded and the retired check is filtered from retained stop/wait rows before display or completion evaluation. Old inspection caches filter the same retired rows/fields; contaminated cached recovery prompts become unavailable until the controller regenerates them, preserving exact user text rather than editing it heuristically. Do not auto-accept a saved stop: the next normal Verify/Resume uses fresh remaining requirements. No schema-version bump is needed for removing optional historical evidence. The persistent verification-success banner is removed; execution state supplies the outcome. Other actionable notices remain, with a non-shrinking dismiss button.

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md` (outside-confirmation control only); the confirmation API and snapshot sections of the multi-repo and Codex designs above.

## Validation

Use real temporary Git repositories to prove valid work advances despite unknown or outside calls and that dirty/wrong-branch/unpushed work still stops. Exercise saved-stop recovery, usage/interruption and final-delivery paths, retired CLI/API controls and browser handoff without workspace controls or a success banner. Keep the provider evidence contract tests for required audit/test/deployment receipts.

## Implementation validation — 2026-10-31

| Criterion | Evidence |
| --- | --- |
| AC-CHECK-01 | Real Git tests advance despite recorded outside edits, unrelated parallel writes, unknown Codex calls and missing confinement transcripts. Audit admission, completion accounting, interruption, usage and final-delivery integrations exercise the same retirement. |
| AC-CHECK-02 | Dirty/unpushed and wrong-branch work, final-delivery qualification, runtime ownership and cleanup checks retain their existing integration coverage. Provider receipt tests accept authentic results despite unrelated unsupported calls and reject missing, ambiguous or undecodable required command inputs. |
| AC-CHECK-03 | Saved-record migration, offline inspection caches, immutable audit-history presentation, retired CLI/API requests and both browser recovery layouts are covered. Exact user replies are preserved. |
| AC-CHECK-04 | A real browser verification response creates no persistent success notice; the engine/browser workflow retains the resulting execution state and requested pause. Narrow browser screenshots were inspected for both recovery layouts. |

The full integration run completed with 1,327 passing tests, seven failures and three skips. Six failures were addressed: obsolete confinement expectations were removed or updated, cached recovery instructions were invalidated correctly, and independent Codex availability/output refresh was restored. Fresh targeted reruns passed for the affected recovery cases (40 Codex workflow/workspace/usage tests plus the cache, interruption and billing migration regressions).

One unrelated baseline failure remains in `src/engine/audit-workflow.integration.test.ts`, “retains a failed handback observation when an audit completion read is unavailable.” It deletes the technical design in the original shared checkout while the assigned worktree still has it, then expects the active execution to reject that absence. The same failure was reproduced in a temporary archive of the unchanged source baseline; this change does not alter that behavior.

Final `npm run verify:development` passed: dependency audit, ESLint, TypeScript/Svelte checks, 711 unit tests, 14 release tests, build and 18 Codex proof tests.

## Deliverable recheck — 2026-10-31

Doug requested a fresh deliverable review before pushing and updating the local installation. The review found two remaining gaps: some unsupported unrelated provider records could still invalidate authentic required receipts, and several historical design sections lacked an applicable supersession notice. Receipt projection now omits unsupported per-call inputs/native records without weakening source identity, delegation, stability or command/result correlation. All seven affected historical technical designs carry a document-wide scoped supersession notice. Installed-package expectations no longer advertise the retired command, and the installed CLI explicitly omits/refuses it.

Fourteen additional real-history cases reproduced the projection gaps before the fix and pass afterwards; the receipt matrix now has 21 passing tests. The complete focused provider-evidence set passes 82 tests. A fresh independent full deliverable review and its fix check found no remaining findings; separate reviewer runs passed 33 unit tests and 36 engine/receipt integration tests. Final `npm run verify:development` passes again. The earlier unrelated full-suite baseline limitation above remains unchanged.

The final archive passes all nine installed-package tests, including actual CLI refusal/help and browser/assets/fonts startup. Archive SHA-256: `c91706ed41a76e1cf01eea400db8e6ff06c6345b1c09a736d07224db782303ea`.

## Forked Codex compaction recovery — 2026-10-31

The reported audit failure reproduced against an unchanged source archive: full-history child forks continued their inherited window lineage, which the reader incorrectly compared with the child file’s new window. The corrected reader authenticated all 11 conversations and 229 command receipts in the retained real audit tree through read-only Codex history calls, without dispatching model work or changing the execution. Regression fixtures sanitize task text, ciphertext and identities; tests require exact original-owner receipts once across copied and nested compaction, and reject altered or missing provenance. Unavailable audit reads retain a visible stop across automatic settlement and restart; explicit Resume, including billing holds, cannot turn an unknown completion check into new work.

Validation: dependency audit, ESLint, TypeScript/Svelte, 725 unit tests, 14 release checks and 18 Codex protocol proofs pass. The broad integration run completed all 112 files with 1,370 passing cases and three platform skips; its only failure is the already-documented original-checkout handback expectation above. Final affected-source reruns pass 89 provider-evidence cases and five recovery workflows. The patched archive passes all nine installed-package checks, and the installed reader repeats the real 11-conversation/229-receipt proof. Independent deliverable review and test hardening completed; existing evidence and permission requirements were preserved.

## Ownership deadlines and actionable snapshot differences — 2026-10-31

The reported follow-up reproduced with the real production ownership monitor: blocking the controller event loop for 6.5 seconds falsely expired a healthy OS query. The private helper now owns the actual five-second query deadline and returns only numeric identities. Installed Node v26.9.0 completes the same busy-controller proof without a failure; a separately stalled query still exits within its real five-second budget. Snapshot diagnostics now name changed or added assigned files, and real Git admission tests preserve report exclusions, phase-status normalization and mode-change detection without accepting stale work.

Independent deliverable review found no further issues; independent test hardening added the measured deadline and normalization/mode regressions. All 118 cases in the two affected integration files and all nine installed-package checks pass. The installed code matches candidate archive SHA-256 `ba74de984dff51238975ec1aa9a359738b1e517016b72032ca16d8b818ab7789`.

Final broad verification: dependency audit, ESLint, TypeScript/Svelte, 725 unit tests, 14 release checks and 18 Codex protocol proofs pass. The full integration run completed all 112 files with 1,381 passing tests and three platform skips; its sole failure is the documented original-checkout handback expectation above. The final affected-file rerun passes all 118 cases.
