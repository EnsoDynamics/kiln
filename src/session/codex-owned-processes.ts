// Remember descendant identities while the parent exists, including detached tool groups.
import { fileURLToPath } from "node:url";
import { spawnDetached } from "../platform/helper-process.js";
import { endProcessTree, HELPER_TIMEOUT_MS, type HelperResult } from "../platform/helper-process.js";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";
import type { SessionRun } from "../state/records.js";

export class CodexOwnedProcesses {
  private timer: NodeJS.Timeout | undefined;
  private scan: Promise<void> = Promise.resolve();
  private scanning = false;
  failure: Error | undefined;
  constructor(private run: SessionRun, private save: () => void, private onFailure: (error: Error) => void) {}
  async start(): Promise<void> {
    await this.capture();
    this.timer = setInterval(() => {
      if (this.scanning) return;
      this.scanning = true;
      this.scan = this.capture().catch(error => { this.failure ??= error as Error; this.onFailure(this.failure); }).finally(() => { this.scanning = false; });
    }, 250);
    this.timer.unref();
  }
  private async capture(): Promise<void> {
    if (!this.run.pid || !this.run.codex) return;
    // Windows kernel Job Object membership survives reparenting; repeated CIM processes
    // would add no ownership and can otherwise outlive the interruption grace.
    if (process.platform === "win32") return;
    const inventory = await processInventory(this.run);
    const processes = inventory.processes;
    const owned = this.run.codex.ownedProcesses ??= [];
    const livePids = new Set(processes.map(row => row[0]));
    for (let i = owned.length - 1; i >= 0; i--) if (!livePids.has(owned[i]!.pid)) owned.splice(i, 1);
    for (const entry of await markedProcesses(this.run, inventory.owned)) if (!owned.some(process => process.pid === entry.pid && process.startTime === entry.startTime)) { owned.push(entry); this.save(); }
    const parents = new Set<number>();
    if (await isProcessLive(this.run.pid, this.run.processStartTime)) parents.add(this.run.pid);
    for (const process of owned) if (await isProcessLive(process.pid, process.startTime)) parents.add(process.pid);
    for (let changed = true; changed;) {
      changed = false;
      for (const [pid, parent] of processes) if (parents.has(parent!) && !parents.has(pid!)) {
        const startTime = await processStartTime(pid!);
        if (!startTime) continue;
        parents.add(pid!); changed = true;
        if (!owned.some(process => process.pid === pid && process.startTime === startTime)) { owned.push({ pid: pid!, startTime }); this.save(); }
        if (owned.length > 4096) throw new Error("Codex process tree exceeds the supported bound.");
      }
    }
  }
  async close(): Promise<void> { clearInterval(this.timer); await this.scan; }
}

