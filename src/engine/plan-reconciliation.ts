/** Coherent saved-document observations and immutable accepted scope for active runs. */
import MarkdownIt from "markdown-it";
import { createHash } from "node:crypto";
import { existsSync, statSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep, join } from "node:path";
import { requirementManifest } from "../audit/snapshots.js";
import type { RequirementManifest } from "../audit/contracts.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { markdownLines } from "../plan/markdown-sections.js";
import { isAncestorOf, isPhaseFileName } from "../plan/phase-ids.js";
import { readPhaseDocument } from "../plan/phase-document.js";
import { dependencyIds, leavesOf, readPhasePlan, planStartProblems, type PhasePlan } from "../plan/phase-plan.js";
import type { RecordedPlanPhase } from "../state/records.js";

export const PLAN_LIMIT = 8 * 1024 * 1024;
export const PHASE_LIMIT = 10_000;
export const PLAN_NORMALIZER_VERSION = 3;
export class PlanBaselineWriteFailure extends Error {}
/** A capacity refusal happens before publication; it is not a durability fault. */
export class PlanCapacityError extends Error {
  readonly code = "plan_too_large";
  constructor(readonly limit: number, readonly resource: string) {
    super(`plan_too_large: maximum ${limit} ${resource}. Use a compatible Kiln with sufficient capacity, then check again.`);
  }
}
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
  normalizerVersion: 1 | 2 | 3;
  id: string;
  prdDirectory: string;
  active: PlanSource;
  sources: PlanSource[];
  /** References, not synthetic passing provider receipts. */
  completions: Record<string, { kind: "kiln" | "external"; scopeRepositories?: string[]; revision?: string; doneAt?: string; repositories?: Record<string, { identity: string; revision: string; integration?: { sourceRevision: string; baseRevision: string } }> }>;
}
export interface HandbackNotice { source: string; addedPhaseIds: string[]; remainingCount: number; acceptedAt: string }
export interface PlanReconciliationState {
  baselineId?: string;
  handback?: HandbackNotice;
  check?: { status: "accepted" | "failed"; attemptedAt: string; problem?: string };
}

