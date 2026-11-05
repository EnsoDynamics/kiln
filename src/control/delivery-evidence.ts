/** Read provider-owned history only. A submitted stdin/RPC write is not proof of delivery. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { jsonLines } from "../platform/json-lines.js";
import { claudeConfigFolder, findTranscripts } from "../session/transcripts.js";
import { CodexHistoryRpc } from "../session/codex-history-rpc.js";
import type { SessionRecord, SessionRun } from "../state/records.js";
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function textContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  if (!value.every(b => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")) return undefined;
  return value.map(b => b.text).join("");
}
export async function deliveredInHistory(session: SessionRecord, run: SessionRun, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!run.control) return false;
  const signal = AbortSignal.timeout(5000);
  if (session.agentId === "codex") {
    if (!session.conversation?.threadId || !run.codex?.turnId || !session.workingDirectory) return false;
    const rpc = new CodexHistoryRpc("codex", session.workingDirectory, { ...env, ...(session.conversation.codexHome ? { CODEX_HOME: session.conversation.codexHome } : {}) }, signal);
    try {
      await rpc.initialize();
      const response = await rpc.call<{ thread: { id: string; turns: { id: string; items: { type: string; content?: unknown }[] }[] } }>("thread/read", { threadId: session.conversation.threadId, includeTurns: true });
      if (response.thread.id !== session.conversation.threadId) return false;
      return response.thread.turns.find(t => t.id === run.codex!.turnId)?.items.some(i => { const text = i.type === "userMessage" ? textContent(i.content) : undefined; return text !== undefined && digest(text) === run.control!.promptDigest; }) ?? false;
    } finally { await rpc.close(); }
  }
  const file = findTranscripts(claudeConfigFolder(env), session.sessionId).main;
  if (!file) return false;
  const stream = createReadStream(file, { signal });
  try {
    for await (const line of jsonLines(stream)) {
      signal.throwIfAborted();
      const row = JSON.parse(line) as { type?: string; timestamp?: string; sessionId?: string; message?: { content?: unknown } };
      if (row.type !== "user" || row.sessionId !== session.sessionId || !row.timestamp || Date.parse(row.timestamp) < Date.parse(run.startedAt)) continue;
      const text = textContent(row.message?.content);
      if (text !== undefined && digest(text) === run.control.promptDigest) return true;
    }
    return false;
  } finally { stream.destroy(); }
}
