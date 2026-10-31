import { validLiveTarget, sameLiveTarget, canonicalLiveTarget, messageProblem } from "../live/target.js";
import { readBaseline } from "../engine/plan-reconciliation.js";
import { judgedPhase } from "../engine/plan-reading.js";
import { executionDeliveries } from "../engine/continuation-state.js";
import { randomUUID } from "node:crypto";
import { type Action, type Receipt } from "../control/commands.js";
import { sameRecoveryTarget, validRecoveryTarget } from "../engine/phase-recovery.js";
import { ControlFailure, errorFact, result as controlResult } from "../control/result.js";
import { installInspectionRoutes } from "../control/server.js";
import { bindLegacySessions, cacheSnapshot, inspectionSnapshot } from "../control/projection.js";
import { BillingError } from "../billing/authority.js";
import { normalizeMergeTarget, type DevelopmentSettings } from "../state/development-delivery.js";
// The local server: the compiled browser view and a small HTTP API with server-sent events,
// on loopback only (PRD AC-VIEW-01, AC-VIEW-06, AC-MULTI-02; technical design, "The Local
// Server", "HTTP API"). It reaches the engine only through the engine's commands and its
// snapshots, so another client calling the same API can do exactly what the view can, and no
// more ("Control From Outside the Browser").

import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { Server } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { CommandResult, Engine } from "../engine/engine.js";
import { buildSnapshot, type DocumentsFound, type Snapshot } from "../engine/snapshot.js";
import { readOutputLines } from "../session/claude-session.js";
import { NewerSchemaError, type Effort, type Settings } from "../state/records.js";
import { AuditRefusal } from "../audit/contracts.js";
import { strictJson, REPORT_LIMIT } from "../audit/storage.js";

export interface LocalServerOptions {
  engine: Engine;
  /** What Documents found shows, read once per `kiln run` (not started only). */
  documents?: DocumentsFound;
  /** TCP port; 0 lets the OS atomically assign an unused loopback port. */
  port: number;
  /** The PRD folder's name: the view's path, `/<folder>`. */
  folderName: string;
  featureName: string;
  /** The PRD's token, from its record (technical design, "Local security"). */
  token: string;
  /** The built view; the package's `dist/view` unless a test gives another. */
  viewDirectory?: string;
  /** How often the event stream sends a heartbeat: every 5 seconds. */
  heartbeatMs?: number;
}

export interface LocalServer {
  /** `http://127.0.0.1:<port>/<folder>`, the address Kiln prints. */
  readonly address: string;
  /** Ends every event stream and closes the server. */
  close(): Promise<void>;
}

const HEARTBEAT_MS = 5_000;
/** Snapshots are sent at most this often while the engine changes quickly. */
const SNAPSHOT_THROTTLE_MS = 100;
export const TOKEN_HEADER = "X-Kiln-Token";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  // Only Kiln's own origin; nothing the view loads leaves the machine (AC-INSTALL-02).
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

/**
 * Serves the PRD's browser view and API on `127.0.0.1:<port>`.
 *
 *   const server = await startLocalServer({ engine, documents, port: 4700, folderName: "customer-returns", featureName: "Customer returns", token });
 *   server.address  // "http://127.0.0.1:4700/customer-returns"
 *   await server.close();
 */
