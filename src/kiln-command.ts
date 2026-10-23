// The `kiln` command line: `kiln run <path>` (PRD AC-START-01, AC-CLI-02) resolves the PRD,
// takes the PRD's instance lock and port, and moves the feature forward (AC-CLI-01; technical
// design, "Where a Feature Stands"). `kiln add-repository <name>` asks a running Kiln for a
// repository (multi-repo AC-ADD-01; add-repository-command.ts).

import { basename, dirname, resolve } from "node:path";
import { Engine, type StopReport, type TerminalEvent } from "./engine/engine.js";
import { originBranches } from "./engine/git-reads.js";
import { documentsFound, PR_TITLE } from "./engine/snapshot.js";
import { defaultBaseBranch, defaultSettings, prdTreeAtHead } from "./engine/worktree-setup.js";
import { findExecutable, WINDOWS_CTRL_C_GRACE_MS } from "./platform/helper-process.js";
import { KeepAwake } from "./platform/keep-awake.js";
import { openBrowser } from "./platform/open-browser.js";
import type { PhasePlan } from "./plan/phase-plan.js";
import { runAddRepository } from "./add-repository-command.js";
import type { FoundRepository } from "./engine/repositories.js";
import { featureNameFor, resolvePrdPath, type PrdLocation } from "./prd-location.js";
import { startLocalServer, type LocalServer } from "./server/local-server.js";
import { runStartChecks, startChecksPassed } from "./start-checks.js";
import { newPrdRecord } from "./state/new-record.js";
import { takeInstanceLock, viewAddress, PORT_RANGE } from "./state/instance-lock.js";
import { NewerSchemaError, readPrdRecord, writePrdRecord, type InterruptCause, type PrdRecord } from "./state/records.js";
import { prdStateDirectory, stateRoot } from "./state/state-files.js";
import { formatDocumentsFound, formatOpenedLine, formatPhaseLine, formatStartedLine, formatStartFailure, planColumns, terminalColors, USAGE, type TerminalColors } from "./terminal-output.js";
import { formatDecisionLine, formatSummaryLine } from "./underway-output.js";

