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
  "Usage: kiln run <PRD directory or PRD file> [--resume]",
  "       kiln add-repository <folder name>",
  "       kiln delivery status | assess|prepare|evidence <JSON file>",
  "",
  "  kiln run opens one PRD for review; --resume immediately continues started work.",
  "  The path is one PRD's directory,",
  "  docs/prds/<name>/ or docs/changes/<name>/, or the PRD file in it. Everything",
  "  else happens in the browser view.",
  "",
  "  kiln add-repository, run from a PRD's workspace while kiln run works on it,",
  "  adds the repository of that folder name beside the PRD's repository to the",
  "  workspace, on the feature branch, and prints where its worktree is.",
  "",
  "  kiln delivery reads saved execution authority and records bounded delivery",
  "  assessments, operation intents and independently checked evidence. Run it",
  "  inside the assigned workspace. It cannot grant authority or execute delivery.",
].join("\n");

/**
 * The start-check failure, as drawn:
 *
 *   ✗ Can’t start Gift cards. Missing from docs/prds/gift-cards/:
 *       technical-design.md   the technical design, or gift-cards-technical-design.md
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
  | { kind: "interrupted" }
  | { kind: "resumed" }
  | { kind: "waiting"; label: string; resetsAt?: string }
  | { kind: "done"; pushedSha: string; pushes?: { name: string; sha: string }[] }
  | { kind: "opened"; number: number; opened?: { repository: string; number: number }[] }
  | { kind: "completed"; summary: string }
  | { kind: "added"; name: string };

/**
 * One line per phase event, as drawn: the time and id in grey, the title, then the event in
 * its color (started red, done green, stopped amber).
 *
 *   10:09  1   Return intake      done · pushed a1c4e09
 */
export function formatPhaseLine(at: Date, id: string, title: string, event: PhaseLineEvent, columns: PlanColumns, colors: TerminalColors): string {
  const pad = (text: string, width: number) => (text.length + 2 > width ? `${text}  ` : text.padEnd(width));
  // Red is Kiln's accent for the phase in progress, amber what needs the person, green done (AC-LOOK-04).
  const what =
    event.kind === "started" || event.kind === "resumed"
      ? colors.red(event.kind)
      : event.kind === "stopped" || event.kind === "interrupted"
        ? colors.amber(event.kind)
        : event.kind === "waiting"
          ? `waiting${colors.grey(` · ${event.label}${event.resetsAt === undefined ? "" : ` resets ${resetClock(new Date(event.resetsAt), at)}`}`)}`
          : event.kind === "done"
          ? colors.green("done") +
            colors.grey(event.pushes ? ` · pushed ${event.pushes.map((push) => `${push.name} ${push.sha.slice(0, 7)}`).join(" · ")}` : ` · pushed ${event.pushedSha.slice(0, 7)}`)
          : event.kind === "completed"
            ? colors.green("complete") + colors.grey(` · ${event.summary}`)
          : event.kind === "added"
            ? `added ${event.name}`
            : colors.green("opened") + colors.grey(event.opened ? ` ${event.opened.map((pull) => `${pull.repository} #${pull.number}`).join(" · ")}` : ` #${event.number}`);
  return `${colors.grey(`${terminalTime(at)}  ${pad(id, columns.idWidth)}`)}${pad(title, columns.titleWidth)}${what}`;
}

/**
 * A reset time as the terminal says it (usage-limit recovery AC-LIMIT-05): local, 12-hour,
 * rounded to the minute, with the weekday when it isn't today: "3:40 PM", "Wed 8:00 AM".
 */
export function resetClock(at: Date, now: Date): string {
  const rounded = new Date(Math.round(at.getTime() / 60_000) * 60_000);
  const time = rounded.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return rounded.toDateString() === now.toDateString() ? time : `${rounded.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

/**
 * ` 9:17  Started  ·  feature/customer-returns from develop`, or with several repositories
 * ` 9:17  Started  ·  feature/customer-returns in 3 repositories`.
 */
export function formatStartedLine(at: Date, branch: string, baseBranch: string, colors: TerminalColors, repositoryCount = 1): string {
  const where = repositoryCount > 1 ? `in ${repositoryCount} repositories` : `from ${baseBranch}`;
  return `${colors.grey(`${terminalTime(at)}  `)}Started${colors.grey(`  ·  ${branch} ${where}`)}`;
}

/**
 * The ● line for a feature not started, as drawn, then the grey line under it:
 *
 *   ● Opened http://127.0.0.1:4700/customer-returns. Review it there and press Start.
 *     Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.
 *
 * When the browser couldn't be opened, the line gives the address alone and an amber line says
 * why. `addressGiven` is set when the ● line above already printed the address.
 */
export function formatOpenedLine(address: string, openError: string | undefined, colors: TerminalColors, addressGiven = false): string {
  const failure = openError === undefined ? [] : [`${colors.amber("✗")} Couldn’t open the browser: ${openError}. Open ${address} yourself.`];
  if (addressGiven) return failure.join("\n");
  const opened = openError === undefined ? `Opened ${colors.red(address)}` : `Kiln’s view is at ${colors.red(address)}`;
  return [
    `${colors.red("●")} ${opened}${colors.grey(". Review it there and press Start.")}`,
    ...failure,
    colors.grey("  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up."),
  ].join("\n");
}

/**
 * The first line for a feature not started, as drawn:
 *
 *   Customer returns  ·  PRD, technical design, assumptions, 6 phase docs  ·  all checks passed
 */
export function formatDocumentsFound(featureName: string, found: StartCheckReport["found"], colors: TerminalColors, repositoryCount = 1): string {
  const documents = ["PRD", "technical design"];
  if (found.assumptionsFile) documents.push("assumptions");
  documents.push(`${found.phaseDocCount} ${found.phaseDocCount === 1 ? "phase doc" : "phase docs"}`);
  // The repository count only when more than one (multi-repo AC-REPO-03).
  if (repositoryCount > 1) documents.push(`${repositoryCount} repositories`);
  return featureName + colors.grey(`  ·  ${documents.join(", ")}  ·  all checks passed`);
}
