/** Completed delivery is history; current plan checks never authorize another execution. */
import { closedWaiver } from "./waivers.js";
import { createHash } from "node:crypto";
import { leavesOf } from "../plan/phase-plan.js";
import type { PrdRecord } from "../state/records.js";
import { judgedPhase, recordedPlan } from "./plan-reading.js";
import type { GitContext } from "./git-reads.js";
import { gitRead, observeGitPlan, remoteBase } from "./completed-plan-sources.js";
import { PLAN_NORMALIZER_VERSION, PlanCapacityError, PlanBaselineWriteFailure, phaseRepositories, completedPhaseScopeUnchanged, comparisonBaseline, completedScopeProblems, observePlan, retainBaseline, type PlanBaseline, type PlanSource } from "./plan-reconciliation.js";
import { evaluateContinuationReadiness, retainContinuationProposal, type ContinuationProposal } from "./continuation-readiness.js";
import { accountCompletedLeaves, retainCompletionAccounting, type AccountedLeaf } from "./completed-plan-accounting.js";
import type { ContinuationInputObservation } from "./continuation-authority.js";

export interface DiscoverySource { kind: "shared" | "delivery_base"; path: string; revision?: string; digest?: string; error?: string }
export interface DiscoveredPhase { id: string; title: string; file: string }
export interface CompletedPlanResult {
  baselineId: string;
  candidateId: string;
  source: DiscoverySource;
  added: DiscoveredPhase[];
  earlierWorkChanges: string[];
  /** Exact relevant documents absent from the selected delivery base. */
  unintegratedDocuments: string[];
  problems: string[];
  /** Immutable classification evidence; absent on legacy observations. Not a proposal. */
  proposal?: ContinuationProposal;
  accountingId?: string;
  leaves?: AccountedLeaf[];
}
export interface CompletedPlanCheck {
  status: "checking" | "unchanged" | "available" | "blocked" | "failed";
  attemptedAt: string;
  lastSuccessfulAt?: string;
  sources: DiscoverySource[];
  errors: string[];
  failure?: { code: "plan_too_large"; limit: number; resource: string };
  result?: CompletedPlanResult;
  earlierResult?: CompletedPlanResult;
}
export interface DiscoveryContext { codex?: string | undefined; record: PrdRecord; directory: string; shared: string; git: GitContext; attemptedAt: string; observeInput?: (observation: ContinuationInputObservation) => void }
export class DiscoveryWriteFailure extends Error {}
function retainDiscoveryBaseline(directory: string, value: Omit<PlanBaseline, "id">): PlanBaseline {
  try { return retainBaseline(directory, value); }
  catch (error) {
    if (error instanceof PlanCapacityError) throw error;
    throw new DiscoveryWriteFailure(`Plan evidence could not be durably retained. Restart Kiln before changing work: ${(error as Error).message}`, { cause: error });
  }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const semantic = (source: PlanSource) => hash({ phases: source.plan.phases.map(p => [p.id, source.scopes[p.id], p.closed]), requirements: source.requirements });

/** Today's source is never used as yesterday's baseline. */
async function completedBaseline(context: DiscoveryContext): Promise<PlanBaseline> {
  const { record, directory, shared, git } = context;
  if (record.planReconciliation?.baselineId) return comparisonBaseline(directory, record.planReconciliation.baselineId, { repositoryName: record.repository.name, read: revision => observeGitPlan(git, shared, record.prdDirectory, revision) });
  const revision = record.phases.pr?.repositories[record.repository.name]?.pushedSha
    ?? record.mergedBranches?.find(r => r.repository === record.repository.name)?.featureCommit
    // Final delivery completed on waived work: the plan at its waived head, from the local repository (waivers "Continuation executions").
    ?? record.phases.pr?.repositories[record.repository.name]?.waivedHead;
  if (!revision || !record.plan?.length) throw new Error("baseline_unavailable: No retained accepted plan or recorded completion revision. Restore the original completion record and its Git revision, then check again; today's checkout cannot prove the earlier scope.");
  let source: PlanSource;
  try { source = await observeGitPlan(git, shared, record.prdDirectory, revision); }
  catch (error) { if (error instanceof PlanCapacityError) throw error; throw new Error(`baseline_unavailable: Restore the recorded completion revision ${revision} and required documents, then check again. ${(error as Error).message}`, { cause: error }); }
  if (JSON.stringify(recordedPlan(source.plan)) !== JSON.stringify(record.plan)) throw new Error(`baseline_unavailable: Plan at recorded completion revision ${revision} does not match saved phase identities, closure and structure. Restore the matching completion record/revision and check again.`);
  const completions: PlanBaseline["completions"] = {};
  for (const phase of leavesOf(source.plan)) {
    const waiverId = record.phases[phase.id]?.skippedByWaiver ?? closedWaiver(record.waivers, phase.id)?.waiverId;
    if (!phase.closed && !waiverId) throw new Error(`baseline_unavailable: Phase ${phase.id} was not closed at recorded completion ${revision}. Restore its completion evidence.`);
    const owner = Object.entries(record.phases).find(([id, facts]) => (facts.doneAt || facts.skippedByWaiver) && judgedPhase(source.plan.phases, id)?.id === phase.id);
    if (!owner) throw new Error(`baseline_unavailable: Phase ${phase.id} has no recorded completion receipt. Restore its earlier receipt before checking again.`);
    completions[phase.id] = { kind: owner[1].sessionIds.length ? "kiln" : "external", ...(waiverId ? { waiverId } : {}), scopeRepositories: phaseRepositories(source, phase.id), doneAt: owner[1].doneAt ?? record.completedAt!, revision, repositories: Object.fromEntries(Object.entries(owner[1].repositories).flatMap(([name, facts]) => facts.pushedSha ? [[name, { identity: record.repositories.find(r => r.name === name)!.github, revision: facts.pushedSha }]] : facts.waivedHead ? [[name, { identity: record.repositories.find(r => r.name === name)!.github, revision: facts.waivedHead, waived: true as const }]] : [])) };
  }
  for (const [id, completion] of Object.entries(completions)) {
    const workRevision = completion.repositories?.[record.repository.name]?.revision ?? completion.revision!;
    const historical = workRevision === revision ? source : await observeGitPlan(git, shared, record.prdDirectory, workRevision);
    if (!historical.plan.phases.some(phase => phase.id === id && (phase.closed || completion.waiverId) && !phase.splitInto) || !completedPhaseScopeUnchanged(historical, source, id)) throw new Error(`baseline_unavailable: Phase ${id} differs from its original completion revision ${workRevision}. Restore its matching receipt and check again.`);
    completion.scopeRepositories = phaseRepositories(historical, id);
  }
  return retainDiscoveryBaseline(directory, { formatVersion: 1, normalizerVersion: PLAN_NORMALIZER_VERSION, prdDirectory: record.prdDirectory, active: source, sources: [], completions });
}

export async function discoverCompletedPlan(context: DiscoveryContext): Promise<CompletedPlanCheck> {
  const { record, shared, git, directory, attemptedAt } = context;
  context.observeInput?.({ kind: "settings", digest: hash(record.settings) });
  const previous = record.completedPlanCheck;
  const earlierResult = previous?.result ?? previous?.earlierResult;
  const check: CompletedPlanCheck = { status: "failed", attemptedAt, sources: [], errors: [], ...(previous?.lastSuccessfulAt ? { lastSuccessfulAt: previous.lastSuccessfulAt } : {}), ...(earlierResult ? { earlierResult } : {}) };
  const failed = (error: unknown) => {
    if (error instanceof DiscoveryWriteFailure) throw error;
    if (error instanceof PlanBaselineWriteFailure) throw new DiscoveryWriteFailure(error.message, { cause: error });
    check.errors.push((error as Error).message);
    if (error instanceof PlanCapacityError) check.failure = { code: error.code, limit: error.limit, resource: error.resource };
  };
  const repo = record.repositories.find(r => r.kind === "prd");
  const branch = repo?.baseBranch ?? record.settings.baseBranch;
  let local: PlanSource | undefined; let remote: PlanSource | undefined; let revision: string | undefined; let baseline: PlanBaseline | undefined;
  const localFact: DiscoverySource = { kind: "shared", path: shared };
  const remoteFact: DiscoverySource = { kind: "delivery_base", path: `${shared} / origin/${branch}` };
  check.sources.push(localFact, remoteFact);
  try { local = observePlan(shared, record.prdDirectory); localFact.digest = local.digest; localFact.revision = (await gitRead(git, shared, ["rev-parse", "HEAD"])).trim(); }
  catch (error) { localFact.error = (error as Error).message; failed(error); }
  try { revision = await remoteBase(git, shared, branch, true, observed => { remoteFact.revision = observed; context.observeInput?.({ kind: "base", repository: record.repository.name, branch, revision: observed }); }); remote = await observeGitPlan(git, shared, record.prdDirectory, revision); remoteFact.digest = remote.digest; }
  catch (error) { remoteFact.error = (error as Error).message; failed(error); }
  try { baseline = await completedBaseline(context); }
  catch (error) { failed(error); }
  // A changed local candidate is known even if another required source failed.
  if (local) context.observeInput?.({ kind: "shared_documents", digest: local.digest });
  if (check.errors.length || !local || !remote || !baseline || !revision) return check;
  try {
    const old = baseline.active;
    const localChanged = semantic(local) !== semantic(old); const remoteChanged = semantic(remote) !== semantic(old);
    const conflicts = [...new Set([...completedScopeProblems(old, local, baseline.completions), ...completedScopeProblems(old, remote, baseline.completions)])];
    const problems = [...conflicts];
    if (localChanged && remoteChanged && semantic(local) !== semantic(remote)) problems.push("source_conflict: Shared checkout and delivery base contain different revised scope. Reconcile the governing documents, commit/integrate the agreed plan, then check again.");
    const selected = !localChanged || semantic(local) === semantic(remote) ? remote : local;
    context.observeInput?.({ kind: "candidate", digest: selected.digest });
    const source = selected === remote ? remoteFact : localFact;
    const unintegratedDocuments = [...new Set([...Object.keys(selected.documents), ...Object.keys(remote.documents)])].filter(file => selected.documents[file] !== remote.documents[file]);
    if (unintegratedDocuments.length) problems.push(`Revised documents are not together in origin/${branch}: ${unintegratedDocuments.join(", ")}. Commit/integrate the coherent document set, then check again.`);
    const accounting = await accountCompletedLeaves({ record, baseline, candidate: selected, git, shared, verifiedAt: attemptedAt, ...(context.observeInput ? { observeInput: context.observeInput } : {}) });
    const proposal = await evaluateContinuationReadiness({ record, baseline, candidate: selected, accounting, git, shared, directory, problems, sharedDigest: local.digest, codex: context.codex, ...(context.observeInput ? { observeInput: context.observeInput } : {}) });
    problems.splice(0, problems.length, ...proposal.problems);
    // Recheck before publishing: slow Git reads must not bless a moving shared checkout/base.
    const currentLocal = observePlan(shared, record.prdDirectory);
    context.observeInput?.({ kind: "shared_documents", digest: currentLocal.digest });
    const currentRevision = await remoteBase(git, shared, branch, false);
    context.observeInput?.({ kind: "base", repository: record.repository.name, branch, revision: currentRevision });
    if (currentLocal.digest !== local.digest || currentRevision !== revision) throw new Error("source_changed: The shared documents or delivery base changed during this check. Check for new phases again.");
    git.signal?.throwIfAborted();
    const candidate = retainDiscoveryBaseline(directory, { formatVersion: 1, normalizerVersion: PLAN_NORMALIZER_VERSION, prdDirectory: record.prdDirectory, active: selected, sources: [local, remote], completions: baseline.completions });
    let retained;
    try { retained = retainCompletionAccounting(directory, accounting); retainContinuationProposal(directory, proposal); }
    catch (error) { if (error instanceof PlanCapacityError) throw error; throw new DiscoveryWriteFailure(`Completion evidence could not be durably retained. Restart Kiln before changing work: ${(error as Error).message}`, { cause: error }); }
    const added = accounting.leaves.filter(p => p.classification === "new_unfinished").map(({ id, title, file }) => ({ id, title, file }));
    check.result = { baselineId: baseline.id, candidateId: candidate.id, source, added, earlierWorkChanges: conflicts, unintegratedDocuments, problems: [...new Set(problems)], accountingId: retained.id, leaves: retained.leaves, proposal };
    check.status = problems.length ? "blocked" : added.length ? "available" : "unchanged";
    check.lastSuccessfulAt = attemptedAt;
    delete check.earlierResult;
    return check;
  } catch (error) { failed(error); return check; }
}
