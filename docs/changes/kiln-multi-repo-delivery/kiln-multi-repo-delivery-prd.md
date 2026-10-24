# PRD: Kiln multi-repo delivery

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md), and in part [Kiln usage-limit recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md). Decisions awaiting validation are in [assumptions](assumptions.md); the screens that change are drawn in [mockups](mockups/).

## Summary

Kiln v1 can only deliver a PRD whose code lives in the same repository as the PRD. This change lets Kiln deliver a PRD whose work spans several repositories. A typical case is a product repository holding the PRDs, with the code in separate repositories beside it, one per service or app.

Each phase document can name the repositories its phase changes. At Start, Kiln makes the feature branch in every repository the PRD needs, with a worktree of each gathered in one folder for the PRD. Sessions work across those worktrees, the PRD's workspace, one phase at a time as in v1. A session that finds it needs a repository nobody named asks Kiln for it and carries on, without stopping. A session seen changing a Git checkout outside the workspace, such as a repository's own checkout, by editing its files or with a Git command such as a commit or a branch switch, stops at Needs you instead, because that work bypasses the feature branch or disturbs the person's other work there. When every phase is closed, Kiln opens one pull request in each repository that changed. The pull requests link to each other and say which to merge first.

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
- The **PRD's repositories** are the PRD's repository, every named repository and every added repository. The PRD's repository is always among them, since the sessions close their phases in its phase documents. A repository Kiln has set up stays among them, even when a later edit to the plan no longer names it.
- The **workspace** is the PRD's worktrees, one of each of the PRD's repositories, all on the feature branch. Only those worktrees are inside it.
- The **workspace folder** is the folder Kiln makes the PRD's worktrees in (AC-SPACE-01, AC-SPACE-03). Anything else in it, such as another PRD's worktree, is outside the workspace.
- A repository is **beside** the PRD's repository when its checkout is a folder in the same parent folder as the PRD repository's checkout: `~/devel/acme/storefront` is beside `~/devel/acme/product`.
- A repository's **own checkout** is the one the person and their other chats work in, as opposed to its worktree in the workspace.
- A session's **transcript** is Claude Code's own record of the session: every message and tool call, the tool calls of the subagents it starts included, wherever Claude Code keeps them, and the turns of a session the person reopens by hand with `claude --resume`.

## Acceptance Criteria

### Know Which Repositories a PRD Changes

Before anything starts, Kiln shows which repositories the PRD will change, as far as its phase documents say, and checks it can work in each one.

- [ ] **AC-REPO-01 — A phase can name the repositories it changes.** A phase document names the repositories its phase changes on a `**Repositories:**` line under its title, by folder name, separated by commas: `**Repositories:** returns-api, storefront` (REPO-004). The PRD's repository is named there only when the phase changes code in it. A phase document with no such line changes only the PRD's repository, as in v1. Kiln reads the line in every phase document. A split parent's names join the PRD's repositories like any other; they aren't passed down to its children.
- [ ] **AC-REPO-02 — Kiln finds each named repository beside the PRD's repository.** Kiln looks for each named repository beside the PRD's repository (REPO-001). The start checks fail, naming the repository and the folder Kiln looked in, when a named repository isn't there, isn't a Git checkout, or has no `origin` on GitHub. A named repository's own checkout doesn't have to be clean, since other work may be in progress there and Kiln starts its feature branch from the base branch on `origin`. The clean-checkout check stays on the PRD's repository, whose documents Kiln reads.
  - Replaces in part: AC-START-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the named repositories are checked too; the clean-checkout check still covers only the PRD's repository)
- [ ] **AC-REPO-03 — Documents found shows the repositories.** For a PRD with more than one repository, each phase in the plan on Documents found shows the repositories it names, and the delivery settings list every repository: its name, the PRD's repository marked as such, and the base branch the feature branch starts from. Documents found also says that sessions can add a repository they find they need (AC-ADD-01), and that they follow each repository's CLAUDE.md but not its `.claude/settings.json` or hooks (REPO-005). Its passed checks add "Named repositories found beside <PRD's repository>", and the clean-checkout check names the PRD's repository, the only one it covers. The terminal's first line counts the repositories ("3 repositories"). The repository label above the feature name stays the PRD's repository.
  - Replaces in part: AC-START-04 and AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Documents found and the terminal's first line show the repositories)

### Give the PRD One Workspace Across Its Repositories

