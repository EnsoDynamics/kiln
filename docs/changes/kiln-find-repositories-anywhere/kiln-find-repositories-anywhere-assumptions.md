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

**Last Updated**: 2026-11-22
**Status**: DRAFT - Pending business validation

**Document Purpose**: This document lists the assumptions we're making to proceed with [Kiln Find Repositories Anywhere](kiln-find-repositories-anywhere-prd.md). We're not waiting for answers—we're proceeding with these assumptions and need stakeholders to validate or correct any that are wrong. Every numbered entry is a business assumption.

The decisions made on 2026-11-21 are in the PRD as requirements and are not asked again here: a repository is named by the path in its remote address, Kiln matches a checkout by its `origin`, no setting says where repositories are kept, Kiln asks once and remembers on one computer, when it finds two checkouts of one repository it asks, and plans that use folder names keep working. ASK-004 checks our reading of one of them.

---

## Decided by the Project Team

> The team has made each call below and is building on it, because it is our reading of the decisions of 2026-11-21 or of earlier rulings, or is easy to change after release. None waits on an answer. Each is still the business's to correct: tick Wrong and say what instead.

### ASK-003. When a session asks for a repository Kiln can't find, does Kiln ask you about it if that phase later stops at Needs you?

**Assumption**: Yes: Kiln **keeps the session's refused request with its phase**. If that phase later **stops at Needs you for any reason**, the stop also asks where the repository is, with Documents found's question and words (PRD AC-ASK-07). The answer is remembered on this computer, so the session's next request **succeeds once the phase resumes**. The phase **never stops for the request alone**: the session is told, and carries on or ends as it judges (AC-SESSION-01).

**If the phase finishes without a stop, nobody is asked.** The session closed its phase without the repository, and the phase passed Kiln's done check. Whatever it wanted the repository for is **left undone**. Kiln catches that only when it is part of an acceptance criterion: once every planned phase is closed, the delivery audit finds the criterion unbuilt and adds a phase for it, whose stop asks if that phase names the repository. Otherwise Kiln doesn't flag it.

**If they choose otherwise**:
- **Never ask**: the stop shows only what it shows today. You can read the session's words about the repository, but have **no place to tell Kiln** where it is. You clone it where the search reaches, or name it in a later phase document, whose stop asks.
- **Pause at once**: the phase stops at Needs you with the question as soon as the request fails, so a run left overnight **waits there until morning**. A phase can never close without the repository unnoticed.

**Example**: You leave a run overnight. In phase 3, Returns dashboard, the session runs `kiln add-repository acme-labs/ledger` at 1:40 AM. Its only checkout is at `/Volumes/work/ledger`, outside the search, so Kiln tells the session it couldn't find it. The session can't finish without it and ends at 2:15 AM with a question.
- As proposed: in the morning, "Phase 3 needs your input." shows, above the session's question and the reply box, "Kiln couldn't find a checkout of acme-labs/ledger. It searched outward from ~/code/acme/, never above your home folder." and a folder field. You give `/Volumes/work/ledger`, reply and resume, and the session's next request adds it.
- Never ask: the same page shows the session's question and the reply box only.
- Pause at once: at 1:40 AM phase 3 stops at Needs you with that question and folder field, and the run waits there until morning.

**Evidence**:
- Your decision of 2026-11-21: "When the search finds nothing, Kiln asks once." A session's request runs the same search, and this asks at a stop the run reaches anyway, adding no pause.
- **For never asking**: the same decision says "The start checks ask the person", and lists only start-check screens to draw. If it meant the start checks only, never asking is the answer.
- Rare: in 186 recorded sessions on one computer, none asked for a repository with `kiln add-repository`. Either answer costs little.

**Confirm or Correct**:
- [ ] Correct — ask at the phase's next Needs you stop, if it reaches one; never stop the phase for the request
- [ ] Wrong — never ask; the session is told and nobody else is
- [ ] Wrong — stop the phase at Needs you as soon as a session asks for a repository Kiln can't find
- [ ] Wrong — different approach: _______________

**Researched**: 2026-11-21, second pass; the 2026-11-21 decision, multi-repo delivery's PRD and register, the Needs you criteria of every other Kiln change, Kiln's plan stop and Check again, Build Preflight and handoff rulings, the session prompts, how a refused request is handled today, run restart's and handoff's stop pages, every Kiln assumptions register, Kiln's recorded sessions on one computer. One avenue is left: whether a delivery audit's completion phase would name the repository, so that its stop asks under either answer.

**Confidence**: 70% | **Impact**: 🟡 MEDIUM

---

### ASK-004. When one checkout sits beside the PRD's repository and another is farther out, does Kiln still ask which to use?

**Assumption**: Yes. Your decision of 2026-11-21 says that when Kiln **finds two checkouts of one repository, it asks** instead of guessing. We read that as covering this case too, so Kiln **asks here as well** (PRD AC-ASK-02). It searches its whole limit every time, so a copy beside the PRD's repository never hides one farther out (AC-FIND-01). The answer is remembered on this computer, so it is asked once (AC-ASK-04).

