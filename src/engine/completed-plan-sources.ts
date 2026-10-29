/** Read completed-feature candidates from immutable Git objects, without a checkout. */
import MarkdownIt from "markdown-it";
import { posix } from "node:path";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { gitError, runGit, type GitContext } from "./git-reads.js";
import { PHASE_LIMIT, PLAN_LIMIT, planSourceFromDocuments, type PlanSource } from "./plan-reconciliation.js";
const markdown = new MarkdownIt();
export async function gitRead(git: GitContext, path: string, args: string[]): Promise<string> {
  const result = await runGit(git, path, args);
  if (result.exitCode !== 0) throw new Error(`${path}: ${gitError(result)}`);
  return result.stdout;
}
export async function remoteBase(git: GitContext, path: string, branch: string, fetch = true): Promise<string> {
  const rows = await gitRead(git, path, ["ls-remote", "origin", `refs/heads/${branch}`]);
  const revision = rows.trim().split(/\s+/)[0]!;
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error(`Delivery base ${branch} is unavailable in origin for ${path}. Restore that branch and check again.`);
  if (fetch) await gitRead(git, path, ["fetch", "--no-tags", "--no-write-fetch-head", "origin", revision]);
  return revision;
}
export async function observeGitPlan(git: GitContext, path: string, directory: string, revision: string): Promise<PlanSource> {
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("Invalid immutable plan revision.");
  const tree = await gitRead(git, path, ["ls-tree", "-r", "-z", "-l", revision]);
  const files = new Map<string, { mode: string; size: number }>();
  for (const row of tree.split("\0").filter(Boolean)) {
    const match = /^(\d+) blob [a-f0-9]+\s+(\d+)\t([\s\S]+)$/.exec(row);
    if (match) files.set(match[3]!, { mode: match[1]!, size: Number(match[2]) });
  }
  const names = [...files.keys()].filter(file => posix.dirname(file) === directory).sort();
  const phases = names.filter(file => isPhaseFileName(posix.basename(file)));
  if (!phases.length || phases.length > PHASE_LIMIT) throw new Error(phases.length ? `plan_too_large: maximum ${PHASE_LIMIT} phase records.` : `No phase documents at ${revision}:${directory}.`);
  const prds = names.filter(file => file.endsWith("-prd.md"));
  if (prds.length !== 1) throw new Error(`Expected one governing PRD at ${revision}:${directory}.`);
  const pending = new Set([...phases, ...prds, ...names.filter(file => /technical-design|assumptions|phase-plan/.test(posix.basename(file)) && file.endsWith(".md"))]);
  if (![...pending].some(file => file.includes("technical-design"))) throw new Error(`Missing technical design at ${revision}:${directory}.`);
  let size = 0;
  const documents: Record<string, string> = {};
  const add = (file: string) => {
    if (posix.isAbsolute(file) || file.includes("\\") || file.includes("\0") || file.split("/").some(part => part === ".." || !part)) throw new Error(`Document path escapes repository: ${file}`);
    pending.add(file);
  };
  for (const file of pending) {
    const info = files.get(file);
    if (!info || !["100644", "100755"].includes(info.mode)) throw new Error(`Missing or unsafe document at ${revision}:${file}. Restore the required document and check again.`);
    size += info.size;
    if (size > PLAN_LIMIT) throw new Error(`plan_too_large: maximum ${PLAN_LIMIT} document bytes.`);
    const content = documents[file] = await gitRead(git, path, ["show", `${revision}:${file}`]);
    for (const block of markdown.parse(content, {})) for (const token of block.children ?? []) {
      if (token.type !== "link_open") continue;
      if (token.attrGet("title") === "kiln:reference" && !/(?:Superseded(?: in part)? by|Replaces(?: in part)?):/.test(block.content)) continue;
      const href = token.attrGet("href")?.toString().split(/[?#]/)[0];
      if (!href || /^[a-z]+:/i.test(href) || !href.endsWith(".md")) continue;
      const decoded = decodeURIComponent(href);
      if (posix.isAbsolute(decoded) || decoded.includes("\\")) throw new Error(`Document path escapes repository: ${href}`);
      add(posix.normalize(posix.join(posix.dirname(file), decoded)));
    }
    for (const pointer of content.matchAll(/(?:Superseded(?: in part)? by|Replaces(?: in part)?):[^\n]*?`([^`]+\.md)`/g)) add(pointer[1]!);
  }
  return planSourceFromDocuments(path, directory, documents);
}