Kiln sets up everything the sessions need before the first phase starts, so every session can work in every repository of the PRD without touching the person's own checkouts.

- [ ] **AC-SPACE-01 — One workspace, one feature branch in each repository.** At Start, Kiln creates the feature branch in each of the PRD's repositories from that repository's base branch, and a worktree of each in the workspace folder, in a folder named for the repository. Unless the person changes them before Start:
  - the workspace folder is `.worktrees/<PRD folder name>/` in the folder that holds the PRD's repository, outside every repository's own checkout;
  - the feature branch is the same name in every repository (BRANCH-001);
  - each repository's base branch is chosen by v1's rule: `develop`, or that repository's default branch when it has no `develop`.

  Before Start, the person can change the workspace folder, the feature branch name and each repository's base branch, and Kiln checks the feature branch name is free in every repository (UI-003 in `docs/prds/kiln-v1/assumptions.md`). When Start fails partway, each repository already set up keeps its worktree, branch and base, and the workspace folder and feature branch name can't change any more. The person can still change the base of a repository not yet set up, unless Kiln already made the feature branch there: the branch name is fixed and Kiln never deletes a branch (Kiln v1, AC-GIT-02), so that branch can't be made again from another base. The next Start checks and makes only what is still missing.
  - Replaces in part: AC-START-06, AC-START-07, AC-GIT-01 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch, and what a failed Start fixes)
- [ ] **AC-SPACE-02 — Each session can work in every repository of the PRD.** Each phase's session can read, change, commit and push in every one of the workspace's worktrees, those added during the phase included. It is told the PRD's repositories, where each worktree is, and that it commits and pushes to the feature branch in each repository it changes. It is also told to stay inside the workspace, and to ask Kiln for a repository it needs that the workspace doesn't have (AC-ADD-01) rather than change that repository's own checkout. A multi-repository PRD's sessions start in the workspace folder, and wherever else v1 says "the PRD's worktree", it now means the workspace.
  - Replaces in part: AC-RUN-02, AC-RUN-03, AC-RUN-07, AC-MULTI-03 and AC-PROOF-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the session works across the workspace, and may ask Kiln for another repository)
- [ ] **AC-SPACE-03 — A one-repository PRD keeps v1's layout and screens.** While the PRD's only repository is its own, it is delivered as the table says, a PRD already underway when this change ships included. Once it has an added repository, it is a multi-repository PRD and its screens show the repositories.

  | What | For a one-repository PRD |
  |---|---|
  | Worktree path, feature branch, the folder its sessions start in, pull request | As in v1 |
  | Screens | As in v1, except one line on Documents found: sessions can add a repository they find they need, and what Kiln may do in one they add (AC-PRS-04) |
  | Adding a repository | As for any PRD (AC-ADD-01, AC-ADD-02). Its workspace folder is AC-SPACE-01's default, the folder v1's default worktree is in, even when the person put its worktree elsewhere |
  | Done check | Includes Stayed in the workspace (AC-OUTSIDE-01) |
  - Replaces in part: AC-START-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (one line added to a one-repository PRD's Documents found)
- [ ] **AC-SPACE-04 — A stopped session can be reopened where it worked.** At Needs you, the resume command changes to the folder the session started in, and the fresh-session prompt names the workspace and the PRD's repositories, so a person picking up the phase by hand works where the session did.
  - Replaces in part: AC-STOP-05 and AC-STOP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the workspace in place of the one worktree)
- [ ] **AC-SPACE-05 — The workspace is kept.** Kiln leaves the workspace folder and every one of the workspace's worktrees in place after the last phase, and says they are there until the person removes them.
  - Replaces in part: AC-GIT-04 and AC-PR-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the workspace in place of the one worktree, including Complete's note that Kiln keeps it)

### Add a Repository After Start

When a session finds it needs a repository nobody named, Kiln adds it and the phase carries on. Nobody is called in.

- [ ] **AC-ADD-01 — A session can add a repository and carry on.** A session that needs a repository the workspace doesn't have asks Kiln for it by name, with a `kiln` command made for this (CLI-001). Kiln creates the feature branch in that repository from its base branch, chosen by AC-SPACE-01's rule (REPO-003), and adds its worktree to the workspace (AC-SPACE-01). It tells the session where the worktree is, and the session continues the same phase. The phase doesn't stop, and nothing waits for the person (REPO-002). The command works while `kiln run` is running for the PRD and a phase, not the pull-request session, is in progress or stopped at Needs you, and the repository counts as added in that phase. Otherwise it says why it can't and changes nothing.
  - Replaces in part: AC-RUN-03, AC-GIT-01 and AC-CLI-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln also sets up a repository after Start, and has a second command for asking it to)
