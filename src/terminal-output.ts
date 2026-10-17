// What `kiln run` prints, in the terminal mockup's words and colors
// (docs/design/mockups/kiln-screen-terminal-kickoff.html; assumptions UI-010 item 10).

import type { StartCheckReport } from "./start-checks.js";

export interface TerminalColors {
  amber(text: string): string;
  grey(text: string): string;
  lightGrey(text: string): string;
  red(text: string): string;
  green(text: string): string;
}

const rgb = (red: number, green: number, blue: number) => (text: string) => `\x1b[38;2;${red};${green};${blue}m${text}\x1b[39m`;

/** The mockup's colors, or plain text when the stream isn't a terminal or NO_COLOR is set. */
export function terminalColors(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): TerminalColors {
  if (!stream.isTTY || (env.NO_COLOR !== undefined && env.NO_COLOR !== "")) {
    const plain = (text: string) => text;
    return { amber: plain, grey: plain, lightGrey: plain, red: plain, green: plain };
  }
  return {
    amber: rgb(230, 180, 80),
    grey: rgb(140, 133, 119),
    lightGrey: rgb(189, 182, 168),
    red: rgb(226, 105, 79),
    green: rgb(156, 196, 154),
  };
}

export const USAGE = [
  "Usage: kiln run <PRD directory or PRD file>",
  "",
  "  Moves one PRD's phase plan forward. The path is one PRD's directory,",
  "  docs/prds/<name>/ or docs/changes/<name>/, or the PRD file in it.",
  "  kiln run is the only command; everything else happens in the browser view.",
].join("\n");

/**
 * The start-check failure, as drawn:
 *
 *   ✗ Can’t start Gift cards. Missing from docs/prds/gift-cards/:
 *       technical-design.md   the technical design
 *     Kiln needs the PRD, its technical design and its phase documents. Nothing was started.
 */
export function formatStartFailure(featureName: string, prdDirectoryFromRoot: string, report: Pick<StartCheckReport, "missingDocuments" | "problems">, colors: TerminalColors): string {
  const lines: string[] = [];
  const missing = report.missingDocuments;
  lines.push(
    `${colors.amber("✗")} Can’t start ${featureName}.` + (missing.length > 0 ? ` Missing from ${prdDirectoryFromRoot}/:` : ""),
  );
  const width = Math.max(0, ...missing.map((document) => document.name.length)) + 3;
  for (const document of missing) lines.push(colors.grey(`    ${document.name.padEnd(width)}`) + colors.lightGrey(document.description));
  for (const problem of report.problems) lines.push(colors.lightGrey(`    ${problem}`));
  lines.push(
    colors.grey(
      missing.length > 0 ? "  Kiln needs the PRD, its technical design and its phase documents. Nothing was started." : "  Nothing was started.",
    ),
  );
  return lines.join("\n");
}

/** A terminal time: local, 12-hour, no day, right-aligned in five columns (` 9:17`, `11:04`). */
export function terminalTime(at: Date): string {
  const hours = at.getHours() % 12 === 0 ? 12 : at.getHours() % 12;
  return `${hours}:${String(at.getMinutes()).padStart(2, "0")}`.padStart(5);
}

export interface PlanColumns {
  idWidth: number;
  titleWidth: number;
}

/** Column widths for phase lines: the longest id and title in the plan, plus two spaces, as drawn. */
export function planColumns(plan: { id: string; title: string }[]): PlanColumns {
  return {
    idWidth: Math.max(2, ...plan.map((phase) => phase.id.length)) + 2,
    titleWidth: Math.max(0, ...plan.map((phase) => phase.title.length)) + 2,
  };
}

export type PhaseLineEvent =
  | { kind: "started" }
  | { kind: "stopped" }
  | { kind: "done"; pushedSha: string }
  | { kind: "opened"; number: number };

/**
 * One line per phase event, as drawn: the time and id in grey, the title, then the event in
 * its color (started red, done green, stopped amber).
 *
 *   10:09  1   Return intake      done · pushed a1c4e09
 */
export function formatPhaseLine(at: Date, id: string, title: string, event: PhaseLineEvent, columns: PlanColumns, colors: TerminalColors): string {
  const pad = (text: string, width: number) => (text.length + 2 > width ? `${text}  ` : text.padEnd(width));
  const what =
    event.kind === "started"
      ? colors.red("started")
      : event.kind === "stopped"
        ? colors.amber("stopped")
        : event.kind === "done"
          ? colors.green("done") + colors.grey(` · pushed ${event.pushedSha.slice(0, 7)}`)
          : colors.green("opened") + colors.grey(` #${event.number}`);
  return `${colors.grey(`${terminalTime(at)}  ${pad(id, columns.idWidth)}`)}${pad(title, columns.titleWidth)}${what}`;
}

/** ` 9:17  Started  ·  feature/customer-returns from develop` */
export function formatStartedLine(at: Date, branch: string, baseBranch: string, colors: TerminalColors): string {
  return `${colors.grey(`${terminalTime(at)}  `)}Started${colors.grey(`  ·  ${branch} from ${baseBranch}`)}`;
}

/**
 * The first line for a feature not started, as drawn:
 *
 *   Customer returns  ·  PRD, technical design, assumptions, 6 phase docs  ·  all checks passed
 */
export function formatDocumentsFound(featureName: string, found: StartCheckReport["found"], colors: TerminalColors): string {
  const documents = ["PRD", "technical design"];
  if (found.assumptions) documents.push("assumptions");
  documents.push(`${found.phaseDocCount} ${found.phaseDocCount === 1 ? "phase doc" : "phase docs"}`);
  return featureName + colors.grey(`  ·  ${documents.join(", ")}  ·  all checks passed`);
}
