import { basename, posix } from "node:path";
import { defaultBaseBranch } from "../engine/worktree-setup.js";
import { localBranchCommit, originBranches, type GitContext } from "../engine/git-reads.js";
import { gitText } from "./git.js";
import type { RequirementsOrigin } from "./stages.js";

export const briefName = (name: string) => `${name}-brief.md`;
export function sourcePath(path: string): boolean {
  return /^(?:source-material\/[^/]+|docs\/initiatives\/[^/]+(?:\/[^/]+)?)$/.test(path)
    && path.split("/").every(part => part !== "." && part !== ".." && !part.includes("\\") && [...part].every(c => c.charCodeAt(0) >= 32));
}
interface Planned { name: string; directory: string; contract?: string }
async function plannedRows(git: GitContext, cwd: string, ref: string, folder: string, list: string): Promise<Planned[]> {
  const rows: Planned[] = [];
  const contracts = new Map<string, string>();
  for (const line of list.split(/\r?\n/)) {
    const cells = line.trim().split("|").map(c => c.trim());
    if (cells.at(-2)?.toLowerCase() !== "planned") continue;
    const link = cells[2]?.match(/^\[([^\]]+)\]\(([^)#]+)#([^)]+)\)$/);
    if (!link || posix.basename(link[2]!) !== link[2] || !link[2]!.endsWith(".md")) continue;
    const contract = posix.join(folder, link[2]!);
    if (!contracts.has(contract)) {
      const present = await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", ref, "--", contract]);
      if (!present) throw new Error(`Commit the planned PRD contracts file ${contract} on the shared branch.`);
      contracts.set(contract, await gitText(git, cwd, ["show", `${ref}:${contract}`]));
    }
    const section = contracts.get(contract)!.split(/^#{2,6}\s+/m).find(s => s.split(/\r?\n/, 1)[0]!.toLowerCase().replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-") === link[3]);
    const directory = section?.match(/\*\*PRD directory, when written:\*\*\s*`?(?:docs\/(?:prds|changes)\/)([^/\\`\s]+)/)?.[1];
    if (directory) rows.push({ name: link[1]!, directory, contract });
  }
  return rows;
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
    let rows: Planned[];
    try { rows = await plannedRows(git, cwd, commit, folder, input); }
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
