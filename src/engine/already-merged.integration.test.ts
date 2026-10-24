// Real Git ancestry and bare origins prove the completion boundary. The gh stand-in
// reproduces the compare response contract checked against live GitHub, without inference.
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBareOrigin, createRepository, createSandbox, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { readPrdRecord } from "../state/records.js";
import { formatDecisionLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { buildSnapshot } from "./snapshot.js";
import { runPullRequestChecks, type PullRequestCheckInput } from "./checks.js";
import type { StayedOutcome } from "../session/outside-workspace.js";

let sandbox: Sandbox | undefined;
let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; await sandbox?.cleanup(); sandbox = undefined; });
const STAYED: StayedOutcome = { passed: true, changes: [], transcripts: [], check: { name: "Stayed in the workspace", passed: true, facts: [] } };
const BRANCH = "feature/customer-returns";
function repositoryFixture(name = "pricing") {
  sandbox ??= createSandbox();
  const origin = createBareOrigin(sandbox, name);
  const repo = createRepository(sandbox, name, origin);
  git(sandbox, repo, "push", "-q", "origin", "develop");
  git(sandbox, repo, "switch", "-q", "-c", BRANCH);
  writeFileSync(join(repo, "feature.txt"), "feature work\n");
  git(sandbox, repo, "add", "feature.txt"); git(sandbox, repo, "commit", "-q", "-m", "feature");
  git(sandbox, repo, "push", "-q", "origin", BRANCH);
  const tip = git(sandbox, repo, "rev-parse", "HEAD").trim();
  const { gh } = installStandIns(join(sandbox.root, "bin"));
  const state = join(sandbox.root, `${name}-gh.json`);
  writeFileSync(state, JSON.stringify({ pulls: [] }));
  const input: PullRequestCheckInput = { gh, env: { ...sandbox.env, KILN_STANDIN_GH_STATE: state }, git: { git: "git", env: sandbox.env }, mainCheckoutPath: repo, worktreePath: repo, github: `acme/${name}`, branch: BRANCH, baseBranch: "develop", repository: name };
  const integrate = (fastForward = false) => {
    git(sandbox!, repo, "switch", "-q", "develop");
    git(sandbox!, repo, "merge", "-q", ...(fastForward ? ["--ff-only"] : ["--no-ff", "--no-edit"]), BRANCH);
    git(sandbox!, repo, "push", "-q", "origin", "develop");
    git(sandbox!, repo, "switch", "-q", BRANCH);
  };
  return { input, repo, origin, state, tip, integrate };
}

