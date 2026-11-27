// Where a PRD started by hand stands, and which branch holds it (Kiln Requirements Stages,
// technical design "What `kiln run` accepts": a branch that holds a PRD directory, a method run
// part-way through). Shared by `kiln run` and the home screen, which read the same Git facts.

import { posix } from "node:path";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listWorktrees, runGit, type GitContext } from "../engine/git-reads.js";
import { isPhaseFileName } from "../plan/phase-ids.js";

/** One branch that holds a PRD directory: its name, the ref read and that ref's tip. */
export interface HoldingBranch { name: string; ref: string; tip: string; date: number }

interface Ref { name: string; ref: string; tip: string; date: number }

/** Every local branch and every branch of origin as last fetched, `origin/HEAD` aside; never fetched. */
export async function readBranchRefs(git: GitContext, cwd: string): Promise<{ local: Map<string, Ref>; remote: Map<string, Ref> }> {
  const result = await runGit(git, cwd, ["for-each-ref", "--format=%(refname)%00%(objectname)%00%(committerdate:unix)", "refs/heads/", "refs/remotes/origin/"]);
  const local = new Map<string, Ref>();
  const remote = new Map<string, Ref>();
  if (result.exitCode !== 0) return { local, remote };
  for (const line of result.stdout.split(/\r?\n/)) {
    const [ref, tip, date] = line.split("\0");
    if (!ref || !tip) continue;
    if (ref.startsWith("refs/heads/")) { const name = ref.slice(11); local.set(name, { name, ref, tip, date: Number(date) || 0 }); }
    else if (ref !== "refs/remotes/origin/HEAD") { const name = ref.slice(20); remote.set(name, { name, ref, tip, date: Number(date) || 0 }); }
  }
  return { local, remote };
}

