/** Execution-scoped authority and retained delivery obligations (schema 5). */
export interface DevelopmentTarget { repository: string; baseBranch: string; environment: string }
export interface DevelopmentCandidate { target: DevelopmentTarget; confirmedNonProduction: boolean; confirmedTarget?: DevelopmentTarget }
export interface DevelopmentSettings { enabled: boolean; targets: DevelopmentCandidate[]; rememberForPrdRepository?: boolean; useSavedTargetsForThisPrd?: boolean; preferenceRevision?: number }
export interface DevelopmentAuthorization {
  revision: number; enabled: boolean;
  activationRecovery?: { stoppedPhaseId: string; phaseIds: string[]; repositoryNames: string[] };
  grants: { target: DevelopmentTarget; confirmedAt: string; source: "start" | "needs_you" }[];
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
  observedAt: string; occurredAt: string; status: "success" | "unresolved"; rawDigest: string; rawPath: string; startedAt?: string; deploymentJobUrl?: string; prerequisiteArtifacts?: { checkpointId: string; revision: string }[]; reason?: string;
}
export interface MergeFact { number: number; url: string; sourceHead: string; mergedHead: string; resultSha: string; method: string; mergedAt: string }
export interface DeliveryOperation {
  id: string; restorationFor?: string; requirementIds?: string[]; sourceHead?: string; intendedBaseSha?: string; kind: "merge" | "deploy" | "verify" | "synchronize"; preparedAt: string;
  state: "prepared" | "observed" | "unresolved" | "failed"; retryOf?: string; failureEvidencePath?: string; references: EvidenceReference[]; reason?: string;
  pullRequest?: number; synchronized?: { featureHead: string; baseHead: string };
}
export interface DeliveryCheckpoint {
  id: string; executionId: string; phaseId: string; target: DevelopmentTarget; featureBranch: string;
  headSha: string; baseSha: string; criteria: string[]; dependsOn: string[];
  workflowSource: { path: string; revision: string }; requirements: EvidenceRequirement[];
  requiredChecks: string[]; requireReview: boolean; createdAt: string;
  references?: EvidenceReference[]; operations: DeliveryOperation[]; merge?: MergeFact; evidence: EvidenceFact[]; evidenceHistory?: EvidenceFact[];
  observedActivity?: { kind: "Deploying" | "Verifying"; at: string }; mergeUnresolvedReason?: string; unresolvedRequirements?: Record<string, string>; verificationProbeAfter?: string; checkedAt?: string; unresolvedReason?: string; supersededBy?: string;
}
export interface DeliveryAssessment { phaseId: string; documentsDigest: string; required: boolean; criteria: string[]; reason: string; checkpointIds: string[] }
export interface SplitAssignment { checkpointId: string; requirementId: string; originPhaseId: string; criteria: string[]; leafIds: string[] }
export interface DeliverySplit { phaseId: string; documentsDigest: string; revision: number; assignments: SplitAssignment[] }
export interface RepositoryDeliveryResult {
  repository: string; state: "unchanged" | "delivered" | "review" | "mixed" | "unresolved";
  deliveredCheckpointIds: string[]; remainingHeadSha?: string; reviewPullRequest?: { number: number; url: string }; reasons: string[];
}
export interface DevelopmentLedger {
  revision: number; assessments: DeliveryAssessment[]; checkpoints: DeliveryCheckpoint[]; splits: DeliverySplit[];
  sourceUnavailable?: boolean; lastReadError?: string; checkedAt?: string; repositoryResults: RepositoryDeliveryResult[]; currentComplete?: boolean;
}
export const restrictedAuthorization = (): DevelopmentAuthorization => ({ revision: 0, enabled: false, grants: [] });
export const emptyDevelopmentLedger = (): DevelopmentLedger => ({ revision: 0, assessments: [], checkpoints: [], splits: [], repositoryResults: [] });
export function targetKey(target: DevelopmentTarget): string { return JSON.stringify([target.repository.toLowerCase(), target.baseBranch, target.environment.trim()]); }
export function normalizeTarget(value: unknown): DevelopmentTarget {
  if (!value || typeof value !== "object") throw new Error("Name a repository, base branch and development environment.");
  const target = value as DevelopmentTarget;
  if (typeof target.repository !== "string" || !/^github\.com\/[\w.-]+\/[\w.-]+$/i.test(target.repository) || typeof target.baseBranch !== "string" || !target.baseBranch.trim() || typeof target.environment !== "string" || !target.environment.trim()) throw new Error("Name a concrete GitHub repository, base branch and development environment.");
  return { repository: target.repository.toLowerCase(), baseBranch: target.baseBranch, environment: target.environment.trim() };
}

