/** Fresh execution intentions and strict reconciliation of owned, still-unused worktrees. */
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PrdRecord } from "../state/records.js";
import type { Receipt } from "../control/commands.js";
import { gitRead } from "./completed-plan-sources.js";
import { listWorktrees, type GitContext } from "./git-reads.js";
import type { ContinuationProposal } from "./continuation-readiness.js";
import { retainExecution, type ContinuationAcceptance } from "./continuation-state.js";
import { addEntryWorktree, checkWorkspaceFolder, checkWorkspaceFolderPlacement, checkWorktreePath, comparable, expandHome, realPathOfNearestAncestor } from "./worktree-setup.js";

export function newAcceptance(record: PrdRecord, directory: string, proposal: ContinuationProposal, candidateId: string, receipt: Receipt, at: string): ContinuationAcceptance {
  const uuid = randomUUID();
  const folder = record.prdDirectory.split("/").at(-1)!;
  const workspaceFolder = realPathOfNearestAncestor(join(dirname(expandHome(record.settings.workspaceFolder)), `${folder}-continue-${uuid}`));
  const featureBranch = `feature/${folder}-continue-${uuid}`;
  const settings = { ...structuredClone(record.settings), workspaceFolder, featureBranch, worktreePath: join(workspaceFolder, record.repository.name), developmentDeployments: { enabled: false, targets: [] } };
  const repositories = proposal.repositories.map(repo => ({ name: repo.name, kind: repo.name === record.repository.name ? "prd" as const : "named" as const, mainCheckoutPath: repo.path, github: repo.identity, baseBranch: repo.baseBranch, baseCommit: repo.baseRevision, worktreePath: join(workspaceFolder, repo.name) }));
  settings.bases = Object.fromEntries(repositories.filter(repo => repo.kind !== "prd").map(repo => [repo.name, repo.baseBranch]));
  settings.baseBranch = repositories.find(repo => repo.kind === "prd")!.baseBranch;
  return { formatVersion: 1, id: receipt.id, operationId: receipt.id, commandId: receipt.command_id, proposalId: proposal.id, completedExecutionId: record.executionId!, newExecutionId: uuid, acceptedAt: at, candidateId, archiveId: retainExecution(directory, record), proposal, settings, repositories, canonicalWorkspace: realPathOfNearestAncestor(workspaceFolder), state: "preparing" };
}
export async function validatePreparedWorkspace(git: GitContext, acceptance: ContinuationAcceptance, name: string): Promise<boolean> {
  const entry = acceptance.repositories.find(repo => repo.name === name)!;
  const workspace = expandHome(acceptance.settings.workspaceFolder);
  if (comparable(realPathOfNearestAncestor(workspace)) !== comparable(acceptance.canonicalWorkspace) || existsSync(workspace) && lstatSync(workspace).isSymbolicLink()) throw new Error(`Workspace path changed: ${workspace}. Restore its original safe location before retrying.`);
  const worktrees = await listWorktrees(git, entry.mainCheckoutPath);
  if (!worktrees.ok) throw new Error(worktrees.error);
  const expected = comparable(resolve(entry.worktreePath));
  const there = worktrees.worktrees.find(tree => comparable(tree.path) === expected);
  if (!there) return false;
  if (there.locked === "initializing" || there.branch !== acceptance.settings.featureBranch || lstatSync(entry.worktreePath).isSymbolicLink() || comparable(realPathOfNearestAncestor(entry.worktreePath)) !== expected) throw new Error(`Occupied or incomplete workspace ${entry.worktreePath}. Preserve its work and reconcile the exact recorded branch before retrying.`);
  const head = (await gitRead(git, entry.worktreePath, ["rev-parse", "HEAD"])).trim();
  const status = await gitRead(git, entry.worktreePath, ["status", "--porcelain=v1", "--untracked-files=all", "--ignored"]);
  if (head !== entry.baseCommit || status.trim()) throw new Error(`User work or a moved branch is present in ${entry.worktreePath}. Nothing was reset or overwritten; reconcile it before retrying preparation.`);
  return true;
}
export async function prepareWorkspaces(git: GitContext, acceptance: ContinuationAcceptance, save: () => void, now: () => string): Promise<void> {
  const placement = await checkWorkspaceFolderPlacement(git, acceptance.repositories, acceptance.settings.workspaceFolder);
  if (placement) throw new Error(placement);
  if (!acceptance.repositories.some(repo => repo.setupCompletedAt)) {
    const existingOwned = await Promise.all(acceptance.repositories.map(repo => validatePreparedWorkspace(git, acceptance, repo.name)));
    if (!existingOwned.some(Boolean)) {
      const error = await checkWorkspaceFolder(git, acceptance.repositories, acceptance.settings.workspaceFolder);
      if (error) throw new Error(error);
    }
  }
  for (const entry of acceptance.repositories) {
    if (!await validatePreparedWorkspace(git, acceptance, entry.name)) {
      const error = await checkWorktreePath(git, entry.mainCheckoutPath, entry.worktreePath);
      if (error) throw new Error(error);
      const outcome = await addEntryWorktree(git, entry, acceptance.settings.featureBranch, "then Retry preparation.");
      if (!outcome.ok) throw new Error(outcome.error);
      if (!await validatePreparedWorkspace(git, acceptance, entry.name)) throw new Error(`Setup could not establish the recorded workspace ${entry.worktreePath}.`);
    }
    entry.setupCompletedAt ??= now();
    save();
  }
}
