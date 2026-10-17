// The `kiln` command line: `kiln run <path>` is the only command (PRD AC-START-01, AC-CLI-02).
// It resolves the PRD, takes the PRD's instance lock and port, and moves the feature forward
// (AC-CLI-01; technical design, "Where a Feature Stands").

import { basename, dirname, resolve } from "node:path";
import { Engine, type TerminalEvent } from "./engine/engine.js";
import { findExecutable } from "./platform/helper-process.js";
import { featureNameFor, resolvePrdPath, type PrdLocation } from "./prd-location.js";
import { runStartChecks, startChecksPassed } from "./start-checks.js";
import { takeInstanceLock, viewAddress, PORT_RANGE } from "./state/instance-lock.js";
import { NewerSchemaError, readPrdRecord, type PrdRecord } from "./state/records.js";
import { prdStateDirectory, stateRoot } from "./state/state-files.js";
import { formatDocumentsFound, formatPhaseLine, formatStartedLine, formatStartFailure, planColumns, terminalColors, USAGE, type TerminalColors } from "./terminal-output.js";
import { formatDecisionLine, formatSummaryLine } from "./underway-output.js";
import { PR_TITLE } from "./engine/snapshot.js";

export interface CommandContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: { write(text: string): unknown; isTTY?: boolean };
  stderr: { write(text: string): unknown; isTTY?: boolean };
}

/** Exit code for a command line Kiln can't act on: no path, an unknown command, a path that isn't one PRD. */
export const EXIT_USAGE = 2;
/** Exit code when a start check fails, the PRD is already running, or Kiln can't go on. */
export const EXIT_START_CHECKS_FAILED = 1;

/**
 * Runs the `kiln` command line and returns its exit code.
 *
 *   await runKilnCommand(["run", "docs/prds/customer-returns/"], context)  // 0 when every start check passes
 */
