/**
 * The check for new phases on a finished run (Kiln After Delivery technical design, "The Plan Check
 * on a Finished Run"): is the delivery still waiting to merge, which one copy of the plan to read,
 * and which of its phases are unfinished. Completed delivery is history; a check never authorizes
 * another execution.
 */
import { closedWaiver } from "./waivers.js";
import { createHash } from "node:crypto";
import { isAncestorOf } from "../plan/phase-ids.js";
import { leavesOf } from "../plan/phase-plan.js";
import { activityKeyKind } from "../state/activity-keys.js";
import type { PrdRecord } from "../state/records.js";
import { judgedPhase, planStructure, recordedPlan } from "./plan-reading.js";
import { gitError, runGit, type GitContext } from "./git-reads.js";
import { gitRead, observeGitPlan, remoteBase } from "./completed-plan-sources.js";
import { PLAN_NORMALIZER_VERSION, PlanCapacityError, PlanBaselineWriteFailure, phaseRepositories, completedPhaseScopeUnchanged, comparisonBaseline, retainBaseline, type PlanBaseline, type PlanSource } from "./plan-reconciliation.js";
import { evaluateContinuationReadiness, retainContinuationProposal, type ContinuationProposal, type ProposalSource, type UnpushedCommit } from "./continuation-readiness.js";
import { accountCompletedLeaves, retainCompletionAccounting, type AccountedLeaf } from "./completed-plan-accounting.js";
import type { ContinuationInputObservation } from "./continuation-authority.js";
import type { AwaitingMerge } from "./awaiting-merge.js";
import { findMainCheckout } from "./delivery-reading.js";

export interface DiscoveredPhase { id: string; title: string; file: string }
export interface CompletedPlanResult {
  baselineId: string;
  candidateId: string;
  /** The one copy of the plan read (AC-BACK-03): the remote base, or the main checkout's tip commit. */
  source: ProposalSource;
  /** The main checkout was not read because it is on another branch. */
  notRead?: { reason: "other_branch"; branch: string };
  /** This PRD's documents with uncommitted changes in the main checkout, never read. */
  uncommitted: string[];
  /** Where the unfinished phases came from (AC-BACK-04). */
  origin?: { kind: "commit"; revision: string; committedAt: string; subject: string } | { kind: "unpushed" };
  added: DiscoveredPhase[];
  problems: string[];
  /** Immutable classification evidence; absent on legacy observations. Not a proposal. */
  proposal?: ContinuationProposal;
  accountingId?: string;
  leaves?: AccountedLeaf[];
  /** The latest push of the plan whose re-check produced an offer of this scope (Kiln After Delivery, "Data Models"). */
  followsPush?: string;
}
export interface CompletedPlanCheck {
  status: "checking" | "unchanged" | "available" | "blocked" | "failed" | "awaiting_merge";
  attemptedAt: string;
  lastSuccessfulAt?: string;
  errors: string[];
  failure?: { code: "plan_too_large"; limit: number; resource: string };
  result?: CompletedPlanResult;
  earlierResult?: CompletedPlanResult;
  /** The delivery waits to merge (AC-WAIT-01): the pull request the card's line names. */
  awaitingMerge?: AwaitingMerge;
}
/**
 * What the delivery reading decided before the check (technical design, "The Delivery Reading"):
 * `waiting` is undefined when GitHub could not say; `merged` maps a repository to the merge commit of
 * its delivery pull request; `closed` lists the delivery's pull requests read closed without merging.
 */
