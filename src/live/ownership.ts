/** Ordinary Claude terminal discovery, including startup before registry publication. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { runHelper } from "../platform/helper-process.js";
import { processStartTime } from "../platform/process-start-time.js";
import { claudeConfigFolder, claudeHistoryAvailability, findTranscripts, readTranscript } from "../session/transcripts.js";
import type { SessionRun } from "../state/records.js";
export class OwnershipError extends Error {
  constructor(readonly code: "terminal_in_use" | "ownership_unknown" | "history_unavailable" | "takeover_pending" | "message_review_required", message: string) { super(message); }
}
export async function requireExited(identity: Pick<SessionRun, "pid" | "processStartTime">): Promise<void> {
  if (!identity.pid || !identity.processStartTime) throw new OwnershipError("ownership_unknown", "The old process PID/start identity is unavailable.");
  const current = await processStartTime(identity.pid, { timeoutMs: 5000 });
  if (current !== undefined) throw new OwnershipError(current === identity.processStartTime ? "takeover_pending" : "ownership_unknown", current === identity.processStartTime ? "The old process still owns this conversation." : "The old PID was reused; its release identity needs reconciliation.");
  try { process.kill(identity.pid, 0); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") return; throw new OwnershipError("ownership_unknown", "Process identity cannot be read."); }
  throw new OwnershipError("ownership_unknown", "Process exists but its start identity cannot be read.");
}
export function requireHistory(env: NodeJS.ProcessEnv, sessionId: string): void {
  const root = claudeConfigFolder(env);
  try {
    readdirSync(join(root, "projects"));
    const main = findTranscripts(root, sessionId).main;
    if (!main || !statSync(main).size || readTranscript(main).problem) throw new Error("Missing or unreadable history.");
  } catch { throw new OwnershipError("history_unavailable", "The saved Claude conversation is missing or unreadable. Restore its history and retry release checks. Use the existing fresh-session recovery guidance if it cannot be restored."); }
  const history = claudeHistoryAvailability(env, sessionId);
  if (!history.available) throw new OwnershipError("history_unavailable", `The saved Claude conversation is missing usable history. ${history.reason} Restore its history and retry release checks. Use the existing fresh-session recovery guidance if it cannot be restored.`);
}
export async function requireNoTerminal(env: NodeJS.ProcessEnv, sessionId: string, exclude?: { pid: number; startTime: string }): Promise<void> {
  if (process.platform !== "darwin") throw new OwnershipError("ownership_unknown", "Terminal ownership has only been validated on macOS.");
  const root = resolve(claudeConfigFolder(env));
  try {
    const names = readdirSync(join(root, "sessions"));
    for (const name of names.filter(n => n.endsWith(".json"))) {
      let record: { pid?: number; sessionId?: string; procStart?: string };
      try { record = JSON.parse(readFileSync(join(root, "sessions", name), "utf8")); }
      catch { throw new OwnershipError("ownership_unknown", "A provider registry entry is unreadable; conversation ownership is unknown."); }
      if (record.sessionId !== sessionId) continue;
      if (!record.pid || !record.procStart) throw new OwnershipError("ownership_unknown", "Provider registry owner identity is incomplete.");
      const start = await processStartTime(record.pid, { timeoutMs: 5000 });
      if (exclude?.pid === record.pid && exclude.startTime === start && record.procStart === start) continue;
      if (start === record.procStart) throw new OwnershipError("terminal_in_use", "Exit Claude in your terminal before handing this conversation back to Kiln.");
      throw new OwnershipError("ownership_unknown", "Provider registry PID/start identity is unresolved. Retry after the owner exits cleanly.");
    }
    const ps = await runHelper("/bin/ps", ["-ww", "-axo", "pid=,uid=,command="], { cwd: process.cwd(), timeoutMs: 5000 });
    if (ps.exitCode !== 0 || ps.failure) throw new Error("Cannot read pending process identities.");
    const escaped = sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const resume = new RegExp(`(?:^|\\s)--resume(?:=|\\s+)${escaped}(?:\\s|$)`);
    for (const line of ps.stdout.split("\n")) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line); if (!match) continue;
      const pid = Number(match[1]); const uid = Number(match[2]); const argv = match[3]!;
      if (uid !== process.getuid?.() || !/(?:^|\/)claude(?:\s|$)/.test(argv) || !resume.test(argv)) continue;
      if (exclude?.pid === pid && await processStartTime(pid, { timeoutMs: 5000 }) === exclude.startTime) continue;
      // Config root of an unregistered matching CLI cannot yet be proved. Refuse it
      // even if it could later register in another root; absence is not release.
      throw new OwnershipError("terminal_in_use", "A terminal is opening this exact conversation. Wait for it to exit before handing back.");
    }
  } catch (e) {
    if (e instanceof OwnershipError) throw e;
    throw new OwnershipError("ownership_unknown", "Provider registry or process inventory is unavailable; retry ownership checks.");
  }
}