/** PID reuse never authorizes termination. Missing ownership is an actionable failure. */
export async function stopCodexOwnedProcesses(run: SessionRun, graceMs = 5000): Promise<void> {
  const owned = [...(run.codex?.ownedProcesses ?? [])];
  let ownershipError: unknown;
  try { for (const entry of await markedProcesses(run)) if (!owned.some(process => process.pid === entry.pid && process.startTime === entry.startTime)) owned.push(entry); } catch (error) { ownershipError = error; }
  if (run.pid !== undefined) {
    if (!run.processStartTime) {
      let gone = false;
      try { process.kill(run.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") gone = true; else throw error; }
      if (!gone) throw new Error("Codex process ownership was not persisted. Stop that process in a terminal before resuming.");
    }
    else owned.unshift({ pid: run.pid, startTime: run.processStartTime });
  }
  const live = async () => {
    const states = await Promise.all(owned.map(async entry => ({ ...entry, live: await isProcessLive(entry.pid, entry.startTime) })));
    return states.filter(entry => entry.live);
  };
  for (const entry of await live()) {
    await endProcessTree(entry.pid, "SIGTERM");
    if (process.platform !== "win32" && await isProcessLive(entry.pid, entry.startTime)) { try { process.kill(entry.pid, "SIGTERM"); } catch { /* Exited between identity check and signal. */ } }
  }
  const deadline = Date.now() + graceMs;
  while ((await live()).length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  for (const entry of await live()) {
    await endProcessTree(entry.pid, "SIGKILL");
    if (process.platform !== "win32" && await isProcessLive(entry.pid, entry.startTime)) { try { process.kill(entry.pid, "SIGKILL"); } catch { /* Already gone. */ } }
  }
  const finalDeadline = Date.now() + 1000;
  while ((await live()).length && Date.now() < finalDeadline) await new Promise(resolve => setTimeout(resolve, 50));
  if ((await live()).length) throw new Error("Codex tool processes remain alive; close them before resuming.");
  if (ownershipError) throw ownershipError;
}

interface ProcessInventory { processes: [number, number][]; owned: number[] }
async function processInventory(run: SessionRun): Promise<ProcessInventory> {
  if (!run.codex?.processOwner) throw new Error("Codex process owner is missing.");
  const child = spawnDetached(process.execPath, [fileURLToPath(new URL("../../prompts/codex-process-owners.mjs", import.meta.url))], { cwd: process.cwd(), env: process.env, stdin: "pipe" });
  return new Promise<ProcessInventory>((resolve, reject) => {
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { void endProcessTree(child.pid, "SIGKILL"); reject(processCheckFailure("Codex ownership helper did not respond within its startup/transport deadline.", "Ownership helper", { exitCode: null, failure: "timeout", stderr })); }, HELPER_TIMEOUT_MS);
    child.stdout!.setEncoding("utf8"); child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (text: string) => { stderr = (stderr + text).slice(0, 2048); });
    child.stdout!.on("data", (text: string) => { stdout += text; if (stdout.length > 2 * 1024 * 1024) { void endProcessTree(child.pid, "SIGKILL"); reject(new Error("Codex ownership query exceeds its bound.")); } });
    child.on("error", reject); child.stdin!.on("error", reject);
    child.on("close", (code, signal) => { clearTimeout(timer); if (code !== 0) reject(processCheckFailure("Could not establish Codex process ownership.", "Ownership helper", { exitCode: code, stderr, ...(signal ? { failure: `ended by ${signal}` } : {}) })); else { try {
      const value = JSON.parse(stdout) as ProcessInventory;
      if (!value || Object.keys(value).length !== 2 || !Array.isArray(value.processes) || !value.processes.length || value.processes.length > 65536 || !value.processes.every(row => Array.isArray(row) && row.length === 2 && Number.isInteger(row[0]) && row[0] > 0 && Number.isInteger(row[1]) && row[1] >= 0) || new Set(value.processes.map(row => row[0])).size !== value.processes.length || !Array.isArray(value.owned) || value.owned.length > 4096 || new Set(value.owned).size !== value.owned.length || !value.owned.every(id => Number.isInteger(id) && id > 0 && value.processes.some(row => row[0] === id))) throw new Error("Invalid process ownership result.");
      resolve(value);
    } catch (error) { reject(error); } } });
    child.stdin!.end(JSON.stringify({ owner: run.codex!.processOwner }));
  });
}

async function markedProcesses(run: SessionRun, observed?: number[]): Promise<{ pid: number; startTime: string }[]> {
  if (!run.codex?.processOwner || process.platform === "win32") return [];
  const pids = observed ?? (await processInventory(run)).owned;
  const result: { pid: number; startTime: string }[] = [];
  for (const pid of pids) { const startTime = await processStartTime(pid); if (startTime) result.push({ pid, startTime }); }
  return result;
}

/** Never include ps stdout: the ownership query reads other processes' environments. */
function processCheckFailure(message: string, command: string, result: Pick<HelperResult, "exitCode" | "failure" | "stderr">): Error {
  const status = result.exitCode === null ? result.failure ?? "no exit status" : `exit ${result.exitCode}`;
  const stderr = result.stderr.slice(0, 2048).replace(/\p{Cc}/gu, " ").trim();
  return new Error(`${message} ${command}: ${status}${stderr ? `; ${stderr}` : "."}`);
}
