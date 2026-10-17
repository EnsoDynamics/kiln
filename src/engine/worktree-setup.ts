// The feature branch and its worktree: the defaults, the field checks before Start, and the
// setup at Start, the only Git state Kiln ever changes (PRD AC-START-07, AC-GIT-01, AC-GIT-02;
// technical design, "Worktree and Branch Setup").

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { PrdRecord, Settings } from "../state/records.js";
import { gitError, listWorktrees, localBranchCommit, originBranches, runGit, type GitContext, type OriginBranches } from "./git-reads.js";

/** Thirty minutes: the base check's fetch and `git worktree add`, which can download a lot (technical design, "Dependencies"). */
export const SETUP_TIMEOUT_MS = 30 * 60 * 1000;

export interface RepositoryPaths {
  mainCheckoutPath: string;
  repositoryName: string;
  folderName: string;
  /** `docs/prds/<name>`, with `/` separators. */
  prdDirectoryFromRoot: string;
}

/**
 * The settings a PRD starts with (AC-START-07, UI-004): branch `feature/<folder>`, worktree
 * `<repository>-kiln/<folder>` beside the repository, base `develop` when origin has it,
 * otherwise origin's default branch, and the latest Opus at high effort.
 */
export function defaultSettings(paths: RepositoryPaths, origin: OriginBranches | undefined): Settings {
  const base = origin?.branches.has("develop") ? "develop" : (origin?.defaultBranch ?? "");
  return {
    worktreePath: join(dirname(paths.mainCheckoutPath), `${paths.repositoryName}-kiln`, paths.folderName),
    featureBranch: `feature/${paths.folderName}`,
    baseBranch: base,
    model: "opus",
    effort: "high",
    keepAwake: true,
  };
}

/** The base field's list: `develop`, then origin's default branch, then the rest by name. */
export function baseBranchChoices(origin: OriginBranches): string[] {
  const names = [...origin.branches.keys()].sort();
  const first = ["develop", origin.defaultBranch].filter((name, index, list): name is string => name !== undefined && origin.branches.has(name) && list.indexOf(name) === index);
  return [...first, ...names.filter((name) => !first.includes(name))];
}

/** Expands a leading `~` to the home directory. */
export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

export type FieldErrors = Partial<Record<"worktreePath" | "featureBranch" | "baseBranch", string>>;

export interface FieldCheckInput {
  git: GitContext;
  paths: RepositoryPaths;
  settings: Settings;
  /** The PRD directory's tree as Kiln read it, `git rev-parse HEAD:<PRD directory>`. */
  prdTree: string;
  /** origin's branches, read once for the check; an error is the base field's message. */
  origin: { ok: true; value: OriginBranches } | { ok: false; error: string };
  createdBranch: PrdRecord["createdBranch"];
}

export interface FieldCheckOutcome {
  errors: FieldErrors;
  /** The commit sessions would start from: the base's tip on origin, or Kiln's own branch's commit. */
  startCommit?: string;
  /** True when the branch to use is Kiln's own, made by an earlier Start whose setup failed. */
  reusesCreatedBranch: boolean;
}

/**
 * The checks run before Start and at Start: the worktree path, the feature branch and the
 * base branch, each failure worded as the Documents found mockup's source gives it.
 */
export async function checkFields(input: FieldCheckInput): Promise<FieldCheckOutcome> {
  const errors: FieldErrors = {};
  const { settings } = input;
  const worktreeError = await checkWorktreePath(input.git, input.paths.mainCheckoutPath, settings.worktreePath);
  if (worktreeError) errors.worktreePath = worktreeError;

  const reusable = await isKilnsOwnBranch(input, true);
  const branchError = await checkBranchName(input, reusable);
  if (branchError) errors.featureBranch = branchError;

  let startCommit: string | undefined;
  if (settings.baseBranch === "") errors.baseBranch = "Choose a base branch.";
  else if (!input.origin.ok) errors.baseBranch = `Couldn’t reach origin: ${input.origin.error}`;
  else {
    const tip = input.origin.value.branches.get(settings.baseBranch);
    if (tip === undefined) errors.baseBranch = `${settings.baseBranch} isn’t on origin.`;
    else {
      const commit = reusable ? input.createdBranch!.commit : tip;
      const baseError = await checkPrdTreeAt(input, commit);
      if (baseError) errors.baseBranch = baseError;
      else startCommit = commit;
    }
  }
  return { errors, ...(startCommit === undefined ? {} : { startCommit }), reusesCreatedBranch: reusable };
}