- [ ] **AC-ADD-02 — Kiln adds only what it can find.** Kiln adds a repository only when it passes AC-REPO-02's checks, the feature branch name is free there (UI-003 in `docs/prds/kiln-v1/assumptions.md`), and its worktree's folder passes the checks a worktree path gets at Start: new or empty, and not inside a checkout. When a check fails, Kiln tells the session why, in the words of the failed check, and changes nothing. When setup fails partway, Kiln tells the session git's message and keeps what it made, and the next try for that repository checks and makes only what is still missing, as the next Start does (AC-SPACE-01). The exception is a worktree git left half made: since adding worktrees is the only change Kiln makes in Git (Kiln v1, AC-GIT-01), Kiln changes nothing and tells the session the command that removes it. The session carries on or ends as it judges, and its phase is judged by the done check as usual.
- [ ] **AC-ADD-03 — An added repository is shown as added.** An added repository joins the PRD's repositories for every later phase and for the pull requests. It is listed with the others wherever they are shown, marked "added in phase <n>", with its base branch fixed. The terminal prints one line when it is added: `<time> <phase id> <title> added <repository>`.
  - Replaces in part: AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a terminal line when a repository is added)
- [ ] **AC-ADD-04 — A repository named after Start is added before its phase.** When a phase about to start, or a split parent above it, names a repository the workspace doesn't have, because a session split its phase or a person edited the plan, Kiln adds it as AC-ADD-01 does before starting that phase's session. When it can't, the phase stops at Needs you as a broken plan does, naming the repository and the failed check; Check again and `kiln run` try the addition again.
  - Replaces in part: AC-RUN-04 and AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a named repository Kiln can't add is a broken-plan stop, including one a session's own split names)

### Stop When a Session Works Outside the Workspace

A change made in a repository's own checkout bypasses the feature branch and its pull request, and may be mixed in with the person's other work there. When Kiln sees a session make one, it stops rather than let the next phase start.

