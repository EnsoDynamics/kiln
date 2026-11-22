# Technical Design: Kiln Find Repositories Anywhere

**PRD:** [Kiln Find Repositories Anywhere](kiln-find-repositories-anywhere-prd.md) · **Assumptions:** [assumptions](kiln-find-repositories-anywhere-assumptions.md) · **Screens:** [mockup](mockups/kiln-find-repositories-anywhere.html), the copy of record for the eight states drawn · **Changes:** [Kiln multi-repo delivery technical design](../kiln-multi-repo-delivery/technical-design.md) and [Kiln bot control technical design](../../prds/kiln-bot-control/kiln-bot-control-technical-design.md)

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
| Record schema | 25. No stored field changes meaning | The record gains fields an older Kiln doesn't know (`shortName`, `repositoryRequests`, a stop's `locate`) and entries named by the whole-path form, which it would drop or misread on its next write; the schema rule makes it refuse the record instead |

## Names (AC-NAME-01, AC-NAME-02)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Named in the phase documents (what a name on the line can be)

The line, where it sits, how it is split and which documents are read are unchanged. Each item is read as the first row that fits:

| The item | Read as | Plan problem |
|---|---|---|
| Holds `://`, or `@` before a `:` | A full remote address | `<phase file> names <item>, a full remote address. Name the repository by the path in it, <address path>.` |
| Starts with `/`, `~` or `.`, or with one letter and a `:`, or holds a `\` | A path on one computer | `<phase file> names <item>, a path on one computer. Name the repository by the path in its remote address, such as <the PRD's repository's address path>.` |
| `<host>:<path>`, the host two or more characters with no `/` | That address path, when the host is `github.com` in any case | Any other host: `<phase file> names <item>. Kiln delivers only to GitHub, so it can’t deliver a repository on <host>.` |
| Two or more parts joined by `/` | That address path, on any host | An empty part is a plan problem, in today's empty-name words |
| One part | A folder name, as today | Today's |

The example after "such as" is the PRD's repository's own address path: it is always known, it is a real example of the form, and it costs no read of a folder the document names. Each plan entry keeps the names as written.

**Which repository a name reaches.** In this order, before Start and after it:

1. The PRD's repository: its folder name, compared exactly as today, or its address path.
2. A repository in the PRD's record, set up or with its setup unfinished: a folder name whose folder beside the PRD's repository is that entry's own checkout, or an address path equal to the entry's. Its checkout is the entry's, never searched for again, so an interrupted addition finishes in the checkout it started in.
3. A folder name no entry's checkout answers to gets today's four checks beside the PRD's repository, which read its address path. When that address path is a set-up entry's, the name means that repository, whose checkout stays as set up.
4. Otherwise a repository not yet set up. An address path that a folder name of the plan already reaches is that repository, and its folder is the checkout; Kiln doesn't search for it. Two folder names with one address path are one repository, and the first in plan order is its checkout.
5. An address path nothing above reaches is found as [Finding a checkout](#finding-a-checkout-ac-find-01-to-ac-find-04) gives.

The named repositories keep first-mention plan order, each counted once.

**Where names are compared.** A name as written is never compared with an entry's `name`, a base's key or another plan's name. Each reader reaches the repository first, as above, and works with its `name`: the start checks and additions, the completed-phase scope a receipt records (`scopeRepositories`) and the scope comparison between two readings of a plan, a continuation's readiness check, the Folder missing page's setup panel, and the repositories that external completion evidence names. So a phase document re-spelled from `admin` to `acme-labs/admin` keeps a completed phase's scope unchanged, and a receipt's scope and its per-repository revisions share one key. Only the recorded plan's per-phase `repositories` keep the names as written.

## Finding a Checkout (AC-FIND-01 to AC-FIND-04)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Found beside the PRD's repository (where a repository named by its address path is looked for, and what happens when it isn't found)

A repository named by folder name is found, checked and reported exactly as before. For an address path:

1. **A remembered answer.** When the store holds one, Kiln runs the checks an answer gets ([The answer](#the-answer-ac-ask-03-ac-ask-04-ac-ask-05)). A pass uses that folder. A failed check deletes the answer and carries on. A check Kiln couldn't run (Git failing for another reason, or timing out) deletes nothing and is reported as today's unreadable checkout is: a start problem before Start, a refusal to the session or a stop's fact after it.
2. **The search.** Kiln looks the address path up among the checkouts the search listed.
3. **The result.** Exactly one checkout, and its `origin` is on GitHub by today's check: Kiln uses it. Anything else is a question:

| Found | The question | Lists |
|---|---|---|
| No checkout | `Kiln couldn’t find a checkout of <address path>.` Where is it on this computer? | Nothing |
| One or more, none on GitHub | `Kiln couldn’t find a checkout of <address path> that it can deliver to.` Where is it on this computer? | Each checkout found, not pickable |
| More than one, at least one on GitHub | `Kiln found <n> checkouts of <address path>. Which should it use?` | Every checkout found, those not on GitHub not pickable, and "Another folder" |

The first two say where Kiln searched. A question never fails the start checks. The search runs only when some name needs step 2, once for all of them, and again each time the names are resolved: when `kiln run` starts, when a view connects, at Start, at each addition after Start and at each check of a stop that asks.

### The search (AC-FIND-01, AC-FIND-02, AC-FIND-05)

**Where it starts.** The search roots are the real parent folder of the PRD's main checkout and each folder above it, up to and including the home folder. When the PRD's repository is not under the home folder, the roots are that parent folder and the two folders above it, stopping below the top of a disk: the file system's root, a drive's root, or a folder on a different device from its parent.

**How far.** From each root, at most four levels down, the root's own entries being level one. Every root is covered in full every time, so a checkout beside the PRD's repository never hides one farther out (ASK-004).

**What it passes over while going down.** A root is never passed over, since Kiln is already reading inside it.

- An entry that is a link, on Windows a junction too.
- A folder whose name starts with `.`.
- A folder on a different device from its parent, which covers removable and network volumes and backup disks.
- A folder the operating system guards, in the table below.
- A folder Kiln can't list.
- A folder holding a `.git` entry is never entered. When that entry is a folder, it is a candidate; when it is a file, it is a worktree or a submodule and is passed over. A bare repository has no `.git` entry and is never a candidate.

**Guarded folders (PRD, Depends On).** Named directly in the home folder, compared without case:

| System | Passed over | Why |
|---|---|---|
| macOS | `Desktop`, `Documents`, `Downloads` | The system asks before a program reads each |
| macOS | `Library` | Holds iCloud Drive, other cloud storage, other applications' data, Mail and Messages, each guarded |
| macOS | `Pictures`, `Music`, `Movies` | Hold the Photos, Music and TV libraries; the Photos library is guarded, and the other two are passed over with it |
| Windows | `AppData` | No prompt: Windows asks nothing when a desktop program reads a profile folder. Passed over as `Library`'s counterpart |
| Linux | None | No prompt exists for a program run from a terminal |

The macOS rows come from Apple's privacy documentation and published accounts of it, read 2026-11-22, not from a trial with permissions reset; [Testing Approach](#testing-approach) gives the check the build makes. A PRD whose repository is itself inside a guarded folder (`~/Documents/GitHub/product`) still has that folder searched, as a root.

**Reading candidates.** Each candidate is confirmed as its own checkout by today's check (Git's top level is the folder itself), and its `origin` is read by Git, at most eight at a time, each under the helper timeout. A candidate with no `origin` is left out. One Git can't read for another reason, or that times out, is left out too, and the terminal prints one line naming its folder and Git's error, so a checkout missed that way is never missed silently. From each `origin` Kiln takes the host and the address path: the part after the host, without a leading `/`, a trailing `/` or a trailing `.git`, for the URL forms and the `host:path` form alike. An `origin` that is a path on the computer has no address path.

No count or time limit is set beyond these. A count-only walk of one home folder under these rules read 244 folders in 0.08 seconds.

**What the question says it searched.** `It searched outward from <the PRD's repository's parent folder>/, never above your home folder.` Outside the home folder the second clause reads `as far as <the topmost root>/.`

## Asking Before Start (AC-ASK-01, AC-ASK-02, AC-SEE-01, AC-SEE-02)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Settings before Start (a repository's row can ask, and shows its address path and checkout); §Command line (the summary line)

The start checks return, for each named repository, either its checkout or its question. When any other check fails, the terminal reports those failures as today and says nothing about questions. Otherwise Kiln opens Documents found.

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

A repository's own checkout is told by its `.git` entry, as the search tells it, before Git runs: no `.git` entry (a bare repository included) is not a checkout, and a `.git` file is a worktree or a submodule. Today's check that Git's top level is the folder itself doesn't tell a worktree apart, since a worktree is its own top level.

On a pass Kiln writes the answer to the store, resolves the row again, prints `<time>  Located <address path> at <folder>. Kiln will remember that on this computer.` and sends a snapshot. On a failure nothing is written.

**Change** asks again without forgetting. The row runs the search and shows the "Which should it use?" question, listing the checkouts found and the remembered folder, so picking the remembered folder again keeps it. The remembered answer stands until another is accepted. Once Kiln has set a repository up for a PRD, its entry holds its checkout and that PRD never reads the store for it again, so a later Change reaches only repositories set up after it.

## After Start (AC-ASK-07, AC-ASK-06, AC-SESSION-01)

### A session's request

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §The command (the name it takes, its output); §In the engine (check 1); §Sessions (the prompts' sentence on asking for a repository, and the workspace prompt's list)

`kiln add-repository <repository>` takes every form a `**Repositories:**` line does. A form that is a plan problem on the line is refused with the same words, without the phase file. The first check becomes: reach the repository as [Names](#names-ac-name-01-ac-name-02) gives, then find its checkout. The other checks, the setup and the answers are unchanged, and the command prints the repository's label.

When finding ends in a question, Kiln adds nothing and answers the session:

- `Kiln couldn’t find a checkout of <address path>. It searched outward from <folder>/, never above your home folder. Nothing was added.`
- `Kiln couldn’t find a checkout of <address path> that it can deliver to. It found <folder> (<remote address>), which isn’t on GitHub. Nothing was added.`
- `Kiln found <n> checkouts of <address path> and needs a person to say which to use: <folders>. Nothing was added.`

It records the request on the session's phase (`repositoryRequests`), once per address path. The phase doesn't stop.

The phase prompts tell a session to ask by address path: `kiln add-repository <owner>/<repository>, the path in the repository's remote address`. The workspace prompt lists each repository by label and address path with its worktree, and its example of an own checkout is a listed repository's real checkout folder. Every other prompt that tells a session how to ask for a repository gives the same form.

