// The local base branch after the merge (Kiln After Delivery AC-MERGE-09, technical design "The
// Local Base Branch"): once every pull request of the delivery reads merged, Kiln fetches each
// repository's base branch into the person's main checkout and fast-forwards the local base branch
// to it when that is safe, and otherwise changes nothing and says how to do it. It never merges a
// diverged branch, rebases, resets, stashes, touches uncommitted work or pushes.
//
//   const entry = await syncBaseBranch({ git, repository: "acme-shop", checkout: "~/code/acme-shop", github: "acme/acme-shop", base: "develop", now });
//   baseBranchLine(entry, false)
//   // { line: "Kiln brought develop in ~/code/acme-shop up to date with origin: 4 commits, to 8e41c0d." }

import { realpathSync } from "node:fs";
import { findMainCheckout } from "./delivery-reading.js";
import { gitError, listWorktrees, localBranchCommit, runGit, shortSha, type GitContext } from "./git-reads.js";

export type BaseBranchReason = "uncommitted" | "diverged" | "checked_out_elsewhere" | "refused" | "not_read";

export interface BaseBranchEntry {
  repository: string;
  /** The main checkout's path as the record saves it. */
  checkout: string;
  base: string;
  at: string;
  outcome: "fast_forwarded" | "branch_moved" | "current" | "left";
  /** `origin/<base>` as Kiln fetched it after the merge; later checks retry against it without fetching. */
  fetched?: string;
  /** The local base branch before Kiln acted. */
  from?: string;
  behind?: number;
  ahead?: number;
  reason?: BaseBranchReason;
  /** Git's message, or why the checkout could not be read. */
  problem?: string;
  /** The branch the checkout is on, the base branch included; `detached` when it is on none. */
  checkoutBranch?: string;
  detached?: true;
  /** Another worktree that has the base branch checked out. */
  elsewhere?: string;
}

export interface SyncInput {
  git: GitContext;
  repository: string;
  checkout: string;
  github: string;
  base: string;
  now: () => string;
  /** A `left` entry's fetched commit: the retry runs against it and fetches nothing. */
  fetched?: string;
}

const FETCH_TIMEOUT_MS = 60_000;

