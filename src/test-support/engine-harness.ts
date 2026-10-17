// A feature ready to run through the engine in a test: a real repository whose `origin` is a
// local bare repository, the fixture PRD pushed to `develop`, the stand-in `claude` and `gh`,
// and a fresh record, as Documents found would leave it just before Start.

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engine, type EngineOptions, type TerminalEvent } from "../engine/engine.js";
import { originBranches } from "../engine/git-reads.js";
import { defaultSettings, prdTreeAtHead } from "../engine/worktree-setup.js";
import { findExecutable } from "../platform/helper-process.js";
import { featureNameFor } from "../prd-location.js";
import { newPrdRecord } from "../state/new-record.js";
import { readPrdRecord } from "../state/records.js";
import { readJsonLines, prdStateDirectory, stateRoot } from "../state/state-files.js";
import { FOLDER, prdDirectoryFiles } from "./fixture-documents.js";
import { commitFiles, createBareOrigin, createRepository, createSandbox, git, installStandIns, type Sandbox } from "./git-repositories.js";

export interface ScenarioSession {
  actions: Record<string, unknown>[];
}

export interface Harness {
  sandbox: Sandbox;
  repository: string;
  origin: string;
  engine: Engine;
  events: TerminalEvent[];
  env: NodeJS.ProcessEnv;
  scenarioPath: string;
  ghStatePath: string;
  stateDirectory: string;
  tools: { git: string; gh: string; claude: string };
  /** Every launch of the stand-in `claude`: its arguments, working directory and prompt. */
  claudeCalls(): { args: string[]; cwd: string; prompt: string }[];
  ghCalls(): string[][];
  setPulls(pulls: unknown[] | { fail: string }): void;
  /** A new engine over the same record and state, as the next `kiln run` makes. */
  reopen(): Engine;
  /**
   * A new engine over the record as it is on disk, as the next `kiln run` after a stop reads it:
   * a stopped engine's in-memory record may hold what it was told not to write.
   */
  reopenFromDisk(): Engine;
  /** A new feature's engine for another PRD folder in the same repository, sharing the scenario. */
  engineFor(folder: string): Promise<Engine>;
  /** The git calls Kiln itself made, when `logGit` is on: one argument list per call. */
  kilnGitCalls(): string[];
  cleanup(): void;
}

export interface HarnessOptions {
  sessions: ScenarioSession[];
  folder?: string;
  files?: Record<string, string>;
  /** Overrides the stand-in claude path, such as a missing executable. */
  claude?: string;
  /** More PRD folders committed beside the first, with the same fixture documents. */
  extraFolders?: string[];
  /** The repository's only branch, `develop` unless given; origin's default branch too. */
  branch?: string;
  /** Engine options every engine this harness makes gets, such as a sleep reader or keep-awake. */
  engineOptions?: Partial<EngineOptions>;
  /**
   * Gives Kiln a git that logs each call's arguments to `<sandbox>/kiln-git.log` before running
   * the real one. macOS and Linux only: cmd.exe would expand the `%` in Kiln's format strings.
   */
  logGit?: boolean;
}

