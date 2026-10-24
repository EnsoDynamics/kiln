import type { OutputLine } from "../../../src/session/session-output.js";

export const LIVE_ENTRY_LIMIT = 100;

/** Numbered entries can arrive from HTTP and SSE in either order. */
export function mergeOutput(current: OutputLine[], incoming: OutputLine[], recent: boolean): OutputLine[] {
  const byNumber = new Map(current.map(line => [line.line, line]));
  for (const line of incoming) byNumber.set(line.line, line);
  const ordered = [...byNumber.values()].sort((a, b) => a.line - b.line);
  return recent ? ordered.slice(-LIVE_ENTRY_LIMIT) : ordered;
}

/** Only known tool names are formatted as calls; reviewer prose stays prose. */
export function outputCall(line: Pick<OutputLine, "source" | "text">): { name: string; input: string } | undefined {
  if (!["tool", "skill", "reviewer", "subagent"].includes(line.source)) return;
  const match = /^(Bash|Read|Edit|Write|Grep|Glob|Agent|Task|Skill|NotebookEdit|WebFetch|WebSearch|mcp__\S+)\s+([\s\S]*)$/.exec(line.text);
  if (match) return { name: match[1]!, input: match[2]! };
}

export function outputPreview(text: string, maxLines: number, maxCharacters: number): { text: string; hidden: boolean; extraLines: number } {
  const rows = text.split("\n");
  const preview = rows.slice(0, maxLines).join("\n").slice(0, maxCharacters);
  return { text: preview, hidden: preview.length < text.length, extraLines: Math.max(0, rows.length - preview.split("\n").length) };
}
