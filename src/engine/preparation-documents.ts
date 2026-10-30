/** Versioned ordinary-prose extraction. These instructions are evidence, never executable shell. */
import MarkdownIt from "markdown-it";
import { markdownLines } from "../plan/markdown-sections.js";
import { posix } from "node:path";
import { dependencyIds, type PlannedPhase } from "../plan/phase-plan.js";
import type { PlanSource } from "./plan-reconciliation.js";

export interface SourceSpan { file: string; line: number; endLine: number; text: string }
export interface PreparationCheckDefinition { command: string; argv: string[]; directory: string; timeoutSeconds: number; span: SourceSpan }
export interface PreparationInstruction {
  extractorVersion: 1; phaseId: string; prerequisites: string[]; repository: string;
  sourceRef: string; revision: string; destination: "assigned_feature" | string;
  spans: SourceSpan[]; checks: PreparationCheckDefinition[];
}
export interface ProseSpan extends SourceSpan { section: string; links: string[] }
const markdown = new MarkdownIt();
const id = String.raw`\d+(?:[a-z]+\d+)*[a-z]*`;

/** Shares MarkdownIt's token structure with the scope normalizer; quotes/fences cannot grant work. */
export function proseSpans(file: string, content: string): ProseSpan[] {
  const tokens = markdown.parse(content, {}); let section = ""; let quoted = 0;
  const result: ProseSpan[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === "blockquote_open") quoted++;
    if (token.type === "blockquote_close") quoted--;
    if (quoted || token.type !== "inline") continue;
    const text = (token.children ?? []).map(child => child.type === "code_inline" ? `\`${child.content}\`` : ["softbreak", "hardbreak"].includes(child.type) ? " " : child.type === "text" ? child.content : "").join("").replace(/\s+/g, " ").trim();
    if (tokens[i - 1]?.type === "heading_open") { if (["h1", "h2"].includes(tokens[i - 1]!.tag)) section = text; continue; }
    const line = (token.map?.[0] ?? 0) + 1;
    result.push({ file, line, endLine: token.map?.[1] ?? line, text, section, links: (token.children ?? []).flatMap(child => child.type === "link_open" && child.attrGet("href") ? [String(child.attrGet("href"))] : []) });
  }
  return result;
}

