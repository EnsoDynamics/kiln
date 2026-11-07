// What Kiln still knows when a run's folder is missing (missing worktree recovery technical
// design, "The Facts"): read-only reads of each shared checkout and origin, the plan on the base
// branch and the feature branch beside the saved one, and the existing branch's availability,
// which decides the restore command (AC-SETUP-06) and, later, the setup panel's starting points.
// Every read records success or its error; a value derived from a failed read is withheld.

import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import type { PrdRecord, RepositoryEntry } from "../state/records.js";
import { ensureObjects, parseWorktreeList, runGit, type GitContext } from "./git-reads.js";
import { observeGitPlan, HISTORICAL_PLAN_READ } from "./completed-plan-sources.js";
import { displayPath, expandHome } from "./worktree-setup.js";
import { worktreeAt, type FolderCheck, type FolderClassification, type FolderState } from "./folder-check.js";
import { effectiveRecordedClosed } from "./waivers.js";
import type { PlannedPhase } from "../plan/phase-plan.js";
import type { PlanSource } from "./plan-reconciliation.js";
import type { WorktreeEntry } from "./git-reads.js";

export interface CommitFact { sha: string; date?: string }

export interface FolderMissingRepository {
  name: string;
  /** For display, under `~/`. */
  savedFolder: string;
  branch: string;
  setUpAt?: string;
  state: FolderState;
  holds?: string;
  /** Whether git still records a worktree at the saved folder; absent when that read failed. */
  gitRecord?: "listed" | "none";
  featureBranch: {
    /** Neither the shared checkout nor origin has it, both read. */
    gone?: true;
    local?: CommitFact;
    origin?: CommitFact;
    /** The shared checkout's branch against origin's, when both exist. */
    relation?: "same" | "ahead" | "behind" | "diverged";
    /** The feature tip is in the base branch (AC-FACTS-01's test); absent when unknown or there is no tip. */
    inBase?: boolean;
    notInBaseCount?: number;
    /** A folder that exists and is not the run's worktree, where git records the branch. */
    elsewhere?: string;
    /** A path git still records the branch at, that no longer exists and is not the saved folder. */
    recordedAtMissing?: string;
  };
  lastPushed?: { sha: string; phaseId: string; onOrigin?: boolean; inBase?: boolean };
  /** Reads that failed, worded for the page. */
  unknown: string[];
}

export type SavedPlanLabel = "out_of_date" | "matches_branch" | "matches_base" | "ahead" | "not_compared";

export interface FolderMissingPlans {
  saved: { total: number; done: number; readAt?: string; label: SavedPlanLabel; aheadPhases?: string[]; comparedWith?: "branch" | "base" };
  /** Leaves closed on the feature branch and not in the base branch's plan, when the run's latest work lives on the branch. */
  branchOnly?: string[];
  base: { source: "origin" | "local"; branch: string; sha: string; total: number; closed: number; next?: { id: string; title: string } } | { error: string; branch: string };
  /** Internal: the feature plan could not be read, which withholds the existing-branch start. Never published. */
  featurePlanFailed?: true;
}

export type Availability = { available: true } | { available: false; reason: string } | { available: "unknown"; reason: string };

export interface FolderMissingView {
  checkedAt: string;
  repositories: FolderMissingRepository[];
  plans: FolderMissingPlans;
  /** The run's existing feature branch as a starting point (AC-SETUP-02's reasons for it). */
  existingBranch: Availability;
  /** AC-SETUP-06; empty when none is offered. */
  restoreCommands: string[];
  factsId: string;
  /** Internal: what the setup panel builds on (missing worktree recovery, "The Setup Panel"). Never published, and not in `factsId`. */
  reads: FolderFactReads;
}

/** One repository's reads, for the setup panel and Start. */
export interface RepositoryRead {
  name: string;
  entry: RepositoryEntry;
  check: FolderClassification;
  base?: { sha: string; source: "origin" | "local" };
  localSha?: string;
  originSha?: string;
  tip?: string;
  /** Git's worktree list in the shared checkout; absent when that read failed. */
  worktrees?: WorktreeEntry[];
  localRead: boolean;
  originRead: boolean;
  workNotInBase: boolean | "unknown";
}

