// The done check (PRD AC-DONE-01, AC-DONE-02) and the pull-request check (AC-PR-02): what Git,
// the phase documents and GitHub say, never what the session said or how it exited
// (technical design, "The Done Check").

import { runHelper } from "../platform/helper-process.js";
import type { StayedOutcome } from "../session/outside-workspace.js";
import type { CheckResult, MergedBranchFacts, PullRequestFacts } from "../state/records.js";
import { gitError, isAncestor, localBranchCommit, runGit, shortSha, type GitContext } from "./git-reads.js";
import { judgedLeaf, readPlanAt, type PlanRead } from "./plan-reading.js";
import { joinNames } from "./worktree-setup.js";

export const CHECK_NAMES = { closed: "Phase doc closed", committed: "Everything committed", pushed: "Pushed", pullRequest: "Pull request open", plan: "Phase plan reads" } as const;

/** Two minutes: how long a read of origin that fails is retried, since the network is often not back right after a wake. */
export const ORIGIN_RETRY_MS = 2 * 60 * 1000;
const ORIGIN_RETRY_INTERVAL_MS = 5_000;

/** One of the PRD's set-up repositories, as the done and pull-request checks read it. */
export interface CheckedRepository {
  name: string;
  /** `<owner>/<name>`. */
  github: string;
  baseBranch: string;
  /** Where git runs from; the worktree is reached with `git -C`, so a missing worktree is git's own error. */
  mainCheckoutPath: string;
  worktreePath: string;
  /** The commit its feature branch started from: a tip still here has no commits of its own. */
  baseCommit: string | undefined;
}

export interface DoneCheckInput {
  git: GitContext;
  /** The PRD's repository's worktree, where the phase documents are read. */
  prdWorktreePath: string;
  prdDirectoryFromRoot: string;
  /** The PRD's set-up repositories, the PRD's repository first. */
  repositories: CheckedRepository[];
  branch: string;
  /** The leaf Kiln launched; when the session split it, its first leaf is judged instead. */
  launchedLeafId: string;
  /** Stayed in the workspace, already read from the phase's transcripts (multi-repo AC-OUTSIDE-01). */
  stayed: StayedOutcome;
  originRetryMs?: number;
  /**
   * When the computer last woke, as Kiln's sleep readings found it (milliseconds since the
   * epoch); a wake during the origin retry starts its two minutes again from the wake.
   */
  lastWakeAt?: () => number | undefined;
}

export interface DoneCheckOutcome {
  unavailable?: string;
  passed: boolean;
  checks: CheckResult[];
  /** The plan as this check read it; a successful read is written to the record. */
  plan: PlanRead;
  /** The leaf judged, from this read: the launched leaf, or its first leaf after a split. */
  judgedLeafId: string;
  /** Each repository's branch tip, when Pushed passed: matched on origin, or its base commit when it has no commits of its own. */
  pushedShas?: Record<string, string>;
  stayed: StayedOutcome;
}

/**
 * Runs the done check's four checks: Closed in the PRD's repository's worktree, Committed and
 * Pushed in every repository's (multi-repo AC-CHECK-01), and Stayed in the workspace (multi-repo
 * AC-OUTSIDE-01), listed only when it failed. All four must pass. A one-repository PRD's facts
 * are v1's; with several, each names its repository (AC-CHECK-02).
 *
 *   const outcome = await runDoneCheck({ git, prdWorktreePath, prdDirectoryFromRoot, repositories, branch, launchedLeafId: "2b" });
 *   outcome.checks  // [{ name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-2b-store-credit.md"] }, …]
 */
