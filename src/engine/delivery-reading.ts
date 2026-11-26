// The delivery reading (Kiln After Delivery technical design, "The Delivery Reading"): each of a
// finished run's pull requests as GitHub shows it, read with `gh` from the repository's main
// checkout, and whether the delivery still waits to merge. GitHub is read only on the occasions
// the engine names; nothing here watches it.

import { existsSync, realpathSync, statSync } from "node:fs";
import { parseGithubOrigin } from "../github-origin.js";
import { runHelper } from "../platform/helper-process.js";
import type { PrdRecord } from "../state/records.js";
import { MERGE_KEY, planPushKey } from "../state/activity-keys.js";
import { gitError, runGit, type GitContext } from "./git-reads.js";
import { expandHome } from "./worktree-setup.js";

export interface PullRequestReading {
  repository: string; number: number; state: "open" | "merged" | "closed";
  /** An `open` reading's current head (`headRefOid`). */
  headSha?: string;
  mergedAt?: string; mergeCommit?: string;
  /** Set only when GitHub says definitively that it cannot merge cleanly. */
  conflicts?: true;
  /** The description's `Merge order: N of M` line, when it has one. */
  order?: { position: number; of: number };
  readAt: string;
}
/**
 * The merge activity (Kiln After Delivery, "After-Delivery Activities"): opened by the one accepted
 * Merge with {agent} press of this execution, open until `closedAt`. Closed only when a reading
 * shows every pull request merged, so `doneAt` and `closedAt` are written in the same save.
 */
export interface MergeActivity {
  /** The receipt of the press that opened it. */
  operationId: string;
  requestedAt: string;
  via: "browser" | "command_line";
  /** The pull requests that read `open` at the press, in the order the session merges them. */
  pullRequests: { repository: string; number: number }[];
  /** Each of their worktrees' heads at the press. */
  pressHeads: { repository: string; sha: string }[];
  doneAt?: string;
  closedAt?: string;
  /** The merge session's closing message, word for word, when its own end closed the activity (AC-MERGE-04). */
  summary?: string;
}
export interface AfterDeliveryState {
  pullRequests: PullRequestReading[];
  /** The latest reading's failure, with each pull request it could not read. */
  readError?: { at: string; problem: string; pullRequests?: { repository: string; number: number }[] };
  /** A person's Check now or `kiln check-for-new-phases` read the PRD repository's pull request closed. */
  checkedWhileClosedAt?: string;
  merge?: MergeActivity;
  /** Continue's pushes of the plan, one per press that opened one, never removed (Kiln After Delivery, "Data Models"). */
  planPushes?: PlanPushActivity[];
  /** Each repository's local base branch after the merge (Kiln After Delivery AC-MERGE-09). */
  baseBranches?: import("./base-branch-sync.js").BaseBranchEntry[];
}

/**
 * A push of the plan (Kiln After Delivery, "Continue and the Push Session"): opened by a Continue
 * press on an offer read from the main checkout. Done (`doneAt`) once the remote base holds the plan,
 * then `accepting` until the re-check decides; `closedAt` is written with that decision.
 */
export interface PlanPushActivity {
  /** The receipt of the Continue press that opened it; the activity key is `plan-push-<operationId>`. */
  operationId: string;
  requestedAt: string;
  via: "browser" | "command_line";
  proposalId: string;
  /** The offer's ordered unfinished phases, each with its phase scope digest. */
  offered: { id: string; phaseScopeDigest: string }[];
  doneAt?: string;
  closedAt?: string;
  /** The `scopeDigest` of the offer its re-check found, saved as it closed. */
  refreshedScope?: string;
}

/** The push of the plan while it is open, `accepting` included (at most one). */
export function openPlanPush(record: Pick<PrdRecord, "completedAt" | "afterDelivery">): PlanPushActivity | undefined {
  return record.completedAt ? record.afterDelivery?.planPushes?.find(push => !push.closedAt) : undefined;
}

