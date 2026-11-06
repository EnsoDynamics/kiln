// The folder check against real Git (missing worktree recovery, "The Folder Check"): each way a
// saved folder can fail to be the run's worktree, and the cases that still pass, read the same by
// the engine's asynchronous check and the synchronous one `kiln status` and `kiln handoff` use.

import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkFolders, checkFoldersSync, type FolderCheck } from "./folder-check.js";
import { createRepository, createSandbox, git, type Sandbox } from "../test-support/git-repositories.js";
import { findExecutable } from "../platform/helper-process.js";
import type { PrdRecord, RepositoryEntry } from "../state/records.js";
import { inBaseBranch } from "./folder-facts.js";

let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });

function setUp() {
  sandbox = createSandbox();
  const shared = createRepository(sandbox, "acme-shop");
  const folder = join(sandbox.root, "worktrees", "acme-shop");
  git(sandbox, shared, "worktree", "add", "-q", "-b", "feature/x", folder);
  const record = { startedAt: "2026-11-01T00:00:00Z", setupCompletedAt: "2026-11-01T00:00:00Z", repositories: [{ name: "acme-shop", kind: "prd", mainCheckoutPath: shared, github: "acme/acme-shop", baseBranch: "develop", worktreePath: folder, setupCompletedAt: "2026-11-01T00:00:00Z" }] } as unknown as PrdRecord;
  const gitPath = findExecutable("git", sandbox.env)!;
  const both = async (): Promise<FolderCheck> => {
    const [async, sync] = [await checkFolders({ git: gitPath, env: sandbox!.env }, record), checkFoldersSync(gitPath, sandbox!.env, record)];
    expect(sync.repositories).toEqual(async.repositories);
    return async;
  };
  return { sandbox, shared, folder, record, both };
}

describe("the folder check", () => {
  it("passes the run's worktree, whatever it has checked out", async () => {
    const { sandbox, folder, both } = setUp();
    expect((await both()).passed).toBe(true);
    git(sandbox, folder, "checkout", "-q", "--detach");
    expect((await both()).passed).toBe(true);
  });

  it("finds a folder deleted by hand missing", async () => {
    const { folder, both } = setUp();
    rmSync(folder, { recursive: true, force: true });
    expect((await both()).repositories[0]).toMatchObject({ state: "missing" });
  });

  it("names what a saved path holds instead: a file, a plain folder, another repository's checkout, or a checkout git does not list", async () => {
    const { sandbox, shared, folder, both } = setUp();
    git(sandbox, shared, "worktree", "remove", "--force", folder);
    writeFileSync(folder, "a file\n");
    expect((await both()).repositories[0]).toMatchObject({ state: "holds_something_else", holds: "a file, not a folder" });
    rmSync(folder);
    mkdirSync(folder);
    expect((await both()).repositories[0]).toMatchObject({ state: "holds_something_else", holds: "a plain folder, not a git worktree" });
    rmSync(folder, { recursive: true });
    git(sandbox, join(sandbox.root, "worktrees"), "init", "-q", "acme-shop");
    expect((await both()).repositories[0]).toMatchObject({ state: "holds_something_else", holds: "another repository's checkout" });
    rmSync(folder, { recursive: true });
    // A worktree made and then its record pruned: a checkout of this repository git no longer lists.
    git(sandbox, shared, "worktree", "add", "-q", folder, "feature/x");
    rmSync(join(shared, ".git", "worktrees", "acme-shop"), { recursive: true });
    expect((await both()).repositories[0]).toMatchObject({ state: "holds_something_else" });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("reports a folder it can't read as Couldn't check, never as missing", async () => {
    const { sandbox, folder, both } = setUp();
    const parent = join(sandbox.root, "worktrees");
    chmodSync(parent, 0o000);
    try { expect((await both()).repositories[0]).toMatchObject({ state: "unknown", unknown: expect.stringContaining("the saved folder") }); }
    finally { chmodSync(parent, 0o755); }
    void folder;
  });

  it("treats a read past the status deadline as Couldn't check", () => {
    const { record } = setUp();
    const check = checkFoldersSync(findExecutable("git", sandbox!.env)!, { ...sandbox!.env, PATH: "" }, record, Date.now() - 1);
    expect(check.passed).toBe(false);
  });

  it("checks nothing for a finished run", async () => {
    const { folder, record, both } = setUp();
    rmSync(folder, { recursive: true, force: true });
    record.completedAt = "2026-11-02T00:00:00Z";
    expect((await both())).toMatchObject({ passed: true, repositories: [] });
  });
});

describe("in the base branch (AC-FACTS-01)", () => {
  it("counts a squash-merged branch through a confirmed pull-request merge Kiln recorded, and never through an unconfirmed one", async () => {
    sandbox = createSandbox();
    const shared = createRepository(sandbox, "acme-shop");
    git(sandbox, shared, "checkout", "-q", "-b", "feature/x");
    writeFileSync(join(shared, "work.txt"), "work\n");
    git(sandbox, shared, "add", "work.txt"); git(sandbox, shared, "commit", "-q", "-m", "work");
    const tip = git(sandbox, shared, "rev-parse", "HEAD").trim();
    git(sandbox, shared, "checkout", "-q", "develop");
    git(sandbox, shared, "merge", "-q", "--squash", "feature/x"); git(sandbox, shared, "commit", "-q", "-m", "Squash");
    const base = git(sandbox, shared, "rev-parse", "HEAD").trim();
    const entry = { name: "acme-shop", github: "acme/acme-shop", baseBranch: "develop" } as RepositoryEntry;
    const checkpoint = { headSha: tip, target: { repository: "github.com/acme/acme-shop", baseBranch: "develop" }, merge: { sourceHead: tip, mergedHead: tip, resultSha: base, url: "https://github.com/acme/acme-shop/pull/1" } };
    const record = (one: object) => ({ developmentDelivery: { checkpoints: [one] } }) as unknown as PrdRecord;
    const gitContext = { git: findExecutable("git", sandbox.env)!, env: sandbox.env };
    expect(await inBaseBranch(gitContext, shared, record({}), entry, tip, base)).toBe(false);
    expect(await inBaseBranch(gitContext, shared, record(checkpoint), entry, tip, base)).toBe(true);
    expect(await inBaseBranch(gitContext, shared, record({ ...checkpoint, mergeUnresolvedReason: "unknown" }), entry, tip, base)).toBe(false);
    expect(await inBaseBranch(gitContext, shared, record({ ...checkpoint, supersededBy: "c2" }), entry, tip, base)).toBe(false);
    expect(await inBaseBranch(gitContext, shared, record({ ...checkpoint, merge: { ...checkpoint.merge, mergedHead: base } }), entry, tip, base)).toBe(false);
  });
});