async function checkBranchName(input: FieldCheckInput, reusable: boolean): Promise<string | undefined> {
  const { featureBranch, baseBranch } = input.settings;
  if (featureBranch.trim() === "") return "Enter a branch name.";
  const valid = await runGit(input.git, input.paths.mainCheckoutPath, ["check-ref-format", "--branch", featureBranch]);
  if (valid.exitCode !== 0) return "That isn’t a valid branch name.";
  if (reusable) return undefined;
  const local = await localBranchCommit(input.git, input.paths.mainCheckoutPath, featureBranch);
  const onOrigin = input.origin.ok && input.origin.value.branches.has(featureBranch);
  if (local !== undefined || onOrigin) {
    return `That branch already exists. Choose a name no branch has; a new name starts this PRD over from ${baseBranch || "the base branch"}.`;
  }
  return undefined;
}

/**
 * Whether the feature branch is Kiln's own, made by a Start whose setup failed: local, absent
 * from origin, not checked out in any worktree, at the commit Kiln recorded, cut from the same
 * base. For a new press of Start, its commit must also hold the documents Kiln read.
 */
async function isKilnsOwnBranch(input: FieldCheckInput, forNewStart: boolean): Promise<boolean> {
  const created = input.createdBranch;
  if (!created || created.name !== input.settings.featureBranch || created.baseBranch !== input.settings.baseBranch) return false;
  return isOwnBranchAt(input.git, input.paths, created.name, created.commit, input.origin.ok ? input.origin.value : undefined, forNewStart ? input.prdTree : undefined);
}

async function isOwnBranchAt(git: GitContext, paths: RepositoryPaths, branch: string, commit: string, origin: OriginBranches | undefined, prdTree: string | undefined): Promise<boolean> {
  if ((await localBranchCommit(git, paths.mainCheckoutPath, branch)) !== commit) return false;
  if (origin === undefined || origin.branches.has(branch)) return false;
  const worktrees = await listWorktrees(git, paths.mainCheckoutPath);
  if (!worktrees.ok || worktrees.worktrees.some((worktree) => worktree.branch === branch)) return false;
  if (prdTree === undefined) return true;
  const tree = await runGit(git, paths.mainCheckoutPath, ["rev-parse", `${commit}:${paths.prdDirectoryFromRoot}`]);
  return tree.exitCode === 0 && tree.stdout.trim() === prdTree;
}

/** The base check's last part: the commit holds exactly the PRD documents Kiln read, fetching its objects when it isn't local. */
async function checkPrdTreeAt(input: FieldCheckInput, commit: string): Promise<string | undefined> {
  const differs = `${input.settings.baseBranch} on origin has different PRD documents from this checkout. Push them to ${input.settings.baseBranch} first; every session starts from there.`;
  const present = await runGit(input.git, input.paths.mainCheckoutPath, ["cat-file", "-e", `${commit}^{commit}`]);
  if (present.exitCode !== 0) {
    const fetched = await runGit(
      input.git,
      input.paths.mainCheckoutPath,
      ["fetch", "--no-write-fetch-head", "--refmap=", "origin", `refs/heads/${input.settings.baseBranch}`],
      SETUP_TIMEOUT_MS,
    );
    if (fetched.exitCode !== 0) return `Couldn’t reach origin: ${gitError(fetched)}`;
  }
  const tree = await runGit(input.git, input.paths.mainCheckoutPath, ["rev-parse", `${commit}:${input.paths.prdDirectoryFromRoot}`]);
  return tree.exitCode === 0 && tree.stdout.trim() === input.prdTree ? undefined : differs;
}

/**
 * The worktree path check: absolute (after `~`), missing or an empty directory, and not inside
 * the main checkout or any other worktree of the repository.
 */
export async function checkWorktreePath(git: GitContext, mainCheckoutPath: string, worktreePath: string): Promise<string | undefined> {
  if (worktreePath.trim() === "") return "Enter a worktree path.";
  const expanded = expandHome(worktreePath);
  if (!isAbsolute(expanded)) return "Enter a full path, starting with / or ~.";
  if (existsSync(expanded) && (!statSync(expanded).isDirectory() || readdirSync(expanded).length > 0)) {
    return "That folder already exists and isn’t empty. Choose a new one.";
  }
  const worktrees = await listWorktrees(git, mainCheckoutPath);
  if (!worktrees.ok) return `Couldn't list the repository's worktrees: ${worktrees.error}`;
  const candidate = comparable(realPathOfNearestAncestor(resolve(expanded)));
  for (const worktree of worktrees.worktrees) {
    const root = comparable(worktree.path);
    if (candidate === root || candidate.startsWith(root.endsWith(sep) ? root : root + sep)) {
      return "That folder is inside a checkout of this repository. Choose one outside it.";
    }
  }
  return undefined;
}