/** One repository's step: the full step with no `fetched`, the retry with one. Never throws. */
export async function syncBaseBranch(input: SyncInput): Promise<BaseBranchEntry> {
  const { git, repository, checkout, base } = input;
  const entry = (fields: Partial<BaseBranchEntry> & Pick<BaseBranchEntry, "outcome">): BaseBranchEntry => ({ repository, checkout, base, at: input.now(), ...fields });
  try {
    const found = await findMainCheckout(git, checkout, input.github);
    if (!found.ok) return entry({ outcome: "left", reason: "not_read", problem: found.problem });
    const cwd = found.path;
    // Where the base branch is checked out, read before the fetch so a failed fetch still gets the right command.
    const head = await runGit(git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const where: Partial<BaseBranchEntry> = head.exitCode === 0 ? { checkoutBranch: head.stdout.trim() } : { detached: true };
    const worktrees = await listWorktrees(git, cwd);
    if (!worktrees.ok) return entry({ outcome: "left", reason: "not_read", problem: `Git could not list the worktrees: ${worktrees.error}`, ...where });
    const real = (path: string) => { try { return realpathSync(path); } catch { return path; } };
    const elsewhere = worktrees.worktrees.find(tree => tree.branch === base && real(tree.path) !== real(cwd))?.path;
    if (elsewhere) where.elsewhere = elsewhere;

    let fetched = input.fetched;
    if (!fetched) {
      const fetch = await runGit(git, cwd, ["fetch", "--no-tags", "--no-write-fetch-head", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`], FETCH_TIMEOUT_MS);
      if (fetch.exitCode !== 0) return entry({ outcome: "left", reason: "not_read", problem: `Git could not fetch ${base} from origin: ${gitError(fetch)}`, ...where });
      const tip = await runGit(git, cwd, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}^{commit}`]);
      if (tip.exitCode !== 0) return entry({ outcome: "left", reason: "not_read", problem: `Git could not read origin/${base} after fetching it.`, ...where });
      fetched = tip.stdout.trim();
    }
    const local = await localBranchCommit(git, cwd, base);
    if (!local) return entry({ outcome: "current", fetched });
    const contains = await runGit(git, cwd, ["merge-base", "--is-ancestor", fetched, local]);
    if (contains.exitCode === 0) return entry({ outcome: "current", fetched, from: local });
    if (contains.exitCode !== 1) return entry({ outcome: "left", reason: "not_read", problem: `Git could not compare ${base} with origin/${base}: ${gitError(contains)}`, fetched, ...where });
    const count = async (range: string) => {
      const result = await runGit(git, cwd, ["rev-list", "--count", range]);
      return result.exitCode === 0 ? Number(result.stdout.trim()) : undefined;
    };
    const [behind, ahead] = [await count(`${local}..${fetched}`), await count(`${fetched}..${local}`)];
    if (behind === undefined || ahead === undefined) return entry({ outcome: "left", reason: "not_read", problem: `Git could not count the commits between ${base} and origin/${base}.`, fetched, ...where });
    const facts = { fetched, from: local, behind, ahead, ...where };
    const left = (reason: BaseBranchReason, problem?: string) => entry({ outcome: "left", reason, ...(problem ? { problem } : {}), ...facts });
    if (ahead > 0) return left("diverged");
    if (where.checkoutBranch === base) {
      const status = await runGit(git, cwd, ["status", "--porcelain=v1", "--untracked-files=no"]);
      if (status.exitCode !== 0) return left("refused", gitError(status));
      if (status.stdout.trim()) return left("uncommitted");
      // The fetch can take a while: the person may have switched branches since, and the merge moves whatever HEAD is on.
      const still = await runGit(git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
      if (still.exitCode !== 0 || still.stdout.trim() !== base) return left("not_read", `The checkout left ${base} while Kiln was fetching it.`);
      // Fast-forward only; never autostash. Git refuses, changing nothing, when an untracked or ignored file
      // (a local .env) would be overwritten: without --no-overwrite-ignore it silently replaces an ignored one.
      const merged = await runGit(git, cwd, ["merge", "--ff-only", "--no-autostash", "--no-overwrite-ignore", "--quiet", fetched]);
      if (merged.exitCode !== 0) return left("refused", gitError(merged));
      return entry({ outcome: "fast_forwarded", ...facts });
    }
    if (elsewhere) return left("checked_out_elsewhere");
    // A fast-forward-only ref update, which Git refuses for a branch checked out (or being rebased) in any worktree.
    const moved = await runGit(git, cwd, ["fetch", "--no-tags", "--no-write-fetch-head", ".", `${fetched}:refs/heads/${base}`]);
    if (moved.exitCode !== 0) return left("refused", gitError(moved));
    return entry({ outcome: "branch_moved", ...facts });
  } catch (error) {
    return entry({ outcome: "left", reason: "not_read", problem: (error as Error).message });
  }
}

const commits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;
const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
/** A path as a shell argument: as saved when it needs no quoting (a leading `~/` expands), otherwise single-quoted. */
const shellPath = (path: string) => /^(~\/)?[\w./@+-]*$/.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`;

/** The command that brings the branch up to date, run where it is checked out (technical design, "What it says"). */
export function baseBranchCommand(entry: BaseBranchEntry): string | undefined {
  if (entry.checkoutBranch === undefined && !entry.detached) return undefined;
  const { base } = entry;
  const diverged = (entry.ahead ?? 0) > 0;
  const pull = (at: string) => `git -C ${shellPath(at)} pull ${diverged ? "" : "--ff-only "}origin ${base}`;
  if (entry.elsewhere) return pull(entry.elsewhere);
  if (entry.checkoutBranch === base) return pull(entry.checkout);
  const here = shellPath(entry.checkout);
  return diverged ? `git -C ${here} switch ${base} && git -C ${here} pull origin ${base}` : `git -C ${here} fetch origin ${base}:${base}`;
}

/** What the pull request card and `kiln status` say for one repository; undefined when there is nothing to say (`current`). */
export function baseBranchLine(entry: BaseBranchEntry, multiRepository: boolean): { line: string; command?: string } | undefined {
  const named = multiRepository ? `${entry.repository}: ` : "";
  const { base, checkout } = entry;
  if (entry.outcome === "current") return undefined;
  if (entry.outcome === "fast_forwarded") return { line: `${named}Kiln brought ${base} in ${checkout} up to date with origin: ${commits(entry.behind ?? 0)}, to ${shortSha(entry.fetched ?? "")}.` };
  if (entry.outcome === "branch_moved") return { line: `${named}Kiln moved ${base} in ${checkout} up to origin/${base} (${commits(entry.behind ?? 0)}, to ${shortSha(entry.fetched ?? "")}). ${entry.checkoutBranch ? `The checkout stays on ${entry.checkoutBranch}.` : "The checkout stays where it is."}` };
  const command = baseBranchCommand(entry);
  if (entry.reason === "not_read") return { line: `${named}Kiln could not bring ${base} in ${checkout} up to date: ${sentence(entry.problem ?? "Git could not be read")} Kiln tries again at the next check.`, ...(command ? { command } : {}) };
  const because = entry.reason === "uncommitted" ? "it has uncommitted changes"
    : entry.reason === "diverged" ? "Kiln only fast-forwards"
    : entry.reason === "checked_out_elsewhere" ? `it is checked out in ${entry.elsewhere}`
    : `Git refused: ${(entry.problem ?? "").replace(/\.$/, "")}`;
  const lacks = (entry.ahead ?? 0) > 0 ? ` and has ${commits(entry.ahead!)} origin lacks` : "";
  return { line: `${named}${base} in ${checkout} is ${commits(entry.behind ?? 0)} behind origin/${base}${lacks}. Kiln left it as it is because ${because}.`, ...(command ? { command } : {}) };
}

/** One line of text with its command, as `kiln status` prints it. */
export const baseBranchText = (said: { line: string; command?: string }): string => said.command ? `${said.line} To bring it up to date: ${said.command}` : said.line;

/** Every line a finished run's card shows for its local base branches, in the delivery's order. */
export function baseBranchLines(entries: BaseBranchEntry[] | undefined, multiRepository: boolean): { repository: string; line: string; command?: string }[] {
  return (entries ?? []).flatMap(entry => {
    const said = baseBranchLine(entry, multiRepository);
    return said ? [{ repository: entry.repository, ...said }] : [];
  });
}
