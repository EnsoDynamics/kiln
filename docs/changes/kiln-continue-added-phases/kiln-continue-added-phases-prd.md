# PRD: Kiln Continue Added Phases

## Summary

When new implementation phases are added to a PRD Kiln previously finished, Kiln notices the additional work and offers **Continue with N phases** on the existing feature page. The person reviews what was found, continues once, and Kiln runs the remaining plan through its normal checks, audits and delivery. Earlier completed work and its delivery history remain visible.

When the run is still underway and the person takes over an agent session, phases added during that session join the remaining plan automatically when control returns to Kiln. The person does not have to approve each addition or launch it by hand.

## Business Context

Stakeholder feedback can change assumptions after a feature has shipped. A separate Claude Code or Codex session then amends the requirements and writes additional phases. Today a recorded completion can take Kiln straight back to Complete, while its plan reader uses the earlier worktree. New documents in the shared checkout can therefore be absent from the page.

The fictional **Comet Library** example uses repository `comet-library` and `docs/prds/library-catalog/`. Seven phases were delivered, phase 8 was completed separately, and phases 9–15 add catalog and lending features. Phase 9 explicitly includes integrating phase 8 as its first step, with applicable authorization. There are seven new unfinished phases, not eight just because the highest number is 15. Kiln must discover real work and its prerequisites, rather than infer it from the highest phase number.

All project names, phase titles, branches and sample revisions in this example are invented. Current-behavior references within Kiln: `src/engine/engine.ts` (`prepare`, `decideQuietly`, `readPlan`) and `src/engine/plan-reading.ts` (`nextLeaf`, `recordedPlan`).

## Acceptance Criteria

### Pick up phases added during a manual session

A person may resume a Kiln session in Claude Code or Codex, discuss changed requirements, and let that session write extra phases. Returning control to Kiln must pick up that revised plan just as an ordinary phase split does.

- [x] **AC-HANDBACK-01 — Every return reads the revised plan.** Before deciding what to run after a manual session resume, an explicit completion check/advance, or restarting an unfinished Kiln run, Kiln rereads the current PRD and phase plan. It recognizes appended phases and split leaves regardless of whether they were written by the original Kiln conversation, a manually resumed conversation, or a separate session. The return shows which phases were added and the updated remaining count.
- [x] **AC-HANDBACK-02 — Added work continues automatically.** Once the current activity passes its existing completion requirements and control has returned to Kiln, Kiln runs the next eligible unfinished leaf from the revised plan and continues through the normal audits and delivery. It does not require the completed-run Continue action, another approval for each addition, or manually starting another chat. Existing pause requests, dependency checks, account limits and permission boundaries still apply. A plan edit alone never starts work while the person still controls the session.
- [x] **AC-HANDBACK-03 — The assigned worktree owns an unfinished run's plan.** Once the execution worktree is created, Kiln uses that worktree's documents and the normal committed/pushed evidence requirements. It does not automatically read or compare requirements in the original checkout, an explicitly supplied other checkout, or previously recorded sources. Changes or missing documents elsewhere do not block, pause or warn on an active run, including restart, manual handback, preparation, phase advancement and finalization. No acknowledgment, update notice or document-comparison interface is introduced. To adopt outside edits, deliberately integrate them into the assigned worktree; normal active-plan checks then apply. Completed-feature discovery remains governed by AC-FIND-01–03.
  - Superseded in part by: AC-GONE-02 and AC-FACTS-02 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (when the assigned worktree itself is missing, Kiln stops with Folder missing rather than treating it as an unreadable active plan, and reads the plan in the base branch and the feature branch, read-only, outside the assigned worktree; it still never runs from another checkout without the person's choice).
  - Replaces in part: AC-START-02 in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) (unfinished runs still skip startup-only checks; required active-worktree plan documents must be readable and coherent before advancement).
