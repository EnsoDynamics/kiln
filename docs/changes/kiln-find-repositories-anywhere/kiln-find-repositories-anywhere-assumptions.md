# Kiln Find Repositories Anywhere - Assumptions

<!-- ⚠️ EDITING THIS FILE? LOAD THE RIGHT SKILL FIRST ⚠️
     Recording a stakeholder's answer to an assumption below, however it
     arrives (a reply, an email, a decision given in chat):
     `assumptions-document-feedback`.
     Any other edit (a new entry, a rewrite, the header):
     `assumptions-document-writing`, which owns this document's format.
     Most edits here are made by sessions doing something else, which is
     exactly how the format drifts.

     Superseded entry text comes OUT — version control holds it, and each entry
     records its ruling date as the handle. Do not layer history under a live
     entry, do not start a history file, and keep ONE Last Updated line.

     ⚠️ ASSUMPTION IDs ARE PERMANENT - DO NOT RENUMBER ⚠️
     Stakeholders reference these IDs in email feedback.
     Gaps in numbering (e.g., DATA-001, DATA-003) are expected
     when assumptions are validated and moved. NEVER close gaps. -->

**Last Updated**: 2026-11-21
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Find Repositories Anywhere](kiln-find-repositories-anywhere-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

The decisions made on 2026-11-21 are in the PRD as requirements and are not repeated here: a repository is named by the path in its remote address, Kiln matches a checkout by its `origin`, no setting says where repositories are kept, Kiln asks once and remembers on one computer, and plans that use folder names keep working.

---

## Naming Assumptions

### NAME-001. Is the host written in front of the path only when two of the PRD's repositories share a path on different hosts?

**Assumption**: Yes: a phase document names a repository by **its path alone** (`acme-labs/admin`). The host goes in front, with a colon (`git.example.com:platform/billing`), **only when two of the PRD's repositories have the same path on different hosts**. `phase-split` writes it that way, and Kiln reads both forms.

**If they choose otherwise**: Every name would carry its host (`github.com:acme-labs/admin`), on every line of every phase document. Kiln would match host and path together, and would never need to ask which host a path is on.

**Example**: A PRD in `acme/product` that changes `acme-labs/admin` writes `**Repositories:** acme-labs/admin`. Only a PRD that changes both `platform/billing` on `git.example.com` and `platform/billing` on `github.com` writes the hosts.

**Evidence**:
- The 2026-11-21 decision names a repository by its path and gives `acme-labs/admin` as the example.
- The host is not the same on every computer. A checkout cloned through an SSH alias reports the alias as its host, so a host read from a checkout can break the rule that nothing about one computer goes in a committed document. The path doesn't have that problem.
- A colon separates the host because a path can have three parts on a host that nests groups (`platform/payments/billing`). With a `/` there, Kiln couldn't tell a host from the first part of a path.
- When a path alone matches checkouts on two hosts on one computer, Kiln asks which to use, as it does for two clones.

**Confirm or Correct**:
- [ ] Correct — the path alone, with the host only to tell two of the PRD's repositories apart
- [ ] Wrong — always write the host
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

---

## Question Assumptions

### ASK-001. Does Kiln ask where a repository is on Documents found, in the browser, rather than at a prompt in the terminal?

**Assumption**: Yes: when a repository can't be found and every other start check passes, **Kiln opens Documents found and asks there**, on that repository's row. The terminal says a repository needs locating and gives the page's address. Start stays unavailable until the question is answered. Today a repository that isn't found stops Kiln in the terminal before the browser opens.

**If they choose otherwise**: `kiln run` would stop in the terminal and wait for a folder to be typed there, and Documents found would open only afterwards. The row on Documents found would never show a question.

**Evidence**:
- Every other choice the person makes before Start is on Documents found, where the workspace folder is already a typed path with a message under it when it is wrong.
- The terminal has only printed lines so far; Kiln has never waited for typing there. A person watching from another computer through an SSH tunnel has the page but not the terminal.
- The mockups draw the question on the page, so the alternative is visible before anything is built.

**Confirm or Correct**:
- [ ] Correct — ask on Documents found
- [ ] Wrong — ask at a prompt in the terminal
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟡 MEDIUM

---

## Decided by the Project Team

> Business decisions, not technical ones, that the team made because each follows from the decisions of 2026-11-21 or is easy to change later.

### FIND-001. Does the search stop two folders above the PRD's repository's folder, and before the home folder?

**Assumption**: Yes: Kiln looks **beside** the PRD's repository, then from **one folder up**, then from **two folders up**, and no further. At each step it looks down only as far as the level the PRD's repository is at. It **never searches from the home folder** or above it. A repository kept anywhere else is asked about once.

**If they choose otherwise**: A wider search would find more repositories without asking, and would read more of the computer each time a PRD starts. A narrower one, beside and one folder up only, would ask about a repository kept under another host's folder.

**Example**: With the PRD's repository at `~/code/acme/product`:

| Checkout | Found |
|---|---|
| `~/code/acme/returns-api` | Beside |
| `~/code/acme-labs/admin` | One folder up |
| `~/work/admin` | Not found; Kiln asks, because the next folder up is the home folder |

With the PRD's repository at `~/src/github.com/acme/product`, two folders up is `~/src/`, which reaches `~/src/git.example.com/platform/billing`.

**Evidence**:
- The 2026-11-21 decision is to search outward one parent folder at a time, within a bound, never above the home folder. This entry sets the bound.
- One folder up covers a folder per organization. Two covers a folder per host with organizations inside it, the layout Go's tools and several clone managers produce.
- The home folder holds Documents, Desktop and Library. Searching it is slow, and macOS asks permission before a program reads some of it.
- A miss costs one question, asked once per computer.

**Confirm or Correct**:
- [ ] Correct — beside, one folder up, two folders up, and never from the home folder
- [ ] Wrong — correct answer: _______________

**Confidence**: 70% | **Impact**: 🟡 MEDIUM

---

### FIND-002. Does the search pass over hidden folders, `node_modules`, links, worktrees and the inside of any checkout?

**Assumption**: Yes: Kiln doesn't look in a folder whose **name starts with a dot**, a folder named **`node_modules`**, or **anything inside a Git checkout**. It **doesn't follow links**, and it **never counts a worktree** as a repository's checkout.

**If they choose otherwise**: Kiln would find more copies of a repository, such as a worktree made for another feature or a clone inside another project's dependencies, and would ask which to use far more often.

**Example**: `~/code/.worktrees/customer-returns/admin` is a worktree in a hidden folder, and `~/code/acme/product/vendor/admin` is inside a checkout. Kiln passes over both and uses `~/code/acme-labs/admin`.

**Evidence**: A worktree shares its repository with the checkout it was made from, so it is never a second place to start a feature branch from. Stopping at each checkout also keeps the search short, since most folders in a code folder are checkouts.

**Confirm or Correct**:
- [ ] Correct as stated
- [ ] Wrong — correct answer: _______________

**Confidence**: 90% | **Impact**: 🟢 LOW

---

### ASK-002. Can the person change a remembered answer, but only before Start?

**Assumption**: Yes: on Documents found, a repository whose checkout came from a remembered answer **says so and offers Change**, which asks again. **After Start, the checkout is fixed for that PRD**. Changing the answer by command then affects only PRDs started later.

**If they choose otherwise**: With no way to change it, a person who pointed Kiln at the wrong one of two clones would be held to it on that computer. Allowing a change after Start would move a running PRD's worktrees to another clone partway through.

**Evidence**: The base branch works the same way: chosen on Documents found, fixed once Start sets the repository up. The decision of 2026-11-21 has Kiln remember an answer; it doesn't say how one is corrected.

**Confirm or Correct**:
- [ ] Correct — changeable before Start, fixed after
- [ ] Wrong — correct answer: _______________

**Confidence**: 80% | **Impact**: 🟢 LOW

---

### CMD-001. Does Kiln get a `kiln locate-repository` command for giving the answer from the command line?

**Assumption**: Yes: **`kiln locate-repository <name> <folder>`** tells Kiln where a repository is on this computer, and `--forget` makes it forget. It works **whether or not Kiln is running or has asked**, and `kiln status` shows an open question with the command.

**If they choose otherwise**: The page on Documents found would be the only way to answer. A bot couldn't answer, and nothing could be answered after Start (ASK-003).

**Example**: `kiln locate-repository acme-labs/admin ~/work/admin`

**Evidence**: The controls on Kiln's pages each have a command, so that a bot can do what a person can. This is one more command on a short list, and it remembers the same answer the page does.

**Confirm or Correct**:
- [ ] Correct — add the command
- [ ] Wrong — the page only
- [ ] Wrong — different approach: _______________

**Confidence**: 80% | **Impact**: 🟡 MEDIUM

---

### ASK-003. After Start, does a stop for a repository Kiln can't find give the command to run, rather than a field to fill in?

**Assumption**: Yes: when a phase about to start names a repository Kiln can't find, the Needs you stop **names the repository, says where Kiln looked, and shows the `kiln locate-repository` command to copy**. Check again tries again. The page **has no field** for the folder.

**Depends on**: CMD-001

**If they choose otherwise**: Needs you would carry the same question Documents found does, with a field and the list of checkouts found, drawn and built a second time.

**Evidence**: This happens only when a plan is edited after Start, or a session splits its phase, and the new line names a repository outside the search. Needs you already gives commands to copy for a stopped session. The common case, a repository named before Start, is asked on Documents found.

**Confirm or Correct**:
- [ ] Correct — the command, with Check again
- [ ] Wrong — the same question as on Documents found
- [ ] Wrong — different approach: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

---

### ADD-001. When a session asks for a repository Kiln can't find, is the session told, and the person not asked?

**Assumption**: Yes: `kiln add-repository` **tells the session** that Kiln couldn't find the repository, or found more than one checkout, and **changes nothing**. The **phase doesn't stop** and nothing asks the person. The session carries on or ends as it judges, as it does today when any other check on an added repository fails.

**If they choose otherwise**: The phase would stop at Needs you with the question as soon as a session asked for a repository Kiln couldn't find, and wait there for the person.

**Evidence**: Multi-repo delivery decided that a session needing another repository gets it and carries on without the person (its REPO-002), and that Kiln adds only what it can find. A session asking for a repository outside the search is rare, and the person can give the answer by command at any time.

**Confirm or Correct**:
- [ ] Correct — tell the session; don't stop the phase
- [ ] Wrong — stop at Needs you and ask the person
- [ ] Wrong — different approach: _______________

**Confidence**: 85% | **Impact**: 🟡 MEDIUM

---

### FOLDER-001. When two of a PRD's repositories have the same last name, does the later one go by its whole path?

**Assumption**: Yes: a repository goes by **the last part of its path** (`admin`), for its worktree folder in the workspace and on Kiln's screens and terminal lines. When another of the PRD's repositories **already has that name, the later one goes by its whole path with hyphens** (`acme-labs-admin`). A name doesn't change once the repository is set up.

**If they choose otherwise**: Every repository could go by its whole path always, which is longer on every screen. Or the workspace could nest folders by organization (`acme-labs/admin`), which changes where every worktree is.

**Example**: A PRD names `acme/admin` in phase 1 and `acme-labs/admin` in phase 3. Their worktrees are `admin` and `acme-labs-admin`, and a done line reads `pushed admin a1c4e09 · acme-labs-admin 5d81b37`.

**Evidence**: Today a worktree folder is the checkout's folder name, which is nearly always the last part of the path, so most PRDs see no change. The first repository keeps the short name because a second one can be added after the first already has its folder.

**Confirm or Correct**:
- [ ] Correct — the last part, and the whole path with hyphens for the later one
- [ ] Wrong — correct answer: _______________

**Confidence**: 75% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
