// Adding a repository after Start, at the engine (multi-repo PRD AC-ADD-01, AC-ADD-02; technical
// design, "In the engine"): when it is allowed, the checks in their words, a git failure undone and
// tried again, a worktree Git left half made, an interrupted add finished from its recorded
// commit, and two requests for one repository at once. Real git, the PRD's repository beside the
// one added, the stand-in claude stopping phase 1 at Needs you so additions are allowed.

import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { displayPath } from "./worktree-setup.js";

const BRANCH = "feature/customer-returns";
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

/** A PRD underway with phase 1 stopped at Needs you, and `returns-api` on GitHub beside its repository. */
async function stoppedWithNeighbour(): Promise<{ h: Harness; checkout: string; workspace: string }> {
  harness = await createHarness({ sessions: [{ actions: [{ result: "Stopping partway." }, { exit: 0 }] }] });
  const h = harness;
  const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
  const checkout = createRepository(h.sandbox, "returns-api", origin.url);
  git(h.sandbox, checkout, "push", "-q", "origin", "develop");
  // The engine reaches origin as github.com through the sandbox's SSH stand-in.
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  return { h, checkout, workspace: join(h.sandbox.root, ".worktrees", "customer-returns") };
}

describe("adding a repository after Start", () => {
  it("is refused before Start, and allowed while a phase is stopped at Needs you", async () => {
    harness = await createHarness({ sessions: [] });
    expect(await harness.engine.addRepository("returns-api")).toEqual({
      ok: false,
      status: 409,
      reason: "Kiln adds a repository only while a phase is running or stopped at Needs you.",
    });
  });

  it("is refused during the pull-request session's stop, since that session changes no code", async () => {
    harness = await createHarness({
      sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), { actions: [{ result: "Opened nothing." }, { exit: 0 }] }],
    });
    await harness.engine.start({ refinementConfirmed: true });
    await harness.engine.settled();
    expect(harness.engine.stoppedPhaseKey()).toBe("pr");
    expect(await harness.engine.addRepository("returns-api")).toMatchObject({ ok: false, status: 409 });
  });

  it("puts the directory of the kiln the person ran first on each session's PATH, so kiln add-repository reaches this Kiln", async () => {
    const bin = "/opt/kiln-bin";
    harness = await createHarness({ sessions: [{ actions: [{ result: "Stopping." }, { exit: 0 }] }], engineOptions: { kilnBinDirectory: bin } });
    await harness.engine.start({ refinementConfirmed: true });
    await harness.engine.settled();
    const [call] = harness.claudeCalls() as unknown as { path: string }[];
    expect(call!.path.split(delimiter)[0]).toBe(bin);
  });

  it("refuses in the words of the failed check and changes nothing: a name differing only in case, the branch taken", async () => {
    const { h, checkout } = await stoppedWithNeighbour();
    const parent = displayPath(h.sandbox.root);
    expect(await h.engine.addRepository("Returns-API")).toEqual({ ok: false, status: 422, reason: `Returns-API isn’t in ${parent}/.` });
    git(h.sandbox, checkout, "branch", BRANCH);
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: false, status: 422, reason: expect.stringMatching(/^That branch already exists in returns-api\./) });
    expect(h.engine.record.repositories.map((entry) => entry.name)).toEqual(["acme-shop"]);
  });

  it("answers two requests for one repository with the one setup, and a later one with its path", async () => {
    const { h, workspace } = await stoppedWithNeighbour();
    const [first, second] = await Promise.all([h.engine.addRepository("returns-api"), h.engine.addRepository("returns-api")]);
    const added = { ok: true, name: "returns-api", worktreePath: join(workspace, "returns-api"), branch: BRANCH, baseBranch: "develop", added: true };
    expect(first).toEqual(added);
    expect(second).toEqual(added);
    expect(await h.engine.addRepository("returns-api")).toEqual({ ...added, added: false });
    expect(git(h.sandbox, join(workspace, "returns-api"), "branch", "--show-current").trim()).toBe(BRANCH);
    // AC-ADD-03: counted from the phase it was added in, with its base fixed.
    expect(h.engine.record.repositories[1]).toMatchObject({ name: "returns-api", kind: "added", addedInPhase: "1", baseBranch: "develop" });
    expect(h.engine.record.phases["1"]!.repositories["returns-api"]).toEqual({ startCommit: git(h.sandbox, join(workspace, "returns-api"), "rev-parse", "develop").trim() });
  });

  it("refuses a worktree folder that already holds something, in words a session can act on", async () => {
    const { h, workspace } = await stoppedWithNeighbour();
    mkdirSync(join(workspace, "returns-api"), { recursive: true });
    writeFileSync(join(workspace, "returns-api", "left.txt"), "");
    expect(await h.engine.addRepository("returns-api")).toEqual({
      ok: false,
      status: 422,
      reason: `Kiln can't make returns-api's worktree at ${displayPath(join(workspace, "returns-api"))}: That folder already exists and isn’t empty.`,
    });
    expect(h.engine.record.repositories.map((entry) => entry.name)).toEqual(["acme-shop"]);
  });

  it("refuses a worktree folder inside a checkout, and changes nothing", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ result: "Stopping partway." }, { exit: 0 }] }] });
    const h = harness;
    const workspace = join(h.sandbox.root, ".worktrees", "customer-returns");
    const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
    const checkout = createRepository(h.sandbox, "returns-api", origin.url);
    git(h.sandbox, checkout, "push", "-q", "origin", "develop");
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    // returns-api's own worktree is the workspace folder, so <workspace>/returns-api would sit inside it.
    git(h.sandbox, checkout, "worktree", "add", "-q", "-b", "elsewhere", workspace);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(await h.engine.addRepository("returns-api")).toEqual({
      ok: false,
      status: 422,
      reason: `Kiln can't make returns-api's worktree at ${displayPath(join(workspace, "returns-api"))}: That folder is inside a checkout of this repository.`,
    });
    expect(h.engine.record.repositories.map((entry) => entry.name)).toEqual(["acme-shop"]);
  });

  it("undoes a git failure, and the next request is a fresh add", async () => {
    const { h, checkout, workspace } = await stoppedWithNeighbour();
    // The branch's ref can't be created, so git worktree add fails before making anything.
    const lockFolder = join(checkout, ".git", "refs", "heads", "feature");
    mkdirSync(lockFolder, { recursive: true });
    writeFileSync(join(lockFolder, "customer-returns.lock"), "");
    const failed = await h.engine.addRepository("returns-api");
    expect(failed).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("customer-returns.lock") });
    expect(h.engine.record.repositories.map((entry) => entry.name)).toEqual(["acme-shop"]);
    rmSync(lockFolder, { recursive: true, force: true });
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: true, added: true, worktreePath: join(workspace, "returns-api") });
  });

  it("puts a one-repository PRD's added repository in the default workspace folder, though the person put its worktree elsewhere (AC-SPACE-03)", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ result: "Stopping partway." }, { exit: 0 }] }] });
    const h = harness;
    const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
    const checkout = createRepository(h.sandbox, "returns-api", origin.url);
    git(h.sandbox, checkout, "push", "-q", "origin", "develop");
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    const elsewhere = join(h.sandbox.root, "elsewhere", "acme-shop");
    expect(await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, worktreePath: elsewhere })).toMatchObject({ ok: true });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: true });
    const added = join(h.sandbox.root, ".worktrees", "customer-returns", "returns-api");
    expect(h.engine.record.repositories.map((entry) => [entry.name, entry.worktreePath])).toEqual([
      ["acme-shop", elsewhere],
      ["returns-api", added],
    ]);
    expect(git(h.sandbox, added, "branch", "--show-current").trim()).toBe(BRANCH);
  });

  it("keeps the branch a failed add made, and finishes on it once the worktree is there or gone", async () => {
    const { h, checkout, workspace } = await stoppedWithNeighbour();
    // A post-checkout hook that fails: git worktree add makes the branch and the worktree, then exits non-zero.
    const hook = join(checkout, ".git", "hooks", "post-checkout");
    writeFileSync(hook, "#!/bin/sh\necho post-checkout refused >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const failed = await h.engine.addRepository("returns-api");
    // AC-ADD-02: the session is told git's message.
    expect(failed).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("post-checkout refused") });
    const base = git(h.sandbox, checkout, "rev-parse", "develop").trim();
    expect(h.engine.record.repositories[1]).toMatchObject({ name: "returns-api", createdBranch: { name: BRANCH, commit: base, baseBranch: "develop" } });
    expect(h.engine.record.repositories[1]!.setupCompletedAt).toBeUndefined();
    rmSync(hook);

    // The worktree git left on the branch, not locked, is done.
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: true, added: true });
    expect(h.engine.record.repositories[1]).toMatchObject({ setupCompletedAt: expect.any(String), baseCommit: base });
    expect(h.engine.record.repositories[1]!.createdBranch).toBeUndefined();

    // Holding only Kiln's branch, with no worktree, the branch takes the base check's place.
    const second = await stoppedWithNeighbourAgain(h, "storefront");
    writeFileSync(join(second, ".git", "hooks", "post-checkout"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(second, ".git", "hooks", "post-checkout"), 0o755);
    expect(await h.engine.addRepository("storefront")).toMatchObject({ ok: false });
    rmSync(join(second, ".git", "hooks", "post-checkout"));
    git(h.sandbox, second, "worktree", "remove", "--force", join(workspace, "storefront"));
    expect(await h.engine.addRepository("storefront")).toMatchObject({ ok: true, added: true, baseBranch: "develop" });
    expect(git(h.sandbox, join(workspace, "storefront"), "branch", "--show-current").trim()).toBe(BRANCH);
  });

  it("answers a retry on Kiln's own branch that can't reach origin in the failed check's words, and changes nothing", async () => {
    const { h, checkout, workspace } = await stoppedWithNeighbour();
    // A fresh add that can't reach origin fails check 4 in its words.
    h.env.GIT_SSH_COMMAND = "false";
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: false, status: 422, reason: expect.stringMatching(/^Couldn’t reach origin: /) });
    expect(h.engine.record.repositories.map((entry) => entry.name)).toEqual(["acme-shop"]);
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    const hook = join(checkout, ".git", "hooks", "post-checkout");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: false, status: 422 });
    rmSync(hook);
    git(h.sandbox, checkout, "worktree", "remove", "--force", join(workspace, "returns-api"));
    const before = JSON.stringify(h.engine.record.repositories);
    h.env.GIT_SSH_COMMAND = "false";
    // AC-ADD-02: not "That branch already exists", since the branch is Kiln's own.
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: false, status: 422, reason: expect.stringMatching(/^Couldn’t reach origin: /) });
    expect(JSON.stringify(h.engine.record.repositories)).toBe(before);
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: true, added: true });
  });

  it("changes nothing at a worktree Git left half made, names the command that removes it, then finishes the interrupted add from its recorded commit", async () => {
    const { h, checkout, workspace } = await stoppedWithNeighbour();
    const path = join(workspace, "returns-api");
    const base = git(h.sandbox, checkout, "rev-parse", "develop").trim();
    // An add Kiln recorded, then stopped mid `git worktree add`: the worktree is there, locked initializing.
    h.engine.record.repositories.push({ name: "returns-api", kind: "added", mainCheckoutPath: checkout, github: "acme/returns-api", baseBranch: "develop", worktreePath: path, addedInPhase: "1", addedAt: "x", baseCommit: base });
    git(h.sandbox, checkout, "worktree", "add", "-q", "--no-track", "-b", BRANCH, path, base);
    git(h.sandbox, checkout, "worktree", "lock", "--reason", "initializing", path);
    expect(await h.engine.addRepository("returns-api")).toEqual({
      ok: false,
      status: 422,
      reason: `returns-api’s worktree at ${displayPath(path)} was left half made. Remove it with git -C ${displayPath(checkout)} worktree remove -f -f ${displayPath(path)}, then ask again.`,
    });
    expect(git(h.sandbox, checkout, "worktree", "list", "--porcelain")).toContain("locked initializing");
    // The person removes it as told: Kiln's branch stays, and the next request finishes on it, asking origin nothing.
    git(h.sandbox, checkout, "worktree", "remove", "-f", "-f", path);
    h.env.GIT_SSH_COMMAND = "false";
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: true, added: true, baseBranch: "develop" });
    expect(git(h.sandbox, path, "rev-parse", "HEAD").trim()).toBe(base);
  });
});

/** Another repository beside the PRD's, on GitHub, for a second add in the same test. */
async function stoppedWithNeighbourAgain(h: Harness, name: string): Promise<string> {
  const origin = createGithubOrigin(h.sandbox, "acme", name);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  const checkout = createRepository(h.sandbox, name, origin.url);
  git(h.sandbox, checkout, "push", "-q", "origin", "develop");
  return checkout;
}