export async function startLocalServer(options: LocalServerOptions): Promise<LocalServer> {
  const { engine, port, folderName } = options;
  // The package's dist/view, from the compiled server in dist/ or its source in src/.
  const viewDirectory = options.viewDirectory ?? fileURLToPath(new URL("../../dist/view/", import.meta.url));
  const viewRoot = existsSync(viewDirectory) ? realpathSync.native(viewDirectory) : viewDirectory;
  const allowedHosts = new Set(port === 0 ? [] : [`127.0.0.1:${port}`, `localhost:${port}`]);
  const streams = new Set<SSEStreamingApi>();
  let closing = false;
  const snapshot = (): Snapshot => ({ ...buildSnapshot(engine, options.documents), controlToken: engine.controlView().token, unsentReplies: engine.commands.unsent(engine.controlView().target).map(r => ({ id: r.id, text: r.reply_text! })) });

  bindLegacySessions(engine);
  let inspectionCacheError: string | undefined;
  const preserveInspection = () => {
    try { cacheSnapshot(engine, inspectionSnapshot(engine)); inspectionCacheError = undefined; }
    catch { inspectionCacheError = "The latest inspection projection could not be saved; retained facts may be older."; }
  };
  preserveInspection();
  let pendingInspection: NodeJS.Timeout | undefined;
  const offInspection = engine.onChange(() => {
    if (closing || pendingInspection) return;
    // Output bursts share one observation; live reads still project current engine facts.
    pendingInspection = setTimeout(() => { pendingInspection = undefined; preserveInspection(); }, SNAPSHOT_THROTTLE_MS);
    pendingInspection.unref();
  });

  const app = new Hono();
  app.onError((error, c) => c.json({ ok: false, reason: error instanceof NewerSchemaError ? error.message : "Kiln could not read the requested state." }, error instanceof NewerSchemaError ? 409 : 500));

  app.use("*", async (c, next) => {
    // A Host other than Kiln's own address defeats DNS rebinding (AC-VIEW-06).
    const host = c.req.header("host") ?? "";
    if (!allowedHosts.has(host.toLowerCase())) return refuse(c, 403, "Kiln answers only at its own address.");
    if (c.req.path.startsWith("/api/")) {
      const token = c.req.header(TOKEN_HEADER) ?? (c.req.path === "/api/events" ? c.req.query("token") : undefined);
      if (!tokenMatches(token, options.token)) return refuse(c, 403, "This request doesn't carry Kiln's token.");
      // Anything that changes state also needs an Origin matching the Host it was sent to.
      if (c.req.method !== "GET" && c.req.header("origin") !== `http://${host.toLowerCase()}`) return refuse(c, 403, "This request comes from another site.");
    }
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
  });

  await installInspectionRoutes(app, engine, () => inspectionCacheError);

  app.get("/api/delivery/evidence/:digest", c => {
    const digest = c.req.param("digest");
    if (!/^[0-9a-f]{64}$/.test(digest) || !engine.record.developmentDelivery?.checkpoints.some(one => [...one.evidence, ...(one.evidenceHistory ?? [])].some(fact => fact.rawDigest === digest) || one.operations.some(op => op.failureEvidencePath?.endsWith(`${digest}.json`)))) return refuse(c, 404, "No retained evidence with this digest belongs to the execution.");
    const path = join(engine.stateDirectory, "delivery-evidence", `${digest}.json`);
    return c.json(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
  });
  const auditError = (c: Context, error: unknown) => {
    const refused = error instanceof AuditRefusal ? error : new AuditRefusal("evidence_unavailable", (error as Error).message, 503);
    return c.json({ code: refused.code, reason: refused.message, criteria: refused.criteria, checks: [{ name: refused.code, passed: false, facts: [refused.message] }] }, refused.status);
  };
  app.get("/api/audit", async c => {
    try { return c.json(await engine.auditCommand("status", {}, c.req.query("cursor"))); } catch (error) { return auditError(c, error); }
  });
  for (const action of ["snapshot", "result"] as const) app.post(`/api/audit/${action}`, async c => {
    try {
      if (Number(c.req.header("content-length")) > REPORT_LIMIT) throw new AuditRefusal("report_too_large", `Maximum request size is ${REPORT_LIMIT} bytes.`, 413);
      const reader = c.req.raw.body?.getReader(); if (!reader) throw new AuditRefusal("malformed_request", "Request needs a JSON object.", 400);
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > REPORT_LIMIT) throw new AuditRefusal("report_too_large", `Maximum request size is ${REPORT_LIMIT} bytes.`, 413); chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      let body: unknown;
      try { body = strictJson(Buffer.concat(chunks).toString("utf8")); }
      catch (error) { if (error instanceof AuditRefusal && error.code === "invalid_report") throw new AuditRefusal("malformed_request", error.message, 400); throw error; }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuditRefusal("malformed_request", "Request needs a JSON object.", 400);
      const result = await engine.auditCommand(action, body as Record<string, unknown>);
      const outcome = result as import("../audit/contracts.js").AuditResult;
      if (action === "result" && outcome.disposition === "unresolved") {
        const refusal = outcome.refusal ?? { code: "invalid_report", reason: "Required audit checks failed.", criteria: [], status: 422 as const };
        return c.json({ ...outcome, code: refusal.code, reason: refusal.reason, criteria: refusal.criteria }, refusal.status);
      }
      return c.json(result);
    } catch (error) { return auditError(c, error); }
  });
  app.get("/api/preparation", async c => {
    const status = await engine.preparationReadStatus(c.req.query("executionId"), c.req.query("phaseId"));
    return status ? c.json(status) : refuse(c, 404, "No assigned preparation has that execution/phase identity.");
  });
  app.post("/api/preparation/result", async c => {
    const body = await jsonBody(c); if (!body) return refuse(c, 400, "Submit a JSON preparation result.");
    try { const result = await engine.submitPreparation(body); return c.json(result, result.status); }
    catch (error) { return c.json({ ok: false, reason: (error as Error).message }, 503); }
  });
  app.get("/api/preparation/output/:id", c => {
    const executionId = c.req.query("executionId");
    const record = executionId ? engine.historicalExecution(executionId)?.record : engine.record;
    const attempt = record?.preparation?.attempts.find(row => row.id === c.req.param("id"));
    if (!attempt) return refuse(c, 404, "No current preparation check has that identity.");
    try { return c.text(readFileSync(attempt.output, "utf8")); }
    catch { return c.json({ ok: false, reason: "The retained check output is unavailable." }, 503); }
  });
  app.get("/api/delivery", async c => c.json(await engine.deliveryReadStatus()));
  for (const action of ["assessment", "prepare", "evidence"] as const) app.post(`/api/delivery/${action}`, async c => {
    const body = await jsonBody(c); if (!body) return refuse(c, 400, "The body must be a JSON object.");
    const result = await engine.deliveryCommand(action, body);
    return result.ok ? c.json(result.delivery) : commandRefused(c, result);
  });

  app.post("/api/development-authorization", async c => {
    const body = await jsonBody(c); if (!body) return refuse(c, 400, "The body must be a JSON object.");
    if (body.proposalId !== undefined) {
      try { const result = await engine.authorizeContinuationTarget(body); return c.json(result, result.status); }
      catch (error) { return c.json({ ok: false, reason: (error as Error).message }, 503); }
    }
    const result = engine.authorizeDevelopmentTarget(body);
    return result.ok ? c.json({ authorization: engine.deliveryStatus().authorization }) : commandRefused(c, result);
  });

  for (const action of ["accept", "retry"] as const) app.post(`/api/continuation/${action}`, async c => {
    const body = await jsonBody(c); if (!body) return refuse(c, 400, "Use a JSON command object.");
    try { const result = await engine.continuationCommand(action, body); return c.json(result, result.status); }
    catch (error) { return c.json({ ok: false, code: error instanceof ControlFailure ? error.code : "state_unavailable", reason: (error as Error).message }, error instanceof ControlFailure && error.code === "invalid_input" || error instanceof ControlFailure && error.code === "command_id_conflict" ? 400 : 503); }
  });
  app.get("/api/continuation/acceptances/:id", c => {
    const acceptance = engine.continuationAcceptance(c.req.param("id"));
    return acceptance ? c.json({ acceptance }) : refuse(c, 404, "No retained acceptance has that identity.");
  });
  app.get("/api/executions", c => {
    const rows = [...(engine.record.continuation?.executions ?? [])].reverse();
    const cursor = c.req.query("cursor"); let start = 0;
    if (cursor) {
      const id = Buffer.from(cursor, "base64url").toString("utf8");
      const index = rows.findIndex(row => row.executionId === id);
      if (index < 0 || Buffer.from(id).toString("base64url") !== cursor) return refuse(c, 400, "Invalid execution cursor.");
      start = index + 1;
    }
    const page = rows.slice(start, start + 100);
    return c.json({ executions: page.map(({ archiveId: _archiveId, ...row }) => { void _archiveId; return row; }), nextCursor: start + 100 < rows.length ? Buffer.from(page.at(-1)!.executionId).toString("base64url") : null });
  });
  app.get("/api/executions/:id", c => {
    const execution = engine.historicalExecution(c.req.param("id"));
    if (!execution) return refuse(c, 404, "No execution has that identity.");
    const record = execution.record;
    const baseline = record.planReconciliation?.baselineId ? readBaseline(engine.stateDirectory, record.planReconciliation.baselineId) : undefined;
    return c.json({ execution: { executionId: record.executionId, startedAt: record.startedAt, completedAt: record.completedAt, branch: record.settings.featureBranch, deliveries: executionDeliveries(record), pullRequests: record.pullRequests ?? [], phases: (record.plan ?? []).map(phase => {
      const facts = Object.entries(record.phases).find(([key]) => judgedPhase(record.plan ?? [], key)?.id === phase.id)?.[1];
      return { id: phase.id, title: phase.title, closed: phase.closed, doneAt: facts?.doneAt ?? baseline?.completions[phase.id]?.doneAt, sessions: facts?.sessionIds ?? [] };
    }), sessions: Object.entries(record.phases).flatMap(([phaseKey, facts]) => facts.sessionIds.map(sessionId => ({ phaseKey, sessionId }))), activities: record.activities ?? [] } });
  });

  app.get("/api/snapshot", (c) => c.json(snapshot()));

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      streams.add(stream);
      let pending: NodeJS.Timeout | undefined;
      let lastSent = 0;
      const sendSnapshot = () => {
        pending = undefined;
        if (closing || !streams.has(stream)) return;
        lastSent = Date.now();
        void stream.writeSSE({ event: "snapshot", data: JSON.stringify(snapshot()) });
      };
      const onChange = () => {
        if (closing || pending) return;
        pending = setTimeout(sendSnapshot, Math.max(0, SNAPSHOT_THROTTLE_MS - (Date.now() - lastSent)));
      };
      const offChange = engine.onChange(onChange);
      const offClaude = engine.claude?.onChange(onChange);
      const offOutput = engine.onOutput((sessionId, lines) => void stream.writeSSE({ event: "output", data: JSON.stringify({ sessionId, lines }) }));
      const offPartial = engine.onPartial((sessionId, partial) => void stream.writeSSE({ event: "partial", data: JSON.stringify({ sessionId, ...partial }) }));
      const heartbeat = setInterval(() => void stream.writeSSE({ event: "heartbeat", data: new Date().toISOString() }), options.heartbeatMs ?? HEARTBEAT_MS);
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve));
      // Each page load or reconnect asks origin again, before Start (Worktree and Branch Setup).
      engine.checkBase();
      sendSnapshot();
      await closed;
      clearInterval(heartbeat);
      clearTimeout(pending);
      offChange();
      offClaude?.();
      offOutput();
      offPartial();
      streams.delete(stream);
    }),
  );

  app.get("/api/sessions/:sessionId/output", (c) => {
    const sessionId = c.req.param("sessionId");
    const executionId = c.req.query("executionId");
    const execution = executionId ? engine.historicalExecution(executionId) : { record: engine.record };
    if (!execution) return refuse(c, 404, "No execution has that identity.");
    const phaseKey = Object.entries(execution.record.phases).find(([, facts]) => facts.sessionIds.includes(sessionId))?.[0];
    const session = phaseKey === undefined ? undefined : engine.sessionRecord(phaseKey, sessionId);
    const legacy = "legacyBindings" in execution ? execution.legacyBindings as import("../engine/continuation-state.js").CompletedExecution["legacyBindings"] : undefined;
    if (!session || session.executionId && session.executionId !== execution.record.executionId || !session.executionId && executionId && executionId !== engine.record.executionId && (legacy?.version !== 1 || legacy.execution_id !== execution.record.executionId || legacy.sessions[`${phaseKey}/${sessionId}`] !== session.createdAt)) return refuse(c, 404, "No session with that ID belongs to this execution.");
    const lines = readOutputLines(engine.stateDirectory, session);
    const before = Number.parseInt(c.req.query("before") ?? "", 10);
    const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "", 10) || 200, 1), 1000);
    const earlier = Number.isFinite(before) ? lines.filter((line) => line.line < before) : lines;
    return c.json({ lines: earlier.slice(-limit), total: lines.length });
  });

  app.post("/api/live/message", async c => {
    const body = await liveBody(c);
    const problem = messageProblem(body?.text);
    if (!body || Object.keys(body).sort().join() !== "instructionId,target,text" || typeof body.instructionId !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(body.instructionId) || !validLiveTarget(body.target) || problem) return c.json({ ok: false, code: typeof body?.text === "string" && body.text.length > 4000 ? "input_too_large" : "invalid_request", reason: problem ?? "Supply instructionId, exact target and plain text.", observedAt: new Date().toISOString(), remedy: "Revise the message or refresh the session." }, typeof body?.text === "string" && body.text.length > 4000 ? 413 : 400);
    try {
      const answer = engine.commands.submit({ command_id: body.instructionId, execution_id: body.target.executionId, status_token: JSON.stringify(canonicalLiveTarget(body.target)), action: "message", inputs: { target: body.target, text: body.text } });
      const receipt = answer.operation as Receipt | undefined;
      if (!answer.ok && receipt?.state === "refused") return c.json({ ok: false, code: answer.errors[0]?.code === "stale_status_token" ? "stale_target" : answer.errors[0]?.code === "control_unavailable" ? "input_unavailable" : answer.errors[0]?.code, reason: answer.errors[0]?.message, receipt, observedAt: new Date().toISOString(), remedy: "Retain the text and refresh this conversation before a new instruction." }, 409);
      // A replay of accepted but uncertain delivery is still that original receipt,
      // never a pre-admission refusal and never a new write.
      return c.json({ ok: true, receipt }, 202);
    } catch (error) { const conflict = error instanceof ControlFailure && error.code === "command_id_conflict"; return c.json({ ok: false, code: conflict ? "instruction_conflict" : "state_unavailable", reason: (error as Error).message, instructionId: body.instructionId, observedAt: new Date().toISOString(), remedy: "Inspect this same instruction before retrying." }, conflict ? 409 : 503); }
  });
  app.get("/api/live/messages", c => {
    const sessionId = c.req.query("sessionId");
    if (!sessionId || !Object.values(engine.record.phases).some(f => f.sessionIds.includes(sessionId)) && !engine.messageReceipts().some(r => r.live_target?.sessionId === sessionId)) return c.json({ ok: false, code: "invalid_request", reason: "Select a conversation belonging to this PRD." }, 400);
    const before = c.req.query("before");
    const cursor = before && /^[A-Za-z0-9_-]{1,32}$/.test(before) ? Number(Buffer.from(before, "base64url").toString("utf8")) : undefined;
    if (before && (!Number.isSafeInteger(cursor) || cursor! < 1)) return c.json({ ok: false, code: "invalid_request", reason: "Invalid message cursor." }, 400);
    const all = engine.messageReceipts().filter(r => r.live_target?.sessionId === sessionId && (cursor === undefined || r.sequence < cursor));
    const page = all.slice(-50).reverse();
    return c.json({ ok: true, receipts: page.map(r => engine.commands.lookup(r.command_id).operation), ...(all.length > 50 ? { before: Buffer.from(String(page.at(-1)!.sequence)).toString("base64url") } : {}) });
  });
  app.post("/api/live/message-review", async c => {
    const body = await liveBody(c);
    if (!body || Object.keys(body).sort().join() !== "instructionId,receiptIds,target" || typeof body.instructionId !== "string" || !validLiveTarget(body.target)) return c.json({ ok: false, code: "invalid_request", reason: "Supply exact target and uncertain receipt IDs." }, 400);
    try {
      const answer = engine.commands.submit({ command_id: body.instructionId, execution_id: body.target.executionId, status_token: JSON.stringify(canonicalLiveTarget(body.target)), action: "message-review", inputs: { target: body.target, receipt_ids: body.receiptIds } });
      if (!answer.ok) return c.json({ ok: false, code: answer.errors[0]?.code, reason: answer.errors[0]?.message }, 409);
      await engine.commands.settled();
      const receipt = engine.commands.lookup(body.instructionId).operation as Receipt;
      if (receipt.state !== "completed") return c.json({ ok: false, code: receipt.outcome ?? "state_unavailable", reason: receipt.reason }, 409);
      return c.json({ ok: true, receipt, receipts: engine.messageReceipts(body.target).map(r => engine.commands.lookup(r.command_id).operation) });
    } catch { return c.json({ ok: false, code: "state_unavailable", reason: "Review could not be durably recorded. Inspect this instruction." }, 503); }
  });

  app.post("/api/live/take-over", async c => {
    const body = await liveBody(c);
    if (!body || Object.keys(body).sort().join() !== "instructionId,target" || typeof body.instructionId !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(body.instructionId) || !validLiveTarget(body.target)) return c.json({ ok: false, code: "invalid_request", reason: "Supply instructionId and the exact live target.", observedAt: new Date().toISOString(), remedy: "Refresh the current session." }, 400);
    try {
      const answer = engine.commands.submit({ command_id: body.instructionId, execution_id: body.target.executionId, status_token: JSON.stringify(canonicalLiveTarget(body.target)), action: "take-over", inputs: { target: body.target } });
      if (!answer.ok) return c.json({ ok: false, code: answer.errors[0]?.code, reason: answer.errors[0]?.message }, 409);
      await engine.commands.settled();
      const receipt = engine.commands.lookup(body.instructionId).operation as Receipt;
      if (receipt.state !== "completed") return c.json({ ok: false, code: receipt.outcome ?? "state_unavailable", reason: receipt.reason, receipt }, receipt.state === "failed" ? 409 : 503);
      return c.json({ ok: true, receipt, takeover: engine.liveView()?.takeover }, 202);
    } catch { return c.json({ ok: false, code: "state_unavailable", reason: "Takeover admission could not be durably established. Inspect this instruction before retrying." }, 503); }
  });
  app.get("/api/live/instructions/:instructionId", c => {
    try { return c.json({ ok: true, receipt: engine.commands.lookup(c.req.param("instructionId")).operation }); }
    catch { return c.json({ ok: false, code: "receipt_not_found", reason: "No instruction with that ID belongs to this saved PRD." }, 404); }
  });
  app.post("/api/live/reconcile", async c => {
    const body = await liveBody(c); const hold = engine.record.liveControl?.takeover;
    if (!body || Object.keys(body).sort().join() !== "instructionId,target" || !validLiveTarget(body.target) || typeof body.instructionId !== "string") return c.json({ ok: false, code: "invalid_request", reason: "Supply the held instruction and target." }, 400);
    if (!hold || hold.instructionId !== body.instructionId || !sameLiveTarget(hold.target, body.target)) return c.json({ ok: false, code: "stale_target", reason: "This takeover no longer owns the current activity." }, 409);
    await engine.reconcileTakeover();
    return c.json({ ok: true, takeover: engine.liveView()?.takeover });
  });

  const legacyControl = async (c: Context, action: Action, inputs: Record<string, unknown> = {}, body?: Record<string, unknown>) => {
    const target = engine.phaseRecoveryTarget();
    const id = typeof body?.instructionId === "string" ? body.instructionId : c.req.header("X-Kiln-Command-Id") ?? randomUUID();
    const liveTarget = validLiveTarget(body?.target) ? body.target : undefined;
    if (liveTarget) {
      if (!engine.commands.has(id) && !sameLiveTarget(target?.live, liveTarget)) return c.json({ ok: false, code: "stale_target", reason: "This hand-back belongs to another attempt." }, 409);
      inputs = { ...inputs, live_target: liveTarget, ...(body?.reviewedReceiptIds !== undefined ? { reviewed_receipt_ids: body.reviewedReceiptIds } : {}) };
      const { instructionId: _id, ...fields } = body!;
      void _id;
      body = { ...fields, target: target ?? { executionId: liveTarget.executionId, phaseKey: liveTarget.activityKey, sessionId: liveTarget.sessionId, stoppedAt: "previous", live: liveTarget } };
    }
    if (body?.note !== undefined && typeof body.note !== "string") return c.json({ ok: false, reason: "The note must be text." }, 400);
    if (body && (target || "target" in body || "intent" in body)) {
      const allowed = action === "verify-and-advance" ? ["target", "intent", "withoutSendingReply", "reviewedReceiptIds"] : ["target", "note", "reviewedReceiptIds"];
      if (Object.keys(body).some(k => !allowed.includes(k)) || body.target !== undefined && !validRecoveryTarget(body.target) || body.note !== undefined && typeof body.note !== "string" || typeof body.note === "string" && body.note.trim().length > 4000 || action === "verify-and-advance" && body.intent !== undefined && !["verify", "advance"].includes(String(body.intent))) return c.json({ ok: false, code: "invalid_request", reason: "Invalid recovery request." }, 400);
      if (!engine.commands.has(id) && !sameRecoveryTarget(target, body.target as typeof target)) return c.json({ ok: false, code: "stale_target", reason: "Refresh the stopped conversation before acting." }, 409);
      if (action === "verify-and-advance" && !body.intent) return c.json({ ok: false, code: "invalid_request", reason: "Choose verify or advance." }, 400);
    }
    try {
      const view = engine.controlView();
      const answer = engine.commands.submit({ command_id: id, execution_id: liveTarget?.executionId ?? (c.req.header("X-Kiln-Status") ?? view.token).split(":")[0], status_token: liveTarget ? JSON.stringify(canonicalLiveTarget(liveTarget)) : c.req.header("X-Kiln-Status") ?? view.token, action, inputs });
      if (!answer.ok) return c.json({ ok: false, ...(c.req.header("X-Kiln-Command-Id") || answer.errors[0]!.code !== "control_unavailable" ? { code: answer.errors[0]!.code } : {}), reason: answer.errors[0]!.message }, 409);
      await engine.commands.settled();
      const saved = engine.commands.lookup(id); const op = saved.operation as Receipt;
      const bound = JSON.parse(op.target) as unknown; const responseTarget = validRecoveryTarget(bound) ? bound : undefined;
      if (op.outcome === "dispatch_not_started" && responseTarget) return c.json({ ok: true, outcome: "resume_requested", target: responseTarget, ...(c.req.header("X-Kiln-Command-Id") ? { command_id: id, operation: op, controlToken: engine.controlView().token } : {}) });
      if (op.state === "failed" || op.state === "indeterminate") return c.json({ ok: false, code: op.outcome === "state_write_failed" ? "state_write_failed" : op.outcome ?? "operation_indeterminate", reason: op.reason }, op.outcome === "state_write_failed" ? 500 : op.outcome === "check_unavailable" || op.state === "indeterminate" ? 503 : 409);
      const outcome = op.outcome === "phase_already_complete" ? "already_complete" : op.outcome === "completion_checks_failed" ? "still_stopped" : op.outcome === "session_resumed" ? "resume_requested" : op.outcome;
      return c.json({ ok: true, ...(action === "settings" ? { settings: snapshot().settings } : {}), ...(responseTarget && ["resume", "reply", "verify-and-advance"].includes(action) ? { outcome, target: responseTarget } : {}), ...(c.req.header("X-Kiln-Command-Id") ? { command_id: id, operation: op, controlToken: engine.controlView().token } : {}) });
    } catch { return c.json({ ok: false, code: "state_write_failed", reason: "Durable control state is unavailable; inspect status before retrying." }, 500); }
  };

  app.post("/api/settings", async (c) => {
    const body = await jsonBody(c);
    if (body === undefined) return refuse(c, 400, "The body must be a JSON object.");
    const change = settingsChange(body);
    if (typeof change === "string") return refuse(c, 400, change);
    if (Object.keys(change).every(k => ["keepAwake", "resumeAfterUsageLimit"].includes(k)) && Object.keys(change).length) return legacyControl(c, "settings", { ...(change.keepAwake === undefined ? {} : { keep_awake: change.keepAwake }), ...(change.resumeAfterUsageLimit === undefined ? {} : { resume_after_usage_limit: change.resumeAfterUsageLimit }) });
    if (engine.commands.busy) return c.json({ ok: false, code: "busy", reason: "A durable instruction owns control." }, 409);
    const result = await engine.changeSettings(change);
    return result.ok ? c.json({ settings: snapshot().settings }) : commandRefused(c, result);
  });

  app.post("/api/metadata/refresh", async (c) => { await engine.agents.refresh(); await engine.refreshBilling(); return c.json({ settings: snapshot().settings, billing: snapshot().billing }); });
  for (const action of ["approval", "clear"] as const) app.post(`/api/billing/${action}`, async c => {
    try {
      const reader = c.req.raw.body?.getReader();
      if (!reader) throw new BillingError("invalid_request", "A JSON billing request is required.", 400);
      const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 4096) throw new BillingError("invalid_request", "Billing request exceeds 4 KiB.", 400); chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new BillingError("invalid_request", "A JSON billing request is required.", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new BillingError("invalid_request", "A JSON object is required.", 400);
      const billing = await engine.billingCommand(action, body as Record<string, unknown>);
      return c.json({ ok: true, billing, ...(c.req.header("X-Kiln-Command-Id") ? { controlToken: engine.controlView().token } : {}) });
    } catch (error) {
      const failure = error instanceof BillingError ? error : new BillingError("billing_state_write_failed", "Billing state could not be saved. No work was authorized.", 500);
      return c.json({ ok: false, code: failure.code, reason: failure.message, billing: engine.billing.view }, failure.status);
    }
  });

  app.post("/api/start", async (c) => {
    const body = (await jsonBody(c)) ?? {};
    if (engine.record.pause.activeSince || engine.restartReview) return legacyControl(c, "continue");
    if (engine.commands.busy) return c.json({ ok: false, code: "busy", reason: "A durable instruction owns control." }, 409);
    const result = await engine.start(body.refinementConfirmed === true ? { refinementConfirmed: true } : {});
    return result.ok ? c.json({ ok: true }) : commandRefused(c, result);
  });

  // A session's `kiln add-repository` (multi-repo AC-ADD-01). Kiln carries a setup through to
  // its end even when the requester disconnects, so the request is never tied to the response.
  app.post("/api/repositories", async (c) => {
    const body = await jsonBody(c);
    const name = body?.name;
    if (typeof name !== "string" || name.trim() === "") return refuse(c, 400, "The body must name a repository: { \"name\": \"<folder name>\" }.");
    const result = await engine.addRepository(name);
    if (!result.ok) return c.json({ ok: false, reason: result.reason }, result.status);
    return c.json({ name: result.name, worktreePath: result.worktreePath, branch: result.branch, baseBranch: result.baseBranch, added: result.added });
  });

  app.post("/api/pause", (c) => legacyControl(c, "request-pause"));
  app.delete("/api/pause", (c) => legacyControl(c, "cancel-pause"));
  app.post("/api/continuation/check", async c => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return refuse(c, 400, "Expected an empty JSON object."); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return refuse(c, 400, "Expected an empty JSON object.");
    try {
      const check = await engine.checkCompletedPlan();
      if (check.failure) return c.json({ ok: false, ...check.failure, reason: check.errors.join(" "), checks: [], check }, 413);
      return c.json({ check }, check.status === "failed" ? 503 : 200);
    }
    catch (error) { return auditError(c, error); }
  });

  app.post("/api/check-again", async (c) => {
    const body = await recoveryBody(c);
    if (body === undefined) return c.json({ ok: false, code: "invalid_request", reason: "The body must be a JSON object." }, 400);
    return legacyControl(c, engine.phaseRecoveryTarget() || "target" in body || "intent" in body ? "verify-and-advance" : "check-again", body.withoutSendingReply === true ? { without_sending_reply: true } : {}, body);
  });
  // Resume at Needs you, with an optional note, or Resume now while waiting, with none (usage-limit
  // recovery AC-RESUME-01 to 03, AC-LIMIT-02); answered once its check has run.
  app.post("/api/resume", async (c) => {
    const body = await recoveryBody(c);
    if (body === undefined) return c.json({ ok: false, code: "invalid_request", reason: "The body must be a JSON object." }, 400);
    return legacyControl(c, typeof body.note === "string" && body.note.trim() ? "reply" : "resume", body.note ? { message: body.note } : {}, body);
  });

  app.all("/api/*", (c) => refuse(c, 404, "No such API."));

  // The view's assets: the built scripts, styles and bundled fonts.
  app.get("/assets/*", (c) => {
    const file = resolve(viewRoot, `.${c.req.path}`);
    if (!file.startsWith(viewRoot + sep) || !existsSync(file) || !statSync(file).isFile()) return c.text("Not found", 404);
    return c.body(readFileSync(file), 200, { "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
  });

  // The view has one address: `/<folder>`, with its client-side routes beneath it. The folder's
  // name is compared as text, never read as a route pattern.
  const root = `/${folderName}`;
  app.get("*", (c) => {
    if (c.req.path === `${root}/`) return c.redirect(root, 308);
    if (c.req.path !== root && !c.req.path.startsWith(`${root}/`)) return c.text("Not found", 404);
    const index = join(viewRoot, "index.html");
    if (!existsSync(index)) return c.text("Kiln's browser view isn't built.", 500);
    // Replaced with functions, so a `$` in a feature name is never read as a replacement pattern.
    const html = readFileSync(index, "utf8")
      .replace("__KILN_TITLE__", () => escapeHtml(`${options.featureName} · Kiln`))
      .replace("__KILN_TOKEN__", () => options.token)
      .replace("__KILN_BASE__", () => escapeHtml(root));
    return c.html(html);
  });
  app.all("*", (c) => c.text("Not found", 404));

  const server = await new Promise<Server>((resolveServer, reject) => {
    const started = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => resolveServer(started as Server));
    (started as Server).once("error", reject);
  });

  const bound = server.address();
  if (!bound || typeof bound === "string") throw new Error("Kiln's loopback TCP address is unavailable.");
  allowedHosts.clear();
  allowedHosts.add(`127.0.0.1:${bound.port}`);
  allowedHosts.add(`localhost:${bound.port}`);
  return {
    address: `http://127.0.0.1:${bound.port}/${folderName}`,
    close: async () => {
      closing = true;
      offInspection();
      if (pendingInspection) { clearTimeout(pendingInspection); pendingInspection = undefined; preserveInspection(); }
      for (const stream of streams) stream.abort();
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    },
  };
}

