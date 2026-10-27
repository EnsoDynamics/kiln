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

export type CommandAnswer = { ok: true; [key: string]: unknown } | { ok: false; reason: string; fieldErrors?: Record<string, string> };

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
    return response.ok ? { ...answer, ok: true } : { ok: false, reason: String(answer.reason ?? response.statusText), ...(answer.fieldErrors ? { fieldErrors: answer.fieldErrors as Record<string, string> } : {}) };
  } catch (error) {
    return { ok: false, reason: `${(error as Error).message}${instruction ? ` Instruction ${instruction.id} may have been accepted; repeating this action will inspect or replay the same instruction.` : ""}` };
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
export async function outputPage(config: PageConfig, sessionId: string, before?: number, limit = 200): Promise<{ lines: OutputLine[]; total: number }> {
  const query = new URLSearchParams({ limit: String(limit), ...(before === undefined ? {} : { before: String(before) }) });
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/output?${query}`, { headers: { "X-Kiln-Token": config.token } });
  if (!response.ok) throw new Error(`Couldn't load the session's output: ${response.status} ${response.statusText}`);
  return (await response.json()) as { lines: OutputLine[]; total: number };
}

/** Human confirmation is separate from Resume and never writes remembered preferences. */
export const authorizeDevelopmentTarget = (config: PageConfig, body: { executionId: string; authorizationRevision: number; target: import("../../../src/state/development-delivery.js").MergeTarget }) => send(config, "POST", "/api/development-authorization", body);

export const billingApproval = (config: PageConfig, action: "approval" | "clear", body: { executionId: string; selectionGeneration: number; readingId: string; approved?: true }) => send(config, "POST", `/api/billing/${action}`, body);

/** Target-bound manual implementation recovery. Only reply supplies note. */
export const resumePhase = (config: PageConfig, target: PhaseRecoveryTarget, note?: string) => send(config, "POST", "/api/resume", { target, ...(note === undefined ? {} : { note }) });
export const verifyPhase = (config: PageConfig, target: PhaseRecoveryTarget, intent: "verify" | "advance") => send(config, "POST", "/api/check-again", { target, intent, ...(intent === "advance" ? { withoutSendingReply: true } : {}) });
