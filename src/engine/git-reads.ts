// The Git calls the engine makes. Every one is a read, apart from setup's `git worktree add`
// (Worktree and Branch Setup), and each runs as a detached helper with a timeout.

import { runHelper, type HelperResult } from "../platform/helper-process.js";

export interface GitContext {
  git: string;
  env: NodeJS.ProcessEnv;
  /** Aborted when Kiln stops: every git call still running ends, and its result is ignored. */
  signal?: AbortSignal;
}

export function runGit(context: GitContext, cwd: string, args: string[], timeoutMs?: number): Promise<HelperResult> {
  return runHelper(context.git, args, { cwd, env: context.env, ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(context.signal ? { signal: context.signal } : {}) });
}

/** The command's own error, for a fact shown in place of its result. */
export function gitError(result: HelperResult): string {
  const text = (result.stderr || result.failure || result.stdout || `exit code ${result.exitCode}`).trim();
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").join(" ");
}

export const shortSha = (sha: string) => sha.slice(0, 7);

/** The commit a local branch points at, or undefined when there is no such branch. */
export async function localBranchCommit(context: GitContext, cwd: string, branch: string): Promise<string | undefined> {
  const result = await runGit(context, cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

export interface OriginBranches {
  /** Every branch on origin, by name. */
  branches: Map<string, string>;
  /** The branch origin's HEAD points to, when it advertises one. */
  defaultBranch: string | undefined;
}

/** origin's branches and default branch in one call: `git ls-remote --symref origin HEAD 'refs/heads/*'`. */
export async function originBranches(context: GitContext, cwd: string): Promise<{ ok: true; value: OriginBranches } | { ok: false; error: string }> {
  const result = await runGit(context, cwd, ["ls-remote", "--symref", "origin", "HEAD", "refs/heads/*"]);
  if (result.exitCode !== 0) return { ok: false, error: gitError(result) };
  const branches = new Map<string, string>();
  let defaultBranch: string | undefined;
  for (const line of result.stdout.split(/\r?\n/)) {
    const symref = /^ref: refs\/heads\/(.+)\tHEAD$/.exec(line);
    if (symref) {
      defaultBranch = symref[1];
      continue;
    }
    const ref = /^([0-9a-f]{40,64})\trefs\/heads\/(.+)$/.exec(line);
    if (ref) branches.set(ref[2]!, ref[1]!);
  }
  return { ok: true, value: { branches, defaultBranch } };
}

export async function isAncestor(context: GitContext, cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  return (await runGit(context, cwd, ["merge-base", "--is-ancestor", ancestor, descendant])).exitCode === 0;
}

/** Commits on the branch's first-parent chain since `from`, newest first. */
export async function firstParentCommits(context: GitContext, cwd: string, from: string, to: string): Promise<{ sha: string; subject: string }[]> {
  const result = await runGit(context, cwd, ["log", "--first-parent", "--format=%H%x09%s", `${from}..${to}`]);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.includes("\t"))
    .map((line) => {
      const [sha, ...subject] = line.split("\t");
      return { sha: sha!, subject: subject.join("\t") };
    });
}

export async function firstParentCount(context: GitContext, cwd: string, from: string, to: string): Promise<number | undefined> {
  const result = await runGit(context, cwd, ["rev-list", "--first-parent", "--count", `${from}..${to}`]);
  return result.exitCode === 0 ? Number.parseInt(result.stdout.trim(), 10) : undefined;
}

export interface WorktreeEntry {
  path: string;
  branch: string | undefined;
  /** `locked` with any reason, such as `initializing` while `git worktree add` is checking out. */
  locked: string | undefined;
  /** Git's own stale marker (`prunable`), with its reason; Git also sets it when the path holds a plain folder. */
  prunable?: string;
}

/** `git worktree list --porcelain`, one entry per worktree, the main working tree first. */
export async function listWorktrees(context: GitContext, cwd: string): Promise<{ ok: true; worktrees: WorktreeEntry[] } | { ok: false; error: string }> {
  const result = await runGit(context, cwd, ["worktree", "list", "--porcelain"]);
  if (result.exitCode !== 0) return { ok: false, error: gitError(result) };
  return { ok: true, worktrees: parseWorktreeList(result.stdout) };
}

/** The entries of `git worktree list --porcelain` output. */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const worktrees: WorktreeEntry[] = [];
  let entry: WorktreeEntry | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      entry = { path: line.slice("worktree ".length), branch: undefined, locked: undefined };
      worktrees.push(entry);
    } else if (entry && line.startsWith("branch refs/heads/")) {
      entry.branch = line.slice("branch refs/heads/".length);
    } else if (entry && (line === "locked" || line.startsWith("locked "))) {
      entry.locked = line.slice("locked".length).trim() || "locked";
    } else if (entry && (line === "prunable" || line.startsWith("prunable "))) {
      entry.prunable = line.slice("prunable".length).trim() || "prunable";
    }
  }
  return worktrees;
}