export interface DeliveryDecision {
  waiting: boolean | undefined;
  awaiting?: AwaitingMerge;
  failure?: string;
  merged: Record<string, string>;
  closed: { repository: string; number: number }[];
}
export interface DiscoveryContext { /** The agent a continuation's preparation turn runs on (Kiln Phase Model Tiers AC-AGENTS-04). */ agentId: import("../state/records.js").AgentId; codex?: string | undefined; record: PrdRecord; directory: string; shared: string; git: GitContext; attemptedAt: string; delivery: DeliveryDecision; observeInput?: (observation: ContinuationInputObservation) => void; /** What a repository is shown by (find repositories anywhere AC-FOLDER-02). */ label?: (name: string) => string }
export class DiscoveryWriteFailure extends Error {}
function retainDiscoveryBaseline(directory: string, value: Omit<PlanBaseline, "id">): PlanBaseline {
  try { return retainBaseline(directory, value); }
  catch (error) {
    if (error instanceof PlanCapacityError) throw error;
    throw new DiscoveryWriteFailure(`Plan evidence could not be durably retained. Restart Kiln before changing work: ${(error as Error).message}`, { cause: error });
  }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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
  if (JSON.stringify(planStructure(recordedPlan(source.plan))) !== JSON.stringify(planStructure(record.plan))) throw new Error(`baseline_unavailable: Plan at recorded completion revision ${revision} does not match saved phase identities, closure and structure. Restore the matching completion record/revision and check again.`);
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


/**
 * The run's completion record (technical design, "The Plan Check", step 3): the retained baseline's
 * completions, together with every phase of the finished execution whose facts show it done (Mark
 * complete included) or skipped on a waiver, each mapped to a plan id against the execution's
 * recorded plan. The plan read now is never used, so a finished phase that later gained phases
 * beneath it keeps its own id. Only phase facts count, never final delivery, an audit or a preflight.
 */
export function completionRecord(record: PrdRecord, baseline: Pick<PlanBaseline, "completions">): PlanBaseline["completions"] {
  const completions = { ...baseline.completions };
  const plan = record.plan ?? [];
  for (const [key, facts] of Object.entries(record.phases)) {
    if (activityKeyKind(key) !== "phase" || !facts.doneAt && !facts.skippedByWaiver) continue;
    const phase = judgedPhase(plan, key);
    if (!phase || phase.splitInto !== undefined || completions[phase.id]) continue;
    const prd = facts.repositories[record.repository.name];
    const revision = prd?.pushedSha ?? prd?.waivedHead;
    const waiverId = facts.skippedByWaiver ?? facts.waiverId ?? closedWaiver(record.waivers, phase.id)?.waiverId;
    const scopeRepositories = [...new Set(plan.filter(one => one.id === phase.id || isAncestorOf(one.id, phase.id)).flatMap(one => one.repositories))].sort();
    completions[phase.id] = { kind: facts.sessionIds.length ? "kiln" : "external", ...(waiverId ? { waiverId } : {}), scopeRepositories, ...(facts.doneAt ? { doneAt: facts.doneAt } : {}), ...(revision ? { revision } : {}),
      repositories: Object.fromEntries(Object.entries(facts.repositories).flatMap(([name, work]) => {
        const identity = record.repositories.find(entry => entry.name === name)?.github;
        return !identity ? [] : work.pushedSha ? [[name, { identity, revision: work.pushedSha }]] : work.waivedHead ? [[name, { identity, revision: work.waivedHead, waived: true as const }]] : [];
      })) };
  }
  return completions;
}

/**
 * This PRD's documents with uncommitted changes in the main checkout, untracked files included and
 * both names of a rename, listed by name and never read (AC-BACK-03).
 */
async function uncommittedDocuments(git: GitContext, path: string, prdDirectory: string, documents: string[]): Promise<string[]> {
  const output = await gitRead(git, path, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", prdDirectory, ...documents]);
  const names = new Set<string>();
  const entries = output.split("\0");
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.length < 4) continue;
    names.add(entry.slice(3));
    // A rename or copy is followed by its original name.
    if (/^[RC]|^.[RC]/.test(entry)) { const original = entries[++index]; if (original) names.add(original); }
  }
  const relevant = new Set(documents);
  return [...names].filter(name => relevant.has(name) || name.startsWith(`${prdDirectory}/`)).sort();
}

/**
 * The commits the main checkout's base branch holds beyond the remote base, oldest first, each
 * marked as touching only this PRD's documents or not (Kiln After Delivery, "Continue and the Push Session").
 */