/** The latest push of the plan, open or closed. */
export const latestPlanPush = (record: Pick<PrdRecord, "afterDelivery">): PlanPushActivity | undefined => record.afterDelivery?.planPushes?.at(-1);

/** The open after-delivery activity's key: the merge, or the open push of the plan (Kiln After Delivery, "While open"). */
export function openAfterDeliveryKey(record: Pick<PrdRecord, "completedAt" | "afterDelivery">): string | undefined {
  if (openMerge(record)) return MERGE_KEY;
  const push = openPlanPush(record);
  return push ? planPushKey(push.operationId) : undefined;
}

/** The merge activity while it is open (Kiln After Delivery, "While open"). */
export function openMerge(record: Pick<PrdRecord, "completedAt" | "afterDelivery">): MergeActivity | undefined {
  const merge = record.afterDelivery?.merge;
  return record.completedAt && merge && !merge.closedAt ? merge : undefined;
}

/** What the pull request card offers (AC-MERGE-07), from the saved reading alone, so the page and `kiln status` agree. */
export type MergeOffer =
  | { kind: "nothing" }
  | { kind: "offered"; toMerge: PullRequestReading[]; merged: PullRequestReading[] }
  | { kind: "all_merged" }
  | { kind: "closed"; closed: PullRequestReading[]; open: PullRequestReading[]; unreadable?: { pullRequests: { repository: string; number: number }[]; problem: string } }
  | { kind: "unreadable"; problem: string };

export function mergeOffer(record: Pick<PrdRecord, "pullRequests" | "afterDelivery">): MergeOffer {
  const pulls = record.pullRequests ?? [];
  if (!pulls.length) return { kind: "nothing" };
  const state = record.afterDelivery;
  const readings = pulls.map(pull => state?.pullRequests.find(row => row.repository === pull.repository && row.number === pull.number));
  const failed = (pull: { repository: string; number: number }) => !!state?.readError?.pullRequests?.some(row => row.repository === pull.repository && row.number === pull.number);
  const closed = readings.filter((row): row is PullRequestReading => row?.state === "closed" && !failed(row));
  // Both rows of AC-MERGE-07's table apply when one pull request is closed and another could not be read.
  const unread = pulls.filter((pull, index) => !readings[index] || readings[index]!.state !== "merged" && failed(pull));
  const problem = state?.readError?.problem ?? "Kiln has not read the pull requests from GitHub yet.";
  if (closed.length) return { kind: "closed", closed, open: readings.filter((row): row is PullRequestReading => row?.state === "open" && !failed(row)), ...(unread.length ? { unreadable: { pullRequests: unread.map(({ repository, number }) => ({ repository, number })), problem } } : {}) };
  if (unread.length) return { kind: "unreadable", problem };
  const merged = readings.filter((row): row is PullRequestReading => row!.state === "merged");
  if (merged.length === readings.length) return { kind: "all_merged" };
  return { kind: "offered", toMerge: orderedForMerge(readings.filter((row): row is PullRequestReading => row!.state === "open"), pulls), merged };
}

/** Stated positions first, then the recorded order (Kiln After Delivery, "The Merge Session"). */
export function orderedForMerge<T extends { repository: string; number: number; order?: { position: number } }>(rows: T[], recorded: { repository: string; number: number }[]): T[] {
  const place = (row: T) => recorded.findIndex(pull => pull.repository === row.repository && pull.number === row.number);
  return [...rows].sort((a, b) => (a.order?.position ?? Number.MAX_SAFE_INTEGER) - (b.order?.position ?? Number.MAX_SAFE_INTEGER) || place(a) - place(b));
}

/** The pull request in the PRD's repository, when the run opened one there. */
export function prdPullRequest(record: Pick<PrdRecord, "pullRequests" | "repository">) {
  return record.pullRequests?.find(pull => pull.repository === record.repository.name);
}

