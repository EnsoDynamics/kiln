// The `kiln` command line: `kiln run <path>` is the only command (PRD AC-START-01, AC-CLI-02).

import { basename, dirname, resolve } from "node:path";
import { findExecutable } from "./platform/helper-process.js";
import { featureNameFor, resolvePrdPath } from "./prd-location.js";
import { runStartChecks, startChecksPassed } from "./start-checks.js";
import { formatDocumentsFound, formatStartFailure, terminalColors, USAGE } from "./terminal-output.js";

export interface CommandContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: { write(text: string): unknown; isTTY?: boolean };
  stderr: { write(text: string): unknown; isTTY?: boolean };
}

/** Exit code for a command line Kiln can't act on: no path, an unknown command, a path that isn't one PRD. */
export const EXIT_USAGE = 2;
/** Exit code when a start check fails. */
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
  const report = await runStartChecks(location, tools, context.env);
  if (!startChecksPassed(report)) {
    context.stderr.write(`${formatStartFailure(location.featureName, location.prdDirectoryFromRoot, report, errColors)}\n`);
    return EXIT_START_CHECKS_FAILED;
  }

  const outColors = terminalColors(context.stdout, context.env);
  context.stdout.write(`${formatDocumentsFound(location.featureName, report.found, outColors)}\n`);
  context.stdout.write(`${outColors.grey("  This build of Kiln checks the documents only; it can't start phases yet. Nothing was started.")}\n`);
  return 0;
}

function usageError(context: CommandContext, message?: string): number {
  context.stderr.write(`${message ? `${message}\n\n` : ""}${USAGE}\n`);
  return EXIT_USAGE;
}
