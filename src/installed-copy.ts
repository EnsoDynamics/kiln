// Each installed Kiln runs from its own private copy, so installing a newer Kiln never changes
// the files under a run that is still going (Kiln Upgrade While Running PRD and technical design).
// `dist/cli.js` calls kilnRootToRunFrom before it loads anything else of Kiln's.
//
//   await kilnRootToRunFrom("/usr/lib/node_modules/@ensodynamics/kiln", process.env)
//     // "/home/me/.local/state/kiln-installs/1.1.2", made on first use
//   await kilnRootToRunFrom("/home/me/kiln", process.env)   // a linked checkout: "/home/me/kiln"

import { constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cp } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { stateRoot } from "./state/state-files.js";

const KEEP_UNUSED_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_WAIT_MS = 10 * 60 * 1000;
const UNOWNED_LOCK_STALE_MS = 60 * 1000;

export const UPGRADING_MESSAGE = "kiln: Kiln is being installed or upgraded right now. Run the command again once that finishes. If no install is running, install Kiln again with npm install -g @ensodynamics/kiln.";

/**
 * Where the copies live: `kiln-installs` beside the state root, such as `~/.local/state/kiln-installs`,
 * since every folder inside the state root is saved work.
 */
export function installsDirectory(env: NodeJS.ProcessEnv): string {
  return join(dirname(stateRoot(env)), "kiln-installs");
}

/**
 * The package folder Kiln should run from: a copy of this installed version, the copy it is
 * already in, or the package itself when it can't be copied whole.
 */
export async function kilnRootToRunFrom(packageRoot: string, env: NodeJS.ProcessEnv, options: { pid?: number; now?: number; afterCopying?: () => void } = {}): Promise<string> {
  const { pid = process.pid, now = Date.now() } = options;
  const root = realpathSync(packageRoot);
  const store = installsDirectory(env);
  mkdirSync(store, { recursive: true });
  const storeReal = realpathSync(store);
  // Started from a copy, as Kiln's sessions start `kiln`: it writes nothing, since a Codex
  // session may write only its workspace, and the run that started the session holds the lease.
  if (dirname(root) === storeReal) return root;
  const key = copyKey(root);
  if (!key) return root;
  await withLock(storeReal, pid, async () => {
    if (!existsSync(join(storeReal, key))) await makeCopy(root, storeReal, key, pid, options.afterCopying);
    linkCommand(storeReal, key);
    lease(storeReal, key, pid, now);
    cleanUp(storeReal, key, now);
  });
  return join(storeReal, key);
}

/**
 * On macOS and Linux, a folder holding a `kiln` link to this copy's command, for a session's
 * PATH, so an agent's `kiln` is this run's version; undefined when Kiln isn't running from a copy.
 */
export function copyCommandDirectory(packageRoot: string, env: NodeJS.ProcessEnv): string | undefined {
  if (process.platform === "win32" || !existsSync(installsDirectory(env))) return undefined;
  const root = realpathSync(packageRoot);
  const store = realpathSync(installsDirectory(env));
  return dirname(root) === store ? join(store, ".bin", basename(root)) : undefined;
}

/**
 * The copy's name, or undefined when Kiln runs in place: anything not installed by npm, not
 * stamped by a build, or whose dependencies npm hoisted out of the package's own `node_modules`.
 * The name carries the install's location, so two installs of one version (one per Node
 * architecture, say) never share a copy.
 */
