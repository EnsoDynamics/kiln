import type { PhaseRecoveryTarget } from "../../../src/engine/phase-recovery.js";
// How the view talks to Kiln: the token the server wrote into the page, sent with every API
// request (technical design, "Local security"), and the engine's commands as plain requests.

import type { OutputLine } from "../../../src/session/session-output.js";
import type { Settings } from "../../../src/state/records.js";

export interface PageConfig {
  token: string;
  controlToken?: string;
  /** The view's path, `/<PRD folder name>`. */
  base: string;
}

export function pageConfig(document: Document): PageConfig {
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "";
  return { token: meta("kiln-token"), base: meta("kiln-base") };
}

export type CommandAnswer = { ok: true; [key: string]: unknown } | { ok: false; reason: string; uncertain?: boolean; fieldErrors?: Record<string, string> };

const pendingInstructions = new WeakMap<PageConfig, Map<string, { id: string; token: string }>>();
const actionQueues = new WeakMap<PageConfig, Promise<void>>();
async function send(config: PageConfig, method: "POST" | "DELETE", path: string, body?: unknown): Promise<CommandAnswer> {
  const previous = actionQueues.get(config);
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; }); actionQueues.set(config, current);
  await previous;
  try { return await sendInstruction(config, method, path, body); }
  finally { release(); if (actionQueues.get(config) === current) actionQueues.delete(config); }
}
async function sendInstruction(config: PageConfig, method: "POST" | "DELETE", path: string, body?: unknown): Promise<CommandAnswer> {
  const key = JSON.stringify([method, path, body]);
  let instructions = pendingInstructions.get(config);
  if (!instructions) { instructions = new Map(); pendingInstructions.set(config, instructions); }
  const instruction = instructions.get(key) ?? (config.controlToken ? { id: crypto.randomUUID(), token: config.controlToken } : undefined);
  if (instruction) instructions.set(key, instruction);
  try {
    const response = await fetch(path, {
      method,
      headers: { "X-Kiln-Token": config.token, ...(instruction ? { "X-Kiln-Status": instruction.token, "X-Kiln-Command-Id": instruction.id } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = (await response.json()) as Record<string, unknown>;
    if (response.ok && typeof answer.controlToken === "string") config.controlToken = answer.controlToken;
    if (response.status < 500) instructions.delete(key);
    return response.ok ? { ...answer, ok: true } : { ok: false, reason: String(answer.reason ?? response.statusText), ...(response.status >= 500 ? { uncertain: true } : {}), ...(answer.fieldErrors ? { fieldErrors: answer.fieldErrors as Record<string, string> } : {}) };
  } catch (error) {
    return { ok: false, uncertain: true, reason: `${(error as Error).message}${instruction ? ` Instruction ${instruction.id} may have been accepted; repeating this action will inspect or replay the same instruction.` : ""}` };
  }
}

export const changeSettings = (config: PageConfig, change: Partial<Settings>) => send(config, "POST", "/api/settings", change);
export const start = (config: PageConfig, refinementConfirmed: boolean) => send(config, "POST", "/api/start", refinementConfirmed ? { refinementConfirmed: true } : {});
export const pause = (config: PageConfig) => send(config, "POST", "/api/pause");
export const keepGoing = (config: PageConfig) => send(config, "DELETE", "/api/pause");
export const checkAgain = (config: PageConfig) => send(config, "POST", "/api/check-again");
export const refreshMetadata = (config: PageConfig) => send(config, "POST", "/api/metadata/refresh");
/** Resume at Needs you, with the person's note when they wrote one (usage-limit recovery AC-RESUME-02, 03). */
export const resume = (config: PageConfig, note: string) => send(config, "POST", "/api/resume", note.trim() === "" ? {} : { note });
/** Resume now, during a wait; it takes no note (usage-limit recovery AC-LIMIT-02). */
export const resumeNow = (config: PageConfig) => send(config, "POST", "/api/resume");
/** Ticks or unticks Needs you's confirmation that the changes outside the workspace were dealt with (multi-repo AC-OUTSIDE-03). */
export const confirmOutside = (config: PageConfig, ticked: boolean) => send(config, ticked ? "POST" : "DELETE", "/api/outside-confirmation");

/** A page of a session's output: the lines before `before` (all, when absent), at most `limit` (AC-WATCH-05, AC-WATCH-10). */
export async function outputPage(config: PageConfig, sessionId: string, before?: number, limit = 200, executionId?: string): Promise<{ lines: OutputLine[]; total: number }> {
  const query = new URLSearchParams({ ...(executionId ? { executionId } : {}), limit: String(limit), ...(before === undefined ? {} : { before: String(before) }) });
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/output?${query}`, { headers: { "X-Kiln-Token": config.token } });
  if (!response.ok) throw new Error(`Couldn't load the session's output: ${response.status} ${response.statusText}`);
  return (await response.json()) as { lines: OutputLine[]; total: number };
}

/** Human confirmation is separate from Resume and never writes remembered preferences. */
export const authorizeDevelopmentTarget = (config: PageConfig, body: { executionId: string; authorizationRevision: number; target: import("../../../src/state/development-delivery.js").MergeTarget }) => send(config, "POST", "/api/development-authorization", body);

export const billingApproval = (config: PageConfig, action: "approval" | "clear", body: { executionId: string; selectionGeneration: number; readingId: string; approved?: true }) => send(config, "POST", `/api/billing/${action}`, body);

/** Target-bound manual implementation recovery. Only reply supplies note. */
export const resumePhase = (config: PageConfig, target: PhaseRecoveryTarget, note?: string) => sendHandBack(config, target, "resume", note);
export const verifyPhase = (config: PageConfig, target: PhaseRecoveryTarget, intent: "verify" | "advance") => sendHandBack(config, target, intent);

/** Keep one instruction identity across uncertain HTTP retries of a takeover. */
const takeoverIds = new Map<string, string>();
export function takeOver(config: PageConfig, target: import("../../../src/live/target.js").LiveTarget): Promise<CommandAnswer> {
  const key = JSON.stringify(target); const instructionId = takeoverIds.get(key) ?? crypto.randomUUID();
  takeoverIds.set(key, instructionId);
  return send(config, "POST", "/api/live/take-over", { instructionId, target }).then(answer => {
    if (!answer.ok && !answer.uncertain) takeoverIds.delete(key);
    return answer;
  });
}

const handBackIds = new Map<string, string>();
async function sendHandBack(config: PageConfig, target: PhaseRecoveryTarget, action: "resume" | "verify" | "advance", note?: string): Promise<CommandAnswer> {
  const key = JSON.stringify([target, action, note]);
  const id = handBackIds.get(key) ?? crypto.randomUUID();
  handBackIds.set(key, id);
  const answer = await send(config, "POST", action === "resume" ? "/api/resume" : "/api/check-again", {
    target: target.live ?? target, ...(target.live ? { instructionId: id } : {}),
    ...(action === "resume" ? note === undefined ? {} : { note } : { intent: action, ...(action === "advance" ? { withoutSendingReply: true } : {}) }),
  });
  if (!(!answer.ok && answer.uncertain)) handBackIds.delete(key);
  return answer;
}

const continuationCommands = new WeakMap<PageConfig, Map<string, { commandId: string; statusToken: string }>>();
/** A lost response retries the exact displayed proposal and original command identity. */
export async function continueFeature(config: PageConfig, executionId: string, key: { proposalId: string } | { acceptanceId: string }): Promise<CommandAnswer> {
  if (!config.controlToken) return { ok: false, reason: "Wait for a current status before continuing." };
  let commands = continuationCommands.get(config);
  if (!commands) { commands = new Map(); continuationCommands.set(config, commands); }
  const identity = JSON.stringify([executionId, key]);
  const command = commands.get(identity) ?? { commandId: crypto.randomUUID(), statusToken: config.controlToken };
  commands.set(identity, command);
  const answer = await send(config, "POST", "proposalId" in key ? "/api/continuation/accept" : "/api/continuation/retry", { ...key, executionId, ...command });
  if (answer.ok || !answer.uncertain) commands.delete(identity);
  return answer;
}
