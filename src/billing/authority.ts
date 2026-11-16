import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { BILLING_CONTRACT } from "./contract.js";
import type { BillingSummary, Inspection } from "./inspection.js";
export interface BillingHold { phaseKey: string; action: "launch" | "resume"; sessionId?: string; reason: string; observed: BillingSummary; at: string;
  /** The hold's own check run and rows (waivers "Check Runs"); never a separate stop. */
  run?: import("../state/records.js").CheckRun; checks?: import("../state/records.js").CheckResult[];
  /** The rows came from a finished recheck that ran the activity's completion checks (checks at a stop AC-STOPCHECK-03). */
  rowsAreCompletionChecks?: true; }
export interface BillingState {
  version: 1;
  executionId: string;
  key: string;
  revision: number;
  current?: { fingerprint: string; summary: BillingSummary };
  approval?: { executionId: string; contextFingerprint: string; approvedAt: string; contractVersion: string };
  hold?: BillingHold;
  lastLaunch?: BillingSummary;
}
export interface BillingView {
  executionId: string;
  selectionGeneration: number;
  pending: boolean;
  next?: BillingSummary & { readingId: string; canApprove: boolean; canClear: boolean; readinessError?: string };
  lastLaunch?: BillingSummary;
  hold?: BillingHold;
  canLaunch: boolean;
}
export class BillingError extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 409 | 500 = 409) { super(message); }
}
export function newBillingState(executionId: string): BillingState { return { version: 1, executionId, key: randomBytes(32).toString("hex"), revision: 0 }; }
export function assertBillingState(value: BillingState | undefined, executionId: string | undefined): void {
  if (!value) return;
  if (value.version !== 1 || !executionId || value.executionId !== executionId || !/^[0-9a-f]{64}$/.test(value.key) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("Invalid billing authorization state.");
  const summary = (s: BillingSummary) => s && ["subscription", "metered", "settings"].includes(s.route) && ["claude_code", "codex"].includes(s.agentId) && Array.isArray(s.sources) && s.sources.every(one => typeof one === "string") && typeof s.observedAt === "string" && typeof s.approved === "boolean" && Array.isArray(s.diagnostics);
  if (value.current && (!/^[0-9a-f]{64}$/.test(value.current.fingerprint) || !summary(value.current.summary))) throw new Error("Invalid current billing context.");
  if (value.approval && (value.approval.executionId !== executionId || !/^[0-9a-f]{64}$/.test(value.approval.contextFingerprint) || typeof value.approval.approvedAt !== "string" || typeof value.approval.contractVersion !== "string")) throw new Error("Invalid billing approval.");
  if (value.hold && (!value.hold.phaseKey || !["launch", "resume"].includes(value.hold.action) || !summary(value.hold.observed))) throw new Error("Invalid billing hold.");
  if (value.lastLaunch && !summary(value.lastLaunch)) throw new Error("Invalid launch billing snapshot.");
}
/** One current grant. Persistence must succeed before publishing a transition or releasing work. */
export class BillingAuthority {
  pending = false;
  private reading: { id: string; fingerprint: string; context: string; generation: number; args: string[]; inspection: Inspection } | undefined;
  private inFlight: Promise<Inspection> | undefined;
  private inFlightContext: string | undefined;
  private commandBusy = false;
  private lastCommand: { id: string; fingerprint: string; action: "approval" | "clear" } | undefined;
  constructor(private readonly options: {
    state: () => BillingState;
    generation: () => number;
    inspect: (cwd: string, env: NodeJS.ProcessEnv, args: string[]) => Promise<Inspection>;
    save: () => void;
    changed: () => void;
    busy: () => boolean;
    cancelled: () => boolean;
    readiness: () => boolean;
    completed: () => boolean;
    now: () => string;
  }) {}
  invalidate(clear = true): void {
    this.reading = undefined; this.lastCommand = undefined;
    if (clear) { const state = this.options.state(); delete state.current; delete state.approval; state.revision++; this.persist(); }
  }
  get view(): BillingView {
    const state = this.options.state(); const r = this.reading;
    const valid = r?.generation === this.options.generation() && !this.options.cancelled();
    const next = valid && r ? { ...r.inspection.summary, readingId: r.id, ...(r.inspection.readinessError ? { readinessError: r.inspection.readinessError } : {}), canApprove: !this.pending && !this.options.busy() && !r.inspection.readinessError && this.options.readiness() && r.inspection.summary.route === "metered" && !this.options.completed(), canClear: !this.pending && !this.options.busy() && !!state.approval } : undefined;
    return { executionId: state.executionId, selectionGeneration: this.options.generation(), pending: this.pending, ...(next ? { next } : {}), ...(state.lastLaunch ? { lastLaunch: state.lastLaunch } : {}), ...(state.hold ? { hold: state.hold } : {}), canLaunch: !this.options.completed() && !!next && !this.pending && !next.readinessError && (next.route !== "metered" || next.approved) && this.options.readiness() };
  }
  async refresh(cwd: string, env: NodeJS.ProcessEnv, args: string[] = [], fresh = false): Promise<Inspection> {
    const context = JSON.stringify([cwd, args, env]);
    if (this.inFlight) {
      if (!fresh && this.inFlightContext === context) return this.inFlight;
      await this.inFlight;
    }
    if (this.options.cancelled()) throw new BillingError("billing_busy", "Kiln is stopping.");
    const generation = this.options.generation();
    const executionId = this.options.state().executionId;
    this.pending = true; this.options.changed();
    const pending = this.options.inspect(cwd, { ...env }, args).then(inspection => {
      if (this.options.cancelled() || generation !== this.options.generation() || executionId !== this.options.state().executionId) throw new BillingError("execution_changed", "The selected execution changed. Recheck billing.");
      const state = this.options.state();
      // A failed/partial inventory is not evidence an earlier concrete override disappeared.
      if (inspection.summary.diagnostics.length && state.current?.summary.route === "metered" && inspection.summary.route !== "metered") {
        inspection.summary = { ...inspection.summary, route: "metered", sources: state.current.summary.sources, ...(state.current.summary.provider ? { provider: state.current.summary.provider } : {}) };
        inspection.identity = { incomplete: true, previous: state.current.fingerprint, current: inspection.identity };
      }
      const fingerprint = createHmac("sha256", Buffer.from(state.key, "hex")).update(JSON.stringify(inspection.identity)).digest("hex");
      const before = structuredClone(state);
      if (state.current?.fingerprint !== fingerprint) { delete state.approval; state.revision++; }
      inspection.summary.approved = inspection.summary.route === "metered" && state.approval?.contextFingerprint === fingerprint && state.approval.executionId === state.executionId && state.approval.contractVersion === BILLING_CONTRACT;
      state.current = { fingerprint, summary: inspection.summary };
      try { this.persist(); } catch (error) { for (const key of Object.keys(state)) Reflect.deleteProperty(state, key); Object.assign(state, before); throw error; }
      this.reading = { id: randomUUID(), fingerprint, context, generation, args: [...args], inspection };
      return inspection;
    }).finally(() => { if (this.inFlight === pending) { this.inFlight = undefined; this.inFlightContext = undefined; this.pending = false; this.options.changed(); } });
    this.inFlight = pending; this.inFlightContext = context;
    return pending;
  }
  async command(action: "approval" | "clear", body: Record<string, unknown>, cwd: string, env: NodeJS.ProcessEnv): Promise<BillingView> {
    const allowed = action === "approval" ? ["executionId", "selectionGeneration", "readingId", "approved"] : ["executionId", "selectionGeneration", "readingId"];
    if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.executionId !== "string" || !Number.isSafeInteger(body.selectionGeneration) || typeof body.readingId !== "string" || action === "approval" && body.approved !== true) throw new BillingError("invalid_request", "Use the current billing reading and explicit approval.", 400);
    if (this.options.busy() || this.commandBusy || this.pending) throw new BillingError("billing_busy", "Kiln is busy. Wait for the current operation.");
    if (body.executionId !== this.options.state().executionId || body.selectionGeneration !== this.options.generation()) throw new BillingError("execution_changed", "The selected execution changed. Recheck billing.");
    const reviewed = this.reading;
    if (!reviewed || reviewed.id !== body.readingId && !(this.lastCommand?.id === body.readingId && this.lastCommand.fingerprint === reviewed.fingerprint && this.lastCommand.action === action)) throw new BillingError("stale_billing_reading", "Billing changed. Review the current reading.");
    this.commandBusy = true;
    try {
      if (action === "approval") {
        const current = await this.refresh(cwd, env, reviewed.args, true);
        if (this.reading?.fingerprint !== reviewed.fingerprint || this.reading.context !== reviewed.context) throw new BillingError("stale_billing_reading", "Billing changed. Review the current reading.");
        if (current.readinessError || !this.options.readiness() || this.options.completed()) throw new BillingError("readiness_failed", "Agent readiness must pass before billing approval.");
        if (current.summary.route !== "metered") throw new BillingError("stale_billing_reading", "This route needs no API approval.");
        const state = this.options.state(); const previous = state.approval;
        state.approval = { executionId: state.executionId, contextFingerprint: this.reading.fingerprint, approvedAt: this.options.now(), contractVersion: BILLING_CONTRACT };
        try { this.persist(); } catch (error) { if (previous) state.approval = previous; else delete state.approval; throw error; }
        current.summary.approved = true;
      } else {
        const state = this.options.state(); const previous = state.approval;
        delete state.approval; state.revision++;
        try { this.persist(); } catch (error) { if (previous) state.approval = previous; throw error; }
        reviewed.inspection.summary.approved = false;
        reviewed.id = randomUUID();
      }
      this.lastCommand = { id: body.readingId as string, fingerprint: reviewed.fingerprint, action };
      this.options.changed(); return this.view;
    } finally { this.commandBusy = false; }
  }
  get busy(): boolean { return this.commandBusy; }
  private persist(): void { try { this.options.save(); } catch { throw new BillingError("billing_state_write_failed", "Billing state could not be saved. No AI work was authorized.", 500); } }
}
