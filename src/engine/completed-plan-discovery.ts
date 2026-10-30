/** Completed delivery is history; current plan checks never authorize another execution. */
import { createHash } from "node:crypto";
import { leavesOf } from "../plan/phase-plan.js";
import type { PrdRecord } from "../state/records.js";
import { judgedPhase, recordedPlan } from "./plan-reading.js";
import type { GitContext } from "./git-reads.js";
import { gitRead, observeGitPlan, remoteBase } from "./completed-plan-sources.js";
import { completedScopeProblems, observePlan, readBaseline, retainBaseline, type PlanBaseline, type PlanSource } from "./plan-reconciliation.js";
import { evaluateContinuationReadiness, retainContinuationProposal, type ContinuationProposal } from "./continuation-readiness.js";
import { accountCompletedLeaves, retainCompletionAccounting, type AccountedLeaf } from "./completed-plan-accounting.js";

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
  result?: CompletedPlanResult;
  earlierResult?: CompletedPlanResult;
}
export interface DiscoveryContext { record: PrdRecord; directory: string; shared: string; git: GitContext; attemptedAt: string; readProvenance?: (phaseKey: string) => Promise<{ passed: boolean; facts: string[] }> }
export class DiscoveryWriteFailure extends Error {}
function retainDiscoveryBaseline(directory: string, value: Omit<PlanBaseline, "id">): PlanBaseline {
  try { return retainBaseline(directory, value); }
  catch (error) {
    if ((error as Error).message.includes("plan_too_large")) throw error;
    throw new DiscoveryWriteFailure(`Plan evidence could not be durably retained. Restart Kiln before changing work: ${(error as Error).message}`, { cause: error });
  }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const semantic = (source: PlanSource) => hash({ phases: source.plan.phases.map(p => [p.id, source.scopes[p.id], p.closed]), requirements: source.requirements });

/** Today's source is never used as yesterday's baseline. */
async function completedBaseline(context: DiscoveryContext): Promise<PlanBaseline> {
  const { record, directory, shared, git } = context;
  if (record.planReconciliation?.baselineId) return readBaseline(directory, record.planReconciliation.baselineId);
  const revision = record.phases.pr?.repositories[record.repository.name]?.pushedSha
    ?? record.mergedBranches?.find(r => r.repository === record.repository.name)?.featureCommit;
  if (!revision || !record.plan?.length) throw new Error("baseline_unavailable: No retained accepted plan or recorded completion revision. Restore the original completion record and its Git revision, then check again; today's checkout cannot prove the earlier scope.");
  let source: PlanSource;
  try { source = await observeGitPlan(git, shared, record.prdDirectory, revision); }
  catch (error) { throw new Error(`baseline_unavailable: Restore the recorded completion revision ${revision} and required documents, then check again. ${(error as Error).message}`, { cause: error }); }
  if (JSON.stringify(recordedPlan(source.plan)) !== JSON.stringify(record.plan)) throw new Error(`baseline_unavailable: Plan at recorded completion revision ${revision} does not match saved phase identities, closure and structure. Restore the matching completion record/revision and check again.`);
  const completions: PlanBaseline["completions"] = {};
  for (const phase of leavesOf(source.plan)) {
    if (!phase.closed) throw new Error(`baseline_unavailable: Phase ${phase.id} was not closed at recorded completion ${revision}. Restore its completion evidence.`);
    const owner = Object.entries(record.phases).find(([id, facts]) => facts.doneAt && judgedPhase(source.plan.phases, id)?.id === phase.id);
    if (!owner) throw new Error(`baseline_unavailable: Phase ${phase.id} has no recorded completion receipt. Restore its earlier receipt before checking again.`);
    completions[phase.id] = { kind: owner[1].sessionIds.length ? "kiln" : "external", doneAt: owner[1].doneAt!, revision, repositories: Object.fromEntries(Object.entries(owner[1].repositories).flatMap(([name, facts]) => facts.pushedSha ? [[name, { identity: record.repositories.find(r => r.name === name)!.github, revision: facts.pushedSha }]] : [])) };
  }
  return retainDiscoveryBaseline(directory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: record.prdDirectory, active: source, sources: [], completions });
}

