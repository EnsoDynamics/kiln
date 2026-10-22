# PRD: Kiln multi-repo delivery

**Changes:** [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md). Decisions awaiting validation are in [assumptions](assumptions.md); the screens that change are drawn in [mockups](mockups/).

## Summary

Kiln v1 can only deliver a PRD whose code lives in the same repository as the PRD. This change lets Kiln deliver a PRD whose work spans several repositories. A typical case is a product repository holding the PRDs, with the code in separate repositories beside it, one per service or app.

Each phase document can name the repositories its phase changes. At Start, Kiln makes the feature branch in every repository the PRD needs, with a worktree of each gathered in one folder for the PRD. Sessions work across that folder, one phase at a time as in v1. A session that finds it needs a repository nobody named asks Kiln for it and carries on, without stopping. A session that changes a repository outside that folder stops at Needs you instead, because that work bypasses the feature branch. When every phase is closed, Kiln opens one pull request in each repository that changed. The pull requests link to each other and say which to merge first.

A PRD whose phases name no other repository works exactly as it does in v1.

## Business Context

Keeping requirements in one repository and code in many is common: microservices, a mobile app beside its API, a website beside its backend. In v1, Kiln can't deliver any PRD set up that way. It makes one worktree of the PRD's repository, and its done check looks only there. A session that changed a code repository would be editing that repository's shared checkout, on whatever branch it happens to be on, outside any worktree, and the phase would fail the done check with nothing pushed where Kiln looks.

Phase planning can't always know every repository a phase will touch. A phase can turn out to need a change in a service nobody expected until the code was read. Stopping for that would leave the person to set up a branch and worktree by hand, which is exactly the babysitting Kiln exists to remove. So a session can ask Kiln for another repository and keep going (REPO-002).

Running phases in parallel is a likely later version of Kiln ([Kiln ideas after v1](../../design/kiln-after-v1-ideas.md), "Run independent phases in parallel"). The layout this change sets up is the one that version builds on. Each repository's feature branch is where finished phases collect, and it is what that repository's pull request is opened from. A later version can give a phase its own branch that joins the feature branch when the phase is done, and nothing here has to change for it. This change doesn't add per-phase branches itself (BRANCH-002).

### Terms used in this PRD

- **Needs you**, the **done check**, the **pull-request session**, **leaf** and **closed** mean what they mean in [Kiln v1](../../prds/kiln-v1/kiln-v1-prd.md#terms-used-in-this-prd).
- The **PRD's repository** is the repository holding the PRD's directory, the one `kiln run` is pointed into.
- A **named repository** is one a phase document names as a repository its phase changes. An **added repository** is one Kiln added during a phase, at its session's request (AC-ADD-01).
- The **PRD's repositories** are the PRD's repository, every named repository and every added repository. The PRD's repository is always among them, since the sessions close their phases in its phase documents.
- The **workspace** is the one folder Kiln makes for a PRD, holding a worktree of each of the PRD's repositories, all on the feature branch.
- A repository is **beside** the PRD's repository when its checkout is a folder in the same parent folder as the PRD repository's checkout: `~/devel/acme/storefront` is beside `~/devel/acme/product`.
- A repository's **own checkout** is the one the person and their other chats work in, as opposed to its worktree in the workspace.

## Acceptance Criteria

### Know Which Repositories a PRD Changes

Before anything starts, Kiln shows which repositories the PRD will change, as far as its phase documents say, and checks it can work in each one.

- [ ] **AC-REPO-01 — A phase can name the repositories it changes.** A phase document can name, by their folder names, the repositories its phase changes, the PRD's repository included when it changes code there. A phase document that names none changes only the PRD's repository, as in v1. Kiln reads the names from every phase document. A split parent's names join the PRD's repositories like any other; they aren't passed down to its children.
- [ ] **AC-REPO-02 — Kiln finds each named repository beside the PRD's repository.** Kiln looks for each named repository beside the PRD's repository (REPO-001). The start checks fail, naming the repository and the folder Kiln looked in, when a named repository isn't there, isn't a Git checkout, or has no `origin` on GitHub. A named repository's own checkout doesn't have to be clean, since other work may be in progress there and Kiln starts its feature branch from the base branch on `origin`. The clean-checkout check stays on the PRD's repository, whose documents Kiln reads.
  - Replaces in part: AC-START-02 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the named repositories are checked too; the clean-checkout check still covers only the PRD's repository)
- [ ] **AC-REPO-03 — Documents found shows the repositories.** For a PRD with more than one repository, each phase in the plan on Documents found shows the repositories it names, and the delivery settings list every repository: its name, the PRD's repository marked as such, and the base branch the feature branch starts from. Documents found also says that sessions can add a repository they find they need (AC-ADD-01). Its passed checks add "Named repositories found beside <PRD's repository>", and the clean-checkout check names the PRD's repository, the only one it covers. The terminal's first line counts the repositories ("3 repositories"). The repository label above the feature name stays the PRD's repository.
  - Replaces in part: AC-START-04, AC-START-09 and AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Documents found and the terminal's first line show the repositories, as this change's Documents found and terminal mockups draw)

