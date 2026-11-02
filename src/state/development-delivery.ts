/** Execution-scoped authority and retained delivery obligations. */
export type DeliveryOwner = { kind: "phase"; phaseId: string } | { kind: "audit"; activityId: string };
/** phaseId remains only on legacy/phase-owned records. Audit origins never fabricate one. */
export interface DeliveryOwnership { owner?: DeliveryOwner | undefined; phaseId?: string | undefined }
export function deliveryOwner(value: DeliveryOwnership): DeliveryOwner {
  if (value.owner?.kind === "phase" && typeof value.owner.phaseId === "string" && value.owner.phaseId && (value.phaseId === undefined || value.phaseId === value.owner.phaseId)) return value.owner;
  if (value.owner?.kind === "audit" && typeof value.owner.activityId === "string" && value.owner.activityId && value.phaseId === undefined) return value.owner;
  if (value.owner === undefined && typeof value.phaseId === "string" && value.phaseId) return { kind: "phase", phaseId: value.phaseId };
  throw new Error("Invalid development-delivery owner.");
}
export function ownerKey(owner: DeliveryOwner): string { return owner.kind === "phase" ? `phase:${owner.phaseId}` : `audit:${owner.activityId}`; }
export function sameOwner(left: DeliveryOwnership, right: DeliveryOwnership): boolean { return ownerKey(deliveryOwner(left)) === ownerKey(deliveryOwner(right)); }
export function ownerFields(owner: DeliveryOwner): DeliveryOwnership { return { owner, ...(owner.kind === "phase" ? { phaseId: owner.phaseId } : {}) }; }
export interface DeliveryAssignment { checkpointId: string; requirementId: string; owner: DeliveryOwner; criteria: string[] }
export interface ActivationRecovery { stoppedPhaseId?: string; stoppedOwner?: DeliveryOwner; phaseIds: string[]; owners?: DeliveryOwner[]; repositoryNames: string[] }
export function recoveryOwners(recovery: ActivationRecovery): DeliveryOwner[] { return recovery.owners ?? recovery.phaseIds.map(phaseId => ({ kind: "phase", phaseId })); }
export function recoveryStopKey(recovery: ActivationRecovery): string {
  const owner = recovery.stoppedOwner ?? deliveryOwner({ phaseId: recovery.stoppedPhaseId });
  return owner.kind === "phase" ? owner.phaseId : `audit-${owner.activityId}`;
}
/** Environment is present only on retained, narrower grants from older executions. */
export interface MergeTarget { repository: string; baseBranch: string; environment?: string }
export interface DevelopmentTarget extends MergeTarget { environment: string }
export interface DevelopmentCandidate { target: MergeTarget; confirmedNonProduction?: boolean; confirmedTarget?: MergeTarget }
export interface DevelopmentSettings { enabled: boolean; targets: DevelopmentCandidate[] }
export interface DevelopmentAuthorization {
  revision: number; enabled: boolean;
  activationRecovery?: ActivationRecovery;
  grants: { target: MergeTarget; confirmedAt: string; source: "start" | "needs_you" | "continuation" }[];
}
export interface CommandEvidence {
  source: string; callId: string; command: string; cwd: string; calledAt: string;
  resultAt?: string; outcome?: "success" | "error"; exitCode?: number; output?: string;
}
export interface EvidenceRequirement {
  id: string; purpose: "pre_merge" | "deployment" | "verification" | "current_artifact";
  source: { path: string; revision: string };
  match: { kind: "command"; invocation: string; cwd: string; fields: Record<string, string | number | boolean> }
    | { kind: "github_deployment" }
    | { kind: "github_workflow"; path: string; jobs: string[]; deploymentJob?: string; attempt: number };
}
export interface EvidenceReference { requirementId: string; kind: "command" | "github_deployment" | "github_workflow"; id: string; sessionId?: string }
export interface EvidenceFact {
  requirementId: string; reference: EvidenceReference; revision: string; environment: string;
  observedAt: string; occurredAt: string; status: "success" | "unresolved"; rawDigest: string; rawPath: string; startedAt?: string; deploymentJobUrl?: string; observedRevision?: string; prerequisiteArtifacts?: { checkpointId: string; revision: string }[]; reason?: string;
}
export interface MergeFact { number: number; url: string; sourceHead: string; mergedHead: string; resultSha: string; method: string; mergedAt: string }
export interface DeliveryOperation {
  id: string; restorationFor?: string; requirementIds?: string[]; sourceHead?: string; intendedBaseSha?: string; kind: "merge" | "deploy" | "verify" | "synchronize"; preparedAt: string;
  state: "prepared" | "observed" | "unresolved" | "failed"; retryOf?: string; failureEvidencePath?: string; references: EvidenceReference[]; reason?: string;
  pullRequest?: number; synchronized?: { featureHead: string; baseHead: string };
}
export interface DeliveryCheckpoint extends DeliveryOwnership {
  id: string; executionId: string; requirementManifestDigest?: string; target: DevelopmentTarget; featureBranch: string;
  headSha: string; baseSha: string; criteria: string[]; dependsOn: string[];
  workflowSource: { path: string; revision: string }; requirements: EvidenceRequirement[];
  requiredChecks: string[]; requireReview: boolean; createdAt: string;
  references?: EvidenceReference[]; operations: DeliveryOperation[]; merge?: MergeFact; evidence: EvidenceFact[]; evidenceHistory?: EvidenceFact[];
  observedActivity?: { kind: "Deploying" | "Verifying"; at: string }; mergeUnresolvedReason?: string; unresolvedRequirements?: Record<string, string>; verificationProbeAfter?: string; checkedAt?: string; unresolvedReason?: string; supersededBy?: string;
}
export interface DeliveryAssessment extends DeliveryOwnership { requirementManifestDigest?: string; documentsDigest: string; required: boolean; criteria: string[]; reason: string; checkpointIds: string[] }
export interface SplitAssignment { checkpointId: string; requirementId: string; originPhaseId?: string; originOwner?: DeliveryOwner; criteria: string[]; leafIds: string[] }
export interface DeliverySplit { phaseId: string; documentsDigest: string; revision: number; assignments: SplitAssignment[] }
export interface RepositoryDeliveryResult {
  repository: string; state: "unchanged" | "delivered" | "review" | "mixed" | "unresolved";
  deliveredCheckpointIds: string[]; remainingHeadSha?: string; reviewPullRequest?: { number: number; url: string }; reasons: string[];
}
export interface DevelopmentLedger {
  assignments?: DeliveryAssignment[];
  revision: number; assessments: DeliveryAssessment[]; checkpoints: DeliveryCheckpoint[]; splits: DeliverySplit[];
  sourceUnavailable?: boolean; lastReadError?: string; checkedAt?: string; repositoryResults: RepositoryDeliveryResult[]; currentComplete?: boolean;
}
export const restrictedAuthorization = (): DevelopmentAuthorization => ({ revision: 0, enabled: false, grants: [] });
export const emptyDevelopmentLedger = (): DevelopmentLedger => ({ revision: 0, assessments: [], checkpoints: [], splits: [], repositoryResults: [] });
export function targetKey(target: DevelopmentTarget): string { return JSON.stringify([target.repository.toLowerCase(), target.baseBranch, target.environment.trim()]); }
export function mergeTargetKey(target: MergeTarget): string { return JSON.stringify([target.repository.toLowerCase(), target.baseBranch]); }
export function authorizationTargetKey(target: MergeTarget): string { return JSON.stringify([mergeTargetKey(target), target.environment ?? null]); }
export function permitsTarget(grant: MergeTarget, target: DevelopmentTarget): boolean {
  return mergeTargetKey(grant) === mergeTargetKey(target) && (grant.environment === undefined || grant.environment === target.environment);
}
export function normalizeMergeTarget(value: unknown): MergeTarget {
  if (!value || typeof value !== "object") throw new Error("Select a repository and base branch for early merges.");
  const target = value as MergeTarget;
  if (typeof target.repository !== "string" || !/^github\.com\/[\w.-]+\/[\w.-]+$/i.test(target.repository) || typeof target.baseBranch !== "string" || !target.baseBranch.trim()) throw new Error("Select a concrete GitHub repository and base branch for early merges.");
  if (target.environment !== undefined) return normalizeTarget(value);
  return { repository: target.repository.toLowerCase(), baseBranch: target.baseBranch };
}
export function normalizeTarget(value: unknown): DevelopmentTarget {
  if (!value || typeof value !== "object") throw new Error("Name a repository, base branch and development environment.");
  const target = value as DevelopmentTarget;
  if (typeof target.repository !== "string" || !/^github\.com\/[\w.-]+\/[\w.-]+$/i.test(target.repository) || typeof target.baseBranch !== "string" || !target.baseBranch.trim() || typeof target.environment !== "string" || !target.environment.trim()) throw new Error("Name a concrete GitHub repository, base branch and development environment.");
  return { repository: target.repository.toLowerCase(), baseBranch: target.baseBranch, environment: target.environment.trim() };
}

