# Kiln completion audits — current behavior and method findings

Checked 2026-10-24. Kiln baseline: `886f31f60165b9fc8f799db42832150af5feddbd`. Enso Method baseline: `1d79b09f5aacd5af483fa223e32eea1ca64623a1` in the sibling `enso-method` repository. This was a source and requirements review; implementation code, technical design and phase sizing were outside that review. No live Kiln execution or application tests were run.

## What Kiln currently does

| Finding | Source at the Kiln baseline |
|---|---|
| On startup/recovery and in the execution loop, no open implementation leaf leads directly to the final repository check or final-delivery session. There is no intervening delivery or test audit. | `src/engine/engine.ts`, `decideQuietly` and `drive`, especially the calls to `nextExecutionLeaf`, `pullRequestCheck` and `runPullRequestSession` |
| Plan selection already reads phase files again and selects the next unclosed leaf. That supports following an updated plan, but does not itself initiate an audit or establish an audit outcome. | `src/engine/plan-reading.ts`, `readPlanAt`, `nextLeaf`; `src/engine/engine.ts`, `nextExecutionLeaf` |
| Normal phase completion checks Closed, Committed, Pushed and workspace compliance. Development-delivery reconciliation can add required deployment and verification evidence. These checks do not audit whole-PRD acceptance criteria. | `src/engine/checks.ts`, `runDoneCheck`; `src/engine/engine.ts`, `unresolvedDeliveryLeaf`; development-deployments PRD AC-DEV-03 |
| Implementation sessions are explicitly finished when their phase document is Closed and the work is committed and pushed. The final prompt assumes every phase is implemented. | `prompts/phase-session.txt`, `prompts/pull-request-session.txt` |
| Current integration coverage expects implementation leaves followed by final delivery; it includes bypassing the final session when a suitable pull request already exists. | `src/engine/engine.integration.test.ts`, “runs each unclosed leaf…” and “completes with no pull-request session…” |
| Final delivery is broader than opening one PR. Multi-repository and development-delivery changes recognize work already integrated, mixed outcomes and remaining review work. Required development checkpoints can happen before the end. | Multi-repository delivery PRD AC-PRS-05; development-deployments PRD AC-DEV-01 and AC-DELIVER-04; `prompts/development-finalization.txt` |

The shared checkout had a pre-existing staged README edit, and another session was completing development-deployment work in its own worktree. Neither was changed by this investigation. The technical design must reconcile any newer delivery behavior before implementation.

## Reconciliation with current development code

The design worktree was updated on 2026-10-24 after fetching `origin/develop` at `390f99451a0c2865fca4c365d4812f3b0f2008a2`. Its source, prompts, view, tests and other files outside this change directory now match that development commit exactly. The eleven unpublished requirements commits were replayed without patch changes; `git range-diff` confirms every old/new pair is equivalent, including the empty workflow-record commits. Original history remains reachable through the read-only predecessor worktrees and local tag `completiona-design-before-code-sync-20261024` at `3d549b2`.

| Newer commit | Effect on this design |
|---|---|
| `362c92b` — development-deployment delivery audit | Adds the planned recovery-guidance completion phase; its behavior is covered by this design's recovery and development-delivery contracts. |
| `ed773ea` — current authority in recovered sessions | Adds the copyable manual recovery prompt and delivery-finalization continuation. The design already preserves these in Existing Code, Provider Sessions and Development Delivery, and Recovery and Upgrade. |
| `e85cb57` — development-delivery test coverage | Adds test evidence for grants, current artifact/PR checks, completed-execution recovery and display. It changes no runtime behavior or requirements; retain this coverage during implementation. |
| `390f994` — development-delivery publication record | Records authorization and audit closure for that separate delivery work. It changes no runtime behavior and grants no publication authority for completion audits. |

The current-code check found no additional design change necessary. The PRD, technical design, confirmed assumption and stakeholder HTML remained byte-identical through the update. Verification was Git/content comparison and source review; no application tests were rerun because this update changed no code relative to the fetched development baseline. The shared checkout's staged README and both predecessor worktrees remain untouched.

## What the Enso Method currently requires

The following paths are relative to the Enso Method repository, not Kiln.

| Source | Relevant rule |
|---|---|
| `skills/implement-from-requirements/SKILL.md`, Phase 8 | After the last leaf of a split PRD, hand off to a fresh whole-PRD delivery audit if none has run; otherwise hand off to the test audit. |
| `skills/delivery-audit/SKILL.md`, Scope, Statuses and Steps 2–5 | Independently trace applicable criteria through reachable code, confirm gaps, and add completion phases. Do not implement those gaps in the audit session. A no-gap result hands off to test-audit. |
| `skills/phase-split/SKILL.md`, Completion Phases | Append new top-level phase IDs, mark the audit origin, retain original ownership and Closed lines, and describe missing behavior. Completion phases are ordinary implementation leaves and may themselves split. |
| `skills/test-audit/SKILL.md`, Steps 5–6 | Strengthen tests to at least Adequate, continue test remediation through the audit record, and route substantial missing implementation to completion phases. Small implementation fixes can happen in the audit. A Done status can still have blocked rows, so Kiln must inspect unresolved work rather than trust that word alone. |
| `skills/pre-commit-validation/SKILL.md`, Who Commits | Delivery audit commits records, possibly an empty commit, but does not push by default. Test audit commits its work and normally pushes feature branches. Kiln must supply explicit scoped authority consistent with its pushed-work checks. |

## What this change deliberately adds

Doug’s request is correct about the missing final checks and audit-generated completion phases. Repeating the delivery audit after implementing those phases is stronger than the current method’s history-based handoff. The new PRD makes that behavior explicit, while retaining the method’s separate implementation and audit sessions.

Doug explicitly confirmed inclusion of the final test audit in this conversation. The proposed workflow therefore covers both its test-remediation continuations and its own delivery-gap phases. It also prevents existing pull requests or early development merges from bypassing either audit.

The PRD specifies observable outcomes. The technical design must choose how Kiln receives and validates audit results, associates them with checked work across repositories, distinguishes audit-only record changes from substantive changes, and recovers each stage for both supported agents. It must not treat an agent’s prose or an old completion commit as proof that current work has passed.
