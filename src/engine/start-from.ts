// Starting from a branch that already exists, and catching an untouched branch up (run restart
// technical design, "Starting From a Branch" and "Catching a Branch Up"; PRD AC-FROM-01 to 05,
// AC-CURRENT-01). The branch list and its classification, the preview for the selected name read
// from Git at the commit the first session starts from, and the one Git write Kiln adds: a
// fast-forward of a branch with no commits of its own to its base's tip, then a plain push.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { leavesOf, namedRepositories, planStartProblems, readPhasePlan, type PhasePlan } from "../plan/phase-plan.js";
import { runHelper } from "../platform/helper-process.js";
import type { RepositoryEntry, RepositoryKind } from "../state/records.js";
import { readGitPlan } from "./completed-plan-sources.js";
import { checkFolder } from "./folder-check.js";
import { ensureObjects, gitError, listWorktrees, originBranches, runGit, shortSha, type GitContext, type OriginBranches, type WorktreeEntry } from "./git-reads.js";
import { comparable, defaultBaseBranch, displayPath, expandHome, halfMadeMessage, joinNames, realPathOfNearestAncestor, SETUP_TIMEOUT_MS } from "./worktree-setup.js";

/** One of the PRD's repositories as the branch list and preview see it. */
export interface StartRepository {
  name: string;
  kind: RepositoryKind;
  mainCheckoutPath: string;
  github: string;
  baseBranch: string;
  /** An earlier Start set it up: an existing-branch start keeps it whatever the start commit's plan names (AC-FROM-05). */
  setUp?: true;
}

/** A repository's refs, read once per list: local branches, origin's branches and the worktree list. */
export interface RepositoryRefs {
  local: Map<string, string>;
  origin?: OriginBranches;
  originError?: string;
  worktrees?: WorktreeEntry[];
  worktreesError?: string;
  localError?: string;
}

