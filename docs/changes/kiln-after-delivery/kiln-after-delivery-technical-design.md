# Technical Design: Kiln After Delivery

**PRD:** [Kiln After Delivery](kiln-after-delivery-prd.md) · **Assumptions:** [SCOPE-001, MERGE-001 and PLAN-001 open](kiln-after-delivery-assumptions.md) · **Mockup:** [eight states](mockups/kiln-after-delivery.html)

## Overview

A finished run gains two activities that run after delivery, and a way out. **Merge** is one more agent session that brings each base branch into its feature branch, runs the project's checks, waits for GitHub's required checks and merges the delivery's pull requests. **Push the plan** is one more session that pushes newly planned phase documents from the person's main checkout before Continue builds them. While either is open the finished run is reopened, so the engine's existing loop gives it billing, usage-limit recovery, Needs you, Ctrl+C and restart recovery. Kiln itself never merges or pushes. It decides that either is done only by reading GitHub or the remote base branch.

The check for new phases on a finished run is rebuilt around three questions, asked in order: is the delivery still waiting to merge (answered from GitHub, never from commit ancestry), which one copy of the plan to read, and which phases in that copy are unfinished. Comparing finished phases with what they finished as, and comparing the two copies of the plan with each other, are removed, and with them every "Plan needs reconciliation" result for a finished run.

**Exit Kiln** ends the process cleanly from the page, and every closing-audit name comes from one function.

Everything here is Kiln's. No Enso Method skill changes (principles 1 and 2): a person can already ask an agent to merge a pull request or push documents by hand, and Kiln writes nothing into the repository that the skills do not.

## Existing Code

**Posture: Preserve** for everything this design does not name; **removed** for the finished-run comparisons below, which this PRD retires.

