// `kiln run` on a PRD whose phase documents name other repositories beside the PRD's own
// (multi-repo PRD): the start checks for each named repository, one workspace with a worktree
// of each on one feature branch, sessions working across it and adding a repository they find
// they need through `kiln add-repository`, the done check in every repository, and one pull
// request in each repository that changed. Real git throughout, every origin reached as
// github.com through an SSH stand-in, and the stand-in claude and gh.

import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auditWorkflow from "./audit/workflow.js";
// These pre-existing transport/repository tests isolate the already-current audit gate.
// Audit workflow integration and installed-provider proofs exercise real gates separately.
beforeEach(() => { vi.spyOn(auditWorkflow, "auditNext").mockResolvedValue("final_delivery"); });
afterEach(() => { vi.restoreAllMocks(); });
import type { Snapshot } from "./engine/snapshot.js";
import { displayPath } from "./engine/worktree-setup.js";
import { runKilnCommand } from "./kiln-command.js";
import { readPrdRecord, type PrdRecord } from "./state/records.js";
import { prdStateDirectory, readJsonLines, stateRoot } from "./state/state-files.js";
import { waitFor, type ScenarioSession } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, installKiln, installStandIns, type Sandbox } from "./test-support/git-repositories.js";
import { reservePortRange } from "./test-support/os-ports.js";

/** The PRD's port, reserved from the operating system for each test. */
let PORTS = "";
beforeEach(async () => { PORTS = await reservePortRange(); });
const BRANCH = "feature/customer-returns";

interface Feature {
  sandbox: Sandbox;
  product: string;
  env: NodeJS.ProcessEnv;
  scenarioPath: string;
  ghStatePath: string;
  /** Each code repository's own checkout and its bare origin, by name. */
  code: Record<string, { checkout: string; bare: string }>;
}

let feature: Feature | undefined;
afterEach(() => feature?.sandbox.cleanup());

/** The fixture PRD's phase documents with `**Repositories:**` lines: phase 2's split record names returns-api, 2b names two. */
function phaseFiles(lines: Record<string, string>): Record<string, string> {
  const files = prdDirectoryFiles();
  for (const [file, line] of Object.entries(lines)) {
    const [title, ...rest] = files[file]!.split("\n");
    files[file] = [title, "", line, ...rest].join("\n");
  }
  return files;
}

const DEFAULT_LINES = {
  "phase-1-return-intake.md": "**Repositories:** returns-api",
  "phase-2-refunds.md": "**Repositories:** returns-api",
  "phase-2b-store-credit.md": "**Repositories:** returns-api, storefront",
  "phase-3-returns-dashboard.md": "**Repositories:** storefront",
};

/**
 * `~/…/product` holding the PRD, beside it `returns-api` and `storefront` on develop and
 * `notifications` on main only, each with a GitHub origin; the stand-ins, and `kiln` itself on PATH.
 */
function createWorkspaceFeature(sessions: ScenarioSession[], lines: Record<string, string> = DEFAULT_LINES): Feature {
  const sandbox = createSandbox();
  const productOrigin = createGithubOrigin(sandbox, "acme", "product");
  const product = createRepository(sandbox, "product", productOrigin.url);
  commitFiles(sandbox, product, `docs/prds/${FOLDER}`, phaseFiles(lines));
  git(sandbox, product, "push", "-q", "origin", "develop");
  const code: Feature["code"] = {};
  for (const name of ["returns-api", "storefront", "notifications"]) {
    const origin = createGithubOrigin(sandbox, "acme", name);
    const checkout = createRepository(sandbox, name, origin.url);
    if (name === "notifications") {
      git(sandbox, checkout, "branch", "-q", "-m", "develop", "main");
      git(sandbox, origin.bare, "symbolic-ref", "HEAD", "refs/heads/main");
      git(sandbox, checkout, "push", "-q", "origin", "main");
    } else git(sandbox, checkout, "push", "-q", "origin", "develop");
    code[name] = { checkout, bare: origin.bare };
  }
  const bin = join(sandbox.root, "bin");
  installStandIns(bin);
  installKiln(bin);
  const scenarioPath = join(sandbox.root, "scenario.json");
  const ghStatePath = join(sandbox.root, "gh-state.json");
  writeFileSync(scenarioPath, JSON.stringify({ sessions }));
  writeFileSync(ghStatePath, JSON.stringify({ pulls: [] }));
  const base = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  const env = {
    ...base,
    PATH: [bin, sandbox.env.PATH ?? sandbox.env.Path ?? ""].join(delimiter),
    KILN_STANDIN_SCENARIO: scenarioPath,
    KILN_STANDIN_GH_STATE: ghStatePath,
    KILN_PORT_RANGE: PORTS,
    KILN_NO_BROWSER: "1",
  };
  feature = { sandbox, product, env, scenarioPath, ghStatePath, code };
  return feature;
}

function startKiln(f: Feature, resumeImmediately = false) {
  let stdout = "";
  const signals = new EventEmitter();
  let resolveAddress!: (address: string) => void;
  const address = new Promise<string>((resolve) => (resolveAddress = resolve));
  const done = runKilnCommand(["run", `docs/prds/${FOLDER}/`, ...(resumeImmediately ? ["--resume"] : [])], {
    cwd: f.product,
    env: f.env,
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stdout += text) },
    signals,
    openBrowser: async () => ({ kind: "opened" as const }),
    onServing: resolveAddress,
  });
  const lines = () => stdout.split("\n").filter((line) => line !== "" && !line.startsWith("✗ Can’t keep this computer awake"));
  return { done, lines, signals, address };
}