- [x] **AC-HANDBACK-04 — New phases cannot be hidden behind old completion.** Reconciliation occurs before a handback can select final audits/delivery or mark the feature complete. Added work invalidates any completion evidence that does not cover the revised scope. Completed phases keep their results, split parents are not executed, and phases completed outside Kiln require existing completion evidence. The existing explicit choice for resuming a phase that is already complete remains; once the person returns control, no additional new-phases approval is introduced.
  - Superseded in part by: AC-WAIVE-02/09 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a phase completed outside Kiln can also be accepted on a waiver, not only on existing completion evidence).

### Find added work when a finished feature is revisited

A previously completed run is a history of what was delivered. It should also tell the person when the plan now contains more work.

- [x] **AC-FIND-01 — Reopening checks for added phases.** Running the existing `kiln run <PRD>` command again, or opening/reloading the existing feature page while Kiln is running, checks the same PRD for changes before presenting a current “nothing left” conclusion. The finished page also offers **Check for new phases**, with checking, success and failure feedback and the last successful check time. Detection never starts implementation. No background service is introduced. (CONTINUE-001.)
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the unconditional Complete result for a recorded completed feature only).
- [x] **AC-FIND-02 — The check finds plans written outside the old worktree.** Discovery considers the PRD's shared checkout and the latest available configured delivery-base revision, not only the completed run's worktree. The page identifies the source and revision it checked. Saved local additions can be shown as not ready even before they are committed. Missing old worktrees or deleted old feature branches do not prevent discovery from an available authoritative source. If sources disagree in a way that changes the work to run, Kiln explains the conflict and withholds continuation rather than silently choosing. (CONTINUE-002.)
  - Replaces in part: AC-RUN-01 in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) (completed-feature discovery is no longer confined to the old execution worktree; active-workspace execution and plan order remain).
  - Replaces in part: AC-RECOVERY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (positively missing historical workspaces or feature refs do not prevent completed-feature discovery; later work or indeterminate evidence in available assigned workspaces still uses current completion recovery, including current audit gates).
- [x] **AC-FIND-03 — Count actual unfinished work.** Kiln compares the revised plan with the previously accepted plan, using phase identity and its existing split/dependency rules. It shows separately newly added unfinished leaf phases, work completed outside this Kiln run, and any unresolved changes to earlier phases. Split parents, numbering gaps, renamed documents and already completed phases do not inflate the additional-work count. An edit to assumptions alone does not invent a phase or reopen completed work.
- [x] **AC-FIND-04 — Unknown is visibly different from no new work.** An unreadable, invalid, missing or conflicting plan, or an unsuccessful required repository check, shows what could not be checked and a retry action. Prior delivery history remains visible; retained counts and check times are identified as earlier results. Kiln does not report “No new phases found” from a failed or incomplete check. Existing completed records without enough information for a safe comparison show that limitation and the concrete next action.

### Let the person choose to continue

The completed page becomes the starting point for additional work. The person sees what Kiln proposes to run before authorizing it.

- [x] **AC-OFFER-01 — New work is prominent.** When added unfinished phases are found, the feature header says **New phases found** and a prominent panel above earlier delivery history shows their count, phase identifiers and titles in plan order, the first phase to run, and the current readiness result. The page distinguishes the earlier completed delivery from the current unfinished plan. The terminal reports the same discovery and directs the person to the existing feature page.
  - Replaces in part: AC-WATCH-02 and AC-LOOK-01 in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) (completed-feature header and screen gain the discovery result and continuation offer; unaffected screen layout, timing and history remain).
  - Replaces in part: AC-PRS-03, AC-SHOW-01 and AC-SPACE-03 in [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md) (completed-feature presentation gains the discovery panel in both one- and multiple-repository runs; actual repository delivery facts and unaffected visual style remain).
  - Replaces in part: AC-DISPLAY-03 in [Kiln Development Deployments](../kiln-development-deployments/kiln-development-deployments-prd.md) (new-work status and offer precede the earlier completion summary; truthful delivery links, states and history remain).
- [x] **AC-OFFER-02 — One action continues the remaining plan.** **Continue with N phases** starts the ready additional work after checking the displayed proposal is still current. **Not now** starts nothing and retains a visible way to return to the offer; reopening or checking again can show the offer again. An unchanged completed plan retains its ordinary completed page with “No new phases found” and the check time.
- [x] **AC-OFFER-03 — A changed proposal needs a fresh choice.** If the plan, eligible phase set or relevant delivery prerequisites have changed since the offer was shown, Continue refreshes the offer and explains the change without starting work. Repeated clicks, stale browser tabs, process restarts and interrupted preparation cannot launch the same continuation twice or lose whether it was accepted.

