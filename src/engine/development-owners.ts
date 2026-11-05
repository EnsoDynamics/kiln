import { isAncestorOf } from "../plan/phase-ids.js";
/** Audit ownership of the existing delivery ledger; scheduling remains with the engine. */
import { readFileSync } from "node:fs";
import { assignedPath, phaseScope, repositoryFor, requirementManifest } from "../audit/snapshots.js";
import { AuditStore, hashValue } from "../audit/storage.js";
import type { WorkSnapshot } from "../audit/contracts.js";
import { effectiveAudit } from "../audit/effective-result.js";
import { ownerKey, recoveryOwners, recoveryStopKey, sameOwner, type DeliveryCheckpoint, type DeliveryOwner, type DevelopmentLedger } from "../state/development-delivery.js";
import type { DeliveryContext } from "./development-delivery.js";

export function contextOwner(context: Pick<DeliveryContext, "owner" | "phaseId">): DeliveryOwner | undefined {
  return context.owner ?? (context.phaseId ? { kind: "phase", phaseId: context.phaseId } : undefined);
}
export function auditDeliveryScope(context: DeliveryContext, owner: DeliveryOwner) {
  if (owner.kind !== "audit") throw new Error("An audit delivery scope requires an audit owner.");
  const activity = context.record.completionAudits?.activities.find(one => one.activityId === owner.activityId);
  if (!activity) throw new Error(`Unknown audit owner ${owner.activityId}.`);
  const snapshotId = activity.snapshots.at(-1);
  if (!snapshotId) throw new Error(`Audit ${owner.activityId} needs its engine-issued snapshot before development assessment.`);
  const snapshot = new AuditStore(context.stateDirectory).read<WorkSnapshot>(snapshotId);
  if (snapshot.executionId !== context.record.executionId || snapshot.activityId !== owner.activityId) throw new Error("Audit development snapshot belongs to other work.");
  const repo = repositoryFor(context.record, snapshot.requirements.repository);
  // Read the criteria as they are now: an audit may write pointer lines under them, and sessions no longer issue snapshots.
  const manifest = requirementManifest(repo.name, snapshot.requirements.path, snapshot.requirements.criteria[0]?.blob ?? "", readFileSync(assignedPath(repo, snapshot.requirements.path), "utf8"));
  const documentsDigest = hashValue(snapshot.documents.map(reference => [reference.repository, reference.path, phaseScope(readFileSync(assignedPath(repositoryFor(context.record, reference.repository), reference.path), "utf8"))]));
  return { activity, manifest, documentsDigest, requirementManifestDigest: manifest.id };
}

/** The first grant can recover prior phase/audit assessments in one stopped conversation. */
export function activeRecoveryOwner(context: DeliveryContext, check: (owner: DeliveryOwner) => boolean): DeliveryOwner | undefined {
  const recovery = context.record.developmentAuthorization?.activationRecovery;
  const active = contextOwner(context);
  if (!recovery || !active || recoveryStopKey(recovery) !== (active.kind === "audit" ? `audit-${active.activityId}` : active.phaseId)) return undefined;
  return recoveryOwners(recovery).find(owner => !check(owner));
}

/** All exact retained obligations assigned to an owner; checkpoint origin is immutable. */
export function assignedObligationCriteria(state: DevelopmentLedger, checkpoint: DeliveryCheckpoint, owner: DeliveryOwner, requirementId: string): string[] {
  const direct = sameOwner(checkpoint, { owner }) && ["requiredMerge", ...checkpoint.requirements.map(one => one.id)].includes(requirementId) ? checkpoint.criteria : [];
  const retained = (state.assignments ?? []).filter(one => one.checkpointId === checkpoint.id && one.requirementId === requirementId && ownerKey(one.owner) === ownerKey(owner)).flatMap(one => one.criteria);
  const split = owner.kind === "phase" ? state.splits.flatMap(one => one.assignments.filter(assignment => assignment.checkpointId === checkpoint.id && assignment.requirementId === requirementId && assignment.leafIds.includes(owner.phaseId)).flatMap(assignment => assignment.criteria)) : [];
  return [...new Set([...direct, ...retained, ...split])];
}
export function assignedObligations(state: DevelopmentLedger, checkpoint: DeliveryCheckpoint, owner: DeliveryOwner): string[] {
  return ["requiredMerge", ...checkpoint.requirements.map(one => one.id)].filter(id => assignedObligationCriteria(state, checkpoint, owner, id).length > 0);
}

/**
 * Called inside the allocator's single persisted decision; never a provider mutation API. A version-1
 * report names the criteria each repair phase or continuation inherits; a version-2 report, or an audit
 * marked complete with no usable report, names none, so the target inherits every criterion of the source
 * audit's obligations. Reads the effective result, so a waived audit hands its obligations on (AC-WAIVE-12).
 */
