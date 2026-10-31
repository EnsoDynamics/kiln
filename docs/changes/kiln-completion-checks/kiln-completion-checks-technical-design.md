# Technical design: Kiln completion checks

**PRD:** [Kiln completion checks](kiln-completion-checks-prd.md).

## Existing code

Preserve the existing controller, Git evaluators, runtime ownership, permissions, provider identities and audit/delivery receipt admission. Remove only the workspace-confinement audit and its presentation/control surfaces. The unchanged phase prompts still direct agents to their assigned worktrees and branch.

## Completion and recovery

Completion evaluators have no workspace-history predicate. Phase closure, clean assigned worktrees, correct branch and matching pushed heads remain mandatory. Final delivery keeps its existing PR or verified integration rules and current audit requirements. Interruptions and usage waits retain conversation availability, cleanup and permission safeguards without scanning for outside changes. Completion accounting validates retained scope-bound Git receipts without requiring a confinement scan of historic provider conversations.

Required test, audit and deployment evidence remains authenticated against provider-owned history. Receipt projection may ignore unsupported unrelated calls; it must never manufacture a required command, successful result or mutation from an undecodable input. Unknown unrelated calls and observed outside changes do not invalidate otherwise authentic receipts. Source ownership, stable/readable history, exact command/result correlation and required evidence/currentness remain enforced.

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
