// The folder check (missing worktree recovery technical design, "The Folder Check"): whether
// each set-up repository's saved folder is still the run's worktree. One classification, run
// asynchronously by the engine and synchronously by `kiln status` and `kiln handoff`, so both
// reach the same answer from disk and Git, and nothing is written.

import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import type { PrdRecord, RepositoryEntry } from "../state/records.js";
import { runGit, parseWorktreeList, type GitContext, type WorktreeEntry } from "./git-reads.js";
import { comparable, expandHome, realPathOfNearestAncestor } from "./worktree-setup.js";

export type FolderState = "in_place" | "missing" | "holds_something_else" | "unknown";

export interface FolderClassification {
  name: string;
  /** The saved folder, `~` expanded. */
  savedFolder: string;
  mainCheckoutPath: string;
  state: FolderState;
  /** What the saved path holds instead, for `holds_something_else`. */
  holds?: string;
  /** The read that failed, worded for the page, for `unknown`. */
  unknown?: string;
}

export interface FolderCheck {
  checkedAt: string;
  repositories: FolderClassification[];
  /** Every set-up repository's saved folder is the run's worktree. */
  passed: boolean;
}

interface GitCall { cwd: string; args: string[] }
interface GitAnswer { exitCode: number | null; stdout: string; stderr: string }

/** A per-call limit for the synchronous reads `kiln status` and `kiln handoff` make. */
const SYNC_GIT_TIMEOUT_MS = 4000;

/** The repositories the check covers: every entry whose setup finished, for an unfinished run. */
export function checkedEntries(record: PrdRecord): RepositoryEntry[] {
  if (record.startedAt === undefined || record.setupCompletedAt === undefined || record.completedAt !== undefined) return [];
  return record.repositories.filter(entry => entry.setupCompletedAt !== undefined);
}

function realPath(path: string): string {
  try { return comparable(realPathOfNearestAncestor(resolve(path))); } catch { return comparable(resolve(path)); }
}

/** One repository's classification, as Git calls the driver answers (Design Decisions, the run's-worktree predicate). */
function* classifySteps(entry: RepositoryEntry): Generator<GitCall, FolderClassification, GitAnswer> {
  const savedFolder = expandHome(entry.worktreePath);
  const mainCheckoutPath = expandHome(entry.mainCheckoutPath);
  const base = { name: entry.name, savedFolder, mainCheckoutPath };
  let isDirectory: boolean;
  try { isDirectory = lstatSync(savedFolder).isDirectory(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return { ...base, state: "missing" };
    return { ...base, state: "unknown", unknown: `the saved folder (${(error as Error).message})` };
  }
  if (!isDirectory) return { ...base, state: "holds_something_else", holds: "a file, not a folder" };
  const inside = yield { cwd: savedFolder, args: ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"] };
  if (inside.exitCode !== 0) {
    if (/not a git repository/i.test(inside.stderr)) return { ...base, state: "holds_something_else", holds: "a plain folder, not a git worktree" };
    return { ...base, state: "unknown", unknown: `Git in the saved folder (${firstLine(inside)})` };
  }
  const [top, common] = inside.stdout.split(/\r?\n/).map(line => line.trim());
  if (!top || !common) return { ...base, state: "unknown", unknown: "Git in the saved folder (no answer)" };
  if (realPath(top) !== realPath(savedFolder)) return { ...base, state: "holds_something_else", holds: "a plain folder, not a git worktree" };
  const shared = yield { cwd: mainCheckoutPath, args: ["rev-parse", "--path-format=absolute", "--git-common-dir"] };
  if (shared.exitCode !== 0) return { ...base, state: "unknown", unknown: `the shared checkout's repository (${firstLine(shared)})` };
  if (realPath(shared.stdout.trim()) !== realPath(common)) return { ...base, state: "holds_something_else", holds: "another repository's checkout" };
  const list = yield { cwd: mainCheckoutPath, args: ["worktree", "list", "--porcelain"] };
  if (list.exitCode !== 0) return { ...base, state: "unknown", unknown: `Git's list of worktrees (${firstLine(list)})` };
  const listed = worktreeAt(parseWorktreeList(list.stdout), savedFolder);
  if (!listed || listed.prunable !== undefined) return { ...base, state: "holds_something_else", holds: "a checkout of this repository that git does not list as a worktree" };
  return { ...base, state: "in_place" };
}

/** Git's worktree entry at a path, compared as real paths. */
export function worktreeAt(worktrees: WorktreeEntry[], path: string): WorktreeEntry | undefined {
  const wanted = realPath(path);
  return worktrees.find(worktree => realPath(worktree.path) === wanted);
}

function firstLine(answer: GitAnswer): string {
  return (answer.stderr || answer.stdout || `exit code ${answer.exitCode}`).trim().split(/\r?\n/)[0] ?? "";
}

function summary(repositories: FolderClassification[], checkedAt: string): FolderCheck {
  return { checkedAt, repositories, passed: repositories.every(repository => repository.state === "in_place") };
}

/** The engine's check: Git calls as detached helpers. */
export async function checkFolders(git: GitContext, record: PrdRecord, now = new Date()): Promise<FolderCheck> {
  const repositories = await Promise.all(checkedEntries(record).map(entry => checkFolder(git, entry)));
  return summary(repositories, now.toISOString());
}

/** One entry's classification: whether its `worktreePath` is the run's worktree (Design Decisions, the run's-worktree predicate). */
export async function checkFolder(git: GitContext, entry: RepositoryEntry): Promise<FolderClassification> {
  const steps = classifySteps(entry);
  let next = steps.next();
  while (!next.done) {
    const call = next.value;
    const result = await runGit(git, call.cwd, call.args, 30_000);
    next = steps.next({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr || result.failure || "" });
  }
  return next.value;
}

/** `kiln status` and `kiln handoff`'s check: synchronous, each read bounded, a read that times out Couldn't check. */
export function checkFoldersSync(gitExecutable: string, env: NodeJS.ProcessEnv, record: PrdRecord, deadline = Date.now() + 5000, now = new Date()): FolderCheck {
  const repositories = checkedEntries(record).map(entry => {
    const steps = classifySteps(entry);
    let next = steps.next();
    while (!next.done) {
      const call = next.value;
      const timeout = Math.max(1, Math.min(SYNC_GIT_TIMEOUT_MS, deadline - Date.now()));
      const result = spawnSync(gitExecutable, call.args, { cwd: call.cwd, env, encoding: "utf8", timeout, windowsHide: true });
      const timedOut = result.error !== undefined || result.signal !== null;
      next = steps.next(timedOut
        ? { exitCode: null, stdout: "", stderr: result.error ? result.error.message : "timed out" }
        : { exitCode: result.status, stdout: result.stdout, stderr: result.stderr });
    }
    return next.value;
  });
  return summary(repositories, now.toISOString());
}
