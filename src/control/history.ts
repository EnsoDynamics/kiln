import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SessionRecord } from "../state/records.js";
import { sessionStorageKey, SCHEMA_VERSION } from "../state/records.js";
import { privateJson, privateNames, safeSelector, deadlineCheck, type SavedWork } from "./private-state.js";
import { ControlFailure, errorFact, type ControlError } from "./result.js";

export interface Conversation { phase: string; id: string; record: SessionRecord }
export interface History { complete: boolean; errors: ControlError[]; phases: { phase_key: string; phase_id: string; phase_title: string; conversations: Record<string, unknown>[] }[]; sessions: Conversation[] }
export function readHistory(work: SavedWork, activeId?: string, deadline = Date.now() + 5000): History {
  const { directory, root, record } = work; const errors: ControlError[] = []; const sessions: Conversation[] = [];
  const references = new Map(Object.entries(record.phases).map(([key, facts]) => [key, new Set(facts.sessionIds)]));
  const unread = (message: string) => errors.push(errorFact("state_unavailable", message));
  try {
    for (const phase of privateNames(root, directory)) {
      deadlineCheck(deadline);
      if (["output-snapshots", "audit", "audit-evidence", "delivery-evidence", "control", "controls", "live-attempts"].includes(phase) || !safeSelector(phase)) continue;
      const path = join(directory, phase);
      if (!statSync(path).isDirectory()) continue;
      try {
        for (const id of privateNames(root, path)) {
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
  for (const [phase, ids] of references) {
    const plan = record.plan?.find(p => p.id === phase);
    const entries: Record<string, unknown>[] = [];
    for (const id of ids) {
      try {
        deadlineCheck(deadline);
        if (!safeSelector(phase) || !safeSelector(id)) throw new Error("Unsafe selector");
        const session = privateJson<SessionRecord>(root, join(directory, phase, id, "session.json"));
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
        sessions.push({ phase, id, record: session });
        const provider = session.agentId === "codex" ? session.conversation?.threadId ?? null : session.sessionId;
        const attempt = session.runs.at(-1);
        entries.push({ session_id: id, provider_session_id: provider, agent: session.agentId ?? "claude_code", activity_kind: session.kind,
          identity_availability: provider ? "known" : "unknown", identity_reason: provider ? null : "Provider conversation ID was never observed.",
          working_directory: session.workingDirectory ?? record.settings.worktreePath, working_directory_provenance: session.workingDirectory ? "recorded" : "derived_legacy",
          created_at: session.createdAt, latest_attempt_at: attempt?.startedAt ?? null, controller_session_state: activeId === id ? "running" : "stopped",
          provider_history: { state: "unknown", observed_at: null, reason: "Provider history has not been checked by this inventory." },
          attempts: session.runs.map((run, index) => ({ attempt_id: run.control?.attemptId ?? createHash("sha256").update(`${record.executionId}:${id}:${index}`).digest("hex"), started_at: run.startedAt, ended_at: run.endedAt ?? null, cause: run.cause,
            state: activeId === id && index === session.runs.length - 1 ? "running" : run.endedAt ? "stopped" : "unknown",
            requested: run.codex?.requested ?? { model: session.model, effort: session.effort ?? null }, effective: run.codex?.effective ?? (session.initModel ? { model: session.initModel } : null),
            account: run.codex?.account ?? run.account ?? null, billing: run.billing ?? null })) });
      } catch { unread(`Saved session ${phase}/${id} is missing, corrupt, unowned or exceeded the read deadline.`); }
    }
    phases.push({ phase_key: phase, phase_id: plan?.id ?? phase, phase_title: plan?.title ?? record.activities?.find(a => a.key === phase)?.kind ?? phase, conversations: entries });
  }
  for (const plan of record.plan ?? []) if (!references.has(plan.id)) phases.push({ phase_key: plan.id, phase_id: plan.id, phase_title: plan.title, conversations: [] });
  return { complete: !errors.length, errors, phases, sessions };
}
export function chooseSession(work: SavedWork, history: History, selector?: string, activeId?: string): Conversation | null {
  if (selector && !safeSelector(selector)) throw new ControlFailure("invalid_input", "Invalid Kiln session selector.", 2);
  if (selector) {
    const match = history.sessions.filter(s => s.id === selector);
    if (match.length !== 1) throw new ControlFailure(history.complete ? "target_not_found" : "state_unavailable", "Session is not available within this execution.", history.complete ? 2 : 4);
    return match[0]!;
  }
  const stopped = Object.entries(work.record.phases).find(([, f]) => f.stop || f.wait);
  const id = activeId ?? stopped?.[1].sessionIds.at(-1);
  const preferred = id ? history.sessions.find(s => s.id === id) : undefined;
  return preferred ?? [...history.sessions].sort((a, b) => (a.record.runs.at(-1)?.startedAt ?? a.record.createdAt).localeCompare(b.record.runs.at(-1)?.startedAt ?? b.record.createdAt)).at(-1) ?? null;
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
    const matches = history.sessions.filter(s => s.id === activeId);
    if (matches.length === 1) return matches[0]!;
    throw new ControlFailure("saved_output_unavailable", "The active output session is missing, corrupt or unowned.");
  }
  if (!history.complete) throw new ControlFailure("saved_output_unavailable", "The latest output session cannot be established because saved session history is incomplete.");
  return [...history.sessions].sort((a, b) => (a.record.runs.at(-1)?.startedAt ?? a.record.createdAt).localeCompare(b.record.runs.at(-1)?.startedAt ?? b.record.createdAt)).at(-1) ?? null;
}
export function workingDirectoryAvailable(folder: string): boolean {
  try { return existsSync(folder) && statSync(folder).isDirectory(); } catch { return false; }
}
