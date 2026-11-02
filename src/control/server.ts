import { spoolResult, releaseResult } from "./spool.js";
import { strictJson } from "../audit/storage.js";
/** Versioned inspection and durable control API, behind the local server's unchanged authentication middleware. */
import type { Hono, Context } from "hono";
import { dirname, resolve } from "node:path";
import { readWork } from "./private-state.js";
import { handoffProjection, instanceEpoch, statusProjection } from "./projection.js";
import { readHistory, chooseOutputSession } from "./history.js";
import { outputPage } from "./logs.js";
import { ControlFailure, failed, exitFor, result, errorFact, type Result } from "./result.js";
import { NO_CHECK_RUN } from "./commands.js";
import { ResponseSpool } from "./spool.js";
import { progressHeading, progressText, type ProgressRow } from "./waiver-facts.js";
import type { Engine } from "../engine/engine.js";
import { processStartTime } from "../platform/process-start-time.js";

export async function installInspectionRoutes(app: Hono, engine: Engine, cacheError: () => string | undefined): Promise<void> {
  const epoch = instanceEpoch(); const processTime = await processStartTime(process.pid, { timeoutMs: 2000 });
  const work = () => ({ ...readWork(dirname(dirname(engine.stateDirectory)), engine.stateDirectory), record: structuredClone(engine.record) });
  const send = (c: Context, answer: Result) => {
    const text = c.req.path.endsWith("/status") && c.req.query("format") === "text";
    const output = text ? withProgress(answer) : spoolResult(answer, !text);
    c.header("Content-Type", text ? "text/plain; charset=utf-8" : "application/json; charset=utf-8");
    c.header("Content-Length", String(output.bytes));
    c.header("X-Kiln-Exit", String(exitFor(answer)));
    c.header("X-Kiln-Execution", answer.execution_id ?? "");
    c.header("X-Kiln-Prd", encodeURIComponent(answer.prd_path ?? ""));
    return c.body(output.stream(), answer.ok ? 200 : exitFor(answer) === 4 ? 503 : exitFor(answer) === 3 ? 409 : 400);
  };
  const query = (c: Context, allowed: string[]) => {
    const params = new URL(c.req.url).searchParams;
    for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new ControlFailure("invalid_input", "Unknown or duplicate query parameter.", 2);
  };
  const route = (path: string, allowed: string[], handler: (c: Context) => Promise<Result> | Result) => {
    app.get(`/api/control/v1/${path}`, async c => { try { query(c, allowed); return send(c, await handler(c)); } catch (e) { return send(c, { ...failed(e), prd_path: resolve(engine.record.repository.mainCheckoutPath, engine.record.prdDirectory), execution_id: engine.record.executionId! }); } });
  };
  app.get("/api/control/v1/capabilities", c => c.json({ protocol_major: 1, protocol_minor: 2, kiln_version: "1.0.0", execution_id: engine.record.executionId,
    prd_path: resolve(engine.record.repository.mainCheckoutPath, engine.record.prdDirectory), instance: { pid: process.pid, process_start_time: processTime ?? null, epoch }, features: ["status", "logs", "handoff", "account", "account_refresh", "settings", "commands", "command_status", "message", "take_over", "message_review", "waive_and_advance"] }));
  route("status", ["detail", "format"], c => {
    const format = c.req.query("format"); if (format && !["text", "json"].includes(format)) throw new ControlFailure("invalid_input", "Format must be text or json.", 2);
    const detail = c.req.query("detail"); if (detail && detail !== "full") throw new ControlFailure("invalid_input", "Detail must be full.", 2);
    const answer = statusProjection(work(), engine, detail === "full");
    const error = cacheError();
    if (error) { answer.ok = false; answer.errors.push(errorFact("state_unavailable", error)); }
    return answer;
  });
  route("logs", ["session_id", "max_lines", "older_output_cursor", "format"], c => {
    const max = c.req.query("max_lines") ?? "50";
    if (!/^(?:[1-9]\d?|1\d\d|200)$/.test(max)) throw new ControlFailure("invalid_input", "max_lines must be 1–200.", 2);
    const saved = work(); const history = readHistory(saved, engine.current?.processRunning ? engine.current.session?.sessionId : undefined);
    try {
    const selector = c.req.query("session_id");
    const cursor = c.req.query("older_output_cursor");
    const selected = chooseOutputSession(saved, history, selector, engine.current?.processRunning ? engine.current.session?.sessionId : undefined, cursor);
    return outputPage(saved, selected ? { phase: selected.phase, id: selected.id } : null, { max: Number(max), json: c.req.query("format") !== "text", ...(selector ? { session: selector } : {}), ...(cursor ? { cursor } : {}) });
    } finally { history.dispose(); }
  });
  route("handoff", ["session_id"], c => handoffProjection(work(), c.req.query("session_id"), engine.environment, engine));
  route("account", [], () => {
    const saved = work(); const status = statusProjection(saved, engine, true);
    try { return result({ prd_path: saved.canonical, execution_id: engine.record.executionId!, data: status.account ?? null }, status.errors); } finally { releaseResult(status); }
  });
  app.post("/api/control/v1/account/refresh", async c => {
    try {
      if (c.req.header("content-length") && Number(c.req.header("content-length")) !== 0) throw new ControlFailure("invalid_input", "Account refresh accepts no inputs.", 2);
      // The Node HTTP adapter supplies a body stream even for a bodyless POST.
      // Check its bytes; existence of the stream does not mean inputs were sent.
      const reader = c.req.raw.body?.getReader();
      if (reader) {
        let expired = false;
        const timeout = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 5000);
        try {
          if (!(await reader.read()).done || expired) throw new ControlFailure("invalid_input", "Account refresh accepts no inputs and must finish within five seconds.", 2);
        } finally { clearTimeout(timeout); await reader.cancel(); reader.releaseLock(); }
      }
      await Promise.all([engine.agents.refresh(), engine.refreshBilling()]);
      const saved = work(); const status = statusProjection(saved, engine, true);
      releaseResult(status);
      const facts = (status.account ?? null) as Record<string, unknown> | null;
      const errors = engine.agents.state.account?.error || engine.agents.state.account?.limitsError || !engine.agents.state.account?.limitsObservedAt || !engine.agents.state.account ? [{ code: "provider_unavailable", message: "Provider account refresh is unavailable.", retryable: false, next_command: null, next_argv: null }] : [];
      return send(c, result({ prd_path: saved.canonical, execution_id: saved.record.executionId!, data: facts }, [...status.errors, ...errors]));
    } catch (e) { return send(c, { ...failed(e), prd_path: resolve(engine.record.repository.mainCheckoutPath, engine.record.prdDirectory), execution_id: engine.record.executionId! }); }
  });
  route("commands/:command_id", [], c => engine.refreshCommand(c.req.param("command_id")!));
  app.post("/api/control/v1/commands", async c => {
    let commandId: string | null = null;
    try {
      const reader = c.req.raw.body?.getReader(); if (!reader) throw new ControlFailure("invalid_input", "A command body is required.", 2);
      const chunks: Uint8Array[] = []; let size = 0; let expired = false;
      const deadline = Date.now() + 5000;
      const timeout = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 5000);
      try { for (;;) { const next = await reader.read(); if (expired || Date.now() > deadline) throw new ControlFailure("invalid_input", "Command input must finish within five seconds.", 2); if (next.done) break; size += next.value.length; if (size > 65536) return c.json(result({}, [errorFact("invalid_input", "Command body exceeds 64 KiB.")]), 413); chunks.push(next.value); } }
      catch (error) { if (error instanceof ControlFailure) throw error; throw new ControlFailure("invalid_input", "Command body could not be read completely.", 2); }
      finally { clearTimeout(timeout); void reader.cancel().catch(() => {}); reader.releaseLock(); }
      let body: unknown; try { body = strictJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new ControlFailure("invalid_input", "A valid UTF-8 JSON command is required.", 2); }
      if (body && typeof body === "object" && "command_id" in body && typeof body.command_id === "string") commandId = body.command_id;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const command = body as Record<string, unknown>;
        // Public spelling; the browser and journal retain their existing action identity.
        if (command.action === "take_over") command.action = "take-over";
        if (command.action === "message-review") throw new ControlFailure("invalid_input", "Use resume or verify-and-advance with reviewed receipt IDs.", 2);
        if (command.action === "waive-and-advance") waiveAndAdvance(engine, command);
        const old = engine.commands.all().find(r => r.command_id === command.command_id);
        if (old && old.instruction.action !== command.action) throw new ControlFailure("command_id_conflict", "Command ID already belongs to a different action. Use a new ID for a new instruction.", 2);
        // Deduplication precedes current eligibility. Never reconstruct an old target from a successor.
        if (command.inputs && typeof command.inputs === "object" && !Array.isArray(command.inputs)) {
          const inputs = command.inputs as Record<string, unknown>;
          const target = old ? old.instruction.inputs.target ?? old.instruction.inputs.live_target : engine.liveTarget();
          if (command.action === "message" || command.action === "take-over") {
            if (inputs.target === undefined) inputs.target = target;
            if (!inputs.target) throw new ControlFailure("control_unavailable", "No active supported Claude attempt is available. Refresh status.", 3);
          } else if (["resume", "verify-and-advance", "reply", "waive-and-advance"].includes(String(command.action)) && target) {
            if (inputs.live_target === undefined) inputs.live_target = target;
          }
        }
      }
      // The bot guard runs inside journal admission, after deduplication and
      // before exact-target admission; valid refusals are durable receipts too.
      const answer = engine.commands.submit(body, "caller", true);
      return c.json(answer, answer.ok ? 202 : exitFor(answer) === 4 ? 503 : exitFor(answer) === 3 ? 409 : 400);
    } catch (error) { return send(c, { ...failed(error), prd_path: resolve(engine.record.repository.mainCheckoutPath, engine.record.prdDirectory), execution_id: engine.record.executionId!, command_id: commandId }); }
  });
  app.all("/api/control/*", c => send(c, result({}, [{ code: "control_unavailable", message: "Unknown command API route or unsupported protocol.", retryable: false, next_command: null, next_argv: null }])));
}

