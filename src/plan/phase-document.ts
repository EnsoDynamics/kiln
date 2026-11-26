// Reads one phase document the way phase-split writes it (technical design, "The Plan Reader").

import { firstLink, headingText, linkedFileName, markdownLines, sectionLines, tableRows } from "./markdown-sections.js";
import { idTextFromFileName, isPhaseFileName } from "./phase-ids.js";
import { readRepositoryName } from "./repository-names.js";

export interface SplitRow {
  /** The row's phase id: from the file its first cell links to, else the cell's first word. */
  id: string;
}

export interface PhaseDocument {
  fileName: string;
  /** The id text from the file name; it may not parse as a phase id. */
  idText: string;
  /** The H1 after `Phase <id>:`, word for word, without a trailing ` — split into …`. */
  title: string;
  /** A line starting `**Closed:**` before the first `##` heading. */
  closed: boolean;
  /**
   * The names on a `**Repositories:**` line before the first `##` heading, split at commas and
   * trimmed (multi-repo AC-REPO-01); empty when there is no such line.
   */
  repositories: string[];
  /** What is wrong with the `**Repositories:**` line: no names, or a name that is neither a folder name nor an address path. */
  repositoriesProblem: string | undefined;
  /**
   * The text after an `**Attended:**` line before the first `##` heading, trimmed; empty when the
   * line has no text, undefined when there is no such line (build preflight AC-ATTEND-01).
   */
  attended: string | undefined;
  /** The text after an `**Early merge:**` line before the first `##` heading, trimmed, as `attended` (AC-ATTEND-05). */
  earlyMerge: string | undefined;
  /**
   * The first `**Model tier:**` line before the first `##` heading (Kiln Phase Model Tiers
   * AC-TIER-01): its tier and the reason after it. Undefined when there is no such line or its
   * first word names none of the three tiers; display and model choice only, never a plan problem.
   */
  modelTier: ModelTier | undefined;
  /** The `## Split into` rows, or undefined for a leaf. */
  splitInto: SplitRow[] | undefined;
  /** `AC-<AREA>-<NN>` labels under `## Acceptance criteria covered`, in order, without repeats. */
  citedCriteria: string[];
  /** The text of `## Phase dependencies`, or undefined when the section is absent. */
  dependenciesText: string | undefined;
}

export type Tier = "demanding" | "standard" | "mechanical";
export interface ModelTier { tier: Tier; reason: string }

/**
 * A `**Model tier:**` line's tier and reason: the first word after the label, any case, and the
 * rest after a hyphen, em dash or colon, or after the tier word when there is no separator.
 *
 *   readModelTierLine("**Model tier:** demanding — AC-REF-04 requires one refund")  // { tier: "demanding", reason: "AC-REF-04 requires one refund" }
 *   readModelTierLine("**Model tier:** premium")                                     // undefined
 */
export function readModelTierLine(line: string | undefined): ModelTier | undefined {
  if (line === undefined) return undefined;
  const rest = line.slice("**Model tier:**".length).trim();
  const match = /^([A-Za-z]+)\b\s*(.*)$/s.exec(rest);
  const tier = match?.[1]?.toLowerCase();
  if (tier !== "demanding" && tier !== "standard" && tier !== "mechanical") return undefined;
  const after = match![2]!.trim();
  const separated = /^(?:-|—|:)\s*(.*)$/s.exec(after);
  return { tier, reason: (separated ? separated[1]! : after).trim() };
}

export const CRITERION_LABEL = /\bAC-[A-Z]+-\d+\b/g;