function tokenMatches(given: string | undefined, token: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function refuse(c: Context, status: 400 | 403 | 404 | 409, reason: string) {
  const response = c.json(c.req.path.startsWith("/api/control/") ? controlResult({}, [errorFact(status === 403 ? "ownership_mismatch" : "invalid_input", reason)]) : { ok: false, reason }, status);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

function commandRefused(c: Context, result: Extract<CommandResult, { ok: false }>) {
  return c.json(
    { ok: false, reason: result.reason, ...(result.code ? { code: result.code } : {}), ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}), ...(result.baseErrors ? { baseErrors: result.baseErrors } : {}) },
    result.status,
  );
}

async function recoveryBody(c: Context): Promise<Record<string, unknown> | undefined> {
  const raw = await c.req.text();
  if (raw === "") return {};
  try {
    const body: unknown = JSON.parse(raw);
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

async function jsonBody(c: Context): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** `POST /api/settings`'s body, checked field by field; a string is why it was refused. */
function settingsChange(body: Record<string, unknown>): Partial<Settings> | string {
  const change: Partial<Settings> = {};
  if (body.developmentDeployments !== undefined) {
    const raw = body.developmentDeployments as DevelopmentSettings;
    if (!raw || typeof raw !== "object" || typeof raw.enabled !== "boolean" || !Array.isArray(raw.targets)) return "Development deployments need enabled and target rows.";
    try {
      if (Object.keys(raw).some(key => !["enabled", "targets"].includes(key))) throw new Error("Unknown development-deployment setting.");
      change.developmentDeployments = { ...raw, enabled: raw.enabled, targets: raw.targets.map(candidate => {
        if (!candidate || typeof candidate !== "object") throw new Error("Select a repository branch for early merges.");
        return { target: normalizeMergeTarget(candidate.target), ...(candidate.confirmedNonProduction !== undefined ? { confirmedNonProduction: candidate.confirmedNonProduction } : {}), ...(candidate.confirmedTarget ? { confirmedTarget: normalizeMergeTarget(candidate.confirmedTarget) } : {}) };
      }) };
    } catch (error) { return (error as Error).message; }
  }
  for (const field of ["model", "workspaceFolder", "worktreePath", "featureBranch", "baseBranch"] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string") return `${field} must be text.`;
    change[field] = value;
  }
  if (body.agentId !== undefined) {
    if (body.agentId !== "claude_code" && body.agentId !== "codex") return "Unknown agent.";
    change.agentId = body.agentId;
  }
  if (body.selectionGeneration !== undefined) {
    if (!Number.isSafeInteger(body.selectionGeneration) || (body.selectionGeneration as number) < 0) return "selectionGeneration must be a nonnegative integer.";
    change.selectionGeneration = body.selectionGeneration as number;
  }
  if (body.effort !== undefined) {
    if (typeof body.effort !== "string" || body.effort.trim() === "") return "effort must be nonempty text.";
    change.effort = body.effort as Effort;
  }
  for (const field of ["keepAwake", "resumeAfterUsageLimit"] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") return `${field} must be true or false.`;
    change[field] = value;
  }
  if (body.bases !== undefined) {
    // The other repositories' bases, by name; the PRD's repository's is baseBranch (multi-repo technical design, "HTTP API").
    const bases = body.bases;
    if (typeof bases !== "object" || bases === null || Array.isArray(bases) || Object.values(bases).some((value) => typeof value !== "string")) {
      return "bases must map repository names to branch names.";
    }
    change.bases = bases as Record<string, string>;
  }
  const unknown = Object.keys(body).filter((key) => !["developmentDeployments", "agentId", "selectionGeneration", "model", "effort", "keepAwake", "resumeAfterUsageLimit", "workspaceFolder", "worktreePath", "featureBranch", "baseBranch", "bases"].includes(key));
  if (unknown.length > 0) return `Unknown setting: ${unknown.join(", ")}.`;
  return change;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Live mutations are small, deadline-bound and never hold HTTP open for a tool. */
async function liveBody(c: Context): Promise<Record<string, unknown> | undefined> {
  const reader = c.req.raw.body?.getReader(); if (!reader) return undefined;
  const chunks: Uint8Array[] = []; let length = 0;
  const timeout = setTimeout(() => { void reader.cancel(); }, 5000);
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 65536) { await reader.cancel(); return undefined; } chunks.push(next.value); }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
  finally { clearTimeout(timeout); reader.releaseLock(); }
}
