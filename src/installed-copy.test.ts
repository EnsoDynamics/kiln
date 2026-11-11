// Kiln Upgrade While Running: each installed version runs from its own private copy, made only
// when complete (AC-UPG-02), and cleaned up only when nothing uses it (AC-UPG-03). Real folders
// and real processes; the package test covers a real `npm install -g` over a running Kiln.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UPGRADING_MESSAGE, copyCommandDirectory, installsDirectory, kilnRootToRunFrom } from "./installed-copy.js";

const DAY = 24 * 60 * 60 * 1000;
const windows = process.platform === "win32";
let root: string;
let env: NodeJS.ProcessEnv;
let store: string;

/** A pid that was running a moment ago and no longer is. */
function finishedPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(child.stdout);
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** An installed package as npm lays out a global install, with the given version and build. */
function installed(version: string, build: object = { kind: "release" }, at = join(root, "prefix", "lib", "node_modules", "@ensodynamics", "kiln")): string {
  rmSync(at, { recursive: true, force: true });
  write(join(at, "package.json"), JSON.stringify({ name: "@ensodynamics/kiln", version, dependencies: { "@scope/dep": "1", plain: "1" } }));
  write(join(at, "dist", "build-info.json"), JSON.stringify(build));
  write(join(at, "dist", "cli.js"), "// launcher\n");
  write(join(at, "prompts", "audit-session.txt"), `prompt of ${version}\n`);
  write(join(at, "node_modules", "@scope", "dep", "package.json"), JSON.stringify({ name: "@scope/dep", dependencies: { shared: "1" }, optionalDependencies: { "other-platform": "1" } }));
  write(join(at, "node_modules", "@scope", "dep", "index.js"), "dep\n");
  write(join(at, "node_modules", "plain", "package.json"), JSON.stringify({ name: "plain", dependencies: { shared: "1" } }));
  write(join(at, "node_modules", "plain", "index.js"), "plain\n");
  write(join(at, "node_modules", "shared", "package.json"), JSON.stringify({ name: "shared" }));
  if (!windows) { mkdirSync(join(at, "node_modules", ".bin")); symlinkSync("../plain/index.js", join(at, "node_modules", ".bin", "plain")); }
  return at;
}

/** A copy left by an earlier version, last used `age` ago, with a lease held by `leasedBy`. */
function earlierCopy(key: string, age: number, leasedBy?: number): string {
  const copy = join(store, key);
  write(join(copy, "package.json"), "{}");
  write(join(store, ".used", key), "");
  const when = (Date.now() - age) / 1000;
  utimesSync(join(store, ".used", key), when, when);
  if (leasedBy !== undefined) write(join(store, ".leases", key, String(leasedBy)), "");
  return copy;
}

