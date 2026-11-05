/**
 * The one place Kiln states the oldest agent tooling it supports (AC-AGENT-05).
 * Every gate compares against these minimums and accepts every later version
 * (AC-AGENT-01). The README requirements test reads this module.
 */
export const TOOLING_MINIMUMS = {
  claudeCode: "2.1.311",
  codex: "0.162.1",
  node: "22.15.0",
  git: "2.29.0",
  /** Codex on Windows only. */
  powershell: "7.5.2",
} as const;

export type Tool = keyof typeof TOOLING_MINIMUMS;
export type VersionState = "supported" | "below_minimum" | "unrecognised";
export interface VersionReading { state: VersionState; version?: string }

const names: Record<Tool, string> = { claudeCode: "Claude Code", codex: "Codex", node: "Node.js", git: "Git", powershell: "PowerShell" };
const updateCommands: Partial<Record<Tool, string>> = { claudeCode: "claude update", codex: "codex update" };

export const toolName = (tool: Tool) => names[tool];

/** A minimum as people read it: a trailing `.0` is dropped (`2.29`, `22.15`, `2.1.311`). */
export const displayMinimum = (tool: Tool) => TOOLING_MINIMUMS[tool].replace(/\.0$/, "");

/**
 * The first `major.minor.patch` in a `--version` output, not part of a longer
 * dotted number to its left, with an optional prerelease (`-…`) and build
 * metadata (`+…`). Text after it (`(Claude Code)`, `.windows.1`) is ignored.
 */
const VERSION = /(?<![\d.])(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?/;

/**
 * Compare a tool's `--version` output with its minimum. Output that has no
 * version Kiln can parse is unrecognised, never below minimum. A prerelease
 * comes before its release, so one is supported only above the minimum.
 */
export function compareToMinimum(tool: Tool, versionOutput: string | undefined): VersionReading {
  const match = VERSION.exec(versionOutput ?? "");
  if (!match) return { state: "unrecognised" };
  const actual = match.slice(1, 4).map(Number);
  if (!actual.every(Number.isSafeInteger)) return { state: "unrecognised" };
  const version = match[0];
  const minimum = TOOLING_MINIMUMS[tool].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i]! > minimum[i]!) return { state: "supported", version };
    if (actual[i]! < minimum[i]!) return { state: "below_minimum", version };
  }
  return { state: match[4] ? "below_minimum" : "supported", version };
}

/** How the requirement reads where a tool is missing or must be installed. */
export const requirement = (tool: Tool) => `${names[tool]} ${displayMinimum(tool)} or later`;

/** The Version problem wording for a version below its minimum. */
export function belowMinimumProblem(tool: Tool, version: string): string {
  const update = updateCommands[tool];
  return `${names[tool]} ${version} is older than Kiln supports. Install ${requirement(tool)}${update ? `: ${update}` : "."}`;
}

/** Codex on Windows runs under a PowerShell supervisor; `pwsh` missing is a readiness blocker. */
export const POWERSHELL_MISSING = `Codex on Windows needs ${requirement("powershell")}. Install it before starting work.`;
