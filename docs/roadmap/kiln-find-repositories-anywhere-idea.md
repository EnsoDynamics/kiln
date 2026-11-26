# Kiln idea: Find a PRD's repositories wherever they are checked out

**Roadmap:** [Kiln roadmap](../kiln-roadmap.md).

**PRD:** [Kiln Find Repositories Anywhere](../changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md), which settles the questions under "Left for the PRD" below, except how far the search goes, whether it passes over hidden folders, and the form of a worktree folder's name, which it leaves to the technical design.

Today Kiln finds a repository that a phase document names only as the folder of that name beside the PRD's repository, and it refuses a link there ([multi-repo delivery](../changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), AC-REPO-02 and assumption REPO-001). A PRD whose repositories sit under different parent folders can't start. A common layout keeps each hosting organization's repositories in a folder of their own (`~/code/acme/product`, `~/code/acme-labs/admin`), and a PRD that spans two of them fails the start checks on every machine.

This idea replaces that rule. It also changes the Enso Method: `phase-split` writes the `**Repositories:**` line, and today it tells the writer to use folder names.

## Decided, 2026-11-21

- **Nothing about one machine goes in a committed document.** A phase document holds no local path, absolute or relative. Two people who keep their checkouts in different places run the same phase documents unchanged.
- **A repository is named by the path in its remote address,** such as `acme-labs/admin`, which is the same on every machine.
- **The naming is not tied to one host.** Other hosts' addresses carry a path too, whatever the host calls the grouping (a Bitbucket workspace or project, a GitLab group). Kiln opens pull requests only on GitHub today; this change adds no new assumption that the host is GitHub.
- **Kiln matches a checkout by its `origin`,** never by its folder name.
- **No setting says where repositories are kept.** Kiln works it out from where the PRD's repository is: beside it first, as today, then outward one parent folder at a time, within a bound and never above the home folder.
- **When the search finds nothing, Kiln asks once.** The start checks ask the person where that repository is, and Kiln remembers the answer on that machine only. When it finds two checkouts of one repository it asks instead of guessing.
- **Existing plans keep working.** A bare folder name beside the PRD's repository still resolves.
- **No workaround by link, and Kiln still starts from the PRD's repository,** not from a folder above all of them.

## Left for the PRD

- How far outward the search goes and what it skips (worktrees, hidden folders, dependency folders).
- Whether `phase-split` always writes the remote address path. Writing a bare folder name "when the repository is beside the PRD's" would itself depend on one machine's layout, so the lean is always.
- What the line holds when two hosts carry the same path, and what `kiln add-repository` takes.
- The workspace's folder name for a repository when two of them share a folder name.
- The screens: Documents found, the start check that asks where a repository is, and the terminal's lines. Mockups of these are wanted, made in Claude Design, before the technical design.
