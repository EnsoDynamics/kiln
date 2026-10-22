# PRD: Kiln multi-repo delivery

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), and in part [Kiln usage-limit recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md). Decisions awaiting validation are in [assumptions](assumptions.md); the screens that change are drawn in [mockups](mockups/).

## Summary

Kiln v1 can only deliver a PRD whose code lives in the same repository as the PRD. This change lets Kiln deliver a PRD whose work spans several repositories. A typical case is a product repository holding the PRDs, with the code in separate repositories beside it, one per service or app.

Each phase document can name the repositories its phase changes. At Start, Kiln makes the feature branch in every repository the PRD needs, with a worktree of each gathered in one folder for the PRD. Sessions work across that folder, one phase at a time as in v1. A session that finds it needs a repository nobody named asks Kiln for it and carries on, without stopping. A session seen editing or committing in a repository outside that folder stops at Needs you instead, because that work bypasses the feature branch. When every phase is closed, Kiln opens one pull request in each repository that changed. The pull requests link to each other and say which to merge first.

A PRD whose phases name no other repository keeps v1's worktree, branch and screens. Its sessions can still add a repository, and the new check for work outside the workspace applies to it too.

## Business Context

Keeping requirements in one repository and code in many is common: microservices, a mobile app beside its API, a website beside its backend. In v1, Kiln can't deliver any PRD set up that way. It makes one worktree of the PRD's repository, and its done check looks only there. A session that changed a code repository would be editing that repository's own checkout, on whatever branch it happens to be on. Worse, v1 wouldn't notice: if the session also closed and pushed its phase document, all three checks pass, and the change is left in the person's checkout with no pull request.

Phase planning can't always know every repository a phase will touch. A phase can turn out to need a change in a service nobody expected until the code was read. Stopping for that would leave the person to set up a branch and worktree by hand, which is exactly the babysitting Kiln exists to remove. So a session can ask Kiln for another repository and keep going (REPO-002).

The new check for work outside the workspace is the first part of the done check that Kiln reads from the session's transcript rather than from Git. It reads only the file edits and Git commands the transcript records, never the session's words, and no model judges it (Kiln v1, AC-DONE-04).

Running phases in parallel is a likely later version of Kiln ([Kiln ideas after v1](../../design/kiln-after-v1-ideas.md), "Run independent phases in parallel"). This change keeps the parts that version needs: one feature branch per repository, with one name everywhere, as the branch finished work collects on and each pull request comes from; a base branch per repository; repositories found by folder name; and one pull request per repository. Parallel phases will change the rest. Each running phase will need its own workspace and its own branch in each repository, joining the feature branch when the phase is done. "Pushed" will then mean that phase branch plus the join, and the outside-the-workspace check will judge each phase against its own workspace. This change doesn't build per-phase branches or workspaces, since one phase at a time gains nothing from them (BRANCH-002).

### Terms used in this PRD

- **Needs you**, the **pull-request session**, **leaf** and **closed** mean what they mean in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md#terms-used-in-this-prd). The **done check** does too, with this change's fourth part (AC-OUTSIDE-01) and with Committed and Pushed covering every repository (AC-CHECK-01).
- The **PRD's repository** is the repository holding the PRD's directory, the one `kiln run` is pointed into.
- A **named repository** is one a phase document names as a repository its phase changes. An **added repository** is one Kiln added after Start (AC-ADD-01, AC-ADD-04).
- The **PRD's repositories** are the PRD's repository, every named repository and every added repository. The PRD's repository is always among them, since the sessions close their phases in its phase documents.
- The **workspace** is the one folder Kiln makes for a PRD, holding a worktree of each of the PRD's repositories, all on the feature branch.
- A repository is **beside** the PRD's repository when its checkout is a folder in the same parent folder as the PRD repository's checkout: `~/devel/acme/storefront` is beside `~/devel/acme/product`.
- A repository's **own checkout** is the one the person and their other chats work in, as opposed to its worktree in the workspace.
- A session's **transcript** is Claude Code's own record of the session: every message and tool call, including the turns of a session the person reopens by hand with `claude --resume`.

## Acceptance Criteria

### Know Which Repositories a PRD Changes

