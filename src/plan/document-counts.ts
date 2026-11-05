// What Documents found counts beside the PRD (PRD AC-START-04; technical design, "The Plan
// Reader", "What Documents found counts").

import { headingText, markdownLines, sectionLines, tableRows } from "./markdown-sections.js";

export interface PrdCriteria {
  labels: string[];
  count: number;
  firstLabel: string | undefined;
  lastLabel: string | undefined;
}

/**
 * The PRD's acceptance criteria: list items that open with a bold label (`- [ ] **AC-X-01`),
 * leaving out retired labels and fully superseded criteria. Labels anywhere else (another
 * PRD's in `Replaces:` lines, labels in prose) aren't criteria.
 */
export function countPrdCriteria(prdMarkdown: string): PrdCriteria {
  const lines = markdownLines(prdMarkdown);
  const labels: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.inCodeFence) continue;
    const match = /^\s*[-*] \[[ xX]\] \*\*(AC-[A-Z]+-\d+)(.*)$/.exec(line.text);
    if (!match) continue;
    const label = match[1]!;
    const afterLabel = match[2]!.replace(/^[\s*—–\-:.]+/, "");
    if (/^retired/i.test(afterLabel)) continue;

    const block = [line.text];
    for (let next = index + 1; next < lines.length; next++) {
      const text = lines[next]!.text;
      if (/^\s*[-*] \[[ xX]\]/.test(text) || /^#{1,6}\s/.test(text)) break;
      block.push(text);
    }
    if (block.some((text) => text.includes("Superseded by:"))) continue;
    labels.push(label);
  }
  return { labels, count: labels.length, firstLabel: labels[0], lastLabel: labels[labels.length - 1] };
}

/**
 * Every criterion label a document cites, reading ranges (`AC-START-01 to 09`,
 * `AC-START-01–09`) as every label in them and bare numbers continuing a label after commas
 * (`AC-CLI-01, 02`) as labels of that label's area.
 *
 *   citedLabels("AC-CLI-01, 02; AC-VIEW-01 to 03")
 *   // Set { "AC-CLI-01", "AC-CLI-02", "AC-VIEW-01", "AC-VIEW-02", "AC-VIEW-03" }
 */
export function citedLabels(markdown: string): Set<string> {
  const cited = new Set<string>();
  const labelPattern = /\bAC-([A-Z]+)-(\d+)\b/g;
  let match;
  while ((match = labelPattern.exec(markdown)) !== null) {
    const area = match[1]!;
    const width = match[2]!.length;
    const label = (n: number) => `AC-${area}-${String(n).padStart(width, "0")}`;
    let last = Number.parseInt(match[2]!, 10);
    cited.add(label(last));

    let rest = markdown.slice(labelPattern.lastIndex);
    let consumed = 0;
    for (;;) {
      const range = new RegExp(`^(?:\\s+to\\s+|\\s*–\\s*)(?:AC-${area}-)?(\\d+)\\b`).exec(rest);
      if (range) {
        const end = Number.parseInt(range[1]!, 10);
        for (let n = last + 1; n <= end; n++) cited.add(label(n));
        last = end;
      } else {
        const continued = /^\s*,\s*(\d+)\b(?![-\w])/.exec(rest);
        if (!continued) break;
        last = Number.parseInt(continued[1]!, 10);
        cited.add(label(last));
        rest = rest.slice(continued[0].length);
        consumed += continued[0].length;
        continue;
      }
      rest = rest.slice(range[0].length);
      consumed += range[0].length;
    }
    labelPattern.lastIndex += consumed;
  }
  return cited;
}

/** How many of the PRD's criteria the technical design cites. */
export function countDesignCitations(designMarkdown: string, prdLabels: string[]): number {
  const cited = citedLabels(designMarkdown);
  return prdLabels.filter((label) => cited.has(label)).length;
}

export interface AssumptionCounts {
  total: number;
  notYetConfirmed: number;
}

/**
 * Assumption entries are `### <ID>.` headings; the Validated Assumptions table's rows are
 * confirmed ones. Not yet confirmed: entries outside that table whose heading doesn't carry
 * `✅ VALIDATED` (a transitional marker).
 */
export function countAssumptions(assumptionsMarkdown: string): AssumptionCounts {
  const lines = markdownLines(assumptionsMarkdown);
  let inValidatedSection = false;
  let entries = 0;
  let notYetConfirmed = 0;
  for (const line of lines) {
    const sectionTitle = headingText(line, 2);
    if (sectionTitle !== undefined) inValidatedSection = /^Validated Assumptions$/i.test(sectionTitle);
    const entryHeading = headingText(line, 3);
    if (inValidatedSection || entryHeading === undefined || !/^[A-Z]+-\d+\./.test(entryHeading)) continue;
    entries++;
    if (!entryHeading.includes("✅ VALIDATED")) notYetConfirmed++;
  }
  const validatedRows = tableRows(sectionLines(assumptionsMarkdown, "Validated Assumptions") ?? []).length;
  return { total: entries + validatedRows, notYetConfirmed };
}
