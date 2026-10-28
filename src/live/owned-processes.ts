/** Retain exact identities we observe under the attempt; never signal a takeover child. */
import { runHelper } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import { readGate, withGate } from "./gate.js";

/** Also used after scanner shutdown: inventory success alone cannot release observed work. */
export async function captureOwnedProcesses(directory: string, pid: number, startTime: string): Promise<void> {
  try {
    const gate = readGate(directory);
    // An older scanner's obstacle may stand for observations it never saved.
    // A new inventory cannot reconstruct descendants which have since reparented.
    if (gate.obstacle && !gate.processObservations) throw new Error(gate.obstacle);
    await withGate(directory, state => { state.version = 2; state.processObservations ??= []; });
    const result = await runHelper("/bin/ps", ["-A", "-o", "pid=,ppid="], { cwd: process.cwd(), timeoutMs: 5000 });
    if (result.failure || result.exitCode !== 0) throw new Error("Tracked process inventory is unavailable; retry release checks.");
    const rows = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
      if (!match) throw new Error("Tracked process inventory is unreadable; retry release checks.");
      return [Number(match[1]), Number(match[2])] as const;
    });
    // Capture conservatively from saved owners before any identity read can
    // fail. Release still validates each exact PID/start identity separately.
    const parents = new Set([pid, ...gate.tracked.map(p => p.pid), ...(gate.processObservations ?? [])]);
    // Save every observed descendant before reading any new identity. A failure
    // on the first lookup cannot discard the remaining observed siblings.
    const observed = new Set<number>();
    for (let changed = true; changed;) {
      changed = false;
      for (const [child, parent] of rows) if (parents.has(parent) && !parents.has(child)) {
        parents.add(child); observed.add(child); changed = true;
      }
    }
    await withGate(directory, state => {
      for (const child of observed) if (!state.processObservations!.includes(child)) state.processObservations!.push(child);
    });
    const rootStart = await processStartTime(pid, { timeoutMs: 5000 });
    if (rootStart !== undefined && rootStart !== startTime) throw new Error("Tracked root PID was reused; its ownership remains unresolved.");
    for (const child of readGate(directory).processObservations!) {
      const identity = await processStartTime(child, { timeoutMs: 5000 });
      if (!identity) {
        // A blank start time is not disappearance. Only ESRCH proves exit.
        try { process.kill(child, 0); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          await withGate(directory, state => { state.processObservations = state.processObservations!.filter(p => p !== child); });
          continue;
        }
        throw new Error(`Observed process ${child} exists but its start identity is unavailable; retry release checks.`);
      }
      await withGate(directory, state => {
        if (!state.tracked.some(p => p.pid === child && p.startTime === identity)) state.tracked.push({ pid: child, startTime: identity });
        state.processObservations = state.processObservations!.filter(p => p !== child);
      });
    }
    if (readGate(directory).tracked.length > 4096) throw new Error("Tracked process count exceeds the supported release bound.");
    await withGate(directory, state => { delete state.obstacle; });
  } catch (error) {
    await withGate(directory, state => { state.obstacle = (error as Error).message; });
    throw error;
  }
}

export class LiveOwnedProcesses {
  private timer: NodeJS.Timeout | undefined;
  private reading: Promise<void> | undefined;
  constructor(private directory: string, private pid: number, private startTime: string) {}
  start(): void {
    const scan = () => {
      if (this.reading) return;
      this.reading = captureOwnedProcesses(this.directory, this.pid, this.startTime).catch(() => {
        // capture persisted the concrete obstacle; reconciliation retries it.
      }).finally(() => { this.reading = undefined; });
    };
    scan(); this.timer = setInterval(scan, 250); this.timer.unref();
  }
  async close(): Promise<void> { clearInterval(this.timer); await this.reading; }
}
