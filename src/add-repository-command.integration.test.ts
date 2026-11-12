// `kiln add-repository` finding its PRD from the folder it runs in (multi-repo technical design,
// "The command"), and what it says when it can't act. Adding through a running Kiln is proved
// end to end in kiln-run-repositories.integration.test.ts.

import { cpSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAddRepository } from "./add-repository-command.js";
import { runDelivery } from "./delivery-command.js";
import { takeInstanceLock } from "./state/instance-lock.js";
import { newPrdRecord } from "./state/new-record.js";
import { writePrdRecord } from "./state/records.js";
import { prdStateDirectory, stateRoot } from "./state/state-files.js";
import { createSandbox, type Sandbox } from "./test-support/git-repositories.js";

let sandbox: Sandbox | undefined;
afterEach(() => sandbox?.cleanup());

/** A PRD record in the sandbox's state, its repository `<root>/<repository>`, its workspace `<root>/.worktrees/<folder>`. */
function writeRecord(s: Sandbox, repository: string, folder: string, worktrees: string[]): void {
  const mainCheckoutPath = join(s.root, repository);
  const workspaceFolder = join(s.root, ".worktrees", folder);
  const record = newPrdRecord({
    mainCheckoutPath,
    repositoryName: repository,
    github: `acme/${repository}`,
    prdDirectoryFromRoot: `docs/prds/${folder}`,
    featureName: folder,
    settings: { workspaceFolder, worktreePath: join(workspaceFolder, repository), featureBranch: `feature/${folder}`, baseBranch: "develop", bases: {}, model: "opus", effort: "high", keepAwake: true, resumeAfterUsageLimit: true },
  });
  record.repositories = worktrees.map((name) => ({ name, kind: "named", mainCheckoutPath: join(s.root, name), github: `acme/${name}`, baseBranch: "develop", worktreePath: join(workspaceFolder, name), setupCompletedAt: "x" }));
  for (const name of worktrees) mkdirSync(join(workspaceFolder, name), { recursive: true });
  writePrdRecord(prdStateDirectory(stateRoot(s.env), mainCheckoutPath, repository, `docs/prds/${folder}`), record);
}

async function run(cwd: string, args = ["notifications"]) {
  let stdout = "";
  let stderr = "";
  const code = await runAddRepository(args, { cwd, env: sandbox!.env, stdout: { write: (text: string) => (stdout += text) }, stderr: { write: (text: string) => (stderr += text) } });
  return { code, stdout, stderr };
}

describe("kiln add-repository", () => {
  it("finds the PRD from a worktree or the workspace folder, and changes nothing when kiln run isn't running for it", async () => {
    sandbox = createSandbox();
    writeRecord(sandbox, "product", "customer-returns", ["product", "returns-api"]);
    const workspace = realpathSync.native(join(sandbox.root, ".worktrees", "customer-returns"));
    const nested = join(workspace, "returns-api", "src");
    mkdirSync(nested, { recursive: true });
    for (const cwd of [nested, workspace]) {
      expect(await run(cwd)).toEqual({ code: 1, stdout: "", stderr: "kiln: kiln run isn't running for customer-returns, so nothing was added.\n" });
    }
  });

  it("says when the folder is in no Kiln workspace, and when two PRDs' workspace folders coincide", async () => {
    sandbox = createSandbox();
    expect(await run(sandbox.root)).toEqual({ code: 1, stdout: "", stderr: `kiln: ${sandbox.root} isn't in a Kiln workspace.\n` });
    // Two PRDs of the same folder name in different repositories share the default workspace folder.
    writeRecord(sandbox, "product", "customer-returns", ["product"]);
    writeRecord(sandbox, "storefront", "customer-returns", ["storefront"]);
    const workspace = realpathSync.native(join(sandbox.root, ".worktrees", "customer-returns"));
    expect((await run(workspace)).stderr).toBe(
      `kiln: ${workspace} is in the workspace of more than one PRD (customer-returns, customer-returns); run it from inside a repository's worktree.\n`,
    );
    // From inside a worktree, the PRD it belongs to is the one.
    expect((await run(join(workspace, "storefront"))).stderr).toBe("kiln: kiln run isn't running for customer-returns, so nothing was added.\n");
  });

  it("ignores a copy of a PRD's state set aside beside the original, for every workspace command", async () => {
    sandbox = createSandbox();
    writeRecord(sandbox, "product", "customer-returns", ["product"]);
    // What a person does to make Kiln forget a run by hand: the old state stays in Kiln's state root, still naming the worktree.
    const state = prdStateDirectory(stateRoot(sandbox.env), join(sandbox.root, "product"), "product", "docs/prds/customer-returns");
    cpSync(state, `${state}.reset-20261111-1701`, { recursive: true });
    const worktree = realpathSync.native(join(sandbox.root, ".worktrees", "customer-returns", "product"));
    expect((await run(worktree)).stderr).toBe("kiln: kiln run isn't running for customer-returns, so nothing was added.\n");
    let stderr = "";
    const code = await runDelivery(["status"], { cwd: worktree, env: sandbox.env, stdout: { write: () => undefined }, stderr: { write: (text: string) => (stderr += text) } } as never);
    expect({ code, stderr }).toEqual({ code: 1, stderr: "kiln: kiln run is not running for this execution.\n" });
  });

  it("picks the PRD a running Kiln holds when several claim the folder, and names them when it can't", async () => {
    sandbox = createSandbox();
    writeRecord(sandbox, "product", "customer-returns", ["product"]);
    writeRecord(sandbox, "storefront", "customer-returns", ["storefront"]);
    const workspace = realpathSync.native(join(sandbox.root, ".worktrees", "customer-returns"));
    let stderr = "";
    const delivery = () => runDelivery(["status"], { cwd: workspace, env: sandbox!.env, stdout: { write: () => undefined }, stderr: { write: (text: string) => (stderr += text) } } as never);
    expect(await delivery()).toBe(1);
    expect(stderr).toBe(`kiln: Run this command inside one running Kiln execution's assigned workspace. ${workspace} is in the workspace of more than one PRD (customer-returns, customer-returns), and Kiln is not running for exactly one of them.\n`);
    const root = stateRoot(sandbox.env);
    const lock = await takeInstanceLock(root, prdStateDirectory(root, join(sandbox.root, "storefront"), "storefront", "docs/prds/customer-returns"));
    if (!lock.taken) throw new Error("the lock was not taken");
    try {
      // Found: the command now reaches for the running Kiln's port, where this test has no server.
      expect((await run(workspace)).stderr).toContain(`kiln: Couldn't reach Kiln at 127.0.0.1:${lock.port}`);
    } finally {
      lock.release();
    }
  });

  it("takes exactly one folder name", async () => {
    sandbox = createSandbox();
    for (const args of [[], ["a", "b"], ["--help"]]) expect(await run(sandbox.root, args)).toEqual({ code: 2, stdout: "", stderr: "Usage: kiln add-repository <folder name>\n" });
  });
});
