// Auxiliary display evidence. This module never decides completion or starts agent work.
import type { DeliveryEvent, DeliveryHistory } from "../state/records.js";
import { runHelper } from "../platform/helper-process.js";
import { gitError, runGit, type GitContext } from "./git-reads.js";

export interface HistoryInput {
  repository: string;
  github: string;
  cwd: string;
  git: GitContext;
  gh: string;
  ranges: { start: string; end: string }[];
  baseHistory?: { start: string; end: string; branch: string };
}
const SHA = /^[0-9a-f]{40,64}$/;
const WORK_LIMIT = 200;
const INTRODUCTION_LIMIT = 10_000;
interface Pull {
  number: number; title: string; merged_at: string | null; merge_commit_sha: string | null;
  base: { ref: string; repo: { full_name: string } };
}

async function parallel<T>(items: T[], read: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    for (;;) { const item = items[next++]; if (item === undefined) return; await read(item); }
  }));
}

/** Exact identity and introduction establish attribution; names, dates and file similarity do not. */
export async function readDeliveryHistory(input: HistoryInput): Promise<DeliveryHistory["repositories"][number]> {
  const result: DeliveryHistory["repositories"][number] = { repository: input.repository, workCommitCount: 0, unattributedCommitCount: 0, events: [], problems: [] };
  const detail = (error: unknown) => input.git.signal?.aborted && input.git.signal.reason?.name === "TimeoutError" ? "Delivery history read timed out" : (error as Error).message;
  const problem = (message: string) => { if (!result.problems.includes(message)) result.problems.push(message); };
  const readGit = async (args: string[]) => {
    const read = await runGit(input.git, input.cwd, args);
    if (read.exitCode !== 0) throw new Error(gitError(read));
    return read.stdout.trim();
  };
  const object = async (sha: string) => {
    if (!SHA.test(sha)) throw new Error("Invalid recorded commit identity");
    const present = await runGit(input.git, input.cwd, ["cat-file", "-e", `${sha}^{commit}`]);
    if (present.exitCode !== 0) await readGit(["fetch", "--no-tags", "origin", sha]);
  };
  const work = new Set<string>();
  for (const range of input.ranges) {
    try {
      await object(range.start); await object(range.end);
      await readGit(["merge-base", "--is-ancestor", range.start, range.end]);
      const log = await readGit(["log", "--first-parent", `--max-count=${WORK_LIMIT + 1}`, "--format=%H %P", `${range.start}..${range.end}`]);
      const lines = log ? log.split("\n") : [];
      if (lines.length > WORK_LIMIT) throw new Error("Recorded work exceeds the delivery-history lookup limit");
      if (range.start !== range.end && (!lines.length || lines.at(-1)!.trim().split(/\s+/)[1] !== range.start)) throw new Error("Recorded range does not follow the feature's first-parent history");
      for (const line of lines) {
        const [sha, ...parents] = line.trim().split(/\s+/);
        if (!sha || !SHA.test(sha)) throw new Error("Unreadable recorded commit range");
        if (parents.length <= 1) work.add(sha); // Sync merges do not define new PRD work.
      }
    } catch (error) { problem(`Recorded range unavailable: ${detail(error)}`); }
  }
  result.workCommitCount = work.size;
  result.unattributedCommitCount = work.size;
  if (!input.ranges.length) problem("No recorded phase commit ranges are available.");
  if (work.size > WORK_LIMIT) { problem("Recorded work exceeds the delivery-history lookup limit."); return result; }
  const events = new Map<string, DeliveryEvent>();
  const candidates = new Map<number, Pull>();
  await parallel([...work], async sha => {
    try {
      const response = await runHelper(input.gh, ["api", "--paginate", "--slurp", `repos/${input.github}/commits/${sha}/pulls?per_page=100`], { cwd: input.cwd, env: input.git.env, ...(input.git.signal ? { signal: input.git.signal } : {}) });
      if (response.exitCode !== 0) throw new Error(gitError(response));
      const pages: unknown = JSON.parse(response.stdout);
      if (!Array.isArray(pages) || !pages.every(Array.isArray)) throw new Error("Unreadable commit-to-PR response");
      for (const raw of pages.flat()) {
        if (!raw || typeof raw !== "object") throw new Error("Unreadable PR association");
        const pull = raw as Pull;
        if (!pull.merged_at) continue;
        if (typeof pull.merged_at !== "string" || !Number.isFinite(Date.parse(pull.merged_at)) || !Number.isInteger(pull.number) || pull.number <= 0 || typeof pull.title !== "string" || !SHA.test(pull.merge_commit_sha ?? "") || typeof pull.base?.ref !== "string" || !pull.base.ref || pull.base.repo?.full_name?.toLowerCase() !== input.github.toLowerCase()) throw new Error("Incomplete merged-PR association");
        candidates.set(pull.number, pull);
      }
    } catch (error) { problem(`PR lookup incomplete: ${detail(error)}`); }
  });
  const introduce = async (sha: string, title: string, target: string, pull?: Pull) => {
    await object(sha);
    const parentLine = await readGit(["show", "--no-patch", "--format=%P", sha]);
    const parent = parentLine.split(/\s+/)[0];
    if (!parent || !SHA.test(parent)) throw new Error("Merge introduction has no readable first parent");
    const added = await readGit(["log", "--no-merges", "--format=%H", `--max-count=${INTRODUCTION_LIMIT + 1}`, `${parent}..${sha}`]);
    const introduced = added ? added.split("\n") : [];
    if (introduced.length > INTRODUCTION_LIMIT) throw new Error("Merge introduction exceeds the delivery-history lookup limit");
    const matched = introduced.filter(commit => work.has(commit));
    if (!matched.length) return;
    const occurredAt = pull ? pull.merged_at! : await readGit(["show", "--no-patch", "--format=%cI", sha]);
    if (!Number.isFinite(Date.parse(occurredAt))) throw new Error("Merge timestamp is unreadable");
    const event: DeliveryEvent = {
      kind: pull ? "pull_request" : "merge", repository: input.repository, commit: sha,
      ...(pull ? { number: pull.number } : {}), title, target,
      url: pull ? `https://github.com/${input.github}/pull/${pull.number}` : `https://github.com/${input.github}/commit/${sha}`,
      workCommits: matched.sort(), broader: introduced.length > matched.length, occurredAt: new Date(occurredAt).toISOString(),
    };
    if (pull) { events.delete(`merge:${sha}`); events.set(`pr:${pull.number}`, event); }
    else if (![...events.values()].some(event => event.kind === "pull_request" && event.commit === sha)) events.set(`merge:${sha}`, event);
  };
  if (input.baseHistory) {
    try {
      const base = input.baseHistory;
      await object(base.start); await object(base.end);
      await readGit(["merge-base", "--is-ancestor", base.start, base.end]);
      const log = await readGit(["log", "--ancestry-path", "--merges", "--max-count=501", "--format=%H %s", `${base.start}..${base.end}`]);
      const lines = log ? log.split("\n") : [];
      if (lines.length > 500) throw new Error("Base history exceeds the delivery-history lookup limit");
      for (const line of lines.reverse()) {
        const space = line.indexOf(" ");
        await introduce(line.slice(0, space), line.slice(space + 1), base.branch);
      }
    } catch (error) { problem(`Merge lookup incomplete: ${detail(error)}`); }
  }
  await parallel([...candidates.values()], async pull => {
    try { await introduce(pull.merge_commit_sha!, pull.title, pull.base.ref, pull); }
    catch (error) { problem(`PR #${pull.number} introduction unverified: ${detail(error)}`); }
  });
  result.events = [...events.values()].sort((a, b) => a.kind === "pull_request" && b.kind === "pull_request" ? a.number! - b.number! : a.kind === b.kind ? 0 : a.kind === "pull_request" ? -1 : 1);
  const attributed = new Set(result.events.flatMap(event => event.workCommits));
  result.unattributedCommitCount = [...work].filter(sha => !attributed.has(sha)).length;
  return result;
}