export async function readRepositoryRefs(git: GitContext, mainCheckoutPath: string): Promise<RepositoryRefs> {
  const [local, origin, worktrees] = await Promise.all([
    runGit(git, mainCheckoutPath, ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads/"]),
    originBranches(git, mainCheckoutPath),
    listWorktrees(git, mainCheckoutPath),
  ]);
  const refs: RepositoryRefs = { local: new Map() };
  if (local.exitCode === 0) for (const line of local.stdout.split(/\r?\n/)) { const [name, sha] = line.split("\t"); if (name && sha) refs.local.set(name, sha); }
  else refs.localError = gitError(local);
  if (origin.ok) refs.origin = origin.value; else refs.originError = origin.error;
  if (worktrees.ok) refs.worktrees = worktrees.worktrees; else refs.worktreesError = worktrees.error;
  return refs;
}

/** Another started PRD's feature branches in one main checkout (AC-FROM-03 row 2). */
export interface OtherPrdBranch { mainCheckoutPath: string; branch: string; featureName: string }

/**
 * Every saved record under the state root, other than this PRD's, that is started: each repository
 * entry's main checkout with its feature branch, its branch stem, and each earlier execution's branch.
 */
export function otherStartedBranches(stateDirectory: string): OtherPrdBranch[] {
  const root = dirname(dirname(stateDirectory));
  const found: OtherPrdBranch[] = [];
  let repositories: string[];
  try { repositories = readdirSync(root); } catch { return found; }
  for (const repository of repositories) {
    let prds: string[];
    try { prds = readdirSync(join(root, repository)); } catch { continue; }
    for (const prd of prds) {
      const directory = join(root, repository, prd);
      if (comparable(directory) === comparable(stateDirectory)) continue;
      let record: { startedAt?: string; featureName?: string; branchStem?: string; settings?: { featureBranch?: string }; repositories?: { mainCheckoutPath?: string }[]; continuation?: { executions?: { branch?: unknown }[] } };
      try { record = JSON.parse(readFileSync(join(directory, "prd.json"), "utf8")); } catch { continue; }
      if (!record?.startedAt || typeof record.settings?.featureBranch !== "string") continue;
      const executionBranches = (record.continuation?.executions ?? []).map(row => row.branch).filter((branch): branch is string => typeof branch === "string");
      const branches = [...new Set([record.settings.featureBranch, ...(record.branchStem ? [record.branchStem] : []), ...executionBranches])];
      for (const entry of record.repositories ?? []) {
        if (typeof entry.mainCheckoutPath !== "string") continue;
        for (const branch of branches) found.push({ mainCheckoutPath: entry.mainCheckoutPath, branch, featureName: record.featureName ?? prd });
      }
    }
  }
  return found;
}

export type Classification =
  | { kind: "unavailable"; reason: string }
  /** The repository doesn't have the branch: it is cut from its base (AC-FROM-05). */
  | { kind: "absent" }
  /** Row 6: checked out in another worktree, which Kiln adopts. */
  | { kind: "worktree"; path: string; local: string; origin?: string }
  /** Row 7: checked out nowhere; local, origin-only, or both. */
  | { kind: "nowhere"; local?: string; origin?: string };

/** The first row of AC-FROM-03's table that fits the branch in one repository. */
export async function classifyBranch(git: GitContext, repository: StartRepository, refs: RepositoryRefs, branch: string, others: OtherPrdBranch[], multi: boolean, predicates = new Map<string, Promise<Awaited<ReturnType<typeof checkFolder>>>>()): Promise<Classification> {
  const say = (reason: string): Classification => ({ kind: "unavailable", reason: multi ? `In ${repository.name}: ${reason}` : reason });
  if (branch === repository.baseBranch) return say("That's the base branch. Choose A new feature branch to start from it.");
  const main = comparable(realPathOfNearestAncestor(expandHome(repository.mainCheckoutPath)));
  const other = others.find(one => one.branch === branch && comparable(realPathOfNearestAncestor(expandHome(one.mainCheckoutPath))) === main);
  if (other) return say(`That branch is the feature branch of ${other.featureName}, which Kiln has started. Choose another branch.`);
  if (refs.localError) return say(`Kiln couldn't read the local branches: ${refs.localError}`);
  if (refs.originError) return say(`Kiln couldn't read origin's branches: ${refs.originError}`);
  if (refs.worktreesError) return say(`Kiln couldn't list the worktrees: ${refs.worktreesError}`);
  const local = refs.local.get(branch);
  const origin = refs.origin!.branches.get(branch);
  if (local === undefined && origin === undefined) return { kind: "absent" };
  const worktrees = refs.worktrees!;
  const entries = worktrees.filter(entry => entry.branch === branch);
  if (worktrees[0]?.branch === branch) return say(`That branch is checked out in your own checkout, ${displayPath(worktrees[0].path)}. Switch that checkout to another branch to start from it.`);
  const half = entries.find(entry => entry.locked === "initializing");
  if (half) return say(halfMadeMessage({ name: repository.name, mainCheckoutPath: repository.mainCheckoutPath, worktreePath: half.path } as RepositoryEntry, "then reload."));
  const judged: { entry: WorktreeEntry; check: Awaited<ReturnType<typeof checkFolder>> }[] = [];
  for (const entry of entries) {
    let predicate = predicates.get(entry.path);
    if (!predicate) { predicate = checkFolder(git, { name: repository.name, kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, baseBranch: repository.baseBranch, worktreePath: entry.path }); predicates.set(entry.path, predicate); }
    judged.push({ entry, check: await predicate });
  }
  const gone = judged.find(one => one.check.state === "missing" || one.check.state === "holds_something_else" || one.entry.prunable !== undefined);
  if (gone) {
    const folder = displayPath(gone.entry.path);
    const what = gone.check.state === "missing" ? "is gone" : `now holds ${gone.check.holds ?? "something else"}`;
    const prune = `git -C ${displayPath(repository.mainCheckoutPath)} worktree prune`;
    const holdsCheckout = gone.check.state === "holds_something_else" && /checkout/.test(gone.check.holds ?? "");
    const steps = [...(holdsCheckout ? [`move that checkout away`] : []), ...(gone.entry.locked ? [`run git -C ${displayPath(repository.mainCheckoutPath)} worktree unlock ${folder}`] : []), `run ${prune}`];
    return say(`Git still records this branch at ${folder}, which ${what}. Git won't add the branch anywhere else until that record is cleared: ${steps.join(", then ")}.`);
  }
  const unknown = judged.find(one => one.check.state === "unknown");
  if (unknown) return say(`Kiln couldn't read ${displayPath(unknown.entry.path)}: ${unknown.check.unknown ?? "unknown"}.`);
  if (local !== undefined && origin !== undefined && local !== origin) {
    const present = await runGit(git, repository.mainCheckoutPath, ["cat-file", "-e", `${origin}^{commit}`]);
    let ahead = false;
    if (present.exitCode === 0) {
      const ancestor = await runGit(git, repository.mainCheckoutPath, ["merge-base", "--is-ancestor", origin, local]);
      if (ancestor.exitCode !== 0 && ancestor.exitCode !== 1) return say(`Kiln couldn't compare the local branch with origin's: ${gitError(ancestor)}`);
      ahead = ancestor.exitCode === 0;
    }
    if (!ahead) return say("Its local copy is behind or diverged from origin's, so Kiln's first push would be rejected, and Kiln never resets or force-pushes. Bring the local branch level with origin first.");
  }
  const inPlace = judged.find(one => one.check.state === "in_place");
  if (inPlace) return { kind: "worktree", path: inPlace.entry.path, local: local!, ...(origin ? { origin } : {}) };
  return { kind: "nowhere", ...(local ? { local } : {}), ...(origin ? { origin } : {}) };
}

export interface BranchChoice { name: string; available: boolean; reason?: string }

/**
 * The one list for the PRD (AC-FROM-03, AC-FROM-05): every local and origin branch name in each of
 * today's repositories, unavailable when any repository makes it so, with no fetch.
 */
export async function branchList(git: GitContext, repositories: StartRepository[], refs: Map<string, RepositoryRefs>, others: OtherPrdBranch[]): Promise<BranchChoice[]> {
  const names = new Set<string>();
  for (const repository of repositories) {
    const one = refs.get(repository.name)!;
    for (const name of one.local.keys()) names.add(name);
    for (const name of one.origin?.branches.keys() ?? []) names.add(name);
  }
  const multi = repositories.length > 1;
  const predicates = new Map<string, Promise<Awaited<ReturnType<typeof checkFolder>>>>();
  const list: BranchChoice[] = [];
  for (const name of [...names].sort()) {
    let reason: string | undefined;
    for (const repository of repositories) {
      const classified = await classifyBranch(git, repository, refs.get(repository.name)!, name, others, multi, predicates);
      if (classified.kind === "unavailable") { reason = classified.reason; break; }
    }
    list.push({ name, available: reason === undefined, ...(reason ? { reason } : {}) });
  }
  return list;
}

/** One offer for every qualifying repository, each with its own base and how far behind it the branch is (AC-CURRENT-01). */
export interface CatchUpOffer { repositories: { name: string; branch: string; base: string; behind: number }[] }

/** A repository of the selection, with the preview's reads for the selected name. */
export interface PreviewRepository extends StartRepository {
  hasBranch: boolean;
  baseTip?: string;
  tip?: string;
  /** Where the tip was read: the local branch, or origin's when there is none. */
  tipFrom?: "local" | "origin";
  originTip?: string;
  mergeBase?: string;
  ownCommits?: number;
  behind?: number;
  worktree?: { path: string; adopted: boolean; uncommittedFiles?: number; prdFiles?: string[] };
  pullRequest?: { number: number; url: string } | { unknown: string };
  qualifies: boolean;
}

export interface StartPreview {
  from: "new" | "existing";
  branch: string;
  bringUpToDate: boolean;
  repositories: PreviewRepository[];
  catchUp?: CatchUpOffer;
  planSource?: { kind: "base" | "branch" | "base_after_catch_up"; branch: string; sha: string };
  /** The documents read at the start commit (existing branch only). */
  documents?: { names: string[]; contents: Record<string, string>; unfollowed: { from: string; target: string; reason: string }[] };
  plan?: PhasePlan;
  closedCount: number;
  startAt?: { id: string; title: string };
  /** A multi-repository selection with existing worktrees: the one folder holding them, fixed. */
  workspaceFolder?: string;
  /** The message under Feature branch while Start is unavailable. */
  fieldError?: string;
  previewId: string;
}

export interface PreviewInput {
  git: GitContext;
  gh: string;
  env: NodeJS.ProcessEnv;
  prdDirectoryFromRoot: string;
  branch: string;
  bringUpToDate: boolean;
  /** Today's repositories, the PRD's first. */
  repositories: StartRepository[];
  /** Finds a repository the start commit's plan names beside the PRD's repository. */
  find: (name: string, namedIn: string) => Promise<{ ok: true; repository: { name: string; mainCheckoutPath: string; github: string } } | { ok: false; problem: string }>;
  /** The base a repository found from the start commit's plan uses. */
  baseOf: (name: string) => string;
  others: OtherPrdBranch[];
  refs?: Map<string, RepositoryRefs>;
}

const count = async (git: GitContext, cwd: string, range: string): Promise<number | undefined> => {
  const result = await runGit(git, cwd, ["rev-list", "--count", range]);
  return result.exitCode === 0 ? Number.parseInt(result.stdout.trim(), 10) : undefined;
};

/** Files in a worktree with uncommitted or untracked changes. */
export async function uncommittedFiles(git: GitContext, worktree: string): Promise<string[] | undefined> {
  // A read never takes the index lock, so it can't make a catch-up's fast-forward fail (run restart AC-CURRENT-01).
  const status = await runGit(git, worktree, ["--no-optional-locks", "status", "--porcelain", "--untracked-files=all"]);
  if (status.exitCode !== 0) return undefined;
  return status.stdout.split(/\r?\n/).filter(line => line.trim() !== "").map(line => line.slice(3).replace(/^.* -> /, ""));
}

/** The open pull request from the branch into the base, the query final delivery makes; a failed read is named. */
export async function openPullRequest(gh: string, env: NodeJS.ProcessEnv, cwd: string, github: string, branch: string, base: string): Promise<{ number: number; url: string } | { unknown: string } | undefined> {
  const result = await runHelper(gh, ["pr", "list", "--repo", `github.com/${github}`, "--head", branch, "--base", base, "--state", "open", "--json", "number,url"], { cwd, env, timeoutMs: 60_000 });
  if (result.exitCode !== 0) return { unknown: `Kiln couldn't read ${github}'s pull requests: ${(result.stderr || result.failure || "").trim().split(/\r?\n/)[0]}` };
  try {
    const pulls = JSON.parse(result.stdout) as { number: number; url: string }[];
    return pulls[0] ? { number: pulls[0].number, url: pulls[0].url } : undefined;
  } catch { return { unknown: `Kiln couldn't read ${github}'s pull requests: gh's answer wasn't JSON.` }; }
}

/** One repository's reads for the selected name (§The preview). */
async function readRepository(input: PreviewInput, repository: StartRepository, refs: RepositoryRefs, classified: Classification): Promise<{ repository: PreviewRepository; problem?: string }> {
  const { git, branch } = input;
  const main = repository.mainCheckoutPath;
  const baseTip = refs.origin?.branches.get(repository.baseBranch);
  const out: PreviewRepository = { ...repository, hasBranch: classified.kind === "worktree" || classified.kind === "nowhere", qualifies: false, ...(baseTip ? { baseTip } : {}) };
  if (repository.baseBranch === "") return { repository: out, problem: "Choose a base branch." };
  if (!baseTip) return { repository: out, problem: `${repository.baseBranch} isn’t on origin.` };
  if (!out.hasBranch) return { repository: out };
  const local = classified.kind === "worktree" ? classified.local : classified.kind === "nowhere" ? classified.local : undefined;
  const origin = classified.kind === "worktree" || classified.kind === "nowhere" ? classified.origin : undefined;
  const tip = local ?? origin!;
  out.tip = tip; out.tipFrom = local ? "local" : "origin";
  if (origin) out.originTip = origin;
  for (const sha of [baseTip, tip]) {
    const failed = await ensureObjects(git, main, sha, SETUP_TIMEOUT_MS);
    if (failed) return { repository: out, problem: `Couldn’t reach origin: ${gitError(failed)}` };
  }
  const mergeBase = await runGit(git, main, ["merge-base", tip, baseTip]);
  if (mergeBase.exitCode === 1) return { repository: out, problem: `${branch} shares no history with ${repository.baseBranch}, so Kiln can't start from it.` };
  if (mergeBase.exitCode !== 0) return { repository: out, problem: `Kiln couldn't read the merge base: ${gitError(mergeBase)}` };
  out.mergeBase = mergeBase.stdout.trim();
  const own = await count(git, main, `${baseTip}..${tip}`);
  const behind = await count(git, main, `${tip}..${baseTip}`);
  const originBehind = origin && origin !== tip ? await count(git, main, `${origin}..${baseTip}`) : undefined;
  if (own === undefined || behind === undefined) return { repository: out, problem: "Kiln couldn't count the branch's commits." };
  out.ownCommits = own;
  out.behind = Math.max(behind, originBehind ?? 0);
  let clean = true;
  if (classified.kind === "worktree") {
    const files = await uncommittedFiles(git, classified.path);
    if (files === undefined) return { repository: out, problem: `Kiln couldn't read ${displayPath(classified.path)}'s uncommitted files.` };
    const prdFiles = repository.kind === "prd" ? files.filter(file => file === input.prdDirectoryFromRoot || file.startsWith(`${input.prdDirectoryFromRoot}/`)) : [];
    out.worktree = { path: classified.path, adopted: true, uncommittedFiles: files.length, ...(prdFiles.length ? { prdFiles } : {}) };
    clean = files.length === 0;
  }
  out.qualifies = own === 0 && clean && out.behind > 0;
  const pull = await openPullRequest(input.gh, input.env, main, repository.github, branch, repository.baseBranch);
  if (pull) out.pullRequest = pull;
  return { repository: out };
}


/** The documents found in the PRD's directory at the start commit, by name. */
export function directoryNames(contents: Record<string, string>, directory: string): string[] {
  return Object.keys(contents).filter(file => posix.dirname(file) === directory).map(file => posix.basename(file)).sort();
}

/**
 * The preview for a selected existing branch (§The preview): per repository of the selection its
 * reads, the catch-up offer, the start commit in the PRD's repository and the documents and plan
 * read there, the closed leaves, the first open leaf, and `previewId`.
 */
export async function existingBranchPreview(input: PreviewInput): Promise<StartPreview> {
  const { git, branch } = input;
  const refs = input.refs ?? new Map(await Promise.all(input.repositories.map(async repository => [repository.name, await readRepositoryRefs(git, repository.mainCheckoutPath)] as const)));
  const prd = input.repositories[0]!;
  // A problem names its repository once the selection has several (AC-FROM-05); the selection is known only after the plan is read.
  const problems: { repository?: string; message: string }[] = [];
  const classifications = new Map<string, Classification>();
  const classify = async (repository: StartRepository) => {
    let one = refs.get(repository.name);
    if (!one) { one = await readRepositoryRefs(git, repository.mainCheckoutPath); refs.set(repository.name, one); }
    const classified = await classifyBranch(git, repository, one, branch, input.others, false);
    classifications.set(repository.name, classified);
    if (classified.kind === "unavailable") problems.push({ repository: repository.name, message: classified.reason });
    return classified;
  };
  for (const repository of input.repositories) await classify(repository);
  const read = new Map<string, PreviewRepository>();
  const readOne = async (repository: StartRepository) => {
    const classified = classifications.get(repository.name)!;
    // An unavailable branch the repository has still reads PR into on its row (AC-FROM-05).
    if (classified.kind === "unavailable") { const one = refs.get(repository.name); read.set(repository.name, { ...repository, hasBranch: !!one && branch !== repository.baseBranch && (one.local.has(branch) || !!one.origin?.branches.has(branch)), qualifies: false }); return; }
    const outcome = await readRepository(input, repository, refs.get(repository.name)!, classified);
    read.set(repository.name, outcome.repository);
    if (outcome.problem) problems.push({ repository: repository.name, message: outcome.problem });
  };
  await readOne(prd);
  const prdRead = read.get(prd.name)!;
  // The start commit (§The starting point): the branch's tip, or the base's tip while the offer is ticked and the repository qualifies.
  let planSource: StartPreview["planSource"];
  let documents: StartPreview["documents"];
  let plan: PhasePlan | undefined;
  if (prdRead.baseTip && (!prdRead.hasBranch || prdRead.tip)) {
    planSource = !prdRead.hasBranch ? { kind: "base", branch: prd.baseBranch, sha: prdRead.baseTip }
      : input.bringUpToDate && prdRead.qualifies ? { kind: "base_after_catch_up", branch: prd.baseBranch, sha: prdRead.baseTip }
      : { kind: "branch", branch, sha: prdRead.tip! };
    if (problems.length === 0) {
      try {
        const gitRead = await readGitPlan(git, prd.mainCheckoutPath, input.prdDirectoryFromRoot, planSource.sha);
        documents = { names: directoryNames(gitRead.source.documents, input.prdDirectoryFromRoot), contents: gitRead.source.documents, unfollowed: gitRead.unfollowed.map(link => ({ from: link.from, target: link.target, reason: link.reason })) };
        const directory = input.prdDirectoryFromRoot;
        plan = readPhasePlan(Object.entries(gitRead.source.documents).filter(([file]) => posix.dirname(file) === directory && isPhaseFileName(posix.basename(file))).map(([file, markdown]) => ({ fileName: posix.basename(file), markdown })));
        const planProblems = [...plan.problems, ...(plan.problems.length === 0 ? planStartProblems(plan, directory) : [])];
        if (planProblems.length) problems.push({ message: `The phase plan at ${shortSha(planSource.sha)} on ${planSource.branch} doesn't pass its checks: ${planProblems.join(" ")}` });
      } catch (error) {
        problems.push({ message: `${planSource.branch} at ${shortSha(planSource.sha)} doesn't have this PRD's documents: ${(error as Error).message}` });
      }
    }
  }
  // Which repositories (AC-FROM-05): those an earlier Start set up, the PRD's, and those the start commit's plan names.
  const selection: StartRepository[] = [...input.repositories.filter(repository => repository.kind !== "named" || repository.setUp)];
  if (plan && plan.problems.length === 0) {
    for (const name of namedRepositories(plan.phases, prd.name)) {
      if (selection.some(repository => repository.name === name)) continue;
      const today = input.repositories.find(repository => repository.name === name);
      if (today) { selection.push(today); continue; }
      const found = await input.find(name, plan.phases.find(phase => phase.repositories.includes(name))!.fileName);
      if (!found.ok) { problems.push({ message: found.problem }); continue; }
      // A repository only the start commit's plan names starts from v1's base rule unless the person chose one (AC-FROM-05).
      const foundRefs = await readRepositoryRefs(git, found.repository.mainCheckoutPath);
      refs.set(name, foundRefs);
      const repository: StartRepository = { ...found.repository, kind: "named", baseBranch: input.baseOf(name) || (foundRefs.origin ? defaultBaseBranch(foundRefs.origin) : "") };
      selection.push(repository);
      await classify(repository);
    }
  } else selection.push(...input.repositories.filter(repository => repository.kind === "named" && !repository.setUp));
  const multi = selection.length > 1;
  for (const repository of selection) if (!read.has(repository.name)) await readOne(repository);
  const repositories = selection.map(repository => read.get(repository.name)!);
  // Several repositories: existing worktrees share one workspace folder W, at <W>/<name>.
  let workspaceFolder: string | undefined;
  const worktrees = repositories.filter(repository => repository.worktree);
  if (multi && worktrees.length) {
    const folders = new Set(worktrees.map(repository => basename(repository.worktree!.path) === repository.name ? dirname(repository.worktree!.path) : `\0${repository.worktree!.path}`));
    if (folders.size === 1 && ![...folders][0]!.startsWith("\0")) workspaceFolder = [...folders][0];
    else problems.push({ message: `The branch's worktrees aren't in one workspace folder: ${joinNames(worktrees.map(repository => displayPath(repository.worktree!.path)))}. Each must be <folder>/<repository name> for one folder.` });
  }
  const prdFiles = prdRead.worktree?.prdFiles;
  if (prdFiles?.length) problems.push({ message: `${displayPath(prdRead.worktree!.path)} has uncommitted changes in the PRD's directory: ${joinNames(prdFiles)}. Commit or discard them in that worktree first.` });
  const qualifying = repositories.filter(repository => repository.qualifies);
  const catchUp: CatchUpOffer | undefined = qualifying.length ? { repositories: qualifying.map(repository => ({ name: repository.name, branch, base: repository.baseBranch, behind: repository.behind! })) } : undefined;
  const leaves = plan ? leavesOf(plan) : [];
  const closedCount = leaves.filter(leaf => leaf.closed).length;
  const open = leaves.find(leaf => !leaf.closed);
  const preview: Omit<StartPreview, "previewId"> = {
    from: "existing", branch, bringUpToDate: input.bringUpToDate, repositories,
    ...(catchUp ? { catchUp } : {}), ...(planSource ? { planSource } : {}), ...(documents ? { documents } : {}), ...(plan ? { plan } : {}),
    closedCount, ...(closedCount > 0 && open ? { startAt: { id: open.id, title: open.title } } : {}),
    ...(workspaceFolder ? { workspaceFolder } : {}), ...(problems.length ? { fieldError: problems[0]!.repository && multi ? `In ${problems[0]!.repository}: ${problems[0]!.message}` : problems[0]!.message } : {}),
  };
  return { ...preview, previewId: digestPreview(preview) };
}

/** `previewId`: a digest of everything Start would act on, with a pull request read's outcome but never an error's text. */
export function digestPreview(preview: Omit<StartPreview, "previewId">): string {
  const facts = {
    from: preview.from, branch: preview.branch, bringUpToDate: preview.bringUpToDate, fieldError: preview.fieldError ?? null,
    repositories: preview.repositories.map(repository => ({ name: repository.name, base: repository.baseBranch, baseTip: repository.baseTip ?? null, tip: repository.tip ?? null, mergeBase: repository.mergeBase ?? null, worktree: repository.worktree?.path ?? null, files: repository.worktree?.uncommittedFiles ?? null, pull: repository.pullRequest === undefined ? "none" : "number" in repository.pullRequest ? repository.pullRequest.number : "failed", qualifies: repository.qualifies })),
    planSource: preview.planSource ?? null, workspaceFolder: preview.workspaceFolder ?? null, closed: preview.closedCount,
  };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

/** A new-branch start's preview: the plan is read from the base branch, and `previewId` digests the settings Start acts on. */
export function newBranchPreview(branch: string, repositories: StartRepository[], baseTip: string | undefined, plan: PhasePlan | undefined): StartPreview {
  const leaves = plan ? leavesOf(plan) : [];
  const preview: Omit<StartPreview, "previewId"> = {
    from: "new", branch, bringUpToDate: true,
    repositories: repositories.map(repository => ({ ...repository, hasBranch: false, qualifies: false })),
    ...(baseTip ? { planSource: { kind: "base" as const, branch: repositories[0]!.baseBranch, sha: baseTip } } : {}),
    closedCount: leaves.filter(leaf => leaf.closed).length,
  };
  // Phases closed on the base branch count as closed before the run too: Kiln starts at the first open one (AC-FROM-02).
  const open = leaves.find(leaf => !leaf.closed);
  if (preview.closedCount > 0 && open) preview.startAt = { id: open.id, title: open.title };
  return { ...preview, previewId: digestPreview(preview) };
}

// ---- Catching a branch up -------------------------------------------------------------------

/** A repository as the catch-up reads it at the moment of use. */
export interface CatchUpTarget { name: string; mainCheckoutPath: string; worktreePath?: string; baseBranch: string }

export interface CatchUpReading { name: string; base: string; baseTip: string; local?: string; origin?: string; ownCommits: number; behind: number; qualifies: boolean }

/** A stopped phase's offer from each repository's reading: one row per qualifying repository, with its own base. */
export function stoppedCatchUpOffer(readings: CatchUpReading[], branch: string): CatchUpOffer | undefined {
  const qualifying = readings.filter(reading => reading.qualifies);
  return qualifying.length ? { repositories: qualifying.map(reading => ({ name: reading.name, branch, base: reading.base, behind: reading.behind })) } : undefined;
}

/**
 * Whether a repository's branch qualifies (§Catching a Branch Up), read now: no commits of its own,
 * its worktree on the branch with nothing uncommitted, and the local tip or origin's copy behind the
 * base's tip on origin. The branch and the base are asked of origin in one `ls-remote`.
 */
export async function readCatchUp(git: GitContext, target: CatchUpTarget, branch: string): Promise<CatchUpReading> {
  const main = expandHome(target.mainCheckoutPath);
  const remote = await runGit(git, main, ["ls-remote", "origin", `refs/heads/${target.baseBranch}`, `refs/heads/${branch}`]);
  if (remote.exitCode !== 0) throw new Error(`Kiln couldn't read origin for ${target.name}: ${gitError(remote)}`);
  const tips = new Map<string, string>();
  for (const line of remote.stdout.split(/\r?\n/)) { const match = /^([0-9a-f]{40,64})\trefs\/heads\/(.+)$/.exec(line); if (match) tips.set(match[2]!, match[1]!); }
  const baseTip = tips.get(target.baseBranch);
  if (!baseTip) throw new Error(`${target.baseBranch} isn’t on origin for ${target.name}.`);
  const origin = tips.get(branch);
  const localRead = await runGit(git, main, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]);
  const local = localRead.exitCode === 0 ? localRead.stdout.trim() : undefined;
  const tip = local ?? origin;
  const base = { name: target.name, base: target.baseBranch, baseTip, ...(local ? { local } : {}), ...(origin ? { origin } : {}) };
  if (!tip) return { ...base, ownCommits: 0, behind: 0, qualifies: false };
  const failed = await ensureObjects(git, main, baseTip, SETUP_TIMEOUT_MS);
  if (failed) throw new Error(`Couldn’t reach origin for ${target.name}: ${gitError(failed)}`);
  const own = await count(git, main, `${baseTip}..${tip}`);
  const behindLocal = await count(git, main, `${tip}..${baseTip}`);
  const behindOrigin = origin && origin !== tip ? (await ensureObjects(git, main, origin, SETUP_TIMEOUT_MS)) ? undefined : await count(git, main, `${origin}..${baseTip}`) : undefined;
  if (own === undefined || behindLocal === undefined) throw new Error(`Kiln couldn't count ${target.name}'s commits.`);
  // A branch origin doesn't have is not behind there: only the local tip counts (a branch Kiln cut is never pushed by Kiln).
  const behind = Math.max(behindLocal, behindOrigin ?? 0);
  let clean = true;
  if (target.worktreePath) {
    const worktree = expandHome(target.worktreePath);
    const [head, status] = await Promise.all([runGit(git, worktree, ["symbolic-ref", "--quiet", "--short", "HEAD"]), uncommittedFiles(git, worktree)]);
    if (status === undefined) throw new Error(`Kiln couldn't read ${target.name}'s uncommitted files.`);
    clean = head.exitCode === 0 && head.stdout.trim() === branch && status.length === 0;
  }
  return { ...base, ownCommits: own, behind: behindLocal > 0 ? behindLocal : behind, qualifies: own === 0 && clean && behind > 0 };
}

/**
 * Catches one repository's branch up (§Catching a Branch Up, Doing it), each step skipped when
 * already done: save `catchUp`, fast-forward the worktree to `to`, record it, then a plain push.
 * `record` is the step-3 save, given the commits moved; `save` persists step 1.
 */
export async function catchUpRepository(git: GitContext, entry: RepositoryEntry, branch: string, to: string, hooks: { save: () => void; record: (from: string, to: string, commits: number) => void }): Promise<void> {
  const main = expandHome(entry.mainCheckoutPath);
  const worktree = expandHome(entry.worktreePath);
  const tipRead = await runGit(git, main, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]);
  if (tipRead.exitCode !== 0) throw new Error(`${entry.name} has no local ${branch}.`);
  const local = tipRead.stdout.trim();
  // A saved catch-up that never landed follows this read of the base; at Start the caller passes the saved target.
  if (entry.catchUp && local !== entry.catchUp.to && entry.catchUp.to !== to) { entry.catchUp = { from: local, to }; hooks.save(); }
  if (!entry.catchUp && local !== to) { entry.catchUp = { from: local, to }; hooks.save(); }
  const target = entry.catchUp?.to ?? to;
  if (local !== target) {
    const failed = await ensureObjects(git, main, target, SETUP_TIMEOUT_MS);
    if (failed) throw new Error(`Couldn’t fetch ${entry.baseBranch} from origin: ${gitError(failed)}`);
    const merged = await runGit(git, worktree, ["merge", "--ff-only", target], SETUP_TIMEOUT_MS);
    if (merged.exitCode !== 0) throw new Error(`Couldn’t bring ${branch} up to date in ${entry.name}: ${gitError(merged)}`);
  }
  if (entry.catchUp) {
    const moved = await count(git, main, `${entry.catchUp.from}..${entry.catchUp.to}`) ?? 0;
    hooks.record(entry.catchUp.from, entry.catchUp.to, moved);
  }
  const origin = await runGit(git, main, ["ls-remote", "origin", `refs/heads/${branch}`]);
  if (origin.exitCode !== 0) throw new Error(`Couldn’t reach origin: ${gitError(origin)}`);
  if (origin.stdout.trim().split(/\s/)[0] !== target) {
    const pushed = await runGit(git, worktree, ["push", "origin", `${branch}`], SETUP_TIMEOUT_MS);
    if (pushed.exitCode !== 0) throw new Error(`Couldn’t push ${branch} in ${entry.name}: ${gitError(pushed)}`);
  }
}

/** The one-sentence account a prompt carries of a catch-up (§Catching a Branch Up). */
export function catchUpSentence(row: { repository: string; branch: string; from: string; to: string }, multi: boolean): string {
  return `Kiln brought ${row.branch}${multi ? ` in ${row.repository}` : ""} up to date with its base before this session, moving it from ${shortSha(row.from)} to ${shortSha(row.to)}.`;
}