async function unpushedCommits(git: GitContext, path: string, remote: string, tip: string, prdDirectory: string, documents: string[]): Promise<UnpushedCommit[]> {
  const ours = new Set(documents);
  const rows = (await gitRead(git, path, ["log", "--reverse", "--format=%x1e%H%x1f%s", "--name-only", "--no-renames", "--diff-merges=first-parent", `${remote}..${tip}`])).split("\x1e").filter(row => row.trim());
  return rows.map(row => {
    const [head, ...files] = row.split("\n");
    const [sha, subject] = head!.split("\x1f");
    const touched = files.map(file => file.trim()).filter(Boolean);
    return { sha: sha!, subject: subject ?? "", onlyDocuments: touched.every(file => ours.has(file) || file.startsWith(`${prdDirectory}/`)) };
  });
}

/** The checkout's current branch, or undefined when HEAD is detached. */
async function currentBranch(git: GitContext, path: string): Promise<string | undefined> {
  const result = await runGit(git, path, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (result.exitCode === 0) return result.stdout.trim();
  if (result.exitCode === 1) return undefined;
  throw new Error(`Could not read the main checkout's branch: ${gitError(result)}`);
}

export async function discoverCompletedPlan(context: DiscoveryContext): Promise<CompletedPlanCheck> {
  const { record, shared, git, directory, attemptedAt, delivery } = context;
  context.observeInput?.({ kind: "settings", digest: hash(record.settings) });
  const previous = record.completedPlanCheck;
  const earlierResult = previous?.result ?? previous?.earlierResult;
  const check: CompletedPlanCheck = { status: "failed", attemptedAt, errors: [], ...(previous?.lastSuccessfulAt ? { lastSuccessfulAt: previous.lastSuccessfulAt } : {}), ...(earlierResult ? { earlierResult } : {}) };
  const failed = (error: unknown) => {
    if (error instanceof DiscoveryWriteFailure) throw error;
    if (error instanceof PlanBaselineWriteFailure) throw new DiscoveryWriteFailure(error.message, { cause: error });
    // The reason is shown as written, without the internal problem code it starts with (AC-BACK-01).
    check.errors.push((error as Error).message.replace(/^[a-z]+(?:_[a-z]+)+: /, ""));
    if (error instanceof PlanCapacityError) check.failure = { code: error.code, limit: error.limit, resource: error.resource };
  };
  // 1. Waiting: no plan is read, whatever the base branch or the main checkout holds (AC-WAIT-01).
  if (delivery.waiting === true) {
    check.status = "awaiting_merge"; check.awaitingMerge = delivery.awaiting!; check.lastSuccessfulAt = attemptedAt;
    delete check.earlierResult;
    return check;
  }
  if (delivery.waiting === undefined) { failed(new Error(delivery.failure ?? "GitHub could not be read, so Kiln cannot tell whether the delivery has merged. Check for new phases again.")); return check; }
  // 2. One source (AC-BACK-03): the main checkout must be found first.
  const found = await findMainCheckout(git, record.repository.mainCheckoutPath, record.repository.github);
  if (!found.ok) { failed(new Error(found.problem)); return check; }
  const repo = record.repositories.find(r => r.kind === "prd");
  const branch = repo?.baseBranch ?? record.settings.baseBranch;
  try {
    const revision = await remoteBase(git, shared, branch, true, observed => context.observeInput?.({ kind: "base", repository: record.repository.name, branch, revision: observed }));
    const remote = await observeGitPlan(git, shared, record.prdDirectory, revision);
    const baseline = await completedBaseline(context);
    // 3. What is finished: the run's completion record, whatever a finished phase's document now says (AC-BACK-01).
    const completions = completionRecord(record, baseline);
    const checkout = await currentBranch(git, shared);
    let selected: PlanSource = remote;
    let source: ProposalSource = { kind: "remote_base", branch, revision };
    let notRead: CompletedPlanResult["notRead"];
    if (checkout === branch) {
      const tip = (await gitRead(git, shared, ["rev-parse", "HEAD"])).trim();
      const ahead = tip === revision ? 0 : Number((await gitRead(git, shared, ["rev-list", "--count", `${revision}..${tip}`])).trim());
      if (ahead > 0) {
        const local = await observeGitPlan(git, shared, record.prdDirectory, tip);
        const remoteIds = new Set(remote.plan.phases.map(phase => phase.id));
        if (leavesOf(local.plan).some(leaf => !leaf.closed && !completions[leaf.id] && !remoteIds.has(leaf.id))) { selected = local; source = { kind: "main_checkout", branch, revision: tip }; }
      }
    } else notRead = { reason: "other_branch", branch: checkout ?? "a detached HEAD" };
    context.observeInput?.({ kind: "candidate", digest: selected.digest });
    const uncommitted = await uncommittedDocuments(git, shared, record.prdDirectory, Object.keys(selected.documents));
    const commits = source.kind === "main_checkout" ? await unpushedCommits(git, shared, revision, source.revision, record.prdDirectory, Object.keys(selected.documents)) : undefined;
    const finished: PlanBaseline = { ...baseline, completions };
    const accounting = await accountCompletedLeaves({ record, baseline: finished, candidate: selected, git, shared, verifiedAt: attemptedAt, ...(context.observeInput ? { observeInput: context.observeInput } : {}), ...(context.label ? { label: context.label } : {}) });
    // The phases this execution itself completed: a confirmed merge of its pull request proves their work is in the base (step 4).
    const executionFinished = new Set(Object.entries(record.phases).flatMap(([key, facts]) => activityKeyKind(key) === "phase" && facts.doneAt ? [judgedPhase(record.plan ?? [], key)?.id].filter((id): id is string => !!id) : []));
    const proposal = await evaluateContinuationReadiness({ record, baseline: finished, candidate: selected, accounting, git, shared, directory, problems: [], source, ...(commits ? { commits } : {}), delivery: { merged: delivery.merged, closed: delivery.closed, executionFinished }, agentId: context.agentId, codex: context.codex, ...(context.observeInput ? { observeInput: context.observeInput } : {}) });
    const added = accounting.leaves.filter(p => p.classification === "new_unfinished").map(({ id, title, file }) => ({ id, title, file }));
    // Where the phases came from (AC-BACK-04): the most recent commit that added one of their documents.
    let origin: CompletedPlanResult["origin"];
    if (added.length && source.kind === "main_checkout") origin = { kind: "unpushed" };
    else if (added.length) {
      const row = (await gitRead(git, shared, ["log", "-1", "--diff-filter=A", "--format=%H%x1f%cI%x1f%s", revision, "--", ...added.map(phase => phase.file)])).trim();
      const [commit, committedAt, subject] = row.split("\x1f");
      if (commit && committedAt) origin = { kind: "commit", revision: commit, committedAt, subject: subject ?? "" };
    }
    // The final guard against a moving source compares commits, never files.
    const currentRevision = await remoteBase(git, shared, branch, false);
    context.observeInput?.({ kind: "base", repository: record.repository.name, branch, revision: currentRevision });
    if (currentRevision !== revision) throw new Error("source_changed: The delivery base changed during this check. Check for new phases again.");
    if (source.kind === "main_checkout" && (await currentBranch(git, shared) !== branch || (await gitRead(git, shared, ["rev-parse", "HEAD"])).trim() !== source.revision)) throw new Error("source_changed: The main checkout's base branch moved during this check. Check for new phases again.");
    git.signal?.throwIfAborted();
    const candidate = retainDiscoveryBaseline(directory, { formatVersion: 1, normalizerVersion: PLAN_NORMALIZER_VERSION, prdDirectory: record.prdDirectory, active: selected, sources: [], completions });
    let retained;
    try { retained = retainCompletionAccounting(directory, accounting); retainContinuationProposal(directory, proposal); }
    catch (error) { if (error instanceof PlanCapacityError) throw error; throw new DiscoveryWriteFailure(`Completion evidence could not be durably retained. Restart Kiln before changing work: ${(error as Error).message}`, { cause: error }); }
    const problems = [...new Set(proposal.problems)];
    check.result = { baselineId: baseline.id, candidateId: candidate.id, source, ...(notRead ? { notRead } : {}), uncommitted, ...(origin ? { origin } : {}), added, problems, accountingId: retained.id, leaves: retained.leaves, proposal };
    // Phases closed outside the run no longer change the status when nothing is unfinished.
    check.status = !added.length ? "unchanged" : problems.length ? "blocked" : "available";
    check.lastSuccessfulAt = attemptedAt;
    delete check.earlierResult;
    return check;
  } catch (error) { failed(error); return check; }
}
