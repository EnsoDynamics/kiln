// `kiln run` on a feature not started, as a person uses it: the terminal lines, the browser view
// it serves and opens, Start pressed through the view's API, the phases worked through in the
// terminal, and Kiln staying in the foreground until Ctrl+C. Real git throughout, with origin
// reached as github.com through an SSH stand-in, and the stand-in claude and gh.

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auditWorkflow from "./audit/workflow.js";
// These pre-existing transport/repository tests isolate the already-current audit gate.
// Audit workflow integration and installed-provider proofs exercise real gates separately.
beforeEach(() => { vi.spyOn(auditWorkflow, "auditNext").mockResolvedValue("final_delivery"); });
afterEach(() => { vi.restoreAllMocks(); });
import type { Snapshot } from "./engine/snapshot.js";
import { runKilnCommand } from "./kiln-command.js";
import { openBrowser, type BrowserOpening } from "./platform/open-browser.js";
import { readPrdRecord } from "./state/records.js";
import { prdStateDirectory, readJsonLines, stateRoot } from "./state/state-files.js";
import { landingSession, pullRequestSession, waitFor, type ScenarioSession } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, installStandIns, type Sandbox } from "./test-support/git-repositories.js";
import { reservePortRange } from "./test-support/os-ports.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const time = String.raw`[ \d]\d:\d\d`;
/**
 * Each PRD's port, reserved from the operating system for each test; two tests serve two PRDs at
 * once. A one-port range per PRD, because a range of neighbours collides on macOS, so here the
 * checks that two PRDs get different ports and keep them only confirm the range reaches Kiln.
 * Assigning and keeping ports is proved in `state/instance-lock.integration.test.ts`.
 */
let PORTS: Record<string, string> = {};
beforeEach(async () => { PORTS = { [FOLDER]: await reservePortRange(), "gift-cards": await reservePortRange() }; });

interface Feature {
  sandbox: Sandbox;
  repository: string;
  env: NodeJS.ProcessEnv;
  scenarioPath: string;
}

let feature: Feature | undefined;
afterEach(() => feature?.sandbox.cleanup());

/**
 * Records every socket this process opens to anything but this machine, until `stop()`. Kiln
 * runs in this process here, so this is Kiln's own network use (AC-INSTALL-02); what `git`, `gh`
 * and `claude` send happens in their own processes.
 */
function recordOffMachineConnections(): { hosts: string[]; stop: () => void } {
  const hosts: string[] = [];
  const real = Socket.prototype.connect;
  const local = (host: string) => host === "localhost" || host === "::1" || host.startsWith("127.");
  Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
    // net.connect() hands the socket its arguments already normalized, as one array.
    const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
    // connect(path) is a local pipe or socket file; connect(port, host) and connect({ host }) default to localhost.
    const host = typeof first === "string" ? "localhost" : typeof first === "number" ? (typeof second === "string" ? second : "localhost") : ((first as { path?: string; host?: string }).path ? "localhost" : ((first as { host?: string }).host ?? "localhost"));
    if (!local(host)) hosts.push(host);
    return real.apply(this, args as Parameters<typeof real>);
  } as typeof real;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    Socket.prototype.connect = real;
  };
  afterEach(stop);
  return { hosts, stop };
}

/** A repository whose origin is "on GitHub", the fixture PRD pushed to develop, and the stand-ins. */
function createFeature(sessions: ScenarioSession[], folders = [FOLDER]): Feature {
  const sandbox = createSandbox();
  const origin = createGithubOrigin(sandbox, "acme", "acme-shop");
  const repository = createRepository(sandbox, "acme-shop", origin.url);
  for (const folder of folders) {
    const files = Object.fromEntries(Object.entries(prdDirectoryFiles()).map(([name, text]) => [name === `${FOLDER}-prd.md` ? `${folder}-prd.md` : name, text]));
    commitFiles(sandbox, repository, `docs/prds/${folder}`, files);
  }
  git(sandbox, repository, "push", "-q", "origin", "develop");
  const bin = join(sandbox.root, "bin");
  installStandIns(bin);
  const scenarioPath = join(sandbox.root, "scenario.json");
  const ghStatePath = join(sandbox.root, "gh-state.json");
  writeFileSync(scenarioPath, JSON.stringify({ sessions }));
  writeFileSync(ghStatePath, JSON.stringify({ pulls: [] }));
  const base = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  const env = { ...base, PATH: [bin, sandbox.env.PATH ?? sandbox.env.Path ?? ""].join(delimiter), KILN_STANDIN_SCENARIO: scenarioPath, KILN_STANDIN_GH_STATE: ghStatePath, KILN_PORT_RANGE: PORTS[FOLDER] };
  feature = { sandbox, repository, env, scenarioPath };
  return feature;
}