/** Structural normalization keeps code and link destinations, ignores presentation only. */
export function normalizedScope(content: string, phaseLinks: Map<string, string> = new Map(), documentPath = ""): string {
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
    const attrs = token.attrs?.map(([key, value]) => [key, key === "href" ? phaseLinkIdentity(String(value), documentPath, phaseLinks) : value]);
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

/** Resolve only repository-local targets; query/fragment bytes remain part of scope. */
function phaseLinkIdentity(href: string, documentPath: string, phaseLinks: Map<string, string>): string {
  const path = href.split(/[?#]/)[0]!;
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) return href;
  const decoded = decodeURIComponent(path);
  if (posix.isAbsolute(decoded) || decoded.includes("\\") || decoded.includes("\0")) return href;
  const target = posix.normalize(posix.join(posix.dirname(documentPath), decoded));
  if (target === ".." || target.startsWith("../")) return href;
  const id = phaseLinks.get(target);
  return id ? `phase:${id}${href.slice(path.length)}` : href;
}

/** Compare the execution semantics as well as the normalized document words. */
export function phaseScopeDigest(content: string, fileName: string, phaseLinks: Map<string, string>, documentPath = fileName): string {
  const phase = readPhaseDocument(fileName, content);
  return digest({ scope: normalizedScope(content, phaseLinks, documentPath), repositories: phase.repositories, dependencies: dependencyIds(phase.dependenciesText), splitInto: phase.splitInto?.map(child => child.id) });
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
    if (phases.length > PHASE_LIMIT) throw new PlanCapacityError(PHASE_LIMIT, "phase records");
    const prds = names.filter(n => n.endsWith("-prd.md"));
    if (prds.length !== 1) throw new Error(`Expected one governing PRD in ${path}/${prdDirectory}`);
    const documents: Record<string, string> = {}; let size = 0;
    const pending = new Set([...phases, ...prds, ...names.filter(n => /technical-design|assumptions|phase-plan/.test(n) && n.endsWith(".md"))].map(n => `${prdDirectory}/${n}`));
    if (![...pending].some(n => n.includes("technical-design"))) throw new Error(`Missing technical design in ${path}/${prdDirectory}`);
    const readDocument = (name: string) => {
      const target = safeFile(root, name); size += lstatSync(target).size;
      if (size > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "document bytes");
      return documents[name] = readFileSync(target, "utf8");
    };
    for (const fileName of phases) readDocument(`${prdDirectory}/${fileName}`);
    const structure = readPhasePlan(phases.map(fileName => ({ fileName, markdown: documents[`${prdDirectory}/${fileName}`]! })));
    if (structure.problems.length) throw new Error(structure.problems.join(" "));
    for (const name of pending) {
      const content = documents[name] ?? readDocument(name);
      for (const block of markdown.parse(content, {})) for (const token of block.children ?? []) {
        if (token.type !== "link_open") continue;
        const replacementPointer = /(?:Superseded(?: in part)? by|Replaces(?: in part)?):/.test(block.content);
        if (token.attrGet("title") === "kiln:reference" && !replacementPointer) continue;
        const href = token.attrGet("href")?.toString().split(/[?#]/)[0];
        if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
        const decoded = decodeURIComponent(href);
        if (!decoded.endsWith(".md")) continue;
        if (isAbsolute(decoded) || decoded.includes("\\")) throw new Error(`Document path escapes repository: ${href}`);
        const linked = posix.normalize(posix.join(posix.dirname(name), decoded));
        if (!Object.hasOwn(documents, linked)) pending.add(linked);
      }
      for (const pointer of content.matchAll(/(?:Superseded(?: in part)? by|Replaces(?: in part)?):[^\n]*?`([^`]+\.md)`/g)) {
        if (!Object.hasOwn(documents, pointer[1]!)) pending.add(pointer[1]!);
      }
    }
    return { names, documents, phases };
  };
  const first = read(); const second = read();
  if (digest(first) !== digest(second)) throw new Error(`source_changed: documents changed while reading ${path}; retry the handback.`);
  return planSourceFromDocuments(root, prdDirectory, first.documents);
}

/** Shared parser for a coherent saved checkout or one immutable Git tree. */
export function planSourceFromDocuments(path: string, prdDirectory: string, documents: Record<string, string>): PlanSource {
  const phases = Object.keys(documents).filter(file => posix.dirname(file) === prdDirectory && isPhaseFileName(posix.basename(file))).map(file => posix.basename(file));
  if (phases.length > PHASE_LIMIT) throw new PlanCapacityError(PHASE_LIMIT, "phase records");
  const plan = readPhasePlan(phases.map(fileName => ({ fileName, markdown: documents[`${prdDirectory}/${fileName}`]! })));
  const problems = [...plan.problems, ...(plan.problems.length ? [] : planStartProblems(plan, prdDirectory))];
  if (problems.length) throw new Error(problems.join(" "));
  const phasePaths = new Set(plan.phases.map(p => `${prdDirectory}/${p.fileName}`));
  const links = new Map(plan.phases.map(phase => [`${prdDirectory}/${phase.fileName}`, phase.id]));
  const scopes = Object.fromEntries(plan.phases.map(phase => {
    const file = `${prdDirectory}/${phase.fileName}`;
    return [phase.id, phaseScopeDigest(documents[file]!, phase.fileName, links, file)];
  }));
  // File names may change without changing phase identity; requirements are compared separately.
  const requirements = digest(Object.entries(documents).filter(([file]) => !phasePaths.has(file)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, bytes]) => [file, normalizedScope(bytes, links, file)]));
  const prdPath = Object.keys(documents).find(file => file.startsWith(`${prdDirectory}/`) && file.endsWith("-prd.md"))!;
  const manifest = requirementManifest(path, prdPath, digest(documents[prdPath]), documents[prdPath]!);
  return { path, digest: digest(documents), documents: documents, plan, scopes, requirements, manifest };
}

/** Parent additions cover remaining children; removals cannot erase a completed child's scope. */
export function phaseRepositories(source: PlanSource, id: string): string[] {
  return [...new Set(source.plan.phases.filter(phase => phase.id === id || isAncestorOf(phase.id, id)).flatMap(phase => phase.repositories))].sort();
}
export function completedPhaseScopeUnchanged(previous: PlanSource, current: PlanSource, id: string, scopeRepositories = phaseRepositories(previous, id)): boolean {
  const currentRepositories = new Set(phaseRepositories(current, id));
  return previous.scopes[id] === current.scopes[id] && scopeRepositories.every(name => currentRepositories.has(name));
}

export function completedScopeProblems(previous: PlanSource, current: PlanSource, completions: PlanBaseline["completions"] = {}): string[] {
  return leavesOf(previous.plan).filter(p => p.closed).flatMap(old => {
    const found = current.plan.phases.find(p => p.id === old.id);
    return !found || !found.closed || found.splitInto || !completedPhaseScopeUnchanged(previous, current, old.id, completions[old.id]?.scopeRepositories)
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
  if (baseline.normalizerVersion === PLAN_NORMALIZER_VERSION && Object.values(baseline.completions).some(receipt => !Array.isArray(receipt.scopeRepositories))) throw new Error("baseline_unavailable: Restore the immutable completed repository scope before retaining this plan.");
  const value: PlanBaseline = { ...baseline, id: digest(baseline) };
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) + 1 > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "retained baseline bytes");
  const path = join(directory, "plans", `${value.id}.json`);
  if (!existsSync(path)) {
    try { writeDurableMetadata(path, value); }
    catch (error) { throw new PlanBaselineWriteFailure(`Plan evidence publication needs restart: ${(error as Error).message}`, { cause: error }); }
  }
  return value;
}
export function readBaseline(directory: string, id: string): PlanBaseline {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid retained plan identity.");
  const path = join(directory, "plans", `${id}.json`);
  if (statSync(path).size > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "retained baseline bytes");
  const value = JSON.parse(readFileSync(path, "utf8")) as PlanBaseline;
  const { id: stored, ...body } = value;
  if (value.formatVersion !== 1 || ![1, 2, PLAN_NORMALIZER_VERSION].includes(value.normalizerVersion) || digest(body) !== stored || stored !== id) throw new Error("Retained plan is damaged or requires a newer Kiln.");
  return value;
}

/** Recompute from immutable original bytes and publish a new comparison identity. */
export async function comparisonBaseline(directory: string, id: string, history?: { repositoryName: string; read(revision: string): Promise<PlanSource> }): Promise<PlanBaseline> {
  const original = readBaseline(directory, id);
  if (original.normalizerVersion === PLAN_NORMALIZER_VERSION) return original;
  const { id: _id, ...body } = original; void _id;
  const reparse = (source: PlanSource) => planSourceFromDocuments(source.path, original.prdDirectory, source.documents);
  const active = reparse(original.active);
  const revisions = new Map<string, Promise<PlanSource>>();
  const completions = { ...body.completions };
  for (const [phaseId, receipt] of Object.entries(completions)) {
    if (receipt.scopeRepositories) continue;
    const revision = history && (receipt.repositories?.[history.repositoryName]?.revision ?? receipt.revision);
    if (!history || !revision) throw new Error(`baseline_unavailable: Phase ${phaseId} needs its original completion revision to recover historical repository scope. Restore that receipt/revision, then check again.`);
    if (!revisions.has(revision)) revisions.set(revision, history.read(revision));
    const source = await revisions.get(revision)!;
    if (!source.plan.phases.some(phase => phase.id === phaseId && phase.closed && !phase.splitInto) || source.scopes[phaseId] !== active.scopes[phaseId]) throw new Error(`baseline_unavailable: Phase ${phaseId} does not match its immutable completion scope at ${revision}. Reconcile the historical receipt and plan, then check again.`);
    completions[phaseId] = { ...receipt, scopeRepositories: phaseRepositories(source, phaseId) };
  }
  return retainBaseline(directory, { ...body, completions, normalizerVersion: PLAN_NORMALIZER_VERSION, active, sources: original.sources.map(reparse) });
}

/** Used only for presentation/comparison, never to infer historical completion evidence. */
export function addedLeaves(previous: RecordedPlanPhase[] | undefined, current: PhasePlan): string[] {
  return previous ? leavesOf(current).filter(p => !p.closed && !previous.some(old => old.id === p.id)).map(p => p.id) : [];
}
