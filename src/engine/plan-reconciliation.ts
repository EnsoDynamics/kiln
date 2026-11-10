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
/** A retained baseline carries the active document set plus the shared-checkout and delivery-base sets it was chosen from, each bounded by PLAN_LIMIT. */
export const BASELINE_LIMIT = 3 * PLAN_LIMIT;
export const PHASE_LIMIT = 10_000;
export const PLAN_NORMALIZER_VERSION = 4;
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
  normalizerVersion: 1 | 2 | 3 | 4;
  id: string;
  prdDirectory: string;
  active: PlanSource;
  sources: PlanSource[];
  /** References, not synthetic passing provider receipts. */
  /** `waiverId`: completed or skipped on a waiver, carried as completed while its scope is unchanged (waivers "Continuation executions"); a repository whose work was waived has `waived` and its waived head as `revision`. */
  completions: Record<string, { kind: "kiln" | "external"; waiverId?: string; scopeRepositories?: string[]; revision?: string; doneAt?: string; repositories?: Record<string, { identity: string; revision: string; waived?: true; integration?: { sourceRevision: string; baseRevision: string } }> }>;
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

/** Why Kiln did not follow a local Markdown link (Kiln Linked Documents AC-LINK-01). */
export type UnfollowedReason = "not a usable path" | "outside the repository" | "not in this repository" | "a symbolic link" | "not a file";
/** A local Markdown link Kiln did not follow: the document holding it, the link as written, the path it names and why. */
export interface UnfollowedLink { from: string; href: string; target: string; reason: UnfollowedReason }
/** One link or replacement pointer a document names: its repository path, or why it names none. */
export type DocumentLink = { href: string; required: boolean } & ({ target: string } | { target?: undefined; reason: UnfollowedReason });
const POINTER = /(?:Superseded(?: in part)? by|Replaces(?: in part)?):/;

/** A repository path from a decoded link path, or why it isn't one. `base` is the linking document's directory; pointers name repository paths. */
function linkTarget(decoded: string, base: string): { target: string } | { reason: UnfollowedReason } {
  if (decoded.includes("\\") || decoded.includes("\0")) return { reason: "not a usable path" };
  if (posix.isAbsolute(decoded)) return { reason: "outside the repository" };
  const target = posix.normalize(posix.join(base, decoded));
  return target === ".." || target.startsWith("../") ? { reason: "outside the repository" } : { target };
}

/**
 * Every local Markdown link and replacement pointer in one document, in order. A link titled
 * `kiln:reference` is not listed unless it is a pointer. Only a pointer in one of the PRD's own
 * documents (`seed`) is required; every other target is optional (AC-LINK-02).
 *
 *   documentLinks("docs/prds/x/technical-design.md", "[a](../../a.md)", true)
 *   // [{ href: "../../a.md", required: false, target: "docs/a.md" }]
 */