/** The copy's folder for an install at `pkg`: its version, then a hash of where it is installed. */
const copyOf = (pkg: string, version = "1.1.2") => join(realpathSync(store), `${version}-${createHash("sha256").update(realpathSync(pkg)).digest("hex").slice(0, 8)}`);

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "kiln-installed-copy-")));
  env = { XDG_STATE_HOME: join(root, "state"), LOCALAPPDATA: join(root, "state") };
  store = installsDirectory(env);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("kilnRootToRunFrom", () => {
  it("runs an npm-installed release from a copy of it, made once and then reused", async () => {
    const pkg = installed("1.1.2");
    const runFrom = await kilnRootToRunFrom(pkg, env);
    expect(runFrom).toBe(copyOf(pkg));
    expect(readFileSync(join(runFrom, "prompts", "audit-session.txt"), "utf8")).toBe("prompt of 1.1.2\n");
    expect(readFileSync(join(runFrom, "node_modules", "@scope", "dep", "index.js"), "utf8")).toBe("dep\n");
    if (!windows) expect(readlinkSync(join(runFrom, "node_modules", ".bin", "plain"))).toBe("../plain/index.js");
    expect(existsSync(join(store, ".leases", basename(runFrom), String(process.pid)))).toBe(true);

    write(join(runFrom, "marker"), "kept");
    expect(await kilnRootToRunFrom(pkg, env)).toBe(runFrom);
    expect(readFileSync(join(runFrom, "marker"), "utf8")).toBe("kept");
  });

  it("keeps the copy a run started on when a newer version is installed over the package (AC-UPG-01)", async () => {
    const pkg = installed("1.1.1");
    const first = await kilnRootToRunFrom(pkg, env);
    installed("1.1.2");
    const second = await kilnRootToRunFrom(pkg, env);
    expect(readFileSync(join(first, "prompts", "audit-session.txt"), "utf8")).toBe("prompt of 1.1.1\n");
    expect(readFileSync(join(second, "prompts", "audit-session.txt"), "utf8")).toBe("prompt of 1.1.2\n");
  });

  it("names a development build's copy for its build time", async () => {
    const pkg = installed("1.1.2", { kind: "development", builtAt: "2026-11-08T02:45:27.109Z" });
    expect(await kilnRootToRunFrom(pkg, env)).toBe(copyOf(pkg, "1.1.2-dev-20261108024527109"));
  });

  it.skipIf(windows)("gives sessions a kiln command that is the copy's own", async () => {
    const runFrom = await kilnRootToRunFrom(installed("1.1.2"), env);
    const commands = copyCommandDirectory(runFrom, env)!;
    expect(realpathSync(join(commands, "kiln"))).toBe(join(runFrom, "dist", "cli.js"));
    // A link left pointing at a removed copy is made again.
    rmSync(runFrom, { recursive: true });
    expect(await kilnRootToRunFrom(installed("1.1.2"), env)).toBe(runFrom);
    expect(realpathSync(join(commands, "kiln"))).toBe(join(runFrom, "dist", "cli.js"));
    expect(copyCommandDirectory(installed("1.1.2"), env)).toBeUndefined();
  });

  it("runs in place when not installed by npm, not built, or with dependencies hoisted out of the package", async () => {
    const checkout = installed("1.1.2", { kind: "release" }, join(root, "checkout", "kiln"));
    expect(await kilnRootToRunFrom(checkout, env)).toBe(checkout);
    const unbuilt = installed("1.1.2");
    rmSync(join(unbuilt, "dist", "build-info.json"));
    expect(await kilnRootToRunFrom(unbuilt, env)).toBe(unbuilt);
    const hoisted = installed("1.1.2");
    rmSync(join(hoisted, "node_modules", "plain"), { recursive: true });
    expect(await kilnRootToRunFrom(hoisted, env)).toBe(hoisted);
    expect(readdirSync(store)).toEqual([]);
  });

  it("refuses a copy when npm changes the package while it is copied, and leaves no copy (AC-UPG-02)", async () => {
    const pkg = installed("1.1.2");
    await expect(kilnRootToRunFrom(pkg, env, { afterCopying: () => write(join(pkg, "prompts", "new.txt"), "x") })).rejects.toThrow(UPGRADING_MESSAGE);
    await expect(kilnRootToRunFrom(pkg, env, { afterCopying: () => { rmSync(pkg, { recursive: true }); installed("1.1.2"); } })).rejects.toThrow(UPGRADING_MESSAGE);
    expect(readdirSync(store).filter(name => !name.startsWith(".lock"))).toEqual([]);
    expect(await kilnRootToRunFrom(pkg, env)).toBe(copyOf(pkg));
  });

  it("refuses while npm has an earlier install of the package or one of its dependencies moved aside (AC-UPG-02)", async () => {
    const pkg = installed("1.1.2");
    mkdirSync(join(dirname(pkg), ".kiln-Ab3dE9xQ"));
    await expect(kilnRootToRunFrom(pkg, env)).rejects.toThrow(UPGRADING_MESSAGE);
    rmSync(join(dirname(pkg), ".kiln-Ab3dE9xQ"), { recursive: true });
    mkdirSync(join(pkg, "node_modules", "@scope", ".dep-Zz9yX8w7"));
    await expect(kilnRootToRunFrom(pkg, env)).rejects.toThrow(UPGRADING_MESSAGE);
    rmSync(join(pkg, "node_modules", "@scope", ".dep-Zz9yX8w7"), { recursive: true });
    // npm moves unchanged dependencies back last, so a direct one may still be missing.
    rmSync(join(pkg, "node_modules", "plain"), { recursive: true });
    mkdirSync(join(dirname(pkg), ".kiln-Ab3dE9xQ"));
    await expect(kilnRootToRunFrom(pkg, env)).rejects.toThrow(UPGRADING_MESSAGE);
    expect(existsSync(store) ? readdirSync(store).filter(name => !name.startsWith(".lock")) : []).toEqual([]);
  });

  it("refuses a copy missing a dependency a dependency needs, and runs from none (AC-UPG-02)", async () => {
    const pkg = installed("1.1.2");
    rmSync(join(pkg, "node_modules", "shared"), { recursive: true });
    await expect(kilnRootToRunFrom(pkg, env)).rejects.toThrow(UPGRADING_MESSAGE);
    expect(existsSync(copyOf(pkg))).toBe(false);
  });

  it("writes nothing when started from a copy, as Kiln's sessions start it", async () => {
    const runFrom = await kilnRootToRunFrom(installed("1.1.2"), env);
    rmSync(join(store, ".leases"), { recursive: true });
    rmSync(join(store, ".used"), { recursive: true });
    expect(await kilnRootToRunFrom(runFrom, env, { pid: 4242 })).toBe(runFrom);
    expect(existsSync(join(store, ".leases"))).toBe(false);
    expect(existsSync(join(store, ".used"))).toBe(false);
  });
});