Before anything starts, Kiln shows which repositories the PRD will change, as far as its phase documents say, and checks it can work in each one.

- [ ] **AC-REPO-01 — A phase can name the repositories it changes.** A phase document names the repositories its phase changes on a `**Repositories:**` line under its title, by folder name, separated by commas: `**Repositories:** returns-api, storefront` (REPO-004). The PRD's repository is named there only when the phase changes code in it. A phase document with no such line changes only the PRD's repository, as in v1. Kiln reads the line in every phase document. A split parent's names join the PRD's repositories like any other; they aren't passed down to its children.
- [ ] **AC-REPO-02 — Kiln finds each named repository beside the PRD's repository.** Kiln looks for each named repository beside the PRD's repository (REPO-001). The start checks fail, naming the repository and the folder Kiln looked in, when a named repository isn't there, isn't a Git checkout, or has no `origin` on GitHub. A named repository's own checkout doesn't have to be clean, since other work may be in progress there and Kiln starts its feature branch from the base branch on `origin`. The clean-checkout check stays on the PRD's repository, whose documents Kiln reads.
  - Replaces in part: AC-START-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the named repositories are checked too; the clean-checkout check still covers only the PRD's repository)
- [ ] **AC-REPO-03 — Documents found shows the repositories.** For a PRD with more than one repository, each phase in the plan on Documents found shows the repositories it names, and the delivery settings list every repository: its name, the PRD's repository marked as such, and the base branch the feature branch starts from. Documents found also says that sessions can add a repository they find they need (AC-ADD-01). Its passed checks add "Named repositories found beside <PRD's repository>", and the clean-checkout check names the PRD's repository, the only one it covers. The terminal's first line counts the repositories ("3 repositories"). The repository label above the feature name stays the PRD's repository.
  - Replaces in part: AC-START-04 and AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Documents found and the terminal's first line show the repositories)

### Give the PRD One Workspace Across Its Repositories

Kiln sets up everything the sessions need before the first phase starts, so every session can work in every repository of the PRD without touching the person's own checkouts.

- [ ] **AC-SPACE-01 — One workspace, one feature branch in each repository.** At Start, Kiln creates the feature branch in each of the PRD's repositories from that repository's base branch, and a worktree of each, all inside the workspace. Unless the person changes them before Start:
  - the workspace is `.worktrees/<PRD folder name>/` in the folder that holds the PRD's repository, outside every repository's own checkout, and each repository's worktree is the folder of the same name inside it;
  - the feature branch is the same name in every repository (BRANCH-001);
  - each repository's base branch is chosen by v1's rule: `develop`, or that repository's default branch when it has no `develop`.

  Before Start, the person can change the workspace, the feature branch name and each repository's base branch, and Kiln checks the feature branch name is free in every repository (UI-003 in `docs/prds/kiln-v1/assumptions.md`). When Start fails partway, each repository already set up keeps its worktree, branch and base, and the workspace and feature branch name can't change any more. The person can still change the base of a repository not yet set up, and the next Start finishes the setup from where it stopped.
  - Replaces in part: AC-START-06, AC-START-07, AC-GIT-01 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch, and what a failed Start fixes)
- [ ] **AC-SPACE-02 — Each session can work in every repository of the PRD.** Each phase's session can read, change, commit and push in every worktree in the workspace, those added during the phase included. It is told the PRD's repositories, where each worktree is, and that it commits and pushes to the feature branch in each repository it changes. It is also told to stay inside the workspace, and to ask Kiln for a repository it needs that the workspace doesn't have (AC-ADD-01) rather than change that repository's own checkout. Wherever v1 says "the PRD's worktree", it now means the workspace.
  - Replaces in part: AC-RUN-02, AC-RUN-03, AC-RUN-07, AC-MULTI-03 and AC-PROOF-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the session works across the workspace, and may ask Kiln for another repository)
