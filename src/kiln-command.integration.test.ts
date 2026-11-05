// Runs the built `kiln` command as a person would, against real temporary repositories.

import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync, symlinkSync } from "node:fs";
import { dirname, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { findExecutable } from "./platform/helper-process.js";
import { waitFor } from "./test-support/engine-harness.js";
import { FOLDER, prdDirectoryFiles } from "./test-support/fixture-documents.js";
import { commitFiles, createGithubOrigin, createRepository, createSandbox, git, writeStandIn, type Sandbox } from "./test-support/git-repositories.js";
import { reservePortRange } from "./test-support/os-ports.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
let sandbox: Sandbox;
let repository: string;
let pathWithStandIns: string;

/** Windows spells it Path; a copied environment must carry exactly one PATH key. */
function envWithPath(path: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(sandbox.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: path, KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports };
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

let ports = "";
beforeAll(async () => { ports = await reservePortRange(); });
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
    for (const args of [["run"], ["run", "a", "b"], ["run", "docs/prds/"], ["run", "docs/prds/customer-returns", "--phase", "2"]]) {
      const result = kiln(args);
      expect(result.exitCode, args.join(" ")).toBe(2);
      // AC-HELP-04: the usage of kiln run alone, after the one-line reason when there is one.
      expect(result.stderr, args.join(" ")).toMatch(/(?:^|\n)Usage: kiln run <PRD-path> \[--resume\]\nUse kiln run --help for details\.\n$/);
      for (const other of ["add-repository", "delivery", "audit", "status"]) expect(result.stderr, args.join(" ")).not.toContain(other);
    }
    expect(kiln(["run"]).stderr).toBe("Usage: kiln run <PRD-path> [--resume]\nUse kiln run --help for details.\n");
    expect(kiln(["run", "a", "b"]).stderr).toBe("kiln: kiln run takes one path and an optional --resume.\nUsage: kiln run <PRD-path> [--resume]\nUse kiln run --help for details.\n");
    // Bot control AC-ACT-01 supersedes the browser-only command restriction.
    expect(kiln([])).toMatchObject({ exitCode: 2, stderr: "" });
    expect(kiln([]).stdout).toContain("kiln --help");
    for (const command of ["pause", "start", "phase"]) {
      const result = kiln([command, "docs/prds/customer-returns", "--json"]);
      expect(result.exitCode, command).toBe(2);
      expect(JSON.parse(result.stdout).errors[0].code).toBe("command_not_found");
    }
    expect(kiln(["--help"])).toMatchObject({ exitCode: 0, stderr: "" });
  });
});

describe("kiln --version", () => {
  // AC-HELP-03: no controller, Git repository or sign-in; an empty PATH and a folder outside any repository.
  it("prints the installed package version and exits successfully, with -v too", () => {
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    // The build under test is a release build only where CI builds a candidate; anywhere else it says when it was built.
    const { kind } = JSON.parse(readFileSync(new URL("../dist/build-info.json", import.meta.url), "utf8")) as { kind: string };
    const stdout = kind === "release" ? `${version}\n` : expect.stringMatching(new RegExp(`^${version.replace(/\./g, "\\.")} \\(dev build, [^)]*\\d[^)]*\\)\\n$`));
    for (const flag of ["--version", "-v"]) expect(kiln([flag], sandbox.root, ""), flag).toEqual({ exitCode: 0, stdout, stderr: "" });
  });

  // AC-HELP-03: a development build's time is short and in the reader's own time zone.
  it.runIf(JSON.parse(readFileSync(new URL("../dist/build-info.json", import.meta.url), "utf8")).kind === "development")("gives a development build's time in the reader's time zone", () => {
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    const { builtAt } = JSON.parse(readFileSync(new URL("../dist/build-info.json", import.meta.url), "utf8")) as { builtAt: string };
    for (const timeZone of ["America/New_York", "Asia/Kolkata"]) {
      const result = spawnSync(process.execPath, [cli, "--version"], { cwd: sandbox.root, env: { ...envWithPath(""), TZ: timeZone, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" }, encoding: "utf8", timeout: 50_000 });
      const built = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(builtAt)).replace(/[\u202f\u00a0]/g, " ");
      expect(built, timeZone).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/);
      expect(result.stdout, timeZone).toBe(`${version} (dev build, ${built})\n`);
    }
  });
});