/**
 * Whether the delivery waits to merge (AC-WAIT-01): true while the PRD repository's pull request is
 * not read `merged`, unless it reads `closed` and a person has pressed Check now since. Undefined when
 * no reading of it exists yet, so nothing can say. A delivery with no pull request there never waits.
 */
export function deliveryWaiting(record: Pick<PrdRecord, "pullRequests" | "repository" | "afterDelivery">): boolean | undefined {
  const pull = prdPullRequest(record);
  if (!pull) return false;
  const reading = record.afterDelivery?.pullRequests.find(row => row.repository === pull.repository && row.number === pull.number);
  if (!reading) return undefined;
  if (reading.state === "merged") return false;
  if (reading.state === "closed" && record.afterDelivery?.checkedWhileClosedAt) return false;
  return true;
}

/**
 * The main checkout check (technical design, "The Plan Check", step 2): the saved path is a folder,
 * Git's top level there is that same path, and its origin is the run's GitHub repository.
 */
export async function findMainCheckout(git: GitContext, savedPath: string, github: string): Promise<{ ok: true; path: string } | { ok: false; problem: string }> {
  const path = expandHome(savedPath);
  const missing = (what: string) => ({ ok: false as const, problem: `Kiln could not find the main checkout at ${savedPath}: ${what}. Put it back at that path, then check for new phases again.` });
  if (!existsSync(path) || !statSync(path).isDirectory()) return missing("nothing is there");
  const top = await runGit(git, path, ["rev-parse", "--show-toplevel"]);
  if (top.exitCode !== 0) return missing("a folder that is not a Git repository is there");
  const real = (value: string) => { try { return realpathSync(value); } catch { return value; } };
  const topLevel = top.stdout.trim();
  if (real(topLevel) !== real(path)) return missing(`a folder inside the repository at ${topLevel} is there`);
  const url = await runGit(git, path, ["config", "--get", "remote.origin.url"]);
  const origin = url.exitCode === 0 ? parseGithubOrigin(url.stdout.trim()) : undefined;
  const identity = origin ? `${origin.owner}/${origin.name}` : undefined;
  if (identity?.toLowerCase() !== github.toLowerCase()) return missing(`a clone of ${identity ?? (url.stdout.trim() || "a repository with no origin")} is there`);
  return { ok: true, path };
}

export interface ReadingInput { record: PrdRecord; git: GitContext; gh: string; now: () => string; signal?: AbortSignal; press: boolean }

const ORDER = /^\s*Merge order:\s*(\d+)\s+of\s+(\d+)\s*$/im;

/**
 * Reads each of the delivery's pull requests not already `merged`, and returns the new state. A read
 * that fails keeps the previous reading and records the failure; it never infers a state.
 */
export async function readDelivery(input: ReadingInput): Promise<{ state: AfterDeliveryState; failed: { repository: string; number: number }[] }> {
  const { record } = input;
  const previous = record.afterDelivery;
  const next: AfterDeliveryState = { pullRequests: [...(previous?.pullRequests ?? [])], ...(previous?.checkedWhileClosedAt ? { checkedWhileClosedAt: previous.checkedWhileClosedAt } : {}), ...(previous?.merge ? { merge: previous.merge } : {}), ...(previous?.planPushes ? { planPushes: previous.planPushes } : {}), ...(previous?.baseBranches ? { baseBranches: previous.baseBranches } : {}) };
  const problems: string[] = [];
  const fresh = new Set<PullRequestReading>();
  const failed: { repository: string; number: number }[] = [];
  for (const pull of record.pullRequests ?? []) {
    const index = next.pullRequests.findIndex(row => row.repository === pull.repository && row.number === pull.number);
    if (next.pullRequests[index]?.state === "merged") continue;
    try {
      const reading = await readOne(input, pull);
      fresh.add(reading);
      if (index < 0) next.pullRequests.push(reading); else next.pullRequests[index] = reading;
    } catch (error) { problems.push((error as Error).message); failed.push({ repository: pull.repository, number: pull.number }); }
  }
  const prd = prdPullRequest(record);
  const prdReading = prd && next.pullRequests.find(row => row.repository === prd.repository && row.number === prd.number);
  // Recorded only for a person's press; it stops counting once the pull request reads open again.
  if (prdReading?.state === "closed" && input.press && fresh.has(prdReading)) next.checkedWhileClosedAt = prdReading.readAt;
  if (prdReading?.state === "open") delete next.checkedWhileClosedAt;
  if (problems.length) next.readError = { at: input.now(), problem: problems.join(" "), pullRequests: failed };
  return { state: next, failed };
}

