// The feature branch and its worktree in each of the PRD's repositories: the defaults, the
// field checks before Start, and the setup at Start, the only Git state Kiln ever changes (PRD
// AC-START-07, AC-GIT-01, AC-GIT-02; technical design, "Worktree and Branch Setup"; multi-repo
// AC-SPACE-01, technical design "The Workspace").

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { defaultWorkspaceFolder, type CreatedBranch, type RepositoryEntry, type RepositoryKind, type Settings } from "../state/records.js";
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
 * `.worktrees/<folder>/<repository>` in the folder that holds the repository, as the Enso Method
 * places its worktrees, base `develop` when origin has it,
 * otherwise origin's default branch, and the latest Opus at high effort.
 */
export function defaultSettings(paths: RepositoryPaths, origin: OriginBranches | undefined): Settings {
  const base = origin === undefined ? "" : defaultBaseBranch(origin);
  return {
    workspaceFolder: defaultWorkspaceFolder(paths.mainCheckoutPath, paths.prdDirectoryFromRoot),
    worktreePath: join(dirname(paths.mainCheckoutPath), ".worktrees", paths.folderName, paths.repositoryName),
    featureBranch: `feature/${paths.folderName}`,
    baseBranch: base,
    bases: {},
    model: "opus",
    effort: "high",
    keepAwake: true,
    resumeAfterUsageLimit: true,
  };
}