### Give the PRD One Workspace Across Its Repositories

Kiln sets up everything the sessions need before the first phase starts, so every session can work in every repository of the PRD without touching the person's own checkouts.

- [ ] **AC-SPACE-01 — One workspace, one feature branch in each repository.** At Start, Kiln creates the feature branch in each of the PRD's repositories from that repository's base branch, and a worktree of each, all inside the workspace. Unless the person changes them before Start, the workspace is `.worktrees/<PRD folder name>/` in the folder that holds the PRD's repository; each repository's worktree is the folder of the same name inside it. The feature branch is the same name in every repository (BRANCH-001), and each repository's base branch is chosen by v1's rule: `develop`, or that repository's default branch when it has no `develop`. The workspace is outside every one of the repositories' own checkouts. Before Start, the person can change the workspace, the feature branch name and each repository's base branch. Kiln checks the feature branch name is free in every repository (UI-003 in `docs/prds/kiln-v1/assumptions.md`). When Start fails partway, the repositories already set up stay as they are (Kiln v1, AC-GIT-02), and the next Start reuses them, as v1 reuses a branch Kiln itself created.
  - Replaces in part: AC-START-06, AC-START-07 and AC-GIT-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a worktree and the feature branch in every one of the PRD's repositories, in one workspace, each with its own base branch)
- [ ] **AC-SPACE-02 — Each session can work in every repository of the PRD.** Each phase's session can read, change, commit and push in every worktree in the workspace, those added during the phase included. It is told the PRD's repositories, where each worktree is, and that it commits and pushes to the feature branch in each repository it changes. It is also told to stay inside the workspace, and to ask Kiln for a repository it needs that the workspace doesn't have (AC-ADD-01) rather than change that repository's own checkout.
  - Replaces in part: AC-RUN-02 and AC-RUN-03 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the session works across the workspace, and may ask Kiln for another repository)
- [ ] **AC-SPACE-03 — A one-repository PRD works as in v1.** When the PRD's only repository is its own, the worktree, branch, sessions, done check, pull request and every screen and terminal line are exactly as in v1, with one addition: Documents found says that sessions can add a repository they find they need, and what Kiln may do in one (AC-PRS-04). A PRD already underway when this change ships carries on as it was. A one-repository PRD that gains an added repository becomes a multi-repository PRD from then on, and its screens show the repositories.
- [ ] **AC-SPACE-04 — A stopped session can be reopened where it worked.** At Needs you, the resume command changes to the folder the session started in, and the fresh-session prompt names the workspace and the PRD's repositories, so a person picking up the phase by hand works where the session did.
  - Replaces in part: AC-STOP-05 and AC-STOP-06 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the workspace in place of the one worktree)
- [ ] **AC-SPACE-05 — The workspace is kept.** Kiln leaves the workspace and every worktree in it in place after the last phase, and says it is there until the person removes it.
  - Replaces in part: AC-GIT-04 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the workspace in place of the one worktree)

### Add a Repository Partway Through a Phase

When a session finds it needs a repository nobody named, Kiln adds it and the phase carries on. Nobody is called in.

- [ ] **AC-ADD-01 — A session can add a repository and carry on.** A session that needs a repository the workspace doesn't have asks Kiln for it by name. Kiln creates the feature branch in that repository from its base branch, chosen by AC-SPACE-01's rule (REPO-003), and adds its worktree to the workspace. It tells the session where the worktree is, and the session continues the same phase. The phase doesn't stop, and nothing waits for the person (REPO-002). A session the person reopens or starts by hand at Needs you can ask the same way, while `kiln run` is running for the PRD.
  - Replaces in part: AC-RUN-03 and AC-GIT-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Kiln also sets up a repository a session asks for, partway through a phase)
- [ ] **AC-ADD-02 — Kiln adds only what it can find.** Kiln adds a repository only when it passes AC-REPO-02's checks. When it doesn't, or setting it up fails, Kiln tells the session why, in the words of the failed check or git's message, and changes nothing. The session carries on or ends as it judges, and its phase is judged by the done check as usual.
- [ ] **AC-ADD-03 — An added repository is shown as added.** An added repository joins the PRD's repositories for every later phase and for the pull requests. It is listed with the others wherever they are shown, marked "added in phase <n>", with its base branch fixed. The terminal prints one line when it is added: `<time> <phase id> <title> added <repository>`.
  - Replaces in part: AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a terminal line when a repository is added)

