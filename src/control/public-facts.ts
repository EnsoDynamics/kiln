import type { BillingSummary, WorkspaceCredits } from "../billing/inspection.js";
import type { AccountIdentity } from "../state/records.js";
import type { CodexAccountProvenance } from "../state/records.js";
import type { AgentAccount } from "../agents/metadata.js";

export function publicProvenance(a: CodexAccountProvenance): Record<string, unknown> {
  return { at: a.at ?? null, observed_at: a.at ?? null, observation_state: a.at ? "known" : "unavailable", observation_reason: a.at ? null : "Account observation date was not recorded.", accountId: a.accountId ?? null, email: a.email ?? null, plan: a.plan ?? null,
    identity_availability: a.email || a.accountId ? "known" : "unknown", identity_reason: a.email || a.accountId ? null : "Provider identity was not reported." };
}
export function publicUsage(row: AgentAccount["limits"][number]): Record<string, unknown> {
  const unknown = ["id", "scope", "percent", "resetsAt", "durationMinutes"].filter(key => row[key as keyof typeof row] == null);
  return { ...row, id: row.id ?? null, scope: row.scope ?? null, percent: row.percent ?? null, resetsAt: row.resetsAt ?? null, durationMinutes: row.durationMinutes ?? null,
    availability: { state: unknown.length ? "partial" : "available", reason: unknown.length ? `Provider did not report: ${unknown.join(", ")}.` : null, unknown_fields: unknown } };
}

export function fieldAvailability(value: Record<string, unknown>): Record<string, unknown> {
  const unknown = Object.keys(value).filter(key => value[key] == null);
  return { state: unknown.length ? "partial" : "available", reason: unknown.length ? `Provider did not report: ${unknown.join(", ")}.` : null, unknown_fields: unknown };
}
export function publicCredits(credits: WorkspaceCredits[] | undefined, stale = false): unknown {
  return credits?.map(row => {
    const fields = { bucketId: row.bucketId ?? null, accountId: row.accountId ?? null, scope: row.scope ?? null, balance: row.balance ?? null, hasCredits: row.hasCredits ?? null };
    return { ...fields, observedAt: row.observedAt ?? null, state: !row.observedAt ? "unavailable" : stale ? "stale" : "current", reason: !row.observedAt ? "Credit observation date is unavailable." : stale ? "Last-known credit observation." : null, availability: fieldAvailability(fields) };
  }) ?? null;
}
export function publicBillingSummary(b: BillingSummary, stale = false): Record<string, unknown> {
  const fields = { provider: b.provider ?? null, email: b.email ?? null, orgId: b.orgId ?? null, accountId: b.accountId ?? null, plan: b.plan ?? null, credits: publicCredits(b.credits, stale), overflow: b.overflow ?? null };
  return { agentId: b.agentId, route: b.route, sources: b.sources, diagnostics: b.diagnostics, approved: b.approved, ...fields,
    observedAt: b.observedAt ?? null, state: !b.observedAt ? "unavailable" : stale ? "stale" : "current", reason: !b.observedAt ? "Billing observation date is unavailable." : stale ? "Last-known billing observation." : null, availability: fieldAvailability(fields) };
}
export function publicLegacyAccount(a: AccountIdentity): Record<string, unknown> {
  const fields = { email: a.email ?? null, orgId: a.orgId ?? null, accountId: null, plan: null };
  return { ...fields, at: null, observed_at: null, state: "unavailable", reason: "Legacy account identity has no recorded observation date or plan.", availability: fieldAvailability(fields) };
}