export async function runDoneCheck(input: DoneCheckInput): Promise<DoneCheckOutcome> {
  const plan = readPlanAt(input.prdWorktreePath, input.prdDirectoryFromRoot);
  const closed = closedCheck(plan, input.launchedLeafId);
  const multi = input.repositories.length > 1;
  const [committed, pushed] = await Promise.all([
    Promise.all(input.repositories.map((repository) => committedCheck(input, repository))),
    Promise.all(input.repositories.map((repository) => pushedCheck(input, repository))),
  ]);
  const committedCheckResult = combineCommitted(committed, input.repositories, multi);
  const pushedPassed = pushed.every((one) => one.passed);
  const pushedCheckResult: CheckResult = {
    name: CHECK_NAMES.pushed,
    passed: pushedPassed,
    // Passing, one line per repository; failing, the repositories that failed.
    facts: multi ? pushed.filter((one) => one.passed === pushedPassed).map((one) => `${one.name}: ${one.fact}`) : [pushed[0]!.fact],
  };
  const checks = [closed.check, committedCheckResult, pushedCheckResult, ...(input.stayed.passed ? [] : [input.stayed.check])];
  return {
    ...(!plan.ok && plan.unavailable ? { unavailable: plan.problem } : committed.some(one => one.unavailable) || pushed.some(one => one.unavailable) ? { unavailable: [...committed, ...pushed].filter(one => one.unavailable).map(one => one.fact).join(" ") } : {}),
    passed: checks.every((check) => check.passed),
    checks,
    plan,
    judgedLeafId: closed.judgedLeafId,
    ...(pushedPassed ? { pushedShas: Object.fromEntries(pushed.map((one) => [one.name, one.sha!])) } : {}),
    stayed: input.stayed,
  };
}

function closedCheck(plan: PlanRead, launchedLeafId: string): { check: CheckResult; judgedLeafId: string } {
  const name = CHECK_NAMES.closed;
  if (!plan.ok) return { check: { name, passed: false, facts: [plan.problem] }, judgedLeafId: launchedLeafId };
  const leaf = judgedLeaf(plan.plan, launchedLeafId);
  if (!leaf) return { check: { name, passed: false, facts: [`Phase ${launchedLeafId} is no longer in the plan`] }, judgedLeafId: launchedLeafId };
  return {
    check: leaf.closed ? { name, passed: true, facts: [`Closed line in ${leaf.fileName}`] } : { name, passed: false, facts: [`No Closed line in ${leaf.fileName}`] },
    judgedLeafId: leaf.id,
  };
}

function worktreeGit(input: { git: GitContext }, repository: CheckedRepository, args: string[]) {
  return runGit(input.git, repository.mainCheckoutPath, ["-C", repository.worktreePath, ...args]);
}

interface RepositoryCommitted {
  unavailable?: true;
  passed: boolean;
  fact: string;
}

async function committedCheck(input: DoneCheckInput, repository: CheckedRepository): Promise<RepositoryCommitted> {
  const status = await worktreeGit(input, repository, ["status", "--porcelain", "--untracked-files=all"]);
  if (status.exitCode !== 0) return { passed: false, unavailable: true, fact: gitError(status) };
  const count = status.stdout.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  if (count > 0) return { passed: false, fact: `${count} ${count === 1 ? "file" : "files"} changed, not committed` };
  const head = await worktreeGit(input, repository, ["rev-parse", "HEAD"]);
  if (head.exitCode !== 0) return { passed: false, unavailable: true, fact: gitError(head) };
  return { passed: true, fact: `Latest commit ${shortSha(head.stdout.trim())}, tree clean` };
}

/** Failing: one fact per dirty repository; passing: `Clean in product, returns-api and storefront`. */
function combineCommitted(results: RepositoryCommitted[], repositories: CheckedRepository[], multi: boolean): CheckResult {
  const name = CHECK_NAMES.committed;
  const passed = results.every((one) => one.passed);
  if (!multi) return { name, passed, facts: [results[0]!.fact] };
  if (passed) return { name, passed, facts: [`Clean in ${joinNames(repositories.map((repository) => repository.name))}`] };
  return { name, passed, facts: results.flatMap((one, index) => (one.passed ? [] : [`${repositories[index]!.name}: ${one.fact}`])) };
}

interface RepositoryPushed {
  unavailable?: true;
  name: string;
  passed: boolean;
  fact: string;
  sha?: string;
}

