# Kiln multi-repo delivery - Business Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE `assumptions-document-writing` SKILL FIRST ⚠️
     It owns this document's format, and most edits here are made by sessions
     doing something else — recording a ruling while building a phase — which is
     exactly how the format drifts. Folding a stakeholder's answers? Load
     `assumptions-document-feedback` as well.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-10-22
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the business assumptions we're making to proceed with [Kiln multi-repo delivery](kiln-multi-repo-delivery-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

---

## Repository Assumptions

### REPO-001. Does Kiln find a named repository as the folder of that name beside the PRD's repository?

**Assumption**: Kiln finds a named repository **only as a folder of that name in the same parent folder** as the PRD repository's checkout. A phase naming `storefront`, in a PRD under `~/devel/acme/product`, means `~/devel/acme/storefront`. There is **no mapping file** and no search elsewhere on the machine. A **link** of that name to a checkout elsewhere doesn't count: Kiln needs the checkout itself there.

**Evidence**: The layout this change exists for keeps an organization's repositories side by side in one folder, and so does the Enso Method's worktree convention, which puts `.worktrees/` in that same folder (Kiln v1, AC-START-07). A mapping file would cover other layouts, but it would be one more thing to set up before a first run. It can be added later without changing this rule for anyone already using it.

**Confirm or Correct**:
- [ ] Correct — same parent folder, matched by folder name
- [ ] Wrong — also accept a mapping from repository name to folder, for other layouts
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟡 MEDIUM

---

### REPO-002. Does a session that finds it needs another repository get it and carry on, rather than stop at Needs you?

**Assumption**: A session that needs a repository the workspace doesn't have **asks Kiln for it and keeps working**. Kiln sets it up, and the **phase doesn't stop**. The person sees it afterwards, marked "added in phase <n>" on screen and in a terminal line.

**Evidence**: Phase planning can't always know every repository a phase will touch, and the need often shows up only once the code is read. Stopping would hand the person a branch and worktree to set up by hand, partway through a phase, which is the babysitting Kiln exists to remove. Adding a repository leaves the person's own checkout of it as it was, but the new feature branch, and the record of the new worktree, land in the repository that checkout shares. Kiln never deletes branches (Kiln v1, AC-GIT-02), so a wrong addition leaves an unused worktree and a branch with no commits for the person to remove by hand.

**Confirm or Correct**:
- [ ] Correct — the session gets the repository and carries on
- [ ] Wrong — stop at Needs you and let the person decide
- [ ] Wrong — different approach: _______________

**Confidence**: 90% | **Impact if Wrong**: 🟡 MEDIUM

---

### REPO-003. Does an added repository branch from its default base, with no chance for the person to choose?

**Assumption**: A repository added partway through a phase gets its feature branch from **`develop`, or its default branch when it has no `develop`**. That is the rule Documents found starts every repository with. Nobody is asked, and the base is **fixed from then on**.

**Example**: In the mockups' sample feature, phase 2b adds `notifications`. That repository has no `develop`, so its feature branch starts from `main`, and its pull request goes into `main`.

**Evidence**: Asking would stop the phase, which REPO-002 rules out. The default is the base most repositories are delivered into, and it is what the person would have seen on Documents found had the repository been named.

**Confirm or Correct**:
- [ ] Correct — default base, no question asked
- [ ] Wrong — correct answer: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟢 LOW

---

### REPO-004. Does a phase document name its repositories on a `**Repositories:**` line under its title?

**Assumption**: A phase document names the repositories its phase changes on **one line under its title**, beside the lines the Enso Method already puts there, as **folder names separated by commas**. The Enso Method's `phase-split` would write the same line once the method adopts it; until then a person writes it by hand.

**Example**:

```markdown
# Phase 2b: Store credit

**Parent PRD:** [customer-returns-prd.md](./customer-returns-prd.md)
**Repositories:** returns-api, storefront
```

**Evidence**: Phase documents already open with `**Parent PRD:**` and `**Technical design:**` lines, and Kiln v1 already reads the `**Closed:**` line in the same place. A separate section would work too, but a line is easier to write by hand and to spot when reviewing a split.

**Confirm or Correct**:
- [ ] Correct — a `**Repositories:**` line under the title
- [ ] Wrong — a `## Repositories` section listing one per line
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

---

### CLI-001. Does a session ask Kiln for a repository with a second `kiln` command?

**Assumption**: Kiln gets a **second command, beside `kiln run`**, that names a repository and asks the running Kiln for that PRD to add it, for example `kiln add-repository storefront`. A session runs it from the workspace folder or any of the workspace's worktrees, and a person can type it too. When `kiln run` isn't running for that PRD, the command **says so and changes nothing**.

