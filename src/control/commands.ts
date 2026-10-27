import { validLiveTarget, sameLiveTarget, canonicalLiveTarget } from "../live/target.js";
/** Durable instruction journal. Only the exclusively locked controller writes this authority. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeDurableMetadata } from "./durable-file.js";
import { checkedPath, privateJson } from "./private-state.js";
import { ControlFailure, errorFact, result, type Result } from "./result.js";

export const ACTIONS = ["reply", "resume", "verify-and-advance", "request-pause", "cancel-pause", "continue", "check-again", "settings", "outside-confirmation", "take-over"] as const;
export type Action = typeof ACTIONS[number];
export interface Instruction { command_id: string; execution_id: string; status_token: string; action: Action; inputs: Record<string, unknown> }
export interface Effects { takeover?: "not_requested" | "requested" | "checkpoint_pending" | "released" | "unknown"; reply: "not_applicable" | "not_sent" | "submitted" | "delivered" | "unknown"; session: "not_started" | "starting" | "resumed" | "unknown"; plan: "not_advanced" | "advanced" | "unknown" }
export interface Receipt {
  live_target?: import("../live/target.js").LiveTarget;
  settings?: { keep_awake: boolean; resume_after_usage_limit: boolean };
  source: "caller" | "automatic";
  version: 1; sequence: number; id: string; command_id: string; execution_id: string; digest: string; instruction: Instruction;
  target: string; accepted_at: string; updated_at: string;
  state: "accepted" | "in_progress" | "completed" | "refused" | "failed" | "indeterminate";
  outcome: string | null; reason: string | null; effects: Effects;
  reply_text: string | null; acknowledged_by: string | null;
  stage: "intent" | "applying" | "dispatching" | "settled";
  session_id?: string; phase_key?: string; attempt_id?: string;
}
export interface ControlView { token: string; target: string; controls: { name: Action; available: boolean; reason: string | null }[] }
export interface ControlHost {
  execution(): string; view(): ControlView; runState(): string;
  apply(action: Action, inputs: Record<string, unknown>, receipt: Receipt): Promise<{ ok: boolean; outcome?: string; reason?: string; code?: string }>;
  reconcile(receipt: Receipt): Receipt | undefined;
  changed(): void;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pending = (r: Receipt) => ["accepted", "in_progress", "indeterminate"].includes(r.state);
function uncertainEffects(r: Receipt): void {
  if (r.stage === "dispatching" && r.effects.session !== "resumed") {
    r.effects.session = "unknown";
    if (r.reply_text !== null && r.effects.reply !== "delivered") r.effects.reply = "unknown";
  }
  if (["verify-and-advance", "check-again"].includes(r.instruction.action) && r.effects.plan !== "advanced") r.effects.plan = "unknown";
}
export function validateInstruction(raw: unknown): Instruction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ControlFailure("invalid_input", "A command object is required.", 2);
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join() !== ["action", "command_id", "execution_id", "inputs", "status_token"].join() || typeof r.command_id !== "string" || !/^[\w.-]{1,128}$/.test(r.command_id) || typeof r.execution_id !== "string" || !r.execution_id || typeof r.status_token !== "string" || !r.status_token || r.status_token.length > 512 || !ACTIONS.includes(r.action as Action) || !r.inputs || typeof r.inputs !== "object" || Array.isArray(r.inputs)) throw new ControlFailure("invalid_input", "Invalid command identity, action or inputs.", 2);
  const inputs = r.inputs as Record<string, unknown>; const keys = Object.keys(inputs).sort();
  const allowed: Record<Action, string[]> = { reply: ["message", "live_target"], resume: ["live_target"], "verify-and-advance": ["without_sending_reply", "live_target"], "request-pause": [], "cancel-pause": [], continue: [], "check-again": [], settings: ["keep_awake", "resume_after_usage_limit"], "outside-confirmation": ["confirmed"], "take-over": ["target"] };
  if (keys.some(k => !allowed[r.action as Action].includes(k))) throw new ControlFailure("invalid_input", "Unexpected action input.", 2);
  if (inputs.live_target !== undefined && !validLiveTarget(inputs.live_target)) throw new ControlFailure("invalid_input", "Invalid live hand-back target.", 2);
  if (validLiveTarget(inputs.live_target)) inputs.live_target = canonicalLiveTarget(inputs.live_target);
  if (r.action === "take-over") {
    if (!validLiveTarget(inputs.target)) throw new ControlFailure("invalid_input", "An exact live target is required.", 2);
    inputs.target = canonicalLiveTarget(inputs.target);
  } else if (r.action === "reply") {
    if (typeof inputs.message !== "string" || !inputs.message.trim() || inputs.message.includes("\0") || inputs.message.trim().length > 4000) throw new ControlFailure("invalid_input", "A nonempty literal reply of at most 4,000 characters is required.", 2);
    inputs.message = inputs.message.trim();
  } else if (keys.some(k => k !== "live_target" && typeof inputs[k] !== "boolean") || r.action === "settings" && !keys.length || r.action === "outside-confirmation" && keys.length !== 1) throw new ControlFailure("invalid_input", "Specify boolean control values.", 2);
  return { command_id: r.command_id, execution_id: r.execution_id, status_token: r.status_token, action: r.action as Action, inputs: Object.fromEntries(keys.map(k => [k, inputs[k]])) };
}
function receiptPath(directory: string, execution: string, id: string): string { return join(directory, "controls", hash(execution), `${hash(id)}.json`); }
function validReceipt(r: Receipt | undefined): r is Receipt {
  return !!r && ["caller", "automatic"].includes(r.source) && typeof r.id === "string" && typeof r.target === "string"
    && ["accepted", "in_progress", "completed", "refused", "failed", "indeterminate"].includes(r.state)
    && ["intent", "applying", "dispatching", "settled"].includes(r.stage)
    && !!r.effects && ["not_applicable", "not_sent", "submitted", "delivered", "unknown"].includes(r.effects.reply)
    && ["not_started", "starting", "resumed", "unknown"].includes(r.effects.session) && ["not_advanced", "advanced", "unknown"].includes(r.effects.plan)
    && Number.isFinite(Date.parse(r.accepted_at)) && Number.isFinite(Date.parse(r.updated_at))
    && (r.outcome === null || typeof r.outcome === "string") && (r.reason === null || typeof r.reason === "string")
    && (r.acknowledged_by === null || typeof r.acknowledged_by === "string")
    && (r.settings === undefined || typeof r.settings.keep_awake === "boolean" && typeof r.settings.resume_after_usage_limit === "boolean")
    && !!r.instruction && (r.instruction.action === "reply" ? r.reply_text === r.instruction.inputs?.message : r.reply_text === null)
    && [r.session_id, r.phase_key, r.attempt_id].every(v => v === undefined || typeof v === "string");
}
export function readReceipts(directory: string): Receipt[] {
  const base = join(directory, "controls"); if (!existsSync(base)) return [];
  checkedPath(dirname(dirname(directory)), base);
  const all: Receipt[] = []; const deadline = Date.now() + 5000;
  for (const execution of readdirSync(base)) {
    if (!/^[a-f0-9]{64}$/.test(execution)) throw new ControlFailure("state_unavailable", "Malformed control journal directory.");
    checkedPath(dirname(dirname(directory)), join(base, execution));
    for (const file of readdirSync(join(base, execution))) {
      if (file.endsWith(".tmp")) continue;
      if (Date.now() > deadline) throw new ControlFailure("state_unavailable", "Control journal scan deadline exceeded.");
      const saved = privateJson<{ checksum: string; receipt: Receipt }>(dirname(dirname(directory)), join(base, execution, file));
      const r = saved.receipt;
      if (!validReceipt(r) || r.version !== 1 || saved.checksum !== hash(r) || !Number.isSafeInteger(r.sequence) || r.sequence < 1 || file !== `${hash(r.command_id)}.json` || execution !== hash(r.execution_id) || r.instruction.command_id !== r.command_id || r.instruction.execution_id !== r.execution_id || r.digest !== hash(validateInstruction(structuredClone(r.instruction)))) throw new ControlFailure("state_unavailable", "Control journal integrity or version is invalid; no effects authorized.");
      all.push(r);
    }
  }
  if (new Set(all.map(r => r.command_id)).size !== all.length) throw new ControlFailure("state_unavailable", "Conflicting durable command identities.");
  return all;
}
export function receiptResult(canonical: string, r: Receipt, state: string, query = false): Result {
  const errors = !query && r.state === "refused" ? [errorFact(r.outcome!, r.reason!, ["kiln", "status", canonical, "--json"])] : !query && r.state === "indeterminate" ? [errorFact("operation_indeterminate", r.reason ?? "Inspect the saved operation before issuing another instruction.", ["kiln", "command-status", canonical, "--command-id", r.command_id, "--json"])] : [];
  // Canonical inputs and their digest stay private. Ordinary reply text is intentionally retrievable.
  const operation: Partial<Receipt> = { ...r }; delete operation.instruction; delete operation.digest;
  return result({ prd_path: canonical, execution_id: r.execution_id, command_id: r.command_id, operation, run_state: state }, errors);
}
export function lookupReceipt(directory: string, id: string): Receipt {
  if (!/^[\w.-]{1,128}$/.test(id)) throw new ControlFailure("invalid_input", "Invalid command ID.", 2);
  const r = readReceipts(directory).find(r => r.command_id === id);
  if (!r) throw new ControlFailure("command_not_found", "No saved instruction has this command ID.", 2);
  return r;
}
export class CommandJournal {
  private receipts: Receipt[];
  private applying: Receipt | undefined;
  private workers = new Set<Promise<void>>();
  private automaticDispatch: Receipt | undefined;
  fault: string | undefined;
  constructor(readonly directory: string, readonly canonical: string, private host: ControlHost) {
    this.receipts = readReceipts(directory);
    for (const r of this.receipts.filter(pending)) this.reconcileOne(r);
  }
  has(id: string): boolean { return this.receipts.some(r => r.command_id === id); }
  get blocked(): boolean { return !!this.fault || this.receipts.some(r => pending(r) && r !== this.applying); }
  get busy(): boolean { return !!this.applying || this.blocked; }
  get active(): Receipt | undefined { return this.applying; }
  unsent(target: string): Receipt[] { return this.receipts.filter(r => r.execution_id === this.host.execution() && r.target === target && r.outcome === "phase_already_complete" && r.reply_text !== null && !r.acknowledged_by); }
  private save(r: Receipt): void {
    r.updated_at = new Date().toISOString();
    try {
      const path = receiptPath(this.directory, r.execution_id, r.command_id);
      let parent = dirname(path); while (!existsSync(parent)) parent = dirname(parent);
      checkedPath(dirname(dirname(this.directory)), parent);
      if (existsSync(path)) checkedPath(dirname(dirname(this.directory)), path);
      writeDurableMetadata(path, { checksum: hash(r), receipt: r });
    }
    catch { this.fault = "A durable control write failed. Restart to reconcile before changing work."; throw new ControlFailure("state_unavailable", this.fault); }
  }
  private reconcileOne(r: Receipt): void {
    const known = this.host.reconcile(r);
    if (known) {
      Object.assign(r, known);
      if (r.effects.plan === "advanced" && r.instruction.inputs.without_sending_reply === true) {
        for (const prior of this.unsent(r.target)) { prior.acknowledged_by = r.id; this.save(prior); }
      }
      this.save(r); return;
    }
    if (r.stage === "intent") { r.state = "failed"; r.outcome = "not_applied"; r.reason = "Controller stopped before applying this instruction."; }
    else { r.state = "indeterminate"; uncertainEffects(r); r.reason = "Controller stopped during an effect. Reconcile the recorded attempt; this instruction will not be dispatched again."; }
    this.save(r);
  }
  /** Automatic launches share durable ownership with browser and CLI instructions. */
  beginAutomatic(eventId: string): Receipt {
    if (this.busy) throw new ControlFailure("operation_indeterminate", "An unresolved instruction prevents automatic dispatch.");
    const view = this.host.view(); const at = new Date().toISOString();
    const instruction: Instruction = { command_id: `auto-${hash(eventId)}`, execution_id: this.host.execution(), status_token: view.token, action: "resume", inputs: {} };
    if (this.receipts.some(r => r.command_id === instruction.command_id)) throw new ControlFailure("operation_indeterminate", "This automatic attempt already has a receipt; it cannot be dispatched twice.");
    const receipt: Receipt = { source: "automatic", version: 1, sequence: this.nextSequence(), id: randomUUID(), command_id: instruction.command_id, execution_id: instruction.execution_id, digest: hash(instruction), instruction, target: view.target, accepted_at: at, updated_at: at, state: "in_progress", stage: "applying", outcome: null, reason: null, effects: { reply: "not_applicable", session: "not_started", plan: "not_advanced" }, reply_text: null, acknowledged_by: null };
    this.save(receipt); this.receipts.push(receipt); this.applying = receipt; this.automaticDispatch = receipt;
    return receipt;
  }
  finishAutomatic(receipt: Receipt): void {
    if (this.automaticDispatch !== receipt) return;
    receipt.state = receipt.effects.session === "resumed" ? "completed" : receipt.effects.session === "not_started" ? "failed" : "indeterminate";
    receipt.outcome = receipt.state === "completed" ? "session_resumed" : receipt.state === "failed" ? "dispatch_not_started" : null;
    receipt.stage = receipt.state === "indeterminate" ? "dispatching" : "settled";
    try { this.save(receipt); } finally { this.automaticDispatch = undefined; this.applying = undefined; }
  }
  private nextSequence(): number { return this.receipts.reduce((max, r) => Math.max(max, r.sequence), 0) + 1; }
  lookup(id: string): Result {
    const r = this.receipts.find(r => r.command_id === id);
    if (!r) throw new ControlFailure("command_not_found", "No saved instruction has this command ID.", 2);
    if (pending(r) && r !== this.applying) this.reconcileOne(r);
    return receiptResult(this.canonical, r, this.host.runState(), true);
  }
  submit(raw: unknown, source: Receipt["source"] = "caller"): Result {
    const instruction = validateInstruction(raw); const digest = hash(instruction);
    const old = this.receipts.find(r => r.command_id === instruction.command_id);
    if (old) {
      if (old.digest !== digest) throw new ControlFailure("command_id_conflict", "Command ID already belongs to different inputs. Do not reuse it for a new instruction.", 2);
      if (pending(old) && old !== this.applying) this.reconcileOne(old);
      return receiptResult(this.canonical, old, this.host.runState());
    }
    for (const receipt of this.receipts.filter(r => pending(r) && r !== this.applying)) this.reconcileOne(receipt);
    const view = this.host.view();
    const control = view.controls.find(c => c.name === instruction.action)!;
    const unsent = this.unsent(view.target);
    const refusal = this.busy ? ["busy", "Another accepted instruction owns control; inspect its receipt."] : instruction.execution_id !== this.host.execution() || (instruction.action === "take-over" || instruction.inputs.live_target ? !sameLiveTarget((instruction.inputs.live_target ?? instruction.inputs.target) as import("../live/target.js").LiveTarget, (JSON.parse(view.target) as { live?: import("../live/target.js").LiveTarget }).live) : instruction.status_token !== view.token) ? ["stale_status_token", "The observed execution or control state changed. Refresh status."] : !control.available ? ["control_unavailable", control.reason!] : instruction.action === "verify-and-advance" && unsent.length && instruction.inputs.without_sending_reply !== true ? ["unsent_reply_acknowledgement_required", "A preserved reply was not sent. Explicitly acknowledge it before advancing."] : null;
    const at = new Date().toISOString();
    const r: Receipt = { source, version: 1, sequence: this.nextSequence(), id: randomUUID(), command_id: instruction.command_id, execution_id: instruction.execution_id, digest, instruction, target: view.target, accepted_at: at, updated_at: at,
      state: refusal ? "refused" : "accepted", outcome: refusal?.[0] ?? null, reason: refusal?.[1] ?? null, effects: { reply: instruction.action === "reply" ? "not_sent" : "not_applicable", session: "not_started", plan: "not_advanced" }, reply_text: instruction.action === "reply" ? String(instruction.inputs.message) : null, acknowledged_by: null, stage: "intent" };
    this.save(r); this.receipts.push(r);
    if (!refusal) {
      this.applying = r;
      const work = this.execute(r, unsent).finally(() => { this.workers.delete(work); this.host.changed(); });
      this.workers.add(work);
    }
    this.host.changed();
    return receiptResult(this.canonical, r, this.host.runState());
  }
  private async execute(r: Receipt, unsent: Receipt[]): Promise<void> {
    try {
      r.state = "in_progress"; r.stage = "applying"; this.save(r);
      const answer = await this.host.apply(r.instruction.action, r.instruction.inputs, r);
      if (!answer.ok) { r.state = "failed"; r.outcome = answer.code ?? "control_unavailable"; r.reason = answer.reason ?? "The existing control refused the action."; }
      else {
        r.state = "completed"; r.outcome = answer.outcome ?? "completed";
        if (r.outcome === "advanced") {
          r.effects.plan = "advanced";
          for (const prior of unsent) { prior.acknowledged_by = r.id; this.save(prior); }
        }
      }
      r.stage = "settled"; this.save(r);
    } catch (e) {
      r.state = "indeterminate"; r.reason = e instanceof ControlFailure ? e.message : "An effect could not be durably settled. Reconcile before another instruction.";
      uncertainEffects(r);
      try { this.save(r); } catch { /* fault retains the pending durable intent and blocks all dispatch */ }
    } finally { this.applying = undefined; }
  }
  recordDelivery(id: string): void {
    const r = this.receipts.find(r => r.command_id === id)!;
    r.effects.reply = "delivered"; r.effects.session = "resumed"; r.state = "completed"; r.outcome = "session_resumed"; r.stage = "settled"; r.reason = null; this.save(r); this.host.changed();
  }
  checkpoint(receipt: Receipt): void { this.save(receipt); }
  async settled(): Promise<void> { await Promise.all(this.workers); }
}
