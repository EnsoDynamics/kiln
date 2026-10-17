import { mkdtempSync, realpathSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findExecutable, runHelper } from "./helper-process.js";

const root = realpathSync.native(mkdtempSync(join(tmpdir(), "kiln-helper-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("findExecutable", () => {
  it("finds the first match on the PATH and nothing for a name that isn't there", () => {
    const first = join(root, "first");
    const second = join(root, "second");
    mkdirSync(first);
    mkdirSync(second);
    const fileName = process.platform === "win32" ? "tool.cmd" : "tool";
    // npm puts an extensionless shell script beside claude.cmd; Windows must not pick it.
    if (process.platform === "win32") writeFileSync(join(first, "tool"), "");
    for (const directory of [first, second]) {
      writeFileSync(join(directory, fileName), "");
      if (process.platform !== "win32") chmodSync(join(directory, fileName), 0o755);
    }
    const env = { PATH: [join(root, "missing"), first, second].join(delimiter), PATHEXT: ".EXE;.cmd" };
    expect(findExecutable("tool", env)).toBe(join(first, fileName));
    expect(findExecutable("absent", env)).toBeUndefined();
  });

  it.skipIf(process.platform === "win32")("skips a file that isn't executable", () => {
    const directory = join(root, "not-executable");
    mkdirSync(directory);
    writeFileSync(join(directory, "plain"), "");
    expect(findExecutable("plain", { PATH: directory })).toBeUndefined();
  });
});

describe("runHelper", () => {
  const node = process.execPath;

  it("returns exit code and output, with stdin closed and terminal prompts off", async () => {
    const script = "process.stdin.resume(); process.stdin.on('end', () => { console.log(process.env.GIT_TERMINAL_PROMPT); console.error('err'); process.exit(3); });";
    const result = await runHelper(node, ["-e", script], { cwd: root });
    expect(result).toEqual({ exitCode: 3, stdout: "0\n", stderr: "err\n" });
  });

  it("ends a call that runs past its timeout and reports the timeout as its failure", async () => {
    const started = Date.now();
    const result = await runHelper(node, ["-e", "setTimeout(() => {}, 30000)"], { cwd: root, timeoutMs: 300 });
    expect(result.exitCode).toBeNull();
    expect(result.failure).toBe("timed out after 0.3 seconds");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("reports an executable that can't be started", async () => {
    const result = await runHelper(join(root, "no-such-program"), [], { cwd: root });
    expect(result.exitCode).toBeNull();
    expect(result.failure).toMatch(/ENOENT/);
  });
});