- [ ] **AC-OUTSIDE-01 — A fourth check: the session stayed in the workspace.** The done check gains a fourth part, **Stayed in the workspace**. It judges what the session's transcript shows the session and its subagents doing in any Git checkout outside the workspace, whether a repository's own checkout or another PRD's worktree, as the table says (OUT-002). Kiln reads only the transcript, never the state of those checkouts, so the person's other chats working there never fail it. A session that never started passes it; a session that ran but whose transcript Kiln can't find or can't read fails it, since Kiln can't see what it did, and Needs you says where Kiln looked (OUT-003). When the transcript is missing, Needs you offers the fresh-session prompt in place of the resume command, and in place of Resume where Kiln usage-limit recovery is built, since both need that transcript, as Kiln v1, AC-KEEP-05 does, after an interruption too. A phase that fails it is Needs you even when the other three checks pass. Needs you lists this check only when it failed.
  - Superseded in part by: AC-RECOVER-02 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (explicit Codex repair resume remains available with inconclusive audit evidence when the conversation is available).
  - Superseded in part by: AC-WORK-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex requires complete conversation-tree evidence; unknown evidence cannot be confirmed away).

  | In a Git checkout outside the workspace | Stayed in the workspace |
  |---|---|
  | Editing or writing a file with Claude Code's file tools | Fails, except the Enso Method's session logs, which its skills write in `.agent-sessions/` at the root of each repository's own checkout by design |
  | A Git command that changes the checkout's files, its staged changes or the branch it is on; creates, moves or deletes a local branch; or pushes from it: `commit`, `push`, `add`, `checkout`, `switch`, `stash`, `reset`, `merge`, `rebase`, `pull` and any other such | Fails |
  | A Git command that does none of those, such as `status`, `log`, `diff` or `fetch` | Passes |
  | Any other shell command | Passes: Kiln doesn't see what it changes, and doesn't claim to |
  - Replaces in part: AC-DONE-01, AC-DONE-02 and AC-STOP-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a fourth check, listed only when it failed)
  - Replaces in part: AC-STOP-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (no resume command for a session whose transcript Kiln can't find)
  - Replaces in part: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (no Resume for a session whose transcript Kiln can't find)
- [ ] **AC-OUTSIDE-02 — Needs you says what was changed, and where.** The failed check names each change no confirmation covers (AC-OUTSIDE-03): the checkout and what the session did there, for example "Edited src/tokens/colors.ts in ~/devel/acme/design-system", "Committed 6b0d2fa to main in ~/devel/acme/design-system" or "Ran git stash in ~/devel/acme/design-system". Kiln changes nothing in those checkouts (Kiln v1, AC-GIT-02), since they may hold other work too. Needs you offers a copyable prompt for the reopened session that:

  1. Lists the same facts.
  2. For a phase's session, asks the session to bring into the workspace, on the feature branch, only the edits it made itself, committed or not, and none of the person's own changes, even ones its commits picked up, adding the repository first if the workspace lacks it (AC-ADD-01).
  3. Asks it to leave each checkout as it is and tell the person what in it still needs putting back, such as a stash or a branch switch.

  The fresh-session prompt (AC-SPACE-04) carries the same facts.
  - Replaces in part: AC-STOP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the fresh-session prompt carries the facts)
- [ ] **AC-OUTSIDE-03 — The person clears it once they have dealt with it.** Only when **Stayed in the workspace** has failed, Needs you offers, below that check, a confirmation that the changes outside the workspace have been dealt with. No other screen or stop shows it. The confirmation covers every change outside the workspace the transcript records up to when it was ticked: Check again and `kiln run` count those as dealt with, and the rest of the check decides as usual (OUT-001). A change recorded after the tick, such as one the session makes once resumed, fails the check again, and Needs you offers a new confirmation for it. The confirmation also clears a session whose transcript Kiln couldn't find or read, once the person has checked their checkouts (OUT-003). Kiln keeps each confirmation in its record, so it outlasts a restart.
  - Superseded in part by: AC-WORK-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (Codex confirmations cover identified changes only at the exact checked evidence frontier).
  - Replaces in part: AC-STOP-07 and AC-VIEW-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Check again passes the fourth check only for changes a confirmation covers, and the confirmation joins the browser view's controls)
- [ ] **AC-OUTSIDE-04 — Kiln never resumes on its own a session that worked outside the workspace.** A phase that fails Stayed in the workspace goes to Needs you wherever Kiln would otherwise resume its session on its own, since only the person can deal with their checkout: after an interruption (Kiln v1, AC-KEEP-04), and, when [Kiln usage-limit recovery](../kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md) is built too, after a usage limit, in place of waiting. After an interruption, Needs you shows when the session was interrupted and its last lines of output, as Kiln v1, AC-KEEP-05 does, but with the resume command, and that change's Resume is offered as for a session that ended on its own. That Resume honors the confirmation as Check again does (AC-OUTSIDE-03), and while the confirmation is unticked, the resumed session gets AC-OUTSIDE-02's prompt, after any note the person wrote and ahead of the instruction to carry on with the phase.
  - Replaces in part: AC-STOP-01, AC-STOP-02 and AC-KEEP-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (an interrupted session that worked outside the workspace goes to Needs you instead of being resumed, shown as interrupted with the resume command)
  - Replaces in part: AC-AUTO-01, AC-RESUME-01, AC-RESUME-02 and AC-RESUME-03 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (no wait after work outside the workspace, Resume offered after an interruption, and the resumed session gets the prompt, after any note, while the confirmation is unticked)

### Check Every Repository Before Calling a Phase Done

A phase can land in several repositories, so the done check looks in each of them.

- [ ] **AC-CHECK-01 — Committed and pushed in every repository.** **Committed** means none of the workspace's worktrees has uncommitted changes. **Pushed** means, in each of the PRD's repositories, the feature branch and its copy on `origin` point at the same commit. A repository whose feature branch has no commits of its own yet passes without being on `origin`. **Closed** is unchanged: the phase document, in the PRD's repository, has its Closed line.
  - Replaces in part: AC-DONE-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Committed and Pushed cover every repository)
- [ ] **AC-CHECK-02 — Each failed fact names its repository.** Needs you shows each failed fact with the repository it is in, for example "returns-api: a41c9e2 isn't on origin yet" or "storefront: 3 files changed, not committed".
  - Replaces in part: AC-STOP-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (facts name their repository)

### Finish With One Pull Request per Repository

The PRD ends with each changed repository ready for review or already merged into its intended base. Together they read as one delivery.

