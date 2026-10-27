/** Cross-process admission: the hold and each tool's permission share one durable boundary. */
import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, openSync, closeSync, fsyncSync } from "node:fs";
import { join } from "node:path";
import { writeDurableMetadata } from "../control/durable-file.js";
import { processStartTime } from "../platform/process-start-time.js";
import { ensurePrivateDirectory } from "../state/state-files.js";
import { consumedUuids } from "./target.js";
import type { LiveTarget } from "./target.js";

export interface GateState {
  version: 1; target: LiveTarget; held?: { operationId: string; instructionId: string; requestedAt: string };
  inputs?: Record<string, { terminal: boolean }>; sealed?: boolean;
  observedAt: string; checkpoint?: string; obstacle?: string;
  operations: Record<string, { name: string; agentId?: string; parentId?: string; admittedAt: string; hookSettled?: boolean; settled?: boolean; response?: unknown }>;
  tasks: Record<string, { toolId?: string; settled: boolean }>;
  tracked: { pid: number; startTime: string }[];
}
export function gateDirectory(directory: string, attemptId: string): string {
  return join(directory, "live-attempts", createHash("sha256").update(attemptId).digest("hex"));
}
export function readGate(directory: string): GateState {
  const state = JSON.parse(readFileSync(join(directory, "gate.json"), "utf8")) as GateState;
  if (state.version !== 1 || !state.target || !state.operations || !state.tasks || !Array.isArray(state.tracked)) throw new Error("Attempt gate is unreadable or incompatible.");
  return state;
}
export function createGate(directory: string, target: LiveTarget): void {
  ensurePrivateDirectory(directory);
  writeDurableMetadata(join(directory, "gate.json"), { version: 1, target, observedAt: new Date().toISOString(), operations: {}, tasks: {}, tracked: [] } satisfies GateState);
}
function syncDirectory(directory: string): void {
  const fd = openSync(directory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
}
async function dead(pid: number, start: string): Promise<boolean> {
  const actual = await processStartTime(pid, { timeoutMs: 5000 });
  if (actual !== undefined) {
    if (actual !== start) throw new Error("Admission lock PID identity changed; ownership is unknown.");
    return false;
  }
  try { process.kill(pid, 0); return false; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") return true; throw e; }
}
export async function withGate<T>(directory: string, update: (state: GateState) => T): Promise<T> {
  const lock = join(directory, "admission.lock"); const ownerFile = join(lock, "owner.json");
  const deadline = Date.now() + 5000; const generation = randomUUID();
  const start = await processStartTime(process.pid, { timeoutMs: 5000 });
  if (!start) throw new Error("Cannot establish admission owner identity.");
  for (;;) {
    try {
      if (existsSync(join(directory, "recovery.lock"))) throw new Error("Admission recovery is unresolved.");
      mkdirSync(lock, { mode: 0o700 }); break;
    }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // Missing/partial identity is unknown; never break a lock by age.
      if (existsSync(ownerFile)) {
        const before = readFileSync(ownerFile, "utf8");
        const owner = JSON.parse(before) as { pid: number; start: string; generation: string };
        if (!Number.isSafeInteger(owner.pid) || !owner.start || !owner.generation) throw new Error("Admission owner identity is unknown.", { cause: e });
        if (await dead(owner.pid, owner.start)) {
          const recovery = join(directory, "recovery.lock");
          try { mkdirSync(recovery, { mode: 0o700 }); }
          catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Admission owner-death recovery is unresolved.", { cause: e }); throw e; }
          try {
            if (existsSync(ownerFile) && readFileSync(ownerFile, "utf8") === before) {
              unlinkSync(ownerFile); rmdirSync(lock); syncDirectory(directory);
            }
          } finally { rmdirSync(recovery); syncDirectory(directory); }
          continue;
        }
      }
      if (Date.now() >= deadline) throw new Error("Admission lock is unresolved; retry reconciliation.", { cause: e });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try {
    writeDurableMetadata(ownerFile, { pid: process.pid, start, generation }); syncDirectory(directory);
    const state = readGate(directory); const result = update(state);
    writeDurableMetadata(join(directory, "gate.json"), state);
    return result;
  } finally {
    // Never delete an unknown or replaced owner's claim.
    const owner = JSON.parse(readFileSync(ownerFile, "utf8")) as { generation: string };
    // eslint-disable-next-line no-unsafe-finally -- An ambiguous release must block the hook response, never grant permission.
    if (owner.generation !== generation) throw new Error("Admission owner generation changed; retained its lock.");
    else { unlinkSync(ownerFile); rmdirSync(lock); syncDirectory(directory); }
  }
}
export function unsettled(state: GateState): string[] {
  return [...Object.entries(state.operations).filter(([, o]) => !o.settled).map(([id, o]) => `${o.name} ${id}`), ...Object.entries(state.tasks).filter(([, t]) => !t.settled).map(([id]) => `task ${id}`)];
}
/** Provider evidence complements hooks: result echo alone never proves process release. */
export async function observeGate(directory: string, event: Record<string, unknown>): Promise<void> {
  await withGate(directory, state => {
    state.observedAt = new Date().toISOString();
    if (event.type === "result" && event.session_id === state.target.providerSessionId) for (const uuid of consumedUuids(event)) if (state.inputs?.[uuid]) state.inputs[uuid].terminal = true;
    if (event.type === "system" && typeof event.task_id === "string" && typeof event.run_id === "string") {
      const key = `${event.task_id}:${event.run_id}`;
      if (event.subtype === "task_started") state.tasks[key] ??= { ...(typeof event.tool_use_id === "string" ? { toolId: event.tool_use_id } : {}), settled: false };
      if (event.subtype === "task_notification" && ["completed", "failed", "stopped"].includes(String(event.status))) {
        state.tasks[key] = { ...state.tasks[key], settled: true };
        const id = typeof event.tool_use_id === "string" ? event.tool_use_id : state.tasks[key].toolId;
        const operation = id ? state.operations[id] : undefined;
        const response = operation?.response as { status?: string; agentId?: string } | undefined;
        if (operation?.hookSettled && response?.status === "async_launched" && response.agentId === event.task_id) operation.settled = true;
      }
    }
    const message = event.message as { content?: { type?: string; tool_use_id?: string; non_execution_kind?: string }[] } | undefined;
    if (event.type === "user" && Array.isArray(message?.content)) for (const block of message.content) {
      if (block.type !== "tool_result" || !block.tool_use_id) continue;
      const operation = state.operations[block.tool_use_id];
      if (operation?.hookSettled) {
        const response = event.tool_use_result as { status?: string; agentId?: string; isAsync?: boolean } | undefined;
        const hooked = operation.response as { status?: string; agentId?: string } | undefined;
        if (operation.name === "Agent" || operation.name === "Task") {
          if (response && ["completed", "failed", "stopped"].includes(String(response.status)) && typeof response.agentId === "string" && response.agentId === hooked?.agentId) operation.settled = true;
          if (response?.status === "async_launched") operation.settled = Object.values(state.tasks).some(t => t.toolId === block.tool_use_id && t.settled);
        } else operation.settled = true;
      }
      const denied = event.tool_result_meta as { id?: string; non_execution_kind?: string; permission_decision?: { source?: string } }[] | undefined;
      if (operation && denied?.some(m => m.id === block.tool_use_id && m.non_execution_kind === "permission-rule" && m.permission_decision?.source === "hook")) operation.settled = true;
    }
  });
}
