/** Cross-process admission: the hold and each tool's permission share one durable boundary. */
import { randomUUID, createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, rmSync, symlinkSync, unlinkSync, openSync, closeSync, fsyncSync } from "node:fs";
import { join } from "node:path";
import { writeDurableMetadata } from "../control/durable-file.js";
import { processStartTime } from "../platform/process-start-time.js";
import { ensurePrivateDirectory } from "../state/state-files.js";
import { consumedUuids } from "./target.js";
import type { LiveTarget } from "./target.js";

export interface GateState {
  version: 1 | 2; target: LiveTarget;
  /** `inFlight`: the operation IDs admitted and unsettled when the hold was accepted (Kiln Pause Now, "lastCommand"). */
  held?: { operationId: string; instructionId: string; requestedAt: string; inFlight?: string[] };
  inputs?: Record<string, { terminal: boolean }>; sealed?: boolean;
  observedAt: string; checkpoint?: string; obstacle?: string;
  /** The stop (Kiln Pause Now, "The Stop and Cancel"): written once, by the first response that acts on the hold. Bound to the hold's operation ID. */
  stop?: { at: string; by: "deny" | "yield" | "seal"; operationId: string };
  /** Set on a `result` for the target conversation, cleared by a later `assistant` event or newly admitted input. */
  turnEndedAt?: string;
  /** `label`: the tool and its main input at admission, for display only. `backgrounded`: its tool result arrived while a task it started was unsettled. */
  operations: Record<string, { name: string; agentId?: string; parentId?: string; admittedAt: string; hookSettled?: boolean; settled?: boolean; response?: unknown; resultSeen?: boolean; label?: { tool: string; input?: string }; backgrounded?: boolean }>;
  tasks: Record<string, { toolId?: string; settled: boolean; ambient?: boolean }>;
  tracked: { pid: number; startTime: string }[];
  /** Observed descendant PIDs awaiting identity or conclusive disappearance. */
  processObservations?: number[];
  /** Written by the checkpoint hook when its input is in a form Kiln doesn't recognise (Takeover hook recognition). */
  contract?: { state: "unrecognised"; detail: string; at: string };
  /** Written by the engine when a receipt field is in a form Kiln doesn't recognise (Live message recognition); admission refuses from then on. */
  messageContract?: { state: "unrecognised"; detail: string; at: string };
}
export function gateDirectory(directory: string, attemptId: string): string {
  return join(directory, "live-attempts", createHash("sha256").update(attemptId).digest("hex"));
}
export function readGate(directory: string): GateState {
  const state = JSON.parse(readFileSync(join(directory, "gate.json"), "utf8")) as GateState;
  if (![1, 2].includes(state.version) || !state.target || !state.operations || !state.tasks || !Array.isArray(state.tracked) || state.processObservations !== undefined && (!Array.isArray(state.processObservations) || !state.processObservations.every(pid => Number.isSafeInteger(pid) && pid > 0))) throw new Error("Attempt gate is unreadable or incompatible.");
  return state;
}
export function createGate(directory: string, target: LiveTarget): void {
  ensurePrivateDirectory(directory);
  writeDurableMetadata(join(directory, "gate.json"), { version: 2, target, observedAt: new Date().toISOString(), operations: {}, tasks: {}, tracked: [] } satisfies GateState);
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
/** A path through the lock that came free while it was read is absent; macOS can report that as EINVAL. */
const gone = (e: unknown) => ["ENOENT", "ENOTDIR", "EINVAL"].includes(String((e as NodeJS.ErrnoException).code));
function readIfPresent(path: string): string | undefined {
  try { return readFileSync(path, "utf8"); }
  catch (e) { if (gone(e)) return undefined; throw e; }
}
const CLAIM = /^admission\.owner\.[0-9a-f-]+$/;
/** The name an earlier Kiln's lock owner takes inside the claim of the helper that took over from it. */
const LEGACY_OWNER = "admission.legacy-owner";
interface Holder { pid: number; start: string; take: string; as: string; lock: "symlink" | "directory" }
function ownerIn(text: string | undefined): { pid: number; start: string } | undefined {
  if (text === undefined) return undefined;
  try {
    const owner = JSON.parse(text) as { pid: number; start: string; generation: string };
    return Number.isSafeInteger(owner.pid) && owner.start && owner.generation ? { pid: owner.pid, start: owner.start } : undefined;
  } catch { return undefined; }
}
function entries(directory: string): { name: string; isDirectory(): boolean }[] {
  try { return readdirSync(directory, { withFileTypes: true }); }
  catch (e) { if (gone(e)) return []; throw e; }
}
/**
 * Whether a claim holds `name`, taken over from a dead holder, directly or through claims it took
 * in turn. A chain grows by one only when a taker is killed between its take and freeing the lock.
 */
function holds(claim: string, name: string, depth = 16): boolean {
  return depth > 0 && entries(claim).some(entry => entry.name === name || entry.isDirectory() && CLAIM.test(entry.name) && holds(join(claim, entry.name), name, depth - 1));
}
/** The top-level claim that is `name`, or that took it over. */
function claimHolder(directory: string, name: string, lock: Holder["lock"]): Holder | undefined {
  const claims = entries(directory).filter(entry => entry.isDirectory() && CLAIM.test(entry.name));
  const top = claims.find(entry => entry.name === name) ?? claims.find(entry => holds(join(directory, entry.name), name));
  const owner = top && ownerIn(readIfPresent(join(directory, top.name, "holder.json")));
  return owner && { ...owner, take: join(directory, top.name), as: top.name, lock };
}
/**
 * Who holds the lock, and the path whose rename into a claim takes over from them; undefined
 * when that is unknown or the lock has just come free.
 */
function lockHolder(directory: string, lock: string): Holder | undefined {
  let link: boolean;
  try { link = lstatSync(lock).isSymbolicLink(); }
  catch (e) { if (gone(e)) return undefined; throw e; }
  if (link) {
    let target: string;
    try { target = readlinkSync(lock); }
    catch (e) { if (gone(e)) return undefined; throw e; }
    return CLAIM.test(target) ? claimHolder(directory, target, "symlink") : undefined;
  }
  // Kiln 1.5.1 and earlier made the lock directory, then wrote its owner inside. A helper that
  // died between the two left its identity only in that write's one temporary file, if at all.
  const names = entries(lock).map(entry => entry.name);
  const pending = names.filter(name => /^owner\.json\.[0-9a-f-]+\.tmp$/.test(name));
  const identity = names.includes("owner.json") ? "owner.json" : pending.length === 1 ? pending[0] : undefined;
  if (identity === undefined) return claimHolder(directory, LEGACY_OWNER, "directory");
  const owner = ownerIn(readIfPresent(join(lock, identity)));
  return owner && { ...owner, take: join(lock, identity), as: LEGACY_OWNER, lock: "directory" };
}
/** Whether the lock is still the one whose holder was taken into `taken`. */
function stillHeld(lock: string, holder: Holder, taken: string): boolean {
  let link: boolean;
  try { link = lstatSync(lock).isSymbolicLink(); }
  catch (e) { if (gone(e)) return false; throw e; }
  if (holder.lock === "directory") return !link;
  if (!link) return false;
  let target: string;
  try { target = readlinkSync(lock); }
  catch (e) { if (gone(e)) return false; throw e; }
  return target === holder.as || holds(taken, target);
}
/**
 * The lock is published already owned: the owner record is made durable in a private claim
 * directory, then a symlink to that claim is created at the lock path, which fails if anything is
 * there. Taking over from a dead holder renames the holder's record into the taker's own claim,
 * which only one contender can win, and a taker killed before it frees the lock is then the
 * holder. A helper killed at any point leaves either no lock or one whose holder is recorded.
 */
export async function withGate<T>(directory: string, update: (state: GateState) => T): Promise<T> {
  // The claim's record is not named owner.json, so an earlier Kiln's lock path can never reach it
  // through this release's symlink: an earlier Kiln reads such a lock as unknown and waits.
  const lock = join(directory, "admission.lock"); const ownerFile = join(lock, "holder.json");
  const deadline = Date.now() + 5000; const generation = randomUUID();
  const start = await processStartTime(process.pid, { timeoutMs: 5000 });
  if (!start) throw new Error("Cannot establish admission owner identity.");
  const claimName = `admission.owner.${generation}`; const claim = join(directory, claimName);
  mkdirSync(claim, { mode: 0o700 });
  // Once this claim holds a dead holder's record it is the lock's holder, until the lock is freed.
  let holding = false;
  try {
    writeDurableMetadata(join(claim, "holder.json"), { pid: process.pid, start, generation }); syncDirectory(directory);
    for (;;) {
      try { symlinkSync(claimName, lock); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        // Missing/partial identity is unknown; never break a lock by age.
        // The holder may release between the symlink and this read: that is the lock coming free.
        const holder = lockHolder(directory, lock);
        if (holder && await dead(holder.pid, holder.start)) {
          try { renameSync(holder.take, join(claim, holder.as)); }
          catch (e) { if (gone(e)) continue; throw e; }
          const taken = join(claim, holder.as);
          // A holder killed after freeing the lock left its claim behind; taking it proves nothing
          // about the lock. The lock is this claim's to free only if it names what was taken, and
          // then no one else can change it.
          if (!stillHeld(lock, holder, taken)) { rmSync(taken, { recursive: true, force: true }); continue; }
          holding = true; syncDirectory(claim); syncDirectory(directory);
          if (holder.lock === "symlink") unlinkSync(lock); else rmdirSync(lock);
          syncDirectory(directory); holding = false;
          rmSync(taken, { recursive: true, force: true });
          continue;
        }
        if (Date.now() >= deadline) throw new Error("Admission lock is unresolved; retry reconciliation.", { cause: e });
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
  } catch (e) { if (!holding) rmSync(claim, { recursive: true, force: true }); throw e; }
  try {
    syncDirectory(directory);
    const state = readGate(directory); const result = update(state);
    writeDurableMetadata(join(directory, "gate.json"), state);
    return result;
  } finally {
    // Never delete an unknown or replaced owner's claim.
    const owner = JSON.parse(readFileSync(ownerFile, "utf8")) as { generation: string };
    // eslint-disable-next-line no-unsafe-finally -- An ambiguous release must block the hook response, never grant permission.
    if (owner.generation !== generation) throw new Error("Admission owner generation changed; retained its lock.");
    else { unlinkSync(lock); syncDirectory(directory); rmSync(claim, { recursive: true, force: true }); }
  }
}
/** Records the stop the first time a response acts on the hold; later responses leave it as written. */
export function recordStop(state: GateState, by: "deny" | "yield" | "seal", at: string): void {
  if (state.held && !state.stop) state.stop = { at, by, operationId: state.held.operationId };
}
/** An operation's tool result settles it; an Agent or Task only once its agent has ended. */
export function settleByResult(state: GateState, id: string, response: { status?: string; agentId?: string } | undefined): void {
  const operation = state.operations[id]!;
  const hooked = operation.response as { status?: string; agentId?: string } | undefined;
  if (operation.name === "Agent" || operation.name === "Task") {
    if (response && ["completed", "failed", "stopped"].includes(String(response.status)) && typeof response.agentId === "string" && response.agentId === hooked?.agentId) operation.settled = true;
    if (response?.status === "async_launched") operation.settled = Object.values(state.tasks).some(t => t.toolId === id && t.settled);
  } else operation.settled = true;
}
/** The hook contract became unrecognised: results already seen in the stream settle their operations. */
export function settleSeenResults(state: GateState): void {
  for (const [id, operation] of Object.entries(state.operations)) if (operation.resultSeen && !operation.hookSettled && !operation.settled) settleByResult(state, id, operation.response as { status?: string; agentId?: string } | undefined);
}
export function unsettled(state: GateState): string[] {
  return [...Object.entries(state.operations).filter(([, o]) => !o.settled).map(([id, o]) => `${o.name} ${id}`), ...Object.entries(state.tasks).filter(([, t]) => !t.settled && !t.ambient).map(([id]) => `task ${id}`)];
}
/** Provider evidence complements hooks: result echo alone never proves process release.
 * Replay supplies the original time; undated evidence repairs accounting without inventing activity. */
export async function observeGate(directory: string, event: Record<string, unknown>, observedAt: string | undefined): Promise<void> {
  await withGate(directory, state => {
    if (observedAt && Date.parse(observedAt) > Date.parse(state.observedAt)) state.observedAt = observedAt;
    if (event.type === "result" && event.session_id === state.target.providerSessionId) {
      for (const uuid of consumedUuids(event)) if (state.inputs?.[uuid]) state.inputs[uuid].terminal = true;
      state.turnEndedAt = observedAt ?? state.observedAt;
    }
    // Any later assistant event, including a turn Claude starts on its own (a background task's completion notice), clears it.
    if (event.type === "assistant") delete state.turnEndedAt;
    // Ambient housekeeping/live-update watchers are explicitly not activity.
    // Preserve terminal settlement and use snapshots to track ambient changes;
    // snapshots and task-start bookends may arrive in either order.
    if (event.type === "system" && event.subtype === "background_tasks_changed" && Array.isArray(event.tasks)) {
      for (const task of event.tasks as { task_id?: string; run_id?: string; ambient?: boolean }[]) {
        if (!task || typeof task.task_id !== "string" || typeof task.run_id !== "string") continue;
        const key = `${task.task_id}:${task.run_id}`;
        state.tasks[key] = { ...state.tasks[key], settled: state.tasks[key]?.settled ?? false, ambient: task.ambient === true };
      }
    }
    if (event.type === "system" && typeof event.task_id === "string" && typeof event.run_id === "string") {
      const key = `${event.task_id}:${event.run_id}`;
      if (event.subtype === "task_started") {
        state.tasks[key] ??= { settled: false, ...(event.ambient === true ? { ambient: true } : {}) };
        if (typeof event.tool_use_id === "string") state.tasks[key].toolId = event.tool_use_id;
      }
      if (event.subtype === "task_notification" && ["completed", "failed", "stopped"].includes(String(event.status))) {
        state.tasks[key] = { ...state.tasks[key], settled: true };
        const id = typeof event.tool_use_id === "string" ? event.tool_use_id : state.tasks[key].toolId;
        const operation = id ? state.operations[id] : undefined;
        const response = operation?.response as { status?: string; agentId?: string } | undefined;
        if ((operation?.hookSettled || operation && state.contract?.state === "unrecognised") && response?.status === "async_launched" && response.agentId === event.task_id) operation.settled = true;
      }
    }
    const message = event.message as { content?: { type?: string; tool_use_id?: string; non_execution_kind?: string }[] } | undefined;
    if (event.type === "user" && Array.isArray(message?.content)) for (const block of message.content) {
      if (block.type !== "tool_result" || !block.tool_use_id) continue;
      const operation = state.operations[block.tool_use_id];
      if (operation) {
        const response = event.tool_use_result as { status?: string; agentId?: string } | undefined;
        // A tool result that arrives while a non-ambient task the call started is unsettled: the
        // "running in background" result of a background Bash. Agent and Task wait for their subagent.
        if (!operation.backgrounded && operation.name !== "Agent" && operation.name !== "Task" && Object.values(state.tasks).some(t => t.toolId === block.tool_use_id && !t.settled && !t.ambient)) operation.backgrounded = true;
        // Kept for the case where the hook contract turns out unrecognised after this result arrived.
        if (!operation.hookSettled) { operation.resultSeen = true; if (response) operation.response ??= response; }
        // Once the hook contract is unrecognised, the hook may never settle an operation it
        // admitted; its tool result in the stream settles it, so it never keeps input open.
        if (operation.hookSettled || state.contract) settleByResult(state, block.tool_use_id, response);
      }
      // A rejected tool never ran and never gets PostToolUse: a hook's denial, or any decision
      // `reject`, such as the auto-mode classifier's (`automode-blocked`).
      const denied = event.tool_result_meta as { id?: string; non_execution_kind?: string; permission_decision?: { source?: string; decision?: string } }[] | undefined;
      if (operation && denied?.some(m => m.id === block.tool_use_id && (m.permission_decision?.decision === "reject" || m.non_execution_kind === "permission-rule" && m.permission_decision?.source === "hook"))) operation.settled = true;
    }
  });
}