async function pushedCheck(input: DoneCheckInput, repository: CheckedRepository): Promise<RepositoryPushed> {
  const { name } = repository;
  const fail = (fact: string): RepositoryPushed => ({ name, passed: false, fact });
  const branch = await worktreeGit(input, repository, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch.exitCode !== 0 && branch.exitCode !== 1) return { ...fail(gitError(branch)), unavailable: true };
  const onBranch = branch.exitCode === 0 ? branch.stdout.trim() : undefined;
  if (onBranch !== input.branch) {
    return fail(onBranch === undefined ? `The worktree is on a detached HEAD, not ${input.branch}` : `The worktree is on ${onBranch}, not ${input.branch}`);
  }
  const local = await localBranchCommit(input.git, repository.worktreePath, input.branch);
  if (local === undefined) return fail(`${input.branch} has no commit in the worktree`);
  // A repository whose branch has no commits of its own needs no push (multi-repo AC-CHECK-01).
  if (input.repositories.length > 1 && local === repository.baseCommit) return { name, passed: true, fact: "no commits yet", sha: local };

  const origin = await readOriginWithRetry(input, repository);
  if (!origin.ok) return { ...fail(`Couldn't reach origin: ${origin.error}`), unavailable: true };
  if (origin.commit === undefined) return fail(`${input.branch} isn't on origin yet`);
  if (origin.commit === local) return { name, passed: true, fact: input.repositories.length > 1 ? `${shortSha(local)} on origin` : `Matches origin at ${shortSha(local)}`, sha: local };
  if (await isAncestor(input.git, repository.worktreePath, origin.commit, local)) return fail(`${shortSha(local)} isn't on origin yet`);
  return fail(`origin is at ${shortSha(origin.commit)}, not ${shortSha(local)}`);
}

async function readOriginWithRetry(input: DoneCheckInput, repository: CheckedRepository): Promise<{ ok: true; commit: string | undefined } | { ok: false; error: string }> {
  const retryMs = input.originRetryMs ?? ORIGIN_RETRY_MS;
  const startedAt = Date.now();
  let deadline = startedAt + retryMs;
  for (;;) {
    const result = await worktreeGit(input, repository, ["ls-remote", "origin", `refs/heads/${input.branch}`]);
    if (result.exitCode === 0) {
      const line = result.stdout.split(/\r?\n/).find((row) => row.endsWith(`\trefs/heads/${input.branch}`));
      return { ok: true, commit: line?.split("\t")[0] };
    }
    if (input.git.signal?.aborted) return { ok: false, error: gitError(result) };
    // The network is often not back yet when a computer wakes, so a wake restarts the wait.
    const wake = input.lastWakeAt?.();
    if (wake !== undefined && wake > startedAt) deadline = Math.max(deadline, wake + retryMs);
    if (Date.now() + ORIGIN_RETRY_INTERVAL_MS > deadline) return { ok: false, error: gitError(result) };
    await new Promise((resolve) => setTimeout(resolve, ORIGIN_RETRY_INTERVAL_MS));
  }
}

/** The plan check a `plan` stop shows: whether the plan reads (technical design, "A plan that breaks after Start"). */
export function planCheck(plan: PlanRead): CheckResult {
  return plan.ok ? { name: CHECK_NAMES.plan, passed: true, facts: ["The phase plan reads"] } : { name: CHECK_NAMES.plan, passed: false, facts: [plan.problem] };
}

export interface PullRequestCheckInput {
  gh: string;
  env: NodeJS.ProcessEnv;
  mainCheckoutPath: string;
  /** `<owner>/<name>`. */
  github: string;
  branch: string;
  baseBranch: string;
  /** The repository's name, recorded with its pull request. */
  repository: string;
  /** Local proof is required for recognizing prior integration; absent for list-only callers. */
  git?: GitContext;
  worktreePath?: string;
  /** Previously completed phase receipts must still belong to the candidate feature tip. */
  completedCommits?: string[];
  signal?: AbortSignal;
}

export interface PullRequestCheckOutcome {
  passed: boolean;
  check: CheckResult;
  /** gh failed, rather than answering. */
  ghError: boolean;
  pullRequest?: PullRequestFacts;
  mergedBranch?: MergedBranchFacts;
}

export interface PullRequestsCheckOutcome {
  ghError?: boolean;
  passed: boolean;
  check: CheckResult;
  /** The pull-request check, then Stayed in the workspace when it failed: what a stop records. */
  checks: CheckResult[];
  stayed: StayedOutcome;
  /** Actual review PRs, in list order, when every repository qualifies. */
  pullRequests?: PullRequestFacts[];
  mergedBranches?: MergedBranchFacts[];
}

