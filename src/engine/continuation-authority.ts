/** Pending grants belong to a proposed fresh execution, never its completed predecessor. */
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { privateJson } from "../control/private-state.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { normalizeMergeTarget, mergeTargetKey, type DevelopmentAuthorization, type MergeTarget } from "../state/development-delivery.js";
import type { PrdRecord } from "../state/records.js";
import type { ContinuationProposal } from "./continuation-readiness.js";

export interface PendingContinuationAuthority {
  formatVersion: 1; id: string; completedExecutionId: string; scopeDigest: string; executionId: string;
  authorization: DevelopmentAuthorization; approvals: { operationId: string; commandId: string; target: MergeTarget }[];
  state: "pending" | "superseded" | "adopted"; acceptanceId?: string;
}
export function readPendingAuthority(directory: string, record: Pick<PrdRecord, "pendingContinuationAuthority">): PendingContinuationAuthority | undefined {
  const id = record.pendingContinuationAuthority;
  if (id === undefined) return undefined;
  if (!/^[\w.-]{1,128}$/.test(id)) throw new Error("Invalid pending authority pointer.");
  const value = privateJson<PendingContinuationAuthority>(dirname(dirname(directory)), join(directory, "continuation-authority", `${id}.json`));
  if (value.formatVersion !== 1 || value.id !== id || !/^[a-f0-9]{64}$/.test(value.scopeDigest) || !value.executionId || !value.completedExecutionId || !["pending", "superseded", "adopted"].includes(value.state) || !Array.isArray(value.approvals) || !Array.isArray(value.authorization?.grants) || value.authorization.revision !== value.authorization.grants.length || !value.authorization.enabled || value.approvals.length !== value.authorization.grants.length) throw new Error("Invalid pending continuation authority; restore its durable record.");
  for (const grant of value.authorization.grants) if (grant.source !== "continuation" || !value.approvals.some(row => mergeTargetKey(normalizeMergeTarget(row.target)) === mergeTargetKey(normalizeMergeTarget(grant.target)) && !!row.operationId && !!row.commandId)) throw new Error("Pending target grant has no retained approval.");
  return value;
}
export function writePendingAuthority(directory: string, value: PendingContinuationAuthority): void {
  writeDurableMetadata(join(directory, "continuation-authority", `${value.id}.json`), value);
  for (const approval of value.approvals) writeDurableMetadata(join(directory, "continuation-approval-links", `${approval.operationId}.json`), { formatVersion: 1, authorityId: value.id });
}
export function pendingForProposal(pending: PendingContinuationAuthority | undefined, proposal: Pick<ContinuationProposal, "scopeDigest" | "completedExecutionId">): PendingContinuationAuthority | undefined {
  return pending?.state === "pending" && pending.scopeDigest === proposal.scopeDigest && pending.completedExecutionId === proposal.completedExecutionId ? pending : undefined;
}
export function reserveAuthority(proposal: ContinuationProposal): PendingContinuationAuthority {
  if (!proposal.scopeDigest) throw new Error("Refresh the continuation before granting authority.");
  return { formatVersion: 1, id: randomUUID(), completedExecutionId: proposal.completedExecutionId, scopeDigest: proposal.scopeDigest, executionId: randomUUID(), authorization: { enabled: true, revision: 0, grants: [] }, approvals: [], state: "pending" };
}
export function authorityExists(directory: string, id: string): boolean { return existsSync(join(directory, "continuation-authority", `${id}.json`)); }

export function authorityForApproval(directory: string, operationId: string): PendingContinuationAuthority | undefined {
  if (!/^[\w.-]{1,128}$/.test(operationId)) throw new Error("Invalid approval operation.");
  const path = join(directory, "continuation-approval-links", `${operationId}.json`);
  if (!existsSync(path)) return undefined;
  const link = privateJson<{ formatVersion: number; authorityId: string }>(dirname(dirname(directory)), path);
  if (link.formatVersion !== 1) throw new Error("Invalid approval linkage.");
  return readPendingAuthority(directory, { pendingContinuationAuthority: link.authorityId });
}
