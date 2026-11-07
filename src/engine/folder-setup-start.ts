// Start on the Folder missing page (missing worktree recovery technical design, "Start", "Data
// Models"): the durable start intent written before the first Git write, and Start's Git steps.
// Each step first checks whether its effect already exists as the intent describes, so a Start
// that failed partway does only what is still missing the next time (AC-SAFE-01). Start never
// deletes anything but the one stale worktree record AC-SAFE-04 allows.

import { existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkedPath, privateJson } from "../control/private-state.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import type { AgentSettings, RepositoryEntry } from "../state/records.js";
import { checkFolder } from "./folder-check.js";
import { ensureObjects, gitError, listWorktrees, localBranchCommit, runGit, type GitContext } from "./git-reads.js";
import { worktreeAt } from "./folder-check.js";
import { addEntryWorktree, expandHome, SETUP_TIMEOUT_MS } from "./worktree-setup.js";
import { safeIdentity } from "./continuation-state.js";

export interface FolderSetupRepository {
  name: string;
  kind: RepositoryEntry["kind"];
  github: string;
  mainCheckoutPath: string;
  baseBranch: string;
  /** Base starts: the commit the new branch starts from, as the page showed it. */
  baseCommit?: string;
  branch: string;
  worktreePath: string;
  /** Existing-branch starts, when only origin has the branch: origin's tip. */
  createLocalFromOrigin?: string;
  /** Existing-branch starts: the missing saved folder whose stale record Start clears (AC-SAFE-04). */
  clearStaleRecord?: string;
}

export type FolderSetupStepState = "pending" | "done" | "failed";
export interface FolderSetupStart {
  formatVersion: 1;
  id: string;
  commandId: string;
  /** The unfinished execution. */
  executionId: string;
  kind: "base" | "branch";
  factsId: string;
  previewId: string;
  createdAt: string;
  /** The panel's, as Start will save them. */
  settings: AgentSettings;
  repositories: FolderSetupRepository[];
  steps: { name: string; label: string; state: FolderSetupStepState; error?: string }[];
  state: "in_progress" | "failed" | "superseded" | "activated" | "resumed";
  /** Base starts. */
  newExecutionId?: string;
}

const directoryOf = (stateDirectory: string) => join(stateDirectory, "folder-setup-starts");

export function writeStartIntent(stateDirectory: string, intent: FolderSetupStart): void {
  if (!safeIdentity(intent.commandId)) throw new Error("Invalid Folder missing start identity.");
  const path = join(directoryOf(stateDirectory), `${intent.commandId}.json`);
  let parent = dirname(path); while (!existsSync(parent)) parent = dirname(parent);
  checkedPath(dirname(dirname(stateDirectory)), parent);
  if (existsSync(path)) checkedPath(dirname(dirname(stateDirectory)), path);
  writeDurableMetadata(path, intent);
}

function validIntent(value: FolderSetupStart, commandId: string): boolean {
  return value.formatVersion === 1 && value.commandId === commandId && safeIdentity(value.id) && safeIdentity(value.executionId) && ["base", "branch"].includes(value.kind)
    && ["in_progress", "failed", "superseded", "activated", "resumed"].includes(value.state) && Array.isArray(value.repositories) && Array.isArray(value.steps) && Number.isFinite(Date.parse(value.createdAt));
}

export function readStartIntent(stateDirectory: string, commandId: string): FolderSetupStart | undefined {
  if (!safeIdentity(commandId)) return undefined;
  const path = join(directoryOf(stateDirectory), `${commandId}.json`);
  if (!existsSync(path)) return undefined;
  const value = privateJson<FolderSetupStart>(dirname(dirname(stateDirectory)), path);
  if (!validIntent(value, commandId)) throw new Error("A saved Folder missing start is damaged; restore it before pressing Start again.");
  return value;
}

