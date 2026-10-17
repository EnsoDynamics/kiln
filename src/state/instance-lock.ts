// One Kiln per PRD (PRD AC-MULTI-04), and the port each PRD keeps (AC-MULTI-02): the shared
// port registry and the PRD's instance lock, taken together under the registry's lock
// (technical design, "Ports and one Kiln per PRD").

import { createServer } from "node:net";
import { linkSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";
import { ensurePrivateDirectory, readJson, writeJsonAtomically } from "./state-files.js";

export const PORT_RANGE = { first: 4700, last: 4799 } as const;

interface PortEntry {
  port: number;
  lastServedAt: string;
}
type PortRegistry = Record<string, PortEntry>;

export interface InstanceLockContent {
  pid: number;
  processStartTime: string;
  port: number;
}

export type LockOutcome =
  | { taken: true; port: number; release(): void }
  | { taken: false; reason: "already_running"; port: number }
  | { taken: false; reason: "port_in_use"; port: number }
  | { taken: false; reason: "no_port" };

export interface LockOptions {
  /** Test hook: the port range to assign from. */
  range?: { first: number; last: number };
  now?: () => Date;
}

/**
 * Takes the PRD's instance lock and settles its port, the first step after resolving the PRD.
 * A live holder (same PID and process start time) decides on its own: the caller prints that
 * the PRD is already running at the holder's address. A stale or unreadable lock is replaced.
 *
 *   const lock = await takeInstanceLock(stateRoot, prdStateDirectory);
 *   if (lock.taken) { ...; lock.release(); }
 */
export async function takeInstanceLock(root: string, prdStateDirectory: string, options: LockOptions = {}): Promise<LockOutcome> {
  const range = options.range ?? PORT_RANGE;
  const now = options.now ?? (() => new Date());
  ensurePrivateDirectory(prdStateDirectory);
  const ownStartTime = await processStartTime(process.pid);
  if (ownStartTime === undefined) throw new Error("Couldn't read Kiln's own process start time.");

  return withRegistryLock(root, async () => {
    const lockPath = join(prdStateDirectory, "instance.lock");
    const holder = readLock(lockPath);
    if (holder && (await isProcessLive(holder.pid, holder.processStartTime))) {
      return { taken: false, reason: "already_running", port: holder.port } as const;
    }

    const registryPath = join(root, "ports.json");
    const registry = readJson<PortRegistry>(registryPath) ?? {};
    let port = registry[prdStateDirectory]?.port;
    const inRange = (candidate: number) => candidate >= range.first && candidate <= range.last;

    if (port === undefined || !inRange(port)) {
      port = await assignPort(registry, prdStateDirectory, range);
      if (port === undefined) return { taken: false, reason: "no_port" } as const;
    } else if (!(await isPortFree(port))) {
      return { taken: false, reason: "port_in_use", port } as const;
    }

    registry[prdStateDirectory] = { port, lastServedAt: now().toISOString() };
    writeJsonAtomically(registryPath, registry);

    // Any lock still here is stale or unreadable; the registry lock keeps another kiln run from racing this.
    unlinkQuietly(lockPath);
    const content: InstanceLockContent = { pid: process.pid, processStartTime: ownStartTime, port };
    const temporary = `${lockPath}.${randomBytes(6).toString("hex")}.tmp`;
    writeFileSync(temporary, JSON.stringify(content), { mode: 0o600 });
    try {
      linkSync(temporary, lockPath);
    } finally {
      unlinkQuietly(temporary);
    }
    let released = false;
    return {
      taken: true,
      port,
      release: () => {
        if (released) return;
        released = true;
        const current = readLock(lockPath);
        if (current?.pid === process.pid && current.processStartTime === ownStartTime) unlinkQuietly(lockPath);
      },
    } as const;
  });
}

/** The lowest port neither assigned nor in use; when every port is assigned, the least recently served stopped PRD's. */
async function assignPort(registry: PortRegistry, key: string, range: { first: number; last: number }): Promise<number | undefined> {
  const assigned = new Set(Object.entries(registry).filter(([other]) => other !== key).map(([, entry]) => entry.port));
  for (let candidate = range.first; candidate <= range.last; candidate++) {
    if (!assigned.has(candidate) && (await isPortFree(candidate))) return candidate;
  }
  const byAge = Object.entries(registry)
    .filter(([other, entry]) => other !== key && entry.port >= range.first && entry.port <= range.last)
    .sort(([, a], [, b]) => (a.lastServedAt < b.lastServedAt ? -1 : a.lastServedAt > b.lastServedAt ? 1 : 0));
  for (const [other, entry] of byAge) {
    const otherLock = readLock(join(other, "instance.lock"));
    if (otherLock && (await isProcessLive(otherLock.pid, otherLock.processStartTime))) continue;
    if (!(await isPortFree(entry.port))) continue;
    delete registry[other];
    return entry.port;
  }
  return undefined;
}

function readLock(path: string): InstanceLockContent | undefined {
  try {
    const content = JSON.parse(readFileSync(path, "utf8")) as Partial<InstanceLockContent>;
    if (typeof content.pid !== "number" || typeof content.processStartTime !== "string" || typeof content.port !== "number") return undefined;
    return content as InstanceLockContent;
  } catch {
    return undefined;
  }
}

/** True when nothing listens on 127.0.0.1 at the port. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => server.close(() => resolve(true)));
  });
}

const REGISTRY_LOCK_STALE_MS = 30_000;

/** Runs `work` holding `ports.json.lock`, created exclusively; a lock left by a Kiln that died is stale after 30 seconds. */
async function withRegistryLock<T>(root: string, work: () => Promise<T>): Promise<T> {
  ensurePrivateDirectory(root);
  const lockPath = join(root, "ports.json.lock");
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx", mode: 0o600 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > REGISTRY_LOCK_STALE_MS) unlinkQuietly(lockPath);
      } catch {
        // Released in the meantime.
      }
      if (Date.now() > deadline) throw new Error(`Couldn't take ${lockPath}; another kiln run is holding it.`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await work();
  } finally {
    unlinkQuietly(lockPath);
  }
}

function unlinkQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
}

/** The view's address: `http://127.0.0.1:<port>/<PRD folder name>`. */
export function viewAddress(port: number, folderName: string): string {
  return `http://127.0.0.1:${port}/${folderName}`;
}