### Restart a finished feature without disturbing its earlier delivery

Kiln must use the revised requirements and current code. An old merged branch or old audit result must not make new work appear finished.

- [x] **AC-CONTINUE-01 — Earlier completion stays intact.** Starting additional work preserves earlier phase results, session history, delivery links and completion times, while the overall feature becomes active again. It does not resume the old finished conversation or rerun completed phases. Added phases already completed elsewhere are accepted only through applicable existing completion checks; a Closed line alone is insufficient.
  - Superseded in part by: AC-WAIVE-04/09 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a phase completed on a waived Closed line, or skipped under a waived plan problem, counts as completed and is not rerun).
- **AC-CONTINUE-02 — retired, split into AC-CONTINUE-06 and AC-CONTINUE-07.**
- [x] **AC-CONTINUE-06 — Continuation starts from the current delivery base.** A previously finished run restarts from the current configured delivery base with the revised PRD, design and phase documents committed together. When earlier prerequisites are integrated and verified in every affected repository, Kiln starts the next unfinished phase. Unrelated changes and other sessions’ work remain intact; no manual state-file deletion or recreation of the old branch/worktree is required. (CONTINUE-002.)
  - Replaces in part: AC-START-07 in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md) (an accepted continuation of a finished run uses a fresh execution workspace and branch rather than reusing the old delivered ones; phases within each execution still share its branch and workspace).
  - Replaces in part: AC-SPACE-01 and AC-PRS-04 in [Kiln Multi-Repo Delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md) (workspace, branch and current base bindings are established for the fresh continuation execution; existing setup protections and repository/merge/deployment permission boundaries remain).
- [x] **AC-CONTINUE-07 — Kiln prepares prerequisites before dependent implementation.** When the next phase explicitly includes preparation using an identified, available source and existing permissions authorize it, Kiln starts that phase with the preparation, verifies its outcome, then begins dependent implementation. A documented prerequisite integration is not an invalid plan merely because that earlier phase is not yet in the delivery base. The person does not have to perform that preparation first. Prerequisites in every affected repository follow the table below.
  - Superseded in part by: AC-WAIVE-02/04 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a phase stopped because its preparation cannot complete can be marked complete without its dependent implementation).

  | Prerequisite condition | Continuation behavior |
  |---|---|
  | Earlier work integrated and verified | Start the next unfinished phase, under AC-CONTINUE-06. |
  | Next phase explicitly includes preparation using an identified, available source, and existing permissions authorize it | Start that phase with the preparation, verify its outcome, then begin dependent implementation. Do not require the person to perform that preparation first. |
  | Source, authority or safe workspace unavailable; preparation cannot complete | Explain the specific blocker and recovery action; do not begin dependent implementation or claim completion. |

- [x] **AC-CONTINUE-03 — Ambiguous changes are not treated as additions.** If previously completed phase identities are removed, reused, reopened or materially changed so earlier completion cannot be safely carried forward, Kiln shows the affected phases and asks for the plan to be reconciled. Mere renaming, formatting or unchanged historical closure metadata does not trigger a rerun. The first release supports adding work to an intact completed plan; it does not decide which earlier implementation to undo.
- **AC-CONTINUE-04 — retired, split into AC-CONTINUE-08 and AC-CONTINUE-09.**
- [x] **AC-CONTINUE-08 — Existing controls still govern the work.** Both Claude Code and Codex use the existing agent/model settings, billing restrictions, pause/resume behavior, workspace protections and repository/deployment permissions. Continue authorizes running the displayed additional plan; it does not grant broader merge, production or spending authority. New repositories pass the existing setup/authorization checks before work in them starts.

