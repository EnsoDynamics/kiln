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
  /** The PRD folder that line names, `docs/prds/<directory>` or `docs/changes/<directory>`. */
  written?: string;
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
    // A planned row links its scope entry in the contracts file; once the PRD is written the method points the link at the PRD file (`initiative-breakdown`).
    const link = cells[2]?.match(/^\[([^\]]+)\]\(([^)#\s]+)(?:#([^)]+))?\)$/);
    if (!link) { if (!header && cells.some(c => /status/i.test(c))) header = cells.map(c => c.toLowerCase()); continue; }
    const status = cells.at(-2) ?? "";
    const dependsAt = header?.findIndex(c => c.includes("depends")) ?? -1;
    const depends = dependsAt > 0 ? cells[dependsAt] ?? "" : "";
    const dependsOn = /^none\b/i.test(depends) || !depends ? [] : depends.split(/\s*[,;]\s*/).map(one => one.replace(/^\[([^\]]+)\]\([^)]*\)$/, "$1").trim()).filter(Boolean);
    let directory: string | undefined;
    let written: string | undefined;
    let contract: string | undefined;
    const prdLink = posix.normalize(posix.join(folder, link[2]!)).match(/^(docs\/(?:prds|changes)\/([^/]+))\/\2-prd\.md$/);
    if (prdLink) {
      written = prdLink[1];
      directory = prdLink[2];
    } else if (link[3] !== undefined && posix.basename(link[2]!) === link[2] && link[2]!.endsWith(".md")) {
      contract = posix.join(folder, link[2]!);
      if (!contracts.has(contract)) {
        const present = await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", ref, "--", contract]);
        if (!present) throw new Error(`Commit the planned PRD contracts file ${contract} on the shared branch.`);
        contracts.set(contract, await gitText(git, cwd, ["show", `${ref}:${contract}`]));
      }
      const section = contracts.get(contract)!.split(/^#{2,6}\s+/m).find(s => s.split(/\r?\n/, 1)[0]!.toLowerCase().replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-") === link[3]);
      const line = section?.match(/\*\*PRD directory, when written:\*\*\s*`?(docs\/(?:prds|changes)\/([^/\\`\s]+))/);
      written = line?.[1];
      directory = line?.[2];
    }
    rows.push({ name: link[1]!, directory: directory ?? folderOf(link[1]!), fromLine: !!directory, ...(written ? { written } : {}), ...(contract ? { contract } : {}), status: status.toLowerCase(), dependsOn });
  }
  return rows;
}

/** What `kiln run` found for a PRD directory with no phase documents (AC-BEGIN-04, AC-BEGIN-08). */
export interface StartedPrd { origin: RequirementsOrigin; base: string; branch?: HoldingBranch; holding: HoldingBranch[]; partWay: string[] }

/** A PRD whose phase plan is on the branch that holds it: a build, started on that branch (AC-BEGIN-05, AC-BEGIN-08). */
export interface PlanOnBranch { planOn: HoldingBranch; holding: HoldingBranch[] }

/**
 * A PRD started by hand (technical design, "What `kiln run` accepts"): the branch that holds it,
 * the newest when several do, or for a directory not in the checkout the one branch that does
 * (`--branch` picks among several); its documents at that start commit, or at the local shared
 * branch's tip; and any method run part-way through in a worktree.
 */