describe("completion after independently merged work", () => {
  it.each([false, true])("accepts exact-tip integration, including fast-forward=%s and deleted remote source", async fastForward => {
    const f = repositoryFixture(); f.integrate(fastForward);
    git(sandbox!, f.repo, "push", "-q", "origin", "--delete", BRANCH);
    const result = await runPullRequestChecks([f.input], STAYED);
    expect(result.passed).toBe(true);
    expect(result.pullRequests).toEqual([]);
    expect(result.mergedBranches).toEqual([{ repository: "pricing", head: BRANCH, base: "develop", featureCommit: f.tip, baseCommit: git(sandbox!, f.repo, "rev-parse", "develop").trim(), url: `https://github.com/acme/pricing/commit/${f.tip}` }]);
  });

  it("does not confuse an empty diff, old merged work, dirty files or wrong branches with complete delivery", async () => {
    const f = repositoryFixture(); f.integrate();
    writeFileSync(join(f.repo, "pending.txt"), "pending");
    expect((await runPullRequestChecks([f.input], STAYED)).passed).toBe(false);
    rmSync(join(f.repo, "pending.txt"));
    git(sandbox!, f.repo, "switch", "-q", "develop");
    expect((await runPullRequestChecks([f.input], STAYED)).passed).toBe(false);
    git(sandbox!, f.repo, "switch", "-q", BRANCH);
    // An empty commit has no diff, but is still new feature work outside the base.
    git(sandbox!, f.repo, "commit", "-q", "--allow-empty", "-m", "new unmerged work");
    expect((await runPullRequestChecks([f.input], STAYED)).passed).toBe(false); // Unpushed local tip.
    git(sandbox!, f.repo, "push", "-q", "origin", BRANCH);
    expect((await runPullRequestChecks([f.input], STAYED)).passed).toBe(false); // Old integration cannot cover it.
  });

  it("requires live intended-base evidence and preserves workspace checks", async () => {
    const f = repositoryFixture(); f.integrate();
    expect((await runPullRequestChecks([{ ...f.input, baseBranch: "missing-base" }], STAYED)).passed).toBe(false);
    for (const override of [{ compareError: "GitHub unavailable" }, { comparison: "invalid JSON" }, { comparison: { status: "identical", ahead_by: 0 } }]) {
      writeFileSync(f.state, JSON.stringify({ pulls: [], ...override }));
      const result = await runPullRequestChecks([f.input], STAYED);
      expect(result.passed).toBe(false); expect(result.mergedBranches).toBeUndefined();
      expect(result.check.facts.join(" ")).toContain("Could not confirm prior integration");
    }
    writeFileSync(f.state, JSON.stringify({ pulls: [] }));
    const outside = { ...STAYED, passed: false, check: { name: "Stayed in the workspace", passed: false, facts: ["Outside write"] } };
    const blocked = await runPullRequestChecks([f.input], outside);
    expect(blocked.passed).toBe(false); expect(blocked.mergedBranches).toBeUndefined();
    expect(blocked.checks).toContainEqual(outside.check);
  });

  it("cannot mistake a branch reset for delivery of previously completed work", async () => {
    const f = repositoryFixture();
    const base = git(sandbox!, f.repo, "rev-parse", "develop").trim();
    git(sandbox!, f.repo, "reset", "--hard", base);
    git(sandbox!, f.repo, "--git-dir", f.origin, "update-ref", `refs/heads/${BRANCH}`, base);
    const result = await runPullRequestChecks([{ ...f.input, completedCommits: [f.tip] }], STAYED);
    expect(result.passed).toBe(false);
    expect(result.check.facts.join(" ")).toContain("Previously completed commit");
  });

  it("rejects worktree changes made while GitHub is being read", async () => {
    const f = repositoryFixture(); f.integrate();
    writeFileSync(f.state, JSON.stringify({ pulls: [], compareWriteFile: { path: join(f.repo, "concurrent-edit.txt"), content: "new work" } }));
    const result = await runPullRequestChecks([f.input], STAYED);
    expect(result.passed).toBe(false);
    expect(result.check.facts.join(" ")).toContain("uncommitted changes");
  });

  it("permits a mixed delivery only when every repository qualifies", async () => {
    const merged = repositoryFixture("pricing"); merged.integrate();
    const pending = repositoryFixture("storefront");
    expect((await runPullRequestChecks([merged.input, pending.input], STAYED)).passed).toBe(false);
    writeFileSync(pending.state, JSON.stringify({ pulls: [{ repo: "acme/storefront", number: 7, title: "Storefront", url: "https://github.com/acme/storefront/pull/7", isDraft: false, isCrossRepository: false, headRefName: BRANCH, baseRefName: "develop", additions: 1, deletions: 0, commits: [{}] }] }));
    const result = await runPullRequestChecks([merged.input, pending.input], STAYED);
    expect(result.passed).toBe(true);
    expect(result.pullRequests?.map(p => p.repository)).toEqual(["storefront"]);
    expect(result.mergedBranches?.map(p => p.repository)).toEqual(["pricing"]);
  });

  it("keeps a reset code repository eligible and checks its recorded completed receipt", async () => {
    harness = await createHarness({ sessions: [landingSession("one.txt"), landingSession("two.txt"), landingSession("three.txt"), { actions: [{ result: "No pull request was opened" }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const origin = createBareOrigin(h.sandbox, "extra");
    const source = createRepository(h.sandbox, "extra", origin);
    git(h.sandbox, source, "push", "-q", "origin", "develop");
    const base = git(h.sandbox, source, "rev-parse", "HEAD").trim();
    const worktree = join(h.engine.workspaceFolder, "extra");
    mkdirSync(h.engine.workspaceFolder, { recursive: true });
    git(h.sandbox, source, "worktree", "add", "-q", "-b", BRANCH, worktree, "develop");
    writeFileSync(join(worktree, "delivered.txt"), "work still owed");
    git(h.sandbox, worktree, "add", "delivered.txt"); git(h.sandbox, worktree, "commit", "-q", "-m", "feature work");
    const receipt = git(h.sandbox, worktree, "rev-parse", "HEAD").trim();
    git(h.sandbox, worktree, "push", "-q", "origin", BRANCH);
    h.engine.record.repositories.push({ name: "extra", kind: "added", mainCheckoutPath: source, github: "acme/extra", baseBranch: "develop", worktreePath: worktree, baseCommit: base, setupCompletedAt: new Date().toISOString() });
    h.engine.record.phases["1"]!.repositories.extra = { startCommit: base, pushedSha: receipt, commitCount: 1 };
    git(h.sandbox, worktree, "reset", "--hard", base);
    git(h.sandbox, source, "--git-dir", origin, "update-ref", `refs/heads/${BRANCH}`, base);
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const calls = h.claudeCalls().length;
    await h.engine.checkAgain(); await h.engine.settled();
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.feature.state).toBe("needs_you");
    expect(snapshot.needsYou?.checks.flatMap(check => check.facts).join(" ")).toContain(`extra: No open pull request`);
    expect(snapshot.needsYou?.checks.flatMap(check => check.facts).join(" ")).toContain(`Previously completed commit ${receipt.slice(0, 7)}`);
    expect(h.engine.record.completedAt).toBeUndefined();
    expect(h.claudeCalls()).toHaveLength(calls);
  });

  it.each(["check", "resume", "restart"])("finishes a stopped final session through %s without another model turn and persists its evidence", async route => {
    harness = await createHarness({ sessions: [landingSession("one.txt"), landingSession("two.txt"), landingSession("three.txt"), { actions: [{ result: "No pull request was opened" }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.completedAt).toBeUndefined();
    const calls = h.claudeCalls().length;
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "--no-edit", BRANCH);
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const engine = route === "restart" ? h.reopenFromDisk() : h.engine;
    if (route === "restart") { await engine.prepare(); const decision = await engine.decide();
      expect(decision.kind).toBe("complete");
      expect(formatDecisionLine(decision, engine, terminalColors({ isTTY: false }, {}))).toContain("Already merged: acme-shop into develop");
      await engine.continue(); }
    else if (route === "resume") await engine.resume({ note: "Already merged" });
    else await engine.checkAgain();
    await engine.settled();
    expect(h.claudeCalls()).toHaveLength(calls);
    expect(buildSnapshot(engine).feature.state).toBe("complete");
    expect(buildSnapshot(engine).mergedBranches?.[0]).toMatchObject({ repository: "acme-shop", base: "develop" });
    expect(readPrdRecord(h.stateDirectory)?.mergedBranches).toEqual(engine.record.mergedBranches);
    if (route !== "restart") expect(h.events.some(event => event.kind === "pull_request" && event.event === "completed")).toBe(true);
  });
});
