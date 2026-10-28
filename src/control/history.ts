import { InspectionSpool } from "./spool.js";
import { publicProvenance } from "./public-facts.js";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SessionRecord } from "../state/records.js";
import { sessionStorageKey, SCHEMA_VERSION } from "../state/records.js";
import { privateJson, privateEntries, safeSelector, deadlineCheck, type SavedWork } from "./private-state.js";
import { ControlFailure, errorFact, type ControlError } from "./result.js";

export interface Conversation { phase: string; id: string; record: SessionRecord }
export interface History { dispose(): void; complete: boolean; errors: ControlError[]; phases: { phase_key: string; phase_id: string; phase_title: string; conversations: Record<string, unknown>[] }[]; sessions: Conversation[] }
export function readHistory(work: SavedWork, activeId?: string, deadline = Date.now() + 5000): History {
  const { directory, root, record } = work; const errors: ControlError[] = []; const spool = new InspectionSpool();
  try {
  const sessionList = spool.list<Conversation>(); const sessions = sessionList.values;
  if (Date.now() > deadline) return { dispose: () => spool.close(), complete: false, errors: [errorFact("state_unavailable", "Saved history was not scanned because its read deadline expired.")], phases: [], sessions };
  const references = new Map(Object.entries(record.phases).map(([key, facts]) => [key, new Set(facts.sessionIds)]));
  const unread = (message: string) => errors.push(errorFact("state_unavailable", message));
  try {
    for (const phase of privateEntries(root, directory, deadline)) {
      deadlineCheck(deadline);
      if (["output-snapshots", "audit", "audit-evidence", "delivery-evidence", "control", "controls", "live-attempts"].includes(phase) || !safeSelector(phase)) continue;
      const path = join(directory, phase);
      if (!statSync(path).isDirectory()) continue;
      try {
        for (const id of privateEntries(root, path, deadline)) {
          deadlineCheck(deadline);
          if (!safeSelector(id)) { unread("Unsafe saved session selector."); continue; }
          const candidate = join(path, id);
          if (!statSync(candidate).isDirectory()) continue;
          const set = references.get(phase) ?? new Set<string>(); set.add(id); references.set(phase, set);
        }
      } catch { unread(`Session directory ${phase} could not be enumerated completely.`); }
    }
  } catch { unread("Session directories could not be enumerated within the read deadline."); }
  const phases: History["phases"] = [];
  let exhausted = false;
  for (const [phase, ids] of references) {
    if (Date.now() > deadline) { unread("Remaining history directories and referenced sessions were not scanned because the read deadline expired."); exhausted = true; break; }
    const plan = record.plan?.find(p => p.id === phase);
    const projected = spool.list<Record<string, unknown>>(); const entries = projected.values;
    for (const id of ids) {
      try {
        deadlineCheck(deadline);
        if (!safeSelector(phase) || !safeSelector(id)) throw new Error("Unsafe selector");
        const session = privateJson<SessionRecord>(root, join(directory, phase, id, "session.json"), deadline);
        if (!Number.isInteger(session.schemaVersion) || session.schemaVersion < 1 || session.schemaVersion > SCHEMA_VERSION || session.schemaVersion >= 4 && session.agentId === undefined) throw new Error("Unsupported or incomplete saved session schema");
        if (session.executionId && session.executionId !== record.executionId) {
          if (record.phases[phase]?.sessionIds.includes(id)) unread(`Referenced session ${phase}/${id} belongs to a different execution.`);
          continue;
        }
        // Pre-upgrade sessions need a binding recorded by the exclusively locked controller.
        if (!session.executionId) {
          const binding = privateJson<{ execution_id: string; sessions: Record<string, string> }>(root, join(directory, "inspection-bindings.json"));
          if (binding.execution_id !== record.executionId || binding.sessions[`${phase}/${id}`] !== session.createdAt) throw new Error("Unproven legacy ownership");
        }
        if (session.sessionId !== id || sessionStorageKey(session) !== phase || !Array.isArray(session.runs) || !["claude_code", "codex", undefined].includes(session.agentId)) throw new Error("Invalid session identity");
        deadlineCheck(deadline);
        const provider = session.agentId === "codex" ? session.conversation?.threadId ?? null : session.sessionId;
        const attempt = session.runs.at(-1);
        const entry = { session_id: id, provider_session_id: provider, agent: session.agentId ?? "claude_code", activity_kind: session.kind,
          identity_availability: provider ? "known" : "unknown", identity_reason: provider ? null : "Provider conversation ID was never observed.",
          working_directory: session.workingDirectory ?? record.settings.worktreePath, working_directory_provenance: session.workingDirectory ? "recorded" : "derived_legacy",
          created_at: session.createdAt, latest_attempt_at: attempt?.startedAt ?? null, controller_session_state: activeId === id ? "running" : "stopped",
          provider_history: { state: "unknown", observed_at: null, reason: "Provider history has not been checked by this inventory." },
          attempts: session.runs.map((run, index) => ({ attempt_id: run.control?.attemptId ?? createHash("sha256").update(`${record.executionId}:${id}:${index}`).digest("hex"), started_at: run.startedAt, ended_at: run.endedAt ?? null, cause: run.cause,
            state: activeId === id && index === session.runs.length - 1 ? "running" : run.endedAt ? "stopped" : "unknown",
            requested: run.codex?.requested ?? { model: session.model, effort: session.effort ?? null }, effective: run.codex?.effective ?? (session.initModel ? { model: session.initModel } : null),
            account: run.codex?.account ? publicProvenance(run.codex.account) : run.account ? { email: run.account.email ?? null, orgId: run.account.orgId ?? null } : null, billing: run.billing ?? null })) };
        deadlineCheck(deadline);
        projected.append(entry); sessionList.append({ phase, id, record: session });
        deadlineCheck(deadline);
      } catch (error) {
        unread(`Saved session ${phase}/${id} is unavailable: ${error instanceof ControlFailure ? error.message : "missing, corrupt or unowned saved record."}`);
        if (Date.now() > deadline) { unread(`The remaining sessions in ${phase} and later history directories were not scanned because the read deadline expired.`); exhausted = true; break; }
      }
    }
    phases.push({ phase_key: phase, phase_id: plan?.id ?? phase, phase_title: plan?.title ?? record.activities?.find(a => a.key === phase)?.kind ?? phase, conversations: entries });
    if (exhausted) break;
  }
  for (const plan of exhausted ? [] : record.plan ?? []) if (!references.has(plan.id)) phases.push({ phase_key: plan.id, phase_id: plan.id, phase_title: plan.title, conversations: [] });
  try { deadlineCheck(deadline); } catch { unread("Saved history assembly exceeded the read deadline."); }
  return { dispose: () => spool.close(), complete: !errors.length, errors, phases, sessions };
  } catch (error) { spool.close(); throw error; }
}
export function chooseSession(work: SavedWork, history: History, selector?: string, activeId?: string): Conversation | null {
  if (selector && !safeSelector(selector)) throw new ControlFailure("invalid_input", "Invalid Kiln session selector.", 2);
  if (selector) {
    const match = matchingSessions(history, selector);
    if (match.length !== 1) throw new ControlFailure(history.complete ? "target_not_found" : "state_unavailable", "Session is not available within this execution.", history.complete ? 2 : 4);
    return match[0]!;
  }
  const stopped = Object.entries(work.record.phases).find(([, f]) => f.stop || f.wait);
  const id = activeId ?? stopped?.[1].sessionIds.at(-1);
  const preferred = id ? history.sessions.find(s => s.id === id) : undefined;
  return preferred ?? newestSession(history);
}
/** Default output requires the active session or a complete inventory of saved work.
 * Explicit selectors and frozen cursors establish their identities independently.
 */
