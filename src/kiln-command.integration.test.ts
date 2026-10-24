// Runs the built `kiln` command as a person would, against real temporary repositories.

import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { symlinkSync } from "node:fs";
import { dirname, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { findExecutable } from "./platform/helper-process.js";
import { waitFor } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, writeStandIn, type Sandbox } from "./test-support/git-repositories.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
let sandbox: Sandbox;
let repository: string;
let pathWithStandIns: string;

/** Windows spells it Path; a copied environment must carry exactly one PATH key. */
function envWithPath(path: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: path, KILN_NO_BROWSER: "1", KILN_PORT_RANGE: "41120-41139" };
}

function kiln(args: string[], cwd = repository, path = pathWithStandIns) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, env: envWithPath(path), encoding: "utf8", timeout: 50_000 });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** `kiln run` in this process until it serves Documents found, then Ctrl+C. */
async function kilnUntilServing(args: string[], cwd = repository, path = pathWithStandIns) {
  let stdout = "";
  let stderr = "";
  const signals = new EventEmitter();
  const done = runKilnCommand(args, { cwd, env: envWithPath(path), stdout: { write: (text: string) => (stdout += text) }, stderr: { write: (text: string) => (stderr += text) }, signals });
  await waitFor(() => stdout.includes("Kiln works in this terminal"));
  signals.emit("SIGINT");
  return { exitCode: await done, stdout, stderr };
}

beforeAll(() => {
  sandbox = createSandbox();
  repository = createRepository(sandbox, "acme-shop", createGithubOrigin(sandbox, "acme", "acme-shop").url);
  commitFiles(sandbox, repository, `docs/prds/${FOLDER}`, prdDirectoryFiles());
  commitFiles(sandbox, repository, "docs/prds/gift-cards", { "gift-cards-prd.md": "# PRD: Gift cards\n" });
  const standIns = join(sandbox.root, "bin");
  writeStandIn(standIns, "gh", 0, "", "auth status --hostname github.com");
  writeStandIn(standIns, "claude", 0);
  pathWithStandIns = [standIns, sandbox.env.PATH ?? sandbox.env.Path ?? ""].join(delimiter);
});
afterAll(() => sandbox.cleanup());

describe("kiln run", () => {
  it("prints what it found and serves Documents found when every start check passes", async () => {
    const result = await kilnUntilServing(["run", `docs/prds/${FOLDER}/`]);
    expect(result.stderr).toBe("");
    expect(result.stdout.split("\n")[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed");
    expect(result.stdout.split("\n")[1]).toMatch(/^● Opened http:\/\/127\.0\.0\.1:\d+\/customer-returns\. Review it there and press Start\.$/);
    expect(result.exitCode).toBe(130);
  });

  it("accepts the PRD file and works from inside the repository", async () => {
    const result = await kilnUntilServing(["run", `prds/${FOLDER}/${FOLDER}-prd.md`], join(repository, "docs"));
    expect(result.stdout.split("\n")[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed");
    expect(result.exitCode).toBe(130);
  });

  it("stops in the terminal with the drawn frame when documents are missing, and starts nothing", () => {
    const result = kiln(["run", "docs/prds/gift-cards/"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        "✗ Can’t start Gift cards. Missing from docs/prds/gift-cards/:",
        "    technical-design.md   the technical design, or gift-cards-technical-design.md",
        "    phase-*.md            phase documents",
        "  Kiln needs the PRD, its technical design and its phase documents. Nothing was started.",
        "",
      ].join("\n"),
    );
    expect(git(sandbox, repository, "status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(git(sandbox, repository, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });

  // A PATH holding git but not claude needs git linked into its own folder, which Windows' Git can't be.
  it.skipIf(process.platform === "win32")("reaches the chooser without either agent installed", async () => {
    const onlyGitAndGh = join(sandbox.root, "only-git-and-gh");
    writeStandIn(onlyGitAndGh, "gh", 0);
    symlinkSync(findExecutable("git", sandbox.env)!, join(onlyGitAndGh, "git"));
    const result = await kilnUntilServing(["run", `docs/prds/${FOLDER}`], repository, onlyGitAndGh);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("all checks passed");
    expect(result.exitCode).toBe(130);
  });

  it("names git missing from the PATH as a start check", () => {
    const result = kiln(["run", `docs/prds/${FOLDER}/`], repository, join(sandbox.root, "bin"));
    expect(result.stderr).toBe("✗ Can’t start Customer returns.\n    git isn't on the PATH.\n  Nothing was started.\n");
    expect(result.exitCode).toBe(1);
  });

  it("refuses a path that isn't one PRD with one line naming the problem, then usage", () => {
    expect(kiln(["run", "docs/prds/"]).stderr.split("\n")[0]).toMatch(/^kiln: docs\/prds\/ isn't a PRD directory/);
    expect(kiln(["run", "docs/prds/nope"]).stderr.split("\n")[0]).toBe("kiln: docs/prds/nope doesn't exist.");
    expect(kiln(["run", "README.md"])).toMatchObject({ exitCode: 2 });
  });

  it("prints how to use it, and exits non-zero, with no path, an unknown command, extra arguments or a directory of several PRDs", () => {
    for (const args of [[], ["run"], ["status"], ["run", "a", "b"], ["run", "docs/prds/"], ["run", "docs/prds/customer-returns", "--phase", "2"]]) {
      const result = kiln(args);
      expect(result.exitCode, args.join(" ")).toBe(2);
      expect(result.stderr, args.join(" ")).toContain("Usage: kiln run <PRD directory or PRD file>");
    }
    // AC-CLI-02: no other command, for status, logs, pausing, resuming or one phase; multi-repo AC-ADD-01 adds the second.
    for (const command of ["status", "logs", "pause", "resume", "start", "phase"]) {
      const result = kiln([command, "docs/prds/customer-returns"]);
      expect(result.exitCode, command).toBe(2);
      expect(result.stderr.split("\n")[0], command).toBe(`kiln: unknown command "${command}". The commands are kiln run, kiln add-repository and kiln delivery.`);
    }
    expect(kiln(["--help"])).toMatchObject({ exitCode: 0, stderr: "" });
  });
});
