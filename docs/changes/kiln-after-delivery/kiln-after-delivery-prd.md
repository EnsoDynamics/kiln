# PRD: Kiln After Delivery

**Source:** Doug's request, 2026-11-21: a finished run's pull request had merge conflicts and no way to hand them to the agent, Kiln could only be closed with Ctrl+C, and a second finished run showed "Plan needs reconciliation" when nothing about its plan had changed.

**Roadmap:** [Kiln roadmap](../../kiln-roadmap.md). Develops the [Merge the final PR idea](../../roadmap/kiln-final-pull-request-merge-idea.md).

**Assumptions:** [Kiln After Delivery assumptions](kiln-after-delivery-assumptions.md)

**Review alongside:** [Mockup](mockups/kiln-after-delivery.html)

## Summary

Make the end of a Kiln run something a person can finish from the page. When every phase is done and the pull request is open (one per repository, when the work spans several), the person can press **Merge with Claude Code** (or Codex) and Kiln starts one more session that brings the base branch in, resolves any conflicts, runs the project's checks, waits for GitHub's required checks and merges. Whenever no session is running or being started on a finished run, **Exit Kiln** closes Kiln without Ctrl+C.

The same page stops raising a false alarm. A finished run whose pull request has not merged yet is shown as waiting to merge, once, and never as a changed plan. When a person comes back to a finished PRD later, Kiln gives one of two answers: no new phases, or phases that were planned afterwards and one **Continue** button to build them.

The closing-audit rows are also renamed so a person can tell an audit from the sessions that fix what it found.

## Business Context

Kiln stops at "PR ready for review" and leaves the merge to the person. In practice the person then closes Kiln and asks a separate agent session to merge the pull request and resolve whatever conflicts the base branch has gathered meanwhile. Kiln already has the worktree, the branch, the agent and its settings, so it can start that session itself when asked.

Three smaller problems sit on the same page:

- **No way out.** Kiln stays in its terminal after the pull request is ready, and after it merges. The only exit is Ctrl+C.
- **A false alarm.** The finished page checks whether phases were added to the PRD. While the delivery is still unmerged, the base branch does not hold the run's version of the plan yet. If unrelated work has landed on the base branch in the meantime, or the person's own checkout is behind, Kiln reports "Plan needs reconciliation" with a list of problems, none of them true.
- **A block nobody can act on.** Even when the plan really was edited after Kiln finished, the page asks the person to reconcile requirement documents before Kiln will go on. The offer to continue already lists the exact phases it would run and waits for a click, which is the safeguard that matters.

The audit rows are a separate small confusion in the same list of activity: three rows all titled "Test audit", told apart only by "Round 1" and "Continuation 2", read as three audits.

## Acceptance Criteria

### Have the Agent Merge the Pull Request

When the work is done, the person can ask Kiln to merge it. Kiln starts one more agent session for that, and merges the finished work only when the person asks.

- [ ] **AC-MERGE-01 — The finished page offers the merge.** When AC-MERGE-07 offers the merge, the pull request card shows one **Merge with {agent}** button for the whole delivery beside **Open on GitHub**, naming the agent chosen for the run, with a short note saying what pressing it does, including that the merge may start the base branch's CI or deployment; with more than one pull request, the note names any merge order the pull requests state (SCOPE-001). When GitHub reports that a pull request conflicts with its base branch, the card says so beside it.
  - Replaces in part: AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the card gains what AC-MERGE-01, AC-MERGE-04, AC-MERGE-07 and AC-WAIT-02 add; the header reads **Merged** where it said "Already merged" (AC-WAIT-03), and the final pull request row keeps its Opened wording, with the Merge row after it (AC-MERGE-05); the rest remains)
