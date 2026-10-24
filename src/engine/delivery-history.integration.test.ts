// Real Git proves introduction rather than containment. GitHub's paginated association
// shape is exercised through process pipes beside the live pricing contract/proof.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createBareOrigin, createRepository, createSandbox, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { readJsonLines } from "../state/state-files.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { readDeliveryHistory, type HistoryInput } from "./delivery-history.js";
import { readPrdRecord } from "../state/records.js";
import { buildSnapshot } from "./snapshot.js";

let sandbox: Sandbox | undefined;
let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; await sandbox?.cleanup(); sandbox = undefined; });
function setup(name = "pricing") {
  sandbox ??= createSandbox();
  const origin = createBareOrigin(sandbox, name);
  const repo = createRepository(sandbox, name, origin);
  const run = (...args: string[]) => git(sandbox!, repo, ...args).trim();
  const head = () => run("rev-parse", "HEAD");
  const base = head();
  run("switch", "-q", "-c", "feature/ours");
  writeFileSync(join(repo, "ours.txt"), "PRD work"); run("add", "ours.txt"); run("commit", "-q", "-m", "PRD work");
  const work = head();
  run("switch", "-q", "-c", "upstream", "develop");
  writeFileSync(join(repo, "upstream.txt"), "unrelated work"); run("add", "upstream.txt"); run("commit", "-q", "-m", "unrelated upstream");
  run("switch", "-q", "feature/ours"); run("merge", "-q", "--no-ff", "--no-edit", "upstream");
  const tip = head();
  run("switch", "-q", "develop");
  execFileSync("git", ["merge", "-q", "--no-ff", "--no-edit", "feature/ours"], { cwd: repo, env: { ...sandbox.env, GIT_AUTHOR_DATE: "2026-10-22T12:00:00Z", GIT_COMMITTER_DATE: "2026-10-23T18:45:00Z" } });
  const merge = head();
  run("switch", "-q", "-c", "later");
  writeFileSync(join(repo, "later.txt"), "later unrelated work"); run("add", "later.txt"); run("commit", "-q", "-m", "later unrelated");
  run("switch", "-q", "develop"); run("merge", "-q", "--no-ff", "--no-edit", "later");
  const later = head(); run("push", "-q", "origin", "--all");
  const { gh } = installStandIns(join(sandbox.root, "bin"));
  const state = join(sandbox.root, `${name}-gh-history.json`);
  const env = { ...sandbox.env, KILN_STANDIN_GH_STATE: state };
  const input: HistoryInput = { repository: name, github: `acme/${name}`, cwd: repo, git: { git: "git", env }, gh, ranges: [{ start: base, end: tip }], baseHistory: { start: base, end: later, branch: "develop" } };
  const pull = (number: number, sha: string) => ({ number, title: `Release ${number}`, merged_at: "2026-10-24T15:00:00Z", merge_commit_sha: sha, base: { ref: "develop", repo: { full_name: `acme/${name}` } } });
  return { input, work, base, tip, merge, later, state, pull };
}

