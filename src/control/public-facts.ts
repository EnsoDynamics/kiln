import type { CodexAccountProvenance } from "../state/records.js";
import type { AgentAccount } from "../agents/metadata.js";

export function publicProvenance(a: CodexAccountProvenance): Record<string, unknown> {
  return { at: a.at, accountId: a.accountId ?? null, email: a.email ?? null, plan: a.plan ?? null,
    identity_availability: a.email || a.accountId ? "known" : "unknown", identity_reason: a.email || a.accountId ? null : "Provider identity was not reported." };
}
export function publicUsage(row: AgentAccount["limits"][number]): Record<string, unknown> {
  const unknown = ["id", "scope", "percent", "resetsAt", "durationMinutes"].filter(key => row[key as keyof typeof row] == null);
  return { ...row, id: row.id ?? null, scope: row.scope ?? null, percent: row.percent ?? null, resetsAt: row.resetsAt ?? null, durationMinutes: row.durationMinutes ?? null,
    availability: { state: unknown.length ? "partial" : "available", reason: unknown.length ? `Provider did not report: ${unknown.join(", ")}.` : null, unknown_fields: unknown } };
}