**If they choose otherwise**: a checkout **beside the PRD's repository is used without a word**, as it is before this change, and Kiln searches no farther. Kiln asks only when none is beside and it finds more than one farther out.

**Example**: The PRD's repository is `~/code/acme/product`. An old clone of `acme-labs/storefront` sits beside it at `~/code/acme/storefront-old`. The one you work in is one folder up, at `~/code/acme-labs/storefront`.
- As proposed: Documents found lists both and asks which, as mockup section 3 draws for two checkouts.
- The alternative: Kiln uses `~/code/acme/storefront-old`. The row shows that folder, with no way to pick the other on the page.

**Evidence**:
- **For asking**: your decision of 2026-11-21: "When it finds two checkouts of one repository it asks instead of guessing." It names no distance.
- **For using the one beside**: the same decision says Kiln looks "beside it first, as today", and before this change a checkout beside the PRD's repository is used without a question.
- **What asking costs**: one question per computer, on Documents found. Until it is answered, a session's request for that repository mid-phase is refused (AC-SESSION-01), and a phase that comes to name it after Start, through a plan edit or a split, stops at Needs you (AC-ASK-07), so an unattended run waits where under the alternative it would go on. Plans that name a repository by folder name never search (AC-FIND-04), so they keep working under both answers.
- **What a wrong silent pick costs**: little, and the case is rare (one such pair among 302 checkouts on one computer). Both checkouts have the same `origin`, and the feature branch starts from the base branch there, so the same code is built; only the worktree belongs to the old clone.

**Confirm or Correct**:
- [ ] Correct — ask, even when one of the checkouts is beside the PRD's repository
- [ ] Wrong — use the one beside, as before this change; ask only when none is beside
- [ ] Wrong — different approach: _______________

**Researched**: 2026-11-21, second pass; the 2026-11-21 decision, multi-repo delivery's PRD and register, Kiln's earlier rulings on asking and guessing, Kiln's start checks, a count of the checkouts on one computer, how Git, Node and Cargo choose among matches. A third pass has nothing new to look for: the answer turns on what the 2026-11-21 decision meant.

**Confidence**: 65% | **Impact**: 🟢 LOW

---

### ASK-002. When can you change the folder Kiln remembers for a repository?

**Assumption**: Only before Start. On Documents found, a repository whose checkout came from a remembered answer **says so and offers Change**, which asks again and **updates the answer remembered on this computer**. Once Kiln has set a repository up for a PRD, **its checkout is fixed for that PRD**, as its base branch is. A changed answer reaches only repositories set up after it, in that PRD or any other. After Start, the only way to move a PRD to another clone is **Reset Kiln for this PRD**, which leaves the remembered answer alone.

**If they choose otherwise**:
- **Never**: there is no Change. A remembered answer stays until its folder no longer holds that repository, so to point Kiln elsewhere you move or delete the folder it remembers, and it asks again (AC-ASK-04).
- **After Start too**: the settings page while Kiln works offers Change as well. Picking another clone mid-run makes a new worktree of the feature branch there from what is pushed to `origin`. Earlier phases' work is pushed, so it carries over; anything the current phase hasn't pushed stays in the old clone's worktree.

**Example**: Last week you told Kiln that `acme-labs/storefront` is at `/Volumes/work/storefront`. Since then you cloned it again at `~/code/acme-labs/storefront`. Today a new PRD's Documents found still reads "You told Kiln where this is · Change" on that row (mockup section 4).
- As proposed: before Start, Change lets you give `~/code/acme-labs/storefront` instead. After Start, the row has no Change.
- Never: the row has no Change. To use the new clone, you first move or delete `/Volumes/work/storefront`.
- After Start too: during phase 3 of 6, you pick `~/code/acme-labs/storefront` on the settings page, and phase 4 runs in a new worktree there, with phases 1 to 3's pushed commits.

**Evidence**:
- The base branch and the workspace folder work the same way: chosen on Documents found, fixed once Kiln sets them up.
- This is Kiln's **first remembered choice that spans PRDs**. On 2026-10-30 you had a remembered early-merge permission removed and kept it "scoped to the current PRD"; Change keeps this one easy to undo.

**Confirm or Correct**:
- [ ] Correct — only before Start, on Documents found; fixed for a PRD once set up
- [ ] Wrong — never: no Change; the answer stays until its folder no longer holds that repository
- [ ] Wrong — also after Start, moving the PRD to a new worktree in the other clone
- [ ] Wrong — different approach: _______________

**Researched**: 2026-11-21; the 2026-11-21 decision, multi-repo delivery's PRD, design and register, missing-worktree recovery and run restart, Kiln's saved-worktree checks, the development-deployments rulings, GitHub Desktop.

**Confidence**: 85% | **Impact**: 🟢 LOW