/** Tokenize quoted argv only. No shell, assignments, substitution, or inline evaluation. */
export function checkArgv(command: string): string[] {
  if (/[\n\r\0;&|<>`$]/.test(command)) throw new Error("Shell operators, substitutions and redirection are unsupported.");
  const argv: string[] = []; let word = ""; let quote = ""; let started = false;
  for (const c of command) {
    if (c === "\\") throw new Error("Escaped shell syntax is unsupported.");
    if (quote) { if (c === quote) quote = ""; else word += c; started = true; }
    else if (c === "'" || c === '"') { quote = c; started = true; }
    else if (/\s/.test(c)) { if (started) argv.push(word); word = ""; started = false; }
    else { word += c; started = true; }
  }
  if (quote) throw new Error("Unclosed command quote.");
  if (started) argv.push(word);
  if (!argv.length || argv[0]!.includes("=") || argv.some(arg => ["-c", "-e", "--eval", "--command", "-Command", "-EncodedCommand"].includes(arg)) || /^(?:.*\/)?(?:sh|bash|zsh|fish|cmd|powershell|pwsh|env)$/.test(argv[0]!)) throw new Error("Use a documented project validation tool or script, without inline evaluation.");
  return argv;
}

export function extractPreparation(source: PlanSource, directory: string, phase: PlannedPhase, repositories: string[]): { instructions: PreparationInstruction[]; problems: string[] } {
  const file = posix.join(directory, phase.fileName);
  const paragraphs = proseSpans(file, source.documents[file]!);
  const notes = paragraphs.filter(span => span.section === "Phase-specific notes");
  const instructions: PreparationInstruction[] = []; const problems: string[] = [];
  let current: PreparationInstruction | undefined;
  const fail = (span: SourceSpan, reason: string) => problems.push(`${span.file}:${span.line}–${span.endLine}: ${reason} Reconcile the phase/plan prose and commit the coherent documents, then check again.`);
  for (const span of notes) {
    if (/^First step:/i.test(span.text)) {
      current = undefined;
      const opening = new RegExp(`^First step: merge (Phase ${id}(?: and Phase ${id})*)(?: and the whole-PRD test audit)?[.:]?\\s+`, "i").exec(span.text);
      if (!opening) { fail(span, "Unsupported preparation opening. Use: First step: merge Phase 8. Merge the local branch `source` at `revision` into this phase's branch before building."); continue; }
      const prerequisites = [...opening[1]!.matchAll(new RegExp(`Phase (${id})`, "gi"))].map(match => match[1]!);
      const statement = span.text.slice(opening[0].length);
      const merge = /^(?:In repository `([^`]+)`, merge|Merge)(?: the local)? branch `([^`]+)` at `([a-f0-9]{7,64})`(?: \(its last commit is not on `origin`; the branch is shared across worktrees\))? into (this phase's branch|branch `([^`]+)`) before building\.$/.exec(statement);
      if (!merge) { fail(span, "Unsupported preparation operands. Use: Merge the local branch `source` at `revision` into this phase's branch before building."); continue; }
      const repository = merge[1] ?? (repositories.length === 1 ? repositories[0] : undefined);
      if (!repository || !repositories.includes(repository)) { fail(span, "Name exactly one affected repository: In repository `name`, merge branch `source` at `revision` into this phase's branch before building."); continue; }
      if (prerequisites.some(prerequisite => !dependencyIds(phase.dependenciesText).includes(prerequisite))) { fail(span, "Every preparation prerequisite must name a parsed Phase dependencies entry."); continue; }
      current = { extractorVersion: 1, phaseId: phase.id, prerequisites, repository, sourceRef: merge[2]!, revision: merge[3]!, destination: merge[4] === "this phase's branch" ? "assigned_feature" : merge[5]!, spans: [span], checks: [] };
      instructions.push(current);
    } else if (current && /^Verify before building:/i.test(span.text)) {
      const match = /^Verify before building: run `([^`]+)`(?: in `([^`]+)`)?(?: with timeout `(\d+)` seconds)?\.?$/.exec(span.text);
      if (!match) { fail(span, "Unsupported verification. Use: Verify before building: run `npm test` in `.` with timeout `1800` seconds."); continue; }
      try {
        const directory = match[2] ?? "."; const timeoutSeconds = match[3] ? Number(match[3]) : 1800;
        if (posix.isAbsolute(directory) || directory.includes("\\") || directory.split("/").includes("..") || directory.includes("\0")) throw new Error("Verification directory must stay inside the assigned repository.");
        if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86400) throw new Error("Verification timeout must be 1–86400 seconds.");
        current.checks.push({ command: match[1]!, argv: checkArgv(match[1]!), directory, timeoutSeconds, span }); current.spans.push(span);
      } catch (error) { fail(span, (error as Error).message); }
    } else if (current) {
      // Unknown subordinate instructions must not disappear from an authorization decision.
      fail(span, "Unsupported preparation instruction; use the documented merge and Verify before building forms.");
    }
  }
  for (const instruction of instructions) {
    if (!instruction.checks.length) fail(instruction.spans[0]!, "Preparation requires verification: Verify before building: run `npm test`.");
    const linked = paragraphs.flatMap(span => span.links).filter(href => !/^[a-z]+:/i.test(href)).map(href => posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(href.split(/[?#]/)[0]!))));
    const assertions = [...paragraphs.filter(span => span.section === "Phase dependencies"), ...linked.flatMap(path => source.documents[path] ? proseSpans(path, source.documents[path]!).filter(span => new RegExp(`\\bPhase ${phase.id}\\b`, "i").test(span.text)) : [])];
    for (const path of linked) for (const [index, sourceLine] of markdownLines(source.documents[path] ?? "").entries()) {
      const line = sourceLine.text;
      if (!sourceLine.inCodeFence && /^\s*\|/.test(line) && (line.includes(phase.fileName) || new RegExp(`\\bPhase ${phase.id}\\b`, "i").test(line))) assertions.push({ file: path, line: index + 1, endLine: index + 1, text: line, section: "linked plan row", links: [] });
    }
    for (const span of assertions) for (const match of span.text.matchAll(/(?:into|integrated in|merged into|merge to) (?:branch )?(`[^`]+`|this phase's branch|the assigned feature branch)/gi)) {
      const target = match[1]!.startsWith("`") ? match[1]!.slice(1, -1) : "assigned_feature";
      instruction.spans.push(span);
      if (target !== instruction.destination) fail(span, `Contradictory preparation destination ${target}; the preparation item names ${instruction.destination}. Every destination assertion must agree.`);
    }
  }
  return { instructions, problems };
}
