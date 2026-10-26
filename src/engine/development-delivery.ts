import { contextOwner, auditDeliveryScope, activeRecoveryOwner, assignedObligations, assignedObligationCriteria } from "./development-owners.js";
import { simpleCommands } from "../session/bash-command.js";
/** The delivery ledger is evidence, never a remote command runner. All remote reads are bounded. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { runHelper } from "../platform/helper-process.js";
import { writeJsonAtomically } from "../state/state-files.js";
import type { PrdRecord, RepositoryEntry, CheckResult } from "../state/records.js";
import { emptyDevelopmentLedger, normalizeTarget, normalizeMergeTarget, authorizationTargetKey, permitsTarget, targetKey, type CommandEvidence, type DevelopmentLedger, type DeliveryCheckpoint, type DeliveryAssessment, type DeliverySplit, type EvidenceReference, type EvidenceRequirement, type EvidenceFact, type DeliveryOwner, deliveryOwner, sameOwner, ownerKey, ownerFields } from "../state/development-delivery.js";
import { runGit, type GitContext } from "./git-reads.js";
import { readPlanAt } from "./plan-reading.js";
import { isAncestorOf } from "../plan/phase-ids.js";

export class DeliveryRefusal extends Error { constructor(message: string, readonly status: 400 | 409 | 422 = 409) { super(message); } }
class ObservedOperationFailure extends DeliveryRefusal { constructor(message: string, readonly rawPath: string) { super(message); } }
export interface DeliveryContext {
  record: PrdRecord; stateDirectory: string; prdWorktree: string; prdDirectory: string;
  git: GitContext; gh: string; env: NodeJS.ProcessEnv; phaseId?: string; owner?: DeliveryOwner;
  commands(sessionId: string, signal?: AbortSignal): Promise<CommandEvidence[]>; now(): string; signal?: AbortSignal;
}
function sourceUnavailable(error: unknown): boolean { return /unavailable|deadline|timeout|timed out|aborted|malformed|unreadable|incomplete github|pagination/i.test((error as Error).message); }
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40,64}$/.test(value);
function need(condition: unknown, message: string, status: 400 | 409 | 422 = 409): asserts condition { if (!condition) throw new DeliveryRefusal(message, status); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(one => typeof one === "string" && one.length > 0); }
export function ledger(record: PrdRecord): DevelopmentLedger { return record.developmentDelivery ??= emptyDevelopmentLedger(); }
export function deliveryEnabled(record: PrdRecord): boolean { return record.developmentAuthorization?.enabled === true; }
export function validateStartTargets(record: PrdRecord, repositories: { github: string; baseBranch: string }[]): void {
  const settings = record.settings.developmentDeployments;
  if (!settings?.enabled) return;
  need(settings.targets.length > 0, "Select at least one repository branch for early merges.", 422);
  const seen = new Set<string>();
  for (const candidate of settings.targets) {
    const target = normalizeMergeTarget(candidate.target);
    if (target.environment !== undefined) need(candidate.confirmedNonProduction === true && candidate.confirmedTarget && authorizationTargetKey(normalizeMergeTarget(candidate.confirmedTarget)) === authorizationTargetKey(target), "Reselect the repository branch to replace this unconfirmed legacy target.", 422);
    need(repositories.some(repo => target.repository === `github.com/${repo.github}`.toLowerCase() && repo.baseBranch === target.baseBranch), `The development target ${target.repository} / ${target.baseBranch} no longer matches a participating repository.`, 422);
    need(!seen.has(authorizationTargetKey(target)), "Duplicate development target.", 422); seen.add(authorizationTargetKey(target));
  }
}
function mechanical(text: string): string { return text.replace(/^\*\*Closed:\*\*[^\n]*\n?/gm, "").replace(/^(\s*- )\[[ xX]\](\s+)/gm, "$1[ ]$2"); }
export function documentsDigest(context: Pick<DeliveryContext, "prdWorktree" | "prdDirectory">, phaseId: string): string {
  const plan = readPlanAt(context.prdWorktree, context.prdDirectory);
  need(plan.ok, plan.ok ? "" : plan.problem);
  const phase = plan.plan.phases.find(one => one.id === phaseId); need(phase, `Phase ${phaseId} is not in the current plan.`);
  const directory = join(context.prdWorktree, context.prdDirectory);
  const files = readdirSync(directory).filter(file => file.endsWith("-prd.md") || /(?:^|-)technical-design\.md$/.test(file));
  need(files.some(file => file.endsWith("-prd.md")) && files.some(file => /(?:^|-)technical-design\.md$/.test(file)), "The governing PRD and technical design must be readable.");
  return hash([...new Set([...files, phase.fileName])].sort().map(file => [file, mechanical(readFileSync(join(directory, file), "utf8"))]));
}
function repository(context: DeliveryContext, checkpoint: DeliveryCheckpoint): RepositoryEntry {
  const entry = context.record.repositories.find(repo => `github.com/${repo.github}`.toLowerCase() === checkpoint.target.repository && repo.baseBranch === checkpoint.target.baseBranch && repo.setupCompletedAt);
  need(entry, `Missing assigned repository for ${checkpoint.target.repository} / ${checkpoint.target.baseBranch}.`); return entry;
}
function granted(context: DeliveryContext, checkpoint: DeliveryCheckpoint): void {
  need(deliveryEnabled(context.record) && context.record.developmentAuthorization!.grants.some(grant => permitsTarget(grant.target, checkpoint.target)), `Authorize early merges into ${checkpoint.target.repository} / ${checkpoint.target.baseBranch}.`);
}
async function git(context: DeliveryContext, repo: RepositoryEntry, args: string[]): Promise<string> {
  const answer = await runGit(context.git, repo.worktreePath, args);
  need(answer.exitCode === 0, `Git evidence unavailable in ${repo.name}: ${answer.stderr.trim() || answer.stdout.trim()}`); return answer.stdout.trim();
}
async function ancestor(context: DeliveryContext, repo: RepositoryEntry, a: string, b: string): Promise<boolean> {
  const answer = await runGit(context.git, repo.worktreePath, ["merge-base", "--is-ancestor", a, b]);
  need(answer.exitCode === 0 || answer.exitCode === 1, `Could not establish source coverage in ${repo.name}.`); return answer.exitCode === 0;
}
async function source(context: DeliveryContext, repo: RepositoryEntry, path: string, revision: string): Promise<string> {
  need(sha(revision) && typeof path === "string" && path.length > 0 && !isAbsolute(path) && !path.split(/[\\/]/).includes(".."), "Workflow evidence needs a repository-relative source path and immutable revision.", 422);
  return git(context, repo, ["show", `${revision}:${path}`]);
}
function currentLeaves(context: DeliveryContext) {
  const plan = readPlanAt(context.prdWorktree, context.prdDirectory); need(plan.ok, plan.ok ? "" : plan.problem); return plan.plan.phases.filter(phase => !phase.splitInto);
}
export function ownerDocuments(context: DeliveryContext, owner: DeliveryOwner): { documentsDigest: string; requirementManifestDigest?: string } {
  if (owner.kind === "phase") return { documentsDigest: documentsDigest(context, owner.phaseId) };
  const binding = auditDeliveryScope(context, owner);
  return { documentsDigest: binding.documentsDigest, requirementManifestDigest: binding.requirementManifestDigest };
}
function recoveryOwner(context: DeliveryContext): DeliveryOwner | undefined {
  return activeRecoveryOwner(context, owner => ownerDeliveryCheck(context, owner).passed);
}
function activationLeaf(context: DeliveryContext): string | undefined {
  const owner = recoveryOwner(context); return owner?.kind === "phase" ? owner.phaseId : undefined;
}
function scope(context: DeliveryContext, owner: DeliveryOwner): void {
  const recovering = recoveryOwner(context);
  if (recovering) { need(ownerKey(recovering) === ownerKey(owner), `Activation recovery must assess unresolved ${recovering.kind === "phase" ? `leaf ${recovering.phaseId}` : `audit ${recovering.activityId}`} before later or future work.`); return; }
  const active = contextOwner(context);
  need(active, "Delivery changes require the running or stopped activity.");
  if (active.kind === "audit") {
    const assigned = context.record.completionAudits?.activities.at(-1);
    need(assigned?.activityId === active.activityId && !assigned.acceptedResult && ownerKey(active) === ownerKey(owner), "Only the current unfinished audit may record delivery.");
    return;
  }
  need(active.phaseId !== "pr" && owner.kind === "phase", "Delivery changes require the running or stopped implementation leaf.");
  const judged = currentLeaves(context).find(leaf => leaf.id === active.phaseId || isAncestorOf(active.phaseId, leaf.id));
  need(judged?.id === owner.phaseId, `Only the current judged leaf ${judged?.id ?? active.phaseId} may record delivery.`);
}
function operationOwner(context: DeliveryContext): DeliveryOwner | undefined {
  const recovering = recoveryOwner(context); if (recovering) return recovering;
  const active = contextOwner(context);
  if (active?.kind !== "phase" || active.phaseId === "pr") return active;
  const leaf = currentLeaves(context).find(one => one.id === active.phaseId || isAncestorOf(active.phaseId, one.id));
  return leaf ? { kind: "phase", phaseId: leaf.id } : undefined;
}
function checkpointScope(context: DeliveryContext, checkpoint: DeliveryCheckpoint, requirementIds: string[]): void {
  const owner = operationOwner(context); need(owner, "No active delivery owner.");
  const recovering = recoveryOwner(context);
  if (recovering) need(context.record.developmentAuthorization!.activationRecovery!.repositoryNames.includes(repository(context, checkpoint).name), "Activation recovery cannot add a repository.");
  if (owner.kind === "phase" && owner.phaseId === "pr" && !recovering) { need(currentLeaves(context).every(one => one.closed), "Finalization cannot prepare future phase work."); return; }
  scope(context, owner);
  validateSplits(context);
  need(requirementIds.every(id => assignedObligations(ledger(context.record), checkpoint, owner).includes(id)), "This operation's obligations are not assigned to the current recovery leaf or audit.");
}
function failure(context: DeliveryContext, raw: unknown, message: string): never {
  const rawPath = join(context.stateDirectory, "delivery-evidence", `${hash(raw)}.json`); writeJsonAtomically(rawPath, raw); throw new ObservedOperationFailure(message, rawPath);
}
function directInvocation(invocation: string): string[] {
  need(!/[\r\n<>`]|\$\(/.test(invocation), "Evidence must be a direct invocation without redirection, heredocs, substitutions or embedded scripts.", 422);
  const commands = simpleCommands(invocation); const words = commands[0] ?? [];
  const executable = basename(words[0] ?? "").toLowerCase().replace(/\.exe$/, "");
  need(commands.length === 1 && words.length > 0 && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!) && !["echo", "printf", "cat", "true", "false", "env", "sh", "bash", "zsh", "pwsh", "powershell", "cmd", "command", "builtin", "eval", "exec", "busybox", "jq", "awk", "sed", "tee", "head", "tail", "cut", "paste", "sort", "tr"].includes(executable), "Evidence needs the direct documented operation/probe, not a print command, shell wrapper or extraction expression.", 422);
  need(!/^(?:node|nodejs|python(?:[0-9.]+)?|perl|ruby|php|rscript)$/.test(executable) || !words.slice(1).some(word => /^(?:-[epcr]|--(?:eval|print|command)(?:=|$))/.test(word)), "Inline print/evaluation expressions are not delivery evidence.", 422);
  if (executable === "gh") need(!words.some(word => ["--jq", "--template", "-q", "-t"].includes(word)), "Provider evidence cannot be manufactured by an extraction expression.", 422);
  return words;
}
function argumentBound(words: string[], value: string): boolean { return words.some(word => word === value || word.endsWith(`=${value}`)); }
function requirementsValid(checkpoint: DeliveryCheckpoint): void {
  need(Array.isArray(checkpoint.requirements) && checkpoint.requirements.length > 0, "A checkpoint must declare its required workflow evidence.", 422);
  const ids = new Set<string>();
  for (const requirement of checkpoint.requirements) {
    need(requirement && typeof requirement.id === "string" && requirement.id && !ids.has(requirement.id), "Evidence requirements need unique IDs.", 422); ids.add(requirement.id);
    need(["pre_merge", "deployment", "verification", "current_artifact"].includes(requirement.purpose) && requirement.source && requirement.match, "Incomplete evidence requirement.", 422);
    const match = requirement.match;
    if (match.kind === "command") {
      need(typeof match.invocation === "string" && match.invocation.trim() && typeof match.cwd === "string" && isAbsolute(match.cwd) && match.fields && typeof match.fields === "object" && !Array.isArray(match.fields), "Command evidence needs an exact invocation, directory and typed field bindings.", 422);
      const words = directInvocation(match.invocation);
      for (const [pointer, value] of Object.entries(match.fields)) need(pointer.startsWith("/") && ["string", "number", "boolean"].includes(typeof value), "Evidence fields use JSON Pointer paths and exact scalar values.", 422);
      if (requirement.purpose === "pre_merge") need(argumentBound(words, checkpoint.headSha) || argumentBound(words, "{{sourceRevision}}") || Object.values(match.fields).some(value => value === checkpoint.headSha || value === "$sourceRevision"), "Pre-merge command evidence must bind the exact tested source revision.", 422);
      if (requirement.purpose !== "pre_merge") need(argumentBound(words, checkpoint.target.environment) || argumentBound(words, "{{environment}}") || Object.values(match.fields).some(value => value === checkpoint.target.environment || value === "$environment"), "Command evidence must bind the approved environment.", 422);
    } else if (match.kind === "github_workflow") need(typeof match.path === "string" && match.path.startsWith(".github/workflows/") && strings(match.jobs) && match.jobs.length && Number.isSafeInteger(match.attempt) && match.attempt > 0, "Workflow evidence needs its path, exact attempt and required jobs.", 422);
    else need(match.kind === "github_deployment" && ["deployment", "current_artifact"].includes(requirement.purpose), "A deployment status cannot prove a pre-merge test or required verification.", 422);
    if (match.kind === "github_workflow" && requirement.purpose !== "pre_merge") need(typeof match.deploymentJob === "string" && match.deploymentJob, "Workflow evidence must name the actual deployment job linking it to the approved environment.", 422);
  }
  for (const purpose of ["deployment", "verification"] as const) need(checkpoint.requirements.some(one => one.purpose === purpose), `Declare required ${purpose} evidence.`, 422);
}
export async function recordAssessment(context: DeliveryContext, body: Record<string, unknown>): Promise<void> {
  const assessment = body as unknown as DeliveryAssessment & { checkpoints?: DeliveryCheckpoint[]; split?: DeliverySplit; splits?: DeliverySplit[] };
  let owner: DeliveryOwner;
  try { owner = deliveryOwner(assessment); } catch { throw new DeliveryRefusal("Name the assessed phase or audit owner.", 400); }
  scope(context, owner);
  const binding = ownerDocuments(context, owner);
  need(assessment.documentsDigest === binding.documentsDigest && assessment.requirementManifestDigest === binding.requirementManifestDigest, "The governing documents or audit manifest changed; assess the current digest.");
  need(typeof assessment.required === "boolean" && strings(assessment.criteria) && typeof assessment.reason === "string" && assessment.reason.trim(), "Assessment needs required, criterion labels and a reason.", 400);
  if (owner.kind === "audit") {
    const keys = auditDeliveryScope(context, owner).manifest.criteria.map(one => one.key);
    need(new Set(assessment.criteria).size === keys.length && assessment.criteria.length === keys.length && assessment.criteria.every(key => keys.includes(key)), "Audit development assessment must account for every exact criterion key in its requirement manifest.", 422);
  }
  const state = ledger(context.record); const ids: string[] = [];
  for (const candidate of assessment.checkpoints ?? []) {
    need(candidate && typeof candidate.id === "string" && candidate.id && candidate.executionId === context.record.executionId && sameOwner(candidate, { owner }) && candidate.requirementManifestDigest === binding.requirementManifestDigest && candidate.featureBranch === context.record.settings.featureBranch && sha(candidate.headSha) && sha(candidate.baseSha) && strings(candidate.criteria) && candidate.criteria.length && strings(candidate.dependsOn) && strings(candidate.requiredChecks) && typeof candidate.requireReview === "boolean", "Incomplete checkpoint identity or required checks.", 422);
    const target = normalizeTarget(candidate.target);
    const checkpoint: DeliveryCheckpoint = { id: candidate.id, executionId: candidate.executionId, ...ownerFields(owner), ...(binding.requirementManifestDigest ? { requirementManifestDigest: binding.requirementManifestDigest } : {}), target, featureBranch: candidate.featureBranch, headSha: candidate.headSha, baseSha: candidate.baseSha, criteria: candidate.criteria, dependsOn: candidate.dependsOn, workflowSource: candidate.workflowSource, requirements: candidate.requirements, requiredChecks: candidate.requiredChecks, requireReview: candidate.requireReview, operations: [], evidence: [], createdAt: context.now(), ...(candidate.references ? { references: candidate.references } : {}) };
    requirementsValid(checkpoint);
    if (checkpoint.references) need(Array.isArray(checkpoint.references) && checkpoint.references.every(ref => ref && typeof ref.id === "string" && ref.id && checkpoint.requirements.some(one => one.id === ref.requirementId && one.purpose === "pre_merge")), "Initial references may identify only pre-merge evidence.", 422);
    const repo = repository(context, checkpoint);
    need(await git(context, repo, ["symbolic-ref", "--short", "HEAD"]) === checkpoint.featureBranch && await git(context, repo, ["rev-parse", "HEAD"]) === checkpoint.headSha, "Checkpoint must identify the assigned branch's current head.");
    need(await ancestor(context, repo, checkpoint.baseSha, checkpoint.headSha), "Checkpoint base is not contained in its source work.");
    need(checkpoint.workflowSource, "Name the documented delivery workflow.", 422); await source(context, repo, checkpoint.workflowSource.path, checkpoint.workflowSource.revision);
    for (const requirement of checkpoint.requirements) {
      const text = await source(context, repo, requirement.source.path, requirement.source.revision);
      if (requirement.match.kind === "command") need(text.includes(requirement.match.invocation), `The versioned source does not document ${requirement.id}'s exact invocation.`, 422);
      if (requirement.match.kind === "github_workflow") need((requirement.source.path === requirement.match.path || text.includes(requirement.match.path)) && requirement.match.jobs.every(job => text.includes(job)), `The versioned source does not map ${requirement.id}'s workflow and required jobs.`, 422);
    }
    const existing = state.checkpoints.find(one => one.id === checkpoint.id);
    if (existing) {
      const identity = (one: DeliveryCheckpoint) => ({ target: one.target, executionId: one.executionId, owner: deliveryOwner(one), requirementManifestDigest: one.requirementManifestDigest, featureBranch: one.featureBranch, headSha: one.headSha, baseSha: one.baseSha, criteria: one.criteria, dependsOn: one.dependsOn, requirements: one.requirements, workflowSource: one.workflowSource, requiredChecks: one.requiredChecks, requireReview: one.requireReview });
      need(hash(identity(existing)) === hash(identity(checkpoint)), "A checkpoint identity is immutable; record a new checkpoint for changed work.");
      for (const reference of checkpoint.references ?? []) if (!(existing.references ??= []).some(one => hash(one) === hash(reference))) existing.references.push(reference);
    } else {
      const replaces = (candidate as DeliveryCheckpoint & { replaces?: string }).replaces;
      if (replaces) {
        const prior = state.checkpoints.find(one => one.id === replaces);
        const replacingOwner = operationOwner(context);
        need(prior && replacingOwner && ["requiredMerge", ...prior.requirements.map(one => one.id)].every(id => prior.criteria.every(criterion => assignedObligationCriteria(state, prior, replacingOwner, id).includes(criterion))), "Replacing a checkpoint requires all retained merge/evidence obligations and criteria to be assigned to the current owner.", 422);
        need(prior && prior.headSha !== checkpoint.headSha && !prior.supersededBy && targetKey(prior.target) === targetKey(checkpoint.target) && prior.criteria.every(criterion => checkpoint.criteria.includes(criterion)) && prior.dependsOn.every(id => checkpoint.dependsOn.includes(id)) && prior.requiredChecks.every(check => checkpoint.requiredChecks.includes(check)) && (!prior.requireReview || checkpoint.requireReview) && prior.requirements.every(requirement => checkpoint.requirements.some(one => one.id === requirement.id && one.purpose === requirement.purpose && one.source.path === requirement.source.path && hash(one.match) === hash(requirement.match))) && await ancestor(context, repo, prior.headSha, checkpoint.headSha), "Replacement must retain the earlier source work, target, criteria, requirements and prerequisites.", 422);
        prior.supersededBy = checkpoint.id;
      }
      state.checkpoints.push(checkpoint);
    }
    const document = readdirSync(join(context.prdWorktree, context.prdDirectory)).filter(file => file.endsWith("-prd.md")).map(file => readFileSync(join(context.prdWorktree, context.prdDirectory, file), "utf8")).join("\n");
    need(checkpoint.criteria.every(criterion => assessment.criteria.includes(criterion) && (owner.kind === "audit" ? auditDeliveryScope(context, owner).manifest.criteria.some(one => one.key === criterion) : document.includes(criterion) || (state.assignments ?? []).some(one => one.owner.kind === "phase" && one.owner.phaseId === owner.phaseId && one.criteria.includes(criterion) && document.includes(criterion.slice(criterion.lastIndexOf("#") + 1))))), "A checkpoint must identify governing PRD criteria from its assessment.", 422);
    ids.push(checkpoint.id);
  }
  const old = state.assessments.find(one => sameOwner(one, { owner }));
  const retained = [...new Set([...(old?.checkpointIds ?? []), ...ids])];
  need(!assessment.required || retained.length > 0, "Required development delivery needs a checkpoint.", 422);
  const saved: DeliveryAssessment = { ...ownerFields(owner), ...(binding.requirementManifestDigest ? { requirementManifestDigest: binding.requirementManifestDigest } : {}), documentsDigest: assessment.documentsDigest, required: assessment.required || retained.length > 0, criteria: assessment.criteria, reason: assessment.reason.trim(), checkpointIds: retained };
  state.assessments = [...state.assessments.filter(one => !sameOwner(one, saved)), saved];
  for (const checkpoint of state.checkpoints) for (const dependency of checkpoint.dependsOn) need(dependency !== checkpoint.id && state.checkpoints.some(one => one.id === dependency), `Unknown prerequisite ${dependency}.`, 422);
  const leaves = currentLeaves(context);
  const phaseIndex = (id: string) => leaves.findIndex(leaf => leaf.id === id || isAncestorOf(id, leaf.id));
  for (const checkpoint of state.checkpoints) for (const id of checkpoint.dependsOn) {
    const prior = deliveryOwner(state.checkpoints.find(one => one.id === id)!); const next = deliveryOwner(checkpoint);
    if (prior.kind === "phase" && next.kind === "phase") need(phaseIndex(prior.phaseId) <= phaseIndex(next.phaseId), "A delivery prerequisite cannot belong to a future phase.", 422);
    if (prior.kind === "audit" && next.kind === "audit") {
      const activities = context.record.completionAudits?.activities ?? [];
      need(activities.findIndex(one => one.activityId === prior.activityId) <= activities.findIndex(one => one.activityId === next.activityId), "A delivery prerequisite cannot belong to a future audit.", 422);
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const walk = (id: string) => { need(!visiting.has(id), "Delivery dependency cycle.", 422); if (visited.has(id)) return; visiting.add(id); for (const dep of state.checkpoints.find(one => one.id === id)!.dependsOn) walk(dep); visiting.delete(id); visited.add(id); };
  for (const checkpoint of state.checkpoints) walk(checkpoint.id);
  const splits = [...(assessment.split ? [assessment.split] : []), ...(assessment.splits ?? [])];
  for (const split of splits) { need(typeof split.phaseId === "string" && (split.phaseId === context.phaseId || owner.kind === "phase" && isAncestorOf(split.phaseId, owner.phaseId)) && split.documentsDigest === documentsDigest(context, split.phaseId) && Array.isArray(split.assignments), "Invalid or stale split assignment.");
    state.splits = [...state.splits.filter(one => one.phaseId !== split.phaseId), { ...split, revision: state.revision + 1 }];
  }
  if (splits.length) validateSplits(context);
}
export function validateSplits(context: DeliveryContext): void {
  const leaves = currentLeaves(context); const state = ledger(context.record);
  const plan = readPlanAt(context.prdWorktree, context.prdDirectory); need(plan.ok, plan.ok ? "" : plan.problem);
  for (const checkpoint of state.checkpoints) {
    const origin = deliveryOwner(checkpoint);
    const roots = [...new Set([...(origin.kind === "phase" ? [origin.phaseId] : []), ...(state.assignments ?? []).filter(one => one.checkpointId === checkpoint.id && one.owner.kind === "phase").map(one => (one.owner as { kind: "phase"; phaseId: string }).phaseId)])];
    for (const root of roots) {
      const phase = plan.plan.phases.find(one => one.id === root); need(phase, `Checkpoint ${checkpoint.id} lost its originating or assigned phase ${root}.`);
      if (!phase.splitInto) continue;
      for (const parent of plan.plan.phases.filter(one => one.splitInto && (one.id === root || isAncestorOf(root, one.id)))) {
        const split = state.splits.find(one => one.phaseId === parent.id);
        const inherited = parent.id === root ? assignedObligations(state, checkpoint, { kind: "phase", phaseId: root }).map(requirementId => ({ requirementId, criteria: origin.kind === "phase" && origin.phaseId === root ? checkpoint.criteria : (state.assignments ?? []).filter(one => one.checkpointId === checkpoint.id && one.requirementId === requirementId && one.owner.kind === "phase" && one.owner.phaseId === root).flatMap(one => one.criteria) })) : state.splits.flatMap(ancestor => isAncestorOf(ancestor.phaseId, parent.id) ? ancestor.assignments.filter(one => one.checkpointId === checkpoint.id && one.leafIds.some(id => isAncestorOf(parent.id, id))) : []);
        if (!inherited.length) continue;
        need(split && split.documentsDigest === documentsDigest(context, parent.id), `Assign the retained obligations of checkpoint ${checkpoint.id} across the current split ${parent.id}.`);
        const obligations = new Map<string, Set<string>>();
        for (const obligation of inherited) { const criteria = obligations.get(obligation.requirementId) ?? new Set<string>(); for (const criterion of obligation.criteria) criteria.add(criterion); obligations.set(obligation.requirementId, criteria); }
        for (const [requirementId, inheritedCriteria] of obligations) {
          const assignments = split.assignments.filter(one => one.checkpointId === checkpoint.id && one.requirementId === requirementId);
          need(assignments.length > 0, `Split ${parent.id} omitted ${checkpoint.id}/${requirementId}.`);
          for (const assignment of assignments) need(sameOwner({ owner: assignment.originOwner, phaseId: assignment.originPhaseId }, checkpoint) && strings(assignment.criteria) && assignment.criteria.length && assignment.criteria.every(criterion => inheritedCriteria.has(criterion)) && strings(assignment.leafIds) && assignment.leafIds.length && assignment.leafIds.every(id => leaves.some(leaf => leaf.id === id && isAncestorOf(parent.id, id))), `Split ${parent.id} has an invalid descendant or criterion assignment.`);
          need([...inheritedCriteria].every(criterion => assignments.some(one => one.criteria.includes(criterion))), `Split ${parent.id} lost original criterion coverage for ${requirementId}.`);
        }
      }
    }
  }
  for (const ancestor of state.splits) for (const child of state.splits.filter(one => isAncestorOf(ancestor.phaseId, one.phaseId))) {
    const obligations = new Set([...ancestor.assignments, ...child.assignments].map(one => `${one.checkpointId}/${one.requirementId}`));
    for (const obligation of obligations) {
      const entries = (split: DeliverySplit) => split.assignments.filter(one => `${one.checkpointId}/${one.requirementId}` === obligation).flatMap(one => one.leafIds.filter(id => isAncestorOf(child.phaseId, id)).map(id => [id, [...one.criteria].sort()]));
      const canonical = (split: DeliverySplit) => JSON.stringify(entries(split).map(one => JSON.stringify(one)).sort());
      need(canonical(ancestor) === canonical(child), `Split ${child.phaseId} contradicts ${ancestor.phaseId}'s inherited obligation ${obligation}.`);
    }
  }
  const firstAssigned = (checkpoint: DeliveryCheckpoint, requirementId: string) => {
    const assigned = state.splits.flatMap(split => split.assignments.filter(one => one.checkpointId === checkpoint.id && one.requirementId === requirementId).flatMap(one => one.leafIds));
    const indexes = assigned.map(id => leaves.findIndex(leaf => leaf.id === id)).filter(index => index >= 0);
    if (indexes.length) return Math.min(...indexes);
    const retained = (state.assignments ?? []).filter(one => one.checkpointId === checkpoint.id && one.requirementId === requirementId && one.owner.kind === "phase").flatMap(one => one.owner.kind === "phase" ? [one.owner.phaseId] : []).map(id => leaves.findIndex(leaf => leaf.id === id)).filter(index => index >= 0);
    return retained.length ? Math.min(...retained) : leaves.findIndex(leaf => leaf.id === checkpoint.phaseId);
  };
  for (const checkpoint of state.checkpoints) {
    const merge = firstAssigned(checkpoint, "requiredMerge");
    for (const id of checkpoint.dependsOn) {
      const prerequisite = effectiveCheckpoint(state, id); need(prerequisite, `Unknown prerequisite ${id}.`);
      const prerequisiteFinish = Math.max(firstAssigned(prerequisite, "requiredMerge"), ...prerequisite.requirements.filter(one => one.purpose !== "current_artifact").map(one => firstAssigned(prerequisite, one.id)));
      need(merge < 0 || prerequisiteFinish <= merge, `Checkpoint ${checkpoint.id} assigns delivery before prerequisite ${id} can finish.`);
    }
    for (const requirement of checkpoint.requirements.filter(one => one.purpose === "deployment" || one.purpose === "verification")) {
      const at = firstAssigned(checkpoint, requirement.id); if (at < 0 || merge < 0) continue;
      need(merge <= at, `Checkpoint ${checkpoint.id} assigns delivery evidence before its required merge.`);
      if (requirement.purpose === "verification") for (const deploy of checkpoint.requirements.filter(one => one.purpose === "deployment")) need(firstAssigned(checkpoint, deploy.id) <= at, `Checkpoint ${checkpoint.id} assigns verification before required deployment evidence.`);
    }
  }
}
async function github(context: DeliveryContext, endpoint: string): Promise<unknown> {
  const answer = await runHelper(context.gh, ["api", "--hostname", "github.com", endpoint], { cwd: context.prdWorktree, env: context.env, ...(context.signal ? { signal: context.signal } : {}), timeoutMs: 30_000 });
  need(answer.exitCode === 0, `GitHub evidence unavailable (${endpoint}): ${answer.stderr.trim()}`);
  try { return JSON.parse(answer.stdout) as unknown; } catch { throw new DeliveryRefusal(`Unreadable GitHub evidence (${endpoint}).`); }
}
type Json = Record<string, unknown>;
function object(value: unknown): Json { need(value && typeof value === "object" && !Array.isArray(value), "Malformed GitHub evidence."); return value as Json; }
async function pages(context: DeliveryContext, endpoint: string, field?: string): Promise<Json[]> {
  const result: Json[] = [];
  for (let page = 1; page <= 1000; page++) {
    need(!context.signal?.aborted, "Delivery reconciliation deadline exceeded.");
    const raw = await github(context, `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    const values = field ? object(raw)[field] : raw; need(Array.isArray(values), `Malformed GitHub list (${endpoint}).`);
    result.push(...values.map(object)); if (values.length < 100) return result;
  }
  throw new DeliveryRefusal(`Incomplete GitHub pagination (${endpoint}).`);
}
async function findPull(context: DeliveryContext, checkpoint: DeliveryCheckpoint): Promise<Json | undefined> {
  const repo = repository(context, checkpoint); const op = checkpoint.operations.find(one => one.kind === "merge");
  if (op?.pullRequest) return object(await github(context, `repos/${repo.github}/pulls/${op.pullRequest}`));
  const candidates = (await pages(context, `repos/${repo.github}/pulls?state=all&head=${encodeURIComponent(repo.github.split("/")[0] + ":" + checkpoint.featureBranch)}&base=${encodeURIComponent(checkpoint.target.baseBranch)}`)).filter(pull => {
    const head = object(pull.head); const base = object(pull.base);
    return head.sha === checkpoint.headSha && head.ref === checkpoint.featureBranch && base.ref === checkpoint.target.baseBranch && object(head.repo).full_name?.toString().toLowerCase() === repo.github.toLowerCase();
  });
  need(candidates.length <= 1, `Ambiguous pull requests for checkpoint ${checkpoint.id}.`); return candidates[0];
}
async function readMerge(context: DeliveryContext, checkpoint: DeliveryCheckpoint): Promise<void> {
  const pull = await findPull(context, checkpoint); if (!pull) return;
  const repo = repository(context, checkpoint); const head = object(pull.head); const base = object(pull.base);
  need(head.sha === checkpoint.headSha && head.ref === checkpoint.featureBranch && base.ref === checkpoint.target.baseBranch && object(base.repo).full_name?.toString().toLowerCase() === repo.github.toLowerCase() && object(head.repo).full_name?.toString().toLowerCase() === repo.github.toLowerCase(), `Pull request identity changed for ${checkpoint.id}.`);
  const op = checkpoint.operations.find(one => one.kind === "merge"); if (op) op.pullRequest = pull.number as number;
  if (pull.merged_at === null || pull.merged_at === undefined) { if (pull.state === "closed") checkpoint.unresolvedReason = "Pull request closed without merging."; return; }
  need(sha(pull.merge_commit_sha) && typeof pull.merged_at === "string" && Number.isSafeInteger(pull.number) && typeof pull.html_url === "string", "Incomplete merge evidence.");
  const comparison = object(await github(context, `repos/${repo.github}/compare/${pull.merge_commit_sha}...${encodeURIComponent(checkpoint.target.baseBranch)}`));
  need(["ahead", "identical"].includes(String(comparison.status)) && object(comparison.merge_base_commit).sha === pull.merge_commit_sha, "The actual approved base does not contain the merge result.");
  checkpoint.merge = { number: pull.number as number, url: pull.html_url, sourceHead: checkpoint.headSha, mergedHead: head.sha as string, resultSha: pull.merge_commit_sha, method: "unknown", mergedAt: pull.merged_at };
  if (op) { op.state = "observed"; delete op.reason; }
}
function pointer(value: unknown, path: string): unknown { let current = value; for (const part of path.slice(1).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))) { need(current !== null && typeof current === "object" && Object.hasOwn(current, part), `Missing evidence field ${path}.`); current = (current as Json)[part]; } return current; }
async function evidenceFact(context: DeliveryContext, checkpoint: DeliveryCheckpoint, requirement: EvidenceRequirement, reference: EvidenceReference): Promise<EvidenceFact> {
  const repo = repository(context, checkpoint); let raw: unknown; let revision: string; let occurredAt: string; let startedAt: string | undefined; let deploymentJobUrl: string | undefined;
  need(reference.kind === requirement.match.kind, `Evidence source mismatch for ${requirement.id}.`);
  if (requirement.match.kind === "command") {
    need(reference.sessionId, "Command evidence needs its recorded session identity.");
    context.signal?.throwIfAborted();
    const commands = await context.commands(reference.sessionId, context.signal); context.signal?.throwIfAborted(); const matches = commands.filter(call => call.callId === reference.id);
    need(matches.length === 1, `Missing or ambiguous authoritative command result ${reference.id}.`); const call = matches[0]!;
    const invocation = requirement.match.invocation.replaceAll("{{sourceRevision}}", checkpoint.headSha).replaceAll("{{mergeRevision}}", checkpoint.merge?.resultSha ?? "{{mergeRevision}}").replaceAll("{{environment}}", checkpoint.target.environment);
    need(call.command === invocation && call.cwd === requirement.match.cwd && call.resultAt && call.output !== undefined, `Command identity, directory or terminal success is unproved for ${requirement.id}.`);
    need(requirement.purpose === "pre_merge" || Date.parse(call.calledAt) >= Date.parse(checkpoint.createdAt), `Command predates checkpoint ${checkpoint.id}.`);
    if (call.outcome === "error") failure(context, call, `The documented command for ${requirement.id} failed.`);
    need(call.outcome === "success", `Terminal success is unproved for ${requirement.id}.`);
    raw = call; occurredAt = call.resultAt; startedAt = call.calledAt;
    let fields: unknown;
    if (Object.keys(requirement.match.fields).length) { try { fields = JSON.parse(call.output); } catch { throw new DeliveryRefusal(`${requirement.id}: required typed JSON result is unavailable.`); } }
    for (const [path, declared] of Object.entries(requirement.match.fields)) { if (declared === "$currentRevision") { need(requirement.purpose === "current_artifact" && sha(pointer(fields, path)), "A current-artifact probe must report an immutable revision."); continue; } const expected = declared === "$sourceRevision" ? checkpoint.headSha : declared === "$mergeRevision" ? checkpoint.merge?.resultSha : declared === "$environment" ? checkpoint.target.environment : typeof declared === "string" && declared.startsWith("$dependency:") ? deployedArtifact(ledger(context.record), declared.slice(12))?.revision : declared; need(expected !== undefined && pointer(fields, path) === expected, `${requirement.id}: ${path} does not match its declared target/artifact.`); }
    const expectedRevision = checkpoint.merge?.resultSha ?? checkpoint.headSha;
    if (requirement.purpose === "pre_merge") { need(argumentBound(directInvocation(invocation), checkpoint.headSha) || Object.values(requirement.match.fields).some(value => value === checkpoint.headSha || value === "$sourceRevision"), "The recorded pre-merge test has no evidence of the tested source revision."); revision = checkpoint.headSha; }
    else if (requirement.purpose === "current_artifact" && Object.values(requirement.match.fields).includes("$currentRevision")) { const path = Object.entries(requirement.match.fields).find(([, value]) => value === "$currentRevision")![0]; revision = pointer(fields, path) as string; }
    else { need(argumentBound(directInvocation(invocation), expectedRevision) || Object.values(requirement.match.fields).some(value => value === expectedRevision || value === "$mergeRevision"), `${requirement.id}: no binding to the deployed merge revision.`); revision = expectedRevision; }
  } else if (requirement.match.kind === "github_deployment") {
    need(/^\d+$/.test(reference.id), "Invalid deployment ID.", 422);
    const deployment = object(await github(context, `repos/${repo.github}/deployments/${reference.id}`));
    need(deployment.environment === checkpoint.target.environment && sha(deployment.sha), "Deployment environment or immutable revision mismatch.");
    const statuses = await pages(context, `repos/${repo.github}/deployments/${reference.id}/statuses`);
    const latest = statuses[0]; if (latest && ["pending", "in_progress", "queued"].includes(String(latest.state)) && typeof latest.created_at === "string") checkpoint.observedActivity = { kind: "Deploying", at: context.now() };
    const observed = requirement.purpose === "current_artifact" ? latest : statuses.filter(one => one.state === "success").at(-1);
    if (!observed && latest && ["failure", "error"].includes(String(latest.state))) failure(context, { deployment, statuses }, `Deployment ${reference.id} failed.`);
    need(observed?.state === "success" && typeof observed.created_at === "string", requirement.purpose === "current_artifact" ? "Deployment has no current successful terminal status." : "Deployment has no independently observed historical successful status.");
    if (requirement.purpose === "current_artifact") {
      const current = await pages(context, `repos/${repo.github}/deployments?environment=${encodeURIComponent(checkpoint.target.environment)}`);
      need(current[0]?.id === deployment.id, "The current environment deployment changed or cannot be established.");
    }
    deploymentJobUrl = typeof observed.log_url === "string" ? observed.log_url : undefined;
    raw = { deployment, statuses }; revision = deployment.sha; occurredAt = observed.created_at;
  } else {
    need(/^\d+$/.test(reference.id), "Invalid workflow run ID.", 422);
    const run = object(await github(context, `repos/${repo.github}/actions/runs/${reference.id}/attempts/${requirement.match.attempt}`));
    need(run.path === requirement.match.path && run.run_attempt === requirement.match.attempt && sha(run.head_sha), "Workflow identity, attempt or revision mismatch.");
    if (run.status === "completed" && ["failure", "cancelled", "timed_out", "action_required"].includes(String(run.conclusion))) failure(context, run, `Workflow ${reference.id} finished unsuccessfully.`);
    const jobs = await pages(context, `repos/${repo.github}/actions/runs/${reference.id}/attempts/${requirement.match.attempt}/jobs`, "jobs");
    if (requirement.purpose === "verification" && jobs.some(job => requirement.match.kind === "github_workflow" && requirement.match.jobs.includes(String(job.name)) && job.status === "in_progress") && checkpoint.evidence.some(fact => fact.status === "success" && fact.revision === run.head_sha && checkpoint.requirements.find(one => one.id === fact.requirementId)?.purpose === "deployment")) checkpoint.observedActivity = { kind: "Verifying", at: context.now() };
    need(run.status === "completed" && run.conclusion === "success", "The workflow is not successfully complete.");
    for (const name of requirement.match.jobs) need(jobs.some(job => job.name === name && job.status === "completed" && job.conclusion === "success"), `Required job ${name} is missing, skipped or unsuccessful.`);
    const deploymentJobName = requirement.match.deploymentJob;
    const deploymentJob = jobs.find(job => job.name === deploymentJobName && job.status === "completed" && job.conclusion === "success");
    need(requirement.purpose === "pre_merge" || deploymentJob && [...checkpoint.evidence, ...(checkpoint.evidenceHistory ?? [])].some(fact => fact.status === "success" && fact.revision === run.head_sha && fact.environment === checkpoint.target.environment && fact.deploymentJobUrl === deploymentJob.html_url && checkpoint.requirements.find(one => one.id === fact.requirementId)?.match.kind === "github_deployment"), "Workflow run/job is not linked to the actual approved environment deployment.");
    raw = { run, jobs }; revision = run.head_sha; const times = jobs.filter(job => requirement.match.kind === "github_workflow" && requirement.match.jobs.includes(String(job.name))).map(job => job.completed_at);
    need(times.every(time => typeof time === "string"), "Missing workflow job completion time."); occurredAt = (times as string[]).sort().at(-1)!;
    const starts = jobs.filter(job => requirement.match.kind === "github_workflow" && requirement.match.jobs.includes(String(job.name))).map(job => job.started_at);
    need(starts.every(time => typeof time === "string"), "Missing verification job start time."); startedAt = (starts as string[]).sort()[0]!;
  }
  if (requirement.purpose === "pre_merge") need(revision === checkpoint.headSha, "Pre-merge evidence is for a different head.");
  else {
    need(checkpoint.merge, "A deployment or verification cannot pass before the merge is confirmed.");
    if (requirement.purpose !== "current_artifact" && revision !== checkpoint.merge.resultSha) {
      const comparison = object(await github(context, `repos/${repo.github}/compare/${checkpoint.merge.resultSha}...${revision}`));
      need(["ahead", "identical"].includes(String(comparison.status)) && object(comparison.merge_base_commit).sha === checkpoint.merge.resultSha, "Deployed revision does not demonstrably contain the merge result.");
    }
    need(Date.parse(occurredAt) >= Date.parse(checkpoint.merge.mergedAt), "Delivery evidence predates the confirmed merge.");
    if (requirement.purpose === "verification") {
      const deployment = [...checkpoint.evidence, ...(checkpoint.evidenceHistory ?? [])].find(fact => fact.status === "success" && fact.revision === revision && startedAt && Date.parse(startedAt) >= Date.parse(fact.occurredAt) && checkpoint.requirements.find(one => one.id === fact.requirementId)?.purpose === "deployment");
      need(deployment && deployment.revision === revision && startedAt && Date.parse(startedAt) >= Date.parse(deployment.occurredAt) && Date.parse(occurredAt) >= Date.parse(deployment.occurredAt), "Verification is not bound to the deployed artifact after its deployment.");
    }
  }
  let prerequisiteArtifacts: { checkpointId: string; revision: string }[] | undefined;
  if (requirement.purpose === "verification" && checkpoint.dependsOn.length) {
    const previous = checkpoint.evidence.find(one => one.requirementId === requirement.id && one.status === "success" && hash(one.reference) === hash(reference));
    if (previous?.prerequisiteArtifacts) prerequisiteArtifacts = previous.prerequisiteArtifacts;
    else {
      need(requirement.match.kind === "command" && checkpoint.dependsOn.every(id => Object.values(requirement.match.kind === "command" ? requirement.match.fields : {}).includes(`$dependency:${id}`)), "Dependent verification needs typed bindings to every prerequisite artifact.");
      prerequisiteArtifacts = await prerequisiteArtifactsNow(context, checkpoint, startedAt);
    }
  }
  const rawDigest = hash(raw); const rawPath = join(context.stateDirectory, "delivery-evidence", `${rawDigest}.json`); writeJsonAtomically(rawPath, raw);
  return { requirementId: requirement.id, reference, revision, environment: checkpoint.target.environment, observedAt: context.now(), occurredAt, status: "success", rawDigest, rawPath, ...(startedAt ? { startedAt } : {}), ...(deploymentJobUrl ? { deploymentJobUrl } : {}), ...(prerequisiteArtifacts ? { prerequisiteArtifacts } : {}) };
}
function effectiveCheckpoint(state: DevelopmentLedger, id: string): DeliveryCheckpoint | undefined {
  const seen = new Set<string>(); let checkpoint = state.checkpoints.find(one => one.id === id);
  while (checkpoint?.supersededBy) { if (seen.has(checkpoint.id)) return undefined; seen.add(checkpoint.id); checkpoint = state.checkpoints.find(one => one.id === checkpoint!.supersededBy); }
  return checkpoint;
}
function deployedArtifact(state: DevelopmentLedger, id: string): EvidenceFact | undefined {
  const checkpoint = effectiveCheckpoint(state, id);
  return checkpoint?.evidence.find(one => one.status === "success" && checkpoint.requirements.find(req => req.id === one.requirementId)?.purpose === "deployment");
}
async function prerequisiteArtifactsNow(context: DeliveryContext, checkpoint: DeliveryCheckpoint, verificationStartedAt?: string): Promise<{ checkpointId: string; revision: string }[]> {
  const state = ledger(context.record); const artifacts: { checkpointId: string; revision: string }[] = [];
  for (const id of checkpoint.dependsOn) {
    const dependency = effectiveCheckpoint(state, id); need(dependency && checkpointSatisfied(state, dependency), `Prerequisite ${id} is unresolved.`);
    const deployed = dependency.evidence.find(one => one.status === "success" && dependency.requirements.find(req => req.id === one.requirementId)?.purpose === "deployment"); need(deployed, `Prerequisite ${id} has no deployed artifact.`);
    const probes = dependency.requirements.filter(one => one.purpose === "current_artifact"); need(probes.length, `Prerequisite ${id} needs an explicit current-artifact probe.`);
    for (const probe of probes) {
      const prior = dependency.evidence.find(one => one.requirementId === probe.id); need(prior, `Read prerequisite ${id}'s current artifact before dependent verification.`);
      const fresh = await evidenceFact(context, dependency, probe, prior.reference);
      if (probe.match.kind === "command") need(checkpoint.verificationProbeAfter && fresh.startedAt && Date.parse(fresh.startedAt) >= Date.parse(checkpoint.verificationProbeAfter) && (!verificationStartedAt || Date.parse(fresh.occurredAt) <= Date.parse(verificationStartedAt)), `Execute a fresh current-artifact probe for ${id} after ${checkpoint.verificationProbeAfter ?? "requesting verification preparation"}, before verification begins.`);
      need(fresh.revision === deployed.revision, `Prerequisite ${id}'s current artifact changed; restore/reverify the intended artifact before proceeding.`);
    }
    artifacts.push({ checkpointId: id, revision: deployed.revision });
  }
  return artifacts;
}
export function checkpointSatisfied(state: DevelopmentLedger, checkpoint: DeliveryCheckpoint, seen = new Set<string>()): boolean {
  if (!checkpoint || seen.has(checkpoint.id)) return false; seen.add(checkpoint.id);
  if (checkpoint.supersededBy) { const replacement = state.checkpoints.find(one => one.id === checkpoint.supersededBy); return !!replacement && checkpointSatisfied(state, replacement, seen); }
  return !checkpoint.unresolvedReason && !!checkpoint.merge && checkpoint.operations.some(one => one.kind === "synchronize" && one.state === "observed") && checkpoint.requirements.filter(one => one.purpose !== "current_artifact").every(requirement => checkpoint.evidence.some(fact => fact.requirementId === requirement.id && fact.status === "success")) && checkpoint.dependsOn.every(id => { const dependency = state.checkpoints.find(one => one.id === id); return !!dependency && checkpointSatisfied(state, dependency, new Set(seen)); });
}
async function discoverEvidence(context: DeliveryContext, checkpoint: DeliveryCheckpoint): Promise<void> {
  if (!checkpoint.merge) return;
  const repo = repository(context, checkpoint);
  const references = (checkpoint.references ??= []);
  for (const operation of checkpoint.operations.filter(one => one.restorationFor && one.state !== "observed" && one.state !== "failed" && !one.references.length)) {
    for (const requirement of checkpoint.requirements.filter(one => one.purpose === "deployment" && one.match.kind === "github_deployment")) {
      const candidates = (await pages(context, `repos/${repo.github}/deployments?sha=${checkpoint.merge.resultSha}&environment=${encodeURIComponent(checkpoint.target.environment)}`)).filter(one => one.sha === checkpoint.merge!.resultSha && one.environment === checkpoint.target.environment && Date.parse(String(one.created_at)) >= Date.parse(operation.preparedAt));
      need(candidates.length <= 1, "Ambiguous prerequisite restoration outcome.");
      if (candidates[0] && Number.isSafeInteger(candidates[0].id)) operation.references.push({ requirementId: requirement.id, kind: "github_deployment", id: String(candidates[0].id) });
    }
  }
  for (const requirement of checkpoint.requirements.filter(one => one.purpose !== "current_artifact" && one.purpose !== "pre_merge")) {
    if ([...references, ...checkpoint.operations.flatMap(one => one.references)].some(one => one.requirementId === requirement.id)) continue;
    if (requirement.match.kind === "github_deployment") {
      const candidates = (await pages(context, `repos/${repo.github}/deployments?sha=${checkpoint.merge.resultSha}&environment=${encodeURIComponent(checkpoint.target.environment)}`)).filter(one => one.sha === checkpoint.merge!.resultSha && one.environment === checkpoint.target.environment && Date.parse(String(one.created_at)) >= Date.parse(checkpoint.merge!.mergedAt));
      need(candidates.length <= 1, `Ambiguous deployment operations for ${checkpoint.id}/${requirement.id}.`);
      if (candidates[0] && Number.isSafeInteger(candidates[0].id)) references.push({ kind: "github_deployment", id: String(candidates[0].id), requirementId: requirement.id });
    } else if (requirement.match.kind === "github_workflow") {
      const match = requirement.match;
      const candidates = (await pages(context, `repos/${repo.github}/actions/workflows/${encodeURIComponent(match.path)}/runs?head_sha=${checkpoint.merge.resultSha}`, "workflow_runs")).filter(one => one.head_sha === checkpoint.merge!.resultSha && one.path === match.path && one.run_attempt === match.attempt && Date.parse(String(one.created_at)) >= Date.parse(checkpoint.merge!.mergedAt));
      need(candidates.length <= 1, `Ambiguous workflow operations for ${checkpoint.id}/${requirement.id}.`);
      if (candidates[0] && Number.isSafeInteger(candidates[0].id)) references.push({ kind: "github_workflow", id: String(candidates[0].id), requirementId: requirement.id });
    }
  }
  const order = (id: string) => { const purpose = checkpoint.requirements.find(one => one.id === id)?.purpose; return purpose === "deployment" ? 0 : purpose === "verification" ? 1 : 2; };
  references.sort((a, b) => order(a.requirementId) - order(b.requirementId));
}
export async function reconcileDelivery(context: DeliveryContext): Promise<void> {
  const state = ledger(context.record); state.sourceUnavailable = false; delete state.lastReadError;
  const signal = AbortSignal.any([...(context.signal ? [context.signal] : []), AbortSignal.timeout(120_000)]);
  const bounded = { ...context, signal, git: { ...context.git, signal } };
  for (const checkpoint of state.checkpoints) {
    try {
      delete checkpoint.unresolvedReason; delete checkpoint.mergeUnresolvedReason; delete checkpoint.observedActivity; checkpoint.unresolvedRequirements = {};
      try { await readMerge(bounded, checkpoint); }
      catch (error) { checkpoint.mergeUnresolvedReason = (error as Error).message; throw error; }
      await discoverEvidence(bounded, checkpoint);
      const references = new Map<string, { reference: EvidenceReference; operation?: import("../state/development-delivery.js").DeliveryOperation }>();
      for (const reference of checkpoint.references ?? []) references.set(reference.requirementId, { reference });
      for (const operation of checkpoint.operations) for (const reference of operation.references) references.set(reference.requirementId, { reference, operation });
      const unresolved = new Map<string, string>();
      const ordered = [...references.values()].sort((a, b) => Number(checkpoint.requirements.find(one => one.id === a.reference.requirementId)?.purpose === "verification") - Number(checkpoint.requirements.find(one => one.id === b.reference.requirementId)?.purpose === "verification"));
      for (const { reference, operation } of ordered) {
        const requirement = checkpoint.requirements.find(one => one.id === reference.requirementId); need(requirement, `Unknown evidence requirement ${reference.requirementId}.`);
        if (requirement.purpose === "current_artifact") continue;
        try {
          const fact = await evidenceFact(bounded, checkpoint, requirement, reference);
          const previous = checkpoint.evidence.find(one => one.requirementId === fact.requirementId);
          if (previous?.rawDigest === fact.rawDigest && previous.reference.id === fact.reference.id) fact.observedAt = previous.observedAt;
          else if (previous && !(checkpoint.evidenceHistory ??= []).some(one => one.rawDigest === previous.rawDigest)) checkpoint.evidenceHistory.push(previous);
          checkpoint.evidence = [...checkpoint.evidence.filter(one => one.requirementId !== fact.requirementId), fact];
        } catch (error) {
          unresolved.set(requirement.id, (error as Error).message);
          if (sourceUnavailable(error)) { state.sourceUnavailable = true; state.lastReadError = (error as Error).message; }
          if (operation && error instanceof ObservedOperationFailure) { operation.state = "failed"; operation.reason = error.message; operation.failureEvidencePath = error.rawPath; }
        }
      }
      checkpoint.unresolvedRequirements = Object.fromEntries(unresolved);
      if (unresolved.size) checkpoint.unresolvedReason = [...unresolved.values()].join(" ");
      for (const operation of checkpoint.operations) {
        if (["deploy", "verify"].includes(operation.kind) && operation.state !== "failed") {
          const purpose = operation.kind === "deploy" ? "deployment" : "verification";
          if (checkpoint.requirements.filter(one => one.purpose === purpose && (!operation.requirementIds || operation.requirementIds.includes(one.id))).every(one => !unresolved.has(one.id) && checkpoint.evidence.some(fact => fact.requirementId === one.id && (!operation.restorationFor || Date.parse(fact.occurredAt) >= Date.parse(operation.preparedAt))))) operation.state = "observed";
        }
        if (operation.kind === "synchronize" && operation.state !== "observed") {
          const repo = repository(bounded, checkpoint); const featureHead = await git(bounded, repo, ["rev-parse", "HEAD"]);
          if (checkpoint.merge && operation.sourceHead && operation.intendedBaseSha && await ancestor(bounded, repo, checkpoint.headSha, featureHead) && await ancestor(bounded, repo, operation.sourceHead, featureHead) && await ancestor(bounded, repo, operation.intendedBaseSha, featureHead)) { operation.state = "observed"; operation.synchronized = { featureHead, baseHead: operation.intendedBaseSha }; }
        }
      }
    } catch (error) { checkpoint.unresolvedReason = (error as Error).message; if (!checkpoint.mergeUnresolvedReason) (checkpoint.unresolvedRequirements ??= {})["*"] = (error as Error).message; if (sourceUnavailable(error)) { state.sourceUnavailable = true; state.lastReadError = (error as Error).message; } }
    checkpoint.checkedAt = context.now();
  }
  state.checkedAt = context.now();
}
export function phaseDeliveryCheck(context: DeliveryContext, phaseId: string): CheckResult { return ownerDeliveryCheck(context, { kind: "phase", phaseId }); }
export function ownerDeliveryCheck(context: DeliveryContext, owner: DeliveryOwner): CheckResult {
  const check: CheckResult = { name: "Required development delivery verified", passed: false, facts: [] }; const state = ledger(context.record);
  try {
    validateSplits(context);
    const assessment = state.assessments.find(one => sameOwner(one, { owner }));
    const binding = ownerDocuments(context, owner);
    need(assessment && assessment.documentsDigest === binding.documentsDigest && assessment.requirementManifestDigest === binding.requirementManifestDigest, `${owner.kind === "phase" ? `Phase ${owner.phaseId}` : `Audit ${owner.activityId}`} needs a current development-delivery assessment.`);
    for (const checkpoint of state.checkpoints) {
      const ids = assignedObligations(state, checkpoint, owner).filter(id => id === "requiredMerge" || checkpoint.requirements.find(one => one.id === id)?.purpose !== "current_artifact");
      if (!ids.length) continue;
      if (checkpoint.supersededBy && checkpointSatisfied(state, checkpoint)) continue;
      for (const id of ids) need(id === "requiredMerge" ? !!checkpoint.merge && !checkpoint.mergeUnresolvedReason && checkpoint.operations.some(one => one.kind === "synchronize" && one.state === "observed") : !checkpoint.unresolvedRequirements?.[id] && !checkpoint.unresolvedRequirements?.["*"] && checkpoint.evidence.some(fact => fact.requirementId === id && fact.status === "success"), `${checkpoint.id} / ${id}: ${checkpoint.unresolvedReason ?? "required delivery evidence remains unresolved"}`);
      for (const dependency of checkpoint.dependsOn) need(checkpointSatisfied(state, state.checkpoints.find(one => one.id === dependency)!), `${checkpoint.id}: prerequisite ${dependency} is unresolved.`);
    }
    check.passed = true; check.facts = [assessment.required ? "Required merge, deployment and verification evidence confirmed" : assessment.reason];
  } catch (error) { check.facts = [(error as Error).message]; } return check;
}
export async function prepareOperation(context: DeliveryContext, body: Record<string, unknown>): Promise<{ operationId: string; disposition: "proceed" | "already_observed" | "unresolved"; facts: string[] }> {
  const state = ledger(context.record); const checkpoint = state.checkpoints.find(one => one.id === body.checkpointId); need(checkpoint, "Unknown delivery checkpoint.", 422); granted(context, checkpoint);
  await reconcileDelivery(context);
  const request = object(body.operation); need(["merge", "deploy", "verify", "synchronize"].includes(String(request.kind)), "Unknown delivery operation.", 400);
  const kind = request.kind as "merge" | "deploy" | "verify" | "synchronize";
  need(!(context.phaseId === "pr" && kind === "merge" && !activationLeaf(context)), "Finalization does not authorize merging remaining review work.");
  const eligible = kind === "merge" || kind === "synchronize" ? ["requiredMerge"] : checkpoint.requirements.filter(one => one.purpose === (kind === "deploy" ? "deployment" : "verification")).map(one => one.id);
  const obligations = request.requirementIds === undefined ? eligible : request.requirementIds;
  need(strings(obligations) && obligations.length && obligations.every(id => eligible.includes(id)), "Name the operation's assigned requirement IDs.", 422);
  let restorationFor: string | undefined;
  if (request.restorationFor !== undefined) {
    need(kind === "deploy" && typeof request.restorationFor === "string", "Only a documented prerequisite redeployment can restore an artifact.", 422);
    const dependent = state.checkpoints.find(one => one.id === request.restorationFor);
    need(dependent && dependent.dependsOn.some(id => effectiveCheckpoint(state, id)?.id === checkpoint.id) && dependent.verificationProbeAfter, "The dependent verification has not requested artifact recovery.");
    checkpointScope(context, dependent, dependent.requirements.filter(one => one.purpose === "verification").map(one => one.id));
    need(dependent.requirements.some(one => one.purpose === "verification" && (!dependent.evidence.some(fact => fact.requirementId === one.id && fact.status === "success") || dependent.unresolvedRequirements?.[one.id] || dependent.unresolvedRequirements?.["*"])), "The dependent verification is already complete; no restoration is needed.");
    const deployed = deployedArtifact(state, checkpoint.id); need(deployed, "The prerequisite has no retained deployed artifact.");
    let changed = false;
    for (const probe of checkpoint.requirements.filter(one => one.purpose === "current_artifact")) {
      const saved = checkpoint.evidence.find(one => one.requirementId === probe.id); need(saved, "Submit an independently observed current-artifact reference before restoration.");
      const fresh = await evidenceFact(context, checkpoint, probe, saved.reference);
      if (probe.match.kind === "command") need(fresh.startedAt && Date.parse(fresh.startedAt) >= Math.max(Date.parse(dependent.verificationProbeAfter), checkpoint.operations.some(one => one.restorationFor && one.state === "observed") ? Date.parse(deployed.occurredAt) : 0), "The prerequisite artifact probe is stale.");
      changed ||= fresh.revision !== deployed.revision;
    }
    need(changed, "The intended prerequisite artifact is already current; no redeployment is authorized."); restorationFor = dependent.id;
  } else checkpointScope(context, checkpoint, obligations);
  need(!state.sourceUnavailable, state.lastReadError ?? "Current delivery evidence is unavailable; no new operation is authorized.");
  const prior = checkpoint.operations.findLast(one => one.kind === kind && (!one.requirementIds || one.requirementIds.some(id => obligations.includes(id))));
  const syncBase = kind === "synchronize" ? (await git(context, repository(context, checkpoint), ["ls-remote", "origin", `refs/heads/${checkpoint.target.baseBranch}`])).split(/\s/)[0] : undefined;
  const newSynchronization = kind === "synchronize" && prior?.state === "observed" && sha(syncBase) && prior.synchronized?.baseHead !== syncBase;
  if (prior?.state === "observed" && prior.requirementIds && obligations.some(id => !prior.requirementIds!.includes(id)) && obligations.some(id => !checkpoint.evidence.some(fact => fact.requirementId === id && fact.status === "success"))) return { operationId: prior.id, disposition: "unresolved", facts: ["An overlapping operation is already confirmed. Prepare only the outstanding assigned requirement IDs; do not repeat the confirmed part."] };
  if (prior && prior.state !== "failed" && !newSynchronization && !(restorationFor && prior.state === "observed")) return { operationId: prior.id, disposition: prior.state === "observed" ? "already_observed" : "unresolved", facts: [prior.reason ?? checkpoint.unresolvedReason ?? "The prepared operation's outcome is unknown; reconcile before retrying it."] };
  const alreadyObserved = kind === "merge" ? !!checkpoint.merge : kind === "deploy" || kind === "verify" ? checkpoint.requirements.filter(one => one.purpose === (kind === "deploy" ? "deployment" : "verification")).every(one => checkpoint.evidence.some(fact => fact.requirementId === one.id && fact.status === "success")) : false;
  if (!prior && alreadyObserved && !checkpoint.unresolvedReason && !restorationFor) return { operationId: "independently-observed", disposition: "already_observed", facts: ["The exact required operation is already independently confirmed; do not repeat it."] };
  const repo = repository(context, checkpoint);
  need(await git(context, repo, ["symbolic-ref", "--short", "HEAD"]) === checkpoint.featureBranch, "The assigned workspace changed branch.");
  const currentHead = await git(context, repo, ["rev-parse", "HEAD"]);
  need(await ancestor(context, repo, checkpoint.headSha, currentHead), "The assigned branch no longer retains the checkpoint's source work.");
  if (kind === "merge") need(currentHead === checkpoint.headSha, "The checkpoint source head changed; assess a new checkpoint.");
  for (const id of checkpoint.dependsOn) need(checkpointSatisfied(state, state.checkpoints.find(one => one.id === id)!), `Prerequisite checkpoint ${id} is unresolved.`);
  let pullRequest: number | undefined;
  if (kind === "merge") {
    const pull = await findPull(context, checkpoint); need(pull && pull.state === "open" && pull.draft === false && object(pull.head).sha === checkpoint.headSha, "An appropriate non-draft PR for the exact checkpoint head is required.");
    const checks = await pages(context, `repos/${repo.github}/commits/${checkpoint.headSha}/check-runs`, "check_runs");
    const statuses = await pages(context, `repos/${repo.github}/commits/${checkpoint.headSha}/statuses`);
    for (const name of checkpoint.requiredChecks) {
      const check = checks.filter(one => one.name === name).sort((a, b) => Number(b.id) - Number(a.id))[0];
      const status = statuses.find(one => one.context === name);
      need((check || status) && (!check || check.status === "completed" && check.conclusion === "success") && (!status || status.state === "success"), `Required pre-merge check ${name} has not passed for the checkpoint head.`);
    }
    const viewed = await runHelper(context.gh, ["pr", "view", String(pull.number), "--repo", `github.com/${repo.github}`, "--json", "headRefOid,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup"], { cwd: repo.worktreePath, env: context.env, ...(context.signal ? { signal: context.signal } : {}), timeoutMs: 30_000 });
    need(viewed.exitCode === 0, "Current required reviews and protections could not be read."); const policy = object(JSON.parse(viewed.stdout));
    need(policy.headRefOid === checkpoint.headSha && policy.mergeable === "MERGEABLE" && ["CLEAN", "HAS_HOOKS"].includes(String(policy.mergeStateStatus)) && !["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(String(policy.reviewDecision)) && (!checkpoint.requireReview || policy.reviewDecision === "APPROVED"), "Required review, merge checks or branch protections block this checkpoint.");
    for (const requirement of checkpoint.requirements.filter(one => one.purpose === "pre_merge")) need(!checkpoint.unresolvedRequirements?.[requirement.id] && checkpoint.evidence.some(fact => fact.requirementId === requirement.id && fact.revision === checkpoint.headSha && fact.status === "success"), `Missing or unsuccessful latest documented pre-merge evidence ${requirement.id}.`);
    pullRequest = pull.number as number;
  } else need(checkpoint.merge, "A confirmed merge is required before deployment, verification or synchronization.");
  if (kind === "verify") {
    need(checkpoint.requirements.filter(one => one.purpose === "deployment").every(one => checkpoint.evidence.some(fact => fact.requirementId === one.id)), "Deployment evidence is unresolved.");
    const hasProbes = checkpoint.dependsOn.some(id => effectiveCheckpoint(state, id)?.requirements.some(one => one.purpose === "current_artifact"));
    if (hasProbes && (!checkpoint.verificationProbeAfter || prior?.state === "failed" && Date.parse(checkpoint.verificationProbeAfter) <= Date.parse(prior.preparedAt))) {
      checkpoint.verificationProbeAfter = context.now();
      return { operationId: "current-artifact", disposition: "unresolved", facts: [`Read and submit fresh prerequisite current-artifact probes after ${checkpoint.verificationProbeAfter}; then prepare verification again.`] };
    }
    await prerequisiteArtifactsNow(context, checkpoint);
  }
  const operation = { id: randomUUID(), requirementIds: obligations, sourceHead: currentHead, ...(sha(syncBase) ? { intendedBaseSha: syncBase } : {}), kind, preparedAt: context.now(), state: "prepared" as const, references: [], ...(prior ? { retryOf: prior.id } : {}), ...(pullRequest ? { pullRequest } : {}) };
  if (restorationFor) Object.assign(operation, { restorationFor });
  checkpoint.operations.push(operation); return { operationId: operation.id, disposition: "proceed", facts: ["Intent persisted before dispatch. Use the documented operation with this exact target and head; submit its evidence afterwards."] };
}
export async function submitEvidence(context: DeliveryContext, body: Record<string, unknown>): Promise<void> {
  const checkpoint = ledger(context.record).checkpoints.find(one => one.id === body.checkpointId); need(checkpoint, "Unknown checkpoint.", 422); granted(context, checkpoint);
  if (body.operationId === "current-artifact") {
    need(Array.isArray(body.references) && body.references.length > 0, "Submit current-artifact probe references.", 400);
    const state = ledger(context.record);
    const active = operationOwner(context);
    const recovering = recoveryOwner(context);
    const dependent = state.checkpoints.find(one => one.dependsOn.some(id => effectiveCheckpoint(state, id)?.id === checkpoint.id) && one.verificationProbeAfter && (active?.kind === "phase" && active.phaseId === "pr" && !recovering && currentLeaves(context).every(leaf => leaf.closed) || active && one.requirements.some(requirement => requirement.purpose === "verification" && assignedObligations(state, one, active).includes(requirement.id))));
    need(dependent, "The active dependent verification has not requested fresh prerequisite probes.");
    checkpointScope(context, dependent, dependent.requirements.filter(one => one.purpose === "verification").map(one => one.id));
    for (const value of body.references) {
      const reference = object(value) as unknown as EvidenceReference; const requirement = checkpoint.requirements.find(one => one.id === reference.requirementId && one.purpose === "current_artifact"); need(requirement, "This read-only submission accepts only prerequisite current-artifact probes.", 422);
      const fact = await evidenceFact(context, checkpoint, requirement, reference);
      need(requirement.match.kind !== "command" || fact.startedAt && Date.parse(fact.startedAt) >= Date.parse(dependent.verificationProbeAfter!), "The current-artifact command is stale.");
      const previous = checkpoint.evidence.find(one => one.requirementId === fact.requirementId && one.rawDigest === fact.rawDigest && one.reference.id === fact.reference.id);
          if (previous) fact.observedAt = previous.observedAt;
          checkpoint.evidence = [...checkpoint.evidence.filter(one => one.requirementId !== fact.requirementId), fact];
      if (!(checkpoint.references ??= []).some(one => hash(one) === hash(reference))) checkpoint.references.push(reference);
    }
    return;
  }
  const operation = checkpoint.operations.find(one => one.id === body.operationId); need(operation, "Unknown prepared operation.", 422);
  need(Array.isArray(body.references), "Submit candidate source references.", 400);
  for (const value of body.references) {
    const ref = object(value) as unknown as EvidenceReference;
    if (operation.restorationFor) {
      const dependent = ledger(context.record).checkpoints.find(one => one.id === operation.restorationFor); need(dependent, "Missing dependent restoration scope.");
      checkpointScope(context, dependent, dependent.requirements.filter(one => one.purpose === "verification").map(one => one.id));
    } else checkpointScope(context, checkpoint, [ref.requirementId]);
    const purpose = checkpoint.requirements.find(one => one.id === ref.requirementId)?.purpose;
    need((operation.kind === "deploy" && purpose === "deployment" || operation.kind === "verify" && purpose === "verification") && (!operation.requirementIds || operation.requirementIds.includes(ref.requirementId)), "Evidence must belong to the prepared operation's kind and assigned requirement IDs.", 422);
    need(typeof ref.id === "string" && ref.id && checkpoint.requirements.some(one => one.id === ref.requirementId) && ["command", "github_deployment", "github_workflow"].includes(ref.kind), "Invalid evidence reference.", 422);
    if (!operation.references.some(one => hash(one) === hash(ref))) operation.references.push(ref);
  }
  await reconcileDelivery(context);
}

/** Current-work accounting, shared by finalization and reopening. Never infers squash delivery from a zero diff. */
export async function evaluateRepositories(context: DeliveryContext): Promise<{ passed: boolean; checks: CheckResult[]; pullRequests: import("../state/records.js").PullRequestFacts[] }> {
  const state = ledger(context.record); const results: DevelopmentLedger["repositoryResults"] = []; const checkedHeads = new Map<string, string>(); const pullRequests: import("../state/records.js").PullRequestFacts[] = [];
  await reconcileDelivery(context);
  const global: string[] = [];
  for (const leaf of currentLeaves(context)) {
    const check = phaseDeliveryCheck(context, leaf.id); if (!leaf.closed || !check.passed) global.push(!leaf.closed ? `Phase ${leaf.id} is still open.` : check.facts.join(" "));
  }
  for (const checkpoint of state.checkpoints) if (!checkpointSatisfied(state, checkpoint)) global.push(`${checkpoint.id}: ${checkpoint.unresolvedReason ?? "required delivery remains unresolved"}`);
  for (const repo of context.record.repositories.filter(one => one.setupCompletedAt)) {
    const result: DevelopmentLedger["repositoryResults"][number] = { repository: repo.name, state: "unresolved", deliveredCheckpointIds: state.checkpoints.filter(one => one.target.repository === `github.com/${repo.github}`.toLowerCase() && one.merge).map(one => one.id), reasons: [] };
    results.push(result);
    try {
      need(await git(context, repo, ["symbolic-ref", "--short", "HEAD"]) === context.record.settings.featureBranch, `${repo.name}: assigned workspace branch changed.`);
      need((await git(context, repo, ["status", "--porcelain", "--untracked-files=all"])) === "", `${repo.name}: uncommitted work remains.`);
      const head = await git(context, repo, ["rev-parse", "HEAD"]); need(sha(head), "Feature head unavailable."); checkedHeads.set(repo.name, head);
      need(repo.baseCommit, "Original source-work boundary is unavailable.");
      if (head === repo.baseCommit && !result.deliveredCheckpointIds.length) { result.state = "unchanged"; continue; }
      const remote = await git(context, repo, ["ls-remote", "origin", `refs/heads/${context.record.settings.featureBranch}`]);
      need(remote.split(/\s/)[0] === head, `${repo.name}: current feature head is not pushed to its assigned origin branch.`);
      const confirmed = state.checkpoints.filter(one => one.target.repository === `github.com/${repo.github}`.toLowerCase() && one.merge);
      for (const checkpoint of confirmed) need(await ancestor(context, repo, checkpoint.headSha, head), `${repo.name}: accumulated source work is missing from the assigned branch.`);
      const commits = (await git(context, repo, ["rev-list", "--first-parent", `${repo.baseCommit}..${head}`])).split("\n").filter(Boolean);
      const uncovered: string[] = [];
      for (const commit of commits) {
        let covered = false;
        for (const checkpoint of confirmed) if (await ancestor(context, repo, commit, checkpoint.headSha)) { covered = true; break; }
        if (!covered) {
          const synchronized = confirmed.flatMap(one => one.operations).find(one => one.kind === "synchronize" && one.state === "observed" && one.synchronized?.featureHead === commit);
          if (synchronized) {
            const parents = (await git(context, repo, ["show", "-s", "--format=%P", commit])).split(" ");
            if (commit === synchronized.synchronized!.baseHead || parents.length === 2 && parents.includes(synchronized.synchronized!.baseHead)) {
              const delta = await runGit(context.git, repo.worktreePath, ["diff", "--quiet", synchronized.synchronized!.baseHead, commit]);
              need(delta.exitCode === 0 || delta.exitCode === 1, "Could not inspect synchronized source work.");
              covered = delta.exitCode === 0;
            }
          }
        }
        if (!covered) uncovered.push(commit);
      }
      let review: Json | undefined;
      if (uncovered.length) {
        const pulls = await pages(context, `repos/${repo.github}/pulls?state=open&head=${encodeURIComponent(repo.github.split("/")[0] + ":" + context.record.settings.featureBranch)}&base=${encodeURIComponent(repo.baseBranch)}`);
        review = pulls.find(pull => pull.draft === false && object(pull.head).sha === head && object(pull.head).ref === context.record.settings.featureBranch && object(object(pull.head).repo).full_name?.toString().toLowerCase() === repo.github.toLowerCase() && object(pull.base).ref === repo.baseBranch);
        need(review && typeof review.body === "string" && typeof review.html_url === "string" && Number.isSafeInteger(review.number), `${repo.name}: open, non-draft review PR must contain the exact current pushed head.`);
        review = object(await github(context, `repos/${repo.github}/pulls/${review.number}`));
        need(typeof review.html_url === "string" && review.state === "open" && review.draft === false && object(review.head).sha === head && object(review.base).ref === repo.baseBranch && Number.isInteger(review.commits) && Number.isInteger(review.additions) && Number.isInteger(review.deletions), "The remaining review PR changed or returned incomplete facts.");
        result.remainingHeadSha = head; result.reviewPullRequest = { number: review.number as number, url: review.html_url };
        pullRequests.push({ repository: repo.name, number: review.number as number, title: String(review.title), url: review.html_url, head: context.record.settings.featureBranch, base: repo.baseBranch, commits: review.commits as number, additions: review.additions as number, deletions: review.deletions as number });
      }
      const related = [...state.checkpoints.flatMap(one => one.merge ? [one.merge.url] : []), ...results.flatMap(one => one.reviewPullRequest ? [one.reviewPullRequest.url] : [])];
      const descriptions = [...confirmed.map(one => one.merge!.number), ...(review ? [review.number as number] : [])];
      for (const number of descriptions) {
        const pull = object(await github(context, `repos/${repo.github}/pulls/${number}`)); const body = typeof pull.body === "string" ? pull.body : "";
        need(body.includes(context.prdDirectory), `${repo.name} #${number}: add the PRD reference to the description.`);
        for (const url of related.filter(url => url !== pull.html_url)) need(body.includes(url), `${repo.name} #${number}: link related delivery ${url}.`);
        for (const checkpoint of confirmed.filter(one => one.merge!.number === number)) for (const dependency of checkpoint.dependsOn) {
          const url = effectiveCheckpoint(state, dependency)?.merge?.url; need(url && body.includes(url) && /depends on|after|before/i.test(body), `${repo.name} #${number}: state its required delivery order.`);
        }
      }
      result.state = review ? (confirmed.length ? "mixed" : "review") : (confirmed.length && !uncovered.length ? "delivered" : "unresolved");
      need(result.state !== "unresolved", `${repo.name}: no complete source-work delivery provenance.`);
    } catch (error) { result.state = "unresolved"; result.reasons.push((error as Error).message); if (sourceUnavailable(error)) { state.sourceUnavailable = true; state.lastReadError = (error as Error).message; } }
  }
  // A later repository's review link must also appear in earlier descriptions.
  const allLinks = results.flatMap(one => one.reviewPullRequest ? [one.reviewPullRequest.url] : []);
  for (const repo of context.record.repositories.filter(one => one.setupCompletedAt)) {
    const result = results.find(one => one.repository === repo.name)!;
    for (const number of [...state.checkpoints.filter(one => one.target.repository === `github.com/${repo.github}`.toLowerCase() && one.merge).map(one => one.merge!.number), ...(result.reviewPullRequest ? [result.reviewPullRequest.number] : [])]) {
      try { const pull = object(await github(context, `repos/${repo.github}/pulls/${number}`)); for (const url of allLinks) if (url !== pull.html_url) need(String(pull.body).includes(url), `${repo.name} #${number}: link related review ${url}.`); }
      catch (error) { result.state = "unresolved"; result.reasons.push((error as Error).message); if (sourceUnavailable(error)) { state.sourceUnavailable = true; state.lastReadError = (error as Error).message; } }
    }
  }
  for (const repo of context.record.repositories.filter(one => one.setupCompletedAt)) {
    const expected = checkedHeads.get(repo.name); const result = results.find(one => one.repository === repo.name)!;
    try {
      need(expected && await git(context, repo, ["rev-parse", "HEAD"]) === expected && await git(context, repo, ["status", "--porcelain", "--untracked-files=all"]) === "", `${repo.name}: workspace changed during completion reconciliation.`);
      if (result.state !== "unchanged") need((await git(context, repo, ["ls-remote", "origin", `refs/heads/${context.record.settings.featureBranch}`])).split(/\s/)[0] === expected, `${repo.name}: origin changed during completion reconciliation.`);
    } catch (error) { result.state = "unresolved"; result.reasons.push((error as Error).message); if (sourceUnavailable(error)) { state.sourceUnavailable = true; state.lastReadError = (error as Error).message; } }
  }
  state.repositoryResults = results; state.checkedAt = context.now(); state.currentComplete = global.length === 0 && results.length > 0 && results.every(one => one.state !== "unresolved");
  return { passed: state.currentComplete, pullRequests, checks: [{ name: "Development delivery and remaining review", passed: state.currentComplete, facts: [...global, ...results.map(one => `${one.repository}: ${one.state}${one.reasons.length ? ` — ${one.reasons.join(" ")}` : ""}`)] }] };
}
