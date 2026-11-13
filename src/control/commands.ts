import { validLiveTarget, sameLiveTarget, canonicalLiveTarget, messageProblem, messageReceiptLabel } from "../live/target.js";
/** Durable instruction journal. Only the exclusively locked controller writes this authority. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeDurableMetadata } from "./durable-file.js";
import { checkedPath, privateJson } from "./private-state.js";
import { ControlFailure, errorFact, result, type Result } from "./result.js";
import type { ItemChange, MarkCompleteOffer } from "../engine/waivers.js";
import { markCompletePreview } from "./waiver-facts.js";

export const ACTIONS = ["reply", "resume", "verify-and-advance", "request-pause", "cancel-pause", "continue", "check-again", "settings", "outside-confirmation", "take-over", "message", "message-review", "waive-and-advance", "carry-on", "start-again", "reset"] as const;
/** The actions that start a new session of a stopped phase (run restart AC-CARRY-04): their receipts settle `started`, never `resumed`. */
export const STARTING_ACTIONS: readonly string[] = ["carry-on", "start-again"];
export type Action = typeof ACTIONS[number];
const INTERNAL_ACTIONS = ["continuation-accept", "continuation-retry", "continuation-grant", "folder-setup-start"] as const;
export type JournalAction = Action | typeof INTERNAL_ACTIONS[number];
export interface Instruction { command_id: string; execution_id: string; status_token: string; action: JournalAction; inputs: Record<string, unknown> }
export interface Effects { message?: "not_sent" | "submitted" | "received" | "unknown"; takeover?: "not_requested" | "requested" | "checkpoint_pending" | "released" | "unknown"; reply: "not_applicable" | "not_sent" | "submitted" | "delivered" | "unknown"; session: "not_started" | "starting" | "started" | "resumed" | "unknown"; plan: "not_advanced" | "advanced" | "unknown" }
export interface Receipt {
  message?: import("../live/target.js").LiveMessage;
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
  /** `waive-and-advance` only: the waiver a `marked_complete` or `continued` outcome saved (AC-WAIVE-08). */
  waiver_id?: string;
  /** `waive-and-advance` only: each item that changed when a `check_results_changed` rerun differed from the offered run (AC-WAIVE-04). */
  changes?: ItemChange[];
  /** The four session-starting actions: what a catch-up moved before the session, empty when nothing did (run restart AC-CURRENT-01). */
  branch_catch_up?: { repository: string; branch: string; from: string; to: string; commits: number }[];
  /** `reset` only: what the reset discards and the execution it starts, checkpointed before the record changes (run restart "Doing it", step 2). */
  reset?: { forgets: ResetForgets; new_execution_id: string };
}
/** The counts a reset's confirmation names under Kiln forgets (run restart AC-RESET-03). */
export interface ResetForgets { phaseResults: number; sessions: number; stops: number; waivers: number; audits: number; deliveries: number }
/** The outcomes of `waive-and-advance` that advance the plan (waivers "Command line"). */
export const WAIVE_ADVANCING_OUTCOMES = ["marked_complete", "checks_passed", "continued"];
/** Rechecks whose failed outcome carries the stop's Mark complete preview (AC-WAIVE-05). */
const RECHECKS = ["check-again", "verify-and-advance"];
/** An optional `--by` name: 1 to 64 printable characters, stored verbatim (AC-WAIVE-05, AC-WAIVE-08). */
export function validBy(value: unknown): value is string {
  return typeof value === "string" && [...value].length >= 1 && [...value].length <= 64 && /^[^\p{C}]+$/u.test(value) && /\S/u.test(value);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Filled in by the control route when no Mark complete is offered, so the refusal is still a durable receipt. */
export const NO_CHECK_RUN = "00000000-0000-0000-0000-000000000000";
export interface ControlView { token: string; target: string; controls: { name: Action; available: boolean; reason: string | null }[] }
export interface ControlHost {
  execution(): string; view(): ControlView; runState(): string;
  journalScope?(): { execution: string; commandIds: string[] } | undefined;
  internalControl?(instruction: Instruction): { available: boolean; reason: string | null; alreadyApplied?: boolean };
  staleReason?(instruction: Instruction): string | undefined;
  apply(action: JournalAction, inputs: Record<string, unknown>, receipt: Receipt): Promise<{ ok: boolean; outcome?: string; reason?: string; code?: string; waiver_id?: string; changes?: ItemChange[] }>;
  /** The one Mark complete predicate the snapshot, CLI and server share (AC-WAIVE-02). */
  markCompleteOffer?(): MarkCompleteOffer;
  reconcile(receipt: Receipt): Receipt | undefined;
  changed(): void;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pending = (r: Receipt) => ["accepted", "in_progress", "indeterminate"].includes(r.state);
function uncertainEffects(r: Receipt): void {
  if (r.stage === "dispatching" && r.effects.session !== "resumed" && r.effects.session !== "started") {
    r.effects.session = "unknown";
    if (r.reply_text !== null && r.effects.reply !== "delivered") r.effects.reply = "unknown";
  }
  if (["verify-and-advance", "check-again", "waive-and-advance"].includes(r.instruction.action) && r.effects.plan !== "advanced") r.effects.plan = "unknown";
}
/**
 * A carry-on that finds the phase already complete keeps its reply unsent, as a reply does
 * (run restart AC-CARRY-05): the text is kept only then, since a started carry-on's reply rides
 * in the new session's prompt rather than being delivered to a conversation.
 */
function keepUnsentCarryOnReply(r: Receipt): void {
  const message = r.instruction.inputs.message;
  if (r.instruction.action !== "carry-on" || r.outcome !== "phase_already_complete" || typeof message !== "string" || !message.trim()) return;
  r.reply_text = message; r.effects.reply = "not_sent";
}
export function validateInstruction(raw: unknown): Instruction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ControlFailure("invalid_input", "A command object is required.", 2);
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join() !== ["action", "command_id", "execution_id", "inputs", "status_token"].join() || typeof r.command_id !== "string" || !/^[\w.-]{1,128}$/.test(r.command_id) || typeof r.execution_id !== "string" || !r.execution_id || typeof r.status_token !== "string" || !r.status_token || r.status_token.length > 512 || !ACTIONS.includes(r.action as Action) || !r.inputs || typeof r.inputs !== "object" || Array.isArray(r.inputs)) throw new ControlFailure("invalid_input", "Invalid command identity, action or inputs.", 2);
  const inputs = r.inputs as Record<string, unknown>; const keys = Object.keys(inputs).sort();
  const allowed: Record<Action, string[]> = { "waive-and-advance": ["check_run_id", "by", "via", "live_target", "reviewed_receipt_ids", "without_sending_reply"], reply: ["message", "live_target", "reviewed_receipt_ids", "leave_branch", "bring_up_to_date"], resume: ["live_target", "reviewed_receipt_ids", "leave_branch", "bring_up_to_date"], "verify-and-advance": ["without_sending_reply", "live_target", "reviewed_receipt_ids"], "request-pause": [], "cancel-pause": [], continue: [], "check-again": [], settings: ["keep_awake", "resume_after_usage_limit"], "outside-confirmation": ["confirmed", "accept_uncertainty"], "take-over": ["target"], message: ["target", "text"], "message-review": ["target", "receipt_ids"], "carry-on": ["message", "live_target", "reviewed_receipt_ids", "leave_branch", "bring_up_to_date"], "start-again": ["leave_branch", "bring_up_to_date"], reset: [] };
  if (keys.some(k => !allowed[r.action as Action].includes(k))) throw new ControlFailure("invalid_input", "Unexpected action input.", 2);
  if (inputs.reviewed_receipt_ids !== undefined && (!Array.isArray(inputs.reviewed_receipt_ids) || inputs.reviewed_receipt_ids.length > 50 || !inputs.reviewed_receipt_ids.every(id => typeof id === "string" && /^[\w.-]{1,128}$/.test(id)))) throw new ControlFailure("invalid_input", "Specify exact reviewed receipt IDs.", 2);
  if (inputs.live_target !== undefined && !validLiveTarget(inputs.live_target)) throw new ControlFailure("invalid_input", "Invalid live hand-back target.", 2);
  if ([inputs.leave_branch, inputs.bring_up_to_date].some(value => value !== undefined && typeof value !== "boolean") || inputs.leave_branch === true && inputs.bring_up_to_date === true) throw new ControlFailure("invalid_input", "Choose whether to leave the branch as it is or bring it up to date, not both.", 2);
  if (validLiveTarget(inputs.live_target)) inputs.live_target = canonicalLiveTarget(inputs.live_target);
  if (["take-over", "message", "message-review"].includes(String(r.action))) {
    if (!validLiveTarget(inputs.target)) throw new ControlFailure("invalid_input", "An exact live target is required.", 2);
    inputs.target = canonicalLiveTarget(inputs.target);
    if (r.action === "message" && messageProblem(inputs.text)) throw new ControlFailure("invalid_input", messageProblem(inputs.text)!, 2);
    if (r.action === "message-review" && (!Array.isArray(inputs.receipt_ids) || !inputs.receipt_ids.length || inputs.receipt_ids.length > 50 || !inputs.receipt_ids.every(id => typeof id === "string" && /^[\w.-]{1,128}$/.test(id)))) throw new ControlFailure("invalid_input", "Specify exact uncertain receipt IDs.", 2);
  } else if (r.action === "waive-and-advance") {
    if (typeof inputs.check_run_id !== "string" || !UUID.test(inputs.check_run_id)) throw new ControlFailure("invalid_input", "Mark complete needs the check run it was offered on.", 2);
    if (inputs.by !== undefined && !validBy(inputs.by)) throw new ControlFailure("invalid_input", "--by takes a name of 1 to 64 printable characters.", 2);
    if (!["browser", "command_line"].includes(inputs.via as string)) throw new ControlFailure("invalid_input", "Mark complete needs the entry point that admitted it.", 2);
    if (inputs.without_sending_reply !== undefined && typeof inputs.without_sending_reply !== "boolean") throw new ControlFailure("invalid_input", "Specify boolean control values.", 2);
  } else if (r.action === "carry-on") {
    // The reply is optional (AC-CARRY-05); when given it is a literal reply, as `kiln reply` takes.
    if (inputs.message !== undefined && (typeof inputs.message !== "string" || inputs.message.includes("\0") || inputs.message.trim().length > 4000)) throw new ControlFailure("invalid_input", "A literal reply of at most 4,000 characters is required.", 2);
    if (typeof inputs.message === "string") { if (inputs.message.trim()) inputs.message = inputs.message.trim(); else delete inputs.message; }
  } else if (r.action === "reply") {
    if (typeof inputs.message !== "string" || !inputs.message.trim() || inputs.message.includes("\0") || inputs.message.trim().length > 4000) throw new ControlFailure("invalid_input", "A nonempty literal reply of at most 4,000 characters is required.", 2);
    inputs.message = inputs.message.trim();
  } else if (keys.some(k => k !== "live_target" && k !== "reviewed_receipt_ids" && typeof inputs[k] !== "boolean") || r.action === "settings" && !keys.length || r.action === "outside-confirmation" && (typeof inputs.confirmed !== "boolean" || keys.length > 2)) throw new ControlFailure("invalid_input", "Specify boolean control values.", 2);
  return { command_id: r.command_id, execution_id: r.execution_id, status_token: r.status_token, action: r.action as Action, inputs: Object.fromEntries(keys.map(k => [k, inputs[k]])) };
}
function receiptPath(directory: string, execution: string, id: string): string { return join(directory, "controls", hash(execution), `${hash(id)}.json`); }
function validReceipt(r: Receipt | undefined): r is Receipt {
  return !!r && ["caller", "automatic"].includes(r.source) && typeof r.id === "string" && typeof r.target === "string"
    && ["accepted", "in_progress", "completed", "refused", "failed", "indeterminate"].includes(r.state)
    && ["intent", "applying", "dispatching", "settled"].includes(r.stage)
    && !!r.effects && ["not_applicable", "not_sent", "submitted", "delivered", "unknown"].includes(r.effects.reply)
    && ["not_started", "starting", "started", "resumed", "unknown"].includes(r.effects.session) && ["not_advanced", "advanced", "unknown"].includes(r.effects.plan)
    && Number.isFinite(Date.parse(r.accepted_at)) && Number.isFinite(Date.parse(r.updated_at))
    && (r.outcome === null || typeof r.outcome === "string") && (r.reason === null || typeof r.reason === "string")
    && (r.acknowledged_by === null || typeof r.acknowledged_by === "string")
    && (r.settings === undefined || typeof r.settings.keep_awake === "boolean" && typeof r.settings.resume_after_usage_limit === "boolean")
    && !!r.instruction && (r.instruction.action === "reply" ? r.reply_text === r.instruction.inputs?.message : r.instruction.action === "carry-on" ? r.reply_text === null || r.outcome === "phase_already_complete" && r.reply_text === r.instruction.inputs?.message : r.reply_text === null)
    && (r.message === undefined || r.instruction.action === "message" && validLiveTarget(r.live_target) && r.message.text === r.instruction.inputs.text && typeof r.message.uuid === "string" && !!r.message.uuid && ["submitting", "submitted", "received", "not_sent", "uncertain"].includes(r.message.delivery) && [r.message.writeStartedAt, r.message.writeCompletedAt, r.message.writeSettledAt, r.message.receivedAt, r.message.resultAt, r.message.reviewedAt].every(v => v === undefined || Number.isFinite(Date.parse(v))))
    && [r.session_id, r.phase_key, r.attempt_id, r.waiver_id].every(v => v === undefined || typeof v === "string")
    && (r.changes === undefined || Array.isArray(r.changes) && r.changes.every(c => !!c && typeof c.check === "string" && typeof c.subject === "string" && ["newly_failing", "newly_passing", "text_changed"].includes(c.change)));
}
function validateInternalInstruction(raw: unknown): Instruction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ControlFailure("invalid_input", "A command object is required.", 2);
  const value = raw as Instruction;
  if (value.action === "continuation-grant") {
    const input = value.inputs;
    if (!input || Object.keys(input).sort().join() !== "authorization_revision,proposal_id,target" || typeof input.proposal_id !== "string" || !/^[a-f0-9]{64}$/.test(input.proposal_id) || !Number.isSafeInteger(input.authorization_revision) || !input.target || typeof input.target !== "object" || Array.isArray(input.target)) throw new ControlFailure("invalid_input", "Invalid continuation grant instruction.", 2);
    validateInstruction({ ...value, action: "continue", inputs: {} });
    return value;
  }
  if (value.action === "folder-setup-start") {
    // Start on the Folder missing page (missing worktree recovery, "Interfaces"): the page's facts and preview identities, the start and the draft fields.
    const input = value.inputs;
    if (!input || Object.keys(input).sort().join() !== "facts_id,fields,preview_id,start" || typeof input.facts_id !== "string" || !/^[a-f0-9]{64}$/.test(input.facts_id) || typeof input.preview_id !== "string" || !/^[a-f0-9]{64}$/.test(input.preview_id) || !["base", "branch"].includes(input.start as string) || !input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) throw new ControlFailure("invalid_input", "Invalid Folder missing start instruction.", 2);
    validateInstruction({ ...value, action: "continue", inputs: {} });
    return value;
  }
  const key = value.action === "continuation-accept" ? "proposal_id" : "acceptance_id";
  if (!INTERNAL_ACTIONS.includes(value.action as typeof INTERNAL_ACTIONS[number]) || !value.inputs || Object.keys(value.inputs).join() !== key || typeof value.inputs[key] !== "string" || !(key === "proposal_id" ? /^[a-f0-9]{64}$/ : /^[\w.-]{1,128}$/).test(value.inputs[key] as string)) throw new ControlFailure("invalid_input", "Invalid internal continuation instruction.", 2);
  validateInstruction({ ...value, action: "continue", inputs: {} });
  return value;
}
function validateSavedInstruction(raw: Instruction): Instruction { return INTERNAL_ACTIONS.includes(raw.action as typeof INTERNAL_ACTIONS[number]) ? validateInternalInstruction(raw) : validateInstruction(raw); }
function indexedReceipt(directory: string, id: string): Receipt | undefined {
  if (!/^[\w.-]{1,128}$/.test(id)) throw new ControlFailure("invalid_input", "Invalid command ID.", 2);
  const path = join(directory, "control-index", `${hash(id)}.json`);
  if (!existsSync(path)) return undefined;
  const link = privateJson<{ version: number; execution_id: string; command_id: string }>(dirname(dirname(directory)), path);
  if (link.version !== 1 || link.command_id !== id || typeof link.execution_id !== "string" || !link.execution_id) throw new ControlFailure("state_unavailable", "Invalid command identity index.");
  const saved = privateJson<{ checksum: string; receipt: Receipt }>(dirname(dirname(directory)), receiptPath(directory, link.execution_id, id));
  const r = saved.receipt;
  if (!validReceipt(r) || r.version !== 1 || r.command_id !== id || r.execution_id !== link.execution_id || r.instruction.command_id !== id || r.instruction.execution_id !== link.execution_id || !Number.isSafeInteger(r.sequence) || r.sequence < 1 || saved.checksum !== hash(r) || r.digest !== hash(validateSavedInstruction(structuredClone(r.instruction)))) throw new ControlFailure("state_unavailable", "Indexed command receipt is damaged.");
  return r;
}
export function readReceipts(directory: string, executions?: string[]): Receipt[] {
  const base = join(directory, "controls"); if (!existsSync(base)) return [];
  checkedPath(dirname(dirname(directory)), base);
  const all: Receipt[] = []; const deadline = Date.now() + 5000;
  for (const execution of executions ? [...new Set(executions.map(hash))].filter(id => existsSync(join(base, id))) : readdirSync(base)) {
    if (!/^[a-f0-9]{64}$/.test(execution)) throw new ControlFailure("state_unavailable", "Malformed control journal directory.");
    checkedPath(dirname(dirname(directory)), join(base, execution));
    for (const file of readdirSync(join(base, execution))) {
      if (file.endsWith(".tmp")) continue;
      if (Date.now() > deadline) throw new ControlFailure("state_unavailable", "Control journal scan deadline exceeded.");
      const saved = privateJson<{ checksum: string; receipt: Receipt }>(dirname(dirname(directory)), join(base, execution, file));
      const r = saved.receipt;
      if (!validReceipt(r) || r.version !== 1 || saved.checksum !== hash(r) || !Number.isSafeInteger(r.sequence) || r.sequence < 1 || file !== `${hash(r.command_id)}.json` || execution !== hash(r.execution_id) || r.instruction.command_id !== r.command_id || r.instruction.execution_id !== r.execution_id || r.digest !== hash(validateSavedInstruction(structuredClone(r.instruction)))) throw new ControlFailure("state_unavailable", "Control journal integrity or version is invalid; no effects authorized.");
      all.push(r);
    }
  }
  if (new Set(all.map(r => r.command_id)).size !== all.length) throw new ControlFailure("state_unavailable", "Conflicting durable command identities.");
  return all.sort((a, b) => a.sequence - b.sequence);
}
export function receiptResult(canonical: string, r: Receipt, state: string, query = false, markComplete?: Record<string, unknown>): Result {
  // A retried Mark complete whose rerun could not finish reports it as an error (exit 4); a receipt query stays a successful read.
  const unavailable = !query && r.instruction.action === "waive-and-advance" && r.state === "failed" && r.outcome === "check_unavailable";
  const errors = !query && r.state === "refused" ? [errorFact(r.outcome!, r.reason!, ["kiln", "status", canonical, "--json"])] : !query && r.state === "indeterminate" ? [errorFact("operation_indeterminate", r.reason ?? "Inspect the saved operation before issuing another instruction.", ["kiln", "command-status", canonical, "--command-id", r.command_id, "--json"])] : unavailable ? [errorFact("check_unavailable", r.reason ?? "The completion check could not finish.", ["kiln", "status", canonical, "--json"])] : [];
  // Canonical inputs and their digest stay private. Ordinary reply text is intentionally retrievable.
  const operation: Partial<Receipt> & { action?: JournalAction } = { ...r, action: r.instruction.action }; delete operation.instruction; delete operation.digest;
  return result({ prd_path: canonical, execution_id: r.execution_id, command_id: r.command_id, operation, ...(r.message ? { message_receipt: messageReceiptLabel(r.message.delivery) } : {}), ...(markComplete ? { mark_complete: markComplete } : {}), run_state: state }, errors);
}
export function lookupReceipt(directory: string, id: string): Receipt {
  if (!/^[\w.-]{1,128}$/.test(id)) throw new ControlFailure("invalid_input", "Invalid command ID.", 2);
  const r = indexedReceipt(directory, id) ?? readReceipts(directory).find(r => r.command_id === id);
  if (!r) throw new ControlFailure("command_not_found", "No saved instruction has this command ID.", 2);
  return r;
}
export class CommandJournal {
  private receipts: Receipt[];
  private applying: Receipt | undefined;
  private workers = new Set<Promise<void>>();
  private automaticDispatch: Receipt | undefined;
  private indexed = false;
  private sequence = 0;
  fault: string | undefined;
  constructor(readonly directory: string, readonly canonical: string, private host: ControlHost) {
    const scope = host.journalScope?.();
    this.indexed = !!scope;
    if (scope && !existsSync(join(directory, "control-index"))) throw new ControlFailure("state_unavailable", "The execution command index is unavailable.");
    this.receipts = readReceipts(directory, scope ? [scope.execution] : undefined);
    if (scope) {
      const cursor = privateJson<{ version: number; sequence: number }>(dirname(dirname(directory)), join(directory, "control-index", "sequence.json"));
      if (cursor.version !== 1 || !Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0) throw new ControlFailure("state_unavailable", "The command sequence cursor is damaged.");
      this.sequence = cursor.sequence;
    }
    for (const id of scope?.commandIds ?? []) {
      const r = indexedReceipt(directory, id);
      if (!r) throw new ControlFailure("state_unavailable", "The originating continuation receipt is unavailable.");
      if (!this.receipts.some(one => one.command_id === id)) this.receipts.push(r);
    }
    for (const r of this.receipts.filter(pending)) this.reconcileOne(r);
  }
  all(): readonly Receipt[] { return this.receipts; }
  private find(id: string): Receipt | undefined {
    const found = this.receipts.find(r => r.command_id === id);
    if (found || !this.indexed) return found;
    const r = indexedReceipt(this.directory, id);
    if (r) this.receipts.push(r);
    return r;
  }
  has(id: string): boolean { return !!this.find(id); }
  /** Build direct identity lookups before the first execution rotates; not another journal. */
  enableExecutionIndex(): void {
    try { for (const r of this.receipts) this.index(r); this.sequence = Math.max(this.sequence, ...this.receipts.map(r => r.sequence)); this.saveSequence(); this.indexed = true; }
    catch { this.fault = "The command identity index could not be saved. Restart before changing work."; throw new ControlFailure("state_unavailable", this.fault); }
  }
  rotateExecution(execution: string, operationId: string): void { this.receipts = this.receipts.filter(r => r.execution_id === execution || r.id === operationId); }
  private index(r: Receipt): void { writeDurableMetadata(join(this.directory, "control-index", `${hash(r.command_id)}.json`), { version: 1, execution_id: r.execution_id, command_id: r.command_id }); }
  private saveSequence(): void {
    const directory = join(this.directory, "control-index");
    if (existsSync(directory)) checkedPath(dirname(dirname(this.directory)), directory);
    const path = join(directory, "sequence.json");
    if (existsSync(path)) checkedPath(dirname(dirname(this.directory)), path);
    writeDurableMetadata(path, { version: 1, sequence: this.sequence });
  }
  get blocked(): boolean { return !!this.fault || this.receipts.some(r => pending(r) && r !== this.applying && !r.message); }
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
      if (this.indexed) this.index(r);
    }
    catch { this.fault = "A durable control write failed. Restart to reconcile before changing work."; throw new ControlFailure("state_unavailable", this.fault); }
  }
  private reconcileOne(r: Receipt): void {
    const known = this.host.reconcile(r);
    if (known) {
      Object.assign(r, known);
      keepUnsentCarryOnReply(r);
      // A Mark complete proven applied after a restart advanced the plan when its outcome does (waivers "Command line").
      if (r.instruction.action === "waive-and-advance" && r.state === "completed" && WAIVE_ADVANCING_OUTCOMES.includes(r.outcome ?? "")) r.effects.plan = "advanced";
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
  private nextSequence(): number {
    this.sequence = this.receipts.reduce((max, r) => Math.max(max, r.sequence), this.sequence) + 1;
    if (!Number.isSafeInteger(this.sequence)) throw new ControlFailure("state_unavailable", "The command sequence limit was reached.");
    if (this.indexed) {
      try { this.saveSequence(); }
      catch { this.fault = "The command sequence could not be saved. Restart before changing work."; throw new ControlFailure("state_unavailable", this.fault); }
    }
    return this.sequence;
  }
  lookup(id: string): Result {
    const r = this.find(id);
    if (!r) throw new ControlFailure("command_not_found", "No saved instruction has this command ID.", 2);
    if (pending(r) && r !== this.applying && !r.message) this.reconcileOne(r);
    return receiptResult(this.canonical, r, this.host.runState(), true, this.markCompleteFor(r));
  }
  /**
   * A recheck that settled as `completion_checks_failed` carries its stop's Mark complete preview,
   * with a `next_argv` repeating it as `kiln waive-and-advance --confirm` (AC-WAIVE-05). Read from
   * the current offer, so a stop that has moved on says why it is no longer offered.
   */
  private markCompleteFor(r: Receipt): Record<string, unknown> | undefined {
    if (!RECHECKS.includes(r.instruction.action) || r.state !== "completed" || r.outcome !== "completion_checks_failed" || !this.host.markCompleteOffer) return undefined;
    if (r.execution_id !== this.host.execution()) return { offered: false, reason: "This check belongs to an earlier execution." };
    const view = this.host.view();
    if (!sameActivity(r.target, view.target)) return { offered: false, reason: "The stop this check ran on has changed. Refresh status." };
    return markCompletePreview(this.host.markCompleteOffer(), this.canonical, view.token, r.instruction.inputs.without_sending_reply === true);
  }
  submit(raw: unknown, source: Receipt["source"] = "caller", matchStatusToken = false): Result {
    return this.submitValidated(validateInstruction(raw), source, matchStatusToken);
  }
  submitInternal(raw: unknown): Result { return this.submitValidated(validateInternalInstruction(raw), "caller", true); }
  private submitValidated(instruction: Instruction, source: Receipt["source"], matchStatusToken: boolean): Result {
    const digest = hash(instruction);
    const old = this.find(instruction.command_id);
    if (old) {
      if (old.digest !== digest) throw new ControlFailure("command_id_conflict", "Command ID already belongs to different inputs. Do not reuse it for a new instruction.", 2);
      if (pending(old) && old !== this.applying && !old.message) this.reconcileOne(old);
      return receiptResult(this.canonical, old, this.host.runState(), false, this.markCompleteFor(old));
    }
    const internal = INTERNAL_ACTIONS.includes(instruction.action as typeof INTERNAL_ACTIONS[number]) ? this.host.internalControl?.(instruction) : undefined;
    if (internal?.alreadyApplied) {
      const at = new Date().toISOString(); const view = this.host.view();
      const r: Receipt = { source, version: 1, sequence: this.nextSequence(), id: randomUUID(), command_id: instruction.command_id, execution_id: instruction.execution_id, digest, instruction, target: view.target, accepted_at: at, updated_at: at, state: "completed", stage: "settled", outcome: "continuation_replayed", reason: null, effects: { reply: "not_applicable", session: "not_started", plan: "not_advanced" }, reply_text: null, acknowledged_by: null };
      this.save(r); this.receipts.push(r); return receiptResult(this.canonical, r, this.host.runState());
    }
    for (const receipt of this.receipts.filter(r => pending(r) && r !== this.applying && !r.message)) this.reconcileOne(receipt);
    const view = this.host.view();
    const control = INTERNAL_ACTIONS.includes(instruction.action as typeof INTERNAL_ACTIONS[number]) ? this.host.internalControl?.(instruction) ?? { available: false, reason: "Internal control unavailable." } : view.controls.find(c => c.name === instruction.action)!;
    const unsent = this.unsent(view.target);
    const waive = instruction.action === "waive-and-advance";
    const offer = waive ? this.host.markCompleteOffer?.() : undefined;
    const refusal = this.busy ? ["busy", "Another accepted instruction owns control; inspect its receipt."] : instruction.execution_id !== this.host.execution() || matchStatusToken && instruction.status_token !== view.token || (["take-over", "message", "message-review"].includes(instruction.action) || instruction.inputs.live_target ? !sameLiveTarget((instruction.inputs.live_target ?? instruction.inputs.target) as import("../live/target.js").LiveTarget, (JSON.parse(view.target) as { live?: import("../live/target.js").LiveTarget }).live) : instruction.status_token !== view.token) ? ["stale_status_token", "The observed execution or control state changed. Refresh status."]
      : waive && offer && !offer.offered ? ["mark_complete_not_offered", offer.reason]
      : waive && offer?.offered && offer.checkRunId !== instruction.inputs.check_run_id ? ["stale_check_run", "Mark complete was offered on an earlier check run. Refresh status."]
      : !control.available ? [waive && !offer ? "mark_complete_not_offered" : "control_unavailable", control.reason!]
      : (instruction.action === "verify-and-advance" || waive) && unsent.length && instruction.inputs.without_sending_reply !== true ? ["unsent_reply_acknowledgement_required", "A preserved reply was not sent. Explicitly acknowledge it before advancing."] : null;
    if (refusal?.[0] === "stale_status_token") refusal[1] = this.host.staleReason?.(instruction) ?? refusal[1]!;
    const at = new Date().toISOString();
    const r: Receipt = { ...(instruction.action === "message" ? { live_target: instruction.inputs.target as import("../live/target.js").LiveTarget, message: { text: instruction.inputs.text as string, uuid: randomUUID(), delivery: refusal ? "not_sent" as const : "submitting" as const } } : {}), source, version: 1, sequence: this.nextSequence(), id: randomUUID(), command_id: instruction.command_id, execution_id: instruction.execution_id, digest, instruction, target: view.target, accepted_at: at, updated_at: at,
      state: refusal ? "refused" : "accepted", outcome: refusal?.[0] ?? null, reason: refusal?.[1] ?? null, effects: { ...(instruction.action === "message" ? { message: "not_sent" as const } : {}), reply: instruction.action === "reply" ? "not_sent" : "not_applicable", session: "not_started", plan: "not_advanced" }, reply_text: instruction.action === "reply" ? String(instruction.inputs.message) : null, acknowledged_by: null, stage: "intent" };
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
      if (answer.waiver_id !== undefined) r.waiver_id = answer.waiver_id;
      if (answer.changes !== undefined) r.changes = answer.changes;
      if (!answer.ok) { r.state = "failed"; r.outcome = answer.code ?? "control_unavailable"; r.reason = answer.reason ?? "The existing control refused the action."; }
      else {
        r.state = r.message?.delivery === "uncertain" ? "indeterminate" : "completed"; r.outcome = answer.outcome ?? "completed";
        if (r.instruction.action === "waive-and-advance" && answer.reason !== undefined) r.reason = answer.reason;
        keepUnsentCarryOnReply(r);
        if (r.outcome === "advanced" || r.instruction.action === "waive-and-advance" && WAIVE_ADVANCING_OUTCOMES.includes(r.outcome)) {
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

/** Whether two control targets name the same activity of the same execution (a recheck keeps its stop). */
function sameActivity(a: string, b: string): boolean {
  try {
    const key = (value: unknown) => { const t = value as { execution?: string; executionId?: string; key?: string; phaseKey?: string } | null; return t && JSON.stringify([t.execution ?? t.executionId, t.key ?? t.phaseKey]); };
    const left = key(JSON.parse(a)); return !!left && left === key(JSON.parse(b));
  } catch { return false; }
}