---

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|----|------------|-----------|-------|
| ASK-001 | Kiln asks where a repository is on Documents found, not at a prompt in the terminal | Written up 2026-11-21 | Research left one sensible answer: Kiln never reads typed input in the terminal, bot control's commands never wait at a prompt, and a run is set up only in the browser. PRD AC-ASK-01, which also says a start check that fails as well still stops in the terminal. |
| FIND-001 | How far outward the search goes, and what else it passes over | Moved to design 2026-11-22 | [Technical design](technical-design.md), "The search", which also passes over Pictures, Music and Movies on macOS and any folder on another disk. The PRD keeps the owner's rule (beside first, outward one parent at a time, within a limit, never above the home folder), the layouts found without asking (AC-FIND-01) and no permission prompt (AC-FIND-05). Choice proposed by research: start at the PRD repository's parent folder and climb up to and including the home folder, at most 4 folders down from each, skipping hidden folders, Library and the folders macOS guards; outside the home folder climb at most 2 parents, never to the top of a disk; search the whole limit every time, since more than one checkout means asking (AC-ASK-02, ASK-004). It beat the draft's "two folders up, never the home folder", which misses a repository kept directly in the home folder beside the code folder. A count-only walk of a home folder with those skips read 244 folders in 0.08 s. |
| FIND-002 | Only a repository's own checkout counts; the search never looks inside a checkout or follows a link | Written up 2026-11-21 | PRD AC-FIND-02. Never looking inside a checkout replaces the named `node_modules` rule, since it covers every ecosystem's dependency folders. Passing over hidden folders goes to the design with FIND-001. |
| CMD-001 | How the answer is given from the command line | Written up 2026-11-21 | No command before Start: Kiln's command-line guide says "A brand-new execution is configured and started only in the browser", and the audit-loop change keeps "Settings chosen before Start" in the browser; the product owner, 2026-10-26, scoped bot control to "once I have it started". After Start the stop's question has a command (PRD AC-ASK-06), as every control at a stop does (the owner on waivers, 2026-11-01, and on reset, 2026-11-12). No forget command: Kiln re-checks a remembered answer and Change covers the rest (AC-ASK-04, AC-ASK-05). Replaces the draft's `kiln locate-repository` usable any time, with `--forget`. |
| ADD-001 | A session's request for a repository Kiln can't place is refused to the session, and nothing changes | Written up 2026-11-21 | Applies multi-repo AC-ADD-02's rule for any failed check (PRD AC-SESSION-01). Whether the phase then pauses or the person is asked is ASK-003. |
| FOLDER-001 | When two of a PRD's repositories share a short name, both are shown by their whole address path from then on | Written up 2026-11-21 | One sensible answer: showing only the later one by its whole path puts `admin` beside `acme-labs/admin`, which reads as if one were the plain or main one. It costs a change of label: a repository shown as `admin` in earlier phases shows as `acme/admin` once a second `admin` joins the PRD; its worktree folder stays (AC-FOLDER-01). PRD AC-FOLDER-02. |
| FOLDER-001 (part) | The worktree folder name for a repository whose last name is taken | Moved to design 2026-11-22 | [Technical design](technical-design.md), "Worktree Folders and Labels": the path's parts joined by `+`, as in `acme-labs+admin`. PRD AC-FOLDER-01 states the outcome: unique in the PRD, never changed once set up, the last part of the path when free. Choice: build the name from the whole path, for the later one, or for both when they are set up at the same time, with a separator no host allows in a path part. It beat the draft's hyphens, which give `acme-labs-admin` for both `acme-labs/admin` and `acme/labs-admin`, and folders nested by organization. |
| NAME-001 | A phase names a repository by its address path alone; the host goes in front only when two of the PRD's repositories share a path on different hosts | Written up 2026-11-21 | One sensible answer given the 2026-11-21 decisions: naming isn't tied to one host, and nothing about one computer goes in a committed document, while a host read from a checkout can be one computer's SSH alias (`git@github-work:acme-labs/admin.git`). Always writing the host lost on both counts. When a path alone matches checkouts on two hosts on one computer, Kiln asks which (AC-ASK-02). PRD AC-NAME-01, AC-SPLIT-02. |
| NAME-001 (part) | How a name with its host in front is written | Written up 2026-11-21 | PRD AC-SPLIT-02, since the method owns the line it writes; Kiln reads it (AC-NAME-01). The host's real name, a colon, then the path: `git.example.com:platform/billing`, the way Git itself puts a host before a path; no address path holds a colon. A slash, `git.example.com/platform/billing`, as Go's tools and GitHub's `gh` write it, tells a host from a group by the dot in its first part, and GitLab allows a dot in a group or user name (`backend.services`, GitLab's documentation on allowed path characters, read 2026-11-21), so a slash could not always be told from a path. |
| ASK-003 (part) | The stop before a phase asks where a repository is on the page, with Documents found's question and words | Written up 2026-11-21 | One sensible answer given the owner's rulings: Needs you asks "with the same wording and disclosure as setup" (2026-10-26), and recovering a missing folder is "a deliberate setup like a first Start", in the first-Start words (2026-11-06). A stop that showed only a command could not be answered from the page. PRD AC-ASK-07, its command AC-ASK-06. |
