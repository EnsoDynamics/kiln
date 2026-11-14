# PRD: Kiln development deployments

**Source:** Doug’s branch-only authorization correction, 2026-10-26, conversation `01a17975-ea88-7082-ae74-c10be2ad7121`;  Doug’s approved request, 2026-10-24, Codex conversation `01a16dea-9c95-7511-9d65-7bb51eb0f49e`.

## Summary

Let the person authorize early merges from Kiln’s feature branch into a named repository’s configured base branch, usually develop, when deployment or verification is needed to complete a PRD. The repository’s existing CI/CD determines what happens after that merge. Kiln continues through later phases and reports which work was already merged and which still needs review.

The option is off by default. Without it, Kiln keeps its existing delivery contract: Kiln itself keeps work on its feature branch and ends with a ready pull request or read-only proof that the current feature commit is already in the intended base, per AC-PRS-05 of [multi-repository delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md). Recognizing a separate merge grants no merge or deployment permission. The option grants no destructive-operation permission or authority to release through a different branch or workflow.

## Business Context

An overnight Kiln session had already pushed its feature work when it stopped: completing the phase required deployment to DEV, but Kiln’s instructions prohibited merging into develop. The person granted that permission the next morning. The resulting loss of unattended time was avoidable for a project where early development delivery was acceptable.

The person approves the repository and Git branch. Kiln does not require an environment name or a non-production declaration: the repository owner is responsible for where that branch’s CI/CD deploys, including if develop deploys to production. A global permission that silently applies across projects would hide the branch decision.

Early delivery also changes what completion means. A merged pull request is no longer open; later work may need another pull request; repositories may finish in different delivery states. Permission, continuation, recovery and the final result must all agree about this behavior.

## Terms

- An **early merge target** is a particular repository and its configured base branch approved by the person. A **deployment target** additionally records the actual environment discovered from the project’s workflow for delivery evidence; the person does not supply it to grant merge permission.
- A **delivery checkpoint** is the tested work being merged to support a required development deployment or verification. A phase can still be open because its verification depends on that deployment.
- **Delivered work** is work confirmed merged into its approved target. This does not by itself mean deployment succeeded, verification passed, or the phase is complete.
- The **current PRD execution** is the work begun by pressing Start for one PRD, including its later sessions and recoveries. Permission is scoped to that execution, not to every PRD on the machine.

## Acceptance Criteria

### Choose the permission before leaving Kiln unattended

The person makes a deliberate decision for the current PRD before Start. Every new PRD starts with early merges off and no selected targets.

- [x] **AC-PERMIT-01 — Early merges are optional.** Before Start, Kiln offers “Allow early merges,” off by default. Enabling it authorizes only the selected repository branches under AC-DEV-01. Leaving it off retains feature-branch work followed by a review PR. Existing restricted executions remain restricted after an upgrade.
- [x] **AC-PERMIT-02 — One choice covers the listed repository branches.** Before Start, “Allow early merges” authorizes all participating repositories at their configured base branches for this PRD. Kiln lists the repository/branch pairs as a read-only summary; no individual selection is required, including when there is only one repository. The list reflects configured branch changes before Start, and Start saves that exact scope atomically. The disclosure explains that early merges may trigger existing CI/CD before the PRD finishes. No environment entry or non-production attestation is required. Repositories added after Start and other branches receive no permission from this checkbox. Older not-yet-started setups retain their complete earlier scope until the person selects the new all-repositories choice; their summary identifies that limited scope.
  - Replaces in part: AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the authorization summary and unconditional prohibition on merging and deploying, for explicitly authorized targets).
