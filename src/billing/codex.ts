import type { AgentAccount, MetadataState } from "../agents/metadata.js";
import type { BillingSummary } from "./inspection.js";
import type { BillingView } from "./authority.js";

/** Public presentation only. Codex never receives a Claude billing grant. */
export function codexBillingSummary(account: AgentAccount | undefined, now = Date.now()): BillingSummary {
  const current = account && !account.error ? account : undefined;
  const credits = current?.credits?.filter(credit => credit.accountId === current.accountId && now - Date.parse(credit.observedAt) >= 0 && now - Date.parse(credit.observedAt) <= 5 * 60_000);
  return { agentId: "codex", route: "settings", sources: [], diagnostics: [], approved: false,
    observedAt: account?.updatedAt ?? new Date(now).toISOString(),
    ...(current?.email ? { email: current.email } : {}), ...(current?.plan ? { plan: current.plan } : {}),
    ...(current?.accountId ? { accountId: current.accountId } : {}), ...(credits?.length ? { credits } : {}),
  };
}
export function codexBillingView(metadata: MetadataState, executionId: string, lastLaunch?: BillingSummary): BillingView {
  const summary = codexBillingSummary(metadata.account);
  return { executionId, selectionGeneration: metadata.generation, pending: metadata.pending,
    next: { ...summary, readingId: "", canApprove: false, canClear: false, ...(metadata.blockers.length ? { readinessError: metadata.blockers.join(" ") } : {}) },
    ...(lastLaunch?.agentId === "codex" ? { lastLaunch } : {}), canLaunch: !metadata.pending && metadata.blockers.length === 0,
  };
}