- [ ] **AC-SPACE-03 — A one-repository PRD keeps v1's layout and screens.** When the PRD's only repository is its own, the worktree path, the branch, the folder the session starts in, the pull request and the screens are as in v1, and a PRD already underway when this change ships carries on with them. Like every PRD's, its sessions can add a repository (AC-ADD-01), and its done check includes Stayed in the workspace (AC-OUTSIDE-01). Its workspace is the folder holding its worktree, wherever the person put it, and an added repository's worktree goes in that folder beside it. Its Documents found adds one line: sessions can add a repository they find they need, and Kiln may do there what AC-PRS-04 lists. Once it has an added repository, it is a multi-repository PRD and its screens show the repositories.
- [ ] **AC-SPACE-04 — A stopped session can be reopened where it worked.** At Needs you, the resume command changes to the folder the session started in, and the fresh-session prompt names the workspace and the PRD's repositories, so a person picking up the phase by hand works where the session did.
  - Replaces in part: AC-STOP-05 and AC-STOP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the workspace in place of the one worktree)
- [ ] **AC-SPACE-05 — The workspace is kept.** Kiln leaves the workspace and every worktree in it in place after the last phase, and says it is there until the person removes it.
  - Replaces in part: AC-GIT-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the workspace in place of the one worktree)

### Add a Repository After Start

When a session finds it needs a repository nobody named, Kiln adds it and the phase carries on. Nobody is called in.

- [ ] **AC-ADD-01 — A session can add a repository and carry on.** A session that needs a repository the workspace doesn't have asks Kiln for it by name, with a `kiln` command made for this (CLI-001). Kiln creates the feature branch in that repository from its base branch, chosen by AC-SPACE-01's rule (REPO-003), and adds its worktree to the workspace. It tells the session where the worktree is, and the session continues the same phase. The phase doesn't stop, and nothing waits for the person (REPO-002). The command works while `kiln run` is running for the PRD and a phase is in progress or stopped at Needs you, for that phase's session, a session the person reopens or starts by hand at Needs you, or the person; the repository counts as added in that phase. At any other time, before Start, while paused or once complete, it says why it can't and changes nothing.
  - Replaces in part: AC-RUN-03, AC-GIT-01 and AC-CLI-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln also sets up a repository after Start, and has a second command for asking it to)
- [ ] **AC-ADD-02 — Kiln adds only what it can find.** Kiln adds a repository only when it passes AC-REPO-02's checks and the feature branch name is free there (UI-003). When it doesn't, or setting it up fails, Kiln tells the session why, in the words of the failed check or git's message, and changes nothing. The session carries on or ends as it judges, and its phase is judged by the done check as usual.
- [ ] **AC-ADD-03 — An added repository is shown as added.** An added repository joins the PRD's repositories for every later phase and for the pull requests. It is listed with the others wherever they are shown, marked "added in phase <n>", with its base branch fixed. The terminal prints one line when it is added: `<time> <phase id> <title> added <repository>`.
  - Replaces in part: AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a terminal line when a repository is added)
- [ ] **AC-ADD-04 — A repository named after Start is added before its phase.** When a phase about to start names a repository the workspace doesn't have, because a session split its phase or a person edited the plan, Kiln adds it as AC-ADD-01 does before starting that phase's session. When it can't, the phase stops at Needs you as a broken plan does, naming the repository and the failed check; Check again and `kiln run` try the addition again.
  - Replaces in part: AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a named repository Kiln can't add is a broken-plan stop)

### Stop When a Session Works Outside the Workspace

A change made in a repository's own checkout bypasses the feature branch and its pull request, and may be mixed in with the person's other work there. When Kiln sees a session make one, it stops rather than let the next phase start.

- [ ] **AC-OUTSIDE-01 — A fourth check: the session stayed in the workspace.** The done check gains a fourth part, **Stayed in the workspace**. It fails when the session's transcript shows the session edited or wrote a file with its file tools, or ran `git commit` or `git push`, in a Git checkout outside the workspace. The Enso Method's session logs don't count: its skills write them in `.agent-sessions/` at the root of each repository's own checkout, by design. Kiln reads this from the transcript, never from the state of those checkouts, so the person's other chats working there never fail it. Changes another shell command makes aren't seen, and Kiln doesn't claim them. A phase that fails it is Needs you even when the other three checks pass. Needs you lists this check only when it failed; otherwise the checks shown are v1's three.
  - Replaces in part: AC-DONE-01, AC-DONE-02 and AC-STOP-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a fourth check, listed only when it failed)
