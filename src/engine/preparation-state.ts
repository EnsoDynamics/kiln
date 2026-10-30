/** Engine-owned checkpoints and attempt state. Provider submissions are references only. */
import { createHash } from "node:crypto";
import type { ContinuationProposal, PreparationBinding } from "./continuation-readiness.js";
export const preparationDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type PreparationReference = { kind: "git_revision"; repository: string; commit: string } | { kind: "command"; sessionId: string; callId: string };
export interface PreparationCheckpoint {
  id: string; environment: string; repositories: { name: string; identity: string; worktree: string; branch: string; head: string; tree: string; index: string; files: string }[];
}
export interface PreparationCheckAttempt {
  id: string; bindingId: string; checkIndex: number; checkpointId: string;
  executable: string; environmentDigest: string; argv: string[]; directory: string; timeoutSeconds: number;
  startedAt: string; endedAt?: string; pid?: number; processStartTime?: string; gateDirectory: string; output: string; outputDigest?: string;
  outcome: "running" | "succeeded" | "failed" | "interrupted" | "unresolved"; exitCode?: number; reason?: string;
}
export interface PreparationState {
  formatVersion: 1; phaseId: string; proposalId: string; stage: "preparation" | "verification" | "implementation";
  bindings: (PreparationBinding & { id: string })[];
  submissions: { bindingId: string; sessionId: string; run: number; references: PreparationReference[]; digest: string }[];
  checkpoint?: PreparationCheckpoint; verifiedCheckpoint?: PreparationCheckpoint;
  providerPolicyDigest?: string;
  attempts: PreparationCheckAttempt[]; reason?: string; implementationRun?: number;
}
export function newPreparationState(proposal: ContinuationProposal): PreparationState {
  if (!proposal.firstEligiblePhase || !proposal.preparation.length || proposal.preparation.some(binding => !binding.valid)) throw new Error("No complete preparation binding can be activated.");
  return { formatVersion: 1, phaseId: proposal.firstEligiblePhase, proposalId: proposal.id, stage: "preparation", bindings: proposal.preparation.map(binding => ({ ...binding, id: preparationDigest(binding) })), submissions: [], attempts: [] };
}
export function assertPreparationState(value: PreparationState | undefined): void {
  if (value === undefined) return;
  const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  if (value.formatVersion !== 1 || !value.phaseId || !digest(value.proposalId) || !["preparation", "verification", "implementation"].includes(value.stage) || !Array.isArray(value.bindings) || !value.bindings.length || !Array.isArray(value.attempts)) throw new Error("Invalid retained preparation state.");
  for (const binding of value.bindings) { const { id, ...body } = binding; if (id !== preparationDigest(body) || !binding.valid || binding.phaseId !== value.phaseId) throw new Error("Damaged preparation binding."); }
  for (const attempt of value.attempts) if (!/^[\w.-]{1,128}$/.test(attempt.id) || !value.bindings.some(binding => binding.id === attempt.bindingId && binding.checks[attempt.checkIndex]) || !digest(attempt.checkpointId) || !["running", "succeeded", "failed", "interrupted", "unresolved"].includes(attempt.outcome)) throw new Error("Invalid retained preparation check attempt.");
  for (const checkpoint of [value.checkpoint, value.verifiedCheckpoint]) if (checkpoint && checkpoint.id !== preparationDigest({ repositories: checkpoint.repositories, environment: checkpoint.environment })) throw new Error("Damaged prepared checkpoint.");
  if (value.stage === "implementation" && (!value.verifiedCheckpoint || !Number.isSafeInteger(value.implementationRun))) throw new Error("Implementation has no retained verified checkpoint.");
}