/** Reject damaged schema-5 state rather than substituting a history with no obligations. */
export function assertDevelopmentState(record: { developmentAuthorization?: DevelopmentAuthorization; developmentDelivery?: DevelopmentLedger; startedAt?: string; executionId?: string; settings?: { developmentDeployments?: DevelopmentSettings } }): void {
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
    require([candidates.rememberForPrdRepository, candidates.useSavedTargetsForThisPrd].every(value => value === undefined || typeof value === "boolean") && (candidates.preferenceRevision === undefined || Number.isSafeInteger(candidates.preferenceRevision) && candidates.preferenceRevision >= 0), "preference choice/revision");
    for (const candidate of candidates.targets) { require(object(candidate) && typeof candidate.confirmedNonProduction === "boolean", "candidate target confirmation"); normalizeTarget(candidate.target); if (candidate.confirmedTarget !== undefined) normalizeTarget(candidate.confirmedTarget); }
  }
  const authority = record.developmentAuthorization; const state = record.developmentDelivery;
  require(object(authority) && Number.isSafeInteger(authority.revision) && authority.revision >= 0 && typeof authority.enabled === "boolean" && Array.isArray(authority.grants), "authorization");
  require(object(state) && Number.isSafeInteger(state.revision) && state.revision >= 0 && Array.isArray(state.assessments) && Array.isArray(state.checkpoints) && Array.isArray(state.splits) && Array.isArray(state.repositoryResults), "delivery ledger");
  if (!authority || !state) return; // The guards above always throw; narrows optional types.
  for (const grant of authority.grants) {
    require(object(grant) && timestamp(grant.confirmedAt) && ["start", "needs_you"].includes(grant.source), "target grant"); normalizeTarget(grant.target);
  }
  require(!authority.enabled || text(record.executionId) && authority.grants.length > 0, "enabled execution identity/grants");
  if (authority.activationRecovery) require(authority.enabled && object(authority.activationRecovery) && text(authority.activationRecovery.stoppedPhaseId) && texts(authority.activationRecovery.phaseIds) && authority.activationRecovery.phaseIds.length > 0 && texts(authority.activationRecovery.repositoryNames), "activation recovery scope");
  const ids = new Set<string>();
  for (const checkpoint of state.checkpoints) {
    require(object(checkpoint), "checkpoint object");
    require(text(checkpoint.id) && !ids.has(checkpoint.id), "unique checkpoint identity"); ids.add(checkpoint.id);
    normalizeTarget(checkpoint.target);
    require(checkpoint.executionId === record.executionId && text(checkpoint.phaseId) && text(checkpoint.featureBranch) && sha(checkpoint.headSha) && sha(checkpoint.baseSha) && texts(checkpoint.criteria) && checkpoint.criteria.length > 0 && texts(checkpoint.dependsOn) && source(checkpoint.workflowSource) && texts(checkpoint.requiredChecks) && typeof checkpoint.requireReview === "boolean" && timestamp(checkpoint.createdAt), `checkpoint ${checkpoint.id} identity/source/requirements`);
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
    for (const fact of [...checkpoint.evidence, ...(checkpoint.evidenceHistory ?? [])]) require(object(fact) && requirements.has(fact.requirementId) && reference(fact.reference) && retained.some(one => one.requirementId === fact.reference.requirementId && one.id === fact.reference.id && one.kind === fact.reference.kind && one.sessionId === fact.reference.sessionId) && sha(fact.revision) && fact.environment === checkpoint.target.environment && ["success", "unresolved"].includes(fact.status) && timestamp(fact.observedAt) && timestamp(fact.occurredAt) && digest(fact.rawDigest) && text(fact.rawPath), "retained evidence fact and source reference");
  }
  for (const checkpoint of state.checkpoints) {
    require(checkpoint.dependsOn.every(id => ids.has(id) && id !== checkpoint.id), "checkpoint prerequisites");
    require(checkpoint.supersededBy === undefined || ids.has(checkpoint.supersededBy) && checkpoint.supersededBy !== checkpoint.id, "checkpoint replacement");
    for (const operation of checkpoint.operations) require(operation.restorationFor === undefined || operation.kind === "deploy" && ids.has(operation.restorationFor), "prerequisite restoration scope");
  }
  for (const assessment of state.assessments) require(object(assessment) && text(assessment.phaseId) && digest(assessment.documentsDigest) && typeof assessment.required === "boolean" && texts(assessment.criteria) && text(assessment.reason) && texts(assessment.checkpointIds) && assessment.checkpointIds.every(id => ids.has(id)) && (!assessment.required || assessment.checkpointIds.length > 0), "phase delivery assessment");
  for (const split of state.splits) {
    require(object(split) && text(split.phaseId) && digest(split.documentsDigest) && Number.isSafeInteger(split.revision) && split.revision <= state.revision && Array.isArray(split.assignments), "split assignment digest/revision");
    for (const assignment of split.assignments) require(object(assignment) && ids.has(assignment.checkpointId) && text(assignment.requirementId) && text(assignment.originPhaseId) && texts(assignment.criteria) && assignment.criteria.length > 0 && texts(assignment.leafIds) && assignment.leafIds.length > 0, "split obligation assignment");
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