async function readOne(input: ReadingInput, pull: NonNullable<PrdRecord["pullRequests"]>[number]): Promise<PullRequestReading> {
  const { record, git } = input;
  const repository = record.repositories.find(entry => entry.name === pull.repository);
  const github = repository?.github ?? (pull.repository === record.repository.name ? record.repository.github : undefined);
  if (!github) throw new Error(`Kiln has no GitHub repository recorded for ${pull.repository}.`);
  const found = await findMainCheckout(git, repository?.mainCheckoutPath ?? record.repository.mainCheckoutPath, github);
  if (!found.ok) throw new Error(found.problem);
  const gh = async (args: string[]) => {
    const answer = await runHelper(input.gh, args, { cwd: found.path, env: git.env, timeoutMs: 30_000, ...(input.signal ? { signal: input.signal } : {}) });
    if (answer.exitCode !== 0) throw new Error(`GitHub could not be read for ${pull.repository} #${pull.number}: ${gitError(answer)}`);
    try { return JSON.parse(answer.stdout) as Record<string, unknown>; }
    catch { throw new Error(`GitHub gave an unreadable answer for ${pull.repository} #${pull.number}.`); }
  };
  const view = await gh(["pr", "view", String(pull.number), "--repo", `github.com/${github}`, "--json", "number,state,mergedAt,mergeCommit,headRefOid,baseRefName,mergeable,mergeStateStatus,body"]);
  const readAt = input.now();
  const order = typeof view.body === "string" ? ORDER.exec(view.body) : null;
  const base = { repository: pull.repository, number: pull.number, readAt, ...(order && Number(order[1]) >= 1 && Number(order[1]) <= Number(order[2]) ? { order: { position: Number(order[1]), of: Number(order[2]) } } : {}) };
  if (view.state === "OPEN") {
    if (typeof view.headRefOid !== "string") throw new Error(`GitHub gave no head for ${pull.repository} #${pull.number}.`);
    const conflicts = view.mergeable === "CONFLICTING" || view.mergeStateStatus === "DIRTY";
    return { ...base, state: "open", headSha: view.headRefOid, ...(conflicts ? { conflicts: true as const } : {}) };
  }
  if (view.state === "CLOSED") return { ...base, state: "closed" };
  if (view.state !== "MERGED") throw new Error(`GitHub gave an unknown state for ${pull.repository} #${pull.number}: ${String(view.state)}.`);
  const mergeCommit = (view.mergeCommit as { oid?: unknown } | null)?.oid;
  if (typeof mergeCommit !== "string" || typeof view.mergedAt !== "string") throw new Error(`GitHub shows ${pull.repository} #${pull.number} merged without its merge commit and time.`);
  if (view.baseRefName !== pull.base) throw new Error(`${pull.repository} #${pull.number} merged into ${String(view.baseRefName)}, not ${pull.base}.`);
  // The base branch must contain the merge commit: compare reads "behind" or "identical" when it does.
  const comparison = await gh(["api", "--hostname", "github.com", `repos/${github}/compare/${encodeURIComponent(pull.base)}...${mergeCommit}`]);
  if (!["behind", "identical"].includes(String(comparison.status))) throw new Error(`${pull.base} does not contain the merge commit ${mergeCommit.slice(0, 7)} of ${pull.repository} #${pull.number}.`);
  return { ...base, state: "merged", mergedAt: view.mergedAt, mergeCommit };
}