- [ ] **AC-MERGE-02 — Pressing it is the permission, for that delivery only.** One press of Merge with {agent} authorizes the merge session to merge the delivery's open pull requests, each into its base branch, in the order their descriptions state (SCOPE-001). Nothing is remembered for other pull requests, other PRDs or a later run.
  - Replaces in part: AC-PR-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (on that press the merge session merges the delivery's pull requests; otherwise Kiln still merges and deploys only as AC-DEV-01 in Kiln Development Deployments allows)
  - Replaces in part: AC-PRS-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (on that press the merge session merges the delivery's pull requests in the order the descriptions state; otherwise Kiln still merges nothing, and still does not check that order)
  - Replaces in part: AC-WORK-01 and AC-WORK-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (with Codex chosen, the merge session merges on that press; choosing Codex still grants no authority of its own)
- [ ] **AC-MERGE-07 — Kiln reads each pull request's state from GitHub first.** Before offering the merge and again before starting the session, Kiln reads each of the delivery's pull requests from GitHub, and the card offers what the table says.

  | On GitHub | The pull request card |
  |---|---|
  | Every pull request open | Merge with {agent}, for all of them |
  | Some merged, the rest open | The merged ones as merged (AC-MERGE-04); Merge with {agent} merges only the rest |
  | Every pull request merged | Merged (AC-MERGE-04); no session starts |
  | Any closed without merging | Shown as closed; no merge offered. Until a merge session has started, a line says reopening it on GitHub brings the merge back, or the others can be merged there; once one has, the line is left out, and the session's stop says to reopen it on GitHub and then Resume (AC-MERGE-06) |
  | Any that GitHub could not be read | No merge offered; the card says GitHub could not be read, and why |

  Kiln never reopens or replaces a closed pull request. While one is closed, the header stays **PR ready for review** unless a merge session is under way or has stopped (AC-WAIT-02) or a check finds new phases (AC-OFFER-01 in Kiln Continue Added Phases).

- [ ] **AC-MERGE-08 — Kiln's statement of what it may do names the merge and the plan push.** Where Kiln states what it is allowed to do, before Start and in the settings while it works, it says it merges the delivery's pull requests only when the person presses Merge with {agent} on the finished page and, in the PRD's repository, pushes this PRD's documents to the base branch only when the person presses Continue (AC-BACK-05). Both appear beside any early merges the person allowed. Every other branch stays untouched.
  - Replaces in part: AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (merging stays forbidden except on that press, and the statement names AC-BACK-05's push; the rest remains)
  - Replaces in part: AC-PERMIT-02 and AC-DISPLAY-01 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (where early merges are allowed, the statement also names both presses; the rest remains)
- [ ] **AC-MERGE-03 — The merge session does the merge and nothing wider.** The merge session's instructions say what it may and may not do, as the table says. When it cannot merge a pull request, it ends there without merging the ones after it, and its last message names what is outstanding (AC-MERGE-06): a conflict to decide, a missing required review, a required check failing or never reported, or a pull request closed on GitHub (AC-MERGE-07).

  | The session may | The session may not |
  |---|---|
  | Merge the base branch into each feature branch and resolve the conflicts | Rewrite a feature branch's history or force-push |
  | Run the project's own checks, push the feature branches and wait for each pull request's required checks | Push to any branch but the delivery's feature branches |
  | Fix failures caused by the merge or by the delivery's own work, and push again | Merge while a required review or check has not passed, wait without end on a required check, or go around branch protection by an override or a change to the branch protection settings |
  | Merge the delivery's pull requests (AC-MERGE-02), by a merge method the repository allows | Merge any other pull request, delete a branch or worktree, or deploy |

- [ ] **AC-MERGE-04 — Kiln confirms the merge from GitHub.** The run is shown as Merged only when GitHub shows each of the delivery's pull requests merged into its base branch, never on the session's word. The card then shows when each pull request merged, its merge commit and the merge session's closing summary, word for word; AC-WAIT-03 says what the header shows. Until then, any that have merged are shown as the Complete screen shows already-merged work today. A pull request the person merged themselves is shown the same way, without a summary, at Kiln's next check of the run.
- [ ] **AC-MERGE-05 — The merge and push sessions are each one more activity.** The merge session (AC-MERGE-03) and Continue's push session (AC-BACK-05) each run with the run's agent, model and effort, and each has a phase-plan row like any other; like the final pull request row, neither is counted among the phases done. Their output can be watched, but, as with the pull request session, neither offers a message box, pause or takeover while it runs, and the page says so (for the merge session, MERGE-001). The run's billing limits, usage-limit recovery and Ctrl+C handling apply to both. While either waits for usage, Kiln shows the existing waiting screen for it, as it shows Needs you at a stop; after Ctrl+C, the next `kiln run` holds the session on the finished page until Resume. They differ only as the table says.

  | | The merge session | The push session |
  |---|---|---|
  | Runs in | Where the run's sessions ran | The person's main checkout |
  | Its row | **Merge**, after the final pull request row | **Push the plan**, before the first added phase |
  | The header while it runs | **Merging** | **Pushing the plan** |

  - Replaces in part: AC-PR-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the pull-request session's row is no longer the last: the Merge row follows it)
  - Replaces in part: AC-LIVE-02 and AC-BOT-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (a running merge or push session offers neither a message nor a pause, in the browser or by command, and shows why, as final delivery does)
  - Replaces in part: AC-PAUSE-02 in `docs/changes/kiln-pause-now/kiln-pause-now-prd.md` (Pause now is also withheld while a merge or push session runs, with a reason naming Pause now)
  - Replaces in part: AC-WATCH-01 and AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the plan gains the Merge and Push the plan rows, and the header the Merging and Pushing the plan states)
  - Replaces in part: AC-AUTO-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (a merge or push session that hits a usage limit waits too, not only a phase or pull-request session)
  - Replaces in part: AC-TOTAL-02 and AC-TOTAL-03 in `docs/changes/kiln-prd-time-totals/kiln-prd-time-totals-prd.md` (the counted sessions include the merge and push sessions; a run reopened by one is not complete, and on Complete the totals and the span end when it last became complete, not at its first completion)
- [ ] **AC-MERGE-06 — A merge or push session that stops is a Needs you stop.** When the merge session (AC-MERGE-03) or Continue's push session (AC-BACK-05) ends without finishing, Kiln shows the existing Needs you page for it: the session's last message word for word, **Reply and continue in Kiln** with **Resume** (or **Send and resume** with a reply) to the same session, the command that opens that session in a terminal, and **Check again**. Kiln never starts a fresh merge or push session, so the stop offers neither Merge with {agent} nor Continue. Check again and Resume first look at whether the work is already done, and then do as the table says without resuming.

  | Stopped session | Kiln looks at | When the work is done |
  |---|---|---|
  | The merge session | GitHub | Kiln shows Merged (AC-MERGE-04) |
  | The push session | The remote base branch | Kiln checks again and starts the build or shows what it found, as AC-BACK-05 says |

  - Replaces in part: AC-WAIVE-02 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md` (a stopped merge or push session offers no Mark complete; GitHub or the remote base branch decides whether the work is done)

### Say Once That the Delivery Is Waiting to Merge

Until the pull request in this PRD's repository merges, the base branch does not hold the run's plan. That is the normal state of a finished run, not a problem with the plan.

- [ ] **AC-WAIT-01 — An unmerged delivery is never reported as a changed plan.** While the delivery waits to merge, the check for new phases reports only that it is waiting, whatever has changed on the base branch since the feature branch left it and whether or not the person's main checkout is behind. The delivery waits from the end of the run until GitHub shows the run's pull request in this PRD's repository merged into the base branch, by any merge method and whoever merged it (AC-MERGE-04), or, while that pull request is closed, until the person presses Check now (AC-WAIT-02). A delivery that opened no pull request there, because its work was already in the base branch, never waits. Separately, Kiln runs the check unasked once it confirms every pull request of the delivery merged (AC-WAIT-03).
  - Replaces in part: AC-FIND-01, AC-FIND-03 and AC-OFFER-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (while the delivery waits to merge, the check reports only that it is waiting: no count of added work and no "No new phases found")
- [ ] **AC-WAIT-02 — The waiting state is said once, in the pull request card.** While the delivery is waiting to merge, the page shows no separate panel for the check. The pull request card carries one line saying Kiln can check for new phases once the pull request in this PRD's repository has merged, with **Merged it yourself? Check now**, which reads **Check now** while that pull request is closed. While the delivery waits, the header keeps **PR ready for review** unless a merge session is under way (running, waiting for usage or interrupted) or has stopped (AC-MERGE-05, AC-MERGE-06), and the terminal gives the card's sentence.
  - Replaces in part: AC-FIND-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (while the delivery waits to merge, the card's Check now takes the place of the finished page's Check for new phases; the rest remains)
- [ ] **AC-WAIT-03 — Kiln checks for new phases as soon as it confirms a merge.** When Kiln confirms the merge (AC-MERGE-04), it runs the check for new phases without being asked and shows what it found on the page, beside **Exit Kiln**. The header then says **Merged**, or **New phases found** (AC-OFFER-01 in Kiln Continue Added Phases) when the check found some.
  - Replaces in part: AC-FIND-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the check also runs when Kiln confirms a merge; its other occasions remain)
  - Replaces in part: AC-DISPLAY-03 in `docs/changes/kiln-development-deployments/kiln-development-deployments-prd.md` (once the merge is confirmed the header reads Merged, and the card adds each merge time, merge commit and the merge session's summary)

### Give a Finished PRD Two Answers When Kiln Looks for More Work

After a PRD ships, a later session may plan more phases for it, for example after stakeholder feedback. When the person runs Kiln on that PRD again, the page says either that nothing was added, or which phases were added and how to build them. It no longer asks the person to reconcile documents.

- [ ] **AC-BACK-01 — Finished phases stay finished, and nothing asks for reconciliation.** A phase the run completed stays finished whatever later happened to its document: Kiln never offers it again, rebuilds it or reports it as a problem. When a finished phase's document was edited after the run completed it, the answer carries one quiet line naming the phase and saying Kiln does not rebuild finished phases and that changing that work takes a new phase; the line never blocks anything (PLAN-001). Every unfinished phase, one neither completed by the run nor marked closed in its document, is counted and offered as added work wherever it sits, including beneath a finished phase that had no phases beneath it when it finished; split parents, numbering gaps and renamed documents still never add to the count. For a finished run, neither the header, the page nor the terminal shows "Plan needs reconciliation", an internal problem code or a list of differing documents other than those lines.
  - Replaces: AC-CONTINUE-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md`
  - Replaces in part: AC-FIND-03 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (changes to earlier phases are no longer shown as unresolved; the rest of its counting remains)
  - Replaces in part: AC-FIND-04 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (copies of the plan that differ are not a failed check; AC-BACK-03 says which copy is read. Unreadable or invalid plans and failed repository checks remain as they are)
  - Replaces in part: AC-RUN-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (in a build Continue started, a phase finished before it began counts as done when choosing the next phase, even once its Closed line is removed)
- **AC-BACK-02 — retired; what Kiln says about an edited finished phase is now in AC-BACK-01.**
- [ ] **AC-BACK-03 — Kiln reads the plan from one named place.** Kiln reads this PRD's plan as the table says, never from another feature branch or worktree. Uncommitted edits in the main checkout are never read, committed, stashed, changed or pushed, whatever a reply to a session says; when some are to this PRD's documents, the page names those documents and says Kiln did not read them.

  | The person's main checkout of the repository is | Kiln reads the plan from |
  |---|---|
  | On the base branch, with committed unfinished phases (AC-BACK-01) that the remote base branch lacks | The main checkout's committed copy; phases only the remote base branch holds are found once Continue pushes the plan (AC-BACK-05) |
  | On the base branch otherwise, whatever commits it is ahead or behind by | The remote base branch |
  | On any other branch | The remote base branch only, and the page says the checkout was not read because it is on that branch, naming the branch |
  | Not found at the path Kiln was started from (moved or removed while Kiln was open) | Nowhere: the check fails, the page says Kiln could not find the checkout at that path, and Continue is unavailable until it is back and a check for new phases succeeds |

  - Replaces in part: AC-FIND-02 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (which source is read is decided by this table; differing sources no longer withhold continuation as a conflict; uncommitted edits are named as not read rather than shown as not-ready additions)
- [ ] **AC-BACK-04 — The offer says what was added, where from, and what Continue does.** When unfinished phases are found, the panel is headed with their count and the words "added to this PRD after Kiln finished it". It lists each phase as planned and not built, says where they came from (the commit that added them with its date and message, or that they are committed on this machine's base branch and not pushed, and that Continue pushes them first), and says Continue builds only those phases on a new branch from the base branch and ends with a new pull request. The existing readiness results and their controls stay on the panel and still decide whether Continue is available.
  - Replaces in part: AC-OFFER-01 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the panel's heading, the planned-not-built marking and the line saying where the phases came from; the header and the rest remain)
- [ ] **AC-BACK-05 — Continue gets the plan into the base branch first.** When the plan was read from the main checkout (AC-BACK-03), pressing Continue first starts a push session (AC-MERGE-05) that pushes the commits to this PRD's documents to the base branch, combining them itself with whatever the remote base branch has gained since. Kiln then checks again and, when the check finds the offered phases still ready, starts the build as Continue does today, with no second press. Otherwise it starts nothing and shows what the check found: a refreshed offer when AC-OFFER-03 in Kiln Continue Added Phases calls for a fresh choice, as it does when the offer needed an early-merge permission (AC-CONTINUE-09), since the push moves the base branch that permission was given against; the offer with the readiness results that keep Continue unavailable; "No new phases found" when no unfinished phase remains; or what could not be checked (AC-FIND-04). The session never force-pushes. In each case the table lists, it pushes nothing, builds nothing and stops at Needs you (AC-MERGE-06); a reply to the same session can tell it to push the other commits too, or how to combine the documents.

  | The push session stops when | The page says |
  |---|---|
  | The local base branch holds other commits that would be pushed along | Which commits, and that nothing was pushed |
  | The push is refused, by branch protection or a repository hook | The refusal, word for word |
  | The remote base branch changed the same documents in a way that needs a decision | Which documents, and what needs deciding |

  - Replaces in part: AC-PREFLIGHT-01 in `docs/changes/kiln-build-preflight/kiln-build-preflight-prd.md` (when Continue must push the plan first, the push session runs before the preflight; the rest remains)
  - Replaces in part: AC-CONTINUE-06 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (the person no longer has to push the committed documents before Continue; the build still starts from the base branch holding them)
  - Replaces in part: AC-CONTINUE-08 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (Continue also authorizes pushing this PRD's documents to the base branch, and the panel says so before the press)
  - Replaces in part: AC-PRS-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (Continue may push this PRD's documents to the base branch; touching other branches stays forbidden)
  - Replaces in part: AC-WORK-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (with Codex chosen, the push session works in the main checkout and pushes this PRD's documents to the base branch on that press; choosing Codex still grants no authority of its own)
  - Replaces in part: AC-CONTINUE-09 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` (an early-merge permission given before Continue does not carry past the push; the refreshed offer asks for it again)

### Exit Kiln From the Page

Whenever no session is running or being started on a finished run, the person can close Kiln where they are looking.

- [ ] **AC-EXIT-01 — The finished page offers Exit Kiln.** A finished run's page shows one **Exit Kiln**: in the Kiln panel; once the run is Merged, as the pull request card's main button instead; at a stop of AC-MERGE-06, on the Needs you page; and, while a merge or push session waits for usage, on the waiting screen. A line beside it says it stops Kiln in its terminal and leaves the pull requests and worktrees. It is offered whenever no session is running or being started, including while Kiln checks for new phases, except the check after Continue's push, which may start the build (AC-BACK-05); otherwise it is unavailable and says why.
  - Replaces in part: AC-LIMIT-04 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (on a finished run the waiting screen also offers Exit Kiln)
  - Replaces in part: AC-AUTO-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (on a finished run, Exit Kiln also ends a merge or push session's wait; the next `kiln run` holds that session until Resume)
- [ ] **AC-EXIT-02 — Exit ends Kiln cleanly and says how to come back.** Pressing Exit Kiln ends the Kiln process with a success status, leaves no agent process behind, and changes no pull request, branch, worktree or saved record. The terminal's last line says Kiln was exited from the page and gives the command that opens the PRD again. The page says Kiln has exited, when, that it no longer updates, and the same command.
  - Replaces in part: AC-KEEP-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln also ends when the person presses Exit Kiln on a finished run's page)

### Name Closing-Audit Rows by What They Do

A person reading the list of activity should be able to tell an audit from the sessions that fix what it found, and see how many loops the run has used, without learning the words "round" and "continuation".

- [ ] **AC-AUDIT-01 — Each closing-audit row is titled for what it does.** Rows read as the table says, with loop numbers as Kiln already counts them: a loop is one run of an audit, and sessions of test fixes are not loops. The words "Round" and "Continuation" appear nowhere a person reads an audit's name: the phase plan, the session page, the terminal, Needs you and For you (AUDIT-001).

  | Session | Row title | Line beneath it |
  |---|---|---|
  | A delivery audit | Delivery audit | Loop _n_ of _limit_ |
  | A test audit | Test audit | Loop _n_ of _limit_ |
  | A session fixing what a test audit saved | Fixing tests | From test audit loop _n_ · session _k_, where _k_ counts that loop's sessions of test fixes from 1 |
  | A phase an audit added | Its phase title, as today | No loop number |

  - Replaces in part: AC-RUN-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (sessions of test fixes are titled Fixing tests, and repeat audits are told apart by loop number, not round)
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (only audit rows carry a loop number and the limit, never **last loop**, and a session of test fixes names the loop it works from)
  - Replaces in part: AC-TEST-03 in `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-prd.md` (the last test audit loop's row and detail show Loop _n_ of _n_, with no separate mark saying it was the last; the rest remains)
  - Replaces in part: AC-PAUSE-01 and AC-PAUSE-05 in `docs/changes/kiln-pause-now/kiln-pause-now-prd.md` (an audit is named by its title and loop, never its round, in the pause panel and the paused eyebrow)
  - Replaces in part: AC-LIVE-01 and AC-BACK-01 in `docs/changes/kiln-live-session-control/kiln-live-session-control-prd.md` (the session view and the hand-back name an audit by its title and loop, never its round)

### A Bot Can Do the Same

Every control this change adds to the page has a command, as Kiln's other controls do.

- [ ] **AC-BOT-01 — The new controls have commands.** Each control in the table can be used from the command line with the existing targeting and retry protection, and `kiln status` lists each among the controls with whether it is available and why not.

  | On the page | From the command line |
  |---|---|
  | Merge with {agent} (AC-MERGE-01) | `kiln merge <PRD-path>`, whose help says what the button's note says |
  | Exit Kiln (AC-EXIT-01) | `kiln exit <PRD-path>` |
  | Continue, pushing the plan first (AC-BACK-05) | `kiln continue-with-phases`, which pushes first as the button does |
  | Check now in the pull request card (AC-WAIT-02) | `kiln check-for-new-phases`, which does what Check now does |

  - Replaces in part: AC-ACT-01 and AC-ACT-03 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (two more commands join the controls for a run already started, and `kiln merge` merges work, which that PRD left out of the command line)
  - Replaces in part: AC-BOT-01 in `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-prd.md` (the command that continues with the offered phases also pushes this PRD's documents first, as Continue does, and `kiln check-for-new-phases` does what the card's Check now does)
- [ ] **AC-BOT-02 — `kiln status` shows the new states.** `kiln status` reports in text and JSON everything these screens show: waiting to merge, merging, merged, pushing the plan, a stopped merge or push session, the two answers Kiln gives when it looks for new phases with where the phases came from, and the audit names of AC-AUDIT-01.

## Out of Scope

- A message box, Pause now or takeover while the merge or push session runs (for the merge session, MERGE-001). A stopped one can still be replied to, resumed or opened in a terminal.
- Exit Kiln on the pages of a run still in progress. Ctrl+C remains the way to stop a running, paused or stopped build.
- Kiln exiting on its own after a merge.
- Watching GitHub in the background for a merge. A pull request merged outside Kiln is found at Kiln's next check.
- Deploying, or watching CI or a deployment, after the merge.
- Removing the feature branch or the worktree after the merge.
- How Kiln reconciles the plan of a run still in progress when control returns from a manual session. That behavior is unchanged, except that a build Continue started never reopens a phase finished before it began (AC-BACK-01).