export interface CommandContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: { write(text: string): unknown; isTTY?: boolean };
  stderr: { write(text: string): unknown; isTTY?: boolean };
  /** Where SIGINT, SIGHUP and SIGTERM arrive: the process itself, or a stand-in in tests. */
  signals?: { on(event: NodeJS.Signals, listener: () => void): unknown; off(event: NodeJS.Signals, listener: () => void): unknown };
  /**
   * Opens the browser view; resolves with why it couldn't, or undefined. The platform's opener
   * unless a test gives one; `KILN_NO_BROWSER=1` leaves the browser alone, for tests that run
   * the built command.
   */
  openBrowser?: (address: string) => Promise<string | undefined>;
  /** Called once the browser view is served, with its address; for tests. */
  onServing?: (address: string) => void;
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
  /** The local server, closed once the engine's stop is done and before the lock is released. */
  server: LocalServer | undefined;
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
    this.engine?.agents.close();
    const stopped = this.engine ? this.engine.stop(cause) : Promise.resolve(this.fallback);
    void stopped.then(async (report) => {
      // Step 5 of the stop: keep-awake was released by the engine; the server closes next.
      await this.server?.close();
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
  if (command === "add-repository") return runAddRepository(rest, context);
  if (command !== "run") return usageError(context, `kiln: unknown command "${command}". The commands are kiln run and kiln add-repository.`);
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

    if (!findExecutable("gh", context.env)) problems.push("gh isn't on the PATH.");
    context.stderr.write(`${formatStartFailure(featureName, "", { missingDocuments: [], problems }, errColors)}\n`);
    return EXIT_START_CHECKS_FAILED;
  }

  const resolution = await resolvePrdPath(pathArgument, context.cwd, git, context.env);
  if ("problem" in resolution) return usageError(context, `kiln: ${resolution.problem}`);
  const { location } = resolution;
  const tools = { git, gh: findExecutable("gh", context.env), claude: findExecutable("claude", context.env), codex: findExecutable("codex", context.env) };

  // The first step after resolving the PRD: its instance lock, which settles its port (AC-MULTI-04).
  const root = stateRoot(context.env);
  const stateDirectory = prdStateDirectory(root, location.mainCheckoutPath, location.repositoryName, location.prdDirectoryFromRoot);
  const range = portRange(context.env);
  const lock = await takeInstanceLock(root, stateDirectory, { range });
  if (!lock.taken) {
    if (lock.reason === "already_running") {
      context.stdout.write(`${location.featureName} is already running at ${viewAddress(lock.port, location.folderName)}\n`);
    } else if (lock.reason === "port_in_use") {
      context.stderr.write(`kiln: port ${lock.port}, kept for ${location.featureName}, is in use by another program. Free it and run kiln run again.\n`);
    } else {
      context.stderr.write(`kiln: every port from ${range.first} to ${range.last} is in use by a running kiln or another program.\n`);
    }
    return EXIT_START_CHECKS_FAILED;
  }

  const stop = new StopControl(context);
  const run: KilnRun = { location, tools, context, stop, stateDirectory, port: lock.port };
  try {
    let record: PrdRecord | undefined;
    try {
      record = readPrdRecord(stateDirectory);
    } catch (error) {
      if (!(error instanceof NewerSchemaError)) throw error;
      context.stderr.write(`kiln: ${error.message}\n`);
      return EXIT_START_CHECKS_FAILED;
    }
    const work = record?.startedAt === undefined ? notStarted(run, record) : underway(run, record);
    return await Promise.race([work, stop.done]);
  } finally {
    stop.engine?.close();
    await stop.server?.close();
    lock.release();
    stop.finish();
  }
}

interface KilnRun {
  location: PrdLocation;
  tools: { git: string; gh: string | undefined; claude: string | undefined; codex: string | undefined };
  context: CommandContext;
  stop: StopControl;
  stateDirectory: string;
  port: number;
}

/** An engine over the PRD's record, with keep-awake for the sessions it runs. */
function makeEngine(
  run: KilnRun,
  record: PrdRecord,
  write: (line: string) => void,
  start?: { prdTree: string | undefined; plan: PhasePlan | undefined; repositories: FoundRepository[] },
): Engine {
  const { location, tools, context } = run;
  const colors = terminalColors(context.stdout, context.env);
  const keepAwake = new KeepAwake({ featureName: location.featureName, env: context.env, onError: (message) => write(`${colors.amber("✗")} ${message}`) });
  const engine: Engine = new Engine({
    paths: {
      mainCheckoutPath: location.mainCheckoutPath,
      repositoryName: location.repositoryName,
      folderName: location.folderName,
      prdDirectoryFromRoot: location.prdDirectoryFromRoot,
      featureName: location.featureName,
    },
    // A missing gh or claude fails its call, and so the check or session that needed it, as git's errors do.
    tools: { git: tools.git, gh: tools.gh ?? "gh", claude: tools.claude ?? "claude", ...(tools.codex ? { codex: tools.codex } : {}) },
    env: context.env,
    stateDirectory: run.stateDirectory,
    record,
    ...(start?.prdTree === undefined ? {} : { prdTree: start.prdTree }),
    ...(start?.plan === undefined ? {} : { startPlan: start.plan }),
    ...(start === undefined ? {} : { namedRepositories: start.repositories }),
    ...kilnBinDirectory(),
    onTerminal: (event) => write(formatTerminalEvent(event, engine.record, colors)),
    keepAwake,
  });
  run.stop.engine = engine;
  return engine;
}

/** Nothing more is printed once a stop begins; its own line comes last. */
function terminalWriter(run: KilnRun): (line: string) => void {
  return (line) => {
    if (!run.stop.stopping) run.context.stdout.write(`${line}\n`);
  };
}

