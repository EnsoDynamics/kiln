import { newPreparationState } from "./preparation-state.js";
import { preparationPermissions } from "./preparation-permissions.js";
/** Read-only proposal evaluation. Acceptance and setup remain owned by the continuation command. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseGithubOrigin } from "../github-origin.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { isAncestorOf } from "../plan/phase-ids.js";
import { dependencyIds, leavesOf } from "../plan/phase-plan.js";
import type { PrdRecord } from "../state/records.js";
import type { CompletionAccounting } from "./completed-plan-accounting.js";
import { gitRead, remoteBase, observeGitPlan } from "./completed-plan-sources.js";
import { runGit, originBranches, type GitContext } from "./git-reads.js";
import { PLAN_LIMIT, PlanCapacityError, phaseRepositories, completedPhaseScopeUnchanged, type PlanBaseline, type PlanSource } from "./plan-reconciliation.js";
import { extractPreparation, type PreparationInstruction } from "./preparation-documents.js";
const authorityDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
import { readPendingAuthority, pendingForProposal } from "./continuation-authority.js";
import { mergeTargetKey, type MergeTarget } from "../state/development-delivery.js";
import { findRepository, repositoriesParent } from "./repositories.js";
import { defaultBaseBranch, expandHome } from "./worktree-setup.js";

export interface ReadinessPrerequisite { phaseId: string; status: "integrated_verified" | "preparation_available" | "blocked" | "unknown"; evidence: string[]; recovery?: string }
export interface PreparationBinding extends PreparationInstruction { sourceRevision: string; repositoryIdentity: string; baseBranch: string; baseRevision: string; authorization: "phase_preparation" | "delivery_target"; valid: boolean }
export interface ContinuationProposal {
  formatVersion: 1; id: string; completedExecutionId: string; baselineId: string; candidateDigest: string;
  added: { id: string; title: string; file: string }[]; firstEligiblePhase?: string;
  readiness: "ready" | "blocked"; problems: string[]; prerequisites: ReadinessPrerequisite[];
  repositories: { name: string; identity: string; path: string; baseBranch: string; baseRevision: string }[];
  preparation: PreparationBinding[]; settingsDigest: string;
  permissionDigest?: string; scopeDigest?: string; grantEligible?: boolean;
  authorization?: { revision: number; executionId?: string; superseded: boolean; targets: { target: MergeTarget; granted: boolean }[] };
}
export interface ReadinessInput {
  codex?: string | undefined;
  record: PrdRecord; baseline: PlanBaseline; candidate: PlanSource; accounting: Omit<CompletionAccounting, "id">;
  git: GitContext; shared: string; directory: string; problems: string[];
}
export async function evaluateContinuationReadiness(input: ReadinessInput): Promise<ContinuationProposal> {
  const { record, baseline, candidate, accounting, git, shared } = input;
  if (!record.executionId) throw new Error("baseline_unavailable: restore the completed execution identity before building an offer.");
  const problems = [...input.problems]; const repositories: ContinuationProposal["repositories"] = [];
  const added = accounting.leaves.filter(row => row.classification === "new_unfinished").map(({ id, title, file }) => ({ id, title, file }));
  const first = leavesOf(candidate.plan).find(phase => added.some(row => row.id === phase.id));
  const preparation: PreparationBinding[] = []; const prerequisites: ReadinessPrerequisite[] = [];
  const names = added.length ? [...new Set([record.repository.name, ...candidate.plan.phases.flatMap(phase => phase.repositories)])] : [];
  for (const name of names) {
    let repo: { mainCheckoutPath: string; github: string; baseBranch: string } | undefined = record.repositories.find(one => one.name === name);
    if (!repo) {
      const found = await findRepository(git, repositoriesParent(shared), name, first?.fileName ?? "current plan");
      if (!found.ok) { problems.push(found.problem); continue; }
      const origin = await originBranches(git, found.repository.mainCheckoutPath);
      if (!origin.ok) throw new Error(`source_unavailable: Could not read ${name}'s delivery bases: ${origin.error}. Restore repository access, then check for new phases again.`);
      const baseBranch = record.settings.bases[name] ?? defaultBaseBranch(origin.value);
      if (!baseBranch) { problems.push(`Establish a configured delivery base for ${name}, then check again.`); continue; }
      repo = { ...found.repository, baseBranch };
    }
    const path = name === record.repository.name ? shared : expandHome(repo.mainCheckoutPath);
    const origin = parseGithubOrigin(await gitRead(git, path, ["config", "--get", "remote.origin.url"]));
    if (!origin || `${origin.owner}/${origin.name}`.toLowerCase() !== repo.github.toLowerCase()) { problems.push(`Restore the recorded ${repo.github} origin for ${name}, then check again.`); continue; }
    const baseRevision = await remoteBase(git, path, repo.baseBranch);
    repositories.push({ name, identity: repo.github, path, baseBranch: repo.baseBranch, baseRevision });
  }
  const extracted = first ? extractPreparation(candidate, record.prdDirectory, first, [...new Set([record.repository.name, ...candidate.plan.phases.filter(phase => phase.id === first.id || isAncestorOf(phase.id, first.id)).flatMap(phase => phase.repositories)])]) : { instructions: [], problems: [] };
  problems.push(...extracted.problems);
  for (const instruction of extracted.instructions) {
    const problemCount = problems.length;
    const repository = repositories.find(one => one.name === instruction.repository);
    if (!repository) { problems.push(`Preparation repository ${instruction.repository} is unavailable.`); continue; }
    const resolved = await runGit(git, repository.path, ["rev-parse", "--verify", "--end-of-options", `${instruction.sourceRef}^{commit}`]);
    const pinned = await runGit(git, repository.path, ["rev-parse", "--verify", "--end-of-options", `${instruction.revision}^{commit}`]);
    if (resolved.exitCode !== 0 || pinned.exitCode !== 0 || resolved.stdout.trim() !== pinned.stdout.trim()) { problems.push(`Phase ${instruction.phaseId}: restore source ${instruction.sourceRef} at ${instruction.revision} in ${repository.name}; the branch and immutable revision must agree.`); continue; }
    const binding: PreparationBinding = { ...instruction, sourceRevision: pinned.stdout.trim(), repositoryIdentity: repository.identity, baseBranch: repository.baseBranch, baseRevision: repository.baseRevision, authorization: instruction.destination === "assigned_feature" ? "phase_preparation" : "delivery_target", valid: false };
    preparation.push(binding);
    if (repository.name === record.repository.name) {
    const sourcePlan = await observeGitPlan(git, repository.path, record.prdDirectory, binding.sourceRevision);
    for (const prerequisite of instruction.prerequisites) {
      const original = sourcePlan.plan.phases.find(phase => phase.id === prerequisite);
      if (!original?.closed || !completedPhaseScopeUnchanged(sourcePlan, candidate, prerequisite)) problems.push(`Phase ${instruction.phaseId}: source ${binding.sourceRevision} does not contain the unchanged Closed scope for prerequisite ${prerequisite}. Restore the matching source before preparation.`);
    }
    }
    if (instruction.destination !== "assigned_feature") {
      if (instruction.destination !== repository.baseBranch) problems.push(`Phase ${instruction.phaseId}: unknown integration destination ${instruction.destination}; use this phase's branch or configured ${repository.baseBranch}.`);

    }
    for (const check of binding.checks) {
      const packagePath = check.directory === "." ? "package.json" : `${check.directory}/package.json`;
      if (check.argv[0] === "npm") {
        const result = await runGit(git, repository.path, ["show", `${binding.sourceRevision}:${packagePath}`]);
        try {
          const manifest = JSON.parse(result.stdout) as { scripts?: Record<string, string> };
          const script = check.argv[1] === "run" ? check.argv[2] : check.argv[1];
          if (result.exitCode !== 0 || !script || !manifest.scripts?.[script]) throw new Error("missing script");
        } catch { problems.push(`${check.span.file}:${check.span.line}: validation command ${check.command} does not name a script in the identified source's ${packagePath}.`); }
      } else {
        const documentation = await runGit(git, repository.path, ["show", `${binding.sourceRevision}:README.md`]);
        const tool = check.argv[0]!;
        if (tool.startsWith("./")) {
          const script = check.directory === "." ? tool.slice(2) : `${check.directory}/${tool.slice(2)}`;
          const entry = await runGit(git, repository.path, ["ls-tree", binding.sourceRevision, "--", script]);
          if (script.split("/").includes("..") || !entry.stdout.startsWith("100755 blob ")) problems.push(`${check.span.file}:${check.span.line}: validation script ${script} is missing, unsafe or not executable in the identified source.`);
        } else if (!/^python(?:3(?:\.\d+)?)?$/.test(tool) || check.argv[1] !== "-m" || documentation.exitCode !== 0 || !documentation.stdout.includes(check.command)) problems.push(`${check.span.file}:${check.span.line}: establish the documented project tool for ${check.command} in the source README before preparation.`);
      }
    }

    binding.valid = problems.length === problemCount;
  }
  for (const row of accounting.leaves) {
    if (row.classification === "new_unfinished") continue;
    const integrationProblems: string[] = [];
    if (row.classification === "carried_completed" && added.length) {
      const receipt = baseline.completions[row.id];
      const affected = [...new Set([record.repository.name, ...(receipt?.scopeRepositories ?? phaseRepositories(baseline.active, row.id))])];
      for (const name of affected) {
        const repo = repositories.find(repo => repo.name === name);
        const revision = receipt?.repositories?.[name]?.revision ?? (name === record.repository.name ? receipt?.revision : undefined);
        if (!repo || !revision) { integrationProblems.push(`Phase ${row.id}: restore the retained ${name} completion revision before checking integration.`); continue; }
        const result = await runGit(git, repo.path, ["merge-base", "--is-ancestor", revision, repo.baseRevision]);
        if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(`Could not check retained Phase ${row.id} integration in ${name}. Restore revision ${revision}.`);
        if (result.exitCode === 1) {
          let covered = false;
          const retained = receipt?.repositories?.[name];
          if (retained?.identity.toLowerCase() === repo.identity.toLowerCase() && retained.integration?.sourceRevision === revision && /^[a-f0-9]{40,64}$/.test(retained.integration.baseRevision)) {
            const priorBase = await runGit(git, repo.path, ["merge-base", "--is-ancestor", retained.integration.baseRevision, repo.baseRevision]);
            if (priorBase.exitCode !== 0 && priorBase.exitCode !== 1) throw new Error(`Could not verify retained integration of Phase ${row.id} in ${name}.`);
            covered = priorBase.exitCode === 0;
          }
          for (const checkpoint of record.developmentDelivery?.checkpoints ?? []) {
            const merge = checkpoint.merge;
            if (!merge || checkpoint.mergeUnresolvedReason || checkpoint.supersededBy || checkpoint.target.repository !== `github.com/${repo.identity}`.toLowerCase() || checkpoint.target.baseBranch !== repo.baseBranch || merge.sourceHead !== checkpoint.headSha || merge.mergedHead !== merge.sourceHead) continue;
            const source = await runGit(git, repo.path, ["merge-base", "--is-ancestor", revision, merge.sourceHead]);
            const target = await runGit(git, repo.path, ["merge-base", "--is-ancestor", merge.resultSha, repo.baseRevision]);
            if (source.exitCode === 0 && target.exitCode === 0) covered = true;
          }
          if (!covered) integrationProblems.push(`Phase ${row.id}: ${name} completion ${revision} is not integrated in origin/${repo.baseBranch}; reconcile explicit preparation before continuing.`);
        }
      }
    }
    if (row.classification === "externally_verified" || row.classification === "carried_completed" && !integrationProblems.length) {
      prerequisites.push({ phaseId: row.id, status: "integrated_verified", evidence: row.repositories.map(repo => `${repo.identity}@${repo.revision} in ${repo.baseRevision}`) }); continue;
    }
    const bindings = preparation.filter(binding => binding.prerequisites.includes(row.id));
    const requiredNames = [...new Set([record.repository.name, ...(row.classification === "carried_completed" ? baseline.completions[row.id]?.scopeRepositories ?? phaseRepositories(baseline.active, row.id) : phaseRepositories(candidate, row.id))])];
    // Preparation cannot substitute for a missing retained provider receipt or changed old scope.
    const eligible = (row.classification === "externally_unverified" && row.provenance === "not_applicable" || row.classification === "carried_completed") && first && dependencyIds(first.dependenciesText).includes(row.id) && requiredNames.every(name => bindings.some(binding => binding.repository === name && binding.valid));
    if (eligible && !extracted.problems.length) prerequisites.push({ phaseId: row.id, status: "preparation_available", evidence: bindings.map(binding => `${binding.repositoryIdentity}@${binding.sourceRevision}; authorization ${binding.authorization}`) });
    else { problems.push(...row.problems, ...integrationProblems); prerequisites.push({ phaseId: row.id, status: "blocked", evidence: [...row.problems, ...integrationProblems], recovery: "Restore the missing evidence or reconcile an explicit authorized preparation in the first unfinished phase, then check again." }); }
  }
  if (first) for (const id of dependencyIds(first.dependenciesText)) {
    const descendants = accounting.leaves.filter(row => row.id === id || isAncestorOf(id, row.id));
    if (!descendants.length || descendants.some(row => row.classification === "new_unfinished" || !prerequisites.some(value => value.phaseId === row.id && ["integrated_verified", "preparation_available"].includes(value.status)))) problems.push(`Phase ${first.id}: prerequisite ${id} is not ready. Reconcile its evidence/preparation before starting dependent implementation.`);
  }
  for (const repo of repositories) if (await remoteBase(git, repo.path, repo.baseBranch, false) !== repo.baseRevision) throw new Error(`source_changed: ${repo.name}/${repo.baseBranch} moved during readiness evaluation. Check again.`);
  for (const binding of preparation) {
    const repo = repositories.find(one => one.name === binding.repository)!;
    if ((await gitRead(git, repo.path, ["rev-parse", "--verify", "--end-of-options", `${binding.sourceRef}^{commit}`])).trim() !== binding.sourceRevision) throw new Error(`source_changed: preparation source ${binding.sourceRef} moved. Check again.`);
  }
  const body: Omit<ContinuationProposal, "id"> = { formatVersion: 1, completedExecutionId: record.executionId, baselineId: baseline.id, candidateDigest: candidate.digest, added, ...(first ? { firstEligiblePhase: first.id } : {}), readiness: problems.length ? "blocked" : "ready", problems: [...new Set(problems)], prerequisites, repositories, preparation, settingsDigest: authorityDigest(record.settings) };
  if (preparation.length && preparation.every(binding => binding.valid)) {
    const proposed = { ...body, id: authorityDigest(body) };
    const permissionRecord: PrdRecord = { ...record, preparation: newPreparationState(proposed), repositories: repositories.map(repo => ({ name: repo.name, kind: repo.name === record.repository.name ? "prd" : "named", github: repo.identity, mainCheckoutPath: repo.path, worktreePath: repo.path, baseBranch: repo.baseBranch, baseCommit: repo.baseRevision })) };
    try { body.permissionDigest = await preparationPermissions({ record: permissionRecord, stateDirectory: input.directory, git, env: git.env ?? process.env, signal: git.signal ?? AbortSignal.timeout(30_000), codex: input.codex, save: () => {}, now: () => new Date().toISOString() }, true); }
    catch (error) { body.permissionDigest = authorityDigest((error as Error).message); problems.push((error as Error).message); body.problems.push((error as Error).message); }
  }
  const scopeDigest = authorityDigest(body);
  const retained = readPendingAuthority(input.directory, record);
  const pending = pendingForProposal(retained, { scopeDigest, completedExecutionId: record.executionId });
  const targets = [...new Map(preparation.filter(binding => binding.authorization === "delivery_target" && binding.destination === binding.baseBranch).map(binding => {
    const target = { repository: `github.com/${binding.repositoryIdentity}`.toLowerCase(), baseBranch: binding.baseBranch };
    return [mergeTargetKey(target), target];
  })).values()].map(target => ({ target, granted: !!pending?.authorization.grants.some(grant => mergeTargetKey(grant.target) === mergeTargetKey(target)) }));
  const bound = { ...body, scopeDigest, grantEligible: !problems.length, authorization: { revision: pending?.authorization.revision ?? 0, ...(pending ? { executionId: pending.executionId } : {}), superseded: !!retained && !pending, targets } };
  for (const { target, granted } of targets) if (!granted) bound.problems.push(`${target.repository}/${target.baseBranch} needs an explicit early-merge target grant for the proposed fresh run. Earlier execution grants do not apply; existing CI/CD may run before the PRD finishes.`);
  bound.readiness = bound.problems.length ? "blocked" : "ready";
  return { ...bound, id: authorityDigest(bound) };
}

export function retainContinuationProposal(directory: string, proposal: ContinuationProposal): void {
  if (Buffer.byteLength(JSON.stringify(proposal, null, 2)) + 1 > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "proposal bytes");
  const path = join(directory, "continuation-proposals", `${proposal.id}.json`);
  if (!existsSync(path)) writeDurableMetadata(path, proposal);
}
export function readContinuationProposal(directory: string, id: string): ContinuationProposal {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid continuation proposal identity.");
  const path = join(directory, "continuation-proposals", `${id}.json`);
  if (statSync(path).size > PLAN_LIMIT) throw new PlanCapacityError(PLAN_LIMIT, "proposal bytes");
  const value = JSON.parse(readFileSync(path, "utf8")) as ContinuationProposal; const { id: stored, ...body } = value;
  if (value.formatVersion !== 1 || stored !== id || authorityDigest(body) !== id) throw new Error("Continuation proposal is damaged or requires a newer Kiln.");
  return value;
}