/**
 * The pull-request check across the repositories whose feature branch has commits of its own
 * (multi-repo AC-PRS-05): every one has a ready PR or verified prior integration, and the
 * pull-request session stayed in the workspace (AC-PRS-06). With one repository the facts are
 * v1's; with several, each names its repository.
 */
export async function runPullRequestChecks(inputs: PullRequestCheckInput[], stayed: StayedOutcome): Promise<PullRequestsCheckOutcome> {
  const name = CHECK_NAMES.pullRequest;
  const outcomes = await Promise.all(inputs.map((input) => runPullRequestCheck(input)));
  const open = outcomes.length > 0 && outcomes.every((outcome) => outcome.passed);
  const facts =
    outcomes.length === 1 ? outcomes[0]!.check.facts : outcomes.map((outcome, index) => `${inputs[index]!.repository}: ${outcome.check.facts.join(" ")}`);
  const check = { name, passed: open, facts: outcomes.length === 0 ? ["No repository has commits of its own"] : facts };
  const passed = open && stayed.passed;
  return {
    passed,
    check,
    checks: [check, ...(stayed.passed ? [] : [stayed.check])],
    stayed,
    ...(passed ? {
      pullRequests: outcomes.flatMap(outcome => outcome.pullRequest ? [outcome.pullRequest] : []),
      ...(outcomes.some(outcome => outcome.mergedBranch) ? { mergedBranches: outcomes.flatMap(outcome => outcome.mergedBranch ? [outcome.mergedBranch] : []) } : {}),
    } : {}),
  };
}

interface GhPullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  isCrossRepository: boolean;
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  commits: unknown[];
}

/**
 * The pull-request session's check, in place of the done check: a pull request from the
 * feature branch into the base branch is open and ready for review (WORK-001). A fork's pull
 * request from a branch of the same name doesn't count.
 */
export async function runPullRequestCheck(input: PullRequestCheckInput): Promise<PullRequestCheckOutcome> {
  const name = CHECK_NAMES.pullRequest;
  const result = await runHelper(
    input.gh,
    [
      "pr",
      "list",
      "--repo",
      `github.com/${input.github}`,
      "--head",
      input.branch,
      "--base",
      input.baseBranch,
      "--state",
      "open",
      "--json",
      "number,title,url,isDraft,isCrossRepository,headRefName,baseRefName,additions,deletions,commits",
    ],
    { cwd: input.mainCheckoutPath, env: input.env, ...(input.signal ? { signal: input.signal } : {}) },
  );
  if (result.exitCode !== 0) return { passed: false, ghError: true, check: { name, passed: false, facts: [gitError(result)] } };
  const listed = readPullRequestList(result.stdout, input.branch, input.baseBranch, input.repository);
  if (listed.passed || listed.ghError || !input.git || !input.worktreePath) return listed;
  return checkAlreadyMerged(input, listed);

}

/** Judges `gh pr list --json …` output, already narrowed by gh to the branch and base. */
export function readPullRequestList(stdout: string, branch: string, baseBranch: string, repository: string): PullRequestCheckOutcome {
  const name = CHECK_NAMES.pullRequest;
  let pulls: GhPullRequest[];
  try {
    pulls = JSON.parse(stdout) as GhPullRequest[];
    if (!Array.isArray(pulls)) throw new Error("not a list");
  } catch {
    return { passed: false, ghError: true, check: { name, passed: false, facts: [`gh printed something Kiln can't read: ${stdout.trim().slice(0, 200)}`] } };
  }
  const own = pulls.filter((pull) => pull.isCrossRepository === false);
  const ready = own.find((pull) => !pull.isDraft);
  if (ready) {
    return {
      passed: true,
      ghError: false,
      check: { name, passed: true, facts: [`#${ready.number} open`] },
      pullRequest: {
        repository,
        number: ready.number,
        title: ready.title,
        url: ready.url,
        head: ready.headRefName,
        base: ready.baseRefName,
        commits: Array.isArray(ready.commits) ? ready.commits.length : 0,
        additions: ready.additions,
        deletions: ready.deletions,
      },
    };
  }
  const draft = own.find((pull) => pull.isDraft);
  if (draft) return { passed: false, ghError: false, check: { name, passed: false, facts: [`#${draft.number} is a draft`] } };
  return { passed: false, ghError: false, check: { name, passed: false, facts: [`No open pull request from ${branch} into ${baseBranch}`] } };
}