### Stop When a Session Works Outside the Workspace

A change made in a repository's own checkout bypasses the feature branch and its pull request, and may be mixed in with the person's other work there. Kiln stops for it rather than let the next phase start.

- [ ] **AC-OUTSIDE-01 — A fourth check: the session stayed in the workspace.** The done check gains a fourth part, **Stayed in the workspace**: the session changed no file, made no commit and pushed nothing in any Git checkout outside the workspace. Kiln decides it from what the session did, as its own record of the session shows, never from the state of those checkouts, so the person's other chats working there never fail it. A phase that fails it is Needs you even when the other three checks pass.
  - Replaces in part: AC-DONE-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (a fourth check)
- [ ] **AC-OUTSIDE-02 — Needs you says what was changed, and where.** The failed check names each checkout and what the session did there, for example "Edited src/tokens/colors.ts in ~/devel/acme/design-system" or "Committed 4f2a9c1 to main in ~/devel/acme/design-system". Kiln changes nothing in those checkouts (Kiln v1, AC-GIT-02), since they may hold other work too. Needs you offers a copyable prompt for the reopened session. The prompt lists the same facts and asks the session to bring that work into the workspace, on the feature branch, adding the repository first if the workspace doesn't have it (AC-ADD-01). It also asks the session to leave that checkout as it is and tell the person what in it still needs putting back. The fresh-session prompt (AC-SPACE-04) carries the same facts.
- [ ] **AC-OUTSIDE-03 — The person clears it once they have dealt with it.** Below that check, Needs you offers a confirmation that the changes outside the workspace have been dealt with. Once it is ticked, Check again and `kiln run` count the check as passed for that session, and the other three checks decide as usual (OUT-001). Kiln keeps the confirmation in its record, so it outlasts a restart.
  - Replaces in part: AC-STOP-07 in `docs/prds/kiln-v1/kiln-v1-prd.md` (Check again passes the fourth check only after the confirmation)

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
  - Replaces in part: AC-PR-04, AC-PR-05, AC-START-09, AC-WATCH-01, AC-WATCH-06 and AC-LOOK-01 in `docs/prds/kiln-v1/kiln-v1-prd.md` (every pull request, and commits by repository, as this change's Complete and terminal mockups draw)
- [ ] **AC-PRS-04 — The person sees what Kiln is allowed to do in each repository.** Next to Start, and in the settings while Kiln works, Kiln states what it may do in each of the PRD's repositories, those sessions add included: commit and push to the feature branch, and open one pull request into that repository's base branch once every phase closes. Where Kiln stops reads "one pull request in each repository that changed". Merging, deploying and touching other branches stay forbidden. The settings while Kiln works list the workspace and each repository's base branch, marked as fixed for the PRD.
  - Replaces in part: AC-START-06, AC-START-08, AC-WATCH-07 and AC-VIEW-08 in `docs/prds/kiln-v1/kiln-v1-prd.md` (per repository, and where Kiln stops)

### Proven on a Real Multi-Repository Feature

- [ ] **AC-PROOF-01 — A real feature across repositories runs end to end.** A real PRD runs from `kiln run` to "PR ready for review" with its PRD in a repository that holds no code and its phases changing at least two code repositories. In that run, one phase changes two code repositories, and one session adds a repository its phase didn't name. Every repository that changed ends with its own open pull request, and no repository's own checkout was changed by a session.

## Out of Scope

- **Running phases in parallel**, and per-phase branches (BRANCH-002). Phases still run one at a time; see the Business Context for how this layout leaves room for parallel phases.
- **Cloning.** Kiln works only with repositories already checked out beside the PRD's repository; it never clones one.
- **Repositories not on GitHub**, as in v1.
- **Merging in order, or checking the order.** The pull requests say the order; the person merges.
- **Changing the Enso Method.** Having `phase-split` write the repositories into each phase document is a separate change to the Enso Method. Kiln works without it: until then a person can add the names by hand, or sessions add repositories as they find them (AC-ADD-01).

## Depends On

- **Claude Code reading each repository's own instructions.** A session working across the workspace should follow each repository's own `CLAUDE.md` and settings when it works in that repository. The technical design checks how Claude Code loads them when a session starts in a folder above the repositories, and what that changes.
- **Claude Code's own limits on where a session can write.** Claude Code may already refuse a session's file edits outside its starting folder and the folders it is given. The technical design checks this. If Claude Code does refuse them, AC-OUTSIDE-01 becomes a backstop rather than the only guard; either way it stays.
