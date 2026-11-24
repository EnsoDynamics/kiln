// Whether a session got its first model response, read from the agent's own history (Kiln Phase
// Model Tiers, technical design "When an Activity Starts"): Claude Code's saved conversation file,
// or the Codex thread's turns, by the same test as Kiln's saved events. Kiln's saved start is a
// record of what it has seen; these reads are why an activity counts as not started.

import { readFileSync } from "node:fs";
import type { SessionRecord } from "../state/records.js";
import { isModelResponse } from "../session/run-verdict.js";
import type { StreamEvent } from "../session/session-output.js";
import { findTranscripts } from "../session/transcripts.js";
import { CodexHistoryRpc } from "../session/codex-history-rpc.js";
import { isCodexModelItem } from "./start-line.js";

/** What a history read found: a response and its time, none, or a history that exists but can't be read. */
export type HistoryStart = { state: "responded"; at: string } | { state: "none" } | { state: "unreadable"; reason: string };

/** Claude Code's saved conversation, top level and subagents: a missing file means no response was given. */
export function claudeHistoryStart(configFolder: string, sessionId: string): HistoryStart {
  const files = findTranscripts(configFolder, sessionId);
  const paths = [files.main, ...files.subagents].filter((path): path is string => !!path);
  if (!paths.length) return { state: "none" };
  let earliest: string | undefined;
  try {
    for (const path of paths) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let entry: StreamEvent & { timestamp?: string };
        try { entry = JSON.parse(line) as StreamEvent & { timestamp?: string }; } catch { continue; }
        if (!isModelResponse(entry)) continue;
        const at = typeof entry.timestamp === "string" && Number.isFinite(Date.parse(entry.timestamp)) ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
        if (earliest === undefined || at < earliest) earliest = at;
        break;
      }
    }
  } catch (error) { return { state: "unreadable", reason: `Claude Code's saved conversation can't be read: ${(error as Error).message}` }; }
  return earliest === undefined ? { state: "none" } : { state: "responded", at: earliest };
}

interface HistoryItem { type?: string; text?: string; source?: string; startedAtMs?: number; completedAtMs?: number }
interface HistoryTurn { id?: string; startedAt?: number; items?: HistoryItem[] }

/** "thread not found", "no rollout found for thread": Codex reports it doesn't have the thread. */
const MISSING_THREAD = /not found|no rollout|does not exist|unknown thread|no such thread/i;

/**
 * The Codex thread's turns, parent and children: the first item the model issued, with its own
 * time (`startedAtMs`, or `completedAtMs` for an agent message), else its turn's `startedAt`, else
 * the time of the read. A thread Codex reports it doesn't have means no response; one Kiln can't
 * reach, Codex not installed included, is unreadable.
 */
export async function codexHistoryStart(options: { executable: string | undefined; cwd: string; env: NodeJS.ProcessEnv; session: SessionRecord; signal: AbortSignal }): Promise<HistoryStart> {
  const { session } = options;
  const threadIds = [session.conversation?.threadId, ...(session.conversation?.knownThreadIds ?? [])].filter((id): id is string => !!id);
  if (!threadIds.length) return { state: "none" };
  if (!options.executable) return { state: "unreadable", reason: "Codex isn't installed, so this session's history can't be read." };
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]);
  const rpc = new CodexHistoryRpc(options.executable, options.cwd, { ...options.env, ...(session.conversation?.codexHome ? { CODEX_HOME: session.conversation.codexHome } : {}) }, signal);
  try {
    await rpc.initialize();
    let found: string | undefined;
    for (const threadId of threadIds) {
      let turns: HistoryTurn[];
      try { turns = await listTurns(rpc, threadId); }
      catch (error) { if (MISSING_THREAD.test((error as Error).message)) continue; throw error; }
      for (const turn of turns) {
        const item = (turn.items ?? []).find(one => isCodexModelItem({ method: one.type === "agentMessage" ? "item/completed" : "item/started", params: { item: one } }));
        if (!item) continue;
        const ms = item.type === "agentMessage" ? item.completedAtMs : item.startedAtMs;
        const at = typeof ms === "number" ? new Date(ms).toISOString() : typeof turn.startedAt === "number" ? new Date(turn.startedAt * 1000).toISOString() : new Date().toISOString();
        if (found === undefined || at < found) found = at;
        break;
      }
    }
    return found === undefined ? { state: "none" } : { state: "responded", at: found };
  } catch (error) {
    return { state: "unreadable", reason: `The Codex conversation's history can't be read: ${(error as Error).message}` };
  } finally { await rpc.close(); }
}

async function listTurns(rpc: CodexHistoryRpc, threadId: string): Promise<HistoryTurn[]> {
  const turns: HistoryTurn[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page: { data: HistoryTurn[]; nextCursor: string | null } = await rpc.call("thread/turns/list", { threadId, cursor, limit: 100, itemsView: "full" });
    if (!Array.isArray(page.data)) throw new Error("Incomplete Codex turn pagination.");
    turns.push(...page.data);
    cursor = page.nextCursor;
    if (cursor !== null && seen.has(cursor) || turns.length > 100_000) throw new Error("Codex turn history exceeds its bound or repeats a cursor.");
    if (cursor) seen.add(cursor);
  } while (cursor !== null);
  return turns;
}