- [ ] **AC-OUTSIDE-02 — Needs you says what was changed, and where.** The failed check names each checkout and what the session did there, for example "Edited src/tokens/colors.ts in ~/devel/acme/design-system" or "Committed 6b0d2fa to main in ~/devel/acme/design-system". Kiln changes nothing in those checkouts (Kiln v1, AC-GIT-02), since they may hold other work too. Needs you offers a copyable prompt for the reopened session. The prompt lists the same facts and asks the session to bring that work into the workspace, on the feature branch, adding the repository first if the workspace doesn't have it (AC-ADD-01). It also asks the session to leave that checkout as it is and tell the person what in it still needs putting back. The fresh-session prompt (AC-SPACE-04) carries the same facts.
  - Replaces in part: AC-STOP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the fresh-session prompt carries the facts)
- [ ] **AC-OUTSIDE-03 — The person clears it once they have dealt with it.** Only when **Stayed in the workspace** has failed, Needs you offers, below that check, a confirmation that the changes outside the workspace have been dealt with. No other screen or stop shows it. Once it is ticked, Check again and `kiln run` count the check as passed for that session, and the other three checks decide as usual (OUT-001). Kiln keeps the confirmation in its record, so it outlasts a restart.
  - Replaces in part: AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Check again passes the fourth check only after the confirmation)
- [ ] **AC-OUTSIDE-04 — It works with usage-limit recovery.** When [Kiln usage-limit recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md) is built too:
  - a session that hit a usage limit and also failed Stayed in the workspace goes to Needs you instead of waiting, since only the person can deal with their checkout;
  - Resume on that Needs you resumes the session with AC-OUTSIDE-02's prompt, after any note the person wrote and ahead of the instruction to carry on with the phase. Resume's own check honors the confirmation as Check again does (AC-OUTSIDE-03); until it is ticked, the check stays failed.

  This change's Needs you mockup draws the screen without that change's Resume.
  - Replaces in part: AC-AUTO-01 and AC-RESUME-02 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (no wait, and the resumed session gets the prompt, after work outside the workspace)

### Check Every Repository Before Calling a Phase Done

A phase can land in several repositories, so the done check looks in each of them.

- [ ] **AC-CHECK-01 — Committed and pushed in every repository.** **Committed** means no worktree in the workspace has uncommitted changes. **Pushed** means, in each of the PRD's repositories, the feature branch and its copy on `origin` point at the same commit. A repository whose feature branch has no commits of its own yet passes without being on `origin`. **Closed** is unchanged: the phase document, in the PRD's repository, has its Closed line.
  - Replaces in part: AC-DONE-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Committed and Pushed cover every repository)
- [ ] **AC-CHECK-02 — Each failed fact names its repository.** Needs you shows each failed fact with the repository it is in, for example "returns-api: a41c9e2 isn't on origin yet" or "storefront: 3 files changed, not committed".
  - Replaces in part: AC-STOP-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (facts name their repository)

### Finish With One Pull Request per Repository

The PRD still ends at "PR ready for review", now with a pull request in each repository that changed. Together they read as one delivery.

- [ ] **AC-PRS-01 — One pull request in each repository that changed.** The pull-request session opens one pull request in each of the PRD's repositories whose feature branch has commits of its own, from the feature branch into that repository's base branch. That includes the PRD's repository, whose phase documents hold the Closed lines (PR-001). A repository with no commits of its own gets no pull request. Its check, in place of AC-PR-02's, is that every one of those pull requests is open.
  - Replaces in part: AC-PR-01 and AC-PR-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (one pull request per repository that changed)
- [ ] **AC-PRS-02 — The pull requests point at each other and say the merge order.** Each pull request's description names the PRD and links every other pull request opened for it. Where one must merge before another, for example an endpoint before the page that calls it, each description says so. Kiln doesn't check the order; it is the pull-request session's reading of the technical design. Kiln still merges nothing (Kiln v1, AC-PR-03).
- [ ] **AC-PRS-03 — Complete shows every pull request.** The Complete screen shows each pull request with its repository, number, title, branches, link, commit count and lines added and removed. In the phase plan, a Done row shows how many repositories its phase pushed to ("pushed to 2 repositories") in place of its pushed commit, and its Details show its worktree, branch and commits by repository. The pull-request session's row reads "Opened 4 pull requests", and its terminal line names each one: `opened product #12 · returns-api #57 · storefront #218 · notifications #9`. A phase's done line names each repository it pushed, the PRD's repository included: `done · pushed returns-api a1c4e09 · product 3e8b2f1`.
  - Replaces in part: AC-PR-04, AC-PR-05, AC-START-09, AC-WATCH-01 and AC-WATCH-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (every pull request, and commits by repository)