export async function runKilnCommand(args: string[], context: CommandContext): Promise<number> {
  const [command, ...rest] = args;
  if (command === "--help" || command === "-h") {
    context.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (command === undefined) return usageError(context);
  if (command !== "run") return usageError(context, `kiln: unknown command "${command}". kiln run is the only command.`);
  if (rest.length === 0) return usageError(context);
  if (rest.length > 1) return usageError(context, "kiln: kiln run takes one path.");

  const pathArgument = rest[0]!;
  const errColors = terminalColors(context.stderr, context.env);
  const git = findExecutable("git", context.env);
  if (!git) {
    // Without git the path can't be checked, so the name comes from the folder the path names.
    const absolute = resolve(context.cwd, pathArgument);
    const featureName = featureNameFor(basename(absolute.endsWith("-prd.md") ? dirname(absolute) : absolute));
    const problems = ["git isn't on the PATH."];
    if (!findExecutable("claude", context.env)) problems.unshift("claude isn't on the PATH.");
    if (!findExecutable("gh", context.env)) problems.push("gh isn't on the PATH.");
    context.stderr.write(`${formatStartFailure(featureName, "", { missingDocuments: [], problems }, errColors)}\n`);
    return EXIT_START_CHECKS_FAILED;
  }

  const resolution = await resolvePrdPath(pathArgument, context.cwd, git, context.env);
  if ("problem" in resolution) return usageError(context, `kiln: ${resolution.problem}`);
  const { location } = resolution;
  const tools = { git, gh: findExecutable("gh", context.env), claude: findExecutable("claude", context.env) };

  // The first step after resolving the PRD: its instance lock, which settles its port (AC-MULTI-04).
  const root = stateRoot(context.env);
  const stateDirectory = prdStateDirectory(root, location.mainCheckoutPath, location.repositoryName, location.prdDirectoryFromRoot);
  const lock = await takeInstanceLock(root, stateDirectory);
  if (!lock.taken) {
    if (lock.reason === "already_running") {
      context.stdout.write(`${location.featureName} is already running at ${viewAddress(lock.port, location.folderName)}\n`);
    } else if (lock.reason === "port_in_use") {
      context.stderr.write(`kiln: port ${lock.port}, kept for ${location.featureName}, is in use by another program. Free it and run kiln run again.\n`);
    } else {
      context.stderr.write(`kiln: every port from ${PORT_RANGE.first} to ${PORT_RANGE.last} is in use by a running kiln or another program.\n`);
    }
    return EXIT_START_CHECKS_FAILED;
  }

  try {
    let record: PrdRecord | undefined;
    try {
      record = readPrdRecord(stateDirectory);
    } catch (error) {
      if (!(error instanceof NewerSchemaError)) throw error;
      context.stderr.write(`kiln: ${error.message}\n`);
      return EXIT_START_CHECKS_FAILED;
    }
    if (record?.startedAt === undefined) return await notStarted(location, tools, context);
    return await underway(location, tools, record, stateDirectory, context);
  } finally {
    lock.release();
  }
}

/** A feature not started: the start checks, then what Kiln found (AC-START-02). */
async function notStarted(location: PrdLocation, tools: { git: string; gh: string | undefined; claude: string | undefined }, context: CommandContext): Promise<number> {
  const errColors = terminalColors(context.stderr, context.env);
  const report = await runStartChecks(location, tools, context.env);
  if (!startChecksPassed(report)) {
    context.stderr.write(`${formatStartFailure(location.featureName, location.prdDirectoryFromRoot, report, errColors)}\n`);
    return EXIT_START_CHECKS_FAILED;
  }
  const outColors = terminalColors(context.stdout, context.env);
  context.stdout.write(`${formatDocumentsFound(location.featureName, report.found, outColors)}\n`);
  // Start is pressed in the browser view, which comes with the local server (Phase 4 of Kiln v1).
  context.stdout.write(`${outColors.grey("  This build of Kiln has no browser view to press Start in yet. Nothing was started.")}\n`);
  return 0;
}

/** A feature underway: finish any setup, judge what the record says, and carry on (AC-CLI-01). */
async function underway(location: PrdLocation, tools: { git: string; gh: string | undefined; claude: string | undefined }, record: PrdRecord, stateDirectory: string, context: CommandContext): Promise<number> {
  const colors = terminalColors(context.stdout, context.env);
  const write = (line: string) => context.stdout.write(`${line}\n`);
  const engine = new Engine({
    paths: {
      mainCheckoutPath: location.mainCheckoutPath,
      repositoryName: location.repositoryName,
      folderName: location.folderName,
      prdDirectoryFromRoot: location.prdDirectoryFromRoot,
      featureName: location.featureName,
    },
    // A missing gh or claude fails its call, and so the check or session that needed it, as git's errors do.
    tools: { git: tools.git, gh: tools.gh ?? "gh", claude: tools.claude ?? "claude" },
    env: context.env,
    stateDirectory,
    record,
    onTerminal: (event) => write(formatTerminalEvent(event, engine.record, colors)),
  });

  if (record.completedAt === undefined) {
    const prepared = await engine.prepare();
    if (!prepared.ok) return notStarted(location, tools, context);
  }
  write(formatSummaryLine(engine, colors));
  const decision = await engine.decide();
  write(formatDecisionLine(decision, engine, colors));
  if (decision.kind === "interrupted") return EXIT_START_CHECKS_FAILED;
  await engine.continue();
  // Without the browser view nothing can press Start or Check again, so Kiln exits once it waits.
  if (!engine.record.completedAt) write(colors.grey("  This build of Kiln has no browser view yet, so it exits here; kiln run checks again and carries on."));
  return 0;
}

export function formatTerminalEvent(event: TerminalEvent, record: PrdRecord, colors: TerminalColors): string {
  const columns = planColumns(record.plan ?? []);
  switch (event.kind) {
    case "prd_started":
      return formatStartedLine(event.at, event.branch, event.baseBranch, colors);
    case "phase":
      return formatPhaseLine(event.at, event.phaseId, event.title, event.event === "done" ? { kind: "done", pushedSha: event.pushedSha ?? "" } : { kind: event.event }, columns, colors);
    case "pull_request":
      return formatPhaseLine(event.at, "PR", PR_TITLE, event.event === "opened" ? { kind: "opened", number: event.number ?? 0 } : { kind: event.event }, columns, colors);
    case "message":
      return `${colors.amber("✗")} ${event.text}`;
  }
}

function usageError(context: CommandContext, message?: string): number {
  context.stderr.write(`${message ? `${message}\n\n` : ""}${USAGE}\n`);
  return EXIT_USAGE;
}