/** A clean, still-current exact feature tip is the only candidate for ancestry proof. */
async function integrationTip(input: PullRequestCheckInput): Promise<{ tip: string } | { error: string }> {
  const git = input.git!;
  const cwd = input.worktreePath!;
  const [branch, status, head, origin] = await Promise.all([
    runGit(git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    runGit(git, cwd, ["status", "--porcelain", "--untracked-files=all"]),
    runGit(git, cwd, ["rev-parse", "HEAD"]),
    runGit(git, cwd, ["ls-remote", "origin", `refs/heads/${input.branch}`]),
  ]);
  const failed = [branch, status, head, origin].find(result => result.exitCode !== 0);
  if (failed) return { error: gitError(failed) };
  if (branch.stdout.trim() !== input.branch) return { error: `The worktree is not on ${input.branch}` };
  if (status.stdout.trim()) return { error: "The worktree has uncommitted changes" };
  const tip = head.stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(tip)) return { error: "Could not read the feature commit" };
  for (const completed of new Set(input.completedCommits ?? [])) {
    const contains = await runGit(git, cwd, ["merge-base", "--is-ancestor", completed, tip]);
    if (contains.exitCode !== 0) return { error: `Previously completed commit ${shortSha(completed)} is not proven contained in the current feature branch` };
  }
  const remote = origin.stdout.split(/\r?\n/).find(line => line.endsWith(`\trefs/heads/${input.branch}`))?.split("\t")[0];
  if (remote && remote !== tip) return { error: "The local feature commit does not match origin" };
  return { tip };
}

async function checkAlreadyMerged(input: PullRequestCheckInput, listed: PullRequestCheckOutcome): Promise<PullRequestCheckOutcome> {
  const fail = (detail: string, ghError = false): PullRequestCheckOutcome => ({ passed: false, ghError, check: { name: CHECK_NAMES.pullRequest, passed: false, facts: [...listed.check.facts, `Could not confirm prior integration: ${detail}`] } });
  const before = await integrationTip(input);
  if ("error" in before) return fail(before.error);
  const endpoint = `repos/${input.github}/compare/${encodeURIComponent(input.baseBranch)}...${before.tip}`;
  const compared = await runHelper(input.gh, ["api", endpoint], { cwd: input.mainCheckoutPath, env: input.env, ...(input.signal ? { signal: input.signal } : {}) });
  if (compared.exitCode !== 0) return fail(gitError(compared), true);
  let proof: { status?: string; ahead_by?: number; merge_base_commit?: { sha?: string }; base_commit?: { sha?: string } };
  try { proof = JSON.parse(compared.stdout); } catch { return fail("GitHub returned an unreadable comparison", true); }
  if (!proof || typeof proof !== "object" || !/^[0-9a-f]{40,64}$/.test(proof.base_commit?.sha ?? "") || !/^[0-9a-f]{40,64}$/.test(proof.merge_base_commit?.sha ?? "") || !Number.isInteger(proof.ahead_by)) return fail("GitHub returned an incomplete comparison", true);
  if (!(proof.status === "behind" || proof.status === "identical") || proof.ahead_by !== 0 || proof.merge_base_commit!.sha !== before.tip) return listed;
  const after = await integrationTip(input);
  if ("error" in after) return fail(after.error);
  if (after.tip !== before.tip) return fail("The feature commit changed during the check");
  return {
    passed: true, ghError: false,
    check: { name: CHECK_NAMES.pullRequest, passed: true, facts: [`Already merged into ${input.baseBranch} at ${shortSha(before.tip)}`] },
    mergedBranch: { repository: input.repository, head: input.branch, base: input.baseBranch, featureCommit: before.tip, baseCommit: proof.base_commit!.sha!, url: `https://github.com/${input.github}/commit/${before.tip}` },
  };
}
