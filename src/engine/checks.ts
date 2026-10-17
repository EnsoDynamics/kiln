// The done check (PRD AC-DONE-01, AC-DONE-02) and the pull-request check (AC-PR-02): what Git,
// the phase documents and GitHub say, never what the session said or how it exited
// (technical design, "The Done Check").

import { runHelper } from "../platform/helper-process.js";
import type { CheckResult, PullRequestFacts } from "../state/records.js";
import { gitError, isAncestor, localBranchCommit, runGit, shortSha, type GitContext } from "./git-reads.js";
import { judgedLeaf, readPlanAt, type PlanRead } from "./plan-reading.js";

export const CHECK_NAMES = { closed: "Phase doc closed", committed: "Everything committed", pushed: "Pushed", pullRequest: "Pull request open", plan: "Phase plan reads" } as const;

/** Two minutes: how long a read of origin that fails is retried, since the network is often not back right after a wake. */
export const ORIGIN_RETRY_MS = 2 * 60 * 1000;
const ORIGIN_RETRY_INTERVAL_MS = 5_000;

export interface DoneCheckInput {
  git: GitContext;
  /** Where git runs from; the worktree is reached with `git -C`, so a missing worktree is git's own error. */
  mainCheckoutPath: string;
  worktreePath: string;
  prdDirectoryFromRoot: string;
  branch: string;
  /** The leaf Kiln launched; when the session split it, its first leaf is judged instead. */
  launchedLeafId: string;
  originRetryMs?: number;
}

export interface DoneCheckOutcome {
  passed: boolean;
  checks: CheckResult[];
  /** The plan as this check read it; a successful read is written to the record. */
  plan: PlanRead;
  /** The leaf judged, from this read: the launched leaf, or its first leaf after a split. */
  judgedLeafId: string;
  /** The branch tip origin matched, when Pushed passed. */
  pushedSha?: string;
}

/**
 * Runs the done check's three checks in the worktree. All three must pass.
 *
 *   const outcome = await runDoneCheck({ git, mainCheckoutPath, worktreePath, prdDirectoryFromRoot, branch, launchedLeafId: "2b" });
 *   outcome.checks  // [{ name: "Phase doc closed", passed: false, fact: "No Closed line in phase-2b-store-credit.md" }, …]
 */
export async function runDoneCheck(input: DoneCheckInput): Promise<DoneCheckOutcome> {
  const plan = readPlanAt(input.worktreePath, input.prdDirectoryFromRoot);
  const closed = closedCheck(plan, input.launchedLeafId);
  const [committed, pushed] = await Promise.all([committedCheck(input), pushedCheck(input)]);
  const checks = [closed.check, committed, pushed.check];
  return {
    passed: checks.every((check) => check.passed),
    checks,
    plan,
    judgedLeafId: closed.judgedLeafId,
    ...(pushed.sha === undefined ? {} : { pushedSha: pushed.sha }),
  };
}

function closedCheck(plan: PlanRead, launchedLeafId: string): { check: CheckResult; judgedLeafId: string } {
  const name = CHECK_NAMES.closed;
  if (!plan.ok) return { check: { name, passed: false, fact: plan.problem }, judgedLeafId: launchedLeafId };
  const leaf = judgedLeaf(plan.plan, launchedLeafId);
  if (!leaf) return { check: { name, passed: false, fact: `Phase ${launchedLeafId} is no longer in the plan` }, judgedLeafId: launchedLeafId };
  return {
    check: leaf.closed ? { name, passed: true, fact: `Closed line in ${leaf.fileName}` } : { name, passed: false, fact: `No Closed line in ${leaf.fileName}` },
    judgedLeafId: leaf.id,
  };
}

function worktreeGit(input: DoneCheckInput, args: string[]) {
  return runGit(input.git, input.mainCheckoutPath, ["-C", input.worktreePath, ...args]);
}

async function committedCheck(input: DoneCheckInput): Promise<CheckResult> {
  const name = CHECK_NAMES.committed;
  const status = await worktreeGit(input, ["status", "--porcelain", "--untracked-files=all"]);
  if (status.exitCode !== 0) return { name, passed: false, fact: gitError(status) };
  const count = status.stdout.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  if (count > 0) return { name, passed: false, fact: `${count} ${count === 1 ? "file" : "files"} changed, not committed` };
  const head = await worktreeGit(input, ["rev-parse", "HEAD"]);
  if (head.exitCode !== 0) return { name, passed: true, fact: "Tree clean" };
  return { name, passed: true, fact: `Latest commit ${shortSha(head.stdout.trim())}, tree clean` };
}