- Reused: the engine loop and its session launch, resume and settle path with their gates; the control journal and its receipts; the Needs you page; the GitHub read that proves an early merge (the merged time, the merge commit, and the base containing it); the completed baseline, the Git-object plan reader, external-completion accounting, the readiness evaluator, the proposal, the acceptance and activation; the loop ledger; the way a reset ends the run from a page action.
- Changed: what counts as a finished run that the loop leaves alone (§After-Delivery Activities); the finished-run check (§The Plan Check); what proves a finished phase's work is in the base (§The Plan Check, step 4); how the early-merge evaluator treats a merged review pull request on a finished run (§The Merge Session); every place that builds an audit's name.
- Removed, for a finished run only: deciding "waiting to merge" from commit ancestry and the PRD folder's tree; the completed-scope comparison, the `source_conflict` problem, the list of documents that differ between copies and the `unresolved_earlier_work` class; reading the main checkout's files from disk (the proposal's `sharedDigest`, the `shared_documents` input observation and the end-of-check comparison of the disk digest); the "Waiting for the delivery to merge" panel and the "Plan needs reconciliation" heading, header and terminal sentence.
- Kept: plan reconciliation of a run still in progress, including its "Plan needs reconciliation" notice, which is not rendered on a finished run. The pull request session still may not merge. Early merges keep their own grants, evidence and `kiln delivery` interface, which the merge session is not given.

## Architecture

No new service, store, timer or background watcher. The foreground engine and its command journal remain the only owner of every change. GitHub is read through the existing `gh` helper with its timeouts.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| How a session runs once the run is finished | An open after-delivery activity makes the run not currently complete | A finished run is inert today: the loop, startup recovery, stops, waits and billing approval all return early on it, and AC-MERGE-05 and AC-MERGE-06 need every one of them. One predicate reopens the run; a run with early merges already reopens a finished record the same way |
| Who merges and pushes | The session, with `gh` and `git`. The engine only reads | AC-MERGE-03 needs conflicts resolved and failures fixed, which only a session can do. Early merges already work this way. GitHub applies branch protection to the session's own merge, so Kiln holds nothing that could go around it |
| What proves a merge | GitHub shows the pull request merged, and its base contains the merge commit | AC-MERGE-04 forbids taking the session's word, and "by any merge method" (AC-WAIT-01) rules out looking for the delivered commits in the base |
| What "waiting to merge" is read from | The state on GitHub of the run's pull request in the PRD's repository | The same; ancestry and comparing copies are what produced the false alarm |
| Which copy of the plan is read | Exactly one, chosen by AC-BACK-03's table, from committed Git objects | Uncommitted edits can then never be read, and two copies are never compared |
| What a missing main checkout does | A failed check naming the path; Continue unavailable until the checkout is back | Kiln keeps no other copy of the repository: every remote read, the run worktrees' Git data and both Continue sessions depend on that checkout, so a plan read some other way could not be built from |
| What makes a phase finished | The run's completion record (§The Plan Check, step 3): the retained baseline's completions with the finished execution's done or waiver-skipped phases, by phase id | AC-BACK-01: a finished phase stays finished whatever happens to its document (PLAN-001) |
| What Kiln says about an edited finished phase | Nothing; no copy of a finished phase's document is kept or compared | AC-BACK-01 asks for one line per edited finished phase. PLAN-001 reopens it: 59 of 327 finished phase documents were edited later and none added work, so the line would show on about 1 in 5 finished phases with nothing to act on. It is built only if the ruling stands |
| Where the push sits | A step of accepting Continue, owned by the same acceptance | AC-BACK-05: one press pushes, checks again and starts the build |
| How Kiln knows the stated merge order | One fixed line in each description, written by the pull request session and parsed by Kiln | AC-MERGE-01's note must name the order, and prose cannot be read reliably. Kiln still does not check the order |
| When GitHub is read | Only on the occasions in §The Delivery Reading | Watching GitHub in the background is out of scope |

## After-Delivery Activities (AC-MERGE-05, AC-MERGE-06)

Both sessions are activities of the finished execution, keyed and typed so nothing takes them for a plan phase, an audit or the pull request session.

| | Merge | Push the plan |
|---|---|---|
| Activity key and kind | `merge` | `plan-push` |
| Session kind | `merge` | `plan_push` |
| Stop kind when it ends undone | `merge_check` | `plan_push_check` |
| Runs in | The run's session folder | The person's main checkout |
| Done when | The delivery reading shows every pull request merged | The remote base branch holds the offered phase ids, or contains the main checkout's base-branch tip |
| Row | **Merge**, id `M`, after the final pull request row | **Push the plan**, id `P`, before the first added phase |
| Header while it runs | **Merging** | **Pushing the plan** |

**Opening.** An activity opens when its journal action is accepted (§Interfaces), recorded with its receipt before anything launches. One is open at a time, and none opens while a session runs or a check is in progress.

**While open.** The run is not currently complete, so the loop serves it. `completedAt`, the pull request facts, the delivered summary and the phases-done count do not change, and the open activity is the loop's next activity ahead of anything else. The plan reader, the done check, the pull request check, the audits, the preflight and the completion step never run for these keys. Each activity is settled only by its own reading, and the run counts as complete again when the activity closes.

**Gates.** The session starts through the ordinary launch path, so it uses the run's agent, model and effort and passes the same gates as any session: agent readiness, billing (an approval can be given again while the activity is open), keep-awake, and a usage-limit refusal that becomes a wait and then a resume. The folder check and its Folder missing page stay off for a finished run, because that page's Start sets up a fresh execution. Each activity checks its own folder instead, at the press and before every launch or resume:

| Activity | Its folder is ready when | When it is not |
|---|---|---|
| Merge | Each pull request still to merge has its run worktree, on the feature branch. At the press the worktree also has no uncommitted work and no merge in progress (`MERGE_HEAD`). Kiln brings in the objects of the pull request's head, the `headSha` the press's fresh reading saved (GitHub's `headRefOid`), from the main checkout, writing no ref, as the plan check already does for the remote base. The worktree's head must then be at, ahead of or behind that head. Behind is the usual case after GitHub's Update branch or a suggestion committed on GitHub, and the session fast-forwards it first. A worktree that has diverged from it, with commits on both sides as after Update with rebase, is refused. The activity records the worktree's head at the press. A fetch or ancestry read that fails refuses the press and names the failure; it is never read as behind or diverged. At Resume, Send and resume, the resume after a usage-limit wait and the resume at `kiln run`, its head need only descend from the head recorded at the press: uncommitted work or a merge in progress is left as it is for the resumed session, as for every other session Kiln resumes | The press, or Resume at the stop, is refused naming the repository and folder. A diverged worktree is refused saying that it and pull request #{n} each have commits the other lacks. Check again still reads GitHub, so a merge finished on GitHub by hand is still shown |
| Push the plan | The main checkout is found (§The Plan Check, step 2) and is on the base branch; at the press its tip is the commit the offer was read from, and on a resume its tip descends from that commit | The press, or Resume, is refused saying which |

Each activity's session is given only the folders its check requires. A merge session starts in the run's session folder, and its workspace (Codex's writable roots and assigned worktrees, Claude Code's added directories) is that folder plus the run worktree of each pull request the latest delivery reading does not show `merged`. The set is taken again at every launch and resume, and the agent readiness read and the Codex launch-settings check use the same set. A repository whose pull request has merged, whether early, by hand or earlier in this session, is left out, so removing its worktree never stops the session. A Codex resume keeps its recorded start folder, which this rule never changes, and is given the roots of that moment, as a session that gains a worktree partway through already is. A Codex push session is launched with the main checkout as its one writable root; network access is already granted to every Codex session.

**No live controls.** As for the pull request session, no live attempt is created, and messages, takeover, Pause after this activity and Pause now are unavailable with the reason the page prints (for the merge session, MERGE-001).

**Ending.** When the session ends, the engine takes the activity's reading. Done closes the activity. Closing at the session's end saves the summary (§The Delivery Reading). Not done after a usage-limit refusal is a wait. Otherwise it is a Needs you stop carrying the session's last message word for word and one check row per pull request (or one for the plan). A stop, wait or close of either activity leaves the early-merge ledger's completion result as it was, so closing the activity returns the run to complete without evaluating delivery again.

**At the stop.** Only `reply`, `resume` and `check-again` are offered, with Exit Kiln. Each first repeats the reading; when the work is done the activity closes without resuming, with the receipt outcome `already_done`. A reading that cannot read a pull request not already `merged` decides nothing: nothing resumes, no reply is sent, and the stop stays and names the failure, as for the push session. The same holds when the resume after a usage-limit wait or `kiln run` first repeats the reading: the session is not resumed and the merge stop shows the failure. Resume works again once GitHub can be read. `carry-on`, `start-again`, `verify-and-advance`, Mark complete and the fresh-session prompt are never offered for these keys, because nothing starts a second merge or push session. When the conversation cannot be reopened, the stop says so and leaves two ways on: finish the work outside Kiln, then Check again.

A pull request closed on GitHub is not done, so it never closes the merge activity: the stop's check row shows it closed, and Merge with {agent} is not offered again (once per delivery, below). Reopening it on GitHub and pressing Resume carries on the same session, whose resume prompt carries the fresh reading; merging every pull request on GitHub, then Check again, closes the activity as Merged.

**Ctrl+C and restart.** Ctrl+C interrupts the session as it does any other. The next `kiln run` takes the reading first, closes the activity when the work is done, and otherwise resumes the same session through the existing interrupted-session recovery, restart review included. An open activity is handled before anything else `kiln run` does for a finished run, including the early-merge delivery evaluation.

**Once per delivery.** An execution has at most one merge activity. Once it exists, Merge with {agent} is never offered again for that execution. A push activity belongs to one Continue press.

## The Delivery Reading (AC-MERGE-04, AC-MERGE-07, AC-WAIT-01)

One engine operation reads each of the delivery's pull requests from GitHub and saves the result. The delivery's pull requests are the ones the run recorded at completion; repositories recorded as already merged then are shown as today.

| Read as | When |
|---|---|
| `open` | GitHub shows it open. `conflicts` is set only when GitHub says definitively that it cannot be merged cleanly: `mergeable` reads `CONFLICTING` or `mergeStateStatus` reads `DIRTY`. An `open` reading saves the pull request's current head (`headRefOid`) as `headSha` |
| `merged` | GitHub shows it merged into the recorded base, with a merge time and merge commit, and the base branch contains that merge commit. A `merged` reading saves the pull request's head at merge (`headRefOid`) as `headSha`, and is not `merged` without it |
| `closed` | GitHub shows it closed and not merged |

While GitHub has not yet worked out whether an open pull request merges cleanly (`UNKNOWN`), `conflicts` stays unset, the card shows no mark, and Kiln does not read again for it; the next occasion picks it up. A `merged` reading is final and is not read again. A read that fails keeps the previous reading, records the failure and its time, and never infers a state. Nothing resumes a merge session on a reading with a failed read (§After-Delivery Activities). While a pull request's state is unknown, the merge is not offered and the card says GitHub could not be read, with the recorded failure.

The reading also parses the merge order line from each description (§Prompts) into a position, where one is given. The note names that order when every description has the line. When none has it, the note says the session follows any order the descriptions state, which covers pull requests opened before this change, whose order is in prose.

`gh` runs from each repository's main checkout, never from a run worktree, which a person may remove once the work has merged. A repository whose main checkout is not found (§The Plan Check, step 2) is not read, and its read fails with that step's text. One reading runs at a time; an occasion that arrives while one is in flight waits for its result instead of starting another.

**Occasions.** `kiln run` on a finished run, before the terminal's line; opening or reloading the page, which is the view's one request when it mounts (`POST /api/continuation/check` without the press flag), while a reconnect of the event stream and a snapshot read take no reading; Check now, Check for new phases and `kiln check-for-new-phases`; the Merge press, before the activity opens; the end of a merge session; Check again, Resume or Send and resume at its stop; and the resume after a usage-limit wait. There is no timer.

**What follows from it.**

- **The offer** is AC-MERGE-07's table over the saved states, so the page and `kiln status` agree.
- **Merged**: when every pull request reads `merged`, the run is shown as Merged with each merge time and merge commit. The closing summary is saved only when a merge session's own end closes the activity: the reading taken at that end shows every pull request `merged`, and the run that just ended has a final message (`result.text`, non-empty once trimmed), with no usage-limit refusal, interruption or error result. That message is saved word for word in `merge.summary`, whatever it says, since the reading, not the message, decides Merged. The summary is taken from the run that just ended, never from an earlier run, so a resumed session's summary is the final message of its last run and an earlier stop's message is never shown. An activity closed by Check again, by Resume's first reading, or by `kiln run` saves no summary, and neither does a delivery the person merged before any session ran. Without a summary, the Merged card leaves the summary block out and shows each merge time and merge commit only.
- **Waiting**: the delivery waits while the pull request in the PRD's repository is not `merged`, unless it reads `closed` and the person has pressed Check now since. That press is recorded only for a reading a person asked for by the button or the command, never for a page load or `kiln run`, and it stops counting if the pull request is later read as open. A delivery with no pull request in the PRD's repository never waits.
- **The check follows the reading.** On the page, button and `kiln run` occasions the plan check runs straight after the reading when the delivery is not waiting and no activity is open. When a merge activity closes with every pull request merged, the check runs unasked (AC-WAIT-03). On the page occasion this is today's check on page load (AC-FIND-01 in Kiln Continue Added Phases, which AC-WAIT-03 leaves in force), so a phase added after the merge appears on reload with no press. Once every pull request reads `merged` the occasion reads nothing from GitHub and only the check runs. Concurrent occasions from several tabs join the reading and the check already in flight.

## The Merge Session (AC-MERGE-01, AC-MERGE-02, AC-MERGE-03, AC-MERGE-08)

**The press.** The `merge` action takes a fresh delivery reading, then:

| The reading | The action |
|---|---|
| Every pull request `merged` | Completes as `already_merged`; no session starts, and the run shows Merged |
| Any `closed`, or any state unknown | Refused with that reason; nothing opens |
| Otherwise | Opens the merge activity for the pull requests that read `open` |

**Permission.** The accepted receipt for this execution is the whole permission. Nothing is written to settings, to the early-merge authorization or to a preference, and a continuation's fresh execution starts with no after-delivery state, so nothing carries to another pull request, PRD or run.

**The prompt** is a new template, `merge-session.txt`, filled with the pull requests to merge in order (stated positions first, then recorded order), each with its repository, number, feature branch, base branch and worktree. It carries AC-MERGE-03's two columns as written, and these fixed points:

- Before anything else, bring each worktree up to its pull request's head with a fast-forward only (`git pull --ff-only origin <feature>`). If it cannot fast-forward, end there without merging the pull requests after it, and name it.
- Merge the base branch into the feature branch; never rebase, amend or force-push.
- Merge with `gh pr merge --match-head-commit`, pinned to the head it last pushed, or, when it pushed nothing, the head it fast-forwarded to, by the first of merge commit, squash or rebase that the repository allows. Never use an administrator override, and never delete the branch.
- Wait for a pull request's required checks for at most 30 minutes after its last push. A check still failing after its fixes, or not reported by then, ends the session there.
- Read each description before merging, and follow any merge order it states, whether as the `Merge order` line or in prose. Kiln does not check the order.
- A session that cannot merge a pull request ends without merging the ones after it. Its last message names what is outstanding: a conflict to decide, a missing required review, or a required check failing or never reported.
- Never reopen, recreate or replace a pull request. Before waiting on a pull request's checks and before merging it, read its state; one closed on GitHub ends the session there, without merging the ones after it, and the last message names it as closed (AC-MERGE-07).
- Before ending with a conflict to decide, abort the unfinished merge (`git merge --abort`) and name the conflicting files and what needs deciding. Commits already made stay.
- A session that merged everything ends with a short summary of what it did, which becomes the Merged card's summary (§The Delivery Reading).

Merge commit first keeps the delivered commits in the base's history where the repository allows it. Thirty minutes covers ordinary CI and gives "never wait without end" a number. Both are constants in the template.

A resumed session gets `resume-carry-on-merge.txt`, the same rules with the current delivery reading. It opens by telling the session to read each worktree's state first: a merge of the base left in progress by an interruption is the session's to finish, or to abort and redo, never to commit half-resolved.

**Under early merges.** A run with early merges allowed delivers its remaining review pull requests the same way: they are the delivery's pull requests, and the merge session uses this prompt, not the early-merge authority block. `kiln run` on such a finished run evaluates delivery again, and today that evaluation requires an open review pull request holding the feature head, so a review pull request that has merged, by the merge session or by the person, would turn the merged run into a Needs you stop. On a finished run the evaluator therefore counts a repository as delivered when the delivery reading shows its review pull request `merged` and the merged head contains the feature head the run recorded, whoever merged it. The repository's worktree need not be clean: an interrupted merge session that is never resumed, because GitHub already shows the merge, can leave it part-way through a merge.

**The statement of what Kiln may do** (AC-MERGE-08) gains its allowed lines wherever it is built: before Start, in the folder setup panel, and in the settings while Kiln works. The wording is mockup state 8's: the allowed list adds "Merge the delivery's pull requests only when you press Merge with {agent} on the finished page", and the line that forbids drops "merge" and reads "Never deploy or touch other branches". Where early merges are allowed, the early-merge lines stay and the merge line is added. In the PRD's repository only, the allowed list also adds "Push this PRD's documents to {base} only when you press Continue on the finished page" after the merge line; with early merges on, this line is still added, because the push is not an early merge. The settings sentence for the PRD's repository reads "…It merges the delivery's pull requests only when you press Merge with {agent} on the finished page, pushes this PRD's documents to {base} only when you press Continue there, and never deploys or touches other branches."; where one sentence covers each of several repositories, the push clause names the PRD's repository. The README's sentence about what Kiln does by default changes the same way.

## The Plan Check on a Finished Run (AC-WAIT-01 to AC-WAIT-03, AC-BACK-01, AC-BACK-03, AC-BACK-04)

The check runs in this order and stops at the first step that answers.

**1. Waiting.** While the delivery waits (§The Delivery Reading) the result is `awaiting_merge` and no plan is read, whatever the base branch or the main checkout holds. When GitHub cannot be read and the pull request is not already known to be merged, the result is a failed check giving the reading's failure, which for a main checkout that is not found is step 2's text.

**2. One source.** The main checkout must be found first. It is found when the path saved in the record is a folder, Git's top level there is that same path, and its origin is the run's GitHub repository. A fresh clone of the same repository at that path is found and read like the original. Anything else is not found, a plain folder that now sits inside another repository included, and the result is `failed` with the text "Kiln could not find the main checkout at <path>: <what was there>. Put it back at that path, then check for new phases again.", where what was there is nothing, a folder that is not a Git repository, a folder inside the repository at <top level>, or a clone of <other repository>. Continue is unavailable until a later check finds it. Kiln never clones the repository, fetches into a run worktree or reads the plan through GitHub's API in its place.

With the checkout found, the remote base branch is always read. The main checkout's committed plan is read only when the checkout is on the base branch and its tip holds commits the remote base lacks.

| The main checkout | Source |
|---|---|
| On the base branch, and its committed plan has unfinished phases whose ids the remote plan lacks | The main checkout's tip commit |
| On the base branch otherwise | The remote base |
| On another branch | The remote base, with the branch name recorded as the reason the checkout was not read |

Both copies are read from Git objects at one commit each. This PRD's documents are every file under the PRD's folder, together with every file the plan read covers, linked documents included. Uncommitted changes to them, untracked files included, are listed by name from the main checkout's status (`git status --porcelain=v1 -z --untracked-files=all` limited to those paths, both names for a rename) and are never read. The list is made whichever source was read, the checkout on another branch included, so a phase document written but not committed is named as not read. The two copies are never compared with each other and never combined. The check's final guard against a moving source compares commits, not files: the remote base's revision as today and, for an offer read from the main checkout, its branch and tip commit. An uncommitted edit made during or after a check never fails the check and never supersedes a granted early merge.

**3. What is finished.** The run's completion record is the set of phase ids in the completions of the run's retained plan baseline, together with every phase of the finished execution whose facts show it done (Mark complete included) or skipped on a waiver. Each of these is mapped to a plan id by plan reading's judgement against the execution's recorded plan: the plan its last in-progress read saved, which is also the plan its done checks judged. The plan read now is never used, so a finished phase that later gained phases beneath it keeps its own id, and its new children are not taken for it. Only phase facts count, never final delivery, an audit or a preflight. The baseline already carries every earlier execution's finished phases, every phase closed before a start and accepted then, and every phase accepted as completed outside Kiln when Continue activated, so the record covers the whole history of the PRD, not only the last execution. Split parents are never in it. The external-completion accounting ties a session to a Closed leaf against the same recorded plan. A record from before baselines existed builds the set from its phase facts, as today.

Each leaf of the plan read is classed by one table.

| The leaf | Class |
|---|---|
| Its id is in the run's completion record | Finished. It is carried and never compared, whatever its document now says |
| Not in the record, and Closed in its document | Completed outside the run, by the existing external-completion accounting |
| Not in the record, and not Closed | Unfinished: counted and offered, wherever it sits, beneath a finished phase included |

A finished id that the plan read no longer has, or now has as a split parent, stays finished and is not reported. Split parents are never leaves, so they never count. When Continue activates a fresh execution, its retained baseline carries this same completion record, not only the candidate's completions, together with the phases accepted then as completed outside Kiln; every id in it is carried as closed, so a finished phase whose Closed line was later removed is not built again.

**4. Readiness** runs as today when there are unfinished phases, with two changes to what proves a finished phase's work is in the base:

- A merge Kiln confirmed counts, so a squash merge, a rebase merge, a branch updated on GitHub before merging, and a fresh clone made after the branch was deleted all leave Continue available. For each repository whose delivery pull request reads `merged`, readiness first fetches that pull request's saved head into the main checkout by commit, the same fetch the remote base uses (`git fetch --no-tags --no-write-fetch-head origin <headSha>`). It changes no ref and never touches a run worktree. GitHub serves the head after the branch is deleted, through the pull request's own ref. A finished phase's commit is then in the base when the merged head contains it and the base revision read contains the merge commit, both tested locally. A merge commit absent from the object store after the base fetch is not in the base. A failed fetch fails the check with Git's reason.
- When the delivery's pull request was closed without merging and its work is not in the base, the readiness line says so in plain words, naming the pull request and that reopening and merging it brings Continue back. Continue stays unavailable. This is the guard for Check now pressed on a closed pull request: Kiln never builds added phases on a base that lacks the delivery.

**The result.**

| Status | When | The page |
|---|---|---|
| `awaiting_merge` | Step 1 | The pull request card's one line (AC-WAIT-02); no panel |
| `unchanged` | No unfinished phase | **No new phases found**, with the check time |
| `available` | Unfinished phases, and ready | The offer (AC-BACK-04) |
| `blocked` | Unfinished phases, and readiness not met | The offer with its readiness results; Continue unavailable |
| `failed` | A required read failed, the main checkout is not found, or a plan is invalid | **Could not check for new phases**, as today, with the reason |

Phases completed outside the run are still listed with their evidence, but they no longer change the status when nothing is unfinished. A phase closed by hand without external completion evidence is not unfinished and is never offered, but it is listed as closed outside Kiln and not verified, and, as today, it blocks Continue whenever there are unfinished phases; when nothing is unfinished the result is **No new phases found** with that listing. No result carries an internal problem code or a list of differing documents.

**Where the phases came from** (AC-BACK-04). For the remote base, the result names the most recent commit that added one of the unfinished phases' documents, with its date and subject. For the main checkout, it says they are committed on this machine's base branch and not pushed, and that Continue pushes them first.

## Continue and the Push Session (AC-BACK-05)

An offer read from the main checkout is ready on the same readiness results as any other, although its documents are not in the remote base yet. Its proposal records that source and the commits the checkout's base branch holds beyond the remote, each marked as touching only this PRD's documents or not. This PRD's documents are as §The Plan Check defines them, taken from the plan read at the checkout's tip.

Accepting such an offer, from the page or with `kiln continue-with-phases`, does not create the acceptance yet. It opens the push activity, bound to the offer's ordered unfinished phases with each phase's own scope digest (`phaseScopeDigest`), and the receipt completes as `plan_push_started`.

**The prompt**, `plan-push-session.txt`, gives the main checkout, the base branch and the listed commits, and these fixed points:

- If a listed commit touches anything but this PRD's documents, push nothing and end, naming those commits.
- If the remote base has moved, merge it into the local base branch. If the same documents changed in a way that needs a decision, abort the merge and end, naming the documents and what needs deciding.
- Never stash, commit, change or discard uncommitted work. If Git refuses because of it, abort and end, saying so.
- Push with a plain `git push`, never forced. If it is refused, end with the refusal word for word.
- A reply may say to push the other commits too, or how to combine the documents. No reply permits a forced push or touching uncommitted work.

Aborting the merge before ending means a session that stops never leaves the person's checkout part-way through one. An interrupted session can, and `resume-carry-on-plan-push.txt` tells the resumed session to finish or abort a merge in progress before anything else.

**Done** is read from the remote base, at the session's end and whenever a stop's Check again, Resume or Send and resume, the resume after a usage-limit wait or `kiln run` first repeats the reading. It is done when either holds: the remote base's plan has a phase with every offered id, whatever its document now says, or the remote base contains the main checkout's base-branch tip (`refs/heads/<base>`) as it stands at that reading. The first covers a push that rewrote the commits, such as a squash-merged pull request or a push of this PRD's documents alone. The second covers a reply that dropped or renumbered an offered phase, and a person who withdrew the plan by resetting the local base. Neither holds at the press: the offer was read from the main checkout only because the remote plan lacked one of its ids and the tip held commits the remote lacked. Both read the revision `remoteBase` fetched, never `origin/<base>`, which that fetch does not update. A remote plan that cannot be read makes the first clause false and leaves the second to decide. A remote that cannot be reached decides nothing: nothing resumes, and the push stop shows the failure. The engine then runs the plan check again. When the new offer's ordered unfinished phases match the offered ones by id and phase scope digest and it is ready, the engine accepts it itself, as an automatic journal instruction linked to the original receipt, and Continue goes on as today: setup, the preflight, the build. Otherwise the result is shown as found and nothing starts: a refreshed offer for a fresh choice (AC-OFFER-03 in Kiln Continue Added Phases), a blocked offer, or **No new phases found**.

**An early-merge grant does not survive the push.** A target grant given before the press (AC-CONTINUE-09 in Kiln Continue Added Phases) is bound to the offer's `scopeDigest`, which includes each repository's base revision. The push moves the PRD repository's base. So the re-check marks that pending authority superseded, as any change to the base does, and the refreshed offer is blocked until the grant is given again. This is AC-OFFER-03's fresh choice. Kiln shows the refreshed offer with **Authorize early merges** again and explains that pushing the plan moved the base branch, so the earlier permission no longer applies. Nothing starts until the person grants and presses Continue. Kiln never carries a grant to the new offer or re-binds it, even when the only change is Kiln's own push. An offer missing its grant is not ready, so it is never accepted automatically.

**The row.** While it runs, the push session belongs to the finished execution. At activation its facts and session move to the fresh execution, so **Push the plan** stays before the first added phase, and the archived execution keeps no copy.

## Exit Kiln (AC-EXIT-01, AC-EXIT-02)

`exit` is a journal action, available on a finished run whenever no session process is running and Kiln is not starting one: no journalled command is applying and no accepted continuation is being set up. That includes the Merged page, a merge or push stop, a wait for a usage limit, and a plan check or delivery reading in progress. While a session runs or starts, Exit is unavailable, and its reason says Exit Kiln returns when the session ends, or once Kiln has started it, and that Ctrl+C stops everything. A plan check or reading in progress is abandoned. The ordinary stop path aborts it, as Ctrl+C does today, and the record keeps the last completed check. The next `kiln run` checks again.

In order: the receipt completes and is flushed; the caller gets its answer; every open page receives an `exited` event with the time, how Kiln was exited and the command that opens the PRD again; then, after the short delay a reset already uses, the run ends through the ordinary stop path with exit code 0. That path releases keep-awake and helper processes, closes the server, releases the instance lock and prints the last line, which says Kiln was exited from the page (or from the command line) and gives the same command.

A page that receives `exited` shows the Kiln has exited state from the event and stops reconnecting, so it never shows the disconnected banner. Exit writes nothing but its receipt: no pull request, branch, worktree or record changes. An abandoned check saves nothing to the record. Files a part-way check may already have written, content-addressed baseline or proposal files and a pending approval marked superseded, are what Ctrl+C at the same moment leaves today, and the next check writes them again; they stay within AC-EXIT-02.

## Closing-Audit Names (AC-AUDIT-01)

One function, in a module the page can import, gives every audit activity its row title, the line beneath it and a sentence form for prose.

| Activity | Title | Line | In a sentence |
|---|---|---|---|
| A delivery audit | Delivery audit | Loop _n_ of _limit_ | delivery audit loop _n_ |
| A test audit | Test audit | Loop _n_ of _limit_ | test audit loop _n_ |
| A session of test fixes | Fixing tests | From test audit loop _n_ · session _k_ | fixing tests from test audit loop _n_, session _k_ |

_n_ is the loop the ledger counted for the audit. A session of test fixes takes the loop of the test audit that started its chain, and _k_ is its place in that chain, counted from 1. _limit_ is the limit in force. An audit the ledger did not count as a loop shows its title alone, and a phase an audit added keeps its phase title.

The function replaces every place a person reads an audit's name: the phase-plan row and the session page's heading; the terminal's audit lines, including the line that starts an audit; the live-control label, the pause label and the pause sentences built from it; the paused-partway page's eyebrow and the pause panel's activity name; the "was marked complete" check row; the `kiln status` progress rows, title and line both, and the waiver labels; and the "listed by" and "settled by" names in the session page and the pull request description. The audit prompt's own round and continuation numbers are not a person's reading and stay.

## Interfaces (AC-BOT-01, AC-BOT-02)

**Command line.**

```
kiln merge <prd> --only-if-status-matches <token> --command-id ID
kiln exit <prd> --only-if-status-matches <token> --command-id ID
kiln check-for-new-phases <prd>
kiln continue-with-phases <prd> --proposal ID --only-if-status-matches <token> --command-id ID
```

- `merge` and `exit` join the journalled actions, with a command ID for retries and a status token for targeting, as every control that changes work has. The status token covers the after-delivery state, so a press made on a stale reading is refused. `kiln merge --help` carries the button's note, including that the merge may start the base branch's CI or deployment.
- `check-for-new-phases` takes the delivery reading and then the check, as Check now does, and counts as a person's press. It still keeps no receipt.
- `continue-with-phases` is unchanged in form. On an offer read from the main checkout it starts the push first, and its receipt says so.
- `kiln status` lists `merge` and `exit` among the controls, each with whether it is available and why not. `exit` is available during a plan check or delivery reading, which it abandons, and unavailable while a session runs or Kiln is starting one (§Exit Kiln).
- The controller advertises an `after_delivery` feature. The command line refuses `merge` and `exit` against a controller without it, as it does for other newer commands.

**Local routes.** `POST /api/merge` and `POST /api/exit` submit the two actions from the page. `POST /api/continuation/check` and its control-API twin take the reading before the check, with a flag the Check now and Check for new phases buttons set to mark a person's press. The event stream gains the `exited` event.

**Snapshot and status** carry the same object, as `after_delivery` in JSON:

```
afterDelivery?:                    — on a finished run
  pullRequests: { repository, number, state: "open" | "merged" | "closed",
                  conflicts?: true, order?: { position, of },
                  mergedAt?, mergeCommit?, readAt }[]
  readError?: { at, problem }
  waiting: boolean
  merge?:    { state: "running" | "stopped" | "waiting" | "done", sessionId?, startedAt?, doneAt?, summary? }
  planPush?: { state: "running" | "stopped" | "waiting" | "done", sessionId?, proposalId }
continuation.check.result          — gains:
  source: { kind: "remote_base" | "main_checkout", branch, revision }
  notRead?: { reason: "other_branch", branch }
  uncommitted: string[]            — this PRD's documents with uncommitted changes, not read
  origin?: { kind: "commit", revision, committedAt, subject } | { kind: "unpushed" }
```

Audit rows carry the title and line of §Closing-Audit Names, and a session of test fixes carries `fixing: { loop, session }`. The numeric `round` and `continuation_index` stay in JSON as identifiers. `kiln status` text prints the states of AC-BOT-02 in the page's words: waiting to merge, merging, merged, pushing the plan, a stopped merge or push session, and either answer of the check with where the phases came from.

## Display Contract

**Header of a finished run**, first match:

| The run | Header |
|---|---|
| A merge or push session stopped | **Needs you** |
| The merge session is running or waiting for usage | **Merging** |
| The push session is running or waiting for usage | **Pushing the plan** |
| The check found unfinished phases | **New phases found** |
| A check that is not waiting is running or failed | As today |
| Every pull request merged | **Merged** |
| Otherwise | As today: **PR ready for review** and its variants |

While the delivery waits, the check never changes the header.

**Screens.** A finished run with a session running stays on the finished page, with the session shown in the pull request card (mockup states 2 and 5). A stop uses the existing Needs you page with copy for each activity (state 4). At a merge stop, a pull request read `closed` says “{repository} #{number} was closed on GitHub without merging. Reopen it there, then press Resume.” in its check row and in place of the line under the last message that says the pull request is unchanged. The card's line about a closed pull request shows only while no merge activity exists; while the merge session runs, that pull request's row reads Closed without merging and nothing more. The pull request card carries the merge button and note, the conflict mark, the per-request states and the one line about new phases with **Merged it yourself? Check now**, which reads **Check now** while that pull request is closed (state 1). Once Merged, Exit Kiln is the card's main button (state 3). Exit Kiln stays enabled while a check runs, and is disabled with its reason while a session runs or Kiln is starting one (state 2, §Exit Kiln). The check's panel shows only the two answers (state 5). The terminal says the card's sentence while the delivery waits. The mockup is the reference for all wording.

## Data Models and Upgrade

The record gains one object, at schema 25:

```
afterDelivery?:
  pullRequests: { repository, number, state, headSha?, mergedAt?, mergeCommit?, conflicts?, order?, readAt }[]
  readError?: { at, problem }
  checkedWhileClosedAt?: string
  merge?:    { operationId, requestedAt, via: "browser" | "command_line", pullRequests: { repository, number }[],
              pressHeads: { repository, sha }[], doneAt?, summary? }
  planPush?: { operationId, requestedAt, via, proposalId, offered: { id, phaseScopeDigest }[], doneAt? }
```

Sessions, stops and waits of the two activities live in the record's phase facts under their keys, as for any activity. The session kind, stop kind and activity kind unions gain the values in §After-Delivery Activities. A proposal gains `source: { kind: "remote_base" | "main_checkout", branch, revision }` and, for the main checkout, its commit list, as optional fields, and loses `sharedDigest`. For the main checkout, `branch` and `revision` are the base branch and the tip commit the offer was read from, which the push activity's folder check holds the checkout to. The input observation `shared_documents` is removed. Stored proposals that carry `sharedDigest` still read and verify, since their id is the hash of the stored body. A pending grant made before the upgrade is superseded by the first new check, because the proposal's `scopeDigest` changes, and is given again.

The migration adds nothing. A saved check result made under the old rules is dropped, so no stale "Plan needs reconciliation" or waiting panel can render before the first new check. Saved baselines, proposals and acceptances stay readable. Kilns at schema 24 refuse schema 25 under the existing newer-schema rule. All new times are UTC ISO 8601.

## Prompts

- `merge-session.txt` and `resume-carry-on-merge.txt` (§The Merge Session); `plan-push-session.txt` and `resume-carry-on-plan-push.txt` (§Continue and the Push Session).
- `pull-request-cross-links.txt` adds: where the pull requests must merge in an order, each description ends with the line `Merge order: N of M`. A description without the line states no order, and its pull request can merge at any point (SCOPE-001).
- `pull-request-session.txt` and `phase-session.txt` keep their sentences forbidding a merge.

## Changes to Earlier Designs

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Comparison rules (a completed phase is carried by the run's completion record alone; an unfinished phase beneath one is an addition; no unresolved earlier-work class for a finished run), §Completed feature discovery and §Implemented completed-check observation (one source by AC-BACK-03's table, read from committed objects; waiting is read from GitHub; no source conflict), §Readiness and Planned Preparation (a confirmed final merge is integration evidence; an offer read from the main checkout is ready before its documents are in the base), §Durable proposal and one acceptance (accepting such an offer pushes first, then accepts the matching refreshed offer itself) and §Snapshot and screen contract (the check result's new fields; the two answers).

Replaces in part: `docs/prds/kiln-v1/technical-design.md`, §Where a Feature Stands: what `kiln run` does (a finished run reads GitHub first, and an open after-delivery activity is resumed like any interrupted session), §Stopping a session: Ctrl+C, a closed terminal and signals (Exit Kiln also ends the process, with exit code 0), §Command line, §HTTP API and §Snapshot (the additions in §Interfaces) and §Kiln's State on Disk (schema 25).

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The Pull Requests (the merge order line in each description) and §Screens (AC-SHOW-01) (the pull request card).

Replaces in part: `docs/changes/kiln-development-deployments/kiln-development-deployments-technical-design.md`, §One authority statement everywhere (the statement names the merge on the finished page and, in the PRD's repository, the plan push), §One evaluator at every transition (on a finished run, a review pull request GitHub shows merged counts as delivered, whoever merged it) and §Display Contract (the Merged header).

Replaces in part: `docs/changes/kiln-needs-you-handoff/kiln-needs-you-handoff-technical-design.md`, §Evaluate, then act (a merge or push stop takes its own reading first and never offers a fresh session).

Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Check Runs and When Mark Complete Is Offered (a merge or push stop never offers Mark complete).

Replaces in part: `docs/changes/kiln-live-session-control/kiln-live-session-control-technical-design.md`, §Snapshot and browser, and `docs/changes/kiln-pause-now/kiln-pause-now-technical-design.md`, §The Pause Now State and §Wording (the merge and push sessions, like final delivery, offer no live controls and say why; an audit's label comes from §Closing-Audit Names).

Replaces in part: `docs/changes/kiln-build-preflight/kiln-build-preflight-technical-design.md`, §When the Preflight Is Due (when Continue pushes the plan first, the push session runs before the preflight).

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (`merge` and `exit`) and §Local API and Integration Points.

Replaces in part: `docs/changes/kiln-deliver-when-audit-loops-run-out/kiln-deliver-when-audit-loops-run-out-technical-design.md`, §The Status Line (a session of test fixes names its loop and session on its row) and §Interfaces (`check-for-new-phases` reads GitHub first; `continue-with-phases` pushes first).

Replaces in part: `docs/changes/kiln-completion-audits/kiln-completion-audits-technical-design.md`, §Progress and Detail Contract, and `docs/changes/kiln-audit-loop-limits/kiln-audit-loop-limits-technical-design.md`, §Display Contract (audit names by §Closing-Audit Names).

## Delivery

- **Before the build:** a disposable GitHub repository with a protected base branch and one required check, as the Development Deployments proof used, with `gh` signed in on the build machine. Whoever starts the build provides it.
- **Expected build spend:** about $20, for one real merge session and one real push session with each agent against that repository, proving that a real session follows the merge rules and that GitHub then reads as merged (AC-MERGE-03, AC-MERGE-04) and that a real push session stops as the table says (AC-BACK-05). Everything else runs on scripted provider sessions.
- **After the build:** add the `CHANGELOG.md` entries under Unreleased when the work merges to `develop` (`Added`: Merge with {agent}, Exit Kiln, `kiln merge`, `kiln exit`; `Changed`: the waiting line, the two answers, Continue pushing the plan, the audit row names; `Fixed`: the false "Plan needs reconciliation" on an unmerged delivery). Update `docs/kiln-command-line-and-bot-control.md` and the README's statement. Mark the roadmap's "Merge the final PR" entry and its idea note implemented. Publish through the repository's publish gate and release by the release guide.

## Verification and Criteria Coverage

Real temporary Git repositories with bare origins, the engine harness with scripted provider sessions, GitHub responses replayed from contracts captured on the disposable repository, the packaged CLI against the local server, and the real browser view. Crash points: after the activity is recorded, after launch, after the session ends and before the reading, and after the reading.

| Criteria | Design | Named proof |
|---|---|---|
| AC-MERGE-01, AC-MERGE-07 | The Delivery Reading; Display Contract | Each row of the offer table on the page and in `kiln status`; the conflict mark for `CONFLICTING` and for `DIRTY`, and none for `UNKNOWN`; the note for one pull request, for two with a stated order and for two with none; a failed GitHub read offers no merge and says why; a closed pull request is never reopened or replaced |
| AC-MERGE-02 | The Merge Session | One press opens one activity; a second press, a stale tab and a replayed command start nothing more; a continuation's execution has no merge permission; no setting or grant changes |
| AC-MERGE-03 | The Merge Session; Prompts | The prompt carries both columns and the fixed points, the fast-forward first; a real session with each agent merges a conflicting pull request on the disposable repository after its required check passes; after the pull request's branch is updated through GitHub's update-branch API, it fast-forwards its worktree and then merges; it stops unmerged when the check fails or a review is required; with two pull requests it stops at the first it cannot merge |
| AC-MERGE-04 | The Delivery Reading | Merged only from GitHub, for a merge commit, a squash and a rebase; a session that says it merged when GitHub disagrees stops; a pull request the person merged shows merged with no summary at the next reading; the summary is the session's final message word for word; a resumed session's summary is its last run's message, not the earlier stop message; a run refused by a usage limit after the last merge saves none; a hand merge after a stop leaves the summary block out |
| AC-MERGE-05 | After-Delivery Activities | Each activity runs with the run's agent, model and effort, has its row in its place and is not counted in phases done; no message box, pause or takeover, with the reason shown; a billing hold, a usage-limit wait and its resume, and Ctrl+C with the next `kiln run` resuming the same session; a removed worktree or a moved main checkout refuses the press and Resume with its reason; the press refuses a worktree with a merge in progress (`MERGE_HEAD`) even when it shows no uncommitted changes; a press after GitHub's Update branch, with the pull request's head never fetched, is accepted, brings in its objects without writing a ref and records the worktree's head as the press head; a press after a suggestion committed on GitHub is accepted; a diverged worktree (a local commit and Update branch, or Update with rebase) refuses the press with the diverged wording; a failed fetch refuses the press naming the failure; Resume after Ctrl+C in the middle of a conflict, with the merge still in progress, is allowed and resumes the same session; a Codex and a Claude Code merge session launch and resume after the worktree of a repository whose pull request already merged was removed; on an early-merge run, a merge stop, its close and the next `kiln run` after the review pull request merged (by the session and by hand) leave the run complete |
| AC-MERGE-06 | After-Delivery Activities; Display Contract | A stop shows the last message, Resume, Send and resume, the terminal command and Check again, and no Merge, Continue, carry-on, start-again or fresh prompt; Check again and Resume close the activity without resuming when the work is already done; a merge session that stops on a conflict leaves no merge in progress in its worktree; a pull request closed on GitHub mid-session ends the session at a Needs you stop naming it as closed, with nothing after it merged; Check again keeps that stop; Resume after it is reopened carries on the same session; Merge with {agent} is never offered again; a closed pull request at a merge stop shows the reopen-then-Resume line; the card's reopen line is absent once a merge activity exists; a GitHub read that fails at Resume or at Send and resume refuses with the failure, resumes nothing and keeps the stop; the same at the resume after a usage-limit wait and at `kiln run` |
| AC-MERGE-08 | The Merge Session | The statement before Start, in the folder setup panel and in the settings, with early merges off and on, in one repository and several; the push line, in the PRD's repository only, with early merges off and on |
| AC-WAIT-01 | The Plan Check, step 1 | The reported case: the base gains a commit to a linked document outside the PRD folder while the main checkout stays behind, and again with the checkout brought up to date; both report waiting only. Waiting ends on a merge by any method, by Kiln or the person; a delivery with no pull request in the PRD's repository never waits; a closed pull request waits until Check now |
| AC-WAIT-02 | Display Contract | No check panel while waiting; the card's one line, with **Check now** while closed; the header and the terminal's sentence |
| AC-WAIT-03 | The Delivery Reading | The check runs unasked when a merge activity closes with everything merged; the header reads Merged or New phases found; a reload after the merge shows a phase added since, with no `gh` call; two tabs loading at once run one check |
| AC-BACK-01 | The Plan Check, step 3 | A finished phase whose document was edited, reopened, renamed, removed or given children is never offered or rebuilt, and a fresh execution does not build it; while PLAN-001 is open it is not mentioned (AC-BACK-01's line is not built); an unfinished phase beneath a finished one is offered; a continuation of a continuation does not offer the first continuation's phases again; a leaf finished under its own completion check just before delivery is finished; split parents and numbering gaps add nothing; a finished leaf given children after the run finished stays finished and is not reported, and every child is offered, the first one included; no surface shows "Plan needs reconciliation", a problem code or a list of documents |
| AC-BACK-03 | The Plan Check, step 2 | Each row of the source table; a checkout that is ahead with no new unfinished phases, behind or diverged reads the remote base; uncommitted documents are named and unread, and an uncommitted new phase document and an uncommitted edit to a linked document outside the folder are both named as not read; another feature branch or worktree is never read; a checkout deleted, moved, stripped of its `.git`, replaced by a clone of another repository or left as a plain folder inside another repository fails the check with the path and what was there, with Continue unavailable and nothing cloned or fetched elsewhere; a fresh clone of the same repository at the path reads normally |
| AC-BACK-04 | The Plan Check; Display Contract | The panel's heading, the planned-not-built rows and where the phases came from, for the remote base and for the main checkout; the readiness results still decide Continue; Continue is available after a squash merge whose branch was deleted, read from a fresh clone, after Update branch then a squash merge, and after a rebase merge; the head fetch changes no ref and nothing in a run worktree; a merged head that cannot be fetched gives **Could not check for new phases** with Git's reason; a merge commit missing from the base revision read leaves Continue unavailable; a reload after the merge makes no `gh` call; after Check now on a closed pull request whose work is not in the base, Continue is unavailable and says why |
| AC-BACK-05 | Continue and the Push Session | One press pushes, checks again and starts the build, the preflight after the push; each row of the stop table, with nothing pushed; a reply that allows the other commits; a changed offer after the push needs a fresh choice; Done, with the build starting, when the session merges the moved remote base and when it rebases; not Done when the push is refused after a local merge; Done when the person pushes by hand during a stop, a squash-merged pull request included; Done when only this PRD's documents were pushed and other commits stay local, with the re-check reading the remote base; a reply that drops or renumbers an offered phase is Done, then a fresh choice; a local base reset is Done and nothing starts; a remote plan unreadable after the push is Done, then **Could not check for new phases**; a phase committed locally after a hand push is Done, then a fresh choice read from the main checkout; the ancestor test reads the fetched revision while `origin/<base>` is stale; an offer needing an early-merge grant: after the push the grant is superseded and the refreshed offer asks for it again; nothing starts; never a forced push; uncommitted work untouched; a real push session with each agent |
| AC-EXIT-01, AC-EXIT-02 | Exit Kiln | Offered on the finished page, the Merged card and a merge or push stop; Exit during a plan check or delivery reading aborts it, saves nothing to the record and the next `kiln run` checks again; unavailable with its reason while a session runs, while a journalled command applies and while an accepted continuation is being set up; exit code 0, no agent or helper process left, the instance lock released, the last line and the page's exited state with the command; no pull request, branch, worktree or record changed |
| AC-AUDIT-01 | Closing-Audit Names | Each row of the name table on every surface listed, including the paused-partway page, the pause panel, the terminal line that starts an audit and the pull request description; a session of test fixes after a second test loop names loop 2; "Round" and "Continuation" appear in no rendered name |
| AC-BOT-01, AC-BOT-02 | Interfaces | `kiln merge` and `kiln exit` with their refusals, retries by command ID and stale tokens; both refused against a controller without `after_delivery`; `check-for-new-phases` as Check now; `continue-with-phases` pushing first; status text and JSON for each state |
| Upgrade (no criterion) | Data Models and Upgrade | A schema-24 finished record with a saved "blocked" or waiting check loads with no check shown until the first new one |

## Open Questions

- **SCOPE-001, MERGE-001 and PLAN-001** are open with stakeholders. If SCOPE-001 is answered the other way, the offer adds one condition, exactly one open pull request. If MERGE-001 is answered the other way, the merge activity stops being excluded from live controls, and Pause now and takeover need a hand-back the design does not have. PLAN-001 reopens AC-BACK-01's line for an edited finished phase, and the build leaves it out. If the ruling stands, the plan check keeps each finished phase's document as it was at completion, compares it on every check, and the answer carries one line per edited phase.
