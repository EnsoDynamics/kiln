# PRD: Kiln Find Repositories Anywhere

**Source:** [Kiln idea: Find a PRD's repositories wherever they are checked out](../../roadmap/kiln-find-repositories-anywhere-idea.md), decided 2026-11-21.

**Follow-on to:** [Kiln multi-repo delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), which owns the rule this PRD replaces: a named repository is found only as the folder of that name beside the PRD's repository (its AC-REPO-02, resting on its assumption REPO-001). The decision of 2026-11-21 replaces REPO-001 for a repository named by the path in its remote address.

**Assumptions:** [Kiln Find Repositories Anywhere assumptions](kiln-find-repositories-anywhere-assumptions.md)

**Review alongside:** [Mockup](mockups/kiln-find-repositories-anywhere.html)

## Summary

Kiln can deliver a PRD across several repositories only when every one of them is checked out in the same folder as the PRD's repository, under the folder name the phase documents use. A PRD whose repositories are kept under different folders can't start.

This change lets a phase document name a repository by the path in its remote address, such as `acme-labs/admin`, which is the same on every computer. Kiln finds that repository's checkout by its `origin`: beside the PRD's repository first, then in the folders above it. When Kiln can't find a checkout, or finds more than one, it asks the person once and remembers the answer on that computer. Phase documents that name a repository by folder name keep working as they do today.

The change spans two repositories. Kiln reads the names and finds the checkouts. The Enso Method's `phase-split` skill, which writes the line that names a phase's repositories, writes the path in each repository's remote address instead of a folder name.

## Business Context

A common way to keep code on a computer is one folder per hosting organization: `~/code/acme/product`, `~/code/acme-labs/admin`. A PRD that spans two of those folders fails Kiln's start checks on every computer, because Kiln looks only beside the PRD's repository. Kiln also refuses a link placed there, so there is no workaround short of moving a checkout.

The folder name has a second problem. It is a fact about one computer, written into a document that is committed and shared. Two people who cloned a repository into folders with different names can't run the same phase documents. The rule decided on 2026-11-21 is that nothing about one computer goes in a committed document: no folder name that only one person uses, and no path, absolute or relative. The path in a repository's remote address is the same for everyone, on GitHub and on most other hosts, whatever the host calls the grouping (an organization, a group, a workspace).

The Enso Method changes too, because `phase-split` writes the line and today tells the writer to use folder names. The method stands on its own, so the change has to help a person running a phase by hand, and it does: someone picking up a phase on another computer, or an agent told only the folder name, can't tell which repository `admin` is. `acme-labs/admin` says so.

Nobody should have to tell Kiln where they keep their code. Kiln works it out from where the PRD's repository is, and asks only when it can't.

### Terms used in this PRD

- The **PRD's repository**, a **named repository**, an **added repository**, the **workspace**, the **workspace folder**, a repository's **own checkout** and **beside** mean what they mean in [Kiln multi-repo delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md#terms-used-in-this-prd).
- A repository's **remote address** is the address its checkout pushes to and fetches from, its `origin`: `git@github.com:acme-labs/admin.git`.
- Its **address path** is the part of that address after the host, without a trailing `.git`: `acme-labs/admin`. It can have more than two parts on a host that nests groups: `platform/payments/billing`. On GitHub it is the same in a repository's SSH and HTTPS addresses. A host where the two differ is out of scope.
- A repository's **short name** is the last part of its address path (`admin`), or its folder name when the plan names it by folder name. The PRD's repository's short name is always the folder name of its own checkout, however the plan names it.
- **This computer** is the computer `kiln run` is running on. What Kiln remembers on it is in Kiln's own records there, outside every repository.

## Acceptance Criteria

### Name a Repository the Same Way on Every Computer

A phase document names each repository by the path in its remote address, so the same document runs unchanged for everyone who has those repositories, wherever they keep them.

- [ ] **AC-NAME-01 — A phase names a repository by the path in its remote address.** On a phase document's `**Repositories:**` line, Kiln reads each name as the table says. Address paths are compared without regard to upper and lower case.
  - Replaces in part: AC-REPO-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (what a name on the line can be; the line, where it sits and which phase documents are read stay)

  | Name on the line | Kiln reads it as |
  |---|---|
  | Two or more parts joined by `/`: `acme-labs/admin` | The repository whose remote address has that path, on any host |
  | A host, a colon, then the path, as `phase-split` writes it (AC-SPLIT-02): `git.example.com:platform/billing` | That path, found as AC-FIND-01 finds a path. Kiln delivers only to GitHub (AC-FIND-03), so a host other than `github.com` is a plan problem that names the phase file and the host |
  | One part: `storefront` | The folder of that name beside the PRD's repository, as before this change (AC-FIND-04) |
  | A full remote address: `git@github.com:acme-labs/admin.git` | Not a name. A plan problem that names the phase file and the address path to use |
  | A path on one computer: it starts with `/`, `~`, `.` or a drive letter, or holds a `\` | Not a name. A plan problem that names the phase file and says to name the repository by its address path |

- [ ] **AC-NAME-02 — A repository is counted once, however it is named.** Names that reach the same repository are one repository in the plan, the workspace and the pull requests: a folder name in one phase document and the address path in another, or two spellings of one address path. When one of the names is a folder name, that folder is the repository's checkout, and Kiln doesn't search for it. A name that reaches the PRD's repository means the PRD's repository.

### Find Each Repository Wherever It Is Checked Out

Kiln works out where each repository is from where the PRD's repository is. Nobody sets a folder for it to look in.

- [ ] **AC-FIND-01 — Kiln finds a repository by its `origin`, searching outward from the PRD's repository.** For a repository named by its address path, Kiln uses the answer remembered on this computer when there is one (AC-ASK-04). Otherwise it searches for a checkout whose `origin` has the named path: beside the PRD's repository first, then outward one parent folder at a time, within a limit, and never above the home folder. It covers the whole limit every time, so a checkout near the PRD's repository never hides one farther out (ASK-004). The checkout's folder name plays no part. When the search finds exactly one checkout and Kiln can deliver to it (AC-FIND-03), Kiln uses it. Otherwise Kiln asks (AC-ASK-01, AC-ASK-02). The search finds the layouts in this table without asking:
  - Replaces in part: AC-REPO-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (where Kiln looks for a repository named by its address path, and what it matches; a repository named by folder name stays as that criterion says)

  | PRD's repository | Another repository's checkout | Found without asking |
  |---|---|---|
  | `~/code/acme/product` | `~/code/acme/returns-api` | Yes, beside it |
  | `~/code/acme/product` | `~/code/acme-labs/storefront`, a folder per organization | Yes |
  | `~/src/github.com/acme/product` | `~/src/github.com/acme-labs/storefront`, a folder per host and then per organization, as clone managers make | Yes |
  | `~/code/acme/product` | `/Volumes/work/storefront` | No. Reaching it means searching above the home folder, so Kiln asks |

- [ ] **AC-FIND-02 — Only a repository's own checkout counts.** A folder counts only when it is a repository's own checkout: never a worktree, a submodule or a bare repository, even when its `origin` matches. The search never looks inside a checkout, so a clone kept in another project's dependency folder is never found, and it never follows a link.
- [ ] **AC-FIND-05 — The search never raises a permission prompt.** Searching never makes the operating system ask the person to let Kiln read a folder. A repository Kiln couldn't reach without one is asked about instead.
  - Added in refinement.
- [ ] **AC-FIND-03 — Kiln uses only a checkout it can deliver to.** Kiln can deliver to a checkout whose `origin` is on GitHub (the check AC-REPO-02 already makes); the checkout still doesn't have to be clean. A found checkout that fails this check is never used and doesn't fail the start checks. When Kiln asks about the repository, the question lists that checkout with its remote address, says Kiln delivers only to GitHub, and doesn't let the person pick it. A folder the person gives gets the same check (AC-ASK-03).
- [ ] **AC-FIND-04 — A plan that uses folder names keeps working.** A repository named by one part is found and checked exactly as AC-REPO-02 says: only as the folder of that name beside the PRD's repository, with a link refused. A failure is reported as it is today: in the terminal, or on Documents found after a reset. Kiln doesn't search for it or ask about it. A PRD already underway keeps the repositories and folders Kiln recorded for it.

### Ask Once When Kiln Can't Tell

When the search finds no checkout Kiln can use, or more than one, Kiln asks the person instead of failing or guessing. It asks once on a computer, not once per PRD.

- [ ] **AC-ASK-01 — Kiln asks on Documents found instead of failing.** When every other start check passes and Kiln has to ask about a repository (AC-FIND-01), it opens Documents found instead of stopping in the terminal. When the search found more than one checkout, that repository's row asks which to use (AC-ASK-02); otherwise it asks where the repository is on this computer and says where Kiln searched. Start stays unavailable, and says why, until every such question is answered. When another start check fails too, Kiln reports that check as it does today, in the terminal or on Documents found after a reset, and asks once it passes.
  - Replaces in part: AC-REPO-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a repository named by its address path is asked about on Documents found, not failed in the terminal)
- [ ] **AC-ASK-02 — Kiln asks which checkout to use when it finds more than one.** When the search finds more than one checkout of a repository, however near or far each is, the row lists each with its folder and remote address. That covers two clones of one repository and the same path on two hosts. The person picks one Kiln can deliver to (AC-FIND-03) or gives another folder. Kiln never picks for them (ASK-004).
- [ ] **AC-ASK-03 — An answer has to be a checkout of that repository Kiln can deliver.** Kiln accepts a folder only when it exists, is a repository's own checkout as AC-FIND-02 says, is not a link, and has an `origin` with the named path, on GitHub (AC-FIND-03). Otherwise the question says, beside the field, which check failed, and nothing is remembered.
- [ ] **AC-ASK-04 — Kiln remembers the answer on this computer only.** An accepted answer is kept in Kiln's own records on this computer. Every PRD on this computer that names that repository uses it without asking again. Kiln writes nothing about it into any repository or document. Each time Kiln uses a remembered answer, it checks the folder again as AC-ASK-03 says. When the folder fails, Kiln forgets the answer and searches again.
- [ ] **AC-ASK-05 — The person can change a remembered answer before Start.** On Documents found, a repository whose checkout came from a remembered answer says so and offers **Change**, which asks the question again and updates the answer remembered on this computer. Once Kiln has set a repository up for a PRD, its checkout is fixed for that PRD, as its base branch is. A changed answer reaches only repositories set up after it (ASK-002).
- [ ] **AC-ASK-07 — After Start, a phase's Needs you stop asks the same question.** After Start, Kiln asks where a repository is only at a phase's Needs you stop, in the two cases the table gives. A continuation and a start from the base branch on the Folder missing page don't ask: a repository named by its address path that Kiln would ask about is left out of what they set up, and the stop before the phase that names it asks. One exception keeps today's behavior: a repository the continuation must read to verify earlier work, one its preparation reads or one a phase completed outside Kiln names, stays a problem on the continuation, as Kiln Continue Added Phases says of an unavailable source. The stop names the repository and asks with Documents found's question and words (AC-ASK-01, AC-ASK-02), checked as AC-ASK-03 says and remembered as AC-ASK-04 says. `kiln run` shows the same stop.
  - Replaces in part: AC-ADD-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (what the stop shows and takes for a repository Kiln would ask about)
  - Replaces in part: AC-CONTINUE-06 in `docs/changes/kiln-continue-added-phases/kiln-continue-added-phases-prd.md` and AC-SETUP-07 in `docs/changes/kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md` (a continuation's fresh workspace, and a start from the base branch on the Folder missing page, leave out a repository named by its address path that Kiln would ask about; a repository the continuation must read to verify earlier work, and the rest of each start, stay)

  | When | The stop that asks | An accepted answer |
  |---|---|---|
  | A phase about to start names a repository Kiln would ask about on Documents found | The stop before that phase, as AC-ADD-04 says. **Check again** with no answer searches again, so a checkout cloned where the search reaches also clears it | Adds the repository, and starts the phase once nothing else holds the stop |
  | A session asked for a repository Kiln would ask about on Documents found (AC-SESSION-01) | Any Needs you stop that phase reaches, for whatever reason, along with what that stop already asks. The phase never stops for the request alone (ASK-003) | Is remembered, so the session's next request for it succeeds once the phase resumes |

- [ ] **AC-ASK-06 — A bot can answer that stop from the command line.** The question at AC-ASK-07's stops has a command, `kiln locate-repository`, with the page's effect and eligibility: it gives a folder, or picks one of the checkouts found, and is refused unless a stop asking about that repository is open on a running Kiln. It follows bot control's rules for changing commands. `kiln status` lists the stop with the repository, where Kiln searched or the checkouts it found, and the command with whether it is available. Before Start, the question is answered only on Documents found, like every other choice made before Start.
  - Replaces in part: AC-ACT-01 in `docs/prds/kiln-bot-control/kiln-bot-control-prd.md` (one more command joins the controls for a run already started; help and run detail list it)

### Let a Session Ask for a Repository by the Same Name

A session that finds it needs another repository asks Kiln for it by the path in its remote address, and Kiln finds it the way it finds a named one.

- [ ] **AC-SESSION-01 — A session asks for a repository by its address path.** `kiln add-repository` takes the names a `**Repositories:**` line does (AC-NAME-01), and each session is told to ask by address path. Kiln finds the repository as AC-FIND-01 says, a remembered answer included. When Kiln would ask about it on Documents found, it tells the session instead, with where it searched or the checkouts it found, and adds nothing, as AC-ADD-02 says of any failed check. Kiln keeps the request with its phase, and asks the person about it only as AC-ASK-07 says.
  - Replaces in part: AC-ADD-01 and AC-ADD-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the name a session asks by, and how Kiln finds the repository)

### Keep Two Repositories Apart When They Share a Name

Two repositories can have the same last name under different organizations. Each still needs its own folder in the workspace and its own name on screen.

- [ ] **AC-FOLDER-01 — Each repository has its own worktree folder.** Each of a PRD's repositories gets a worktree folder in the workspace whose name no other repository of the PRD has, and which never changes once Kiln has set the repository up. It is the repository's short name, unless another repository of the PRD set up before it, or at the same time, has that short name. Then it is built from the whole address path, in a form no other address path produces. The PRD's repository always keeps its short name: when a repository set up at the same time shares it, only that other repository takes the whole-path form.
  - Replaces in part: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the name of a repository's worktree folder in the workspace)
- [ ] **AC-FOLDER-02 — Two repositories with one short name are both shown by their whole path.** Kiln shows each repository by its short name on its screens and in the terminal until another of the PRD's repositories has the same short name. From then on it shows both by their whole address path, so one shown as `admin` in earlier phases becomes `acme/admin`.
  - Replaces in part: AC-ADD-03, AC-CHECK-02 and AC-PRS-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the name a repository is shown by on screens and in terminal lines once another of the PRD's repositories shares its short name; what each line and fact says stays)

### Show Where Each Repository Is

Before Start, the person can see which repository each name means and which checkout Kiln will use.

- [ ] **AC-SEE-01 — Documents found shows each repository's address and checkout.** For a PRD with more than one repository, each repository's row in the delivery settings shows its short name, its address path and the folder its own checkout is in. The passed checks read "Repositories found on this computer" in place of "Named repositories found beside <PRD's repository>".
  - Replaces in part: AC-REPO-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (what a repository's row shows, and the passed check's wording)
- [ ] **AC-SEE-02 — The terminal says what needs locating and what was located.** For a PRD not started, the terminal's first line says how many repositories need locating, in place of "all checks passed", and the line under it says to tell Kiln where they are in the browser. When an answer is accepted, the terminal prints one line naming the repository and its folder and saying Kiln will remember it on this computer.
  - Replaces in part: AC-REPO-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` and AC-START-09 in `docs/prds/kiln-v1/kiln-v1-prd.md` (the terminal's first line and the line under it when a repository needs locating, and a line when an answer is accepted; the rest of what the terminal prints stays)
- [ ] **AC-SEE-03 — The changed screens match their drawings.** Documents found in each of its four states, the stop before a phase that asks where a repository is, and the terminal match this change's mockups for layout, copy, colors and type. Three screens this change alters but doesn't draw follow the nearest drawing: the settings while Kiln works follow Documents found's repository rows, with every field fixed and no **Change**; the stop before a phase that asks about more than one repository, or beside another plan problem, repeats the drawn question once per repository and says the phase starts once nothing else holds the stop; and any other Needs you stop that asks (AC-ASK-07), a billing hold included, shows the drawn stop's question below the stop's first card and above the ways to resolve the stop, where Kiln run restart's offer to bring the branch up to date sits (AC-CURRENT-01).
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the repository rows on Documents found and in the settings while Kiln works, the stop for a repository Kiln can't add, the terminal's lines about locating a repository, and that question on the phase's other Needs you pages)
  - Replaces in part: AC-LOOK-01 in `docs/changes/kiln-run-restart/kiln-run-restart-prd.md`, AC-NEXT-01 in `docs/changes/kiln-completion-waivers/kiln-completion-waivers-prd.md`, AC-RUN-02 in `docs/changes/kiln-billing-safeguards/kiln-billing-safeguards-prd.md` and AC-SPACE-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a phase's Needs you page, a one-repository PRD's included, gains the question about a repository a session asked for, below its first card; the rest of each layout stays)

### Have the Enso Method Write Names That Work Everywhere

The Enso Method's `phase-split` skill writes the line Kiln reads. It writes each repository's name in a form that is the same on every computer, so a plan written on one computer runs on another, by hand or in Kiln.

- [ ] **AC-SPLIT-01 — `phase-split` names each repository by its address path.** The skill tells the writer to name every repository on a phase document's `**Repositories:**` line by its address path, the PRD's repository included when the phase changes code in it. That holds when the repository is checked out beside the PRD's repository too. It never writes a folder name or a path on one computer. The writer reads the address from the repository's checkout, or from an address the PRD or technical design writes out; when neither gives it, the writer writes its best-supported address and declares it as a technical assumption, never presenting a guess as fact. The skill's rule, its phase document templates and its example all show that form.
- [ ] **AC-SPLIT-02 — The host is written only when the path can't tell two repositories apart.** When two of the PRD's repositories have the same address path on different hosts, the skill tells the writer to write each as the host's real name, a colon, then the path: `git.example.com:platform/billing`. The host is never an alias from one computer's SSH setup. In every other case the line holds the path alone.

## Out of Scope

- **A setting, or a file, that says where repositories are kept.** Kiln works it out, and remembers only the answers to the questions it asks.
- **Starting Kiln from a folder above the repositories.** `kiln run` is still pointed into the PRD's repository.
- **A link as a way round.** Kiln still refuses a link where a folder name is expected, and the search never follows one.
- **Searching by folder name.** A repository named by folder name is looked for only beside the PRD's repository.
- **Cloning.** Kiln works only with repositories already checked out on this computer.
- **Choosing another checkout when the search finds exactly one.** Kiln uses it and shows its folder (AC-SEE-01). **Change** is offered only for an answer Kiln remembered (AC-ASK-05).
- **A repository's own checkout moved or deleted after Kiln set it up.** Its checkout is fixed for the PRD (AC-ASK-05). Recovering a PRD whose checkout is gone is left out, as [Kiln missing-worktree recovery](../kiln-missing-worktree-recovery/kiln-missing-worktree-recovery-prd.md) leaves out a run whose shared checkout is missing.
- **Delivering to a host other than GitHub.** The names aren't tied to GitHub, and this change adds no new assumption that the host is GitHub. Kiln already opens pull requests only on GitHub, and applies that same rule sooner: a found checkout on another host is never used (AC-FIND-03), and a name that gives another host is a plan problem when the plan is read (AC-NAME-01). How to match addresses on a host whose SSH and HTTPS addresses carry different paths waits until Kiln delivers to that host.
- **Rewriting phase documents already written.** Lines that hold folder names stay as they are, and keep working where the repositories are beside the PRD's repository.
- **How a technical design names repositories.** `phase-split` turns whatever the design says into address paths.
- **The order the two repositories are released in.** A Kiln from before this change reads `acme-labs/admin` as a broken plan, so Kiln's release has to come before the Enso Method's. That goes to the technical design's Delivery section, "After the build".

## Depends On

- **Which folders the operating system guards.** macOS asks before a program reads Documents, Desktop or Downloads, and some of the Library folder. The technical design lists the guarded folders on each system Kiln supports, so the search can stay out of them (AC-FIND-05).
