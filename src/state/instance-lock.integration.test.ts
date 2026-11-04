// The instance lock and port registry against real processes and real listeners (technical
// design, "Testing Approach": instance lock, process start time, ports).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { linuxStartTimeFromStat, processStartTime } from "../platform/process-start-time.js";
import { takeInstanceLock, viewAddress } from "./instance-lock.js";
import { reservePort } from "../test-support/os-ports.js";

let root: string;
const servers: Server[] = [];
beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "kiln-lock-")));
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

const prd = (name: string) => join(root, "acme-shop-1a2b3c4d", `docs--prds--${name}`);
const exitedPid = () => spawnSync(process.execPath, ["-e", ""]).pid!;
const writeLock = (directory: string, content: unknown) => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "instance.lock"), typeof content === "string" ? content : JSON.stringify(content));
};
const listen = (port: number) =>
  new Promise<Server>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => resolve(server));
  });
const listenOn = async (port: number) => { servers.push(await listen(port)); };
const closed = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));
/**
 * Two neighbouring ports, held by listeners until the test releases them: a port range is
 * contiguous, so this is the one place a test needs neighbours, against os-ports.ts's rule.
 * The first comes from the operating system; the second is retried until its neighbour is
 * free (AC-CI-01). Each is released only just before Kiln is to take it, a far smaller window
 * than a fixed range that any other test or program may already hold.
 */
async function heldNeighbours(): Promise<[Server, Server]> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const first = await listen(0);
    const port = (first.address() as import("node:net").AddressInfo).port;
    try { return [first, await listen(port + 1)]; } catch { await closed(first); }
  }
  throw new Error("No two neighbouring loopback ports were free.");
}
const portOf = (server: Server) => (server.address() as import("node:net").AddressInfo).port;

describe("takeInstanceLock", () => {
  it("lets one Kiln hold a PRD; a second, while the holder is live, gets the holder's port and starts nothing", async () => {
    const first = await takeInstanceLock(root, prd("customer-returns"));
    expect(first).toMatchObject({ taken: true });
    const port = first.taken ? first.port : 0;
    expect(port).toBeGreaterThanOrEqual(4700);
    expect(port).toBeLessThanOrEqual(4799);
    expect(JSON.parse(readFileSync(join(prd("customer-returns"), "instance.lock"), "utf8"))).toEqual({ pid: process.pid, processStartTime: await processStartTime(process.pid), port });

    // This process is the live holder, so a second take is refused with its address.
    expect(await takeInstanceLock(root, prd("customer-returns"))).toEqual({ taken: false, reason: "already_running", port });
    expect(viewAddress(port, "customer-returns")).toBe(`http://127.0.0.1:${port}/customer-returns`);

    if (first.taken) first.release();
    const again = await takeInstanceLock(root, prd("customer-returns"));
    expect(again).toMatchObject({ taken: true, port });
    if (again.taken) again.release();
  });

  it("replaces a lock whose process is gone, whose PID now belongs to another process, or that can't be read", async () => {
    const stale = [
      { pid: exitedPid(), processStartTime: "gone", port: 4700 },
      { pid: process.pid, processStartTime: "a different start time", port: 4700 },
      "{ not json",
    ];
    for (const content of stale) {
      writeLock(prd("customer-returns"), content);
      const lock = await takeInstanceLock(root, prd("customer-returns"));
      expect(lock, JSON.stringify(content)).toMatchObject({ taken: true });
      if (lock.taken) lock.release();
    }
  });

  it("keeps each PRD's port across runs, gives PRDs of the same name in two repositories different ports", async () => {
    const a = join(root, "shop-11111111", "docs--prds--returns");
    const b = join(root, "store-22222222", "docs--prds--returns");
    const lockA = await takeInstanceLock(root, a);
    const lockB = await takeInstanceLock(root, b);
    expect(lockA.taken && lockB.taken).toBe(true);
    if (!lockA.taken || !lockB.taken) return;
    expect(lockA.port).not.toBe(lockB.port);
    lockA.release();
    lockB.release();
    const later = await takeInstanceLock(root, b);
    expect(later).toMatchObject({ taken: true, port: lockB.port });
    if (later.taken) later.release();
  });

  it("refuses to move the address when the PRD's port is held by another program", async () => {
    const port = await reservePort();
    const lock = await takeInstanceLock(root, prd("customer-returns"), { range: { first: port, last: port } });
    if (!lock.taken) throw new Error("not taken");
    lock.release();
    await listenOn(lock.port);
    expect(await takeInstanceLock(root, prd("customer-returns"), { range: { first: port, last: port } })).toEqual({ taken: false, reason: "port_in_use", port: lock.port });
  });

  it("skips ports in use when assigning, and takes the least recently served stopped PRD's port when the range is full", async () => {
    const [low, high] = await heldNeighbours();
    const range = { first: portOf(low), last: portOf(high) };
    const at = (iso: string) => () => new Date(iso);
    // The range's first port is in use by another program, so "one" skips it.
    await closed(high);
    const one = await takeInstanceLock(root, prd("one"), { range, now: at("2026-10-01T00:00:00Z") });
    await closed(low);
    const two = await takeInstanceLock(root, prd("two"), { range, now: at("2026-10-02T00:00:00Z") });
    if (!one.taken || !two.taken) throw new Error("not taken");
    expect([one.port, two.port]).toEqual([range.last, range.first]);
    one.release();
    two.release();

    // "one" was served least recently and isn't running, so "three" takes its port.
    const three = await takeInstanceLock(root, prd("three"), { range, now: at("2026-10-03T00:00:00Z") });
    expect(three).toMatchObject({ taken: true, port: one.port });
    const registry = JSON.parse(readFileSync(join(root, "ports.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(registry).sort()).toEqual([prd("three"), prd("two")].sort());

    // With every port assigned to a running Kiln or held by a listener, nothing is left.
    await listenOn(two.port);
    expect(await takeInstanceLock(root, prd("four"), { range })).toEqual({ taken: false, reason: "no_port" });
    if (three.taken) three.release();
  });
});

describe("processStartTime", () => {
  it("reads this process's start time the same way each time, and nothing for a process that's gone", async () => {
    const own = await processStartTime(process.pid);
    expect(own).toBeTruthy();
    expect(await processStartTime(process.pid)).toBe(own);
    expect(await processStartTime(exitedPid())).toBeUndefined();
  });

  it("counts /proc stat fields after the last parenthesis, so a command name with spaces and parentheses reads", () => {
    const fields = Array.from({ length: 50 }, (_, index) => String(index + 3)).join(" ");
    expect(linuxStartTimeFromStat(`4242 (my (odd) name) ${fields}`)).toBe("22");
  });
});