async function api(address: string, token: string, method: string, path: string, body?: unknown) {
  // A real chooser waits for its current metadata before enabling Start or model edits.
  if (method === "POST" && (path === "/api/start" || path === "/api/settings" && body && typeof body === "object" && ("model" in body || "effort" in body))) {
    await waitFor(async () => {
      const current = (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;
      return current.settings.metadataPending === false;
    });
  }
  const origin = new URL(address).origin;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { "X-Kiln-Token": token, Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function tokenOf(address: string): Promise<string> {
  const html = await (await fetch(address)).text();
  return /<meta name="kiln-token" content="([0-9a-f]+)">/.exec(html)![1]!;
}

function recordOf(f: Feature): PrdRecord {
  return readPrdRecord(prdStateDirectory(stateRoot(f.env), f.product, "product", `docs/prds/${FOLDER}`))!;
}

const snapshotOf = async (address: string, token: string) => (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;

/** A phase's work in one repository: a file, committed and pushed on the feature branch. */
const work = (repository: string, file: string) => [
  { write: { repository, path: file, content: `${file}\n` } },
  { commit: `feat: ${file}`, repository },
  { push: true, repository },
];
/** The phase's Closed line, committed and pushed in the PRD's repository. */
const closeIn = (repository: string) => [{ close: true }, { commit: "docs: close the phase", repository }, { push: true, repository }];

describe("kiln run on a PRD across repositories", () => {
  it("sets up one workspace, works across it, adds a repository a session needs, and opens one pull request per repository that changed", async () => {
    const f = createWorkspaceFeature([
      { actions: [{ skill: "enso-method:implement-from-requirements" }, ...work("returns-api", "src/intake.ts"), ...closeIn("product"), { result: "Phase 1 landed." }] },
      {
        actions: [
          { addRepository: "billing" },
          { addRepository: "notifications" },
          ...work("notifications", "src/credit-email.ts"),
          ...work("returns-api", "src/credit.ts"),
          ...closeIn("product"),
          { result: "Phase 2b landed." },
        ],
      },
      { actions: [...closeIn("product"), { result: "Phase 3 landed." }] },
      {
        actions: [
          { openPullRequest: { number: 12, repository: "product" } },
          { openPullRequest: { number: 57, repository: "returns-api" } },
          { openPullRequest: { number: 9, repository: "notifications" } },
          { result: "Opened three." },
        ],
      },
    ]);
    // AC-REPO-02: a named repository's own checkout needn't be clean; storefront also has a main to branch from.
    writeFileSync(join(f.code["returns-api"]!.checkout, "notes.txt"), "work in progress\n");
    git(f.sandbox, f.code.storefront!.checkout, "push", "-q", "origin", "develop:main");
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);

    // AC-REPO-03: the terminal's first line counts the repositories; Documents found lists them.
    expect(kiln.lines()[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs, 3 repositories  ·  all checks passed");
    let snapshot = await snapshotOf(address, token);
    expect(snapshot.feature).toMatchObject({ repositoryName: "product", multiRepository: true });
    expect(snapshot.repositories.map((row) => [row.name, row.kind, row.baseBranch, row.worktreePath, row.fixed])).toEqual([
      ["product", "prd", "develop", displayPath(join(workspace, "product")), false],
      ["returns-api", "named", "develop", displayPath(join(workspace, "returns-api")), false],
      ["storefront", "named", "develop", displayPath(join(workspace, "storefront")), false],
    ]);
    // AC-REPO-01: each phase shows the repositories it names; a split record's aren't passed down.
    expect(snapshot.documents!.plan!.phases.map((phase) => [phase.id, phase.repositories])).toEqual([
      ["1", ["returns-api"]],
      ["2", ["returns-api"]],
      ["2a", []],
      ["2b", ["returns-api", "storefront"]],
      ["3", ["storefront"]],
    ]);
    expect(snapshot.documents!.checks.map((check) => check.name)).toEqual([
      "Every phase cites its criteria",
      "Dependencies point backward",
      "Named repositories found beside product",
      "Working tree of product is clean",
    ]);
    // AC-SPACE-01: the workspace folder beside the PRD's repository, and the feature branch, by default.
    expect(snapshot.settings).toMatchObject({ workspaceFolder: displayPath(workspace), featureBranch: BRANCH, fixed: { workspaceFolder: false, featureBranch: false } });
    // Each repository's base is set apart; the PRD's repository's is baseBranch.
    expect(await api(address, token, "POST", "/api/settings", { bases: { product: "develop" } })).toMatchObject({ status: 400 });
    expect(await api(address, token, "POST", "/api/settings", { bases: { storefront: "main" } })).toMatchObject({ status: 200 });

    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => recordOf(f).completedAt !== undefined, 110_000);
    const record = recordOf(f);

    // AC-SPACE-01: a worktree of each repository in the workspace folder, all on the feature branch from its base.
    for (const name of ["product", "returns-api", "storefront", "notifications"]) {
      expect(git(f.sandbox, join(workspace, name), "branch", "--show-current").trim(), name).toBe(BRANCH);
    }
    // AC-ADD-01, REPO-003: the added repository starts from its default branch, main, having no develop.
    expect(git(f.sandbox, join(workspace, "notifications"), "merge-base", BRANCH, "main").trim()).toBe(git(f.sandbox, f.code.notifications!.checkout, "rev-parse", "main").trim());
    expect(record.repositories.map((entry) => [entry.name, entry.kind, entry.baseBranch, entry.addedInPhase])).toEqual([
      ["product", "prd", "develop", undefined],
      ["returns-api", "named", "develop", undefined],
      // Each repository's own base: storefront's was changed before Start.
      ["storefront", "named", "main", undefined],
      ["notifications", "added", "main", "2b"],
    ]);
    // Kiln never touched a repository's own checkout: each is still on its own branch, with no feature branch checked out.
    expect(git(f.sandbox, f.code["returns-api"]!.checkout, "branch", "--show-current").trim()).toBe("develop");

    // AC-ADD-01, AC-ADD-02: what `kiln add-repository` told the session, through the running Kiln.
    expect(readJsonLines(`${f.scenarioPath}.add-repository.jsonl`)).toEqual([
      { name: "billing", status: 1, stdout: "", stderr: `kiln: billing isn’t in ${displayPath(f.sandbox.root)}/.\n` },
      {
        name: "notifications",
        status: 0,
        stdout: `Added notifications at ${join(workspace, "notifications")}, on ${BRANCH} from main. Read its CLAUDE.md and AGENTS.md, if it has them, before you change it.\n`,
        stderr: "",
      },
    ]);

    // AC-SPACE-02: every session starts in the workspace folder, told the repositories, each worktree and how to add one.
    const calls = readJsonLines<{ args: string[]; cwd: string; prompt: string }>(`${f.scenarioPath}.calls.jsonl`);
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.cwd).toBe(workspace);
      // Every worktree is inside the folder it starts in, so writes anywhere in the workspace are allowed by mode.
      expect(call.args).not.toContain("--add-dir");
    }
    expect(calls[0]!.prompt).toContain(`implement \`product/docs/prds/${FOLDER}/phase-1-return-intake.md\``);
    expect(calls[0]!.prompt).toContain(`Work only in this Kiln workspace, \`${workspace}\``);
    expect(calls[0]!.prompt).toContain(`- \`returns-api\`: \`${join(workspace, "returns-api")}\`, base \`develop\``);
    expect(calls[0]!.prompt).not.toContain("notifications");
    // AC-ADD-03: the added repository joins every later phase.
    expect(calls[2]!.prompt).toContain(`- \`notifications\`: \`${join(workspace, "notifications")}\`, base \`main\``);
    // AC-PRS-05, AC-PRS-02: one pull request per repository with commits of its own; storefront has none.
    expect(calls[3]!.prompt).toContain("- `product` (`acme/product`)");
    expect(calls[3]!.prompt).toContain("- `notifications` (`acme/notifications`), worktree");
    expect(calls[3]!.prompt).not.toContain("`storefront`");
    expect(calls[3]!.prompt).toContain("links every other pull request opened for it");
    const ghCalls = readJsonLines<string[]>(`${f.ghStatePath}.calls.jsonl`).filter((args) => args[0] === "pr");
    expect(new Set(ghCalls.map((args) => args[args.indexOf("--repo") + 1]))).toEqual(new Set(["github.com/acme/product", "github.com/acme/returns-api", "github.com/acme/notifications"]));

    // AC-CHECK-01: each phase is done only once pushed in every repository; storefront needed no push.
    const tip = (name: string) => git(f.sandbox, join(workspace, name), "rev-parse", BRANCH).trim();
    const onOrigin = (bare: string) => git(f.sandbox, bare, "rev-parse", BRANCH).trim();
    expect(onOrigin(f.code["returns-api"]!.bare)).toBe(tip("returns-api"));
    expect(onOrigin(f.code.notifications!.bare)).toBe(tip("notifications"));
    expect(git(f.sandbox, f.code.storefront!.bare, "branch", "--list", BRANCH).trim()).toBe("");
    expect(record.phases["2b"]!.repositories).toMatchObject({ notifications: { pushedSha: tip("notifications"), commitCount: 1 }, storefront: { commitCount: 0 } });

    // The terminal, as drawn: Started across the repositories, the added line, each repository pushed, every pull request.
    const lines = kiln.lines();
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^[ \\d]\\d:\\d\\d  Started  ·  ${BRANCH} in 3 repositories$`)));
    expect(lines).toContainEqual(expect.stringMatching(/ 2b +Store credit +added notifications$/));
    expect(lines).toContainEqual(expect.stringMatching(/ 1 +Return intake +done · pushed returns-api [0-9a-f]{7} · product [0-9a-f]{7}$/));
    expect(lines).toContainEqual(expect.stringMatching(/ 2b +Store credit +done · pushed returns-api [0-9a-f]{7} · notifications [0-9a-f]{7} · product [0-9a-f]{7}$/));
    expect(lines).toContainEqual(expect.stringMatching(/ 3 +Returns dashboard +done · pushed product [0-9a-f]{7}$/));
    expect(lines).toContainEqual(expect.stringMatching(/ PR +Final pull request +opened product #12 · returns-api #57 · notifications #9$/));

    // AC-PRS-03: Complete shows every pull request, and each phase's commits by repository.
    snapshot = await snapshotOf(address, token);
    expect(snapshot.feature.state).toBe("complete");
    expect(snapshot.pullRequests!.map((pull) => [pull.repository, pull.number, pull.base])).toEqual([
      ["product", 12, "develop"],
      ["returns-api", 57, "develop"],
      ["notifications", 9, "main"],
    ]);
    const row2b = snapshot.phases.find((phase) => phase.id === "2b")!;
    expect(row2b.pushedRepositoryCount).toBe(3);
    expect(row2b.details!.repositories!.map((repository) => [repository.name, repository.addedInPhase, repository.commitCount])).toEqual([
      ["product", undefined, 1],
      ["returns-api", undefined, 1],
      ["notifications", "2b", 1],
    ]);
    expect(snapshot.repositories.find((row) => row.name === "notifications")).toMatchObject({ kind: "added", addedInPhase: "2b", baseBranch: "main", fixed: true });

    // AC-SPACE-05: the workspace and its worktrees stay after the last phase.
    kiln.signals.emit("SIGINT");
    await kiln.done;
    for (const name of ["product", "returns-api", "storefront", "notifications"]) expect(existsSync(join(workspace, name)), name).toBe(true);
    // Four sessions across four repositories: more than the suite's default minute when the machine is busy.
  }, 120_000);

  it("names the repository and the folder when a named repository isn't beside the PRD's, is a link, isn't a checkout or isn't on GitHub", async () => {
    const f = createWorkspaceFeature([], {
      "phase-1-return-intake.md": "**Repositories:** billing, Storefront",
      "phase-2b-store-credit.md": "**Repositories:** linked, plain-folder, local-only, no-remote",
      "phase-3-returns-dashboard.md": "**Repositories:** billing",
    });
    const parent = f.sandbox.root;
    mkdirSync(join(parent, "plain-folder"));
    symlinkSync(f.code.storefront!.checkout, join(parent, "linked"), "dir");
    createRepository(f.sandbox, "local-only", join(parent, "storefront.git"));
    createRepository(f.sandbox, "no-remote");
    const kiln = startKiln(f);
    expect(await kiln.done).toBe(1);
    const shown = displayPath(parent);
    expect(kiln.lines()).toEqual([
      "✗ Can’t start Customer returns.",
      `    phase-1-return-intake.md names billing, which isn’t in ${shown}/.`,
      // A name that differs only in case is a different folder, on every platform.
      `    phase-1-return-intake.md names Storefront, which isn’t in ${shown}/.`,
      `    linked in ${shown}/ is a link to ${displayPath(f.code.storefront!.checkout)}; Kiln needs the checkout itself there.`,
      `    plain-folder in ${shown}/ isn’t a Git checkout.`,
      `    local-only in ${shown}/ has an origin that isn’t on GitHub: ${join(parent, "storefront.git")}`,
      `    no-remote in ${shown}/ has no origin remote.`,
      "  Nothing was started.",
    ]);
  });

  it("refuses a Repositories line with no names or a path, as a plan problem naming the file", async () => {
    const f = createWorkspaceFeature([], { "phase-1-return-intake.md": "**Repositories:**", "phase-3-returns-dashboard.md": "**Repositories:** ../storefront" });
    const kiln = startKiln(f);
    expect(await kiln.done).toBe(1);
    expect(kiln.lines()).toContain("    phase-1-return-intake.md has a Repositories line that names no repository.");
    expect(kiln.lines()).toContain("    phase-3-returns-dashboard.md names ../storefront on its Repositories line, which isn't a folder name.");
  });

  it("keeps what a Start that failed partway set up, fixes the workspace and branch, and finishes only what is missing on the next Start", async () => {
    const f = createWorkspaceFeature([]);
    // storefront's ref can't be created: git worktree add fails there, after product and returns-api are set up.
    const lock = join(f.code.storefront!.checkout, ".git", "refs", "heads", "feature");
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "customer-returns.lock"), "");
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    const start = await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    expect(start.status).toBe(409);
    expect(start.body.reason).toMatch(/^Couldn’t set up storefront’s worktree: /);
    expect(kiln.lines().at(-1)).toMatch(/^✗ Couldn’t set up storefront’s worktree: /);

    let record = recordOf(f);
    expect(record.startedAt).toBeUndefined();
    expect(record.repositories.map((entry) => [entry.name, entry.setupCompletedAt !== undefined])).toEqual([
      ["product", true],
      ["returns-api", true],
    ]);
    const snapshot = await snapshotOf(address, token);
    expect(snapshot.feature.state).toBe("not_started");
    expect(snapshot.settings.fixed).toMatchObject({ workspaceFolder: true, featureBranch: true });
    expect(snapshot.repositories.map((row) => [row.name, row.fixed])).toEqual([
      ["product", true],
      ["returns-api", true],
      ["storefront", false],
    ]);
    expect(await api(address, token, "POST", "/api/settings", { featureBranch: "feature/other" })).toMatchObject({ status: 409 });
    expect(await api(address, token, "POST", "/api/settings", { bases: { "returns-api": "develop" } })).toMatchObject({ status: 409 });
    // storefront's add failed before git made its branch, so its base can still change.
    expect(await api(address, token, "POST", "/api/settings", { bases: { storefront: "develop" } })).toMatchObject({ status: 200 });

    // Fixed, the next Start sets up storefront alone and the phases start.
    const productWorktreeHead = git(f.sandbox, join(f.sandbox.root, ".worktrees", FOLDER, "product"), "rev-parse", "HEAD").trim();
    writeFileSync(f.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ result: "Nothing done." }] }] }));
    // The ref lock's folder goes too, so the branch can be made there.
    rmSync(lock, { recursive: true, force: true });
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    record = recordOf(f);
    expect(record.repositories.map((entry) => entry.name)).toEqual(["product", "returns-api", "storefront"]);
    expect(record.repositories.every((entry) => entry.setupCompletedAt !== undefined)).toBe(true);
    expect(git(f.sandbox, join(f.sandbox.root, ".worktrees", FOLDER, "product"), "rev-parse", "HEAD").trim()).toBe(productWorktreeHead);
    expect(kiln.lines()).toContainEqual(expect.stringMatching(/Started {2}· {2}feature\/customer-returns in 3 repositories$/));
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("checks the workspace folder, the feature branch in every repository and each base before Start, and records nothing when they fail", async () => {
    const f = createWorkspaceFeature([]);
    git(f.sandbox, f.code["returns-api"]!.checkout, "branch", BRANCH);
    git(f.sandbox, f.code.storefront!.checkout, "branch", BRANCH);
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    // A branch with the default name selects A branch that already exists (run restart AC-FROM-01); a new branch is chosen here.
    expect((await api(address, token, "POST", "/api/settings", { start: { from: "new", bringUpToDate: true } })).status).toBe(200);
    // AC-SPACE-01: the branch name must be free in every repository; the message names each it exists in.
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toMatchObject({
      status: 409,
      body: {
        fieldErrors: {
          featureBranch: "That branch already exists in returns-api and storefront. Choose a name no branch has in any repository; a new name starts this PRD over from each repository’s base branch.",
        },
      },
    });
    expect(await api(address, token, "POST", "/api/settings", { featureBranch: "feature/returns", workspaceFolder: join(f.code["returns-api"]!.checkout, "work"), bases: { storefront: "trunk" } })).toMatchObject({ status: 200 });
    const snapshot = await snapshotOf(address, token);
    expect(snapshot.settings.fieldErrors).toEqual({ workspaceFolder: "That folder is inside a checkout of returns-api. Choose one outside it." });
    expect(snapshot.repositories.map((row) => [row.name, row.fieldErrors])).toEqual([
      ["product", {}],
      ["returns-api", {}],
      ["storefront", { baseBranch: "trunk isn’t on origin." }],
    ]);
    // A leftover folder where a repository's worktree would go fails before setup does.
    const workspace = join(f.sandbox.root, "elsewhere");
    mkdirSync(join(workspace, "storefront"), { recursive: true });
    writeFileSync(join(workspace, "storefront", "left.txt"), "");
    await api(address, token, "POST", "/api/settings", { workspaceFolder: join(workspace, "sub"), bases: { storefront: "develop" } });
    mkdirSync(join(workspace, "sub", "storefront"), { recursive: true });
    writeFileSync(join(workspace, "sub", "storefront", "left.txt"), "");
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toMatchObject({
      status: 409,
      body: { fieldErrors: { workspaceFolder: "That folder already exists and isn’t empty. Choose a new one." } },
    });
    const record = recordOf(f);
    expect(record.startedAt).toBeUndefined();
    expect(record.repositories).toEqual([]);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("fixes the base of a repository whose branch Kiln made before its Start failed", async () => {
    const f = createWorkspaceFeature([]);
    // A post-checkout hook that fails: git makes storefront's branch, then fails the add.
    const hook = join(f.code.storefront!.checkout, ".git", "hooks", "post-checkout");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    expect((await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).status).toBe(409);
    expect(recordOf(f).repositories.find((entry) => entry.name === "storefront")).toMatchObject({ createdBranch: { name: BRANCH, baseBranch: "develop" } });
    expect((await snapshotOf(address, token)).repositories.find((row) => row.name === "storefront")).toMatchObject({ fixed: true });
    expect(await api(address, token, "POST", "/api/settings", { bases: { storefront: "develop" } })).toMatchObject({ status: 409 });
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("finishes a setup cut short by Ctrl+C from the recorded list on the next kiln run", async () => {
    const f = createWorkspaceFeature([{ actions: [{ result: "Nothing done." }] }]);
    const first = startKiln(f);
    await first.address;
    first.signals.emit("SIGINT");
    await first.done;
    // As a Ctrl+C after Start's save leaves it: Start recorded, every entry holding its commit, none set up.
    const recordPath = join(prdStateDirectory(stateRoot(f.env), f.product, "product", `docs/prds/${FOLDER}`), "prd.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as PrdRecord;
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    const entry = (name: string, kind: "prd" | "named", checkout: string) => ({
      name,
      kind,
      mainCheckoutPath: checkout,
      github: `acme/${name}`,
      baseBranch: "develop",
      worktreePath: join(workspace, name),
      baseCommit: git(f.sandbox, checkout, "rev-parse", "develop").trim(),
    });
    record.startedAt = "2026-10-22T13:00:00.000Z";
    record.refinementConfirmedAt = record.startedAt;
    record.repositories = [entry("product", "prd", f.product), entry("returns-api", "named", f.code["returns-api"]!.checkout), entry("storefront", "named", f.code.storefront!.checkout)];
    writeFileSync(recordPath, JSON.stringify(record));

    const again = startKiln(f, true);
    await again.address;
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length === 1, 30_000);
    expect(recordOf(f).repositories.map((one) => [one.name, one.setupCompletedAt !== undefined])).toEqual([
      ["product", true],
      ["returns-api", true],
      ["storefront", true],
    ]);
    for (const name of ["product", "returns-api", "storefront"]) expect(git(f.sandbox, join(workspace, name), "branch", "--show-current").trim(), name).toBe(BRANCH);
    again.signals.emit("SIGINT");
    await again.done;
  });

  it("holds Start after a failed Start when the checkout's PRD documents differ from the set-up worktree's", async () => {
    const f = createWorkspaceFeature([]);
    const lock = join(f.code.storefront!.checkout, ".git", "refs", "heads", "feature");
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "customer-returns.lock"), "");
    const first = startKiln(f);
    const address = await first.address;
    expect((await api(address, await tokenOf(address), "POST", "/api/start", { refinementConfirmed: true })).status).toBe(409);
    first.signals.emit("SIGINT");
    await first.done;
    // The person edits a phase document in their own checkout, not in the worktree sessions start from.
    const phase1 = join(f.product, "docs", "prds", FOLDER, "phase-1-return-intake.md");
    writeFileSync(phase1, `${readFileSync(phase1, "utf8")}\nA note.\n`);
    git(f.sandbox, f.product, "commit", "-q", "-am", "plan: a note");
    rmSync(lock, { recursive: true, force: true });

    const again = startKiln(f);
    const address2 = await again.address;
    const token = await tokenOf(address2);
    const worktree = displayPath(join(f.sandbox.root, ".worktrees", FOLDER, "product"));
    const message = `product’s worktree has different PRD documents from this checkout. Make the same change on ${BRANCH} in ${worktree}, or run kiln run from that worktree; sessions start from it.`;
    // Start runs the field checks, as a view connecting does.
    expect(await api(address2, token, "POST", "/api/start", { refinementConfirmed: true })).toMatchObject({ status: 409, body: { fieldErrors: { baseBranch: message } } });
    expect((await snapshotOf(address2, token)).repositories[0]!.fieldErrors).toEqual({ baseBranch: message });
    again.signals.emit("SIGINT");
    await again.done;
  });

  it("names each failed fact's repository at Needs you, and stops before a phase whose named repository can't be added", async () => {
    const f = createWorkspaceFeature(
      [
        // Phase 1 leaves returns-api uncommitted and product's close unpushed.
        { actions: [{ write: { repository: "returns-api", path: "src/intake.ts", content: "x\n" } }, { close: true }, { commit: "docs: close", repository: "product" }, { result: "Partway." }] },
      ],
      { "phase-1-return-intake.md": "**Repositories:** returns-api", "phase-2b-store-credit.md": "**Repositories:** returns-api" },
    );
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(async () => (await snapshotOf(address, token)).feature.state === "needs_you", 30_000);
    let snapshot = await snapshotOf(address, token);
    // AC-CHECK-02: each failed fact names its repository.
    expect(snapshot.needsYou!.checks.map((check) => [check.name, check.passed, check.facts])).toEqual([
      ["Phase doc closed", true, ["Closed line in phase-1-return-intake.md"]],
      ["Everything committed", false, ["returns-api: 1 file changed, not committed"]],
      ["Pushed", false, [expect.stringMatching(/^product: feature\/customer-returns isn't on origin yet$/)]],
    ]);
    // AC-SPACE-04: the resume command changes to the folder the session started in, the workspace.
    expect(snapshot.needsYou!.resumeCommand).toMatch(new RegExp(`^cd ${displayPath(join(f.sandbox.root, ".worktrees", FOLDER)).replace(/[.]/g, "\\.")}\\nclaude --resume `));
    const workspaceFolder = join(f.sandbox.root, ".worktrees", FOLDER);
    expect(snapshot.needsYou!.freshSessionPrompt).toContain(`Work only in this Kiln workspace, \`${workspaceFolder}\``);
    expect(snapshot.needsYou!.freshSessionPrompt).toContain(`- \`returns-api\`: \`${join(workspaceFolder, "returns-api")}\`, base \`develop\``);

    // A session can add a repository while its phase is stopped at Needs you.
    const add = await api(address, token, "POST", "/api/repositories", { name: "notifications" });
    expect(add).toMatchObject({ status: 200, body: { name: "notifications", branch: BRANCH, baseBranch: "main", added: true } });
    expect(await api(address, token, "POST", "/api/repositories", { name: "notifications" })).toMatchObject({ status: 200, body: { added: false } });
    // AC-ADD-02: one Kiln can't find is refused in the words of the failed check, and nothing changes.
    expect(await api(address, token, "POST", "/api/repositories", { name: "billing" })).toEqual({
      status: 422,
      body: { ok: false, reason: `billing isn’t in ${displayPath(f.sandbox.root)}/.` },
    });
    expect(recordOf(f).repositories.map((entry) => entry.name)).toEqual(["product", "returns-api", "notifications"]);

    // The person finishes phase 1; the plan now names a repository with the feature branch taken (AC-ADD-04).
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    git(f.sandbox, join(workspace, "returns-api"), "add", "-A");
    git(f.sandbox, join(workspace, "returns-api"), "commit", "-q", "-m", "feat: intake");
    git(f.sandbox, join(workspace, "returns-api"), "push", "-q", "-u", "origin", BRANCH);
    const phase2b = join(workspace, "product", "docs", "prds", FOLDER, "phase-2b-store-credit.md");
    writeFileSync(phase2b, readFileSync(phase2b, "utf8").replace("**Repositories:** returns-api", "**Repositories:** returns-api, storefront"));
    git(f.sandbox, join(workspace, "product"), "commit", "-q", "-am", "plan: 2b changes storefront");
    git(f.sandbox, join(workspace, "product"), "push", "-q", "-u", "origin", BRANCH);
    git(f.sandbox, f.code.storefront!.checkout, "branch", BRANCH);
    expect(await api(address, token, "POST", "/api/check-again", (await snapshotOf(address, token)).needsYou?.phaseRecovery ? { target: (await snapshotOf(address, token)).needsYou!.phaseRecovery!.target, intent: "verify" } : undefined)).toMatchObject({ status: 200 });
    await waitFor(async () => (await snapshotOf(address, token)).needsYou?.kind === "plan", 30_000);
    snapshot = await snapshotOf(address, token);
    expect(snapshot.needsYou).toMatchObject({ phaseId: "2b", kind: "plan" });
    expect(snapshot.needsYou!.checks[0]!.facts[0]).toMatch(/^storefront: That branch already exists in storefront\./);
    // With the branch gone, Check again adds it and the phase starts.
    git(f.sandbox, f.code.storefront!.checkout, "branch", "-D", BRANCH);
    expect(await api(address, token, "POST", "/api/check-again", (await snapshotOf(address, token)).needsYou?.phaseRecovery ? { target: (await snapshotOf(address, token)).needsYou!.phaseRecovery!.target, intent: "verify" } : undefined)).toMatchObject({ status: 200 });
    await waitFor(() => recordOf(f).repositories.some((entry) => entry.name === "storefront" && entry.setupCompletedAt !== undefined), 30_000);
    expect(recordOf(f).repositories.find((entry) => entry.name === "storefront")).toMatchObject({ kind: "added", addedInPhase: "2b" });
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("starts each repository's feature branch from its own base on origin: a base the person chose, a default branch, and an origin ahead of the checkout (AC-SPACE-01)", async () => {
    const f = createWorkspaceFeature([{ actions: [{ result: "Nothing done." }] }], { "phase-1-return-intake.md": "**Repositories:** returns-api, storefront, notifications" });
    const commitIn = (checkout: string, file: string) => {
      writeFileSync(join(checkout, file), `${file}\n`);
      git(f.sandbox, checkout, "add", file);
      git(f.sandbox, checkout, "commit", "-q", "-m", file);
    };
    // storefront's main is ahead of its develop; the person picks main.
    const storefront = f.code.storefront!.checkout;
    git(f.sandbox, storefront, "switch", "-q", "-c", "main");
    commitIn(storefront, "main-only.txt");
    git(f.sandbox, storefront, "push", "-q", "origin", "main");
    git(f.sandbox, storefront, "switch", "-q", "develop");
    // returns-api's origin is a commit ahead of the person's own checkout.
    const returnsApi = f.code["returns-api"]!.checkout;
    commitIn(returnsApi, "on-origin.txt");
    git(f.sandbox, returnsApi, "push", "-q", "origin", "develop");
    const originDevelop = git(f.sandbox, returnsApi, "rev-parse", "develop").trim();
    git(f.sandbox, returnsApi, "reset", "-q", "--hard", "HEAD~1");
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    expect(await api(address, token, "POST", "/api/settings", { bases: { storefront: "main" } })).toMatchObject({ status: 200 });
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length === 1, 30_000);
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    const head = (name: string) => git(f.sandbox, join(workspace, name), "rev-parse", "HEAD").trim();
    expect(recordOf(f).repositories.map((entry) => [entry.name, entry.kind, entry.baseBranch])).toEqual([
      ["product", "prd", "develop"],
      ["returns-api", "named", "develop"],
      ["storefront", "named", "main"],
      ["notifications", "named", "main"],
    ]);
    expect(head("returns-api")).toBe(originDevelop);
    expect(head("storefront")).toBe(git(f.sandbox, storefront, "rev-parse", "main").trim());
    expect(head("storefront")).not.toBe(git(f.sandbox, storefront, "rev-parse", "develop").trim());
    expect(head("notifications")).toBe(git(f.sandbox, f.code.notifications!.checkout, "rev-parse", "main").trim());
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("holds a phase whose code repository has a commit not on origin, and passes it once pushed (AC-CHECK-01, AC-CHECK-02)", async () => {
    const f = createWorkspaceFeature([
      // Phase 1 pushes its first commit in returns-api, then commits again without pushing.
      {
        actions: [
          ...work("returns-api", "src/intake.ts"),
          { write: { repository: "returns-api", path: "src/more.ts", content: "more\n" } },
          { commit: "feat: more", repository: "returns-api" },
          ...closeIn("product"),
          { result: "Partway." },
        ],
      },
      { actions: [{ result: "Stopping here." }] },
    ]);
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(async () => (await snapshotOf(address, token)).feature.state === "needs_you", 30_000);
    const worktree = join(f.sandbox.root, ".worktrees", FOLDER, "returns-api");
    const local = git(f.sandbox, worktree, "rev-parse", "--short=7", "HEAD").trim();
    expect((await snapshotOf(address, token)).needsYou!.checks.map((check) => [check.name, check.passed, check.facts])).toEqual([
      ["Phase doc closed", true, ["Closed line in phase-1-return-intake.md"]],
      ["Everything committed", true, [expect.any(String)]],
      ["Pushed", false, [`returns-api: ${local} isn't on origin yet`]],
    ]);
    expect(recordOf(f).phases["1"]!.doneAt).toBeUndefined();
    git(f.sandbox, worktree, "push", "-q", "origin", BRANCH);
    expect(await api(address, token, "POST", "/api/check-again", (await snapshotOf(address, token)).needsYou?.phaseRecovery ? { target: (await snapshotOf(address, token)).needsYou!.phaseRecovery!.target, intent: "verify" } : undefined)).toMatchObject({ status: 200 });
    await waitFor(() => recordOf(f).phases["1"]!.doneAt !== undefined, 30_000);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("resumes an interrupted session in the workspace, told to check the workspace first (AC-SPACE-02)", async () => {
    const f = createWorkspaceFeature([]);
    const working = join(f.sandbox.root, "working");
    writeFileSync(
      f.scenarioPath,
      JSON.stringify({
        sessions: [
          { actions: [{ write: { repository: "returns-api", path: "src/partial.ts", content: "half\n" } }, { touch: working }, { work: "npm test" }] },
          { actions: [{ result: "Stopping here." }] },
        ],
      }),
    );
    const first = startKiln(f);
    const address = await first.address;
    await api(address, await tokenOf(address), "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(() => existsSync(working), 30_000);
    first.signals.emit("SIGINT");
    await first.done;

    const again = startKiln(f, true);
    await again.address;
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length === 2, 30_000);
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    const [launched, resumed] = readJsonLines<{ args: string[]; cwd: string; prompt: string }>(`${f.scenarioPath}.calls.jsonl`);
    expect(resumed!.args).toContain("--resume");
    expect(resumed!.cwd).toBe(workspace);
    expect(resumed!.args).not.toContain("--add-dir");
    expect(resumed!.prompt).toContain(`Carry on with \`product/docs/prds/${FOLDER}/phase-1-return-intake.md\` from where you stopped; check the workspace first`);
    expect(launched!.cwd).toBe(workspace);
    again.signals.emit("SIGINT");
    await again.done;
  });

  it("lets a one-repository PRD's session add a repository, after which its sessions start in the workspace", async () => {
    const f = createWorkspaceFeature(
      [
        { actions: [{ addRepository: "returns-api" }, ...work("returns-api", "src/intake.ts"), ...closeIn(""), { result: "Phase 1 landed." }] },
        { actions: [{ result: "Stopping here." }] },
      ],
      {},
    );
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    // AC-SPACE-03: one repository, v1's screens and terminal line.
    expect(kiln.lines()[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed");
    expect((await snapshotOf(address, token)).feature.multiRepository).toBe(false);
    await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length === 2, 30_000);
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    const calls = readJsonLines<{ args: string[]; cwd: string; prompt: string }>(`${f.scenarioPath}.calls.jsonl`);
    // The first session starts in the worktree, as v1, with the workspace folder writable by mode.
    expect(calls[0]!.cwd).toBe(join(workspace, "product"));
    expect(calls[0]!.args.slice(-2)).toEqual(["--add-dir", workspace]);
    expect(calls[0]!.prompt).toContain("If you need a repository that isn't in this worktree's workspace, run `kiln add-repository <folder name>`");
    expect(kiln.lines()).toContainEqual(expect.stringMatching(/ 1 +Return intake +added returns-api$/));
    // Once it has an added repository, it is a multi-repository PRD.
    expect(calls[1]!.cwd).toBe(workspace);
    expect(calls[1]!.prompt).toContain(`- \`returns-api\`: \`${join(workspace, "returns-api")}\`, base \`develop\``);
    expect((await snapshotOf(address, token)).feature.multiRepository).toBe(true);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("names the workspace and the added repository in the fresh-session prompt of a one-repository PRD's session that added one and stopped", async () => {
    const f = createWorkspaceFeature([{ actions: [{ addRepository: "returns-api" }, { result: "Partway." }] }], {});
    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(async () => (await snapshotOf(address, token)).feature.state === "needs_you", 30_000);
    const needsYou = (await snapshotOf(address, token)).needsYou!;
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    const worktree = join(workspace, "product");
    // AC-SPACE-04: the workspace and every one of the PRD's repositories, the added one included.
    expect(needsYou.freshSessionPrompt).toContain(`Work only in this Kiln workspace, \`${workspace}\``);
    expect(needsYou.freshSessionPrompt).toContain(`- \`product\`: \`${worktree}\`, base \`develop\` (the PRD's repository)`);
    expect(needsYou.freshSessionPrompt).toContain(`- \`returns-api\`: \`${join(workspace, "returns-api")}\`, base \`develop\``);
    expect(needsYou.freshSessionPrompt).toContain("check the workspace");
    // Paths are from the folder the session started in, which both commands change to.
    expect(needsYou.freshSessionPrompt).toContain(`\`docs/prds/${FOLDER}/phase-1-return-intake.md\``);
    const cd = `cd ${displayPath(worktree)}\n`;
    expect(needsYou.freshSessionCommand).toBe(`${cd}claude`);
    expect(needsYou.resumeCommand!.startsWith(`${cd}claude --resume `)).toBe(true);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("adds a repository a split parent names after Start before its next child's session, with no stop (AC-ADD-04)", async () => {
    const phase2 = `docs/prds/${FOLDER}/phase-2-refunds.md`;
    const f = createWorkspaceFeature(
      [
        // Phase 1's session names storefront on phase 2's split record; 2b, next since 2a is closed, names nothing.
        { actions: [{ write: { path: phase2, content: phaseFiles({ "phase-2-refunds.md": "**Repositories:** storefront" })["phase-2-refunds.md"]! } }, ...closeIn(""), { result: "Phase 1 landed." }] },
        { actions: [{ result: "Stopping here." }] },
      ],
      {},
    );
    const kiln = startKiln(f);
    const address = await kiln.address;
    await api(address, await tokenOf(address), "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length === 2, 30_000);
    const workspace = join(f.sandbox.root, ".worktrees", FOLDER);
    expect(recordOf(f).repositories.find((entry) => entry.name === "storefront")).toMatchObject({ kind: "added", addedInPhase: "2b", worktreePath: join(workspace, "storefront") });
    const lines = kiln.lines();
    const added = lines.findIndex((line) => / 2b +Store credit +added storefront$/.test(line));
    expect(added).toBeGreaterThan(-1);
    // Added before the session starts, with no plan stop between.
    expect(lines[added + 1]).toMatch(/ 2b +Store credit +started$/);
    const calls = readJsonLines<{ cwd: string; prompt: string }>(`${f.scenarioPath}.calls.jsonl`);
    expect(calls[1]!.cwd).toBe(workspace);
    expect(calls[1]!.prompt).toContain(`- \`storefront\`: \`${join(workspace, "storefront")}\`, base \`develop\``);
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });

  it("prints the added line when kiln run retries a named repository's addition and it succeeds", async () => {
    const phase2b = `docs/prds/${FOLDER}/phase-2b-store-credit.md`;
    const f = createWorkspaceFeature(
      [
        // Phase 1's session names storefront for 2b, whose feature branch is taken there (AC-ADD-04).
        { actions: [{ write: { path: phase2b, content: phaseFiles({ "phase-2b-store-credit.md": "**Repositories:** storefront" })["phase-2b-store-credit.md"]! } }, ...closeIn(""), { result: "Phase 1 landed." }] },
        { actions: [{ result: "Stopping here." }] },
      ],
      {},
    );
    git(f.sandbox, f.code.storefront!.checkout, "branch", BRANCH);
    const first = startKiln(f);
    const address = await first.address;
    const token = await tokenOf(address);
    await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    await waitFor(async () => (await snapshotOf(address, token)).needsYou?.kind === "plan", 30_000);
    first.signals.emit("SIGINT");
    await first.done;

    git(f.sandbox, f.code.storefront!.checkout, "branch", "-D", BRANCH);
    const again = startKiln(f, true);
    await again.address;
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length === 2, 30_000);
    // AC-ADD-03: the line is printed while kiln run decides, ahead of the ● line, which doesn't mention it.
    const lines = again.lines();
    const added = lines.findIndex((line) => / 2b +Store credit +added storefront$/.test(line));
    expect(lines.filter((line) => line.endsWith("added storefront"))).toHaveLength(1);
    expect(added).toBeLessThan(lines.findIndex((line) => line.includes("Starting phase 2b")));
    again.signals.emit("SIGINT");
    await again.done;
  });
});

describe("starting several repositories on a branch that already exists (run restart AC-FROM-05)", () => {
  it("uses the branch where a repository has it and cuts it elsewhere, with the existing worktrees fixing the workspace folder", async () => {
    const f = createWorkspaceFeature([{ noInit: true, actions: [] }]);
    const workspace = join(f.sandbox.root, "kept-workspace");
    mkdirSync(workspace, { recursive: true });
    // The PRD's repository and returns-api have the branch, each checked out at <W>/<name>; storefront doesn't have it.
    for (const [name, checkout] of [["product", f.product], ["returns-api", f.code["returns-api"]!.checkout]] as const) {
      git(f.sandbox, checkout, "worktree", "add", "-q", "-b", BRANCH, join(workspace, name));
      git(f.sandbox, join(workspace, name), "push", "-q", "-u", "origin", BRANCH);
    }
    // Phase 1 was closed by hand on the PRD repository's branch.
    const doc = join(workspace, "product", "docs", "prds", FOLDER, "phase-1-return-intake.md");
    const lines = readFileSync(doc, "utf8").split("\n");
    lines.splice(1, 0, "", "**Closed:** 2026-11-12");
    writeFileSync(doc, lines.join("\n"));
    git(f.sandbox, join(workspace, "product"), "commit", "-q", "-am", "docs: phase 1 closed by hand");
    git(f.sandbox, join(workspace, "product"), "push", "-q", "origin", BRANCH);
    const productTip = git(f.sandbox, join(workspace, "product"), "rev-parse", "HEAD").trim();

    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    expect((await api(address, token, "POST", "/api/settings", { start: { from: "existing", bringUpToDate: true } })).status).toBe(200);
    const snapshot = await snapshotOf(address, token);
    const start = snapshot.documents!.start!;
    expect(start).toMatchObject({ from: "existing", workspaceFolder: displayPath(workspace), planSource: { kind: "branch", branch: BRANCH, sha: productTip }, startAt: { id: "2b" } });
    expect(start.repositories.map(repository => [repository.name, repository.hasBranch])).toEqual([["product", true], ["returns-api", true], ["storefront", false]]);
    expect(snapshot.settings.fieldErrors).toEqual({});

    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true, previewId: start.previewId })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length > 0, 60_000);
    const record = recordOf(f);
    expect(record.settings.workspaceFolder).toBe(workspace);
    const entries = Object.fromEntries(record.repositories.map(entry => [entry.name, entry]));
    expect(entries.product).toMatchObject({ runStartCommit: productTip, adoptedWorktree: true, worktreePath: join(workspace, "product") });
    expect(entries["returns-api"]).toMatchObject({ adoptedWorktree: true, worktreePath: join(workspace, "returns-api") });
    expect(entries.storefront!.runStartCommit).toBeUndefined();
    expect(entries.storefront).toMatchObject({ worktreePath: join(workspace, "storefront"), setupCompletedAt: expect.any(String) });
    // storefront's branch was cut from its own base.
    expect(git(f.sandbox, join(workspace, "storefront"), "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe(BRANCH);
    const [call] = readJsonLines<{ prompt: string; cwd: string }>(`${f.scenarioPath}.calls.jsonl`);
    expect(call!.prompt).toContain("phase-2b-store-credit.md");
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });
});

describe("a repository only the chosen branch's plan names (run restart AC-FROM-05, Which repositories)", () => {
  it("lists it with its base, sets it up at Start, and leaves out a repository only the checkout's plan names", async () => {
    // The checkout's plan names returns-api alone; on the branch, phase 3 names notifications instead.
    const f = createWorkspaceFeature([{ noInit: true, actions: [] }], { "phase-1-return-intake.md": "**Repositories:** returns-api" });
    git(f.sandbox, f.product, "switch", "-q", "-c", BRANCH);
    const doc = join(f.product, "docs", "prds", FOLDER, "phase-3-returns-dashboard.md");
    const [title, ...rest] = readFileSync(doc, "utf8").split("\n");
    writeFileSync(doc, [title, "", "**Repositories:** notifications", ...rest].join("\n"));
    const phase1 = join(f.product, "docs", "prds", FOLDER, "phase-1-return-intake.md");
    writeFileSync(phase1, readFileSync(phase1, "utf8").replace("**Repositories:** returns-api", ""));
    git(f.sandbox, f.product, "commit", "-q", "-am", "docs: the dashboard needs notifications");
    git(f.sandbox, f.product, "push", "-q", "-u", "origin", BRANCH);
    git(f.sandbox, f.product, "switch", "-q", "develop");

    const kiln = startKiln(f);
    const address = await kiln.address;
    const token = await tokenOf(address);
    expect((await api(address, token, "POST", "/api/settings", { start: { from: "existing", bringUpToDate: true } })).status).toBe(200);
    const snapshot = await snapshotOf(address, token);
    expect(snapshot.feature.multiRepository).toBe(true);
    expect(snapshot.repositories.map(row => [row.name, row.baseBranch])).toEqual([["product", "develop"], ["notifications", "main"]]);
    expect(snapshot.settings.fieldErrors).toEqual({});
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true, previewId: snapshot.documents!.start!.previewId })).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => readJsonLines(`${f.scenarioPath}.calls.jsonl`).length > 0, 60_000);
    const record = recordOf(f);
    expect(record.repositories.filter(entry => entry.setupCompletedAt).map(entry => entry.name)).toEqual(["product", "notifications"]);
    expect(record.repositories.find(entry => entry.name === "notifications")).toMatchObject({ baseBranch: "main" });
    kiln.signals.emit("SIGINT");
    await kiln.done;
  });
});