export function readPhaseDocument(fileName: string, markdown: string): PhaseDocument {
  const idText = idTextFromFileName(fileName) ?? "";
  const lines = markdownLines(markdown);

  const firstSectionIndex = lines.findIndex((line) => /^##\s/.test(line.text) && !line.inCodeFence);
  const preamble = firstSectionIndex === -1 ? lines : lines.slice(0, firstSectionIndex);
  const closed = preamble.some((line) => !line.inCodeFence && line.text.startsWith("**Closed:**"));
  const repositoriesLine = preamble.find((line) => !line.inCodeFence && line.text.startsWith("**Repositories:**"));
  const { repositories, problem: repositoriesProblem } = readRepositoriesLine(fileName, repositoriesLine?.text);
  // Display facts only: neither line can make a plan fail to read (build preflight "Phase Document Lines").
  const attended = preambleLineText(preamble, "**Attended:**");
  const earlyMerge = preambleLineText(preamble, "**Early merge:**");
  const modelTier = readModelTierLine(preamble.find((line) => !line.inCodeFence && line.text.startsWith("**Model tier:**"))?.text);

  const h1 = lines.map((line) => headingText(line, 1)).find((text) => text !== undefined);
  const title = readTitle(h1, idText, fileName);

  const splitLines = sectionLines(markdown, "Split into");
  const splitInto = splitLines === undefined ? undefined : tableRows(splitLines).map(readSplitRow).filter((row) => row.id !== "");

  const criteriaLines = sectionLines(markdown, "Acceptance criteria covered") ?? [];
  const citedCriteria = [...new Set(criteriaLines.flatMap((line) => line.text.match(CRITERION_LABEL) ?? []))];

  const dependencyLines = sectionLines(markdown, "Phase dependencies");
  const dependenciesText = dependencyLines?.map((line) => line.text).join("\n");

  return { fileName, idText, title, closed, repositories, repositoriesProblem, attended, earlyMerge, modelTier, splitInto, citedCriteria, dependenciesText };
}

/**
 * The `**Repositories:**` line's names, as written. Each is a folder name or an address path
 * (find repositories anywhere AC-NAME-01); anything else is the line's problem.
 *
 *   readRepositoriesLine("phase-2b-store-credit.md", "**Repositories:** returns-api, acme-labs/storefront")
 *   // { repositories: ["returns-api", "acme-labs/storefront"], problem: undefined }
 */
export function readRepositoriesLine(fileName: string, line: string | undefined): { repositories: string[]; problem: string | undefined } {
  if (line === undefined) return { repositories: [], problem: undefined };
  const rest = line.slice("**Repositories:**".length).trim();
  if (rest === "") return { repositories: [], problem: `${fileName} has a Repositories line that names no repository.` };
  const names = rest.split(",").map((name) => name.trim());
  if (names.includes("")) return { repositories: [], problem: `${fileName} has an empty name on its Repositories line.` };
  for (const name of names) {
    const read = readRepositoryName(name);
    if (read.kind === "problem") return { repositories: [], problem: read.problem(fileName) };
  }
  return { repositories: [...new Set(names)], problem: undefined };
}

/**
 * The trimmed text after a preamble line's bold label, or undefined when no line starts with it.
 *
 *   preambleLineText(preamble, "**Attended:**")  // "Create the label template in the carrier's console."
 */
function preambleLineText(preamble: ReturnType<typeof markdownLines>, label: string): string | undefined {
  const line = preamble.find((one) => !one.inCodeFence && one.text.startsWith(label));
  return line === undefined ? undefined : line.text.slice(label.length).trim();
}

function readTitle(h1: string | undefined, idText: string, fileName: string): string {
  if (h1 === undefined) return fileName;
  const escapedId = idText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutPrefix = h1.replace(new RegExp(`^Phase\\s+${escapedId}:\\s*`), "");
  return withoutPrefix.replace(/\s+—\s+split into\b.*$/i, "");
}

function readSplitRow(cells: string[]): SplitRow {
  const firstCell = cells[0] ?? "";
  const link = firstLink(firstCell);
  if (link) {
    const linked = linkedFileName(link.href);
    if (isPhaseFileName(linked)) return { id: idTextFromFileName(linked) ?? "" };
  }
  const plain = firstCell.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*`_]/g, "").trim();
  return { id: plain.split(/\s+/)[0] ?? "" };
}
