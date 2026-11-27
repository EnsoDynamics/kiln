// The home screen (Kiln Requirements Stages AC-HOME-01 to 13; technical design "The Home
// Screen"): `kiln new`, or `kiln` with nothing named, starts a Kiln process with no engine for the
// repository it was run in, or for each repository directly inside a folder that isn't one. It
// serves the view at `/home`, keeps the list current from a cheap fingerprint read every 5
// seconds, and opens each item in a Kiln of its own, started as a child of its terminal. Ctrl+C
// stops the home screen and every Kiln it started. Apart from the plan read, it starts no session
// and changes no run.

import { spawn, type ChildProcess } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { enumerateWork, privateJson, type SavedWork } from "../control/private-state.js";
import { probeRun } from "../control/client.js";
import { runGit } from "../engine/git-reads.js";
import { findExecutable } from "../platform/helper-process.js";
import { openBrowser, type BrowserOpening } from "../platform/open-browser.js";
import { findFailure, readPlanFile, updatePlanFile } from "../requirements/plan.js";
import { SECURITY_HEADERS, TOKEN_HEADER } from "../server/local-server.js";
import { takeInstanceLock, viewAddress, PORT_RANGE, type InstanceLockContent } from "../state/instance-lock.js";
import { ensurePrivateDirectory, newToken, prdStateDirectory, stateRoot } from "../state/state-files.js";
import { readPlanForHome } from "./home-plan.js";
import { repositoriesIn, scanRepository, type HomeItem, type RepositoryScan } from "./scan.js";
import type { CommandContext } from "../kiln-command.js";

/** The home list the page shows (technical design, "Snapshot", the home list). */
export interface HomeList {
  scope: { kind: "repository" | "folder"; name: string; sharedBranch?: string; repositories: string[]; nothingFound: string[] };
  plan: { status: "reading" | "read" | "failed" | "none"; failure?: string; waitsForBilling?: true };
  underWay: HomeItem[];
  ready: HomeItem[];
  notReady: HomeItem[];
  folded: HomeItem[];
}

export interface HomeScope { kind: "repository" | "folder"; path: string; name: string; repositories: { name: string; path: string }[] }

/** How often the fingerprint is read (technical design, "Keeping the home list current"). */
const FINGERPRINT_MS = 5_000;
const HEARTBEAT_MS = 5_000;
/** How long a Kiln started for an item has to name its port. */
const CHILD_READY_MS = 60_000;

/** The repository the folder is in, found from any folder inside it, else the folder with the repositories directly inside it (AC-HOME-08, AC-HOME-09). */
export async function homeScope(cwd: string, git: string, env: NodeJS.ProcessEnv): Promise<HomeScope> {
  const context = { git, env };
  const listed = await runGit(context, cwd, ["worktree", "list", "--porcelain"]);
  const first = listed.exitCode === 0 ? /^worktree (.+)$/m.exec(listed.stdout)?.[1] : undefined;
  if (first) {
    const top = await runGit(context, first.trim(), ["rev-parse", "--show-toplevel"]);
    const main = realpathSync.native(resolve(top.exitCode === 0 ? top.stdout.trim() : first.trim()));
    return { kind: "repository", path: main, name: basename(main), repositories: [{ name: basename(main), path: main }] };
  }
  const folder = realpathSync.native(cwd);
  return { kind: "folder", path: folder, name: basename(folder), repositories: repositoriesIn(folder).map(one => ({ ...one, path: realpathSync.native(one.path) })) };
}

/** One list across the scope's repositories (AC-HOME-09): each line names its repository, and those with nothing found are named. */
export async function buildHomeList(scope: HomeScope, env: NodeJS.ProcessEnv, git: string, plan: HomeList["plan"]): Promise<HomeList> {
  const works = enumerateWork(env).work;
  const scans: RepositoryScan[] = [];
  for (const repository of scope.repositories) {
    const own = works.filter(work => resolve(work.record.repository.mainCheckoutPath) === repository.path);
    scans.push(await scanRepository({ git: { git, env }, repository, works: own, probe: work => probeRun(work) }));
  }
  const shared = new Set(scans.map(scan => scan.sharedBranch));
  const all = (key: "underWay" | "ready" | "notReady" | "folded") => scans.flatMap(scan => scan[key]);
  const underWay = all("underWay").sort((a, b) => Number(!!b.waitsForYou) - Number(!!a.waitsForYou) || (b.lastChanged ?? "").localeCompare(a.lastChanged ?? ""));
  const folded = all("folded").sort((a, b) => (b.lastChanged ?? "").localeCompare(a.lastChanged ?? ""));
  const empty = (scan: RepositoryScan) => !scan.underWay.length && !scan.ready.length && !scan.notReady.length && !scan.folded.length;
  const only = [...shared][0];
  return {
    scope: { kind: scope.kind, name: scope.name, ...(shared.size === 1 && only ? { sharedBranch: only } : {}), repositories: scope.repositories.map(one => one.name), nothingFound: scans.filter(empty).map(scan => scan.name) },
    plan, underWay, ready: all("ready"), notReady: all("notReady"), folded,
  };
}

