/** Coherent saved-document observations and immutable accepted scope for active runs. */
import MarkdownIt from "markdown-it";
import { createHash } from "node:crypto";
import { existsSync, statSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep, join } from "node:path";
import { requirementManifest } from "../audit/snapshots.js";
import type { RequirementManifest } from "../audit/contracts.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { markdownLines } from "../plan/markdown-sections.js";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { readPhaseDocument } from "../plan/phase-document.js";
import { dependencyIds, leavesOf, readPhasePlan, planStartProblems, type PhasePlan } from "../plan/phase-plan.js";
import type { RecordedPlanPhase } from "../state/records.js";

export const PLAN_LIMIT = 8 * 1024 * 1024;
export const PHASE_LIMIT = 10_000;
const markdown = new MarkdownIt();
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface PlanSource {
  path: string;
  digest: string;
  documents: Record<string, string>;
  plan: PhasePlan;
  scopes: Record<string, string>;
  requirements: string;
  manifest: RequirementManifest;
}
export interface PlanBaseline {
  formatVersion: 1;
  normalizerVersion: 1;
  id: string;
  prdDirectory: string;
  active: PlanSource;
  sources: PlanSource[];
  /** References, not synthetic passing provider receipts. */
  completions: Record<string, { kind: "kiln" | "external"; revision?: string; doneAt?: string; repositories?: Record<string, { identity: string; revision: string }> }>;
}
export interface HandbackNotice { source: string; addedPhaseIds: string[]; remainingCount: number; acceptedAt: string }
export interface PlanReconciliationState {
  baselineId?: string;
  handback?: HandbackNotice;
  check?: { status: "accepted" | "failed"; attemptedAt: string; problem?: string };
}

