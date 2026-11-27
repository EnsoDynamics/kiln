import { basename, posix } from "node:path";
import { defaultBaseBranch } from "../engine/worktree-setup.js";
import { localBranchCommit, originBranches, type GitContext } from "../engine/git-reads.js";
import { gitText, prdFile } from "./git.js";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { branchesHolding, partWayProblems, type HoldingBranch } from "./branches.js";
import type { RequirementsOrigin } from "./stages.js";

export const briefName = (name: string) => `${name}-brief.md`;
export function sourcePath(path: string): boolean {
  return /^(?:source-material\/[^/]+|docs\/initiatives\/[^/]+(?:\/[^/]+)?)$/.test(path)
    && path.split("/").every(part => part !== "." && part !== ".." && !part.includes("\\") && [...part].every(c => c.charCodeAt(0) >= 32));
}
/** One row of an initiative's PRD list (technical design, "What Kiln Knows About the Method"). */
export interface InitiativeRow {
  name: string;
  /** The directory the linked scope entry's `**PRD directory, when written:**` line gives; else the row's name as a folder name. */
  directory: string;
  /** Whether `directory` came from that line: only then is the row matched to a PRD written by hand (technical design, "What Kiln Knows"). */
  fromLine: boolean;
  contract?: string;
  status: string;
  /** The Depends on column as the list writes it, one name per entry; empty for `None…`. */
  dependsOn: string[];
}

const folderOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Every row of an initiative's PRD list at a commit, with its status and Depends on.
 *
 *   await initiativeRows(git, repo, sha, "docs/initiatives/loyalty", list)
 *   // [{ name: "Points earning", directory: "points-earning", fromLine: true, status: "planned", dependsOn: [] }, …]
 */
export async function initiativeRows(git: GitContext, cwd: string, ref: string, folder: string, list: string): Promise<InitiativeRow[]> {
  const rows: InitiativeRow[] = [];
  const contracts = new Map<string, string>();
  let header: string[] | undefined;
  for (const line of list.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) { header = undefined; continue; }
    const cells = line.trim().split("|").map(c => c.trim());
    if (cells.every(c => /^:?-*:?$/.test(c))) continue;
    const link = cells[2]?.match(/^\[([^\]]+)\]\(([^)#]+)#([^)]+)\)$/);
    if (!link) { if (!header && cells.some(c => /status/i.test(c))) header = cells.map(c => c.toLowerCase()); continue; }
    const status = cells.at(-2) ?? "";
    const dependsAt = header?.findIndex(c => c.includes("depends")) ?? -1;
    const depends = dependsAt > 0 ? cells[dependsAt] ?? "" : "";
    const dependsOn = /^none\b/i.test(depends) || !depends ? [] : depends.split(/\s*[,;]\s*/).map(one => one.replace(/^\[([^\]]+)\]\([^)]*\)$/, "$1").trim()).filter(Boolean);
    let directory: string | undefined;
    let contract: string | undefined;
    if (posix.basename(link[2]!) === link[2] && link[2]!.endsWith(".md")) {
      contract = posix.join(folder, link[2]!);
      if (!contracts.has(contract)) {
        const present = await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", ref, "--", contract]);
        if (!present) throw new Error(`Commit the planned PRD contracts file ${contract} on the shared branch.`);
        contracts.set(contract, await gitText(git, cwd, ["show", `${ref}:${contract}`]));
      }
      const section = contracts.get(contract)!.split(/^#{2,6}\s+/m).find(s => s.split(/\r?\n/, 1)[0]!.toLowerCase().replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-") === link[3]);
      directory = section?.match(/\*\*PRD directory, when written:\*\*\s*`?(?:docs\/(?:prds|changes)\/)([^/\\`\s]+)/)?.[1];
    }
    rows.push({ name: link[1]!, directory: directory ?? folderOf(link[1]!), fromLine: !!directory, ...(contract ? { contract } : {}), status: status.toLowerCase(), dependsOn });
  }
  return rows;
}

/** What `kiln run` found for a PRD directory with no phase documents (AC-BEGIN-04, AC-BEGIN-08). */
export interface StartedPrd { origin: RequirementsOrigin; base: string; branch?: HoldingBranch; holding: HoldingBranch[]; partWay: string[] }

/**
 * A PRD started by hand (technical design, "What `kiln run` accepts"): the branch that holds it,
 * the newest when several do, or for a directory not in the checkout the one branch that does
 * (`--branch` picks among several); its documents at that start commit, or at the local shared
 * branch's tip; and any method run part-way through in a worktree.
 */
