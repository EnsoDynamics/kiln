// Runs the built `kiln` command as a person would, against real temporary repositories.

import { spawnSync } from "node:child_process";
import { symlinkSync } from "node:fs";
import { dirname, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findExecutable } from "./platform/helper-process.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createRepository, createSandbox, git, writeStandIn, type Sandbox } from "./test-support/git-repositories.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
let sandbox: Sandbox;
let repository: string;
let pathWithStandIns: string;

function kiln(args: string[], cwd = repository, path = pathWithStandIns) {
  // Windows spells it Path; a copied environment must carry exactly one PATH key.
  const env = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, PATH: path }, encoding: "utf8", timeout: 50_000 });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeAll(() => {
  sandbox = createSandbox();
  repository = createRepository(sandbox, "acme-shop", "https://github.com/acme/acme-shop.git");
  commitFiles(sandbox, repository, `docs/prds/${FOLDER}`, prdDirectoryFiles());
  commitFiles(sandbox, repository, "docs/prds/gift-cards", { "gift-cards-prd.md": "# PRD: Gift cards\n" });
  const standIns = join(sandbox.root, "bin");
  writeStandIn(standIns, "gh", 0, "", "auth status --hostname github.com");
  writeStandIn(standIns, "claude", 0);
  pathWithStandIns = [standIns, sandbox.env.PATH ?? sandbox.env.Path ?? ""].join(delimiter);
});
afterAll(() => sandbox.cleanup());

describe("kiln run", () => {
  it("prints what it found and exits 0 when every start check passes", () => {
    const result = kiln(["run", `docs/prds/${FOLDER}/`]);
    expect(result.stderr).toBe("");
    expect(result.stdout.split("\n")[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed");
    expect(result.exitCode).toBe(0);
  });

  it("accepts the PRD file and works from inside the repository", () => {
    const result = kiln(["run", `prds/${FOLDER}/${FOLDER}-prd.md`], join(repository, "docs"));
    expect(result.stdout.split("\n")[0]).toBe("Customer returns  ·  PRD, technical design, assumptions, 5 phase docs  ·  all checks passed");
    expect(result.exitCode).toBe(0);
  });

  it("stops in the terminal with the drawn frame when documents are missing, and starts nothing", () => {
    const result = kiln(["run", "docs/prds/gift-cards/"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        "✗ Can’t start Gift cards. Missing from docs/prds/gift-cards/:",
        "    technical-design.md   the technical design",
        "    phase-*.md            phase documents",
        "  Kiln needs the PRD, its technical design and its phase documents. Nothing was started.",
        "",
      ].join("\n"),
    );
    expect(git(sandbox, repository, "status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(git(sandbox, repository, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });

  // A PATH holding git but not claude needs git linked into its own folder, which Windows' Git can't be.
  it.skipIf(process.platform === "win32")("names a missing tool as a start check", () => {
    const onlyGitAndGh = join(sandbox.root, "only-git-and-gh");
    writeStandIn(onlyGitAndGh, "gh", 0);
    symlinkSync(findExecutable("git", sandbox.env)!, join(onlyGitAndGh, "git"));
    const result = kiln(["run", `docs/prds/${FOLDER}`], repository, onlyGitAndGh);
    expect(result.stderr).toBe("✗ Can’t start Customer returns.\n    claude isn't on the PATH.\n  Nothing was started.\n");
    expect(result.exitCode).toBe(1);
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
    for (const args of [[], ["run"], ["status"], ["run", "a", "b"], ["run", "docs/prds/"]]) {
      const result = kiln(args);
      expect(result.exitCode, args.join(" ")).toBe(2);
      expect(result.stderr, args.join(" ")).toContain("Usage: kiln run <PRD directory or PRD file>");
    }
    expect(kiln(["status"]).stderr.split("\n")[0]).toBe('kiln: unknown command "status". kiln run is the only command.');
    expect(kiln(["--help"])).toMatchObject({ exitCode: 0, stderr: "" });
  });
});
