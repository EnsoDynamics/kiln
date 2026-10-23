// Codex 0.162.1 refusal/release rules. No prose, percentages or credit offers authorize work.
import { createHash } from "node:crypto";
import type { AgentAccount } from "../agents/metadata.js";
import type { CodexUsageRecovery, LimitRefusal, SessionRecord, SessionRun } from "../state/records.js";

export function codexUsageRefusal(run: SessionRun, model: string): LimitRefusal | undefined {
  const facts = run.codex;
  const error = facts?.terminal?.error as { codexErrorInfo?: unknown } | undefined;
  if (run.interruptedBy || !facts || facts.terminal?.status !== "failed" || error?.codexErrorInfo !== "usageLimitExceeded" || facts.humanRequests.some(request => request.stopped)) return undefined;
  const refusalAt = facts.terminal.at;
  if (facts.terminal.modelActivityCount !== undefined && facts.modelActivityAt.length > facts.terminal.modelActivityCount) return undefined;
  // Crash recovery without an arrival frontier cannot order recorded model activity.
  if (!refusalAt && facts.modelActivityAt.length) return undefined;
  if (refusalAt && facts.modelActivityAt.some(at => Date.parse(at) > Date.parse(refusalAt))) return undefined;
  return { agentId: "codex", label: "A usage limit", at: run.endedAt ?? facts.intentAt, codex: { code: "usageLimitExceeded", model, ...(facts.account.accountId ? { accountId: facts.account.accountId } : {}) } };
}

export interface CodexRelease { state: "allowed" | "blocked" | "unknown"; reason: string; accountId?: string; fingerprint?: string; administrative?: boolean; suppressed?: boolean }

export class CodexUsageRecoveryUnavailable extends Error {
  constructor(readonly release: CodexRelease) { super(release.reason); }
}

export class CodexLaunchCancelled extends Error {}

/** Clear a consumed retry once, only from this attempt's actual model activity. */
export function recordCodexUsageProgress(session: SessionRecord, run: SessionRun): void {
  const recovery = session.codex?.usageRecovery;
  if (recovery?.consumed && run.codex?.modelActivityAt.length) {
    recovery.generation++;
    delete recovery.consumed;
  }
}

/** Observe semantic transitions durably; timestamps and unchanged positive reads never buy retries. */
export function codexUsageRelease(session: SessionRecord, refusal: LimitRefusal, reading: AgentAccount | undefined): CodexRelease {
  if (!session.codex || !refusal.codex) throw new Error("Codex usage recovery requires a recorded Codex refusal.");
  const recovery = session.codex.usageRecovery ??= { generation: 0 };
  let result: CodexRelease;
  if (!reading || reading.agentId !== "codex" || reading.error || !Number.isFinite(Date.parse(reading.startedAt)) || Date.parse(reading.startedAt) < Date.parse(refusal.at) || !reading.accountId?.trim() || reading.routingAccountId !== undefined && reading.routingAccountId !== reading.accountId) {
    result = { state: "unknown", reason: "A fresh, consistent Codex usage reading taken after the refusal is required." };
  } else {
    const permission = reading.codexUsage;
    result = { ...(permission ?? { state: "unknown", reason: "Codex ordinary-usage permission is unavailable; resume manually when ready." }), accountId: reading.accountId };
    if (result.state === "blocked" && !result.administrative) recovery.blockedAccountId = reading.accountId;
    if (result.state === "allowed") {
      if (recovery.blockedAccountId === reading.accountId) { recovery.generation++; delete recovery.blockedAccountId; }
      const fingerprint = createHash("sha256").update(JSON.stringify([session.conversation?.threadId, session.model, session.effort, reading.accountId, recovery.generation])).digest("hex");
      if (recovery.consumed?.fingerprint === fingerprint) result = { state: "blocked", accountId: reading.accountId, suppressed: true, reason: "The automatic attempt was refused before model activity. Unchanged permission cannot retry; a blocked-to-allowed transition or a different stable account is required." };
      else result.fingerprint = fingerprint;
    }
  }
  recovery.release = { state: result.state, reason: result.reason, ...(result.accountId ? { accountId: result.accountId } : {}), at: reading?.updatedAt ?? refusal.at };
  return result;
}

export function consumeCodexUsage(session: SessionRecord, release: CodexRelease): NonNullable<CodexUsageRecovery["consumed"]> {
  if (release.state !== "allowed" || !release.fingerprint || !release.accountId || !session.codex?.usageRecovery) throw new Error("Fresh Codex permission is required before automatic usage recovery.");
  return session.codex.usageRecovery.consumed = { fingerprint: release.fingerprint, accountId: release.accountId, at: new Date().toISOString() };
}