/** Structural normalization keeps code and link destinations, ignores presentation only. */
export function normalizedScope(content: string, phaseLinks: Map<string, string> = new Map()): string {
  // Ignore only the phase parser's historical closure metadata, not arbitrary Closed prose.
  let preamble = true;
  const lines = markdownLines(content.replace(/\r\n?/g, "\n")).filter(line => {
    if (!line.inCodeFence && /^##\s/.test(line.text)) preamble = false;
    return !(preamble && !line.inCodeFence && /^\*\*Closed:\*\*/.test(line.text));
  }).map(line => line.inCodeFence ? line.text : line.text.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)[xX ](\])/, "$1 $2")).join("\n");
  const tokens = markdown.parse(lines, {});
  const flatten = (items: typeof tokens): unknown[] => items.flatMap(token => {
    if (["em_open", "em_close", "strong_open", "strong_close"].includes(token.type)) return [];
    if (["softbreak", "hardbreak"].includes(token.type)) return [{ type: "text", content: " " }];
    if (token.type === "inline") return flatten(token.children ?? []);
    const attrs = token.attrs?.map(([key, value]) => [key, key === "href" && phaseLinks.has(String(value).split(/[?#]/)[0]!) ? `phase:${phaseLinks.get(String(value).split(/[?#]/)[0]!)}${String(value).slice(String(value).split(/[?#]/)[0]!.length)}` : value]);
    const text = token.type === "text" ? token.content.replace(/\s+/g, " ") : token.content;
    return [{ type: token.type, tag: token.tag, ...(attrs?.length ? { attrs } : {}), ...(text ? { content: text } : {}), ...(token.type === "fence" ? { info: token.info } : {}) }];
  });
  // Emphasis and wrapping can split adjacent text tokens. Coalesce them before hashing.
  const merged: Record<string, unknown>[] = [];
  for (const item of flatten(tokens) as Record<string, unknown>[]) {
    const previous = merged.at(-1);
    if (item.type === "text" && previous?.type === "text") previous.content = `${previous.content ?? ""}${item.content ?? ""}`;
    else merged.push(item);
  }
  return digest(merged);
}

/** Compare the execution semantics as well as the normalized document words. */
export function phaseScopeDigest(content: string, fileName: string, phaseLinks: Map<string, string>): string {
  const phase = readPhaseDocument(fileName, content);
  return digest({ scope: normalizedScope(content, phaseLinks), repositories: phase.repositories, dependencies: dependencyIds(phase.dependenciesText), splitInto: phase.splitInto?.map(child => child.id) });
}

function safeFile(root: string, path: string): string {
  if (isAbsolute(path) || path.includes("\\") || path.includes("\0") || path.split("/").some(p => p === ".." || !p)) throw new Error(`Document path escapes repository: ${path}`);
  const target = resolve(root, path);
  // Reject every symlink, including a directory link that happens to lead back inside.
  let cursor = root;
  for (const part of path.split("/")) { cursor = join(cursor, part); if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Document symlink is not allowed: ${path}`); }
  const physical = realpathSync(target);
  if (!physical.startsWith(root + sep) || !lstatSync(target).isFile()) throw new Error(`Document is not a repository file: ${path}`);
  return target;
}

/** Read membership and bytes twice. No plan ever combines files from separate observations. */
export function observePlan(path: string, prdDirectory: string): PlanSource {
  const root = realpathSync(path);
  if (relative(root, resolve(root, prdDirectory)).startsWith("..")) throw new Error("PRD directory escapes repository.");
  const read = () => {
    const names = readdirSync(resolve(root, prdDirectory)).sort();
    const phases = names.filter(isPhaseFileName);
    if (!phases.length) throw new Error(`No phase documents in ${path}/${prdDirectory}`);
    if (phases.length > PHASE_LIMIT) throw new Error(`plan_too_large: maximum ${PHASE_LIMIT} phase records.`);
    const prds = names.filter(n => n.endsWith("-prd.md"));
    if (prds.length !== 1) throw new Error(`Expected one governing PRD in ${path}/${prdDirectory}`);
    const documents: Record<string, string> = {}; let size = 0;
    const pending = new Set([...phases, ...prds, ...names.filter(n => /technical-design|assumptions|phase-plan/.test(n) && n.endsWith(".md"))].map(n => `${prdDirectory}/${n}`));
    if (![...pending].some(n => n.includes("technical-design"))) throw new Error(`Missing technical design in ${path}/${prdDirectory}`);
    const readDocument = (name: string) => {
      const target = safeFile(root, name); size += lstatSync(target).size;
      if (size > PLAN_LIMIT) throw new Error(`plan_too_large: maximum ${PLAN_LIMIT} document bytes.`);
      return documents[name] = readFileSync(target, "utf8");
    };
    for (const fileName of phases) readDocument(`${prdDirectory}/${fileName}`);
    const structure = readPhasePlan(phases.map(fileName => ({ fileName, markdown: documents[`${prdDirectory}/${fileName}`]! })));
    if (structure.problems.length) throw new Error(structure.problems.join(" "));
    for (const name of pending) {
      const content = documents[name] ?? readDocument(name);
      for (const token of markdown.parse(content, {}).flatMap(t => t.children ?? [])) {
        if (token.type !== "link_open") continue;
        const href = token.attrGet("href")?.toString().split(/[?#]/)[0];
        if (!href || /^[a-z]+:/i.test(href) || !href.endsWith(".md")) continue;
        const decoded = decodeURIComponent(href);
        if (isAbsolute(decoded) || decoded.includes("\\")) throw new Error(`Document path escapes repository: ${href}`);
        const linked = posix.normalize(posix.join(posix.dirname(name), decoded));
        if (!Object.hasOwn(documents, linked)) pending.add(linked);
      }
    }
    return { names, documents, phases };
  };
  const first = read(); const second = read();
  if (digest(first) !== digest(second)) throw new Error(`source_changed: documents changed while reading ${path}; retry the handback.`);
  const plan = readPhasePlan(first.phases.map(fileName => ({ fileName, markdown: first.documents[`${prdDirectory}/${fileName}`]! })));
  const problems = [...plan.problems, ...(plan.problems.length ? [] : planStartProblems(plan, prdDirectory))];
  if (problems.length) throw new Error(problems.join(" "));
  const phasePaths = new Set(plan.phases.map(p => `${prdDirectory}/${p.fileName}`));
  const scopes = Object.fromEntries(plan.phases.map(phase => {
    const file = `${prdDirectory}/${phase.fileName}`;
    const links = new Map<string, string>();
    for (const other of plan.phases) { links.set(other.fileName, other.id); links.set(`./${other.fileName}`, other.id); }
    return [phase.id, phaseScopeDigest(first.documents[file]!, phase.fileName, links)];
  }));
  // File names may change without changing phase identity; requirements are compared separately.
  const requirements = digest(Object.entries(first.documents).filter(([file]) => !phasePaths.has(file)).map(([file, bytes]) => [file, normalizedScope(bytes)]));
  const prdPath = Object.keys(first.documents).find(file => file.startsWith(`${prdDirectory}/`) && file.endsWith("-prd.md"))!;
  const manifest = requirementManifest(root, prdPath, digest(first.documents[prdPath]), first.documents[prdPath]!);
  return { path: root, digest: digest(first.documents), documents: first.documents, plan, scopes, requirements, manifest };
}

export function completedScopeProblems(previous: PlanSource, current: PlanSource): string[] {
  return leavesOf(previous.plan).filter(p => p.closed).flatMap(old => {
    const found = current.plan.phases.find(p => p.id === old.id);
    return !found || !found.closed || found.splitInto || previous.scopes[old.id] !== current.scopes[old.id]
      ? [`Phase ${old.id}: previously completed scope was removed, reopened, split or materially changed.`] : [];
  });
}

/** Only new changes in known sources matter; an unchanged older shared copy is expected. */
export function sourceDiscrepancies(active: PlanSource, source: PlanSource, previous?: PlanSource): string[] {
  const problems: string[] = [];
  for (const phase of source.plan.phases) {
    const earlier = previous?.plan.phases.find(p => p.id === phase.id);
    const changed = !earlier || previous!.scopes[phase.id] !== source.scopes[phase.id] || earlier.closed && !phase.closed;
    const assigned = active.plan.phases.find(p => p.id === phase.id);
    if (changed && (!assigned || source.scopes[phase.id] !== active.scopes[phase.id] || earlier?.closed && !phase.closed && assigned.closed)) problems.push(phase.id);
  }
  for (const old of previous?.plan.phases ?? []) if (!source.plan.phases.some(p => p.id === old.id) && active.plan.phases.some(p => p.id === old.id)) problems.push(old.id);
  if ((!previous || previous.requirements !== source.requirements) && active.requirements !== source.requirements) problems.push("requirements");
  return problems;
}

export function retainBaseline(directory: string, baseline: Omit<PlanBaseline, "id">): PlanBaseline {
  const value: PlanBaseline = { ...baseline, id: digest(baseline) };
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) + 1 > PLAN_LIMIT) throw new Error(`plan_too_large: maximum ${PLAN_LIMIT} retained baseline bytes.`);
  const path = join(directory, "plans", `${value.id}.json`);
  if (!existsSync(path)) writeDurableMetadata(path, value);
  return value;
}
export function readBaseline(directory: string, id: string): PlanBaseline {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid retained plan identity.");
  const path = join(directory, "plans", `${id}.json`);
  if (statSync(path).size > PLAN_LIMIT) throw new Error(`plan_too_large: maximum ${PLAN_LIMIT} retained baseline bytes.`);
  const value = JSON.parse(readFileSync(path, "utf8")) as PlanBaseline;
  const { id: stored, ...body } = value;
  if (value.formatVersion !== 1 || value.normalizerVersion !== 1 || digest(body) !== stored || stored !== id) throw new Error("Retained plan is damaged or requires a newer Kiln.");
  return value;
}

/** Used only for presentation/comparison, never to infer historical completion evidence. */
export function addedLeaves(previous: RecordedPlanPhase[] | undefined, current: PhasePlan): string[] {
  return previous ? leavesOf(current).filter(p => !p.closed && !previous.some(old => old.id === p.id)).map(p => p.id) : [];
}