/** The base a PRD starts from: `develop` when origin has it, otherwise origin's default branch, else none. */
export function defaultBaseBranch(origin: OriginBranches): string {
  return origin.branches.has("develop") ? "develop" : (origin.defaultBranch ?? "");
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

export type FieldErrors = Partial<Record<"workspaceFolder" | "worktreePath" | "featureBranch" | "baseBranch" | "model", string>>;

/** One of the PRD's repositories as the field checks and setup see it, the PRD's repository first. */
export interface PlannedRepository {
  name: string;
  kind: RepositoryKind;
  mainCheckoutPath: string;
  github: string;
  /** The entry Kiln recorded for it: set up, or holding a branch an earlier Start made. */
  entry?: RepositoryEntry;
}

export type OriginRead = { ok: true; value: OriginBranches } | { ok: false; error: string };

export interface FieldCheckInput {
  git: GitContext;
  paths: RepositoryPaths;
  settings: Settings;
  /** The PRD directory's tree as Kiln read it, `git rev-parse HEAD:<PRD directory>`. */
  prdTree: string;
  /** The PRD's repository first, then the others in list order. */
  repositories: PlannedRepository[];
  /** Each repository's origin, read once for the check; an error is its base field's message. */
  origins: Map<string, OriginRead>;
  multiRepository: boolean;
  /** Once any repository is set up, the workspace folder and feature branch are fixed. */
  workspaceFixed: boolean;
}

export interface FieldCheckOutcome {
  errors: FieldErrors;
  /** Each repository's base message other than the PRD's repository's, which is `errors.baseBranch`. */
  baseErrors: Record<string, string>;
  /** Per repository not yet set up: the commit its branch would start from (the base's tip, or Kiln's own branch's commit). */
  startCommits: Record<string, string>;
}

/** Names joined as a sentence lists them: "a", "a and b", "a, b and c". */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The base a repository's branch starts from: its set-up or fixed entry's, else the settings'. */
export function baseFor(repository: PlannedRepository, settings: Settings, branchFixed: boolean): string {
  const entry = repository.entry;
  if (entry && (entry.setupCompletedAt !== undefined || entry.kind === "added" || (branchFixed && entry.createdBranch !== undefined))) return entry.baseBranch;
  return repository.kind === "prd" ? settings.baseBranch : (settings.bases[repository.name] ?? "");
}

/** Where a repository's worktree goes: v1's worktree field for a one-repository PRD, else `<workspace folder>/<name>`. */
export function worktreePathFor(name: string, kind: RepositoryKind, settings: Settings, multiRepository: boolean): string {
  if (kind === "prd" && !multiRepository) return expandHome(settings.worktreePath);
  return join(expandHome(settings.workspaceFolder), name);
}

/**
 * The checks run before Start and at Start, per repository: the workspace folder (or, for a
 * one-repository PRD, v1's worktree path), the feature branch in every repository, and each
 * repository's base, each failure worded as the Documents found mockups' sources give it. A
 * repository already set up skips the checks its record answers.
 */
export async function checkFields(input: FieldCheckInput): Promise<FieldCheckOutcome> {
  const errors: FieldErrors = {};
  const baseErrors: Record<string, string> = {};
  const startCommits: Record<string, string> = {};
  const { settings, repositories, multiRepository } = input;
  const prd = repositories[0]!;
  const pending = repositories.filter((repository) => repository.entry?.setupCompletedAt === undefined);

  if (multiRepository) {
    if (!input.workspaceFixed) {
      const folderError = await checkWorkspaceFolder(input.git, repositories, settings.workspaceFolder);
      if (folderError) errors.workspaceFolder = folderError;
    }
    if (!errors.workspaceFolder) {
      for (const repository of pending) {
        const pathError = await checkWorktreePath(input.git, repository.mainCheckoutPath, worktreePathFor(repository.name, repository.kind, settings, true));
        if (pathError) {
          errors.workspaceFolder = pathError;
          break;
        }
      }
    }
  } else if (pending.includes(prd)) {
    const worktreeError = await checkWorktreePath(input.git, prd.mainCheckoutPath, settings.worktreePath);
    if (worktreeError) errors.worktreePath = worktreeError;
  }

  const reusable = new Map<string, boolean>();
  for (const repository of pending) reusable.set(repository.name, await isKilnsOwnBranch(input, repository, true));
  const branchError = await checkBranchName(input, pending, reusable);
  if (branchError) errors.featureBranch = branchError;

  for (const repository of repositories) {
    const isPrd = repository === prd;
    if (repository.entry?.setupCompletedAt !== undefined) {
      if (isPrd) {
        const differs = await checkSetUpPrdTree(input, repository);
        if (differs) errors.baseBranch = differs;
      }
      continue;
    }
    const base = baseFor(repository, settings, input.workspaceFixed);
    const origin = input.origins.get(repository.name);
    let message: string | undefined;
    if (base === "") message = "Choose a base branch.";
    else if (!origin || !origin.ok) message = `Couldn’t reach origin: ${origin?.ok === false ? origin.error : "not read"}`;
    else {
      const tip = origin.value.branches.get(base);
      if (tip === undefined) message = `${base} isn’t on origin.`;
      else {
        const commit = reusable.get(repository.name) ? repository.entry!.createdBranch!.commit : tip;
        message = isPrd ? await checkPrdTreeAt(input, repository, base, commit) : await fetchIfMissing(input.git, repository.mainCheckoutPath, base, commit);
        if (message === undefined) startCommits[repository.name] = commit;
      }
    }
    if (message === undefined) continue;
    if (isPrd) errors.baseBranch = message;
    else baseErrors[repository.name] = message;
  }
  return { errors, baseErrors, startCommits };
}

async function checkBranchName(input: FieldCheckInput, pending: PlannedRepository[], reusable: Map<string, boolean>): Promise<string | undefined> {
  const { featureBranch, baseBranch } = input.settings;
  if (featureBranch.trim() === "") return "Enter a branch name.";
  const prd = input.repositories[0]!;
  const valid = await runGit(input.git, prd.mainCheckoutPath, ["check-ref-format", "--branch", featureBranch]);
  if (valid.exitCode !== 0) return "That isn’t a valid branch name.";
  const taken: string[] = [];
  for (const repository of pending) {
    if (reusable.get(repository.name)) continue;
    const local = await localBranchCommit(input.git, repository.mainCheckoutPath, featureBranch);
    const origin = input.origins.get(repository.name);
    const onOrigin = origin?.ok === true && origin.value.branches.has(featureBranch);
    if (local !== undefined || onOrigin) taken.push(repository.name);
  }
  if (taken.length === 0) return undefined;
  if (!input.multiRepository) {
    return `That branch already exists. Choose a name no branch has; a new name starts this PRD over from ${baseBranch || "the base branch"}.`;
  }
  return `That branch already exists in ${joinNames(taken)}. Choose a name no branch has in any repository; a new name starts this PRD over from each repository’s base branch.`;
}

/**
 * Whether the feature branch in a repository is Kiln's own, made by a Start whose setup failed:
 * local, absent from origin, not checked out in any worktree, at the commit Kiln recorded, cut
 * from the same base. For the PRD's repository and a new press of Start, its commit must also
 * hold the documents Kiln read.
 */
async function isKilnsOwnBranch(input: FieldCheckInput, repository: PlannedRepository, forNewStart: boolean): Promise<boolean> {
  const created = repository.entry?.createdBranch;
  const base = baseFor(repository, input.settings, input.workspaceFixed);
  if (!created || created.name !== input.settings.featureBranch || created.baseBranch !== base) return false;
  const origin = input.origins.get(repository.name);
  const prdTree = forNewStart && repository.kind === "prd" ? { prdDirectoryFromRoot: input.paths.prdDirectoryFromRoot, tree: input.prdTree } : undefined;
  return isOwnBranchAt(input.git, repository.mainCheckoutPath, created.name, created.commit, origin?.ok ? origin.value : undefined, prdTree);
}

export async function isOwnBranchAt(
  git: GitContext,
  mainCheckoutPath: string,
  branch: string,
  commit: string,
  origin: OriginBranches | undefined,
  prdTree: { prdDirectoryFromRoot: string; tree: string } | undefined,
): Promise<boolean> {
  if ((await localBranchCommit(git, mainCheckoutPath, branch)) !== commit) return false;
  if (origin === undefined || origin.branches.has(branch)) return false;
  const worktrees = await listWorktrees(git, mainCheckoutPath);
  if (!worktrees.ok || worktrees.worktrees.some((worktree) => worktree.branch === branch)) return false;
  if (prdTree === undefined) return true;
  const tree = await runGit(git, mainCheckoutPath, ["rev-parse", `${commit}:${prdTree.prdDirectoryFromRoot}`]);
  return tree.exitCode === 0 && tree.stdout.trim() === prdTree.tree;
}

/** Brings a base's tip into the checkout when it isn't there, with v1's objects-only fetch, so `git worktree add` can start from it. */
export async function fetchIfMissing(git: GitContext, mainCheckoutPath: string, base: string, commit: string): Promise<string | undefined> {
  const present = await runGit(git, mainCheckoutPath, ["cat-file", "-e", `${commit}^{commit}`]);
  if (present.exitCode === 0) return undefined;
  const fetched = await runGit(git, mainCheckoutPath, ["fetch", "--no-write-fetch-head", "--refmap=", "origin", `refs/heads/${base}`], SETUP_TIMEOUT_MS);
  return fetched.exitCode === 0 ? undefined : `Couldn’t reach origin: ${gitError(fetched)}`;
}

/** The PRD repository's base check's last part: the commit holds exactly the PRD documents Kiln read. */
async function checkPrdTreeAt(input: FieldCheckInput, repository: PlannedRepository, base: string, commit: string): Promise<string | undefined> {
  const differs = `${base} on origin has different PRD documents from this checkout. Push them to ${base} first; every session starts from there.`;
  const fetched = await fetchIfMissing(input.git, repository.mainCheckoutPath, base, commit);
  if (fetched) return fetched;
  const tree = await runGit(input.git, repository.mainCheckoutPath, ["rev-parse", `${commit}:${input.paths.prdDirectoryFromRoot}`]);
  return tree.exitCode === 0 && tree.stdout.trim() === input.prdTree ? undefined : differs;
}

/** Once the PRD's repository is set up: the given checkout's PRD documents match the feature branch's, where sessions start. */
async function checkSetUpPrdTree(input: FieldCheckInput, repository: PlannedRepository): Promise<string | undefined> {
  const { featureBranch } = input.settings;
  const tree = await runGit(input.git, repository.mainCheckoutPath, ["rev-parse", `${featureBranch}:${input.paths.prdDirectoryFromRoot}`]);
  if (tree.exitCode === 0 && tree.stdout.trim() === input.prdTree) return undefined;
  const path = displayPath(repository.entry!.worktreePath);
  return `${repository.name}’s worktree has different PRD documents from this checkout. Make the same change on ${featureBranch} in ${path}, or run kiln run from that worktree; sessions start from it.`;
}

/**
 * The workspace folder check: absolute (after `~`), missing or an empty directory, and not
 * inside any checkout of any of the PRD's repositories.
 */
export async function checkWorkspaceFolder(git: GitContext, repositories: { name: string; mainCheckoutPath: string }[], folder: string): Promise<string | undefined> {
  if (folder.trim() === "") return "Enter a workspace folder.";
  const expanded = expandHome(folder);
  if (!isAbsolute(expanded)) return "Enter a full path, starting with / or ~.";
  if (existsSync(expanded) && (!statSync(expanded).isDirectory() || readdirSync(expanded).length > 0)) {
    return "That folder already exists and isn’t empty. Choose a new one.";
  }
  return checkWorkspaceFolderPlacement(git, repositories, expanded);
}

/** Not inside any checkout of the given repositories: "That folder is inside a checkout of returns-api. Choose one outside it." */
export async function checkWorkspaceFolderPlacement(git: GitContext, repositories: { name: string; mainCheckoutPath: string }[], folder: string): Promise<string | undefined> {
  for (const repository of repositories) {
    const inside = await insideCheckout(git, repository.mainCheckoutPath, expandHome(folder));
    if (inside === "error") return `Couldn't list ${repository.name}'s worktrees.`;
    if (inside) return `That folder is inside a checkout of ${repository.name}. Choose one outside it.`;
  }
  return undefined;
}

async function insideCheckout(git: GitContext, mainCheckoutPath: string, path: string): Promise<boolean | "error"> {
  const worktrees = await listWorktrees(git, mainCheckoutPath);
  if (!worktrees.ok) return "error";
  const candidate = comparable(realPathOfNearestAncestor(resolve(path)));
  return worktrees.worktrees.some((worktree) => isWithin(candidate, comparable(worktree.path)));
}

/** True when a path is the folder or inside it; both already made comparable. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
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
  const inside = await insideCheckout(git, mainCheckoutPath, expanded);
  if (inside === "error") {
    const worktrees = await listWorktrees(git, mainCheckoutPath);
    return `Couldn't list the repository's worktrees: ${worktrees.ok ? "" : worktrees.error}`;
  }
  return inside ? "That folder is inside a checkout of this repository. Choose one outside it." : undefined;
}

/** The path with its nearest existing ancestor replaced by that ancestor's real path. */
export function realPathOfNearestAncestor(path: string): string {
  let existing = path;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  const rest = relative(existing, path);
  return rest === "" ? realpathSync.native(existing) : join(realpathSync.native(existing), rest);
}

export function comparable(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export type SetupOutcome = { ok: true } | { ok: false; error: string };

/**
 * Adds one repository's worktree once its entry holds `baseCommit`, or finishes one that was
 * interrupted: a worktree at the path on the branch is done, unless Git left it `locked
 * initializing`; Kiln's own branch with no worktree gets `git worktree add <path> <branch>`; no
 * branch gets `git worktree add --no-track -b <branch> <path> <baseCommit>`. `again` ends the
 * half-made message: "then press Start again." or "then ask again.".
 */
export async function addEntryWorktree(git: GitContext, entry: RepositoryEntry, branch: string, again: string, askOrigin = true): Promise<SetupOutcome> {
  const path = expandHome(entry.worktreePath);
  const worktrees = await listWorktrees(git, entry.mainCheckoutPath);
  if (!worktrees.ok) return { ok: false, error: worktrees.error };
  const existing = worktrees.worktrees.find((worktree) => comparable(worktree.path) === comparable(realPathOfNearestAncestor(resolve(path))));
  if (existing?.locked === "initializing") return { ok: false, error: halfMadeMessage(entry, again) };
  if (existing && existing.branch === branch) return { ok: true };

  const baseCommit = entry.baseCommit;
  if (baseCommit === undefined) return { ok: false, error: "Kiln has no recorded commit to start the branch from." };
  const branchCommit = await localBranchCommit(git, entry.mainCheckoutPath, branch);
  let result;
  if (branchCommit === undefined) {
    result = await runGit(git, entry.mainCheckoutPath, ["worktree", "add", "--no-track", "-b", branch, path, baseCommit], SETUP_TIMEOUT_MS);
  } else {
    const ownCommit = entry.createdBranch?.name === branch ? entry.createdBranch.commit : baseCommit;
    let own: boolean;
    if (askOrigin) {
      const origin = await originBranches(git, entry.mainCheckoutPath);
      if (!origin.ok) return { ok: false, error: `Couldn’t reach origin: ${origin.error}` };
      own = await isOwnBranchAt(git, entry.mainCheckoutPath, branch, ownCommit, origin.value, undefined);
    } else {
      // An interrupted add is finished from its record: the branch is Kiln's when it is still at the recorded commit and checked out nowhere.
      const worktrees = await listWorktrees(git, entry.mainCheckoutPath);
      own = branchCommit === ownCommit && worktrees.ok && !worktrees.worktrees.some((worktree) => worktree.branch === branch);
    }
    if (!own) return { ok: false, error: entry.kind === "prd" ? `${branch} already exists and isn't the branch Kiln made.` : `${branch} already exists in ${entry.name} and isn't the branch Kiln made.` };
    result = await runGit(git, entry.mainCheckoutPath, ["worktree", "add", path, branch], SETUP_TIMEOUT_MS);
  }
  if (result.exitCode !== 0) return { ok: false, error: gitError(result) };
  return { ok: true };
}

export function halfMadeMessage(entry: RepositoryEntry, again: string): string {
  const path = expandHome(entry.worktreePath);
  return `${entry.name}’s worktree at ${displayPath(path)} was left half made. Remove it with git -C ${displayPath(entry.mainCheckoutPath)} worktree remove -f -f ${displayPath(path)}, ${again}`;
}

/**
 * v1's undo for one entry after its `git worktree add` failed: a branch Kiln made at the entry's
 * `baseCommit` stays as its `createdBranch`, and `baseCommit` is cleared.
 */
export async function undoEntry(git: GitContext, entry: RepositoryEntry, branch: string): Promise<void> {
  const commit = await localBranchCommit(git, entry.mainCheckoutPath, branch);
  const madeByKiln = commit !== undefined && (commit === entry.baseCommit || entry.createdBranch?.commit === commit);
  if (madeByKiln) entry.createdBranch = { name: branch, commit, baseBranch: entry.baseBranch } satisfies CreatedBranch;
  delete entry.baseCommit;
}

/** True when an entry holds nothing worth keeping: no setup, no commit to start from, no branch of Kiln's. */
export function entryHoldsNothing(entry: RepositoryEntry): boolean {
  return entry.setupCompletedAt === undefined && entry.baseCommit === undefined && entry.createdBranch === undefined;
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
