# Technical Design: Kiln Find Repositories Anywhere

**PRD:** [Kiln Find Repositories Anywhere](kiln-find-repositories-anywhere-prd.md) · **Assumptions:** [assumptions](kiln-find-repositories-anywhere-assumptions.md) · **Screens:** [mockup](mockups/kiln-find-repositories-anywhere.html), the copy of record for the eight states drawn · **Changes:** [Kiln multi-repo delivery technical design](../kiln-multi-repo-delivery/technical-design.md), [Kiln bot control technical design](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md), [Kiln continue added phases technical design](../kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md), [Kiln missing-worktree recovery technical design](../kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md), [Kiln run restart technical design](../kiln-run-restart/kiln-run-restart-technical-design.md), [Kiln completion waivers technical design](../kiln-completion-waivers/kiln-completion-waivers-technical-design.md) and [Kiln billing safeguards technical design](../kiln-billing-safeguards/kiln-billing-safeguards-technical-design.md)

## Overview

Today a phase document names a repository by the folder name of its checkout, and Kiln finds it only beside the PRD's repository. This change lets the line hold the repository's address path (`acme-labs/admin`), has Kiln find the checkout by its `origin`, and has Kiln ask the person once on a computer when it can't tell. The Enso Method's `phase-split` skill starts writing address paths.

The key decisions:

- **A repository's identity is its address path, compared without case.** Kiln already records it for every repository as `github`. A name on the line reaches a repository through its checkout or its address path, never through the name Kiln gives it.
- **The name Kiln gives a repository stays one string**: its key in Kiln's record and its worktree folder's name, fixed once the repository is set up. What a screen shows is a separate label, worked out each time from the PRD's repositories, because it changes when a second repository with the same short name joins.
- **One walk of the folders in reach answers every name.** It lists every repository's own checkout with its `origin`; each name is then looked up in that list. Nothing is cached between walks.
- **Asking is a state of a repository's row, not a failed check.** Before Start the row asks on Documents found. After Start the same question rides on a Needs you stop, and one new changing command answers it.
- **Remembered answers live in Kiln's state root, one small file per repository**, outside every PRD's record, so every PRD on the computer reads them.

## Existing Code

**Posture: Preserve** (the default; nobody named one). Kiln 1.4.0 is released and PRDs are underway on it.

- **Reused as is:** the four checks a folder name gets beside the PRD's repository, with their words; the GitHub origin reader; worktree and branch setup; the branch, worktree-path and base checks an added repository gets; the plan stop and its Check again; the control journal, receipts and status tokens; the state root.
- **Reused and extended:** the plan reader (what a name can be), the start checks and the start-from-a-branch preview (how a name becomes a checkout), adding a repository, the snapshot, the session prompts, the terminal's lines, `kiln status`; and every other reader of a plan's names, which today compares them with entries' names or finds them beside the PRD's repository: the plan reconciliation's completed-phase scope, a continuation's readiness check, the Folder missing page's setup panel and the accounting of external completion evidence ([Names](#names-ac-name-01-ac-name-02), "Where names are compared").
- **Behavior to keep that the code alone wouldn't say:**
  - A repository entry's `name` already keys each phase's commits, the chosen bases and the pull requests in records on disk, and is the worktree folder's name. It keeps both jobs.
  - A folder name is matched against the parent folder's listing, case included, never by asking whether the path exists.
  - A named repository's own checkout is never checked for cleanliness, and Kiln reads nothing in it but its `origin` and its branches.
  - A one-repository PRD sees none of this change until a session adds a repository.

## Architecture

