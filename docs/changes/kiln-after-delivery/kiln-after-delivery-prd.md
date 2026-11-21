# PRD: Kiln After Delivery

**Source:** Doug's request, 2026-11-21: a finished run's pull request had merge conflicts and no way to hand them to the agent, Kiln could only be closed with Ctrl+C, and a second finished run showed "Plan needs reconciliation" when nothing about its plan had changed.

**Assumptions:** [Kiln After Delivery assumptions](kiln-after-delivery-assumptions.md)

**Review alongside:** [Mockup](mockups/kiln-after-delivery.html)

## Summary

Make the end of a Kiln run something a person can finish from the page. When every phase is done and the pull request is open, the person can press **Merge with Claude Code** (or Codex) and Kiln starts one more session that brings the base branch in, resolves any conflicts, runs the project's checks and merges the pull request. When there is nothing left to do, **Exit Kiln** closes Kiln without Ctrl+C.

The same page stops raising a false alarm. A finished run whose pull request has not merged yet is shown as waiting to merge, once, and never as a changed plan. When a person comes back to a finished PRD later, Kiln gives one of two answers: no new phases, or phases that were planned afterwards and one **Continue** button to build them.

The closing-audit rows are also renamed so a person can tell an audit from the sessions that fix what it found.

## Business Context

Kiln stops at "PR ready for review" and leaves the merge to the person. In practice the person then closes Kiln and asks a separate agent session to merge the pull request and resolve whatever conflicts the base branch has gathered meanwhile. Kiln already has the worktree, the branch, the agent and its settings, so it can start that session itself when asked.

Three smaller problems sit on the same page:

- **No way out.** Kiln stays in its terminal after the pull request is ready, and after it merges. The only exit is Ctrl+C.
- **A false alarm.** The finished page checks whether phases were added to the PRD. While the pull request is still open, the base branch does not hold the run's version of the plan yet. If unrelated work has landed on the base branch in the meantime, or the person's own checkout is behind, Kiln reports "Plan needs reconciliation" with a list of problems, none of them true.
- **A block nobody can act on.** Even when the plan really was edited after Kiln finished, the page asks the person to reconcile requirement documents before Kiln will go on. The offer to continue already lists the exact phases it would run and waits for a click, which is the safeguard that matters.

The audit rows are a separate small confusion in the same list of activity: three rows all titled "Test audit", told apart only by "Round 1" and "Continuation 2", read as three audits.

## Acceptance Criteria

### Have the Agent Merge the Pull Request

When the work is done and reviewed, the person can ask Kiln to merge it. Kiln starts one more agent session for that, and merges nothing unless the person asks.

- [ ] **AC-MERGE-01 — The finished page offers the merge.** When a finished run has exactly one open pull request for its delivery, the pull request card shows **Merge with {agent}** beside **Open on GitHub**, naming the agent chosen for the run, with one sentence saying what pressing it does. When GitHub reports that the pull request conflicts with its base branch, the card says so. A delivery with more than one open pull request keeps today's page, with no merge offered (SCOPE-001).
  - Replaces in part: AC-PR-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the Complete screen's pull request card gains the merge action, the conflict line and the waiting line of AC-WAIT-02; the rest of the screen remains)
- [ ] **AC-MERGE-02 — Pressing it is the permission, for that pull request only.** One press authorizes one merge of the shown pull request into its base branch. Nothing is remembered for other pull requests, other PRDs or a later run. Before starting a session Kiln checks GitHub: a pull request already merged is shown as Merged with no session started, and one closed without merging is shown as closed with no merge offered. Documents found says that Kiln merges only when the person presses Merge after the pull request is ready.
  - Replaces in part: AC-PR-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln merges the pull request when the person presses Merge; it still never merges on its own, waits on CI to merge, or deploys)
  - Replaces in part: AC-START-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (merging is allowed only on that press)
- [ ] **AC-MERGE-03 — The merge session does the merge and nothing wider.** The session runs in the run's worktree with the run's agent, model and effort. Its instructions say what it may and may not do, as the table says.

  | The session may | The session may not |
  |---|---|
  | Merge the base branch into the feature branch and resolve the conflicts | Rebase or force-push |
  | Run the project's own checks and fix what the merge broke | Merge while a required check or review has not passed, or go around branch protection |
  | Push the feature branch | Push or change any other branch |
  | Merge the shown pull request into its base branch | Merge any other pull request, delete the branch or the worktree, or deploy |