export async function discoverCompletedPlan(context: DiscoveryContext): Promise<CompletedPlanCheck> {
  const { record, shared, git, directory, attemptedAt } = context;
  const previous = record.completedPlanCheck;
  const earlierResult = previous?.result ?? previous?.earlierResult;
  const check: CompletedPlanCheck = { status: "failed", attemptedAt, sources: [], errors: [], ...(previous?.lastSuccessfulAt ? { lastSuccessfulAt: previous.lastSuccessfulAt } : {}), ...(earlierResult ? { earlierResult } : {}) };
  const repo = record.repositories.find(r => r.kind === "prd");
  const branch = repo?.baseBranch ?? record.settings.baseBranch;
  let local: PlanSource | undefined; let remote: PlanSource | undefined; let revision: string | undefined; let baseline: PlanBaseline | undefined;
  const localFact: DiscoverySource = { kind: "shared", path: shared };
  const remoteFact: DiscoverySource = { kind: "delivery_base", path: `${shared} / origin/${branch}` };
  check.sources.push(localFact, remoteFact);
  try { local = observePlan(shared, record.prdDirectory); localFact.digest = local.digest; localFact.revision = (await gitRead(git, shared, ["rev-parse", "HEAD"])).trim(); }
  catch (error) { localFact.error = (error as Error).message; check.errors.push(localFact.error); }
  try { revision = await remoteBase(git, shared, branch); remoteFact.revision = revision; remote = await observeGitPlan(git, shared, record.prdDirectory, revision); remoteFact.digest = remote.digest; }
  catch (error) { remoteFact.error = (error as Error).message; check.errors.push(remoteFact.error); }
  try { baseline = await completedBaseline(context); }
  catch (error) { if (error instanceof DiscoveryWriteFailure) throw error; check.errors.push((error as Error).message); }
  if (check.errors.length || !local || !remote || !baseline || !revision) return check;
  try {
    const old = baseline.active;
    const localChanged = semantic(local) !== semantic(old); const remoteChanged = semantic(remote) !== semantic(old);
    const conflicts = [...new Set([...completedScopeProblems(old, local), ...completedScopeProblems(old, remote)])];
    const problems = [...conflicts];
    if (localChanged && remoteChanged && semantic(local) !== semantic(remote)) problems.push("source_conflict: Shared checkout and delivery base contain different revised scope. Reconcile the governing documents, commit/integrate the agreed plan, then check again.");
    const selected = !localChanged || semantic(local) === semantic(remote) ? remote : local;
    const source = selected === remote ? remoteFact : localFact;
    const unintegratedDocuments = [...new Set([...Object.keys(selected.documents), ...Object.keys(remote.documents)])].filter(file => selected.documents[file] !== remote.documents[file]);
    if (unintegratedDocuments.length) problems.push(`Revised documents are not together in origin/${branch}: ${unintegratedDocuments.join(", ")}. Commit/integrate the coherent document set, then check again.`);
    const accounting = await accountCompletedLeaves({ record, baseline, candidate: selected, git, shared, verifiedAt: attemptedAt, ...(context.readProvenance ? { readProvenance: context.readProvenance } : {}) });
    const proposal = await evaluateContinuationReadiness({ record, baseline, candidate: selected, accounting, git, shared, directory, problems });
    problems.splice(0, problems.length, ...proposal.problems);
    // Recheck before publishing: slow Git reads must not bless a moving shared checkout/base.
    if (observePlan(shared, record.prdDirectory).digest !== local.digest || await remoteBase(git, shared, branch, false) !== revision) throw new Error("source_changed: The shared documents or delivery base changed during this check. Check for new phases again.");
    git.signal?.throwIfAborted();
    const candidate = retainDiscoveryBaseline(directory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: record.prdDirectory, active: selected, sources: [local, remote], completions: baseline.completions });
    let retained;
    try { retained = retainCompletionAccounting(directory, accounting); retainContinuationProposal(directory, proposal); }
    catch (error) { throw new DiscoveryWriteFailure(`Completion evidence could not be durably retained. Restart Kiln before changing work: ${(error as Error).message}`, { cause: error }); }
    const added = accounting.leaves.filter(p => p.classification === "new_unfinished").map(({ id, title, file }) => ({ id, title, file }));
    check.result = { baselineId: baseline.id, candidateId: candidate.id, source, added, earlierWorkChanges: conflicts, unintegratedDocuments, problems: [...new Set(problems)], accountingId: retained.id, leaves: retained.leaves, proposal };
    check.status = problems.length ? "blocked" : added.length ? "available" : "unchanged";
    check.lastSuccessfulAt = attemptedAt;
    delete check.earlierResult;
    return check;
  } catch (error) { if (error instanceof DiscoveryWriteFailure) throw error; check.errors.push((error as Error).message); return check; }
}
