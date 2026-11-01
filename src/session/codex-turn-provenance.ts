// Per-turn execution facts come only from owning raw turn_context records, never Thread.model.
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { CodexTurnExecution } from "../state/records.js";
import { existingRawHistory, rawLines } from "./codex-evidence-store.js";

export async function readCodexTurnExecutions(options: { path: string; codexHome: string; threadId: string; signal: AbortSignal }): Promise<CodexTurnExecution[]> {
  const path = realpathSync(existingRawHistory(options.path));
  const home = realpathSync(options.codexHome);
  if (!["sessions", "archived_sessions"].some(folder => { const part = relative(join(home, folder), path); return part !== "" && !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`); })) throw new Error("Codex execution history is outside its initialized home.");
  const result = new Map<string, CodexTurnExecution>();
  let owner: string | undefined;
  let own = false;
  for await (const { value } of rawLines(path, options.signal)) {
    const record = value as { type: string; timestamp: string; payload: { id?: string; turn_id?: string; model?: string; effort?: string; cwd?: string } };
    if (record.type === "session_meta") {
      owner ??= record.payload.id;
      if (owner !== options.threadId) throw new Error("Codex execution history has the wrong owner.");
      own = record.payload.id === owner;
    }
    if (record.type !== "turn_context" || !own) continue;
    const { turn_id: turnId, model, effort, cwd } = record.payload;
    if (!turnId || !model || !cwd || !record.timestamp) throw new Error("Codex turn execution provenance is incomplete.");
    const context = { threadId: owner!, turnId, model, cwd, at: record.timestamp, ...(effort ? { effort } : {}) };
    const previous = result.get(turnId);
    if (previous && (previous.model !== model || previous.effort !== effort || previous.cwd !== cwd)) throw new Error("Conflicting Codex turn execution provenance.");
    result.set(turnId, context);
    if (result.size > 100_000) throw new Error("Codex execution context limit exceeded.");
  }
  if (!owner) throw new Error("Codex execution history has no owner.");
  return [...result.values()];
}