- [ ] **AC-PRS-04 — The person sees what Kiln is allowed to do in each repository.** Next to Start, and in the settings while Kiln works, Kiln states what it may do in each of the PRD's repositories, those added later included: commit and push to the feature branch, and open one pull request into that repository's base branch once every phase closes. Where Kiln stops reads "one pull request in each repository that changed". Merging, deploying and touching other branches stay forbidden. The settings while Kiln works list the workspace and each repository's base branch, marked as fixed for the PRD.
  - Replaces in part: AC-START-06, AC-START-08, AC-WATCH-07 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (per repository, and where Kiln stops)

### Look Like This Change's Mockups

Four screens are drawn for this change. The others it touches follow the nearest drawing, so every screen has one governing picture.

- [ ] **AC-SHOW-01 — The changed screens match their drawings.** Documents found, Needs you after work outside the workspace, Complete and the terminal match this change's mockups for layout, copy, colors and type, as v1's screens match theirs. The screens this change alters but doesn't draw follow the nearest drawing:

  | Screen | Follows |
  |---|---|
  | Running, Paused, Disconnected and Phase detail: phase rows and Details | Complete's phase rows and Details |
  | Running, Paused and Disconnected: the settings | Documents found's workspace and repository list, with every field fixed |
  | v1's two Needs you screens: failed facts | This change's Needs you, facts named by repository |
  | A one-repository PRD's Documents found: the added line | The same line on this change's Documents found |

  Everything else on those screens stays as v1's mockups draw it.
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the screens this change alters, as the table says)

### Proven on Real Features

- [ ] **AC-PROOF-01 — Real features across repositories run end to end.** A real PRD runs from `kiln run` to "PR ready for review" with its PRD in a repository that holds no code and its phases changing at least two code repositories. In that run, one phase changes two code repositories, and one session adds a repository its phase didn't name. Every repository that changed ends with its own open pull request. Separately, a one-repository PRD's session adds a repository, and a session that edits a repository's own checkout stops at Needs you and is cleared as AC-OUTSIDE-03 says. The multi-repository run is repeated on Windows.

## Out of Scope

- **Running phases in parallel**, and per-phase branches and workspaces (BRANCH-002). Phases still run one at a time; the Business Context says what this change keeps for parallel phases and what they will change.
- **Cloning.** Kiln works only with repositories already checked out beside the PRD's repository; it never clones one.
- **Repositories not on GitHub**, as in v1.
- **Merging in order, or checking the order.** The pull requests say the order; the person merges.
- **Changing the Enso Method.** Having `phase-split` write each phase document's `**Repositories:**` line (AC-REPO-01) is a separate change to the Enso Method. Kiln works without it: until then a person can add the line by hand, or sessions add repositories as they find them (AC-ADD-01).

## Depends On

- **Claude Code reading each repository's own instructions.** A session working across the workspace should follow each repository's own `CLAUDE.md` and settings when it works in that repository. The technical design checks how Claude Code loads them for each repository's folder in the workspace, whether or not the session started in it, and what that changes.
- **Claude Code's own limits on where a session can write.** Claude Code may already refuse a session's file edits outside its starting folder and the folders it is given. The technical design checks this. Kiln must still let every session write in every worktree of the workspace, one added mid-phase included, even where the session started in a single repository's worktree (AC-SPACE-02, AC-SPACE-03). Refusing writes everywhere else would make AC-OUTSIDE-01 a backstop rather than the only guard; either way it stays.
- **What a transcript records.** AC-OUTSIDE-01 relies on a session's transcript recording its file edits and shell commands, and on `claude --resume` adding to the same transcript. The technical design checks both against the Claude Code version Kiln supports.