### The stops that ask

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Named after Start (what the stop shows and takes when finding ends in a question)

| Stop | What it gains |
|---|---|
| The plan stop before a phase whose named repository ends in a question | Its Phase plan reads fact reads `<phase file> names <address path>, and Kiln couldn’t find a checkout of it` (`…and Kiln found <n> checkouts of it`). The page shows the question as mockup state 8 draws. An accepted answer is stored, then the stop is checked as Check again checks it, which adds the repository and starts the phase. Check again with no answer searches again |
| Any Needs you stop of a phase holding a recorded request | The same question, above what the stop already shows, once per request that still ends in a question when the stop is opened or checked. An accepted answer is stored and the request dropped. Nothing else about the stop changes, and none of its controls waits on the question |

A request that now resolves without a question is dropped without a word. The answer's checks, messages and terminal line are those before Start.

### The command

Replaces in part: `docs/prds/kiln-bot-control/kiln-bot-control-technical-design.md`, §Command grammar (adds `locate-repository`)

```
kiln locate-repository <PRD-path> <address path> <folder> --only-if-status-matches <token> --command-id <id> [--json]
```

It follows the bot-control grammar, result object, exits and receipts. Picking a listed checkout is giving its folder.

- **Eligibility.** Accepted only while a stop open on a running Kiln asks about that repository. Before Start it is refused with `<feature> hasn’t started. Tell Kiln where <address path> is on Documents found, in the browser.` With no such stop: `No stop is asking where <address path> is.`
- **Canonical input.** The address path, lower-cased, and the folder as given.
- **Outcomes.** `located` (stored; the stop stays); `located_phase_starting` (stored, the plan stop's check passed, the phase is starting); `located_still_stopped` (stored, and the plan stop's check still fails, with its facts); `folder_not_accepted` (refused, with the failed check's message; nothing stored). The receipt's plan effect is `advanced` only for `located_phase_starting`; its session effect is always `not_started`.
- **`kiln status`.** A stop that asks lists, per repository, the address path, where Kiln searched or the checkouts found (folder, remote address, whether it can be picked), and the command with whether it is available and a `next_argv`. The text form is mockup state 7's.
- **The status token** changes when a question opens or closes, so an answer aimed at a stop that no longer asks is refused as stale.

The page's **Use this folder** and **Use this checkout** at a stop submit the same action through the journal with the page's command id.

## Worktree Folders and Labels (AC-FOLDER-01, AC-FOLDER-02)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Design Decisions ("How a repository is identified"; "Workspace folder", the worktree's folder name)

A repository's **short name** is its folder name when the plan reaches it by folder name, or it is the PRD's repository; otherwise the last part of its address path. Short names are compared without case, since two folders that differ only in case can't share a workspace on macOS or Windows.

**The name, given once.** When an entry is first written, at Start for the whole list or at an addition for one:

- The short name, when no entry already written has that short name or that name, and no other repository in the same Start has that short name.
- Otherwise the whole-path form. In one Start, every repository sharing the short name takes it, except the PRD's repository.
- A whole-path form that an entry already has as its name refuses the Start or the addition, in one line naming both repositories.

The worktree is `<workspace folder>/<name>`, as today, and neither changes afterwards. Before Start the names are worked out from the plan as it stands, so the bases chosen on Documents found, kept by name, are dropped for a repository whose name a plan edit changes; its row then shows the default base.

**The label, worked out each time.** A repository's label is its short name while no other of the PRD's repositories has that short name, and its address path while one does. Every screen, terminal line, `kiln status` line and prompt shows the label; the plan's rows show each phase's repositories by label. Keys in the record and in request bodies stay names.

## Interfaces

### HTTP

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §HTTP API

| Method and path | Change |
|---|---|
| `POST /api/repository-location` | New. `{ repository, folder }` → `200 { repository, folder, outcome? }`; `422 { reason }` for a failed check; `409 { reason }` when no row or stop asks about it. Before Start it is a setup request, as `/api/settings` is. At a stop it is the `locate-repository` action, with the status header and a command id |
| `POST /api/repository-location/change` | New, before Start only. `{ repository }` puts a remembered row back to asking; `409` otherwise |
| `POST /api/repositories` | `name` takes every name form. `200` gains `label`. `422 { reason }` carries the session's sentence when finding ends in a question |
| `POST /api/settings` | Unchanged. `bases` stays keyed by name |

Every new route carries the Host, Origin and token checks.

### Snapshot

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Snapshot

```
Snapshot (changed and added fields only):
  repositories[]: { …, label, addressPath, checkoutFolder?, located?: beside | search | answer,
                    question?: Question }
       (checkoutFolder, located: absent while the row asks; located: before Start only)
  Question: { kind: where | which, repository, searchedFrom, searchedTo?,
              checkouts: [ { folder, remote, pickable, remembered? } ], fieldError? }
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

- `kiln run`: the summary and the line under it as [Asking Before Start](#asking-before-start-ac-ask-01-ac-ask-02-ac-see-01-ac-see-02) gives; the `Located` line; the new plan problems; repositories shown by label in every line.
- `kiln add-repository <repository>`: as above. Its usage text and help entry name the address path.
- `kiln locate-repository`: as above, listed with the routine controls in help and in the command contracts.
- `kiln status`: a stop's questions and the command, as above.

## Data Models

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Data Models

```
PrdRecord (schema 25; fields not shown are unchanged):
  repositories[]: { …, shortName? }        (kept only when it differs from name: the whole-path form)
  plan[]: { …, repositories: [ name as written ] }
  phases.<id>: { …, repositoryRequests?: [ { addressPath, at } ] }
  phases.<id>.stop: { …, locate?: [ { addressPath, phaseFile } ] }     (a plan stop's unanswered questions)

<state root>/repository-locations/<whole-path form, lower-cased>.json:
  { schemaVersion: 1, addressPath, folder, answeredAt }
```

- **Migration from schema 24:** none of content. Every existing entry was named by folder, so its `name` is its short name and its `github` is its address path.
- **The store.** `folder` is the checkout's real path; `answeredAt` is UTC. A file is written whole and renamed into place, as every state file is. A file Kiln can't parse, or whose `schemaVersion` is newer, is a failed remembered answer: Kiln searches and, if it then asks, an accepted answer replaces the file.
- **Not recorded:** how a set-up repository was found. Its entry holds the checkout, and "You told Kiln where this is" is shown only where Change can act, before Start.

## Screens (AC-SEE-03)

Replaces in part: `docs/changes/kiln-multi-repo-delivery/technical-design.md`, §Screens (the repository rows, the stop for a repository Kiln can't add)

The drawn states are built from the mockup's HTML, field messages and comments included. The two screens the PRD names but the mockup doesn't draw:

- **The settings while Kiln works:** each row as Documents found's found row, with label, address path and checkout folder, every field fixed, no remark and no Change.
- **Any other Needs you stop that asks:** the drawn stop's question block, from its first sentence to "Kiln remembers this on this computer only. Nothing is written to any repository.", above what the stop already shows. The sentence about adding the repository and starting the phase is left out; in its place: "The session can ask for it again once the phase resumes."

A short-name clash isn't drawn. Its rows follow state 1 with the address path as the label.

## The Enso Method's `phase-split` (AC-SPLIT-01, AC-SPLIT-02)

The skill's rule for the `**Repositories:**` line, its phase document templates and its example change together:

- **The rule.** Each repository is named by its address path, the PRD's repository included when the phase changes code in it, whether or not its checkout is beside the PRD's repository. Never a folder name, never a path on one computer. The rest of the rule stays: when the line is written, what a split record keeps, why tools read it.
- **Where the writer gets it.** From the checkout: the path in `git remote get-url origin`, after the host and without `.git`. When the technical design names a repository some other way, the writer reads the checkout instead of guessing.
- **The host.** Written only when two of the PRD's repositories have one address path on different hosts, as `<host>:<path>`, with the host's real name. When a checkout's `origin` uses an SSH alias, the writer takes the real name from the SSH configuration (`ssh -G <alias>`).
- **The templates and example** show `acme/returns-api, acme-labs/storefront` in place of folder names.

The skill gains no mention of Kiln, and the rule helps a person running a phase by hand: the line says which repository is meant on any computer.

## Integration Points

- **Git:** `rev-parse --show-toplevel` and `remote get-url origin` in each candidate and in a folder given as an answer. Both are reads, and `worktree add` stays the only change Kiln makes.
- **The file system:** folder listings within the search's reach; the store under the state root.
- **GitHub:** unchanged.
- **The Enso Method:** the line `phase-split` writes.

## Testing Approach

As the designs before it: real temporary Git repositories with local bare repositories as `origin`, a temporary home folder, and the stand-in session.

- **Names:** each row of the table, both spellings of one address path, a folder name and an address path for one repository, two folder names for one repository, a name reaching the PRD's repository; a completed phase's document re-spelled from folder name to address path keeping its scope; an interrupted addition finishing in its recorded checkout.
- **The search:** each layout in AC-FIND-01's table; a checkout at level four found and at level five not; a worktree, a submodule, a bare repository and a clone inside another checkout, each with a matching `origin`, not found; a link not followed; a hidden folder passed over; a rewritten `origin` URL matched; two checkouts, one beside, asked about.
- **No permission prompt (AC-FIND-05):** a temporary home holding every guarded folder name, each with a matching checkout: none is found, and the walk's record of folders listed holds nothing under them. On macOS, one run of the real search against the real home folder with the system log's privacy subsystem read afterwards, showing no access request during the search. If that log can't be read, the write-up says the list's completeness rests on documentation.
- **Asking before Start:** each answer check's message; an accepted answer used by a second PRD without asking; a remembered folder that later fails, forgotten and searched for again; Change keeping and replacing an answer; Start refused while a row asks; another start check failing alongside a question.
- **After Start:** a session's request ending in each question; the request shown on that phase's next stop and dropped once answered; the plan stop's answer adding the repository and starting the phase; Check again after a clone appears; `kiln locate-repository` at each eligibility and outcome, replayed by command id, and refused as stale.
- **Folders and labels:** a clash at Start, a clash from a later addition, a clash with the PRD's repository, and the label changing on earlier phases' rows.
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
| AC-ASK-06, AC-ASK-07 | After Start; Interfaces |
| AC-SESSION-01 | A session's request |
| AC-FOLDER-01, AC-FOLDER-02 | Worktree Folders and Labels |
| AC-SEE-01 to AC-SEE-03 | Asking Before Start; Snapshot; Command line; Screens |
| AC-SPLIT-01, AC-SPLIT-02 | The Enso Method's `phase-split` |

## Open Questions

- **The PRD's repository's short name.** The PRD defines a short name as the last part of the address path, or the folder name when the plan names the repository by folder name. This design keeps the PRD's repository's folder name in every case, and keeps it when another repository shares it, where AC-FOLDER-01 read to the letter gives both the whole-path form. The refinement should confirm the reading or have the PRD say it.
- **AC-ASK-07's second case and the stop pages other changes define.** It adds a question to stops that Kiln run restart (AC-CASE-01) and Kiln needs-you handoff lay out, and the PRD carries no `Replaces in part:` line for them. The refinement's conflict check should look at both.
- **The macOS guarded-folder list** is from documentation. The build's log check either confirms it or names what to add.
- **A continuation's readiness check and the Folder missing setup panel when a name ends in a question.** Both find repositories a plan names that the record doesn't hold, and today list a folder name not found beside the PRD's repository as a problem. AC-ASK-07 limits asking after Start to a phase's Needs you stops, but the Folder missing panel is "a deliberate setup like a first Start". The refinement should settle, from the PRD and the two changes that own these pages, whether each lists the question as a problem (answered at the stop before the phase that names the repository) or asks it on the page.
- **The example in the path-on-one-computer problem.** Mockup state 6 shows `such as acme-labs/storefront`, the named folder's own repository, where this design gives the PRD's repository's address path. If the drawing's reading is meant, Kiln has to read the named folder's `origin`, and a path that isn't a readable checkout needs its own wording.