- [x] **AC-PERMIT-03 — Early-merge choices belong to the current PRD.** The option and selected repository branches apply only to the current PRD execution. Kiln offers no remember or reuse controls and stores no cross-PRD early-merge preferences. Every new PRD starts with early merges off and no selected targets, even in the same repository or checkout. Existing executions retain their effective choices and approved grants across sessions and restarts; upgrading does not broaden or revoke them. Previously granted environment-limited permissions retain their narrower scope until explicitly replaced by a branch grant.
  - Superseded in part by: AC-SAFE-03 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (a base-branch start carries the run's effective early-merge choice and approved targets into its fresh execution).
- [x] **AC-PERMIT-04 — Permission survives without silently growing.** Once Start is pressed, the effective option and approved target set are retained for that execution across sessions and restarts. Repositories added later can still be used under the existing workspace rules, but gain no early merge or deployment authority unless covered by that execution’s approved targets. If work requires an uncovered target, Needs you identifies it and the authorization needed under AC-PERMIT-05.
  - Superseded in part by: AC-SAFE-03 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (a base-branch start carries the run's effective early-merge choice and approved targets into its fresh execution).
- [x] **AC-PERMIT-05 — The person can authorize early merges for this run.** At Needs you, “Authorize early merges” approves the displayed repository and base branch with the same wording and disclosure as setup, without an environment field or non-production checkbox. The grant persists across sessions and restarts for this execution, applies only to this execution and does not resume work. Already-authorized branches show their status instead of a duplicate action. Resume alone, notes and settings changes grant nothing (AUTH-002).
  - Superseded in part by: AC-CONTINUE-09 in [Kiln Continue Added Phases](../kiln-continue-added-phases/kiln-continue-added-phases-prd.md) (the same separate exact-target action is also available before accepting a completed-feature continuation; existing scope and no-resume guarantees remain).

### Deliver only the development work needed to finish the PRD

The option removes a known permission stop. It does not turn every phase into an automatic release or replace the project’s checks with the agent’s confidence.

- [x] **AC-DEV-01 — Required development delivery can happen before the end.** In an authorized repository, a session may open or reuse an appropriate pull request from the PRD’s feature branch into the approved base branch, merge a delivery checkpoint, and carry out the project’s documented development deployment and verification when needed for the PRD’s acceptance criteria. It does not need another confirmation for actions already covered by that permission. It does not merge simply because a phase ended or because the PRD is finishing.
  - Replaces in part: AC-RUN-03 and AC-PR-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the prohibition on early pull requests, merging, waiting on checks to merge, and development deployment, only within the approved scope).
  - Replaces in part: AC-START-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the prohibition on phase-time pull requests; the assigned feature branches and worktrees remain the working locations).
  - Replaces in part: AC-WORK-01 and AC-WORK-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex’s unconditional no-merge/no-deploy boundary; agent selection alone still grants no additional authority).
