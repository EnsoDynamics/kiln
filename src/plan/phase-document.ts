// Reads one phase document the way phase-split writes it (technical design, "The Plan Reader").

import { firstLink, headingText, linkedFileName, markdownLines, sectionLines, tableRows } from "./markdown-sections.js";
import { idTextFromFileName, isPhaseFileName } from "./phase-ids.js";

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
  /** The `## Split into` rows, or undefined for a leaf. */
  splitInto: SplitRow[] | undefined;
  /** `AC-<AREA>-<NN>` labels under `## Acceptance criteria covered`, in order, without repeats. */
  citedCriteria: string[];
  /** The text of `## Phase dependencies`, or undefined when the section is absent. */
  dependenciesText: string | undefined;
}

export const CRITERION_LABEL = /\bAC-[A-Z]+-\d+\b/g;

export function readPhaseDocument(fileName: string, markdown: string): PhaseDocument {
  const idText = idTextFromFileName(fileName) ?? "";
  const lines = markdownLines(markdown);

  const firstSectionIndex = lines.findIndex((line) => /^##\s/.test(line.text) && !line.inCodeFence);
  const preamble = firstSectionIndex === -1 ? lines : lines.slice(0, firstSectionIndex);
  const closed = preamble.some((line) => !line.inCodeFence && line.text.startsWith("**Closed:**"));

  const h1 = lines.map((line) => headingText(line, 1)).find((text) => text !== undefined);
  const title = readTitle(h1, idText, fileName);

  const splitLines = sectionLines(markdown, "Split into");
  const splitInto = splitLines === undefined ? undefined : tableRows(splitLines).map(readSplitRow).filter((row) => row.id !== "");

  const criteriaLines = sectionLines(markdown, "Acceptance criteria covered") ?? [];
  const citedCriteria = [...new Set(criteriaLines.flatMap((line) => line.text.match(CRITERION_LABEL) ?? []))];

  const dependencyLines = sectionLines(markdown, "Phase dependencies");
  const dependenciesText = dependencyLines?.map((line) => line.text).join("\n");

  return { fileName, idText, title, closed, splitInto, citedCriteria, dependenciesText };
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