export function chooseOutputSession(work: SavedWork, history: History, selector?: string, activeId?: string, cursor?: string): Conversation | null {
  if (cursor) {
    if (selector && !safeSelector(selector)) throw new ControlFailure("invalid_input", "Invalid Kiln session selector.", 2);
    return null; // outputPage authenticates the descriptor's execution/session.
  }
  if (selector) return chooseSession(work, history, selector);
  if (activeId) {
    const matches = matchingSessions(history, activeId);
    if (matches.length === 1) return matches[0]!;
    throw new ControlFailure("saved_output_unavailable", "The active output session is missing, corrupt or unowned.");
  }
  if (!history.complete) throw new ControlFailure("saved_output_unavailable", "The latest output session cannot be established because saved session history is incomplete.");
  return newestSession(history);
}
export function workingDirectoryAvailable(folder: string): boolean {
  try { return existsSync(folder) && statSync(folder).isDirectory(); } catch { return false; }
}

function matchingSessions(history: History, id: string): Conversation[] {
  const matches: Conversation[] = [];
  for (const session of history.sessions) if (session.id === id) { matches.push(session); if (matches.length > 1) break; }
  return matches;
}
export function newestSession(history: History, attemptsOnly = false): Conversation | null {
  let latest: Conversation | null = null;
  for (const session of history.sessions) {
    if (attemptsOnly && !session.record.runs.length) continue;
    const at = session.record.runs.at(-1)?.startedAt ?? session.record.createdAt;
    if (!latest || at >= (latest.record.runs.at(-1)?.startedAt ?? latest.record.createdAt)) latest = session;
  }
  return latest;
}
