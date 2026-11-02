// What head-bound waiver items are checked against (waivers AC-WAIVE-09): each repository's
// feature head and its uncommitted changes, read from Git.

import { createHash } from "node:crypto";
import { runGit, type GitContext } from "./git-reads.js";
import type { RepositoryFingerprint } from "./waivers.js";

/**
 * Reads each repository's feature head and a digest of `git status --porcelain
 * --untracked-files=all` with each listed path's content blob (AC-WAIVE-09). A repository whose
 * worktree cannot be read fingerprints as `unreadable`, so nothing waived against it matches.
 */
export async function readRepositoryFingerprints(git: GitContext, repositories: { name: string; mainCheckoutPath: string; worktreePath: string }[], branch: string): Promise<RepositoryFingerprint[]> {
  return Promise.all(repositories.map(async (repository) => {
    const inWorktree = (args: string[]) => runGit(git, repository.mainCheckoutPath, ["-C", repository.worktreePath, ...args]);
    const [head, status] = await Promise.all([inWorktree(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]), inWorktree(["status", "--porcelain", "--untracked-files=all", "-z"])]);
    const headSha = head.exitCode === 0 ? head.stdout.trim() : "none";
    if (status.exitCode !== 0) return { name: repository.name, head: headSha, dirty: "unreadable" };
    if (!status.stdout.replaceAll("\0", "").trim()) return { name: repository.name, head: headSha, dirty: "clean" };
    // Tracked changes, staged or not (edits, deletions, renames), by content; untracked files by their blobs.
    const [diff, untracked] = await Promise.all([inWorktree(["diff", "--binary", "--no-color", "--no-ext-diff", "HEAD"]), inWorktree(["ls-files", "--others", "--exclude-standard", "-z"])]);
    const paths = untracked.exitCode === 0 ? untracked.stdout.split("\0").filter(Boolean) : [];
    const blobs = paths.length ? await inWorktree(["hash-object", "--no-filters", "--", ...paths]) : undefined;
    if (diff.exitCode !== 0 || untracked.exitCode !== 0 || blobs && blobs.exitCode !== 0) return { name: repository.name, head: headSha, dirty: "unreadable" };
    const dirty = createHash("sha256").update(JSON.stringify([status.stdout, diff.stdout, paths, blobs?.stdout ?? ""])).digest("hex");
    return { name: repository.name, head: headSha, dirty };
  }));
}