export interface FolderFactReads {
  repositories: RepositoryRead[];
  /** The base branch's plan in the PRD's repository, at the base commit. */
  basePlan?: PlanSource;
  /** The feature branch's plan at its tip, when read. */
  featurePlan?: PlanSource;
}

type Three = boolean | "unknown";
interface RepositoryReads {
  entry: RepositoryEntry;
  check: FolderClassification;
  facts: FolderMissingRepository;
  /** The commit the base branch is read at, and where. */
  base?: { sha: string; source: "origin" | "local" };
  /** The feature branch's tip: the shared checkout's, else origin's. */
  tip?: string;
  /** False when neither the local nor the origin read failed and neither has the branch. */
  gone: Three;
  /** Work not in the base branch. */
  workNotInBase: Three;
  worktreesRead: boolean;
  originRead: boolean;
  localRead: boolean;
  worktrees?: WorktreeEntry[];
  localSha?: string;
  originSha?: string;
  /** A failed existing-branch start's own worktree holds the branch, at a folder other than the saved one. */
  startFolderHoldsBranch?: boolean;
}

const leavesOf = <T extends { splitInto?: string[] | undefined }>(phases: T[]) => phases.filter(phase => phase.splitInto === undefined);

/**
 * The read-only facts for every set-up repository of a run whose folder check failed. Reads run
 * per repository in parallel under the signal the engine passes (its reconciliation deadline).
 */
export async function gatherFolderFacts(input: { git: GitContext; record: PrdRecord; check: FolderCheck; prdDirectoryFromRoot: string; now?: Date; startFolders?: Record<string, string> }): Promise<FolderMissingView> {
  const { git, record, check } = input;
  const branch = record.settings.featureBranch;
  const reads = await Promise.all(check.repositories.map(classification => readRepository(git, record, classification, branch, input.startFolders?.[classification.name])));
  const sources: { basePlan?: PlanSource; featurePlan?: PlanSource } = {};
  const plans = await readPlans(git, record, reads, input.prdDirectoryFromRoot, sources);
  // The existing-branch start depends on the feature plan too (The Facts, "What can't be checked").
  const existingBranch = plans.featurePlanFailed ? { available: "unknown" as const, reason: `Kiln couldn’t read the plan on ${branch}.` } : availability(reads);
  delete plans.featurePlanFailed;
  // A failed start's own worktree holds the branch, so putting the saved folder back by hand would fail.
  const restoreCommands = existingBranch.available === true && !reads.some(read => read.startFolderHoldsBranch)
    ? reads.filter(read => read.check.state === "missing").flatMap(read => {
      const shared = shellWord(displayPath(expandHome(read.entry.mainCheckoutPath)));
      const onlyOrigin = !read.facts.featureBranch.local && !!read.facts.featureBranch.origin;
      return [...(onlyOrigin ? [`git -C ${shared} fetch origin ${shellWord(branch)}`] : []), `git -C ${shared} worktree add -f ${shellWord(displayPath(read.check.savedFolder))} ${shellWord(branch)}`];
    })
    : [];
  const body = { repositories: reads.map(read => read.facts), plans, existingBranch, restoreCommands };
  const factsId = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const detail: FolderFactReads = { repositories: reads.map(read => ({ name: read.entry.name, entry: read.entry, check: read.check, ...(read.base ? { base: read.base } : {}), ...(read.localSha ? { localSha: read.localSha } : {}), ...(read.originSha ? { originSha: read.originSha } : {}), ...(read.tip ? { tip: read.tip } : {}), ...(read.worktrees ? { worktrees: read.worktrees } : {}), localRead: read.localRead, originRead: read.originRead, workNotInBase: read.workNotInBase })), ...sources };
  return { checkedAt: (input.now ?? new Date()).toISOString(), ...body, factsId, reads: detail };
}