/** Serves the browser view, then opens it; resolves with why the browser couldn't be opened. */
async function serveAndOpen(run: KilnRun, engine: Engine, documents?: Parameters<typeof startLocalServer>[0]["documents"]): Promise<{ address: string; openError: string | undefined }> {
  const server = await startLocalServer({
    engine,
    ...(documents ? { documents } : {}),
    port: run.port,
    folderName: run.location.folderName,
    featureName: run.location.featureName,
    token: engine.record.token,
  });
  run.stop.server = server;
  run.context.onServing?.(server.address);
  const open = run.context.openBrowser ?? ((address: string) => (run.context.env.KILN_NO_BROWSER === "1" ? Promise.resolve(undefined) : openBrowser(address, run.context.env)));
  return { address: server.address, openError: await open(server.address) };
}

/**
 * A feature not started: the start checks (AC-START-02), then Documents found, served by an
 * engine over the PRD's record, written now if this is the PRD's first `kiln run`. Kiln then
 * waits in the foreground for Start, and works on from there (AC-KEEP-01).
 */
async function notStarted(run: KilnRun, record: PrdRecord | undefined, startError?: string): Promise<number> {
  const { location, tools, context, stop } = run;
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

  const git = { git: tools.git, env: context.env };
  const paths = { mainCheckoutPath: location.mainCheckoutPath, repositoryName: location.repositoryName, folderName: location.folderName, prdDirectoryFromRoot: location.prdDirectoryFromRoot };
  const prdTree = await prdTreeAtHead(git, location.checkoutRoot, location.prdDirectoryFromRoot);
  if (record === undefined) {
    // The PRD's first kiln run: its record, with the default settings (AC-START-07, UI-004).
    const origin = await originBranches(git, location.mainCheckoutPath);
    record = newPrdRecord({
      mainCheckoutPath: location.mainCheckoutPath,
      repositoryName: location.repositoryName,
      github: report.github!,
      prdDirectoryFromRoot: location.prdDirectoryFromRoot,
      featureName: location.featureName,
      settings: defaultSettings(paths, origin.ok ? origin.value : undefined),
    });
  } else {
    record.repository.github = report.github!;
  }
  // Each named repository starts from v1's rule: develop on its origin, else origin's default branch (AC-SPACE-01).
  const unset = report.repositories.filter((repository) => record!.settings.bases[repository.name] === undefined);
  const origins = await Promise.all(unset.map((repository) => originBranches(git, repository.mainCheckoutPath)));
  unset.forEach((repository, index) => {
    const origin = origins[index]!;
    if (origin.ok) record!.settings.bases[repository.name] = defaultBaseBranch(origin.value);
  });
  if (stop.stopping) return stop.done;
  writePrdRecord(run.stateDirectory, record);

  const write = terminalWriter(run);
  const engine = makeEngine(run, record, write, { prdTree, plan: report.plan, repositories: report.repositories });
  if (startError !== undefined) engine.startError = startError;
  const documents = documentsFound(location.prdDirectory, location.folderName, report.plan!, { ...report.found, repositories: report.repositories }, location.repositoryName);
  const outColors = terminalColors(context.stdout, context.env);
  write(formatDocumentsFound(location.featureName, report.found, outColors, engine.plannedRepositories.length));
  const { address, openError } = await serveAndOpen(run, engine, documents);
  write(formatOpenedLine(address, openError, outColors));
  // Kiln lives in its terminal until Ctrl+C or a closed terminal (AC-KEEP-01); Start comes from the view.
  return stop.done;
}

