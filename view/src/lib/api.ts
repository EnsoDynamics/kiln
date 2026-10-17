// How the view talks to Kiln: the token the server wrote into the page, sent with every API
// request (technical design, "Local security"), and the engine's commands as plain requests.

import type { Settings } from "../../../src/state/records.js";

export interface PageConfig {
  token: string;
  /** The view's path, `/<PRD folder name>`. */
  base: string;
}

export function pageConfig(document: Document): PageConfig {
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "";
  return { token: meta("kiln-token"), base: meta("kiln-base") };
}

export type CommandAnswer = { ok: true; [key: string]: unknown } | { ok: false; reason: string; fieldErrors?: Record<string, string> };

async function send(config: PageConfig, method: "POST" | "DELETE", path: string, body?: unknown): Promise<CommandAnswer> {
  try {
    const response = await fetch(path, {
      method,
      headers: { "X-Kiln-Token": config.token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = (await response.json()) as Record<string, unknown>;
    return response.ok ? { ...answer, ok: true } : { ok: false, reason: String(answer.reason ?? response.statusText), ...(answer.fieldErrors ? { fieldErrors: answer.fieldErrors as Record<string, string> } : {}) };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

export const changeSettings = (config: PageConfig, change: Partial<Settings>) => send(config, "POST", "/api/settings", change);
export const start = (config: PageConfig, refinementConfirmed: boolean) => send(config, "POST", "/api/start", refinementConfirmed ? { refinementConfirmed: true } : {});