/** Reject damaged schema-5 state rather than substituting a history with no obligations. */
export function assertDevelopmentState(record: { developmentAuthorization?: DevelopmentAuthorization; developmentDelivery?: DevelopmentLedger; startedAt?: string; executionId?: string; completionAudits?: { activities: { activityId: string }[] }; settings?: { developmentDeployments?: DevelopmentSettings } }): void {
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
  const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
  const sha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
  const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && /(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value));
  const source = (value: unknown) => object(value) && text(value.path) && !value.path.startsWith("/") && !value.path.split(/[\\/]/).includes("..") && sha(value.revision);
  const require = (condition: unknown, message: string): void => { if (!condition) throw new Error(`Invalid schema-5 development state: ${message}`); };
  const candidates = record.settings?.developmentDeployments;
  if (candidates !== undefined) {
    require(object(candidates) && typeof candidates.enabled === "boolean" && Array.isArray(candidates.targets), "before-Start development settings");
    for (const candidate of candidates.targets) { require(object(candidate), "selected merge target"); normalizeMergeTarget(candidate.target); if (candidate.target.environment !== undefined) require(typeof candidate.confirmedNonProduction === "boolean", "legacy target confirmation"); if (candidate.confirmedTarget !== undefined) normalizeMergeTarget(candidate.confirmedTarget); }
  }
  const authority = record.developmentAuthorization; const state = record.developmentDelivery;
  require(object(authority) && Number.isSafeInteger(authority.revision) && authority.revision >= 0 && typeof authority.enabled === "boolean" && Array.isArray(authority.grants), "authorization");
  require(object(state) && Number.isSafeInteger(state.revision) && state.revision >= 0 && Array.isArray(state.assessments) && Array.isArray(state.checkpoints) && Array.isArray(state.splits) && Array.isArray(state.repositoryResults), "delivery ledger");
  if (!authority || !state) return; // The guards above always throw; narrows optional types.
  for (const grant of authority.grants) {
    require(object(grant) && timestamp(grant.confirmedAt) && ["start", "needs_you", "continuation"].includes(grant.source), "target grant"); normalizeMergeTarget(grant.target);
  }
  require(!authority.enabled || text(record.executionId) && authority.grants.length > 0, "enabled execution identity/grants");
  const validOwner = (value: unknown) => object(value) && (value.kind === "phase" && text(value.phaseId) && value.activityId === undefined || value.kind === "audit" && text(value.activityId) && value.phaseId === undefined && record.completionAudits?.activities.some(one => one.activityId === value.activityId));
  const owned = (value: DeliveryOwnership) => { try { return validOwner(deliveryOwner(value)); } catch { return false; } };
  if (authority.activationRecovery) {
    const recovery = authority.activationRecovery;
    require(authority.enabled && object(recovery) && owned({ owner: recovery.stoppedOwner, phaseId: recovery.stoppedPhaseId }) && texts(recovery.phaseIds) && texts(recovery.repositoryNames), "activation recovery scope");
    require(recovery.owners === undefined || Array.isArray(recovery.owners) && recovery.owners.length > 0 && recovery.owners.every(validOwner), "activation recovery owners");
    require(recoveryOwners(recovery).length > 0 && recoveryOwners(recovery).every(validOwner), "nonempty recovery scope");
  }
  const ids = new Set<string>();
  for (const checkpoint of state.checkpoints) {
    require(object(checkpoint), "checkpoint object");
    require(text(checkpoint.id) && !ids.has(checkpoint.id), "unique checkpoint identity"); ids.add(checkpoint.id);
    normalizeTarget(checkpoint.target);
    require(checkpoint.executionId === record.executionId && owned(checkpoint) && (deliveryOwner(checkpoint).kind !== "audit" || digest(checkpoint.requirementManifestDigest)) && text(checkpoint.featureBranch) && sha(checkpoint.headSha) && sha(checkpoint.baseSha) && texts(checkpoint.criteria) && checkpoint.criteria.length > 0 && texts(checkpoint.dependsOn) && source(checkpoint.workflowSource) && texts(checkpoint.requiredChecks) && typeof checkpoint.requireReview === "boolean" && timestamp(checkpoint.createdAt), `checkpoint ${checkpoint.id} identity/source/requirements`);
    require(Array.isArray(checkpoint.requirements) && checkpoint.requirements.length > 0 && Array.isArray(checkpoint.operations) && Array.isArray(checkpoint.evidence), `checkpoint ${checkpoint.id} collections`);
    const requirements = new Set<string>();
    for (const requirement of checkpoint.requirements) {
      require(object(requirement) && text(requirement.id) && !requirements.has(requirement.id) && ["pre_merge", "deployment", "verification", "current_artifact"].includes(requirement.purpose) && source(requirement.source) && object(requirement.match), "evidence requirement identity/source"); requirements.add(requirement.id);
      const match = requirement.match;
      if (match.kind === "command") require(text(match.invocation) && text(match.cwd) && object(match.fields) && Object.entries(match.fields).every(([key, value]) => key.startsWith("/") && ["string", "number", "boolean"].includes(typeof value)), "recorded command matcher");
      else if (match.kind === "github_workflow") require(text(match.path) && match.path.startsWith(".github/workflows/") && texts(match.jobs) && match.jobs.length > 0 && Number.isSafeInteger(match.attempt) && match.attempt > 0 && (requirement.purpose === "pre_merge" || text(match.deploymentJob)), "workflow/job matcher");
      else require(match.kind === "github_deployment" && ["deployment", "current_artifact"].includes(requirement.purpose), "deployment matcher purpose");
    }
    require(checkpoint.requirements.some(one => one.purpose === "deployment") && checkpoint.requirements.some(one => one.purpose === "verification"), "required deployment and verification evidence");
    const reference = (value: unknown) => object(value) && text(value.id) && text(value.requirementId) && requirements.has(value.requirementId) && value.kind === checkpoint.requirements.find(one => one.id === value.requirementId)?.match.kind && (value.kind !== "command" || text(value.sessionId));
    require(checkpoint.references === undefined || Array.isArray(checkpoint.references) && checkpoint.references.every(reference), "candidate evidence references");
    const operations = new Set<string>();
    for (const operation of checkpoint.operations) {
      require(object(operation) && text(operation.id) && !operations.has(operation.id) && ["merge", "deploy", "verify", "synchronize"].includes(operation.kind) && ["prepared", "observed", "unresolved", "failed"].includes(operation.state) && timestamp(operation.preparedAt) && Array.isArray(operation.references) && operation.references.every(reference), "operation identity/outcome/references"); operations.add(operation.id);
      require(operation.requirementIds === undefined || texts(operation.requirementIds) && operation.requirementIds.length > 0 && operation.requirementIds.every(id => id === "requiredMerge" || requirements.has(id)), "operation requirement scope");
      require(operation.sourceHead === undefined || sha(operation.sourceHead), "operation source revision"); require(operation.intendedBaseSha === undefined || sha(operation.intendedBaseSha), "operation base revision");
      require(operation.synchronized === undefined || object(operation.synchronized) && sha(operation.synchronized.featureHead) && sha(operation.synchronized.baseHead), "synchronization fact");
    }
    if (checkpoint.merge) require(object(checkpoint.merge) && Number.isSafeInteger(checkpoint.merge.number) && checkpoint.merge.number > 0 && text(checkpoint.merge.url) && checkpoint.merge.url.toLowerCase() === `https://${checkpoint.target.repository}/pull/${checkpoint.merge.number}`.toLowerCase() && checkpoint.merge.sourceHead === checkpoint.headSha && checkpoint.merge.mergedHead === checkpoint.headSha && sha(checkpoint.merge.resultSha) && text(checkpoint.merge.method) && timestamp(checkpoint.merge.mergedAt), "confirmed merge fact");
    const retained = [...(checkpoint.references ?? []), ...checkpoint.operations.flatMap(one => one.references)];
    require(checkpoint.evidenceHistory === undefined || Array.isArray(checkpoint.evidenceHistory), "evidence history");
    for (const fact of [...checkpoint.evidence, ...(checkpoint.evidenceHistory ?? [])]) require(object(fact) && requirements.has(fact.requirementId) && reference(fact.reference) && retained.some(one => one.requirementId === fact.reference.requirementId && one.id === fact.reference.id && one.kind === fact.reference.kind && one.sessionId === fact.reference.sessionId) && sha(fact.revision) && (fact.observedRevision === undefined || sha(fact.observedRevision)) && fact.environment === checkpoint.target.environment && ["success", "unresolved"].includes(fact.status) && timestamp(fact.observedAt) && timestamp(fact.occurredAt) && digest(fact.rawDigest) && text(fact.rawPath), "retained evidence fact and source reference");
  }
  for (const checkpoint of state.checkpoints) {
    require(checkpoint.dependsOn.every(id => ids.has(id) && id !== checkpoint.id), "checkpoint prerequisites");
    require(checkpoint.supersededBy === undefined || ids.has(checkpoint.supersededBy) && checkpoint.supersededBy !== checkpoint.id, "checkpoint replacement");
    for (const operation of checkpoint.operations) require(operation.restorationFor === undefined || operation.kind === "deploy" && ids.has(operation.restorationFor), "prerequisite restoration scope");
  }
  for (const assessment of state.assessments) require(object(assessment) && owned(assessment) && (deliveryOwner(assessment).kind !== "audit" || digest(assessment.requirementManifestDigest)) && digest(assessment.documentsDigest) && typeof assessment.required === "boolean" && texts(assessment.criteria) && text(assessment.reason) && texts(assessment.checkpointIds) && assessment.checkpointIds.every(id => ids.has(id)) && (!assessment.required || assessment.checkpointIds.length > 0), "phase delivery assessment");
  for (const split of state.splits) {
    require(object(split) && text(split.phaseId) && digest(split.documentsDigest) && Number.isSafeInteger(split.revision) && split.revision <= state.revision && Array.isArray(split.assignments), "split assignment digest/revision");
    for (const assignment of split.assignments) require(object(assignment) && ids.has(assignment.checkpointId) && text(assignment.requirementId) && owned({ owner: assignment.originOwner, phaseId: assignment.originPhaseId }) && texts(assignment.criteria) && assignment.criteria.length > 0 && texts(assignment.leafIds) && assignment.leafIds.length > 0, "split obligation assignment");
  }
  require(state.assignments === undefined || Array.isArray(state.assignments), "retained owner assignments");
  for (const assignment of state.assignments ?? []) {
    const checkpoint = state.checkpoints.find(one => one.id === assignment.checkpointId);
    require(object(assignment) && checkpoint && validOwner(assignment.owner) && text(assignment.requirementId) && (assignment.requirementId === "requiredMerge" || checkpoint.requirements.some(one => one.id === assignment.requirementId)) && texts(assignment.criteria) && assignment.criteria.length > 0 && assignment.criteria.every(one => checkpoint.criteria.includes(one)), "retained obligation owner/criterion");
  }
  require(state.currentComplete === undefined || typeof state.currentComplete === "boolean", "current completion result");
  for (const result of state.repositoryResults) require(object(result) && text(result.repository) && ["unchanged", "delivered", "review", "mixed", "unresolved"].includes(result.state) && texts(result.deliveredCheckpointIds) && result.deliveredCheckpointIds.every(id => ids.has(id)) && texts(result.reasons), "repository delivery result");
}

/** Every repository's current result, including retained merged PR links. */
export function developmentDeliverySummary(record: { developmentDelivery?: DevelopmentLedger }): string {
  const state = record.developmentDelivery;
  return state?.repositoryResults.map(result => {
    const delivered = result.deliveredCheckpointIds.flatMap(id => { const checkpoint = state.checkpoints.find(one => one.id === id); return checkpoint?.merge ? [`delivered ${checkpoint.merge.url} to ${checkpoint.target.environment}`] : []; });
    return [`${result.repository}: ${result.state}`, ...delivered, ...(result.reviewPullRequest ? [`review ${result.reviewPullRequest.url}`] : [])].join(" · ");
  }).join(" · ") || "Delivery evidence unresolved";
}