**Evidence**: Kiln v1 promised `kiln run` would be its only command (AC-CLI-02), and this reverses that in part. The alternatives are worse:
- The browser view's connection is guarded so that nothing but the person's own browser tab can use it, and a session has no tab.
- Letting the session set up the worktree with Git itself would move setup Kiln owns into every session's instructions, with no check that the branch name is free.

A command is also something a person could type by hand, as everything Kiln asks of a session must be (AC-RUN-06).

**Confirm or Correct**:
- [ ] Correct — a second `kiln` command for adding a repository
- [ ] Wrong — the session sets up the worktree itself, following instructions in its prompt
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

---

### REPO-005. Does Documents found tell the person that sessions don't follow each repository's own Claude Code settings or hooks? — ⏳ PENDING (Added 2026-10-22 — new question; 85% confidence)

**Assumption**: Kiln **accepts the gap and says so**. A multi-repository PRD's Documents found gains one line under the repositories: **"Sessions follow each repository's CLAUDE.md, but not its .claude/settings.json or hooks."** Kiln writes **no merged settings** into the workspace folder.

**Example**: In the sample feature, if `returns-api/.claude/settings.json` denies `npm publish` or runs a formatter hook after each edit, a Kiln session working in `returns-api`'s worktree **gets neither**. It does read `returns-api/CLAUDE.md`, because every prompt tells it to.

**Evidence**: Tried on Claude Code 2.1.307 (technical design, "Per-repository instructions"): a session started in the workspace folder honors only that folder's settings and the person's own user settings. Kiln can't fix that without writing a `.claude/settings.json` into the workspace folder, which needs a **merge rule for permissions and hooks that disagree** between repositories, a bigger change the PRD doesn't ask for.

The PRD's "Depends On" expected each repository's settings to apply, so the person would otherwise assume protection they don't have. One sentence costs nothing and can be dropped later if Kiln ever merges settings.

**Confirm or Correct**:
- [ ] Correct — accept it, and say so in one line on Documents found
- [ ] Wrong — accept it and say nothing
- [ ] Wrong — Kiln writes merged settings into the workspace folder
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟢 LOW

---

## Branch Assumptions

### BRANCH-001. Is the feature branch the same name in every repository?

**Assumption**: One feature branch name, **`feature/<PRD folder name>` by default**, is used in every one of the PRD's repositories. The person can change it once on Documents found, for all repositories together.

**Example**: For the sample feature *Customer returns*, `product`, `returns-api` and `storefront` each get `feature/customer-returns`.

