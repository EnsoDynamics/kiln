# PRD: Kiln Find Repositories Anywhere

**Source:** [Kiln idea: Find a PRD's repositories wherever they are checked out](../../roadmap/kiln-find-repositories-anywhere-idea.md), decided 2026-11-21.

**Follow-on to:** [Kiln multi-repo delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), which owns the rule this PRD replaces: a named repository is found only as the folder of that name beside the PRD's repository.

**Assumptions:** [Kiln Find Repositories Anywhere assumptions](kiln-find-repositories-anywhere-assumptions.md)

**Review alongside:** [Mockup](mockups/kiln-find-repositories-anywhere.html)

## Summary

Kiln can deliver a PRD across several repositories only when every one of them is checked out in the same folder as the PRD's repository, under the folder name the phase documents use. A PRD whose repositories are kept under different folders can't start.

This change lets a phase document name a repository by the path in its remote address, such as `acme-labs/admin`, which is the same on every computer. Kiln finds that repository's checkout by its `origin`: beside the PRD's repository first, then in the folders above it. When Kiln can't find a checkout, or finds more than one, it asks the person once and remembers the answer on that computer. Phase documents that name a repository by folder name keep working as they do today.

The change spans two repositories. Kiln reads the names and finds the checkouts. The Enso Method's `phase-split` skill, which writes the line that names a phase's repositories, writes the remote address path instead of a folder name.

## Business Context

A common way to keep code on a computer is one folder per hosting organization: `~/code/acme/product`, `~/code/acme-labs/admin`. A PRD that spans two of those folders fails Kiln's start checks on every computer, because Kiln looks only beside the PRD's repository. Kiln also refuses a link placed there, so there is no workaround short of moving a checkout.

The folder name has a second problem. It is a fact about one computer, written into a document that is committed and shared. Two people who cloned a repository into folders with different names can't run the same phase documents. The rule decided on 2026-11-21 is that nothing about one computer goes in a committed document: no folder name that only one person uses, and no path, absolute or relative. The path in a repository's remote address is the same for everyone, on GitHub and on other hosts, whatever the host calls the grouping (an organization, a group, a workspace).

The Enso Method changes too, because `phase-split` writes the line and today tells the writer to use folder names. The method stands on its own, so the change has to help a person running a phase by hand, and it does: someone picking up a phase on another computer, or an agent told only the folder name, can't tell which repository `admin` is. `acme-labs/admin` says so.

Nobody should have to tell Kiln where they keep their code. Kiln works it out from where the PRD's repository is, and asks only when it can't.

### Terms used in this PRD

- The **PRD's repository**, a **named repository**, an **added repository**, the **workspace**, the **workspace folder**, a repository's **own checkout** and **beside** mean what they mean in [Kiln multi-repo delivery](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md#terms-used-in-this-prd).
- A repository's **remote address** is the address its checkout pushes to and fetches from, its `origin`: `git@github.com:acme-labs/admin.git`.
- Its **address path** is what follows the host in that address, without a trailing `.git`: `acme-labs/admin`. It can have more than two parts on a host that nests groups: `platform/payments/billing`.
- A repository's **short name** is the one name Kiln shows it by and names its worktree folder with (AC-FOLDER-01), usually the last part of its address path: `admin`.
- **This computer** is the computer `kiln run` is running on. What Kiln remembers on it is in Kiln's own records there, outside every repository.

## Acceptance Criteria

### Name a Repository the Same Way on Every Computer

A phase document names each repository by its remote address, so the same document runs unchanged for everyone who has those repositories, wherever they keep them.

- [ ] **AC-NAME-01 — A phase names a repository by the path in its remote address.** On a phase document's `**Repositories:**` line, Kiln reads each name as the table says. Address paths are compared without regard to upper and lower case.
  - Replaces in part: AC-REPO-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (what a name on the line can be; the line, where it sits and which phase documents are read stay)

  | Name on the line | Kiln reads it as |
  |---|---|
  | Two or more parts joined by `/`: `acme-labs/admin` | The repository whose remote address has that path, on any host |
  | A host, a colon, then the path: `git.example.com:platform/billing` | The repository with that path on that host (NAME-001) |
  | One part: `storefront` | The folder of that name beside the PRD's repository, as before this change (AC-FIND-04) |
  | A path on one computer: it starts with `/`, `~`, `.` or a drive letter, or holds a `\` | Not a name. A plan problem that names the phase file and says to name the repository by its remote address |

- [ ] **AC-NAME-02 — A repository is counted once, however it is named.** Names that reach the same repository are one repository in the plan, the workspace and the pull requests: a folder name in one phase document and the address path in another, or two spellings of one address path. A name that reaches the PRD's repository means the PRD's repository.

### Find Each Repository Wherever It Is Checked Out

Kiln works out where each repository is from where the PRD's repository is. Nobody sets a folder for it to look in.

- [ ] **AC-FIND-01 — Kiln finds a repository by its `origin`, starting beside the PRD's repository.** For a repository named by its remote address, Kiln looks for that repository's own checkout: one whose `origin` has the named path. The checkout's folder name plays no part. Kiln uses the answer remembered on this computer when there is one (AC-ASK-04). Otherwise it searches in the table's order and stops at the first step that finds a checkout (FIND-001).
  - Replaces in part: AC-REPO-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (where Kiln looks for a repository named by its remote address, and what it matches; a repository named by folder name stays as that criterion says)

  | Step | Where Kiln looks |
  |---|---|
  | Beside | The folders in the folder that holds the PRD's repository |
  | One folder up | The folders in that folder's parent, and the folders inside each of them |
  | Two folders up | The folders in the next parent up, and the folders up to two levels inside them |

  Kiln never widens the search to the home folder or above it. For a PRD's repository kept outside the home folder, it never widens to the top folder of a disk. With the PRD's repository at `~/code/acme/product`, Kiln looks in `~/code/acme/`, then in `~/code/` and each folder in it, which finds `~/code/acme-labs/admin`. It doesn't go on to `~`.
- [ ] **AC-FIND-02 — The search passes over what can't be a repository's own checkout.** While searching, Kiln doesn't look in a folder whose name starts with a dot, a folder named `node_modules`, or anything inside a Git checkout. It doesn't follow a link. A worktree is never counted as a checkout, wherever it is (FIND-002).
- [ ] **AC-FIND-03 — A found repository must still be one Kiln can deliver.** A checkout Kiln found, or the person pointed it at, gets the other check AC-REPO-02 makes: its `origin` is on GitHub. A failure stops Kiln in the terminal as it does today, naming the repository and its checkout's folder. Its own checkout still doesn't have to be clean.
- [ ] **AC-FIND-04 — A plan that uses folder names keeps working.** A repository named by one part is found, checked and reported exactly as AC-REPO-02 says: only as the folder of that name beside the PRD's repository, with a link refused and a failure printed in the terminal. Kiln doesn't search for it or ask about it. A PRD already underway keeps the repositories and folders Kiln recorded for it.

### Ask Once When Kiln Can't Tell

When the search finds no checkout, or more than one, Kiln asks the person instead of failing or guessing. It asks once on a computer, not once per PRD.

- [ ] **AC-ASK-01 — Kiln asks where a repository is instead of failing.** When every other start check passes and Kiln can't find a checkout of a repository named by its remote address, Kiln opens Documents found instead of stopping in the terminal (ASK-001). That repository's row asks where it is on this computer and says which folders Kiln looked in. Start stays unavailable, and says why, until every such question is answered. The terminal's first line says how many repositories Kiln needs located.
  - Replaces in part: AC-REPO-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (a repository named by its remote address that Kiln can't find is asked about on Documents found, not failed in the terminal)
- [ ] **AC-ASK-02 — Kiln asks which checkout to use when it finds more than one.** When the step that finds the repository finds more than one checkout, either two clones of one repository or the same path on two hosts, the row lists each with its folder and remote address. The person picks one or gives another folder. Kiln never picks for them.
- [ ] **AC-ASK-03 — An answer has to be that repository's checkout.** Kiln accepts a folder only when it exists, is a repository's own checkout rather than a link, a worktree or a folder inside a checkout, and has an `origin` with the named path. Otherwise the row says which of those failed, and nothing is remembered.
- [ ] **AC-ASK-04 — Kiln remembers the answer on this computer only.** An accepted answer is kept in Kiln's own records on this computer. Every PRD on this computer that names that repository uses it without asking again. Kiln writes nothing about it into any repository or document. When the remembered folder no longer holds that repository's checkout, Kiln forgets the answer and searches again.
- [ ] **AC-ASK-05 — The person can change a remembered answer before Start.** On Documents found, a repository whose checkout came from a remembered answer says so and offers **Change**, which asks the question again. Once Start has set a repository up, its checkout is fixed for the PRD, as its base branch is (ASK-002).
- [ ] **AC-ASK-06 — The same answer can be given from the command line.** `kiln locate-repository <name> <folder>` checks the folder as AC-ASK-03 does and remembers it as AC-ASK-04 does, whether or not Kiln is running or has asked. `kiln locate-repository <name> --forget` forgets it. A Documents found page that is open shows the answer once it is given. While a question is open, `kiln status` lists it with this command (CMD-001).
- [ ] **AC-ASK-07 — After Start, the stop gives the command.** When a phase about to start names a repository Kiln can't find, or finds more than one checkout of, the phase stops at Needs you as AC-ADD-04 says. The stop names the repository, the folders Kiln looked in or the checkouts it found, and the `kiln locate-repository` command to copy. **Check again** and `kiln run` try again (ASK-003).
  - Replaces in part: AC-ADD-04 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (what the stop shows for a repository Kiln can't find or finds twice)

### Let a Session Ask for a Repository by the Same Name

A session that finds it needs another repository asks Kiln for it by its remote address, and Kiln finds it the way it finds a named one.

- [ ] **AC-SESSION-01 — A session asks for a repository by its remote address.** `kiln add-repository` takes the names a `**Repositories:**` line does (AC-NAME-01), and each session is told to ask by address path. Kiln finds the repository as AC-FIND-01 says, a remembered answer included. When it can't find a checkout, or finds more than one, it tells the session so, with the folders it looked in or the checkouts it found, and changes nothing, as AC-ADD-02 says of any failed check. The phase doesn't stop and the person isn't asked (ADD-001).
  - Replaces in part: AC-ADD-01 and AC-ADD-02 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the name a session asks by, and how Kiln finds the repository)

### Keep Two Repositories Apart When They Share a Name

Two repositories can have the same last name under different organizations. Each still needs its own folder in the workspace and its own name on screen.

- [ ] **AC-FOLDER-01 — Each repository has one short name in a PRD.** A repository's short name is the last part of its address path (`admin`), or its folder name when the plan names it by folder name. When another of the PRD's repositories already has that short name, the later one's is its whole address path with a hyphen for each `/` (`acme-labs-admin`). Kiln names the repository's worktree folder in the workspace with it and shows the repository by it on its screens and in the terminal. Once Kiln has set a repository up, its short name doesn't change (FOLDER-001).
  - Replaces in part: AC-SPACE-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the name of a repository's worktree folder in the workspace)

### Show Where Each Repository Is

Before Start, the person can see which repository each name means and which checkout Kiln will use.

- [ ] **AC-SEE-01 — Documents found shows each repository's address and checkout.** For a PRD with more than one repository, each repository's row in the delivery settings shows its short name, its address path and the folder its own checkout is in. The passed checks read "Repositories found on this computer" in place of "Named repositories found beside <PRD's repository>".
  - Replaces in part: AC-REPO-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (what a repository's row shows, and the passed check's wording)
- [ ] **AC-SEE-02 — The terminal says what needs locating and what was located.** For a PRD not started, the terminal's first line says how many repositories need locating, in place of "all checks passed", and the line under it says to tell Kiln where they are in the browser. When an answer is accepted, the terminal prints one line naming the repository and its folder and saying Kiln will remember it on this computer.
  - Replaces in part: AC-REPO-03 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the terminal's first line when a repository needs locating)
- [ ] **AC-SEE-03 — The changed screens match their drawings.** Documents found, in each of its three states, and the terminal match this change's mockups for layout, copy, colors and type. The screens this change alters but doesn't draw follow the nearest drawing:
  - Replaces in part: AC-SHOW-01 in `docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md` (the repository rows on Documents found and in the settings while Kiln works, and the terminal's lines about locating a repository)

  | Screen | Follows |
  |---|---|
  | The settings while Kiln works: the repository rows | Documents found's rows, with every field fixed and no **Change** |
  | Needs you for a repository Kiln can't find or finds twice (AC-ASK-07) | The Needs you stop for a plan Kiln can't read, with the command drawn as that page draws a command to copy |

### Have the Enso Method Write Names That Work Everywhere

The Enso Method's `phase-split` skill writes the line Kiln reads. It writes each repository the way AC-NAME-01 reads it, so a plan written on one computer runs on another.

- [ ] **AC-SPLIT-01 — `phase-split` names each repository by its address path.** The skill tells the writer to name every repository on a phase document's `**Repositories:**` line by its address path, the PRD's repository included when the phase changes code in it. That holds when the repository is checked out beside the PRD's repository too. It never writes a folder name or a path on one computer. When the technical design names a repository some other way, the writer reads the address from the repository's checkout instead of guessing. The skill's rule, its phase document templates and its example all show that form.
- [ ] **AC-SPLIT-02 — The host is written only when the path can't tell two repositories apart.** When two of the PRD's repositories have the same address path on different hosts, the skill tells the writer to put the host and a colon in front of each (`git.example.com:platform/billing`), using the host's real name and never an alias from one computer's SSH setup. In every other case the line holds the path alone (NAME-001).

## Out of Scope

- **A setting, or a file, that says where repositories are kept.** Kiln works it out, and remembers only the answers to questions it asked or was given by command.
- **Starting Kiln from a folder above the repositories.** `kiln run` is still pointed into the PRD's repository.
- **A link as a way round.** Kiln still refuses a link where a folder name is expected, and the search never follows one.
- **Searching by folder name.** A repository named by folder name is looked for only beside the PRD's repository.
- **Cloning.** Kiln works only with repositories already checked out on this computer.
- **Delivering to a host other than GitHub.** The names aren't tied to GitHub, and this change adds no new place where Kiln assumes it. Kiln still opens pull requests only on GitHub. How to match addresses on a host whose SSH and HTTPS addresses carry different paths waits until Kiln delivers to that host.
- **Rewriting phase documents already written.** Lines that hold folder names stay as they are, and keep working where the repositories are beside the PRD's repository.
- **How a technical design names repositories.** `phase-split` turns whatever the design says into address paths.
- **The order the two repositories are released in.** A Kiln from before this change reads `acme-labs/admin` as a broken plan, so Kiln's release has to come before the Enso Method's. That goes to the technical design's Delivery section, "After the build".

## Depends On

- **Reading a home folder without a permission prompt.** macOS asks before a program reads Documents, Desktop or Downloads. When the PRD's repository sits directly in the home folder, the search looks at the folders beside it. The technical design checks whether that can raise a prompt and keeps the search from raising one.
- **The host as Git reports it.** A checkout cloned through an SSH alias has the alias, not the host's real name, in its `origin`. Kiln matches on the path, which an alias doesn't change. The technical design says how a name with a host in front (AC-NAME-01) is matched against such a checkout.
