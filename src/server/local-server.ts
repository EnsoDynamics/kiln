import { errorFact, result as controlResult } from "../control/result.js";
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
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const streams = new Set<SSEStreamingApi>();
  let closing = false;
  const snapshot = (): Snapshot => buildSnapshot(engine, options.documents);

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
  app.get("/api/delivery", async c => c.json(await engine.deliveryReadStatus()));
  for (const action of ["assessment", "prepare", "evidence"] as const) app.post(`/api/delivery/${action}`, async c => {
    const body = await jsonBody(c); if (!body) return refuse(c, 400, "The body must be a JSON object.");
    const result = await engine.deliveryCommand(action, body);
    return result.ok ? c.json(result.delivery) : commandRefused(c, result);
  });

  app.post("/api/development-authorization", async c => {
    const body = await jsonBody(c); if (!body) return refuse(c, 400, "The body must be a JSON object.");
    const result = engine.authorizeDevelopmentTarget(body);
    return result.ok ? c.json({ authorization: engine.deliveryStatus().authorization }) : commandRefused(c, result);
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
    const phaseKey = Object.entries(engine.record.phases).find(([, facts]) => facts.sessionIds.includes(sessionId))?.[0];
    const session = phaseKey === undefined ? undefined : engine.sessionRecord(phaseKey, sessionId);
    if (!session) return refuse(c, 404, "No session with that ID belongs to this PRD.");
    const lines = readOutputLines(engine.stateDirectory, session);
    const before = Number.parseInt(c.req.query("before") ?? "", 10);
    const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "", 10) || 200, 1), 1000);
    const earlier = Number.isFinite(before) ? lines.filter((line) => line.line < before) : lines;
    return c.json({ lines: earlier.slice(-limit), total: lines.length });
  });

  app.post("/api/settings", async (c) => {
    const body = await jsonBody(c);
    if (body === undefined) return refuse(c, 400, "The body must be a JSON object.");
    const change = settingsChange(body);
    if (typeof change === "string") return refuse(c, 400, change);
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
      return c.json({ ok: true, billing: await engine.billingCommand(action, body as Record<string, unknown>) });
    } catch (error) {
      const failure = error instanceof BillingError ? error : new BillingError("billing_state_write_failed", "Billing state could not be saved. No work was authorized.", 500);
      return c.json({ ok: false, code: failure.code, reason: failure.message, billing: engine.billing.view }, failure.status);
    }
  });

  app.post("/api/start", async (c) => {
    const body = (await jsonBody(c)) ?? {};
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

  app.post("/api/pause", (c) => answer(c, engine.pause()));
  app.delete("/api/pause", (c) => answer(c, engine.cancelPause()));
  app.post("/api/check-again", async (c) => {
    const body = await recoveryBody(c);
    if (body === undefined) return c.json({ ok: false, code: "invalid_request", reason: "The body must be a JSON object." }, 400);
    return answer(c, await engine.checkAgain(body));
  });
  // Resume at Needs you, with an optional note, or Resume now while waiting, with none (usage-limit
  // recovery AC-RESUME-01 to 03, AC-LIMIT-02); answered once its check has run.
  app.post("/api/resume", async (c) => {
    const body = await recoveryBody(c);
    if (body === undefined) return c.json({ ok: false, code: "invalid_request", reason: "The body must be a JSON object." }, 400);
    return answer(c, await engine.resume(body));
  });
  // Needs you's confirmation that the changes outside the workspace were dealt with (multi-repo AC-OUTSIDE-03).
  app.post("/api/outside-confirmation", (c) => answer(c, engine.setOutsideConfirmation(true)));
  app.delete("/api/outside-confirmation", (c) => answer(c, engine.setOutsideConfirmation(false)));

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

  return {
    address: `http://127.0.0.1:${port}/${folderName}`,
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

function answer(c: Context, result: CommandResult) {
  return result.ok ? c.json(result) : commandRefused(c, result);
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
      if (Object.keys(raw).some(key => !["enabled", "targets", "rememberForPrdRepository", "useSavedTargetsForThisPrd", "preferenceRevision"].includes(key))) throw new Error("Unknown development-deployment setting.");
      for (const field of ["rememberForPrdRepository", "useSavedTargetsForThisPrd"] as const) if (raw[field] !== undefined && typeof raw[field] !== "boolean") throw new Error(`${field} must be true or false.`);
      if (raw.preferenceRevision !== undefined && (!Number.isSafeInteger(raw.preferenceRevision) || raw.preferenceRevision < 0)) throw new Error("preferenceRevision must be a nonnegative integer.");
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