interface RunningKiln {
  done: Promise<number>;
  stdout(): string;
  lines(): string[];
  signals: EventEmitter;
  address: Promise<string>;
  opened: string[];
  finished(): boolean;
}

function startKiln(f: Feature, folder = FOLDER, openBrowser?: (address: string) => Promise<BrowserOpening>): RunningKiln {
  let stdout = "";
  const signals = new EventEmitter();
  const opened: string[] = [];
  let resolveAddress!: (address: string) => void;
  const address = new Promise<string>((resolve) => (resolveAddress = resolve));
  let finished = false;
  const done = runKilnCommand(["run", `docs/prds/${folder}/`], {
    cwd: f.repository,
    env: { ...f.env, KILN_PORT_RANGE: PORTS[folder] ?? f.env.KILN_PORT_RANGE },
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stdout += text) },
    signals,
    openBrowser: async (at) => {
      opened.push(at);
      return openBrowser ? openBrowser(at) : { kind: "opened" };
    },
    onServing: resolveAddress,
  }).finally(() => (finished = true));
  // A runner whose logind refuses keep-awake adds Kiln's one honest error line for it; these tests aren't about it.
  const lines = () => stdout.split("\n").filter((line) => line !== "" && !line.startsWith("✗ Can’t keep this computer awake"));
  return { done, stdout: () => stdout, lines, signals, address, opened, finished: () => finished };
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

function stateDirectoryOf(f: Feature, folder = FOLDER): string {
  return prdStateDirectory(stateRoot(f.env), f.repository, "acme-shop", `docs/prds/${folder}`);
}

/** Opens the view's event stream, as a tab does on load; its snapshots collect in `snapshots`. */
async function connectView(address: string, token: string) {
  const abort = new AbortController();
  const response = await fetch(`${new URL(address).origin}/api/events?token=${token}`, { signal: abort.signal });
  const snapshots: Snapshot[] = [];
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (/^event: snapshot$/m.test(block)) snapshots.push(JSON.parse(/^data: (.*)$/m.exec(block)![1]!));
        }
      }
    } catch {
      // Closed.
    }
  })();
  return { snapshots, close: () => abort.abort() };
}

async function tokenFromPage(address: string): Promise<{ token: string; html: string }> {
  const html = await (await fetch(address)).text();
  return { token: /<meta name="kiln-token" content="([0-9a-f]+)">/.exec(html)![1]!, html };
}