export async function inspectStartedPrd(git: GitContext, cwd: string, mainCheckout: string, directory: string, options: { exclude?: ReadonlySet<string>; branch?: string } = {}): Promise<StartedPrd | { problem: string }> {
  const remote = await originBranches(git, cwd);
  if (!remote.ok) return { problem: remote.error };
  const base = defaultBaseBranch(remote.value);
  const holding = await branchesHolding(git, cwd, directory, base, options.exclude);
  const inCheckout = existsSync(join(cwd, directory));
  let branch: HoldingBranch | undefined;
  if (options.branch !== undefined) {
    branch = holding.find(one => one.name === options.branch);
    if (!branch) return { problem: `${options.branch} doesn't hold ${directory}.${holding.length ? ` The branches that do: ${holding.map(one => one.name).join(", ")}.` : ""}` };
  } else if (!inCheckout) {
    if (!holding.length) return { problem: `${directory} isn't in this checkout or on any branch that hasn't merged.` };
    if (holding.length > 1) return { problem: `${directory} is on several branches: ${holding.map(one => one.name).join(", ")}. Name one with --branch.` };
    branch = holding[0];
  } else branch = holding[0];
  const commit = branch?.tip ?? await localBranchCommit(git, cwd, base);
  if (!commit) return { problem: `Bring the local shared branch ${base} up to date.` };
  const where = branch?.name ?? base;
  const prd = prdFile(directory);
  if (!(await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", commit, "--", prd])).startsWith("100")) return { problem: `Commit ${prd} on ${where}.` };
  const partWay = await partWayProblems(git, mainCheckout, directory);
  if (inCheckout) {
    const dirty = await gitText(git, cwd, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", directory]);
    // A method run part-way through replaces the uncommitted-changes line for this directory.
    if (dirty && !partWay.length) return { problem: `Commit the changes under ${directory} on ${where}:\n${dirty}` };
  }
  const files = (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "--name-only", "-z", commit, "--", `${directory}/`])).split("\0").filter(Boolean);
  // A phase plan on the branch is a build, which Kiln starts only from phase documents in the checkout (AC-BEGIN-05).
  if (branch && files.some(file => isPhaseFileName(basename(file)))) return { problem: `${directory} has its phase plan on ${branch.name}, which this checkout doesn't hold. Kiln builds from the phase documents in the checkout: merge ${branch.name} into ${base} and pull, then run kiln run again.` };
  const text = await gitText(git, cwd, ["show", `${commit}:${prd}`]);
  const title = text.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/^PRD:\s*/i, "") ?? basename(directory).replaceAll("-", " ");
  const committedAt = await gitText(git, cwd, ["show", "-s", "--format=%cI", commit]);
  return { origin: { kind: "prd", path: directory, title, files, commit, committedAt }, base, ...(branch ? { branch } : {}), holding, partWay };
}

export async function inspectSource(git: GitContext, cwd: string, path: string): Promise<{ origin: RequirementsOrigin; base: string } | { problem: string }> {
  if (!sourcePath(path)) return { problem: `Unknown source material path: ${path}` };
  const remote = await originBranches(git, cwd);
  if (!remote.ok) return { problem: remote.error };
  const base = defaultBaseBranch(remote.value);
  const commit = await localBranchCommit(git, cwd, base);
  if (!commit) return { problem: `Bring the local shared branch ${base} up to date.` };
  const parts = path.split("/");
  const initiative = parts[0] === "docs";
  const folder = initiative ? parts.slice(0, 3).join("/") : path;
  const name = basename(folder);
  const files = (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "-r", "--name-only", "-z", commit, "--", folder])).split("\0").filter(Boolean);
  const intake = `${folder}/${name}-requirements-intake.md`;
  const brief = `${folder}/${briefName(name)}`;
  const list = `${folder}/${name}-initiative-prds.md`;
  const file = initiative ? list : files.includes(brief) ? brief : intake;
  if (!files.includes(file)) return { problem: initiative ? `Commit ${list} on ${base}.` : `Commit ${brief} or ${intake} on ${base}.` };
  const dirty = await gitText(git, cwd, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", folder]);
  if (dirty) return { problem: `Commit the changes under ${folder} on ${base}:\n${dirty}` };
  const differs = await gitText(git, cwd, ["--literal-pathspecs", "diff", "--name-only", commit, "--", folder]);
  if (differs) return { problem: `Commit the source material on ${base}:\n${differs}` };
  const input = await gitText(git, cwd, ["show", `${commit}:${file}`]);
  const title = input.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/^(?:brief|requirements intake):\s*/i, "") ?? name.replaceAll("-", " ");
  const committedAt = await gitText(git, cwd, ["show", "-s", "--format=%cI", commit]);
  let origin: RequirementsOrigin;
  if (initiative) {
    let rows: InitiativeRow[];
    try { rows = (await initiativeRows(git, cwd, commit, folder, input)).filter(r => r.status === "planned"); }
    catch (error) { return { problem: (error as Error).message }; }
    const row = rows.find(r => r.directory === parts[3]);
    if (!row) return { problem: `Planned PRDs in ${folder}: ${rows.map(r => r.directory).join(", ") || "none"}. Name one with --prd.` };
    const heading = title.replace(/(?:\s+[—–-]\s+|\s+)Initiative PRDs$/i, "");
    origin = { kind: "planned_prd", path, initiative: { path: folder, row: row.name }, commit, committedAt, title: `${heading}: ${row.name}`, files: [file, ...(row.contract && files.includes(row.contract) ? [row.contract] : [])] };
  } else {
    origin = { kind: file === brief ? "brief" : "intake", path, title, files, commit, committedAt };
  }
  const existing = [`docs/prds/${basename(path)}`, `docs/changes/${basename(path)}`, ...(initiative ? [] : [`docs/initiatives/${name}`])];
  const refs = (await gitText(git, cwd, ["for-each-ref", "--format=%(objectname)", "refs/heads/", "refs/remotes/origin/"])).split("\n");
  for (const ref of new Set(refs)) {
    const match = await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "-d", "--name-only", ref, "--", ...existing]);
    if (match) return { problem: `${match.split("\n")[0]} was written from ${path}.` };
  }
  return { origin, base };
}
