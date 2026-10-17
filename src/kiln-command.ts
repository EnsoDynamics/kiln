// The `kiln` command line: `kiln run <path>` is the only command (PRD AC-START-01, AC-CLI-02).
// It resolves the PRD, takes the PRD's instance lock and port, and moves the feature forward
// (AC-CLI-01; technical design, "Where a Feature Stands").

import { basename, dirname, resolve } from "node:path";
import { Engine, type StopReport, type TerminalEvent } from "./engine/engine.js";
import { findExecutable, WINDOWS_CTRL_C_GRACE_MS } from "./platform/helper-process.js";
import { KeepAwake } from "./platform/keep-awake.js";
import { featureNameFor, resolvePrdPath, type PrdLocation } from "./prd-location.js";
import { runStartChecks, startChecksPassed } from "./start-checks.js";
import { takeInstanceLock, viewAddress, PORT_RANGE } from "./state/instance-lock.js";
import { NewerSchemaError, readPrdRecord, type InterruptCause, type PrdRecord } from "./state/records.js";
import { prdStateDirectory, stateRoot } from "./state/state-files.js";
import { formatDocumentsFound, formatPhaseLine, formatStartedLine, formatStartFailure, planColumns, terminalColors, USAGE, type TerminalColors } from "./terminal-output.js";
import { formatDecisionLine, formatSummaryLine } from "./underway-output.js";
import { PR_TITLE } from "./engine/snapshot.js";

export interface CommandContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: { write(text: string): unknown; isTTY?: boolean };
  stderr: { write(text: string): unknown; isTTY?: boolean };
  /** Where SIGINT, SIGHUP and SIGTERM arrive: the process itself, or a stand-in in tests. */
  signals?: { on(event: NodeJS.Signals, listener: () => void): unknown; off(event: NodeJS.Signals, listener: () => void): unknown };
}

/** Exit code for a command line Kiln can't act on: no path, an unknown command, a path that isn't one PRD. */
export const EXIT_USAGE = 2;
/** Exit code when a start check fails, the PRD is already running, or Kiln can't go on. */
export const EXIT_START_CHECKS_FAILED = 1;

/** Exit codes after a stop, 128 plus the signal's number, as a shell reports them. */
export const EXIT_SIGNALLED: Record<InterruptCause & ("sigint" | "sighup" | "sigterm"), number> = { sigint: 130, sighup: 129, sigterm: 143 };

const STOP_SIGNALS = ["SIGINT", "SIGHUP", "SIGTERM"] as const;

/**
 * Ctrl+C, a closed terminal and SIGTERM, handled the same way (AC-KEEP-02; technical design,
 * "Stopping a session"): the engine runs the stop sequence, and once it is done the command
 * returns, releasing the instance lock, then prints one line. A second Ctrl+C skips the rest of
 * the stop's wait. A closed terminal has nowhere to print.
 */
class StopControl {
  engine: Engine | undefined;
  /** What a stop prints when no engine is running yet. */
  fallback: StopReport = { text: "Kiln stopped.", grey: "Nothing was started." };
  cause: (typeof STOP_SIGNALS)[number] | undefined;
  private report: StopReport | undefined;
  private resolveDone!: (code: number) => void;
  /** Resolves with the exit code once a stop has finished. */
  readonly done = new Promise<number>((resolve) => (this.resolveDone = resolve));
  private readonly listeners = new Map<NodeJS.Signals, () => void>();

  constructor(private readonly context: CommandContext) {
    for (const signal of STOP_SIGNALS) {
      const listener = () => this.onSignal(signal);
      this.listeners.set(signal, listener);
      context.signals?.on(signal, listener);
    }
  }

  get stopping(): boolean {
    return this.cause !== undefined;
  }

  private onSignal(signal: (typeof STOP_SIGNALS)[number]): void {
    const cause = signal.toLowerCase() as "sigint" | "sighup" | "sigterm";
    if (this.cause !== undefined) {
      // A second Ctrl+C skips the rest of the wait.
      void this.engine?.stop(cause);
      return;
    }
    this.cause = signal;
    const stopped = this.engine ? this.engine.stop(cause) : Promise.resolve(this.fallback);
    void stopped.then((report) => {
      this.report = report;
      this.resolveDone(EXIT_SIGNALLED[cause]);
    });
  }

  /** Removes the handlers, then prints the stop's line, after the instance lock is released. */
  finish(): void {
    for (const [signal, listener] of this.listeners) this.context.signals?.off(signal, listener);
    if (!this.report || this.cause === "SIGHUP") return;
    const colors = terminalColors(this.context.stdout, this.context.env);
    this.context.stdout.write(`${this.report.text}${this.report.grey ? ` ${colors.grey(this.report.grey)}` : ""}\n`);
  }
}

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

  const stop = new StopControl(context);
  try {
    let record: PrdRecord | undefined;
    try {
      record = readPrdRecord(stateDirectory);
    } catch (error) {
      if (!(error instanceof NewerSchemaError)) throw error;
      context.stderr.write(`kiln: ${error.message}\n`);
      return EXIT_START_CHECKS_FAILED;
    }
    const work = record?.startedAt === undefined ? notStarted(location, tools, context, stop) : underway(location, tools, record, stateDirectory, context, stop);
    return await Promise.race([work, stop.done]);
  } finally {
    lock.release();
    stop.finish();
  }
}

/** A feature not started: the start checks, then what Kiln found (AC-START-02). */
async function notStarted(location: PrdLocation, tools: { git: string; gh: string | undefined; claude: string | undefined }, context: CommandContext, stop: StopControl): Promise<number> {
  const errColors = terminalColors(context.stderr, context.env);
  const report = await runStartChecks(location, tools, context.env);
  // On Windows a Ctrl+C ends the checks' git and gh calls too, possibly before Kiln's handler
  // runs; a moment's wait lets the stop be seen before a failure is reported.
  if (!startChecksPassed(report) && process.platform === "win32") await new Promise((resolve) => setTimeout(resolve, WINDOWS_CTRL_C_GRACE_MS));
  if (stop.stopping) return stop.done;
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
async function underway(
  location: PrdLocation,
  tools: { git: string; gh: string | undefined; claude: string | undefined },
  record: PrdRecord,
  stateDirectory: string,
  context: CommandContext,
  stop: StopControl,
): Promise<number> {
  const colors = terminalColors(context.stdout, context.env);
  // Nothing more is printed once a stop begins; its own line comes last.
  const write = (line: string) => {
    if (!stop.stopping) context.stdout.write(`${line}\n`);
  };
  const keepAwake = new KeepAwake({ featureName: location.featureName, env: context.env, onError: (message) => write(`${colors.amber("✗")} ${message}`) });
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
    keepAwake,
  });
  stop.engine = engine;
  try {
    if (record.completedAt === undefined) {
      const prepared = await engine.prepare();
      if (stop.stopping) return await stop.done;
      if (!prepared.ok) return notStarted(location, tools, context, stop);
    }
    write(formatSummaryLine(engine, colors));
    const decision = await engine.decide();
    if (stop.stopping) return await stop.done;
    write(formatDecisionLine(decision, engine, colors));
    await engine.continue();
    if (stop.stopping) return await stop.done;
    // Without the browser view nothing can press Start or Check again, so Kiln exits once it waits.
    if (!engine.record.completedAt) write(colors.grey("  This build of Kiln has no browser view yet, so it exits here; kiln run checks again and carries on."));
    return 0;
  } finally {
    if (!stop.stopping) engine.close();
  }
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