export async function inspectStartedPrd(git: GitContext, cwd: string, mainCheckout: string, directory: string, options: { exclude?: ReadonlySet<string>; branch?: string } = {}): Promise<StartedPrd | PlanOnBranch | { problem: string }> {
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
    if (!holding.length) {
      // Merged on origin and not yet pulled: the step left is the one the home screen names (AC-HOME-04).
      const behind = remote.value.branches.get(base);
      const held = behind && (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", `refs/remotes/origin/${base}`, "--", prdFile(directory)]).catch(() => ""));
      if (held) return { problem: `${directory} is committed only on origin's ${base}. Bring the local shared branch ${base} up to date.` };
      return { problem: `${directory} isn't in this checkout or on any branch that hasn't merged.` };
    }
    if (holding.length > 1) return { problem: `${directory} is on several branches: ${holding.map(one => one.name).join(", ")}. Name one with --branch.` };
    branch = holding[0];
  } else branch = holding[0];
  const commit = branch?.tip ?? await localBranchCommit(git, cwd, base);
  if (!commit) return { problem: `Bring the local shared branch ${base} up to date.` };
  const where = branch?.name ?? base;
  const files = (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "--name-only", "-z", commit, "--", `${directory}/`])).split("\0").filter(Boolean);
  // A phase plan on the branch that holds the PRD is a build, which starts on that branch (AC-BEGIN-05, AC-BEGIN-08).
  if (branch && files.some(file => isPhaseFileName(basename(file)))) return { planOn: branch, holding };
  const prd = prdFile(directory);
  if (!(await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", commit, "--", prd])).startsWith("100")) return { problem: `Commit ${prd} on ${where}.` };
  const partWay = await partWayProblems(git, mainCheckout, directory);
  if (inCheckout) {
    const dirty = await gitText(git, cwd, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", directory]);
    // A method run part-way through replaces the uncommitted-changes line for this directory.
    if (dirty && !partWay.length) return { problem: `Commit the changes under ${directory} on ${where}:\n${dirty}` };
  }
  const text = await gitText(git, cwd, ["show", `${commit}:${prd}`]);
  const title = text.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/^PRD:\s*/i, "") ?? basename(directory).replaceAll("-", " ");
  const committedAt = await gitText(git, cwd, ["show", "-s", "--format=%cI", commit]);
  return { origin: { kind: "prd", path: directory, title, files, commit, committedAt }, base, ...(branch ? { branch } : {}), holding, partWay };
}

/**
 * The start checks' read of source material or a planned PRD (technical design, "What `kiln run`
 * accepts"), in AC-HOME-13's order: material something was written from names what was written
 * first; then material not committed on the local shared branch names what to commit, or to bring
 * the local shared branch up to date when only origin's copy holds it (AC-BEGIN-02, AC-BEGIN-03).
 */
export async function inspectSource(git: GitContext, cwd: string, path: string): Promise<{ origin: RequirementsOrigin; base: string } | { problem: string }> {
  if (!sourcePath(path)) return { problem: `Unknown source material path: ${path}` };
  const remote = await originBranches(git, cwd);
  if (!remote.ok) return { problem: remote.error };
  const base = defaultBaseBranch(remote.value);
  const commit = await localBranchCommit(git, cwd, base);
  const parts = path.split("/");
  const initiative = parts[0] === "docs";
  const folder = initiative ? parts.slice(0, 3).join("/") : path;
  const name = basename(folder);
  const intake = `${folder}/${name}-requirements-intake.md`;
  const brief = `${folder}/${briefName(name)}`;
  const list = `${folder}/${name}-initiative-prds.md`;
  const refList = (await gitText(git, cwd, ["for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads/", "refs/remotes/origin/"])).split("\n").filter(Boolean).map(line => line.split("\0") as [string, string]).filter(([ref]) => ref !== "refs/remotes/origin/HEAD");
  const refs = [...new Set(refList.map(([, sha]) => sha))];
  const originShared = refList.find(([ref]) => ref === `refs/remotes/origin/${base}`)?.[1];
  const held = async (ref: string, file: string) => (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", ref, "--", file])).startsWith("100");
  // The first PRD or initiative folder of these paths on any local or origin branch (AC-HOME-13, first row).
  const writtenOnAnyBranch = async (paths: string[]) => {
    for (const ref of refs) {
      const match = await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "-d", "--name-only", ref, "--", ...paths]);
      if (match) return match.split("\n")[0]!;
    }
    return undefined;
  };
  // Where a file the local shared branch lacks is committed: origin's copy of it, else another branch (AC-BEGIN-03).
  const elsewhere = async (file: string): Promise<{ origin: true } | { branch: string } | undefined> => {
    if (originShared && await held(originShared, file)) return { origin: true };
    for (const [ref, sha] of refList) {
      if (ref === `refs/heads/${base}` || ref === `refs/remotes/origin/${base}`) continue;
      if (await held(sha, file)) return { branch: ref.replace(/^refs\/(?:heads|remotes)\//, "") };
    }
    return undefined;
  };
  const notCommitted = async (file: string, otherwise: string) => {
    const found = await elsewhere(file);
    if (found && "origin" in found) return `${file} is committed only on origin's ${base}. Bring the local shared branch ${base} up to date.`;
    if (found) return `${file} isn't committed on ${base}, only on ${found.branch}. Commit it on ${base}.`;
    return existsSync(join(cwd, file)) ? `${file} isn't committed on ${base}. Commit it on ${base}.` : otherwise;
  };

  if (!initiative) {
    const match = await writtenOnAnyBranch([`docs/prds/${name}`, `docs/changes/${name}`, `docs/initiatives/${name}`]);
    if (match) return { problem: `${match} was written from ${path}.` };
    if (!commit) return { problem: `Bring the local shared branch ${base} up to date.` };
    const files = (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "-r", "--name-only", "-z", commit, "--", folder])).split("\0").filter(Boolean);
    const file = files.includes(brief) ? brief : files.includes(intake) ? intake : undefined;
    if (!file) {
      const other = (await elsewhere(brief)) ? brief : (await elsewhere(intake)) ? intake : existsSync(join(cwd, brief)) ? brief : existsSync(join(cwd, intake)) ? intake : undefined;
      return { problem: other ? await notCommitted(other, "") : `Commit ${brief} or ${intake} on ${base}.` };
    }
    // Material brought in under received/ with no intake record is an intake not finished, even beside a brief (HOME-004, AC-HOME-13 row 2).
    if (file === brief && !files.includes(intake) && (files.some(one => one.startsWith(`${folder}/received/`)) || existsSync(join(cwd, folder, "received")))) return { problem: `Write ${intake}: the material brought in under ${folder}/received/ has no intake record yet.` };
    const dirty = await gitText(git, cwd, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", folder]);
    if (dirty) return { problem: `Commit the changes under ${folder} on ${base}:\n${dirty}` };
    const differs = await gitText(git, cwd, ["--literal-pathspecs", "diff", "--name-only", commit, "--", folder]);
    if (differs) return { problem: `Commit the source material on ${base}:\n${differs}` };
    const input = await gitText(git, cwd, ["show", `${commit}:${file}`]);
    const title = input.match(/^#\s+(.+?)\s*$/m)?.[1]?.replace(/^(?:brief|requirements intake):\s*/i, "") ?? name.replaceAll("-", " ");
    const committedAt = await gitText(git, cwd, ["show", "-s", "--format=%cI", commit]);
    return { origin: { kind: file === brief ? "brief" : "intake", path, title, files, commit, committedAt }, base };
  }

  // A planned PRD's row is read from the shared branch: the local copy, else origin's, to say what was written from it before anything else.
  const rowsAt = async (ref: string) => {
    if (!(await held(ref, list))) return undefined;
    const markdown = await gitText(git, cwd, ["show", `${ref}:${list}`]);
    try { return { markdown, rows: await initiativeRows(git, cwd, ref, folder, markdown) }; }
    catch (error) { return { markdown, problem: (error as Error).message }; }
  };
  const local = commit ? await rowsAt(commit) : undefined;
  const fromOrigin = originShared && originShared !== commit ? await rowsAt(originShared) : undefined;
  const wanted = parts[3];
  for (const read of [local, fromOrigin]) {
    // A row the method has marked written says which PRD was written from it (AC-BEGIN-02).
    const done = read?.rows?.find(r => r.directory === wanted && r.status !== "planned");
    if (done) {
      const found = await writtenOnAnyBranch([`docs/prds/${done.directory}`, `docs/changes/${done.directory}`]);
      return { problem: `${found ?? done.written ?? `The PRD ${done.name}`} was written from ${path}: its row in ${list} is no longer planned.` };
    }
    const row = read?.rows?.find(r => r.directory === wanted);
    if (row?.fromLine) {
      const match = await writtenOnAnyBranch([`docs/prds/${row.directory}`, `docs/changes/${row.directory}`, ...(row.directory === name ? [] : [`docs/initiatives/${row.directory}`])]);
      if (match) return { problem: `${match} was written from ${path}.` };
    }
    if (row) break;
  }
  if (!commit) return { problem: `Bring the local shared branch ${base} up to date.` };
  if (!local) return { problem: await notCommitted(list, `Commit ${list} on ${base}.`) };
  if (local.problem) return { problem: local.problem };
  const dirty = await gitText(git, cwd, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", folder]);
  if (dirty) return { problem: `Commit the changes under ${folder} on ${base}:\n${dirty}` };
  const differs = await gitText(git, cwd, ["--literal-pathspecs", "diff", "--name-only", commit, "--", folder]);
  if (differs) return { problem: `Commit the source material on ${base}:\n${differs}` };
  const rows = local.rows!.filter(r => r.status === "planned");
  const row = rows.find(r => r.directory === wanted);
  if (!row && wanted !== undefined) {
    // A planned row the local list lacks: origin's copy has it, or another branch's copy does; the checkout's own copy is an uncommitted change, named above (AC-BEGIN-03).
    if (fromOrigin?.rows?.some(r => r.directory === wanted && r.status === "planned")) return { problem: `${list} has ${wanted} only on origin's ${base}. Bring the local shared branch ${base} up to date.` };
    const rowIn = async (markdown: string, ref: string) => (await initiativeRows(git, cwd, ref, folder, markdown).catch(() => [])).some(r => r.directory === wanted && r.status === "planned");
    for (const [ref, sha] of refList) {
      if (ref === `refs/heads/${base}` || ref === `refs/remotes/origin/${base}` || !(await held(sha, list))) continue;
      if (await rowIn(await gitText(git, cwd, ["show", `${sha}:${list}`]), sha)) return { problem: `${list} has ${wanted} only on ${ref.replace(/^refs\/(?:heads|remotes)\//, "")}. Commit ${list} on ${base}.` };
    }
  }
  if (!row) return { problem: `Planned PRDs in ${folder}: ${rows.map(r => r.directory).join(", ") || "none"}. Name one with --prd.` };
  const files = (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", "-r", "--name-only", "-z", commit, "--", folder])).split("\0").filter(Boolean);
  const title = local.markdown.match(/^#\s+(.+?)\s*$/m)?.[1] ?? name.replaceAll("-", " ");
  const committedAt = await gitText(git, cwd, ["show", "-s", "--format=%cI", commit]);
  const heading = title.replace(/(?:\s+[—–-]\s+|\s+)Initiative PRDs$/i, "");
  const origin: RequirementsOrigin = { kind: "planned_prd", path, initiative: { path: folder, row: row.name }, commit, committedAt, title: `${heading}: ${row.name}`, files: [list, ...(row.contract && files.includes(row.contract) ? [row.contract] : [])] };
  return { origin, base };
}