function copyKey(root: string): string | undefined {
  if (!root.split(sep).includes("node_modules")) return undefined;
  if (npmInstalling(root)) throw new Error(UPGRADING_MESSAGE);
  const infoFile = join(root, "dist", "build-info.json");
  if (!existsSync(infoFile)) return undefined;
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; dependencies?: Record<string, string> };
  if (Object.keys(manifest.dependencies ?? {}).some(name => !existsSync(join(root, "node_modules", ...name.split("/"))))) return undefined;
  const info = JSON.parse(readFileSync(infoFile, "utf8")) as { kind: string; builtAt?: string };
  const version = info.kind === "release" ? manifest.version : `${manifest.version}-dev-${(info.builtAt ?? "").replace(/\D/g, "")}`;
  if (!/^[0-9A-Za-z][0-9A-Za-z.+]*(-[0-9A-Za-z.+]+)*$/.test(version)) throw new Error(`kiln: can't name a copy of Kiln for version ${JSON.stringify(manifest.version)}.`);
  return `${version}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
}

/**
 * Whether npm is part way through changing this install. To replace a package, npm first moves
 * it aside to `.<name>-<hash>` in the same folder, and deletes that only once every package of
 * the install is unpacked, moved back and built (@npmcli/arborist, reify and retire-path).
 */
function npmInstalling(root: string): boolean {
  const aside = (folder: string, name: string) => {
    const prefix = `.${name}-`;
    return readdirSync(folder).some(entry => entry.startsWith(prefix) && /^[A-Za-z0-9]{1,8}$/.test(entry.slice(prefix.length)));
  };
  if (aside(dirname(root), basename(root))) return true;
  const modules = (folder: string): boolean => {
    if (!existsSync(folder)) return false;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === ".bin") continue;
      if (/^\.[^.].*-[A-Za-z0-9]{1,8}$/.test(entry.name)) return true;
      const path = join(folder, entry.name);
      if (entry.name.startsWith("@") ? modules(path) : modules(join(path, "node_modules"))) return true;
    }
    return false;
  };
  return modules(join(root, "node_modules"));
}

/**
 * Whether every dependency Kiln needs is in the copy, found as Node finds it without leaving
 * the copy: each package's `dependencies`, and its `optionalDependencies` that npm installed.
 */
function dependenciesComplete(copy: string): boolean {
  const seen = new Set<string>();
  const find = (from: string, name: string): string | undefined => {
    for (let folder = from; ; folder = dirname(folder)) {
      const candidate = join(folder, "node_modules", ...name.split("/"));
      if (existsSync(join(candidate, "package.json"))) return candidate;
      if (folder === copy || !folder.startsWith(copy + sep)) return undefined;
    }
  };
  const visit = (folder: string): boolean => {
    if (seen.has(folder)) return true;
    seen.add(folder);
    const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    const optional = Object.keys(manifest.optionalDependencies ?? {});
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (optional.includes(name)) continue;
      const found = find(folder, name);
      if (!found || !visit(found)) return false;
    }
    for (const name of optional) {
      const found = find(folder, name);
      if (found && !visit(found)) return false;
    }
    return true;
  };
  return visit(copy);
}

/** Every path under `root` with what it is: `d`, `f:<size>[:<mtime>]` or `l:<target>`. */
function listing(root: string, withTimes: boolean): Map<string, string> {
  const entries = new Map<string, string>();
  const walk = (relative: string) => {
    for (const name of readdirSync(join(root, relative))) {
      const path = relative ? join(relative, name) : name;
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) entries.set(path, `l:${readlinkSync(join(root, path))}`);
      else if (stat.isDirectory()) { entries.set(path, "d"); walk(path); }
      else entries.set(path, withTimes ? `f:${stat.size}:${stat.mtimeMs}` : `f:${stat.size}`);
    }
  };
  walk("");
  return entries;
}

const same = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([path, kind]) => b.get(path) === kind);
const withoutTimes = (entries: Map<string, string>) => new Map([...entries].map(([path, kind]) => [path, kind.replace(/^(f:\d+):.*$/, "$1")]));

/**
 * Copies the package, then keeps the copy only if npm was not installing before or after, changed
 * nothing while it was copied, and the copy holds every dependency (AC-UPG-02).
 */
async function makeCopy(root: string, store: string, key: string, pid: number, afterCopying?: () => void): Promise<void> {
  const temporary = join(store, `.tmp-${key}-${pid}`);
  rmSync(temporary, { recursive: true, force: true });
  const inode = statSync(root).ino;
  const before = listing(root, true);
  const unchanged = () => { try { return statSync(root).ino === inode && !npmInstalling(root) && same(before, listing(root, true)); } catch { return false; } };
  try {
    await cp(root, temporary, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, mode: constants.COPYFILE_FICLONE });
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    if (!unchanged()) throw new Error(UPGRADING_MESSAGE, { cause: error });
    throw error;
  }
  afterCopying?.();
  if (!unchanged() || !same(withoutTimes(before), listing(temporary, false)) || !dependenciesComplete(temporary)) {
    rmSync(temporary, { recursive: true, force: true });
    throw new Error(UPGRADING_MESSAGE);
  }
  try {
    renameSync(temporary, join(store, key));
  } catch (error) {
    // Another launcher made the same copy first; theirs is as complete as this one.
    rmSync(temporary, { recursive: true, force: true });
    if (!existsSync(join(store, key))) throw error;
  }
}

function linkCommand(store: string, key: string): void {
  if (process.platform === "win32") return;
  const link = join(store, ".bin", key, "kiln");
  const target = join(store, key, "dist", "cli.js");
  try { if (readlinkSync(link) === target) return; } catch { /* Not there yet. */ }
  rmSync(link, { force: true });
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link);
}

/** Records that this process runs from the copy, until it exits (AC-UPG-03). */
function lease(store: string, key: string, pid: number, now: number): void {
  const file = join(store, ".leases", key, String(pid));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "");
  const used = join(store, ".used", key);
  mkdirSync(dirname(used), { recursive: true });
  writeFileSync(used, "");
  utimesSync(used, now / 1000, now / 1000);
  if (pid === process.pid && !heldLeases.size) process.once("exit", () => { for (const held of heldLeases) rmSync(held, { force: true }); });
  if (pid === process.pid) heldLeases.add(file);
}

const heldLeases = new Set<string>();

export function running(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

function liveLease(store: string, key: string): boolean {
  const directory = join(store, ".leases", key);
  if (!existsSync(directory)) return false;
  let live = false;
  for (const name of readdirSync(directory)) {
    if (running(Number(name))) live = true;
    else rmSync(join(directory, name), { force: true });
  }
  return live;
}

/** Removes each other copy nobody runs from and nobody has used for seven days, and leftovers (AC-UPG-03). */
function cleanUp(store: string, keep: string, now: number): void {
  for (const name of readdirSync(store)) {
    if (name.startsWith(".tmp-") || name.startsWith(".trash-")) {
      if (!running(Number(name.slice(name.lastIndexOf("-") + 1)))) remove(join(store, name));
      continue;
    }
    if (name.startsWith(".") || name === keep || liveLease(store, name)) continue;
    const used = join(store, ".used", name);
    if (now - (existsSync(used) ? statSync(used) : statSync(join(store, name))).mtimeMs < KEEP_UNUSED_MS) continue;
    const trash = join(store, `.trash-${name}-${process.pid}`);
    try { renameSync(join(store, name), trash); } catch { continue; } // In use on Windows: a later launch tries again.
    remove(trash);
    for (const leftover of [join(store, ".leases", name), used, join(store, ".bin", name)]) remove(leftover);
  }
}

/** Deletes a folder Kiln no longer needs; one Windows still holds open waits for a later launch. */
function remove(path: string): void {
  try { rmSync(path, { recursive: true, force: true }); } catch (error) {
    if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}

/** Runs `work` holding `kiln-installs/.lock`, which only making a copy, leasing and cleaning up take. */
async function withLock<T>(store: string, pid: number, work: () => T | Promise<T>): Promise<T> {
  const lock = join(store, ".lock");
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "pid"), String(pid));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (stale(lock)) {
      const trash = join(store, `.trash-lock-${pid}`);
      try { renameSync(lock, trash); remove(trash); } catch { /* Another launcher took it over first. */ }
      continue;
    }
    if (Date.now() > deadline) throw new Error(`kiln: another kiln command has held ${lock} for over ten minutes. If no other kiln command is starting, remove that folder and run the command again.`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try { return await work(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

function stale(lock: string): boolean {
  try {
    const owner = join(lock, "pid");
    const pid = existsSync(owner) ? Number(readFileSync(owner, "utf8")) : NaN;
    if (Number.isInteger(pid) && pid > 0) return !running(pid);
    return Date.now() - statSync(lock).mtimeMs > UNOWNED_LOCK_STALE_MS;
  } catch {
    return false; // The lock went away while being read; try to take it again.
  }
}