- [x] **AC-CONTINUE-09 — Early-merge permission is a separate choice.** When planned preparation requires an uncovered delivery-base target, the completed page offers the existing **Authorize early merges** action before Continue, showing the exact repository/branch and warning that its existing CI/CD may run before the PRD finishes. Authorization applies only to the proposed fresh run, changes no saved preference and starts no work; Continue remains a separate choice.
  - Replaces in part: AC-PERMIT-05 in [Kiln Development Deployments](../kiln-development-deployments/kiln-development-deployments-prd.md) (the existing target-grant action is also available before accepting a completed-feature continuation; its scope, disclosure and separate resume/continue behavior remain).
- [x] **AC-CONTINUE-05 — Additional work finishes through normal audits and delivery.** Once accepted, Kiln advances through eligible remaining phases and any completion phases its normal audits add, without requiring a new continuation click between them. Whole-PRD audit and final delivery evidence must cover the revised requirements and work. Earlier successful audits or merged PRs cannot satisfy completion for the new work. A new delivery is recorded alongside earlier deliveries when the current work meets the existing completion rules.

## Readiness examples

For a previously finished run, the same rules apply whether feedback adds one phase or several. Active-run handback follows AC-HANDBACK-01–04 instead of the finished-run approval and integrated-base requirements.

| Plan found | Result |
|---|---|
| Seven finished phases plus eight new unfinished phases, all prerequisites present | “8 new phases found”; Continue with 8 phases. |
| Comet Library’s phases 9–15 present; phase 9 includes authorized integration of available phase 8 work | “7 new phases found”; Continue with 7 phases starts phase 9’s preparation. Phase 8 is shown as awaiting integration until that work is verified. |
| The phase 8 source cannot be accessed, or required preparation is not authorized | “7 new phases found”; explain the blocker, with continuation unavailable until resolved. |
| Phase 8 subsequently integrated and verified complete; phases 9–15 unfinished | “7 new phases found”; eight completed, fifteen total; Continue with 7 phases, beginning at phase 9. |
| Added phases saved locally but not committed in the delivery base | Show the additions as not ready and identify which documents must be committed/integrated. |
| Earlier delivery has an open, unmerged PR | Apply AC-CONTINUE-06/07’s prerequisite rules, including authorized preparation when explicitly planned; do not silently extend the earlier PR. |
| No new unfinished phase; only wording or assumption changes | No new phases; no implementation starts. |
| Earlier completion cannot be reconciled, or a required source cannot be read | Explain the unresolved condition; do not offer an executable continuation. |

## Mock-up

[Open the interactive continuation mock-up](mockups/kiln-continue-added-phases.html).

| Preview state | What it illustrates |
|---|---|
| Return from manual session | An unfinished run accepts newly added work and automatically continues after the current phase passes; AC-HANDBACK-01/02/03/04. |
| New phases | Comet Library’s ready-to-prepare scenario, with phase 9 integrating phase 8; AC-FIND-03, AC-OFFER-01/02. |
| Missing prerequisite | Illustrative unavailable phase 8 source; AC-CONTINUE-07. |
| Permission required | A planned delivery-base integration needs the existing target grant; authorizing updates readiness but work still waits for Continue; AC-CONTINUE-09. |
| Continuing | Phase 9 active with the earlier delivery preserved; AC-CONTINUE-01/08/05. |
| No new work | The completed view after an unchanged-plan check; AC-OFFER-02. |
| Check failed | A failed source read with prior results labelled; AC-FIND-04. |

The ready and continuing scenarios assume the documented preparation source and authority have been checked. Every project detail and phase title is fictional; check times and execution state are simulated. Preview controls are not product controls.

## Assumptions

Two scope choices are proposed in [the assumptions document](kiln-continue-added-phases-assumptions.md): when automatic checking happens (CONTINUE-001), and requiring a committed, integrated plan when restarting a finished run (CONTINUE-002).

## Out of Scope

- Processing stakeholder feedback, generating missing phases, or inferring implementation work from prose changes alone.
- Automatically undoing/reopening completed phases, discovering arbitrary unrelated branches or other PRDs, or running a PRD roadmap.
- A background monitor while Kiln is closed, notifications to external services, or automatic implementation on discovery.
