// `kiln add-repository` finding its PRD from the folder it runs in (multi-repo technical design,
// "The command"), and what it says when it can't act. Adding through a running Kiln is proved
// end to end in kiln-run-repositories.integration.test.ts.

import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAddRepository } from "./add-repository-command.js";
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
    settings: { workspaceFolder, worktreePath: join(workspaceFolder, repository), featureBranch: `feature/${folder}`, baseBranch: "develop", bases: {}, model: "opus", effort: "high", keepAwake: true },
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

  it("takes exactly one folder name", async () => {
    sandbox = createSandbox();
    for (const args of [[], ["a", "b"], ["--help"]]) expect(await run(sandbox.root, args)).toEqual({ code: 2, stdout: "", stderr: "Usage: kiln add-repository <folder name>\n" });
  });
});