export function assignAuditObligations(context: DeliveryContext, sourceActivityId: string, target: DeliveryOwner): void {
  const source = { kind: "audit" as const, activityId: sourceActivityId };
  const { activity, manifest } = auditDeliveryScope(context, source);
  let effective: ReturnType<typeof effectiveAudit>;
  try { effective = effectiveAudit(context.stateDirectory, activity); } catch { throw new Error("Audit assignment result is unresolved or belongs to other work."); }
  if (!effective) throw new Error("Only an accepted or waived audit can assign continuation/repair obligations.");
  const report = effective.parsed;
  const allKeys = manifest.criteria.map(one => one.key);
  let criterionKeys: string[];
  if (target.kind === "phase") {
    const planned = context.record.plan?.find(one => one.id === target.phaseId);
    if (effective.outcome !== "completion_phases" || !effective.completionPhases().includes(target.phaseId) || !planned || planned.closed) throw new Error("Repair obligations require the accepted audit's matching open completion phase.");
    criterionKeys = report?.outcome === "completion_phases" && report.schemaVersion !== 2 ? report.completionPhases.find(one => one.id === target.phaseId)?.criterionKeys ?? allKeys : allKeys;
  } else {
    const next = context.record.completionAudits?.activities.find(one => one.activityId === target.activityId);
    if (effective.outcome !== "continue_test" || !next || next.kind !== "test_audit" || activity.kind !== "test_audit" || next.round !== activity.round || next.continuationIndex !== activity.continuationIndex + 1) throw new Error("Audit obligations require the immediate assigned test continuation.");
    criterionKeys = report?.outcome === "continue_test" && report.schemaVersion !== 2 ? report.nextTestBatch?.criterionKeys ?? [] : allKeys;
  }
  if (!criterionKeys.length || new Set(criterionKeys).size !== criterionKeys.length || criterionKeys.some(key => !allKeys.includes(key))) throw new Error("Assignments need exact current audit criterion keys.");
  const state = context.record.developmentDelivery;
  if (!state) throw new Error("Development ledger is missing.");
  const entries = state.checkpoints.flatMap(checkpoint => assignedObligations(state, checkpoint, source).flatMap(requirementId => {
    const criteria = assignedObligationCriteria(state, checkpoint, source, requirementId).filter(key => criterionKeys.includes(key));
    return criteria.length ? [{ checkpointId: checkpoint.id, requirementId, owner: target, criteria }] : [];
  }));
  const assignments = state.assignments ?? []; let changed = false;
  for (const entry of entries) {
    const prior = assignments.find(one => one.checkpointId === entry.checkpointId && one.requirementId === entry.requirementId && ownerKey(one.owner) === ownerKey(target));
    if (prior) { const criteria = [...new Set([...prior.criteria, ...entry.criteria])]; if (criteria.length !== prior.criteria.length) { prior.criteria = criteria; changed = true; } }
    else { assignments.push(entry); changed = true; }
  }
  state.assignments = assignments;
  if (changed) state.revision++;
  state.currentComplete = false;
}

/** Preserve observed implementation/audit/repair order when a first grant recovers history. */
export function orderedRecoveryOwners(record: import("../state/records.js").PrdRecord, stateDirectory: string, phaseIds: string[], stopped: DeliveryOwner, phaseStartedAt: (id: string) => string | undefined, stopAt: string): DeliveryOwner[] {
  const store = new AuditStore(stateDirectory);
  const activities = record.completionAudits?.activities ?? [];
  const stopAudit = stopped.kind === "audit" ? activities.find(one => one.activityId === stopped.activityId) : undefined;
  const introduced = new Map<string, { at: string; sequence: number }>();
  for (const audit of activities) {
    const effective = effectiveAudit(stateDirectory, audit, store);
    if (effective) for (const id of effective.completionPhases()) introduced.set(id, { at: audit.createdAt, sequence: audit.sequence });
  }
  let previousAt = ""; let previousTie = -1;
  const phaseRows = phaseIds.map((phaseId, index) => {
    const origin = [...introduced.entries()].find(([id]) => phaseId === id || isAncestorOf(id, phaseId))?.[1];
    const observedAt = phaseStartedAt(phaseId) ?? origin?.at ?? "";
    const at = observedAt < previousAt ? previousAt : observedAt;
    const baseTie = origin ? origin.sequence * 2 + 1 : index / (phaseIds.length + 1);
    const tie = at === previousAt ? Math.max(baseTie, previousTie + 1 / (phaseIds.length + 1)) : baseTie;
    previousAt = at; previousTie = tie;
    return { owner: { kind: "phase" as const, phaseId }, at, tie };
  });
  const auditRows = activities.filter(one => (stopAudit ? one.sequence <= stopAudit.sequence : one.createdAt <= stopAt) && (one === stopAudit || one.acceptedResult || one.waivedResult || one.sessionIds.length || record.developmentDelivery?.checkpoints.some(checkpoint => checkpoint.owner?.kind === "audit" && checkpoint.owner.activityId === one.activityId))).map(one => ({ owner: { kind: "audit" as const, activityId: one.activityId }, at: one.createdAt, tie: one.sequence * 2 }));
  return [...phaseRows, ...auditRows].sort((left, right) => left.at.localeCompare(right.at) || left.tie - right.tie).map(one => one.owner);
}