- [ ] **AC-MERGE-04 — Kiln confirms the merge from GitHub.** The run is shown as Merged only when GitHub shows the pull request merged into its base branch, never on the session's word. The header then says **Merged**, and the card shows when it merged, the merge commit and the merge session's closing summary, word for word. A pull request the person merged themselves is shown the same way, without a summary, at Kiln's next check of the run.
- [ ] **AC-MERGE-05 — The merge session is handled as one more activity.** It appears in the phase plan as a row titled **Merge** after the final pull request row, with its time, model and session details as any row has, and its output can be watched as any session's can. While it runs the header says **Merging pull request #N**. As with the pull request session, it offers no message box, pause or takeover while it runs, and the page says so (MERGE-001). The run's billing limits, usage-limit recovery and Ctrl+C handling apply to it as to any session.
  - Replaces in part: AC-PR-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the merge session is one more row after the pull-request session's)
- [ ] **AC-MERGE-06 — A merge session that stops is a Needs you stop.** When the session ends and the pull request is not merged, Kiln shows the existing Needs you page for it: the session's last message word for word, **Reply and continue in Kiln** to the same session, the command that opens that session in a terminal, and **Check again**. Check again and Resume look at GitHub first and show Merged when the pull request has merged. Kiln never starts a second merge session on its own.

### Say Once That the Delivery Is Waiting to Merge

Until the pull request merges, the base branch does not hold the run's plan. That is the normal state of a finished run, not a problem with the plan.

- [ ] **AC-WAIT-01 — An unmerged delivery is never reported as a changed plan.** When a finished run's delivered commits are not in the base branch, and the base branch's copy of this PRD's folder is the same as when the feature branch left it, the check for new phases reports that the delivery is waiting to merge. This holds whatever else has changed on the base branch since, including documents outside the folder that this PRD links to, and whether or not the person's main checkout is behind. The check reports no plan problem in that state.
- [ ] **AC-WAIT-02 — The waiting state is said once, in the pull request card.** While the delivery is waiting to merge, the page shows no separate panel for the check. The pull request card carries one line saying Kiln can check for new phases only once the pull request is in the base branch, with **Merged it yourself? Check now**. The header keeps **PR ready for review**, and the terminal gives the same sentence.
- [ ] **AC-WAIT-03 — Kiln checks for new phases as soon as it confirms a merge.** When Kiln confirms the merge (AC-MERGE-04), it runs the check for new phases without being asked and shows the answer on the page, beside **Exit Kiln**.
  - Replaces in part: AC-FIND-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the check also runs when Kiln confirms a merge; its other occasions remain)

### Give a Finished PRD Two Answers When Kiln Looks for More Work

After a PRD ships, a later session may plan more phases for it, for example after stakeholder feedback. When the person runs Kiln on that PRD again, the page says either that nothing was added, or which phases were added and how to build them. It no longer asks the person to reconcile documents.

