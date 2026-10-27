/** Retain exact identities we observe under the attempt; never signal a takeover child. */
import { runHelper } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import { readGate, withGate } from "./gate.js";
export class LiveOwnedProcesses {
  private timer: NodeJS.Timeout | undefined;
  private reading: Promise<void> | undefined;
  constructor(private directory: string, private pid: number, private startTime: string) {}
  start(): void {
    const scan = () => {
      if (this.reading) return;
      this.reading = this.capture().catch(async error => { await withGate(this.directory, state => { state.obstacle = (error as Error).message; }); }).finally(() => { this.reading = undefined; });
    };
    scan(); this.timer = setInterval(scan, 250); this.timer.unref();
  }
  private async capture(): Promise<void> {
    const result = await runHelper("/bin/ps", ["-A", "-o", "pid=,ppid="], { cwd: process.cwd(), timeoutMs: 5000 });
    if (result.failure || result.exitCode !== 0) throw new Error("Tracked process inventory is unavailable; retry release checks.");
    const rows = result.stdout.trim().split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number));
    const gate = readGate(this.directory);
    const parents = new Set<number>();
    if (await processStartTime(this.pid, { timeoutMs: 5000 }) === this.startTime) parents.add(this.pid);
    for (const identity of gate.tracked) if (await processStartTime(identity.pid, { timeoutMs: 5000 }) === identity.startTime) parents.add(identity.pid);
    const added: { pid: number; startTime: string }[] = [];
    for (let changed = true; changed;) {
      changed = false;
      for (const [pid, parent] of rows) if (pid && parent && parents.has(parent) && !parents.has(pid)) {
        const startTime = await processStartTime(pid, { timeoutMs: 5000 });
        if (!startTime) continue;
        parents.add(pid); changed = true;
        if (!gate.tracked.some(p => p.pid === pid && p.startTime === startTime)) added.push({ pid, startTime });
      }
    }
    await withGate(this.directory, state => {
      for (const identity of added) if (!state.tracked.some(p => p.pid === identity.pid && p.startTime === identity.startTime)) state.tracked.push(identity);
      delete state.obstacle;
      if (state.tracked.length > 4096) throw new Error("Tracked process count exceeds the supported release bound.");
    });
  }
  async close(): Promise<void> { clearInterval(this.timer); await this.reading; }
}