async function treeOf(git: GitContext, cwd: string, commit: string, directory: string): Promise<string | undefined> {
  const result = await runGit(git, cwd, ["rev-parse", "--verify", "--quiet", `${commit}:${directory}`]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

/**
 * The branches that hold `directory` (technical design, "A branch holds a PRD directory"): at its
 * tip the directory exists, the branch has a commit changing it that neither copy of the shared
 * branch has, and its content differs from both copies, so a branch merged by squash doesn't hold
 * it. Newest tip first. `exclude` names the branches another Kiln run started.
 *
 *   await branchesHolding(git, repo, "docs/changes/return-labels", "develop", new Set())
 *   // [{ name: "prd/return-labels", ref: "refs/heads/prd/return-labels", tip: "b83d…", date: 1795… }]
 */
export async function branchesHolding(git: GitContext, cwd: string, directory: string, shared: string, exclude: ReadonlySet<string> = new Set(), refs?: Awaited<ReturnType<typeof readBranchRefs>>): Promise<HoldingBranch[]> {
  const { local, remote } = refs ?? await readBranchRefs(git, cwd);
  const sharedTips = [local.get(shared)?.tip, remote.get(shared)?.tip].filter((tip): tip is string => !!tip);
  const sharedTrees = await Promise.all(sharedTips.map(tip => treeOf(git, cwd, tip, directory)));
  const own = posix.basename(directory);
  const held: HoldingBranch[] = [];
  for (const name of new Set([...local.keys(), ...remote.keys()])) {
    if (name === shared || exclude.has(name)) continue;
    if (name.startsWith("prd/") && name.slice(4) !== own) continue;
    const copies = [local.get(name), remote.get(name)].filter((copy): copy is Ref => !!copy);
    let holds = false;
    for (const copy of copies) {
      const tree = await treeOf(git, cwd, copy.tip, directory);
      if (!tree || sharedTrees.some(shared => shared === tree)) continue;
      const own = await runGit(git, cwd, ["rev-list", "-1", copy.tip, ...sharedTips.map(tip => `^${tip}`), "--", directory]);
      if (own.exitCode === 0 && own.stdout.trim()) { holds = true; break; }
    }
    if (!holds) continue;
    const read = copies[0]!;
    held.push({ name, ref: read.ref, tip: read.tip, date: read.date });
  }
  return held.sort((a, b) => b.date - a.date);
}

/**
 * The method's files that say a run is part-way through, in every worktree of the repository
 * (technical design, "A method run part-way through"): the PRD refinement's state file whenever
 * present, the design refinement's state and pending-feedback files when untracked or modified.
 * One line each, naming where and what to do.
 */
export async function partWayProblems(git: GitContext, mainCheckout: string, directory: string): Promise<string[]> {
  const listed = await listWorktrees(git, mainCheckout);
  const worktrees = listed.ok ? listed.worktrees.map(worktree => worktree.path) : [mainCheckout];
  const folder = posix.basename(directory);
  const problems: string[] = [];
  for (const worktree of worktrees) {
    if (existsSync(join(worktree, directory, `${folder}-prd-refinement-state.md`))) problems.push(`The PRD refinement is part-way through in ${worktree} with its work not committed. Resume it there and let it finish, or tell it to stop, which commits what it has. Then start again.`);
    for (const [file, line] of [
      [`${folder}-design-refinement-state.md`, `The design refinement has work since its last checkpoint in ${worktree}. Resume it there to its next checkpoint or its end. Then start again.`],
      [`${folder}-pending-feedback-changes.md`, `Stakeholder feedback is part-way through being applied in ${worktree}. Finish that round there and commit it. Then start again.`],
    ] as const) {
      if (!existsSync(join(worktree, directory, file))) continue;
      const status = await runGit(git, worktree, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", `${directory}/${file}`]);
      if (status.exitCode !== 0 || status.stdout.trim()) problems.push(line);
    }
  }
  return problems;
}

/**
 * Where a PRD's documents stand, from its file names alone (AC-HOME-04): the documents can't
 * tell a PRD drafted from one refined, so the line names what exists.
 *
 *   documentsStand(["return-labels-prd.md"], "return-labels")  // "PRD written, no technical design yet"
 */
export function documentsStand(files: string[], folder: string): string {
  const phases = files.filter(isPhaseFileName).length;
  if (phases) return `Phase plan of ${phases} written`;
  if (files.some(file => file === "technical-design.md" || file === `${folder}-technical-design.md`)) return "Technical design written, no phase plan";
  if (files.includes(`${folder}-prd.md`)) return "PRD written, no technical design yet";
  return "No PRD written yet";
}

/** The file names directly in a directory at a commit. */
export async function filesAt(git: GitContext, cwd: string, commit: string, directory: string): Promise<string[]> {
  const result = await runGit(git, cwd, ["--literal-pathspecs", "ls-tree", "--name-only", "-z", commit, "--", `${directory}/`]);
  return result.exitCode === 0 ? result.stdout.split("\0").filter(Boolean).map(path => posix.basename(path)) : [];
}

/**
 * Every PRD directory each branch holds, in one Git log per branch (the home screen's read of
 * "A branch holds a PRD directory"): the directories its commits change that neither copy of
 * the shared branch has, kept when their content differs from both copies. Newest tip first per
 * directory.
 */
const heldCache = new Map<string, string[]>();

export async function holdingByDirectory(git: GitContext, cwd: string, shared: string, exclude: ReadonlySet<string>, refs: Awaited<ReturnType<typeof readBranchRefs>>): Promise<Map<string, HoldingBranch[]>> {
  const { local, remote } = refs;
  const sharedTips = [local.get(shared)?.tip, remote.get(shared)?.tip].filter((tip): tip is string => !!tip);
  const sharedTree = new Map<string, (string | undefined)[]>();
  const held = new Map<string, HoldingBranch[]>();
  for (const name of new Set([...local.keys(), ...remote.keys()])) {
    if (name === shared || exclude.has(name)) continue;
    const copies = [local.get(name), remote.get(name)].filter((copy): copy is Ref => !!copy);
    const directories = new Set<string>();
    for (const copy of copies) {
      // Cached by the tip and both shared tips, so an unchanged branch costs nothing on the next scan.
      const key = `${cwd}\0${copy.tip}\0${sharedTips.join(",")}`;
      let found = heldCache.get(key);
      if (!found) {
        found = [];
        const log = await runGit(git, cwd, ["log", "--format=", "--name-only", "--no-renames", copy.tip, ...sharedTips.map(tip => `^${tip}`), "--", "docs/prds", "docs/changes"]);
        const candidates = new Set(log.exitCode === 0 ? log.stdout.split(/\r?\n/).map(file => /^(docs\/(?:prds|changes)\/[^/]+)\//.exec(file)?.[1]).filter((one): one is string => !!one) : []);
        for (const directory of candidates) {
          if (!sharedTree.has(directory)) sharedTree.set(directory, await Promise.all(sharedTips.map(tip => treeOf(git, cwd, tip, directory))));
          const tree = await treeOf(git, cwd, copy.tip, directory);
          if (tree && !sharedTree.get(directory)!.some(one => one === tree)) found.push(directory);
        }
        if (heldCache.size > 2000) heldCache.clear();
        heldCache.set(key, found);
      }
      for (const directory of found) if (!name.startsWith("prd/") || name.slice(4) === posix.basename(directory)) directories.add(directory);
    }
    const read = copies[0]!;
    for (const directory of directories) {
      const list = held.get(directory) ?? [];
      list.push({ name, ref: read.ref, tip: read.tip, date: read.date });
      held.set(directory, list);
    }
  }
  for (const list of held.values()) list.sort((a, b) => b.date - a.date);
  return held;
}
