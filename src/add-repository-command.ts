// `kiln add-repository <name>`: a session (or a person) in a PRD's workspace asks the Kiln
// running for that PRD to add a repository (multi-repo PRD AC-ADD-01, CLI-001; technical design,
// "The command"). It is a client of the running Kiln's HTTP API, like the browser view.

import { readdirSync, realpathSync } from "node:fs";
import { request } from "node:http";
import { join, resolve } from "node:path";
import { comparable, expandHome, isWithin, realPathOfNearestAncestor } from "./engine/worktree-setup.js";
import { TOKEN_HEADER } from "./server/local-server.js";
import { liveInstance } from "./state/instance-lock.js";
import { readPrdRecord, type PrdRecord } from "./state/records.js";
import { stateRoot } from "./state/state-files.js";

interface CommandStreams {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}

const USAGE = "Usage: kiln add-repository <folder name>";

/**
 * Runs `kiln add-repository` and returns its exit code: 0 when the repository is in the
 * workspace, 1 when Kiln refused or couldn't be reached, 2 for a usage error.
 *
 *   await runAddRepository(["notifications"], context)
 *   // prints "Added notifications at /home/a/acme/.worktrees/customer-returns/notifications, on feature/customer-returns from main. …"
 */
export async function runAddRepository(args: string[], context: CommandStreams): Promise<number> {
  if (args.length !== 1 || args[0]!.startsWith("-")) {
    context.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const name = args[0]!;
  const fail = (message: string) => {
    context.stderr.write(`kiln: ${message}\n`);
    return 1;
  };

  const directory = realpathSync.native(resolve(context.cwd));
  const found = findPrd(stateRoot(context.env), directory);
  if (found.kind === "none") return fail(`${directory} isn't in a Kiln workspace.`);
  if (found.kind === "several") {
    return fail(`${directory} is in the workspace of more than one PRD (${found.featureNames.join(", ")}); run it from inside a repository's worktree.`);
  }
  const { record, stateDirectory } = found;
  const instance = await liveInstance(stateDirectory);
  if (!instance) return fail(`kiln run isn't running for ${record.featureName}, so nothing was added.`);

  let answer: { status: number; body: Record<string, unknown> };
  try {
    answer = await post(instance.port, record.token, { name });
  } catch (error) {
    return fail(`Couldn't reach Kiln at 127.0.0.1:${instance.port}: ${(error as Error).message}`);
  }
  const { body } = answer;
  if (answer.status !== 200) return fail(typeof body.reason === "string" ? body.reason : `Kiln answered ${answer.status}.`);
  if (body.added === false) {
    context.stdout.write(`${name} is already in the workspace at ${String(body.worktreePath)}.\n`);
    return 0;
  }
  context.stdout.write(
    `Added ${name} at ${String(body.worktreePath)}, on ${String(body.branch)} from ${String(body.baseBranch)}. Read its CLAUDE.md and AGENTS.md, if it has them, before you change it.\n`,
  );
  return 0;
}

type PrdLookup = { kind: "found"; record: PrdRecord; stateDirectory: string } | { kind: "none" } | { kind: "several"; featureNames: string[] };

/**
 * The PRD whose recorded worktree contains the directory, else the one whose workspace folder
 * does, found among Kiln's state directories (`<root>/<repository>-<hash>/<PRD key>/prd.json`).
 */
export function findPrd(root: string, directory: string): PrdLookup {
  const inWorktree: { record: PrdRecord; stateDirectory: string }[] = [];
  const inWorkspace: { record: PrdRecord; stateDirectory: string }[] = [];
  for (const stateDirectory of prdStateDirectories(root)) {
    let record: PrdRecord | undefined;
    try {
      record = readPrdRecord(stateDirectory);
    } catch {
      continue;
    }
    if (!record) continue;
    const worktrees = record.repositories.length > 0 ? record.repositories.map((entry) => entry.worktreePath) : [record.settings.worktreePath];
    if (worktrees.some((path) => contains(path, directory))) inWorktree.push({ record, stateDirectory });
    else if (contains(record.settings.workspaceFolder, directory)) inWorkspace.push({ record, stateDirectory });
  }
  for (const level of [inWorktree, inWorkspace]) {
    if (level.length === 1) return { kind: "found", ...level[0]! };
    if (level.length > 1) return { kind: "several", featureNames: level.map((candidate) => candidate.record.featureName) };
  }
  return { kind: "none" };
}

function prdStateDirectories(root: string): string[] {
  const directories: string[] = [];
  const list = (path: string) => {
    try {
      return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name));
    } catch {
      return [];
    }
  };
  for (const repository of list(root)) directories.push(...list(repository));
  return directories;
}

function contains(folder: string, directory: string): boolean {
  if (folder === "") return false;
  return isWithin(comparable(directory), comparable(realPathOfNearestAncestor(resolve(expandHome(folder)))));
}

/**
 * `POST /api/repositories` with the PRD's token, Host and Origin as Kiln's checks require. It
 * waits with no response timeout at all: setup can take Kiln's 30-minute setup timeout, and
 * Node's `fetch` gives up waiting for headers after 5 minutes.
 */
function post(port: number, token: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = JSON.stringify(body);
  return new Promise((resolvePost, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/api/repositories",
        headers: {
          Host: `127.0.0.1:${port}`,
          Origin: `http://127.0.0.1:${port}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(text),
          [TOKEN_HEADER]: token,
        },
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (data += chunk));
        response.on("end", () => {
          try {
            resolvePost({ status: response.statusCode ?? 0, body: JSON.parse(data) as Record<string, unknown> });
          } catch {
            resolvePost({ status: response.statusCode ?? 0, body: { reason: data.trim() } });
          }
        });
        response.on("error", reject);
      },
    );
    req.setTimeout(0);
    req.on("error", reject);
    req.end(text);
  });
}
