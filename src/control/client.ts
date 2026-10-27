import { join } from "node:path";
import { existsSync } from "node:fs";
import { processStartTime } from "../platform/process-start-time.js";
import type { InstanceLockContent } from "../state/instance-lock.js";
import { privateJson, enumerateWork, targetWork, type SavedWork } from "./private-state.js";
import { accountFacts, handoffProjection, statusProjection } from "./projection.js";
import { readHistory, chooseSession } from "./history.js";
import { outputPage, LOG_BYTES } from "./logs.js";
import { commandHelp, parseCommand } from "./help.js";
import { ControlFailure, errorFact, failed, exitFor, result, serialize, type Result } from "./result.js";
import type { CommandContext } from "../kiln-command.js";

interface Capability { protocol_major: number; execution_id: string; prd_path: string; instance: { pid: number; process_start_time: string | null }; features: string[] }
interface Controller { state: "reachable" | "stopped" | "unreachable" | "incompatible"; address?: string; error?: string }
async function controller(work: SavedWork, deadline = Date.now() + 2000): Promise<Controller> {
  const path = join(work.directory, "instance.lock");
  if (!existsSync(path)) return { state: "stopped" };
  const lock = privateJson<InstanceLockContent>(work.root, path);
  if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0 || !Number.isInteger(lock.port) || lock.port < 1 || lock.port > 65535 || typeof lock.processStartTime !== "string") throw new ControlFailure("state_unavailable", "Saved controller identity is malformed.");
  const address = `http://127.0.0.1:${lock.port}`;
  try {
    const response = await fetch(`${address}/api/control/v1/capabilities`, { headers: { "X-Kiln-Token": work.record.token }, redirect: "error", signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    if (!response.ok) return { state: "incompatible", error: "Controller does not support the authenticated inspection protocol. Restart it with the updated Kiln." };
    const cap = await response.json() as Capability;
    if (cap.protocol_major !== 1 || cap.execution_id !== work.record.executionId || cap.prd_path !== work.canonical || cap.instance?.pid !== lock.pid || (cap.instance.process_start_time && cap.instance.process_start_time !== lock.processStartTime)) return { state: "incompatible", error: "Controller protocol or saved execution identity does not match; no controls attempted." };
    return { state: "reachable", address };
  } catch {
    // Process identity is a secondary check; successful authenticated identity needs no ps access.
    const start = await processStartTime(lock.pid, { timeoutMs: Math.max(1, deadline - Date.now()) }).catch(() => undefined);
    if (start && start !== lock.processStartTime) return { state: "stopped" };
    try { process.kill(lock.pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") return { state: "stopped" }; }
    return { state: "unreachable", error: "Known controller could not be authenticated within its probe deadline." };
  }
}
async function request(work: SavedWork, owner: Controller, route: string, timeout = 5000, refresh = false): Promise<Result> {
  try {
    const response = await fetch(`${owner.address}/api/control/v1/${route}`, { method: refresh ? "POST" : "GET", headers: { "X-Kiln-Token": work.record.token, ...(refresh ? { Origin: owner.address! } : {}) }, redirect: "error", signal: AbortSignal.timeout(timeout) });
    const answer = await response.json() as Result;
    if (answer.schema_version !== "1" || answer.prd_path !== work.canonical || answer.execution_id !== work.record.executionId || !Array.isArray(answer.errors)) throw new Error("Invalid execution response");
    return answer;
  } catch { throw new ControlFailure("controller_unreachable", "Controller response was unavailable or did not match the selected execution."); }
}
async function inventory(env: NodeJS.ProcessEnv): Promise<Result> {
  const started = new Date().toISOString(); const deadline = Date.now() + 15000;
  const saved = enumerateWork(env, Math.min(deadline, Date.now() + 5000)); const runs: Result[] = []; const errors = [...saved.errors]; let index = 0;
  const counts = { live_controllers: 0, working: 0, waiting: 0, needs_you: 0, paused: 0, stopped_unfinished: 0, unknown: saved.errors.length };
  await Promise.all(Array.from({ length: Math.min(4, saved.work.length) }, async () => {
    while (index < saved.work.length) {
      const work = saved.work[index++]!;
      try {
        if (Date.now() >= deadline) throw new ControlFailure("inventory_incomplete", "Inventory probe deadline expired; this row was not probed.");
        const owner = await controller(work, Math.min(deadline, Date.now() + 2000));
        const live = owner.state === "reachable";
        if (live) {
          const answer = await request(work, owner, "status", Math.max(1, Math.min(2000, deadline - Date.now())));
          runs.push(answer); counts.live_controllers++;
          counts.working += typeof answer.working_sessions === "number" ? answer.working_sessions : 0;
          if (answer.state === "waiting") counts.waiting++;
          if (answer.state === "paused") counts.paused++;
          if (answer.state === "needs_you") counts.needs_you++;
          if (!answer.ok) errors.push(...answer.errors);
        } else {
          if (owner.state !== "stopped") {
            counts.unknown++; errors.push(errorFact(owner.state === "incompatible" ? "instance_incompatible" : "controller_unreachable", owner.error!));
          } else if (work.record.startedAt && !work.record.completedAt) counts.stopped_unfinished++;
          if (owner.state !== "stopped" || work.record.startedAt && !work.record.completedAt) runs.push({ ...statusProjection(work), controller: owner.state, controller_reason: owner.error ?? null });
        }
      } catch (e) {
        counts.unknown++; errors.push(errorFact(e instanceof ControlFailure ? e.code : "state_unavailable", e instanceof ControlFailure ? e.message : "A saved execution could not be inspected."));
        runs.push(result({ prd_path: work.canonical, execution_id: work.record.executionId!, controller: "unknown", state: "unknown", controls: [] }));
      }
    }
  }));
  if (errors.length) errors.unshift(errorFact("inventory_incomplete", "Some saved work or controller facts are unavailable; counts are incomplete."));
  return result({ collection_started_at: started, inventory_complete: !errors.length, counts, runs: runs.sort((a, b) => a.prd_path!.localeCompare(b.prd_path!)) }, errors);
}
/** Returns undefined only for the existing execution helpers, whose contracts remain unchanged. */
export async function runInspectionCommand(args: string[], context: CommandContext): Promise<number | undefined> {
  const json = args.includes("--json"); const logs = args[0] === "logs";
  const write = (answer: Result): number => {
    let output = serialize(answer, json);
    if (logs && Buffer.byteLength(output) > LOG_BYTES) { answer = failed(new ControlFailure("metadata_too_large", "Output metadata exceeds the response budget.", 2)); output = serialize(answer, json); }
    context.stdout.write(output); return exitFor(answer);
  };
  try {
    if (!args.length) { context.stdout.write("Kiln runs an Enso Method plan and inspects existing work. Use kiln --help to see commands; kiln <command> --help for complete details.\n"); return 2; }
    if (args[0] === "--help" || args[0] === "-h") {
      if (args.some((a, i) => i > 0 && a !== "--json") || args.filter(a => a === "--json").length > 1) throw new ControlFailure("invalid_input", "Unknown or duplicate help flag.", 2);
      context.stdout.write(commandHelp([], json)); return 0;
    }
    const legacy = ["run", "audit", "delivery", "add-repository"].includes(args[0]!);
    if (legacy && !args.includes("--help") && !args.includes("-h")) return undefined;
    const parsed = parseCommand(args); const name = parsed.contract.path[0]!; const flags = parsed.flags;
    if (flags.help) { context.stdout.write(commandHelp(parsed.contract.path, json)); return 0; }
    if (!parsed.contract.implemented || parsed.contract.side_effect === "change" || name === "command-status" || name === "settings" && (flags["keep-awake"] || flags["resume-after-usage-limit"])) throw new ControlFailure("control_unavailable", "This command is planned; durable run-changing admission is not available in this inspection release. No legacy mutation was attempted.", 3);
    if (name === "status" && !parsed.positionals.length) {
      if (flags.detail) throw new ControlFailure("invalid_input", "--detail full requires a PRD path.", 2);
      return write(await inventory(context.env));
    }
    if (flags.detail && flags.detail !== "full") throw new ControlFailure("invalid_input", "--detail accepts full only.", 2);
    const max = String(flags["max-lines"] ?? "50");
    if (name === "logs" && !/^(?:[1-9]\d?|1\d\d|200)$/.test(max)) throw new ControlFailure("invalid_input", "--max-lines must be 1–200.", 2);
    const work = await targetWork(parsed.positionals[0]!, context.cwd, context.env);
    const owner = await controller(work);
    if (owner.state === "incompatible" || owner.state === "unreachable") {
      const answer = statusProjection(work, undefined, flags.detail === "full"); answer.ok = false; answer.controller = owner.state;
      answer.errors.push(errorFact(owner.state === "incompatible" ? "instance_incompatible" : "controller_unreachable", owner.error!)); return write(answer);
    }
    const query = new URLSearchParams();
    if (flags.detail) query.set("detail", String(flags.detail));
    if (flags["session-id"]) query.set("session_id", String(flags["session-id"]));
    if (name === "logs") { query.set("max_lines", max); query.set("format", json ? "json" : "text"); }
    if (flags["older-output-cursor"]) query.set("older_output_cursor", String(flags["older-output-cursor"]));
    if (owner.state === "reachable" && name !== "settings") return write(await request(work, owner, name === "account" && flags.refresh ? "account/refresh" : `${name}${query.size ? `?${query}` : ""}`, name === "account" && flags.refresh || name === "handoff" ? 35000 : 5000, name === "account" && !!flags.refresh));
    if (name === "status") return write(statusProjection(work, undefined, flags.detail === "full"));
    if (name === "account") {
      if (flags.refresh) throw new ControlFailure("controller_unreachable", "Fresh account reads require the matching live controller.");
      return write(result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: accountFacts(work) }));
    }
    if (name === "settings") return write(result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: { keep_awake: work.record.settings.keepAwake, resume_after_usage_limit: work.record.settings.resumeAfterUsageLimit, observed_at: work.observedAt, state: owner.state === "reachable" ? "current" : "stale" } }));
    if (name === "handoff") return write(await handoffProjection(work, typeof flags["session-id"] === "string" ? flags["session-id"] : undefined, context.env));
    const history = readHistory(work); const selector = typeof flags["session-id"] === "string" ? flags["session-id"] : undefined;
    const selected = chooseSession(work, history, selector);
    if (!history.complete && !selected) throw new ControlFailure("state_unavailable", "The output session inventory is incomplete.");
    return write(outputPage(work, selected ? { phase: selected.phase, id: selected.id } : null, { max: Number(max), json, ...(selector ? { session: selector } : {}), ...(typeof flags["older-output-cursor"] === "string" ? { cursor: flags["older-output-cursor"] } : {}) }));
  } catch (error) { return write(failed(error)); }
}