/**
 * `kiln waive-and-advance` (waivers "Command line", AC-WAIVE-05): the control route picks the
 * journal action before admission. Without `confirm` it is the stop's recheck, `verify-and-advance`
 * while a hand-back recovery target exists and `check-again` otherwise, and a command id that already
 * has a receipt keeps that receipt's action. With it, it is the one `waive-and-advance` action, with
 * the offered check run filled in from the guarded status (or the original receipt, so an identical
 * retry replays it) and `via: command_line`; the caller never supplies either.
 */
function waiveAndAdvance(engine: Engine, command: Record<string, unknown>): void {
  const inputs = command.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) throw new ControlFailure("invalid_input", "Invalid command identity, action or inputs.", 2);
  const fields = inputs as Record<string, unknown>;
  if (typeof fields.confirm !== "boolean") throw new ControlFailure("invalid_input", "waive-and-advance needs confirm: true or false.", 2);
  if (fields.via !== undefined || fields.check_run_id !== undefined) throw new ControlFailure("invalid_input", "Kiln fills in the check run and source of a waiver; the caller never supplies them.", 2);
  const confirm = fields.confirm; delete fields.confirm;
  const old = engine.commands.all().find(r => r.command_id === command.command_id);
  if (!confirm) {
    if (fields.by !== undefined) throw new ControlFailure("invalid_input", "--by records who marked an activity complete; it needs --confirm.", 2);
    if (old && old.instruction.action !== "check-again" && old.instruction.action !== "verify-and-advance") throw new ControlFailure("command_id_conflict", "Command ID already belongs to a different action. Use a new ID for a new instruction.", 2);
    command.action = old?.instruction.action ?? (engine.phaseRecoveryTarget() ? "verify-and-advance" : "check-again");
    if (command.action === "check-again" && Object.keys(fields).length) throw new ControlFailure("invalid_input", "This stop's recheck is check-again, which takes no --without-sending-reply or --message-reviewed; those apply at a hand-back stop.", 2);
    return;
  }
  if (old && old.instruction.action !== "waive-and-advance") throw new ControlFailure("command_id_conflict", "Command ID already belongs to a different action. Use a new ID for a new instruction.", 2);
  const offer = engine.markCompleteOffer();
  fields.check_run_id = old ? old.instruction.inputs.check_run_id : offer.offered ? offer.checkRunId : NO_CHECK_RUN;
  fields.via = "command_line";
}

/** Text status begins with the activity progress block, then the result's fields (AC-WAIVE-10). */
function withProgress(answer: Result): ResponseSpool {
  const rows = answer.progress as ProgressRow[] | undefined;
  const heading = progressHeading(answer);
  const body = spoolResult(answer, false);
  if (!rows?.length) return body;
  const output = new ResponseSpool();
  try {
    output.append(Buffer.from(`${progressText(heading, rows)}\n`));
    for (const chunk of body.chunks()) output.append(chunk);
    return output;
  } catch (error) { output.close(); throw error; }
  finally { body.close(); }
}