- [ ] **AC-BACK-01 — Finished phases stay finished, and nothing asks for reconciliation.** A phase the run completed is never offered again, rebuilt or reported as a problem, whatever later happened to its document. For a finished run, neither the header, the page nor the terminal shows "Plan needs reconciliation", an internal problem code or a list of differing documents. Every unfinished phase in the plan is counted and offered by the existing counting rules, including one that descends from a finished phase (PLAN-002).
  - Replaces: AC-CONTINUE-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md`
  - Replaces in part: AC-FIND-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (changes to earlier phases are no longer shown as unresolved; the counting rules remain)
  - Replaces in part: AC-FIND-04 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (copies of the plan that differ are not a failed check; AC-BACK-03 says which copy is read. Unreadable or invalid plans and failed repository checks remain as they are)
- [ ] **AC-BACK-02 — An edited finished phase gets one line.** When a finished phase's document was edited after the run completed it, the answer carries one line naming the phase and saying Kiln does not rebuild finished phases and that changing that work takes a new phase (PLAN-001).
- [ ] **AC-BACK-03 — Kiln reads the plan from one named place.** Kiln reads this PRD's plan as the table says, and only from these two places. It never reads another feature branch or another worktree.

  | The person's main checkout of the repository is | Kiln reads the plan from |
  |---|---|
  | On the base branch with no changes of its own to this PRD's documents, level with or behind the remote | The remote base branch |
  | On the base branch with commits or saved edits to this PRD's documents that the remote base branch lacks | The main checkout, and the offer says they are not pushed (AC-BACK-05) |
  | On any other branch | The remote base branch only, and the page names the branch the checkout is on and says it was not read |

  - Replaces in part: AC-FIND-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (which source is read is decided by this table; differing sources no longer withhold continuation as a conflict)
- [ ] **AC-BACK-04 — The offer says what was added, where from, and what Continue does.** When unfinished phases are found, the panel is headed with their count and the words "added to this PRD after Kiln finished it". It lists each phase as planned and not built, says where they came from (the commit that added them with its date and message, or that they are on this machine's base branch and not pushed), and says Continue builds only those phases on a new branch from the base branch and ends with a new pull request. The existing readiness results and their controls stay on the panel and still decide whether Continue is available.
  - Replaces in part: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the panel's heading, the planned-not-built marking and the line saying where the phases came from; the header and the rest remain)
- [ ] **AC-BACK-05 — Continue gets the plan into the base branch first.** When the plan was read from the main checkout, pressing Continue first starts a session in that checkout that commits, where needed, and pushes this PRD's documents to the base branch. Kiln then checks again and starts the build as Continue does today, with no second press. The push session stops at Needs you, with nothing built, in each case the table lists. It never force-pushes and never commits a file that is not one of this PRD's documents.

  | The push session stops when | The page says |
  |---|---|
  | The local base branch holds other commits that would be pushed along | Which commits, and that nothing was pushed |
  | The push is refused, by branch protection or a repository hook | The refusal, word for word |
  | The remote base branch has changes to the same documents that it cannot combine cleanly | Which documents |

  - Replaces in part: AC-CONTINUE-06 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the person no longer has to commit and push the revised documents before Continue; the build still starts from the base branch holding them)
  - Replaces in part: AC-CONTINUE-08 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (Continue also authorizes pushing this PRD's documents to the base branch, and the panel says so before the press)

### Exit Kiln From the Page

When nothing is running and nothing is left to do, the person can close Kiln where they are looking.

- [ ] **AC-EXIT-01 — The finished page offers Exit Kiln.** On a finished run's page, the Kiln panel shows **Exit Kiln** with a line saying it stops Kiln in its terminal and leaves the pull request and worktree. Once the run is Merged, Exit Kiln is the main button of the pull request card. It is also offered at a merge session's Needs you stop. While a session is running it is unavailable and says why.
- [ ] **AC-EXIT-02 — Exit ends Kiln cleanly and says how to come back.** Pressing Exit Kiln ends the Kiln process with a success status, leaves no agent process behind, and changes no pull request, branch, worktree or saved record. The terminal's last line says Kiln was exited from the page and gives the command that opens the PRD again. The page says Kiln has exited, when, that it no longer updates, and the same command.
  - Replaces in part: AC-KEEP-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln also ends when the person presses Exit Kiln on a finished run's page)

### Name Closing-Audit Rows by What They Do

A person reading the list of activity should be able to tell an audit from the sessions that fix what it found, and see how many loops the run has used, without learning the words "round" and "continuation".

- [ ] **AC-AUDIT-01 — Each closing-audit row is titled for what it does.** Rows read as the table says, with loop numbers as Kiln already counts them: a loop is one run of an audit, and sessions of test fixes are not loops. The words "Round" and "Continuation" appear nowhere a person reads an audit's name: the phase plan, the session page, the terminal, Needs you and For you (AUDIT-001).

  | Session | Row title | Line beneath it |
  |---|---|---|
  | A delivery audit | Delivery audit | Loop _n_ of _limit_ |
  | A test audit | Test audit | Loop _n_ of _limit_ |
  | A session fixing what a test audit saved | Test fixes | From test audit loop _n_ · session _k_ |

  - Replaces in part: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (sessions of test fixes are titled Test fixes, and repeat audits are told apart by loop number, not round)
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (audit rows carry the loop number and limit; a session of test fixes names the loop it works from and is not numbered as a loop)

### A Bot Can Do the Same

Every control this change adds to the page has a command, as Kiln's other controls do.

- [ ] **AC-BOT-01 — The new controls have commands, and status shows the new states.** `kiln merge <PRD-path>` does what Merge with {agent} does and `kiln exit <PRD-path>` does what Exit Kiln does, each with the existing targeting and retry protection. `kiln continue-with-phases` pushes the plan first exactly as the button does (AC-BACK-05). `kiln status` lists both new commands among the controls, with whether each is available and why not, and reports in text and JSON everything these screens show: waiting to merge, merging, merged, a stopped merge session, the two answers of the check for new phases with where the phases came from, and the audit names of AC-AUDIT-01.
  - Replaces in part: AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (two more commands join the controls for a run already started)

## Out of Scope

- Merging a delivery that has more than one open pull request (SCOPE-001).
- A message box, Pause now or takeover while the merge session runs (MERGE-001). A stopped merge session can still be replied to, resumed or opened in a terminal.
- Exit Kiln on the pages of a run still in progress. Ctrl+C remains the way to stop a running, paused or stopped build.
- Kiln exiting on its own after a merge.
- Watching GitHub in the background for a merge. A pull request merged outside Kiln is found at Kiln's next check.
- Deploying, or watching CI or a deployment, after the merge.
- Removing the feature branch or the worktree after the merge.
- How Kiln reconciles the plan of a run still in progress when control returns from a manual session. That behavior is unchanged.
