// Small Markdown readers shared by the plan reader and the document counts. Headings inside
// fenced code blocks are not headings.

export interface MarkdownLine {
  text: string;
  inCodeFence: boolean;
}

export function markdownLines(markdown: string): MarkdownLine[] {
  let inCodeFence = false;
  return markdown.split(/\r?\n/).map((text) => {
    const isFence = /^\s*(```|~~~)/.test(text);
    const line = { text, inCodeFence: inCodeFence || isFence };
    if (isFence) inCodeFence = !inCodeFence;
    return line;
  });
}

/**
 * The heading's text when the line is an ATX heading of exactly `level` (`## Title` for 2). A
 * closing run of `#` is dropped only after a space, as CommonMark has it: `# Port to C#` keeps its `#`.
 */
export function headingText(line: MarkdownLine, level: number): string | undefined {
  if (line.inCodeFence) return undefined;
  const match = new RegExp(`^#{${level}}\\s+(.*?)\\s*$`).exec(line.text);
  return match ? match[1]!.replace(/(^|\s+)#+$/, "") : undefined;
}

function headingLevel(line: MarkdownLine): number | undefined {
  if (line.inCodeFence) return undefined;
  const match = /^(#{1,6})\s/.exec(line.text);
  return match ? match[1]!.length : undefined;
}

/**
 * The lines under the first level-2 heading whose text matches `title` (case-insensitive),
 * up to the next heading of level 1 or 2. Undefined when there is no such heading.
 */
export function sectionLines(markdown: string, title: string): MarkdownLine[] | undefined {
  const lines = markdownLines(markdown);
  const start = lines.findIndex((line) => headingText(line, 2)?.toLowerCase() === title.toLowerCase());
  if (start === -1) return undefined;
  const body: MarkdownLine[] = [];
  for (const line of lines.slice(start + 1)) {
    const level = headingLevel(line);
    if (level !== undefined && level <= 2) break;
    body.push(line);
  }
  return body;
}

/** The cells of each body row of the first Markdown table in `lines` (header and separator rows left out). */
export function tableRows(lines: MarkdownLine[]): string[][] {
  const tableLines = [];
  for (const line of lines) {
    if (line.inCodeFence) continue;
    if (/^\s*\|/.test(line.text)) tableLines.push(line.text.trim());
    else if (tableLines.length > 0 && line.text.trim() !== "") break;
  }
  const isSeparator = (row: string) => /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*\|?$/.test(row);
  // Without its separator row it isn't a Markdown table, and its first row would be read as a body row.
  const separatorIndex = tableLines.findIndex(isSeparator);
  if (separatorIndex === -1) return [];
  const bodyLines = tableLines.slice(separatorIndex + 1);
  return bodyLines.filter((row) => !isSeparator(row)).map(splitTableRow);
}

function splitTableRow(row: string): string[] {
  const trimmed = row.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** The first `[text](href)` link in the text. */
export function firstLink(text: string): { text: string; href: string } | undefined {
  const match = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(text);
  return match ? { text: match[1]!, href: match[2]! } : undefined;
}

/** The file name a relative link points at, without any `#anchor` or `?query`. */
export function linkedFileName(href: string): string {
  const withoutAnchor = href.split(/[#?]/)[0] ?? "";
  const parts = withoutAnchor.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}