describe("cleaning up copies (AC-UPG-03)", () => {
  it("removes only copies nobody runs from and nobody used for seven days", async () => {
    mkdirSync(store, { recursive: true });
    const dead = finishedPid();
    const old = earlierCopy("1.0.0", 8 * DAY, dead);
    const recent = earlierCopy("1.0.1", 6 * DAY);
    const leased = earlierCopy("1.0.2", 30 * DAY, process.pid);
    await kilnRootToRunFrom(installed("1.1.2"), env);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(join(store, ".leases", "1.0.0"))).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(leased)).toBe(true);
  });

  it("never removes the version being started, however old its last use", async () => {
    const pkg = installed("1.1.2");
    await kilnRootToRunFrom(pkg, env);
    rmSync(join(store, ".leases"), { recursive: true });
    utimesSync(join(store, ".used", basename(copyOf(pkg))), 0, 0);
    expect(await kilnRootToRunFrom(pkg, env)).toBe(copyOf(pkg));
    expect(existsSync(join(copyOf(pkg), "package.json"))).toBe(true);
  });

  it("removes half-made and half-removed folders of processes no longer running, and takes over their lock", async () => {
    const dead = finishedPid();
    write(join(store, `.tmp-1.1.0-${dead}`, "partial"), "");
    write(join(store, `.trash-1.0.0-${dead}`, "partial"), "");
    write(join(store, `.tmp-1.1.0-${process.pid}`, "partial"), "");
    write(join(store, ".lock", "pid"), String(dead));
    await kilnRootToRunFrom(installed("1.1.2"), env);
    expect(existsSync(join(store, `.tmp-1.1.0-${dead}`))).toBe(false);
    expect(existsSync(join(store, `.trash-1.0.0-${dead}`))).toBe(false);
    expect(existsSync(join(store, `.tmp-1.1.0-${process.pid}`))).toBe(true);
    expect(existsSync(join(store, ".lock"))).toBe(false);
  });

  it("takes over a lock whose holder left no pid, once it is a minute old", async () => {
    write(join(store, ".lock", "pid"), "");
    const old = (Date.now() - 2 * 60 * 1000) / 1000;
    utimesSync(join(store, ".lock"), old, old);
    expect(await kilnRootToRunFrom(installed("1.1.2"), env)).toBe(copyOf(installed("1.1.2")));
  });
});