- **AC-PRS-01 — retired, split into AC-PRS-05 and AC-PRS-06.**
- [ ] **AC-PRS-05 — One pull request in each repository that changed.** The pull-request session opens one pull request in each of the PRD's repositories whose feature branch has commits of its own, from the feature branch into that repository's base branch. That includes the PRD's repository, whose phase documents hold the Closed lines (PR-001). A repository with no commits of its own gets no pull request. Its check, in place of AC-PR-02's, passes when each changed repository either has an open, ready, same-repository pull request or its current feature commit is proven already contained in its intended live base branch. A separate merge or fast-forward counts, even without a pull request. Recognition does not merge anything or require merge permission. An empty diff, an old merged pull request, or matching files alone cannot prove completion; missing evidence, uncommitted work, a different checked-out branch, or newer unmerged feature commits keep it incomplete. Every repository must qualify, and AC-PRS-06 still applies. Startup, Check again and Resume use this same check and start no further session when it passes.
  - Replaces in part: AC-WORK-01 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (verified prior integration completes without another PR session).
  - Replaces in part: AC-PR-01, AC-PR-02 and AC-PR-05 in `docs/prds/kiln-v1/kiln-v1-prd.md` (one pull request per repository that changed)
  - Replaces in part: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Resume is offered to a pull-request session whose check failed, not only to one with no pull request open)
- [ ] **AC-PRS-06 — The pull-request session's check includes Stayed in the workspace.** The pull-request session's check (AC-PRS-05) also requires that the session stayed in the workspace (AC-OUTSIDE-01).
  - Replaces in part: AC-PR-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (its check includes Stayed in the workspace)
- [ ] **AC-PRS-02 — The pull requests point at each other and say the merge order.** Each pull request's description names the PRD and links every other pull request opened for it. Where one must merge before another, for example an endpoint before the page that calls it, each description says so. Kiln doesn't check the order; it is the pull-request session's reading of the technical design. Kiln still merges nothing (Kiln v1, AC-PR-03).
- [ ] **AC-PRS-03 — Complete shows every pull request.** The Complete screen shows each remaining review pull request with its repository, number, title, branches, link, commit count and lines added and removed. It separately names repositories already merged, their intended base and the verified feature commit, without inventing pull-request facts. The header and final plan row say “Already merged” when all repositories are already merged, or distinguish ready pull requests and merged repositories in a mixed result. The terminal makes the same distinction, and the result survives restart.

  Complete also shows the merged pull requests and Git merge events that can be proven to have introduced recorded PRD work, grouped by repository, with links and target branches. The final commit remains secondary verification evidence.

  Attribution uses saved phase commit ranges and exact introduction evidence; a later PR merely containing the work as ancestry does not qualify. Synchronization merges are excluded from the work set, broader releases are labeled as containing other commits, and duplicates are combined. Missing, rewritten, limited or unreadable evidence is shown as a history gap, never guessed from titles, dates or similar files.

  Normal read-only enrichment updates existing completed runs too, preserving completion status, timestamps and recorded review-PR facts.

  In the phase plan, a Done row shows how many repositories its phase pushed to ("pushed to 2 repositories") in place of its pushed commit, and its Details show its worktree, branch and commits by repository. The pull-request session's row reads "Opened 4 pull requests", and its terminal line names each one: `opened product #12 · returns-api #57 · storefront #218 · notifications #9`. A phase's done line names each repository it pushed, the PRD's repository included: `done · pushed returns-api a1c4e09 · product 3e8b2f1`.
  - Replaces in part: AC-PR-03 and AC-WATCH-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (already-merged and mixed completion wording only; no authority change).
  - Replaces in part: AC-PR-04, AC-PR-05, AC-START-09, AC-WATCH-01 and AC-WATCH-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (every pull request, and commits by repository)
- [ ] **AC-PRS-04 — The person sees what Kiln is allowed to do in each repository.** Next to Start, and in the settings while Kiln works, Kiln states what it may do in each of the PRD's repositories, those added later included: commit and push to the feature branch, and open one pull request into that repository's base branch once every phase closes. Where Kiln stops is a ready pull request or verified prior integration into the intended base in each repository that changed. Merging, deploying and touching other branches stay forbidden. The settings while Kiln works list the workspace folder and each repository's base branch, marked as fixed for the PRD.
  - Replaces in part: AC-START-06, AC-START-08, AC-WATCH-07 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (per repository, and where Kiln stops)

### Look Like This Change's Mockups