async function pushedCheck(input: DoneCheckInput): Promise<{ check: CheckResult; sha?: string }> {
  const name = CHECK_NAMES.pushed;
  const fail = (fact: string) => ({ check: { name, passed: false, fact } });
  const branch = await worktreeGit(input, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch.exitCode !== 0 && branch.exitCode !== 1) return fail(gitError(branch));
  const onBranch = branch.exitCode === 0 ? branch.stdout.trim() : undefined;
  if (onBranch !== input.branch) {
    return fail(onBranch === undefined ? `The worktree is on a detached HEAD, not ${input.branch}` : `The worktree is on ${onBranch}, not ${input.branch}`);
  }
  const local = await localBranchCommit(input.git, input.worktreePath, input.branch);
  if (local === undefined) return fail(`${input.branch} has no commit in the worktree`);

  const origin = await readOriginWithRetry(input);
  if (!origin.ok) return fail(`Couldn't reach origin: ${origin.error}`);
  if (origin.commit === undefined) return fail(`${input.branch} isn't on origin yet`);
  if (origin.commit === local) return { check: { name, passed: true, fact: `Matches origin at ${shortSha(local)}` }, sha: local };
  if (await isAncestor(input.git, input.worktreePath, origin.commit, local)) return fail(`${shortSha(local)} isn't on origin yet`);
  return fail(`origin is at ${shortSha(origin.commit)}, not ${shortSha(local)}`);
}

async function readOriginWithRetry(input: DoneCheckInput): Promise<{ ok: true; commit: string | undefined } | { ok: false; error: string }> {
  const deadline = Date.now() + (input.originRetryMs ?? ORIGIN_RETRY_MS);
  for (;;) {
    const result = await worktreeGit(input, ["ls-remote", "origin", `refs/heads/${input.branch}`]);
    if (result.exitCode === 0) {
      const line = result.stdout.split(/\r?\n/).find((row) => row.endsWith(`\trefs/heads/${input.branch}`));
      return { ok: true, commit: line?.split("\t")[0] };
    }
    if (Date.now() + ORIGIN_RETRY_INTERVAL_MS > deadline) return { ok: false, error: gitError(result) };
    await new Promise((resolve) => setTimeout(resolve, ORIGIN_RETRY_INTERVAL_MS));
  }
}

/** The plan check a `plan` stop shows: whether the plan reads (technical design, "A plan that breaks after Start"). */
export function planCheck(plan: PlanRead): CheckResult {
  return plan.ok ? { name: CHECK_NAMES.plan, passed: true, fact: "The phase plan reads" } : { name: CHECK_NAMES.plan, passed: false, fact: plan.problem };
}

export interface PullRequestCheckInput {
  gh: string;
  env: NodeJS.ProcessEnv;
  mainCheckoutPath: string;
  /** `<owner>/<name>`. */
  github: string;
  branch: string;
  baseBranch: string;
}

export interface PullRequestCheckOutcome {
  passed: boolean;
  check: CheckResult;
  /** gh failed, rather than answering. */
  ghError: boolean;
  pullRequest?: PullRequestFacts;
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
    { cwd: input.mainCheckoutPath, env: input.env },
  );
  if (result.exitCode !== 0) return { passed: false, ghError: true, check: { name, passed: false, fact: gitError(result) } };
  return readPullRequestList(result.stdout, input.branch, input.baseBranch);
}

/** Judges `gh pr list --json …` output, already narrowed by gh to the branch and base. */
export function readPullRequestList(stdout: string, branch: string, baseBranch: string): PullRequestCheckOutcome {
  const name = CHECK_NAMES.pullRequest;
  let pulls: GhPullRequest[];
  try {
    pulls = JSON.parse(stdout) as GhPullRequest[];
    if (!Array.isArray(pulls)) throw new Error("not a list");
  } catch {
    return { passed: false, ghError: true, check: { name, passed: false, fact: `gh printed something Kiln can't read: ${stdout.trim().slice(0, 200)}` } };
  }
  const own = pulls.filter((pull) => pull.isCrossRepository === false);
  const ready = own.find((pull) => !pull.isDraft);
  if (ready) {
    return {
      passed: true,
      ghError: false,
      check: { name, passed: true, fact: `#${ready.number} open` },
      pullRequest: {
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
  if (draft) return { passed: false, ghError: false, check: { name, passed: false, fact: `#${draft.number} is a draft` } };
  return { passed: false, ghError: false, check: { name, passed: false, fact: `No open pull request from ${branch} into ${baseBranch}` } };
}
