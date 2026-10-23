// Read-only presentation recovery. These messages never substitute for the workspace audit.
import type { HistoryRpc } from "./codex-history-rpc.js";
import { readCodexTurnExecutions } from "./codex-turn-provenance.js";
import { CodexOutputReader } from "./codex-output.js";
import type { OutputLine } from "./session-output.js";
import type { SessionRecord } from "../state/records.js";

export async function recoverCodexOutput(options: { rpc: HistoryRpc; session: SessionRecord; path: string | null | undefined; previous: OutputLine[]; signal: AbortSignal; save(lines: OutputLine[]): void }): Promise<void> {
  const { rpc, session } = options;
  const parent = session.conversation!.threadId!;
  const ids = new Set([parent, ...session.conversation!.knownThreadIds ?? []]);
  for (const archived of [false, true]) {
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page: { data: { id: string }[]; nextCursor: string | null } = await rpc.call("thread/list", { ancestorThreadId: parent, archived, sourceKinds: ["subAgent", "subAgentThreadSpawn", "subAgentReview", "subAgentOther", "subAgentCompact"], cursor, limit: 100 });
      if (!Array.isArray(page.data) || page.data.length > 100 || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Incomplete recovered child pagination.");
      for (const child of page.data) { if (!child.id) throw new Error("Missing recovered child identity."); ids.add(child.id); }
      cursor = page.nextCursor;
      if (cursor !== null && (!cursor || seen.has(cursor))) throw new Error("Repeated recovered child cursor.");
      if (cursor) seen.add(cursor);
      if (ids.size > 4096 || seen.size > 100_000) throw new Error("Recovered child history exceeds its bound.");
    } while (cursor !== null);
  }
  const reader = new CodexOutputReader(session, options.previous.length, options.previous);
  for (const threadId of ids) {
    let cursor: string | null = null;
    const seen = new Set<string>();
    let count = 0;
    do {
      const page: { data: { id: string; startedAt?: number | null; items?: Record<string, unknown>[] }[]; nextCursor: string | null } = await rpc.call("thread/turns/list", { threadId, cursor, limit: 100, itemsView: "full" });
      if (!Array.isArray(page.data) || page.data.length > 100 || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Incomplete recovered turn pagination.");
      for (const turn of page.data) for (const item of turn.items ?? []) {
        const timed = typeof turn.startedAt === "number";
        options.save(reader.read({ method: "item/completed", params: { threadId, turnId: turn.id, item } }, timed ? new Date(turn.startedAt! * 1000).toISOString() : new Date().toISOString(), timed ? "turn" : "recovery").lines);
        for (const id of [...Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds : [], ...typeof item.agentThreadId === "string" ? [item.agentThreadId] : []]) {
          if (typeof id !== "string" || !id) throw new Error("Invalid recovered child identity.");
          ids.add(id);
        }
      }
      count += page.data.length; cursor = page.nextCursor;
      if (count > 100_000 || ids.size > 4096 || cursor !== null && (!cursor || seen.has(cursor))) throw new Error("Recovered turn history exceeds its bound or repeats a cursor.");
      if (cursor) seen.add(cursor);
    } while (cursor !== null);
  }
  session.conversation!.knownThreadIds = [...ids].filter(id => id !== parent);
  if (!options.path || !session.conversation?.codexHome) throw new Error("Recovered execution history is unavailable.");
  const observed = await readCodexTurnExecutions({ path: options.path, codexHome: session.conversation.codexHome, threadId: parent, signal: options.signal });
  const owned = new Set(session.runs.flatMap(run => run.codex?.turnId ? [run.codex.turnId] : []));
  // Manual turns have no Kiln dispatch/account claim; keep them separate from attempt facts.
  session.codex!.recoveryObserved = observed.filter(turn => !owned.has(turn.turnId));
}