/** The path with its nearest existing ancestor replaced by that ancestor's real path. */
function realPathOfNearestAncestor(path: string): string {
  let existing = path;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  const rest = relative(existing, path);
  return rest === "" ? realpathSync.native(existing) : join(realpathSync.native(existing), rest);
}

function comparable(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export interface SetupInput {
  git: GitContext;
  paths: RepositoryPaths;
  record: PrdRecord;
  /** Writes the record; called before the worktree is added, so the record owns the names it takes. */
  save: () => void;
  now: () => Date;
}

export type SetupOutcome = { ok: true } | { ok: false; error: string };

/**
 * Adds the worktree once the record holds `startedAt` and `baseCommit`, or finishes a setup that
 * was interrupted: an existing worktree at the path on the branch is done; Kiln's own branch
 * with no worktree gets `git worktree add <path> <branch>`; no branch gets
 * `git worktree add --no-track -b <branch> <path> <baseCommit>`.
 */
export async function addWorktree(input: SetupInput): Promise<SetupOutcome> {
  const { git, paths, record } = input;
  const { worktreePath, featureBranch } = record.settings;
  const path = expandHome(worktreePath);
  const baseCommit = record.baseCommit;
  if (baseCommit === undefined) return { ok: false, error: "Kiln has no recorded commit to start the branch from." };

  const worktrees = await listWorktrees(git, paths.mainCheckoutPath);
  if (!worktrees.ok) return { ok: false, error: worktrees.error };
  const existing = worktrees.worktrees.find((worktree) => comparable(worktree.path) === comparable(realPathOfNearestAncestor(resolve(path))));
  if (existing && existing.branch === featureBranch && existing.locked !== "initializing") return complete(input);

  const branchCommit = await localBranchCommit(git, paths.mainCheckoutPath, featureBranch);
  let result;
  if (branchCommit === undefined) {
    result = await runGit(git, paths.mainCheckoutPath, ["worktree", "add", "--no-track", "-b", featureBranch, path, baseCommit], SETUP_TIMEOUT_MS);
  } else {
    const ownCommit = record.createdBranch?.name === featureBranch ? record.createdBranch.commit : baseCommit;
    const origin = await originBranches(git, paths.mainCheckoutPath);
    if (!origin.ok) return { ok: false, error: `Couldn’t reach origin: ${origin.error}` };
    const own = await isOwnBranchAt(git, paths, featureBranch, ownCommit, origin.value, undefined);
    if (!own) return { ok: false, error: `${featureBranch} already exists and isn't the branch Kiln made.` };
    result = await runGit(git, paths.mainCheckoutPath, ["worktree", "add", path, featureBranch], SETUP_TIMEOUT_MS);
  }
  if (result.exitCode !== 0) return { ok: false, error: gitError(result) };
  return complete(input);
}

function complete(input: SetupInput): SetupOutcome {
  input.record.setupCompletedAt = input.now().toISOString();
  delete input.record.createdBranch;
  input.save();
  return { ok: true };
}

/**
 * Puts the feature back to not started after a failed setup, keeping a branch Kiln made with no
 * worktree as `createdBranch`, so the person can Start on it again after changing the path.
 */
export async function undoFailedSetup(input: SetupInput): Promise<void> {
  const { record } = input;
  const commit = await localBranchCommit(input.git, input.paths.mainCheckoutPath, record.settings.featureBranch);
  const madeByKiln = commit !== undefined && (commit === record.baseCommit || record.createdBranch?.commit === commit);
  if (madeByKiln) record.createdBranch = { name: record.settings.featureBranch, commit, baseBranch: record.settings.baseBranch };
  delete record.startedAt;
  delete record.baseCommit;
  delete record.refinementConfirmedAt;
  input.save();
}

/** The PRD directory's tree in the checkout, `git rev-parse HEAD:<PRD directory>`. */
export async function prdTreeAtHead(git: GitContext, checkoutRoot: string, prdDirectoryFromRoot: string): Promise<string | undefined> {
  const result = await runGit(git, checkoutRoot, ["rev-parse", `HEAD:${prdDirectoryFromRoot}`]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

/** A path for display: under `$HOME` as `~/…` (technical design, "Paths shown"). */
export function displayPath(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(home + sep)) return `~/${path.slice(home.length + 1).split(sep).join("/")}`;
  return path;
}
