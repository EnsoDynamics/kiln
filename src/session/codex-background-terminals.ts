// Provider-owned terminals supplement OS tracking; neither supplies universal Unix containment.
import { processStartTime } from "../platform/process-start-time.js";
import type { SessionRun } from "../state/records.js";
import type { CodexWorkRpc } from "./codex-work-rpc.js";

export const CODEX_NATIVE_CLEANUP_WARNING = "Kiln stops Codex and the command processes it can track. Independently detached programs may keep running after Ctrl+C. Check background servers or jobs before resuming.";

interface Terminal { processId: string; osPid?: number | null }

async function pages<T>(rpc: CodexWorkRpc, method: string, params: Record<string, unknown>, signal: AbortSignal, accept: (item: T) => void): Promise<void> {
  let cursor: string | null = null;
  const cursors = new Set<string>();
  let count = 0;
  do {
    signal.throwIfAborted();
    const page: { data: T[]; nextCursor?: string | null } = await rpc.call(method, { ...params, cursor, limit: 100 });
    signal.throwIfAborted();
    if (!Array.isArray(page.data) || page.data.length > 100 || !(page.nextCursor === undefined || page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Invalid Codex background-process inventory.");
    for (const item of page.data) { if (++count > 4096) throw new Error("Codex background-process inventory exceeds its bound."); accept(item); }
    cursor = page.nextCursor ?? null;
    if (cursor !== null && (!cursor || cursors.has(cursor))) throw new Error("Repeated Codex background-process cursor.");
    if (cursor) { cursors.add(cursor); if (cursors.size > 4096) throw new Error("Codex background-process pagination exceeds its bound."); }
  } while (cursor !== null);
}

/** Never resumes cold historical threads or terminates another conversation's processes. */
export async function stopCodexBackgroundTerminals(rpc: CodexWorkRpc, threadIds: string[], run: SessionRun, save: () => void, signal: AbortSignal): Promise<void> {
  const owned = new Set(threadIds);
  const loaded = new Set<string>();
  await pages<string>(rpc, "thread/loaded/list", {}, signal, id => {
    if (typeof id !== "string" || !id) throw new Error("Missing Codex loaded-thread identity.");
    if (owned.has(id)) loaded.add(id);
  });
  for (const threadId of loaded) {
    const terminals: Terminal[] = [];
    await pages<Terminal>(rpc, "thread/backgroundTerminals/list", { threadId }, signal, item => {
      if (!item || typeof item.processId !== "string" || !item.processId || item.osPid != null && (!Number.isSafeInteger(item.osPid) || item.osPid <= 0)) throw new Error("Invalid Codex background-terminal identity.");
      terminals.push(item);
    });
    for (const terminal of terminals) {
      signal.throwIfAborted();
      const facts = run.codex!;
      const known = facts.backgroundTerminals ??= [];
      if (!known.some(item => item.threadId === threadId && item.processId === terminal.processId)) { if (known.length >= 4096) throw new Error("Codex background-terminal inventory exceeds its bound."); known.push({ threadId, processId: terminal.processId, ...(terminal.osPid ? { osPid: terminal.osPid } : {}) }); }
      // Persist the OS identity before asking the provider to end its handle. This still
      // reaches a live process if the subsequent provider cleanup RPC fails.
      if (terminal.osPid) {
        const startTime = await processStartTime(terminal.osPid, { signal, timeoutMs: 10_000 });
        signal.throwIfAborted();
        const processes = facts.ownedProcesses ??= [];
        if (startTime && !processes.some(item => item.pid === terminal.osPid && item.startTime === startTime)) { if (processes.length >= 4096) throw new Error("Codex owned-process inventory exceeds its bound."); processes.push({ pid: terminal.osPid, startTime }); }
      }
      save();
    }
    // The verified clean request covers all registered terminals, including one appearing
    // after the inventory. OS cleanup below verifies identities retained above.
    signal.throwIfAborted();
    await rpc.call("thread/backgroundTerminals/clean", { threadId });
    let remaining = false;
    await pages<Terminal>(rpc, "thread/backgroundTerminals/list", { threadId }, signal, () => { remaining = true; });
    if (remaining) throw new Error("Codex still reports background terminals after cleanup.");
  }
}