describe("reliable whole-PRD delivery history", () => {
  it("deduplicates paginated PR associations, excludes upstream syncs and later mere containment, and labels broader releases", async () => {
    const f = setup();
    writeFileSync(f.state, JSON.stringify({ commitPullPages: { [f.work]: [[f.pull(3, f.merge)], [f.pull(3, f.merge), f.pull(99, f.later), { ...f.pull(12, f.later), merged_at: null }]] } }));
    const result = await readDeliveryHistory(f.input);
    expect(result.problems).toEqual([]);
    expect(result.workCommitCount).toBe(1); // Sync merge and unrelated upstream commit are not attributed.
    expect(result.unattributedCommitCount).toBe(0);
    expect(result.events).toEqual([{ kind: "pull_request", repository: "pricing", commit: f.merge, number: 3, title: "Release 3", target: "develop", url: "https://github.com/acme/pricing/pull/3", workCommits: [f.work], broader: true, occurredAt: "2026-10-24T15:00:00.000Z" }]);
    expect(readJsonLines<string[]>(`${f.state}.calls.jsonl`)).toEqual([["api", "--paginate", "--slurp", `repos/acme/pricing/commits/${f.work}/pulls?per_page=100`]]);
  });

  it("shows the actual merge when no verified PR association exists", async () => {
    const f = setup(); writeFileSync(f.state, JSON.stringify({}));
    const result = await readDeliveryHistory(f.input);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ kind: "merge", commit: f.merge, target: "develop", workCommits: [f.work], broader: true, url: `https://github.com/acme/pricing/commit/${f.merge}` });
    expect(result.events[0]!.number).toBeUndefined();
    const committedAt = git(sandbox!, f.input.cwd, "show", "--no-patch", "--format=%cI", f.merge).trim();
    const authoredAt = git(sandbox!, f.input.cwd, "show", "--no-patch", "--format=%aI", f.merge).trim();
    expect(authoredAt).not.toBe(committedAt);
    expect(result.events[0]!.occurredAt).toBe("2026-10-23T18:45:00.000Z");
  });

  it("keeps independently verified events scoped to their repositories", async () => {
    const fixtures = [setup("pricing"), setup("catalog")];
    for (const f of fixtures) writeFileSync(f.state, JSON.stringify({ commitPulls: { [f.work]: [f.pull(3, f.merge)] } }));
    const results = await Promise.all(fixtures.map(f => readDeliveryHistory(f.input)));
    for (const [index, result] of results.entries()) {
      const f = fixtures[index]!;
      expect(result.repository).toBe(f.input.repository);
      expect(result.problems).toEqual([]);
      expect(result.events).toEqual([expect.objectContaining({ repository: f.input.repository, number: 3, commit: f.merge, workCommits: [f.work], url: `https://github.com/${f.input.github}/pull/3` })]);
      expect(result.unattributedCommitCount).toBe(0);
    }
  });

  it("does not label a PR containing only recorded work as a broader release", async () => {
    const f = setup();
    git(sandbox!, f.input.cwd, "switch", "-q", "-c", "clean-target", f.base);
    git(sandbox!, f.input.cwd, "merge", "-q", "--no-ff", "--no-edit", f.work);
    const merge = git(sandbox!, f.input.cwd, "rev-parse", "HEAD").trim();
    writeFileSync(f.state, JSON.stringify({ commitPulls: { [f.work]: [{ ...f.pull(4, merge), base: { ref: "clean-target", repo: { full_name: "acme/pricing" } } }] } }));
    const withoutBase = { ...f.input }; delete withoutBase.baseHistory;
    const result = await readDeliveryHistory(withoutBase);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ kind: "pull_request", number: 4, broader: false, workCommits: [f.work] });
  });

  it("reports unavailable attribution without guessing from PR titles or closing the run again", async () => {
    const f = setup();
    for (const state of [{ historyError: "GitHub unavailable" }, { rawHistory: "invalid JSON" }, { commitPulls: { [f.work]: [{ ...f.pull(3, f.merge), base: { ref: "develop", repo: { full_name: "other/repo" } } }] } }]) {
      writeFileSync(f.state, JSON.stringify(state));
      const withoutBase = { ...f.input }; delete withoutBase.baseHistory;
      const result = await readDeliveryHistory(withoutBase);
      expect(result.events).toEqual([]); expect(result.unattributedCommitCount).toBe(1);
      expect(result.problems.join(" ")).toContain("PR lookup incomplete");
    }
    writeFileSync(f.state, JSON.stringify({}));
    const missing = await readDeliveryHistory({ ...f.input, ranges: [{ start: "a".repeat(40), end: f.tip }] });
    expect(missing.events).toEqual([]); expect(missing.problems.join(" ")).toContain("Recorded range unavailable");
  });

  it("reports a history gap instead of querying an oversized recorded work range", async () => {
    const f = setup();
    const commits = Array.from({ length: 201 }, (_, index) => `commit refs/heads/over-limit\ncommitter History Test <history@example.test> 1760000000 +0000\ndata ${String(index).length}\n${index}\n${index === 0 ? `from ${f.base}\n` : ""}\n`).join("");
    execFileSync("git", ["fast-import", "--quiet"], { cwd: f.input.cwd, env: sandbox!.env, input: commits });
    const end = git(sandbox!, f.input.cwd, "rev-parse", "over-limit").trim();
    writeFileSync(f.state, JSON.stringify({}));
    const result = await readDeliveryHistory({ ...f.input, ranges: [{ start: f.base, end }] });
    expect(result.events).toEqual([]);
    expect(result.problems.join(" ")).toContain("Recorded work exceeds the delivery-history lookup limit");
    expect(existsSync(`${f.state}.calls.jsonl`)).toBe(false);
  });

  it("cancels a running history lookup and exposes a timeout without inventing links", async () => {
    const f = setup(); writeFileSync(f.state, JSON.stringify({ historyDelayMs: 5_000 }));
    const controller = new AbortController();
    const withoutBase = { ...f.input }; delete withoutBase.baseHistory;
    const pending = readDeliveryHistory({ ...withoutBase, git: { ...f.input.git, signal: controller.signal } });
    await waitFor(() => existsSync(`${f.state}.calls.jsonl`), 5_000);
    controller.abort(new DOMException("History deadline exceeded", "TimeoutError"));
    const result = await pending;
    expect(result.events).toEqual([]);
    expect(result.unattributedCommitCount).toBe(1);
    expect(result.problems).toEqual(["PR lookup incomplete: Delivery history read timed out"]);
  });

  it("limits GitHub lookups across repositories and clears pending after failed lookups", async () => {
    const f = setup("catalog");
    git(sandbox!, f.input.cwd, "switch", "-q", "feature/ours");
    for (let i = 0; i < 5; i++) git(sandbox!, f.input.cwd, "commit", "-q", "--allow-empty", "-m", `Additional work ${i}`);
    const end = git(sandbox!, f.input.cwd, "rev-parse", "HEAD").trim();
    harness = await createHarness({ sessions: [landingSession("one"), landingSession("two"), landingSession("three"), pullRequestSession(7)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    h.engine.record.repositories.push({ name: "catalog", kind: "added", mainCheckoutPath: f.input.cwd, github: "acme/catalog", baseBranch: "develop", worktreePath: f.input.cwd, baseCommit: f.base, setupCompletedAt: new Date().toISOString() });
    h.engine.record.phases["1"]!.repositories.catalog = { startCommit: f.base, pushedSha: end };
    const eventsPath = join(h.sandbox.root, "history-events.jsonl");
    h.env.KILN_STANDIN_HISTORY_EVENTS = eventsPath;
    writeFileSync(h.ghStatePath, JSON.stringify({ ...JSON.parse(readFileSync(h.ghStatePath, "utf8")), historyDelayMs: 300, historyError: "Temporarily unavailable" }));
    const reading = h.engine.refreshDeliveryHistory();
    expect(buildSnapshot(h.engine).deliveryHistoryPending).toBe(true);
    await reading;
    let active = 0, peak = 0;
    for (const event of readJsonLines<{ event: string }>(eventsPath)) {
      active += event.event === "start" ? 1 : -1;
      peak = Math.max(peak, active);
    }
    expect(peak).toBeGreaterThan(1); expect(peak).toBeLessThanOrEqual(4); expect(active).toBe(0);
    expect(h.engine.record.deliveryHistory?.repositories.map(repo => repo.workCommitCount)).toEqual([3, 6]);
    expect(h.engine.record.deliveryHistory?.repositories.every(repo => repo.problems.some(problem => problem.includes("Temporarily unavailable")))).toBe(true);
    expect(buildSnapshot(h.engine).deliveryHistoryPending).toBe(false);
    expect(buildSnapshot(h.engine).feature.state).toBe("complete");
  });

  it("enriches an existing completed record without changing its completion, review PRs or model turns", async () => {
    harness = await createHarness({ sessions: [landingSession("one.txt"), landingSession("two.txt"), landingSession("three.txt"), pullRequestSession(7)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const at = h.engine.record.completedAt;
    const pulls = structuredClone(h.engine.record.pullRequests);
    const calls = h.claudeCalls().length;
    h.reopenFromDisk();
    await h.engine.refreshDeliveryHistory();
    expect(h.engine.record.completedAt).toBe(at); expect(h.engine.record.pullRequests).toEqual(pulls);
    expect(h.claudeCalls()).toHaveLength(calls);
    expect(h.engine.record.deliveryHistory?.repositories[0]?.workCommitCount).toBe(3);
    expect(readPrdRecord(h.stateDirectory)?.deliveryHistory).toEqual(h.engine.record.deliveryHistory);
    expect(buildSnapshot(h.engine).feature.state).toBe("complete");
    expect(buildSnapshot(h.engine).deliveryHistoryPending).toBe(false);
    const receiptPhase = Object.entries(h.engine.record.phases).find(([key, phase]) => key !== "pr" && phase.doneAt && Object.keys(phase.repositories).length)!;
    const repositoryName = Object.keys(receiptPhase[1].repositories)[0]!;
    Reflect.deleteProperty(receiptPhase[1].repositories[repositoryName]!, "startCommit");
    await h.engine.refreshDeliveryHistory();
    expect(h.engine.record.deliveryHistory?.repositories.find(repo => repo.repository === repositoryName)?.problems).toContain(`Phase ${receiptPhase[0]} has an incomplete recorded commit range.`);
    expect(h.engine.record.completedAt).toBe(at);
  });
});