- [x] **AC-DEV-02 — Normal checks and protections still apply.** A checkpoint is merged only after its required pre-merge tests, checks and reviews pass for the work being merged. Kiln’s permission does not bypass branch protection, waive required human review, authorize force pushes, or allow unrelated work to be merged. Routine fixes within scope can proceed unattended; a missing required approval or unresolved blocker returns to Needs you. The phase need not already be Closed when its required verification depends on the deployment.
- [x] **AC-DEV-03 — Deployment and verification have their own outcomes.** The saved result distinguishes a confirmed merge, deployment of the intended work to the environment identified from the project’s workflow, and the required verification’s result. A merged pull request alone never establishes the latter two. Missing or failed required development evidence prevents a phase this run delivers from being treated as complete, even if its document was marked Closed. A phase this run did not deliver owes no development evidence: one already Closed in the delivery base the run started from, with no Kiln session on it or on a phase it was split from, and no delivery assessment or obligation assigned to it. Kiln accepts such a phase on the checks that apply with early merges off, so turning early merges on at Start never makes it harder to accept. A phase closed during the run, by a session or by hand, still owes its evidence. Authorizing early merges later, at Needs you, still has its first session assess the earlier Closed phases (technical design, “One evaluator at every transition”). The person can inspect the evidence or failure identifying the work and target; the agent’s success prose alone is insufficient.
  - Superseded in part by: AC-WAIVE-04/09 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (failed required development evidence gives way to a waiver).
  - Replaces in part: AC-CHECK-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (for phases requiring development delivery, Closed, Committed and Pushed are insufficient without the required deployment and verification evidence; their existing checks remain).
  - Replaces in part: AC-RUN-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an earlier phase with unresolved required development delivery is reconciled before selecting the next unclosed leaf; sequential plan order remains).
  - Replaces in part: AC-RUN-03, AC-DONE-01 and AC-DONE-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Closed, Committed and Pushed, together with existing workspace checks, are insufficient for phases with unresolved required development delivery).
  - Superseded in part by: AC-FROM-02 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md` (phases closed on the chosen branch count as closed before the run).
- [x] **AC-DEV-04 — The permission has a clear boundary.** It covers only this PRD’s required early merges into explicitly approved repository branches and their documented delivery workflow. The repository owner controls what those branches deploy; Kiln requires no classification or attestation of the environment. It does not authorize another release branch, an unrelated workflow, destructive operations, unrelated data or infrastructure changes, or changes in another person’s checkout. Existing checks and protections remain in force.

### Keep building after an early merge

Work may need more than one development delivery before it is finished. Earlier deliveries must not hide later changes or leave Kiln unable to continue.

- [x] **AC-DELIVER-01 — Later phases continue safely.** After an early merge, subsequent phases continue with the PRD’s accumulated work in its assigned workspace. A later change is treated as new work, not as already delivered because an earlier pull request merged. The delivery history identifies the repository, target, pull request and work covered by each confirmed merge.
- [x] **AC-DELIVER-02 — Further delivery neither duplicates nor loses work.** When additional development delivery is needed, Kiln reuses a suitable open pull request or obtains a new one for the remaining work. It does not reuse a merged pull request as though it were still open, repeat already delivered changes unnecessarily, or mistake a closed-but-unmerged pull request for delivery. Merge, squash and rebase outcomes are distinguished correctly; repository-side branch deletion must not lose the ongoing work or cause an unrelated branch to be used. If continuation cannot be established safely, Needs you identifies the obstacle without claiming completion.
- [x] **AC-DELIVER-03 — Each repository keeps its own delivery result.** Only repositories with approved development targets may merge early. Dependencies between repositories govern the necessary delivery order, and a failure in one prevents dependent verification from being reported successful. Other repositories’ completed deliveries remain recorded. Related pull requests identify the PRD, link its related deliveries and state any required order, including when those deliveries happened earlier.
  - Superseded in part by: AC-WAIVE-09 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a prerequisite checkpoint resolved only by waiver counts as resolved for its dependents, WAIVE-004).
  - Replaces in part: AC-PRS-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (authorized development delivery may follow the documented merge order; links include earlier deliveries rather than only simultaneously open pull requests).
- [x] **AC-DELIVER-04 — Completion accounts for all the remaining work.** Once all phases satisfy their completion checks, each changed repository must meet the applicable row below. Kiln verifies those results from repository and pull-request evidence, not a session’s claim. Existing workspace checks still apply. The PRD is complete only when every repository qualifies and all required development verification is satisfied.
  - Superseded in part by: AC-CHECK-01 in `docs/changes/kiln-completion-checks/kiln-completion-checks-prd.md` (workspace auditing and acceptance only; independent completion requirements remain).
  - Superseded in part by: AC-AUDIT-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (final completion also requires successful current delivery and test audits).
  - Superseded in part by: AC-WAIVE-04/09 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (the final requirements that every repository qualifies and all development verification is satisfied give way to a waiver).

  | Repository’s work | Required final result |
  |---|---|
  | No early delivery; work remains for review | An open, non-draft pull request containing the remaining work into its configured base branch |
  | Earlier work delivered; later work remains for review | The earlier deliveries recorded and an open, non-draft pull request containing all remaining work |
  | All work confirmed delivered | The confirmed delivery history; no empty or duplicate final pull request |
  | Delivery or required verification is unresolved | Not complete; the unresolved result is visible |

  Enabling development deployments does not itself authorize merging the remaining final review work. A final session is needed only when there is outstanding finalization work, and its task reflects what remains.
  - Replaces in part: AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (one open pull request per changed repository is replaced by the applicable final result for executions using authorized early delivery).
  - Replaces in part: AC-WORK-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the final delivery check accepts confirmed earlier deliveries; Codex evidence and workspace-check requirements remain).
  - Replaces in part: AC-WORK-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (the open-pull-request endpoint and mandatory final pull-request session give way to the applicable final result and outstanding finalization work; Codex remains the selected agent).

### Recover with the same authority and accurate evidence

An interruption must not lose permission already granted, repeat a completed merge, or turn an uncertain deployment into a success.

- [x] **AC-RECOVERY-01 — Every continuation uses the saved scope.** Initial sessions, later phases, automatic recovery, manual reply/resume in Kiln, and fresh-session recovery guidance carry the execution’s effective authorization. Claude Code and Codex receive consistent boundaries. In those Kiln-launched continuations, an authorized action is not simultaneously forbidden by an older generic instruction. Opening an existing conversation in a terminal requires only its resume command: the browser does not display or require an additional recovery prompt, including after a permission change. The person can discuss changed instructions directly in that conversation. Recovery never broadens the target set by itself.
- [x] **AC-RECOVERY-02 — Interrupted delivery is checked before it is repeated.** After restart, sleep, a usage stop, manual recovery or Check again, Kiln reconciles saved delivery facts with the actual repository, pull-request and applicable deployment state before retrying an action or accepting completion. This includes an operation accepted remotely before its result was saved locally. Unavailable or inconclusive evidence remains unresolved; it is not success or a reason to perform the same side effect blindly.
- [x] **AC-RECOVERY-03 — Completion checks mean the same thing everywhere.** Phase and final-delivery decisions apply the same criteria after sessions, before resuming, after manual work, at Check again, and when reopening a saved execution. A final-check pass must not discard a reply or advance the plan based only on an earlier open or merged pull request that no longer accounts for the current work.
  - Superseded in part by: AC-FIND-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (positively missing historical workspaces/feature refs do not prevent completed-feature discovery; later available-work changes, indeterminate current evidence and current audit gates retain this recovery contract).
  - Superseded in part by: AC-AUDIT-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (final-session Resume also requires successful current completion audits).
  - Replaces in part: AC-PRS-05 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (final-session resume eligibility uses the applicable completion result in AC-DELIVER-04).
  - Replaces in part: AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (the final-session completion precheck uses AC-DELIVER-04 rather than requiring all pull requests to be open).
  - Replaces in part: AC-CLI-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (executions using development deployments reconcile current work and delivery evidence when reopened instead of treating recorded completion as sufficient; restricted executions retain historical completion).

### Show what is authorized and what actually happened

The interface should make early development delivery understandable without requiring the person to reconstruct the session history.

- [x] **AC-DISPLAY-01 — The effective permission stays visible.** Setup, Needs you and ongoing settings consistently describe “early merges” and show each repository and base branch. Before Start, compact repository cards summarize every covered branch without individual checkboxes. Needs you distinguishes authorized and unavailable actions, including disconnected or busy states. Explain once that required checks still apply and existing CI/CD may run before the PRD finishes. No authorization screen requires an environment name or non-production attestation. Restricted executions retain the normal final-review-PR explanation.
  - Replaces in part: AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the ongoing settings explanation and stated delivery endpoint for authorized development deployments).
- [x] **AC-DISPLAY-02 — Progress distinguishes delivery from verification.** Browser progress, phase details, stopped states, recovery instructions and terminal messages identify the relevant repository and distinguish merging, deployment, verification and further implementation when those activities occur. A historical Push indication must not stand in for current development delivery. Existing running/waiting times, separate Follow-up indication and evidence-based progress remain accurate.
  - Replaces in part: AC-WATCH-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the six-step display also distinguishes authorized development-delivery activity; existing steps and Follow-up remain).
  - Replaces in part: AC-VIEW-03 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex progress also distinguishes authorized development-delivery activity without inventing completion).
- [x] **AC-DISPLAY-03 — Completion shows delivered work and work awaiting review.** The final browser and terminal summaries identify each repository’s confirmed deliveries and remaining review pull requests, with their links and actual states. Headings, the final-session row and recovery explanations do not describe every result as “PR ready for review” or require an open pull request when AC-DELIVER-04 permits already-delivered work. Mixed repository outcomes are distinguishable. Existing agent identity, phase history and workspace-retention information remain available.
  - Superseded in part by: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (new-work status and the ordered readiness offer precede earlier delivery; historical delivery facts and unaffected presentation remain).
  - Replaces in part: AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (final pull-request summaries and terminal lines include delivery history and remaining review work).
  - Replaces in part: AC-PR-05 and AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (final-session naming, recovery copy and the completion header where the result is not solely open review pull requests).
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (older mockup copy for delivery permissions, progress and completion gives way to this change’s outcomes; unaffected layout and visual style remain).
  - Replaces in part: AC-SPACE-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a one-repository execution using development deployments adopts this change’s authorization, progress and final-result presentation; assigned workspace layout and restricted behavior remain).

**Business validation, 2026-10-30:** Doug directed: “remove the remember/reuse feature and its preference storage, update the requirements, and keep early-merge permission scoped to the current PRD.” AC-PERMIT-03 reflects that correction; AUTH-001 is settled. Doug subsequently selected “One checkbox for all listed repository branches” for AC-PERMIT-02. Separate product and code repositories remain supported.

## Relationship to Earlier Requirements

This is an optional change to the delivery contract, not a rewrite of Kiln’s historical requirements. Its `Replaces in part:` lines identify the currently governing criteria whose behavior changes. Unchanged portions and the restricted mode remain in force. Earlier links are followed to their current owner rather than redirected around an intervening change.

These replacements take effect only when implemented. The implementation commit must add matching `Superseded in part by:` lines, with this PRD’s path, criterion label and the changed scope, to each affected earlier criterion. Do not add those reverse links during drafting or refinement. Design and implementation must check for additional conflicting criteria and extend the replacement links where needed before the corresponding code ships.

The latest-built document governing a behavior remains its source of truth. Existing historical mockups are not rewritten to claim this unbuilt capability already exists; the changed display outcomes above govern the new mode when it is implemented.

## Out of Scope

- A machine-wide permission that applies silently to unrelated projects.
- Separate production-release workflows or other branches, destructive actions, or bypassing repository checks and protections.
- Automatic merging of every phase or every final review pull request.
- A general-purpose deployment platform replacing each project’s established development workflow.
- Parallel phase execution or replacing the Enso Method’s engineering skills.