Four screens are drawn for this change. The others it touches follow the nearest drawing, so every screen has one governing picture.

- [ ] **AC-SHOW-01 — The changed screens match their drawings.** Documents found, Needs you after work outside the workspace, Complete and the terminal match this change's mockups for layout, copy, colors and type, as v1's screens match theirs. The screens this change alters but doesn't draw follow the nearest drawing:
  - Superseded in part by: AC-VIEW-04 in `docs/prds/kiln-codex-support/kiln-codex-support-prd.md` (agent-specific information on existing screens).
  - Superseded in part by: AC-AUTO-04, AC-LIMIT-01 and AC-LIMIT-05 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Documents found and the settings while Kiln works gain the "Resume after a usage limit" row; Needs you after work outside the workspace, when its session hit a usage limit, gains the limit facts, choices and account; the terminal gains the wait and resume lines)

  | Screen | Follows |
  |---|---|
  | Running, Paused, Disconnected and Phase detail: phase rows and Details | Complete's phase rows and Details |
  | Running, Paused and Disconnected: the settings | Documents found's workspace folder and repository list, without their help text, with every field fixed |
  | v1's two Needs you screens: failed facts | This change's Needs you, facts named by repository |
  | Kiln usage-limit recovery's Needs you with Resume and Needs you after a usage limit, where that change is built: failed facts | This change's Needs you, facts named by repository |
  | A one-repository PRD's Documents found: the added line | The same line on this change's Documents found |

  Everything else on those screens stays as their governing mockups draw it: v1's, and Kiln usage-limit recovery's where that change is built.
  - Replaces in part: AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the screens this change alters, as the table says)
  - Replaces in part: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (its Needs you screens' failed facts, named by repository, as the table says)
  - Superseded in part by: AC-RESUME-01 in `docs/changes/kiln-usage-limit-recovery/kiln-usage-limit-recovery-prd.md` (Needs you after work outside the workspace gains Resume and its note, where that change's mockups put them)

### Proven on Real Features

- [ ] **AC-PROOF-01 — Real features across repositories run end to end.** A real PRD runs from `kiln run` to "PR ready for review" with its PRD in a repository that holds no code and its phases changing at least two code repositories. In that run, one phase changes two code repositories, and one session adds a repository its phase didn't name. Every repository that changed ends with its own open pull request. Separately, a one-repository PRD's session adds a repository, and a session that edits a repository's own checkout stops at Needs you and is cleared as AC-OUTSIDE-03 says. The runs are on macOS.

## Out of Scope

- **Running phases in parallel**, and per-phase branches and workspaces (BRANCH-002). Phases still run one at a time; the Business Context says what this change keeps for parallel phases and what they will change.
- **Cloning.** Kiln works only with repositories already checked out beside the PRD's repository; it never clones one.
- **Repositories not on GitHub**, as in v1.
- **A run on Windows.** Kiln's Windows behavior is built to the technical design on a best-effort basis and covered only by the automated tests, which CI also runs on Windows. Nobody runs Kiln on Windows for this change; that waits until someone with a Windows machine can.
- **Merging in order, or checking the order.** The pull requests say the order; the person merges.
- **Changing the Enso Method.** Having `phase-split` write each phase document's `**Repositories:**` line (AC-REPO-01) is a separate change to the Enso Method. Kiln works without it: until then a person can add the line by hand, or sessions add repositories as they find them (AC-ADD-01).

## Depends On

- **Claude Code reading each repository's own instructions.** A session working across the workspace should follow each repository's own `CLAUDE.md` and settings when it works in that repository. The technical design checks how Claude Code loads them for each repository's folder in the workspace, whether or not the session started in it, and what that changes.
- **Claude Code's own limits on where a session can write.** Claude Code may already refuse a session's file edits outside its starting folder and the folders it is given. The technical design checks this. Kiln must still let every session write in every worktree of the workspace, one added mid-phase included, even where the session started in a single repository's worktree (AC-SPACE-02, AC-SPACE-03). Refusing writes everywhere else would make AC-OUTSIDE-01 a backstop rather than the only guard; either way it stays.
- **What a transcript records.** AC-OUTSIDE-01 relies on a session's transcript recording its file edits and shell commands, its subagents' included, and on `claude --resume` adding to the same transcript. Claude Code keeps a subagent's record apart from the session's own, so the technical design checks where it records each, including after `claude --resume`, against the Claude Code version Kiln supports.
