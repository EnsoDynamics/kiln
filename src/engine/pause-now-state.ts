/**
 * The engine side of the Pause now state (Kiln Pause Now technical design, "The Pause Now
 * State"): the gate-derived parts of the projection, the background-process lookup, and the
 * last thing the agent said. The engine adds what only it knows (whether the process runs,
 * the cancel offer) in `Engine.pauseNowView`.
 */
import type { GateState } from "../live/gate.js";
import { capLabel } from "../live/operation-label.js";
import type { OperationLabel } from "../live/pause-now.js";
import { runHelper } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import type { SavedEvent } from "../session/run-verdict.js";
import { SessionOutputReader, type StreamEvent } from "../session/session-output.js";

type Operation = GateState["operations"][string];
const labelOf = (operation: Operation): OperationLabel => operation.label ?? { tool: operation.name };
const topLevel = (operation: Operation): boolean => operation.agentId === undefined;
const byAdmission = (a: [string, Operation], b: [string, Operation]) => Date.parse(a[1].admittedAt) - Date.parse(b[1].admittedAt);

/** Top-level operations unsettled and not backgrounded, oldest first. An Agent or Task stands for its subagent's work. */
export function runningOperations(gate: GateState): OperationLabel[] {
  return Object.entries(gate.operations).filter(([, o]) => topLevel(o) && !o.settled && !o.backgrounded).sort(byAdmission).map(([, o]) => labelOf(o));
}

/** The newest-admitted top-level operation in the hold's in-flight list, leaving out any since backgrounded. */
export function lastCommandOf(gate: GateState): OperationLabel | undefined {
  const inFlight = gate.held?.inFlight ?? [];
  const candidates = inFlight.map(id => [id, gate.operations[id]] as [string, Operation | undefined]).filter((entry): entry is [string, Operation] => !!entry[1] && topLevel(entry[1]) && !entry[1].backgrounded).sort(byAdmission);
  const last = candidates.at(-1);
  return last ? labelOf(last[1]) : undefined;
}

/**
 * Kind 1 of the background entries, while Claude's process runs: each backgrounded operation
 * whose task is still unsettled, once the stop has happened or Claude's turn has ended (the gate
 * saw a result, every tracked input is answered, and every unsettled top-level operation is
 * backgrounded). No pid: the gate keeps none for a task.
 */
export function backgroundedWork(gate: GateState, stopped: boolean): { command?: string }[] {
  const unsettledTask = (id: string) => Object.values(gate.tasks).some(t => t.toolId === id && !t.settled && !t.ambient);
  const entries = Object.entries(gate.operations).filter(([id, o]) => topLevel(o) && o.backgrounded && unsettledTask(id)).sort(byAdmission);
  if (!entries.length) return [];
  const turnEnded = !!gate.turnEndedAt && Object.values(gate.inputs ?? {}).every(input => input.terminal) && Object.values(gate.operations).filter(o => topLevel(o) && !o.settled).every(o => o.backgrounded);
  if (!stopped && !turnEnded) return [];
  return entries.map(([, o]) => (o.label?.input ? { command: o.label.input } : {}));
}

/**
 * Kind 2, once Claude's own process has exited and Kiln's last observation of it has finished:
 * each tracked process still alive under its recorded start identity, with its command line when
 * readable, capped at 200 characters. One `ps -ww` call; no signal is ever sent.
 */
export async function aliveTrackedProcesses(tracked: GateState["tracked"]): Promise<{ pid: number; command?: string }[]> {
  const alive: number[] = [];
  for (const identity of tracked) if (await processStartTime(identity.pid, { timeoutMs: 5000 }) === identity.startTime) alive.push(identity.pid);
  if (!alive.length) return [];
  const commands = new Map<number, string>();
  const ps = await runHelper("/bin/ps", ["-ww", "-o", "pid=,command=", "-p", alive.join(",")], { cwd: process.cwd(), timeoutMs: 5000 });
  if (!ps.failure) for (const line of ps.stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (match) commands.set(Number(match[1]), capLabel(match[2]!.trim()));
  }
  return alive.map(pid => (commands.has(pid) ? { pid, command: commands.get(pid)! } : { pid }));
}

/** A hook's refusal of a tool call, as the saved user event carries it. */
function refusedByHook(event: StreamEvent): boolean {
  const meta = (event as Record<string, unknown>).tool_result_meta as { non_execution_kind?: string; permission_decision?: { source?: string } }[] | undefined;
  return Array.isArray(meta) && meta.some(m => m.non_execution_kind === "permission-rule" && m.permission_decision?.source === "hook");
}

/**
 * The newest top-level Claude output line before the stop: at or before `stop.at` for a deny or
 * yield; for a seal (which can come mid-turn), before the first tool call the hook refused after
 * it, or the newest in the run when there is none; the newest in the run when the attempt ended
 * without a gate stop. Never the run's result text; shortened by the view.
 */
export function lastSaidOf(events: SavedEvent[], stop: GateState["stop"]): string | undefined {
  let cut: string | undefined;
  if (stop?.by === "deny" || stop?.by === "yield") cut = stop.at;
  else if (stop?.by === "seal") cut = events.find(saved => saved.at > stop.at && saved.event.type === "user" && refusedByHook(saved.event as StreamEvent))?.at;
  const reader = new SessionOutputReader();
  let said: string | undefined;
  for (const saved of events) {
    if (cut !== undefined && (stop?.by === "seal" ? saved.at >= cut : saved.at > cut)) break;
    for (const line of reader.readEvent(saved.event as StreamEvent, saved.at)) if (line.source === "claude" && line.text.trim()) said = line.text.trim();
  }
  return said;
}