/** `startFolder`: the folder a failed existing-branch start made on the branch, which is not "another folder" (AC-SAFE-01). */
async function readRepository(git: GitContext, record: PrdRecord, check: FolderClassification, branch: string, startFolder?: string): Promise<RepositoryReads> {
  const entry = record.repositories.find(candidate => candidate.name === check.name)!;
  const main = check.mainCheckoutPath;
  const facts: FolderMissingRepository = { name: entry.name, savedFolder: displayPath(check.savedFolder), branch, ...(entry.setupCompletedAt ? { setUpAt: entry.setupCompletedAt } : {}), state: check.state, ...(check.holds ? { holds: check.holds } : {}), featureBranch: {}, unknown: [] };
  const reads: RepositoryReads = { entry, check, facts, gone: "unknown", workNotInBase: "unknown", worktreesRead: false, originRead: false, localRead: false };
  if (check.state === "unknown" && check.unknown) facts.unknown.push(check.unknown);

  const [list, local, remote, localBase] = await Promise.all([
    runGit(git, main, ["worktree", "list", "--porcelain"]),
    runGit(git, main, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]),
    runGit(git, main, ["ls-remote", "origin", `refs/heads/${branch}`, `refs/heads/${entry.baseBranch}`]),
    runGit(git, main, ["rev-parse", "--verify", "--quiet", `refs/heads/${entry.baseBranch}^{commit}`]),
  ]);

  // Git's records: the saved folder, and the branch in another folder.
  if (list.exitCode === 0) {
    reads.worktreesRead = true;
    const worktrees = parseWorktreeList(list.stdout);
    reads.worktrees = worktrees;
    facts.gitRecord = worktreeAt(worktrees, check.savedFolder) ? "listed" : "none";
    const saved = worktreeAt(worktrees, check.savedFolder);
    const started = startFolder ? worktreeAt(worktrees, startFolder) : undefined;
    for (const worktree of worktrees.filter(one => one.branch === branch)) {
      const isSaved = worktree === saved;
      if (worktree === started && worktree.prunable === undefined && exists(worktree.path)) { reads.startFolderHoldsBranch = !isSaved; continue; }
      if (exists(worktree.path)) {
        // A saved folder that couldn't be checked leaves availability unknown, never "elsewhere".
        if (!isSaved || check.state === "holds_something_else") facts.featureBranch.elsewhere ??= displayPath(worktree.path);
      } else if (!isSaved) facts.featureBranch.recordedAtMissing ??= displayPath(worktree.path);
    }
  } else facts.unknown.push("Git’s list of worktrees");

  // The feature branch in the shared checkout and on origin.
  let localSha: string | undefined;
  if (local.exitCode === 0) { reads.localRead = true; localSha = local.stdout.trim(); reads.localSha = localSha; }
  else if (local.exitCode === 1 && !local.stdout.trim()) reads.localRead = true;
  else facts.unknown.push(`your checkout’s ${branch}`);
  let originSha: string | undefined; let originBase: string | undefined;
  if (remote.exitCode === 0) {
    reads.originRead = true;
    for (const line of remote.stdout.split(/\r?\n/)) {
      const [sha, ref] = line.trim().split(/\s+/);
      if (ref === `refs/heads/${branch}` && sha) { originSha = sha; reads.originSha = sha; }
      if (ref === `refs/heads/${entry.baseBranch}`) originBase = sha;
    }
  } else facts.unknown.push(`${branch} on origin`);
  reads.gone = reads.localRead && reads.originRead ? !localSha && !originSha : localSha ? false : "unknown";
  if (reads.gone === true) facts.featureBranch.gone = true;
  const tip = localSha ?? originSha;
  if (tip) reads.tip = tip;

  // The base commit: origin's when it can be reached, else the shared checkout's own (AC-FACTS-02).
  if (originBase) reads.base = { sha: originBase, source: "origin" };
  else if (!reads.originRead && localBase.exitCode === 0) reads.base = { sha: localBase.stdout.trim(), source: "local" };
  else if (reads.originRead && !originBase) facts.unknown.push(`${entry.baseBranch} on origin`);
  else facts.unknown.push(`your checkout’s ${entry.baseBranch}`);

  // Objects for origin's commits, written as objects only (no ref), then dates.
  const needed = [originSha, reads.base?.source === "origin" ? reads.base.sha : undefined].filter((sha): sha is string => !!sha);
  for (const sha of needed) await ensureObjects(git, main, sha);
  if (localSha) facts.featureBranch.local = await commitFact(git, main, localSha, facts);
  if (originSha && originSha !== localSha) facts.featureBranch.origin = await commitFact(git, main, originSha, facts);
  else if (originSha) facts.featureBranch.origin = facts.featureBranch.local!;
  if (localSha && originSha) {
    if (localSha === originSha) facts.featureBranch.relation = "same";
    else {
      const counts = await runGit(git, main, ["rev-list", "--left-right", "--count", `${localSha}...${originSha}`]);
      const [ahead, behind] = counts.exitCode === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [];
      if (ahead === undefined || behind === undefined || Number.isNaN(ahead) || Number.isNaN(behind)) facts.unknown.push(`how your checkout’s ${branch} compares with origin’s`);
      else facts.featureBranch.relation = ahead && behind ? "diverged" : ahead ? "ahead" : behind ? "behind" : "same";
    }
  }

  // Whether the feature tip is already in the base branch.
  if (reads.tip && reads.base) {
    const inBase = await inBaseBranch(git, main, record, entry, reads.tip, reads.base.sha);
    if (inBase === "unknown") facts.unknown.push(`whether ${branch} is in ${entry.baseBranch}`);
    else {
      facts.featureBranch.inBase = inBase;
      if (!inBase) {
        const count = await runGit(git, main, ["rev-list", "--count", `${reads.base.sha}..${reads.tip}`]);
        const counted = Number.parseInt(count.stdout.trim(), 10);
        if (count.exitCode === 0 && !Number.isNaN(counted)) facts.featureBranch.notInBaseCount = counted;
        else facts.unknown.push(`how many commits on ${branch} aren’t in ${entry.baseBranch}`);
      }
    }
    // Origin unreachable: only the local tip having work not in the base branch settles it; origin's branch may hold more.
    reads.workNotInBase = inBase === "unknown" ? "unknown" : !inBase ? true : reads.originRead ? false : "unknown";
  } else if (reads.gone === true) reads.workNotInBase = false;
  else if (reads.tip && !reads.base) facts.unknown.push(`whether ${branch} is in ${entry.baseBranch}`);

  // The last commit this run recorded as pushed.
  const pushed = Object.entries(record.phases).flatMap(([key, phase]) => phase.doneAt && phase.repositories?.[entry.name]?.pushedSha ? [{ key, doneAt: phase.doneAt, sha: phase.repositories[entry.name]!.pushedSha! }] : []).sort((a, b) => a.doneAt.localeCompare(b.doneAt)).at(-1);
  if (pushed) {
    const last: NonNullable<FolderMissingRepository["lastPushed"]> = { sha: pushed.sha, phaseId: pushed.key };
    // A failed read is named (AC-FACTS-03); an unreachable origin or unread base is already named above.
    if (reads.originRead) {
      if (!originSha) last.onOrigin = false;
      else {
        const on = await ancestry(git, main, pushed.sha, originSha);
        if (on !== "unknown") last.onOrigin = on;
        else facts.unknown.push(PUSHED_ON_ORIGIN);
      }
    }
    if (reads.base) {
      const inBase = await inBaseBranch(git, main, record, entry, pushed.sha, reads.base.sha);
      if (inBase !== "unknown") last.inBase = inBase;
      else facts.unknown.push(pushedInBase(entry.baseBranch));
    }
    facts.lastPushed = last;
  }
  return reads;
}