/** A cheap read that changes whenever the list could: each repository's refs and the status of the folders it lists, Kiln's records, each running Kiln's state. */
async function fingerprint(scope: HomeScope, env: NodeJS.ProcessEnv, git: string): Promise<string> {
  const hash = createHash("sha256");
  for (const repository of scope.repositories) {
    const refs = await runGit({ git, env }, repository.path, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/", "refs/remotes/origin/"]);
    const status = await runGit({ git, env }, repository.path, ["status", "--porcelain", "--untracked-files=all", "--", "source-material", "docs/prds", "docs/changes", "docs/initiatives"]);
    const worktrees = await runGit({ git, env }, repository.path, ["worktree", "list", "--porcelain"]);
    hash.update(refs.stdout).update(status.stdout).update(worktrees.stdout);
  }
  const root = stateRoot(env);
  const works = enumerateWork(env).work;
  for (const work of works) {
    for (const file of ["prd.json", "instance.lock"]) {
      try { hash.update(`${work.directory}/${file}:${statSync(join(work.directory, file)).mtimeMs}`); } catch { hash.update(`${work.directory}/${file}:-`); }
    }
    if (existsSync(join(work.directory, "instance.lock"))) hash.update((await probeRun(work)).state);
  }
  try { hash.update(String(statSync(join(root, "requirements-plan.json")).mtimeMs)); } catch { /* No plan file yet. */ }
  return hash.digest("hex");
}

interface Child { process: ChildProcess; item: HomeItem }

/**
 * `kiln new`, or `kiln` with no arguments (AC-HOME-01). Returns the exit code.
 *
 *   await runHome(context)  // 130 after Ctrl+C
 */
export async function runHome(context: CommandContext, options: { viewDirectory?: string; kilnCommand?: string[]; childEnv?: NodeJS.ProcessEnv } = {}): Promise<number> {
  const git = findExecutable("git", context.env);
  if (!git) { context.stderr.write("kiln: git isn't on the PATH.\n"); return 1; }
  const scope = await homeScope(context.cwd, git, context.env);
  const root = stateRoot(context.env);
  const directory = join(root, "home", createHash("sha256").update(scope.path).digest("hex").slice(0, 8));
  ensurePrivateDirectory(directory);
  const tokenFile = join(directory, "token");
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, newToken(), { mode: 0o600 });
  const token = readFileSync(tokenFile, "utf8").trim();
  const range = context.env.KILN_PORT_RANGE ? (() => { const [first, last] = context.env.KILN_PORT_RANGE!.split("-").map(Number); return { first: first!, last: last! }; })() : PORT_RANGE;
  const lock = await takeInstanceLock(root, directory, { range });
  const open = context.openBrowser ?? ((address: string): Promise<BrowserOpening> => context.env.KILN_NO_BROWSER === "1" ? Promise.resolve({ kind: "opened" }) : openBrowser(address, context.env));
  if (!lock.taken) {
    if (lock.reason === "already_running") {
      // A second `kiln` for the same scope opens the first one's address and exits.
      const address = viewAddress(lock.port, "home");
      await open(address);
      context.stdout.write(`Kiln's home screen for ${scope.name} is already running at ${address}\n`);
      return 0;
    }
    context.stderr.write(lock.reason === "port_in_use" ? `kiln: port ${lock.port}, kept for this home screen, is in use by another program.\n` : `kiln: every port from ${range.first} to ${range.last} is in use.\n`);
    return 1;
  }

  const abort = new AbortController();
  const children = new Set<Child>();
  const streams = new Set<SSEStreamingApi>();
  let plan: HomeList["plan"] = { status: "none" };
  let list = await buildHomeList(scope, context.env, git, plan);
  let print = await fingerprint(scope, context.env, git);
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const rescan = async () => { list = await buildHomeList(scope, context.env, git, plan); publish(); };

  // The plan read the home screen starts when it opens, for each repository it lists (AC-PLAN-03).
  const readPlans = async (force = false) => {
    const tools = { claude: findExecutable("claude", context.env) ?? "claude", ...(findExecutable("codex", context.env) ? { codex: findExecutable("codex", context.env)! } : {}) };
    // Read again asks for a fresh read: the failures saved for it no longer hold it back.
    if (force) updatePlanFile(root, file => { for (const agent of Object.keys(file.failures)) file.failures[agent] = {}; });
    const outcomes: Awaited<ReturnType<typeof readPlanForHome>>[] = [];
    plan = { status: "reading" };
    void rescan();
    for (const repository of scope.repositories) {
      if (abort.signal.aborted) return;
      outcomes.push(await readPlanForHome({ repository: repository.path, tools, env: context.env, homeState: directory, signal: abort.signal }).catch(() => "unavailable" as const));
    }
    // One line for the scope: a failed read is shown first, then a wait for billing, then read.
    plan = outcomes.includes("failed") ? { status: "failed", ...planFailure(root) } : outcomes.includes("metered") ? { status: "none", waitsForBilling: true } : outcomes.some(one => one === "read" || one === "known") ? { status: "read" } : { status: "none" };
    await rescan();
  };
  void readPlans();

  const timer = setInterval(() => {
    void fingerprint(scope, context.env, git).then(async next => { if (next !== print) { print = next; await rescan(); } }).catch(() => undefined);
  }, FINGERPRINT_MS);
  timer.unref();

  const viewDirectory = options.viewDirectory ?? fileURLToPath(new URL("../../dist/view/", import.meta.url));
  const viewRoot = existsSync(viewDirectory) ? realpathSync.native(viewDirectory) : viewDirectory;
  const allowedHosts = new Set([`127.0.0.1:${lock.port}`, `localhost:${lock.port}`]);
  const app = new Hono();
  app.use("*", async (c, next) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (!allowedHosts.has(host)) return refuse(c, 403, "Kiln answers only at its own address.");
    if (c.req.path.startsWith("/api/")) {
      const given = c.req.header(TOKEN_HEADER) ?? (c.req.path === "/api/home/events" ? c.req.query("token") : undefined);
      if (!given || given.length !== token.length || !timingSafeEqual(Buffer.from(given), Buffer.from(token))) return refuse(c, 403, "This request doesn't carry Kiln's token.");
      if (c.req.method !== "GET" && c.req.header("origin") !== `http://${host}`) return refuse(c, 403, "This request comes from another site.");
    }
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
  });
  app.get("/api/home/events", (c) => streamSSE(c, async (stream) => {
    streams.add(stream);
    const send = () => void stream.writeSSE({ event: "home", data: JSON.stringify(list) });
    listeners.add(send);
    send();
    const heartbeat = setInterval(() => void stream.writeSSE({ event: "heartbeat", data: new Date().toISOString() }), HEARTBEAT_MS);
    await new Promise<void>((done) => stream.onAbort(done));
    clearInterval(heartbeat);
    listeners.delete(send);
    streams.delete(stream);
  }));
  app.get("/api/home/list", (c) => c.json(list));
  app.post("/api/home/open", async (c) => {
    const body = await c.req.json().catch(() => undefined) as { item?: unknown } | undefined;
    const item = [...list.underWay, ...list.ready, ...list.notReady, ...list.folded].find(one => one.id === body?.item);
    if (!item) return refuse(c, 404, "Kiln no longer lists that item. Reload the page.");
    try { return c.json({ ok: true, address: await ensureKiln(item) }); }
    catch (error) { return c.json({ ok: false, reason: (error as Error).message }, 502); }
  });
  app.post("/api/requirements-plan/read", async (c) => {
    if (plan.status === "reading") return refuse(c, 409, "Kiln is reading the plan now.");
    void readPlans(true);
    return c.json({ ok: true });
  });
  app.all("/api/*", (c) => refuse(c, 404, "No such API."));
  app.get("/assets/*", (c) => {
    const file = resolve(viewRoot, `.${c.req.path}`);
    if (!file.startsWith(viewRoot + sep) || !existsSync(file) || !statSync(file).isFile()) return c.text("Not found", 404);
    return c.body(readFileSync(file), 200, { "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
  });
  app.get("/home", (c) => {
    const index = join(viewRoot, "index.html");
    if (!existsSync(index)) return c.text("Kiln's browser view isn't built.", 500);
    const html = readFileSync(index, "utf8").replace("__KILN_TITLE__", () => `${escapeHtml(scope.name)} · Kiln`).replace("__KILN_TOKEN__", () => token).replace("__KILN_BASE__", () => "/home");
    return c.html(html);
  });
  app.get("/", (c) => c.redirect("/home", 302));
  app.all("*", (c) => c.text("Not found", 404));

  const server = await new Promise<Server>((done, reject) => {
    const started = serve({ fetch: app.fetch, port: lock.port, hostname: "127.0.0.1" }, () => done(started as Server));
    (started as Server).once("error", reject);
  });
  const address = viewAddress(lock.port, "home");

  /** Makes sure the item's Kiln is running and answers its address (technical design, "Opening an item"). */
  async function ensureKiln(item: HomeItem): Promise<string> {
    const work = findWork(context.env, item);
    const stateDirectory = work?.directory ?? prdStateDirectory(root, item.checkout, basename(item.checkout), item.path);
    const folder = basename(work?.record.origin?.path ?? item.path);
    const live = liveLock(stateDirectory);
    if (live) return viewAddress(live.port, folder);
    const command = options.kilnCommand ?? [process.execPath, fileURLToPath(new URL("../cli.js", import.meta.url))];
    const args = [...command.slice(1), "run", item.path, ...(item.branch ? ["--branch", item.branch] : []), "--no-open"];
    const child = spawn(command[0]!, args, { cwd: item.checkout, env: { ...context.env, ...options.childEnv }, stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, so a terminal's Ctrl+C reaches it once, from the home, as its own Ctrl+C would.
      detached: process.platform !== "win32" });
    const entry: Child = { process: child, item };
    children.add(entry);
    // Its terminal lines print in the home's terminal, prefixed with its title.
    let tail = "";
    const relay = (chunk: Buffer, to: CommandContext["stdout"]) => {
      const text = chunk.toString("utf8");
      tail = (tail + text).slice(-2000);
      for (const line of text.split(/\r?\n/)) if (line.trim()) to.write(`${item.title} · ${line}\n`);
    };
    child.stdout!.on("data", (chunk: Buffer) => relay(chunk, context.stdout));
    child.stderr!.on("data", (chunk: Buffer) => relay(chunk, context.stderr));
    let exited: number | null | undefined;
    child.once("exit", (code) => { exited = code; children.delete(entry); void rescan(); });
    const deadline = Date.now() + CHILD_READY_MS;
    while (Date.now() < deadline) {
      const held = liveLock(findWork(context.env, item)?.directory ?? stateDirectory);
      if (held && held.pid === child.pid) {
        // The lock names the port before the view is served; wait for it to answer.
        const at = viewAddress(held.port, folder);
        try { await fetch(at, { signal: AbortSignal.timeout(1000) }); void rescan(); return at; } catch { /* Not serving yet. */ }
      }
      if (exited !== undefined) throw new Error(lastLines(tail) || `kiln run ${item.path} ended before it opened.`);
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error(`kiln run ${item.path} didn't open within a minute.`);
  }

  context.stdout.write(`● Kiln's home screen for ${scope.name} is at ${address}\n`);
  await open(address);

  // Ctrl+C stops the home screen and every Kiln it started, each as its own Ctrl+C would.
  const stopped = new Promise<number>((done) => {
    const stop = (signal: NodeJS.Signals) => {
      abort.abort();
      clearInterval(timer);
      const waits = [...children].map(child => new Promise<void>(ended => { child.process.once("exit", () => ended()); child.process.kill(signal); }));
      void Promise.all(waits).then(() => done(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143));
    };
    for (const signal of ["SIGINT", "SIGHUP", "SIGTERM"] as const) context.signals?.on(signal, () => stop(signal));
  });
  try { return await stopped; }
  finally {
    for (const stream of streams) stream.abort();
    await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
    lock.release();
    context.stdout.write("Kiln's home screen stopped.\n");
  }
}

function findWork(env: NodeJS.ProcessEnv, item: HomeItem): SavedWork | undefined {
  return enumerateWork(env).work.find(work => resolve(work.record.repository.mainCheckoutPath) === item.checkout && (work.record.origin?.path === item.path || work.record.prdDirectory === item.path));
}

/** The instance lock's holder when it is alive. */
function liveLock(stateDirectory: string): InstanceLockContent | undefined {
  const path = join(stateDirectory, "instance.lock");
  if (!existsSync(path)) return undefined;
  try {
    const lock = privateJson<InstanceLockContent>(dirname(dirname(stateDirectory)), path);
    process.kill(lock.pid, 0);
    return lock;
  } catch { return undefined; }
}

function planFailure(root: string): { failure?: string } {
  const file = readPlanFile(root);
  for (const agent of Object.keys(file.failures)) for (const fingerprint of Object.keys(file.failures[agent] ?? {})) {
    const failure = findFailure(file, agent, fingerprint);
    if (failure) return { failure: failure.reason };
  }
  return {};
}

const lastLines = (text: string) => text.trim().split(/\r?\n/).slice(-4).join("\n");

const CONTENT_TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png" };

function refuse(c: Context, status: 403 | 404 | 409, reason: string) { return c.json({ ok: false, reason }, status); }
function escapeHtml(text: string): string { return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`); }