No new process, service or dependency. Two additions inside Kiln: a **repository search** (a bounded walk of folders plus Git's own read of each checkout's `origin`) and a **remembered-locations store** in the state root. Everything else extends what is there.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Identity of a repository | Its address path, lower-cased. Two names reach one repository when their address paths are equal, or a folder name's checkout has that address path | AC-NAME-02; the address path is already recorded per repository as `github`, so underway PRDs need nothing added |
| What `name` means for a repository named by address path | Its short name, or the whole-path form when the short name is taken ([Worktree folders and labels](#worktree-folders-and-labels-ac-folder-01-ac-folder-02)). Still the record key and the worktree folder | Every per-repository fact in the record is keyed by `name`; keeping one string means no record on disk is re-keyed |
| The whole-path form | The address path's parts joined by `+`: `acme-labs+admin` | Kiln sets up only GitHub repositories, whose path parts hold letters, digits, `-`, `_` and `.` alone, so no two address paths give the same form. `+` is a legal folder character on macOS, Linux and Windows and needs no quoting in a shell |
| The PRD's repository's name | Its main checkout's folder name, as today, including when another repository shares its short name | That name keys Kiln's state directory and the one-repository layout. It is always set up first, so the other repository takes the whole-path form |
| How far the search goes | From the PRD's repository's parent folder and every folder above it up to the home folder, four levels down from each ([The search](#the-search-ac-find-01-ac-find-02-ac-find-05)) | Four levels below the home folder reaches a folder per host and then per organization, the deepest layout AC-FIND-01's table lists; searching from each folder above the PRD's repository reaches deeper trees it is already in |
| How a checkout's `origin` is read | By Git (`git remote get-url origin`), never by reading its configuration file | Git applies the person's URL rewrites and included configuration; the check an answer gets (AC-ASK-03) must read the same value |
| Where remembered answers live | `<state root>/repository-locations/`, one file per repository | AC-ASK-04: outside every repository and every PRD's record. One file each means two Kilns answering about different repositories never overwrite each other, with no lock |
| Which hosts an answer is kept for | GitHub only, keyed by address path | An accepted answer must be deliverable (AC-ASK-03), and Kiln delivers only to GitHub, so the path alone tells answers apart |
| Where the question's state lives before Start | In the running Kiln's memory, rebuilt by each `kiln run` | Like every other choice on Documents found, nothing is recorded for a PRD that hasn't started except the settings; the answer itself is in the store |
| The command that answers a stop | `kiln locate-repository`, a new action in the control journal | AC-ASK-06; every control at a stop is a journaled command with a receipt |
| Record schema | 25. No stored field changes meaning | The record gains fields an older Kiln doesn't know (`shortName`, `repositoryRequests`, a stop's and a billing hold's `locate`) entries named by the whole-path form, and a skipped phase's `scopeRepositories` key that is an address path, which it would drop or misread on its next write; the schema rule makes it refuse the record instead |

## Names (AC-NAME-01, AC-NAME-02)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Named in the phase documents (what a name on the line can be)

The line, where it sits, how it is split and which documents are read are unchanged. Each item is read as the first row that fits:

| The item | Read as | Plan problem |
|---|---|---|
| Holds `://`, or `@` before a `:` | A full remote address | `<phase file> names <item>, a full remote address. Name the repository by the path in it, <address path>.` |
| Starts with `/`, `~` or `.`, or with one letter and a `:`, or holds a `\` | A path on one computer | `<phase file> names <item>, a path on one computer. Name the repository by the path in its remote address, <owner>/<repository>.` |
| `<host>:<path>`, the host two or more characters with no `/` | That address path, when the host is `github.com` in any case | Any other host: `<phase file> names <item>. Kiln delivers only to GitHub, so it can’t deliver a repository on <host>.` |
| Two or more parts joined by `/` | That address path, on any host | An empty part is a plan problem, in today's empty-name words |
| One part | A folder name, as today | Today's |

The path-on-one-computer problem gives the form `<owner>/<repository>`, not an example, so the plan reader stays a reading of the documents alone and the problem never offers some other repository's path as the name to use. Kiln delivers only to GitHub, whose address paths always have two parts, so the form fits every name Kiln delivers. Each plan entry keeps the names as written.

**Which repository a name reaches.** In this order, before Start and after it:

1. The PRD's repository: its folder name, compared exactly as today, or its address path.
2. A repository in the PRD's record, set up or with its setup unfinished: a folder name whose folder beside the PRD's repository is that entry's own checkout, or an address path equal to the entry's. Its checkout is the entry's, never searched for again, so an interrupted addition finishes in the checkout it started in.
3. A folder name no entry's checkout answers to gets today's four checks beside the PRD's repository, which read its address path. When that address path is a set-up entry's, the name means that repository, whose checkout stays as set up.
4. Otherwise a repository not yet set up. An address path that a folder name of the plan already reaches is that repository, and its folder is the checkout; Kiln doesn't search for it. Two folder names with one address path are one repository, and the first in plan order is its checkout.
5. An address path nothing above reaches is found as [Finding a checkout](#finding-a-checkout-ac-find-01-to-ac-find-04) gives.

The named repositories keep first-mention plan order, each counted once.

A name with `github.com:` in front reaches the same address path as the path alone and is found the same way, since only a checkout on GitHub can be used either way. The host narrows nothing.

**Where names are compared.** A name as written is never compared with an entry's `name`, a base's key or another plan's name. Each reader reaches the repository first, as above, and works with its `name`: the start checks and additions, the completed-phase scope a receipt records (`scopeRepositories`) and the scope comparison between two readings of a plan, a continuation's readiness check, the Folder missing page's setup panel, and the repositories that external completion evidence names. So a phase document re-spelled from `admin` to `acme-labs/admin` keeps a completed phase's scope unchanged, and a receipt's scope and its per-repository revisions share one key. Only the recorded plan's per-phase `repositories` keep the names as written.

A phase skipped on Mark complete at a stop that asks records, for a repository with no entry, its address path lower-cased; a folder name that reached nothing keeps its spelling, as today. An entry's name never holds a `/`, so a recorded key with a `/` is an address path. A reader that compares a recorded key with a repository counts it as that repository when the key is the repository's name or its address path: the scope comparison, a continuation's readiness check and the external completion evidence. Readiness otherwise treats the repository as any other in a skipped phase's scope: with no revisions, the phase needs a valid preparation binding for it, and a repository the preparation reads that still asks is a problem, as [A continuation and a base-branch start](#a-continuation-and-a-base-branch-start) gives. A folder name that reached nothing has no address path to match, so the plan must keep that name: re-spelled, the phase's completed scope reads as changed.

## Finding a Checkout (AC-FIND-01 to AC-FIND-04)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Found beside the PRD's repository (where a repository named by its address path is looked for, and what happens when it isn't found)

A repository named by folder name is found, checked and reported exactly as before. For an address path:

1. **A remembered answer.** When the store holds one, Kiln runs the checks an answer gets ([The answer](#the-answer-ac-ask-03-ac-ask-04-ac-ask-05)). A pass uses that folder. A failed check deletes the answer and carries on. The terminal prints `<time>  Kiln no longer remembers <address path> at <folder>. <the failed check’s message>` once, since the answer is gone. Documents found and the stop show nothing new. A check Kiln couldn't run (Git failing for another reason, or timing out) deletes nothing and is reported as today's unreadable checkout is: a start problem before Start, a refusal to the session or a stop's fact after it.
2. **The search.** Kiln looks the address path up among the checkouts the search listed.
3. **The result.** Exactly one checkout, and its `origin` is on GitHub by today's check: Kiln uses it. Anything else is a question:

| Found | The question | Lists |
|---|---|---|
| No checkout | `Kiln couldn’t find a checkout of <address path>.` Where is it on this computer? | Nothing |
| One or more, none on GitHub | `Kiln couldn’t find a checkout of <address path> that it can deliver to.` Where is it on this computer? | Each checkout found, not pickable |
| More than one, at least one on GitHub | `Kiln found <n> checkouts of <address path>. Which should it use?` | Every checkout found, those not on GitHub not pickable, and "Another folder" |

A count in a sentence the page writes is a word up to ten ("Kiln found two checkouts"), as the view's existing count words give; every count the server writes, on the page or in the terminal, is digits ("1 repository to locate"). So one page can show both, as mockup state 3 draws "Kiln found two checkouts" beside "1 repository to locate"; that is intended.

The first two say where Kiln searched. A question never fails the start checks. The search runs only when some name needs step 2, once for all of them, and again each time the names are resolved: when `kiln run` starts, every time a view connects before Start, at Start, at each addition after Start and whenever a stop that asks is made or checked, as [The stops that ask](#the-stops-that-ask) gives.

### The search (AC-FIND-01, AC-FIND-02, AC-FIND-05)

**Where it starts.** The search roots are the real parent folder of the PRD's main checkout and each folder above it, up to and including the home folder. When the PRD's repository is not under the home folder, the roots are that parent folder and the two folders above it, stopping below the top of a disk: the file system's root, a drive's root, or a folder on a different device from its parent.

**How far.** From each root, at most four levels down, the root's own entries being level one. Every root is covered in full every time, so a checkout beside the PRD's repository never hides one farther out (ASK-004).

**What it passes over while going down.** A root is never passed over, even when it is itself a checkout, since Kiln is already reading inside it: the PRD's repository can sit in a parent folder kept as a checkout, and a home folder kept as a checkout would otherwise hide everything in it. The `.git` rule below covers the folders the search meets going down. A root that holds a `.git` entry is a candidate when the root above it lists it, as any folder is; the topmost root is never a candidate. The PRD's repository is a candidate like any other, and [Names](#names-ac-name-01-ac-name-02) step 1 reaches it before any search result. A walk from an outer root lists the root inside it, so that root can be a candidate, but never enters it: the inner root's own walk already reaches everything below it that the outer walk would, and more deeply. The walks then never meet the same folder, in whatever order they run.

- An entry that is a link, on Windows a junction too.
- A folder whose name starts with `.`.
- A folder on a different device from its parent, which covers removable and network volumes and backup disks.
- A folder the operating system guards, in the table below.
- A folder Kiln can't list.
- A folder holding a `.git` entry is never entered. A `.git` folder makes it a candidate. A `.git` file whose `gitdir:` line points into a `worktrees` folder (`<…>/worktrees/<name>`) is a worktree and is passed over without running Git. Any other `.git` file, such as a clone made with `--separate-git-dir`, makes it a candidate. The search never reaches a submodule, which sits inside its parent's checkout. A bare repository has no `.git` entry and is never a candidate.

**Guarded folders (PRD, Depends On).** Named directly in the home folder, compared without case:

| System | Passed over | Why |
|---|---|---|
| macOS | `Desktop`, `Documents`, `Downloads` | The system asks before a program lists or reads each; listing the folder alone asks. With iCloud's Desktop and Documents turned on they keep these names |
| macOS | `Library` | Holds iCloud Drive and other cloud storage, each asking; other applications' containers, which ask for data from other apps; and Mail, Messages and Safari data, refused without Full Disk Access |
| macOS | `Pictures`, `Music`, `Movies` | Hold the Photos, Music and TV libraries; the Photos library is guarded, and the other two are passed over with it |
| Windows | `AppData` | No prompt: Windows asks nothing when a desktop program reads a profile folder. Passed over as `Library`'s counterpart. Controlled Folder Access stops changes, not reads; OneDrive's backup of Desktop, Documents and Pictures moves them under OneDrive, which asks nothing |
| Linux | None | No prompt exists for a program run from a terminal. A sandboxed terminal gets a refusal, not a question, which "a folder Kiln can't list" covers |

Other rules keep the search away from guarded places too. The `.` rule passes over the Trash, which is refused without Full Disk Access. The link rule passes over a cloud folder's shortcut in the home folder, since the cloud files themselves live under `Library`. The device rule passes over removable and network volumes and backup disks, each guarded. `Public`, `Applications` and `Sites` are not guarded. For a program run from a terminal, or from a terminal inside an editor, macOS asks on behalf of the terminal or the editor.

The macOS rows are confirmed by one walk under these rules on macOS 26 (three roots, about 2,100 folders, under half a second) with the system log's privacy subsystem read afterwards: it logged no request. The log records a request even when an earlier grant hides the prompt, so the check needs no permission reset. Beyond that walk the rows rest on Apple's privacy documentation and published accounts of it, read 2026-11-22. Untried: macOS 15, and a cloud folder kept as a real folder in the home folder rather than a link. [Testing Approach](#testing-approach) gives the check the build makes. A PRD whose repository is itself inside a guarded folder (`~/Documents/GitHub/product`) still has that folder searched, as a root.

**Reading candidates.** Each candidate is confirmed as its repository's own checkout by one Git read, `git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir --show-superproject-working-tree`: Git's top level is the folder itself, its Git directory is its common directory, and it has no superproject. That read replaces today's `--show-toplevel` read in the same spawn, so the cost per candidate doesn't change. The superproject check also catches an older-style submodule that holds a real `.git` folder. Its `origin` is read by Git, at most eight candidates at a time, each under the helper timeout. A candidate with no `origin` is left out. One Git can't read for another reason, or that times out, is left out too, and the terminal prints `<time>  Kiln couldn’t read <folder> while searching for checkouts (<Git’s error>).`, at most once per `kiln run` for the same folder and error, however many searches meet it, so a checkout missed that way is never missed silently. A timeout is Git's error here (`timed out after 120 seconds`). From each `origin` Kiln takes the host and the address path: the part after the host, without a leading `/`, a trailing `/` or a trailing `.git`, for the URL forms and the `host:path` form alike. An `origin` that is a path on the computer has no address path.

No count or time limit is set beyond these. A count-only walk of one home folder under these rules read 244 folders in 0.08 seconds.

**What the question says it searched.** `It searched outward from <the PRD's repository's parent folder>/, never above your home folder.` Outside the home folder the second clause reads `as far as <the topmost root>/.`

## Asking Before Start (AC-ASK-01, AC-ASK-02, AC-SEE-01, AC-SEE-02)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Settings before Start (a repository's row can ask, and shows its address path and checkout); §Command line (the summary line)

The start checks return, for each named repository, either its checkout or its question. When any other check fails, Kiln reports those failures as today, in the terminal or, after a reset, on Documents found, and says nothing about questions. Otherwise Kiln opens Documents found.

- **The status line** under the title, while any row asks, reads "Tell Kiln where one repository is, then review and start." (state 2), "Tell Kiln which checkout to use, then review and start." (state 3), or with several, "Tell Kiln where <n> repositories are, then review and start."
- **Each row** shows the repository's label, its address path as its `origin` spells it and its own checkout's folder, as mockup state 1 draws. A row that asks shows the address path as the plan writes it, no folder and no base, and the question under it (states 2 and 3). A row whose checkout came from a remembered answer says so and offers **Change** (state 4).
- **The passed checks** read "Repositories found on this computer", or, while any row asks, the unpassed "<n> repository to locate" ("<n> repositories to locate").
- **Start** is refused while any row asks. Its reason names the repository: "Tell Kiln where <address path> is to start.", "Tell Kiln which checkout of <address path> to use to start.", or with several, "Tell Kiln where <n> repositories are to start."
- **The terminal's summary** ends "<n> repository to locate" in place of "all checks passed". The line under it reads "Tell Kiln where <address path> is there, then review it and press Start.", or with several, "Tell Kiln where <n> repositories are there, then review it and press Start."
- **A repository's base** is chosen once its row has a checkout. Its default is filled then, by the rule every named repository's is.

The plan a chosen existing branch gives (Kiln run restart, Starting From a Branch) is resolved the same way.

### The answer (AC-ASK-03, AC-ASK-04, AC-ASK-05)

An answer is a folder: typed, or the folder of a listed checkout. Either gets these checks in order, and the first failure is the field's message, in the mockup's words:

| Check | Message |
|---|---|
| A full path | `Enter a full path, starting with / or ~.` |
| Exists | `That folder doesn’t exist.` |
| Not a link | `That folder is a link to <target>. Give the checkout itself.` |
| A repository's own checkout | `That folder isn’t a Git checkout.` (a bare repository included); `That folder is inside the checkout <top level>. Give the checkout itself.`; `That folder is a worktree of <main checkout>. Give the checkout itself.`; `That folder is a submodule of <its parent's checkout>. Give a checkout of its own.` |
| Its `origin` has the named path | `That checkout’s origin is <its address path>, not <named path>.`; `That checkout has no origin remote.` |
| On GitHub | `That checkout’s origin, <url>, isn’t on GitHub. Kiln delivers only to GitHub.` |

A folder with no `.git` entry, a bare repository included, is not a checkout, and that is told before Git runs. Otherwise the search's Git read ([The search](#the-search-ac-find-01-ac-find-02-ac-find-05)) decides, and the first mismatch gives the message:

- Git's top level is another folder: `That folder is inside the checkout <top level>…`
- Its Git directory differs from its common directory: `That folder is a worktree of <main checkout>…`. The main checkout is the common directory's parent when the common directory is a `.git` folder, and the common directory itself otherwise.
- It has a superproject: `That folder is a submodule of <its parent's checkout>…`

On a pass Kiln writes the answer to the store, resolves the row again, prints `<time>  Located <address path> at <folder>. Kiln will remember that on this computer.` and sends a snapshot. On a failure nothing is written.

Another running Kiln reads the answer only the next time it looks for its repositories, so a Documents found page already open in it keeps asking until it is reloaded. If the person answers there too, that answer replaces the one remembered.

**Change** asks again without forgetting. Change shows the question the search's result gives, as if nothing were remembered, except that one checkout found on GitHub is asked about too, as `Kiln found one checkout of <address path>. Which should it use?` `<n>` counts only the checkouts the search found. The remembered folder is listed even when the search didn't reach it, marked `You told Kiln where this is` in the not-pickable note's type, and stays pickable. When the search finds nothing, Change shows the "Where is it on this computer?" question with the remembered folder already in the field, as mockup state 2 draws it. The remembered answer stands until another is accepted. Picking the remembered folder, or submitting it unchanged in the field, accepts it again like any answer: the checks run, `answeredAt` is rewritten and the Located line prints. That is how to keep it, and there is no Cancel: a view connecting resolves the names again from the store, so a reload also returns the row to its remembered answer. A folder the search also found is listed once, with the mark. Once Kiln has set a repository up for a PRD, its entry holds its checkout and that PRD never reads the store for it again, so a later Change reaches only repositories set up after it.

## After Start (AC-ASK-07, AC-ASK-06, AC-SESSION-01)

### A session's request

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The command (the name it takes, its output); §In the engine (check 1); §Sessions (the prompts' sentence on asking for a repository, and the workspace prompt's list)

`kiln add-repository <repository>` takes every form a `**Repositories:**` line does. A form that is a plan problem on the line is refused with the same words, without the phase file. The first check becomes: reach the repository as [Names](#names-ac-name-01-ac-name-02) gives, then find its checkout. The other checks, the setup and the answers are unchanged, and the command prints the repository's label.

When finding ends in a question, Kiln adds nothing and answers the session:

- `Kiln couldn’t find a checkout of <address path>. It searched outward from <folder>/, never above your home folder. Nothing was added.`
- `Kiln couldn’t find a checkout of <address path> that it can deliver to. It found <folder> (<remote address>), which isn’t on GitHub. Nothing was added.`
- `Kiln found <n> checkouts of <address path> and needs a person to say which to use: <folders>. Nothing was added.`

It records the request on the session's phase (`repositoryRequests`), once per address path. The phase doesn't stop.

When the phase is already stopped at Needs you, whether the request comes from its conversation reopened in a terminal or from a person, the open stop gains the question at once, from the search the request just made. Kiln saves it, so the page and `kiln status` show it, and the status token changes. The answer to the command ends “Nothing was added.” followed by “The stop in Kiln now asks where it is.” for a "where" question, or “The stop in Kiln now asks which checkout to use.” for a "which" question.

The phase prompts tell a session to ask by address path: `kiln add-repository <owner>/<repository>, the path in the repository's remote address`. The workspace prompt lists each repository by label and address path with its worktree, and its example of an own checkout is a listed repository's real checkout folder. Every other prompt that tells a session how to ask for a repository gives the same form.

### The stops that ask

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Named after Start (what the stop shows and takes when finding ends in a question)
Replaces in part: `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-technical-design.md`, §Holds and recovery and §Persistent Data and Upgrade (a billing hold saves and shows the questions of a phase it holds)

| Stop | What it gains |
|---|---|
| The plan stop before a phase whose named repository ends in a question | Its Phase plan reads fact reads `<phase file> names <address path>, and Kiln couldn’t find a checkout of it` (`…and Kiln couldn’t find a checkout of it that it can deliver to`, `…and Kiln found <n> checkouts of it`). The page shows the question as mockup state 8 draws. An accepted answer is stored, then the stop is checked as Check again checks it, which adds the repository, and starts the phase once nothing else holds the stop. Check again with no answer searches again |
| Any Needs you stop of a phase holding a recorded request | The same question, below the stop's first card and above the ways to resolve it, once per request that still ends in a question when Kiln makes the stop or checks it, or that is made while it is open. An accepted answer is stored and the request dropped. Nothing else about the stop changes, and none of its controls waits on the question |

Before a phase starts, Kiln adds the repositories it names in plan order. A repository that ends in a question doesn't end the additions: Kiln keeps the question for the stop and goes on to the next repository, so the stop asks every question at once. A failed check still ends the additions, as today. Repositories added before the stop stay set up, whatever happens to the phase. The stop's Phase plan reads facts are the question facts and any failure fact, in plan order, and a waiver matches them as it matches any plan problem.

A stop saves its questions as it saves its check rows. Kiln searches when it makes the stop, at each Check again, when an answer is accepted, and when a session asks for a repository while the stop is open. A stop doesn't wait for that search: it appears and prints its line at once, and the questions from its phase's recorded requests are added when the search finishes, as a question asked while the stop is open is added, so the status token changes then. The plan stop's questions come from the additions' own search, which ends before the stop is made. The page, `kiln status` and a restarted `kiln run` show the saved questions and never search to show them. A question opening or closing changes the control revision, so the status token changes.

A billing hold is a Needs you stop of its phase. With a retained stop, it shows that stop's saved questions. Without one, it saves its questions on `billing.hold.locate`, as it saves its rows on `billing.hold.checks`, and searches when the hold is made and at each Check again. The hold's phase is the stopped phase, so `locate-repository` is accepted there.

A request that now resolves without a question is dropped without a word. The answer's checks, messages and terminal line are those before Start.

The resumed session isn't told either. It resumes its own conversation, which holds Kiln's refusal, and its prompt tells it how to ask, so a request it makes again finds the remembered answer. The stop tells the person "The session can ask for it again once the phase resumes."; a reply they send with Resume reaches the session first.

### The command

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (adds `locate-repository`)

```
kiln locate-repository <PRD-path> <address path> <folder> --only-if-status-matches <token> --command-id <id> [--json]
```

It follows the bot-control grammar, result object, exits and receipts. Picking a listed checkout is giving its folder.

- **Eligibility.** Accepted only while a stop open on a running Kiln asks about that repository. Before Start it is refused with `<feature> hasn’t started. Tell Kiln where <address path> is on Documents found, in the browser.` With no such stop: `No stop is asking where <address path> is.`
- **Canonical input.** The address path, lower-cased, and the folder as given.
- **Outcomes.** `located` (stored; the stop stays); `located_phase_starting` (stored, the plan stop's check passed, the phase is starting); `located_still_stopped` (stored, and the plan stop's check still fails, with its facts); `folder_not_accepted` (refused, with the failed check's message; nothing stored). The receipt's plan effect is `advanced` only for `located_phase_starting`; its session effect is always `not_started`.
- **`kiln status`.** A stop that asks lists each repository's question and the command, as [`kiln status --json`](#kiln-status---json) gives.

  **The text form.** Only a stop that asks gains lines; every other line stays as it is today, state words included. Under the stopped row, at the indent today's waiver lines use, each question prints its sentences, the first starting `Phase plan reads: ` on the plan stop, as state 7 draws, or `A session asked for <label>: ` on any other stop. When Kiln found checkouts, one line per checkout follows, indented two more spaces: `<folder>  <remote>`, ending `  (not on GitHub)` when it can't be picked. Then one line: `Controls: locate-repository (available)`, or the refusal's reason in place of `available`; when the stop offers Mark complete, the line goes on with ` · waive-and-advance (once a recheck still fails)`.

  ```
  Phase 4   Restock check-in     needs you
            Phase plan reads: Kiln couldn’t find a checkout of acme-labs/inventory.
            It searched outward from ~/code/acme/, never above your home folder.
            Controls: locate-repository (available) · waive-and-advance (once a recheck still fails)
  ```
- **The status token** changes when a question opens or closes, so an answer aimed at a stop that no longer asks is refused as stale.

The page's **Use this folder** and **Use this checkout** at a stop submit the same action through the journal with the page's command id.

### A continuation and a base-branch start

Replaces in part: `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-technical-design.md`, §Readiness and Planned Preparation (the repositories a ready proposal binds, when one named by address path ends in a question)
Replaces in part: `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-technical-design.md`, §The Setup Panel ("Repositories for a base-branch start", when one named by address path ends in a question)

A continuation and a base-branch start on the Folder missing page each set up a fresh execution for a PRD that has started, so neither asks where a repository is (AC-ASK-07). Each reaches the plan's names as [Names](#names-ac-name-01-ac-name-02) gives. A repository named by its address path whose finding ends in a question is not set up there, is not listed, and is not a problem. Kiln adds it before the phase that names it, as it adds any repository a phase names that the workspace doesn't have, and the stop before that phase asks if finding still ends in a question. An answer remembered on this computer by then is used without a stop.

The exception is a repository the continuation's preparation reads (Kiln Continue Added Phases, AC-CONTINUE-07), since preparation is checked before Continue. It stays a problem: the question's first sentence, then what clears it on Check again, which is a checkout where the search reaches, only one checkout of it there, or an origin on GitHub. The same holds for a repository that a phase completed outside Kiln names, when the continuation checks its external completion evidence: its revision can't be verified without a checkout, so it stays a problem on that phase, `Phase <id>: ` then the question's first sentence and what clears it on Check again. A repository already in the PRD's record never asks, and an answer remembered on this computer is used. A repository named by folder name that isn't found beside the PRD's repository stays a problem on both pages, as today (AC-FIND-04).

## Worktree Folders and Labels (AC-FOLDER-01, AC-FOLDER-02)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Design Decisions ("How a repository is identified"; "Workspace folder", the worktree's folder name)

A repository's **short name** is its folder name when the plan reaches it by folder name, or it is the PRD's repository; otherwise the last part of its address path. Short names are compared without case, since two folders that differ only in case can't share a workspace on macOS or Windows. A PRD's repository in folder `shop` whose address path is `acme/storefront` has the short name `shop`, so `other/storefront` beside it keeps `storefront`; `other/shop` instead takes `other+shop`, and the two are labelled `acme/storefront` and `other/shop`.

**The name, given once.** When an entry is first written, at Start for the whole list or at an addition for one:

- The short name, when no entry already written has that short name or that name, and no other repository in the same Start has that short name.
- Otherwise the whole-path form. In one Start, every repository sharing the short name takes it, except the PRD's repository.
- A whole-path form that an entry already has as its name refuses the Start or the addition, in one line naming both repositories.

The worktree is `<workspace folder>/<name>`, as today, and neither changes afterwards. Before Start the names are worked out from the plan as it stands, so the bases chosen on Documents found, kept by name, are dropped for a repository whose name a plan edit changes; its row then shows the default base.

**The label, worked out each time.** A repository's label is its short name while no other of the PRD's repositories has that short name, and its address path while one does. The PRD's repositories, for a label, are every entry plus every repository the plan as it stands names, each counted once, including a named repository whose finding ends in a question, whose short name comes from the plan's name for it. A session's request that Kiln didn't add is not among them. Its label follows the same rule against them: the label of the repository it asks for when that is one of them, otherwise its address path when its short name matches one of theirs, otherwise its short name. It changes no other repository's label. Before Start the plan alone gives them. Names are still given only to entries. Every screen, terminal line, `kiln status` line and prompt shows the label; the plan's rows show each phase's repositories by label. Keys in the record stay names, and no request body carries a label: `bases` in `/api/settings` stays keyed by Kiln's name for a repository, `name` in `/api/repositories` takes a name as the line writes it, and the two location routes take the address path, as `locate-repository` does. `kiln status --json` keeps names in its existing fields and carries labels beside them.

## Interfaces

### HTTP

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §HTTP API

| Method and path | Change |
|---|---|
| `POST /api/repository-location` | New. `{ repository, folder }` → `200 { repository, folder, outcome? }`; `422 { reason }` for a failed check; `409 { reason }` when no row or stop asks about it. Before Start it is a setup request, as `/api/settings` is. At a stop it is the `locate-repository` action, with the status header and a command id |
| `POST /api/repository-location/change` | New, before Start only. `{ repository }` puts a remembered row back to asking; `409` otherwise |
| `POST /api/repositories` | `name` takes every name form. `200` gains `label`. `422 { reason }` carries the session's sentence when finding ends in a question |
| `POST /api/settings` | Unchanged. `bases` stays keyed by name |

In both location routes, `repository` is the question's address path (`Question.repository`), which Kiln lower-cases to match the question, so the plan's spelling and any other spelling reach the same row or stop.

Every new route carries the Host, Origin and token checks.

### Snapshot

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Snapshot

```
Snapshot (changed and added fields only):
  repositories[]: { …, label, addressPath, checkoutFolder?, located?: beside | search | answer,
                    question?: Question }
       (checkoutFolder, located: absent while the row asks; located: before Start only)
  Question: { kind: where | which, repository, label, searchedFrom, searchedTo?,
              checkouts: [ { folder, remote, pickable, remembered? } ], fieldError? }
       (repository: the address path, as the plan or the session's request writes it)
  documents.plan.phases[]: { …, repositories: [ label ] }
  documents.checks: "Repositories found on this computer" passed, or "<n> repository to locate" not passed,
                    in place of "Named repositories found beside <PRD's repository>"
  settings: { …, startBlockedBy?: string }          (the reason under Start while a row asks)
  needsYou: { …, locate?: [ Question ] }
  PhaseView.details.repositories[], current.repositories[], needsYou.repositories[], pullRequests[]: add label
```

The view draws all of it from the snapshot and decides nothing.

### Command line

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Command line

- `kiln run`: the summary and the line under it as [Asking Before Start](#asking-before-start-ac-ask-01-ac-ask-02-ac-see-01-ac-see-02) gives; the `Located` line; the line for a candidate Git couldn't read, as [The search](#the-search-ac-find-01-ac-find-02-ac-find-05) gives; the lines for a forgotten answer; the new plan problems; repositories shown by label in every line.
- `kiln add-repository <repository>`: as above. Its usage text and help entry name the address path.
- `kiln locate-repository`: as above, listed with the routine controls in help and in the command contracts.
- `kiln status`: a stop's questions and the command, as [`kiln status --json`](#kiln-status---json) gives.

### `kiln status --json`

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Status, Conversations and Handoff (labels beside names, a stop's questions, the `locate-repository` control); §Version compatibility (the feature `locate_repository`, `protocol_minor` 3)

It keeps `schema_version: "1"`. Every change is a new optional field, which compatible readers already tolerate, and no existing field changes meaning: wherever a repository appears today, it stays its name. The client prints the text form from the same result, so the labels travel in the JSON.

- `repositories`: unchanged, an array of names.
- `repository_details`: new, one `{ name, label, address_path }` per entry of `repositories`, in the same order. The text form shows labels through it.
- A folder check's `repositories[]`: gain `label` and `address_path` beside `name`.
- `delivered.pullRequests[]`: `repository` stays the name and gains `label`. `completion.pull_requests`, `merged_branches` and a waived item's `subject` stay names.
- `stop.locate[]`: projected, never the snapshot's field passed through: `kind` (`where` | `which`), `address_path`, `label`, `searched_from`, `searched_to` (null when the search reached the home folder), `checkouts[]` of `{ folder, remote, pickable, remembered }` with a `next_argv` on each pickable one, and `available`, `reason`, `next_argv`, `next_command`, where `next_argv` is `["kiln","locate-repository",<PRD>,<address path>,"<folder>","--only-if-status-matches",<token>,"--command-id","<new-command-id>"]`.
- `controls[]` gains a `locate-repository` entry; the capabilities handshake adds the feature `locate_repository` and `protocol_minor` 3.

Fields the contract adds are snake_case. `locate-repository` takes the address path, never a name or a label.

## Data Models

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Data Models

```
PrdRecord (schema 25; fields not shown are unchanged):
  repositories[]: { …, shortName? }        (kept only when it differs from name: the whole-path form)
  plan[]: { …, repositories: [ name as written ] }
  phases.<id>: { …, repositoryRequests?: [ { addressPath, at } ] }
  phases.<id>.stop: { …, locate?: [ { kind, repository, searchedFrom, searchedTo?, checkouts[], phaseFile? } ] }
       (each question the stop asks, saved whole as §Snapshot's Question gives its fields; phaseFile on the
        plan stop's question. label is worked out each time it is shown and fieldError belongs to one answer,
        so neither is saved)
  billing.hold: { …, locate?: [ … ] }      (saved as phases.<id>.stop's locate is)

<state root>/repository-locations/<whole-path form, lower-cased>.json:
  { schemaVersion: 1, addressPath, folder, answeredAt }
```

- **Migration from schema 24:** none of content. Every existing entry was named by folder, so its `name` is its short name and its `github` is its address path.
- **The store.** `folder` is the checkout's real path; `answeredAt` is UTC. A file is written whole and renamed into place, as every state file is. A file Kiln can't parse is deleted, and the terminal prints `<time>  Kiln no longer remembers <address path>: it couldn’t read its record (<parse error>).` A file whose `schemaVersion` is newer was written by a newer Kiln and is left in place unused: Kiln searches, and once per `kiln run` the terminal prints `<time>  Kiln can’t use what a newer Kiln remembers about <address path>. Update Kiln to use it.` An answer accepted afterwards replaces it.
- **A skipped phase's scope.** A key in `scopeRepositories` is an entry's name or, for a repository with no entry, its address path lower-cased or a folder name that reached nothing, as [Names](#names-ac-name-01-ac-name-02) gives.
- **Not recorded:** how a set-up repository was found. Its entry holds the checkout, and "You told Kiln where this is" is shown only where Change can act, before Start.

## Screens (AC-SEE-03)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Screens (the repository rows, the stop for a repository Kiln can't add); §Design Decisions ("One-repository PRD", whose Needs you pages gain the question)
Replaces in part: `docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md`, §A Stopped Phase's Facts (a stopped phase's page gains the question below its first card)
Replaces in part: `docs/changes/kiln-completion-waivers/kiln-completion-waivers-technical-design.md`, §Display Contract (the hand-back page and the standard Needs you page gain the question below their first card)

The drawn states are built from the mockup's HTML, field messages and comments included. The screens the mockup doesn't draw:

- **The settings while Kiln works:** each row as Documents found's found row, with label, address path and checkout folder, every field fixed, no remark and no Change.
- **Any other Needs you stop that asks, a billing hold's page included:** the drawn stop's question block, from its first sentence to "Kiln remembers this on this computer only. Nothing is written to any repository.", below the stop's first card and above the ways to resolve the stop, where the catch-up offer sits (Kiln run restart, §Catching a Branch Up). The sentence about adding the repository and starting the phase is left out; in its place: "The session can ask for it again once the phase resumes."
- **The plan stop with several questions, or with a failure fact beside its question:** one question block per question, in plan order, each naming its own repository, with its own field and button. With more than one question, the line under the heading reads "Phase <n> names repositories Kiln couldn’t add to the workspace." in place of the drawn line, which names one. The drawn paragraph after the block, "Kiln then adds it to the workspace and starts phase <n>. Or clone it where the search reaches, and press Check again.", appears only when the stop holds one question and no other fact. Otherwise the paragraph after the last block reads "Or clone them where the search reaches, and press Check again. Phase <n> starts once nothing else holds this stop.", with "it" for "them" when one question sits beside a failure fact.

A short-name clash isn't drawn. Its rows follow state 1 with the address path as the label.

## The Enso Method's `phase-split` (AC-SPLIT-01, AC-SPLIT-02)

The skill's rule for the `**Repositories:**` line, its phase document templates and its example change together:

- **The rule.** Each repository is named by its address path, the PRD's repository included when the phase changes code in it, whether or not its checkout is beside the PRD's repository. Never a folder name, never a path on one computer. The rest of the rule stays: when the line is written, what a split record keeps, why tools read it.
- **Where the writer gets it.** From the repository's checkout: the path in `git remote get-url origin`, after the host and without `.git`. With no checkout at hand, from an address the PRD or the technical design writes out (a remote address, a GitHub link or `owner/repo`). A name worked out from a folder name or from the design's wording is never written as fact. When neither source gives the address, the writer puts its best-supported address on the line and records it in the PRD's assumptions register as a technical assumption: it names the phase, says no checkout or written address was available, and says reading the checkout's `origin` settles it. The split carries on without stopping. The skill adds no search of its own.
- **The host.** Written only when two of the PRD's repositories have one address path on different hosts, as `<host>:<path>`, with the host's real name. When a checkout's `origin` uses an SSH alias, the writer takes the real name from the SSH configuration (`ssh -G <alias>`).
- **The templates and example** show `acme/returns-api, acme-labs/storefront` in place of folder names.

The skill gains no mention of Kiln, and the rule helps a person running a phase by hand: the line says which repository is meant on any computer.

## Integration Points

- **Git:** `rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir --show-superproject-working-tree` and `remote get-url origin` in each candidate and in a folder given as an answer. Both are reads, and `worktree add` stays the only change Kiln makes.
- **The file system:** folder listings within the search's reach; the store under the state root.
- **GitHub:** unchanged.
- **The Enso Method:** the line `phase-split` writes.

## Testing Approach

As the designs before it: real temporary Git repositories with local bare repositories as `origin`, a temporary home folder, and the stand-in session.

- **Names:** each row of the table, both spellings of one address path, a folder name and an address path for one repository, two folder names for one repository, a name reaching the PRD's repository; a completed phase's document re-spelled from folder name to address path keeping its scope; an interrupted addition finishing in its recorded checkout; a phase skipped at a stop that asks, its address path key matched once the repository is set up.
- **The search:** each layout in AC-FIND-01's table; a checkout at level four found and at level five not; a clone made with `--separate-git-dir` found; a worktree, a submodule, an older-style submodule holding a `.git` folder, a bare repository and a clone inside another checkout, each with a matching `origin`, not found; a link not followed; a hidden folder passed over; a candidate Git can't read left out, with its terminal line once per run; a rewritten `origin` URL matched; two checkouts, one beside, asked about; a parent folder that is itself a checkout still searched, and found as a candidate when the root above it lists it; a checkout under the PRD's parent folder reached to its full depth, and listed once.
- **No permission prompt (AC-FIND-05):** a temporary home holding every guarded folder name, each with a matching checkout: none is found, and the walk's record of folders listed holds nothing under them. On macOS, one run of the real search against the real home folder with the system log's privacy subsystem read a few seconds afterwards, once the log has flushed, showing no access request during the search from any folder-guarding service whose accessing process is the search's own. The write-up says whether the terminal holds Full Disk Access, since the check is proven with per-folder grants only. If that log can't be read, the write-up says the list's completeness rests on documentation.
- **Asking before Start:** each answer check's message; an accepted answer used by a second PRD without asking; a remembered folder that later fails, forgotten and searched for again; a store file that can't be parsed, deleted with its line; a newer one left in place with its line once per run; Change keeping an answer by picking the remembered folder, which rewrites `answeredAt`, and replacing it; Start refused while a row asks; another start check failing alongside a question.
- **After Start:** a session's request ending in each question; the request shown on that phase's next stop once its status token changes, below its first card, and dropped once answered; a session's request asked on a billing hold's page, with and without a retained stop, the hold's saved questions shown after a restart without searching and answered by `locate-repository`; a request made while its phase is stopped, shown on the open stop at once with a new status token, its reply ending in the "where" or "which" sentence; the plan stop's fact in each of its three forms; a phase naming two repositories that ask and one found: one stop with both questions, the found one added; the plan stop's answer adding the repository and starting the phase; a plan stop with two questions drawn as two blocks, with the multi-question paragraph, one answer giving `located_still_stopped` and the second `located_phase_starting`; a plan stop with one question beside a failure fact, its paragraph with "it"; Check again after a clone appears; a restarted `kiln run` showing a stop's saved questions without searching; `kiln locate-repository` at each eligibility and outcome, replayed by command id, and refused as stale; `kiln status --json` with a stop's `locate[]`, the `locate-repository` control and labels beside names, its existing fields unchanged; `kiln status`'s text form for the plan stop, matching mockup state 7, and for another stop with a session's request, its checkout lines and controls; a continuation and a base-branch start leaving out a repository that asks, then asked about at the stop before its phase; a repository the continuation's preparation reads staying a problem until Check again finds it; an outside-Kiln phase naming an address path that ends in a question blocks Continue until Check again finds it.
- **Folders and labels:** a clash at Start, a clash from a later addition, a clash with the PRD's repository, a clash with a later phase's repository not yet set up, and the label changing on earlier phases' rows; a session's request whose short name matches a PRD repository's, labelled by its address path while that repository's label stays; `bases` and `/api/repositories` still taking names while a label differs.
- **Underway PRDs:** a schema 24 record from each state reads as 25 and renders as before.
- **The view:** the eight drawn states rendered from fixture snapshots and compared, as earlier changes do.
- **`phase-split`:** a one-prompt run of the skill over a sample design that puts work in two repositories, read for the line's form.
- **Not tried on Windows:** the search's rules there (junctions, `AppData`, drive roots, device changes) are built from this design and unit tests over Windows-form paths.

## Delivery

- **After the build:**
  1. Merge Kiln's branch and release Kiln to npm, as a minor version, since it adds functionality.
  2. Only once that release is published, merge and publish the Enso Method's `phase-split` change. A Kiln from before this change reads an address path as a broken plan, and Kiln's own sessions split phases with the installed skill, so the order can't be reversed.
  3. Update the Enso Method plugin wherever it is installed from the published repository.

## Acceptance Criteria Coverage

| Criteria | Where |
|---|---|
| AC-NAME-01, AC-NAME-02 | Names |
| AC-FIND-01 to AC-FIND-05 | Finding a Checkout; The search |
| AC-ASK-01 to AC-ASK-05 | Asking Before Start; The answer; Data Models |
| AC-ASK-06, AC-ASK-07 | After Start; A continuation and a base-branch start; Interfaces; `kiln status --json` |
| AC-SESSION-01 | A session's request; HTTP |
| AC-FOLDER-01, AC-FOLDER-02 | Worktree Folders and Labels; Snapshot; `kiln status --json` |
| AC-SEE-01 to AC-SEE-03 | Asking Before Start; The stops that ask; Snapshot; Command line; Screens |
| AC-SPLIT-01, AC-SPLIT-02 | The Enso Method's `phase-split` |

## Open Questions

None.