/** Every start intent of an execution, oldest first. */
export function startIntents(stateDirectory: string, executionId: string): FolderSetupStart[] {
  const directory = directoryOf(stateDirectory);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(file => file.endsWith(".json")).map(file => readStartIntent(stateDirectory, file.slice(0, -5))!).filter(intent => intent.executionId === executionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export class StartStepFailure extends Error {}
/** A Start whose recheck found the page out of date mid-way: the refreshed page is shown instead (Start). */
export class FolderSetupChanged extends Error {}

/** Runs one named step unless the intent records it done; a failure is recorded, saved and thrown. */
export async function step(intent: FolderSetupStart, name: string, save: () => void, work: () => Promise<void>): Promise<void> {
  const row = intent.steps.find(one => one.name === name);
  if (!row) throw new Error(`Unknown start step ${name}.`);
  if (row.state === "done") return;
  try { await work(); row.state = "done"; delete row.error; save(); }
  catch (error) { row.state = "failed"; row.error = (error as Error).message; save(); if (error instanceof FolderSetupChanged) throw error; throw new StartStepFailure(`${row.label}: ${(error as Error).message}`, { cause: error }); }
}

/** The steps a start runs, in order, with what each says on the page (done[] and remaining[]). */
export function plannedSteps(kind: "base" | "branch", repositories: FolderSetupRepository[], multi: boolean): FolderSetupStart["steps"] {
  const where = (repository: FolderSetupRepository) => multi ? ` in ${repository.name}` : "";
  if (kind === "base") return [
    ...repositories.map(repository => ({ name: `worktree:${repository.name}`, label: `Create ${repository.branch} and its folder${where(repository)}`, state: "pending" as const })),
    { name: "plan", label: "Read the plan in the new folder", state: "pending" },
    { name: "activate", label: "Start the fresh execution", state: "pending" },
  ];
  return [
    ...repositories.filter(repository => repository.createLocalFromOrigin).map(repository => ({ name: `branch:${repository.name}`, label: `Give your checkout${where(repository)} the branch ${repository.branch}, tracking origin’s`, state: "pending" as const })),
    ...repositories.filter(repository => repository.clearStaleRecord).map(repository => ({ name: `clear:${repository.name}`, label: `Clear git’s record of the missing folder${where(repository)}`, state: "pending" as const })),
    ...repositories.map(repository => ({ name: `worktree:${repository.name}`, label: `Create the folder on ${repository.branch}${where(repository)}`, state: "pending" as const })),
    { name: "save", label: "Save the run’s new folder", state: "pending" },
  ];
}

export function progressOf(intent: FolderSetupStart): { done: string[]; remaining: string[]; error: string } {
  return { done: intent.steps.filter(row => row.state === "done").map(row => row.label), remaining: intent.steps.filter(row => row.state !== "done").map(row => row.label), error: intent.steps.find(row => row.state === "failed")?.error ?? "Start stopped before it finished." };
}

/** The folder check's predicate holds at the folder and git has it on the branch (existing-branch step 3's completion test). */
export async function worktreeReady(git: GitContext, repository: FolderSetupRepository): Promise<boolean> {
  const entry: RepositoryEntry = { name: repository.name, kind: repository.kind, github: repository.github, mainCheckoutPath: repository.mainCheckoutPath, baseBranch: repository.baseBranch, worktreePath: repository.worktreePath };
  if ((await checkFolder(git, entry)).state !== "in_place") return false;
  const list = await listWorktrees(git, expandHome(repository.mainCheckoutPath));
  return list.ok && worktreeAt(list.worktrees, expandHome(repository.worktreePath))?.branch === repository.branch;
}

/** Base start, step 1 for one repository: the new branch at the page's base commit and the folder as its worktree. */
export async function createBranchAndFolder(git: GitContext, repository: FolderSetupRepository): Promise<void> {
  if (await worktreeReady(git, repository)) {
    if (await artifactTouched(git, repository)) throw new Error(`${repository.worktreePath} holds work Start did not make. Nothing was removed; move or commit it, then press Start again.`);
    return;
  }
  const main = expandHome(repository.mainCheckoutPath);
  // The name must not exist, unless it is this start's own branch at the base commit (a failed earlier attempt).
  const local = await localBranchCommit(git, main, repository.branch);
  const remote = await runGit(git, main, ["ls-remote", "origin", `refs/heads/${repository.branch}`]);
  if (remote.exitCode !== 0) throw new Error(`Couldn’t reach origin: ${gitError(remote)}`);
  if (remote.stdout.trim()) throw new Error(`${repository.branch} already exists on origin. Nothing was changed; press Check again.`);
  if (local !== undefined && local !== repository.baseCommit) throw new Error(`${repository.branch} already exists and isn’t the branch Kiln made. Nothing was changed; press Check again.`);
  const entry: RepositoryEntry = { name: repository.name, kind: repository.kind, github: repository.github, mainCheckoutPath: main, baseBranch: repository.baseBranch, worktreePath: repository.worktreePath, baseCommit: repository.baseCommit! };
  const outcome = await addEntryWorktree(git, entry, repository.branch, "then press Start again.", false);
  if (!outcome.ok) throw new Error(outcome.error);
  if (!await worktreeReady(git, repository)) throw new Error(`The folder at ${repository.worktreePath} isn’t a worktree on ${repository.branch}.`);
}

/** Existing-branch start, step 1: the shared checkout's branch at origin's tip, its upstream set in config. */
export async function createLocalBranch(git: GitContext, repository: FolderSetupRepository): Promise<void> {
  const main = expandHome(repository.mainCheckoutPath);
  const sha = repository.createLocalFromOrigin!;
  const local = await localBranchCommit(git, main, repository.branch);
  if (local === undefined) {
    const failed = await ensureObjects(git, main, sha, SETUP_TIMEOUT_MS);
    if (failed) throw new Error(`Couldn’t fetch ${repository.branch} from origin: ${gitError(failed)}`);
    const made = await runGit(git, main, ["branch", "--no-track", repository.branch, sha]);
    if (made.exitCode !== 0) throw new Error(gitError(made));
  } else if (local !== sha) throw new Error(`Your checkout now has its own ${repository.branch}. Nothing was changed; press Check again.`);
  for (const [key, value] of [[`branch.${repository.branch}.remote`, "origin"], [`branch.${repository.branch}.merge`, `refs/heads/${repository.branch}`]] as const) {
    const set = await runGit(git, main, ["config", key, value]);
    if (set.exitCode !== 0) throw new Error(gitError(set));
  }
}

/**
 * Existing-branch start, step 2 (AC-SAFE-04): `git worktree remove` of the one stale record, only
 * while git still marks it `prunable` and nothing is at its path, rechecked immediately before.
 */
export async function clearStaleRecord(git: GitContext, repository: FolderSetupRepository): Promise<void> {
  const main = expandHome(repository.mainCheckoutPath);
  const path = repository.clearStaleRecord!;
  const list = await listWorktrees(git, main);
  if (!list.ok) throw new Error(list.error);
  const entry = worktreeAt(list.worktrees, path);
  if (!entry) return; // Already cleared.
  let present = true;
  try { lstatSync(path); } catch { present = false; }
  if (entry.prunable === undefined || present) throw new Error(`Git’s record of ${path} is no longer stale. Nothing was removed; press Check again.`);
  const removed = await runGit(git, main, ["worktree", "remove", path]);
  if (removed.exitCode !== 0) throw new Error(gitError(removed));
}

/** Existing-branch start, step 3: `git worktree add <folder> <branch>`, done only when the folder check's predicate holds. */
export async function addWorktreeOnBranch(git: GitContext, repository: FolderSetupRepository): Promise<void> {
  if (await worktreeReady(git, repository)) return;
  const main = expandHome(repository.mainCheckoutPath);
  const added = await runGit(git, main, ["worktree", "add", expandHome(repository.worktreePath), repository.branch], SETUP_TIMEOUT_MS);
  if (added.exitCode !== 0) throw new Error(gitError(added));
  if (!await worktreeReady(git, repository)) throw new Error(`The folder at ${repository.worktreePath} isn’t a worktree on ${repository.branch}.`);
}

/** Whether a base start's folder, when there, is no longer a clean worktree on its branch at its base commit (continuation setup's `validatePreparedWorkspace` test). */
async function artifactTouched(git: GitContext, repository: FolderSetupRepository): Promise<boolean> {
  const path = expandHome(repository.worktreePath);
  const main = expandHome(repository.mainCheckoutPath);
  const local = await localBranchCommit(git, main, repository.branch);
  if (local !== undefined && local !== repository.baseCommit) return true;
  if (!existsSync(path)) return false;
  const [head, branch, status] = await Promise.all([runGit(git, path, ["rev-parse", "HEAD"]), runGit(git, path, ["symbolic-ref", "--quiet", "--short", "HEAD"]), runGit(git, path, ["status", "--porcelain=v1", "--untracked-files=all"])]);
  return head.exitCode !== 0 || head.stdout.trim() !== repository.baseCommit || branch.stdout.trim() !== repository.branch || !!status.stdout.trim();
}

/** The first location an earlier base start made that is no longer its own and untouched, or undefined (Data Models, the start intent). */
export async function stillOwnArtifacts(git: GitContext, intent: FolderSetupStart): Promise<string | undefined> {
  if (intent.kind !== "base") return undefined;
  for (const repository of intent.repositories) if (await artifactTouched(git, repository)) return expandHome(repository.worktreePath);
  return undefined;
}