**Evidence**: One name makes the pull requests easy to find together, and it matches how people name a cross-repository change by hand. A name already taken in any one repository blocks Start (Kiln v1's UI-003), which is rare with a PRD-specific name.

**Confirm or Correct**:
- [ ] Correct — one name for every repository
- [ ] Wrong — a name per repository, each editable
- [ ] Wrong — different approach: _______________

**Confidence**: 90% | **Impact if Wrong**: 🟢 LOW

---

### BRANCH-002. Does this change leave per-phase branches and workspaces to the later parallel-phases version?

**Assumption**: Sessions keep **committing straight to the feature branch** in each repository, in **one shared workspace**, one phase at a time, as in v1. **Per-phase branches and per-phase workspaces come with parallel phases**, not in this change.

**Evidence**: Both are needed only when two phases work at once. With one phase at a time, a phase branch would join the feature branch as a plain fast-forward, a step Kiln would have to perform and explain for nothing yet.

**What carries over, and what doesn't:** the feature branch per repository (one name everywhere, where finished work collects, the source of each pull request), each repository's base branch, finding repositories by folder name and one pull request per repository all stay. Parallel phases will still change **where a session works** (its own workspace), **what "Pushed" means** (its phase branch, plus the join), **which workspace the outside-the-workspace check judges**, and **where an added repository goes**. Building per-phase branches now would settle only the second of those four.

**Confirm or Correct**:
- [ ] Correct — per-phase branches wait for parallel phases
- [ ] Wrong — build per-phase branches now, settling what "Pushed" will mean before parallel phases arrive
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

---

## Stop Assumptions

### OUT-001. Is a ticked confirmation enough to clear "Stayed in the workspace"?

**Assumption**: After a session changed a repository's own checkout, the person deals with it, with the reopened session's help or by hand. Then they **tick a confirmation on Needs you** and press Check again. Kiln then counts **every change outside the workspace the session's transcript records up to the tick** as dealt with, and the **rest of the check decides** as usual. A change recorded after the tick, such as one the session makes once resumed, fails the check again.

**Evidence**: The check is about what the session did, and that can't become untrue afterwards. So the person has to say they've dealt with it. Kiln can't tell by looking: the checkout may hold the person's other work too, and a commit pushed from it can't be taken back. A confirmation is honest about that, and it is one click.

**Confirm or Correct**:
- [ ] Correct — a ticked confirmation, then Check again
- [ ] Wrong — correct answer: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟢 LOW

---

### OUT-002. Does any Git command that changes a checkout outside the workspace fail "Stayed in the workspace", not only a commit or a push?

**Assumption**: Outside the workspace, a session fails the check by editing a file, or by **any Git command that changes a checkout's files, its staged changes or the branch it is on; creates, moves or deletes a local branch; or pushes from it**: `commit` and `push`, and also `add`, `checkout`, `switch`, `stash`, `reset`, `merge`, `rebase` and `pull`. Git commands that **do none of those**, such as `status`, `log`, `diff` and `fetch`, pass.

**Example**: In the mockups' sample feature, a phase 3 session that runs `git stash` and then `git switch -c token-fix` in `~/devel/acme/design-system` stops at Needs you, though it committed nothing there.

**Evidence**: The check exists for two harms: a change that **bypasses the feature branch** and its pull request, and a change **mixed in with the person's other work** in their own checkout. A commit or a push is the first. Switching branches, stashing, resetting or pulling in the person's checkout is the second: their uncommitted work moves or their branch changes under them, with nothing to show for it in any pull request.

Recognizing more Git commands costs nothing extra to read: the transcript records every shell command either way. Shell commands other than Git, such as a script that writes files, **stay unseen under either answer**. The narrower answer would stop less often, at the cost of letting those disturbances through silently.

**Confirm or Correct**:
- [ ] Correct — any Git command that changes a checkout's files, its staged changes or the branch it is on; creates, moves or deletes a local branch; or pushes from it
- [ ] Wrong — only `git commit` and `git push`, beside file edits
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟢 LOW

---

### OUT-003. Does a session whose transcript Kiln can't find fail "Stayed in the workspace"?

**Assumption**: A session that **never started**, because Claude Code couldn't be launched or a resume ended before the session began, did nothing and **passes**. A session that **ran but whose transcript Kiln can't find fails**, since Kiln can't see what it did, and Needs you says **where Kiln looked**. A transcript Kiln finds but **can't read** fails the same way, apart from a line cut off when the session was killed, which Kiln skips. Once the person has checked their own checkouts, **ticking the confirmation** (OUT-001) clears it, as it clears any other change outside the workspace.

**Example**: In the mockups' sample feature, a phase 2 session that ran with Claude Code set not to keep transcripts stops at Needs you with "No transcript found for session … in ~/.claude/projects", though it touched nothing outside the workspace. The person looks over their checkouts, ticks the box and presses Check again.

**Evidence**: A false pass is the harm this check exists to catch (OUT-002), and a false stop costs **one tick**.

A missing transcript isn't only a theoretical case. Claude Code **keeps none when the person has turned off its prompt history** (`CLAUDE_CODE_SKIP_PROMPT_HISTORY`; a session tried that way started, finished and left none). Kiln passes the person's whole environment to its sessions, so passing here would let **every session pass unread**.

Claude Code also **deletes transcripts after 30 days** by default, so a phase left at Needs you that long could lose its own.

**Confirm or Correct**:
- [ ] Correct — a session that ran with no transcript fails, and the confirmation clears it
- [ ] Wrong — let it pass, since there is nothing to read
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟡 MEDIUM

---

## Pull Request Assumptions

### PR-001. Does the PRD's repository get its own pull request when its only changes are the phase documents?

**Assumption**: The PRD's repository **gets a pull request like any other**, even when all it carries is the phase documents' Closed lines and any `Superseded by:` lines the sessions wrote.

**Example**: In the sample feature, `product` gets pull request #12 with the five Closed lines, alongside `returns-api` #57, `storefront` #218 and `notifications` #9.

**Evidence**: Those lines are how the Enso Method records that a phase was built. Without a pull request they stay on the feature branch, and the PRD's own documents never show the work as done. A pull request is also the one route into the base branch Kiln is allowed (Kiln v1, AC-START-08).

**Confirm or Correct**:
- [ ] Correct — the PRD's repository gets its own pull request
- [ ] Wrong — leave its changes on the feature branch for the person to merge by hand
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