/** A word for a shell command line: quoted when it holds anything a shell would split or expand, `~/` kept outside the quotes. */
function shellWord(word: string): string {
  if (/^[\w@%+=:,./~-]+$/.test(word)) return word;
  const home = word.startsWith("~/") ? "~/" : "";
  return `${home}'${word.slice(home.length).replace(/'/g, `'\\''`)}'`;
}

function exists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

/** The unknown-read wording for the last pushed commit; the page names these inside that commit's row (`factRows`). */
const PUSHED_ON_ORIGIN = "whether this run’s last pushed commit is on origin";
const pushedInBase = (base: string) => `whether this run’s last pushed commit is in ${base}`;

async function commitFact(git: GitContext, cwd: string, sha: string, facts: FolderMissingRepository): Promise<CommitFact> {
  const date = await runGit(git, cwd, ["log", "-1", "--format=%cI", sha]);
  if (date.exitCode === 0 && date.stdout.trim()) return { sha, date: date.stdout.trim() };
  facts.unknown.push(`the date of commit ${sha.slice(0, 7)}`);
  return { sha };
}

/** `merge-base --is-ancestor`, keeping a failed read apart from "no". */
async function ancestry(git: GitContext, cwd: string, ancestor: string, descendant: string): Promise<Three> {
  const result = await runGit(git, cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
  return result.exitCode === 0 ? true : result.exitCode === 1 ? false : "unknown";
}

/**
 * "In the base branch" everywhere in this design (The Facts): the base commit contains it, or a
 * confirmed merge Kiln recorded for the run contains it and the base commit contains that merge.
 */
export async function inBaseBranch(git: GitContext, cwd: string, record: PrdRecord, entry: RepositoryEntry, sha: string, baseSha: string): Promise<Three> {
  const direct = await ancestry(git, cwd, sha, baseSha);
  if (direct !== false) return direct;
  for (const checkpoint of record.developmentDelivery?.checkpoints ?? []) {
    const merge = checkpoint.merge;
    // Only a confirmed merge counts, as completed-plan accounting reads one.
    if (!merge || checkpoint.mergeUnresolvedReason || checkpoint.supersededBy || checkpoint.target.repository !== `github.com/${entry.github}`.toLowerCase() || checkpoint.target.baseBranch !== entry.baseBranch || merge.sourceHead !== checkpoint.headSha || merge.mergedHead !== merge.sourceHead) continue;
    const [inSource, merged] = [await ancestry(git, cwd, sha, merge.sourceHead), await ancestry(git, cwd, merge.resultSha, baseSha)];
    if (inSource === "unknown" || merged === "unknown") return "unknown";
    if (inSource && merged) return true;
  }
  return false;
}

/** The run's existing feature branch as a starting point, read across repositories (AC-SETUP-02, AC-SETUP-07). */
function availability(reads: RepositoryReads[]): Availability {
  const multi = reads.length > 1;
  for (const read of reads) {
    const named = (text: string) => multi ? `in ${read.entry.name}, ${text}` : text;
    if (read.gone === true) return { available: false, reason: named("the branch was deleted.") };
    if (read.facts.featureBranch.elsewhere) return { available: false, reason: named(`it’s checked out in ${read.facts.featureBranch.elsewhere}, and git allows a branch in one folder at a time.`) };
    if (read.facts.featureBranch.recordedAtMissing) return { available: false, reason: named(`git still records it at ${read.facts.featureBranch.recordedAtMissing}, a folder that no longer exists, and won’t add it elsewhere until that record is cleared.`) };
    const relation = read.facts.featureBranch.relation;
    if (relation === "behind" || relation === "diverged") return { available: false, reason: named(`your checkout’s branch is ${relation === "behind" ? "behind" : "diverged from"} origin’s, so its first push would be rejected.`) };
    if (multi && read.check.state === "holds_something_else") return { available: false, reason: `${read.entry.name}’s saved folder holds something else.` };
  }
  const unknown = reads.find(read => read.gone === "unknown" || !read.worktreesRead || !read.originRead || !read.localRead || read.check.state === "unknown" || read.facts.featureBranch.local && read.facts.featureBranch.origin && !read.facts.featureBranch.relation);
  if (unknown) return { available: "unknown", reason: unknown.originRead ? "Kiln couldn’t read everything it needs about the branch." : "Kiln couldn’t reach origin." };
  return { available: true };
}

async function readPlans(git: GitContext, record: PrdRecord, reads: RepositoryReads[], directory: string, sources: { basePlan?: PlanSource; featurePlan?: PlanSource }): Promise<FolderMissingPlans> {
  const savedLeaves = leavesOf(record.plan ?? []);
  const savedClosed = new Map(savedLeaves.map(leaf => [leaf.id, effectiveRecordedClosed(record, leaf)]));
  const readAt = record.planReadAt ?? (record.planReconciliation?.check?.status === "accepted" ? record.planReconciliation.check.attemptedAt : undefined);
  const saved: FolderMissingPlans["saved"] = { total: savedLeaves.length, done: [...savedClosed.values()].filter(Boolean).length, ...(readAt ? { readAt } : {}), label: "not_compared" };
  const prd = reads.find(read => read.entry.kind === "prd") ?? reads[0];
  const baseBranch = prd?.entry.baseBranch ?? record.settings.baseBranch;
  if (!prd?.base) return { saved, base: { error: `${baseBranch} could not be read`, branch: baseBranch } };
  const main = prd.check.mainCheckoutPath;
  let basePlan: PlannedPhase[];
  try { sources.basePlan = await observeGitPlan(git, main, directory, prd.base.sha, HISTORICAL_PLAN_READ); basePlan = sources.basePlan.plan.phases; }
  catch (error) { prd.facts.unknown.push(`the plan on ${baseBranch}`); return { saved, base: { error: `The plan on ${baseBranch} couldn’t be read: ${(error as Error).message}`, branch: baseBranch } }; }
  const baseLeaves = leavesOf(basePlan);
  const next = baseLeaves.find(leaf => !leaf.closed);
  const base = { source: prd.base.source, branch: baseBranch, sha: prd.base.sha, total: baseLeaves.length, closed: baseLeaves.filter(leaf => leaf.closed).length, ...(next ? { next: { id: next.id, title: next.title } } : {}) };
  // The feature plan, for the existing-branch start, whenever there is a tip (The Setup Panel, What will run).
  if (prd.tip) { try { sources.featurePlan = await observeGitPlan(git, main, directory, prd.tip, HISTORICAL_PLAN_READ); } catch { /* Read again below where it decides the label. */ } }
  // Where the run's latest work lives: the feature branch when it has work not in the base branch.
  if (prd.workNotInBase === "unknown") return { saved, base };
  let compared: PlannedPhase[] = basePlan; let where: "branch" | "base" = "base";
  if (prd.workNotInBase && prd.tip) {
    try { compared = (sources.featurePlan ?? await observeGitPlan(git, main, directory, prd.tip, HISTORICAL_PLAN_READ)).plan.phases; where = "branch"; }
    catch { prd.facts.unknown.push(`the plan on ${record.settings.featureBranch}`); return { saved, base, featurePlanFailed: true }; }
  }
  const baseClosed = new Set(baseLeaves.filter(leaf => leaf.closed).map(leaf => leaf.id));
  const branchOnly = where === "branch" ? leavesOf(compared).filter(leaf => leaf.closed && !baseClosed.has(leaf.id)).map(leaf => leaf.id) : [];
  return { saved: { ...saved, ...savedLabel(savedClosed, compared, where), comparedWith: where }, base, ...(branchOnly.length ? { branchOnly } : {}) };
}

/**
 * AC-FACTS-02's table: the first row that applies. A saved plan that differs only by unclosed
 * phases the compared plan lacks matches no row; it is labelled Out of date, since it does not
 * agree with where the work now lives and records no closed phase that plan lacks.
 */
export function savedLabel(saved: Map<string, boolean>, compared: { id: string; closed: boolean; splitInto?: string[] | undefined }[], where: "branch" | "base"): { label: SavedPlanLabel; aheadPhases?: string[] } {
  const other = new Map(leavesOf(compared).map(leaf => [leaf.id, leaf.closed]));
  const lacks = [...other].some(([id, closed]) => !saved.has(id) || closed && !saved.get(id));
  if (lacks) return { label: "out_of_date" };
  const ahead = [...saved].filter(([id, closed]) => closed && !other.get(id)).map(([id]) => id);
  if (!ahead.length && saved.size === other.size) return { label: where === "branch" ? "matches_branch" : "matches_base" };
  if (ahead.length) return { label: "ahead", aheadPhases: ahead };
  return { label: "out_of_date" };
}