export async function createHarness(options: HarnessOptions): Promise<Harness> {
  const sandbox = createSandbox();
  const origin = createBareOrigin(sandbox, "acme-shop");
  const repository = createRepository(sandbox, "acme-shop", origin);
  const folder = options.folder ?? FOLDER;
  commitFiles(sandbox, repository, `docs/prds/${folder}`, options.files ?? prdDirectoryFiles());
  for (const extra of options.extraFolders ?? []) {
    const files = Object.fromEntries(Object.entries(prdDirectoryFiles()).map(([name, text]) => [name === `${FOLDER}-prd.md` ? `${extra}-prd.md` : name, text]));
    commitFiles(sandbox, repository, `docs/prds/${extra}`, files);
  }
  const branch = options.branch ?? "develop";
  if (branch !== "develop") {
    git(sandbox, repository, "branch", "-q", "-m", "develop", branch);
    git(sandbox, origin, "symbolic-ref", "HEAD", `refs/heads/${branch}`);
  }
  git(sandbox, repository, "push", "-q", "origin", branch);

  const standIns = installStandIns(join(sandbox.root, "bin"));
  const scenarioPath = join(sandbox.root, "scenario.json");
  const ghStatePath = join(sandbox.root, "gh-state.json");
  writeFileSync(scenarioPath, JSON.stringify({ sessions: options.sessions }));
  writeFileSync(ghStatePath, JSON.stringify({ pulls: [] }));
  const env = { ...sandbox.env, KILN_STANDIN_SCENARIO: scenarioPath, KILN_STANDIN_GH_STATE: ghStatePath };
  const realGit = findExecutable("git", env)!;
  const gitLog = join(sandbox.root, "kiln-git.log");
  let kilnGit = realGit;
  if (options.logGit) {
    kilnGit = join(sandbox.root, "kiln-git");
    writeFileSync(kilnGit, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${gitLog}'\nexec '${realGit}' "$@"\n`);
    chmodSync(kilnGit, 0o755);
  }
  const tools = { git: kilnGit, gh: standIns.gh, claude: options.claude ?? standIns.claude };
  const gitContext = { git: realGit, env };
  const events: TerminalEvent[] = [];

  const newFeature = async (name: string) => {
    const paths = { mainCheckoutPath: repository, repositoryName: "acme-shop", folderName: name, prdDirectoryFromRoot: `docs/prds/${name}`, featureName: featureNameFor(name) };
    const branches = await originBranches(gitContext, repository);
    const record = newPrdRecord({
      mainCheckoutPath: repository,
      repositoryName: "acme-shop",
      github: "acme/acme-shop",
      prdDirectoryFromRoot: paths.prdDirectoryFromRoot,
      featureName: paths.featureName,
      settings: defaultSettings(paths, branches.ok ? branches.value : undefined),
    });
    const stateDirectory = prdStateDirectory(stateRoot(env), repository, "acme-shop", paths.prdDirectoryFromRoot);
    const prdTree = await prdTreeAtHead(gitContext, repository, paths.prdDirectoryFromRoot);
    return { paths, record, stateDirectory, prdTree };
  };
  const feature = await newFeature(folder);
  const engineOver = (f: Awaited<ReturnType<typeof newFeature>>, record = f.record) =>
    new Engine({
      paths: f.paths,
      tools,
      env,
      stateDirectory: f.stateDirectory,
      record,
      ...(f.prdTree ? { prdTree: f.prdTree } : {}),
      onTerminal: (event) => events.push(event),
      originRetryMs: 0,
      // No real sleep readings in tests unless one asks: a test machine that sleeps mid-run mustn't change a verdict.
      sleepReader: { next: () => Promise.resolve([]) },
      ...options.engineOptions,
    });
  const make = () => engineOver(feature, harness.engine?.record ?? feature.record);
  const stateDirectory = feature.stateDirectory;

  const harness: Harness = {
    sandbox,
    repository,
    origin,
    engine: undefined as unknown as Engine,
    events,
    env,
    scenarioPath,
    ghStatePath,
    stateDirectory,
    tools,
    claudeCalls: () => readJsonLines(`${scenarioPath}.calls.jsonl`),
    ghCalls: () => readJsonLines(`${ghStatePath}.calls.jsonl`),
    setPulls: (pulls) => writeFileSync(ghStatePath, JSON.stringify(Array.isArray(pulls) ? { pulls } : pulls)),
    reopen: () => (harness.engine = make()),
    reopenFromDisk: () => (harness.engine = engineOver(feature, readPrdRecord(feature.stateDirectory)!)),
    engineFor: async (name) => engineOver(await newFeature(name)),
    kilnGitCalls: () => (existsSync(gitLog) ? readFileSync(gitLog, "utf8").split("\n").filter((line) => line !== "") : []),
    cleanup: () => sandbox.cleanup(),
  };
  harness.engine = make();
  return harness;
}

/** A phase session that does the work and lands it: build, close, commit, push, and a final message. */
export function landingSession(file = "src/change.txt", content = "work\n"): ScenarioSession {
  return {
    actions: [
      { skill: "enso-method:implement-from-requirements" },
      { write: { path: file, content } },
      { skill: "enso-method:deliverable-review" },
      { close: true },
      { commit: "feat: the phase" },
      { skill: "enso-method:refactor-pass" },
      { push: true },
      { result: "Phase landed." },
      { exit: 0 },
    ],
  };
}

/** The pull-request session that opens a pull request ready for review. */
export function pullRequestSession(number = 218, isDraft = false): ScenarioSession {
  return { actions: [{ openPullRequest: { number, isDraft } }, { result: `Opened #${number}.` }, { exit: 0 }] };
}

/** Resolves once `condition` holds, polling every 25 ms; fails after `ms`. */
export async function waitFor(condition: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function readWorktreeFile(harness: Harness, path: string): string | undefined {
  const full = join(harness.engine.worktreePath, path);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
}