export function documentLinks(file: string, content: string, seed: boolean): DocumentLink[] {
  const links: DocumentLink[] = [];
  for (const block of markdown.parse(content, {})) for (const token of block.children ?? []) {
    if (token.type !== "link_open") continue;
    const pointer = POINTER.test(block.content);
    if (token.attrGet("title") === "kiln:reference" && !pointer) continue;
    const href = token.attrGet("href")?.toString() ?? "";
    const path = href.split(/[?#]/)[0]!;
    if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) continue;
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { links.push({ href, required: seed && pointer, reason: "not a usable path" }); continue; }
    if (!decoded.endsWith(".md")) continue;
    links.push({ href, required: seed && pointer, ...linkTarget(decoded, posix.dirname(file)) });
  }
  for (const match of content.matchAll(/(?:Superseded(?: in part)? by|Replaces(?: in part)?):[^\n]*?`([^`]+\.md)`/g)) {
    links.push({ href: match[1]!, required: seed, ...linkTarget(match[1]!, "") });
  }
  return links;
}

/** A required target Kiln cannot follow stops it with the problem; an optional one is recorded (AC-LINK-02). */
export function requiredLinkError(link: DocumentLink & { reason: UnfollowedReason }, from: string): Error {
  return new Error(link.reason === "not a usable path" || link.reason === "outside the repository" ? `Document path escapes repository: ${link.href} (in ${from})` : `Linked document is missing: ${link.target ?? link.href} (in ${from})`);
}

/** The file at a repository path, or why Kiln won't read it. Errors other than absence, such as permissions, propagate. */
function targetFile(root: string, path: string): { file: string } | { reason: UnfollowedReason } {
  // Reject every symlink, including a directory link that happens to lead back inside.
  let cursor = root;
  try {
    for (const part of path.split("/")) { cursor = join(cursor, part); if (lstatSync(cursor).isSymbolicLink()) return { reason: "a symbolic link" }; }
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return { reason: "not in this repository" };
    throw error;
  }
  const target = resolve(root, path);
  if (!realpathSync(target).startsWith(root + sep) || !lstatSync(target).isFile()) return { reason: "not a file" };
  return { file: target };
}

/** A required document's file; its absence or an unsafe path stops Kiln, as before Kiln Linked Documents. */
function safeFile(root: string, path: string): string {
  if (isAbsolute(path) || path.includes("\\") || path.includes("\0") || path.split("/").some(p => p === ".." || !p)) throw new Error(`Document path escapes repository: ${path}`);
  const found = targetFile(root, path);
  if ("file" in found) return found.file;
  if (found.reason === "a symbolic link") throw new Error(`Document symlink is not allowed: ${path}`);
  if (found.reason === "not in this repository") throw new Error(`Linked document is missing: ${path}`);
  throw new Error(`Document is not a repository file: ${path}`);
}

export interface LinkedDocuments { documents: Record<string, string>; unfollowed: UnfollowedLink[] }

/**
 * Reads the PRD's own documents in a checkout, then every local Markdown file they link to,
 * recursively. A link Kiln cannot follow is recorded, never thrown (AC-LINK-01); the PRD's own
 * documents and the replacement pointers in them stay required (AC-LINK-02).
 *
 *   readLinkedDocuments("/home/person/shop", "docs/prds/customer-returns").unfollowed
 *   // [{ from: "docs/prds/customer-returns/technical-design.md", href: "../../../x/a.md", target: "x/a.md", reason: "not in this repository" }]
 */
export function readLinkedDocuments(path: string, prdDirectory: string): LinkedDocuments {
  const root = realpathSync(path);
  if (relative(root, resolve(root, prdDirectory)).startsWith("..")) throw new Error("PRD directory escapes repository.");
  const names = readdirSync(resolve(root, prdDirectory)).sort();
  const phases = names.filter(isPhaseFileName);
  if (!phases.length) throw new Error(`No phase documents in ${path}/${prdDirectory}`);
  if (phases.length > PHASE_LIMIT) throw new PlanCapacityError(PHASE_LIMIT, "phase records");
  const prds = names.filter(n => n.endsWith("-prd.md"));
  if (prds.length !== 1) throw new Error(`Expected one governing PRD in ${path}/${prdDirectory}`);
  const documents: Record<string, string> = {}; let size = 0;
  const seeds = new Set([...phases, ...prds, ...names.filter(n => /technical-design|assumptions|phase-plan/.test(n) && n.endsWith(".md"))].map(n => `${prdDirectory}/${n}`));
  if (![...seeds].some(n => n.includes("technical-design"))) throw new Error(`Missing technical design in ${path}/${prdDirectory}`);
  const read = (name: string, target: string) => {
    size += lstatSync(target).size;
    if (size > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "document bytes");
    return documents[name] = readFileSync(target, "utf8");
  };
  for (const fileName of phases) read(`${prdDirectory}/${fileName}`, safeFile(root, `${prdDirectory}/${fileName}`));
  const structure = readPhasePlan(phases.map(fileName => ({ fileName, markdown: documents[`${prdDirectory}/${fileName}`]! })));
  if (structure.problems.length) throw new Error(structure.problems.join(" "));
  const required = new Set(seeds);
  const pending = new Map<string, { from: string; href: string }[]>([...seeds].map(name => [name, []]));
  const unfollowed: UnfollowedLink[] = [];
  // A target already judged unfollowable: a later link to it is recorded straight away.
  const skipped = new Map<string, UnfollowedReason>();
  const skip = (from: string, href: string, target: string, reason: UnfollowedReason) => {
    if (!unfollowed.some(link => link.from === from && link.href === href)) unfollowed.push({ from, href, target, reason });
  };
  // Seeds come first, so every required pointer is known before an optional target is judged.
  for (const [name, citations] of pending) {
    let content = documents[name];
    if (content === undefined) {
      if (required.has(name)) content = read(name, safeFile(root, name));
      else {
        const found = targetFile(root, name);
        if (!("file" in found)) { skipped.set(name, found.reason); for (const citation of citations) skip(citation.from, citation.href, name, found.reason); continue; }
        content = read(name, found.file);
      }
    }
    for (const link of documentLinks(name, content, seeds.has(name))) {
      if (link.target === undefined) {
        if (link.required) throw requiredLinkError(link, name);
        skip(name, link.href, link.href, link.reason);
        continue;
      }
      if (link.required) required.add(link.target);
      if (Object.hasOwn(documents, link.target)) continue;
      const reason = skipped.get(link.target);
      if (reason) { skip(name, link.href, link.target, reason); continue; }
      const citations = pending.get(link.target);
      if (citations) citations.push({ from: name, href: link.href });
      else pending.set(link.target, [{ from: name, href: link.href }]);
    }
  }
  return { documents, unfollowed };
}

/** Read membership and bytes twice. No plan ever combines files from separate observations. */
export function observeActivePlan(path: string, prdDirectory: string): { source: PlanSource; unfollowed: UnfollowedLink[] } {
  const first = readLinkedDocuments(path, prdDirectory); const second = readLinkedDocuments(path, prdDirectory);
  if (digest(first) !== digest(second)) throw new Error(`source_changed: documents changed while reading ${path}; retry the handback.`);
  return { source: planSourceFromDocuments(realpathSync(path), prdDirectory, first.documents), unfollowed: first.unfollowed };
}

/** The active plan alone, for callers that need no unfollowed links. */
export function observePlan(path: string, prdDirectory: string): PlanSource {
  return observeActivePlan(path, prdDirectory).source;
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
  // Ancestor prose is not leaf scope. Its ordered split identities are: in particular,
  // a parent's historical session must still judge the same first descendant.
  const splitStructureIntact = previous.plan.phases.filter(phase => isAncestorOf(phase.id, id) && phase.splitInto).every(parent => {
    const before = parent.splitInto!;
    const after = current.plan.phases.find(phase => phase.id === parent.id)?.splitInto;
    return after && after[0] === before[0] && before.every((child, index) => after.includes(child) && (index === 0 || after.indexOf(child) > after.indexOf(before[index - 1]!)));
  });
  return previous.scopes[id] === current.scopes[id] && splitStructureIntact && scopeRepositories.every(name => currentRepositories.has(name));
}

export function completedScopeProblems(previous: PlanSource, current: PlanSource, completions: PlanBaseline["completions"] = {}): string[] {
  return leavesOf(previous.plan).filter(p => p.closed).flatMap(old => {
    const found = current.plan.phases.find(p => p.id === old.id);
    return !found || !found.closed || found.splitInto || !completedPhaseScopeUnchanged(previous, current, old.id, completions[old.id]?.scopeRepositories)
      ? [`Phase ${old.id}: previously completed scope was removed, reopened, split or materially changed.`] : [];
  });
}

export function retainBaseline(directory: string, baseline: Omit<PlanBaseline, "id">): PlanBaseline {
  if (baseline.normalizerVersion === PLAN_NORMALIZER_VERSION && Object.values(baseline.completions).some(receipt => !Array.isArray(receipt.scopeRepositories))) throw new Error("baseline_unavailable: Restore the immutable completed repository scope before retaining this plan.");
  const value: PlanBaseline = { ...baseline, id: digest(baseline) };
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) + 1 > BASELINE_LIMIT) throw new PlanCapacityError(BASELINE_LIMIT, "retained baseline bytes");
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
  if (statSync(path).size > BASELINE_LIMIT) throw new PlanCapacityError(BASELINE_LIMIT, "retained baseline bytes");
  const value = JSON.parse(readFileSync(path, "utf8")) as PlanBaseline;
  const { id: stored, ...body } = value;
  if (value.formatVersion !== 1 || ![1, 2, 3, PLAN_NORMALIZER_VERSION].includes(value.normalizerVersion) || digest(body) !== stored || stored !== id) throw new Error("Retained plan is damaged or requires a newer Kiln.");
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
    const splitCompletion = active.plan.phases.some(phase => isAncestorOf(phase.id, phaseId) && phase.splitInto);
    if (receipt.scopeRepositories && !splitCompletion) continue;
    const revision = history && (receipt.repositories?.[history.repositoryName]?.revision ?? receipt.revision);
    if (!history || !revision) throw new Error(`baseline_unavailable: Phase ${phaseId} needs its original completion revision to recover historical repository/split scope. Restore that receipt/revision, then check again.`);
    if (!revisions.has(revision)) revisions.set(revision, history.read(revision));
    const source = await revisions.get(revision)!;
    if (!source.plan.phases.some(phase => phase.id === phaseId && phase.closed && !phase.splitInto) || !completedPhaseScopeUnchanged(source, active, phaseId, receipt.scopeRepositories ?? phaseRepositories(source, phaseId))) throw new Error(`baseline_unavailable: Phase ${phaseId} does not match its immutable completion scope at ${revision}. Reconcile the historical receipt and plan, then check again.`);
    completions[phaseId] = { ...receipt, scopeRepositories: receipt.scopeRepositories ?? phaseRepositories(source, phaseId) };
  }
  return retainBaseline(directory, { ...body, completions, normalizerVersion: PLAN_NORMALIZER_VERSION, active, sources: original.sources.map(reparse) });
}

/** Used only for presentation/comparison, never to infer historical completion evidence. */
export function addedLeaves(previous: RecordedPlanPhase[] | undefined, current: PhasePlan): string[] {
  return previous ? leavesOf(current).filter(p => !p.closed && !previous.some(old => old.id === p.id)).map(p => p.id) : [];
}
