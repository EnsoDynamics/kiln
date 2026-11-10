/** Read completed-feature candidates from immutable Git objects, without a checkout. */
import { posix } from "node:path";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { gitError, runGit, type GitContext } from "./git-reads.js";
import { PHASE_LIMIT, PLAN_LIMIT, PlanCapacityError, documentLinks, planSourceFromDocuments, requiredLinkError, type PlanSource, type UnfollowedLink, type UnfollowedReason } from "./plan-reconciliation.js";
export async function gitRead(git: GitContext, path: string, args: string[]): Promise<string> {
  const result = await runGit(git, path, args);
  if (result.exitCode !== 0) throw new Error(`${path}: ${gitError(result)}`);
  return result.stdout;
}
export async function remoteBase(git: GitContext, path: string, branch: string, fetch = true, observe?: (revision: string) => void): Promise<string> {
  const rows = await gitRead(git, path, ["ls-remote", "origin", `refs/heads/${branch}`]);
  const revision = rows.trim().split(/\s+/)[0]!;
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error(`Delivery base ${branch} is unavailable in origin for ${path}. Restore that branch and check again.`);
  observe?.(revision);
  if (fetch) await gitRead(git, path, ["fetch", "--no-tags", "--no-write-fetch-head", "origin", revision]);
  return revision;
}
/** A plan read from one immutable revision, with the links Kiln did not follow (Kiln Linked Documents AC-LINK-01). */
export async function readGitPlan(git: GitContext, path: string, directory: string, revision: string): Promise<{ source: PlanSource; unfollowed: UnfollowedLink[] }> {
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("Invalid immutable plan revision.");
  const tree = await gitRead(git, path, ["ls-tree", "-r", "-z", "-l", revision]);
  const files = new Map<string, { mode: string; size: number }>();
  for (const row of tree.split("\0").filter(Boolean)) {
    const match = /^(\d+) \w+ [a-f0-9]+\s+(\d+|-)\t([\s\S]+)$/.exec(row);
    if (match) files.set(match[3]!, { mode: match[1]!, size: Number(match[2]) || 0 });
  }
  // Name what the worktree reader would see for a path the tree has no file at (AC-LINK-01).
  const folders = new Set([...files.keys()].flatMap(file => file.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))));
  const absentReason = (file: string): UnfollowedReason => {
    const parts = file.split("/");
    if (parts.slice(0, -1).some((_, index) => files.get(parts.slice(0, index + 1).join("/"))?.mode === "120000")) return "a symbolic link";
    return folders.has(file) ? "not a file" : "not in this repository";
  };
  const names = [...files.keys()].filter(file => posix.dirname(file) === directory).sort();
  const phases = names.filter(file => isPhaseFileName(posix.basename(file)));
  if (!phases.length) throw new Error(`No phase documents at ${revision}:${directory}.`);
  if (phases.length > PHASE_LIMIT) throw new PlanCapacityError(PHASE_LIMIT, "phase records");
  const prds = names.filter(file => file.endsWith("-prd.md"));
  if (prds.length !== 1) throw new Error(`Expected one governing PRD at ${revision}:${directory}.`);
  const seeds = new Set([...phases, ...prds, ...names.filter(file => /technical-design|assumptions|phase-plan/.test(posix.basename(file)) && file.endsWith(".md"))]);
  if (![...seeds].some(file => file.includes("technical-design"))) throw new Error(`Missing technical design at ${revision}:${directory}.`);
  let size = 0;
  const documents: Record<string, string> = {};
  const required = new Set(seeds);
  const pending = new Map<string, { from: string; href: string }[]>([...seeds].map(file => [file, []]));
  const unfollowed: UnfollowedLink[] = [];
  // A target already judged unfollowable: a later link to it is recorded straight away.
  const skipped = new Map<string, UnfollowedReason>();
  const skip = (from: string, href: string, target: string, reason: UnfollowedReason) => {
    if (!unfollowed.some(link => link.from === from && link.href === href)) unfollowed.push({ from, href, target, reason });
  };
  // Seeds come first, so every required pointer is known before an optional target is judged.
  for (const [file, citations] of pending) {
    const info = files.get(file);
    const reason: UnfollowedReason | undefined = info ? (info.mode === "120000" ? "a symbolic link" : !["100644", "100755"].includes(info.mode) ? "not a file" : undefined) : absentReason(file);
    if (reason) {
      if (required.has(file)) throw new Error(`Missing or unsafe document at ${revision}:${file}. Restore the required document and check again.`);
      skipped.set(file, reason);
      for (const citation of citations) skip(citation.from, citation.href, file, reason);
      continue;
    }
    size += info!.size;
    if (size > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "document bytes");
    const content = documents[file] = await gitRead(git, path, ["show", `${revision}:${file}`]);
    for (const link of documentLinks(file, content, seeds.has(file))) {
      if (link.target === undefined) {
        if (link.required) throw requiredLinkError(link, file);
        skip(file, link.href, link.href, link.reason);
        continue;
      }
      if (link.required) required.add(link.target);
      if (Object.hasOwn(documents, link.target)) continue;
      const skippedReason = skipped.get(link.target);
      if (skippedReason) { skip(file, link.href, link.target, skippedReason); continue; }
      const known = pending.get(link.target);
      if (known) known.push({ from: file, href: link.href });
      else pending.set(link.target, [{ from: file, href: link.href }]);
    }
  }
  return { source: planSourceFromDocuments(path, directory, documents), unfollowed };
}

/** The plan alone at one immutable revision. */
export async function observeGitPlan(git: GitContext, path: string, directory: string, revision: string): Promise<PlanSource> {
  return (await readGitPlan(git, path, directory, revision)).source;
}
