// Controller fixtures own separate state roots but share the host's TCP namespace.
// Bind atomically with port 0; production registry/instance-lock tests stay separate.
import { join } from "node:path";
import { rmSync } from "node:fs";
import { startLocalServer, type LocalServer, type LocalServerOptions } from "../server/local-server.js";
import { processStartTime } from "../platform/process-start-time.js";
import { readJson, writeJsonAtomically } from "../state/state-files.js";
import type { InstanceLockContent } from "../state/instance-lock.js";

export async function startFixtureController(options: Omit<LocalServerOptions, "port"> & { port?: number }): Promise<{ server: LocalServer; port: number; release(): void }> {
  const server = await startLocalServer({ ...options, port: options.port ?? 0 });
  try {
    const port = Number(new URL(server.address).port);
    const start = await processStartTime(process.pid);
    if (!start) throw new Error("Fixture controller process identity is unavailable.");
    const path = join(options.engine.stateDirectory, "instance.lock");
    const identity: InstanceLockContent = { pid: process.pid, processStartTime: start, port };
    writeJsonAtomically(path, identity);
    let released = false;
    return { server, port, release: () => {
      if (released) return;
      released = true;
      const current = readJson<InstanceLockContent>(path);
      if (current?.pid === identity.pid && current.processStartTime === start && current.port === port) rmSync(path, { force: true });
    } };
  } catch (error) { await server.close(); throw error; }
}