describe("kiln run on a feature not started", () => {
  it("prints what it found and the address, opens the view on Documents found, and starts nothing until Start", async () => {
    const f = createFeature([landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218)]);
    const network = recordOffMachineConnections();
    const kiln = startKiln(f);
    const address = await kiln.address;
    await waitFor(() => kiln.lines().length >= 3);

    // AC-START-09: the feature name, what Kiln found, the address, and to keep the terminal open.
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/customer-returns$/);
    expect(new URL(address).port).toBe(PORTS[FOLDER]!.split("-")[0]);
    expect(kiln.lines().slice(0, 3)).toEqual([
      "Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed",
      `● Opened ${address}. Review it there and press Start.`,
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    // AC-START-03: Kiln opens the browser itself, on the view's one address.
    expect(kiln.opened).toEqual([address]);

    // The record is written when Documents found is served, with the default settings (AC-START-07, UI-004).
    const record = readPrdRecord(stateDirectoryOf(f))!;
    expect(record.startedAt).toBeUndefined();
    expect(record.settings).toMatchObject({ featureBranch: "feature/customer-returns", baseBranch: "develop", agentId: "claude_code", agentChoices: { claude_code: { model: "opus", effort: "high" } }, keepAwake: true });
    expect(record.repository.github).toBe("acme/acme-shop");

    // AC-MULTI-02: the tab's title names the feature.
    const { token, html } = await tokenFromPage(address);
    expect(html).toContain("<title>Customer returns · Kiln</title>");

    // What Kiln found, the settings and the account reach the view (AC-START-04, AC-START-06, AC-WATCH-08's Documents found line).
    // A view connecting runs the base check against origin.
    const view = await connectView(address, token);
    await waitFor(() => view.snapshots.length > 0);
    await waitFor(async () => {
      const snapshot = (await api(address, token, "GET", "/api/snapshot")).body as { account?: unknown; models?: unknown; settings: { baseCheck?: string; metadataPending?: boolean } };
      return snapshot.account !== undefined && snapshot.models !== undefined && snapshot.settings.baseCheck === "ok" && snapshot.settings.metadataPending === false;
    });
    const snapshot = (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;
    expect(snapshot.feature).toMatchObject({ name: "Customer returns", repositoryName: "acme-shop", prdFolder: "docs/prds/customer-returns/", state: "not_started" });
    expect(snapshot.documents).toMatchObject({
      prd: { file: "customer-returns-prd.md", criteriaCount: 4, firstLabel: "AC-RET-01", lastLabel: "AC-DASH-01" },
      design: { file: "technical-design.md", criteriaCited: 4 },
      assumptions: { file: "assumptions.md", total: 4, notYetConfirmed: 2 },
      plan: { phaseDocCount: 5, leafCount: 4, closedCount: 1 },
    });
    expect(snapshot.documents!.plan.phases).toEqual([
      { id: "1", title: "Return intake", closed: false, repositories: [] },
      { id: "2", title: "Refunds", splitInto: ["2a", "2b"], closed: false, repositories: [] },
      { id: "2a", title: "Card refunds", closed: true, repositories: [] },
      { id: "2b", title: "Store credit", closed: false, repositories: [] },
      { id: "3", title: "Returns dashboard", closed: false, repositories: [] },
    ]);
    expect(snapshot.documents!.checks).toEqual([
      { name: "Every phase cites its criteria", passed: true },
      { name: "Dependencies point backward", passed: true },
      { name: "Working tree is clean", passed: true },
    ]);
    expect(snapshot.settings).toMatchObject({
      agent: "Claude Code",
      model: { value: "opus", displayName: "Opus 5.5" },
      effort: "high",
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
      worktreePath: expect.stringMatching(/\.worktrees[/\\]customer-returns[/\\]acme-shop$/),
      featureBranch: "feature/customer-returns",
      baseBranch: "develop",
      baseBranches: ["develop"],
      // A one-repository PRD's workspace folder is the default, fixed and not shown (multi-repo AC-SPACE-03).
      fixed: { workspaceFolder: true, featureBranch: false, worktreePath: false },
      fieldErrors: {},
    });
    expect(snapshot.repositories).toEqual([
      { name: "acme-shop", github: "github.com/acme/acme-shop", kind: "prd", baseBranch: "develop", baseBranches: ["develop"], baseCheck: "ok", worktreePath: snapshot.settings.worktreePath, fixed: false, fieldErrors: {} },
    ]);
    expect(snapshot.models!.map((model) => model.displayName)).toEqual(["Opus 5.5", "Fable 5.1", "Sonnet 5.5", "Haiku 5.5"]);
    expect(snapshot.account).toMatchObject({ email: "alex@acme-shop.dev", plan: "Max plan" });
    expect(snapshot.account!.limits.map((limit) => `${limit.shortLabel} ${limit.percent}%`)).toEqual(["5-hour 5%", "weekly 42%", "Fable 0%"]);

    // AC-BILL-03 brackets usage; AC-RUN-01 also reads required readiness in the launch context.
    await waitFor(async () => {
      const latest = await api(address, token, "GET", "/api/snapshot");
      return !!(latest.body as unknown as Snapshot).billing?.next && !(latest.body as unknown as Snapshot).billing?.pending;
    });
    const helpers = readJsonLines<{ kind: string; cwd: string }>(`${f.scenarioPath}.helpers.jsonl`);
    expect(helpers.map((call) => call.kind).sort()).toEqual(["account", "account", "account", "models", "models", "skills", "skills", "usage"]);
    expect(helpers.filter(call => call.kind === "account" && call.cwd === f.repository)).toHaveLength(1);
    expect(helpers.filter(call => call.kind === "account" && call.cwd === stateDirectoryOf(f))).toHaveLength(2);
    for (const call of helpers.filter(call => call.kind !== "account")) expect(call.cwd).toBe(call.kind === "skills" ? f.repository : stateDirectoryOf(f));

    // Nothing has started (AC-START-03): no session, no branch, no worktree.
    expect(existsSync(`${f.scenarioPath}.calls.jsonl`)).toBe(false);
    expect(git(f.sandbox, f.repository, "branch", "--list", "feature/*")).toBe("");

    // Settings change before Start, and are saved as they are made (AC-START-06).
    expect((await api(address, token, "POST", "/api/settings", { agentId: "claude_code", selectionGeneration: 0, effort: "max", keepAwake: false })).status).toBe(200);
    const badBranch = await api(address, token, "POST", "/api/settings", { featureBranch: "no..dots" });
    expect((badBranch.body.settings as { fieldErrors: unknown }).fieldErrors).toEqual({ featureBranch: "That isn’t a valid branch name." });
    await api(address, token, "POST", "/api/settings", { featureBranch: "feature/returns" });
    expect(readPrdRecord(stateDirectoryOf(f))!.settings).toMatchObject({ agentChoices: { claude_code: { effort: "max" } }, keepAwake: false, featureBranch: "feature/returns" });

    // Start stays unavailable until the person confirms refinement (AC-START-05).
    expect(await api(address, token, "POST", "/api/start", {})).toEqual({ status: 400, body: { ok: false, reason: "Confirm the documents have been through requirements refinement first." } });
    expect(existsSync(`${f.scenarioPath}.calls.jsonl`)).toBe(false);

    // Closing the browser has no effect on Kiln (AC-KEEP-01): the view's tab goes away before Start.
    view.close();

    const started = await api(address, token, "POST", "/api/start", { refinementConfirmed: true });
    expect(started).toEqual({ status: 200, body: { ok: true } });
    await waitFor(() => kiln.lines().some((line) => line.includes("opened #218")), 40_000);

    // AC-START-09: one line when the PRD starts and one each time a phase starts or is done.
    const working = kiln.lines().slice(3);
    expect(working[0]).toMatch(new RegExp(`^${time}  Started  ·  feature/returns from develop$`));
    expect(working.slice(1)).toEqual([
      expect.stringMatching(new RegExp(`^${time}  1   Return intake      started$`)),
      expect.stringMatching(new RegExp(`^${time}  1   Return intake      done · pushed [0-9a-f]{7}$`)),
      expect.stringMatching(new RegExp(`^${time}  2b  Store credit       started$`)),
      expect.stringMatching(new RegExp(`^${time}  2b  Store credit       done · pushed [0-9a-f]{7}$`)),
      expect.stringMatching(new RegExp(`^${time}  3   Returns dashboard  started$`)),
      expect.stringMatching(new RegExp(`^${time}  3   Returns dashboard  done · pushed [0-9a-f]{7}$`)),
      expect.stringMatching(new RegExp(`^${time}  PR  Final pull request  started$`)),
      expect.stringMatching(new RegExp(`^${time}  PR  Final pull request  opened #218$`)),
    ]);
    // The settings chosen before Start are the ones the sessions ran with.
    const calls = readJsonLines<{ args: string[] }>(`${f.scenarioPath}.calls.jsonl`);
    expect(calls[0]!.args.join(" ")).toContain("--model opus --effort max");

    // AC-KEEP-01: Kiln stays in the foreground after the pull request is ready, until Ctrl+C.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(kiln.finished()).toBe(false);
    expect((await fetch(address)).status).toBe(200);
    // A view opened again shows the feature as it now stands.
    const reopened = await connectView(address, token);
    await waitFor(() => reopened.snapshots.length > 0);
    expect(reopened.snapshots[0]!.feature.state).toBe("complete");
    reopened.close();
    kiln.signals.emit("SIGINT");
    expect(await kiln.done).toBe(130);
    expect(kiln.lines().at(-1)).toBe("Kiln stopped. Customer returns is complete.");
    // The server closes with Kiln, and the instance lock is released.
    await expect(fetch(address)).rejects.toThrow();
    expect(existsSync(join(stateDirectoryOf(f), "instance.lock"))).toBe(false);
    // From kiln run to Complete, Kiln itself connected to nothing off this machine (AC-INSTALL-02).
    network.stop();
    expect(network.hosts).toEqual([]);
  });

  it("stops on Ctrl+C at Documents found with nothing started, closing the view", async () => {
    const f = createFeature([]);
    const kiln = startKiln(f);
    const address = await kiln.address;
    await waitFor(() => kiln.lines().length >= 3);
    kiln.signals.emit("SIGINT");
    expect(await kiln.done).toBe(130);
    expect(kiln.lines().at(-1)).toBe("Kiln stopped. Nothing was started.");
    await expect(fetch(address)).rejects.toThrow();
    expect(git(f.sandbox, f.repository, "branch", "--list", "feature/*")).toBe("");
  });

  it("gives the address and says why when the browser opener fails", async () => {
    const f = createFeature([]);
    const kiln = startKiln(f, FOLDER, async () => ({ kind: "failed", reason: "xdg-open exited with code 3" }));
    const address = await kiln.address;
    await waitFor(() => kiln.lines().length >= 4);
    expect(kiln.lines().slice(1, 4)).toEqual([
      `● Kiln’s view is at ${address}. Review it there and press Start.`,
      `✗ Couldn’t open the browser: xdg-open exited with code 3. Open ${address} yourself.`,
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    kiln.signals.emit("SIGINT");
    expect(await kiln.done).toBe(130);
  });

  it("says where the view is, with no error, when the machine has no browser opener", async () => {
    const f = createFeature([]);
    const kiln = startKiln(f, FOLDER, (at) => openBrowser(at, { PATH: f.sandbox.root }, "linux"));
    const address = await kiln.address;
    await waitFor(() => kiln.lines().length >= 3);
    expect(kiln.lines().slice(1, 3)).toEqual([
      `● Kiln’s view is at ${address}. Open it in your browser and press Start.`,
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    kiln.signals.emit("SIGINT");
    expect(await kiln.done).toBe(130);
  });

  it("over SSH, opens no browser and says to reach the view through a tunnel to the same port", async () => {
    const f = createFeature([]);
    const kiln = startKiln(f, FOLDER, (at) => openBrowser(at, { PATH: f.sandbox.root, SSH_CONNECTION: "203.0.113.5 52114 198.51.100.7 22" }, "linux"));
    const address = await kiln.address;
    const port = new URL(address).port;
    await waitFor(() => kiln.lines().length >= 4);
    expect(kiln.lines().slice(1, 4)).toEqual([
      `● Kiln’s view is at ${address} on this remote machine. Open it from your own computer through an SSH tunnel to port ${port}, then press Start.`,
      `  For example: ssh -N -L ${port}:127.0.0.1:${port} <this host>`,
      "  Kiln works in this terminal, so keep it open. Ctrl+C interrupts; kiln run picks it back up.",
    ]);
    kiln.signals.emit("SIGINT");
    expect(await kiln.done).toBe(130);
  });

  it("moves two PRDs of one repository forward at once, each in its own worktree, to its own pull request", async () => {
    // AC-MULTI-01: each instance has its own sessions (its own scenario for the stand-in claude).
    const f = createFeature([landingSession("src/returns-1.txt"), landingSession("src/returns-2.txt"), landingSession("src/returns-3.txt"), pullRequestSession(218)], [FOLDER, "gift-cards"]);
    const giftScenario = join(f.sandbox.root, "gift-scenario.json");
    writeFileSync(giftScenario, JSON.stringify({ sessions: [landingSession("src/gifts-1.txt"), landingSession("src/gifts-2.txt"), landingSession("src/gifts-3.txt"), pullRequestSession(219)] }));
    const returns = startKiln(f, FOLDER);
    // Its own gh state too: the stand-in rewrites its file whole, so two sessions sharing one could lose a pull request.
    const giftGhState = join(f.sandbox.root, "gift-gh-state.json");
    writeFileSync(giftGhState, JSON.stringify({ pulls: [] }));
    const gifts = startKiln({ ...f, env: { ...f.env, KILN_STANDIN_SCENARIO: giftScenario, KILN_STANDIN_GH_STATE: giftGhState } }, "gift-cards");
    const addresses = await Promise.all([returns.address, gifts.address]);
    const pressed = await Promise.all(
      addresses.map(async (address) => {
        const { token } = await tokenFromPage(address);
        return api(address, token, "POST", "/api/start", { refinementConfirmed: true });
      }),
    );
    expect(pressed.map((answer) => answer.status)).toEqual([200, 200]);
    await waitFor(() => returns.lines().some((line) => line.includes("opened #218")) && gifts.lines().some((line) => line.includes("opened #219")), 60_000).catch((error: Error) => {
      throw new Error(`${error.message}\nCustomer returns:\n${returns.stdout()}\nGift cards:\n${gifts.stdout()}`);
    });
    // Neither PRD touched the other's branch.
    const files = (branch: string) => git(f.sandbox, f.repository, "ls-tree", "-r", "--name-only", branch);
    expect(files("feature/customer-returns")).toContain("src/returns-3.txt");
    expect(files("feature/customer-returns")).not.toContain("src/gifts-1.txt");
    expect(files("feature/gift-cards")).toContain("src/gifts-3.txt");
    expect(files("feature/gift-cards")).not.toContain("src/returns-1.txt");
    for (const kiln of [returns, gifts]) kiln.signals.emit("SIGINT");
    expect(await Promise.all([returns.done, gifts.done])).toEqual([130, 130]);
  }, 120_000);

  it("stops during Start's setup with the engine's own line, and refuses Start and the fixed fields while setup runs", async () => {
    const f = createFeature([landingSession()]);
    // git worktree add runs the repository's post-checkout hook, which holds the setup here.
    const release = join(f.sandbox.root, "release-setup").replace(/\\/g, "/");
    const reached = join(f.sandbox.root, "setup-reached").replace(/\\/g, "/");
    writeFileSync(join(f.repository, ".git", "hooks", "post-checkout"), `#!/bin/sh\ntouch '${reached}'\nwhile [ ! -f '${release}' ]; do sleep 0.1; done\n`, { mode: 0o755 });
    const kiln = startKiln(f);
    const address = await kiln.address;
    const { token } = await tokenFromPage(address);
    const start = api(address, token, "POST", "/api/start", { refinementConfirmed: true }).catch(() => undefined);
    await waitFor(() => existsSync(reached));
    const snapshot = (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;
    expect(snapshot.documents!.starting).toBe(true);
    expect(await api(address, token, "POST", "/api/start", { refinementConfirmed: true })).toEqual({ status: 409, body: { ok: false, reason: "Kiln isn't waiting for Start." } });
    expect(await api(address, token, "POST", "/api/settings", { featureBranch: "feature/other" })).toMatchObject({ status: 409 });

    kiln.signals.emit("SIGINT");
    writeFileSync(release, "");
    expect(await kiln.done).toBe(130);
    await start;
    expect(kiln.lines().at(-1)).toBe("Kiln stopped before phase 1 started. kiln run picks it back up.");
    expect(existsSync(`${f.scenarioPath}.calls.jsonl`)).toBe(false);
  });

  it("returns to Documents found with git's error when the next kiln run can't finish the setup", async () => {
    const f = createFeature([]);
    const first = startKiln(f);
    await first.address;
    first.signals.emit("SIGINT");
    await first.done;
    // A Start whose setup can't be finished: the commit it recorded to start from doesn't exist.
    const recordPath = join(stateDirectoryOf(f), "prd.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    const entry = { name: "acme-shop", kind: "prd", mainCheckoutPath: record.repository.mainCheckoutPath, github: record.repository.github, baseBranch: "develop", worktreePath: record.settings.worktreePath, baseCommit: "0".repeat(40) };
    writeFileSync(recordPath, JSON.stringify({ ...record, startedAt: "2026-10-17T13:00:00.000Z", refinementConfirmedAt: "2026-10-17T13:00:00.000Z", repositories: [entry] }));

    const again = startKiln(f);
    const address = await again.address;
    await waitFor(() => again.lines().some((line) => line.startsWith("● Opened")));
    expect(again.lines()[0]).toMatch(/^✗ Couldn’t set up the worktree: /);
    expect(again.lines()[1]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed");
    const { token } = await tokenFromPage(address);
    const snapshot = (await api(address, token, "GET", "/api/snapshot")).body as unknown as Snapshot;
    expect(snapshot.feature.state).toBe("not_started");
    expect(snapshot.documents!.startError).toMatch(/^Couldn’t set up the worktree: /);
    expect(readPrdRecord(stateDirectoryOf(f))!.startedAt).toBeUndefined();
    again.signals.emit("SIGINT");
    expect(await again.done).toBe(130);
  });

  it("serves each PRD its own view at its own address, and a PRD keeps its address the next time", async () => {
    // AC-MULTI-01, AC-MULTI-02: two instances at once, in one repository.
    const f = createFeature([], [FOLDER, "gift-cards"]);
    const returns = startKiln(f, FOLDER);
    const gifts = startKiln(f, "gift-cards");
    const [returnsAddress, giftsAddress] = await Promise.all([returns.address, gifts.address]);
    expect(new URL(returnsAddress).port).not.toBe(new URL(giftsAddress).port);
    expect(new URL(giftsAddress).pathname).toBe("/gift-cards");
    expect((await tokenFromPage(returnsAddress)).html).toContain("<title>Customer returns · Kiln</title>");
    expect((await tokenFromPage(giftsAddress)).html).toContain("<title>Gift cards · Kiln</title>");
    // Neither instance answers at the other's address.
    expect((await fetch(`${new URL(returnsAddress).origin}/gift-cards`)).status).toBe(404);
    // Each prints its own address.
    await waitFor(() => returns.lines().length >= 2 && gifts.lines().length >= 2);
    expect(returns.lines()[1]).toContain(returnsAddress);
    expect(gifts.lines()[1]).toContain(giftsAddress);

    returns.signals.emit("SIGINT");
    expect(await returns.done).toBe(130);
    const again = startKiln(f, FOLDER);
    expect(await again.address).toBe(returnsAddress);
    for (const kiln of [again, gifts]) kiln.signals.emit("SIGINT");
    expect(await Promise.all([again.done, gifts.done])).toEqual([130, 130]);
  });

  it("reopens Documents found with the settings saved before a Ctrl+C", async () => {
    const f = createFeature([]);
    const first = startKiln(f);
    const address = await first.address;
    const { token } = await tokenFromPage(address);
    await api(address, token, "POST", "/api/settings", { agentId: "claude_code", selectionGeneration: 0, effort: "low" });
    first.signals.emit("SIGINT");
    await first.done;

    const second = startKiln(f);
    const reopened = await second.address;
    expect(reopened).toBe(address);
    // The token is kept per PRD, so a tab left open keeps working after kiln run restarts.
    const snapshot = (await api(reopened, token, "GET", "/api/snapshot")).body as { settings: { effort: string } };
    expect(snapshot.settings.effort).toBe("low");
    second.signals.emit("SIGINT");
    await second.done;
  });
});

describe("the built kiln command", () => {
  // A terminal's Ctrl+C reaches Kiln as SIGINT; on Windows the in-process tests above stand in for it.
  it.skipIf(process.platform === "win32")("stays in the foreground at Documents found until Ctrl+C", async () => {
    const f = createFeature([]);
    const child = spawn(process.execPath, [cli, "run", `docs/prds/${FOLDER}`], { cwd: f.repository, env: { ...f.env, KILN_NO_BROWSER: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout!.setEncoding("utf8").on("data", (text: string) => (stdout += text));
    const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
    await waitFor(() => stdout.includes("Kiln works in this terminal"));
    const address = /● Opened (\S+)\. Review/.exec(stdout)![1]!;
    expect((await fetch(address)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(child.exitCode).toBeNull();
    child.kill("SIGINT");
    expect(await exited).toBe(130);
    expect(stdout.trimEnd().split("\n").at(-1)).toBe("Kiln stopped. Nothing was started.");
    expect(readFileSync(join(stateDirectoryOf(f), "prd.json"), "utf8")).toContain('"featureBranch": "feature/customer-returns"');
  });
});