/** A feature underway: finish any setup, judge what the record says, serve the view, and carry on (AC-CLI-01). */
async function underway(run: KilnRun, record: PrdRecord): Promise<number> {
  const { context, stop } = run;
  const colors = terminalColors(context.stdout, context.env);
  const write = terminalWriter(run);
  const engine = makeEngine(run, record, write);
  if (record.completedAt === undefined) {
    const prepared = await engine.prepare();
    if (stop.stopping) return await stop.done;
    if (!prepared.ok) {
      // Setup failed and was undone, so the feature isn't underway: Documents found, showing git's error.
      engine.close();
      return notStarted(run, engine.record, engine.startError);
    }
  }
  write(formatSummaryLine(engine, colors));
  const decision = await engine.decide();
  if (stop.stopping) return await stop.done;
  const { address, openError } = await serveAndOpen(run, engine);
  write(formatDecisionLine(decision, engine, colors, openError === undefined ? address : undefined));
  if (openError !== undefined) write(formatOpenedLine(address, openError, colors, true));
  // Only once the view is served and opened does a session spawn or resume.
  await engine.continue();
  // Kiln stays in the foreground, through Needs you, a pause and Complete, until Ctrl+C (AC-KEEP-01).
  return stop.done;
}

export function formatTerminalEvent(event: TerminalEvent, record: PrdRecord, colors: TerminalColors): string {
  const columns = planColumns(record.plan ?? []);
  switch (event.kind) {
    case "prd_started":
      return formatStartedLine(event.at, event.branch, event.baseBranch, colors, event.repositoryCount);
    case "phase":
      return formatPhaseLine(
        event.at,
        event.phaseId,
        event.title,
        event.event === "done"
          ? { kind: "done", pushedSha: event.pushedSha ?? "", ...(event.pushes ? { pushes: event.pushes } : {}) }
          : event.event === "waiting"
            ? { kind: "waiting", label: event.limit?.label ?? "A usage limit", ...(event.limit?.resetsAt === undefined ? {} : { resetsAt: event.limit.resetsAt }) }
            : { kind: event.event },
        columns,
        colors,
      );
    case "repository_added":
      return formatPhaseLine(event.at, event.phaseId, event.title, { kind: "added", name: event.name }, columns, colors);
    case "pull_request":
      return formatPhaseLine(
        event.at,
        "PR",
        PR_TITLE,
        event.event === "opened"
          ? { kind: "opened", number: event.number ?? 0, ...(event.opened ? { opened: event.opened } : {}) }
          : event.event === "waiting"
            ? { kind: "waiting", label: event.limit?.label ?? "A usage limit", ...(event.limit?.resetsAt === undefined ? {} : { resetsAt: event.limit.resetsAt }) }
            : { kind: event.event },
        columns,
        colors,
      );
    case "message":
      return `${colors.amber("✗")} ${event.text}`;
  }
}

/**
 * The ports Kiln assigns from: 4700 to 4799. `KILN_PORT_RANGE=<first>-<last>` narrows it, for
 * tests that run several sandboxes at once, each with its own port registry.
 */
function portRange(env: NodeJS.ProcessEnv): { first: number; last: number } {
  const match = /^(\d+)-(\d+)$/.exec(env.KILN_PORT_RANGE ?? "");
  return match ? { first: Number(match[1]), last: Number(match[2]) } : PORT_RANGE;
}

/**
 * On macOS and Linux, the directory of the `kiln` the person ran, put first on each session's
 * PATH so `kiln add-repository` reaches this Kiln: npm links `kiln` to `dist/cli.js`, and Node
 * keeps the link's path in `process.argv[1]`. On Windows npm's shim hides it, so PATH is left
 * as it is (multi-repo technical design, "The command").
 */
function kilnBinDirectory(): { kilnBinDirectory?: string } {
  const script = process.argv[1];
  if (process.platform === "win32" || script === undefined || basename(script) !== "kiln") return {};
  return { kilnBinDirectory: dirname(script) };
}

function usageError(context: CommandContext, message?: string): number {
  context.stderr.write(`${message ? `${message}\n\n` : ""}${USAGE}\n`);
  return EXIT_USAGE;
}

