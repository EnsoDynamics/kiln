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

**Last Updated**: 2026-10-21
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the business assumptions we're making to proceed with [Kiln multi-repo delivery](kiln-multi-repo-delivery-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong.

---

## Repository Assumptions

### REPO-001. Does Kiln find a named repository as the folder of that name beside the PRD's repository?

**Assumption**: Kiln finds a named repository **only as a folder of that name in the same parent folder** as the PRD repository's checkout. A phase naming `storefront`, in a PRD under `~/devel/acme/product`, means `~/devel/acme/storefront`. There is **no mapping file** and no search elsewhere on the machine.

**Evidence**: The layout this change exists for keeps an organization's repositories side by side in one folder, and so does the Enso Method's worktree convention, which puts `.worktrees/` in that same folder (Kiln v1, AC-START-07). A mapping file would cover other layouts, but it would be one more thing to set up before a first run. It can be added later without changing this rule for anyone already using it.

**Confirm or Correct**:
- [ ] Correct — same parent folder, matched by folder name
- [ ] Wrong — also accept a mapping from repository name to folder, for other layouts
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact if Wrong**: 🟡 MEDIUM

---

### REPO-002. Does a session that finds it needs another repository get it and carry on, rather than stop at Needs you?

**Assumption**: A session that needs a repository the workspace doesn't have **asks Kiln for it and keeps working**. Kiln sets it up, and the **phase doesn't stop**. The person sees it afterwards, marked "added in phase <n>" on screen and in a terminal line.

**Evidence**: Phase planning can't always know every repository a phase will touch, and the need often shows up only once the code is read. Stopping would hand the person a branch and worktree to set up by hand, partway through a phase, which is the babysitting Kiln exists to remove. Adding a repository changes nothing outside the workspace, so a wrong addition costs no more than an unused worktree and an empty branch.

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

### BRANCH-002. Does this change leave per-phase branches to the later parallel-phases version?

**Assumption**: Sessions keep **committing straight to the feature branch** in each repository, one phase at a time, as in v1. **Per-phase branches**, which join the feature branch when their phase is done, **come with parallel phases**, not in this change.

**Evidence**: Per-phase branches are only needed when two phases work at once. With one phase at a time, each phase's branch would join the feature branch as a plain fast-forward. That adds a step Kiln has to perform and explain, and gives nothing in return yet. Nothing set up here is undone when parallel phases arrive. The feature branch stays where finished phases collect and what each pull request comes from, and the workspace stays the place sessions work.

**Confirm or Correct**:
- [ ] Correct — per-phase branches wait for parallel phases
- [ ] Wrong — build per-phase branches now, so parallel phases only change the scheduler
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact if Wrong**: 🟡 MEDIUM

---

## Stop Assumptions

### OUT-001. Is a ticked confirmation enough to clear "Stayed in the workspace"?

**Assumption**: After a session changed a repository's own checkout, the person deals with it, with the reopened session's help or by hand. Then they **tick a confirmation on Needs you** and press Check again. Kiln then counts that check as passed for that session, and the **other three checks decide** as usual.

**Evidence**: The check is about what the session did, and that can't become untrue afterwards. So the person has to say they've dealt with it. Kiln can't tell by looking: the checkout may hold the person's other work too, and a commit pushed from it can't be taken back. A confirmation is honest about that, and it is one click.

**Confirm or Correct**:
- [ ] Correct — a ticked confirmation, then Check again
- [ ] Wrong — correct answer: _______________

**Confidence**: 75% | **Impact if Wrong**: 🟢 LOW

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
